/** Affected-resource snapshots and deltas. Values stay in the private source book. */
function migrationResourceForSheet_(name) {
  var match = migrationCatalog_().filter(function(item) { return item.sheetName === name; });
  return match.length === 1 ? match[0] : null;
}
function migrationCaptureResource_(book, store, resource) {
  var item = migrationCatalog_().filter(function(entry) { return entry.resource === resource; })[0];
  if (!item) throw migrationError_('MIGRATION_INVALID_RESOURCE');
  var sheet = book.getSheetByName(item.sheetName);
  if (!sheet) return {schemaVersion: 1, resource: resource, present: false, headers: [], records: []};
  var count = sheet.getLastRow(), columns = sheet.getLastColumn();
  if (!count || !columns) return {schemaVersion: 1, resource: resource, present: true, headers: [], records: []};
  var range = sheet.getRange(1, 1, count, columns), values = range.getValues(), formulas = range.getFormulas();
  var headers = values[0].map(String), rows = [], identities = [], seen = Object.create(null);
  var natural = {
    teacherRows: ['teacherName', 'teacherLabel'], checklistResponses: ['checklistId', 'teacherName'],
    meals: ['date', 'mealType'], schoolSchedules: ['date', 'eventName', 'eventLevel'],
    classTimetables: ['date', 'grade', 'classNm', 'period', 'subject', 'teacher', 'classroom']
  };
  for (var i = 1; i < values.length; i++) {
    if (values[i].every(function(value, column) { return value === '' && !formulas[i][column]; })) continue;
    var identity;
    if (item.identity === 'revision') identity = 'singleton';
    else if (natural[resource]) {
      // Natural keys are matching tokens, never document IDs. A persistent UUID
      // map preserves identity across payload edits and row moves. A changed key
      // is a delete/create; ambiguous duplicate keys are rejected, never merged.
      var keyValues = natural[resource].map(function(header) {
        var column = headers.indexOf(header);
        if (column < 0) throw migrationError_('MIGRATION_IDENTITY_SCHEMA_MISSING');
        return values[i][column];
      });
      identity = migrationHash_({resource: resource, key: keyValues});
    } else {
      var index = headers.indexOf(item.identity);
      if (index < 0 || !String(values[i][index]).trim()) throw migrationError_('MIGRATION_SOURCE_ID_MISSING');
      identity = String(values[i][index]);
    }
    if (seen[identity]) throw migrationError_('MIGRATION_AMBIGUOUS_SOURCE_ID');
    seen[identity] = true; identities.push(identity);
    rows.push({sourceId: identity, sortOrder: i - 1, payload: migrationEncode_({cells: values[i], formulas: formulas[i]}), isDeleted: false});
  }
  if (natural[resource] && identities.length) {
    var mapping = store.identityMap(resource, identities);
    rows.forEach(function(row) { row.sourceId = mapping[row.sourceId]; });
  }
  return {schemaVersion: 1, resource: resource, present: true, headers: headers, records: rows};
}
function migrationResourceDelta_(before, after, revision) {
  if (before.resource !== after.resource || !Number.isSafeInteger(revision) || revision < 1) throw migrationError_('MIGRATION_INVALID_DELTA');
  var previous = Object.create(null), current = Object.create(null), puts = [], deletes = [];
  before.records.forEach(function(row) { previous[row.sourceId] = row; });
  after.records.forEach(function(row) {
    current[row.sourceId] = true;
    if (!previous[row.sourceId] || migrationHash_(previous[row.sourceId]) !== migrationHash_(row)) puts.push(row);
  });
  before.records.forEach(function(row) {
    if (!current[row.sourceId]) deletes.push({sourceId: row.sourceId, sortOrder: row.sortOrder, isDeleted: true});
  });
  return {schemaVersion: 1, resource: after.resource, revision: revision,
    beforeDigest: migrationHash_(before), afterDigest: migrationHash_(after),
    present: after.present, headers: after.headers, count: after.records.length, puts: puts, deletes: deletes};
}
