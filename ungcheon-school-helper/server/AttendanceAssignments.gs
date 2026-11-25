// Real attendance uses the same dated timetable and authorized roster as school operations.
function attendanceStaffMembers_() {
  const roster = mobileSchoolData_('staffRoster', getStaffRoster_);
  return Array.isArray(roster && roster.members) ? roster.members : [];
}

function attendanceClassId_(value) {
  const text = String(value || '').replace(/\s/g, '');
  const parts = /^(?:3[-_]0?(\d{1,2})|3학년0?(\d{1,2})반|30(\d)|3(\d{2}))$/.exec(text);
  const number = parts && Number(parts.slice(1).find(Boolean));
  return number ? '3-' + number : '';
}

function attendanceStudentKey_(student) {
  if (!student || String(student.grade) !== '3') return '';
  const classNo = Number(student.className), number = Number(student.number);
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > 99 || !Number.isInteger(number) || number < 1 || number > 99) return '';
  return '3-' + classNo + '-' + number;
}

function attendanceRosterId_(student) {
  return String(student && student.studentId || '').replace(/^([1-3])0(\d{3})$/, '$1$2');
}

function attendanceBuildScope_(date, period, data) {
  const rows = [], byStudent = new Map(), rosterIds = new Map(), disputed = new Set();
  data.roster.forEach(function(student) {
    const key = attendanceStudentKey_(student), name = clean_(student.name, 30);
    if (!key || !name || !student.studentId) return;
    if (byStudent.has(key)) { disputed.add(key); return; }
    const classId = '3-' + Number(student.className);
    const rosterId = attendanceRosterId_(student);
    rosterIds.set(key, rosterId);
    byStudent.set(key, { id: 's-' + migrationHash_([date.slice(0, 4), key, rosterId, name]).slice(0, 40), name: name, classId: classId, number: Number(student.number), exception: '명단 확인 필요' });
  });
  disputed.forEach(function(key) { byStudent.delete(key); });
  byStudent.forEach(function(row) { rows.push(row); });
  rows.sort(function(a, b) { return Number(a.classId.slice(2)) - Number(b.classId.slice(2)) || a.number - b.number; });
  const classLists = {};
  rows.forEach(function(row) { (classLists[row.classId] || (classLists[row.classId] = [])).push(row); });
  const classes = Object.keys(classLists).map(function(id) { return { id: id, label: '3학년 ' + id.slice(2) + '반' }; });
  const noLesson = mobileCancelledGradePeriod_(date, '3', period) || mobileTimetableDayIndex_(date) < 0;
  const blockedClasses = new Set(data.overrides.filter(function(item) {
    return item.active && item.date === date && Number(item.targetPeriod) === period &&
      (!item.targetGrade || String(item.targetGrade) === '3') && item.targetClass;
  }).map(function(item) { return attendanceClassId_(item.targetClass) || '3-' + Number(item.targetClass); }));
  const singleSlots = new Map(), staleSlots = new Set();
  data.personal.forEach(function(item) {
    const key = attendanceStudentKey_(item && item.student);
    const row = byStudent.get(key);
    if (!row || row.name !== clean_(item.student.name, 30) || attendanceRosterId_(item.student) !== rosterIds.get(key)) return;
    if (singleSlots.has(key)) staleSlots.add(key);
    else singleSlots.set(key, item.slots || {});
  });
  staleSlots.forEach(function(key) { singleSlots.delete(key); });
  const groups = new Map();
  if (!noLesson) data.staff.forEach(function(member) {
    const teacher = clean_(member.name, 30);
    const teacherId = clean_(member.id, 128);
    if (!teacher || !teacherId) return;
    const context = mobileAttendanceContext_(teacher, date, period, data.overrides, data.changes, data.pulled);
    if (!context || context.review) return;
    const day = ['월','화','수','목','금'][mobileTimetableDayIndex_(context.date)];
    if (!day) return;
    const expected = mobileAttendanceLessonAt_(data.timetable, context.teacherName, context.date, context.period);
    if (!expected) return;
    const slotKey = day + context.period;
    singleSlots.forEach(function(slots, key) {
      const row = byStudent.get(key), slot = slots[slotKey];
      if (!slot || blockedClasses.has(row.classId) || !clean_(slot.subject, 120) ||
          !mobileAttendanceTeacherMatches_(slot.teacher, context.teacherName, slot, expected, data.timetable, context.date, context.period)) return;
      const elective = Boolean(slot.selectedCourse), subject = clean_(slot.subject, 120), room = clean_(slot.classroom, 50);
      const groupLabel = elective ? clean_(slot.group, 20) || room : row.classId;
      if (!groupLabel || /자습|공강/.test(subject)) return;
      const courseId = 'c-' + migrationHash_([context.date, context.period, elective, groupLabel, mobileAttendanceSubjectKey_(subject), room]).slice(0, 40);
      if (!groups.has(courseId)) groups.set(courseId, {
        id: courseId, subject: subject, room: room || '3학년 ' + row.classId.slice(2) + '반',
        kind: elective ? '이동수업' : '학급수업', change: { exchange: '교환', substitution: '대강', pulled: '당김', override: '시간표 변경' }[context.changeType] || '',
        from: context.originalLabel || '', teacherIds: Object.create(null), roster: Object.create(null), classId: elective ? '' : row.classId
      });
      const group = groups.get(courseId);
      // Track eligibility per student until every enrolled learner has been matched.
      group.roster[row.id] = group.roster[row.id] || Object.create(null);
      group.roster[row.id][teacherId] = true;
      group.teacherIds[teacherId] = teacher;
    });
  });
  const candidates = new Map();
  groups.forEach(function(group) {
    const assigned = Object.keys(group.roster);
    if (group.classId && assigned.length !== classLists[group.classId].length) return;
    const teachers = Object.keys(group.teacherIds).filter(function(id) { return assigned.every(function(studentId) { return group.roster[studentId][id]; }); });
    if (!teachers.length) return;
    group.lesson = { id: group.id, subject: group.subject, room: group.room, kind: group.kind, change: group.change, from: group.from,
      teacher: teachers.map(function(id) { return group.teacherIds[id]; }).join('·'), teacherIds: teachers };
    assigned.forEach(function(studentId) {
      if (!candidates.has(studentId)) candidates.set(studentId, []);
      candidates.get(studentId).push(group);
    });
  });
  const ambiguous = new Set();
  candidates.forEach(function(list) { if (list.length > 1) list.forEach(function(group) { ambiguous.add(group.id); }); });
  const lessons = [];
  groups.forEach(function(group) { if (group.lesson && !ambiguous.has(group.id)) lessons.push(group.lesson); });
  const slotKey = ['월','화','수','목','금'][mobileTimetableDayIndex_(date)] + period;
  rows.forEach(function(row) {
    const choices = candidates.get(row.id);
    if (choices && choices.length === 1 && !ambiguous.has(choices[0].id)) {
      row.lesson = choices[0].lesson;
      delete row.exception;
    } else if (noLesson) row.exception = '수업 없음';
    else {
      const slots = singleSlots.get(row.classId + '-' + row.number);
      const slot = slots && slots[slotKey];
      if (slot && /자습/.test(slot.subject)) row.exception = '자습';
      else if (slot && /장소\s*이동/.test(slot.subject)) row.exception = '장소 이동';
    }
  });
  return { classes: classes, lessons: lessons, rows: rows, noLesson: noLesson };
}

