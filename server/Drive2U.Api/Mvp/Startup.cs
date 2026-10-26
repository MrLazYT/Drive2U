using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Drive2U.Api.Mvp;

public static class MvpStartup
{
    public static void AddMvp(this WebApplicationBuilder builder)
    {
        builder.Services.AddSingleton(TimeProvider.System);
        // Keep the local database under the API project regardless of shell cwd.
        builder.Services.AddDbContext<AppDbContext>((services, options) =>
        {
            var config = services.GetRequiredService<IConfiguration>();
            var environment = services.GetRequiredService<IWebHostEnvironment>();
            var connection = config.GetConnectionString("Default");
            if (string.IsNullOrWhiteSpace(connection))
            {
                var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
                Directory.CreateDirectory(dataDirectory);
                connection = new SqliteConnectionStringBuilder { DataSource = Path.Combine(dataDirectory, "drive2u.db"), DefaultTimeout = 10 }.ToString();
            }
            options.UseSqlite(connection);
        });
        // SignalR browser transport may carry its bearer in access_token query.
        // Hosting request-start logs include URLs, so suppress them for this API.
        builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
        builder.Services.AddIdentityCore<AppUser>(options=>{
            options.Password.RequiredLength=10;options.User.RequireUniqueEmail=true;
            options.Lockout.MaxFailedAccessAttempts=5;options.Lockout.DefaultLockoutTimeSpan=TimeSpan.FromMinutes(5);
        }).AddRoles<IdentityRole>().AddEntityFrameworkStores<AppDbContext>();
        builder.Services.AddAuthentication(SessionAuthentication.SchemeName).AddScheme<AuthenticationSchemeOptions,SessionAuthentication>(SessionAuthentication.SchemeName,_=>{});
        builder.Services.AddAuthorization();
        builder.Services.AddSignalR(options=>{options.EnableDetailedErrors=false;options.MaximumReceiveMessageSize=4096;});
        builder.Services.AddSingleton<SessionConnections>();
        builder.Services.AddHttpClient<RoutingService>(client=>{client.Timeout=TimeSpan.FromSeconds(8);client.DefaultRequestHeaders.UserAgent.ParseAdd("Drive2U-MVP/1.0");});
        builder.Services.AddScoped<AccountService>();builder.Services.AddScoped<RideService>();
        builder.Services.AddExceptionHandler<MvpExceptionHandler>();
        builder.Services.AddRateLimiter(options=>{
            options.RejectionStatusCode=429;
            options.AddPolicy("auth",context=>RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString()??"local",_=>new FixedWindowRateLimiterOptions{PermitLimit=30,Window=TimeSpan.FromMinutes(1),QueueLimit=0}));
            options.AddPolicy("quotes",context=>RateLimitPartition.GetFixedWindowLimiter(context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value??"anonymous",_=>new FixedWindowRateLimiterOptions{PermitLimit=20,Window=TimeSpan.FromMinutes(1),QueueLimit=0}));
        });
    }
    public static async Task InitializeMvp(this WebApplication app)
    {
        if(!app.Environment.IsDevelopment() && !app.Configuration.GetValue("Mvp:InitializeDatabase",false))return;
        using var scope=app.Services.CreateScope();
        var db=scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
        // The fixture passwords are deliberately usable only in Development; no production accounts are created.
        if(!app.Environment.IsDevelopment())return;
        var users=scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var roles=scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach(var role in new[]{"Passenger","Driver"})if(!await roles.RoleExistsAsync(role))await roles.CreateAsync(new IdentityRole(role));
        async Task<AppUser> Ensure(string email,string name,string role)
        {
            var value=await users.FindByEmailAsync(email);
            if(value is not null)return value;
            value=new AppUser{Email=email,UserName=email,Name=name,AppRole=role,EmailConfirmed=true};
            var result=await users.CreateAsync(value,"Drive2U!Demo2026");
            if(!result.Succeeded)throw new InvalidOperationException("Development seed failed.");
            await users.AddToRoleAsync(value,role);return value;
        }
        await Ensure("passenger@drive2u.test","Олена Демо","Passenger");
        var driver=await Ensure("driver@drive2u.test","Тарас Демо","Driver");
        if(!await db.DriverProfiles.AnyAsync(x=>x.UserId==driver.Id))db.DriverProfiles.Add(new(){UserId=driver.Id,Approved=true,Available=false,Make="Skoda",Model="Octavia",Plate="ДЕМО 2026"});
        if(!await db.Tariffs.AnyAsync())
        {
            var options=scope.ServiceProvider.GetRequiredService<IOptions<FareTariffOptions>>().Value;
            db.Tariffs.Add(new(){BaseFare=options.BaseFare!.Value,RatePerKm=options.RatePerKm!.Value,EffectiveAt=DateTime.UtcNow});
        }
        await db.SaveChangesAsync();
    }
    public static void UseMvp(this WebApplication app)
    {
        // Local HTTP is an explicit Development capability; externally deployed MVP routes require HTTPS.
        app.Use(async(context,next)=>{
            if(!app.Environment.IsDevelopment() && !context.Request.IsHttps && (context.Request.Path.StartsWithSegments("/hubs") ||
                (context.Request.Path.StartsWithSegments("/api") && !context.Request.Path.StartsWithSegments("/api/fare-estimates"))))
            {await Results.Problem(statusCode:400,title:"HTTPS required.").ExecuteAsync(context);return;}
            await next();
        });
        app.UseAuthentication();app.UseAuthorization();app.UseRateLimiter();
        app.MapHub<RidesHub>("/hubs/rides",options=>options.CloseOnAuthenticationExpiration=true);
    }
}

public sealed class MvpExceptionHandler(IProblemDetailsService details,ILogger<MvpExceptionHandler> logger):IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context,Exception exception,CancellationToken ct)
    {
        var error=exception as ApiError;
        var status=error?.Status??500;
        // Never log request payloads, coordinates, tokens or exception text that could embed them.
        if(error is null)logger.LogError("MVP request failed with category {Category}.",exception.GetType().Name);
        context.Response.StatusCode=status;
        return await details.TryWriteAsync(new(){HttpContext=context,ProblemDetails=new ProblemDetails{Status=status,Title=error?.Message??"Не вдалося виконати запит. Спробуйте ще раз.",Extensions={{"code",error?.Code??"REQUEST_FAILED"}}}});
    }
}
