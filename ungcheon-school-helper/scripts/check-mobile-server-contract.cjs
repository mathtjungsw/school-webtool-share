/* Apps Script mobile contract tests. Uses synthetic fixtures only; no network, credentials or writes. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../server/Code.gs');
const source = fs.readFileSync(sourcePath, 'utf8');
new vm.Script(source, { filename: 'server/Code.gs' });
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const realDate = Date;
function digest(value) { return crypto.createHash('sha256').update(String(value)).digest('base64'); }
function sessionKey(token) { return `UNG_MOBILE_SESSION_${digest(token).replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sheet(name, values) {
  return { getName: () => name, getDataRange: () => ({
    getValues: () => clone(values), getDisplayValues: () => values.map(row => row.map(value => String(value))),
    getMergedRanges: () => [], getRow: () => 1, getColumn: () => 1,
  }) };
}

function harness() {
  let clock = realDate.parse('2026-08-30T03:00:00Z');
  const secret = crypto.randomBytes(32).toString('hex');
  const existingToken = crypto.randomBytes(32).toString('hex');
  const properties = new Map([
    ['UNG_MOBILE_SHARED_PASSWORD_HASH', digest(secret)],
    [sessionKey(existingToken), JSON.stringify({ viewerName: '테스트교사', expiresAt: clock + 72 * 3600000 })],
    ['UNG_ADMIN_PASSWORD_SHA256', digest(crypto.randomBytes(32).toString('hex'))],
    ['UNG_SYNC_RESOURCE_fixture', 'preserve-existing-desktop-property'],
  ]);
  const deleted = [];
  const cache = new Map();
  const cacheKeys = [];
  const readNames = [];
  const failSources = new Set();
  let failCacheRead = false;
  let failCacheWrite = false;
  const rows = {
    교원명렬정보: [{ version: 1 }],
    교원명렬: [{ id: 'teacher-1', name: '테스트교사', position: '교사' }, { id: 'teacher-2', name: '다른교사', position: '교사' }],
    시간표정보: [{ version: 1, uploadedAt: '2026-08-29T01:00:00Z' }],
    시간표: [{ teacherName: '테스트교사', teacherLabel: '테스트교사(1)', slot1: '101\n국어' }, { teacherName: '다른교사', slot1: '202\n수학' }],
    위원회명단: [],
    위원회일정: [
      { id: 'committee-own', committeeId: '1', committeeName: '테스트위원회', title: '협의회', date: '2026-08-31', startTime: '13:10', endTime: '13:25', memberNamesJson: '["테스트교사"]' },
      { id: 'committee-other', committeeId: '2', committeeName: '다른위원회', title: '다른 협의회', date: '2026-08-31', startTime: '13:10', endTime: '13:25', memberNamesJson: '["다른교사"]' },
      { id: 'committee-past', committeeId: '1', committeeName: '테스트위원회', title: '지난 회의', date: '2026-08-01', startTime: '13:10', endTime: '13:25', memberNamesJson: '["테스트교사"]' },
    ],
    교환대강반영: [
      ['approved', 'approved', '테스트교사', ''], ['applied', 'pending', '테스트교사', '2026-08-29T01:00:00Z'],
      ['pending', 'pending', '테스트교사', ''], ['cancelled', 'cancelled', '테스트교사', '2026-08-29T01:00:00Z'],
      ['rejected', 'rejected', '테스트교사', '2026-08-29T01:00:00Z'], ['other-applied', 'pending', '다른교사', '2026-08-29T01:00:00Z'],
    ].map(([id, status, requesterName, requesterAppliedAt]) => ({ id, kind: 'exchange', status, requesterName,
      targetTeacherName: requesterName === '테스트교사' ? '다른교사' : '테스트교사', originalTeacher: requesterName,
      replacementTeacher: requesterName === '테스트교사' ? '다른교사' : '테스트교사', requesterAppliedAt,
      originalDate: '2026-08-31', replacementDate: '2026-09-01', createdAt: '2026-08-29T01:00:00Z',
    })),
    NEIS급식: [
      { date: '20260829', mealType: '중식', dishNamesJson: '["지난 급식"]', calories: '500', ntrInfo: 'must-not-be-returned' },
      { date: '20260830', mealType: '중식', dishNamesJson: '["오늘 밥","국"]', calories: '600', ntrInfo: 'must-not-be-returned' },
      { date: '20260831', mealType: '중식', dishNamesJson: '["내일 밥"]', calories: '650', ntrInfo: 'must-not-be-returned' },
      { date: '20260901', mealType: '석식', dishNamesJson: '["저녁 밥"]', calories: '700', ntrInfo: 'must-not-be-returned' },
      { date: '20261001', mealType: '중식', dishNamesJson: '["범위 밖"]', calories: '500' },
    ],
  };
  const books = {};
  const context = vm.createContext({
    Date: class extends realDate {
      constructor(...args) { super(...(args.length ? args : [clock])); }
      static now() { return clock; }
    },
    Utilities: {
      formatDate: (date, zone, format) => {
        assert.equal(zone, 'Asia/Seoul');
        const text = new realDate(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
        return format === 'yyyyMMdd' ? text.replace(/-/g, '') : text;
      },
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => [...crypto.createHash(algorithm).update(String(value)).digest()],
      base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) ?? null,
      getProperties: () => Object.fromEntries(properties),
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => { deleted.push(key); properties.delete(key); },
      deleteAllProperties: () => { throw new Error('Property reset is forbidden'); },
    }) },
    CacheService: { getScriptCache: () => ({
      get: key => { cacheKeys.push(key); if (failCacheRead) throw new Error('cache read failure'); return cache.get(key) || null; },
      put: (key, value, ttl) => { assert.equal(ttl, 60); if (failCacheWrite) throw new Error('cache write failure'); cache.set(key, value); },
    }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    SpreadsheetApp: { openById: id => { if (failSources.has(id)) throw new Error('synthetic unavailable source'); if (!books[id]) throw new Error('unexpected source'); return books[id]; } },
    LockService: { getScriptLock: () => { throw new Error('Mobile reads must not obtain initialization locks'); } },
    UrlFetchApp: { fetch: () => { throw new Error('Mobile must not call external APIs'); } },
    __readRows: name => {
      readNames.push(name);
      if (failSources.has(name)) throw new Error('synthetic unavailable source');
      if (!(name in rows)) throw new Error(`Forbidden or unexpected mobile sheet: ${name}`);
      return clone(rows[name]);
    },
  });
  vm.runInContext(source, context);
  vm.runInContext('readObjects_ = __readRows; ensureSheets_ = function() { throw new Error("Mobile fast path required"); };', context);
  const constants = vm.runInContext('({ version: MOBILE_SERVICE_VERSION, weekly: MOBILE_WEEKLY_PLAN_ID, creative: MOBILE_CREATIVE_SCHEDULE_ID, gate: MOBILE_GATE_DUTY_ID, meal: MOBILE_MEAL_DUTY_ID, notes: RELEASE_NOTES })', context);
  const weekly = sheet('2026.8.31', [['부서', '31(월)', '1(화)'], ['교무부', '교직원 회의', '주간계획']]);
  books[constants.weekly] = { getSheets: () => [weekly] };
  const creative = sheet('창체입력', [['날짜'], ['2026-08-31', '', 5, '', '동아리', true, false, false, '창체', '활동안내']]);
  const academic = sheet('학사일정_2학기', [['', 8, '', '', '', '', '', '', 31, '월요일 시간표 운영']]);
  books[constants.creative] = { getSheetByName: name => name === '창체입력' ? creative : name === '학사일정_2학기' ? academic : null };
  const gate = sheet('교문지도(2학기)', [['8월 31일', ''], ['테스트교사', '정문']]);
  const meal = sheet('급식 지도(2학기)', [['9월 1일'], ['테스트교사']]);
  books[constants.gate] = { getSheetByName: () => gate, getSheets: () => [gate] };
  books[constants.meal] = { getSheetByName: () => meal, getSheets: () => [meal] };
  const request = overrides => ({ action: 'getMobileScheduleBundle', viewerName: '테스트교사', accessToken: existingToken, fromDate: '2026-08-30', toDate: '2026-09-12', ...overrides });
  const post = body => context.doPost({ postData: { contents: JSON.stringify(body) } });
  return { context, constants, properties, existingToken, deleted, rows, readNames, cache, cacheKeys, failSources,
    request, post, login: (overrides = {}) => post({ action: 'verifyMobileViewer', viewerName: '테스트교사', password: secret, ...overrides }),
    advance: ms => { clock += ms; }, now: () => clock,
    failCache: (read, write) => { failCacheRead = read; failCacheWrite = write; },
  };
}

test('service v39+ and desktop/mobile release notices are retained', () => {
  const h = harness();
  assert.ok(h.constants.version >= 39);
  assert.equal(h.constants.notes[0].key, 'v1.1.26');
  for (const key of ['v1.1.24', 'v1.1.25', 'mobile-service-2026-08-26', 'mobile-service-2026-08-30', 'mobile-service-meal-range-2026-08-30']) {
    assert.equal(h.constants.notes.filter(note => note.key === key).length, 1, key);
  }
  assert.equal(h.context.doGet({ parameter: {} }).data.version, h.constants.version);
  assert.equal(h.post({ action: 'health' }).data.version, h.constants.version);
});

test('name/password login creates 72-hour session without resetting existing secrets or live sessions', () => {
  const h = harness();
  const before = [...h.properties];
  const result = h.login();
  assert.equal(result.ok, true);
  assert.equal(result.data.verified, true);
  assert.equal(realDate.parse(result.data.expiresAt) - h.now(), 72 * 3600000);
  assert.ok(result.data.accessToken);
  before.forEach(([key, value]) => assert.equal(h.properties.get(key), value));
  assert.deepEqual(h.deleted, []);
  assert.equal(h.post(h.request({ accessToken: result.data.accessToken })).ok, true);
  assert.equal(h.post(h.request()).ok, true);
});

test('login credentials are not treated as expired sessions or echoed in errors', () => {
  const h = harness();
  for (const result of [h.login({ password: 'synthetic-wrong-input' }), h.login({ viewerName: '명렬에없는이름' })]) {
    assert.equal(result.ok, false);
    assert.equal(result.code, undefined);
    assert.equal(result.errorCode, undefined);
    assert.doesNotMatch(result.error, /synthetic-wrong-input/);
  }
});

test('missing, mismatched and expired sessions provide a machine-readable expiry code', () => {
  const h = harness();
  for (const request of [h.request({ accessToken: '' }), h.request({ accessToken: crypto.randomBytes(32).toString('hex') }), h.request({ viewerName: '다른교사' })]) {
    const result = h.post(request);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'MOBILE_SESSION_EXPIRED');
    assert.equal(result.errorCode, 'MOBILE_SESSION_EXPIRED');
    assert.match(result.error, /로그인이 만료/);
  }
  h.advance(72 * 3600000);
  assert.equal(h.post(h.request()).code, 'MOBILE_SESSION_EXPIRED');
});

test('contract 3 retains all event sources and only the selected teacher timetable', () => {
  const h = harness();
  const result = h.post(h.request());
  assert.equal(result.ok, true);
  const bundle = result.data;
  assert.equal(bundle.contractVersion, 3);
  assert.equal(bundle.teacherTimetable.name, '테스트교사');
  assert.equal(bundle.teacherTimetable.slots.length, 35);
  assert.equal(bundle.teacherTimetable.slots[0].value, '101\n국어');
  assert.deepEqual([...new Set(bundle.events.map(event => event.source))].sort(), ['creative', 'gateDuty', 'mealDuty', 'schoolEvent', 'weekly']);
  assert.deepEqual(Object.keys(bundle.sourceStatus).sort(), ['changes', 'committee', 'creative', 'gateDuty', 'mealDuty', 'meals', 'timetable', 'weekly']);
  Object.values(bundle.sourceStatus).forEach(status => { assert.equal(status.state, 'fresh'); assert.ok(status.lastSuccessAt); });
});

test('committee and changes are scoped to the viewer/range and approved or applied rows', () => {
  const h = harness();
  const bundle = h.post(h.request()).data;
  assert.deepEqual(bundle.committeeEvents.map(item => item.id), ['committee-own']);
  assert.deepEqual(bundle.timetableChanges.map(item => item.id).sort(), ['applied', 'approved']);
});

test('request-range meals and legacy todayMeals use only four public fields', () => {
  const h = harness();
  const bundle = h.post(h.request()).data;
  assert.deepEqual(bundle.meals.map(meal => meal.date), ['2026-08-30', '2026-08-31', '2026-09-01']);
  assert.deepEqual(bundle.todayMeals.map(meal => meal.date), ['2026-08-30']);
  for (const meal of [...bundle.meals, ...bundle.todayMeals]) assert.deepEqual(Object.keys(meal).sort(), ['calories', 'date', 'dishNames', 'mealType']);
  const future = h.post(h.request({ fromDate: '2026-08-31', toDate: '2026-09-01' })).data;
  assert.deepEqual(future.meals.map(meal => meal.date), ['2026-08-31', '2026-09-01']);
  assert.deepEqual(future.todayMeals.map(meal => meal.date), ['2026-08-30']);
});

test('mobile response and read path exclude student and forbidden NEIS datasets', () => {
  const h = harness();
  const result = h.post(h.request());
  assert.equal(result.ok, true);
  const responseText = JSON.stringify(result.data);
  for (const forbidden of ['studentRoster', 'studentTimetable', 'students', 'NEIS학사일정', 'NEIS학급시간표', 'ntrInfo', 'must-not-be-returned', 'UNG_MOBILE_', 'accessToken', 'password']) {
    assert.equal(responseText.includes(forbidden), false, forbidden);
  }
  assert.ok(h.readNames.includes('NEIS급식'));
  assert.equal(h.readNames.some(name => /학생|NEIS학사일정|NEIS학급시간표/.test(name)), false);
  assert.deepEqual(Object.keys(result.data).sort(), ['committeeEvents', 'contractVersion', 'events', 'fetchedAt', 'meals', 'servedAt', 'sourceStatus', 'teacherTimetable', 'timetableChanges', 'todayMeals']);
});

test('one failing source does not fail other data or cache the partial result', () => {
  const h = harness();
  h.failSources.add(h.constants.weekly);
  const result = h.post(h.request());
  assert.equal(result.ok, true);
  assert.equal(result.data.sourceStatus.weekly.state, 'unavailable');
  assert.equal(result.data.sourceStatus.weekly.errorCode, 'READ_FAILED');
  assert.equal(result.data.sourceStatus.meals.state, 'fresh');
  assert.equal(result.data.teacherTimetable.name, '테스트교사');
  assert.ok(result.data.events.some(event => event.source === 'creative'));
  assert.equal(h.cache.size, 0);
});

test('empty sources are empty, not unavailable', () => {
  const h = harness();
  h.rows.NEIS급식 = [];
  h.rows.시간표 = [];
  const result = h.post(h.request());
  assert.equal(result.ok, true);
  assert.equal(result.data.sourceStatus.meals.state, 'empty');
  assert.equal(result.data.sourceStatus.timetable.state, 'empty');
  assert.equal(result.data.teacherTimetable, null);
  assert.equal(result.data.sourceStatus.meals.errorCode, undefined);
});

test('cache keys include version, viewer, range and Korea date; responses report cache mode', () => {
  const h = harness();
  assert.equal(h.post(h.request()).ok, true);
  const repeated = h.post(h.request()).data;
  Object.values(repeated.sourceStatus).forEach(status => assert.equal(status.mode, 'response-cache'));
  assert.match(h.cacheKeys[0], new RegExp(`^mobile:v${h.constants.version}:.*:20260830:2026-08-30:2026-09-12$`));
  h.advance(24 * 3600000);
  const nextDay = h.post(h.request()).data;
  assert.deepEqual(nextDay.todayMeals.map(meal => meal.date), ['2026-08-31']);
  assert.ok(h.cacheKeys.some(key => key.includes(':20260831:')));
});

test('cache read/write failure or corrupt cache never turns good data into API failure', () => {
  const h = harness();
  h.failCache(true, true);
  assert.equal(h.post(h.request()).ok, true);
  h.failCache(false, false);
  h.post(h.request());
  for (const key of h.cache.keys()) h.cache.set(key, '{invalid-cache');
  assert.equal(h.post(h.request()).ok, true);
});

test('invalid dates, reversed ranges and more than 22 days are rejected', () => {
  const h = harness();
  for (const range of [
    { fromDate: '2026-08-40' }, { fromDate: '2026-02-30' }, { toDate: '2026-13-01' },
    { fromDate: '2026-09-20', toDate: '2026-09-01' }, { toDate: '2026-09-30' },
  ]) assert.equal(h.post(h.request(range)).ok, false);
});

console.log(`Mobile Apps Script contract: ${passed} tests passed. No live services or secrets used.`);
