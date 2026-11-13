/** Change-intent protocol. Not wired to production routes or a live journal store.
 * The adapter MUST durably flush reserve/complete before returning. It must allocate
 * a monotonic revision under the same lock, retain PREPARED entries, and never
 * replay an uncertain source write. Firestore replication is a separate worker.
 */
var migrationSourceLockDepth_ = 0;
var migrationSourceLockGeneration_ = 0;
var migrationSourceOperationActive_ = false;
function migrationWithSourceLock_(callback) {
  if (migrationSourceLockDepth_ > 0) {
    migrationSourceLockDepth_++;
    try { return callback(); } finally { migrationSourceLockDepth_--; }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  migrationSourceLockGeneration_++;
  migrationSourceLockDepth_ = 1;
  try { return callback(); }
  finally { migrationSourceLockDepth_ = 0; lock.releaseLock(); }
}

function migrationOperationIntent_(context) {
  var hex = /^[a-f0-9]{64}$/;
  if (!context || !hex.test(context.actorHash || '') || !hex.test(context.requestHash || '') ||
      !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(context.action || '') ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(context.operationId || '') ||
      !Array.isArray(context.resources) || !context.resources.length) throw migrationError_('MIGRATION_INVALID_OPERATION');
  var allowed = migrationCatalog_().map(function(item) { return item.resource; });
  var resources = context.resources.slice().sort();
  resources.forEach(function(resource, index) {
    if (allowed.indexOf(resource) < 0 || (index && resources[index - 1] === resource)) throw migrationError_('MIGRATION_INVALID_OPERATION');
  });
  return {
    schemaVersion: 1,
    operationKey: migrationHash_([context.actorHash, context.action, context.operationId]),
    actorHash: context.actorHash, action: context.action, requestHash: context.requestHash, resources: resources
  };
}

function migrationJournalSeal_(record) {
  var sealed = JSON.parse(JSON.stringify(record));
  delete sealed.recordHash;
  sealed.recordHash = migrationHash_(sealed);
  if (Utilities.newBlob(JSON.stringify(sealed)).getBytes().length > 40000) throw migrationError_('MIGRATION_JOURNAL_TOO_LARGE');
  return sealed;
}

function migrationPreparedOperation_(intent, revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw migrationError_('MIGRATION_INVALID_REVISION');
  return migrationJournalSeal_({ intent: intent, revision: revision, phase: 'PREPARED', evidence: null, receipt: null });
}

function migrationAssertOperation_(record, intent) {
  if (!record || !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      ['PREPARED', 'APPLIED'].indexOf(record.phase) < 0 ||
      migrationJournalSeal_(record).recordHash !== record.recordHash) throw migrationError_('MIGRATION_JOURNAL_CORRUPT');
  if (migrationHash_(record.intent) !== migrationHash_(intent)) throw migrationError_('MIGRATION_OPERATION_CONFLICT');
  if (record.phase === 'PREPARED') {
    if (record.evidence !== null || record.receipt !== null) throw migrationError_('MIGRATION_JOURNAL_CORRUPT');
  } else {
    migrationAssertEvidence_(record.evidence, intent.resources);
    try { migrationAssertReceipt_(migrationDecode_(record.receipt), 0); }
    catch (_) { throw migrationError_('MIGRATION_JOURNAL_CORRUPT'); }
  }
}

function migrationAssertEvidence_(evidence, resources) {
  if (!Array.isArray(evidence) || evidence.length !== resources.length || evidence.some(function(item) { return !item || typeof item !== 'object'; })) throw migrationError_('MIGRATION_INVALID_EVIDENCE');
  var ordered = evidence.slice().sort(function(a, b) { return a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0; });
  ordered.forEach(function(item, index) {
    if (!item || item.resource !== resources[index] || !/^[a-f0-9]{64}$/.test(item.digest || '') ||
        !Number.isSafeInteger(item.count) || item.count < 0 ||
        !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(item.snapshotRef || '') || item.snapshotRef.length > 160 ||
        Object.keys(item).sort().join(',') !== 'count,digest,resource,snapshotRef') throw migrationError_('MIGRATION_INVALID_EVIDENCE');
  });
}

function migrationJournalLoad_(adapter, key) {
  try { return adapter.load(key); }
  catch (_) { throw migrationError_('MIGRATION_JOURNAL_UNAVAILABLE'); }
}

function migrationAssertReceipt_(value, depth) {
  if ((depth || 0) > 16) throw migrationError_('MIGRATION_INVALID_RECEIPT');
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    Object.keys(value).forEach(function(key) {
      if (/password|token|secret|credential|authorization/i.test(key)) throw migrationError_('MIGRATION_SENSITIVE_RECEIPT');
      migrationAssertReceipt_(value[key], (depth || 0) + 1);
    });
  }
}

