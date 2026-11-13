/** Immutable, resumable snapshot replication. Not attached to live writes yet. */
function migrationSnapshot_(resource, sourceRevision, records) {
  if (!/^[a-z][A-Za-z0-9]{0,63}$/.test(resource) || !Number.isSafeInteger(sourceRevision) || sourceRevision < 1 || !Array.isArray(records) || records.length > 10000) throw migrationError_('MIGRATION_INVALID_SNAPSHOT');
  var ids = Object.create(null);
  var normalized = records.map(function(record) {
    if (typeof record.sourceId !== 'string' || !record.sourceId || record.sourceId.length > 512 || ids[record.sourceId]) throw migrationError_('MIGRATION_INVALID_SOURCE_ID');
    if (!Number.isSafeInteger(record.sortOrder) || record.sortOrder < 0 || typeof record.isDeleted !== 'boolean') throw migrationError_('MIGRATION_INVALID_RECORD');
    ids[record.sourceId] = true;
    // Round-trip creates an isolated, typed copy; caller edits cannot change a run.
    var payload = migrationDecode_(migrationEncode_(record.payload));
    return { schemaVersion: 1, sourceId: record.sourceId, sortOrder: record.sortOrder, isDeleted: record.isDeleted, payload: payload, payloadHash: migrationHash_(payload) };
  });
  normalized.sort(function(a, b) { return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0; });
  var digest = migrationRecordDigest_(normalized);
  var runId = migrationHash_({ resource: resource, sourceRevision: sourceRevision, payloadHash: digest });
  return { resource: resource, sourceRevision: sourceRevision, payloadHash: digest, runId: runId, records: normalized };
}

function migrationRecordDigest_(records) {
  return migrationHash_(records.map(function(record) {
    return { sourceId: record.sourceId, sortOrder: record.sortOrder, isDeleted: record.isDeleted, payloadHash: record.payloadHash };
  }));
}

function migrationAssertSnapshot_(snapshot) {
  // Recompute caller-supplied metadata before any writes. Fail rather than silently
  // accepting a mutated in-memory snapshot or a mis-restored checkpoint.
  var canonical = migrationSnapshot_(snapshot.resource, snapshot.sourceRevision, snapshot.records);
  if (canonical.runId !== snapshot.runId || canonical.payloadHash !== snapshot.payloadHash || migrationCanonical_(canonical.records) !== migrationCanonical_(snapshot.records)) throw migrationError_('MIGRATION_SNAPSHOT_CHANGED');
}

function migrationRunDescriptor_(snapshot, pageSize) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw migrationError_('MIGRATION_PAGE_SIZE');
  return { schemaVersion: 1, resource: snapshot.resource, sourceRevision: snapshot.sourceRevision, payloadHash: snapshot.payloadHash, recordCount: snapshot.records.length, pageSize: pageSize, pageCount: Math.ceil(snapshot.records.length / pageSize) };
}

function migrationAssertRun_(run, snapshot) {
  if (!run || migrationCanonical_(run.data) !== migrationCanonical_(migrationRunDescriptor_(snapshot, run.data.pageSize))) throw migrationError_('MIGRATION_RUN_MISMATCH');
}

function migrationBeginSnapshot_(repository, snapshot, pageSize) {
  migrationAssertSnapshot_(snapshot);
  var path = 'migrationRuns/' + snapshot.runId;
  var descriptor = migrationRunDescriptor_(snapshot, pageSize);
  // Validate before creating the immutable run. Otherwise an oversized first
  // page could leave a run that cannot be retried with a smaller page size.
  var pageBytes = 0;
  snapshot.records.forEach(function(record, index) {
    if (index % pageSize === 0) pageBytes = 1024;
    var bytes = Utilities.newBlob(JSON.stringify(migrationEncode_(record).mapValue.fields)).getBytes().length;
    if (bytes > 850000) throw migrationError_('MIGRATION_DOCUMENT_TOO_LARGE');
    pageBytes += bytes + 512;
    if (pageBytes > 7500000) throw migrationError_('MIGRATION_PAGE_TOO_LARGE_USE_SMALLER_SIZE');
  });
  var existing = repository.get(path);
  if (existing) {
    if (migrationCanonical_(existing.data) !== migrationCanonical_(descriptor)) throw migrationError_('MIGRATION_RUN_CONFLICT');
    return descriptor;
  }
  repository.commit([{ path: path, data: descriptor, createOnly: true }]);
  return descriptor;
}

