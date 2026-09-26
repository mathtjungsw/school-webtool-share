# PC v1.1.36 · PWA v1.1.37 통합 배포 검증

기준일: 2026-09-26. 기반: origin/main 5e6a787fde997790161e06bf802ab60e5049cf06.
사용자 요청: PC 설치파일 제작·자동 업데이트 게시 및 기존 주소의 모바일 PWA 배포.

## 범위와 보존

- 구현·화면 검증 상세: `REVIEW_USABILITY_2026_09_25.md`.
- 2번 출결 팝업 갱신 방식 및 로그인·보안 변경 제외.
- Code.gs는 `MOBILE_SERVICE_VERSION` 51→52 및 통합 릴리스 안내 추가만 변경. 이전 릴리스·함수·설정·세션 유지.
- 모바일은 APK가 아닌 홈 화면 설치형 PWA이며 기존 공개 주소를 유지.
- PC v1.1.36·모바일 v1.1.37, 정적 서비스워커 캐시 v12. Apps Script POST 미개입 원칙 유지.

## 배포 전 검증

- 최신 origin/main 및 기존 고정 Apps Script 배포 @80·원격 HEAD 비교 통과.
- PC typecheck, 공용 서버 계약 21개, 배포 가드 56개, 사용성 회귀 6그룹 통과.
- 모바일 typecheck·9개 파일 53개 단위/통합 테스트 통과.
- 실제 iPhone·프린터 및 운영 시트 쓰기는 수행하지 않음.

## 배포 결과

- main 소스 커밋: `24f90ca928d691df50a36c97cdb3b007e580a232`.
- GitHub Actions `36234465809`: 모바일 검사·53개 테스트·빌드 및 Windows 검사·설치파일 제작·Release 게시 모두 성공.
- PC 릴리스: <https://github.com/mathtjungsw/school-webtool-share/releases/tag/ungcheon-helper-v1.1.36>.
- 설치파일 `UngcheonSchoolHelper-Setup-1.1.36.exe`: 174,279,018바이트, 파일 버전 1.1.36.
- 내려받은 설치파일 SHA-256: `cf7d6587b6bed63dc0a8d070294b3e9f6259af7db3ec8aaa7ccf58fcc0ca890f`. GitHub 자산 digest 및 latest.yml SHA-512·크기 일치 확인.
- blockmap 181,769바이트, latest.yml 372바이트. 공개 `/releases/latest/download/latest.yml`도 v1.1.36 자산과 일치.
- 내려받은 파일은 `release/published-1.1.36/`에 보관. 이 PC에서 설치파일 실행·앱 재시작은 하지 않음.
- Apps Script는 기존 fixed deployment의 불변 프로젝트 버전 @81로 갱신. 공개 health `UngcheonSchoolHub`, 서비스 52 및 미인증 모바일 요청의 정상 거부 확인. ScriptProperties·기존 세션 초기화 없음.
- PWA 소스 커밋: `a6823a2d73610aeeb129cf3d98bbe27fc0e32526`. 기존 Sites main의 자손이며 통합 main의 모바일 폴더와 tree가 정확히 일치.
- PWA v1.1.37: Sites 저장 버전 19, 공개 배포 성공. 기존 공개 범위 public 유지.
- 배포 ID: `appgdep_6ab798a0890c819194277fcb9f189b56`.
- 공개 주소: <https://ungcheon-mobile-schedule.jsw890122.chatgpt.site> 유지. HTTP 200, 서비스워커 정적 캐시 v12와 외부 POST 미개입 확인. Chrome 로그인 화면 정상 표시.

## 남은 실제 사용자 확인

- 이름·공통 비밀번호를 통한 실제 일정·시간표·급식 첫 조회 시간은 이 배포 회차에서 아직 측정하지 못함. 로그인 화면을 사용자에게 인계했으며 비밀번호·세션·원본 응답을 읽거나 기록하지 않음.
- 실제 iPhone·운영 시트 쓰기·프린터 출력·설치본 창 간 이동은 합성/로컬 테스트와 구분하며 이번 공개 배포 결과로 검증됐다고 간주하지 않음.
