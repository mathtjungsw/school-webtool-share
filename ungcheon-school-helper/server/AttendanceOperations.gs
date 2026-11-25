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
    const teaches = Boolean(timetable && timetable.teachers && timetable.teachers.some(function(teacher) {
      return clean_(teacher.name, 30) === viewer;
    }));
    const substitute = !leadership && !teaches && listTimetableChanges_({ viewerName: viewer, includeSchool: true, fromDate: date, toDate: date })
      .some(function(item) { return item.kind === 'substitution' && item.originalDate === date && item.replacementTeacher === viewer; });
    const roles = elevated ? ['homeroom', 'subject'] : leadership ? [] : [homeClass ? 'homeroom' : '', teaches || substitute ? 'subject' : ''].filter(Boolean);
    return { dates: [date], access: { roles: roles, readOnly: leadership, requiresExecutive: leadership && !elevated } };
  }
  if (leadership && !elevated) throw Error('교장·교감 보호 메뉴 인증을 먼저 해 주세요.');
  const period = Number(body.period), role = String(body.role || ''), group = String(body.group || '');
  if (body.date !== date || !Number.isInteger(period) || period < 1 || period > 7) throw Error('오늘 날짜와 교시를 확인해 주세요.');
  if (body.action === 'attendanceRecord' && elevated) throw Error('교장·교감 출결 화면은 읽기 전용입니다.');
  if (body.action !== 'attendanceOptions' && (role !== 'homeroom' && role !== 'subject' || !/^[a-zA-Z0-9-]{1,48}$/.test(group))) throw Error('학급 또는 수업을 확인해 주세요.');
  if (role === 'homeroom' && !elevated && group !== homeClass) throw Error('담당 학급만 열 수 있습니다.');
  if (body.allPeriods === true || body.allPeriods === 'true') {
    if (role !== 'homeroom' || attendanceClassId_(group) !== group) throw Error('담임 학급의 하루 출결을 확인해 주세요.');
    if (body.action === 'attendanceRecord' && (body.allPresent !== true || body.field !== role)) throw Error('담당 출결만 입력할 수 있습니다.');
    if (body.action !== 'attendanceBoard' && body.action !== 'attendanceRecord') throw Error('허용되지 않는 출결 요청입니다.');
    let data;
    const boards = Array.from({ length: 7 }, function(_, index) {
      const period = index + 1;
      const scope = attendanceScope_(date, period, members, viewer, function() {
        if (!data) data = attendanceScopeData_(date, members, viewer);
        return data;
      });
      return { period: period, rows: scope.rows.filter(function(row) { return row.classId === group; }) };
    });
    const repo = migrationPrimaryRepository_(config);
    if (body.action === 'attendanceBoard') return attendanceReadDay_(repo, date, boards, body.ifRevision);
    return attendancePresentDay_(repo, date, boards, staffId, body.student);
  }
  const scope = attendanceScope_(date, period, members, viewer);
  const classes = scope.classes.filter(function(item) { return elevated || item.id === homeClass; });
  const lessons = scope.lessons.filter(function(item) { return elevated || item.teacherIds.indexOf(staffId) >= 0; });
  if (body.action === 'attendanceOptions') return { classes: classes, lessons: lessons.map(attendancePublicLesson_), electiveRosterGrades: scope.electiveRosterGrades };
  const allowed = (role === 'homeroom' ? classes : lessons).some(function(item) { return item.id === group; });
  if (!allowed) throw Error('담당 학급 또는 담당 수업만 열 수 있습니다.');
  const rows = scope.rows.filter(function(row) { return role === 'homeroom' ? row.classId === group : row.lesson && row.lesson.id === group; });
  const repo = migrationPrimaryRepository_(config);
  if (body.action === 'attendanceBoard') return attendanceReadBoard_(repo, date, period, rows, body.ifRevision);
  if (body.action === 'attendanceRecord') return attendanceSaveRecord_(repo, date, period, role, rows, staffId, body);
  throw Error('허용되지 않는 출결 요청입니다.');
}

function attendancePublicLesson_(lesson) {
  const dto = { id: lesson.id, grade: lesson.grade, subject: lesson.subject, teacher: lesson.teacher, kind: lesson.kind, room: lesson.room };
  if (lesson.change) dto.change = lesson.change;
  if (lesson.from) dto.from = lesson.from;
  return dto;
}

function attendanceRecordPath_(date, period, row, field) {
  const base = 'attendanceDays/' + date;
  if (field === 'note') return base + '/notes/' + row.classId;
  return base + '/periods/' + period + '/checks/' + (field === 'homeroom' ? 'home-' + row.classId : 'class-' + row.lesson.id);
}

function attendanceBoardDocuments_(repo, date, boards) {
  const paths = new Set();
  boards.forEach(function(board) {
    board.rows.forEach(function(row) {
      paths.add(attendanceRecordPath_(date, board.period, row, 'note'));
      paths.add(attendanceRecordPath_(date, board.period, row, 'homeroom'));
      if (row.lesson) paths.add(attendanceRecordPath_(date, board.period, row, 'subject'));
    });
  });
  const keys = Array.from(paths).sort(), stored = {
    docs: new Map(), revision: []
  };
  for (let i = 0; i < keys.length; i += 100) repo.batchGet(keys.slice(i, i + 100)).forEach(function(record) {
    if (!record) return;
    stored.docs.set(record.path, record.data.values || {});
    stored.revision.push([record.path, record.updateTime]);
  });
  return stored;
}

