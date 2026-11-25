// Real attendance uses the same dated timetable and authorized roster as school operations.
function attendanceStaffMembers_() {
  const roster = mobileSchoolData_('staffRoster', getStaffRoster_);
  return Array.isArray(roster && roster.members) ? roster.members : [];
}

function attendanceClassId_(value) {
  const text = String(value || '').replace(/\s/g, '');
  const parts = /^([1-3])(?:(?:[-_]|학년)(\d{1,2})반?|(\d{2}))$/.exec(text);
  const number = parts && Number(parts[2] || parts[3]);
  return number ? parts[1] + '-' + number : '';
}

function attendanceClassLabel_(classId) {
  return classId.replace('-', '학년 ') + '반';
}

function attendanceStudentKey_(student) {
  if (!student || !/^[1-3]$/.test(String(student.grade))) return '';
  const classNo = Number(student.className), number = Number(student.number);
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > 99 || !Number.isInteger(number) || number < 1 || number > 99) return '';
  return student.grade + '-' + classNo + '-' + number;
}

function attendanceRosterId_(student) {
  return String(student && student.studentId || '').replace(/^([1-3])0(\d{3})$/, '$1$2');
}

function attendanceBuildScope_(date, period, data) {
  const rows = [], byStudent = new Map(), rosterIds = new Map(), disputed = new Set();
  data.roster.forEach(function(student) {
    const key = attendanceStudentKey_(student);
    if (!key) return;
    const name = clean_(student.name, 30);
    if (!name || !student.studentId) return;
    if (byStudent.has(key)) { disputed.add(key); return; }
    const grade = String(student.grade), classId = grade + '-' + Number(student.className);
    const rosterId = attendanceRosterId_(student);
    rosterIds.set(key, rosterId);
    byStudent.set(key, { id: 's-' + migrationHash_([date.slice(0, 4), key, rosterId, name]).slice(0, 40), name: name, classId: classId, grade: grade, number: Number(student.number), exception: '명단 확인 필요' });
  });
  disputed.forEach(function(key) { byStudent.delete(key); });
  byStudent.forEach(function(row) { rows.push(row); });
  rows.sort(function(a, b) { return Number(a.grade) - Number(b.grade) || Number(a.classId.slice(2)) - Number(b.classId.slice(2)) || a.number - b.number; });
  const classLists = {};
  rows.forEach(function(row) { (classLists[row.classId] || (classLists[row.classId] = [])).push(row); });
  const classes = Object.keys(classLists).map(function(id) { return { id: id, label: attendanceClassLabel_(id) }; });
  const singleSlots = new Map(), staleSlots = new Set();
  data.personal.forEach(function(item) {
    const key = attendanceStudentKey_(item && item.student);
    const row = byStudent.get(key);
    if (!row || row.name !== clean_(item.student.name, 30) || attendanceRosterId_(item.student) !== rosterIds.get(key)) return;
    if (singleSlots.has(key)) staleSlots.add(key);
    else singleSlots.set(key, item.slots || {});
  });
  staleSlots.forEach(function(key) { singleSlots.delete(key); });
  const electiveRosterGrades = new Set();
  singleSlots.forEach(function(slots, key) {
    if (Object.values(slots).some(function(slot) { return slot && slot.selectedCourse && clean_(slot.subject, 120); })) {
      electiveRosterGrades.add(byStudent.get(key).grade);
    }
  });
  const sourceGroups = new Map();
  classes.forEach(function(item) {
    const [grade, classNo] = item.id.split('-');
    const source = mobileAttendanceSourceSlot_(date, period, data.overrides, grade, classNo);
    const day = source && ['월','화','수','목','금'][mobileTimetableDayIndex_(source.date)];
    if (!day) {
      classLists[item.id].forEach(function(row) { row.exception = '수업 없음'; });
      return;
    }
    const key = source.date + '/' + source.period;
    if (!sourceGroups.has(key)) sourceGroups.set(key, { source: source, rows: [] });
    classLists[item.id].forEach(function(row) {
      const studentKey = row.classId + '-' + row.number;
      const slots = singleSlots.get(studentKey);
      const slot = slots && slots[day + source.period];
      if (slot && /자습/.test(slot.subject)) row.exception = '자습';
      else if (slot && /장소\s*이동/.test(slot.subject)) row.exception = '장소 이동';
      if (!staleSlots.has(studentKey)) sourceGroups.get(key).rows.push({ row: row, slots: slots });
    });
  });
  const groups = new Map();
  data.staff.forEach(function(member) {
    const teacher = clean_(member.name, 30);
    const teacherId = clean_(member.id, 128);
    if (!teacher || !teacherId) return;
    sourceGroups.forEach(function(bucket) {
      const context = mobileAttendanceContext_(teacher, date, period, data.overrides, data.changes, data.pulled, bucket.source);
      if (!context || context.review) return;
      const day = ['월','화','수','목','금'][mobileTimetableDayIndex_(context.date)];
      const expected = day && mobileAttendanceLessonAt_(data.timetable, context.teacherName, context.date, context.period);
      if (!expected) return;
      const expectedClass = attendanceClassId_(expected.classLabel);
      const slotKey = day + context.period;
      bucket.rows.forEach(function(item) {
        const row = item.row, slot = item.slots && item.slots[slotKey];
        const elective = Boolean(slot && slot.selectedCourse);
        if (expectedClass && !elective && expectedClass !== row.classId) return;
        const personalSubject = clean_(slot && slot.subject, 120);
        if (/자습|공강|장소\s*이동/.test(personalSubject)) return;
        const matched = Boolean(personalSubject && mobileAttendanceTeacherMatches_(slot.teacher, context.teacherName, slot, expected, data.timetable, context.date, context.period));
        // Confirm an administrative class from the teacher timetable when a student has no individual slot.
        const classFallback = !elective && expectedClass === row.classId && (!personalSubject ||
          (!clean_(slot.teacher, 100) && mobileAttendanceSubjectKey_(personalSubject) === mobileAttendanceSubjectKey_(expected.subject)));
        if (!matched && !classFallback) return;
        const subject = personalSubject || clean_(expected.subject, 120), room = clean_(slot && slot.classroom, 50);
        if (!subject || /자습|공강|장소\s*이동/.test(subject)) return;
        const groupLabel = elective ? clean_(slot.group, 20) || room : row.classId;
        if (!groupLabel) return;
        const identity = [context.date, context.period, elective, groupLabel, mobileAttendanceSubjectKey_(subject), room];
        // Keep the existing third-grade keys so already-entered records stay linked.
        if (row.grade !== '3') {
          if (!elective) identity[5] = '';
          identity.push(row.grade);
        }
        const courseId = 'c-' + migrationHash_(identity).slice(0, 40);
        if (!groups.has(courseId)) groups.set(courseId, {
          id: courseId, grade: row.grade, subject: subject, room: room || (elective ? '장소 미등록' : attendanceClassLabel_(row.classId)),
          kind: elective ? '이동수업' : '학급수업', change: { exchange: '교환', substitution: '대강', pulled: '당김', override: '시간표 변경' }[context.changeType] || '',
          from: context.originalLabel || '', teacherIds: Object.create(null), roster: Object.create(null), classId: elective ? '' : row.classId
        });
        const group = groups.get(courseId);
        group.roster[row.id] = group.roster[row.id] || Object.create(null);
        group.roster[row.id][teacherId] = true;
        group.teacherIds[teacherId] = teacher;
      });
    });
  });
  const candidates = new Map();
  groups.forEach(function(group) {
    const assigned = Object.keys(group.roster);
    if (group.classId && assigned.length !== classLists[group.classId].length) return;
    const teachers = Object.keys(group.teacherIds).filter(function(id) { return assigned.every(function(studentId) { return group.roster[studentId][id]; }); });
    if (!teachers.length) return;
    group.lesson = { id: group.id, grade: group.grade, subject: group.subject, room: group.room, kind: group.kind, change: group.change, from: group.from,
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
  lessons.sort(function(a, b) { return Number(a.grade) - Number(b.grade) || a.subject.localeCompare(b.subject); });
  rows.forEach(function(row) {
    const choices = candidates.get(row.id);
    if (choices && choices.length === 1 && !ambiguous.has(choices[0].id)) {
      row.lesson = choices[0].lesson;
      delete row.exception;
    }
  });
  return { classes: classes, lessons: lessons, rows: rows, electiveRosterGrades: Array.from(electiveRosterGrades).sort() };
}

function attendanceScope_(date, period, staff, viewer, loadData) {
  const revision = migrationBackendContext_ && migrationBackendContext_.revision;
  if (!Number.isSafeInteger(revision) || migrationBackendContext_.quotaBackup) throw Error('현재 시간표를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
  const sources = ['staffRoster','studentRoster','timetable','studentTimetable'].map(function(group) { return privateSchoolRevision_(group); });
  const key = 'attendance-v' + MOBILE_SERVICE_VERSION + ':' + migrationHash_([date, period, revision, sources]);
  const cache = CacheService.getScriptCache();
  try {
    const saved = cache.get(key);
    if (saved) return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(saved), 'application/x-gzip')).getDataAsString('UTF-8'));
  } catch (_) {}
  const scope = attendanceBuildScope_(date, period, loadData ? loadData() : attendanceScopeData_(date, staff, viewer));
  try {
    const archive = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(scope), 'application/json')).getBytes());
    if (archive.length < 95000) cache.put(key, archive, 240);
  } catch (_) {}
  return scope;
}

function attendanceScopeData_(date, staff, viewer) {
  const roster = mobileSchoolData_('studentRoster', getStudentRoster_);
  const timetable = mobileSchoolData_('timetable', getTimetable_);
  const personal = mobileSchoolData_('studentTimetable', getStudentTimetable_);
  if (!Array.isArray(roster && roster.students) || !Array.isArray(timetable && timetable.teachers)) throw Error('학교 명렬과 시간표를 확인해 주세요.');
  return {
    staff: staff, roster: roster.students, personal: Array.isArray(personal && personal.students) ? personal.students : [], timetable: timetable, pulled: timetable.pulledLessons || [],
    changes: listTimetableChanges_({ viewerName: viewer, includeSchool: true, fromDate: date, toDate: date }),
    overrides: listTimetableOverrides_({ includeInactive: false }).filter(function(item) { return item.date === date || item.sourceDate === date; })
  };
}
