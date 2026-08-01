# 웅천고 업무도우미 작업 규칙

- 기능, 메뉴 이름, 이용 순서가 바뀔 때마다 `src/services/workAssistantSearch.ts`의 제목·설명·단계·검색어도 함께 검토하고 갱신한다.
- 새 사이드바 메뉴에는 해당 `page`를 가리키는 검색 도우미 항목을 최소 하나 추가한다.
- 배포 전 `npm run typecheck`를 실행한다. 이 명령에는 사이드바와 검색 도우미의 메뉴 누락 검사가 포함된다.
- 배포할 때 `server/Code.gs`의 `RELEASE_NOTES` 맨 위에 새 버전의 기능 개선 내용을 추가한다.
