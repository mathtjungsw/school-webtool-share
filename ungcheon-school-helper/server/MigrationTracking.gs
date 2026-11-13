/** Lazy change tracking: reserve and preserve before-images BEFORE the first write.
 * Existing API responses and credentials are never sent to Firestore by this module.
 */
var migrationRouteActive_ = false;
var migrationTrackingContext_ = null;
function migrationTrackingConfig_() {
  var text = PropertiesService.getScriptProperties().getProperty('UNG_MIGRATION_TRACKING_V1');
  if (!text) return null;
  var config; try { config = JSON.parse(text); } catch (_) { throw migrationError_('MIGRATION_INVALID_TRACKING_CONFIG'); }
  if (config.schemaVersion !== 1 || config.enabled !== true || typeof config.sourceBookId !== 'string') throw migrationError_('MIGRATION_INVALID_TRACKING_CONFIG');
  return config;
}
function migrationCompatibleLock_() {
  var opened = false, nativeLock = null, owns = false;
  return {
    waitLock: function(timeout) {
      if (opened) throw migrationError_('MIGRATION_LOCK_REUSE');
      if (migrationSourceLockDepth_ === 0) { nativeLock = LockService.getScriptLock(); nativeLock.waitLock(timeout); owns = true; migrationSourceLockGeneration_++; }
      migrationSourceLockDepth_++; opened = true;
    },
    releaseLock: function() {
      if (!opened) return;
      opened = false; migrationSourceLockDepth_--;
      if (owns) { if (migrationSourceLockDepth_ !== 0) throw migrationError_('MIGRATION_LOCK_ORDER'); nativeLock.releaseLock(); }
    }
  };
}
function migrationSourceBook_() {
  if (migrationTrackingContext_) return migrationTrackingContext_.facade;
  var book = SpreadsheetApp.getActiveSpreadsheet();
  // Direct editor calls and accidental future routes cannot silently bypass the
  // journal after activation. Pure reads still use the same native data.
  if (book && migrationTrackingConfig_()) return migrationBookFacade_(book, {
    touch: function() { throw migrationError_('MIGRATION_UNTRACKED_WRITE'); }
  });
  return book;
}
function migrationShouldTrack_(action) {
  // Pure reads stay off the journal/lock path. The roster read can run a legacy repair.
  return action === 'getStaffRoster' || GET_READ_ACTIONS.indexOf(action) < 0;
}
function migrationBusinessRequest_(body) {
  function copy(value, depth) {
    if (depth > 20) throw migrationError_('MIGRATION_REQUEST_TOO_DEEP');
    if (Array.isArray(value)) return value.map(function(item) { return copy(item, depth + 1); });
    if (value && typeof value === 'object') {
      var result = Object.create(null);
      Object.keys(value).forEach(function(key) {
        if (!/password|token|secret|credential|authorization/i.test(key) && key !== 'operationId') result[key] = copy(value[key], depth + 1);
      });
      return result;
    }
    return value;
  }
  return copy(body, 0);
}
function migrationAuthorizeWrite_(body, previous) {
  var adminActions = ['verifyAdmin','deleteLink','addNotice','deleteNotice','updateFeatureRequest','deleteFeatureRequest',
    'replaceTimetable','replaceStudentTimetable','replaceStaffRoster','replaceStudentRoster','saveTimetableOverride',
    'deactivateTimetableOverride','registerNeisSyncDevice','revokeNeisSyncDevice'];
  if (adminActions.indexOf(body.action) >= 0 || (previous && previous.accessMode === 'ADMIN')) {
    requireAdmin_(body.adminPassword); return 'ADMIN';
  }
  if (body.action === 'replaceNeisSnapshot') requireNeisSyncDevice_(body);
  if (['updateStaffChecklist','deleteStaffChecklist'].indexOf(body.action) >= 0 && body.adminPassword && isAdminPassword_(body.adminPassword)) return 'ADMIN';
  return 'STAFF';
}
function migrationTrackedRoute_(body, session, callback, suppliedConfig, suppliedBook) {
  migrationRouteActive_ = true;
  try {
    var config = suppliedConfig || migrationTrackingConfig_();
    if (!config) return callback();
    var book = suppliedBook || SpreadsheetApp.getActiveSpreadsheet();
    if (!book || book.getId() !== config.sourceBookId) throw migrationError_('MIGRATION_SOURCE_MISMATCH');
    if (!session || !session.name) throw migrationError_('MIGRATION_AUTH_REQUIRED');
    return migrationWithSourceLock_(function() {
      var store = migrationSheetsStore_(book);
      var operationId = body.operationId || (body.action === 'addStaffChecklist' ? body.requestId : '') || Utilities.getUuid();
      var intent = migrationOperationIntent_({actorHash: migrationHash_(session.name), action: body.action,
        requestHash: migrationHash_(migrationBusinessRequest_(body)), operationId: operationId,
        resources: migrationCatalog_().map(function(item) { return item.resource; })});
      var previous = store.load(intent.operationKey);
      var accessMode = migrationAuthorizeWrite_(body, previous);
      if (previous) {
        if (migrationHash_(previous.intent) !== migrationHash_(intent)) throw migrationError_('MIGRATION_OPERATION_CONFLICT');
        if (previous.phase !== 'APPLIED') throw migrationError_('MIGRATION_SOURCE_REVIEW_REQUIRED');
        if (!previous.replayable || !previous.receiptRef) throw migrationError_('MIGRATION_RESULT_NOT_REPLAYABLE');
        var receipt = store.readBlob(previous.receiptRef);
        if (!receipt || typeof receipt.responseText !== 'string') throw migrationError_('MIGRATION_STORE_CORRUPT');
        return ContentService.createTextOutput(receipt.responseText).setMimeType(ContentService.MimeType.JSON);
      }
      var context = {record: null, before: Object.create(null), facade: null};
      context.touch = function(sheetName) {
        var item = migrationResourceForSheet_(sheetName);
        if (!item) throw migrationError_('MIGRATION_UNCLASSIFIED_WRITE');
        if (context.before[item.resource]) return;
        if (!context.record) context.record = store.reserve(intent, accessMode);
        var before = migrationCaptureResource_(book, store, item.resource);
        context.record = store.touch(context.record, item.resource, before);
        context.before[item.resource] = before;
      };
      context.facade = migrationBookFacade_(book, context);
      migrationTrackingContext_ = context;
      var response;
      try { response = callback(); }
      finally { migrationTrackingContext_ = null; }
      if (!context.record) return response;
      try {
        SpreadsheetApp.flush();
        var text = response.getContent(), payload = JSON.parse(text), evidence = [];
        context.record.touched.forEach(function(item) {
          var after = migrationCaptureResource_(book, store, item.resource);
          var delta = migrationResourceDelta_(context.before[item.resource], after, context.record.revision);
          evidence.push({resource: item.resource, deltaRef: store.putBlob(delta), digest: delta.afterDigest, count: delta.count});
        });
        // Credential-issuing routes may run legacy initialization, but their response
        // must NEVER be journaled. Other writes retain their exact response envelope.
        var replayable = ['registerNeisSyncDevice', 'verifyAdmin'].indexOf(body.action) < 0;
        store.finish(context.record, evidence, replayable ? text : null, payload.ok === true);
      } catch (_) {
        // PREPARED is durable. Never report a successful source write as failed
        // because journaling/capture failed; retries cannot replay PREPARED writes.
      }
      return response;
    });
  } finally { migrationTrackingContext_ = null; migrationRouteActive_ = false; }
}

