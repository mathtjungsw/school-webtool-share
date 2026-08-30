[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Description = "Ungcheon School Helper desktop and mobile service update",
  [switch]$ValidateOnly,
  [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
if ($ValidateOnly -and $PreflightOnly) { throw 'Choose ValidateOnly or PreflightOnly, not both.' }

# Existing public identities: no override/new-deployment/property-reset path.
$scriptId = '1rLmGrYBAeMUHxGr9CSeT1DUtTUoDbmNpydp1rGe5DL-RzDlyoZCleLnb'
$deploymentId = 'AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w'
$webAppUrl = "https://script.google.com/macros/s/$deploymentId/exec"
$appDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serverDir = (Resolve-Path (Join-Path $appDir 'server')).Path
$sourceFile = Join-Path $serverDir 'Code.gs'
$guardFile = Join-Path $PSScriptRoot 'apps-script-deploy-guard.cjs'
$script:apiRoot = "https://script.googleapis.com/v1/projects/$scriptId"
$script:oauthAccessToken = $null
$utf8 = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8

function Invoke-GitRead {
  param([string[]]$Arguments)
  $result = & git -C $appDir @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Deployment blocked: a required Git baseline check failed.' }
  return ($result -join "`n").TrimEnd()
}

function Get-OriginMainCommit {
  $result = Invoke-GitRead -Arguments @('ls-remote', '--exit-code', 'origin', 'refs/heads/main')
  $commit = ($result -split '\s+')[0]
  if ($commit -notmatch '^[a-f0-9]{40}$') { throw 'Deployment blocked: origin/main could not be resolved.' }
  return $commit
}

function Assert-MainAncestry {
  param([string]$MainCommit)
  & git -C $appDir merge-base --is-ancestor $MainCommit HEAD 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Deployment blocked: this checkout is not based on latest origin/main. Merge latest main first; do not deploy an old detached worktree.' }
}

function Invoke-SourceGuard {
  param([string]$LocalSource, [object[]]$Baselines)
  $inputJson = @{ localSource = $LocalSource; baselines = @($Baselines) } | ConvertTo-Json -Depth 12 -Compress
  $result = $inputJson | & node $guardFile 2>&1
  if ($LASTEXITCODE -ne 0) {
    $safeMessage = ($result | ForEach-Object { [string]$_ }) -join "`n"
    if ($safeMessage -match '^Deployment blocked: [^\r\n]+$') { throw $safeMessage }
    throw 'Deployment blocked: Code.gs syntax/mobile contract/regression guard failed.'
  }
  return (($result -join "`n") | ConvertFrom-Json)
}

function Initialize-ExistingClaspAuthorization {
  # Reuse the signed-in clasp account. Never log/serialize/store its secrets.
  $authPath = Join-Path $env:USERPROFILE '.clasprc.json'
  if (-not (Test-Path -LiteralPath $authPath)) { throw 'Existing clasp authorization is required. Run clasp login before deployment.' }
  try {
    $auth = Get-Content -LiteralPath $authPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $credential = $auth.tokens.default
    $tokenResponse = Invoke-RestMethod -Uri 'https://oauth2.googleapis.com/token' -Method Post -ContentType 'application/x-www-form-urlencoded' -Body @{
      client_id = $credential.client_id
      client_secret = $credential.client_secret
      refresh_token = $credential.refresh_token
      grant_type = 'refresh_token'
    } -TimeoutSec 35
    $script:oauthAccessToken = [string]$tokenResponse.access_token
    if (-not $script:oauthAccessToken) { throw 'empty token' }
  } catch { throw 'Existing clasp authorization could not be refreshed. Credentials and remote responses are intentionally omitted.' }
  finally { $auth = $null; $credential = $null; $tokenResponse = $null }
}

function Invoke-AppsScriptApi {
  param([ValidateSet('Get', 'Post', 'Put')][string]$Method, [string]$Path, [object]$Body = $null)
  $options = @{
    Uri = "$script:apiRoot$Path"
    Method = $Method
    Headers = @{ Authorization = "Bearer $script:oauthAccessToken" }
    TimeoutSec = 45
  }
  if ($null -ne $Body) {
    $options.ContentType = 'application/json; charset=utf-8'
    $options.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 30 -Compress))
  }
  try { return Invoke-RestMethod @options }
  catch { throw "Apps Script API $Method failed. No credentials, source, or response body were logged." }
}

