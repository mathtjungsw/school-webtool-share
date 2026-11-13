'use strict'
// Executes the real PowerShell publisher against an in-process REST stub only.
const assert=require('node:assert/strict'),path=require('node:path'),{execFileSync}=require('node:child_process')
const file=path.join(__dirname,'deploy-apps-script.ps1').replace(/'/g,"''")
const script=`
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'PowerShell syntax error'}
$fn=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Write-MigrationDeploymentEvidence'},$false)[0]
. ([scriptblock]::Create($fn.Extent.Text))
$scriptId='synthetic-script';$deploymentId='synthetic-fixed';$script:oauthAccessToken='synthetic-token'
$script:document=$null;$script:commits=0;$script:fail=$false
function Invoke-RestMethod {
  param($Uri,$Method,$Headers,$TimeoutSec,$ContentType,$Body)
  if($Headers.Authorization -ne 'Bearer synthetic-token'){throw 'Wrong synthetic authorization'}
  if($Method -eq 'Post'){
    if($script:fail){throw 'synthetic private response'}
    $payload=[Text.Encoding]::UTF8.GetString($Body)|ConvertFrom-Json
    $write=$payload.writes[0]
    if($script:document){if($write.currentDocument.updateTime -ne $script:document.updateTime){throw 'CAS missing'}}
    elseif($write.currentDocument.exists -ne $false){throw 'Create precondition missing'}
    $script:commits++;$script:document=[pscustomobject]@{fields=$write.update.fields;updateTime=[string]$script:commits};return @{}
  }
  return $script:document
}
$local=@{files=@(@{name='MigrationOwner';type='SERVER_JS';source="function migrationOwnerReleaseId_() {return 'synthetic-release';}"})}
Write-MigrationDeploymentEvidence -Local $local -Fingerprint ('1'*64) -VersionNumber 90 -ServiceVersion 64 -MainCommit ('2'*40)
if($script:commits -ne 1 -or $script:document.fields.scriptId.stringValue -ne $scriptId){throw 'Wrong evidence'}
Write-MigrationDeploymentEvidence -Local $local -Fingerprint ('3'*64) -VersionNumber 91 -ServiceVersion 65 -MainCommit ('4'*40)
if($script:commits -ne 2){throw 'Update missing'}
$blocked=$false;try{Write-MigrationDeploymentEvidence -Local $local -Fingerprint ('1'*64) -VersionNumber 90 -ServiceVersion 64 -MainCommit ('2'*40)}catch{$blocked=$true}
if(-not $blocked -or $script:commits -ne 2){throw 'Stale update not blocked'}
$script:fail=$true;$blocked=$false
try{Write-MigrationDeploymentEvidence -Local $local -Fingerprint ('5'*64) -VersionNumber 92 -ServiceVersion 66 -MainCommit ('6'*40)}catch{$blocked=$true;if($_.Exception.Message -match 'synthetic private response'){throw 'Raw error leaked'}}
if(-not $blocked -or $script:commits -ne 2){throw 'Failure not preserved'}
Write-Output 'PASS synthetic deployment evidence CAS, monotonicity, readback and redaction'
`
const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:15000})
assert.match(result,/PASS synthetic deployment evidence/)
console.log(result.trim())
