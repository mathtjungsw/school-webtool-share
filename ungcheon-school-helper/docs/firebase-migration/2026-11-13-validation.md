# Firebase 이전 기반 구축 및 검증 기록

이 문서는 1단계 당시의 기록이다. 이후 원본 보존·실측과 변경 기록 기반 개발은 [다음 단계 기록](2026-11-13-source-backup-and-tracking.md)을 따른다.

기록일: 2026-11-13. 현재 단계는 **시험 환경 구축·복제 기반 개발 완료, 운영 변경 추적·학교 자료 복제 전**이다. 실제 운영 전환 승인을 받은 상태가 아니다.

## 확인한 운영 기준

- origin/main: `80f12b0179e55d1b46106d3e3c7ebca18a2afc1b` (작업 중 다시 조회하여 동일함 확인).
- 운영 PC: 저장소 기준 1.1.40. 고정 Apps Script 배포: 프로젝트 버전 @89 / 서비스 60.
- 읽기 전용 배포 사전검사로 최신 main, 고정 배포, 원격 HEAD를 대조했다.
- 작업 공간: `C:/Users/codex/.codex/worktrees/ungcheon-firebase-migration-20261113`.
- 브랜치: `codex/firebase-migration-20261113`. 원래 작업 폴더의 미커밋 작업을 보존했다.
- 개발 소스의 서비스 번호는 61이다. 운영 서버·PC 자동업데이트에는 아직 배포하지 않았다.

## 새 Firebase 및 연결 시험

