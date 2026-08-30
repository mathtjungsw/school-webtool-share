'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { validate, inspectSource } = require('./apps-script-deploy-guard.cjs')

// Generated test data only. Never put a real mobile password/token here.
const fixture = `
const MOBILE_SERVICE_VERSION = 39;
const MOBILE_SESSION_HOURS = 72;
const MOBILE_SESSION_PROPERTY_PREFIX = 'UNG_MOBILE_SESSION_';
const MOBILE_SHARED_PASSWORD_HASH_PROPERTY = 'UNG_MOBILE_SHARED_PASSWORD_HASH';
const STAFF_CHECKLISTS_SHEET = 'staff-checklists';
const STAFF_CHECKLIST_HEADERS = ['title', 'deadline'];
const RELEASE_NOTES = [
 { key: 'v1.1.26', body: ['mobile integration'].join('\\n') },
 { key: 'v1.1.25', body: 'desktop widgets' },
 { key: 'v1.1.24', body: 'desktop previous release' }
];
function doPost(e) {
 const action = e.action;
 if (action === 'verifyMobileViewer') return mobileCreateSession_(mobileAssertViewer_(mobileSharedPasswordHash_()));
 if (action === 'getMobileScheduleBundle') return getMobileScheduleBundle_(e);
 if (action === 'listStaffChecklists') return listStaffChecklists_();
 ensureSheets_();
}
function listStaffChecklists_() { return readObjects_(STAFF_CHECKLISTS_SHEET); }
function ensureSheets_() {}
function mobileCreateSession_(viewerName) {
 const expiresAt = Date.now() + MOBILE_SESSION_HOURS * 60 * 60 * 1000;
 const accessToken = Utilities.getUuid() + Utilities.getUuid();
 const tokenKey = MOBILE_SESSION_PROPERTY_PREFIX + sha256_(accessToken);
 const properties = PropertiesService.getScriptProperties();
 const all = properties.getProperties();
 Object.keys(all).forEach(function(key) {
  if (key.indexOf(MOBILE_SESSION_PROPERTY_PREFIX) !== 0) return;
  if (Number(JSON.parse(all[key]).expiresAt) <= Date.now()) properties.deleteProperty(key);
 });
 properties.setProperty(tokenKey, JSON.stringify({ viewerName: viewerName, expiresAt: expiresAt }));
 return { verified: true, accessToken: accessToken, expiresAt: new Date(expiresAt).toISOString() };
}
function mobileLoadSource_(sourceStatus, key, emptyValue, loader) {
 try { const value = loader(); sourceStatus[key] = { state: value.length ? 'fresh' : 'empty' }; return value; }
 catch (error) { sourceStatus[key] = { state: 'unavailable' }; return emptyValue; }
}
function mobileSharedMealsInRange_(fromDate, toDate) {
 const fromKey = fromDate; const toKey = toDate;
 return readObjects_(NEIS_MEALS_SHEET).filter(function(row) { const dateKey = row.date; return dateKey >= fromKey && dateKey <= toKey; });
}
function getMobileScheduleBundle_(body) {
 mobileAssertAccess_(body);
 const fromDate = body.fromDate; const toDate = body.toDate;
 const todayKey = '20260830'; const cacheKey = 'mobile:' + todayKey + fromDate + toDate;
 const sourceStatus = {};
 ${['weekly', 'creative', 'gateDuty', 'mealDuty', 'timetable', 'committee', 'changes'].map(key => `mobileLoadSource_(sourceStatus, '${key}', [], function() { return []; });`).join('\n')}
 const meals = mobileLoadSource_(sourceStatus, 'meals', [], function() { return mobileSharedMealsInRange_(fromDate, toDate); });
 const todayMeals = meals.filter(function(meal) { return meal.date === todayKey; });
 return { meals: meals, todayMeals: todayMeals, contractVersion: 3, sourceStatus: sourceStatus };
}
`

