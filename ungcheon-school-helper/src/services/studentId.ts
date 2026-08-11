/**
 * 앱에서 표시하고 저장하는 학번은 `학년 1자리 + 반 1자리 + 번호 2자리`의 4자리 형식이다.
 * 기존 공유 자료나 사용자가 입력한 5자리 학번(반 2자리)은 즉시 4자리로 정규화한다.
 */
export function canonicalStudentId(value: unknown) {
  const studentId = String(value ?? '').replace(/\D/g, '')
  if (/^[1-3]\d{4}$/.test(studentId)) return `${studentId[0]}${studentId.slice(2)}`
  return studentId
}

export function studentIdsMatch(studentId: unknown, query: unknown) {
  return canonicalStudentId(studentId) === canonicalStudentId(query)
}

export function studentIdParts(value: unknown) {
  const studentId = canonicalStudentId(value)
  if (!/^[1-3]\d{3}$/.test(studentId)) {
    return { studentId, grade: '', className: '', number: '' }
  }
  return {
    studentId,
    grade: studentId.slice(0, 1),
    className: String(Number(studentId.slice(1, 2))),
    number: String(Number(studentId.slice(2, 4))),
  }
}
