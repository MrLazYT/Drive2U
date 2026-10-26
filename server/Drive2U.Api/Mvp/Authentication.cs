using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Drive2U.Api.Mvp;

public sealed class SessionAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
    UrlEncoder encoder, AppDbContext db, TimeProvider time) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Drive2USession";
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..] : null;
        // WebSocket/SSE clients may only use the query token on the hub path.
        if (string.IsNullOrEmpty(token) && Request.Path.StartsWithSegments("/hubs/rides")) token = Request.Query["access_token"];
        if (string.IsNullOrEmpty(token)) return AuthenticateResult.NoResult();
        if (token.Length > 256) return AuthenticateResult.Fail("Invalid session.");
        var hash = Hash(token);
        var session = await db.Sessions.AsNoTracking().SingleOrDefaultAsync(x => x.Hash == hash, Context.RequestAborted);
        if (session is null || session.Revoked || session.ExpiresAt <= time.GetUtcNow().UtcDateTime)
            return AuthenticateResult.Fail("Session expired.");
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == session.UserId, Context.RequestAborted);
        if (user is null) return AuthenticateResult.Fail("Session user missing.");
        var identity = new ClaimsIdentity([new(ClaimTypes.NameIdentifier, user.Id), new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.AppRole), new("session", hash)], SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity),
            new AuthenticationProperties { ExpiresUtc = new DateTimeOffset(session.ExpiresAt, TimeSpan.Zero) }, SchemeName));
    }
}

public sealed class AccountService(AppDbContext db, UserManager<AppUser> users, TimeProvider time, IConfiguration config)
{
    public async Task<UserDto> UserDto(AppUser user)
    {
        var profile = user.AppRole == "Driver" ? await db.DriverProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user.Id) : null;
        return new(user.Id, user.Name, user.Email!, user.AppRole, profile is null ? null : new(profile.Approved, profile.Available,
            profile.Complete ? new(profile.Make!, profile.Model!, profile.Plate!) : null));
    }
    public async Task<SessionDto> Issue(AppUser user)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var expiry = time.GetUtcNow().UtcDateTime.AddMinutes(Math.Clamp(config.GetValue("Mvp:SessionMinutes", 480), 1, 1440));
        db.Sessions.Add(new() { Hash = SessionAuthentication.Hash(token), UserId = user.Id, ExpiresAt = expiry });
        await db.SaveChangesAsync();
        return new(token, expiry, await UserDto(user));
    }
    public async Task<AppUser> Find(string id) => await users.FindByIdAsync(id) ?? throw new ApiError(401, "SESSION_EXPIRED", "Увійдіть повторно.");
}

[ApiController, Route("api/auth")]
public sealed class AuthController(UserManager<AppUser> users, AccountService accounts, AppDbContext db,
    ILogger<AuthController> logger,
    SessionConnections connections, IHubContext<RidesHub> hub) : ControllerBase
{
    [HttpPost("register"), Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
    public async Task<SessionDto> Register(RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) throw new ApiError(400, "INVALID_NAME", "Вкажіть ім’я.");
        var user = new AppUser { UserName = request.Email.Trim(), Email = request.Email.Trim(), Name = request.Name.Trim(), AppRole = "Passenger" };
        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            logger.LogWarning("Registration rejected with Identity codes {Codes}.", string.Join(',', result.Errors.Select(x => x.Code)));
            throw new ApiError(400, "REGISTRATION_REJECTED", "Не вдалося зареєструватися. Перевірте email та пароль (10+ символів, великі й малі літери, цифра та символ).");
        }
        return await accounts.Issue(user);
    }
    [HttpPost("login"), Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
    public async Task<SessionDto> Login(LoginRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email.Trim());
        if (user is null || await users.IsLockedOutAsync(user) || !await users.CheckPasswordAsync(user, request.Password))
        {
            if (user is not null && !await users.IsLockedOutAsync(user)) await users.AccessFailedAsync(user);
            throw new ApiError(401, "LOGIN_REJECTED", "Невірний email або пароль. Після повторних спроб зачекайте кілька хвилин.");
        }
        await users.ResetAccessFailedCountAsync(user);
        return await accounts.Issue(user);
    }
    [HttpPost("logout"), Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> Logout()
    {
        var hash = User.FindFirstValue("session");
        await db.Sessions.Where(x => x.Hash == hash).ExecuteUpdateAsync(set => set.SetProperty(x => x.Revoked, true));
        foreach (var connectionId in connections.Take(hash!))
            await hub.Groups.RemoveFromGroupAsync(connectionId, "user:" + User.FindFirstValue(ClaimTypes.NameIdentifier));
        return NoContent();
    }
}

[ApiController, Microsoft.AspNetCore.Authorization.Authorize]
public sealed class ProfileController(AccountService accounts) : ControllerBase
{
    [HttpGet("api/me")]
    public async Task<UserDto> Me() => await accounts.UserDto(await accounts.Find(User.FindFirstValue(ClaimTypes.NameIdentifier)!));
}