function migrationAppliedOperation_(prepared, evidence, value) {
  migrationAssertOperation_(prepared, prepared.intent);
  if (prepared.phase !== 'PREPARED') throw migrationError_('MIGRATION_INVALID_PHASE');
  migrationAssertEvidence_(evidence, prepared.intent.resources);
  migrationAssertReceipt_(value, 0);
  return migrationJournalSeal_({ intent: prepared.intent, revision: prepared.revision, phase: 'APPLIED',
    evidence: evidence, receipt: migrationEncode_(value) });
}

function migrationExecuteTracked_(context, adapter) {
  // Reauthorize even duplicate requests. State-specific business validation runs
  // only for new operations (a completed deletion need not still exist). No request body,
  // credential, token or raw error is retained by this protocol.
  var intent = migrationOperationIntent_(context);
  ['authorize', 'validate', 'load', 'reserve', 'applySource', 'flushSource', 'captureAfter', 'complete'].forEach(function(method) {
    if (!adapter || typeof adapter[method] !== 'function') throw migrationError_('MIGRATION_INVALID_JOURNAL_ADAPTER');
  });
  if (migrationSourceOperationActive_) throw migrationError_('MIGRATION_NESTED_OPERATION');
  migrationSourceOperationActive_ = true;
  try { return migrationWithSourceLock_(function() {
    adapter.authorize();
    var previous = migrationJournalLoad_(adapter, intent.operationKey);
    if (previous) {
      migrationAssertOperation_(previous, intent);
      if (previous.phase === 'PREPARED') throw migrationError_('MIGRATION_SOURCE_REVIEW_REQUIRED');
      return { value: migrationDecode_(previous.receipt), status: 'SOURCE_SAVED', revision: previous.revision, duplicate: true };
    }
    adapter.validate();
    try { adapter.reserve(intent); }
    catch (_) { throw migrationError_('MIGRATION_INTENT_NOT_CONFIRMED'); }
    // Read-back is mandatory; a lost response never causes automatic source replay.
    var prepared = migrationJournalLoad_(adapter, intent.operationKey);
    migrationAssertOperation_(prepared, intent);
    if (prepared.phase !== 'PREPARED') throw migrationError_('MIGRATION_INVALID_PHASE');
    var value;
    try { value = adapter.applySource(); adapter.flushSource(); }
    catch (_) { throw migrationError_('MIGRATION_SOURCE_OUTCOME_UNKNOWN'); }
    // Source success must survive a capture/journal/replica outage. PREPARED remains
    // a durable recovery signal and blocks cutover until independently reconciled.
    try {
      var evidence = adapter.captureAfter(prepared.revision);
      var completed = migrationAppliedOperation_(prepared, evidence, value);
      adapter.complete(completed);
      var confirmed = migrationJournalLoad_(adapter, intent.operationKey);
      migrationAssertOperation_(confirmed, intent);
      if (confirmed.recordHash !== completed.recordHash) throw migrationError_('MIGRATION_COMPLETION_NOT_CONFIRMED');
      return { value: value, status: 'SOURCE_SAVED', revision: prepared.revision, duplicate: false };
    } catch (_) {
      return { value: value, status: 'SOURCE_SAVED_TRACKING_PENDING', revision: prepared.revision, duplicate: false };
    }
  }); } finally { migrationSourceOperationActive_ = false; }
}
