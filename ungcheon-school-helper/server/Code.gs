/**
 * 웅천고 업무도우미 학교 공유 서비스
 *
 * Google 스프레드시트에 바인딩된 Apps Script로 사용합니다.
 * 학생·교직원 개인정보를 저장하지 마세요.
 */

const LINKS_SHEET = '공유링크';
const NOTICES_SHEET = '공지';
const ADMIN_HASH_KEY = 'UNG_ADMIN_PASSWORD_SHA256';

function doGet() {
  return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 1 } });
}

function doPost(e) {
  try {
    ensureSheets_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');

    if (action === 'health') return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 1 } });
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
