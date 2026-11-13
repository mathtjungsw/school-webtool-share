[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$probeDir = Join-Path $PSScriptRoot '../firebase/probe'
$metadataPath = Join-Path $probeDir 'project.json'
$productionId = '1rLmGrYBAeMUHxGr9CSeT1DUtTUoDbmNpydp1rGe5DL-RzDlyoZCleLnb'
$title = '웅천고 Firestore 연결 시험 (운영 분리)'
$token = $null
try {
  $auth = Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.clasprc.json') -Raw | ConvertFrom-Json
  $credential = $auth.tokens.default
  $refreshed = Invoke-RestMethod -Uri 'https://oauth2.googleapis.com/token' -Method Post -Body @{
    client_id=$credential.client_id; client_secret=$credential.client_secret
    refresh_token=$credential.refresh_token; grant_type='refresh_token'
  } -TimeoutSec 30
  $token = [string]$refreshed.access_token
  $headers = @{Authorization="Bearer $token"}
  $auth=$null; $credential=$null; $refreshed=$null
  if (Test-Path -LiteralPath $metadataPath) {
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    $probeId = [string]$metadata.scriptId
    if (-not $probeId -or $probeId -eq $productionId) { throw 'Invalid isolated probe project.' }
    $project = Invoke-RestMethod -Uri "https://script.googleapis.com/v1/projects/$probeId" -Headers $headers -TimeoutSec 30
    if ($project.title -ne $title) { throw 'Isolated probe identity changed.' }
  } else {
    $body = [Text.Encoding]::UTF8.GetBytes((@{title=$title} | ConvertTo-Json -Compress))
    $project = Invoke-RestMethod -Uri 'https://script.googleapis.com/v1/projects' -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30
    $probeId = [string]$project.scriptId
    if (-not $probeId -or $probeId -eq $productionId) { throw 'Invalid isolated probe project.' }
    # Persist the new identity before uploading so retries never create duplicates.
    $metadata = [ordered]@{scriptId=$probeId; title=$title; firebaseProjectId='ungcheon-school-helper'; productionScriptChanged=$false}
    [IO.File]::WriteAllText($metadataPath, ($metadata | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
  }
  $files = @(
    @{name='Code';type='SERVER_JS';source=[IO.File]::ReadAllText((Join-Path $probeDir 'Code.gs'))},
    @{name='appsscript';type='JSON';source=[IO.File]::ReadAllText((Join-Path $probeDir 'appsscript.json'))}
  )
  foreach ($module in @('FirestoreRepository','MigrationSync','MigrationAdmin','MigrationJournal','MigrationStore','MigrationCapture','MigrationTracking','MigrationReplication','MigrationRecovery','MigrationOperations','MigrationBaseline','MigrationSchema')) {
    $files += @{name=$module;type='SERVER_JS';source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot "../server/$module.gs"))}
  }
  $nativeSource = (& node (Join-Path $PSScriptRoot 'probe-native-app-source.cjs')) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic native app source could not be built.' }
  $files += @{name='NativeApp';type='SERVER_JS';source=$nativeSource}
  $payload = [Text.Encoding]::UTF8.GetBytes((@{files=$files} | ConvertTo-Json -Depth 10 -Compress))
  $null = Invoke-RestMethod -Uri "https://script.googleapis.com/v1/projects/$probeId/content" -Method Put -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 30
  Write-Output "Isolated probe prepared: https://script.google.com/home/projects/$probeId/edit"
  Write-Output 'No function was executed. The production script, deployment, properties and sessions were not modified.'
} catch {
  throw 'Isolated probe preparation failed. Credentials and remote responses are intentionally omitted.'
} finally { $token=$null; $headers=$null; $auth=$null; $credential=$null; $refreshed=$null }
