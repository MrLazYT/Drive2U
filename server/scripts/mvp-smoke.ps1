param(
    [int]$Port = 5193,
    [string]$EvidencePath = ''
)
$ErrorActionPreference = 'Stop'
$apiRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../Drive2U.Api'))
$assembly = Join-Path $apiRoot 'bin/Release/net10.0/Drive2U.Api.dll'
if (!(Test-Path -LiteralPath $assembly)) { throw 'Build Release before running mvp-smoke.ps1.' }
$runId = [Guid]::NewGuid().ToString('N')
$runRoot = Join-Path $PSScriptRoot "../TestResults/mvp-$runId"
New-Item -ItemType Directory -Path $runRoot | Out-Null
$dbPath = [IO.Path]::GetFullPath((Join-Path $runRoot 'smoke.db'))
$url = "http://127.0.0.1:$Port"
$serverProcess = $null
$generation = 0
$checks = [Collections.Generic.List[string]]::new()

function Start-SmokeApi {
    $script:generation++
    $arguments = @($assembly, '--environment', 'Development', '--urls', $url,
        "--ConnectionStrings:Default=Data Source=$dbPath", '--Routing:Mode=Demo')
    # Start-Process joins arguments: quote only this path-bearing argument.
    $arguments[5] = '"' + $arguments[5] + '"'
    $script:serverProcess = Start-Process -FilePath 'dotnet' -ArgumentList $arguments -WorkingDirectory $apiRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot "api-$generation.stdout.log") -RedirectStandardError (Join-Path $runRoot "api-$generation.stderr.log")
    $ready = $false
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        if ($serverProcess.HasExited) { throw "API exited: inspect $runRoot" }
        try { $health = Invoke-RestMethod "$url/health" -TimeoutSec 2; if ($health.status -eq 'ok') { $ready = $true; break } } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (!$ready) { throw "API not ready: inspect $runRoot" }
}

function Stop-SmokeApi {
    if ($script:serverProcess -and !$script:serverProcess.HasExited) {
        Stop-Process -Id $script:serverProcess.Id
        $script:serverProcess.WaitForExit(5000) | Out-Null
    }
}

function Request-Api([string]$Method, [string]$Path, $Body = $null, [string]$Token = '') {
    $options = @{ Uri="$url$Path"; Method=$Method; TimeoutSec=15 }
    if ($Token) { $options.Headers = @{Authorization="Bearer $Token"} }
    if ($null -ne $Body) { $options.ContentType='application/json; charset=utf-8'; $options.Body=[Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress)) }
    try { Invoke-RestMethod @options }
    catch { throw "API smoke $Method $Path failed with HTTP $([int]$_.Exception.Response.StatusCode). Inspect isolated server logs." }
}

function Assert-That([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw "Smoke assertion failed: $Message" }
    $checks.Add($Message)
}