let checks = 0
function pass(label, task) { task(); checks++; }
function fails(label, change, expected, baselines = []) {
 pass(label, () => assert.throws(() => validate({ localSource: change(fixture), baselines }), expected, label))
}
pass('integrated contract', () => assert.equal(validate({ localSource: fixture }).serviceVersion, 39))
fails('syntax errors', text => text + '\nfunction broken( {', /syntax check/)
fails('missing action', text => text.replace("action === 'verifyMobileViewer'", "action === 'oldLogin'"), /mobile action/)
fails('old service version', text => text.replace('VERSION = 39', 'VERSION = 38'), /integrated version/)
fails('wrong session duration', text => text.replace('HOURS = 72', 'HOURS = 24'), /must remain 72/)
fails('credential property rename', text => text.replace('UNG_MOBILE_SHARED_PASSWORD_HASH', 'RENAMED'), /property names/)
fails('contract downgrade', text => text.replace('contractVersion: 3', 'contractVersion: 2'), /contractVersion 3/)
fails('missing source loader', text => text.replace("sourceStatus, 'weekly'", "sourceStatus, 'wrong'"), /sourceStatus loader/)
fails('missing range meals', text => text.replace('meals: meals,', ''), /range meals/)
fails('missing legacy meals', text => text.replace('todayMeals: todayMeals,', ''), /legacy todayMeals/)
fails('date range omission', text => text.replace('dateKey <= toKey', 'true'), /date range/)
fails('forbidden direct NEIS API', text => text.replace('const fromKey = fromDate;', 'UrlFetchApp.fetch("https://open.neis.go.kr"); const fromKey = fromDate;'), /forbidden mobile/)
fails('forbidden student field', text => text.replace('return { meals: meals', 'return { studentRoster: [], meals: meals'), /forbidden student/)
fails('whole property wipe', text => text + '\nfunction reset() { PropertiesService.getScriptProperties().deleteAllProperties(); }', /blanket/)
fails('property replacement wipe', text => text + '\nfunction reset() { PropertiesService.getScriptProperties().setProperties({}, true); }', /replacement/)
fails('active session removal', text => text.replace('if (Number(JSON.parse(all[key]).expiresAt) <= Date.now()) ', ''), /existing credentials or active sessions/)
fails('top-level property write', text => text + '\nconst bad = PropertiesService.getScriptProperties().setProperty("x", "y");', /top-level initializer/)
fails('desktop release omission', text => text.replace("key: 'v1.1.25'", "key: 'v0.0.0'"), /desktop release/)
fails('main desktop function omission', text => text.replace('function listStaffChecklists_() { return readObjects_(STAFF_CHECKLISTS_SHEET); }', ''), /function removed/, [{ source: fixture, label: 'main' }])
fails('baseline action omission', text => text.replace("action === 'listStaffChecklists'", "action === 'oldAction'"), /action removed/, [{ source: fixture, label: 'main' }])
fails('release content replacement', text => text.replace('desktop widgets', 'replacement mobile notice'), /release note content removed/, [{ source: fixture, label: 'main' }])
fails('remote version downgrade', text => text, /version downgrade/, [{ source: fixture.replace('VERSION = 39', 'VERSION = 40'), label: 'fixed', deployed: true }])
fails('same service version changed code', text => text + '\n// changed', /newer MOBILE_SERVICE_VERSION/, [{ source: fixture, label: 'fixed', deployed: true }])
pass('idempotent same-source redeployment', () => assert.equal(validate({ localSource: fixture, baselines: [{ source: fixture, deployed: true }] }).ok, true))
pass('merge release bodies', () => assert.equal(validate({ localSource: fixture.replace('desktop widgets', 'desktop widgets\\nmobile widgets'), baselines: [{ source: fixture }] }).ok, true))

