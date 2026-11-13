/** Request-local Firestore backend and isolated write rehearsal. No primary switch. */
var migrationBackendContext_=null;
function migrationBackendProperties_() {
  var native=PropertiesService.getScriptProperties();
  if(!migrationBackendContext_)return native;
  var overlay=migrationBackendContext_.properties;
  return {getProperty:function(key){return Object.prototype.hasOwnProperty.call(overlay,key)?overlay[key]:native.getProperty(key);},
    setProperty:function(key,value){if(key.indexOf('UNG_SYNC_RESOURCE_')!==0)throw migrationError_('MIGRATION_REHEARSAL_PROPERTY_FORBIDDEN');overlay[key]=String(value);return this;},
    deleteProperty:function(){throw migrationError_('MIGRATION_REHEARSAL_PROPERTY_FORBIDDEN');},
    getProperties:function(){throw migrationError_('MIGRATION_REHEARSAL_PROPERTY_ENUMERATION_FORBIDDEN');}};
}
function migrationBackendVersionProperties_(value) {
  var result=Object.create(null);
  Object.keys(value||{}).forEach(function(key){if(!/^UNG_SYNC_RESOURCE_[A-Za-z0-9]+$/.test(key)||typeof value[key]!=='string'||value[key].length>500)throw migrationError_('MIGRATION_REHEARSAL_PROPERTY_FORBIDDEN');result[key]=value[key];});
  return result;
}
function migrationSnapshotBook_(reader,bookId,writable) {
  var catalog=migrationCatalog_(),states=Object.create(null),dirty=Object.create(null);
  function clone(value){return migrationDecode_(migrationEncode_(value));}
  function state(name){
    var item=migrationResourceForSheet_(name);if(!item)throw migrationError_('MIGRATION_RESOURCE_OUTSIDE_BASELINE');
    if(states[name])return states[name];
    var capture=reader.resource(item.resource),values=capture.headers.length?[capture.headers.slice()]:[],formulas=[],identities=Object.create(null);
    capture.records.forEach(function(row){var payload=migrationDecode_(row.payload);values[row.sortOrder+1]=payload.cells;formulas[row.sortOrder+1]=payload.formulas;identities[row.sortOrder+1]=row.sourceId;});
    return states[name]={item:item,capture:capture,present:capture.present,values:values,formulas:formulas,identities:identities,maxRows:Math.max(1000,values.length),maxCols:Math.max(26,capture.headers.length)};
  }
  function changed(s){if(!writable)throw migrationError_('MIGRATION_READ_ONLY');dirty[s.item.resource]=true;}
  function sheet(s){
    function cell(matrix,r,c){return matrix[r-1] && matrix[r-1][c-1]!==undefined?matrix[r-1][c-1]:'';}
    function assign(matrix,r,c,value){if(!matrix[r-1])matrix[r-1]=[];matrix[r-1][c-1]=clone(value);}
    function nonempty(value){return value!=='' && value!==null && value!==undefined;}
    var result={getName:function(){return s.item.sheetName;},getSheetId:function(){return catalog.findIndex(function(item){return item.resource===s.item.resource;})+1;},getMaxRows:function(){return s.maxRows;},getMaxColumns:function(){return s.maxCols;},getFrozenRows:function(){return 1;},
      getLastRow:function(){var last=0;s.values.forEach(function(row,i){if(row.some(nonempty)||(s.formulas[i]||[]).some(nonempty))last=i+1;});return last;},
      getLastColumn:function(){var last=0;s.values.forEach(function(row){row.forEach(function(v,i){if(nonempty(v))last=Math.max(last,i+1);});});return last;}};
    result.getRange=function(row,column,rows,columns){
      if(typeof row==='string'){
        var match=/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(row);if(!match)throw migrationError_('MIGRATION_RANGE_UNSUPPORTED');
        function col(text){return text.split('').reduce(function(n,c){return n*26+c.charCodeAt(0)-64;},0);}
        row=Number(match[2]||1);column=col(match[1]);rows=Number(match[4]||(match[3]?s.maxRows:row))-row+1;columns=col(match[3]||match[1])-column+1;
      }
      rows=rows===undefined?1:rows;columns=columns===undefined?1:columns;
      if([row,column,rows,columns].some(function(n){return !Number.isSafeInteger(n)||n<1;})||row+rows>100002||column+columns>257)throw migrationError_('MIGRATION_RANGE_UNSUPPORTED');
      function matrix(data){return Array.from({length:rows},function(_,r){return Array.from({length:columns},function(_,c){return clone(cell(data,row+r,column+c));});});}
      var range={getRow:function(){return row;},getColumn:function(){return column;},getNumRows:function(){return rows;},getNumColumns:function(){return columns;},getValues:function(){return matrix(s.values);},getFormulas:function(){return matrix(s.formulas);},
        getDisplayValues:function(){return matrix(s.values).map(function(r){return r.map(function(v){if(v instanceof Date)throw migrationError_('MIGRATION_DISPLAY_DATE_REQUIRES_FORMAT');return typeof v==='boolean'?(v?'TRUE':'FALSE'):String(v);});});},
        getNumberFormats:function(){return Array.from({length:rows},function(){return Array(columns).fill('General');});},
        setValues:function(data){
          if(!Array.isArray(data)||data.length!==rows||data.some(function(r){return !Array.isArray(r)||r.length!==columns;}))throw migrationError_('MIGRATION_RANGE_SHAPE');
          if(migrationHash_(data)===migrationHash_(range.getValues()) && range.getFormulas().every(function(r){return r.every(function(v){return v==='';});}))return range;
          if(data.some(function(r){return r.some(function(v){return typeof v==='string' && v.charAt(0)==='=';});}))throw migrationError_('MIGRATION_FORMULA_WRITE_UNSUPPORTED');
          changed(s);for(var r=0;r<rows;r++)for(var c=0;c<columns;c++){assign(s.values,row+r,column+c,data[r][c]);assign(s.formulas,row+r,column+c,'');}return range;
        },
        setValue:function(value){return range.setValues(Array.from({length:rows},function(){return Array(columns).fill(value);}));},
        clearContent:function(){return range.setValue('');},clearContents:function(){return range.clearContent();},
        setNumberFormat:function(){if(!writable)throw migrationError_('MIGRATION_READ_ONLY');return range;}};
      return range;
    };
    result.getDataRange=function(){return result.getRange(1,1,Math.max(1,result.getLastRow()),Math.max(1,result.getLastColumn()));};
    result.appendRow=function(row){result.getRange(result.getLastRow()+1,1,1,row.length).setValues([row]);return result;};
    result.deleteRows=function(row,count){if(!Number.isSafeInteger(row)||row<1||!Number.isSafeInteger(count)||count<1)throw migrationError_('MIGRATION_RANGE_UNSUPPORTED');changed(s);s.values.splice(row-1,count);s.formulas.splice(row-1,count);return result;};
    result.deleteRow=function(row){return result.deleteRows(row,1);};
    result.insertRowsAfter=function(_,n){if(!writable)throw migrationError_('MIGRATION_READ_ONLY');s.maxRows+=n;return result;};
    result.insertColumnsAfter=function(_,n){if(!writable)throw migrationError_('MIGRATION_READ_ONLY');s.maxCols+=n;return result;};
    result.setFrozenRows=function(){if(!writable)throw migrationError_('MIGRATION_READ_ONLY');return result;};
    return result;
  }
  var book={getId:function(){return bookId;},getSheetByName:function(name){var s=state(name);return s.present?sheet(s):null;},getSheets:function(){return catalog.map(function(item){return book.getSheetByName(item.sheetName);}).filter(Boolean);},
    insertSheet:function(name){var s=state(name);if(s.present)throw migrationError_('MIGRATION_DUPLICATE_SHEET');changed(s);s.present=true;return sheet(s);}};
  function capture(resource){
    var item=catalog.filter(function(x){return x.resource===resource;})[0],s=state(item.sheetName),mapping=Object.create(null);
    var natural={teacherRows:['teacherName','teacherLabel'],checklistResponses:['checklistId','teacherName'],meals:['date','mealType'],schoolSchedules:['date','eventName','eventLevel'],classTimetables:['date','grade','classNm','period','subject','teacher','classroom']}[resource];
    if(natural)s.capture.records.forEach(function(record){var cells=migrationDecode_(record.payload).cells;mapping[migrationHash_({resource:resource,key:natural.map(function(header){return cells[s.capture.headers.indexOf(header)];})})]=record.sourceId;});
    return migrationCaptureResource_(book,{identityMap:function(_,keys){var result=Object.create(null);keys.forEach(function(key){result[key]=mapping[key]||Utilities.getUuid();});return result;}},resource);
  }
  return {book:book,changed:function(){return Object.keys(dirty).sort().map(capture);},loaded:function(){return Object.keys(states).map(function(name){return states[name].item.resource;}).sort();}};
}
function migrationWithBackend_(reader,bookId,writable,callback) {
  if(migrationBackendContext_ || migrationTrackingContext_)throw migrationError_('MIGRATION_BACKEND_NESTED');
  if(reader.root && reader.root.sourceBookHash!==migrationHash_(bookId))throw migrationError_('MIGRATION_SOURCE_MISMATCH');
  var facade=migrationSnapshotBook_(reader,bookId,writable),previousRoute=migrationRouteActive_;
  migrationBackendContext_={book:facade.book,properties:migrationBackendVersionProperties_(reader.root && reader.root.properties)};migrationRouteActive_=true;
  try{return {response:callback(),captures:facade.changed(),loaded:facade.loaded(),properties:migrationBackendVersionProperties_(migrationBackendContext_.properties)};}
  finally{migrationBackendContext_=null;migrationRouteActive_=previousRoute;}
}
function migrationPreviewActionAllowed_(action,write) {
  var writes=['addLink','deleteLink','addNotice','deleteNotice','addFeatureRequest','updateFeatureRequest','deleteFeatureRequest','replaceTimetable','replaceStudentTimetable','replaceStaffRoster','replaceStudentRoster','addStaffChecklist','updateStaffChecklist','submitStaffChecklist','deleteStaffChecklist','saveCommitteeMembers','addCommitteeEvent','deleteCommitteeEvent','saveTimetableOverride','deactivateTimetableOverride','createTimetableChange','respondTimetableChange','applyTimetableChangeForRequester','cancelTimetableChange','replaceNeisSnapshot'];
  return write?writes.indexOf(action)>=0:GET_READ_ACTIONS.indexOf(action)>=0||['getMobileScheduleBundle','getMobileAttendanceRoster'].indexOf(action)>=0;
}
function migrationRehearsal_(repo,baselineRef,bookId,body,session,callback,label) {
  if(!session||!session.name||!migrationPreviewActionAllowed_(body.action,true)||!/^[A-Za-z0-9_-]{8,128}$/.test(body.operationId||'')||!/^[A-Za-z0-9_-]{1,64}$/.test(label||''))throw migrationError_('MIGRATION_REHEARSAL_REQUEST_INVALID');
  migrationAuthorizeWrite_(body,null);
  var key=migrationHash_(['rehearsal',baselineRef,label]),rootPath='rehearsalEpochs/'+key,root=repo.get(rootPath);
  if(!root){var original=migrationServingReader_(repo,baselineRef).root;if(original.sourceBookHash!==migrationHash_(bookId))throw migrationError_('MIGRATION_SOURCE_MISMATCH');repo.commit([{path:rootPath,data:{schemaVersion:1,phase:'REHEARSAL',sourceOfTruth:'SHEETS',baselineRef:baselineRef,sourceBookHash:original.sourceBookHash,baseRevision:original.appliedRevision,revision:0,resources:original.resources},createOnly:true}]);root=repo.get(rootPath);}
  if(!root||root.data.schemaVersion!==1||root.data.phase!=='REHEARSAL'||root.data.sourceOfTruth!=='SHEETS'||root.data.baselineRef!==baselineRef||root.data.sourceBookHash!==migrationHash_(bookId))throw migrationError_('MIGRATION_REHEARSAL_CORRUPT');
  var intent=migrationOperationIntent_({actorHash:migrationHash_(session.name),action:body.action,requestHash:migrationHash_(migrationBusinessRequest_(body)),operationId:body.operationId,resources:migrationCatalog_().map(function(x){return x.resource;})});
  var receiptPath=rootPath+'/rehearsalReceipts/'+intent.operationKey,receipt=repo.get(receiptPath);
  if(receipt){if(migrationHash_(receipt.data.intent)!==migrationHash_(intent))throw migrationError_('MIGRATION_OPERATION_CONFLICT');return {response:receipt.data.responseText,replayed:true,revision:receipt.data.revision};}
  var reader={root:root.data,revision:root.data.revision,resource:function(name){var head=root.data.resources.filter(function(x){return x.resource===name;});if(head.length!==1)throw migrationError_('MIGRATION_RESOURCE_OUTSIDE_BASELINE');return migrationReadServingResource_(repo,head[0]);}};
  var output=migrationWithBackend_(reader,bookId,true,callback),text=output.response.getContent(),response=JSON.parse(text);
  if(response.ok!==true)return {response:text,replayed:false,revision:root.data.revision,committed:false};
  if(Utilities.newBlob(text).getBytes().length>200000)throw migrationError_('MIGRATION_REHEARSAL_RECEIPT_TOO_LARGE');
  var heads=root.data.resources.slice();output.captures.forEach(function(capture){var digest=migrationStageServing_(repo,capture);heads=heads.map(function(head){return head.resource===capture.resource?{resource:head.resource,digest:digest,count:capture.records.length,present:capture.present,headers:capture.headers,revision:root.data.revision+1}:head;});});
  var next=Object.assign({},root.data,{revision:root.data.revision+1,resources:heads,properties:output.properties});
  repo.commit([{path:rootPath,data:next,updateTime:root.updateTime},{path:receiptPath,data:{schemaVersion:1,intent:intent,revision:next.revision,responseText:text},createOnly:true}]);
  return {response:text,replayed:false,revision:next.revision,committed:true,loaded:output.loaded};
}
function migrationRehearsalReader_(repo,baselineRef,bookId,label) {
  if(!/^[a-f0-9]{64}$/.test(baselineRef||'') || !/^[A-Za-z0-9_-]{1,64}$/.test(label||''))throw migrationError_('MIGRATION_REHEARSAL_REQUEST_INVALID');
  var document=repo.get('rehearsalEpochs/'+migrationHash_(['rehearsal',baselineRef,label])),root=document && document.data,cache=Object.create(null);
  if(!root || root.schemaVersion!==1 || root.phase!=='REHEARSAL' || root.sourceOfTruth!=='SHEETS' || root.baselineRef!==baselineRef || root.sourceBookHash!==migrationHash_(bookId))throw migrationError_('MIGRATION_REHEARSAL_CORRUPT');
  return {root:root,revision:root.revision,resource:function(name){var head=root.resources.filter(function(x){return x.resource===name;});if(head.length!==1)throw migrationError_('MIGRATION_RESOURCE_OUTSIDE_BASELINE');if(!cache[name])cache[name]=migrationReadServingResource_(repo,head[0]);return migrationDecode_(migrationEncode_(cache[name]));}};
}
function migrationPreviewRequest_(body,session) {
  requireAdmin_(body.adminPassword);
  var request=body.request,write=body.mode==='REHEARSAL';
  if(!request || !migrationPreviewActionAllowed_(request.action,write) || ['READ','REHEARSAL','REHEARSAL_READ'].indexOf(body.mode)<0)throw migrationError_('MIGRATION_PREVIEW_ACTION_FORBIDDEN');
  var ctx=migrationOperationsContext_(),repo=migrationOperationsRepository_(ctx.config);
  // One-off schema repairs must have completed on Sheets before a preview. Never
  // execute maintenance or credential issuing actions in the isolated backend.
  if(!migrationSchemaReady_(ctx.book,MOBILE_SERVICE_VERSION,'ALL') || PropertiesService.getScriptProperties().getProperty(STAFF_ROSTER_FILE_ORDER_1_1_37_KEY)!=='true')throw migrationError_('MIGRATION_SCHEMA_PREPARATION_REQUIRED');
  var nested=Object.assign({},request,{staffToken:body.staffToken,adminPassword:body.adminPassword});
  function dispatch(){return doPost({postData:{contents:JSON.stringify(nested)}});}
  if(write)return Object.assign({backend:'FIRESTORE_REHEARSAL',sourceOfTruth:'SHEETS'},migrationRehearsal_(repo,ctx.config.baselineRef,ctx.book.getId(),nested,session,dispatch,body.rehearsalId));
  var reader=body.mode==='REHEARSAL_READ'?migrationRehearsalReader_(repo,ctx.config.baselineRef,ctx.book.getId(),body.rehearsalId):migrationServingReader_(repo,ctx.config.baselineRef),output=migrationWithBackend_(reader,ctx.book.getId(),false,dispatch);
  return {backend:body.mode==='REHEARSAL_READ'?'FIRESTORE_REHEARSAL':'FIRESTORE_SHADOW',sourceOfTruth:'SHEETS',revision:reader.revision,response:output.response.getContent(),loaded:output.loaded};
}