try {
    Start-SmokeApi
    $passenger = Request-Api POST '/api/auth/login' @{email='passenger@drive2u.test';password='Drive2U!Demo2026'}
    $driver = Request-Api POST '/api/auth/login' @{email='driver@drive2u.test';password='Drive2U!Demo2026'}
    Assert-That ($passenger.user.role -eq 'Passenger' -and $driver.user.role -eq 'Driver') 'Development accounts authenticate in separate clients'
    $locations = @(Request-Api GET '/api/locations' $null $passenger.accessToken)
    if ($locations.Count -eq 1 -and $locations[0] -is [array]) { $locations = @($locations[0]) }
    Assert-That ($locations.Count -ge 3) 'Known Lviv locations available'
    $pickup = @{latitude=$locations[0].latitude;longitude=$locations[0].longitude;address=$locations[0].name;locationId=$locations[0].id}
    $destination = @{latitude=$locations[1].latitude;longitude=$locations[1].longitude;address=$locations[1].name;locationId=$locations[1].id}
    $quote = Request-Api POST '/api/quotes' @{pickup=$pickup;destination=$destination;routingMode='Demo'} $passenger.accessToken
    Assert-That ($quote.route.isDemo -and $quote.route.geometry.Count -gt 2 -and $quote.amount -gt 0) 'Server returns explicit demo road-shaped route and priced expiring quote'
    $confirmation = @{quoteId=$quote.id;idempotencyKey="smoke-$runId"}
    $ride = Request-Api POST '/api/rides' $confirmation $passenger.accessToken
    $repeat = Request-Api POST '/api/rides' $confirmation $passenger.accessToken
    Assert-That ($ride.id -eq $repeat.id -and $ride.status -eq 'Waiting') 'Repeated confirmation creates one Waiting ride'
    Request-Api POST '/api/auth/logout' @{} $passenger.accessToken | Out-Null
    $passenger = Request-Api POST '/api/auth/login' @{email='passenger@drive2u.test';password='Drive2U!Demo2026'}
    $restored = Request-Api GET '/api/rides/active' $null $passenger.accessToken
    Assert-That ($restored.id -eq $ride.id) 'Ride survives logout and role/account switch'
    $available = Request-Api PUT '/api/driver/availability' @{available=$true} $driver.accessToken
    $orders = @(Request-Api GET '/api/driver/orders' $null $driver.accessToken)
    if ($orders.Count -eq 1 -and $orders[0] -is [array]) { $orders = @($orders[0]) }
    Assert-That ($available.driverProfile.available -and @($orders | Where-Object id -eq $ride.id).Count -eq 1) 'Available driver sees Waiting ride'
    Assert-That (@($orders | Where-Object { $null -ne $_.passenger }).Count -eq 0) 'Waiting list does not expose passenger identity'
    $accepted = Request-Api POST "/api/rides/$($ride.id)/accept" @{} $driver.accessToken
    Assert-That ($accepted.status -eq 'Accepted' -and $accepted.driver.vehicle.plate) 'Assigned driver and car visible after atomic acceptance'
    foreach ($status in @('Arrived','InProgress','Completed')) {
        $changed = Request-Api POST "/api/rides/$($ride.id)/status" @{status=$status} $driver.accessToken
        $seen = Request-Api GET "/api/rides/$($ride.id)" $null $passenger.accessToken
        Assert-That ($changed.status -eq $status -and $seen.status -eq $status -and $seen.version -eq $changed.version) "Both clients see $status with current version"
    }
    Assert-That ($changed.amount -eq $quote.amount) 'Completed amount equals confirmed server quote'
    Stop-SmokeApi
    Start-SmokeApi
    # Log in after restart as on an independently launched client; persistent DB reused.
    $passenger = Request-Api POST '/api/auth/login' @{email='passenger@drive2u.test';password='Drive2U!Demo2026'}
    $driver = Request-Api POST '/api/auth/login' @{email='driver@drive2u.test';password='Drive2U!Demo2026'}
    foreach ($session in @($passenger,$driver)) {
        $history = Request-Api GET '/api/rides/history?page=1&pageSize=20' $null $session.accessToken
        $entry = @($history.items | Where-Object id -eq $ride.id)
        Assert-That ($entry.Count -eq 1 -and $entry[0].status -eq 'Completed') "$($session.user.role) history persists after API restart"
        Request-Api POST '/api/auth/logout' @{} $session.accessToken | Out-Null
    }
    $evidence = @{status='passed';checkedAt=[DateTime]::UtcNow.ToString('o');baseUrl=$url;routeMode='Demo';checks=@($checks.ToArray());apiRestarted=$true;databasePersistent=$true;androidUiTested=$false}
    $json = $evidence | ConvertTo-Json -Depth 8
    if ($EvidencePath) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($EvidencePath),$json,[Text.UTF8Encoding]::new($false)) }
    Write-Output $json
} finally {
    Stop-SmokeApi
    # Credentials and bearer tokens are never printed or written to evidence.
    $passenger=$null; $driver=$null
}