- 프로젝트: `ungcheon-school-helper` / 표시 이름 `Ungcheon School Helper`.
- [Firebase 콘솔](https://console.firebase.google.com/project/ungcheon-school-helper/firestore/databases/-default-/data)
- 기존 운영 스크립트와 동일한 소유 계정으로 생성했다. 요금제 Spark, Firestore Standard, `(default)` DB, 서울 `asia-northeast3`.
- 생성 시 `allow read, write: if false`를 적용했다. Analytics와 Gemini 옵션은 사용하지 않았다. 결제 계정, Storage, Functions, 예약 유료 백업을 구성하지 않았다.
- [운영과 분리된 시험용 Apps Script](https://script.google.com/home/projects/16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9/edit)
- 사용자가 시험용 스크립트의 `datastore` 및 `script.external_request` 권한 승인을 완료했다. 운영 스크립트의 권한 범위는 수정하지 않았다.
- `probeFirestoreConnection`: 새 프로젝트에 합성 확인 문서 생성·재조회 성공.
- `probeFirestoreReplica`: 실제 `FirestoreRepository.gs`와 `MigrationSync.gs`를 사용하여 타입 보존 복사, 완료 페이지 재사용, 전체 대조, 삭제표식, 오래된 revision 거부, 동일 revision 재실행을 확인했다.
- 최초 복제 시험 결과: 요청 52회, 디코딩한 문서 42개, 성공 응답을 받은 쓰기 12개. 이것은 도구 내부 계수이며 청구 사용량이 아니다. 존재하지 않는 문서 조회, 콘솔 조회 등의 과금 단위와 동일하지 않다.
- 최종 크기 검사 코드를 반영한 재실행도 성공했다. 요청 39회, 디코딩한 문서 44개, 추가 쓰기 0개로 완료한 페이지와 포인터를 재사용했다.
- 실제 Firestore의 확인 문서를 인증 없이 조회하면 HTTP 403 / `PERMISSION_DENIED`가 반환되는 것도 확인했다.
- 시험 자료 위치: `migrationChecks/appsScriptOAuth`, `schools/migration-probe/...`. 실제 학교 데이터나 이름·성적·출결·비밀번호·세션은 넣지 않았다. 시험 자료는 명시적 정리 전까지 보존한다.

## 구현 범위

1. **서버 전용 REST 어댑터**: 단기 OAuth, Firestore 타입 변환, 학교 경로 제한, 조건부 원자 commit, 문서·묶음 크기 검사, 민감한 응답 본문을 제외한 오류 코드.
2. **불변 스냅샷 복제 기반**: 명시적 원본 ID, 순서, 값 해시, 삭제표식, revision을 보존한다. 페이지와 완료 기록을 함께 원자 저장하여 응답 유실 후 재실행 시 중복 쓰기를 막는다. 전수 검증 후 복제본 포인터만 갱신한다.
3. **엄격한 검증**: 문서 ID 경로, 본문 해시, 레코드 수, 순서, 완료 페이지, 실행 메타데이터를 모두 검사한다. 오래된 revision, 같은 revision의 다른 내용, 동시 포인터 변경, 손상된 manifest를 거부한다.
4. **관리자 준비 현황**: 기존 교직원 세션+관리자 비밀번호를 검사한다. 수동 조회만 제공하며 주기적 전수 조회를 추가하지 않았다. 시트 초기화·본문 읽기·Firestore 쓰기 없이 시트 존재와 사용 행 상한을 반환한다. 관리자 정보는 POST 본문으로만 전송한다.
5. **소스 조사 도구**: 현재 소스의 내부 시트 22개, API action 58개(신규 읽기 action 2개 포함), 직접 변경 함수 44개 및 호출 관계를 `source-inventory.json`에 기록했다. 인증용 속성 변경도 포함한 정적 조사이며 운영 쓰기 경로 전수 검증 완료를 뜻하지 않는다.

관리자 화면에서 미측정 대기·오류 건수는 `null`로 유지한다. 시험 도구가 만들어졌다는 사실을 실제 동기화 100%나 운영 전환 가능으로 표시하지 않는다.

## 실행한 검증

| 항목 | 결과와 범위 |
| --- | --- |
| 합성·에뮬레이터 검사 | 16개 통과. 타입·순서·삭제·역전·중복·응답 유실·동시 commit·손상·페이지 초과·권한 경계 포함 |
| 실제 Apps Script→Firestore | 별도 시험 프로젝트에서 합성 자료 연결과 복제 성공 |
| PC `npm run typecheck` | 통과. 기존 인증·명렬·모바일 계약·배포 가드 포함 |
| PC `npm run build` | 통과. 설치파일 배포는 수행하지 않음 |
| 모바일 타입 검사·테스트 | 9개 테스트 파일 / 60개 테스트 통과 |
| 배포 소스 검사 | `-ValidateOnly` 통과. 운영 고정 주소는 서비스 60 유지 |
| 관리자 화면 | 실제 React 컴포넌트를 로컬 합성 응답으로 표시. 정상 표, 오류 시 이전 표 제거, 관리자 해제 후 전체 패널 숨김 확인 |

스크린샷은 원래 프로젝트의 `outputs/firebase-migration-20261113/`에 보관한다. `migration-admin-synthetic.jpg`에 보이는 행 수는 시험값이다.

## 구현하지 않았거나 확인하지 않은 사항

- 운영 자료의 실제 건수·바이트·직접 편집 주체·외부 자동화·학교망 성능.
- 원본 비공개 백업 및 실제 학교 자료 내보내기.
- 기존 쓰기 action/보정 함수/외부 시트를 묶는 변경 의도 로그, 공통 잠금, operationId, 재시도 대기열.
- ID가 없는 시간표·업무응답·NEIS 행의 영구 ID 대응표. 이름 또는 현재 행 번호로 대체하지 않는다.
- 변경 로그를 먼저 가동한 뒤 기준 R0를 확정하는 일관된 원본 스냅샷 취득.
- 여러 리소스를 묶는 epoch/원자 전환, 같은 revision에서 참조 관계와 실제 업무 결과 비교, 역복제·복원.
- 운영 5개 업무일 사용량·지연 관찰과 실제 구버전 PC/학교망 시험.

현재 스냅샷 함수는 **초기 복사·대량 교체용 기반**이다. 매번 한 행이 바뀔 때 전체 스냅샷을 다시 만들어 운영하는 방식으로 사용하지 않는다. 개별 변경분 복제 경로가 별도로 필요하다. 한 스냅샷은 현재 10,000행 이내이며 검증은 전체 스냅샷을 메모리에서 대조한다. Apps Script 실행시간을 넘는 크기의 실제 자료는 검증 체크포인트와 분할 방식을 추가한 뒤 처리해야 한다.

따라서 MG-01~15 전체 통과, 학교 자료 완전 동기화 또는 운영 전환 완료로 판정할 수 없다. 특히 현재 API에 복제 쓰기 action이나 전환 버튼은 없다.

## 다음 구현 순서

1. 읽기 전용 현황 기능의 운영 적용 계획을 확정하고 실제 내부/외부 시트·편집 주체·자료량을 조사한다. 백업을 비공개 보관한다.
2. 기존 변경 함수의 잠금 사용을 먼저 정리한다. 공통 잠금 안에서 다시 같은 잠금을 획득하는 중첩 구조를 만들지 않는다.
3. 변경 의도→원본 변경→결과 기록→복제를 단계별로 분리하고 실패 시 불명확 작업을 재실행하지 않는 복구 절차를 구현한다. 기존 시트 쓰기 성공은 Firebase 실패로 뒤집지 않는다.
4. 변경 추적을 검증한 뒤 배포하고, 그 다음 R0 불변 스냅샷과 변경분 복제를 시작한다. 구버전 action, 자동 보정, 직접 편집 감지도 포함한다.
5. 실제 기준 revision에서 ID/값/순서/참조/삭제·업무 결과를 검증하고, 사용자에게 결과를 보고한 뒤 전환 지시를 받는다.

## 재현 명령

앱 폴더에서 `npm run check:migration`, `npm run typecheck`, `npm run build`를 실행한다.

별도 터미널에서 Java 21을 PATH에 두고 `firebase` 폴더에서 다음을 실행한다.

```text
npm exec --yes --package firebase-tools@14.25.0 -- firebase emulators:start --only firestore --project demo-ungcheon-migration
```

앱 폴더에서 `npm run check:migration:emulator`를 실행한다. 시험 transport는 `127.0.0.1:8185`와 `demo-ungcheon-migration`으로 제한된다. `.firebaserc`의 기본 프로젝트는 계속 demo로 유지한다.

`pwsh -NoProfile -File scripts/prepare-firestore-probe.ps1`는 저장된 별도 시험 프로젝트만 업데이트한다. 운영 스크립트 ID는 거부한다. 소스 준비만 수행하며 실행은 자동으로 하지 않는다.

## 근거

- [Firestore REST 인증과 IAM](https://firebase.google.com/docs/firestore/use-rest-api)
- [원자 commit API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit)
- [에뮬레이터 REST 및 실제 서비스와의 차이](https://firebase.google.com/docs/emulator-suite/connect_firestore)
- [무료 제공량과 문서·요청 제한](https://firebase.google.com/docs/firestore/quotas)

에뮬레이터 통과를 실제 IAM·인덱스·한도·학교망 검증의 대체로 취급하지 않는다.
