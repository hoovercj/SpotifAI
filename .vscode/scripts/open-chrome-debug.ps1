<#
.SYNOPSIS
  Launch Chrome with a dedicated debug profile and remote-debugging port,
  pointing at the local dev server. Idempotent: skips launch if a debug Chrome
  is already listening on the port.

.NOTES
  Invoked by the "Chrome: Open Debug" task in .vscode/tasks.json.
#>

param(
    [int]$Port = 9222,
    [string]$Url = 'http://localhost:3000',
    [string]$ProfileName = 'SpotifAIDebug',
    [int]$WaitSeconds = 60
)

$ErrorActionPreference = 'Stop'

# 1. Skip if a debug Chrome is already listening on the remote-debugging port.
try {
    Invoke-RestMethod -Uri "http://localhost:$Port/json/version" -TimeoutSec 1 -ErrorAction Stop | Out-Null
    Write-Host "Debug Chrome already running on port $Port. Skipping launch."
    exit 0
} catch {
    # Not running yet — proceed.
}

# 2. Wait for the dev server.
Write-Host "Waiting for $Url to respond (up to ${WaitSeconds}s) ..."
$ready = $false
for ($i = 0; $i -lt $WaitSeconds; $i++) {
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) {
    Write-Warning "Dev server did not respond after ${WaitSeconds}s; launching Chrome anyway."
}

# 3. Find Chrome.
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) {
    $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
}
if (-not (Test-Path $chrome)) {
    Write-Error 'Chrome not found in standard install locations.'
    exit 1
}

# 4. Launch with dedicated profile + remote debugging port.
$profileDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\$ProfileName"
$chromeArgs = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$profileDir",
    '--no-first-run',
    '--no-default-browser-check',
    $Url
)
Start-Process -FilePath $chrome -ArgumentList $chromeArgs
Write-Host "Chrome launched. Profile: $profileDir. Remote debugging on http://localhost:$Port ."
