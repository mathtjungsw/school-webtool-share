/** Run only in a separate standalone Apps Script project, never in the live app. */
function probeFirestoreConnection() {
  var root = 'projects/ungcheon-school-helper/databases/(default)/documents';
  var name = root + '/migrationChecks/appsScriptOAuth';
  function request(method, suffix, body) {
    var options = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
    if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
    var response = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + root + suffix, options);
    var status = response.getResponseCode();
    if (status === 404) return null;
    if (status < 200 || status >= 300) throw new Error('FIRESTORE_PROBE_HTTP_' + status);
    return JSON.parse(response.getContentText());
  }
  var existing = request('get', '/migrationChecks/appsScriptOAuth');
  if (!existing) {
    request('post', ':commit', { writes: [{ update: {
      name: name,
      fields: { marker: { stringValue: 'synthetic-connection-check-v1' }, schemaVersion: { integerValue: '1' } }
    }, currentDocument: { exists: false } }] });
    existing = request('get', '/migrationChecks/appsScriptOAuth');
  }
  if (!existing || existing.fields.marker.stringValue !== 'synthetic-connection-check-v1' || existing.fields.schemaVersion.integerValue !== '1') throw new Error('FIRESTORE_PROBE_CONTENT_MISMATCH');
  var result = { ok: true, projectId: 'ungcheon-school-helper', dataset: 'SYNTHETIC_ONLY', productionScriptChanged: false };
  console.log(JSON.stringify(result));
  return result;
}

/** Exercises the actual replica adapter in an isolated synthetic school scope. */
function probeFirestoreReplica() {
  var repository = migrationRepository_({ enabled: true, projectId: 'ungcheon-school-helper', schoolId: 'migration-probe', environment: 'MIRROR', sourceOfTruth: 'SHEETS' });
  var first = migrationSnapshot_('snapshotProtocolV1', 1, [
    { sourceId: 'synthetic-001', sortOrder: 1, isDeleted: false, payload: { studentId: '00123', empty: '', zero: 0, flag: false, nullable: null, at: new Date('2026-11-13T00:00:00.000Z') } },
    { sourceId: 'synthetic-002', sortOrder: 0, isDeleted: false, payload: { status: 'pending' } }
  ]);
  var second = migrationSnapshot_('snapshotProtocolV1', 2, [
    { sourceId: 'synthetic-001', sortOrder: 1, isDeleted: true, payload: {} },
    { sourceId: 'synthetic-002', sortOrder: 0, isDeleted: false, payload: { status: 'approved' } }
  ]);
  [first, second].forEach(function(snapshot) {
    var descriptor = migrationBeginSnapshot_(repository, snapshot, 1);
    for (var index = 0; index < descriptor.pageCount; index++) migrationStagePage_(repository, snapshot, index);
    if (!migrationStagePage_(repository, snapshot, 0).skipped) throw new Error('PROBE_RETRY_FAILED');
    migrationVerifySnapshot_(repository, snapshot);
  });
  var current = repository.get('resourceManifests/snapshotProtocolV1');
  if (!current) migrationPublishSnapshot_(repository, first);
  migrationPublishSnapshot_(repository, second);
  var rejected = false;
  try { migrationPublishSnapshot_(repository, first); }
  catch (error) { if (error.code !== 'MIGRATION_STALE_REVISION') throw error; rejected = true; }
  if (!rejected || !migrationPublishSnapshot_(repository, second).duplicate) throw new Error('PROBE_REVISION_GUARD_FAILED');
  var finalHead = repository.get('resourceManifests/snapshotProtocolV1').data;
  if (finalHead.deletedCount !== 1 || finalHead.sourceRevision !== 2) throw new Error('PROBE_DELETE_FAILED');
  var result = { ok: true, dataset: 'SYNTHETIC_ONLY', checks: ['typedCopy', 'resume', 'fullVerification', 'tombstone', 'staleRejection', 'idempotentPublication'], successfulRequests: repository.metrics.requests, decodedDocuments: repository.metrics.documentsRead, acknowledgedWrites: repository.metrics.documentsWritten, productionScriptChanged: false };
  console.log(JSON.stringify(result));
  return result;
}