const mainBaseline = { source: fixture, label: 'origin/main', role: 'origin-main' }
fails('desktop function same-name empty-result substitution', text => text.replace('return readObjects_(STAFF_CHECKLISTS_SHEET);', 'return [];'), /protected desktop function changed: listStaffChecklists_/, [mainBaseline])
fails('desktop function body removed but declaration survives', text => text.replace('return readObjects_(STAFF_CHECKLISTS_SHEET);', ''), /protected desktop function changed/, [mainBaseline])
fails('desktop sheet constant substitution', text => text.replace("'staff-checklists'", "'wrong-sheet'"), /protected desktop constant changed: STAFF_CHECKLISTS_SHEET/, [mainBaseline])
fails('desktop constant removed', text => text.replace("const STAFF_CHECKLISTS_SHEET = 'staff-checklists';", ''), /protected desktop constant removed/, [mainBaseline])
fails('desktop constant becomes mutable', text => text.replace('const STAFF_CHECKLISTS_SHEET', 'let STAFF_CHECKLISTS_SHEET'), /protected desktop constant changed/, [mainBaseline])
fails('desktop nested constant changed', text => text.replace("['title', 'deadline']", "['title', 'wrong-column']"), /protected desktop constant changed: STAFF_CHECKLIST_HEADERS/, [mainBaseline])
fails('unreviewed desktop helper addition', text => text + '\nfunction resetDesktopItems_() { return []; }', /unreviewed desktop function added/, [mainBaseline])
fails('unreviewed desktop constant addition', text => text + '\nconst DESKTOP_SWITCH = false;', /unreviewed desktop constant added/, [mainBaseline])
pass('CRLF preserves protected desktop definitions', () => assert.equal(validate({ localSource: fixture.replace(/\n/g, '\r\n'), baselines: [mainBaseline] }).desktopBodyProtection, true))
pass('mobile and routing integration allowlist', () => assert.equal(validate({
 localSource: fixture.replace('const action = e.action;', 'const action = String(e.action);') + '\nfunction mobileNewSource_() { return []; }\nconst MOBILE_NEW_SOURCE_VERSION = 1;',
 baselines: [mainBaseline]
}).ok, true))

const oldRemote = fixture.replace('VERSION = 39', 'VERSION = 38').replace('return readObjects_(STAFF_CHECKLISTS_SHEET);', 'return [];').replace("'staff-checklists'", "'legacy-staff-sheet'")
pass('three-way accepts desktop work already approved on main', () => assert.equal(validate({ localSource: fixture, baselines: [mainBaseline, { source: oldRemote, label: 'fixed deployment', deployed: true }] }).ok, true))
fails('three-way blocks reverting main desktop implementation to remote legacy', text => text.replace('return readObjects_(STAFF_CHECKLISTS_SHEET);', 'return [];'), /protected desktop function changed/, [mainBaseline, { source: oldRemote, label: 'fixed deployment', deployed: true }])
const remoteOnlyDefinitions = '\nfunction remoteDesktopHelper_() { return "remote-only"; }\nconst REMOTE_DESKTOP_SHEET = "remote-only-sheet";'
pass('three-way preserves remote-only desktop definitions unchanged', () => assert.equal(validate({ localSource: fixture + remoteOnlyDefinitions, baselines: [mainBaseline, { source: oldRemote + remoteOnlyDefinitions, label: 'remote HEAD' }] }).ok, true))
pass('three-way blocks remote-only body replacement', () => assert.throws(() => validate({ localSource: fixture + remoteOnlyDefinitions.replace('return "remote-only";', 'return [];'), baselines: [mainBaseline, { source: oldRemote + remoteOnlyDefinitions, label: 'remote HEAD' }] }), /protected desktop function changed: remoteDesktopHelper_/))
pass('three-way blocks remote-only constant replacement', () => assert.throws(() => validate({ localSource: fixture + remoteOnlyDefinitions.replace('"remote-only-sheet"', '"wrong-sheet"'), baselines: [mainBaseline, { source: oldRemote + remoteOnlyDefinitions, label: 'remote HEAD' }] }), /protected desktop constant changed: REMOTE_DESKTOP_SHEET/))

