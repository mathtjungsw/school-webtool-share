# Firebase 주 저장소 전환 기록

## 승인과 배포 전 검증

- 사용자 지시: “오케이 그럼 파이어베이스 전환 하자. 주말이라 아무도 사용안할때 전환하는게 좋겠어”. 이전의 6단계 제외 경계는 이 지시로 해제됐다.
- 작업 시작 시 고정 운영 @94/service68, 원격 HEAD/로컬/운영 18개 모듈 일치. 실제 자료는 SHEETS, 복제/serving revision3이었다.
- service69 후보는 요청의 인증 전부터 동일한 Firebase snapshot을 사용한다. 기존 staff/mobile/executive 권한·세션 검사를 유지하고 외부 입력 시트·사례집은 기존 경로를 유지한다.
- 25개 내부 저장 동작은 공통 잠금 및 root CAS 아래에서 변경 자료·응답 영수증·revision 기록을 원자적으로 확정한다. 재시도 전 권한 확인, 다른 payload 충돌 거절, 응답 유실 시 영수증 재확인을 수행한다. 비밀번호·세션·동기화 토큰은 Firestore에 복제하지 않는다.
- 현재 root는 매 요청 확인한다. 불변 자료만 private ScriptCache에 gzip/base64 80,000자 조각으로 보존하고, 해시 재검증·누락 시 Firestore 재조회한다. 공식 [Cache 문서](https://developers.google.com/apps-script/reference/cache/cache)의 항목 제한을 반영했다. 캐시는 저장의 확정 근거가 아니다.
- 기존 5분 트리거는 전환 후 Firebase→Sheets 변경 자료 백업으로 역할을 바꾼다. 이전 Sheets→Firebase 복제 기준은 무효화한다. 자동 유료 전환·요금제/공개 규칙/권한 변경은 없다.
- 복귀는 먼저 Firebase root를 FROZEN으로 만들고, 전환 후 변경분을 시트에 기록·전수 대조한 뒤 SHEETS_RETURNED로 바꾼다. 각 자료 교체 전 사본은 불변 Firestore 자료로 보존한다. 실패 시 Firebase가 계속 조회 기준이며 부분 백업을 원본으로 승격하지 않는다. 복귀 후 재이전은 새 기준 사본을 준비해야 한다.
- 내용 대조는 셀의 타입·값·수식·행 위치·헤더를 포함한다. 내부 자연키 UUID는 시트 저널이 다시 부여할 수 있으며 업무 데이터 식별자는 보존한다. 초기 자료의 수식0 전제를 검사하고 미지원 수식은 전환을 차단한다.

## 검증 결과

- 로컬 전환 회귀9그룹: 전환 장벽, 중복/권한, 응답 유실, 캐시 변경/손상, 실제 staff 인증, 모바일 계약3, bulk 저장/복귀, 부분 백업 실패 재개, 타입 및 최종 전수 대조.
- 전체 typecheck 최초 통과. 모바일24·배포가드56 포함. 마지막 수정 후 배포 전 재실행 결과는 아래 운영 기록에 기재한다.
- 18:46:59~18:50:46 실제 별도 Apps Script/Firestore 합성 시험 통과: 22종 전수 확인, 생성/영수증 재조회, 원본 불변, 캐시 조회, 변경분 시트 백업, 삭제, 복귀 중 저장 거절, 검증 후 Sheets 복귀, 앞자리0/boolean/number/Date 보존. 운영 자료 변경 없음. 합성 장벽 시간은 시험에서만 앞당겼으며 실제 10분 대기 증거가 아니다.
- 합성 조회 함수 첫 실행1,080ms, 캐시 재사용470ms. 실사용자 네트워크·휴대폰 체감 측정은 아니다. 로그 `out/native-primary-roundtrip.txt`.
- 전환 메타데이터 인덱스 제외6개를 추가하고 readback 확인, 기존11개 유지. 본문·규칙·TTL·과금 설정 변경 없음.

## 운영 적용 이력

- service69 main `ba5ff12a`, 고정 @95/HEAD/health69 20개 모듈 일치. 배포 직후 API의 이전 @94 응답 때문에 증거 발행을 중단하고 독립 조회로 @95 일치를 확인한 뒤 `-RecordEvidenceOnly` 성공.
- 18:57:21 구조 준비69 완료, 18:58:16 PREPARING 시작. 원본은 계속 SHEETS.
- 추가 Google 문자 시험에서 `setValues`가 문자열 맨 앞 작은따옴표 하나를 제거하는 것을 발견했다. 자료 대조가 실패를 검출했으며 운영 전환/원본 교체는 수행하지 않았다.
- service70은 `=`뿐 아니라 `'`로 시작하는 문자열도 한 번 escape한다. 19:02:15 합성 Google 시험에서 작은따옴표1/2개, 수식형 문자열, 0으로 시작하는 숫자형 문자열, 날짜형 문자열, boolean형 문자열, 한글 보존 통과. `out/native-return-literals-before.txt`와 `out/native-return-literals-after.txt`.
- 서비스70 전체 typecheck exit0, 전환11그룹·모바일24·배포가드56 통과. 준비 중 코드 변경은 새 배포 증거를 확인하고 10분 장벽/검증 epoch를 갱신하도록 제한했다. DRAINING 이후 또는 주 저장소 생성 후에는 준비 증거를 바꾸지 못한다.
- service70 main `b45e67dd`, 고정 @96/HEAD/health70·20모듈 일치, 배포 증거 확인. 19:06:16 구조 준비70 완료. 일반 조회·저장은 여전히 SHEETS이며 source freeze/primary 활성화는 하지 않았다.
- service71은 저장 결과 기록도 전환 경계를 넘겨 보존한다. 최종 source 대조 후 Sheets 저널의 업무 요청 영수증을 새 epoch에 복제하고 확인한다. 주 저장소의 각 commit 영수증은 시트 백업의 private blob/index에 보존한다. 복귀 이후 같은 요청을 재시도할 때 Firestore 연결 없이 원래 응답을 돌려준다. 불확실한 과거 작업은 재실행하지 않고 확인 필요로 거절한다.
- service71 로컬 전환12그룹 및 전체 typecheck exit0. 양방향 전환 후 동일 요청 재전송, 다른 payload 거절, 잘못된 세션 거절, 복귀 후 Firestore를 강제로 사용할 수 없게 한 상태의 영수증 재조회가 통과했다.
- 19:10:23~19:13:42 실제 Google 합성 service71 왕복 시험 통과. 기존11개 검증 항목에 Sheets 저장 요청의 전환 후 재전송과 Firebase 저장 요청의 시트 복귀 후 재전송을 추가했다. 두 경우 모두 기존 응답을 반환하고 중복 저장하지 않았다. `out/native-primary-service71-roundtrip.txt`, 합성 조회1,048ms/474ms.

### 실제 전환 완료 — 2026-11-13 19:30:52 KST

- 최종 서버 main `c682e51c`, 고정 배포 **@97 / service71**. 정식 배포 명령의 20모듈 local/HEAD/live 일치·health·개인 배포 증거 기록까지 정상 완료했다. URL·비밀번호·기존 세션은 유지했다.
- 19:16:19 구조 준비71 완료. 19:17:31 PREPARING 갱신, 실제 10분 장벽 `19:27:31.038`을 지난 뒤 19:27:42 DRAINING으로 바꿨다. 최종 검증 동안 내부 자료 저장만 제한했다.
- 19:30:18 **22종 2,428행의 최신 원본/복제 전수 typed 해시 일치**, source revision6, 저장 기록 확인도6까지 완료. 기존75페이지 및 revision1~6 게시 완료.
- 19:30:52 `activateFirebasePrimary` 성공: `phase=FIRESTORE`, `activeBackend=FIRESTORE`, `writesPaused=false`, `rollbackAvailable=true`. epoch `4af1a5cc26e10764eeae6c46dea4bd116189422485f1fbc39d652df3fc622df2`, baseRevision6, primary revision0. 과거 Sheets→Firestore 복제는 무효화·정지했다. 과거 archive/serving의 SHADOW 표시는 역사적 기준이며 현재 주 저장소 상태가 아니다.
- 사용자 로그인 완료 후 같은 Chrome 모바일 세션에서 전환 전/후 조회를 확인했다. 19:31 및19:33 새로고침 성공, 오늘2수업/1일정, 시간표·주간시간표·급식·출결6명/자습6명 요약 일치. 상세 학생 명렬은 열지 않았고 인증 응답 원문·토큰은 기록하지 않았다. 휴대폰 실기기 및 PC 설치 앱의 실제 UI/사용자 저장 시험은 하지 않았다.
- 첫 모바일 조회는 UI 관측상 약30초, 반복 조회는19초 이내 완료. 엄밀한 네트워크 벤치마크는 아니며 속도 향상을 보장하지 않는다. 외부 주간계획·창체·지도·출결 입력 시트는 계속 기존 외부 시트에서 읽는다.
- 실제 운영 자료에 시험 행을 추가하지 않았다. 생성·삭제·원자적 저장·양방향 복귀·중복 요청 보존은 별도 실제 Google 합성 왕복 시험 및 회귀 검사로 검증했다. 운영 root revision0은 전환 후 업무 저장이 아직 없음을 뜻한다.
- 19:34:28 시트 백업 **22종 COMPLETE**, 19:35:03 소유자 최종 조회 `revision=0`, `verifiedRevision=0`, `pendingCount=0`, `writesPaused=false`, `rollbackAvailable=true`. 백업 확인 시각 `2026-11-13T10:34:27.971Z`. 기존5분 트리거1개를 재사용하며 새 중복 트리거는 만들지 않았다. 초회 전수 확인 후 변경된 자료만 처리한다.
- 실제 시간 기반 `migrationReplicationTick` 19:32:50 시작/19:33:36 완료. Cloud 로그에서 `phase=FIRESTORE_TO_SHEETS`, 5단계 실행/19종까지 확인을 관찰했다. 수동 검증과 같은 잠금을 사용해 진행했고 마지막 수동 호출에서22종을 완료했다. 실행 목록의 해당 모바일 `doPost`는19:31:18 시작31.456초,19:32:50 시작17.64초로 완료됐다. 이 수치는 서버 실행 시간이며 네트워크 전체 지연과 다르다.

### 모바일 시간표 상태 표시 수정

- 전환 전19:19부터 `일일 시간표 예외`만 확인 시각이 없는 ‘확인 필요’로 표시됐다. 모바일 `MOBILE_RESOURCE_KEYS`에 `overrides`가 빠져 서버의 출처 상태를 정규화 과정에서 버리는 문제다. 실제 일정 자료와 서버 이전 검증 결과는 별개다.
- 로컬 `src/api.ts`에 overrides 상태·건수·캐시 병합을 추가했다. 모바일 typecheck와 API8개 시험 통과. 정상 빈 자료는 이전 예외로 되살리지 않고, 조회 실패 때만 이전 자료/정상 확인 시각을 보존한다.
- 초기 배포 시도는 Sites의 `project_not_found(404)`로 막혔다. 연결 복구 후 기존 Sites의 최신 소스를 열어 수정 두 파일만 반영했다. 타입 검사·테스트61개·운영 빌드 통과. 기존 사이트 버전21 배포 성공, Sites 소스 `e07d86b764f8e1425fa3fa2b32c19386104f1c64`.
- 19:49 같은 주소의 Chrome 기존 로그인에서 새 자료를 받아 시간표 ‘정상 조회’와 일일 시간표 예외 ‘등록 자료 없음 / 정상 확인’을 확인했다. 화면 증거는 `outputs/firebase-migration-20261113/mobile-override-status-fixed.jpg`에 남겼다.

기존 고정 URL과 PC 설치 버전1.1.40은 유지한다. 관리자 현황 화면의 Firebase 상태 표시는 소스에 준비했으며 PC 설치파일 배포는 이 작업에 포함하지 않는다.

## 소유자 실행 함수

- `prepareFirebaseCutover`: 검증된 배포 증거를 확인하고 10분 장벽 기록. 운영 쓰기는 계속 Sheets.
- `freezeFirebaseCutoverSource`: 장벽 이후 기존 writer/worker 경계를 확인하고 최종 저장 제한.
- `migrationReplicationTick`: 전환 전 마지막 복제/serving 갱신, 전환 후 변경 자료의 시트 백업.
- `verifyFirebaseCutover`: 한 번에 최대8종/40초 전수 대조, 반복 가능.
- `activateFirebasePrimary`: 완료한 최신 대조와 root 확인 후 주 저장소 전환. 중복 실행 안전.
- `runFirebaseSheetBackup`: 제한된 분량으로 시트 백업, 반복 가능.
- `beginReturnToSheets` → `completeReturnToSheets` 반복: 변경 자료 반영 및 FROZEN root의 모든 자료 대조가 완료돼야 복귀. 단순 설정만 되돌리거나 구버전 코드를 배포하지 않는다.
