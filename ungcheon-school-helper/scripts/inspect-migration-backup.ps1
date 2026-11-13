[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BackupDirectory,
  [Parameter(Mandatory=$true)][string]$ReportPath
)
$ErrorActionPreference = 'Stop'
# Read the encrypted export only in memory. Never print cell contents or keys.
$catalog = @{
  '공유링크'=@('links','id'); '공지'=@('notices','id'); '기능개선요청'=@('featureRequests','id')
  '시간표정보'=@('teacherTimetableMeta',''); '시간표'=@('teacherRows','')
  '학생시간표정보'=@('studentTimetableMeta',''); '학생시간표'=@('studentRows','studentId')
  '교원명렬정보'=@('staffMeta',''); '교원명렬'=@('staff','id')
  '학생명렬정보'=@('studentsMeta',''); '학생명렬'=@('students','studentId')
  '업무체크리스트'=@('checklists','id'); '업무체크응답'=@('checklistResponses','')
  '위원회명단'=@('committees','committeeId'); '위원회일정'=@('committeeEvents','id')
  '교환대강반영'=@('timetableChanges','id'); '일일시간표예외'=@('timetableOverrides','id')
  '일일시간표예외이력'=@('timetableOverrideHistory','id'); 'NEIS동기화정보'=@('neisMeta','')
  'NEIS급식'=@('meals',''); 'NEIS학사일정'=@('schoolSchedules',''); 'NEIS학급시간표'=@('classTimetables','')
}
function Read-ArchiveXml($Archive, [string]$Name) {
  $entry=$Archive.GetEntry($Name)
  if(-not $entry -or $entry.Length -gt 50000000){throw 'Unexpected workbook structure or size.'}
  $stream=$entry.Open()
  $settings=[Xml.XmlReaderSettings]::new(); $settings.DtdProcessing='Prohibit'; $settings.XmlResolver=$null
  $reader=[Xml.XmlReader]::Create($stream,$settings)
  try {$doc=[Xml.XmlDocument]::new();$doc.XmlResolver=$null;$doc.Load($reader);return ,$doc}
  finally {$reader.Dispose();$stream.Dispose()}
}
function Read-Cell($Cell,$Strings) {
  $value=$Cell.SelectSingleNode('./*[local-name()="v"]')
  $raw=if($value){$value.InnerText}else{''}
  switch($Cell.GetAttribute('t')) {
    's' {if($raw -notmatch '^\d+$' -or [int]$raw -ge $Strings.Count){throw 'Invalid string reference.'}; return [string]$Strings[[int]$raw]}
    'inlineStr' {return (($Cell.SelectNodes('./*[local-name()="is"]//*[local-name()="t"]') | ForEach-Object {$_.InnerText}) -join '')}
    default {return $raw}
  }
}
$clear=$null;$archive=$null;$memory=$null
try {
  $manifest=Get-Content -LiteralPath (Join-Path $BackupDirectory 'manifest.json') -Raw | ConvertFrom-Json
  $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $BackupDirectory 'source.xlsx.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($clear)).ToLowerInvariant()
  if($digest -ne $manifest.sha256 -or $clear.Length -ne $manifest.bytes){throw 'Backup checksum mismatch.'}
  $memory=[IO.MemoryStream]::new($clear,$false)
  $archive=[IO.Compression.ZipArchive]::new($memory,[IO.Compression.ZipArchiveMode]::Read)
  $strings=[Collections.Generic.List[string]]::new()
  if($archive.GetEntry('xl/sharedStrings.xml')) {
    $shared=Read-ArchiveXml $archive 'xl/sharedStrings.xml'
    foreach($item in $shared.SelectNodes('//*[local-name()="si"]')) {
      $strings.Add((($item.SelectNodes('.//*[local-name()="t"]') | ForEach-Object {$_.InnerText}) -join ''))
    }
  }
  $relationships=Read-ArchiveXml $archive 'xl/_rels/workbook.xml.rels'
  $targets=@{}
  foreach($rel in $relationships.DocumentElement.ChildNodes) {
    if($rel.GetAttribute('TargetMode') -eq 'External'){continue}
    $target=$rel.GetAttribute('Target')
    if($target.Contains('..')){throw 'Unexpected archive target.'}
    $targets[$rel.GetAttribute('Id')]=if($target.StartsWith('/')){$target.TrimStart('/')}else{'xl/'+$target}
  }
  $book=Read-ArchiveXml $archive 'xl/workbook.xml'
  $reportSheets=[Collections.Generic.List[object]]::new();$ordinal=0
  foreach($sheet in $book.SelectNodes('//*[local-name()="sheets"]/*[local-name()="sheet"]')) {
    $ordinal++;$sheetName=$sheet.GetAttribute('name');$known=$catalog.ContainsKey($sheetName)
    $relId=$sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    if(-not $targets.ContainsKey($relId)){throw 'Missing worksheet relationship.'}
    $xml=Read-ArchiveXml $archive $targets[$relId]
    $headers=@{};$keyColumn='';$keys=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $dataRows=0;$populatedCells=0;$formulas=0;$errors=0;$lastRow=0;$maxColumns=0;$maxCellBytes=0;$duplicateKeys=0;$missingKeys=0
    $types=@{string=0;numeric=0;boolean=0;error=0;other=0}
    foreach($row in $xml.SelectNodes('//*[local-name()="sheetData"]/*[local-name()="row"]')) {
      $rowNumber=[int]$row.GetAttribute('r');$rowPopulated=$false;$rowKey=''
      foreach($cell in $row.SelectNodes('./*[local-name()="c"]')) {
        $ref=$cell.GetAttribute('r');if($ref -notmatch '^([A-Z]+)[1-9][0-9]*$'){throw 'Invalid cell reference.'}
        $column=$Matches[1];$number=0;foreach($char in $column.ToCharArray()){$number=$number*26+([int]$char-64)}
        $value=Read-Cell $cell $strings
        $formula=$cell.SelectSingleNode('./*[local-name()="f"]')
        if($rowNumber -eq 1){$headers[$column]=$value;if($known -and $catalog[$sheetName][1] -and $value -ceq $catalog[$sheetName][1]){$keyColumn=$column}}
        if($column -ceq $keyColumn){$rowKey=$value}
        if($value -eq '' -and -not $formula){continue}
        $rowPopulated=$true;$populatedCells++;$lastRow=[Math]::Max($lastRow,$rowNumber);$maxColumns=[Math]::Max($maxColumns,$number)
        $maxCellBytes=[Math]::Max($maxCellBytes,[Text.Encoding]::UTF8.GetByteCount($value))
        if($formula){$formulas++}
        switch($cell.GetAttribute('t')) {
          {$_ -in @('s','inlineStr','str')} {$types.string++}
          {$_ -in @('','n')} {$types.numeric++}
          'b' {$types.boolean++}
          'e' {$types.error++;$errors++}
          default {$types.other++}
        }
      }
      if($rowNumber -gt 1 -and $rowPopulated) {
        $dataRows++
        if($keyColumn){if($rowKey -eq ''){$missingKeys++}elseif(-not $keys.Add($rowKey)){$duplicateKeys++}}
      }
    }
    $safeName=if($known -or $sheetName -in @('시트1','교원명렬_20261008_보관')){$sheetName}else{"unclassified-sheet-$ordinal"}
    $reportSheets.Add([pscustomobject][ordered]@{
      sheetName=$safeName;resource=$(if($known){$catalog[$sheetName][0]}else{$null});classified=$known
      dataRows=$dataRows;lastPopulatedRow=$lastRow;populatedColumns=$maxColumns;populatedCells=$populatedCells
      formulaCells=$formulas;cachedErrorCells=$errors;xlsxCellTypes=$types;maxCellUtf8Bytes=$maxCellBytes
      worksheetXmlBytes=$archive.GetEntry($targets[$relId]).Length
      candidateKey=$(if($known -and $catalog[$sheetName][1]){$catalog[$sheetName][1]}else{$null})
      candidateKeyFound=[bool]$keyColumn;duplicateCandidateKeys=$(if($keyColumn){$duplicateKeys}else{$null})
      missingCandidateKeys=$(if($keyColumn){$missingKeys}else{$null});visibility=$sheet.GetAttribute('state')
    })
  }
  $report=[ordered]@{
    schemaVersion=1;inspectedAt=[DateTime]::UtcNow.ToString('o');source='PRIVATE_PRESERVED_SHEET_XLSX_EXPORT'
    backupCreatedAt=$manifest.createdAt;backupBytes=$clear.Length;backupSha256=$digest;decryptVerified=$true
    consistentMigrationSnapshot=$false;sheetCount=$reportSheets.Count
    missingCatalogSheets=@($catalog.Keys | Where-Object {$_ -notin $reportSheets.sheetName} | Sort-Object)
    sheets=$reportSheets.ToArray()
    limitations=@('Counts describe the preserved copy, not a live revision or R0 snapshot.','XLSX storage types are not Apps Script getValues types; numeric dates require live schema validation.','Candidate keys are checked without publishing their values; missing mappings remain unresolved.','Apps Script properties, sessions, deployments, triggers and revision history are not backed up by the XLSX export.','Only the internal workbook is included; external sheets remain their own sources of truth.')
  }
  $json=$report | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath),$json+"`n",[Text.UTF8Encoding]::new($false))
  Write-Output ('Verified encrypted backup; sheets={0}, data rows={1}, formulas={2}. Report contains no cell values.' -f $reportSheets.Count,($reportSheets | Measure-Object dataRows -Sum).Sum,($reportSheets | Measure-Object formulaCells -Sum).Sum)
} catch {
  throw 'Backup inspection failed. Cell values and exception details are intentionally omitted; no source was modified.'
} finally {
  if($archive){$archive.Dispose()};if($memory){$memory.Dispose()}
  if($clear){[Array]::Clear($clear,0,$clear.Length)}
  $strings=$null;$xml=$null;$shared=$null;$value=$null;$keys=$null
}
