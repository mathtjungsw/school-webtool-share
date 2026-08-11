/**
 * 웅천고 정식 학번은 `학년 1자리 + 반 2자리 + 번호 2자리`의 5자리 형식이다.
 * 사용자가 `학년 + 반 1자리 + 번호 2자리`의 4자리 축약형을 입력하면 반 앞에 0을 넣는다.
 */
export function canonicalStudentId(value: string) {
  const studentId = String(value ?? '').trim()
  if (/^[1-3]\d{3}$/.test(studentId)) return `${studentId[0]}0${studentId.slice(1)}`
  return studentId
}

export function studentIdsMatch(studentId: string, query: string) {
  return canonicalStudentId(studentId) === canonicalStudentId(query)
}