function attendanceBoardValue_(stored, date, period, row, field) {
  if (field === 'subject' && !row.lesson) return;
  const group = stored.docs.get(attendanceRecordPath_(date, period, row, field));
  const entry = group && group[row.id];
  if (entry && typeof entry.value === 'string') return entry.value;
}

function attendanceReadBoard_(repo, date, period, rows, ifRevision) {
  const stored = attendanceBoardDocuments_(repo, date, [{ period: period, rows: rows }]);
  const revision = migrationHash_([rows, stored.revision]);
  if (revision === ifRevision) return { notModified: true, revision: revision };
  const records = {};
  const detail = rows.map(function(row) {
    const current = {};
    ['note','homeroom','subject'].forEach(function(field) {
      const value = attendanceBoardValue_(stored, date, period, row, field);
      if (value !== undefined) current[field] = value;
    });
    records[row.id] = current;
    const publicRow = { id: row.id, name: row.name, classId: row.classId, number: row.number };
    if (row.lesson) publicRow.lesson = attendancePublicLesson_(row.lesson);
    if (row.exception) publicRow.exception = row.exception;
    return publicRow;
  });
  return { rows: detail, records: records, revision: revision };
}

function attendanceReadDay_(repo, date, boards, ifRevision) {
  const stored = attendanceBoardDocuments_(repo, date, boards);
  const revision = migrationHash_([boards, stored.revision]);
  if (revision === ifRevision) return { notModified: true, revision: revision };
  const students = new Map();
  boards.forEach(function(board) {
    board.rows.forEach(function(row) {
      if (!students.has(row.id)) {
        students.set(row.id, {
          id: row.id, name: row.name, classId: row.classId, number: row.number, periods: {},
          note: attendanceBoardValue_(stored, date, board.period, row, 'note')
        });
      }
      students.get(row.id).periods[board.period] = {
        lesson: row.lesson ? attendancePublicLesson_(row.lesson) : undefined,
        exception: row.exception,
        homeroom: attendanceBoardValue_(stored, date, board.period, row, 'homeroom'),
        subject: attendanceBoardValue_(stored, date, board.period, row, 'subject')
      };
    });
  });
  return { students: Array.from(students.values()), revision: revision };
}

function attendancePresentDay_(repo, date, boards, staffId, student) {
  if (student !== undefined && (typeof student !== 'string' || !student)) throw Error('학생 명단을 확인해 주세요.');
  const eligible = boards.map(function(board) {
    return { period: board.period, rows: board.rows.filter(function(row) {
      return row.exception !== '수업 없음' && (student === undefined || student === row.id);
    }) };
  }).filter(function(board) { return board.rows.length; });
  if (!eligible.length) throw Error('출석을 입력할 학생이 없습니다.');
  attendanceUpdateRecords_(repo, date, eligible, staffId, 'homeroom', '출석');
  return { updates: eligible.map(function(board) {
    return { period: board.period, students: board.rows.map(function(row) { return row.id; }) };
  }) };
}

function attendanceSaveRecord_(repo, date, period, role, rows, staffId, body) {
  const field = body.field;
  if (body.allPresent === true) {
    if (field !== role) throw Error('담당 출결만 입력할 수 있습니다.');
    const eligible = rows.filter(function(row) { return row.exception !== '수업 없음'; });
    if (!eligible.length) throw Error('출석을 입력할 학생이 없습니다.');
    attendanceUpdateRecords_(repo, date, [{ period: period, rows: eligible }], staffId, field, '출석');
    return { students: eligible.map(function(row) { return row.id; }), field: field, value: '출석' };
  }
  const row = rows.find(function(item) { return item.id === body.student; });
  if (!row || !(field === role || field === 'note' && role === 'homeroom') || field === 'subject' && !row.lesson || typeof body.value !== 'string') throw Error('수정할 수 없는 기록입니다.');
  if (row.exception === '수업 없음' && field !== 'note') throw Error('수업이 없는 교시에는 출결을 입력할 수 없습니다.');
  if (field === 'note' ? body.value.length > 160 : ['미확인', '출석', '결석'].indexOf(body.value) < 0) throw Error('입력한 출결 내용을 확인해 주세요.');
  const value = body.value.trim();
  attendanceUpdateRecords_(repo, date, [{ period: period, rows: [row] }], staffId, field, value);
  return { student: row.id, field: field, value: value };
}

function attendanceUpdateRecords_(repo, date, boards, staffId, field, value) {
  const paths = boards.map(function(board) { return attendanceRecordPath_(date, board.period, board.rows[0], field); });
  const entry = { value: value, actor: staffId, updatedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = paths.length === 1 ? [repo.get(paths[0])] : repo.batchGet(paths);
    const changes = [];
    boards.forEach(function(board, index) {
      const existing = current[index], values = Object.assign({}, existing && existing.data.values);
      const changed = board.rows.filter(function(row) { return !values[row.id] || values[row.id].value !== value; });
      if (!changed.length) return;
      changed.forEach(function(row) { values[row.id] = entry; });
      changes.push({ path: paths[index], data: { values: values }, updateTime: existing && existing.updateTime, createOnly: !existing });
    });
    if (!changes.length) return;
    try {
      repo.commit(changes);
      return;
    } catch (error) {
      if (error.code !== 'MIGRATION_FIRESTORE_CONFLICT') throw error;
    }
  }
  throw Error('다른 출결 입력과 겹쳤습니다. 다시 눌러 주세요.');
}