function migrationBookFacade_(book, context) {
  var facade = {getId: function() { return book.getId(); }};
  function sheetFacade(sheet, auxiliary) {
    if (!sheet) return null;
    var result = {};
    ['getName','getSheetId','getLastRow','getLastColumn','getMaxRows','getMaxColumns','getFrozenRows'].forEach(function(method) {
      result[method] = function() { return sheet[method].apply(sheet, arguments); };
    });
    function touch() { if (!auxiliary) context.touch(sheet.getName()); }
    function rangeFacade(range) {
      var wrapped = {};
      ['getValues','getDisplayValues','getFormulas','getNumberFormats','getRow','getColumn','getNumRows','getNumColumns'].forEach(function(method) {
        wrapped[method] = function() { return range[method].apply(range, arguments); };
      });
      ['setValue','setValues','clearContent','clearContents','setNumberFormat'].forEach(function(method) {
        wrapped[method] = function(value) {
          var existing;
          if (method === 'setValues' || method === 'setValue') {
            existing = range.getValues(); var expected = method === 'setValue' ? [[value]] : value;
            if (migrationHash_(existing) === migrationHash_(expected) && range.getFormulas().every(function(row) { return row.every(function(cell) { return cell === ''; }); })) return wrapped;
          } else if (method === 'setNumberFormat') {
            if (range.getNumberFormats().every(function(row) { return row.every(function(format) { return format === value; }); })) return wrapped;
          } else if (range.getValues().every(function(row) { return row.every(function(cell) { return cell === ''; }); }) && range.getFormulas().every(function(row) { return row.every(function(cell) { return cell === ''; }); })) return wrapped;
          touch(); range[method].apply(range, arguments); return wrapped;
        };
      });
      return wrapped;
    }
    result.getRange = function() { return rangeFacade(sheet.getRange.apply(sheet, arguments)); };
    result.getDataRange = function() { return rangeFacade(sheet.getDataRange()); };
    ['appendRow','deleteRow','deleteRows','insertRowsAfter','insertColumnsAfter','setFrozenRows'].forEach(function(method) {
      result[method] = function() { touch(); sheet[method].apply(sheet, arguments); return result; };
    });
    result.copyTo = function(destination) {
      if (destination !== facade) throw migrationError_('MIGRATION_UNEXPECTED_COPY_TARGET');
      touch(); return sheetFacade(sheet.copyTo(book), true);
    };
    result.setName = function(name) {
      if (!auxiliary || name !== '교원명렬_20261008_보관') throw migrationError_('MIGRATION_UNCLASSIFIED_WRITE');
      sheet.setName(name); return result;
    };
    return result;
  }
  facade.getSheetByName = function(name) { return sheetFacade(book.getSheetByName(name), name === '교원명렬_20261008_보관'); };
  facade.getSheets = function() { return book.getSheets().filter(function(sheet) { return sheet.getName().indexOf('_UNG_MIG_') !== 0; }).map(function(sheet) { return sheetFacade(sheet, sheet.getName() === '교원명렬_20261008_보관'); }); };
  facade.insertSheet = function(name) { context.touch(name); return sheetFacade(book.insertSheet(name), false); };
  return facade;
}
