using System.Globalization;
using System.Net;
using System.Text.Json;

namespace Drive2U.Api.Mvp;

public sealed class RoutingService(HttpClient client, IConfiguration config)
{
    private static readonly SemaphoreSlim PublicRouterGate = new(1,1);
    private static DateTime LastPublicRequest = DateTime.MinValue;
    public static readonly Location[] Locations = [
        new("station", "Головний залізничний вокзал", 49.84085, 23.99436),
        new("opera", "Львівська опера", 49.84405, 24.02626),
        new("university", "Львівський університет", 49.84032, 24.02214)
    ];
    // Explicit synthetic demo fixtures follow a street corridor through known vertices.
    // They are not real-time navigation or verified traffic measurements.
    private static readonly Coordinate[] StationOpera = [new(49.84085,23.99436),new(49.83948,23.99718),new(49.83870,24.00203),new(49.83904,24.00793),new(49.83943,24.01391),new(49.84027,24.01810),new(49.84212,24.02183),new(49.84405,24.02626)];
    private static readonly Coordinate[] OperaUniversity = [new(49.84405,24.02626),new(49.84310,24.02590),new(49.84188,24.02530),new(49.84061,24.02434),new(49.84032,24.02214)];
    public static void Validate(Point point)
    {
        if (!double.IsFinite(point.Latitude) || !double.IsFinite(point.Longitude) || point.Latitude is < -90 or > 90 || point.Longitude is < -180 or > 180 ||
            string.IsNullOrWhiteSpace(point.Address) || point.Address.Length > 200)
            throw new ApiError(400, "INVALID_POINT", "Виберіть коректні точки й вкажіть коротку назву.");
    }
    public static Location? Known(Point p) => Locations.FirstOrDefault(x => Math.Abs(x.Latitude-p.Latitude)<0.00015 && Math.Abs(x.Longitude-p.Longitude)<0.00015);
    public async Task<RouteData> Get(Point pickup, Point destination, string mode, CancellationToken ct)
    {
        Validate(pickup); Validate(destination);
        if (Math.Abs(pickup.Latitude-destination.Latitude)<0.0001 && Math.Abs(pickup.Longitude-destination.Longitude)<0.0001)
            throw new ApiError(400, "SAME_POINTS", "Початок і кінець маршруту мають відрізнятися.");
        if (mode == "Demo")
        {
            if (!config.GetValue("Routing:AllowDemo", true)) throw new ApiError(400, "DEMO_DISABLED", "Демонстраційні маршрути вимкнені.");
            var a = Known(pickup)?.Id; var b = Known(destination)?.Id;
            if (a is null || b is null) throw new ApiError(422, "DEMO_ROUTE_UNAVAILABLE", "У демонстраційному режимі оберіть дві різні локації зі списку: вокзал, опера або університет.");
            Coordinate[] geometry; decimal distance; double duration;
            var reverse = false;
            if ((a,b) is ("station","opera") or ("opera","station")) { geometry=StationOpera;distance=3.2m;duration=660;reverse=a=="opera"; }
            else if ((a,b) is ("opera","university") or ("university","opera")) { geometry=OperaUniversity;distance=1.1m;duration=300;reverse=a=="university"; }
            else { geometry=StationOpera.Concat(OperaUniversity.Skip(1)).ToArray();distance=4.3m;duration=960;reverse=a=="university"; }
            return new(distance,duration,reverse ? geometry.Reverse().ToArray() : geometry.ToArray(),true,"Drive2U — синтетичний демонстраційний маршрут, не навігація");
        }
        if (mode != "Live") throw new ApiError(400, "INVALID_ROUTING_MODE", "Оберіть режим Demo або Live.");
        var endpoint = config["Routing:OsrmBaseUrl"];
        if (!Uri.TryCreate(endpoint,UriKind.Absolute,out var root) || (root.Scheme != "https" && !(root.Scheme=="http" && root.IsLoopback)))
            throw new ApiError(503,"ROUTING_NOT_CONFIGURED","Жива маршрутизація не налаштована. Оберіть демонстраційний режим або налаштуйте сервер OSRM.");
        var coordinates=FormattableString.Invariant($"{pickup.Longitude},{pickup.Latitude};{destination.Longitude},{destination.Latitude}");
        try
        {
            if(root.Host.Equals("routing.openstreetmap.de",StringComparison.OrdinalIgnoreCase))
            {
                await PublicRouterGate.WaitAsync(ct);
                try
                {
                    var pause=LastPublicRequest.AddSeconds(1)-DateTime.UtcNow;
                    if(pause>TimeSpan.Zero)await Task.Delay(pause,ct);
                    LastPublicRequest=DateTime.UtcNow;
                }
                finally { PublicRouterGate.Release(); }
            }
            using var response=await client.GetAsync(new Uri(root.ToString().TrimEnd('/')+"/route/v1/driving/"+coordinates+"?overview=full&geometries=geojson"),ct);
            if (!response.IsSuccessStatusCode) throw new HttpRequestException();
            using var document=JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var json=document.RootElement;
            if(json.GetProperty("code").GetString()!="Ok" || json.GetProperty("routes").GetArrayLength()==0)
                throw new ApiError(422,"NO_ROUTE","Автомобільний маршрут між цими точками не знайдений.");
            var route=json.GetProperty("routes")[0];
            var distance=route.GetProperty("distance").GetDecimal()/1000m;
            var duration=route.GetProperty("duration").GetDouble();
            var geometry=route.GetProperty("geometry").GetProperty("coordinates").EnumerateArray().Select(x=>new Coordinate(x[1].GetDouble(),x[0].GetDouble())).ToArray();
            if(distance<=0 || distance>1000 || duration<=0 || !double.IsFinite(duration) || geometry.Length<2 || geometry.Any(x=>!double.IsFinite(x.Latitude)||!double.IsFinite(x.Longitude))) throw new HttpRequestException();
            return new(distance,duration,geometry,false,config["Routing:Attribution"]??"OSRM · © OpenStreetMap contributors");
        }
        catch(ApiError) { throw; }
        catch(Exception ex) when(ex is HttpRequestException or JsonException or TaskCanceledException or KeyNotFoundException or InvalidOperationException or OverflowException)
        { throw new ApiError(503,"ROUTING_UNAVAILABLE","Сервіс маршрутизації тимчасово недоступний. Спробуйте пізніше або явно оберіть демонстраційний режим."); }
    }
}
