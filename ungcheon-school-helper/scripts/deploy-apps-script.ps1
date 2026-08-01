[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Description = "Ungcheon School Helper shared service update"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptId = "1rLmGrYBAeMUHxGr9CSeT1DUtTUoDbmNpydp1rGe5DL-RzDlyoZCleLnb"
$deploymentId = "AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w"
$webAppUrl = "https://script.google.com/macros/s/$deploymentId/exec"
$serverDir = (Resolve-Path (Join-Path $PSScriptRoot "..\server")).Path
$projectFile = Join-Path $serverDir ".clasp.json"

function Resolve-ClaspPath {
  $command = Get-Command "clasp.cmd" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $fallback = Join-Path $env:APPDATA "npm\clasp.cmd"
  if (Test-Path -LiteralPath $fallback) {
    return $fallback
  }

  throw "clasp was not found. Run: npm.cmd install --global @google/clasp"
}

function Invoke-Clasp {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $script:claspPath -P $script:projectFile @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "clasp command failed: $($Arguments -join ' ')"
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $serverDir "Code.gs"))) {
  throw "Missing deployment source: server/Code.gs"
}
if (-not (Test-Path -LiteralPath (Join-Path $serverDir "appsscript.json"))) {
  throw "Missing Apps Script manifest: server/appsscript.json"
}

$claspConfig = [ordered]@{
  scriptId = $scriptId
  rootDir = "."
  scriptExtensions = @(".js", ".gs")
  htmlExtensions = @(".html")
  jsonExtensions = @(".json")
  filePushOrder = @()
  skipSubdirectories = $false
}
$configJson = $claspConfig | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText(
  $projectFile,
  $configJson,
  [System.Text.UTF8Encoding]::new($false)
)

$script:claspPath = Resolve-ClaspPath
$script:projectFile = $projectFile

Write-Host "[1/4] Checking Google authorization"
Invoke-Clasp -Arguments @("show-authorized-user")

Write-Host "[2/4] Uploading the latest Apps Script source"
Push-Location $serverDir
try {
  Invoke-Clasp -Arguments @("push", "--force")

  Write-Host "[3/4] Updating the existing web app deployment"
  Invoke-Clasp -Arguments @(
    "update-deployment",
    $deploymentId,
    "--description",
    $Description
  )

  Write-Host "[4/4] Verifying deployments and web app response"
  Invoke-Clasp -Arguments @("list-deployments")
}
finally {
  Pop-Location
}

$response = Invoke-WebRequest -Uri $webAppUrl -UseBasicParsing -TimeoutSec 30
if ($response.StatusCode -ne 200) {
  throw "Web app verification failed. HTTP status: $($response.StatusCode)"
}

try {
  $health = $response.Content | ConvertFrom-Json
}
catch {
  throw "The web app did not return valid JSON."
}

if (-not $health.ok -or $health.data.service -ne "UngcheonSchoolHub") {
  throw "The web app response did not match the expected service."
}

Write-Host "Apps Script deployment completed"
Write-Host "URL: $webAppUrl"
Write-Host "Description: $Description"
