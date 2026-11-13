/** Private Sheets journal. No initialization or writes at module load. */
function migrationStoreNames_() {
  return { meta: '_UNG_MIG_META_V1', journal: '_UNG_MIG_JOURNAL_V1', blobs: '_UNG_MIG_BLOBS_V1', ids: '_UNG_MIG_IDS_' };
}
function migrationStoreSeal_(value) {
  var copy = JSON.parse(JSON.stringify(value)); delete copy.checksum;
  copy.checksum = migrationHash_(copy);
  if (JSON.stringify(copy).length > 39000) throw migrationError_('MIGRATION_STORE_RECORD_TOO_LARGE');
  return copy;
}
function migrationStoreAssert_(value) {
  if (!value || migrationStoreSeal_(value).checksum !== value.checksum) throw migrationError_('MIGRATION_STORE_CORRUPT');
  return value;
}
function migrationInitializeStore_(book) {
  return migrationWithSourceLock_(function() {
    var names = migrationStoreNames_();
    var definitions = [[names.meta, ['schema', 'sourceBookId', 'highWater']], [names.journal, ['operationKey', 'recordJson']], [names.blobs, ['blobKey', 'part', 'parts', 'encoded']]];
    definitions.forEach(function(item) {
      var sheet = book.getSheetByName(item[0]);
      if (!sheet) sheet = book.insertSheet(item[0]);
      if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, item[1].length).setValues([item[1]]);
      if (migrationHash_(sheet.getRange(1, 1, 1, item[1].length).getValues()[0]) !== migrationHash_(item[1])) throw migrationError_('MIGRATION_STORE_SCHEMA_MISMATCH');
      sheet.hideSheet();
    });
    var meta = book.getSheetByName(names.meta);
    if (meta.getLastRow() === 1) meta.getRange(2, 1, 1, 3).setValues([[1, book.getId(), 0]]);
    SpreadsheetApp.flush();
    return migrationSheetsStore_(book).status();
  });
}
function migrationSheetsStore_(book) {
  var names = migrationStoreNames_();
  var meta = book.getSheetByName(names.meta), journal = book.getSheetByName(names.journal), blobs = book.getSheetByName(names.blobs);
  if (!meta || !journal || !blobs) throw migrationError_('MIGRATION_STORE_NOT_INITIALIZED');
  function locked() { if (migrationSourceLockDepth_ < 1) throw migrationError_('MIGRATION_LOCK_REQUIRED'); }
  function capacity(sheet, row, columns) {
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
    if (columns > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }
  function state() {
    var values = meta.getRange(2, 1, 1, 3).getValues()[0];
    if (values[0] !== 1 || values[1] !== book.getId() || !Number.isSafeInteger(values[2]) || values[2] < 0) throw migrationError_('MIGRATION_STORE_CORRUPT');
    // Gaps from failed reservations are allowed; a journal beyond its high-water is not.
    if (journal.getLastRow() > values[2] + 1) throw migrationError_('MIGRATION_STORE_REVISION_CORRUPT');
    return values[2];
  }
  function find(sheet, key) {
    if (sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).matchCase(true).useRegularExpression(false).findAll();
  }
  function load(key) {
    var found = find(journal, key);
    if (!found.length) return null;
    if (found.length !== 1) throw migrationError_('MIGRATION_DUPLICATE_OPERATION');
    var row = found[0].getRow(), cells = journal.getRange(row, 1, 1, 2).getValues()[0], record;
    try { record = JSON.parse(cells[1]); } catch (_) { throw migrationError_('MIGRATION_STORE_CORRUPT'); }
    migrationStoreAssert_(record);
    if (record.schemaVersion !== 2 || record.intent.operationKey !== key || record.revision !== row - 1 || record.revision > state()) throw migrationError_('MIGRATION_STORE_CORRUPT');
    return record;
  }
  function save(record) {
    locked(); var sealed = migrationStoreSeal_(record), row = sealed.revision + 1;
    capacity(journal, row, 2);
    journal.getRange(row, 1, 1, 2).setValues([[sealed.intent.operationKey, JSON.stringify(sealed)]]);
    SpreadsheetApp.flush();
    var confirmed = load(sealed.intent.operationKey);
    if (!confirmed || confirmed.checksum !== sealed.checksum) throw migrationError_('MIGRATION_STORE_WRITE_NOT_CONFIRMED');
    return confirmed;
  }
  function readBlob(key) {
    if (!/^[a-f0-9]{64}$/.test(key || '')) throw migrationError_('MIGRATION_INVALID_BLOB_KEY');
    var found = find(blobs, key);
    if (!found.length) return null;
    var rows = found.map(function(cell) { return blobs.getRange(cell.getRow(), 1, 1, 4).getValues()[0]; }).sort(function(a, b) { return a[1] - b[1]; });
    if (rows[0][2] !== rows.length || rows.length > 256) throw migrationError_('MIGRATION_BLOB_INCOMPLETE');
    var encoded = '';
    rows.forEach(function(row, index) {
      if (row[0] !== key || row[1] !== index || row[2] !== rows.length || typeof row[3] !== 'string' || row[3].slice(0, 3) !== 'z1:') throw migrationError_('MIGRATION_BLOB_CORRUPT');
      encoded += row[3].slice(3);
    });
    var payload;
    try { payload = JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString('UTF-8')); }
    catch (_) { throw migrationError_('MIGRATION_BLOB_CORRUPT'); }
    if (migrationHash_(payload) !== key) throw migrationError_('MIGRATION_BLOB_CORRUPT');
    return payload;
  }
  function putBlob(payload) {
    locked(); var key = migrationHash_(payload), existing = readBlob(key);
    if (existing !== null) return key;
    var compressed = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(payload), 'application/json')).getBytes());
    var count = Math.ceil(compressed.length / 36000), rows = [];
    if (!count || count > 256) throw migrationError_('MIGRATION_BLOB_TOO_LARGE');
    for (var i = 0; i < count; i++) rows.push([key, i, count, 'z1:' + compressed.slice(i * 36000, (i + 1) * 36000)]);
    var start = blobs.getLastRow() + 1; capacity(blobs, start + count - 1, 4);
    blobs.getRange(start, 1, count, 4).setValues(rows); SpreadsheetApp.flush();
    if (!readBlob(key)) throw migrationError_('MIGRATION_BLOB_WRITE_NOT_CONFIRMED');
    return key;
  }
  function reserve(intent, accessMode) {
    locked(); if (load(intent.operationKey)) throw migrationError_('MIGRATION_DUPLICATE_OPERATION');
    var next = state() + 1;
    if (!Number.isSafeInteger(next) || next > 1000000) throw migrationError_('MIGRATION_JOURNAL_CAPACITY');
    // Reserve the number before the row: interruptions create gaps, never reuse revisions.
    meta.getRange(2, 3).setValue(next); SpreadsheetApp.flush();
    if (state() !== next) throw migrationError_('MIGRATION_REVISION_NOT_CONFIRMED');
    return save({ schemaVersion: 2, intent: intent, accessMode: accessMode || 'STAFF', revision: next, phase: 'PREPARED',
      touched: [], evidence: [], receiptRef: null, replayable: false, failureCode: null });
  }
  function touch(record, resource, before) {
    locked(); var current = load(record.intent.operationKey);
    if (!current || current.phase !== 'PREPARED' || current.revision !== record.revision || current.intent.resources.indexOf(resource) < 0) throw migrationError_('MIGRATION_INVALID_PHASE');
    if (current.touched.some(function(item) { return item.resource === resource; })) return current;
    var ref = putBlob(before);
    current.touched.push({resource: resource, beforeRef: ref});
    return save(current);
  }
  function finish(record, evidence, responseText, success) {
    locked(); var current = load(record.intent.operationKey);
    if (!current || current.revision !== record.revision || current.phase !== 'PREPARED') throw migrationError_('MIGRATION_INVALID_PHASE');
    var expected = current.touched.map(function(item) { return item.resource; }).sort();
    var actual = evidence.map(function(item) { return item.resource; }).sort();
    if (migrationHash_(expected) !== migrationHash_(actual)) throw migrationError_('MIGRATION_EVIDENCE_INCOMPLETE');
    evidence.forEach(function(item) { if (!readBlob(item.deltaRef)) throw migrationError_('MIGRATION_BLOB_INCOMPLETE'); });
    current.evidence = evidence; current.phase = success ? 'APPLIED' : 'REVIEW_REQUIRED';
    current.failureCode = success ? null : 'SOURCE_OUTCOME_REQUIRES_REVIEW';
    if (success && responseText !== null) {
      var response = JSON.parse(responseText); migrationAssertReceipt_(response, 0);
      current.receiptRef = putBlob({responseText: responseText}); current.replayable = true;
    }
    return save(current);
  }
  function identityMap(resource, keys) {
    locked(); if (migrationCatalog_().every(function(item) { return item.resource !== resource; })) throw migrationError_('MIGRATION_INVALID_RESOURCE');
    var sheetName = names.ids + resource, sheet = book.getSheetByName(sheetName);
    if (!sheet) { sheet = book.insertSheet(sheetName); sheet.getRange(1, 1, 1, 2).setValues([['keyHash','sourceId']]); sheet.hideSheet(); SpreadsheetApp.flush(); }
    var existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [], map = Object.create(null), ids = Object.create(null), added = [];
    existing.forEach(function(row) {
      if (!/^[a-f0-9]{64}$/.test(row[0]) || !/^[A-Za-z0-9_-]{8,100}$/.test(row[1]) || map[row[0]] || ids[row[1]]) throw migrationError_('MIGRATION_ID_MAP_CORRUPT');
      map[row[0]] = row[1]; ids[row[1]] = true;
    });
    keys.forEach(function(key) {
      if (!/^[a-f0-9]{64}$/.test(key)) throw migrationError_('MIGRATION_INVALID_IDENTITY');
      if (!map[key]) { map[key] = Utilities.getUuid(); added.push([key, map[key]]); }
    });
    if (added.length) {
      var start = sheet.getLastRow() + 1; capacity(sheet, start + added.length - 1, 2);
      sheet.getRange(start, 1, added.length, 2).setValues(added); SpreadsheetApp.flush();
      if (migrationHash_(sheet.getRange(start, 1, added.length, 2).getValues()) !== migrationHash_(added)) throw migrationError_('MIGRATION_ID_MAP_NOT_CONFIRMED');
    }
    return map;
  }
  function status() {
    var highWater = state(), pending = 0, applied = 0, review = 0;
    var rowsToRead = Math.min(highWater, Math.max(0, journal.getLastRow() - 1)), gaps = highWater - rowsToRead;
    // Manual admin inspection only. Never run this full journal scan on ordinary requests.
    // A reservation may fail before the journal grows. Count the missing tail
    // without reading beyond the sheet grid or allocating rows during inspection.
    if (rowsToRead) journal.getRange(2, 1, rowsToRead, 2).getValues().forEach(function(row, index) {
      if (!row[0] && !row[1]) { gaps++; return; }
      var record; try { record = JSON.parse(row[1]); } catch (_) { throw migrationError_('MIGRATION_STORE_CORRUPT'); }
      migrationStoreAssert_(record);
      if (record.revision !== index + 1 || record.intent.operationKey !== row[0]) throw migrationError_('MIGRATION_STORE_CORRUPT');
      if (record.phase === 'APPLIED') applied++; else if (record.phase === 'PREPARED') pending++; else if (record.phase === 'REVIEW_REQUIRED') review++; else throw migrationError_('MIGRATION_STORE_CORRUPT');
    });
    return {highWater: highWater, pendingCount: pending, reviewCount: review, appliedCount: applied, reservationGaps: gaps};
  }
  return {load: load, reserve: reserve, touch: touch, finish: finish, putBlob: putBlob, readBlob: readBlob, identityMap: identityMap, status: status};
}
