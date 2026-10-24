param([int]$Port = 5187)
$ErrorActionPreference = 'Stop'
$apiRoot = (Resolve-Path (Join-Path $PSScriptRoot '../Drive2U.Api')).Path
$assembly = Join-Path $apiRoot 'bin/Release/net10.0/Drive2U.Api.dll'
if (!(Test-Path -LiteralPath $assembly)) { throw 'Build Release before running smoke.ps1.' }
$logs = Join-Path $PSScriptRoot '../TestResults'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$url = "http://127.0.0.1:$Port"
$serverProcess = Start-Process -FilePath 'dotnet' -ArgumentList @($assembly, '--urls', $url, '--FareTariff:BaseFare', '40', '--FareTariff:RatePerKm', '12') -WorkingDirectory $apiRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'smoke.stdout.log') -RedirectStandardError (Join-Path $logs 'smoke.stderr.log')
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($serverProcess.HasExited) { throw 'API exited before readiness; inspect TestResults logs.' }
        try { $health = Invoke-RestMethod "$url/health" -TimeoutSec 2; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
    }
    if (!$ready -or $health.status -ne 'ok') { throw 'Health check failed.' }
    $estimate = Invoke-RestMethod "$url/api/fare-estimates" -Method Post -ContentType 'application/json' -Body '{"distanceKm":2.5}' -TimeoutSec 5
    if ($estimate.distanceKm -ne 2.5 -or $estimate.amount -ne 70 -or $estimate.currency -ne 'UAH') { throw 'Unexpected estimate.' }
    Write-Output "URL=$url PID=$($serverProcess.Id)"
    Write-Output ('HEALTH=' + ($health | ConvertTo-Json -Compress))
    Write-Output ('ESTIMATE=' + ($estimate | ConvertTo-Json -Compress))
} finally {
    if (!$serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id; $serverProcess.WaitForExit(5000) | Out-Null }
    Write-Output "SERVER_STOPPED=$($serverProcess.HasExited)"
}
