# 학교용 웹툴 만들고 공유하기

빌드 도구 없이 GitHub Pages에서 실행되는 단일 HTML 프론트엔드와 Google Sheets + Apps Script 서버입니다.

## 파일

- `index.html`: GitHub Pages에 올릴 단일 웹페이지
- `Code.gs`: Google Apps Script 편집기에 붙여넣을 서버 코드

## Google Sheets 구조

`Code.gs`의 `setupSheets()` 또는 첫 API 요청이 아래 시트와 헤더를 자동 생성합니다.

### items

| 컬럼 | 내용 |
|---|---|
| id | UUID |
| type | `webtool` 또는 `idea` |
| title | 웹툴 이름 또는 아이디어 제목 |
| url | 웹툴 링크. 아이디어는 빈 값 |
| description | 설명 |
| author | 제작자 또는 제안자 |
| neededFeatures | 아이디어에 필요한 기능 |
| tags | 쉼표로 구분한 태그 |
| createdAt | ISO 8601 등록 시각 |
| hidden | `TRUE`이면 일반 목록에서 숨김 |

### comments

| 컬럼 | 내용 |
|---|---|
| id | UUID |
| itemId | 댓글이 속한 items의 id |
| author | 댓글 작성자 |
| content | 댓글 내용 |
| createdAt | ISO 8601 등록 시각 |
| hidden | `TRUE`이면 일반 목록에서 숨김 |

시트 이름과 헤더 순서를 바꾸지 않는 것을 권장합니다.

## Apps Script 배포

1. 새 Google 스프레드시트를 만들고 **확장 프로그램 → Apps Script**를 엽니다.
2. 기본 코드를 지우고 `Code.gs` 전체를 붙여넣어 저장합니다.
3. `SERVER_CONFIG.ADMIN_PASSWORD`를 원하는 비밀번호로 바꿉니다.
4. 편집기에서 `setupSheets` 함수를 한 번 실행하고 권한을 승인합니다. 이 단계는 선택 사항이며 첫 요청 때도 시트가 자동 생성됩니다.
5. **배포 → 새 배포 → 유형 선택: 웹 앱**을 선택합니다.
6. **다음 사용자로 실행: 나**, **액세스 권한: 모든 사용자**로 설정하고 배포합니다.
7. 발급된 `/exec` URL을 복사합니다. 코드 수정 후에는 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 합니다.

`text/plain` POST를 사용해 불필요한 CORS 사전 요청을 줄였습니다. Apps Script 웹앱은 요청을 Google의 응답 URL로 리디렉션하므로 프론트엔드에서도 `redirect: "follow"`를 사용합니다. 조직 계정 정책에서 “모든 사용자” 배포가 막혀 있다면 Google Workspace 관리자 설정이 필요할 수 있습니다.

## 프론트엔드 설정과 GitHub Pages

`index.html` 상단 스크립트의 설정을 수정합니다.

```js
const CONFIG = Object.freeze({
  WEB_APP_URL: "https://script.google.com/macros/s/배포_ID/exec",
  ADMIN_PASSWORD: "서버와-같은-비밀번호",
  REQUEST_TIMEOUT_MS: 15000
});
```

`WEB_APP_URL`을 비워 두면 샘플 카드가 나타나는 데모 모드로 동작합니다. 데모에서 등록한 카드와 댓글은 새로고침하면 초기화됩니다.

GitHub 저장소 설정의 **Settings → Pages**에서 배포할 브랜치와 폴더를 선택합니다. 이 프로젝트처럼 하위 폴더에 둔 경우 다음 중 하나를 사용할 수 있습니다.

- 저장소 루트 전체를 Pages로 배포하고 `/webtool-share/` 주소로 접속
- `webtool-share/index.html`을 저장소 루트 또는 `docs/`로 옮긴 뒤 해당 위치를 Pages 소스로 지정

## API 형식

조회:

```text
GET {WEB_APP_URL}?action=list
```

응답:

```json
{
  "ok": true,
  "items": [],
  "comments": []
}
```

등록 요청은 모두 `POST`, `Content-Type: text/plain;charset=utf-8`이며 본문은 JSON입니다.

```json
{
  "action": "createItem",
  "item": {
    "type": "webtool",
    "title": "도구 이름",
    "url": "https://example.com",
    "description": "설명",
    "author": "제작자",
    "neededFeatures": "",
    "tags": ["수학", "게임"]
  }
}
```

```json
{
  "action": "createComment",
  "comment": {
    "itemId": "카드 UUID",
    "author": "작성자",
    "content": "댓글 내용"
  }
}
```

```json
{
  "action": "hideItem",
  "id": "카드 UUID",
  "adminPassword": "관리자 비밀번호"
}
```

댓글 숨김은 `action`을 `hideComment`로 바꾸고 댓글 UUID를 보냅니다.

> 이 관리자 기능은 학교 내부의 가벼운 운영을 위한 방식입니다. 비밀번호가 HTML에 포함되므로 강한 보안이 필요한 공개 서비스에는 인증 시스템을 별도로 붙여야 합니다.
