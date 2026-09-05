# 모바일 일정 PWA 공유 데이터 계약

기준일·최종 확인일: 2026-08-30. 출처: 최신 `origin/main`의 웅천고 업무도우미, 기존 고정 Apps Script 소스, 모바일 일정 PWA 구현·회귀검사. 이 문서는 데스크톱과 모바일을 하나의 배포 계약으로 유지하기 위한 개발 지침이다.

## 유지할 공개 주소와 기반

- 데스크톱 통합은 최신 `origin/main` 기준으로 작업한다. v1.1.13 기반 과거 detached 작업트리를 그대로 배포하지 않는다.
- Apps Script project: `1rLmGrYBAeMUHxGr9CSeT1DUtTUoDbmNpydp1rGe5DL-RzDlyoZCleLnb`.
- 고정 deployment: `AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w`.
- Apps Script URL: <https://script.google.com/macros/s/AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/exec>.
- 모바일 PWA 공개 URL: <https://ungcheon-mobile-schedule.jsw890122.chatgpt.site>. PWA 배포 설정과 데스크톱 환경설정도 이 주소를 그대로 사용한다. 새 사이트/호스트/주소로 바꾸지 않는다.
- 현재 통합 릴리스는 데스크톱 v1.1.30, 모바일 PWA v1.1.27, Apps Script `MOBILE_SERVICE_VERSION = 43`을 기준으로 한다. 이후 변경 시 버전을 올리며, 현재 실제 원격 버전보다 내려가지 않는다.

## 로그인과 응답

- `verifyMobileViewer`: 교직원 명렬의 이름과 기존 공통 비밀번호를 확인한다.
- 세션은 72시간이다. `UNG_MOBILE_SHARED_PASSWORD_HASH`, `UNG_MOBILE_SESSION_` 접두사 및 현재 유효한 세션을 보존한다. 코드 배포에 비밀번호 변경/속성 초기화 작업을 섞지 않는다.
- `getMobileScheduleBundle`: 로그인한 교사의 읽기 전용 자료를 제공한다. `contractVersion: 3`과 `sourceStatus`를 유지한다.
- 출처는 주간계획, 창체, 창체 학사일정, 등교지도, 급식지도, 교사 시간표, 내 위원회, 승인·반영된 수업 변경, 급식이다.
- 각 출처는 독립 오류 경계로 읽는다. `fresh`는 자료가 있는 정상 응답, `empty`는 정상 0건, `unavailable`은 해당 출처 읽기 실패다. 한 출처 실패가 전체 조회 실패가 되어서는 안 된다.
- 학생 명렬·학생 시간표·NEIS 학사일정·NEIS 학급시간표 및 기타 학생 개인정보는 모바일 응답에 포함하지 않는다. 데스크톱 전용 기능은 기존대로 유지한다.
- 개인 일정·개인 업무는 PC에서만 확인 가능하다고 모바일에 안내한다.

## 급식

- 관리자 PC가 학교 공유 스프레드시트의 `NEIS급식` 시트에 이미 동기화한 자료만 읽는다.
- `mobileSharedMealsInRange_(fromDate, toDate)`가 요청 기간 급식을 조회하여 `meals`로 반환한다.
- 급식 필드는 `date`, `mealType`, `dishNames`, `calories`로 제한한다.
- 한국 시간 기준 오늘의 급식을 담는 기존 `todayMeals`도 유지한다. 조회 기간에 오늘이 포함되지 않았더라도 기존 오늘 급식 계약이 깨지지 않는지 확인한다.
- 모바일에서는 NEIS API를 직접 호출하지 않는다. 모바일 응답 캐시 키에는 요청 기간과 한국 시간 기준 오늘 날짜를 함께 넣는다.

## PWA 연결 안정성

- 자료 조회 제한은 35초로 한다. 실제 고정 주소의 첫 조회 소요 시간을 측정한다.
- 로그인 만료는 네트워크 실패와 구분한다. “로그인이 만료되었습니다. 다시 로그인해 주세요.”를 표시하고 로그인 화면으로 전환한다.
- IndexedDB 저장 실패는 API 연결 실패로 바꾸지 않는다. 받은 자료는 화면에 반영하고 캐시 저장 문제만 별도로 처리한다.
- `pageshow`와 `visibilitychange`가 연달아 발생해도 동일 조회가 중복 실행되지 않게 한다. 진행 중 요청과 갱신 시점을 함께 관리한다.
- 서비스 워커는 Apps Script POST를 캐시·가로채기·차단하지 않는다. 인증된 서버 응답을 서비스 워커 캐시에 저장하지 않는다.

