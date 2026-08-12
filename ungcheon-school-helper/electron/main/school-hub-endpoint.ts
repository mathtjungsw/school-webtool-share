export const UNGCHEON_SCHOOL_HUB_URL = 'https://script.google.com/macros/s/AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/exec'

export function resolveSchoolHubEndpoint(_value: unknown) {
  // 웅천고 전용 프로그램이므로 사용자 설정값을 사용하지 않는다.
  // 폐기된 Apps Script 배포 URL이 PC에 남아 공유 자료를 막는 일을 방지한다.
  return UNGCHEON_SCHOOL_HUB_URL
}

export function getSchoolHubEndpointCandidates(_value: unknown) {
  return [UNGCHEON_SCHOOL_HUB_URL]
}
