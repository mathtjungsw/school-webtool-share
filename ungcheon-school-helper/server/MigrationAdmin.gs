/** Read-only metadata/status endpoints. No initialization or automatic polling. */
function migrationCatalog_() {
  return [
    ['links', '공유링크', 'id'], ['notices', '공지', 'id'], ['featureRequests', '기능개선요청', 'id'],
    ['teacherTimetableMeta', '시간표정보', 'revision'], ['teacherRows', '시간표', 'identity-map-required'],
    ['studentTimetableMeta', '학생시간표정보', 'revision'], ['studentRows', '학생시간표', 'studentId'],
    ['staffMeta', '교원명렬정보', 'revision'], ['staff', '교원명렬', 'id'],
    ['studentsMeta', '학생명렬정보', 'revision'], ['students', '학생명렬', 'studentId'],
    ['checklists', '업무체크리스트', 'id'], ['checklistResponses', '업무체크응답', 'identity-map-required'],
    ['committees', '위원회명단', 'committeeId'], ['committeeEvents', '위원회일정', 'id'],
    ['timetableChanges', '교환대강반영', 'id'], ['timetableOverrides', '일일시간표예외', 'id'],
    ['timetableOverrideHistory', '일일시간표예외이력', 'id'],
    ['neisMeta', 'NEIS동기화정보', 'revision'], ['meals', 'NEIS급식', 'identity-map-required'],
    ['schoolSchedules', 'NEIS학사일정', 'identity-map-required'], ['classTimetables', 'NEIS학급시간표', 'identity-map-required']
  ].map(function(item) { return { resource: item[0], sheetName: item[1], identity: item[2] }; });
}

function migrationAdminStatus_(body) {
  requireAdmin_(body.adminPassword);
  var operational = typeof migrationOperationsStatus_ === 'function' ? migrationOperationsStatus_() : null;
  if (operational) return Object.assign({schemaVersion:1,mode:'SHEETS_PRIMARY',activeBackend:'SHEETS',cutoverReady:false},operational);
  var config = typeof migrationTrackingConfig_ === 'function' ? migrationTrackingConfig_() : null;
  var measured = null;
  if (config) measured = migrationWithSourceLock_(function() {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book || book.getId() !== config.sourceBookId) throw migrationError_('MIGRATION_SOURCE_MISMATCH');
    return migrationSheetsStore_(book).status();
  });
  // Unknown counters stay null. A prepared tool is not a running replication job.
  return {
    schemaVersion: 1, phase: measured ? 'TRACKING' : 'PREPARING', mode: 'SHEETS_PRIMARY', activeBackend: 'SHEETS',
    replicaConnected: false, liveTrackingEnabled: !!measured, cutoverReady: false,
    pendingCount: measured ? measured.appliedCount + measured.resolvedCount + measured.pendingCount + measured.reviewCount : null,
    errorCount: measured ? measured.pendingCount + measured.reviewCount : null, verifiedRevision: null,
    recordedRevision: measured ? measured.highWater : null,
    resources: migrationCatalog_().map(function(item) {
      return { resource: item.resource, sheetName: item.sheetName, identity: item.identity, status: measured ? 'TRACKING_PRE_COPY' : 'NOT_INSPECTED' };
    })
  };
}

function migrationAdminInventory_(body) {
  requireAdmin_(body.adminPassword);
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw migrationError_('MIGRATION_SOURCE_UNAVAILABLE');
  var catalog = migrationCatalog_();
  var knownNames = catalog.map(function(item) { return item.sheetName; });
  // Metadata only. getLastRow is an upper bound, not a non-empty record count.
  var resources = catalog.map(function(item) {
    var sheet = book.getSheetByName(item.sheetName);
    return {
      resource: item.resource, sheetName: item.sheetName, identity: item.identity,
      exists: !!sheet, usedRowsUpperBound: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
      usedColumns: sheet ? sheet.getLastColumn() : 0, status: 'METADATA_ONLY'
    };
  });
  return {
    inspectedAt: new Date().toISOString(), source: 'SHEETS', consistentSnapshot: false,
    resources: resources,
    unclassifiedSheetCount: book.getSheets().filter(function(sheet) { return knownNames.indexOf(sheet.getName()) < 0 && sheet.getName().indexOf('_UNG_MIG_') !== 0; }).length,
    externalSourcesInspected: false, rowValuesRead: false
  };
}
