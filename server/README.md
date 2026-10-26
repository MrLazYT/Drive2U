# Drive2U API

ASP.NET Core Web API with Identity accounts, EF Core + SQLite, server fare quotes, rides, and SignalR. The older `/api/fare-estimates` remains a calculator demonstration and cannot create a ride.

## Run locally

Requires .NET SDK 10.0.301 (pinned in `global.json`). From the repository root:

```powershell
dotnet restore server/Drive2U.slnx --locked-mode
dotnet tool restore --tool-manifest server/dotnet-tools.json
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet run --project server/Drive2U.Api -c Release --no-launch-profile -- --urls http://0.0.0.0:5187
```

Development startup applies EF migrations and repeats the seed safely. The default database is `server/Drive2U.Api/App_Data/drive2u.db`; it persists across restarts and is gitignored. To select another database, set `ConnectionStrings__Default` to a SQLite connection string before launching the API. To apply migrations explicitly:

```powershell
dotnet tool run dotnet-ef --tool-manifest server/dotnet-tools.json -- database update --project server/Drive2U.Api/Drive2U.Api.csproj --startup-project server/Drive2U.Api/Drive2U.Api.csproj
```

The synthetic Development accounts are `passenger@drive2u.test` and `driver@drive2u.test`, both with password `Drive2U!Demo2026`. The driver has a fictional Skoda Octavia and starts unavailable. These credentials are Development fixtures only. Registration creates Passenger accounts only.

The API uses local HTTP only in Development. Use `http://10.0.2.2:5187` from an Android emulator and `http://<computer LAN IPv4>:5187` from a phone on the same network. Production MVP endpoints require HTTPS.

## Route modes

The default mode is `Demo`: predefined road geometries between listed Lviv places, explicitly marked as demo data. `GET /api/locations` lists supported locations; arbitrary map taps require live routing. Set `Routing__DefaultMode=Live` and configure `Routing__OsrmBaseUrl` to a suitable route provider to use live routing. The server makes that request with an eight second timeout and returns a service unavailable error if routing fails. It never silently replaces a live failure with demo data. Public route or map services are not treated as unlimited production infrastructure.

Quotes use the existing decimal fare calculator: `BaseFare + DistanceKm × RatePerKm`, rounded once to two places AwayFromZero. The default example tariff is 40 UAH base plus 12 UAH/km. A quote stores the route, tariff and price; only its passenger can confirm it while valid. Repeating confirmation returns the same ride. The client cannot submit a payable distance or price.

## API and tests

The contract and DTOs are documented in [api-contract.md](../docs/mvp/api-contract.md). Main endpoints: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/me`, `/api/quotes`, `/api/rides`, `/api/rides/active`, `/api/rides/history`, `/api/driver/orders`, `/api/driver/availability`, and `/hubs/rides`.

```powershell
dotnet build server/Drive2U.slnx -c Release --no-restore
dotnet test server/Drive2U.slnx -c Release --no-build --no-restore
powershell.exe -NoProfile -File server/scripts/mvp-smoke.ps1
```

The xUnit suite covers HTTP auth, authorization, quote ownership and expiry, idempotency, ride transitions/cancellation, concurrent acceptance with real SQLite, logout/restart persistence, routing errors, and fare rounding. The smoke script performs the complete Passenger → Driver → completed trip → history cycle.

Session tokens are random, stored as hashes in SQLite, expire, and are revoked on logout. The SignalR hub only adds a connection to its own user group; logout removes that session's active connections from the group. Clients reread state from REST after reconnect.
