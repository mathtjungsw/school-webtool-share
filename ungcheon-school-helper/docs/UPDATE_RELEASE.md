# 자동 업데이트 배포 방법

웅천고 업무도우미는 공개 GitHub 저장소의 Releases를 이용해 자동 업데이트합니다.
별도 서버 운영비 없이, 앱 소스가 `main` 브랜치에 반영되면 GitHub Actions가
새 설치본과 자동업데이트 파일을 자동으로 게시합니다.

## 자동 배포 흐름

1. `ungcheon-school-helper`의 앱 소스나 리소스를 수정합니다.
2. 수정 사항을 GitHub 저장소의 `main` 브랜치에 반영합니다.
3. GitHub Actions가 현재 최신 Release를 확인합니다.
4. 패치 버전을 자동으로 하나 올립니다. 예: `1.0.1` → `1.0.2`
5. 타입 검사와 Windows 패키징에 성공하면 다음 세 파일을 새 Release에 게시합니다.
   - `UngcheonSchoolHelper-Setup-버전.exe`
   - `UngcheonSchoolHelper-Setup-버전.exe.blockmap`
   - `latest.yml`
6. 기존 프로그램은 다음 실행 시 새 버전을 자동으로 내려받습니다.

앱 소스와 무관한 문서나 학교 공유 서버 코드만 수정한 경우에는 불필요한 앱 Release를
만들지 않습니다.

## 배포 상태 확인

- [GitHub Actions](https://github.com/mathtjungsw/school-webtool-share/actions)
- [GitHub Releases](https://github.com/mathtjungsw/school-webtool-share/releases)

Actions의 **웅천고 업무도우미 자동 업데이트 배포** 작업이 초록색으로 완료되고,
Releases에 새 버전이 나타나면 배포가 끝난 것입니다.

## 수동 재실행 또는 버전 지정

필요하면 Actions에서 **Run workflow**를 눌러 직접 실행할 수도 있습니다.

- 버전을 비워 두면 최신 버전의 패치 번호가 자동 증가합니다.
- 버전을 입력하려면 현재 최신 버전보다 높은 `숫자.숫자.숫자` 형식을 사용합니다.
- 변경 내용을 비워 두면 해당 커밋의 첫 줄이 Release 설명으로 들어갑니다.

## 교직원 PC에서의 동작

- 프로그램 시작 시 최신 Release를 자동으로 확인합니다.
- 새 버전이 있으면 백그라운드에서 다운로드합니다.
- 다운로드가 끝나면 **지금 설치**를 눌러 재시작합니다.
- 사용 매뉴얼의 **지금 업데이트 확인** 버튼으로 즉시 확인할 수도 있습니다.
- 개인 설정과 각 기능의 로컬 작업자료는 업데이트 후에도 유지됩니다.

## 주의 사항

- 자동 배포는 빌드와 타입 검사가 모두 성공할 때만 Release를 게시합니다.
- 설치본에는 GitHub 공급자 정보가 담긴 `resources/app-update.yml`이 반드시 포함되어야 합니다.
- 현재 설치 파일은 코드 서명이 없어 Windows SmartScreen 경고가 나타날 수 있습니다.
- 저장소가 공개되어 있으므로 Release 설치 파일도 인터넷에서 누구나 내려받을 수 있습니다.
