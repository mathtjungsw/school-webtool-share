/**
 * 웅천고 업무도우미 학교 공유 서비스
 *
 * Google 스프레드시트에 바인딩된 Apps Script로 사용합니다.
 * 학생 개인정보를 저장하지 마세요. 교사 시간표는 학교 내부 공유용입니다.
 */

const LINKS_SHEET = '공유링크';
const NOTICES_SHEET = '공지';
const FEATURE_REQUESTS_SHEET = '기능개선요청';
const TIMETABLE_META_SHEET = '시간표정보';
const TIMETABLE_SHEET = '시간표';
const ADMIN_HASH_KEY = 'UNG_ADMIN_PASSWORD_SHA256';
const TIMETABLE_SLOT_COUNT = 35;

function doGet() {
  return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 3 } });
}

function doPost(e) {
  try {
    ensureSheets_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');

    if (action === 'health') return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 3 } });
    if (action === 'verifyAdmin') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: { verified: true } });
    }
    if (action === 'listLinks') return json_({ ok: true, data: listLinks_() });
    if (action === 'addLink') return json_({ ok: true, data: addLink_(body) });
    if (action === 'deleteLink') {
      requireAdmin_(body.adminPassword);
      deleteRowById_(LINKS_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'listNotices') return json_({ ok: true, data: listNotices_() });
    if (action === 'addNotice') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: addNotice_(body) });
    }
    if (action === 'deleteNotice') {
      requireAdmin_(body.adminPassword);
      deleteRowById_(NOTICES_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'listFeatureRequests') return json_({ ok: true, data: listFeatureRequests_() });
    if (action === 'addFeatureRequest') return json_({ ok: true, data: addFeatureRequest_(body) });
    if (action === 'updateFeatureRequest') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: updateFeatureRequest_(body) });
    }
    if (action === 'deleteFeatureRequest') {
      requireAdmin_(body.adminPassword);
      deleteRowById_(FEATURE_REQUESTS_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'getTimetable') return json_({ ok: true, data: getTimetable_() });
    if (action === 'replaceTimetable') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceTimetable_(body) });
    }
    throw new Error('허용되지 않는 요청입니다.');
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

/**
 * 최초 1회 실행합니다.
 * 아래 임시 비밀번호를 원하는 관리자 비밀번호로 바꾸고 실행한 뒤,
 * 코드에는 다시 CHANGE_ME를 넣어 저장하세요.
 */
function initialSetup() {
  const temporaryAdminPassword = 'CHANGE_ME';
  if (temporaryAdminPassword === 'CHANGE_ME') {
    throw new Error('temporaryAdminPassword를 원하는 비밀번호로 변경한 뒤 실행하세요.');
  }
  ensureSheets_();
  PropertiesService.getScriptProperties().setProperty(
    ADMIN_HASH_KEY,
    sha256_(temporaryAdminPassword)
  );
}

function ensureSheets_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('이 스크립트를 Google 스프레드시트에 연결하세요.');

  let links = book.getSheetByName(LINKS_SHEET);
  if (!links) {
    links = book.insertSheet(LINKS_SHEET);
    links.appendRow(['id', 'department', 'title', 'url', 'description', 'registeredBy', 'createdAt']);
    links.setFrozenRows(1);
  }

  let notices = book.getSheetByName(NOTICES_SHEET);
  if (!notices) {
    notices = book.insertSheet(NOTICES_SHEET);
    notices.appendRow(['id', 'title', 'body', 'level', 'date', 'expiresAt']);
    notices.setFrozenRows(1);
  }

  let requests = book.getSheetByName(FEATURE_REQUESTS_SHEET);
  if (!requests) {
    requests = book.insertSheet(FEATURE_REQUESTS_SHEET);
    requests.appendRow([
      'id', 'requestType', 'title', 'content', 'author',
      'createdAt', 'status', 'adminReply', 'updatedAt'
    ]);
    requests.setFrozenRows(1);
  }

  let timetableMeta = book.getSheetByName(TIMETABLE_META_SHEET);
  if (!timetableMeta) {
    timetableMeta = book.insertSheet(TIMETABLE_META_SHEET);
    timetableMeta.appendRow(['version', 'title', 'sourceFileName', 'uploadedBy', 'uploadedAt', 'teacherCount']);
    timetableMeta.setFrozenRows(1);
  }

  let timetable = book.getSheetByName(TIMETABLE_SHEET);
  const timetableHeaders = ['teacherName', 'teacherLabel', 'load'];
  for (let slot = 1; slot <= TIMETABLE_SLOT_COUNT; slot++) timetableHeaders.push('slot' + slot);
  for (let locked = 1; locked <= TIMETABLE_SLOT_COUNT; locked++) timetableHeaders.push('locked' + locked);
  if (!timetable) {
    timetable = book.insertSheet(TIMETABLE_SHEET);
    timetable.setFrozenRows(1);
  }
  if (timetable.getMaxColumns() < timetableHeaders.length) {
    timetable.insertColumnsAfter(timetable.getMaxColumns(), timetableHeaders.length - timetable.getMaxColumns());
  }
  timetable.getRange(1, 1, 1, timetableHeaders.length).setValues([timetableHeaders]);
}