## 배포 전 필수 검사

1. 최신 main을 가져오고 현재 HEAD가 그 커밋을 포함하는지 확인한다.
2. 실제 고정 배포 버전과 원격 HEAD를 읽고, 최신 main과 함께 **코드 diff를 검토**한다. 기존 함수·액션·릴리스 본문 문장이 빠지면 중단한다. 같은 릴리스에 데스크톱/모바일 안내가 있으면 합쳐 보존한다. 함수 이름의 존재만으로 보존을 판단하지 않는다.
3. 데스크톱 `npm run typecheck`, 관련 회귀검사, 모바일 typecheck·전체 단위/통합 테스트·빌드를 통과시킨다.
4. `node scripts/check-apps-script-deploy-guard.cjs`로 배포 가드를 검사한다.
5. `npm run deploy:apps-script -- -ValidateOnly`로 Code.gs 구문·계약을 검사한다. 원격에 접근하지 않는다.
6. `npm run deploy:apps-script -- -PreflightOnly`로 고정 배포·원격 HEAD를 읽기 비교한다. 업로드/배포하지 않는다.
7. 검증한 main을 커밋·푸시한 뒤 정식 스크립트로 기존 fixed deployment만 갱신한다. 업로드 직전 main과 실제 원격 snapshot을 재검사하며, 업로드 후 정확히 같은 코드인지 확인한 불변 프로젝트 버전만 배포한다.
8. 고정 URL health의 서비스 버전, 실제 이름 로그인, 요청 기간 일정·교사 시간표·급식을 확인한다. 35초 안에 첫 조회 완료, 출처별 상태 및 금지 필드 부재도 확인한다.
9. PWA를 기존 공개 사이트로 배포하고 고정 주소와 기존 세션이 유지되는지 확인한다.

## 배포 가드의 범위와 비밀 보호

모바일 통합에서 변경을 허용하는 범위는 `doGet`·`doPost`, `mobile*`, `getMobileScheduleBundle_`, `MOBILE_*` 상수, `RELEASE_NOTES`다. 이 외의 데스크톱 함수는 본문 전체, 상수는 값·초깃값 표현식·선언 형태를 최신 `origin/main`과 비교한다. `listStaffChecklists_` 이름만 유지하고 `return []`로 바꾸거나 `STAFF_CHECKLISTS_SHEET`를 다른 시트명으로 바꾸는 변경도 차단한다. 줄바꿈 형식과 주석을 제외한 코드 정의를 기준으로 비교하며, 새 로컬 데스크톱 함수/상수가 main이나 실제 원격 어느 쪽에도 없으면 검토되지 않은 변경으로 차단한다.

3-way 비교에서는 최신 main에 이미 정의된 데스크톱 함수/상수를 권위 기준으로 삼는다. 실제 원격이 과거 버전이어도 로컬 정의가 최신 main과 같으면 main에서 정식 검토·반영한 개선을 허용한다. 반대로 main에 없고 원격에만 있는 데스크톱 정의는 원격 그대로 보존해야 한다. 이 정책은 원격과 main의 의미상 차이를 자동으로 판단한다는 뜻이 아니므로, 배포자는 사전 코드 diff에서 차이의 근거를 확인해야 한다. 의도적인 별도 데스크톱 수정은 테스트와 main 반영 후 다시 사전 검사를 수행하며 이 가드의 예외 목록을 임의로 넓혀 우회하지 않는다.

`scripts/deploy-apps-script.ps1`은 기존 clasp OAuth를 메모리에서만 재사용하여 Apps Script API를 호출한다. 프로젝트 파일 업로드·불변 버전 생성·기존 배포 갱신만 수행하고 ScriptProperties API나 서버 초기화 함수를 호출하지 않는다. OAuth·공통 비밀번호·사용자 세션 값은 출력하지 않는다. 원격 소스도 로그/임시 파일에 저장하지 않고 메모리에서 비교한다.

Apps Script 배포 API에는 원자적인 비교-교환 잠금이 없으므로 같은 프로젝트에 동시 수동 배포하지 않는다. 스크립트는 여러 단계에서 원격 버전과 코드 해시를 재확인하고 변경이 감지되면 중단하지만, 감지 직후의 극히 짧은 동시 갱신 구간까지 서버 잠금으로 보장하지는 않는다. 중단 후에는 자동 덮어쓰기나 임의 롤백 대신 원격 변경을 다시 검토한다.
