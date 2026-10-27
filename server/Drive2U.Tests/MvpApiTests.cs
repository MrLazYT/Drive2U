using System.Net;
#pragma warning disable xUnit1051 // Integration requests are bounded by the in-process host and explicit test deadlines.
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Drive2U.Api.Mvp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Drive2U.Tests;

public sealed class MvpFactory : WebApplicationFactory<Program>
{
    private readonly string dbPath;
    private readonly int quoteSeconds;
    public MvpFactory(string? dbPath = null, int quoteSeconds = 180)
    {
        this.dbPath = dbPath ?? Path.Combine(Path.GetTempPath(), "drive2u-mvp-tests", Guid.NewGuid().ToString("N"), "mvp.db");
        this.quoteSeconds = quoteSeconds;
        Directory.CreateDirectory(Path.GetDirectoryName(this.dbPath)!);
    }
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = $"Data Source={dbPath};Default Timeout=10",
            ["Mvp:QuoteLifetimeSeconds"] = quoteSeconds.ToString(),
            ["Routing:DefaultMode"] = "Demo",
            ["Routing:AllowDemo"] = "true",
            ["Routing:OsrmBaseUrl"] = "",
            ["FareTariff:BaseFare"] = "50",
            ["FareTariff:RatePerKm"] = "42"
        }));
    }
    public async Task AddSecondDriver()
    {
        using var scope = Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new AppUser { UserName = "second@drive2u.test", Email = "second@drive2u.test", Name = "Другий водій", AppRole = "Driver" };
        Assert.True((await users.CreateAsync(user, "Drive2U!Demo2026")).Succeeded);
        Assert.True((await users.AddToRoleAsync(user, "Driver")).Succeeded);
        db.DriverProfiles.Add(new DriverProfile { UserId = user.Id, Approved = true, Available = true, Make = "Toyota", Model = "Corolla", Plate = "ТЕСТ 0002" });
        await db.SaveChangesAsync();
    }
}

public sealed class MvpApiTests
{
    [Fact]
    public async Task DevelopmentApiAcceptsAndroidEmulatorHost()
    {
        await using var factory = new MvpFactory();
        using var client = Client(factory, await Login(factory));
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Host = "10.0.2.2:5187";
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var quoteRequest = new HttpRequestMessage(HttpMethod.Post, "/api/quotes")
        {
            Content = JsonContent.Create(new { pickup = Start, destination = End, routingMode = "Demo" })
        };
        quoteRequest.Headers.Host = "10.0.2.2:5187";
        using var quoteResponse = await client.SendAsync(quoteRequest);
        using var quote = await Json(quoteResponse);
        Assert.Equal(184.40m, quote.RootElement.GetProperty("amount").GetDecimal());
    }

