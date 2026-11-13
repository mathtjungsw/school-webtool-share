[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string[]]$WorkbookIds,
  [Parameter(Mandatory=$true)][string]$ReportPath
)
$ErrorActionPreference='Stop'
$probeId='16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9'
$forbidden=@('12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4','1OBt8XHMYH8uNAfuozbjc8iON954FjBSmojf4y2c74GQ')
$allowedTitles=@('웅천고 이전 시험 - 합성 변경 기록 전용','웅천고 이전 시험 - 합성 변경 기록 전용 v2','웅천고 이전 시험 - 합성 초기복사 성능 v1','웅천고 이전 시험 - 합성 업무 요청 v1')
if (!$WorkbookIds.Count -or $WorkbookIds.Count -gt 4) { throw 'Specify only the synthetic probe workbooks.' }
foreach($id in $WorkbookIds) { if($id -notmatch '^[A-Za-z0-9_-]{20,100}$' -or $id -in $forbidden) { throw 'Invalid synthetic workbook identity.' } }
function SourceHash([string]$Source) {
  $sha=[Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Source.Replace("`r`n","`n")))).ToLowerInvariant() }
  finally {$sha.Dispose()}
}
$headers=$null;$token=$null
try {
  $auth=Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.clasprc.json') -Raw | ConvertFrom-Json
  $credential=$auth.tokens.default
  $refreshed=Invoke-RestMethod -Uri 'https://oauth2.googleapis.com/token' -Method Post -Body @{
    client_id=$credential.client_id;client_secret=$credential.client_secret
    refresh_token=$credential.refresh_token;grant_type='refresh_token'
  } -TimeoutSec 30
  $token=[string]$refreshed.access_token;$headers=@{Authorization="Bearer $token"}
  $auth=$null;$credential=$null;$refreshed=$null
  $project=Invoke-RestMethod -Uri "https://script.googleapis.com/v1/projects/$probeId" -Headers $headers -TimeoutSec 30
  if($project.title -ne '웅천고 Firestore 연결 시험 (운영 분리)') { throw 'Probe project identity mismatch.' }
  $remote=Invoke-RestMethod -Uri "https://script.googleapis.com/v1/projects/$probeId/content" -Headers $headers -TimeoutSec 30
  $names=@('Code','FirestoreRepository','MigrationSync','MigrationAdmin','MigrationJournal','MigrationStore','MigrationCapture','MigrationTracking','MigrationReplication','MigrationRecovery','MigrationOperations','MigrationBaseline','MigrationSchema','NativeApp')
  if($remote.files.Count -ne $names.Count+1) { throw 'Unexpected probe file count.' }
  $modules=foreach($name in $names) {
    $matches=@($remote.files | Where-Object name -eq $name)
    if($matches.Count -ne 1 -or $matches[0].type -ne 'SERVER_JS') { throw 'Probe module missing.' }
    $path=if($name -eq 'Code'){Join-Path $PSScriptRoot '../firebase/probe/Code.gs'}else{Join-Path $PSScriptRoot "../server/$name.gs"}
    $localText=if($name -eq 'NativeApp'){(& node (Join-Path $PSScriptRoot 'probe-native-app-source.cjs')) -join "`n"}else{[IO.File]::ReadAllText($path)}
    $localHash=SourceHash $localText;$remoteHash=SourceHash $matches[0].source
    if($localHash -ne $remoteHash) { throw 'Probe source differs from tested local code.' }
    [ordered]@{name=$name;sha256=$localHash;remoteMatchesLocal=$true}
  }
  $manifest=($remote.files | Where-Object name -eq 'appsscript').source | ConvertFrom-Json
  $localManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../firebase/probe/appsscript.json') -Raw | ConvertFrom-Json
  if($manifest.runtimeVersion -ne $localManifest.runtimeVersion -or $manifest.timeZone -ne $localManifest.timeZone -or
     (($manifest.oauthScopes | Sort-Object) -join ',') -ne (($localManifest.oauthScopes | Sort-Object) -join ',')) { throw 'Probe manifest mismatch.' }
  $books=foreach($id in $WorkbookIds) {
    $fields='id,name,mimeType,version,ownedByMe,permissions(type,role)'
    $metadata=Invoke-RestMethod -Uri ('https://www.googleapis.com/drive/v3/files/'+$id+'?fields='+[Uri]::EscapeDataString($fields)) -Headers $headers -TimeoutSec 30
    if($metadata.name -notin $allowedTitles -or !$metadata.ownedByMe -or !$metadata.permissions) { throw 'Synthetic workbook ownership not verified.' }
    $owners=@($metadata.permissions | Where-Object role -eq 'owner').Count
    $others=@($metadata.permissions | Where-Object role -ne 'owner').Count
    if($owners -ne 1 -or $others -ne 0) { throw 'Synthetic workbook is not owner-only.' }
    [ordered]@{id=$id;name=$metadata.name;version=$metadata.version;ownerCount=$owners;nonOwnerPermissionCount=$others;rowValuesRead=$false}
  }
  $report=[ordered]@{schemaVersion=1;inspectedAt=[DateTime]::UtcNow.ToString('o');readOnly=$true;probeScriptId=$probeId;modules=@($modules);manifestMatches=$true;workbooks=@($books);productionScriptChanged=$false}
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath),($report | ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
  Write-Output ('Verified '+$modules.Count+' remote modules, manifest, and '+$books.Count+' private synthetic workbooks. No row values read.')
} catch {throw 'Probe verification failed; credentials and remote response bodies are omitted.'}
finally {$headers=$null;$token=$null;$auth=$null;$credential=$null;$refreshed=$null;$remote=$null;$metadata=$null}
