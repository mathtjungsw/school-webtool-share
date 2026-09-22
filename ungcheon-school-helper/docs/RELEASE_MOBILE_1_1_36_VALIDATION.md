# 모바일 PWA v1.1.36 출결 전체 명렬·비고 필터 검증

기준일: 2026-09-22
기준 소스: 최신 `origin/main` 기반 모바일 PWA v1.1.36 / 공유 서비스 51

## 구현 범위

- 3학년 이동수업·학급수업·교체·대강·당김수업의 실제 수강생 전체 명렬 조회
- 출결 팝업의 `전체 명렬`·`비고만` 즉시 전환과 비고 인원 표시
- 원소속 반·번호 숫자 오름차순 정렬 및 빈 비고의 `비고 없음` 표시
- `자습` 학생의 학번순 위치 유지와 연두색 장소 이동 구분
- 출결 버튼을 눌렀을 때만 해당 날짜·교시 명렬을 별도 인증 조회
- 상세 명렬을 서비스 워커·IndexedDB에 저장하지 않고 팝업 종료·로그아웃 때 메모리에서 삭제
- 서버 5분 제한 캐시와 로그인 사용자·담당 수업 재검증

## 검증 항목

- [x] 모바일 typecheck, 전체 48개 단위·통합 테스트, 프로덕션 빌드
- [x] Code.gs 구문·21개 모바일 계약·56개 Apps Script 배포 가드
- [x] 기존 Apps Script 고정 배포를 서비스 51로 갱신
- [x] 기존 모바일 PWA 공개 주소에 v1.1.36 배포
- [x] Sites 버전 18과 고정 주소, Apps Script health 서비스 51 확인
- [x] 이름 로그인·세션 만료·전체 명렬 요청과 비고 필터 동작을 단위·통합 회귀검사
- [x] 응답에 학번 원본·전체 학생시간표·원본 payload·다른 수업 자료가 없는지 합성 계약검사

공통 비밀번호 ScriptProperty와 기존 72시간 로그인 세션은 초기화하지 않으며, 새 Apps Script 배포 ID를 만들지 않는다.

## 배포 결과

- 모바일 PWA 정식 버전: 1.1.36 / Sites 버전 18
- 공개 주소: <https://ungcheon-mobile-schedule.jsw890122.chatgpt.site>
- Apps Script 고정 주소: <https://script.google.com/macros/s/AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/exec>
- 공개 health 응답: `UngcheonSchoolHub` 서비스 51
- Sites 공개 범위는 기존과 동일한 `public`으로 유지함
