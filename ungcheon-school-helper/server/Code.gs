/**
 * 웅천고 업무도우미 학교 공유 서비스
 *
 * Google 스프레드시트에 바인딩된 Apps Script로 사용합니다.
 * 교사·학생 시간표는 학교 내부 공유용입니다.
 * 학생 시간표는 관리자 업로드 시 Excel 원본이 아닌 조회용 가공 결과만 저장합니다.
 */

const LINKS_SHEET = '공유링크';
const NOTICES_SHEET = '공지';
const FEATURE_REQUESTS_SHEET = '기능개선요청';
const TIMETABLE_META_SHEET = '시간표정보';
const TIMETABLE_SHEET = '시간표';
const STUDENT_TIMETABLE_META_SHEET = '학생시간표정보';
const STUDENT_TIMETABLE_SHEET = '학생시간표';
const STAFF_ROSTER_META_SHEET = '교원명렬정보';
const STAFF_ROSTER_SHEET = '교원명렬';
const STUDENT_ROSTER_META_SHEET = '학생명렬정보';
const STUDENT_ROSTER_SHEET = '학생명렬';
const STAFF_CHECKLISTS_SHEET = '업무체크리스트';
const STAFF_CHECKLIST_RESPONSES_SHEET = '업무체크응답';
const COMMITTEE_MEMBERS_SHEET = '위원회명단';
const COMMITTEE_EVENTS_SHEET = '위원회일정';
const ADMIN_HASH_KEY = 'UNG_ADMIN_PASSWORD_SHA256';
const NEIS_API_KEY_PROPERTY = 'UNG_NEIS_API_KEY';
const NEIS_BASE_URL = 'https://open.neis.go.kr/hub/';
const UNGCHEON_OFFICE_CODE = 'S10';
const UNGCHEON_SCHOOL_CODE = '9010464';
const TIMETABLE_SLOT_COUNT = 35;
const NEIS_CACHE_SECONDS = 300;
const NEIS_ENDPOINT_PARAMS = {
  schoolInfo: ['SCHUL_NM'],
  mealServiceDietInfo: ['MLSV_YMD'],
  SchoolSchedule: ['AA_YMD', 'AA_FROM_YMD', 'AA_TO_YMD'],
  hisTimetable: ['AY', 'SEM', 'ALL_TI_YMD', 'TI_FROM_YMD', 'TI_TO_YMD', 'GRADE', 'CLASS_NM'],
  classInfo: ['AY'],
  schoolMajorinfo: ['AY']
};
const RELEASE_NOTES = [
  {
    key: 'v1.0.24',
    title: '[업데이트] 웅천고 업무도우미 v1.0.24',
    body: [
      '· 성적 산출 미리보기: 기존에 제작한 원본 화면과 계산 방식으로 복원',
      '· 추정분할점수 도우미: 별도 메뉴로 분리하여 분할점수 구성·성취도 분포 예측·역산 제공',
      '· 독립 저장: 두 도구의 설정과 작업자료가 서로 섞이지 않도록 저장공간 분리',
      '· 자료 이동: v1.0.23에서 저장된 통합 도구 자료는 추정분할점수 도우미로 자동 이전',
      '· 선택형 없는 시험: 선택형 제약을 제외하고 서술형 정답률만 계산'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.23',
    title: '[업데이트] 웅천고 업무도우미 v1.0.23',
    body: [
      '· 학사·기록: 성적 산출 미리보기 메뉴 추가',
      '· 평가 구성: 학기말 합산·1차 시험, 5·9등급제, 성취도 분할 방식 지원',
      '· 점수 입력: 행렬형·목록형 Excel 자동 인식과 직접 붙여넣기 지원',
      '· 결과 확인: 환산점수·석차·동석차·등급 컷·성취도 분포 제공',
      '· 로컬 보안: 점수는 학교 공유 서버로 전송하지 않고 PC에만 임시 저장',
      '· 저장·복원: 작업 설정과 점수를 정리 Excel로 내보내고 복원 가능'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.22',
    title: '[업데이트] 웅천고 업무도우미 v1.0.22',
    body: [
      '· 학교 내 각종위원회: 2026학년도 경남교육청 고등학교 기준으로 교체',
      '· 위원회 명단: 전체 교직원이 교원 명렬 선택·직접 입력·역할 지정 가능',
      '· 위원회 캘린더: 전체 교직원이 일정을 등록·삭제하고 개인 달력에서 확인',
      '· 일정 충돌: 같은 위원이 같은 시간대 위원회에 중복될 때 경고 및 등록 차단',
      '· 대시보드: 이름·NEIS API 키 미설정 시 바로가기 안내 추가',
      '· 학교 운영: 학교비치장부현황 메뉴 제거'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.21',
    title: '[업데이트] 웅천고 업무도우미 v1.0.21',
    body: [
      '• 연수등록부: 출력 미리보기를 실제 양식과 같은 열 우선 번호 순서로 수정',
      '• 연수등록부·출석부: 명단이 각 양식 한 페이지에 들어가도록 인쇄 크기 자동 조정',
      '• 수업 출석부: 기존 5자리 학번 시간표와 4자리 학생 명렬을 자동 연결',
      '• 메뉴 구성: 업무 체크리스트와 교원 명렬·연수등록부를 분리',
      '• 메뉴 순서: 학사·기록과 학교운영을 상단으로 이동하고 위원회·비치 장부를 하단 배치'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.20',
    title: '[업데이트] 웅천고 업무도우미 v1.0.20',
    body: [
      '• 업무 체크리스트: 교원·부서별 업무 배부, 개인 체크, 배부자 완료 현황 확인',
      '• 교원 명렬: 관리자 Excel 등록·수정, 교장·교감 우선/가나다순 정렬, 명렬 내려받기',
      '• 연수등록부: 제목·날짜 입력 후 2단 서명 양식 인쇄 및 PDF 저장',
      '• 학생 명렬: 관리자 일괄 등록·수정, 일반 사용자는 조회·출력 전용',
      '• 출석부: 학급별 및 이동수업 강좌별 출력',
      '• 묶음 출력: 교사 선택 시 담당 강좌 전체, 과목 선택 시 해당 과목 분반 전체를 연속 인쇄하거나 Excel로 저장'
    ].join('\n'),
    date: '2026-07-31'
  }
];

function doGet() {
  return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 10 } });
}

function doPost(e) {
  try {
    ensureSheets_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');

    if (action === 'health') return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 10 } });
    if (action === 'getSyncManifest') return json_({ ok: true, data: getSyncManifest_() });
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
    if (action === 'getStudentTimetable') return json_({ ok: true, data: getStudentTimetable_() });
    if (action === 'replaceStudentTimetable') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceStudentTimetable_(body) });
    }
    if (action === 'getStaffRoster') return json_({ ok: true, data: getStaffRoster_() });
    if (action === 'replaceStaffRoster') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceStaffRoster_(body) });
    }
    if (action === 'getStudentRoster') return json_({ ok: true, data: getStudentRoster_() });
    if (action === 'replaceStudentRoster') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceStudentRoster_(body) });
    }
    if (action === 'listStaffChecklists') {
      return json_({ ok: true, data: listStaffChecklists_(body) });
    }
    if (action === 'addStaffChecklist') {
      return json_({ ok: true, data: addStaffChecklist_(body) });
    }
    if (action === 'submitStaffChecklist') {
      return json_({ ok: true, data: submitStaffChecklist_(body) });
    }
    if (action === 'deleteStaffChecklist') {
      deleteStaffChecklist_(body);
      return json_({ ok: true });
    }
    if (action === 'listCommitteeState') {
      return json_({ ok: true, data: listCommitteeState_() });
    }
    if (action === 'saveCommitteeMembers') {
      return json_({ ok: true, data: saveCommitteeMembers_(body) });
    }
    if (action === 'addCommitteeEvent') {
      return json_({ ok: true, data: addCommitteeEvent_(body) });
    }
    if (action === 'deleteCommitteeEvent') {
      deleteRowById_(COMMITTEE_EVENTS_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'getNeisStatus') {
      return json_({ ok: true, data: getNeisStatus_() });
    }
    if (action === 'setNeisApiKey') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: setNeisApiKey_(body.apiKey) });
    }
    if (action === 'neisQuery') {
      return json_({ ok: true, data: neisQuery_(body.endpoint, body.params) });
    }
    throw new Error('허용되지 않는 요청입니다.');
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function getSyncManifest_() {
  function versionOf_(sheetName) {
    const rows = readObjects_(sheetName);
    return 'v:' + String(rows.length ? Number(rows[0].version) || 0 : 0);
  }
  return {
    generatedAt: new Date().toISOString(),
    resources: {
      timetable: versionOf_(TIMETABLE_META_SHEET),
      studentTimetable: versionOf_(STUDENT_TIMETABLE_META_SHEET),
      staffRoster: versionOf_(STAFF_ROSTER_META_SHEET),
      studentRoster: versionOf_(STUDENT_ROSTER_META_SHEET)
    }
  };
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

  let studentTimetableMeta = book.getSheetByName(STUDENT_TIMETABLE_META_SHEET);
  if (!studentTimetableMeta) {
    studentTimetableMeta = book.insertSheet(STUDENT_TIMETABLE_META_SHEET);
    studentTimetableMeta.appendRow([
      'version', 'title', 'semester', 'uploadedBy', 'uploadedAt',
      'studentCount', 'classCount', 'courseCount'
    ]);
    studentTimetableMeta.setFrozenRows(1);
  }

  let studentTimetable = book.getSheetByName(STUDENT_TIMETABLE_SHEET);
  const studentTimetableHeaders = [
    'studentId', 'name', 'grade', 'className', 'number', 'enrollmentCount', 'payloadJson'
  ];
  if (!studentTimetable) {
    studentTimetable = book.insertSheet(STUDENT_TIMETABLE_SHEET);
    studentTimetable.setFrozenRows(1);
  }
  if (studentTimetable.getMaxColumns() < studentTimetableHeaders.length) {
    studentTimetable.insertColumnsAfter(
      studentTimetable.getMaxColumns(),
      studentTimetableHeaders.length - studentTimetable.getMaxColumns()
    );
  }
  studentTimetable.getRange(1, 1, 1, studentTimetableHeaders.length)
    .setValues([studentTimetableHeaders]);

  ensureDataSheet_(book, STAFF_ROSTER_META_SHEET, [
    'version', 'sourceFileName', 'uploadedBy', 'uploadedAt', 'memberCount'
  ]);
  ensureDataSheet_(book, STAFF_ROSTER_SHEET, [
    'id', 'name', 'position', 'department'
  ]);
  ensureDataSheet_(book, STUDENT_ROSTER_META_SHEET, [
    'version', 'sourceFileName', 'uploadedBy', 'uploadedAt', 'studentCount'
  ]);
  ensureDataSheet_(book, STUDENT_ROSTER_SHEET, [
    'studentId', 'name', 'gender', 'remark', 'grade', 'className', 'number',
    'homeroomTeacher', 'assistantTeacher'
  ]);
  ensureDataSheet_(book, STAFF_CHECKLISTS_SHEET, [
    'id', 'title', 'description', 'deadline', 'creatorName', 'createdAt',
    'closed', 'itemsJson', 'targetNamesJson'
  ]);
  ensureDataSheet_(book, STAFF_CHECKLIST_RESPONSES_SHEET, [
    'checklistId', 'teacherName', 'checkedItemIdsJson', 'memo', 'updatedAt'
  ]);
  ensureDataSheet_(book, COMMITTEE_MEMBERS_SHEET, [
    'committeeId', 'committeeName', 'membersJson', 'updatedBy', 'updatedAt'
  ]);
  ensureDataSheet_(book, COMMITTEE_EVENTS_SHEET, [
    'id', 'committeeId', 'committeeName', 'title', 'date', 'startTime', 'endTime',
    'location', 'agenda', 'memberNamesJson', 'createdBy', 'createdAt'
  ]);
  ensureReleaseNotices_();
}