function listLinks_() {
  const rows = readObjects_(LINKS_SHEET);
  return rows
    .map(function(row) {
      return {
        id: String(row.id || ''),
        department: String(row.department || ''),
        title: String(row.title || ''),
        url: String(row.url || ''),
        description: String(row.description || ''),
        registeredBy: String(row.registeredBy || ''),
        createdAt: iso_(row.createdAt)
      };
    })
    .filter(function(row) { return row.id && row.title && row.url; })
    .sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function addLink_(body) {
  const department = clean_(body.department, 40);
  const title = clean_(body.title, 80);
  const url = clean_(body.url, 500);
  const description = clean_(body.description, 200);
  const registeredBy = clean_(body.registeredBy, 30) || '교직원';

  if (!department || !title || !url) throw new Error('부서, 이름, URL을 모두 입력하세요.');
  if (!/^https?:\/\//i.test(url)) throw new Error('http 또는 https 주소만 등록할 수 있습니다.');

  const existing = listLinks_();
  if (existing.some(function(link) { return link.url.toLowerCase() === url.toLowerCase(); })) {
    throw new Error('이미 등록된 URL입니다.');
  }

  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LINKS_SHEET)
    .appendRow([id, department, title, url, description, registeredBy, createdAt]);
  return { id: id };
}

function listNotices_() {
  return readObjects_(NOTICES_SHEET)
    .map(function(row) {
      return {
        id: Number(row.id),
        title: String(row.title || ''),
        body: String(row.body || ''),
        level: ['info', 'important', 'urgent'].indexOf(String(row.level)) >= 0 ? String(row.level) : 'info',
        date: dateOnly_(row.date),
        expiresAt: row.expiresAt ? dateOnly_(row.expiresAt) : ''
      };
    })
    .filter(function(row) { return Number.isFinite(row.id) && row.title; })
    .sort(function(a, b) { return b.id - a.id; });
}

function addNotice_(body) {
  const title = clean_(body.title, 100);
  const content = clean_(body.body, 3000);
  const level = ['info', 'important', 'urgent'].indexOf(String(body.level)) >= 0
    ? String(body.level) : 'info';
  const expiresAt = clean_(body.expiresAt, 10);
  if (!title || !content) throw new Error('공지 제목과 내용을 입력하세요.');
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw new Error('만료일 형식이 올바르지 않습니다.');

  const notices = listNotices_();
  const id = notices.reduce(function(max, notice) { return Math.max(max, notice.id); }, 0) + 1;
  const date = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTICES_SHEET)
    .appendRow([id, title, content, level, date, expiresAt]);
  return { id: id };
}

function listFeatureRequests_() {
  return readObjects_(FEATURE_REQUESTS_SHEET)
    .map(function(row) {
      const requestType = ['new', 'improvement'].indexOf(String(row.requestType)) >= 0
        ? String(row.requestType) : 'new';
      const status = ['submitted', 'reviewing', 'planned', 'completed', 'declined']
        .indexOf(String(row.status)) >= 0 ? String(row.status) : 'submitted';
      return {
        id: String(row.id || ''),
        requestType: requestType,
        title: String(row.title || ''),
        content: String(row.content || ''),
        author: String(row.author || ''),
        createdAt: iso_(row.createdAt),
        status: status,
        adminReply: String(row.adminReply || ''),
        updatedAt: row.updatedAt ? iso_(row.updatedAt) : ''
      };
    })
    .filter(function(row) { return row.id && row.title && row.author; })
    .sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function addFeatureRequest_(body) {
  const requestType = ['new', 'improvement'].indexOf(String(body.requestType)) >= 0
    ? String(body.requestType) : 'new';
  const title = clean_(body.title, 100);
  const content = clean_(body.content, 3000);
  const author = clean_(body.author, 30);
  if (!title || !content) throw new Error('요청 제목과 내용을 입력하세요.');
  if (author.length < 2) throw new Error('작성자 실명을 두 글자 이상 입력하세요.');

  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEATURE_REQUESTS_SHEET)
    .appendRow([id, requestType, title, content, author, createdAt, 'submitted', '', '']);
  return { id: id };
}