/** Creates/reuses one private synthetic workbook. Never opens the school source. */
function probeSheetsChangeTracking() {
  if (ScriptApp.getScriptId() !== '16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9') throw new Error('PROBE_PROJECT_MISMATCH');
  // Preserve the failed v1 journal for diagnosis. Never automatically replay its
  // uncertain operation. This fixed v2 dataset is reused on every subsequent run.
  var properties = PropertiesService.getScriptProperties(), key = 'SYNTHETIC_TRACKING_BOOK_V2';
  var id = properties.getProperty(key), title = '웅천고 이전 시험 - 합성 변경 기록 전용 v2';
  if (id === '12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4' || id === '1OBt8XHMYH8uNAfuozbjc8iON954FjBSmojf4y2c74GQ') throw new Error('PROBE_SOURCE_FORBIDDEN');
  var book;
  if (!id) { book = SpreadsheetApp.create(title); id = book.getId(); properties.setProperty(key, id); }
  else { book = SpreadsheetApp.openById(id); if (book.getName() !== title) throw new Error('PROBE_BOOK_MISMATCH'); }
  var sheet = book.getSheetByName('공유링크');
  if (!sheet) { sheet = book.insertSheet('공유링크'); sheet.appendRow(['id','department','title','url','description','registeredBy','createdAt']); }
  migrationInitializeStore_(book);
  var config = {schemaVersion:1, enabled:true, sourceBookId:id}, writes = 0;
  function run(action, operationId, titleValue, callback) {
    return migrationTrackedRoute_({action:action, operationId:operationId, title:titleValue}, {name:'Synthetic Probe'}, callback, config, book);
  }
  function result() { return ContentService.createTextOutput(JSON.stringify({ok:true,data:{id:'synthetic-link-1'}})).setMimeType(ContentService.MimeType.JSON); }
  run('probeCreate','synthetic-create-v1','Synthetic',function() {
    migrationSourceBook_().getSheetByName('공유링크').appendRow(['synthetic-link-1','Test','Synthetic','https://example.com','','Synthetic','2026-11-13']); writes++; return result();
  });
  var firstWrites = writes;
  run('probeCreate','synthetic-create-v1','Synthetic',function() { throw new Error('PROBE_DUPLICATE_REPLAY'); });
  if (writes !== firstWrites) throw new Error('PROBE_DUPLICATE_WRITE');
  var conflict = false;
  try { run('probeCreate','synthetic-create-v1','Changed',function() { throw new Error('PROBE_CONFLICT_WRITE'); }); }
  catch (error) { if (error.code !== 'MIGRATION_OPERATION_CONFLICT') throw error; conflict = true; }
  if (!conflict) throw new Error('PROBE_CONFLICT_NOT_REJECTED');
  run('probeUpdate','synthetic-update-v1','Updated',function() {
    var lock = migrationCompatibleLock_(); lock.waitLock(10000);
    try { migrationSourceBook_().getSheetByName('공유링크').getRange(2,3).setValue('Updated'); writes++; return result(); }
    finally { lock.releaseLock(); }
  });
  run('probeDelete','synthetic-delete-v1','Deleted',function() {
    migrationSourceBook_().getSheetByName('공유링크').deleteRow(2); writes++; return result();
  });
  var store = migrationSheetsStore_(book), status = store.status();
  if (sheet.getLastRow() !== 1 || status.appliedCount !== 3 || status.pendingCount || status.reviewCount) throw new Error('PROBE_JOURNAL_VERIFICATION_FAILED');
  var deleteIntent = migrationOperationIntent_({actorHash:migrationHash_('Synthetic Probe'),action:'probeDelete',requestHash:migrationHash_({action:'probeDelete',title:'Deleted'}),operationId:'synthetic-delete-v1',resources:migrationCatalog_().map(function(item){return item.resource;})});
  var deletion = store.load(deleteIntent.operationKey), delta = store.readBlob(deletion.evidence[0].deltaRef);
  if (delta.deletes.length !== 1 || delta.puts.length !== 0) throw new Error('PROBE_TOMBSTONE_FAILED');
  var output = {ok:true,dataset:'SYNTHETIC_ONLY',checks:['durableJournal','beforeImage','delta','nestedLock','duplicate','payloadConflict','tombstone','completionReadback'],sourceWritesThisExecution:writes,appliedOperations:status.appliedCount,spreadsheetId:id,spreadsheetUrl:book.getUrl(),productionScriptChanged:false};
  console.log(JSON.stringify(output)); return output;
}

/** Read-only diagnosis of the preserved synthetic v1 failure and native codec. */
function probeSheetsStorageReadback() {
  if (ScriptApp.getScriptId() !== '16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9') throw new Error('PROBE_PROJECT_MISMATCH');
  var text = JSON.stringify({marker:'synthetic-codec-check',empty:'',zero:0});
  var gzip = Utilities.gzip(Utilities.newBlob(text,'application/json'));
  var bytes = Utilities.base64Decode(Utilities.base64Encode(gzip.getBytes()));
  var untypedReadback = false;
  try { untypedReadback = Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString('UTF-8') === text; } catch (_) {}
  var typedReadback = Utilities.ungzip(Utilities.newBlob(bytes,'application/x-gzip')).getDataAsString('UTF-8') === text;
  if (!typedReadback) throw new Error('PROBE_TYPED_CODEC_FAILED');
  var id = PropertiesService.getScriptProperties().getProperty('SYNTHETIC_TRACKING_BOOK_V1');
  if (!id || id === '12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4' || id === '1OBt8XHMYH8uNAfuozbjc8iON954FjBSmojf4y2c74GQ') throw new Error('PROBE_SOURCE_FORBIDDEN');
  var book = SpreadsheetApp.openById(id);
  if (book.getName() !== '웅천고 이전 시험 - 합성 변경 기록 전용') throw new Error('PROBE_BOOK_MISMATCH');
  var store = migrationSheetsStore_(book), status = store.status();
  var intent = migrationOperationIntent_({actorHash:migrationHash_('Synthetic Probe'),action:'probeCreate',requestHash:migrationHash_({action:'probeCreate',title:'Synthetic'}),operationId:'synthetic-create-v1',resources:migrationCatalog_().map(function(item){return item.resource;})});
  var record = store.load(intent.operationKey);
  var before = store.readBlob(migrationHash_({schemaVersion:1,resource:'links',present:true,headers:['id','department','title','url','description','registeredBy','createdAt'],records:[]}));
  var noSourceWrite = book.getSheetByName('공유링크').getLastRow() === 1;
  if (!record || record.phase !== 'PREPARED' || record.touched.length || !before || !noSourceWrite) throw new Error('PROBE_FAILURE_BOUNDARY_MISMATCH');
  var output = {ok:true,dataset:'SYNTHETIC_ONLY',untypedReadback:untypedReadback,typedReadback:typedReadback,preservedBeforeImageVerified:true,sourceRows:0,preservedPendingOperations:status.pendingCount,spreadsheetId:id,productionScriptChanged:false};
  console.log(JSON.stringify(output)); return output;
}
