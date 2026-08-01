# Google Apps Script 공유 서비스 재배포

웅천고 업무도우미의 공유 서비스는 Google 공식 CLI인 `clasp`로 재배포한다.
기존 배포 ID를 갱신하므로 사용자에게 이미 배포된 `/exec` 주소는 바뀌지 않는다.

## 최초 한 번만 필요한 설정

1. Node.js 20 이상을 설치한다.
2. `npm.cmd install --global @google/clasp`를 실행한다.
3. Google Apps Script 사용자 설정에서 Apps Script API를 활성화한다.
4. `clasp login`을 실행하고 공유 서비스 소유 계정으로 권한을 승인한다.

Google 로그인 토큰은 사용자 프로필의 `.clasprc.json`에 저장된다. 이 파일은
저장소에 커밋하거나 다른 사람에게 전달하지 않는다.

## 재배포

`ungcheon-school-helper` 폴더에서 다음 명령을 실행한다.

```powershell
npm.cmd run deploy:apps-script -- "v1.0.28 변경 내용"
```

배포 명령은 다음 작업을 순서대로 수행한다.

1. 로그인 상태 확인
2. `server/Code.gs`와 `server/appsscript.json` 업로드
3. 새 Apps Script 버전 생성 및 기존 배포 ID 갱신
4. 배포 목록 확인
5. 기존 웹앱 URL의 HTTP 응답과 서비스 식별자 확인

로그인이 만료된 경우 `clasp login`을 다시 실행한 뒤 재배포한다.
