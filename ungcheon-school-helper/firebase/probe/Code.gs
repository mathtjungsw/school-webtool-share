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