function migrationStagePage_(repository, snapshot, pageIndex) {
  migrationAssertSnapshot_(snapshot);
  var base = 'migrationRuns/' + snapshot.runId;
  var run = repository.get(base);
  migrationAssertRun_(run, snapshot);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= run.data.pageCount) throw migrationError_('MIGRATION_INVALID_PAGE');
  var records = snapshot.records.slice(pageIndex * run.data.pageSize, (pageIndex + 1) * run.data.pageSize);
  var checkpoint = { pageIndex: pageIndex, count: records.length, payloadHash: migrationRecordDigest_(records) };
  var checkpointPath = base + '/pages/p' + pageIndex;
  var existing = repository.get(checkpointPath);
  if (existing) {
    if (migrationCanonical_(existing.data) !== migrationCanonical_(checkpoint)) throw migrationError_('MIGRATION_PAGE_CONFLICT');
    return { pageIndex: pageIndex, skipped: true, count: records.length };
  }
  var writes = records.map(function(record) { return { path: base + '/records/' + migrationHash_(record.sourceId), data: record, createOnly: true }; });
  writes.push({ path: checkpointPath, data: checkpoint, createOnly: true });
  repository.commit(writes);
  return { pageIndex: pageIndex, skipped: false, count: records.length };
}

function migrationVerifySnapshot_(repository, snapshot) {
  migrationAssertSnapshot_(snapshot);
  var base = 'migrationRuns/' + snapshot.runId;
  var run = repository.get(base);
  migrationAssertRun_(run, snapshot);
  var records = [];
  var token = '';
  var seenTokens = Object.create(null);
  do {
    var page = repository.list(base + '/records', token);
    records = records.concat(page.documents.map(function(item) {
      if (item.path !== base + '/records/' + migrationHash_(item.data.sourceId)) throw migrationError_('MIGRATION_DOCUMENT_ID_MISMATCH');
      return item.data;
    }));
    token = page.nextPageToken;
    if (records.length > run.data.recordCount || (token && seenTokens[token])) throw migrationError_('MIGRATION_VERIFICATION_FAILED');
    if (token) seenTokens[token] = true;
  } while (token);
  records.sort(function(a, b) { return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0; });
  var ids = Object.create(null);
  records.forEach(function(record) {
    if (ids[record.sourceId] || record.schemaVersion !== 1 || record.payloadHash !== migrationHash_(record.payload)) throw migrationError_('MIGRATION_VERIFICATION_FAILED');
    ids[record.sourceId] = true;
  });
  if (records.length !== run.data.recordCount || migrationRecordDigest_(records) !== snapshot.payloadHash) throw migrationError_('MIGRATION_VERIFICATION_FAILED');
  for (var index = 0; index < run.data.pageCount; index++) {
    var checkpoint = repository.get(base + '/pages/p' + index);
    var expected = records.slice(index * run.data.pageSize, (index + 1) * run.data.pageSize);
    if (!checkpoint || checkpoint.data.count !== expected.length || checkpoint.data.pageIndex !== index || checkpoint.data.payloadHash !== migrationRecordDigest_(expected)) throw migrationError_('MIGRATION_INCOMPLETE_PAGES');
  }
  return { recordCount: records.length, deletedCount: records.filter(function(record) { return record.isDeleted; }).length, payloadHash: snapshot.payloadHash };
}

function migrationPublishSnapshot_(repository, snapshot) {
  // This advances a replica resource pointer, never the application's backend.
  var verified = migrationVerifySnapshot_(repository, snapshot);
  var path = 'resourceManifests/' + snapshot.resource;
  var previous = repository.get(path);
  if (previous) {
    var head = previous.data;
    if (head.schemaVersion !== 1 || head.sourceOfTruth !== 'SHEETS' || !Number.isSafeInteger(head.sourceRevision) || head.sourceRevision < 1 || !/^[a-f0-9]{64}$/.test(head.runId || '') || !/^[a-f0-9]{64}$/.test(head.payloadHash || '') || !Number.isSafeInteger(head.recordCount) || head.recordCount < 0 || !Number.isSafeInteger(head.deletedCount) || head.deletedCount < 0 || head.deletedCount > head.recordCount) throw migrationError_('MIGRATION_MANIFEST_INVALID');
  }
  if (previous && previous.data.sourceRevision > snapshot.sourceRevision) throw migrationError_('MIGRATION_STALE_REVISION');
  if (previous && previous.data.sourceRevision === snapshot.sourceRevision) {
    if (previous.data.runId !== snapshot.runId) throw migrationError_('MIGRATION_REVISION_CONFLICT');
    return { duplicate: true, recordCount: verified.recordCount };
  }
  var manifest = { schemaVersion: 1, sourceOfTruth: 'SHEETS', sourceRevision: snapshot.sourceRevision, runId: snapshot.runId, payloadHash: verified.payloadHash, recordCount: verified.recordCount, deletedCount: verified.deletedCount };
  repository.commit([{ path: path, data: manifest, createOnly: !previous, updateTime: previous && previous.updateTime }]);
  return { duplicate: false, recordCount: verified.recordCount };
}
