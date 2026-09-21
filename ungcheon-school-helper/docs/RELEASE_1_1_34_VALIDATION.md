# v1.1.34 위젯 3학년 이동수업 출결·자습 구분 검증

기준일·최종 확인일: 2026-09-21
기준 소스: 최신 `origin/main` 기반 데스크톱 v1.1.34 / 모바일 PWA v1.1.34 / 공유 서비스 49

## 구현 범위

- 위젯 오늘 시간표의 3학년 실제 수강생 출결 버튼과 읽기 전용 상세 보기
- 승인·반영 교체·대강, 당김수업, 일일 시간표 예외를 따르는 실제 교시 매핑
- 모바일·위젯에서 `자습`만 있는 비고를 실제 출결 이상과 분리한 연두색 장소 이동 표시
- 실제 출결·자습 인원 분리 집계와 5분 갱신·서버 캐시
- 반·번호·이름·비고 외 전체 학생 자료를 응답하지 않는 최소 계약

## 검증 결과

- [x] 데스크톱 전체 typecheck 및 위젯·모바일 서버 계약 회귀검사
- [x] 모바일 PWA typecheck, 전체 44개 단위·통합 테스트, 프로덕션 빌드
- [x] Apps Script 구문·55개 배포 가드 및 고정 배포 사전검사
- [x] 실제 고정 Apps Script 주소에서 서비스 버전 49 확인
- [x] 데스크톱 v1.1.34 설치파일·자동 업데이트 릴리스 배포
- [x] 기존 모바일 PWA 공개 주소에 사이트 버전 16으로 v1.1.34 배포
- [x] 응답에 전체 학생 시간표·학생 식별키·비밀번호·세션 토큰이 없는지 회귀검사

Apps Script는 기존 고정 배포를 프로젝트 버전 78로 갱신했고 ScriptProperties와 기존 로그인 세션을 초기화하지 않았다. GitHub Release에는 설치파일·blockmap·`latest.yml`을 함께 게시했다.

## 고정 주소

- Apps Script: <https://script.google.com/macros/s/AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w/exec>
- 모바일 PWA: <https://ungcheon-mobile-schedule.jsw890122.chatgpt.site>
- 데스크톱 릴리스: <https://github.com/mathtjungsw/school-webtool-share/releases/tag/ungcheon-helper-v1.1.34>
