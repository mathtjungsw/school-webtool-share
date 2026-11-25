function attendanceAction_(body) {
  const viewer = body.staffToken ? staffRequire_(body).name : mobileAssertAccess_(body);
  const config = migrationPrimaryConfig_();
  if (!config || config.phase !== 'FIRESTORE' || !migrationBackendContext_ || migrationBackendContext_.quotaBackup) {
    throw Error('출결용 Firebase 연결을 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  const members = attendanceStaffMembers_();
  const matches = members.filter(function(member) { return clean_(member.name, 30) === viewer; });
  const member = matches.length === 1 ? matches[0] : null;
  const staffId = member && clean_(member.id, 128);
  if (!staffId || members.filter(function(item) { return clean_(item.id, 128) === staffId; }).length !== 1) {
    if (body.action === 'attendanceInfo') return { dates: [], access: { roles: [], readOnly: false } };
    throw Error('교직원 명렬에서 출결 담당자를 확인할 수 없습니다.');
  }
  const executiveName = typeof executiveIdentity_ === 'function' && (function() {
    try { return Boolean(executiveIdentity_(viewer)); } catch (_) { return false; }
  })();
  const leadership = executiveName || ['교장','교감'].indexOf(clean_(member.position, 15)) >= 0;
  const date = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  if (body.action === 'attendanceLeadership') {
    if (!leadership) throw Error('교장·교감 보호 메뉴 권한이 필요합니다.');
    return executiveVerify_({ viewerName: viewer, password: body.password });
  }
  let elevated = false;
  if (leadership && body.executiveToken) {
    try {
      executiveAssertAccess_({ viewerName: viewer, accessToken: body.executiveToken });
      elevated = true;
    } catch (_) {}
  }
  const homeClass = attendanceClassId_(member.homeroom);
  if (body.action === 'attendanceInfo') {
    const timetable = leadership ? null : mobileSchoolData_('timetable', getTimetable_);
    const hasLessons = Boolean(timetable && timetable.teachers && timetable.teachers.some(function(teacher) {
      return clean_(teacher.name, 30) === viewer;
    }));
    const roles = elevated ? ['homeroom', 'subject'] : leadership ? [] : [homeClass ? 'homeroom' : '', hasLessons ? 'subject' : ''].filter(Boolean);
    return { dates: [date], access: { roles: roles, readOnly: leadership, requiresExecutive: leadership && !elevated } };
  }
  if (leadership && !elevated) throw Error('교장·교감 보호 메뉴 인증을 먼저 해 주세요.');
  const period = Number(body.period), role = String(body.role || ''), group = String(body.group || '');
  if (body.date !== date || !Number.isInteger(period) || period < 1 || period > 7) throw Error('오늘 날짜와 교시를 확인해 주세요.');
  if (body.action === 'attendanceRecord' && elevated) throw Error('교장·교감 출결 화면은 읽기 전용입니다.');
  if (body.action !== 'attendanceOptions' && (role !== 'homeroom' && role !== 'subject' || !/^[a-zA-Z0-9-]{1,48}$/.test(group))) throw Error('학급 또는 수업을 확인해 주세요.');
  if (role === 'homeroom' && !elevated && group !== homeClass) throw Error('담당 학급만 열 수 있습니다.');
  const scope = attendanceScope_(date, period, members, viewer);
  const classes = scope.classes.filter(function(item) { return elevated || item.id === homeClass; });
  const lessons = scope.lessons.filter(function(item) { return elevated || item.teacherIds.indexOf(staffId) >= 0; });
  if (body.action === 'attendanceOptions') return { classes: classes, lessons: lessons.map(attendancePublicLesson_) };
  const allowed = (role === 'homeroom' ? classes : lessons).some(function(item) { return item.id === group; });
  if (!allowed) throw Error('담당 학급 또는 담당 수업만 열 수 있습니다.');
  const rows = scope.rows.filter(function(row) { return role === 'homeroom' ? row.classId === group : row.lesson && row.lesson.id === group; });
  if (scope.noLesson && body.action === 'attendanceRecord' && body.field !== 'note') throw Error('수업이 없는 교시에는 출결을 입력할 수 없습니다.');
  const repo = migrationPrimaryRepository_(config);
  if (body.action === 'attendanceBoard') return attendanceReadBoard_(repo, date, period, rows, body.ifRevision);
  if (body.action === 'attendanceRecord') return attendanceSaveRecord_(repo, date, period, role, rows, staffId, body);
  throw Error('허용되지 않는 출결 요청입니다.');
}

function attendancePublicLesson_(lesson) {
  const dto = { id: lesson.id, subject: lesson.subject, teacher: lesson.teacher, kind: lesson.kind, room: lesson.room };
  if (lesson.change) dto.change = lesson.change;
  if (lesson.from) dto.from = lesson.from;
  return dto;
}

function attendanceRecordPath_(date, period, row, field) {
  const base = 'attendanceDays/' + date;
  if (field === 'note') return base + '/notes/' + row.classId;
  return base + '/periods/' + period + '/checks/' + (field === 'homeroom' ? 'home-' + row.classId : 'class-' + row.lesson.id);
}

function attendanceReadBoard_(repo, date, period, rows, ifRevision) {
  const paths = new Set();
  rows.forEach(function(row) {
    paths.add(attendanceRecordPath_(date, period, row, 'note'));
    paths.add(attendanceRecordPath_(date, period, row, 'homeroom'));
    if (row.lesson) paths.add(attendanceRecordPath_(date, period, row, 'subject'));
  });
  const keys = Array.from(paths).sort(), stored = {
    docs: new Map(), revision: []
  };
  for (let i = 0; i < keys.length; i += 100) repo.batchGet(keys.slice(i, i + 100)).forEach(function(record) {
    if (!record) return;
    stored.docs.set(record.path, record.data.values || {});
    stored.revision.push([record.path, record.updateTime]);
  });
  const revision = migrationHash_([rows, stored.revision]);
  if (revision === ifRevision) return { notModified: true, revision: revision };
  const records = {};
  const detail = rows.map(function(row) {
    const current = {};
    ['note','homeroom','subject'].forEach(function(field) {
      if (field === 'subject' && !row.lesson) return;
      const group = stored.docs.get(attendanceRecordPath_(date, period, row, field));
      const entry = group && group[row.id];
      if (entry && typeof entry.value === 'string') current[field] = entry.value;
    });
    records[row.id] = current;
    const publicRow = { id: row.id, name: row.name, classId: row.classId, number: row.number };
    if (row.lesson) publicRow.lesson = attendancePublicLesson_(row.lesson);
    if (row.exception) publicRow.exception = row.exception;
    return publicRow;
  });
  return { rows: detail, records: records, revision: revision };
}

function attendanceSaveRecord_(repo, date, period, role, rows, staffId, body) {
  const field = body.field, row = rows.find(function(item) { return item.id === body.student; });
  if (!row || !(field === role || field === 'note' && role === 'homeroom') || field === 'subject' && !row.lesson || typeof body.value !== 'string') throw Error('수정할 수 없는 기록입니다.');
  if (field === 'note' ? body.value.length > 160 : ['미확인', '출석', '결석'].indexOf(body.value) < 0) throw Error('입력한 출결 내용을 확인해 주세요.');
  const value = body.value.trim(), path = attendanceRecordPath_(date, period, row, field);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = repo.get(path), values = Object.assign({}, current && current.data.values);
    if (values[row.id] && values[row.id].value === value) return { student: row.id, field: field, value: value };
    values[row.id] = { value: value, actor: staffId, updatedAt: new Date().toISOString() };
    try {
      repo.commit([{ path: path, data: { values: values }, updateTime: current && current.updateTime, createOnly: !current }]);
      return { student: row.id, field: field, value: value };
    } catch (error) {
      if (error.code !== 'MIGRATION_FIRESTORE_CONFLICT') throw error;
    }
  }
  throw Error('다른 출결 입력과 겹쳤습니다. 다시 눌러 주세요.');
}
