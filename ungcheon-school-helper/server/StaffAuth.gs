// Reuse the established common-password verifier. Never reset mobile properties.
// The storage identifier is a server-side pointer, not an access credential.
const STAFF_CASE_STORAGE_SPREADSHEET = '1EMa0EINCAnTCm7e8UAsJ6Yjul_O6G_C-X25EN3oC0Dk';
// Additional desktop login identities are independent of the staff roster.
// Store normalized-name hashes, not plaintext names. The common password is still required.
const STAFF_ADDITIONAL_LOGIN_NAME_HASHES = ['DTgN0r0RmaYOQnwA8vfqpyyPXtyoisPPWFOfObVsMwk='];
function staffAssertViewer_(viewerName) {
  var name = clean_(viewerName, 30);
  if (name && STAFF_ADDITIONAL_LOGIN_NAME_HASHES.indexOf(sha256_(name)) >= 0) return name;
  return mobileAssertViewer_(name);
}
function staffAuthVersion_() { return sha256_(mobileSharedPasswordHash_() + ':' + (PropertiesService.getScriptProperties().getProperty('UNG_STAFF_AUTH_VERSION') || '1')); }
function staffSessionKey_(token) { return 'UNG_STAFF_SESSION_' + sha256_(String(token || '')).replace(/[^A-Za-z0-9]/g, '').slice(0, 40); }
function staffRequire_(body) {
  var properties = PropertiesService.getScriptProperties();
  var saved = properties.getProperty(staffSessionKey_(body.staffToken));
  var session;
  try { session = JSON.parse(saved || '{}'); } catch (_) { session = {}; }
  if (!body.staffToken || !session.name || session.version !== staffAuthVersion_() || !Number.isFinite(Number(session.expiresAt)) || Number(session.expiresAt) <= Date.now()) throw new Error('AUTH_REQUIRED: 로그인 후 이용해 주세요.');
  staffAssertViewer_(session.name);
  if (body.viewerName && String(body.viewerName).trim() !== session.name) throw new Error('AUTH_FORBIDDEN: 요청 사용자와 세션이 다릅니다.');
  return session;
}
function staffAuthAction_(body) {
  var action = body.action;
  var properties = PropertiesService.getScriptProperties();
  if (action === 'staffLogin') {
    var name = String(body.name || '').trim();
    var failureKey = 'staff-auth-failure-' + sha256_(name);
    var cache = CacheService.getScriptCache();
    var failures = Number(cache.get(failureKey) || 0);
    if (failures >= 5) throw new Error('잠시 뒤 다시 로그인해 주세요.');
    try { if (sha256_(String(body.password || '')) !== mobileSharedPasswordHash_()) throw new Error('invalid'); staffAssertViewer_(name); }
    catch (_) { cache.put(failureKey, String(failures + 1), 60); throw new Error('이름 또는 비밀번호를 확인해 주세요.'); }
    cache.remove(failureKey);
    var savedProperties = properties.getProperties();
    Object.keys(savedProperties).forEach(function(key) {
      if (key.indexOf('UNG_STAFF_SESSION_') !== 0) return;
      try { if (Number(JSON.parse(savedProperties[key]).expiresAt) <= Date.now()) properties.deleteProperty(key); }
      catch (_) { properties.deleteProperty(key); }
    });
    var token = Utilities.getUuid() + Utilities.getUuid();
    var session = { name: name, expiresAt: Date.now() + 120 * 3600000, version: staffAuthVersion_() };
    properties.setProperty(staffSessionKey_(token), JSON.stringify(session));
    return { name: name, expiresAt: new Date(session.expiresAt).toISOString(), token: token };
  }
  var session = staffRequire_(body);
  if (action === 'staffSession') return { name: session.name, expiresAt: new Date(session.expiresAt).toISOString() };
  if (action === 'staffLogout') { properties.deleteProperty(staffSessionKey_(body.staffToken)); return true; }
  if (action === 'caseLibrary' || action === 'caseDocument') {
    var manifest = staffCaseManifest_();
    if (action === 'caseLibrary') return manifest.map(function(d) { return { id: d.id, title: d.title, revision: d.revision }; });
    var selected = manifest.filter(function(d) { return d.id === body.id; })[0];
    if (!selected) throw new Error('등록되지 않은 자료입니다.');
    if (!selected.bytes || selected.bytes > 100 * 1024 * 1024) throw new Error('지원하지 않는 자료입니다.');
    var sheet = SpreadsheetApp.openById(selected.spreadsheetId).getSheets()[0];
    var rows = sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues();
    var data = rows.map(function(row) { var v = String(row[0]); if (v.indexOf('b64:') !== 0) throw new Error('자료 보관 형식이 올바르지 않습니다.'); return v.slice(4); }).join('');
    var bytes = Utilities.base64Decode(data);
    var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
    if (bytes.length !== selected.bytes || hash !== selected.revision) throw new Error('자료 무결성 검증에 실패했습니다.');
    return { id: selected.id, title: selected.title, revision: selected.revision, data: data };
  }
  throw new Error('허용되지 않은 인증 요청입니다.');
}
function staffCaseManifest_() {
  var id = PropertiesService.getScriptProperties().getProperty('UNG_CASE_STORAGE_SPREADSHEET') || STAFF_CASE_STORAGE_SPREADSHEET;
  if (!id) throw new Error('중앙 자료집이 아직 등록되지 않았습니다.');
  var sheet = SpreadsheetApp.openById(id).getSheets()[0];
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().map(function(row) {
    if (!/^[a-z0-9_-]{1,60}$/.test(String(row[0])) || !/^[a-f0-9]{64}$/.test(String(row[2]))) throw new Error('자료 목록을 확인해 주세요.');
    return { id: String(row[0]), title: String(row[1]), revision: String(row[2]), bytes: Number(row[3]), spreadsheetId: String(row[5]) };
  });
}