function ensureDataSheet_(book, name, headers) {
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.setFrozenRows(1);
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureReleaseNotices_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTICES_SHEET);
  const existing = readObjects_(NOTICES_SHEET);
  const titles = {};
  let maxId = 0;
  existing.forEach(function(notice) {
    titles[String(notice.title || '')] = true;
    maxId = Math.max(maxId, Number(notice.id) || 0);
  });
  RELEASE_NOTES.forEach(function(note) {
    if (titles[note.title]) return;
    maxId += 1;
    sheet.appendRow([maxId, note.title, note.body, 'important', note.date, '']);
    titles[note.title] = true;
  });
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

function getStudentTimetable_() {
  const metaRows = readObjects_(STUDENT_TIMETABLE_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const students = readObjects_(STUDENT_TIMETABLE_SHEET)
    .map(function(row) {
      try {
        return JSON.parse(String(row.payloadJson || ''));
      } catch (error) {
        return null;
      }
    })
    .filter(function(student) {
      return student && student.student && student.student.studentId;
    });

  return {
    version: Number(meta.version) || 1,
    title: String(meta.title || ''),
    semester: String(meta.semester || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    studentCount: students.length,
    classCount: Number(meta.classCount) || 0,
    courseCount: Number(meta.courseCount) || 0,
    students: students
  };
}

function replaceStudentTimetable_(body) {
  const timetable = body.timetable || {};
  const students = Array.isArray(timetable.students) ? timetable.students : [];
  if (!students.length) throw new Error('업로드할 학생 시간표가 없습니다.');
  if (students.length > 1500) throw new Error('학생 수는 1,500명을 초과할 수 없습니다.');

  const title = clean_(timetable.title, 100) || '학생별 시간표';
  const semester = clean_(timetable.semester, 30);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();
  const existing = readObjects_(STUDENT_TIMETABLE_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const seen = {};
  const rows = students.map(function(item) {
    const normalized = normalizeStudentTimetable_(item);
    const student = normalized.student;
    if (seen[student.studentId]) throw new Error('중복 학번이 있습니다: ' + student.studentId);
    seen[student.studentId] = true;
    const payloadJson = JSON.stringify(normalized);
    if (payloadJson.length > 45000) {
      throw new Error(student.studentId + ' 학생의 시간표 데이터가 너무 큽니다.');
    }
    return [
      student.studentId,
      student.name,
      student.grade,
      student.className,
      student.number,
      student.enrollmentCount,
      payloadJson
    ];
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = book.getSheetByName(STUDENT_TIMETABLE_SHEET);
    const metaSheet = book.getSheetByName(STUDENT_TIMETABLE_META_SHEET);
    if (dataSheet.getLastRow() > 1) {
      dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, dataSheet.getLastColumn()).clearContent();
    }
    dataSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

    if (metaSheet.getLastRow() > 1) {
      metaSheet.getRange(2, 1, metaSheet.getLastRow() - 1, metaSheet.getLastColumn()).clearContent();
    }
    metaSheet.getRange(2, 1, 1, 8).setValues([[
      version,
      title,
      semester,
      uploadedBy,
      uploadedAt,
      rows.length,
      Math.max(0, Number(timetable.classCount) || 0),
      Math.max(0, Number(timetable.courseCount) || 0)
    ]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function normalizeStudentTimetable_(item) {
  const sourceStudent = item && item.student ? item.student : {};
  const studentId = clean_(sourceStudent.studentId, 12);
  const name = clean_(sourceStudent.name, 30);
  if (!/^\d{4,12}$/.test(studentId)) throw new Error('학번 형식이 올바르지 않습니다.');
  if (!name) throw new Error(studentId + ' 학생의 이름이 없습니다.');

  const grade = clean_(sourceStudent.grade, 2);
  const className = clean_(sourceStudent.className, 3);
  const number = clean_(sourceStudent.number, 3);
  const classLabel = clean_(sourceStudent.classLabel, 8) || grade + '-' + className;
  const sourceSlots = item && item.slots && typeof item.slots === 'object' ? item.slots : {};
  const days = ['월', '화', '수', '목', '금'];
  const slots = {};
  days.forEach(function(day) {
    for (let period = 1; period <= 7; period++) {
      const key = day + period;
      const slot = sourceSlots[key] || {};
      slots[key] = {
        day: day,
        period: period,
        subject: clean_(slot.subject, 120),
        teacher: clean_(slot.teacher, 100),
        classroom: clean_(slot.classroom, 50),
        raw: '',
        selectedCourse: Boolean(slot.selectedCourse),
        group: clean_(slot.group, 20)
      };
    }
  });

  const sourceSelections = Array.isArray(item && item.selections) ? item.selections : [];
  const selections = sourceSelections.slice(0, 40).map(function(selection) {
    const times = Array.isArray(selection.times) ? selection.times : [];
    return {
      grade: clean_(selection.grade, 2),
      group: clean_(selection.group, 20),
      times: times.slice(0, 10).map(function(time) { return clean_(time, 10); }),
      courseName: clean_(selection.courseName, 120),
      teacher: clean_(selection.teacher, 100),
      classroom: clean_(selection.classroom, 50),
      sourceFile: ''
    };
  });

  return {
    student: {
      studentId: studentId,
      name: name,
      grade: grade,
      className: className,
      classLabel: classLabel,
      number: number,
      enrollmentCount: Math.max(0, Number(sourceStudent.enrollmentCount) || 0)
    },
    slots: slots,
    selections: selections,
    warnings: []
  };
}

function getStaffRoster_() {
  const metaRows = readObjects_(STAFF_ROSTER_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const members = readObjects_(STAFF_ROSTER_SHEET)
    .map(function(row) {
      return {
        id: String(row.id || ''),
        name: String(row.name || ''),
        position: String(row.position || ''),
        department: String(row.department || '')
      };
    })
    .filter(function(member) { return member.id && member.name; })
    .sort(compareStaffMembers_);
  return {
    version: Number(meta.version) || 1,
    sourceFileName: String(meta.sourceFileName || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    members: members
  };
}

function replaceStaffRoster_(body) {
  const source = Array.isArray(body.members) ? body.members : [];
  if (!source.length) throw new Error('저장할 교원 명렬이 없습니다.');
  if (source.length > 200) throw new Error('교원 명렬은 200명을 초과할 수 없습니다.');
  const seenNames = {};
  const rows = source.map(function(member) {
    const name = clean_(member && member.name, 30);
    const position = clean_(member && member.position, 30) || '교사';
    const department = clean_(member && member.department, 50);
    if (!name) throw new Error('성명이 비어 있는 교원이 있습니다.');
    if (seenNames[name]) throw new Error('교원 명렬에 같은 이름이 두 번 있습니다: ' + name);
    seenNames[name] = true;
    return [
      clean_(member && member.id, 100) || Utilities.getUuid(),
      name,
      position,
      department
    ];
  });
  rows.sort(function(a, b) {
    return compareStaffMembers_(
      { name: a[1], position: a[2] },
      { name: b[1], position: b[2] }
    );
  });

  const existing = readObjects_(STAFF_ROSTER_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const sourceFileName = clean_(body.sourceFileName, 200);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    replaceSheetRows_(STAFF_ROSTER_SHEET, rows);
    replaceSheetRows_(STAFF_ROSTER_META_SHEET, [[
      version, sourceFileName, uploadedBy, uploadedAt, rows.length
    ]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function compareStaffMembers_(a, b) {
  function rank_(position) {
    const value = String(position || '').replace(/\s/g, '');
    if (value === '교장') return 0;
    if (value === '교감') return 1;
    return 2;
  }
  const rank = rank_(a.position) - rank_(b.position);
  return rank || String(a.name || '').localeCompare(String(b.name || ''), 'ko');
}

function getStudentRoster_() {
  const metaRows = readObjects_(STUDENT_ROSTER_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const students = readObjects_(STUDENT_ROSTER_SHEET)
    .map(function(row) {
      return {
        studentId: String(row.studentId || ''),
        name: String(row.name || ''),
        gender: String(row.gender || ''),
        remark: String(row.remark || ''),
        grade: String(row.grade || ''),
        className: String(row.className || ''),
        number: String(row.number || ''),
        homeroomTeacher: String(row.homeroomTeacher || ''),
        assistantTeacher: String(row.assistantTeacher || '')
      };
    })
    .filter(function(student) { return student.studentId && student.name; })
    .sort(function(a, b) { return a.studentId.localeCompare(b.studentId); });
  return {
    version: Number(meta.version) || 1,
    sourceFileName: String(meta.sourceFileName || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    students: students
  };
}

function replaceStudentRoster_(body) {
  const source = Array.isArray(body.students) ? body.students : [];
  if (!source.length) throw new Error('저장할 학생 명렬이 없습니다.');
  if (source.length > 2000) throw new Error('학생 명렬은 2,000명을 초과할 수 없습니다.');
  const seen = {};
  const rows = source.map(function(student) {
    const studentId = clean_(student && student.studentId, 12);
    const name = clean_(student && student.name, 30);
    if (!/^\d{4,12}$/.test(studentId)) throw new Error('학번 형식이 올바르지 않습니다: ' + studentId);
    if (!name) throw new Error(studentId + ' 학생의 이름이 없습니다.');
    if (seen[studentId]) throw new Error('중복 학번이 있습니다: ' + studentId);
    seen[studentId] = true;
    const grade = clean_(student && student.grade, 2) || studentId.slice(0, 1);
    const className = clean_(student && student.className, 3) ||
      String(Number(studentId.length === 4 ? studentId.slice(1, 2) : studentId.slice(1, 3)));
    const number = clean_(student && student.number, 3) ||
      String(Number(studentId.length === 4 ? studentId.slice(2) : studentId.slice(3)));
    return [
      studentId,
      name,
      clean_(student && student.gender, 10),
      clean_(student && student.remark, 100),
      grade,
      className,
      number,
      clean_(student && student.homeroomTeacher, 30),
      clean_(student && student.assistantTeacher, 30)
    ];
  });
  rows.sort(function(a, b) { return String(a[0]).localeCompare(String(b[0])); });

  const existing = readObjects_(STUDENT_ROSTER_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const sourceFileName = clean_(body.sourceFileName, 200);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    replaceSheetRows_(STUDENT_ROSTER_SHEET, rows);
    replaceSheetRows_(STUDENT_ROSTER_META_SHEET, [[
      version, sourceFileName, uploadedBy, uploadedAt, rows.length
    ]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function listStaffChecklists_(body) {
  const viewerName = clean_(body.viewerName, 30);
  if (!viewerName) throw new Error('환경설정에서 본인 이름을 입력하세요.');
  const admin = isAdminPassword_(body.adminPassword);
  const responses = readObjects_(STAFF_CHECKLIST_RESPONSES_SHEET);
  return readObjects_(STAFF_CHECKLISTS_SHEET)
    .map(function(row) {
      const items = parseJsonArray_(row.itemsJson);
      const targetNames = parseJsonArray_(row.targetNamesJson).map(String);
      const canManage = admin || String(row.creatorName || '') === viewerName;
      const visible = canManage || targetNames.indexOf(viewerName) >= 0;
      if (!visible) return null;
      const checklistResponses = responses
        .filter(function(response) {
          return String(response.checklistId || '') === String(row.id || '') &&
            (canManage || String(response.teacherName || '') === viewerName);
        })
        .map(function(response) {
          return {
            teacherName: String(response.teacherName || ''),
            checkedItemIds: parseJsonArray_(response.checkedItemIdsJson).map(String),
            memo: String(response.memo || ''),
            updatedAt: iso_(response.updatedAt)
          };
        });
      return {
        id: String(row.id || ''),
        title: String(row.title || ''),
        description: String(row.description || ''),
        deadline: dateOnly_(row.deadline),
        creatorName: String(row.creatorName || ''),
        createdAt: iso_(row.createdAt),
        closed: toBooleanValue_(row.closed),
        items: items,
        targetNames: targetNames,
        responses: checklistResponses,
        canManage: canManage
      };
    })
    .filter(function(item) { return item && item.id && item.title; })
    .sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function addStaffChecklist_(body) {
  const creatorName = clean_(body.creatorName, 30);
  const title = clean_(body.title, 100);
  const description = clean_(body.description, 1000);
  const deadline = clean_(body.deadline, 10);
  const sourceItems = Array.isArray(body.items) ? body.items : [];
  const sourceTargets = Array.isArray(body.targetNames) ? body.targetNames : [];
  if (!creatorName || !title) throw new Error('작성자와 제목을 입력하세요.');
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('마감일 형식이 올바르지 않습니다.');

  const roster = getStaffRoster_();
  if (!roster || !roster.members.some(function(member) { return member.name === creatorName; })) {
    throw new Error('환경설정의 이름이 등록된 교원 명렬과 일치하지 않습니다.');
  }
  const allowedNames = {};
  roster.members.forEach(function(member) { allowedNames[member.name] = true; });
  const targetNames = uniqueStrings_(sourceTargets, 30, 200)
    .filter(function(name) { return allowedNames[name]; });
  if (!targetNames.length) throw new Error('배부 대상 교원을 한 명 이상 선택하세요.');
  const itemLabels = uniqueStrings_(sourceItems, 200, 30);
  if (!itemLabels.length) throw new Error('확인 항목을 한 개 이상 입력하세요.');
  const items = itemLabels.map(function(label) {
    return { id: Utilities.getUuid(), label: label };
  });
  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_CHECKLISTS_SHEET).appendRow([
    id, title, description, deadline, creatorName, createdAt, false,
    JSON.stringify(items), JSON.stringify(targetNames)
  ]);
  return { id: id };
}

function submitStaffChecklist_(body) {
  const checklistId = clean_(body.checklistId, 100);
  const teacherName = clean_(body.teacherName, 30);
  const memo = clean_(body.memo, 300);
  if (!checklistId || !teacherName) throw new Error('체크리스트와 교사 이름을 확인하세요.');
  const checklist = findObjectByValue_(STAFF_CHECKLISTS_SHEET, 'id', checklistId);
  if (!checklist) throw new Error('체크리스트를 찾지 못했습니다.');
  if (toBooleanValue_(checklist.closed)) throw new Error('마감된 체크리스트입니다.');
  const targetNames = parseJsonArray_(checklist.targetNamesJson).map(String);
  if (targetNames.indexOf(teacherName) < 0) throw new Error('이 체크리스트의 배부 대상이 아닙니다.');
  const itemIds = {};
  parseJsonArray_(checklist.itemsJson).forEach(function(item) {
    if (item && item.id) itemIds[String(item.id)] = true;
  });
  const checkedItemIds = uniqueStrings_(
    Array.isArray(body.checkedItemIds) ? body.checkedItemIds : [],
    100,
    30
  ).filter(function(id) { return itemIds[id]; });
  const updatedAt = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_CHECKLIST_RESPONSES_SHEET);
    const values = sheet.getDataRange().getValues();
    for (let row = 1; row < values.length; row++) {
      if (String(values[row][0]) === checklistId && String(values[row][1]) === teacherName) {
        sheet.getRange(row + 1, 3, 1, 3).setValues([[
          JSON.stringify(checkedItemIds), memo, updatedAt
        ]]);
        return { updatedAt: updatedAt };
      }
    }
    sheet.appendRow([checklistId, teacherName, JSON.stringify(checkedItemIds), memo, updatedAt]);
  } finally {
    lock.releaseLock();
  }
  return { updatedAt: updatedAt };
}

function deleteStaffChecklist_(body) {
  const checklistId = clean_(body.checklistId, 100);
  const viewerName = clean_(body.viewerName, 30);
  const checklist = findObjectByValue_(STAFF_CHECKLISTS_SHEET, 'id', checklistId);
  if (!checklist) throw new Error('삭제할 체크리스트를 찾지 못했습니다.');
  if (String(checklist.creatorName || '') !== viewerName && !isAdminPassword_(body.adminPassword)) {
    throw new Error('작성자 또는 관리자만 삭제할 수 있습니다.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    deleteRowsByValue_(STAFF_CHECKLIST_RESPONSES_SHEET, 'checklistId', checklistId);
    deleteRowsByValue_(STAFF_CHECKLISTS_SHEET, 'id', checklistId);
  } finally {
    lock.releaseLock();
  }
}

function normalizeCommitteeMembers_(values) {
  const source = Array.isArray(values) ? values : [];
  const seen = {};
  return source.slice(0, 100).map(function(member) {
    const name = clean_(member && member.name, 30);
    const role = clean_(member && member.role, 30) || '위원';
    const sourceType = String(member && member.source || '') === 'staff' ? 'staff' : 'direct';
    if (!name || seen[name]) return null;
    seen[name] = true;
    return { name: name, role: role, source: sourceType };
  }).filter(function(member) { return member; });
}

function listCommitteeState_() {
  const assignments = readObjects_(COMMITTEE_MEMBERS_SHEET)
    .map(function(row) {
      return {
        committeeId: String(row.committeeId || ''),
        committeeName: String(row.committeeName || ''),
        members: normalizeCommitteeMembers_(parseJsonArray_(row.membersJson)),
        updatedBy: String(row.updatedBy || ''),
        updatedAt: iso_(row.updatedAt)
      };
    })
    .filter(function(item) { return item.committeeId && item.committeeName; })
    .sort(function(a, b) { return Number(a.committeeId) - Number(b.committeeId); });

  const events = readObjects_(COMMITTEE_EVENTS_SHEET)
    .map(function(row) {
      return {
        id: String(row.id || ''),
        committeeId: String(row.committeeId || ''),
        committeeName: String(row.committeeName || ''),
        title: String(row.title || ''),
        date: dateOnly_(row.date),
        startTime: String(row.startTime || ''),
        endTime: String(row.endTime || ''),
        location: String(row.location || ''),
        agenda: String(row.agenda || ''),
        memberNames: uniqueStrings_(parseJsonArray_(row.memberNamesJson), 30, 100),
        createdBy: String(row.createdBy || ''),
        createdAt: iso_(row.createdAt)
      };
    })
    .filter(function(item) {
      return item.id && item.committeeId && item.committeeName && item.date &&
        item.startTime && item.endTime;
    })
    .sort(function(a, b) {
      return (a.date + a.startTime).localeCompare(b.date + b.startTime);
    });

  return { assignments: assignments, events: events };
}

function saveCommitteeMembers_(body) {
  const committeeId = clean_(body.committeeId, 20);
  const committeeName = clean_(body.committeeName, 120);
  const members = normalizeCommitteeMembers_(body.members);
  const updatedBy = clean_(body.updatedBy, 30) || '사용자';
  if (!committeeId || !committeeName) throw new Error('위원회 정보를 확인해 주세요.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMMITTEE_MEMBERS_SHEET);
  const updatedAt = new Date().toISOString();
  const rowValues = [committeeId, committeeName, JSON.stringify(members), updatedBy, updatedAt];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const lastRow = sheet.getLastRow();
    let targetRow = 0;
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (let index = 0; index < ids.length; index++) {
        if (String(ids[index][0]) === committeeId) {
          targetRow = index + 2;
          break;
        }
      }
    }
    if (targetRow) sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    else sheet.appendRow(rowValues);
  } finally {
    lock.releaseLock();
  }
  return { updatedAt: updatedAt };
}

function addCommitteeEvent_(body) {
  const committeeId = clean_(body.committeeId, 20);
  const committeeName = clean_(body.committeeName, 120);
  const title = clean_(body.title, 120) || committeeName;
  const date = clean_(body.date, 10);
  const startTime = clean_(body.startTime, 5);
  const endTime = clean_(body.endTime, 5);
  const location = clean_(body.location, 100);
  const agenda = clean_(body.agenda, 1000);
  const memberNames = uniqueStrings_(body.memberNames, 30, 100);
  const createdBy = clean_(body.createdBy, 30) || '사용자';

  if (!committeeId || !committeeName) throw new Error('위원회를 선택해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('개최 날짜를 확인해 주세요.');
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
    throw new Error('시작·종료 시간을 확인해 주세요.');
  }
  if (!memberNames.length) throw new Error('위원회 명단을 먼저 등록해 주세요.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const conflicts = listCommitteeState_().events.filter(function(event) {
      if (event.date !== date || startTime >= event.endTime || event.startTime >= endTime) return false;
      return event.memberNames.some(function(name) { return memberNames.indexOf(name) >= 0; });
    });
    if (conflicts.length) {
      const conflict = conflicts[0];
      const overlapping = conflict.memberNames.filter(function(name) {
        return memberNames.indexOf(name) >= 0;
      });
      throw new Error(
        '같은 시간에 다른 위원회 일정이 겹칩니다: ' + conflict.committeeName +
        ' ' + conflict.startTime + '~' + conflict.endTime +
        ' (겹치는 위원: ' + overlapping.join(', ') + ')'
      );
    }

    const id = Utilities.getUuid();
    const createdAt = new Date().toISOString();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMMITTEE_EVENTS_SHEET).appendRow([
      id, committeeId, committeeName, title, date, startTime, endTime,
      location, agenda, JSON.stringify(memberNames), createdBy, createdAt
    ]);
    return {
      id: id,
      committeeId: committeeId,
      committeeName: committeeName,
      title: title,
      date: date,
      startTime: startTime,
      endTime: endTime,
      location: location,
      agenda: agenda,
      memberNames: memberNames,
      createdBy: createdBy,
      createdAt: createdAt
    };
  } finally {
    lock.releaseLock();
  }
}

function replaceSheetRows_(sheetName, rows) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function parseJsonArray_(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function uniqueStrings_(values, maxLength, maxCount) {
  const seen = {};
  const source = Array.isArray(values) ? values : [];
  return source.map(function(value) { return clean_(value, maxLength); })
    .filter(function(value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    })
    .slice(0, maxCount);
}

function findObjectByValue_(sheetName, header, value) {
  const rows = readObjects_(sheetName);
  for (let index = 0; index < rows.length; index++) {
    if (String(rows[index][header] || '') === value) return rows[index];
  }
  return null;
}

function deleteRowsByValue_(sheetName, header, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return;
  const column = values[0].map(String).indexOf(header);
  if (column < 0) return;
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][column]) === value) sheet.deleteRow(row + 1);
  }
}

function toBooleanValue_(value) {
  return value === true || String(value || '').toLowerCase() === 'true';
}

function getNeisStatus_() {
  return {
    configured: Boolean(PropertiesService.getScriptProperties().getProperty(NEIS_API_KEY_PROPERTY)),
    schoolName: '웅천고등학교'
  };
}

function setNeisApiKey_(value) {
  const apiKey = clean_(value, 200);
  if (!apiKey) throw new Error('저장할 NEIS API 키를 입력하세요.');
  if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('NEIS API 키 형식이 올바르지 않습니다.');

  const rows = fetchNeisRows_('schoolInfo', {}, apiKey);
  if (!rows.length || String(rows[0].SD_SCHUL_CODE || '') !== UNGCHEON_SCHOOL_CODE) {
    throw new Error('NEIS API 키로 웅천고등학교 정보를 확인하지 못했습니다.');
  }

  PropertiesService.getScriptProperties().setProperty(NEIS_API_KEY_PROPERTY, apiKey);
  return { configured: true, schoolName: '웅천고등학교' };
}

function neisQuery_(endpointValue, paramsValue) {
  const endpoint = String(endpointValue || '');
  if (!Object.prototype.hasOwnProperty.call(NEIS_ENDPOINT_PARAMS, endpoint)) {
    throw new Error('허용되지 않는 NEIS 조회입니다.');
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty(NEIS_API_KEY_PROPERTY);
  if (!apiKey) throw new Error('관리자가 NEIS API 키를 아직 등록하지 않았습니다.');

  const input = paramsValue && typeof paramsValue === 'object' ? paramsValue : {};
  const params = {};
  NEIS_ENDPOINT_PARAMS[endpoint].forEach(function(name) {
    const value = clean_(input[name], 20);
    if (value) params[name] = value;
  });
  validateNeisParams_(params);

  const cacheKey = 'neis:' + sha256_(endpoint + ':' + JSON.stringify(params)).slice(0, 40);
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const rows = fetchNeisRows_(endpoint, params, apiKey);
  try {
    const serialized = JSON.stringify(rows);
    if (serialized.length < 95000) cache.put(cacheKey, serialized, NEIS_CACHE_SECONDS);
  } catch (ignore) {
    // 캐시 실패는 실제 조회 결과에 영향을 주지 않습니다.
  }
  return rows;
}

function validateNeisParams_(params) {
  const dateKeys = ['MLSV_YMD', 'AA_YMD', 'AA_FROM_YMD', 'AA_TO_YMD', 'ALL_TI_YMD', 'TI_FROM_YMD', 'TI_TO_YMD'];
  dateKeys.forEach(function(key) {
    if (params[key] && !/^\d{8}$/.test(params[key])) throw new Error('NEIS 날짜 형식이 올바르지 않습니다.');
  });
  if (params.AY && !/^\d{4}$/.test(params.AY)) throw new Error('NEIS 학년도 형식이 올바르지 않습니다.');
  if (params.SEM && !/^[12]$/.test(params.SEM)) throw new Error('NEIS 학기 형식이 올바르지 않습니다.');
  if (params.GRADE && !/^[1-3]$/.test(params.GRADE)) throw new Error('웅천고 학년 형식이 올바르지 않습니다.');
  if (params.CLASS_NM && !/^\d{1,2}$/.test(params.CLASS_NM)) throw new Error('학급 형식이 올바르지 않습니다.');
}

function fetchNeisRows_(endpoint, params, apiKey) {
  const query = {
    KEY: apiKey,
    Type: 'json',
    pIndex: '1',
    pSize: '200',
    ATPT_OFCDC_SC_CODE: UNGCHEON_OFFICE_CODE,
    SD_SCHUL_CODE: UNGCHEON_SCHOOL_CODE
  };
  Object.keys(params).forEach(function(key) { query[key] = params[key]; });
  const queryString = Object.keys(query)
    .map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(query[key]); })
    .join('&');
  const response = UrlFetchApp.fetch(NEIS_BASE_URL + endpoint + '?' + queryString, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('NEIS 서버 응답 오류 (' + status + ')');

  let payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('NEIS 서버 응답을 해석하지 못했습니다.');
  }

  if (payload.RESULT && payload.RESULT.CODE && payload.RESULT.CODE !== 'INFO-000' && payload.RESULT.CODE !== 'INFO-200') {
    throw new Error(payload.RESULT.MESSAGE || 'NEIS API 오류 (' + payload.RESULT.CODE + ')');
  }
  const head = payload[endpoint] && payload[endpoint][0] && payload[endpoint][0].head;
  const resultItem = Array.isArray(head)
    ? head.filter(function(item) { return item && item.RESULT; })[0]
    : null;
  if (resultItem && resultItem.RESULT && resultItem.RESULT.CODE === 'INFO-200') return [];
  if (resultItem && resultItem.RESULT && resultItem.RESULT.CODE !== 'INFO-000') {
    throw new Error(resultItem.RESULT.MESSAGE || 'NEIS API 오류 (' + resultItem.RESULT.CODE + ')');
  }
  return payload[endpoint] && payload[endpoint][1] && Array.isArray(payload[endpoint][1].row)
    ? payload[endpoint][1].row
    : [];
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

function isAdminPassword_(password) {
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_KEY);
  return Boolean(stored && password && sha256_(String(password)) === stored);
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
