# 운영 적용 진행 기록

사용자 승인 범위: 남은 1~5단계(운영 준비, 추적 활성화, 실제 자료 복제, PC·모바일 Firebase 경로, 대조·복구 리허설). 최종 원본 전환은 제외한다.

## 14:38 준비 상태

- 최신 main `80f12b0179e55d1b46106d3e3c7ebca18a2afc1b`와 실제 고정 배포를 다시 확인했다. 배포 @89, 운영·HEAD·health service60이며 원격 변경은 없다.
- service64 후보에 기존 22종 변경 기록·복제·관리 API와 분할 R0 초기복사를 통합했다. 업무 함수의 기계적 원본/잠금 접근자 교체 외 업무 동작은 회귀 검사로 대조했다.
- `npm run typecheck` 통과: 모바일 서버 계약 24개, 배포 가드 56개 포함. 새 분할복사 3그룹은 복사 중 저장, 미확정 저장, 중단 후 재개와 페이지 상한을 확인했다.
- 운영 편집기 전용 권한 확인·배포 증거 대조·10분 대기 후 추적 활성화·5분 복제 트리거 설치 함수를 준비했다. HTTP에서는 호출할 수 없다. 자격정보·세션·원본 전환 설정을 초기화하지 않는다.
- `npm run deploy:apps-script -- -StageOnly`는 기존 main/실배포/HEAD 검사와 업로드 확인을 모두 수행한 뒤 HEAD만 준비한다. 불변 버전 생성과 고정 배포 변경 전에 종료한다. 실제 배포는 같은 명령에서 이 옵션을 제거해서 수행한다. 가드는 변경하지 않았다.
- 명시 권한: spreadsheets, script.external_request, datastore, script.scriptapp, script.projects.readonly, script.deployments.readonly. 운영 소유자의 새 OAuth 승인이 필요하다. 마지막 두 권한은 실제 고정 배포와 HEAD 일치를 읽기 검증하기 위한 것이다.
- 합성 2,317행 성능 시험 진행 중. 초기 네 실행의 개별 구간 최대는 8,069ms였다. 각 구간 사이에 원본 잠금을 해제한다. 전체 복사 완료 및 실제 저장 경로 지연은 아직 미확인이다.

## 다음 실행 순서

1. 검증한 후보를 main에 반영하고 StageOnly로 운영 HEAD 준비.
2. 소유자가 `authorizeMigrationConnection` 추가 권한 승인. 이 함수는 연결/배포 권한과 기존 트리거 수만 읽는다.
3. 합성 성능/저장 지연 검증 및 배포 사전 검사 후 기존 고정 배포 갱신. health와 인증 거절, 기존 세션을 확인.
4. `prepareMigrationProduction` 실행, 실제 배포 증거 기록 및 10분 대기. 운영 저장은 계속 시트에 수행한다.
5. `activateMigrationProduction` → `installMigrationReplicationTrigger`, 수동 `migrationReplicationTick`으로 초기복사 진행. 실제 자료는 학교 전용 `schools/ungcheon`에 복제.
6. 조회용 데이터 구성 및 PC·모바일 공유 API 연결/쓰기 시험 구현, 동일 revision 전수 대조와 복구 리허설. 실제 주 저장소 전환은 별도 지시 전 수행하지 않는다.

롤백할 때 추적 없는 구버전으로 돌아가기 전에 `migrationInvalidateReplica_`를 호출해 해당 복제 기준을 무효화한다. 원본 시트와 기록을 삭제하지 않는다. 추적이 끊긴 기존 기준을 재사용하지 않는다.

현재 문서는 준비 기록이다. 아직 운영 추적 활성화, 실제 복사, Firebase 조회·저장 전환, 전체 1~5 완료를 의미하지 않는다.
