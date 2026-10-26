using System.Security.Claims;
using System.Collections.Concurrent;
using System.Text.Json;
using Drive2U.Fares;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Drive2U.Api.Mvp;

public sealed class SessionConnections
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> sessions = new();
    public void Add(string hash, string connectionId, string userId) =>
        sessions.GetOrAdd(hash, _ => new()).TryAdd(connectionId, userId);
    public void Remove(string hash, string connectionId)
    {
        if (sessions.TryGetValue(hash, out var connections)) connections.TryRemove(connectionId, out _);
    }
    public string[] Take(string hash)
    {
        return sessions.TryRemove(hash, out var connections) ? connections.Keys.ToArray() : [];
    }
}

[Authorize]
public sealed class RidesHub(SessionConnections sessions, AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        // No client-provided ride/group ID is accepted. Each authenticated session joins its own user group.
        var hash = Context.User?.FindFirstValue("session");
        if (hash is null) { Context.Abort(); return; }
        var group = "user:" + Context.UserIdentifier;
        await Groups.AddToGroupAsync(Context.ConnectionId, group);
        sessions.Add(hash, Context.ConnectionId, Context.UserIdentifier!);
        // Close the login/logout race between the initial authentication and group membership.
        if (!await db.Sessions.AsNoTracking().AnyAsync(x => x.Hash == hash && !x.Revoked && x.ExpiresAt > DateTime.UtcNow))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, group);
            sessions.Remove(hash, Context.ConnectionId);
            Context.Abort();
            return;
        }
        await base.OnConnectedAsync();
    }
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        var hash = Context.User?.FindFirstValue("session");
        if (hash is not null) sessions.Remove(hash, Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}

public sealed class RideService(AppDbContext db, IHubContext<RidesHub> hub, TimeProvider time)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static string Encode<T>(T value) => JsonSerializer.Serialize(value, Json);
    public static T Decode<T>(string value) => JsonSerializer.Deserialize<T>(value, Json)!;
    public async Task<RideDto> View(Ride ride, bool anonymousPassenger = false)
    {
        var passenger = anonymousPassenger ? null : await db.Users.AsNoTracking().SingleAsync(x => x.Id == ride.PassengerId);
        var driver = ride.DriverId is null ? null : await db.Users.AsNoTracking().SingleAsync(x => x.Id == ride.DriverId);
        var profile = driver is null ? null : await db.DriverProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == driver.Id);
        return new(ride.Id,ride.Status,ride.Version,Decode<Point>(ride.PickupJson),Decode<Point>(ride.DestinationJson),Decode<RouteData>(ride.RouteJson),
            ride.Amount,"UAH",ride.CreatedAt,ride.UpdatedAt,passenger is null?null:new(passenger.Id,passenger.Name),
            driver is null?null:new(driver.Id,driver.Name,profile?.Complete==true?new(profile.Make!,profile.Model!,profile.Plate!):null),
            ride.CancelledAt is null?null:new(ride.CancelledBy!,ride.CancellationReason!,ride.CancelledAt.Value));
    }
    public async Task<Ride> Participant(string id, string userId)
    {
        var ride=await db.Rides.SingleOrDefaultAsync(x=>x.Id==id);
        if(ride is null || (ride.PassengerId!=userId && ride.DriverId!=userId)) throw new ApiError(404,"RIDE_NOT_FOUND","Поїздку не знайдено.");
        return ride;
    }
    public async Task<T> Transaction<T>(Func<Task<T>> action)
    {
        // Acquire SQLite's RESERVED writer lock before reading invariants. Serializes writers
        // across processes, unlike a process-local semaphore; unique indexes are a second boundary.
        await db.Database.OpenConnectionAsync();
        var connection=(SqliteConnection)db.Database.GetDbConnection();
        try
        {
            using var transaction=connection.BeginTransaction(deferred:false);
            await using var efTransaction=await db.Database.UseTransactionAsync(transaction);
            var result=await action();
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return result;
        }
        catch(DbUpdateConcurrencyException) { throw new ApiError(409,"STATE_CONFLICT","Стан уже змінився. Оновіть дані."); }
        catch(DbUpdateException ex) when(ex.InnerException is SqliteException sqlite && sqlite.SqliteErrorCode is 19 or 5 or 6)
        { throw new ApiError(409,"STATE_CONFLICT","Інша операція вже змінила поїздку. Оновіть дані."); }
        catch(SqliteException ex) when(ex.SqliteErrorCode is 5 or 6)
        { throw new ApiError(409,"STATE_CONFLICT","Стан змінюється іншим користувачем. Спробуйте ще раз."); }
        finally { await db.Database.CloseConnectionAsync(); }
    }
    public void Record(Ride ride,string actor)
    {
        db.RideHistory.Add(new(){RideId=ride.Id,ActorId=actor,Status=ride.Status,At=ride.UpdatedAt,Version=ride.Version});
    }
    public async Task Notify(Ride ride)
    {
        var groups=new List<string>{"user:"+ride.PassengerId};
        if(ride.DriverId is not null) groups.Add("user:"+ride.DriverId);
        // Never fail a committed command because realtime is unavailable; API polling is authoritative.
        try { await hub.Clients.Groups(groups).SendAsync("RideChanged",new{rideId=ride.Id,version=ride.Version,status=ride.Status}); }
        catch(Exception ex) when(ex is not OutOfMemoryException) { /* API readback recovers missed notification. */ }
    }
    public DateTime Now=>time.GetUtcNow().UtcDateTime;
}