    private static readonly object Start = new { latitude = 49.84085, longitude = 23.99436, address = "Вокзал", locationId = "station" };
    private static readonly object End = new { latitude = 49.84405, longitude = 24.02626, address = "Опера", locationId = "opera" };
    private static HttpClient Client(MvpFactory factory, string? token = null)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        if (token is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
    private static async Task<JsonDocument> Json(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {text}");
        return JsonDocument.Parse(text);
    }
    private static async Task<string> Login(MvpFactory factory, string email = "passenger@drive2u.test")
    {
        using var client = Client(factory);
        using var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Drive2U!Demo2026" });
        using var json = await Json(response);
        return json.RootElement.GetProperty("accessToken").GetString()!;
    }
    private static async Task<string> Quote(HttpClient client, object? pickup = null, object? destination = null)
    {
        using var response = await client.PostAsJsonAsync("/api/quotes", new { pickup = pickup ?? Start, destination = destination ?? End, routingMode = "Demo" });
        using var json = await Json(response);
        Assert.True(json.RootElement.GetProperty("route").GetProperty("isDemo").GetBoolean());
        Assert.Equal(3.2m, json.RootElement.GetProperty("route").GetProperty("distanceKm").GetDecimal());
        Assert.Equal(184.40m, json.RootElement.GetProperty("amount").GetDecimal());
        Assert.True(json.RootElement.GetProperty("route").GetProperty("geometry").GetArrayLength() > 2);
        return json.RootElement.GetProperty("id").GetString()!;
    }
    private static async Task<string> CreateRide(HttpClient client, string quote, string key = "mvp-test-key")
    {
        using var response = await client.PostAsJsonAsync("/api/rides", new { quoteId = quote, idempotencyKey = key });
        using var json = await Json(response);
        return json.RootElement.GetProperty("id").GetString()!;
    }
    private static async Task<HttpStatusCode> Status(HttpClient client, string id, string status)
    {
        using var response = await client.PostAsJsonAsync($"/api/rides/{id}/status", new { status });
        return response.StatusCode;
    }

    [Fact]
    public async Task RegistrationCannotSelfAssignDriverAndProtectedApiRejectsAnonymous()
    {
        await using var factory = new MvpFactory();
        using var anonymous = Client(factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/rides/active")).StatusCode);
        using var selfAssign = await anonymous.PostAsJsonAsync("/api/auth/register", new { name = "Пасажир", email = "new@drive2u.test", password = "Drive2U!New2026", role = "Driver" });
        Assert.Equal(HttpStatusCode.BadRequest, selfAssign.StatusCode);
        using var created = await anonymous.PostAsJsonAsync("/api/auth/register", new { name = "Пасажир", email = "new@drive2u.test", password = "Drive2U!New2026" });
        using var json = await Json(created);
        Assert.Equal("Passenger", json.RootElement.GetProperty("user").GetProperty("role").GetString());
        using var newUser = Client(factory, json.RootElement.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await newUser.GetAsync("/api/driver/orders")).StatusCode);
    }

    [Fact]
    public async Task InvalidMvpRequestDoesNotReportFareEstimateError()
    {
        await using var factory = new MvpFactory();
        using var anonymous = Client(factory);
        using var response = await anonymous.PostAsJsonAsync("/api/auth/register", new
        {
            name = "Пасажир", email = "invalid@drive2u.test", password = "Drive2U!New2026", role = "Driver"
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("Invalid request.", body.RootElement.GetProperty("title").GetString());
        var errors = body.RootElement.GetProperty("errors");
        Assert.True(errors.TryGetProperty("request", out _));
        Assert.False(errors.TryGetProperty("distanceKm", out _));
    }

    [Fact]
    public async Task QuoteOwnershipIdempotencyAndSingleActiveRideAreServerEnforced()
    {
        await using var factory = new MvpFactory();
        using var passenger = Client(factory, await Login(factory));
        var quote = await Quote(passenger);
        using var anotherAnonymous = Client(factory);
        using var registered = await anotherAnonymous.PostAsJsonAsync("/api/auth/register", new { name = "Інший", email = "other@drive2u.test", password = "Drive2U!Other2026" });
        using var otherJson = await Json(registered);
        using var other = Client(factory, otherJson.RootElement.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync("/api/rides", new { quoteId = quote, idempotencyKey = "other-key-1" })).StatusCode);
        var id = await CreateRide(passenger, quote);
        Assert.Equal(id, await CreateRide(passenger, quote));
        using var denied = await other.GetAsync($"/api/rides/{id}");
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        var secondQuote = await Quote(passenger);
        Assert.Equal(HttpStatusCode.Conflict, (await passenger.PostAsJsonAsync("/api/rides", new { quoteId = secondQuote, idempotencyKey = "mvp-test-key" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await passenger.PostAsJsonAsync("/api/rides", new { quoteId = secondQuote, idempotencyKey = "another-key" })).StatusCode);
        using var active = await Json(await passenger.GetAsync("/api/rides/active"));
        Assert.Equal(id, active.RootElement.GetProperty("id").GetString());
    }

    [Fact]
    public async Task ExpiredQuoteCannotCreateRideButAnExactRetryCanReadOriginal()
    {
        await using var factory = new MvpFactory(quoteSeconds: 1);
        using var passenger = Client(factory, await Login(factory));
        var first = await Quote(passenger);
        var id = await CreateRide(passenger, first);
        var second = await Quote(passenger);
        await Task.Delay(1300);
        Assert.Equal(id, await CreateRide(passenger, first));
        Assert.Equal(HttpStatusCode.Conflict, (await passenger.PostAsJsonAsync("/api/rides", new { quoteId = second, idempotencyKey = "expired-new-key" })).StatusCode);
    }

    [Fact]
    public async Task DriverTransitionsAndCancellationFollowFr07()
    {
        await using var factory = new MvpFactory();
        using var passenger = Client(factory, await Login(factory));
        using var driver = Client(factory, await Login(factory, "driver@drive2u.test"));
        var ride = await CreateRide(passenger, await Quote(passenger));
        Assert.Equal(HttpStatusCode.Forbidden, (await passenger.PostAsJsonAsync($"/api/rides/{ride}/accept", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await driver.PostAsJsonAsync($"/api/rides/{ride}/accept", new { })).StatusCode);
        using var available = await Json(await driver.PutAsJsonAsync("/api/driver/availability", new { available = true }));
        Assert.True(available.RootElement.GetProperty("driverProfile").GetProperty("available").GetBoolean());
        using var orders = await Json(await driver.GetAsync("/api/driver/orders"));
        Assert.Equal(JsonValueKind.Null, orders.RootElement[0].GetProperty("passenger").ValueKind);
        using var accepted = await Json(await driver.PostAsJsonAsync($"/api/rides/{ride}/accept", new { }));
        Assert.Equal("Accepted", accepted.RootElement.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, await Status(driver, ride, "Completed"));
        Assert.Equal(HttpStatusCode.Forbidden, await Status(passenger, ride, "Arrived"));
        Assert.Equal(HttpStatusCode.OK, await Status(driver, ride, "Arrived"));
        Assert.Equal(HttpStatusCode.Conflict, (await passenger.PostAsJsonAsync($"/api/rides/{ride}/cancel", new { reason = "test" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await driver.PostAsJsonAsync($"/api/rides/{ride}/cancel", new { reason = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, await Status(driver, ride, "InProgress"));
        Assert.Equal(HttpStatusCode.Conflict, (await driver.PostAsJsonAsync($"/api/rides/{ride}/cancel", new { reason = "test" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, await Status(driver, ride, "Completed"));
        Assert.Equal(HttpStatusCode.Conflict, await Status(driver, ride, "Arrived"));
        using var history = await Json(await passenger.GetAsync("/api/rides/history"));
        Assert.Equal(1, history.RootElement.GetProperty("total").GetInt32());
        Assert.Equal("Completed", history.RootElement.GetProperty("items")[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task PassengerAndDriverCancellationPersistInitiatorReasonAndTime()
    {
        await using var factory = new MvpFactory();
        using var passenger = Client(factory, await Login(factory));
        using var driver = Client(factory, await Login(factory, "driver@drive2u.test"));
        var first = await CreateRide(passenger, await Quote(passenger));
        using var cancelled = await Json(await passenger.PostAsJsonAsync($"/api/rides/{first}/cancel", new { reason = "Плани змінилися" }));
        Assert.Equal("Passenger", cancelled.RootElement.GetProperty("cancellation").GetProperty("by").GetString());
        var second = await CreateRide(passenger, await Quote(passenger), "cancel-second");
        await Json(await driver.PutAsJsonAsync("/api/driver/availability", new { available = true }));
        await Json(await driver.PostAsJsonAsync($"/api/rides/{second}/accept", new { }));
        await Json(await driver.PostAsJsonAsync($"/api/rides/{second}/status", new { status = "Arrived" }));
        using var refused = await Json(await driver.PostAsJsonAsync($"/api/rides/{second}/cancel", new { reason = "Технічна несправність" }));
        Assert.Equal("Driver", refused.RootElement.GetProperty("cancellation").GetProperty("by").GetString());
        Assert.Equal("Технічна несправність", refused.RootElement.GetProperty("cancellation").GetProperty("reason").GetString());
        Assert.True(refused.RootElement.GetProperty("cancellation").GetProperty("at").GetDateTime() <= DateTime.UtcNow);
    }

    [Fact]
    public async Task ConcurrentSqliteAcceptanceAllowsOneDriverAndReturnsConflictToOther()
    {
        await using var factory = new MvpFactory();
        using var passenger = Client(factory, await Login(factory));
        using var driver = Client(factory, await Login(factory, "driver@drive2u.test"));
        var ride = await CreateRide(passenger, await Quote(passenger));
        await Json(await driver.PutAsJsonAsync("/api/driver/availability", new { available = true }));
        await factory.AddSecondDriver();
        using var second = Client(factory, await Login(factory, "second@drive2u.test"));
        var result = await Task.WhenAll(driver.PostAsJsonAsync($"/api/rides/{ride}/accept", new { }), second.PostAsJsonAsync($"/api/rides/{ride}/accept", new { }));
        Assert.Equal(1, result.Count(x => x.StatusCode == HttpStatusCode.OK));
        Assert.Equal(1, result.Count(x => x.StatusCode == HttpStatusCode.Conflict));
        foreach (var response in result) response.Dispose();
    }

    [Fact]
    public async Task SessionLogoutAndDatabaseRestartKeepHistoryButRevokeToken()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), "drive2u-mvp-tests", Guid.NewGuid().ToString("N"), "persist.db");
        string id, token;
        await using (var factory = new MvpFactory(dbPath))
        {
            token = await Login(factory);
            using var passenger = Client(factory, token);
            id = await CreateRide(passenger, await Quote(passenger));
            using var driver = Client(factory, await Login(factory, "driver@drive2u.test"));
            await Json(await driver.PutAsJsonAsync("/api/driver/availability", new { available = true }));
            await Json(await driver.PostAsJsonAsync($"/api/rides/{id}/accept", new { }));
            foreach (var status in new[] { "Arrived", "InProgress", "Completed" }) Assert.Equal(HttpStatusCode.OK, await Status(driver, id, status));
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.Tariffs.Add(new TariffVersion { BaseFare = 99m, RatePerKm = 99m, EffectiveAt = DateTime.UtcNow });
                await db.SaveChangesAsync();
            }
            Assert.Equal(HttpStatusCode.NoContent, (await passenger.PostAsync("/api/auth/logout", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await passenger.GetAsync("/api/me")).StatusCode);
        }
        await using (var restarted = new MvpFactory(dbPath))
        {
            using var old = Client(restarted, token);
            Assert.Equal(HttpStatusCode.Unauthorized, (await old.GetAsync("/api/me")).StatusCode);
            foreach (var email in new[] { "passenger@drive2u.test", "driver@drive2u.test" })
            {
                using var client = Client(restarted, await Login(restarted, email));
                using var json = await Json(await client.GetAsync("/api/rides/history"));
                Assert.Equal(id, json.RootElement.GetProperty("items")[0].GetProperty("id").GetString());
                Assert.Equal(184.40m, json.RootElement.GetProperty("items")[0].GetProperty("amount").GetDecimal());
            }
        }
    }

    [Fact]
    public async Task LiveRoutingWithoutProviderFailsClearlyWithoutSyntheticFallback()
    {
        await using var factory = new MvpFactory();
        using var passenger = Client(factory, await Login(factory));
        using var response = await passenger.PostAsJsonAsync("/api/quotes", new {
            pickup = new { latitude = 50.45, longitude = 30.52, address = "Київ" },
            destination = End, routingMode = "Live" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task RealtimeEventsReachOnlyPassengerAndAssignedDriver()
    {
        await using var factory = new MvpFactory();
        var passengerToken = await Login(factory);
        var driverToken = await Login(factory, "driver@drive2u.test");
        using var anonymous = Client(factory);
        using var created = await anonymous.PostAsJsonAsync("/api/auth/register", new { name = "Сторонній", email = "stranger@drive2u.test", password = "Drive2U!Other2026" });
        using var registration = await Json(created);
        var strangerToken = registration.RootElement.GetProperty("accessToken").GetString()!;
        HubConnection Connect(string token) => new HubConnectionBuilder().WithUrl("http://localhost/hubs/rides", options =>
        {
            options.Transports = HttpTransportType.LongPolling;
            options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
            options.AccessTokenProvider = () => Task.FromResult<string?>(token);
        }).Build();
        await using var passengerHub = Connect(passengerToken);
        await using var driverHub = Connect(driverToken);
        await using var strangerHub = Connect(strangerToken);
        var passengerEvents = 0;
        var driverEvents = 0;
        var strangerEvents = 0;
        passengerHub.On<JsonElement>("RideChanged", _ => Interlocked.Increment(ref passengerEvents));
        driverHub.On<JsonElement>("RideChanged", _ => Interlocked.Increment(ref driverEvents));
        strangerHub.On<JsonElement>("RideChanged", _ => Interlocked.Increment(ref strangerEvents));
        await Task.WhenAll(passengerHub.StartAsync(), driverHub.StartAsync(), strangerHub.StartAsync());
        using var passenger = Client(factory, passengerToken);
        using var driver = Client(factory, driverToken);
        var ride = await CreateRide(passenger, await Quote(passenger));
        await WaitFor(() => Volatile.Read(ref passengerEvents) >= 1);
        Assert.Equal(0, Volatile.Read(ref driverEvents));
        Assert.Equal(0, Volatile.Read(ref strangerEvents));
        await Json(await driver.PutAsJsonAsync("/api/driver/availability", new { available = true }));
        await Json(await driver.PostAsJsonAsync($"/api/rides/{ride}/accept", new { }));
        await WaitFor(() => Volatile.Read(ref passengerEvents) >= 2 && Volatile.Read(ref driverEvents) >= 1);
        Assert.Equal(0, Volatile.Read(ref strangerEvents));
        await strangerHub.StopAsync();
        await driverHub.StopAsync();
        await passengerHub.StopAsync();
    }

    private static async Task WaitFor(Func<bool> condition)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (!condition())
            await Task.Delay(25, deadline.Token);
    }
}
