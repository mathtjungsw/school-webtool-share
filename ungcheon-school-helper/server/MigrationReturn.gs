/** Changed-resource Sheets backup and explicit verified return. A partial backup
 * is never a serving backend. Source IDs used only by the migration journal may
 * differ after return; every user cell, type, formula and row position must match. */
function migrationContentDigest_(capture) {
  migrationAssertCapture_(capture);
  return migrationHash_({schemaVersion:1,resource:capture.resource,present:capture.present,headers:capture.headers,
    records:capture.records.map(function(row){return {sortOrder:row.sortOrder,payload:row.payload,isDeleted:row.isDeleted};})});
}
function migrationWriteCaptureToSheet_(book,capture) {
  migrationAssertCapture_(capture);
  var item=migrationCatalog_().filter(function(x){return x.resource===capture.resource;})[0],sheet=book.getSheetByName(item.sheetName);
  // Existing baseline resources are never deleted. An absent resource remains
  // absent; application writes cannot drop a sheet through the snapshot facade.
  if(!capture.present){if(sheet)throw migrationError_('MIGRATION_RETURN_UNEXPECTED_SHEET');return;}
  if(!sheet)sheet=book.insertSheet(item.sheetName);
  var columns=capture.headers.length,rows=capture.records.reduce(function(n,r){return Math.max(n,r.sortOrder+2);},columns?1:0);
  if(columns>256||rows>100000)throw migrationError_('MIGRATION_RETURN_SIZE_LIMIT');
  var values=Array.from({length:rows},function(){return Array(columns).fill('');}),formats=Array.from({length:rows},function(){return Array(columns).fill('@');});
  if(rows)values[0]=capture.headers.slice();
  capture.records.forEach(function(record){
    var payload=migrationDecode_(record.payload);if(payload.formulas.some(Boolean))throw migrationError_('MIGRATION_PRIMARY_FORMULA_UNSUPPORTED');
    values[record.sortOrder+1]=payload.cells;
    formats[record.sortOrder+1]=payload.cells.map(function(v){return v instanceof Date?'yyyy-mm-dd hh:mm:ss.000':typeof v==='string'?'@':typeof v==='number'?'0.###############':'General';});
  });
  if(sheet.getMaxRows()<Math.max(1,rows))sheet.insertRowsAfter(sheet.getMaxRows(),rows-sheet.getMaxRows());
  if(sheet.getMaxColumns()<Math.max(1,columns))sheet.insertColumnsAfter(sheet.getMaxColumns(),columns-sheet.getMaxColumns());
  // Clear obsolete tails so removals cannot reappear after switching back.
  if(sheet.getLastRow()&&sheet.getLastColumn())sheet.getDataRange().clearContent();
  for(var start=0;start<rows;start+=200){
    var count=Math.min(200,rows-start),range=sheet.getRange(start+1,1,count,columns);
    range.setNumberFormats(formats.slice(start,start+count));
    range.setValues(values.slice(start,start+count).map(function(row){return row.map(function(v){return typeof v==='string'&&/^[=']/.test(v)?"'"+v:v;});}));
  }
  SpreadsheetApp.flush();
}
function migrationBackupStep_(forceVerify) {
  return migrationWithSourceLock_(function(){
    var c=migrationPrimaryConfig_();if(!migrationPrimaryServing_(c))return {status:'NOT_PRIMARY'};
    var repo=migrationPrimaryRepository_(c),document=migrationPrimaryRoot_(repo,c),root=document.data,book=migrationOperationsBook_(c),store=migrationSheetsStore_(book);
    var path=migrationPrimaryPath_(c)+'/sheetBackups/current',saved=repo.get(path),state=saved?saved.data:{schemaVersion:1,resources:{},verifiedRevision:null};
    var next=root.resources.filter(function(h){var previous=state.resources[h.resource];return !previous||previous.digest!==h.digest||(forceVerify&&(previous.verifiedRevision!==root.revision||previous.verifiedPhase!==root.phase));})[0];
    if(!next){
      if(state.verifiedRevision!==root.revision){state.verifiedRevision=root.revision;state.verifiedAt=new Date().toISOString();repo.commit([{path:path,data:state,updateTime:saved.updateTime}]);}
      return {status:'COMPLETE',revision:root.revision,resources:root.resources.length};
    }
    var target=migrationReadServingResource_(repo,next),before=migrationCaptureResource_(book,store,next.resource),expected=migrationContentDigest_(target);
    if(migrationContentDigest_(before)!==expected){
      // Preserve the exact pre-replacement capture before the first native write.
      // Retrying a partial write creates another immutable before-image, while
      // the original baseline and prior images remain addressable forever.
      var beforeDigest=migrationStageServing_(repo,before),backupPath=migrationPrimaryPath_(c)+'/returnBeforeImages/'+migrationHash_([next.resource,beforeDigest]);
      if(!repo.get(backupPath))repo.commit([{path:backupPath,data:{resource:next.resource,digest:beforeDigest,targetDigest:next.digest,revision:root.revision},createOnly:true}]);
      migrationWriteCaptureToSheet_(book,target);
    }
    var after=migrationCaptureResource_(book,store,next.resource);
    if(migrationContentDigest_(after)!==expected)throw migrationError_('MIGRATION_RETURN_READBACK_MISMATCH');
    state.resources[next.resource]={digest:next.digest,contentDigest:expected,verifiedRevision:root.revision,verifiedPhase:root.phase};state.verifiedRevision=null;
    repo.commit([{path:path,data:state,updateTime:saved?saved.updateTime:undefined,createOnly:!saved}]);
    return {status:'PROGRESS',resource:next.resource,revision:root.revision,changed:migrationContentDigest_(before)!==expected,checkedResources:Object.keys(state.resources).length};
  });
}
function migrationBeginReturn_() {
  return migrationWithSourceLock_(function(){
    var c=migrationPrimaryConfig_();if(!c||!migrationPrimaryServing_(c))throw migrationError_('MIGRATION_NOT_PRIMARY');
    var repo=migrationPrimaryRepository_(c),root=migrationPrimaryRoot_(repo,c);
    // The root precondition also fences any in-flight writer which read PRIMARY.
    if(root.data.phase!=='FROZEN')repo.commit([{path:migrationPrimaryPath_(c),data:Object.assign({},root.data,{phase:'FROZEN'}),updateTime:root.updateTime}]);
    c.phase='RETURNING';migrationPrimarySave_(c);
    return {status:'RETURNING',revision:root.data.revision};
  });
}
function migrationCompleteReturn_() {
  return migrationWithSourceLock_(function(){
    var c=migrationPrimaryConfig_();if(c&&c.phase==='SHEETS_RETURNED')return migrationPrimaryStatus_();
    if(!c||c.phase!=='RETURNING')throw migrationError_('MIGRATION_RETURN_NOT_STARTED');
    var result=migrationBackupStep_(true);if(result.status!=='COMPLETE')return result;
    var repo=migrationPrimaryRepository_(c),root=migrationPrimaryRoot_(repo,c).data;
    if(root.phase!=='FROZEN'||root.revision!==result.revision)throw migrationError_('MIGRATION_RETURN_ROOT_CHANGED');
    var props=PropertiesService.getScriptProperties(),versions=migrationBackendVersionProperties_(root.properties);
    Object.keys(versions).forEach(function(key){props.setProperty(key,versions[key]);if(props.getProperty(key)!==versions[key])throw migrationError_('MIGRATION_RETURN_PROPERTY_MISMATCH');});
    // Old forward history no longer describes the shadow Sheets. Keep the
    // journal, disable the old mirror, and require a new baseline before reuse.
    var state=migrationOperationsState_();state.invalidated=true;state.paused=true;migrationOperationsSaveState_(state);
    c.phase='SHEETS_RETURNED';c.returnedRevision=root.revision;c.returnedAt=new Date().toISOString();migrationPrimarySave_(c);
    return migrationPrimaryStatus_();
  });
}
function migrationBackupBatch_() {
  var start=Date.now(),result,steps=0;
  do{result=migrationBackupStep_(false);steps++;}while(result.status==='PROGRESS'&&steps<6&&Date.now()-start<40000);
  return {steps:steps,elapsedMillis:Date.now()-start,result:result};
}
