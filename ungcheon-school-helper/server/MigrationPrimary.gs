/** Explicit owner cutover. Immutable resource snapshots, atomic write receipts,
 * and one shared writer lock across both backends. Never fall back to stale data. */
function migrationPrimaryConfig_() {
  var text=PropertiesService.getScriptProperties().getProperty('UNG_MIGRATION_PRIMARY_V1');
  if(!text)return null;
  var c;try{c=JSON.parse(text);}catch(_){throw migrationError_('MIGRATION_PRIMARY_CONFIG_INVALID');}
  if(c.schemaVersion!==1 || ['PREPARING','DRAINING','FIRESTORE','RETURNING','SHEETS_RETURNED'].indexOf(c.phase)<0 ||
    !/^[a-f0-9]{64}$/.test(c.epoch||'') || !/^[a-f0-9]{64}$/.test(c.baselineRef||'') || !/^[\w-]+$/.test(c.sourceBookId||'') ||
    !Number.isSafeInteger(c.notBefore) || !Number.isSafeInteger(c.preparedAt) || c.notBefore<c.preparedAt+600000)throw migrationError_('MIGRATION_PRIMARY_CONFIG_INVALID');
  return c;
}
function migrationPrimarySave_(config) {
  PropertiesService.getScriptProperties().setProperty('UNG_MIGRATION_PRIMARY_V1',JSON.stringify(config));
  if(migrationHash_(migrationPrimaryConfig_())!==migrationHash_(config))throw migrationError_('MIGRATION_CONFIG_NOT_CONFIRMED');
}
function migrationPrimaryRepository_(config) {
  return migrationRepository_({enabled:true,projectId:config.projectId,schoolId:config.schoolId,environment:'PRIMARY',sourceOfTruth:'FIRESTORE'});
}
function migrationPrimaryPath_(config){return 'primaryEpochs/'+config.epoch;}
function migrationPrimaryRoot_(repo,config) {
  var document=repo.get(migrationPrimaryPath_(config)),r=document&&document.data;
  if(!r || r.schemaVersion!==1 || ['PRIMARY','FROZEN'].indexOf(r.phase)<0 || r.sourceOfTruth!=='FIRESTORE' || r.sourceBookHash!==migrationHash_(config.sourceBookId) ||
    r.baselineRef!==config.baselineRef || !Number.isSafeInteger(r.revision) || r.revision<0 || !Array.isArray(r.resources) || r.resources.length!==migrationCatalog_().length)throw migrationError_('MIGRATION_PRIMARY_ROOT_INVALID');
  migrationCatalog_().forEach(function(item){if(r.resources.filter(function(h){return h.resource===item.resource&&/^[a-f0-9]{64}$/.test(h.digest||'');}).length!==1)throw migrationError_('MIGRATION_PRIMARY_ROOT_INVALID');});
  migrationBackendVersionProperties_(r.properties);
  return document;
}
// Only immutable, verified captures are cached. The current root is fetched for
// each request; eviction/corruption is a cache miss, never a stale-root fallback.
function migrationCachedResource_(repo,config,head) {
  var key='ung-fs-v1:'+migrationHash_([config.projectId,config.schoolId,head.digest]),cache;
  try {
    cache=CacheService.getScriptCache();var n=Number(cache.get(key)),parts=[];
    if(Number.isSafeInteger(n)&&n>0&&n<=32){
      for(var i=0;i<n;i++){var part=cache.get(key+':'+i);if(!part)throw Error('cache miss');parts.push(part);}
      var bytes=Utilities.base64Decode(parts.join('')),capture=JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes,'application/x-gzip')).getDataAsString());
      if(capture.resource===head.resource&&migrationHash_(capture)===head.digest)return migrationAssertCapture_(capture);
    }
  }catch(_){}
  var result=migrationReadServingResource_(repo,head);
  try {
    var encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(result))).getBytes()),count=Math.ceil(encoded.length/80000);
    if(count<=32){for(var p=0;p<count;p++)cache.put(key+':'+p,encoded.slice(p*80000,(p+1)*80000),21600);cache.put(key,String(count),21600);}
  }catch(_){}
  return result;
}
function migrationPrimaryReader_(repo,config,document) {
  var root=(document||migrationPrimaryRoot_(repo,config)).data,loaded=Object.create(null);
  return {root:root,revision:root.revision,resource:function(name){
    var heads=root.resources.filter(function(h){return h.resource===name;});if(heads.length!==1)throw migrationError_('MIGRATION_RESOURCE_OUTSIDE_BASELINE');
    if(!loaded[name])loaded[name]=migrationCachedResource_(repo,config,heads[0]);
    return migrationDecode_(migrationEncode_(loaded[name]));
  }};
}
function migrationPrimaryServing_(config){return config&&['FIRESTORE','RETURNING'].indexOf(config.phase)>=0;}
function migrationPrimaryMaintenance_(){var e=migrationError_('MIGRATION_WRITE_PAUSED',true);e.message='자료 저장소를 전환하고 있습니다. 잠시 뒤 다시 저장해 주세요.';return e;}
function migrationPrimaryDispatchNeeded_(action) {
  if(migrationBackendContext_ || migrationRouteActive_ || action==='health')return false;
  var c=migrationPrimaryConfig_();return migrationPrimaryServing_(c) || !!(c&&c.phase==='DRAINING'&&migrationPreviewActionAllowed_(action,true));
}
function migrationPrimaryDispatch_(body,callback) {
  var c=migrationPrimaryConfig_(),write=migrationPreviewActionAllowed_(body.action,true);
  if(write)return migrationWithSourceLock_(function(){
    c=migrationPrimaryConfig_();
    if(c.phase==='DRAINING'||c.phase==='RETURNING')throw migrationPrimaryMaintenance_();
    if(c.phase!=='FIRESTORE')return callback();
    return migrationPrimaryWrite_(migrationPrimaryRepository_(c),c,body,callback);
  });
  if(!migrationPrimaryServing_(c))return callback();
  if(['previewMigrationRequest','runMigrationReplica','setMigrationReplicaPaused','prepareMigrationReview','confirmMigrationReview'].indexOf(body.action)>=0)throw migrationError_('MIGRATION_PRIMARY_OPERATION_FORBIDDEN');
  return migrationWithBackend_(migrationPrimaryReader_(migrationPrimaryRepository_(c),c),c.sourceBookId,false,callback).response;
}
function migrationPrimaryWrite_(repo,c,body,callback) {
  var root=migrationPrimaryRoot_(repo,c);if(root.data.phase!=='PRIMARY')throw migrationPrimaryMaintenance_();
  var reader=migrationPrimaryReader_(repo,c,root),authorization=migrationWithBackend_(reader,c.sourceBookId,false,function(){
    var session=staffRequire_(body);return {session:session,accessMode:migrationAuthorizeWrite_(body,null)};
  }).response;
  var operationId=body.operationId||(body.action==='addStaffChecklist'?body.requestId:'')||Utilities.getUuid();
  var intent=migrationOperationIntent_({actorHash:migrationHash_(authorization.session.name),action:body.action,operationId:operationId,
    requestHash:migrationHash_(migrationBusinessRequest_(body)),resources:migrationCatalog_().map(function(x){return x.resource;})});
  var path=migrationPrimaryPath_(c),receiptPath=path+'/primaryReceipts/'+intent.operationKey,previous=repo.get(receiptPath);
  if(previous){
    if(migrationHash_(previous.data.intent)!==migrationHash_(intent))throw migrationError_('MIGRATION_OPERATION_CONFLICT');
    migrationAuthorizeWrite_(body,previous.data);
    if(previous.data.blocked||typeof previous.data.responseText!=='string')throw migrationError_('MIGRATION_SOURCE_REVIEW_REQUIRED');
    return ContentService.createTextOutput(previous.data.responseText).setMimeType(ContentService.MimeType.JSON);
  }
  var output=migrationWithBackend_(reader,c.sourceBookId,true,callback),text=output.response.getContent(),response=JSON.parse(text);
  if(response.ok!==true)return output.response;
  migrationAssertReceipt_(response,0);
  if(Utilities.newBlob(text).getBytes().length>200000)throw migrationError_('MIGRATION_RECEIPT_TOO_LARGE');
  var revision=root.data.revision+1,heads=root.data.resources.slice();
  output.captures.forEach(function(capture){var digest=migrationStageServing_(repo,capture);heads=heads.map(function(h){return h.resource===capture.resource?{resource:h.resource,digest:digest,count:capture.records.length,present:capture.present,headers:capture.headers,revision:revision}:h;});});
  var next=Object.assign({},root.data,{revision:revision,resources:heads,properties:output.properties,updatedAt:new Date().toISOString()});
  var receipt={schemaVersion:1,intent:intent,accessMode:authorization.accessMode,revision:revision,responseText:text};
  var writes=[{path:path,data:next,updateTime:root.updateTime},{path:receiptPath,data:receipt,createOnly:true},
    {path:path+'/primaryCommits/'+String(revision),data:{schemaVersion:1,revision:revision,previousRevision:root.data.revision,resources:heads,properties:output.properties,operationKey:intent.operationKey},createOnly:true}];
  try{repo.commit(writes);}catch(error){
    // A lost acknowledgement may follow a successful atomic commit. Read only
    // this receipt; never rerun the business write or guess which backend won.
    var confirmed=repo.get(receiptPath);
    if(!confirmed||migrationHash_(confirmed.data)!==migrationHash_(receipt))throw error;
  }
  return output.response;
}
function migrationPreparePrimary_(config,evidence) {
  return migrationWithSourceLock_(function(){
    var old=migrationPrimaryConfig_();
    if(old){
      if(old.sourceBookId!==config.sourceBookId||old.projectId!==config.projectId||old.schoolId!==config.schoolId||old.baselineRef!==config.baselineRef)throw migrationError_('MIGRATION_PRIMARY_SETUP_CONFLICT');
      if(old.sourceFingerprint!==evidence.sourceFingerprint){
        if(old.phase!=='PREPARING'||migrationPrimaryRepository_(old).get(migrationPrimaryPath_(old)))throw migrationError_('MIGRATION_PRIMARY_SETUP_CONFLICT');
        old.preparedAt=Date.now();old.notBefore=old.preparedAt+600000;old.sourceFingerprint=evidence.sourceFingerprint;old.deploymentVersion=evidence.deploymentVersion;
        old.epoch=migrationHash_([old.sourceBookId,old.preparedAt,Utilities.getUuid()]);migrationPrimarySave_(old);
      }
      return old;
    }
    if(!config.baselineRef)throw migrationError_('MIGRATION_BASELINE_REQUIRED');
    var now=Date.now(),c={schemaVersion:1,phase:'PREPARING',sourceBookId:config.sourceBookId,projectId:config.projectId,schoolId:config.schoolId,baselineRef:config.baselineRef,
      epoch:migrationHash_([config.sourceBookId,now,Utilities.getUuid()]),preparedAt:now,notBefore:now+600000,sourceFingerprint:evidence.sourceFingerprint,deploymentVersion:evidence.deploymentVersion};
    migrationPrimarySave_(c);return c;
  });
}
function migrationFreezePrimarySource_() {
  return migrationWithSourceLock_(function(){
    var c=migrationPrimaryConfig_();if(!c)throw migrationError_('MIGRATION_SETUP_REQUIRED');
    if(c.phase==='DRAINING')return c;
    if(c.phase!=='PREPARING'||Date.now()<c.notBefore)throw migrationError_('MIGRATION_DRAIN_NOT_FINISHED');
    var state=migrationOperationsState_();if(state.lease&&state.lease.expiresAt>Date.now())throw migrationError_('MIGRATION_WORKER_BUSY');
    c.phase='DRAINING';migrationPrimarySave_(c);return c;
  });
}
function migrationVerifyPrimaryStep_() {
  return migrationWithSourceLock_(function(){
    var c=migrationPrimaryConfig_();if(!c||c.phase!=='DRAINING')throw migrationError_('MIGRATION_SOURCE_NOT_FROZEN');
    var book=migrationOperationsBook_(c),store=migrationSheetsStore_(book),status=store.status(),repo=migrationPrimaryRepository_(c),reader=migrationServingReader_(repo,c.baselineRef);
    if(status.pendingCount||status.reviewCount||status.highWater!==reader.revision)throw migrationError_('MIGRATION_VERIFICATION_WAIT_FOR_REPLICA');
    var props=PropertiesService.getScriptProperties(),key='UNG_MIGRATION_CUTOVER_CHECK_V1',text=props.getProperty(key),job=text?JSON.parse(text):null;
    var signature=migrationHash_([c.epoch,reader.revision]);if(!job||job.signature!==signature)job={signature:signature,revision:reader.revision,checked:[],receiptsThrough:0};
    if(job.receiptsThrough===undefined)job.receiptsThrough=0;
    if(!Number.isSafeInteger(job.receiptsThrough)||job.receiptsThrough<0||job.receiptsThrough>status.highWater)throw migrationError_('MIGRATION_VERIFICATION_STATE_CORRUPT');
    var item=migrationCatalog_()[job.checked.length];
    if(item){
      var source=migrationCaptureResource_(book,store,item.resource),mirror=reader.resource(item.resource);
      if(migrationHash_(source)!==migrationHash_(mirror))throw migrationError_('MIGRATION_VERIFICATION_MISMATCH');
      source.records.forEach(function(row){if(migrationDecode_(row.payload).formulas.some(Boolean))throw migrationError_('MIGRATION_PRIMARY_FORMULA_UNSUPPORTED');});
      job.checked.push(item.resource);props.setProperty(key,JSON.stringify(job));
    }
    if(!item){
      // A client can retry a Sheets write after the cutover. Import its existing
      // receipt before activation so the same operation cannot execute twice.
      var end=Math.min(status.highWater,(job.receiptsThrough||0)+10);
      for(var r=(job.receiptsThrough||0)+1;r<=end;r++){
        var record=store.readRevision(r);
        if(record&&migrationPreviewActionAllowed_(record.intent.action,true)){
          var value=record.phase==='APPLIED'&&record.replayable&&record.receiptRef?store.readBlob(record.receiptRef):null;
          var receipt={schemaVersion:1,intent:record.intent,accessMode:record.accessMode,revision:0,sourceRevision:r,blocked:!value,responseText:value?value.responseText:null};
          if(value){migrationAssertReceipt_(JSON.parse(value.responseText),0);if(Utilities.newBlob(value.responseText).getBytes().length>200000)throw migrationError_('MIGRATION_RECEIPT_TOO_LARGE');}
          var receiptPath=migrationPrimaryPath_(c)+'/primaryReceipts/'+record.intent.operationKey,prior=repo.get(receiptPath);
          if(prior){if(migrationHash_(prior.data)!==migrationHash_(receipt))throw migrationError_('MIGRATION_OPERATION_CONFLICT');}
          else repo.commit([{path:receiptPath,data:receipt,createOnly:true}]);
          var confirmed=repo.get(receiptPath);if(!confirmed||migrationHash_(confirmed.data)!==migrationHash_(receipt))throw migrationError_('MIGRATION_RECEIPT_NOT_CONFIRMED');
        }
        job.receiptsThrough=r;
      }
      props.setProperty(key,JSON.stringify(job));
    }
    return {status:job.checked.length===migrationCatalog_().length&&job.receiptsThrough===status.highWater?'COMPLETE':'PROGRESS',checked:job.checked.length,revision:job.revision,receiptsThrough:job.receiptsThrough};
  });
}
function migrationActivatePrimary_() {
  return migrationWithSourceLock_(function(){
    var c=migrationPrimaryConfig_();if(!c)throw migrationError_('MIGRATION_SETUP_REQUIRED');
    var repo=migrationPrimaryRepository_(c);
    if(c.phase==='FIRESTORE')return migrationPrimaryStatus_();
    if(c.phase!=='DRAINING')throw migrationError_('MIGRATION_SOURCE_NOT_FROZEN');
    var checked=migrationVerifyPrimaryStep_();if(checked.status!=='COMPLETE')throw migrationError_('MIGRATION_VERIFICATION_INCOMPLETE');
    var original=migrationServingReader_(repo,c.baselineRef),props=PropertiesService.getScriptProperties().getProperties(),versions={};
    Object.keys(props).filter(function(k){return /^UNG_SYNC_RESOURCE_[A-Za-z0-9]+$/.test(k);}).forEach(function(k){versions[k]=props[k];});
    var path=migrationPrimaryPath_(c),saved=repo.get(path);
    if(!saved){repo.commit([{path:path,data:{schemaVersion:1,phase:'PRIMARY',sourceOfTruth:'FIRESTORE',sourceBookHash:migrationHash_(c.sourceBookId),baselineRef:c.baselineRef,
      baseRevision:original.revision,revision:0,resources:original.root.resources,properties:versions,activatedAt:new Date().toISOString()},createOnly:true}]);}
    var root=migrationPrimaryRoot_(repo,c);
    if(root.data.revision!==0||root.data.baseRevision!==checked.revision||migrationHash_(root.data.resources)!==migrationHash_(original.root.resources))throw migrationError_('MIGRATION_PRIMARY_ACTIVATION_CONFLICT');
    // No forward worker can remain in flight across the switch.
    var state=migrationOperationsState_();if(state.lease&&state.lease.expiresAt>Date.now())throw migrationError_('MIGRATION_WORKER_BUSY');
    state.invalidated=true;state.paused=true;migrationOperationsSaveState_(state);
    c.phase='FIRESTORE';migrationPrimarySave_(c);return migrationPrimaryStatus_();
  });
}
function migrationPrimaryStatus_() {
  var c=migrationPrimaryConfig_();if(!c)return null;
  var active=migrationPrimaryServing_(c),repo=active?migrationPrimaryRepository_(c):null,root=active?migrationPrimaryRoot_(repo,c).data:null;
  var backup=active?repo.get(migrationPrimaryPath_(c)+'/sheetBackups/current'):null;
  var backed=backup&&backup.data.verifiedRevision;
  return {schemaVersion:1,phase:c.phase,mode:active?'FIRESTORE_PRIMARY':'SHEETS_PRIMARY',activeBackend:active?'FIRESTORE':'SHEETS',sourceOfTruth:active?'FIRESTORE':'SHEETS',
    revision:root?root.revision:null,baselineRef:c.baselineRef,epoch:c.epoch,notBefore:new Date(c.notBefore).toISOString(),writesPaused:['DRAINING','RETURNING'].indexOf(c.phase)>=0,
    rollbackAvailable:active,forwardReplicaInvalidated:active||c.phase==='SHEETS_RETURNED',replicaConnected:active,liveTrackingEnabled:false,cutoverReady:false,canRun:false,
    recordedRevision:root?root.revision:null,verifiedRevision:backed===undefined?null:backed,pendingCount:root&&Number.isSafeInteger(backed)?root.revision-backed:null,errorCount:null,
    backupVerifiedAt:backup&&backup.data.verifiedAt||null,resources:migrationCatalog_().map(function(item){var h=root&&root.resources.filter(function(x){return x.resource===item.resource;})[0];return Object.assign({},item,{status:active?'FIRESTORE_PRIMARY':'SHEETS_PRIMARY',replicaCount:h?h.count:null});})};
}
