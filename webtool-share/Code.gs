/**
 * 학교용 웹툴 공유 페이지 - Google Apps Script 서버
 *
 * 권장 사용법: 데이터를 저장할 Google 스프레드시트에서
 * 확장 프로그램 > Apps Script를 열고 이 파일 전체를 붙여넣으세요.
 */
const SERVER_CONFIG = Object.freeze({
  ITEMS_SHEET: "items",
  COMMENTS_SHEET: "comments",
  ADMIN_PASSWORD: "school-admin", // index.html의 CONFIG.ADMIN_PASSWORD와 같게 설정
  MAX_TEXT_LENGTH: 2000
});

const ITEM_HEADERS = [
  "id", "type", "title", "url", "description", "author",
  "neededFeatures", "tags", "createdAt", "hidden"
];
const COMMENT_HEADERS = [
  "id", "itemId", "author", "content", "createdAt", "hidden"
];

/**
 * GET /exec?action=list
 * 숨김 처리되지 않은 카드와 댓글을 반환합니다.
 */
function doGet(e) {
  try {
    setupSheets_();
    const action = String((e && e.parameter && e.parameter.action) || "list");
    if (action !== "list") throw new Error("지원하지 않는 GET action입니다.");

    const items = readObjects_(SERVER_CONFIG.ITEMS_SHEET)
      .filter(function (item) { return !toBoolean_(item.hidden); })
      .map(normalizeItemForClient_);
    const visibleItemIds = {};
    items.forEach(function (item) { visibleItemIds[item.id] = true; });

    const comments = readObjects_(SERVER_CONFIG.COMMENTS_SHEET)
      .filter(function (comment) {
        return !toBoolean_(comment.hidden) && visibleItemIds[comment.itemId];
      })
      .map(normalizeCommentForClient_);

    return json_({ ok: true, items: items, comments: comments });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

/**
 * POST 본문(JSON, Content-Type: text/plain)
 *
 * createItem:
 * { action:"createItem", item:{ type,title,url,description,author,neededFeatures,tags:[] } }
 *
 * createComment:
 * { action:"createComment", comment:{ itemId,author,content } }
 *
 * hideItem / hideComment:
 * { action:"hideItem", id:"...", adminPassword:"..." }
 *
 * verifyAdmin:
 * { action:"verifyAdmin", adminPassword:"..." }
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(10000);
    lockAcquired = true;
    setupSheets_();
    if (!e || !e.postData || !e.postData.contents) throw new Error("요청 본문이 없습니다.");

    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case "createItem":
        return json_({ ok: true, item: createItem_(body.item || {}) });
      case "createComment":
        return json_({ ok: true, comment: createComment_(body.comment || {}) });
      case "verifyAdmin":
        assertAdmin_(body.adminPassword);
        return json_({ ok: true });
      case "hideItem":
        assertAdmin_(body.adminPassword);
        setHidden_(SERVER_CONFIG.ITEMS_SHEET, body.id);
        return json_({ ok: true });
      case "hideComment":
        assertAdmin_(body.adminPassword);
        setHidden_(SERVER_CONFIG.COMMENTS_SHEET, body.id);
        return json_({ ok: true });
      default:
        throw new Error("지원하지 않는 POST action입니다.");
    }
  } catch (error) {
    return json_({ ok: false, error: error.message });
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

/**
 * items, comments 시트가 없으면 만들고 첫 행에 헤더를 작성합니다.
 * Apps Script 편집기에서 setupSheets를 직접 한 번 실행해도 됩니다.
 */
function setupSheets() {
  setupSheets_();
  return "items, comments 시트 준비 완료";
}

function setupSheets_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("활성 스프레드시트가 없습니다. 스프레드시트에 연결된 Apps Script로 실행해 주세요.");
  }
  ensureSheet_(spreadsheet, SERVER_CONFIG.ITEMS_SHEET, ITEM_HEADERS);
  ensureSheet_(spreadsheet, SERVER_CONFIG.COMMENTS_SHEET, COMMENT_HEADERS);
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#dfeeff");
    sheet.autoResizeColumns(1, headers.length);
    return;
  }
  const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (actualHeaders.join("|") !== headers.join("|")) {
    throw new Error(name + " 시트의 헤더가 예상 구조와 다릅니다. README의 컬럼 순서를 확인해 주세요.");
  }
}