function Get-ContentFingerprint {
  param([object]$Content)
  # PowerShell 5 sorts Hashtable properties differently from PSCustomObject
  # properties. Local files are Hashtables; Google API files are PSCustomObjects.
  # Build explicit values, then use ordinal keys so both hash the same file order.
  $rowsByKey = [System.Collections.Generic.Dictionary[string, object]]::new([StringComparer]::Ordinal)
  $keys = [System.Collections.Generic.List[string]]::new()
  foreach ($file in $Content.files) {
    $name = [string]$file.name
    $type = [string]$file.type
    $key = $name + [char]0 + $type
    if ($rowsByKey.ContainsKey($key)) { throw 'Deployment blocked: duplicate Apps Script file identity.' }
    $rowsByKey.Add($key, [ordered]@{ name = $name; type = $type; source = ([string]$file.source).Replace("`r`n", "`n").TrimEnd() })
    $keys.Add($key)
  }
  $keys.Sort([StringComparer]::Ordinal)
  $rows = @(foreach ($key in $keys) { $rowsByKey[$key] })
  $bytes = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $rows -Depth 10 -Compress))
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-CodeSource {
  param([object]$Content)
  $matches = @($Content.files | Where-Object { $_.name -eq 'Code' -and $_.type -eq 'SERVER_JS' })
  if ($matches.Count -ne 1) { throw 'Deployment blocked: remote Code.gs is missing or ambiguous.' }
  return [string]$matches[0].source
}

function Get-RemoteSnapshot {
  $deployment = Invoke-AppsScriptApi -Method Get -Path "/deployments/$deploymentId"
  if ($deployment.deploymentId -ne $deploymentId -or [int]$deployment.deploymentConfig.versionNumber -le 0) { throw 'Deployment blocked: the existing fixed deployment could not be verified.' }
  $version = [int]$deployment.deploymentConfig.versionNumber
  $deployed = Invoke-AppsScriptApi -Method Get -Path "/content?versionNumber=$version"
  $headContent = Invoke-AppsScriptApi -Method Get -Path '/content'
  return @{
    version = $version
    deployment = $deployment
    deployed = $deployed
    headContent = $headContent
    deployedHash = Get-ContentFingerprint -Content $deployed
    headHash = Get-ContentFingerprint -Content $headContent
  }
}

function Assert-SameSnapshot {
  param([object]$Before, [object]$After)
  if ($Before.version -ne $After.version -or $Before.deployedHash -ne $After.deployedHash -or $Before.headHash -ne $After.headHash) {
    throw 'Deployment blocked: remote Apps Script changed during preflight. Fetch and merge the newer source before retrying.'
  }
}

function Get-LocalContent {
  $files = @()
  foreach ($file in (Get-ChildItem -LiteralPath $serverDir -File | Sort-Object Name)) {
    if ($file.Name.StartsWith('.')) { continue }
    $type = switch ($file.Extension.ToLowerInvariant()) { '.gs' { 'SERVER_JS' } '.js' { 'SERVER_JS' } '.html' { 'HTML' } '.json' { if ($file.Name -eq 'appsscript.json') { 'JSON' } } }
    if (-not $type) { continue }
    # Get-Content -Raw attaches PSPath/PSDrive/Provider ETS properties to strings
    # in Windows PowerShell 5. Serializing those at depth 30 can recursively walk
    # provider metadata for minutes. ReadAllText returns a plain System.String.
    $plainSource = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    $files += @{ name = [string]$file.BaseName; type = [string]$type; source = $plainSource }
  }
  if (@($files | Where-Object { $_.name -eq 'appsscript' -and $_.type -eq 'JSON' }).Count -ne 1) { throw 'Apps Script manifest is missing.' }
  return @{ files = @($files) }
}

function Assert-RemoteFilesPreserved {
  param([object]$Local, [object]$Remote)
  foreach ($file in $Remote.files) {
    if (@($Local.files | Where-Object { $_.name -eq $file.name -and $_.type -eq $file.type }).Count -ne 1) { throw 'Deployment blocked: local source would remove an existing remote Apps Script file.' }
  }
}

if (-not (Test-Path -LiteralPath $sourceFile) -or -not (Test-Path -LiteralPath $guardFile)) { throw 'Required deployment source/guard is missing.' }
$projectFile = Join-Path $serverDir '.clasp.json'
if (Test-Path -LiteralPath $projectFile) {
  $project = Get-Content -LiteralPath $projectFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($project.scriptId -ne $scriptId) { throw 'Deployment blocked: .clasp.json targets a different Apps Script project.' }
}

Write-Host '[1/6] Checking latest main ancestry, Code.gs syntax, and desktop/mobile contracts'
if (-not $ValidateOnly) { $null = Invoke-GitRead -Arguments @('fetch', '--quiet', 'origin', 'main') }
$mainCommit = Invoke-GitRead -Arguments @('rev-parse', 'origin/main')
Assert-MainAncestry -MainCommit $mainCommit
$mainSource = Invoke-GitRead -Arguments @('show', "${mainCommit}:ungcheon-school-helper/server/Code.gs")
$localContent = Get-LocalContent
$localSource = Get-CodeSource -Content $localContent
$localHash = Get-ContentFingerprint -Content $localContent
$baselines = @(@{ label = 'origin/main'; role = 'origin-main'; source = $mainSource; deployed = $false })
$guard = Invoke-SourceGuard -LocalSource $localSource -Baselines $baselines
$expectedServiceVersion = [int]$guard.serviceVersion
if ($ValidateOnly) {
  Write-Host "Offline validation passed: service v$expectedServiceVersion, $($guard.functions) functions, $($guard.actions) actions. Remote reads/writes were not performed."
  return
}

