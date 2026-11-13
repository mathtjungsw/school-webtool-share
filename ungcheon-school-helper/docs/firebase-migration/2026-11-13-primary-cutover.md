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

## 운영 적용 (진행 중)

아직 이 문서 작성 시점에는 SHEETS가 운영 원본이다. main 반영 → 고정 배포 → service69 구조 준비/복제 → 새 코드 10분 장벽 → 저장 제한 → 22종 최신 전수 대조 → FIRESTORE 활성화 → 운영 조회와 백업 확인 순서로 이어간다.

기존 고정 URL과 PC 설치 버전1.1.40은 유지한다. 관리자 현황 화면의 Firebase 상태 표시는 소스에 준비했으며 PC 설치파일 배포는 이 작업에 포함하지 않는다.

## 소유자 실행 함수

- `prepareFirebaseCutover`: 검증된 배포 증거를 확인하고 10분 장벽 기록. 운영 쓰기는 계속 Sheets.
- `freezeFirebaseCutoverSource`: 장벽 이후 기존 writer/worker 경계를 확인하고 최종 저장 제한.
- `migrationReplicationTick`: 전환 전 마지막 복제/serving 갱신, 전환 후 변경 자료의 시트 백업.
- `verifyFirebaseCutover`: 한 번에 최대8종/40초 전수 대조, 반복 가능.
- `activateFirebasePrimary`: 완료한 최신 대조와 root 확인 후 주 저장소 전환. 중복 실행 안전.
- `runFirebaseSheetBackup`: 제한된 분량으로 시트 백업, 반복 가능.
- `beginReturnToSheets` → `completeReturnToSheets` 반복: 변경 자료 반영 및 FROZEN root의 모든 자료 대조가 완료돼야 복귀. 단순 설정만 되돌리거나 구버전 코드를 배포하지 않는다.
