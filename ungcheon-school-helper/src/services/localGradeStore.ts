function access(action: string, key: string, value?: string) {
  const result = window.preview.gradeVault(action, key, value)
  if (!result.ok) throw new Error('성적 작업을 열거나 저장할 수 없습니다. PC의 로그인과 보안 저장소를 확인하세요.')
  return result.value
}
export const localGradeStore = {
  getItem(key: string) {
    const saved = access('get', key)
    const old = localStorage.getItem(key)
    if (old === null) return saved
    if (saved !== null && saved !== old) throw Error('이전 저장본과 암호화 저장본이 다릅니다. 두 자료를 보존했습니다.')
    if (saved === null) access('set', key, old)
    if (saved === old || saved === null && access('get', key) === old) localStorage.removeItem(key)
    return saved ?? old
  },
  setItem(key: string, value: string) { access('set', key, value) },
  removeItem(key: string) { access('remove', key); localStorage.removeItem(key) },
}