const psFile = path.join(__dirname, 'deploy-apps-script.ps1')
const ps = fs.readFileSync(psFile, 'utf8')
pass('dry-run modes present', () => {
 assert.match(ps, /\[switch\]\$ValidateOnly/)
 assert.match(ps, /\[switch\]\$PreflightOnly/)
 assert.ok(ps.indexOf('if ($ValidateOnly) {') < ps.lastIndexOf('Initialize-ExistingClaspAuthorization'))
 assert.ok(ps.indexOf('if ($PreflightOnly) {') < ps.indexOf("-Method Put -Path '/content'"))
})
pass('fixed deployment only; no server initializer', () => {
 assert.match(ps, /-Method Put -Path "\/deployments\/\$deploymentId"/)
 assert.doesNotMatch(ps, /-Method Post -Path ['"]\/deployments['"]|\brun-function\b|\binitialSetup\b/)
 assert.match(ps, /AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/)
})
pass('concurrency and immutable source guards', () => {
 assert.match(ps, /merge-base.*--is-ancestor/)
 assert.match(ps, /Assert-SameSnapshot -Before \$before -After \$current/)
 assert.match(ps, /Get-OriginMainCommit\) -ne \$mainCommit/)
 assert.match(ps, /Get-ContentFingerprint -Content \$versionContent\) -ne \$localHash/)
})
pass('deployment source uses plain .NET strings, not Get-Content ETS values', () => {
 assert.match(ps, /\$plainSource\s*=\s*\[System\.IO\.File\]::ReadAllText\(\$file\.FullName,\s*\[System\.Text\.Encoding\]::UTF8\)/)
 assert.match(ps, /source\s*=\s*\$plainSource/)
 assert.doesNotMatch(ps, /source\s*=\s*Get-Content/)
})
if (process.platform === 'win32') {
 pass('Windows PowerShell parser', () => {
  const command = `$errors=$null;$tokens=$null;$null=[System.Management.Automation.Language.Parser]::ParseFile('${psFile.replace(/'/g, "''")}',[ref]$tokens,[ref]$errors);if($errors.Count){throw 'PowerShell parse failed'};Write-Output 'PowerShell parse passed'`
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 30000 })
  assert.match(output, /PowerShell parse passed/)
 })
 pass('PowerShell snapshot/file preservation guards execute', () => {
  const command = `
   $ErrorActionPreference='Stop';Set-StrictMode -Version Latest;
   $tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${psFile.replace(/'/g, "''")}',[ref]$tokens,[ref]$errors);
   $names=@('Get-ContentFingerprint','Assert-SameSnapshot','Assert-RemoteFilesPreserved','Get-CodeSource');
   foreach($fn in $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false)){if($fn.Name -in $names){. ([scriptblock]::Create($fn.Extent.Text))}};
   $before=@{version=67;deployedHash='a';headHash='b'};
   Assert-SameSnapshot -Before $before -After $before;
   foreach($changed in @(@{version=68;deployedHash='a';headHash='b'},@{version=67;deployedHash='c';headHash='b'},@{version=67;deployedHash='a';headHash='c'})){
    $blocked=$false;try{Assert-SameSnapshot -Before $before -After $changed}catch{$blocked=$true};if(-not $blocked){throw 'Snapshot change was not blocked'}
   };
   $file=@{name='Code';type='SERVER_JS';source='function example() {}'};$local=@{files=@($file)};
   if((Get-CodeSource -Content $local) -ne $file.source){throw 'Code read failed'};
   Assert-RemoteFilesPreserved -Local $local -Remote $local;
   $blocked=$false;try{Assert-RemoteFilesPreserved -Local $local -Remote @{files=@(@{name='Lost';type='SERVER_JS';source='function lost() {}'})}}catch{$blocked=$true};if(-not $blocked){throw 'Remote file removal was not blocked'};
   $crlf=@{files=@(@{name='Code';type='SERVER_JS';source=($file.source+[char]13+[char]10)})};
   if((Get-ContentFingerprint -Content $local) -ne (Get-ContentFingerprint -Content $crlf)){throw 'Line-ending normalization failed'};
   $manifest=@{name='appsscript';type='JSON';source='{}'};
   $localPair=@{files=@($manifest,$file)};
   $remotePair=[pscustomobject]@{files=@([pscustomobject]$file,[pscustomobject]$manifest)};
   if((Get-ContentFingerprint -Content $localPair) -ne (Get-ContentFingerprint -Content $remotePair)){throw 'Hashtable/PSCustomObject order changed the fingerprint'};
   $reversedPair=@{files=@($file,$manifest)};
   if((Get-ContentFingerprint -Content $localPair) -ne (Get-ContentFingerprint -Content $reversedPair)){throw 'Input file order changed the fingerprint'};
   $changedPair=[pscustomobject]@{files=@([pscustomobject]@{name='Code';type='SERVER_JS';source='function changed() {}'},[pscustomobject]$manifest)};
   if((Get-ContentFingerprint -Content $localPair) -eq (Get-ContentFingerprint -Content $changedPair)){throw 'Changed source was not detected'};
   $blocked=$false;try{Get-ContentFingerprint -Content @{files=@($file,$file)}}catch{$blocked=$true};if(-not $blocked){throw 'Duplicate file identities were not blocked'};
   Write-Output 'Snapshot tests passed'`
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 30000 })
  assert.match(output, /Snapshot tests passed/)
 })
 pass('PowerShell 5 upload JSON remains bounded plain strings', () => {
  const serverDir = path.join(__dirname, '..', 'server')
  const command = `
   $ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest;
   $tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${psFile.replace(/'/g, "''")}',[ref]$tokens,[ref]$errors);
   $serverDir='${serverDir.replace(/'/g, "''")}';
   $fn=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-LocalContent'},$false)[0];
   . ([scriptblock]::Create($fn.Extent.Text));
   $payload=Get-LocalContent;$sourceBytes=0;
   foreach($entry in $payload.files){
    if($entry.source -isnot [string]){throw 'Source is not a plain string'};
    foreach($metadataName in @('PSPath','PSDrive','PSProvider','ReadCount')){if($entry.source.PSObject.Properties.Match($metadataName).Count -gt 0){throw 'Source has extended filesystem metadata'}};
    $sourceBytes += [Text.Encoding]::UTF8.GetByteCount($entry.source);
   };
   $timer=[Diagnostics.Stopwatch]::StartNew();$json=$payload|ConvertTo-Json -Depth 30 -Compress;$timer.Stop();
   $jsonBytes=[Text.Encoding]::UTF8.GetByteCount($json);
   if($timer.ElapsedMilliseconds -gt 5000){throw 'Upload payload serialization is too slow'};
   if($jsonBytes -gt ($sourceBytes*4+8192)){throw 'Upload payload expanded beyond source size'};
   $decoded=$json|ConvertFrom-Json;
   if(@($decoded.files|Where-Object{$_.source -isnot [string]}).Count -gt 0){throw 'Upload JSON source became an ETS object'};
   [pscustomobject]@{files=$payload.files.Count;bytes=$jsonBytes;elapsedMs=$timer.ElapsedMilliseconds}|ConvertTo-Json -Compress`
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 15000 })
  const summary = JSON.parse(output.trim())
  assert.ok(summary.files >= 2)
  assert.ok(summary.bytes > 0)
  assert.ok(summary.elapsedMs <= 5000)
 })
}
const realSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'Code.gs'), 'utf8')
pass('real Code.gs syntax', () => inspectSource(realSource, 'real'))
if (inspectSource(realSource, 'real').serviceVersion >= 39) pass('real integrated source contract', () => validate({ localSource: realSource }))
const realMainSource = execFileSync('git', ['show', 'origin/main:ungcheon-school-helper/server/Code.gs'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1024 * 1024 })
const realMainBaseline = { source: realMainSource, role: 'origin-main', label: 'origin/main' }
pass('real desktop definitions remain equal to latest main', () => assert.equal(validate({ localSource: realSource, baselines: [realMainBaseline] }).desktopBodyProtection, true))
pass('real listStaffChecklists return-empty mutation blocked', () => {
 const current = inspectSource(realSource, 'real').functions.get('listStaffChecklists_')
 assert.ok(current)
 const modified = realSource.replace(current, 'function listStaffChecklists_(body) { return []; }')
 assert.throws(() => validate({ localSource: modified, baselines: [realMainBaseline] }), /protected desktop function changed: listStaffChecklists_/)
})
pass('real STAFF_CHECKLISTS_SHEET mutation blocked', () => {
 const modified = realSource.replace(/(const\s+STAFF_CHECKLISTS_SHEET\s*=\s*)'[^']*'/, "$1'wrong-sheet'")
 assert.notEqual(modified, realSource)
 assert.throws(() => validate({ localSource: modified, baselines: [realMainBaseline] }), /protected desktop constant changed: STAFF_CHECKLISTS_SHEET/)
})
console.log(`Apps Script deployment guard: ${checks} checks passed.`)
