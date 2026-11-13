[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
$sources=@(
  @('internal','12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4','MIGRATION_TARGET'),
  @('preservedBackup','1OBt8XHMYH8uNAfuozbjc8iON954FjBSmojf4y2c74GQ','PRESERVED_COPY'),
  @('weeklyPlan','1Bn2hJ8vehxRCgWJmF2CJzaUiiZM6iRxdYLPS4iadB_k','EXTERNAL_SOURCE_RETAINED'),
  @('creativeSchedule','1ku5VufC7Pv_dIS0h7lbYMaWSeKzMnyAoBU0QPq5uR00','EXTERNAL_SOURCE_RETAINED'),
  @('gateDuty','1YhgrTJOuWKqCFRkFVPLQ__cARt17GOvsC633k10dBFU','EXTERNAL_SOURCE_RETAINED'),
  @('mealDuty','10cPw-KaYGNPSN-JYDCmNC7MqPhUVOwtoIzD7kS6qKRE','EXTERNAL_SOURCE_RETAINED'),
  @('attendance','1z09l2HzckFRboFgEMiQrNmApunVhVxi351y01OMAWPA','LIVE_CONNECTION_RETAINED_NO_COPY'),
  @('caseStorageDefault','1EMa0EINCAnTCm7e8UAsJ6Yjul_O6G_C-X25EN3oC0Dk','PROTECTED_STORAGE_RETAINED_NO_COPY')
)
$token=$null;$headers=$null
try {
  $auth=Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.clasprc.json') -Raw | ConvertFrom-Json
  $credential=$auth.tokens.default
  $refreshed=Invoke-RestMethod -Uri 'https://oauth2.googleapis.com/token' -Method Post -Body @{
    client_id=$credential.client_id;client_secret=$credential.client_secret
    refresh_token=$credential.refresh_token;grant_type='refresh_token'
  } -TimeoutSec 30
  $token=[string]$refreshed.access_token;$headers=@{Authorization="Bearer $token"}
  $auth=$null;$credential=$null;$refreshed=$null
  $results=foreach($item in $sources) {
    try {
      $fields='id,mimeType,version,modifiedTime,ownedByMe,permissions(type,role,allowFileDiscovery),capabilities(canCopy,canDownload)'
      $metadata=Invoke-RestMethod -Uri ('https://www.googleapis.com/drive/v3/files/'+$item[1]+'?fields='+[Uri]::EscapeDataString($fields)) -Headers $headers -TimeoutSec 30
      $permissionKnown=$null -ne $metadata.permissions
      [ordered]@{
        resource=$item[0];scope=$item[2];status='METADATA_READ';mimeType=$metadata.mimeType
        version=$metadata.version;modifiedTime=$metadata.modifiedTime;ownedByCurrentAccount=$metadata.ownedByMe
        permissionMetadataAvailable=$permissionKnown
        ownerCount=$(if($permissionKnown){@($metadata.permissions | Where-Object role -eq 'owner').Count}else{$null})
        nonOwnerPermissionCount=$(if($permissionKnown){@($metadata.permissions | Where-Object role -ne 'owner').Count}else{$null})
        anyonePermissionCount=$(if($permissionKnown){@($metadata.permissions | Where-Object type -eq 'anyone').Count}else{$null})
        domainPermissionCount=$(if($permissionKnown){@($metadata.permissions | Where-Object type -eq 'domain').Count}else{$null})
        rowValuesRead=$false
      }
    } catch {
      $status=if($_.Exception.Response){[int]$_.Exception.Response.StatusCode}else{$null}
      [ordered]@{resource=$item[0];scope=$item[2];status='NOT_VERIFIED';httpStatus=$status;rowValuesRead=$false}
    }
  }
  $report=[ordered]@{schemaVersion=1;inspectedAt=[DateTime]::UtcNow.ToString('o');readOnly=$true;sources=@($results);limitations=@('File ACLs do not identify every automation or editor.','A Drive version is a file change marker, not an application revision.','The protected-library property override and per-document references were not read.','External row counts and values were not collected; attendance and protected documents were not copied.')}
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath),($report | ConvertTo-Json -Depth 10)+"`n",[Text.UTF8Encoding]::new($false))
  $results | ForEach-Object {Write-Output ($_.resource+': '+$_.status)}
} catch {throw 'Read-only source metadata inspection failed; credentials and responses are omitted.'}
finally {$token=$null;$headers=$null;$auth=$null;$credential=$null;$refreshed=$null;$metadata=$null}