try {
  Write-Host '[2/6] Reading the existing fixed deployment and remote HEAD (no property access)'
  Initialize-ExistingClaspAuthorization
  $before = Get-RemoteSnapshot
  Assert-RemoteFilesPreserved -Local $localContent -Remote $before.deployed
  Assert-RemoteFilesPreserved -Local $localContent -Remote $before.headContent
  $baselines += @{ label = 'fixed deployment'; source = Get-CodeSource -Content $before.deployed; deployed = $true }
  $baselines += @{ label = 'remote HEAD'; source = Get-CodeSource -Content $before.headContent; deployed = $false }
  $guard = Invoke-SourceGuard -LocalSource $localSource -Baselines $baselines
  if ($PreflightOnly) {
    Write-Host "Online preflight passed: origin/main $mainCommit; fixed deployment @$($before.version); target service v$expectedServiceVersion. Nothing was uploaded or deployed."
    return
  }

  Write-Host '[3/6] Rechecking concurrent main/remote changes immediately before upload'
  if ((Get-OriginMainCommit) -ne $mainCommit) { throw 'Deployment blocked: origin/main advanced during preflight. Merge it before deployment.' }
  if ((Get-ContentFingerprint -Content (Get-LocalContent)) -ne $localHash) { throw 'Deployment blocked: local server source changed during preflight.' }
  $current = Get-RemoteSnapshot
  Assert-SameSnapshot -Before $before -After $current

  # projects.updateContent changes project files only; never ScriptProperties.
  $null = Invoke-AppsScriptApi -Method Put -Path '/content' -Body $localContent
  $uploaded = Invoke-AppsScriptApi -Method Get -Path '/content'
  if ((Get-ContentFingerprint -Content $uploaded) -ne $localHash) { throw 'Upload verification failed or another writer changed remote HEAD. The fixed deployment was not changed.' }
  $unchangedDeployment = Invoke-AppsScriptApi -Method Get -Path "/deployments/$deploymentId"
  if ([int]$unchangedDeployment.deploymentConfig.versionNumber -ne $before.version) { throw 'The fixed deployment changed after upload. Deployment stopped; do not overwrite the concurrent update.' }

  Write-Host '[4/6] Creating and checking an immutable project version'
  $version = Invoke-AppsScriptApi -Method Post -Path '/versions' -Body @{ description = $Description }
  $versionNumber = [int]$version.versionNumber
  $versionContent = Invoke-AppsScriptApi -Method Get -Path "/content?versionNumber=$versionNumber"
  if ((Get-ContentFingerprint -Content $versionContent) -ne $localHash) { throw 'Immutable version does not match validated source. The fixed deployment was not changed.' }
  $unchangedDeployment = Invoke-AppsScriptApi -Method Get -Path "/deployments/$deploymentId"
  if ([int]$unchangedDeployment.deploymentConfig.versionNumber -ne $before.version) { throw 'The fixed deployment advanced before update. Deployment stopped.' }

  Write-Host '[5/6] Updating only the existing fixed deployment'
  $updated = Invoke-AppsScriptApi -Method Put -Path "/deployments/$deploymentId" -Body @{
    deploymentConfig = @{ scriptId = $scriptId; versionNumber = $versionNumber; manifestFileName = 'appsscript'; description = $Description }
  }
  if ($updated.deploymentId -ne $deploymentId -or [int]$updated.deploymentConfig.versionNumber -ne $versionNumber) { throw 'The fixed deployment update could not be confirmed.' }

  Write-Host '[6/6] Verifying the fixed public URL and deployed mobile action'
  try { $health = Invoke-RestMethod -Uri $webAppUrl -TimeoutSec 35 }
  catch { throw 'Deployment updated, but the fixed public URL health check failed. No response body was logged.' }
  if (-not $health.ok -or $health.data.service -ne 'UngcheonSchoolHub' -or [int]$health.data.version -ne $expectedServiceVersion) { throw 'The fixed public URL is not serving the expected integrated service version.' }
  $probeBody = @{ action = 'getMobileScheduleBundle'; viewerName = '__mobile_deployment_probe__'; accessToken = ''; fromDate = '2000-01-03'; toDate = '2000-01-16' } | ConvertTo-Json -Compress
  try { $probe = Invoke-RestMethod -Uri $webAppUrl -Method Post -ContentType 'text/plain;charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($probeBody)) -TimeoutSec 35 }
  catch { throw 'Deployment updated, but the unauthenticated mobile route probe failed.' }
  $unknownActionError = ConvertFrom-Json '"\ud5c8\uc6a9\ub418\uc9c0 \uc54a\ub294 \uc694\uccad\uc785\ub2c8\ub2e4."'
  if ($probe.ok -or [string]$probe.error -eq $unknownActionError -or -not [string]$probe.error) { throw 'The mobile route failed to reject the unauthenticated probe correctly.' }
  Write-Host "Apps Script fixed deployment updated: service v$expectedServiceVersion, project version @$versionNumber"
  Write-Host "URL preserved: $webAppUrl"
  Write-Host 'Existing ScriptProperties and login sessions were not reset. Run authenticated mobile acceptance checks separately without logging secrets.'
}
finally { $script:oauthAccessToken = $null }