function updateFeatureRequest_(body) {
  const id = clean_(body.id, 100);
  const allowedStatuses = ['submitted', 'reviewing', 'planned', 'completed', 'declined'];
  const status = String(body.status || '');
  const adminReply = clean_(body.adminReply, 1000);
  if (!id) throw new Error('처리할 요청 ID가 없습니다.');
  if (allowedStatuses.indexOf(status) < 0) throw new Error('처리 상태가 올바르지 않습니다.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEATURE_REQUESTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idIndex = headers.indexOf('id');
  const statusIndex = headers.indexOf('status');
  const replyIndex = headers.indexOf('adminReply');
  const updatedIndex = headers.indexOf('updatedAt');
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][idIndex]) === id) {
      sheet.getRange(row + 1, statusIndex + 1).setValue(status);
      sheet.getRange(row + 1, replyIndex + 1).setValue(adminReply);
      sheet.getRange(row + 1, updatedIndex + 1).setValue(new Date().toISOString());
      return { id: id };
    }
  }
  throw new Error('처리할 요청을 찾을 수 없습니다.');
}

function getTimetable_() {
  const metaRows = readObjects_(TIMETABLE_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const teachers = readObjects_(TIMETABLE_SHEET)
    .map(function(row) {
      const slots = [];
      for (let slot = 1; slot <= TIMETABLE_SLOT_COUNT; slot++) {
        slots.push({
          value: String(row['slot' + slot] || ''),
          locked: row['locked' + slot] === true || String(row['locked' + slot]).toUpperCase() === 'TRUE'
        });
      }
      return {
        name: String(row.teacherName || ''),
        label: String(row.teacherLabel || ''),
        load: String(row.load || ''),
        slots: slots
      };
    })
    .filter(function(teacher) { return teacher.name; });

  return {
    version: Number(meta.version) || 1,
    title: String(meta.title || ''),
    sourceFileName: String(meta.sourceFileName || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    teachers: teachers
  };
}

function replaceTimetable_(body) {
  const timetable = body.timetable || {};
  const teachers = Array.isArray(timetable.teachers) ? timetable.teachers : [];
  if (!teachers.length) throw new Error('업로드할 교사 시간표가 없습니다.');
  if (teachers.length > 120) throw new Error('교사 수는 120명을 초과할 수 없습니다.');

  const title = clean_(timetable.title, 100) || '주간시간표';
  const sourceFileName = clean_(timetable.sourceFileName, 200);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();
  const existing = readObjects_(TIMETABLE_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const rows = teachers.map(function(teacher) {
    const name = clean_(teacher.name, 30);
    const label = clean_(teacher.label, 50) || name;
    const load = clean_(teacher.load, 20);
    const slots = Array.isArray(teacher.slots) ? teacher.slots : [];
    if (!name) throw new Error('교사 이름이 없는 행이 있습니다.');
    if (slots.length !== TIMETABLE_SLOT_COUNT) throw new Error(name + ' 교사의 시간표가 35칸이 아닙니다.');

    const row = [name, label, load];
    slots.forEach(function(slot) { row.push(clean_(slot && slot.value, 200)); });
    slots.forEach(function(slot) { row.push(Boolean(slot && slot.locked)); });
    return row;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = book.getSheetByName(TIMETABLE_SHEET);
    const metaSheet = book.getSheetByName(TIMETABLE_META_SHEET);
    if (dataSheet.getLastRow() > 1) {
      dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, dataSheet.getLastColumn()).clearContent();
    }
    dataSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

    if (metaSheet.getLastRow() > 1) {
      metaSheet.getRange(2, 1, metaSheet.getLastRow() - 1, metaSheet.getLastColumn()).clearContent();
    }
    metaSheet.getRange(2, 1, 1, 6)
      .setValues([[version, title, sourceFileName, uploadedBy, uploadedAt, rows.length]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function deleteRowById_(sheetName, id) {
  if (!id) throw new Error('삭제할 항목 ID가 없습니다.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][0]) === id) {
      sheet.deleteRow(row + 1);
      return;
    }
  }
  throw new Error('삭제할 항목을 찾을 수 없습니다.');
}

function requireAdmin_(password) {
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_KEY);
  if (!stored) throw new Error('관리자 비밀번호가 아직 설정되지 않았습니다.');
  if (!password || sha256_(String(password)) !== stored) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
}

function readObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function(row) {
    const item = {};
    headers.forEach(function(header, index) { item[header] = row[index]; });
    return item;
  });
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function iso_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? String(value || '') : date.toISOString();
}

function dateOnly_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!isNaN(date.getTime())) return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
