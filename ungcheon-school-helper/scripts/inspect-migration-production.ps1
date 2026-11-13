[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
$scriptId='1rLmGrYBAeMUHxGr9CSeT1DUtTUoDbmNpydp1rGe5DL-RzDlyoZCleLnb'
$deploymentId='AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w'
function Fingerprint($content) {
  $sha=[Security.Cryptography.SHA256]::Create()
  try {
    $files=@($content.files | Sort-Object name | ForEach-Object {
      [ordered]@{name=$_.name;type=$_.type;source=$_.source.Replace("`r`n","`n")}
    })
    return [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($files | ConvertTo-Json -Depth 8 -Compress)))).ToLowerInvariant()
  } finally {$sha.Dispose()}
}
function ServiceVersion($content) {
  $code=($content.files | Where-Object name -eq 'Code').source
  if($code -notmatch 'const MOBILE_SERVICE_VERSION = (\d+);') {throw 'Service version missing.'}
  return [int]$Matches[1]
}
$headers=$null;$token=$null
try {
  $auth=Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.clasprc.json') -Raw | ConvertFrom-Json
  $credential=$auth.tokens.default
  $refreshed=Invoke-RestMethod -Uri 'https://oauth2.googleapis.com/token' -Method Post -Body @{
    client_id=$credential.client_id;client_secret=$credential.client_secret;refresh_token=$credential.refresh_token;grant_type='refresh_token'
  } -TimeoutSec 30
  $token=[string]$refreshed.access_token;$headers=@{Authorization="Bearer $token"}
  $auth=$null;$credential=$null;$refreshed=$null
  $root="https://script.googleapis.com/v1/projects/$scriptId"
  $deployment=Invoke-RestMethod -Uri "$root/deployments/$deploymentId" -Headers $headers -TimeoutSec 30
  if($deployment.deploymentId -ne $deploymentId) {throw 'Deployment identity mismatch.'}
  $version=[int]$deployment.deploymentConfig.versionNumber
  $live=Invoke-RestMethod -Uri "$root/content?versionNumber=$version" -Headers $headers -TimeoutSec 30
  $head=Invoke-RestMethod -Uri "$root/content" -Headers $headers -TimeoutSec 30
  $health=Invoke-RestMethod -Uri "https://script.google.com/macros/s/$deploymentId/exec?action=health" -TimeoutSec 60
  if(!$health.ok -or $health.data.service -ne 'UngcheonSchoolHub') {throw 'Health not confirmed.'}
  $manifest=($live.files | Where-Object name -eq 'appsscript').source | ConvertFrom-Json
  $liveScopes=@($manifest.oauthScopes | Where-Object {$_})
  $report=[ordered]@{schemaVersion=1;inspectedAt=[DateTime]::UtcNow.ToString('o');readOnly=$true;scriptId=$scriptId;deploymentId=$deploymentId;deploymentVersion=$version;liveServiceVersion=(ServiceVersion $live);headServiceVersion=(ServiceVersion $head);liveFingerprint=(Fingerprint $live);headFingerprint=(Fingerprint $head);liveModuleNames=@($live.files.name);healthServiceVersion=$health.data.version;healthOk=$true;explicitLiveOAuthScopes=$liveScopes;propertiesRead=$false;sourceRowsRead=$false;productionChanged=$false}
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath),($report | ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
  Write-Output "Verified fixed deployment @$version, live service $($report.liveServiceVersion), HEAD service $($report.headServiceVersion), health $($report.healthServiceVersion). Read-only."
} catch {throw 'Production inspection failed; credentials and remote bodies omitted.'}
finally {$headers=$null;$token=$null;$auth=$null;$credential=$null;$refreshed=$null;$live=$null;$head=$null;$deployment=$null;$health=$null}