[ApiController, Authorize, Route("api")]
public sealed class RidesController(AppDbContext db,RideService rides,RoutingService routing,AccountService accounts,IConfiguration config,TimeProvider time):ControllerBase
{
    private string UserId=>User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    [HttpGet("locations")]
    public Location[] Locations()=>RoutingService.Locations;
    [HttpGet("config")]
    public object Config()=>new{routingMode=config["Routing:DefaultMode"]??"Demo",quoteLifetimeSeconds=Math.Clamp(config.GetValue("Mvp:QuoteLifetimeSeconds",180),1,3600)};

    [HttpPost("quotes"),Authorize(Roles="Passenger"),Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("quotes")]
    public async Task<QuoteDto> Quote(QuoteRequest request,CancellationToken ct)
    {
        var route=await routing.Get(request.Pickup,request.Destination,request.RoutingMode,ct);
        var tariff=await db.Tariffs.OrderByDescending(x=>x.Id).FirstOrDefaultAsync(ct)??throw new ApiError(503,"TARIFF_UNAVAILABLE","Тариф тимчасово недоступний.");
        decimal amount;
        try { amount=new FareCalculator(new FareTariff(tariff.BaseFare,tariff.RatePerKm)).Calculate(route.DistanceKm).Amount; }
        catch(OverflowException){throw new ApiError(400,"FARE_OUT_OF_RANGE","Не вдалося розрахувати ціну маршруту.");}
        var quote=new FareQuote{PassengerId=UserId,PickupJson=RideService.Encode(request.Pickup),DestinationJson=RideService.Encode(request.Destination),RouteJson=RideService.Encode(route),
            Amount=amount,BaseFare=tariff.BaseFare,RatePerKm=tariff.RatePerKm,TariffId=tariff.Id,ExpiresAt=time.GetUtcNow().UtcDateTime.AddSeconds(Math.Clamp(config.GetValue("Mvp:QuoteLifetimeSeconds",180),1,3600))};
        db.Quotes.Add(quote);await db.SaveChangesAsync(ct);
        return new(quote.Id,request.Pickup,request.Destination,route,quote.Amount,"UAH",quote.ExpiresAt);
    }
    [HttpPost("rides"),Authorize(Roles="Passenger")]
    public async Task<RideDto> Create(CreateRideRequest request)
    {
        var ride=await rides.Transaction(async()=>{
            var existing=await db.Rides.SingleOrDefaultAsync(x=>x.PassengerId==UserId && x.IdempotencyKey==request.IdempotencyKey);
            if(existing is not null){if(existing.QuoteId!=request.QuoteId)throw new ApiError(409,"IDEMPOTENCY_CONFLICT","Цей ключ уже використано для іншого замовлення.");return existing;}
            var fromQuote=await db.Rides.SingleOrDefaultAsync(x=>x.QuoteId==request.QuoteId && x.PassengerId==UserId);
            if(fromQuote is not null)return fromQuote;
            var quote=await db.Quotes.SingleOrDefaultAsync(x=>x.Id==request.QuoteId && x.PassengerId==UserId)??throw new ApiError(404,"QUOTE_NOT_FOUND","Пропозицію не знайдено.");
            if(quote.ExpiresAt<=rides.Now)throw new ApiError(409,"QUOTE_EXPIRED","Пропозиція вже не чинна. Розрахуйте маршрут повторно.");
            if(await db.Rides.AnyAsync(x=>x.ActivePassengerId==UserId))throw new ApiError(409,"ACTIVE_RIDE","У вас уже є активне замовлення.");
            var value=new Ride{PassengerId=UserId,ActivePassengerId=UserId,QuoteId=quote.Id,IdempotencyKey=request.IdempotencyKey,
                PickupJson=quote.PickupJson,DestinationJson=quote.DestinationJson,RouteJson=quote.RouteJson,Amount=quote.Amount,BaseFare=quote.BaseFare,RatePerKm=quote.RatePerKm,TariffId=quote.TariffId,CreatedAt=rides.Now,UpdatedAt=rides.Now};
            db.Rides.Add(value);rides.Record(value,UserId);return value;
        });
        await rides.Notify(ride);return await rides.View(ride);
    }
    [HttpGet("rides/active")]
    public async Task<ActionResult<RideDto?>> Active()
    {
        var ride=await db.Rides.AsNoTracking().SingleOrDefaultAsync(x=>x.ActivePassengerId==UserId || x.ActiveDriverId==UserId);
        // Explicit JSON null (200), not MVC's implicit 204 null response.
        return new JsonResult(ride is null?null:await rides.View(ride));
    }
    [HttpGet("rides/history")]
    public async Task<HistoryDto> History(int page=1,int pageSize=20)
    {
        if(page<1 || page>10000 || pageSize<1 || pageSize>50)throw new ApiError(400,"INVALID_PAGE","Некоректна сторінка історії.");
        var query=db.Rides.AsNoTracking().Where(x=>(x.PassengerId==UserId || x.DriverId==UserId) && (x.Status=="Completed" || x.Status=="Cancelled"));
        var total=await query.CountAsync();
        var values=await query.OrderByDescending(x=>x.CreatedAt).Skip((page-1)*pageSize).Take(pageSize).ToArrayAsync();
        var result=new List<RideDto>();foreach(var ride in values)result.Add(await rides.View(ride));
        return new(result.ToArray(),page,pageSize,total);
    }
    [HttpGet("rides/{id}")]
    public async Task<RideDto> Details(string id)=>await rides.View(await rides.Participant(id,UserId));
    [HttpGet("driver/orders"),Authorize(Roles="Driver")]
    public async Task<RideDto[]> Orders()
    {
        var profile=await Driver();
        if(!profile.Available || !profile.Approved || !profile.Complete || await db.Rides.AnyAsync(x=>x.ActiveDriverId==UserId))return [];
        var values=await db.Rides.AsNoTracking().Where(x=>x.Status=="Waiting").OrderBy(x=>x.CreatedAt).Take(50).ToArrayAsync();
        var result=new List<RideDto>();foreach(var ride in values)result.Add(await rides.View(ride,true));return result.ToArray();
    }
    [HttpPut("driver/availability"),Authorize(Roles="Driver")]
    public async Task<UserDto> Availability(AvailabilityRequest request)
    {
        await rides.Transaction(async()=>{var profile=await Driver();
            if(request.Available && (!profile.Approved || !profile.Complete))throw new ApiError(409,"DRIVER_NOT_READY","Для доступності потрібні допуск та заповнене авто.");
            profile.Available=request.Available;return true;});
        return await accounts.UserDto(await accounts.Find(UserId));
    }
    [HttpPost("rides/{id}/accept"),Authorize(Roles="Driver")]
    public async Task<RideDto> Accept(string id)
    {
        var ride=await rides.Transaction(async()=>{
            var profile=await Driver();
            if(!profile.Approved || !profile.Available || !profile.Complete)throw new ApiError(409,"DRIVER_NOT_READY","Увімкніть доступність; потрібні допуск та заповнене авто.");
            if(await db.Rides.AnyAsync(x=>x.ActiveDriverId==UserId))throw new ApiError(409,"ACTIVE_RIDE","У вас уже є активна поїздка.");
            var value=await db.Rides.SingleOrDefaultAsync(x=>x.Id==id)??throw new ApiError(404,"RIDE_NOT_FOUND","Поїздку не знайдено.");
            if(value.Status!="Waiting")throw new ApiError(409,"STATE_CONFLICT","Замовлення вже недоступне.");
            value.DriverId=UserId;value.ActiveDriverId=UserId;value.Status="Accepted";value.Version++;value.UpdatedAt=rides.Now;rides.Record(value,UserId);return value;
        });await rides.Notify(ride);return await rides.View(ride);
    }
    [HttpPost("rides/{id}/status"),Authorize(Roles="Driver")]
    public async Task<RideDto> Status(string id,StatusRequest request)
    {
        var ride=await rides.Transaction(async()=>{
            var value=await rides.Participant(id,UserId);
            if(value.DriverId!=UserId)throw new ApiError(404,"RIDE_NOT_FOUND","Поїздку не знайдено.");
            var next=value.Status switch{"Accepted"=>"Arrived","Arrived"=>"InProgress","InProgress"=>"Completed",_=>null};
            if(next is null || request.Status!=next)throw new ApiError(409,"INVALID_TRANSITION","Такий перехід стану заборонений.");
            value.Status=next;value.Version++;value.UpdatedAt=rides.Now;
            if(next=="Completed"){value.ActivePassengerId=null;value.ActiveDriverId=null;}
            rides.Record(value,UserId);return value;
        });await rides.Notify(ride);return await rides.View(ride);
    }
    [HttpPost("rides/{id}/cancel")]
    public async Task<RideDto> Cancel(string id,CancelRequest request)
    {
        var ride=await rides.Transaction(async()=>{
            var value=await rides.Participant(id,UserId);
            var passenger=value.PassengerId==UserId;
            if(!(passenger ? value.Status is "Waiting" or "Accepted" : value.Status is "Accepted" or "Arrived"))
                throw new ApiError(409,"INVALID_TRANSITION","На цьому етапі скасування недоступне.");
            if(!passenger && string.IsNullOrWhiteSpace(request.Reason))throw new ApiError(400,"REASON_REQUIRED","Вкажіть причину скасування.");
            value.Status="Cancelled";value.Version++;value.UpdatedAt=rides.Now;value.CancelledAt=rides.Now;value.CancelledBy=passenger?"Passenger":"Driver";
            value.CancellationReason=string.IsNullOrWhiteSpace(request.Reason)?"Скасовано пасажиром":request.Reason.Trim();
            value.ActivePassengerId=null;value.ActiveDriverId=null;rides.Record(value,UserId);return value;
        });await rides.Notify(ride);return await rides.View(ride);
    }
    private async Task<DriverProfile> Driver()=>await db.DriverProfiles.SingleOrDefaultAsync(x=>x.UserId==UserId)??throw new ApiError(409,"DRIVER_NOT_READY","Профіль водія не активовано.");
}
