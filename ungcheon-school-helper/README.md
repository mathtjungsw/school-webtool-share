# 웅천고 업무도우미

웅천고등학교 교직원을 위한 Windows 데스크톱 업무 지원 프로그램입니다.
원본 `학교업무도우미`의 MIT 라이선스 소스를 바탕으로 학교 맞춤형으로 구성했습니다.

## 첫 버전 기능

- 대시보드, NEIS 정보, 환경설정, 사용 매뉴얼
- Excel 전처리, 대학 권장과목
- 호봉획정, 방과후 점검, NEIS 인사기록 분석
- 업무경감 도우미, 교육과정편제표, 사진대장, 학적업무, 출석부
- 교내 위원회·비치 장부 현황
- PDF 텍스트 추출, 파일 파서
- 공문알리미
- 학교 공지 및 부서별 공유 링크
- GitHub Releases 자동 업데이트

## 개발

```powershell
npm install
npm run typecheck
npm run dev
npm run package
```

## 학교 공유 서비스

`server/Code.gs`를 Google Apps Script 웹 앱으로 배포한 뒤 프로그램 환경설정에
웹 앱 URL을 입력합니다. 자세한 절차는 `server/README.md`를 참고하세요.

학생·교직원 개인정보는 공유 서비스에 저장하지 않습니다.

## 업데이트 배포

앱 소스가 `main` 브랜치에 반영되면 GitHub Actions가 패치 버전을 자동으로 올리고
Windows 설치본과 자동업데이트 파일을 GitHub Releases에 게시합니다.
자세한 절차는 `docs/UPDATE_RELEASE.md`를 참고하세요.

## 라이선스 고지

원본 프로그램의 저작권 및 MIT 라이선스 고지는 `NOTICE.md`와
배포본의 `THIRD_PARTY_NOTICES.txt`에 보존합니다.
