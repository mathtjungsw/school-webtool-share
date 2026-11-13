/** Native Google services acceptance. All targets pinned to the isolated project
 * and synthetic workbook; production configuration and data are inaccessible. */
function probeNativeFirebasePrimary() {
  if(ScriptApp.getScriptId()!=='16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9')throw new Error('PROBE_PROJECT_MISMATCH');
  var props=PropertiesService.getScriptProperties(),id=props.getProperty('SYNTHETIC_NATIVE_ROUTE_BOOK_V1');
  if(id!=='1n4PZxxSP8rqp-n59V3mU2-gBBC3sqLaJLu2WY0ZGAPM')throw new Error('PROBE_BOOK_MISMATCH');
  var book=SpreadsheetApp.openById(id),keys=['UNG_MIGRATION_PRIMARY_V1','UNG_MIGRATION_OPERATIONS_V1','UNG_MIGRATION_REPLICA_STATE_V1','UNG_MIGRATION_TRACKING_V1','UNG_MIGRATION_CUTOVER_CHECK_V1'],restoreKey='SYNTHETIC_PRIMARY_RESTORE_V1';
  function restore(saved){keys.forEach(function(k){if(saved[k]===null)props.deleteProperty(k);else props.setProperty(k,saved[k]);});}
  var interrupted=props.getProperty(restoreKey);if(interrupted){restore(JSON.parse(interrupted));props.deleteProperty(restoreKey);}
  var saved={};keys.forEach(function(k){saved[k]=props.getProperty(k);});props.setProperty(restoreKey,JSON.stringify(saved));
  var originalBook=migrationOperationsBook_,start=Date.now(),output;
  try {
    keys.forEach(function(k){props.deleteProperty(k);});migrationProbeNativeApp_.initialize(book);
    migrationOperationsBook_=function(c){if(c.sourceBookId!==id||c.schoolId!=='migration-probe-primary-v1')throw new Error('PROBE_TARGET_MISMATCH');return book;};
    var tracking={schemaVersion:1,enabled:true,sourceBookId:id};props.setProperty('UNG_MIGRATION_TRACKING_V1',JSON.stringify(tracking));
    // This row deliberately mixes types that ordinary setValues can coerce.
    var sheet=book.getSheetByName('공유링크'),typedId='native-primary-types-v1',rows=sheet.getDataRange().getValues(),typedRow=0;
    for(var ri=1;ri<rows.length;ri++)if(rows[ri][0]===typedId)typedRow=ri+1;
    if(!typedRow)typedRow=sheet.getLastRow()+1;
    var typed=[[typedId,'00012','TRUE','https://example.com/native-primary-types',false,12.5,new Date('2026-11-12T15:00:00.000Z')]];
    sheet.getRange(typedRow,1,1,7).setNumberFormats([['@','@','@','@','General','0.00','yyyy-mm-dd hh:mm:ss.000']]);sheet.getRange(typedRow,1,1,7).setValues(typed);SpreadsheetApp.flush();
    if(migrationHash_(sheet.getRange(typedRow,1,1,7).getValues()[0])!==migrationHash_(typed[0]))throw new Error('PROBE_TYPED_SEED_MISMATCH');
    var ref=migrationFreezeBaseline_(book,undefined,tracking),repo=migrationRepository_({enabled:true,projectId:'ungcheon-school-helper',schoolId:'migration-probe-primary-v1',environment:'PRIMARY',sourceOfTruth:'FIRESTORE'}),source=migrationReplicaSource_(book,ref,tracking);
    console.log(JSON.stringify({phase:'BASELINE_READY',dataset:'SYNTHETIC_ONLY'}));
    var archive;do{archive=migrationRunReplica_(repo,source,ref,{maxSteps:40,maxMillis:40000});}while(archive.status==='PROGRESS');
    if(archive.status!=='IDLE')throw new Error('PROBE_ARCHIVE_INCOMPLETE');
    while(migrationServingStep_(repo,ref).status!=='IDLE'){}
    var config={schemaVersion:1,sourceBookId:id,projectId:'ungcheon-school-helper',schoolId:'migration-probe-primary-v1',baselineRef:ref,preparedAt:Date.now()-700000,notBefore:Date.now()-100000,deploymentVersion:999,sourceFingerprint:migrationHash_('SYNTHETIC_PRIMARY_ONLY')};
    migrationOperationsSaveConfig_(config);var primary=migrationPreparePrimary_(config,config),rejected=false;
    try{migrationFreezePrimarySource_();}catch(e){if(e.code==='MIGRATION_DRAIN_NOT_FINISHED')rejected=true;else throw e;}
    if(!rejected)throw new Error('PROBE_DRAIN_GATE_FAILED');
    primary.preparedAt-=700000;primary.notBefore-=700000;migrationPrimarySave_(primary);migrationFreezePrimarySource_();
    while(migrationVerifyPrimaryStep_().status!=='COMPLETE'){}
    if(migrationActivatePrimary_().activeBackend!=='FIRESTORE')throw new Error('PROBE_ACTIVATION_FAILED');
    function post(body){var result=JSON.parse(migrationProbeNativeApp_.request(book,Object.assign({staffToken:'SYNTHETIC_NATIVE_SESSION'},body)).getContent());if(!result.ok)throw new Error('PROBE_BUSINESS_REQUEST_FAILED:'+String(result.error));return result;}
    var request={action:'addLink',operationId:'native-primary-create-'+primary.epoch,title:'Synthetic primary acceptance',department:'Test',url:'https://example.com/primary/'+primary.epoch};
    var before=sheet.getLastRow(),created=post(request);if(migrationHash_(created)!==migrationHash_(post(request))||sheet.getLastRow()!==before)throw new Error('PROBE_WRITE_RETRY_OR_ISOLATION_FAILED');
    var cold=Date.now();post({action:'listLinks'});cold=Date.now()-cold;var requests=repo.metrics.requests,warm=Date.now();post({action:'listLinks'});warm=Date.now()-warm;
    console.log(JSON.stringify({phase:'PRIMARY_WRITE_VERIFIED',dataset:'SYNTHETIC_ONLY',coldMillis:cold,warmMillis:warm}));
    while(migrationBackupStep_(false).status!=='COMPLETE'){}
    if(sheet.getLastRow()!==before+1)throw new Error('PROBE_BACKUP_CREATE_FAILED');
    post({action:'deleteLink',operationId:'native-primary-delete-'+primary.epoch,id:created.data.id,adminPassword:'SYNTHETIC_ADMIN_ONLY'});
    var expected=migrationHash_(post({action:'listLinks'}));migrationBeginReturn_();
    var denied=JSON.parse(migrationProbeNativeApp_.request(book,Object.assign({staffToken:'SYNTHETIC_NATIVE_SESSION'},request,{operationId:'frozen-'+primary.epoch})).getContent());
    if(denied.ok)throw new Error('PROBE_FROZEN_WRITE_ALLOWED');
    var returned;do{returned=migrationCompleteReturn_();}while(returned.status==='PROGRESS');
    if(returned.activeBackend!=='SHEETS'||migrationHash_(post({action:'listLinks'}))!==expected||sheet.getLastRow()!==before)throw new Error('PROBE_RETURN_MISMATCH');
    var actual=sheet.getDataRange().getValues().filter(function(r){return r[0]===typedId;});
    if(actual.length!==1||migrationHash_(actual[0])!==migrationHash_(typed[0]))throw new Error('PROBE_TYPED_RETURN_MISMATCH');
    output={ok:true,dataset:'SYNTHETIC_ONLY',checks:['earlyDrainRejected','all22ResourcesVerified','primaryCreate','receiptReplay','sourceUnchangedUntilBackup','cachedRead','changedResourceBackup','primaryDelete','frozenWriteRejected','verifiedSheetsReturn','leadingZerosBooleanNumberDatePreserved'],productionChanged:false,realDrainWaitPerformed:false,elapsedMillis:Date.now()-start,coldMillis:cold,warmMillis:warm};
  }finally{migrationOperationsBook_=originalBook;restore(saved);keys.forEach(function(k){if(props.getProperty(k)!==saved[k])throw new Error('PROBE_CONFIG_RESTORE_FAILED');});props.deleteProperty(restoreKey);}
  console.log(JSON.stringify(output));return output;
}
function staffRequire_(body){return migrationProbeNativeApp_.authorize(body);}
function probeNativeReturnLiteralTypes() {
  if(ScriptApp.getScriptId()!=='16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9')throw new Error('PROBE_PROJECT_MISMATCH');
  var id=PropertiesService.getScriptProperties().getProperty('SYNTHETIC_NATIVE_ROUTE_BOOK_V1');
  if(id!=='1n4PZxxSP8rqp-n59V3mU2-gBBC3sqLaJLu2WY0ZGAPM')throw new Error('PROBE_BOOK_MISMATCH');
  var book=SpreadsheetApp.openById(id),name='_SYNTH_RETURN_LITERALS_V1',sheet=book.getSheetByName(name)||book.insertSheet(name);
  var strings=['00012','TRUE','FALSE','2026-11-13','1e3',"'literal","''literal",'=1+1','+82123','한글'],capture={schemaVersion:1,resource:'links',present:true,headers:['id','value'],records:[]};
  strings.forEach(function(value,i){capture.records.push({sourceId:'synthetic-'+i,sortOrder:i,payload:migrationEncode_({cells:['synthetic-'+i,value],formulas:['','']}),isDeleted:false});});
  var proxy={getSheetByName:function(n){if(n!=='공유링크')throw new Error('PROBE_TARGET_MISMATCH');return sheet;}};
  migrationWithSourceLock_(function(){migrationWriteCaptureToSheet_(proxy,capture);});
  var actual=migrationCaptureResource_(proxy,null,'links'),values=sheet.getRange(2,2,strings.length,1).getValues().map(function(r){return r[0];}),mismatches=[];
  strings.forEach(function(v,i){if(values[i]!==v)mismatches.push({index:i,expected:v,actual:values[i]});});
  if(mismatches.length){console.log(JSON.stringify({ok:false,dataset:'SYNTHETIC_ONLY',mismatches:mismatches}));throw new Error('PROBE_LITERAL_TYPE_MISMATCH');}
  if(migrationContentDigest_(actual)!==migrationContentDigest_(capture))throw new Error('PROBE_LITERAL_CAPTURE_MISMATCH');
  console.log(JSON.stringify({ok:true,dataset:'SYNTHETIC_ONLY',checks:['literalApostrophes','formulaLikeStrings','numericLikeStrings','dateLikeStrings','booleansAsText','KoreanText'],productionChanged:false}));
}
