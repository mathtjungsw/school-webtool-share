'use strict'
// Build the real business dispatcher inside a synthetic-only namespace. The
// production source is included unchanged; only its environment/auth boundary
// is supplied by this test harness. No production workbook can be passed in.
const fs=require('node:fs'),path=require('node:path')
function source(){
const tracking=fs.readFileSync(path.join(__dirname,'../server/MigrationTracking.gs'),'utf8')
const shouldTrack=tracking.match(/function migrationShouldTrack_\(action\) \{[\s\S]*?\n\}/)
if(!shouldTrack)throw Error('Shared tracking classifier missing')
// Bind the unchanged classifier to the real Code.gs constants in this namespace.
return 'var migrationProbeNativeApp_ = (function(){\nvar nativeBook=null;\n'+fs.readFileSync(path.join(__dirname,'../server/Code.gs'),'utf8')+'\n'+shouldTrack[0]+'\n'+`
function sourceBook_(){return typeof migrationBackendContext_!=='undefined'&&migrationBackendContext_?migrationBackendContext_.book:migrationTrackingContext_ ? migrationTrackingContext_.facade : nativeBook;}
function staffRequire_(body){if(body.staffToken!=='SYNTHETIC_NATIVE_SESSION')throw new Error('PROBE_AUTH_REQUIRED');return {name:'Synthetic Native Teacher'};}
function requireAdmin_(password){if(password!=='SYNTHETIC_ADMIN_ONLY')throw new Error('PROBE_ADMIN_REQUIRED');}
function assertBook(book){
  if(ScriptApp.getScriptId()!=='16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9' || !book || book.getName()!=='웅천고 이전 시험 - 합성 업무 요청 v1' ||
    book.getId()!==PropertiesService.getScriptProperties().getProperty('SYNTHETIC_NATIVE_ROUTE_BOOK_V1'))throw new Error('PROBE_BOOK_MISMATCH');
}
return {
  initialize:function(book){assertBook(book);nativeBook=book;
    [STAFF_ASSIGNMENTS_2026_APPLIED_KEY,STAFF_NAME_MIGRATION_1_1_30_KEY,STAFF_ROSTER_MIGRATION_1_1_31_KEY,STAFF_ROSTER_FILE_ORDER_1_1_37_KEY,TIMETABLE_OVERRIDE_SEED_KEY,OFFICIAL_RELEASE_NOTICE_RESET_KEY]
      .forEach(function(key){PropertiesService.getScriptProperties().setProperty(key,'true');});
    try{ensureSheets_();}finally{nativeBook=null;}
  },
  request:function(book,body){assertBook(book);if(['addLink','deleteLink','listLinks'].indexOf(body.action)<0)throw new Error('PROBE_ROUTE_FORBIDDEN');nativeBook=book;
    try{return doPost({postData:{contents:JSON.stringify(body)}});}finally{nativeBook=null;}
  }
};})();\n`}
if(require.main===module)process.stdout.write(source())
module.exports={source}
