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

## Map and routes

The Android Expo client uses bundled Leaflet in `react-native-webview` with online OpenStreetMap standard tiles. No map API key is required. The map can pan and zoom beyond Lviv, displays both selected markers and fits returned route geometry. Tile attribution is visible on the map. It needs internet access; the app reports tile errors and still offers the known-place list. OSM's public tiles are a best-effort service: use the exact HTTPS URL, identify the app with its User-Agent, honor normal WebView caching, do not bulk download or offer offline maps. Review the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) before broader deployment.

The passenger interface requests server OSRM routing for arbitrary selected points. The default is the FOSSGIS OSRM demo server (`https://routing.openstreetmap.de/routed-car`), suitable only for light demonstrations under its one request per second limit. Override `Routing__OsrmBaseUrl` with your own or a contracted OSRM-compatible HTTPS service for wider use; `Routing__Attribution` identifies it. If the router fails, the app shows no price and offers retry. The map, geocoder and road router are separate services. No real ride dispatch or payment is performed.

The API retains both `Demo` and `Live` modes for compatibility and regression tests. The passenger client requests `Live` and does not expose synthetic routes. The server makes the live request with an eight second timeout and never silently substitutes demo data. Public route and map services are not unlimited production infrastructure.

Quotes use the existing decimal fare calculator: `BaseFare + DistanceKm × RatePerKm`, rounded once to two places AwayFromZero. The new demo tariff is 50 UAH base plus 42 UAH/km. For the fixed station → opera fixture (3.2 km), the server returns 184.40 UAH. This is a test tariff, not a current fare of any carrier. A quote stores the route, tariff and price; only its passenger can confirm it while valid. Repeating confirmation returns the same ride. The client cannot submit a payable distance or price.

On an existing Development SQLite database, repeated seed does not replace the stored tariff. Stop the API, back up `server/Drive2U.Api/App_Data/drive2u.db`, then run `python server/scripts/update-demo-tariff.py` from the repository root (or pass a custom database path). The script appends a tariff version and is safe to run twice. Restart the API. Existing quotes and rides retain their original amount and tariff snapshot; new quotes use the latest tariff. It does not delete users or history.

## API and tests

The contract and DTOs are documented in [api-contract.md](../docs/mvp/api-contract.md). Main endpoints: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/me`, `/api/quotes`, `/api/rides`, `/api/rides/active`, `/api/rides/history`, `/api/driver/orders`, `/api/driver/availability`, and `/hubs/rides`.

```powershell
dotnet build server/Drive2U.slnx -c Release --no-restore
dotnet test server/Drive2U.slnx -c Release --no-build --no-restore
powershell.exe -NoProfile -File server/scripts/mvp-smoke.ps1
```

The xUnit suite covers HTTP auth, authorization, quote ownership and expiry, idempotency, ride transitions/cancellation, concurrent acceptance with real SQLite, logout/restart persistence, routing errors, and fare rounding. The smoke script performs the complete Passenger → Driver → completed trip → history cycle.

Session tokens are random, stored as hashes in SQLite, expire, and are revoked on logout. The SignalR hub only adds a connection to its own user group; logout removes that session's active connections from the group. Clients reread state from REST after reconnect.