function attendanceScope_(date, period, staff, viewer) {
  const revision = migrationBackendContext_ && migrationBackendContext_.revision;
  if (!Number.isSafeInteger(revision) || migrationBackendContext_.quotaBackup) throw Error('현재 시간표를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
  const key = 'attendance-v' + MOBILE_SERVICE_VERSION + ':' + migrationHash_([date, period, revision, privateSchoolRevision_('timetable'), privateSchoolRevision_('studentTimetable')]);
  const cache = CacheService.getScriptCache();
  try {
    const saved = cache.get(key);
    if (saved) return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(saved), 'application/x-gzip')).getDataAsString('UTF-8'));
  } catch (_) {}
  const roster = mobileSchoolData_('studentRoster', getStudentRoster_);
  const timetable = mobileSchoolData_('timetable', getTimetable_);
  const personal = mobileSchoolData_('studentTimetable', getStudentTimetable_);
  if (!Array.isArray(roster && roster.students) || !Array.isArray(timetable && timetable.teachers) || !Array.isArray(personal && personal.students)) throw Error('학교 명렬과 시간표를 확인해 주세요.');
  const scope = attendanceBuildScope_(date, period, {
    staff: staff, roster: roster.students, personal: personal.students, timetable: timetable, pulled: timetable.pulledLessons || [],
    changes: listTimetableChanges_({ viewerName: viewer, includeSchool: true, fromDate: date, toDate: date }),
    overrides: listTimetableOverrides_({ includeInactive: false }).filter(function(item) { return item.date === date || item.sourceDate === date; })
  });
  try {
    const archive = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(scope), 'application/json')).getBytes());
    if (archive.length < 95000) cache.put(key, archive, 240);
  } catch (_) {}
  return scope;
}