function createItem_(input) {
  const type = cleanText_(input.type, 20);
  const title = cleanText_(input.title, 80);
  const url = cleanText_(input.url, 500);
  const description = cleanText_(input.description, 1000);
  const author = cleanText_(input.author, 50);
  const neededFeatures = cleanText_(input.neededFeatures, 500);
  const tags = normalizeTags_(input.tags);

  if (type !== "webtool" && type !== "idea") throw new Error("type은 webtool 또는 idea여야 합니다.");
  if (!title || !description || !author) throw new Error("제목, 설명, 작성자는 필수입니다.");
  if (type === "webtool") validateUrl_(url);

  const item = {
    id: Utilities.getUuid(),
    type: type,
    title: title,
    url: type === "webtool" ? url : "",
    description: description,
    author: author,
    neededFeatures: type === "idea" ? neededFeatures : "",
    tags: tags.join(","),
    createdAt: new Date().toISOString(),
    hidden: false
  };
  appendObject_(SERVER_CONFIG.ITEMS_SHEET, ITEM_HEADERS, item);
  return normalizeItemForClient_(item);
}

function createComment_(input) {
  const itemId = cleanText_(input.itemId, 100);
  const author = cleanText_(input.author, 50);
  const content = cleanText_(input.content, 500);
  if (!itemId || !author || !content) throw new Error("카드 ID, 작성자, 댓글 내용은 필수입니다.");
  if (!visibleItemExists_(itemId)) throw new Error("댓글을 달 수 있는 카드를 찾지 못했습니다.");

  const comment = {
    id: Utilities.getUuid(),
    itemId: itemId,
    author: author,
    content: content,
    createdAt: new Date().toISOString(),
    hidden: false
  };
  appendObject_(SERVER_CONFIG.COMMENTS_SHEET, COMMENT_HEADERS, comment);
  return normalizeCommentForClient_(comment);
}

function visibleItemExists_(id) {
  return readObjects_(SERVER_CONFIG.ITEMS_SHEET).some(function (item) {
    return item.id === id && !toBoolean_(item.hidden);
  });
}

function appendObject_(sheetName, headers, object) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = headers.map(function (header) { return object[header] === undefined ? "" : object[header]; });
  sheet.appendRow(values);
}

function readObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const lastColumn = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values.shift().map(String);
  return values.map(function (row) {
    const object = {};
    headers.forEach(function (header, index) { object[header] = row[index]; });
    return object;
  });
}

function setHidden_(sheetName, id) {
  const cleanId = cleanText_(id, 100);
  if (!cleanId) throw new Error("숨김 처리할 ID가 없습니다.");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const idColumn = values[0].indexOf("id");
  const hiddenColumn = values[0].indexOf("hidden");
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][idColumn]) === cleanId) {
      sheet.getRange(row + 1, hiddenColumn + 1).setValue(true);
      return;
    }
  }
  throw new Error("숨김 처리할 대상을 찾지 못했습니다.");
}

function normalizeItemForClient_(item) {
  return {
    id: String(item.id || ""),
    type: String(item.type || ""),
    title: String(item.title || ""),
    url: String(item.url || ""),
    description: String(item.description || ""),
    author: String(item.author || ""),
    neededFeatures: String(item.neededFeatures || ""),
    tags: normalizeTags_(item.tags),
    createdAt: dateToIso_(item.createdAt),
    hidden: toBoolean_(item.hidden)
  };
}

function normalizeCommentForClient_(comment) {
  return {
    id: String(comment.id || ""),
    itemId: String(comment.itemId || ""),
    author: String(comment.author || ""),
    content: String(comment.content || ""),
    createdAt: dateToIso_(comment.createdAt),
    hidden: toBoolean_(comment.hidden)
  };
}

function normalizeTags_(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,#]/);
  const seen = {};
  return raw.map(function (tag) { return cleanText_(tag, 30); })
    .filter(function (tag) {
      const key = tag.toLowerCase();
      if (!tag || seen[key]) return false;
      seen[key] = true;
      return true;
    })
    .slice(0, 12);
}

function cleanText_(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, Math.min(maxLength || SERVER_CONFIG.MAX_TEXT_LENGTH, SERVER_CONFIG.MAX_TEXT_LENGTH));
}

function validateUrl_(value) {
  if (!/^https?:\/\/\S+$/i.test(value)) throw new Error("웹툴 링크는 http:// 또는 https://로 시작해야 합니다.");
}

function assertAdmin_(password) {
  if (String(password || "") !== SERVER_CONFIG.ADMIN_PASSWORD) {
    throw new Error("관리자 비밀번호가 올바르지 않습니다.");
  }
}

function dateToIso_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? String(value || "") : date.toISOString();
}

function toBoolean_(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
