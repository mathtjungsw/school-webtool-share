/**
 * 웅천고 업무도우미 학교 공유 서비스
 *
 * Google 스프레드시트에 바인딩된 Apps Script로 사용합니다.
 * 교사·학생 시간표는 학교 내부 공유용입니다.
 * 학생 시간표는 관리자 업로드 시 Excel 원본이 아닌 조회용 가공 결과만 저장합니다.
 */

const LINKS_SHEET = '공유링크';
const NOTICES_SHEET = '공지';
const FEATURE_REQUESTS_SHEET = '기능개선요청';
const TIMETABLE_META_SHEET = '시간표정보';
const TIMETABLE_SHEET = '시간표';
const STUDENT_TIMETABLE_META_SHEET = '학생시간표정보';
const STUDENT_TIMETABLE_SHEET = '학생시간표';
const STAFF_ROSTER_META_SHEET = '교원명렬정보';
const STAFF_ROSTER_SHEET = '교원명렬';
const STUDENT_ROSTER_META_SHEET = '학생명렬정보';
const STUDENT_ROSTER_SHEET = '학생명렬';
const STAFF_CHECKLISTS_SHEET = '업무체크리스트';
const STAFF_CHECKLIST_RESPONSES_SHEET = '업무체크응답';
const COMMITTEE_MEMBERS_SHEET = '위원회명단';
const COMMITTEE_EVENTS_SHEET = '위원회일정';
const TIMETABLE_CHANGES_SHEET = '교환대강반영';
const NEIS_SYNC_META_SHEET = 'NEIS동기화정보';
const NEIS_MEALS_SHEET = 'NEIS급식';
const NEIS_SCHEDULE_SHEET = 'NEIS학사일정';
const NEIS_CLASS_TIMETABLE_SHEET = 'NEIS학급시간표';
const ADMIN_HASH_KEY = 'UNG_ADMIN_PASSWORD_SHA256';
const STAFF_ASSIGNMENTS_2026_APPLIED_KEY = 'UNG_STAFF_ASSIGNMENTS_2026_APPLIED';
const OFFICIAL_RELEASE_NOTICE_RESET_KEY = 'UNG_OFFICIAL_RELEASE_NOTICE_RESET_1_1_2';
const NEIS_API_KEY_PROPERTY = 'UNG_NEIS_API_KEY';
const NEIS_SYNC_DEVICE_ID_PROPERTY = 'UNG_NEIS_SYNC_DEVICE_ID';
const NEIS_SYNC_TOKEN_HASH_PROPERTY = 'UNG_NEIS_SYNC_TOKEN_SHA256';
const NEIS_SYNC_REGISTERED_AT_PROPERTY = 'UNG_NEIS_SYNC_REGISTERED_AT';
const NEIS_SYNC_REGISTERED_BY_PROPERTY = 'UNG_NEIS_SYNC_REGISTERED_BY';
const TIMETABLE_SLOT_COUNT = 35;
// 2026학년도 업무분장 원문에서 담임·교과·부서만 선별한 자료입니다.
// 업무, 세부업무, 부담임 등 나머지 원문 정보는 저장하지 않습니다.
const STAFF_ASSIGNMENTS_2026 = [
  ['강수경', '교무기획부', '영어', ''], ['공혜진', '교무기획부', '역사', ''],
  ['배병희', '교무기획부', '국어', ''], ['이혜원', '교무기획부', '영어', '1-6'],
  ['김윤미', '교무기획부', '일본어', '3-7'],
  ['김혜경', '인성안전부', '생명과학', ''], ['박은실', '인성안전부', '수학', ''],
  ['최대식', '인성안전부', '물리', ''], ['김성혜', '인성안전부', '윤리', '3-4'],
  ['박선욱', '인성안전부', '음악', '1-4'], ['이찬희', '인성안전부', '', ''],
  ['정승원', '교육과정부', '수학', ''], ['이송은', '교육과정부', '일반사회', ''],
  ['김소영', '교육과정부', '수학', ''], ['김해주', '교육과정부', '수학', '2-6'],
  ['이정용', '교육연구부', '지구과학', ''], ['황수란', '교육연구부', '국어', ''],
  ['안소정', '교육연구부', '체육', ''],
  ['이환필', '진로교육부', '진로', ''], ['최희경', '진로교육부', '역사', ''],
  ['김진영', '진로교육부', '특수', '특수 담임'],
  ['김민우', '미래정보부', '영어', ''], ['전영희', '미래정보부', '국어', ''],
  ['이승현', '미래정보부', '정보', '2-2'],
  ['최경희', '평가혁신부', '지리', ''], ['이미경', '평가혁신부', '수학', ''],
  ['황혜진', '평가혁신부', '화학', ''],
  ['박민자', '문화건강부', '국어', ''], ['안효정', '문화건강부', '미술', ''],
  ['김미주', '문화건강부', '보건', ''],
  ['이원철', '1학년부', '생명과학', '1-1'], ['조승현', '1학년부', '국어', '1-2'],
  ['민진호', '1학년부', '미술', '1-7'], ['변수옥', '1학년부', '일반사회', '1-3'],
  ['표명준', '1학년부', '수학', '1-5'],
  ['김중오', '2학년부', '윤리', '2-7'], ['박진우', '2학년부', '영어', '2-5'],
  ['이기성', '2학년부', '체육', '2-3'], ['장규빈', '2학년부', '영어', '2-4'],
  ['이승언', '2학년부', '지리', '2-1'],
  ['이영재', '3학년부', '체육', '3-3'], ['전우석', '3학년부', '지구과학', '3-5'],
  ['이경민', '3학년부', '영어', '3-1'], ['신숙자', '3학년부', '수학', '3-2'],
  ['정유현', '3학년부', '국어', '3-6']
];
// 시험 운영 중의 변경 기록은 소스 이력으로만 보관하고 공지에는 다시 게시하지 않습니다.
const LEGACY_RELEASE_NOTES = [
  {
    key: 'v1.0.43',
    title: '[업데이트] 웅천고 업무도우미 v1.0.43',
    body: [
      '· 교직원 명렬의 “교원 추가” 버튼을 “교직원 명렬 추가”로 변경',
      '· 새 교직원 행을 편집 중에는 목록 맨 아래에 생성하고 이름 칸으로 바로 이동',
      '· 공유 명렬 저장 후 교장·교감 우선, 나머지는 가나다순으로 자동 재배치',
      '· 검색도우미와 사용 매뉴얼에 교직원 추가·저장 순서 안내 반영'
    ].join('\n'),
    date: '2026-08-09'
  },
  {
    key: 'v1.0.42',
    title: '[긴급 수정] 웅천고 업무도우미 v1.0.42',
    body: [
      '· 1.0.41 업데이트 후 “시작 준비 중...” 화면에서 진행되지 않던 오류 수정',
      '· NEIS 학사일정 기본값 이전 기록을 앱에서 허용된 설정 영역에 저장하도록 교정',
      '· 초기 설정 저장에 문제가 생겨도 로그인과 대시보드 시작은 계속되도록 안전장치 추가'
    ].join('\n'),
    date: '2026-08-09'
  },
  {
    key: 'v1.0.41',
    title: '[업데이트] 웅천고 업무도우미 v1.0.41',
    body: [
      '· 대시보드 2주 일정과 통합 캘린더의 일정명·출처·범례를 항상 진한 글씨로 표시',
      '· 초기 메뉴를 사용 매뉴얼·업무알리미·대시보드·캘린더·환경설정·업무센터 순서로 재정리',
      '· 기존에 메뉴를 직접 재배치한 사용자의 개인 순서는 유지하고 기본 순서만 갱신',
      '· 앱 실행과 로그인 후 항상 대시보드 화면에서 시작하도록 시작 화면 고정',
      '· NEIS 학사일정 표시를 기본 꺼짐으로 변경하고 이후 사용자의 켜기·끄기 선택은 저장',
      '· 검색도우미와 사용 매뉴얼에 변경된 기본 설정 안내 반영'
    ].join('\n'),
    date: '2026-08-09'
  },
  {
    key: 'v1.0.40',
    title: '[업데이트] 웅천고 업무도우미 v1.0.40',
    body: [
      '· 교환·대강 승인 요청의 거절을 보류로 변경하고, 보류 후 나중에 다시 승인할 수 있도록 개선',
      '· Excel·한글·PDF 파일에서 잘못 연결된 학생 학번과 이름을 찾는 교정기 추가',
      '· 학번과 이름이 한 셀에 함께 있거나 옆 칸에 나뉜 표를 모두 인식',
      '· 원본 프로그램에서 복사한 표와 문장을 직접 붙여넣어 검사하는 기능 추가',
      '· 이름 불일치·학번 불일치·동명이인·학생 명렬에 없는 값을 원본 위치와 함께 표시',
      '· 검색도우미와 사용 매뉴얼에 학생 학번·이름 교정기 안내 추가'
    ].join('\n'),
    date: '2026-08-09'
  },
  {
    key: 'v1.0.39',
    title: '[업데이트] 웅천고 업무도우미 v1.0.39',
    body: [
      '· 교직원 명렬의 이름을 직접 입력하는 시범 로그인과 10시간 로그인 유지 기능 추가',
      '· 창의적체험활동 및 2학기 학사일정을 대시보드 2주 달력과 통합 캘린더에 자동 반영',
      '· 대시보드와 통합 캘린더에 NEIS 학사일정 표시 켜기·끄기 기능 추가',
      '· 교원 명렬 메뉴를 교직원 명렬로 변경하고 연수등록부의 교원·교직원 선택 및 출력용 명단 편집 지원',
      '· 학번 4·5자리 또는 이름으로 현재 수업·교실·담당 교사를 확인하는 학생 위치 찾기 추가',
      '· 교환·대강 반영 요청, 대상 교사 승인·보류 알림, 승인 일정의 달력·시간표 반영 기능 추가',
      '· 검색도우미와 사용 매뉴얼에 새 기능 안내 추가'
    ].join('\n'),
    date: '2026-08-09'
  },
  {
    key: 'v1.0.38',
    title: '[업데이트] 웅천고 업무도우미 v1.0.38',
    body: [
      '· 대시보드와 통합 캘린더의 등교지도·급식지도 글씨를 검정에 가까운 진한 색으로 변경',
      '· 지도 일정의 시간·제목·장소 글씨 굵기와 배경 대비를 높여 가독성 개선',
      '· 어두운 테마에서는 자동으로 밝은 글씨를 적용하도록 대비 최적화',
      '· 검색도우미에 지도 일정 글씨 관련 검색어 추가'
    ].join('\n'),
    date: '2026-08-05'
  },
  {
    key: 'v1.0.37',
    title: '[업데이트] 웅천고 업무도우미 v1.0.37',
    body: [
      '· 인성안전부 교문지도(2학기) 시트에서 환경설정 이름과 일치하는 등교지도 일정 자동 반영',
      '· 문화건강부 급식 지도(2학기) 시트에서 환경설정 이름과 일치하는 급식지도 일정 자동 반영',
      '· 대시보드 2주 달력과 월간 통합 캘린더에 지도 시간·정문·후문 위치 표시',
      '· 왼쪽 메뉴의 그룹을 제거하고 모든 메뉴를 한 목록으로 표시',
      '· 목록 순서 변경 모드에서 메뉴를 끌어 놓아 개인 PC에 순서를 저장하고 기본 순서로 초기화 가능',
      '· 검색도우미와 사용 매뉴얼에 지도 일정·메뉴 순서 변경 안내 추가'
    ].join('\n'),
    date: '2026-08-05'
  },
  {
    key: 'v1.0.36',
    title: '[업데이트] 웅천고 업무도우미 v1.0.36',
    body: [
      '· 통합 캘린더의 주 시작 요일을 월요일에서 일요일로 변경',
      '· 대시보드의 이번 주·다음 주 2주 달력도 일요일 시작으로 통일',
      '· 요일 머리글과 날짜 칸을 일·월·화·수·목·금·토 순서로 정렬',
      '· 일요일은 붉은색, 토요일은 푸른색으로 요일 색상을 바로잡음',
      '· 검색도우미의 월간 통합 캘린더 안내도 일요일 시작 기준으로 갱신'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.35',
    title: '[업데이트] 웅천고 업무도우미 v1.0.35',
    body: [
      '· 전보내신점수 계산기에서 나이스 인사발령상황(전체) Excel data 파일 불러오기 지원',
      '· 현임교 발령일을 찾고 휴직·정직·직위해제 기간을 제외한 실제 근무 구간 자동 생성',
      '· 인사발령 이력에 있는 담임교사·보직교사 인정 월수 자동 입력',
      '· 표창·상장·자격·우대조건 등 기존 수기 가산점은 유지하고 나이스에 없는 항목만 직접 입력',
      '· 파일 내려받기 경로와 개인정보 로컬 처리 안내를 계산기·검색도우미·사용 매뉴얼에 추가',
      '· 대시보드 왼쪽에 2주 달력·선택 일정·날씨·급식, 오른쪽에 주간 시간표를 배치한 4영역 구성 적용'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.34',
    title: '[업데이트] 웅천고 업무도우미 v1.0.34',
    body: [
      '· 전보내신점수 계산기: 2027 경남교육청 중등 일반교사 기준 근무경력점·교육활동경력점·가산점 합산',
      '· 웅천고 라급지 연 5.5점 기본 적용, 최근 3년 근무경력과 최근 5년 교육활동 경력 자동 반영',
      '· 15일 이상 월 산입과 월수환산점 반올림, 장기근무 누진·추가점 및 항목별 상한 자동 계산',
      '· 기간 중복·동일 실적 중복 주의 표시, 세부 산출 내역 인쇄·PDF 저장',
      '· 입력 자료는 현재 PC에만 자동 저장되며 검색도우미와 사용 매뉴얼에서도 바로 안내'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.33',
    title: '[업데이트] 웅천고 업무도우미 v1.0.33',
    body: [
      '· 서식센터: 회의록·행사계획서·결과보고서·참가자명단·가정통신문·위원회 안내와 회의록 작성',
      '· 공통 서식 출력: 학교 정보와 결재란 자동 적용, A4 미리보기·PDF·Excel·한글용 표 복사',
      '· 명단 비교: Excel·CSV·붙여넣기 명단의 공통·누락·중복 인원 자동 비교',
      '· 날짜 계산: 근무일수·D-day·만 나이·학기 주차 계산',
      '· 추첨·모둠: 공유 명렬 연동, 제외·같은 모둠·분리 조건과 결과 기록·출력'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.32',
    title: '[업데이트] 웅천고 업무도우미 v1.0.32',
    body: [
      '· 업무 자동 분류: 오늘 마감·3일 이내 마감 임박·기한 초과 업무를 자동 집계',
      '· 새 업무 표시: 이 PC에서 마지막으로 업무센터를 확인한 뒤 새로 배부된 업무 표시',
      '· 업무센터 바로 필터: 요약 카드를 누르면 해당 분류 업무만 즉시 확인',
      '· 대시보드 업무 알림: 새 업무·오늘 마감·마감 임박·기한 초과 현황과 우선 업무 표시'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.31',
    title: '[업데이트] 웅천고 업무도우미 v1.0.31',
    body: [
      '· 캘린더 즉시 표시: 앱 실행 중 월별 일정 스냅샷을 보관해 다시 열 때 먼저 표시',
      '· 백그라운드 갱신: NEIS·주간계획·위원회·공유 업무를 개별 갱신해 느린 요청이 화면을 막지 않도록 개선',
      '· 담임 표시 수정: 3-4 같은 학급 표기가 날짜로 바뀌는 문제를 복구하고 텍스트 형식으로 고정',
      '· 메뉴 정리: 별도 NEIS 정보 메뉴를 숨기고 대시보드와 캘린더에서 관련 정보를 확인하도록 정리',
      '· 대시보드 재배치: 이번 주·다음 주 2주 달력을 날씨·급식보다 위에 표시'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.30',
    title: '[업데이트] 웅천고 업무도우미 v1.0.30',
    body: [
      '· 업무센터: 기존 업무 체크리스트를 내 업무·공유 업무·개인 업무 중심 화면으로 확장',
      '· 업무 관리: 상태·우선순위·시작일·마감일·관련 링크·세부 확인 항목 지원',
      '· 부서 업무: 교원 명렬의 부서 단위 배부, 업무 복제, 미완료자 명단 복사 지원',
      '· 일정 연동: 공유 업무 마감일을 대시보드 2주 일정과 통합 캘린더에 표시',
      '· 진행 현황: 작성자가 대상자별 진행 상태와 완료율을 한눈에 확인',
      '· 개인 업무: 업무센터에서도 현재 PC 전용 개인 업무를 등록·완료·삭제 가능',
      '· 교원 명렬: 2026 업무분장에서 부서·교과·담임 정보만 선별해 이름 기준으로 반영'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.28',
    title: '[업데이트] 웅천고 업무도우미 v1.0.28',
    body: [
      '· 검색 도우미 보강: NEIS 정보·대학 권장과목·업무 알리미 안내 추가',
      '· 메뉴 누락 자동 검사: 새 메뉴가 검색 도우미에 없으면 배포 전 오류 표시',
      '· 업데이트 작업 규칙: 기능 변경 시 검색 설명·단계·검색어도 함께 갱신',
      '· 배포 안정성: 검색 도우미 점검을 기존 타입 검사와 자동 배포 과정에 통합'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.27',
    title: '[업데이트] 웅천고 업무도우미 v1.0.27',
    body: [
      '· 업무 도우미 검색: 평소 말하듯 질문해 알맞은 기능과 메뉴 찾기',
      '· 단계별 안내: 관련 기능의 사용 순서와 현재 교사 설정 함께 표시',
      '· 빠른 이동: 검색 결과에서 해당 업무 화면으로 즉시 이동',
      '· 단축키: 어느 화면에서나 Ctrl+K로 검색창 열기',
      '· 최근 질문: 현재 PC에만 저장하고 다시 선택하거나 한 번에 삭제',
      '· 개인정보 보호: 외부 AI·API 없이 앱 내부에서 검색 처리'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.26',
    title: '[업데이트] 웅천고 업무도우미 v1.0.26',
    body: [
      '· 대시보드 캘린더: 이번 주와 다음 주 2주 일정을 큰 화면으로 표시',
      '· 통합 캘린더: NEIS 학사일정·주간계획·내 위원회·개인 업무 월간 보기',
      '· 개인 업무: 마감일·시간·중요도·메모 등록과 수정·완료·삭제 지원',
      '· 개인 업무 위젯: 오늘 마감·기한 초과 업무 확인 및 대시보드 즉시 완료 처리',
      '· 개인 메모: 학교 공유 서버에 전송하지 않고 현재 PC에 자동 저장',
      '· 화면 정리: 대시보드와 환경설정의 Google 캘린더 임베드 기능 제거'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.25',
    title: '[업데이트] 웅천고 업무도우미 v1.0.25',
    body: [
      '· 공유자료 속도 개선: 앱 실행 시 시간표·명렬·위원회 자료를 미리 불러오기',
      '· 즉시 화면 표시: 메뉴를 열면 세션 캐시를 먼저 표시하여 대기시간 단축',
      '· 자동 동기화: 서버 자료가 변경된 경우 변경된 자료만 백그라운드에서 갱신',
      '· 개인정보 보호: 임시 자료는 메모리에만 보관하고 앱 종료 시 자동 삭제',
      '· 캐시 관리: 환경설정에서 임시 저장자료 현황 확인 및 즉시 삭제 지원'
    ].join('\n'),
    date: '2026-08-01'
  },
  {
    key: 'v1.0.24',
    title: '[업데이트] 웅천고 업무도우미 v1.0.24',
    body: [
      '· 성적 산출 미리보기: 기존에 제작한 원본 화면과 계산 방식으로 복원',
      '· 추정분할점수 도우미: 별도 메뉴로 분리하여 분할점수 구성·성취도 분포 예측·역산 제공',
      '· 독립 저장: 두 도구의 설정과 작업자료가 서로 섞이지 않도록 저장공간 분리',
      '· 자료 이동: v1.0.23에서 저장된 통합 도구 자료는 추정분할점수 도우미로 자동 이전',
      '· 선택형 없는 시험: 선택형 제약을 제외하고 서술형 정답률만 계산'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.23',
    title: '[업데이트] 웅천고 업무도우미 v1.0.23',
    body: [
      '· 학사·기록: 성적 산출 미리보기 메뉴 추가',
      '· 평가 구성: 학기말 합산·1차 시험, 5·9등급제, 성취도 분할 방식 지원',
      '· 점수 입력: 행렬형·목록형 Excel 자동 인식과 직접 붙여넣기 지원',
      '· 결과 확인: 환산점수·석차·동석차·등급 컷·성취도 분포 제공',
      '· 로컬 보안: 점수는 학교 공유 서버로 전송하지 않고 PC에만 임시 저장',
      '· 저장·복원: 작업 설정과 점수를 정리 Excel로 내보내고 복원 가능'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.22',
    title: '[업데이트] 웅천고 업무도우미 v1.0.22',
    body: [
      '· 학교 내 각종위원회: 2026학년도 경남교육청 고등학교 기준으로 교체',
      '· 위원회 명단: 전체 교직원이 교원 명렬 선택·직접 입력·역할 지정 가능',
      '· 위원회 캘린더: 전체 교직원이 일정을 등록·삭제하고 개인 달력에서 확인',
      '· 일정 충돌: 같은 위원이 같은 시간대 위원회에 중복될 때 경고 및 등록 차단',
      '· 대시보드: 이름·NEIS API 키 미설정 시 바로가기 안내 추가',
      '· 학교 운영: 학교비치장부현황 메뉴 제거'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.21',
    title: '[업데이트] 웅천고 업무도우미 v1.0.21',
    body: [
      '• 연수등록부: 출력 미리보기를 실제 양식과 같은 열 우선 번호 순서로 수정',
      '• 연수등록부·출석부: 명단이 각 양식 한 페이지에 들어가도록 인쇄 크기 자동 조정',
      '• 수업 출석부: 기존 5자리 학번 시간표와 4자리 학생 명렬을 자동 연결',
      '• 메뉴 구성: 업무 체크리스트와 교원 명렬·연수등록부를 분리',
      '• 메뉴 순서: 학사·기록과 학교운영을 상단으로 이동하고 위원회·비치 장부를 하단 배치'
    ].join('\n'),
    date: '2026-07-31'
  },
  {
    key: 'v1.0.20',
    title: '[업데이트] 웅천고 업무도우미 v1.0.20',
    body: [
      '• 업무 체크리스트: 교원·부서별 업무 배부, 개인 체크, 배부자 완료 현황 확인',
      '• 교원 명렬: 관리자 Excel 등록·수정, 교장·교감 우선/가나다순 정렬, 명렬 내려받기',
      '• 연수등록부: 제목·날짜 입력 후 2단 서명 양식 인쇄 및 PDF 저장',
      '• 학생 명렬: 관리자 일괄 등록·수정, 일반 사용자는 조회·출력 전용',
      '• 출석부: 학급별 및 이동수업 강좌별 출력',
      '• 묶음 출력: 교사 선택 시 담당 강좌 전체, 과목 선택 시 해당 과목 분반 전체를 연속 인쇄하거나 Excel로 저장'
    ].join('\n'),
    date: '2026-07-31'
  }
];

const RELEASE_NOTES = [
  {
    key: 'v1.1.17',
    title: '[업데이트] 웅천고 업무도우미 v1.1.17',
    body: [
      '· 생기부 개인정보 블라인드 메뉴를 추가했습니다. 여러 PDF를 불러와 이름·학교명 등의 개인정보를 자동 또는 수동으로 가린 뒤 PDF나 ZIP으로 저장할 수 있습니다.',
      '· 개인정보 블라인드 작업과 PDF 처리 라이브러리는 앱에 내장되어 문서를 외부 서버로 보내지 않고 현재 PC에서만 처리합니다.',
      '· 원본 제작자인 충렬여자고등학교 Bryan Park의 출처를 표시하고, 웅천고 업무도우미 화면과 로컬 실행 방식에 맞게 수정했습니다.',
      '· 많아진 메뉴를 시작·설정, 업무·학교운영, 학생·학사, 평가·교육과정·진로, 인사·교사용 도구로 묶어 접고 펼칠 수 있게 했습니다.',
      '· 대시보드는 왼쪽 메뉴 최상단에 항상 표시하고, 메뉴 그룹은 최초 실행 시 모두 펼친 상태로 시작하도록 개선했습니다.',
      '· 오늘 브리핑과 검색 도우미를 보완하고, 교직원 명렬을 포함한 밝은 모드 화면의 글자 대비와 출력·대형 목록 처리 기반을 개선했습니다.'
    ].join('\n'),
    date: '2026-08-24'
  },
  {
    key: 'v1.1.14',
    title: '[업데이트] 웅천고 업무도우미 v1.1.14',
    body: [
      '· 학생 위치 찾기에 2026학년도 2학기 도움반 학생 개인 시간표를 반영했습니다.',
      '· 개인 시간표에서 색칠된 수업은 해당 요일·교시에 학생 위치를 도움반으로 안내합니다.',
      '· 색칠되어 있어도 동아리 수업은 도움반으로 처리하지 않으며, 일반 학생과 일반 수업 위치는 기존 방식대로 표시합니다.',
      '· 쉬는 시간에는 앞시간과 뒷시간을 각각 판정하고, 월요일 시간표 대체 운영일과 승인된 교환·대강에도 도움반 위치 안내가 유지됩니다.',
      '· 검색 도우미와 사용 안내에도 도움반 위치 확인 방법을 추가했습니다.'
    ].join('\n'),
    date: '2026-08-20'
  },
  {
    key: 'v1.1.13',
    title: '[업데이트] 웅천고 업무도우미 v1.1.13',
    body: [
      '· 자주 쓰는 메뉴를 누른 순서대로 위에 고정하고, 사용하지 않는 메뉴를 숨긴 뒤 환경설정에서 복원할 수 있게 했습니다.',
      '· 대시보드와 통합 캘린더의 일정 종류를 각각 켜고 끌 수 있게 하고, 대시보드 2주 달력은 일정이 많아도 모두 표시하도록 개선했습니다.',
      '· 내 위원회 일정과 배부받은 미완료 업무를 한 줄 카드로 압축해 좌우 병렬 배치하고, 캘린더에도 미완료 업무 바로가기를 추가했습니다.',
      '· 업무센터를 내 업무·업무 만들기 등으로 정리하고, 업무 요약을 누르면 세부 내용이 펼쳐지며 저장 직후 대시보드와 캘린더에 반영되도록 개선했습니다.',
      '· 타학교 평가계획의 지역 후보를 먼저 들어온 최대 50개교 중 12개교 무작위 방식으로 바꾸고, 파일 목록 확인 실패 시에도 MCP 원문 검색을 계속하도록 복구했습니다.',
      '· 여러 봉사활동 확인서가 한 HWP에 들어 있을 때 학생과 활동이 잘못 연결되는 문제를 차단하고, 위원회 화면의 밝은 모드 배경과 글자 대비를 개선했습니다.'
    ].join('\n'),
    date: '2026-08-20'
  },
  {
    key: 'v1.1.12',
    title: '[업데이트] 웅천고 업무도우미 v1.1.12',
    body: [
      '· 타학교 평가계획 메뉴를 추가하고, 웅천고 교육과정 편성표의 정식 과목명과 2015·2022 개정 교육과정 성취기준 코드를 기준으로 평가계획을 판정하도록 개선했습니다.',
      '· 평가계획 검색 범위를 2025학년도 1·2학기와 2026학년도 1학기(최근 3학기)로 정리하고, 지역 필터·진행 시간·검색 개수·중지 기능과 근거 성취기준 코드 표시를 반영했습니다.',
      '· 교환·대강 계획에서 동교과 교사를 우선 표시하며, 국어·수학·영어 등 동일 교과와 과학군·사회군 교사를 색상과 배지로 구분하도록 개선했습니다.',
      '· 대시보드와 캘린더에 간편 일정 생성 흐름을 추가하고, 학생 위치 찾기의 쉬는 시간 안내와 위원회 화면의 밝은 모드 글자 대비를 보완했습니다.',
      '· 봉사활동 담당자용 확인서 수기 생성·검증 흐름과 로컬 문서 처리 기능을 보완했습니다.',
      '· 2027 대입 권장과목 자료와 학생 교과학습발달상황 Excel의 로컬 이수과목 분석 기능을 추가했습니다.'
    ].join('\n'),
    date: '2026-08-14'
  },
  {
    key: 'v1.1.11',
    title: '[업데이트] 웅천고 업무도우미 v1.1.11',
    body: [
      '• 시간표·학생/교직원 명렬·업무·일정 등 학교 공유자료를 Windows 사용자 계정에 묶어 암호화된 로컬 캐시로 보관하고, 화면에는 로컬 자료를 먼저 표시한 뒤 서버 변경분만 백그라운드에서 갱신하도록 개선했습니다.',
      '• 자료 종류별로 2분·5분·15분·30분 간격의 자동 동기화를 적용하고 환경설정에서 로컬 저장 상태와 마지막 갱신 시각을 확인하거나 저장자료를 비울 수 있게 했습니다.',
      '• 출석부를 포함한 여러 Excel 다운로드에서 0바이트 파일이 만들어져 Excel이 파일 형식 오류를 표시하던 문제를 수정했습니다.',
      '• 반별 봉사활동 확인서는 제공된 웅천고 HWPX 원본 양식을 앱에 포함하여 표·테두리·글꼴·배치를 유지한 채 학급 명렬과 입력값이 자동으로 들어가도록 만들었습니다.',
      '• 반별 봉사활동 확인서에 봉사 날짜·교시·영역·장소·내용, 인정시간 일괄 입력, 결석·지각·조퇴 등 학생별 문구 입력, HWPX·PDF 다운로드와 바로 인쇄 기능을 추가했습니다.',
      '• 검색 도우미에 새 로컬 자동 동기화 방식과 반별 봉사활동 확인서의 HWPX·PDF·인쇄 사용법을 반영했습니다.'
    ].join('\n'),
    date: '2026-08-12'
  },
  {
    key: 'v1.1.10',
    title: '[업데이트] 웅천고 업무도우미 v1.1.10',
    body: [
      '· 봉사활동 확인서 발급을 반별·부서별로 분리하고, 반 명렬 전체 불러오기와 결석·결과 등 학생별 예외 문구 출력을 추가했습니다.',
      '· 봉사활동 검증에 텍스트·스캔 PDF 오프라인 OCR을 지원하고, OCR 화면과 미분류 탭에서 학교 명렬 기준 학번·이름 교정을 할 수 있습니다.',
      '· OCR·나이스·확인서 자료는 학교 공유 서버로 보내지 않고 현재 PC의 로컬 보관함에서만 처리합니다.',
      '· 3학년 당김수업을 교사 시간표·대시보드·캘린더에 반영하고 대시보드 일정 종류별 켜기·끄기를 추가했습니다.',
      '· 학교 공유 서비스 주소를 앱에 고정 내장하여 PC별 URL 오류를 방지하고, 학생 명렬 등 조회 요청의 연결 복구를 강화했습니다.',
      '· 밝은 모드의 시간표·달력 글자를 더 어둡고 굵게 표시하여 가독성을 개선했습니다.',
      '· 로그인 유지 시간을 72시간으로 확대하고 검색도우미·사용 매뉴얼을 새 기능에 맞게 갱신했습니다.'
    ].join('\n'),
    date: '2026-08-12'
  },
  {
    key: 'v1.1.9',
    title: '[긴급 수정] 웅천고 업무도우미 v1.1.9',
    body: [
      '· “나만 우선 반영” 요청이 PC 앱에서 차단되어 학교 공유 서버 업데이트 안내가 표시되던 문제를 수정했습니다.',
      '· 실제 학교 공유 요청 허용 목록에 해당 기능을 등록하여 서버까지 정상 전달되도록 보완했습니다.',
      '· 배포 전 자동 검사가 실제 허용 목록만 확인하도록 강화하여 같은 누락이 다시 발생하지 않도록 했습니다.',
      '· 기존 교환·대강 요청은 유지되며 업데이트 후 다시 “나만 우선 반영”을 누르면 됩니다.'
    ].join('\n'),
    date: '2026-08-11'
  },
  {
    key: 'v1.1.7',
    title: '[긴급 수정] 웅천고 업무도우미 v1.1.7',
    body: [
      '· 교환·대강의 “나만 우선 반영”을 누르면 “허용되지 않는 요청입니다”가 표시되던 오류를 수정했습니다.',
      '· PC 앱의 학교 공유 요청 허용 목록과 서버 작업명을 일치시켜 승인 전 본인 시간표·캘린더 우선 반영이 정상 동작합니다.',
      '· 앞으로 교환·대강 요청 작업명이 앱과 서버에서 누락되지 않도록 배포 전 자동 검사를 추가했습니다.',
      '· 기존 교환·대강 요청 기록은 그대로 유지되며 다시 “나만 우선 반영”을 누르면 사용할 수 있습니다.'
    ].join('\n'),
    date: '2026-08-11'
  },
  {
    key: 'v1.1.6',
    title: '[업데이트] 웅천고 업무도우미 v1.1.6',
    body: [
      '· 봉사활동 업무 메뉴를 추가했습니다. 전용 Excel 명단으로 웅천고 확인서를 발급하고 나이스 자료와 여러 HWP 확인서를 누적 검증할 수 있습니다.',
      '· 봉사활동 명단과 확인서 자료는 학교 공유 서버·구글시트로 보내지 않고 현재 PC에만 저장하며 사용자가 직접 비울 수 있습니다.',
      '· 봉사활동 검증 결과를 활동 내용·기간·시간 열로 나누어 압축하고, 원본 파일명과 Excel 행·HWP 확인서 위치는 마우스를 올릴 때 표시합니다.',
      '· 학생 학번을 프로그램 전체에서 4자리로 통일하고, 검색과 자료 가져오기에서는 기존 5자리 학번도 같은 학생으로 인식하도록 개선했습니다.',
      '· 교환·대강의 “나만 우선 반영”, 상대 교사 승인 알림과 날짜별 시간표 반영을 보강하고 교환보강 계획서 다페이지 출력을 개선했습니다.',
      '· 8월 11일 화요일의 월요일 시간표 운영 안내와 교사·학급 시간표 표시를 반영하고 대시보드 안내 영역을 간결하게 정리했습니다.',
      '· 출석부·학생 시간표·학생 위치 찾기 등 학생 자료 기능의 학번 처리와 수업 자료 연결을 함께 보정했습니다.',
      '· 검색도우미와 사용 매뉴얼을 새 기능과 변경된 이용 순서에 맞게 갱신했습니다.'
    ].join('\n'),
    date: '2026-08-11'
  },
  {
    key: 'v1.1.5',
    title: '[업데이트] 웅천고 업무도우미 v1.1.5',
    body: [
      '· 교과세특 개별 인쇄기를 추가했습니다. 나이스 XLS data를 학생별 A4 한 장으로 미리보고 선택·전체 인쇄할 수 있습니다.',
      '· 교과세특은 Windows 사용자 계정으로 암호화되어 현재 PC에만 저장되며 비우기 기능을 제공합니다.',
      '· 누락된 학교 공유 URL을 시작 시 자동 복구하고 관리자 센터에 조회·저장 통신 진단 기능을 추가했습니다.',
      '· 여러 교사가 모두 비는 시간을 찾는 공동 공강 확인 기능과 교환보강 계획서 HWP 출력 양식을 개선했습니다.',
      '· 학생 위치 찾기의 4·5자리 학번 검색과 1학년 조회를 보정하고 승인된 수업변경을 반영했습니다.',
      '· 2학기 급식지도 하루 2인 배정을 모두 인식하고 위원회 일정 입력 오류를 수정했습니다.',
      '· 공유 학생 명렬의 비고 개인정보를 저장·응답하지 않도록 제거했습니다.',
      '· 검색도우미와 사용 매뉴얼을 새 기능에 맞게 갱신했습니다.'
    ].join('\n'),
    date: '2026-08-11'
  },
  {
    key: 'v1.1.4',
    title: '[업데이트] 웅천고 업무도우미 v1.1.4',
    body: [
      '· 학교 유선망에서도 주간계획·창체·등교지도·급식지도를 불러오도록 통신 방식을 개선했습니다.',
      '· 외부 Google Sheets 조회가 Windows 시스템 프록시와 인증서를 따르도록 변경했습니다.',
      '· 일시적인 연결 실패에는 자동 재시도를 적용했습니다.',
      '· 마지막으로 정상 조회한 일정을 PC 로컬에 저장해 통신 장애 시에도 표시합니다.',
      '· 검색도우미에 학교 PC 외부 일정 연결·로컬 복구 안내를 추가했습니다.'
    ].join('\n'),
    date: '2026-08-10'
  },
  {
    key: 'v1.1.3',
    title: '[업데이트] 웅천고 업무도우미 v1.1.3',
    body: [
      '· 학교 유선망에서도 로그인과 자료 조회가 가능하도록 조회 통신 방식을 개선했습니다.',
      '· Windows 시스템 프록시와 인증서를 따르도록 앱의 학교 공유 서비스 연결 방식을 변경했습니다.',
      '· 교직원 명렬·시간표 등 조회 요청에 일시적인 연결 실패 자동 재시도를 적용했습니다.',
      '· 검색도우미에 로그인·학교 공유 서비스 연결 문제 해결 안내를 추가했습니다.'
    ].join('\n'),
    date: '2026-08-10'
  },
  {
    key: 'official-v1.1.2',
    title: '[첫 배포] 웅천고 업무도우미 v1.1.2',
    body: [
      '· 웅천고등학교 교직원 업무 지원을 위한 첫 공식 배포입니다.',
      '· 대시보드, 캘린더, 시간표, 출석부, 업무센터와 학교 공용 업무 기능을 제공합니다.',
      '· 궁금한 기능은 상단 업무 검색 또는 Ctrl+K 검색도우미에서 평소 말하듯 입력해 찾아볼 수 있습니다.',
      '· 자세한 사용법은 왼쪽 사용 매뉴얼에서 확인해 주세요.',
      '· 이후 기능 개선과 오류 수정 내용은 이 공지사항에 새로 기록됩니다.'
    ].join('\n'),
    date: '2026-08-10'
  }
];

const GET_READ_ACTIONS = [
  'health',
  'getSyncManifest',
  'listLinks',
  'listNotices',
  'listFeatureRequests',
  'getTimetable',
  'getStudentTimetable',
  'getStaffRoster',
  'getStudentRoster',
  'listStaffChecklists',
  'listCommitteeState',
  'listTimetableChanges',
  'getNeisSyncStatus',
  'getNeisSnapshot'
];

function doGet(e) {
  try {
    const action = String(e && e.parameter && e.parameter.action || '');
    if (!action) return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 32 } });
    if (GET_READ_ACTIONS.indexOf(action) < 0) throw new Error('GET으로 허용되지 않는 요청입니다.');

    const rawPayload = String(e && e.parameter && e.parameter.payload || '{}');
    const body = JSON.parse(rawPayload);
    body.action = action;
    return doPost({ postData: { contents: JSON.stringify(body) } });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');

    // 일반 조회에서 전체 시트 생성·보정을 매번 실행하지 않는다.
    // 쓰기 요청은 버전 변경에 필요한 스키마만 보정한다.
    if (['addStaffChecklist', 'updateStaffChecklist', 'submitStaffChecklist', 'deleteStaffChecklist'].indexOf(action) >= 0) {
      ensureStaffChecklistSheets_();
    } else if (GET_READ_ACTIONS.indexOf(action) < 0 && action !== 'health') {
      ensureSheets_();
    }

    if (action === 'health') return json_({ ok: true, data: { service: 'UngcheonSchoolHub', version: 32 } });
    if (action === 'getSyncManifest') return json_({ ok: true, data: getSyncManifest_() });
    if (action === 'verifyAdmin') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: { verified: true } });
    }
    if (action === 'listLinks') return json_({ ok: true, data: listLinks_() });
    if (action === 'addLink') return json_({ ok: true, data: addLink_(body) });
    if (action === 'deleteLink') {
      requireAdmin_(body.adminPassword);
      deleteRowById_(LINKS_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'listNotices') return json_({ ok: true, data: listNotices_() });
    if (action === 'addNotice') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: addNotice_(body) });
    }
    if (action === 'deleteNotice') {
      requireAdmin_(body.adminPassword);
      deleteRowById_(NOTICES_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'listFeatureRequests') return json_({ ok: true, data: listFeatureRequests_() });
    if (action === 'addFeatureRequest') return json_({ ok: true, data: addFeatureRequest_(body) });
    if (action === 'updateFeatureRequest') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: updateFeatureRequest_(body) });
    }
    if (action === 'deleteFeatureRequest') {
      requireAdmin_(body.adminPassword);
      deleteRowById_(FEATURE_REQUESTS_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'getTimetable') return json_({ ok: true, data: getTimetable_() });
    if (action === 'replaceTimetable') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceTimetable_(body) });
    }
    if (action === 'getStudentTimetable') return json_({ ok: true, data: getStudentTimetable_() });
    if (action === 'replaceStudentTimetable') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceStudentTimetable_(body) });
    }
    if (action === 'getStaffRoster') return json_({ ok: true, data: getStaffRoster_() });
    if (action === 'replaceStaffRoster') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceStaffRoster_(body) });
    }
    if (action === 'getStudentRoster') return json_({ ok: true, data: getStudentRoster_() });
    if (action === 'replaceStudentRoster') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: replaceStudentRoster_(body) });
    }
    if (action === 'listStaffChecklists') {
      return json_({ ok: true, data: listStaffChecklists_(body) });
    }
    if (action === 'addStaffChecklist') {
      return json_({ ok: true, data: addStaffChecklist_(body) });
    }
    if (action === 'updateStaffChecklist') {
      return json_({ ok: true, data: updateStaffChecklist_(body) });
    }
    if (action === 'submitStaffChecklist') {
      return json_({ ok: true, data: submitStaffChecklist_(body) });
    }
    if (action === 'deleteStaffChecklist') {
      deleteStaffChecklist_(body);
      return json_({ ok: true });
    }
    if (action === 'listCommitteeState') {
      return json_({ ok: true, data: listCommitteeState_() });
    }
    if (action === 'saveCommitteeMembers') {
      return json_({ ok: true, data: saveCommitteeMembers_(body) });
    }
    if (action === 'addCommitteeEvent') {
      return json_({ ok: true, data: addCommitteeEvent_(body) });
    }
    if (action === 'deleteCommitteeEvent') {
      deleteRowById_(COMMITTEE_EVENTS_SHEET, String(body.id || ''));
      return json_({ ok: true });
    }
    if (action === 'listTimetableChanges') return json_({ ok: true, data: listTimetableChanges_(body) });
    if (action === 'createTimetableChange') return json_({ ok: true, data: createTimetableChange_(body) });
    if (action === 'respondTimetableChange') return json_({ ok: true, data: respondTimetableChange_(body) });
    if (action === 'applyTimetableChangeForRequester') return json_({ ok: true, data: applyTimetableChangeForRequester_(body) });
    if (action === 'cancelTimetableChange') {
      cancelTimetableChange_(body);
      return json_({ ok: true });
    }
    if (action === 'getNeisSyncStatus') return json_({ ok: true, data: getNeisSyncStatus_(body) });
    if (action === 'registerNeisSyncDevice') {
      requireAdmin_(body.adminPassword);
      return json_({ ok: true, data: registerNeisSyncDevice_(body) });
    }
    if (action === 'revokeNeisSyncDevice') {
      requireAdmin_(body.adminPassword);
      revokeNeisSyncDevice_();
      return json_({ ok: true });
    }
    if (action === 'getNeisSnapshot') return json_({ ok: true, data: getNeisSnapshot_() });
    if (action === 'replaceNeisSnapshot') return json_({ ok: true, data: replaceNeisSnapshot_(body) });
    throw new Error('허용되지 않는 요청입니다.');
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function getSyncManifest_() {
  function versionOf_(sheetName) {
    const rows = readObjects_(sheetName);
    return 'v:' + String(rows.length ? Number(rows[0].version) || 0 : 0);
  }
  function activityOf_(resource, sheetNames) {
    const stored = PropertiesService.getScriptProperties().getProperty('UNG_SYNC_RESOURCE_' + resource);
    if (stored) return stored;
    // 기존 배포 자료의 최초 1회만 기초 버전을 만든다.
    let count = 0;
    let latest = '';
    sheetNames.forEach(function(sheetName) {
      readObjects_(sheetName).forEach(function(row) {
        count += 1;
        const changed = iso_(row.updatedAt || row.createdAt);
        if (changed > latest) latest = changed;
      });
    });
    const version = 'a:' + String(count) + ':' + latest;
    PropertiesService.getScriptProperties().setProperty('UNG_SYNC_RESOURCE_' + resource, version);
    return version;
  }
  return {
    generatedAt: new Date().toISOString(),
    resources: {
      timetable: versionOf_(TIMETABLE_META_SHEET),
      studentTimetable: versionOf_(STUDENT_TIMETABLE_META_SHEET),
      staffRoster: versionOf_(STAFF_ROSTER_META_SHEET),
      studentRoster: versionOf_(STUDENT_ROSTER_META_SHEET),
      sharedNeis: versionOf_(NEIS_SYNC_META_SHEET),
      staffChecklists: activityOf_('staffChecklists', [STAFF_CHECKLISTS_SHEET, STAFF_CHECKLIST_RESPONSES_SHEET])
      ,timetableChanges: activityOf_('timetableChanges', [TIMETABLE_CHANGES_SHEET])
    }
  };
}

/**
 * 최초 1회 실행합니다.
 * 아래 임시 비밀번호를 원하는 관리자 비밀번호로 바꾸고 실행한 뒤,
 * 코드에는 다시 CHANGE_ME를 넣어 저장하세요.
 */
function initialSetup() {
  const temporaryAdminPassword = 'CHANGE_ME';
  if (temporaryAdminPassword === 'CHANGE_ME') {
    throw new Error('temporaryAdminPassword를 원하는 비밀번호로 변경한 뒤 실행하세요.');
  }
  ensureSheets_();
  PropertiesService.getScriptProperties().setProperty(
    ADMIN_HASH_KEY,
    sha256_(temporaryAdminPassword)
  );
}

function ensureSheets_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('이 스크립트를 Google 스프레드시트에 연결하세요.');

  let links = book.getSheetByName(LINKS_SHEET);
  if (!links) {
    links = book.insertSheet(LINKS_SHEET);
    links.appendRow(['id', 'department', 'title', 'url', 'description', 'registeredBy', 'createdAt']);
    links.setFrozenRows(1);
  }

  let notices = book.getSheetByName(NOTICES_SHEET);
  if (!notices) {
    notices = book.insertSheet(NOTICES_SHEET);
    notices.appendRow(['id', 'title', 'body', 'level', 'date', 'expiresAt']);
    notices.setFrozenRows(1);
  }

  let requests = book.getSheetByName(FEATURE_REQUESTS_SHEET);
  if (!requests) {
    requests = book.insertSheet(FEATURE_REQUESTS_SHEET);
    requests.appendRow([
      'id', 'requestType', 'title', 'content', 'author',
      'createdAt', 'status', 'adminReply', 'updatedAt'
    ]);
    requests.setFrozenRows(1);
  }

  let timetableMeta = book.getSheetByName(TIMETABLE_META_SHEET);
  if (!timetableMeta) {
    timetableMeta = book.insertSheet(TIMETABLE_META_SHEET);
    timetableMeta.appendRow(['version', 'title', 'sourceFileName', 'uploadedBy', 'uploadedAt', 'teacherCount']);
    timetableMeta.setFrozenRows(1);
  }

  let timetable = book.getSheetByName(TIMETABLE_SHEET);
  const timetableHeaders = ['teacherName', 'teacherLabel', 'load'];
  for (let slot = 1; slot <= TIMETABLE_SLOT_COUNT; slot++) timetableHeaders.push('slot' + slot);
  for (let locked = 1; locked <= TIMETABLE_SLOT_COUNT; locked++) timetableHeaders.push('locked' + locked);
  if (!timetable) {
    timetable = book.insertSheet(TIMETABLE_SHEET);
    timetable.setFrozenRows(1);
  }
  if (timetable.getMaxColumns() < timetableHeaders.length) {
    timetable.insertColumnsAfter(timetable.getMaxColumns(), timetableHeaders.length - timetable.getMaxColumns());
  }
  timetable.getRange(1, 1, 1, timetableHeaders.length).setValues([timetableHeaders]);

  let studentTimetableMeta = book.getSheetByName(STUDENT_TIMETABLE_META_SHEET);
  if (!studentTimetableMeta) {
    studentTimetableMeta = book.insertSheet(STUDENT_TIMETABLE_META_SHEET);
    studentTimetableMeta.appendRow([
      'version', 'title', 'semester', 'uploadedBy', 'uploadedAt',
      'studentCount', 'classCount', 'courseCount'
    ]);
    studentTimetableMeta.setFrozenRows(1);
  }

  let studentTimetable = book.getSheetByName(STUDENT_TIMETABLE_SHEET);
  const studentTimetableHeaders = [
    'studentId', 'name', 'grade', 'className', 'number', 'enrollmentCount', 'payloadJson'
  ];
  if (!studentTimetable) {
    studentTimetable = book.insertSheet(STUDENT_TIMETABLE_SHEET);
    studentTimetable.setFrozenRows(1);
  }
  if (studentTimetable.getMaxColumns() < studentTimetableHeaders.length) {
    studentTimetable.insertColumnsAfter(
      studentTimetable.getMaxColumns(),
      studentTimetableHeaders.length - studentTimetable.getMaxColumns()
    );
  }
  studentTimetable.getRange(1, 1, 1, studentTimetableHeaders.length)
    .setValues([studentTimetableHeaders]);

  ensureDataSheet_(book, STAFF_ROSTER_META_SHEET, [
    'version', 'sourceFileName', 'uploadedBy', 'uploadedAt', 'memberCount'
  ]);
  ensureDataSheet_(book, STAFF_ROSTER_SHEET, [
    'id', 'name', 'position', 'department', 'subject', 'homeroom'
  ]);
  repairStaffHomeroomCells_(book);
  ensureStaffAssignments2026_(book);
  ensureDataSheet_(book, STUDENT_ROSTER_META_SHEET, [
    'version', 'sourceFileName', 'uploadedBy', 'uploadedAt', 'studentCount'
  ]);
  ensureDataSheet_(book, STUDENT_ROSTER_SHEET, [
    'studentId', 'name', 'gender', 'unused', 'grade', 'className', 'number',
    'homeroomTeacher', 'assistantTeacher'
  ]);
  ensureDataSheet_(book, STAFF_CHECKLISTS_SHEET, [
    'id', 'title', 'description', 'deadline', 'creatorName', 'createdAt',
    'closed', 'itemsJson', 'targetNamesJson', 'startDate', 'priority', 'status',
    'linkUrl', 'departmentNamesJson', 'updatedAt', 'requestId'
  ]);
  ensureDataSheet_(book, STAFF_CHECKLIST_RESPONSES_SHEET, [
    'checklistId', 'teacherName', 'checkedItemIdsJson', 'memo', 'updatedAt'
  ]);
  ensureDataSheet_(book, COMMITTEE_MEMBERS_SHEET, [
    'committeeId', 'committeeName', 'membersJson', 'updatedBy', 'updatedAt'
  ]);
  ensureDataSheet_(book, COMMITTEE_EVENTS_SHEET, [
    'id', 'committeeId', 'committeeName', 'title', 'date', 'startTime', 'endTime',
    'location', 'agenda', 'memberNamesJson', 'createdBy', 'createdAt'
  ]);
  ensureDataSheet_(book, TIMETABLE_CHANGES_SHEET, [
    'id', 'kind', 'status', 'requesterName', 'targetTeacherName',
    'originalSlotIndex', 'replacementSlotIndex', 'originalDate', 'replacementDate',
    'originalTeacher', 'replacementTeacher', 'originalClass', 'replacementClass',
    'originalSubject', 'replacementSubject', 'note', 'createdAt', 'respondedAt', 'responderName', 'updatedAt',
    'requesterAppliedAt'
  ]);
  repairTimetableChangeClassCells_(book);
  ensureDataSheet_(book, NEIS_SYNC_META_SHEET, [
    'version', 'schoolName', 'fromDate', 'toDate', 'fetchedAt', 'uploadedAt',
    'deviceId', 'mealCount', 'scheduleCount', 'timetableCount', 'status', 'lastError'
  ]);
  ensureDataSheet_(book, NEIS_MEALS_SHEET, [
    'date', 'mealType', 'dishNamesJson', 'calories', 'ntrInfo'
  ]);
  ensureDataSheet_(book, NEIS_SCHEDULE_SHEET, [
    'date', 'eventName', 'eventLevel'
  ]);
  ensureDataSheet_(book, NEIS_CLASS_TIMETABLE_SHEET, [
    'date', 'grade', 'classNm', 'period', 'subject', 'teacher', 'classroom'
  ]);
  repairCommitteeTimeCells_(book);
  ensureReleaseNotices_();
}

function ensureStaffChecklistSheets_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('이 스크립트를 Google 스프레드시트에 연결하세요.');
  ensureDataSheet_(book, STAFF_CHECKLISTS_SHEET, [
    'id', 'title', 'description', 'deadline', 'creatorName', 'createdAt',
    'closed', 'itemsJson', 'targetNamesJson', 'startDate', 'priority', 'status',
    'linkUrl', 'departmentNamesJson', 'updatedAt', 'requestId'
  ]);
  ensureDataSheet_(book, STAFF_CHECKLIST_RESPONSES_SHEET, [
    'checklistId', 'teacherName', 'checkedItemIdsJson', 'memo', 'updatedAt'
  ]);
}

function touchSyncResource_(resource) {
  const properties = PropertiesService.getScriptProperties();
  const key = 'UNG_SYNC_RESOURCE_' + resource;
  const previous = String(properties.getProperty(key) || 'v:0');
  const match = previous.match(/^v:(\d+)/);
  const next = (match ? Number(match[1]) : 0) + 1;
  properties.setProperty(key, 'v:' + next + ':' + new Date().toISOString());
}

function ensureDataSheet_(book, name, headers) {
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.setFrozenRows(1);
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureStaffAssignments2026_(book) {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(STAFF_ASSIGNMENTS_2026_APPLIED_KEY) === 'true') return;
  const sheet = book.getSheetByName(STAFF_ROSTER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const byName = {};
  STAFF_ASSIGNMENTS_2026.forEach(function(item) { byName[item[0]] = item; });
  let matched = 0;
  let changed = false;
  values.forEach(function(row) {
    const assignment = byName[String(row[1] || '').trim()];
    if (!assignment) return;
    matched += 1;
    const next = [assignment[1], assignment[2], assignment[3]];
    for (let index = 0; index < 3; index++) {
      if (String(row[index + 3] || '') !== next[index]) changed = true;
      row[index + 3] = next[index];
    }
  });
  if (!matched) return;
  if (changed) {
    sheet.getRange('F:F').setNumberFormat('@');
    sheet.getRange(2, 1, values.length, 6).setValues(values);
    const meta = readObjects_(STAFF_ROSTER_META_SHEET)[0] || {};
    replaceSheetRows_(STAFF_ROSTER_META_SHEET, [[
      (Number(meta.version) || 0) + 1,
      String(meta.sourceFileName || ''),
      '2026 업무분장 반영',
      new Date().toISOString(),
      values.length
    ]]);
  }
  properties.setProperty(STAFF_ASSIGNMENTS_2026_APPLIED_KEY, 'true');
}

function normalizeStaffHomeroom_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return String(value.getMonth() + 1) + '-' + String(value.getDate());
  }
  return String(value == null ? '' : value).trim();
}

function repairStaffHomeroomCells_(book) {
  const sheet = book.getSheetByName(STAFF_ROSTER_SHEET);
  if (!sheet) return;
  sheet.getRange('F:F').setNumberFormat('@');
  if (sheet.getLastRow() < 2) return;
  const range = sheet.getRange(2, 6, sheet.getLastRow() - 1, 1);
  const values = range.getValues();
  let changed = false;
  values.forEach(function(row) {
    const normalized = normalizeStaffHomeroom_(row[0]);
    if (Object.prototype.toString.call(row[0]) === '[object Date]' || String(row[0] || '') !== normalized) {
      row[0] = normalized;
      changed = true;
    }
  });
  if (!changed) return;
  range.setValues(values);
  const meta = readObjects_(STAFF_ROSTER_META_SHEET)[0] || {};
  replaceSheetRows_(STAFF_ROSTER_META_SHEET, [[
    (Number(meta.version) || 0) + 1,
    String(meta.sourceFileName || ''),
    '담임 학급 표기 복구',
    new Date().toISOString(),
    sheet.getLastRow() - 1
  ]]);
}

function normalizeTimetableChangeClass_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return String(value.getMonth() + 1) + '-' + String(value.getDate());
  }
  const text = String(value == null ? '' : value).trim();
  const classMatch = text.match(/^([1-3])[-\s]?0?(\d{1,2})$/);
  return classMatch ? classMatch[1] + '-' + String(Number(classMatch[2])) : text;
}

function repairTimetableChangeClassCells_(book) {
  const sheet = book.getSheetByName(TIMETABLE_CHANGES_SHEET);
  if (!sheet) return;
  sheet.getRange('L:M').setNumberFormat('@');
  if (sheet.getLastRow() < 2) return;
  const range = sheet.getRange(2, 12, sheet.getLastRow() - 1, 2);
  const values = range.getValues();
  let changed = false;
  values.forEach(function(row) {
    for (let column = 0; column < 2; column++) {
      const normalized = normalizeTimetableChangeClass_(row[column]);
      if (Object.prototype.toString.call(row[column]) === '[object Date]' || String(row[column] || '') !== normalized) {
        row[column] = normalized;
        changed = true;
      }
    }
  });
  if (changed) range.setValues(values);
}

function ensureReleaseNotices_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTICES_SHEET);
    const properties = PropertiesService.getScriptProperties();
    const shouldReset = properties.getProperty(OFFICIAL_RELEASE_NOTICE_RESET_KEY) !== 'true';
    if (shouldReset && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }

    // 동일 제목 공지가 여러 번 등록된 경우 가장 먼저 등록된 한 행만 남깁니다.
    const lastRow = sheet.getLastRow();
    if (lastRow > 2) {
      const titleValues = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
      const seenTitles = {};
      const duplicateRows = [];
      titleValues.forEach(function(row, index) {
        const title = String(row[0] || '').trim();
        if (!title) return;
        if (seenTitles[title]) duplicateRows.push(index + 2);
        else seenTitles[title] = true;
      });
      duplicateRows.reverse().forEach(function(rowNumber) {
        sheet.deleteRow(rowNumber);
      });
    }

    // 제목의 버전만 다르고 내용이 같은 공식 업데이트 공지는 더 높은 버전만 남깁니다.
    // 사용자가 직접 작성한 일반 공지는 본문이 같아도 삭제하지 않습니다.
    const contentLastRow = sheet.getLastRow();
    if (contentLastRow > 2) {
      const noticeValues = sheet.getRange(2, 1, contentLastRow - 1, 3).getDisplayValues();
      const byBody = {};
      const duplicateContentRows = [];
      noticeValues.forEach(function(row, index) {
        const id = Number(row[0]) || 0;
        const title = String(row[1] || '').trim();
        const bodyKey = String(row[2] || '').replace(/\s+/g, ' ').trim();
        const versionMatch = title.match(/^\[(?:업데이트|긴급 수정|첫 배포)\].*?v(\d+)\.(\d+)\.(\d+)$/);
        if (!versionMatch || !bodyKey) return;
        const versionScore = Number(versionMatch[1]) * 100000000 + Number(versionMatch[2]) * 10000 + Number(versionMatch[3]);
        const current = { rowNumber: index + 2, id: id, versionScore: versionScore };
        const previous = byBody[bodyKey];
        if (!previous) {
          byBody[bodyKey] = current;
          return;
        }
        if (current.versionScore > previous.versionScore ||
            (current.versionScore === previous.versionScore && current.id > previous.id)) {
          duplicateContentRows.push(previous.rowNumber);
          byBody[bodyKey] = current;
        } else {
          duplicateContentRows.push(current.rowNumber);
        }
      });
      duplicateContentRows.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) {
        sheet.deleteRow(rowNumber);
      });
    }

    const existing = readObjects_(NOTICES_SHEET);
    const titles = {};
    let maxId = 0;
    existing.forEach(function(notice) {
      titles[String(notice.title || '')] = true;
      maxId = Math.max(maxId, Number(notice.id) || 0);
    });
    RELEASE_NOTES.forEach(function(note) {
      if (titles[note.title]) return;
      maxId += 1;
      sheet.appendRow([maxId, note.title, note.body, 'important', note.date, '']);
      titles[note.title] = true;
    });
    if (shouldReset) properties.setProperty(OFFICIAL_RELEASE_NOTICE_RESET_KEY, 'true');
  } finally {
    lock.releaseLock();
  }
}

function listLinks_() {
  const rows = readObjects_(LINKS_SHEET);
  return rows
    .map(function(row) {
      return {
        id: String(row.id || ''),
        department: String(row.department || ''),
        title: String(row.title || ''),
        url: String(row.url || ''),
        description: String(row.description || ''),
        registeredBy: String(row.registeredBy || ''),
        createdAt: iso_(row.createdAt)
      };
    })
    .filter(function(row) { return row.id && row.title && row.url; })
    .sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function addLink_(body) {
  const department = clean_(body.department, 40);
  const title = clean_(body.title, 80);
  const url = clean_(body.url, 500);
  const description = clean_(body.description, 200);
  const registeredBy = clean_(body.registeredBy, 30) || '교직원';

  if (!department || !title || !url) throw new Error('부서, 이름, URL을 모두 입력하세요.');
  if (!/^https?:\/\//i.test(url)) throw new Error('http 또는 https 주소만 등록할 수 있습니다.');

  const existing = listLinks_();
  if (existing.some(function(link) { return link.url.toLowerCase() === url.toLowerCase(); })) {
    throw new Error('이미 등록된 URL입니다.');
  }

  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LINKS_SHEET)
    .appendRow([id, department, title, url, description, registeredBy, createdAt]);
  return { id: id };
}

function listNotices_() {
  return readObjects_(NOTICES_SHEET)
    .map(function(row) {
      return {
        id: Number(row.id),
        title: String(row.title || ''),
        body: String(row.body || ''),
        level: ['info', 'important', 'urgent'].indexOf(String(row.level)) >= 0 ? String(row.level) : 'info',
        date: dateOnly_(row.date),
        expiresAt: row.expiresAt ? dateOnly_(row.expiresAt) : ''
      };
    })
    .filter(function(row) { return Number.isFinite(row.id) && row.title; })
    .sort(function(a, b) { return b.id - a.id; });
}

function addNotice_(body) {
  const title = clean_(body.title, 100);
  const content = clean_(body.body, 3000);
  const level = ['info', 'important', 'urgent'].indexOf(String(body.level)) >= 0
    ? String(body.level) : 'info';
  const expiresAt = clean_(body.expiresAt, 10);
  if (!title || !content) throw new Error('공지 제목과 내용을 입력하세요.');
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw new Error('만료일 형식이 올바르지 않습니다.');

  const notices = listNotices_();
  const id = notices.reduce(function(max, notice) { return Math.max(max, notice.id); }, 0) + 1;
  const date = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTICES_SHEET)
    .appendRow([id, title, content, level, date, expiresAt]);
  return { id: id };
}

function listFeatureRequests_() {
  return readObjects_(FEATURE_REQUESTS_SHEET)
    .map(function(row) {
      const requestType = ['new', 'improvement'].indexOf(String(row.requestType)) >= 0
        ? String(row.requestType) : 'new';
      const status = ['submitted', 'reviewing', 'planned', 'completed', 'declined']
        .indexOf(String(row.status)) >= 0 ? String(row.status) : 'submitted';
      return {
        id: String(row.id || ''),
        requestType: requestType,
        title: String(row.title || ''),
        content: String(row.content || ''),
        author: String(row.author || ''),
        createdAt: iso_(row.createdAt),
        status: status,
        adminReply: String(row.adminReply || ''),
        updatedAt: row.updatedAt ? iso_(row.updatedAt) : ''
      };
    })
    .filter(function(row) { return row.id && row.title && row.author; })
    .sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function addFeatureRequest_(body) {
  const requestType = ['new', 'improvement'].indexOf(String(body.requestType)) >= 0
    ? String(body.requestType) : 'new';
  const title = clean_(body.title, 100);
  const content = clean_(body.content, 3000);
  const author = clean_(body.author, 30);
  if (!title || !content) throw new Error('요청 제목과 내용을 입력하세요.');
  if (author.length < 2) throw new Error('작성자 실명을 두 글자 이상 입력하세요.');

  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEATURE_REQUESTS_SHEET)
    .appendRow([id, requestType, title, content, author, createdAt, 'submitted', '', '']);
  return { id: id };
}

function updateFeatureRequest_(body) {
  const id = clean_(body.id, 100);
  const allowedStatuses = ['submitted', 'reviewing', 'planned', 'completed', 'declined'];
  const status = String(body.status || '');
  const adminReply = clean_(body.adminReply, 1000);
  if (!id) throw new Error('처리할 요청 ID가 없습니다.');
  if (allowedStatuses.indexOf(status) < 0) throw new Error('처리 상태가 올바르지 않습니다.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEATURE_REQUESTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idIndex = headers.indexOf('id');
  const statusIndex = headers.indexOf('status');
  const replyIndex = headers.indexOf('adminReply');
  const updatedIndex = headers.indexOf('updatedAt');
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][idIndex]) === id) {
      sheet.getRange(row + 1, statusIndex + 1).setValue(status);
      sheet.getRange(row + 1, replyIndex + 1).setValue(adminReply);
      sheet.getRange(row + 1, updatedIndex + 1).setValue(new Date().toISOString());
      return { id: id };
    }
  }
  throw new Error('처리할 요청을 찾을 수 없습니다.');
}

function getTimetable_() {
  const metaRows = readObjects_(TIMETABLE_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const teachers = readObjects_(TIMETABLE_SHEET)
    .map(function(row) {
      const slots = [];
      for (let slot = 1; slot <= TIMETABLE_SLOT_COUNT; slot++) {
        slots.push({
          value: String(row['slot' + slot] || ''),
          locked: row['locked' + slot] === true || String(row['locked' + slot]).toUpperCase() === 'TRUE'
        });
      }
      return {
        name: String(row.teacherName || ''),
        label: String(row.teacherLabel || ''),
        load: String(row.load || ''),
        slots: slots
      };
    })
    .filter(function(teacher) { return teacher.name; });

  return {
    version: Number(meta.version) || 1,
    title: String(meta.title || ''),
    sourceFileName: String(meta.sourceFileName || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    teachers: teachers
  };
}

function replaceTimetable_(body) {
  const timetable = body.timetable || {};
  const teachers = Array.isArray(timetable.teachers) ? timetable.teachers : [];
  if (!teachers.length) throw new Error('업로드할 교사 시간표가 없습니다.');
  if (teachers.length > 120) throw new Error('교사 수는 120명을 초과할 수 없습니다.');

  const title = clean_(timetable.title, 100) || '주간시간표';
  const sourceFileName = clean_(timetable.sourceFileName, 200);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();
  const existing = readObjects_(TIMETABLE_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const rows = teachers.map(function(teacher) {
    const name = clean_(teacher.name, 30);
    const label = clean_(teacher.label, 50) || name;
    const load = clean_(teacher.load, 20);
    const slots = Array.isArray(teacher.slots) ? teacher.slots : [];
    if (!name) throw new Error('교사 이름이 없는 행이 있습니다.');
    if (slots.length !== TIMETABLE_SLOT_COUNT) throw new Error(name + ' 교사의 시간표가 35칸이 아닙니다.');

    const row = [name, label, load];
    slots.forEach(function(slot) { row.push(clean_(slot && slot.value, 200)); });
    slots.forEach(function(slot) { row.push(Boolean(slot && slot.locked)); });
    return row;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = book.getSheetByName(TIMETABLE_SHEET);
    const metaSheet = book.getSheetByName(TIMETABLE_META_SHEET);
    if (dataSheet.getLastRow() > 1) {
      dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, dataSheet.getLastColumn()).clearContent();
    }
    dataSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

    if (metaSheet.getLastRow() > 1) {
      metaSheet.getRange(2, 1, metaSheet.getLastRow() - 1, metaSheet.getLastColumn()).clearContent();
    }
    metaSheet.getRange(2, 1, 1, 6)
      .setValues([[version, title, sourceFileName, uploadedBy, uploadedAt, rows.length]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function getStudentTimetable_() {
  const metaRows = readObjects_(STUDENT_TIMETABLE_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const students = readObjects_(STUDENT_TIMETABLE_SHEET)
    .map(function(row) {
      try {
        return JSON.parse(String(row.payloadJson || ''));
      } catch (error) {
        return null;
      }
    })
    .filter(function(student) {
      return student && student.student && student.student.studentId;
    });

  return {
    version: Number(meta.version) || 1,
    title: String(meta.title || ''),
    semester: String(meta.semester || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    studentCount: students.length,
    classCount: Number(meta.classCount) || 0,
    courseCount: Number(meta.courseCount) || 0,
    students: students
  };
}

function replaceStudentTimetable_(body) {
  const timetable = body.timetable || {};
  const students = Array.isArray(timetable.students) ? timetable.students : [];
  if (!students.length) throw new Error('업로드할 학생 시간표가 없습니다.');
  if (students.length > 1500) throw new Error('학생 수는 1,500명을 초과할 수 없습니다.');

  const title = clean_(timetable.title, 100) || '학생별 시간표';
  const semester = clean_(timetable.semester, 30);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();
  const existing = readObjects_(STUDENT_TIMETABLE_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const seen = {};
  const rows = students.map(function(item) {
    const normalized = normalizeStudentTimetable_(item);
    const student = normalized.student;
    if (seen[student.studentId]) throw new Error('중복 학번이 있습니다: ' + student.studentId);
    seen[student.studentId] = true;
    const payloadJson = JSON.stringify(normalized);
    if (payloadJson.length > 45000) {
      throw new Error(student.studentId + ' 학생의 시간표 데이터가 너무 큽니다.');
    }
    return [
      student.studentId,
      student.name,
      student.grade,
      student.className,
      student.number,
      student.enrollmentCount,
      payloadJson
    ];
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = book.getSheetByName(STUDENT_TIMETABLE_SHEET);
    const metaSheet = book.getSheetByName(STUDENT_TIMETABLE_META_SHEET);
    if (dataSheet.getLastRow() > 1) {
      dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, dataSheet.getLastColumn()).clearContent();
    }
    dataSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

    if (metaSheet.getLastRow() > 1) {
      metaSheet.getRange(2, 1, metaSheet.getLastRow() - 1, metaSheet.getLastColumn()).clearContent();
    }
    metaSheet.getRange(2, 1, 1, 8).setValues([[
      version,
      title,
      semester,
      uploadedBy,
      uploadedAt,
      rows.length,
      Math.max(0, Number(timetable.classCount) || 0),
      Math.max(0, Number(timetable.courseCount) || 0)
    ]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function normalizeStudentTimetable_(item) {
  const sourceStudent = item && item.student ? item.student : {};
  const studentId = clean_(sourceStudent.studentId, 12);
  const name = clean_(sourceStudent.name, 30);
  if (!/^\d{4,12}$/.test(studentId)) throw new Error('학번 형식이 올바르지 않습니다.');
  if (!name) throw new Error(studentId + ' 학생의 이름이 없습니다.');

  const grade = clean_(sourceStudent.grade, 2);
  const className = clean_(sourceStudent.className, 3);
  const number = clean_(sourceStudent.number, 3);
  const classLabel = clean_(sourceStudent.classLabel, 8) || grade + '-' + className;
  const sourceSlots = item && item.slots && typeof item.slots === 'object' ? item.slots : {};
  const days = ['월', '화', '수', '목', '금'];
  const slots = {};
  days.forEach(function(day) {
    for (let period = 1; period <= 7; period++) {
      const key = day + period;
      const slot = sourceSlots[key] || {};
      slots[key] = {
        day: day,
        period: period,
        subject: clean_(slot.subject, 120),
        teacher: clean_(slot.teacher, 100),
        classroom: clean_(slot.classroom, 50),
        raw: '',
        selectedCourse: Boolean(slot.selectedCourse),
        group: clean_(slot.group, 20)
      };
    }
  });

  const sourceSelections = Array.isArray(item && item.selections) ? item.selections : [];
  const selections = sourceSelections.slice(0, 40).map(function(selection) {
    const times = Array.isArray(selection.times) ? selection.times : [];
    return {
      grade: clean_(selection.grade, 2),
      group: clean_(selection.group, 20),
      times: times.slice(0, 10).map(function(time) { return clean_(time, 10); }),
      courseName: clean_(selection.courseName, 120),
      teacher: clean_(selection.teacher, 100),
      classroom: clean_(selection.classroom, 50),
      sourceFile: ''
    };
  });

  return {
    student: {
      studentId: studentId,
      name: name,
      grade: grade,
      className: className,
      classLabel: classLabel,
      number: number,
      enrollmentCount: Math.max(0, Number(sourceStudent.enrollmentCount) || 0)
    },
    slots: slots,
    selections: selections,
    warnings: []
  };
}

function getStaffRoster_() {
  const metaRows = readObjects_(STAFF_ROSTER_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const members = readObjects_(STAFF_ROSTER_SHEET)
    .map(function(row) {
      return {
        id: String(row.id || ''),
        name: String(row.name || ''),
        position: String(row.position || ''),
        department: String(row.department || ''),
        subject: String(row.subject || ''),
        homeroom: normalizeStaffHomeroom_(row.homeroom)
      };
    })
    .filter(function(member) { return member.id && member.name; })
    .sort(compareStaffMembers_);
  return {
    version: Number(meta.version) || 1,
    sourceFileName: String(meta.sourceFileName || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    members: members
  };
}

function replaceStaffRoster_(body) {
  const source = Array.isArray(body.members) ? body.members : [];
  if (!source.length) throw new Error('저장할 교원 명렬이 없습니다.');
  if (source.length > 200) throw new Error('교원 명렬은 200명을 초과할 수 없습니다.');
  const seenNames = {};
  const rows = source.map(function(member) {
    const name = clean_(member && member.name, 30);
    const position = clean_(member && member.position, 30) || '교사';
    const department = clean_(member && member.department, 50);
    const subject = clean_(member && member.subject, 50);
    const homeroom = clean_(member && member.homeroom, 30);
    if (!name) throw new Error('성명이 비어 있는 교원이 있습니다.');
    if (seenNames[name]) throw new Error('교원 명렬에 같은 이름이 두 번 있습니다: ' + name);
    seenNames[name] = true;
    return [
      clean_(member && member.id, 100) || Utilities.getUuid(),
      name,
      position,
      department,
      subject,
      homeroom
    ];
  });
  rows.sort(function(a, b) {
    return compareStaffMembers_(
      { name: a[1], position: a[2] },
      { name: b[1], position: b[2] }
    );
  });

  const existing = readObjects_(STAFF_ROSTER_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const sourceFileName = clean_(body.sourceFileName, 200);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_ROSTER_SHEET)
      .getRange('F:F').setNumberFormat('@');
    replaceSheetRows_(STAFF_ROSTER_SHEET, rows);
    replaceSheetRows_(STAFF_ROSTER_META_SHEET, [[
      version, sourceFileName, uploadedBy, uploadedAt, rows.length
    ]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function compareStaffMembers_(a, b) {
  function rank_(position) {
    const value = String(position || '').replace(/\s/g, '');
    if (value === '교장') return 0;
    if (value === '교감') return 1;
    if (value.indexOf('교사') >= 0) return 2;
    if (value === '교무실무원') return 3;
    return 4;
  }
  const rank = rank_(a.position) - rank_(b.position);
  return rank || String(a.name || '').localeCompare(String(b.name || ''), 'ko');
}

function getStudentRoster_() {
  const metaRows = readObjects_(STUDENT_ROSTER_META_SHEET);
  if (!metaRows.length) return null;
  const meta = metaRows[0];
  const students = readObjects_(STUDENT_ROSTER_SHEET)
    .map(function(row) {
      return {
        studentId: String(row.studentId || ''),
        name: String(row.name || ''),
        gender: String(row.gender || ''),
        // 구버전 앱과의 응답 호환을 위해 빈 값만 돌려주며 공유 시트에는 저장하지 않는다.
        remark: '',
        grade: String(row.grade || ''),
        className: String(row.className || ''),
        number: String(row.number || ''),
        homeroomTeacher: String(row.homeroomTeacher || ''),
        assistantTeacher: String(row.assistantTeacher || '')
      };
    })
    .filter(function(student) { return student.studentId && student.name; })
    .sort(function(a, b) { return a.studentId.localeCompare(b.studentId); });
  return {
    version: Number(meta.version) || 1,
    sourceFileName: String(meta.sourceFileName || ''),
    uploadedBy: String(meta.uploadedBy || ''),
    uploadedAt: iso_(meta.uploadedAt),
    students: students
  };
}

function replaceStudentRoster_(body) {
  const source = Array.isArray(body.students) ? body.students : [];
  if (!source.length) throw new Error('저장할 학생 명렬이 없습니다.');
  if (source.length > 2000) throw new Error('학생 명렬은 2,000명을 초과할 수 없습니다.');
  const seen = {};
  const rows = source.map(function(student) {
    const studentId = clean_(student && student.studentId, 12);
    const name = clean_(student && student.name, 30);
    if (!/^\d{4,12}$/.test(studentId)) throw new Error('학번 형식이 올바르지 않습니다: ' + studentId);
    if (!name) throw new Error(studentId + ' 학생의 이름이 없습니다.');
    if (seen[studentId]) throw new Error('중복 학번이 있습니다: ' + studentId);
    seen[studentId] = true;
    const grade = clean_(student && student.grade, 2) || studentId.slice(0, 1);
    const className = clean_(student && student.className, 3) ||
      String(Number(studentId.length === 4 ? studentId.slice(1, 2) : studentId.slice(1, 3)));
    const number = clean_(student && student.number, 3) ||
      String(Number(studentId.length === 4 ? studentId.slice(2) : studentId.slice(3)));
    return [
      studentId,
      name,
      clean_(student && student.gender, 10),
      '',
      grade,
      className,
      number,
      clean_(student && student.homeroomTeacher, 30),
      clean_(student && student.assistantTeacher, 30)
    ];
  });
  rows.sort(function(a, b) { return String(a[0]).localeCompare(String(b[0])); });

  const existing = readObjects_(STUDENT_ROSTER_META_SHEET);
  const version = (existing.length ? Number(existing[0].version) || 0 : 0) + 1;
  const sourceFileName = clean_(body.sourceFileName, 200);
  const uploadedBy = clean_(body.uploadedBy, 30) || '관리자';
  const uploadedAt = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    replaceSheetRows_(STUDENT_ROSTER_SHEET, rows);
    replaceSheetRows_(STUDENT_ROSTER_META_SHEET, [[
      version, sourceFileName, uploadedBy, uploadedAt, rows.length
    ]]);
  } finally {
    lock.releaseLock();
  }
  return { version: version, uploadedAt: uploadedAt };
}

function listStaffChecklists_(body) {
  const viewerName = clean_(body.viewerName, 30);
  if (!viewerName) throw new Error('환경설정에서 본인 이름을 입력하세요.');
  const admin = isAdminPassword_(body.adminPassword);
  const responses = readObjects_(STAFF_CHECKLIST_RESPONSES_SHEET);
  const responsesByChecklist = {};
  responses.forEach(function(response) {
    const checklistId = String(response.checklistId || '');
    if (!checklistId) return;
    if (!responsesByChecklist[checklistId]) responsesByChecklist[checklistId] = [];
    responsesByChecklist[checklistId].push(response);
  });
  return readObjects_(STAFF_CHECKLISTS_SHEET)
    .map(function(row) {
      const items = parseJsonArray_(row.itemsJson);
      const targetNames = parseJsonArray_(row.targetNamesJson).map(String);
      const canManage = admin || String(row.creatorName || '') === viewerName;
      const visible = canManage || targetNames.indexOf(viewerName) >= 0;
      if (!visible) return null;
      const checklistResponses = (responsesByChecklist[String(row.id || '')] || [])
        .filter(function(response) { return canManage || String(response.teacherName || '') === viewerName; })
        .map(function(response) {
          return {
            teacherName: String(response.teacherName || ''),
            checkedItemIds: parseJsonArray_(response.checkedItemIdsJson).map(String),
            memo: String(response.memo || ''),
            updatedAt: iso_(response.updatedAt)
          };
        });
      return {
        id: String(row.id || ''),
        title: String(row.title || ''),
        description: String(row.description || ''),
        deadline: dateOnly_(row.deadline),
        creatorName: String(row.creatorName || ''),
        createdAt: iso_(row.createdAt),
        closed: toBooleanValue_(row.closed),
        startDate: dateOnly_(row.startDate) || dateOnly_(row.createdAt),
        priority: ['low', 'normal', 'high'].indexOf(String(row.priority || '')) >= 0
          ? String(row.priority) : 'normal',
        status: ['planned', 'in_progress', 'completed', 'hold'].indexOf(String(row.status || '')) >= 0
          ? String(row.status) : (toBooleanValue_(row.closed) ? 'completed' : 'in_progress'),
        linkUrl: String(row.linkUrl || ''),
        departmentNames: parseJsonArray_(row.departmentNamesJson).map(String),
        updatedAt: iso_(row.updatedAt || row.createdAt),
        items: items,
        targetNames: targetNames,
        responses: checklistResponses,
        canManage: canManage
      };
    })
    .filter(function(item) { return item && item.id && item.title; })
    .sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function addStaffChecklist_(body) {
  const requestId = clean_(body.requestId, 100);
  const creatorName = clean_(body.creatorName, 30);
  const title = clean_(body.title, 100);
  const description = clean_(body.description, 1000);
  const deadline = clean_(body.deadline, 10);
  const startDate = clean_(body.startDate, 10) || new Date().toISOString().slice(0, 10);
  const priority = ['low', 'normal', 'high'].indexOf(String(body.priority || '')) >= 0
    ? String(body.priority) : 'normal';
  const status = ['planned', 'in_progress', 'completed', 'hold'].indexOf(String(body.status || '')) >= 0
    ? String(body.status) : 'in_progress';
  const linkUrl = clean_(body.linkUrl, 500);
  const departmentNames = uniqueStrings_(
    Array.isArray(body.departmentNames) ? body.departmentNames : [], 40, 30
  );
  const sourceItems = Array.isArray(body.items) ? body.items : [];
  const sourceTargets = Array.isArray(body.targetNames) ? body.targetNames : [];
  if (!creatorName || !title) throw new Error('작성자와 제목을 입력하세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('시작일 형식이 올바르지 않습니다.');
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('마감일 형식이 올바르지 않습니다.');
  if (deadline && deadline < startDate) throw new Error('마감일은 시작일보다 빠를 수 없습니다.');
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new Error('관련 링크는 http 또는 https 주소로 입력하세요.');

  const roster = getStaffRoster_();
  if (!roster || !roster.members.some(function(member) { return member.name === creatorName; })) {
    throw new Error('환경설정의 이름이 등록된 교원 명렬과 일치하지 않습니다.');
  }
  const allowedNames = {};
  roster.members.forEach(function(member) { allowedNames[member.name] = true; });
  const targetNames = uniqueStrings_(sourceTargets, 30, 200)
    .filter(function(name) { return allowedNames[name]; });
  if (!targetNames.length) throw new Error('배부 대상 교원을 한 명 이상 선택하세요.');
  const itemLabels = uniqueStrings_(sourceItems, 200, 30);
  if (!itemLabels.length) throw new Error('확인 항목을 한 개 이상 입력하세요.');
  const items = itemLabels.map(function(label) {
    return { id: Utilities.getUuid(), label: label };
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (requestId) {
      const existingRequest = findObjectByValue_(STAFF_CHECKLISTS_SHEET, 'requestId', requestId);
      if (existingRequest && existingRequest.id) return { id: String(existingRequest.id), duplicatePrevented: true };
    }
    const id = Utilities.getUuid();
    const createdAt = new Date().toISOString();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_CHECKLISTS_SHEET).appendRow([
      id, title, description, deadline, creatorName, createdAt, status === 'completed',
      JSON.stringify(items), JSON.stringify(targetNames), startDate, priority, status,
      linkUrl, JSON.stringify(departmentNames), createdAt, requestId
    ]);
    touchSyncResource_('staffChecklists');
    return { id: id };
  } finally {
    lock.releaseLock();
  }
}

function updateStaffChecklist_(body) {
  const checklistId = clean_(body.checklistId, 100);
  const viewerName = clean_(body.viewerName, 30);
  const checklist = findObjectByValue_(STAFF_CHECKLISTS_SHEET, 'id', checklistId);
  if (!checklist) throw new Error('수정할 업무를 찾지 못했습니다.');
  if (String(checklist.creatorName || '') !== viewerName && !isAdminPassword_(body.adminPassword)) {
    throw new Error('작성자 또는 관리자만 업무를 수정할 수 있습니다.');
  }

  const title = clean_(body.title, 100);
  const description = clean_(body.description, 1000);
  const startDate = clean_(body.startDate, 10);
  const deadline = clean_(body.deadline, 10);
  const priority = ['low', 'normal', 'high'].indexOf(String(body.priority || '')) >= 0
    ? String(body.priority) : 'normal';
  const status = ['planned', 'in_progress', 'completed', 'hold'].indexOf(String(body.status || '')) >= 0
    ? String(body.status) : 'in_progress';
  const linkUrl = clean_(body.linkUrl, 500);
  if (!title) throw new Error('업무 제목을 입력하세요.');
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('시작일 형식이 올바르지 않습니다.');
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('마감일 형식이 올바르지 않습니다.');
  if (startDate && deadline && deadline < startDate) throw new Error('마감일은 시작일보다 빠를 수 없습니다.');
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new Error('관련 링크는 http 또는 https 주소로 입력하세요.');

  const roster = getStaffRoster_();
  const allowedNames = {};
  (roster && roster.members || []).forEach(function(member) { allowedNames[member.name] = true; });
  const targetNames = uniqueStrings_(Array.isArray(body.targetNames) ? body.targetNames : [], 30, 200)
    .filter(function(name) { return allowedNames[name]; });
  if (!targetNames.length) throw new Error('배부 대상 교원을 한 명 이상 선택하세요.');
  const sourceItems = Array.isArray(body.items) ? body.items : [];
  const previousItems = parseJsonArray_(checklist.itemsJson);
  const previousByLabel = {};
  previousItems.forEach(function(item) { if (item && item.label) previousByLabel[String(item.label)] = String(item.id); });
  const items = uniqueStrings_(sourceItems, 200, 30).map(function(label) {
    return { id: previousByLabel[label] || Utilities.getUuid(), label: label };
  });
  if (!items.length) throw new Error('확인 항목을 한 개 이상 입력하세요.');
  const departmentNames = uniqueStrings_(
    Array.isArray(body.departmentNames) ? body.departmentNames : [], 40, 30
  );
  const updatedAt = new Date().toISOString();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_CHECKLISTS_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][0]) !== checklistId) continue;
    sheet.getRange(row + 1, 2, 1, 14).setValues([[
      title, description, deadline, String(checklist.creatorName || ''), iso_(checklist.createdAt),
      status === 'completed', JSON.stringify(items), JSON.stringify(targetNames),
      startDate, priority, status, linkUrl, JSON.stringify(departmentNames), updatedAt
    ]]);
    touchSyncResource_('staffChecklists');
    return { updatedAt: updatedAt };
  }
  throw new Error('수정할 업무 행을 찾지 못했습니다.');
}

function submitStaffChecklist_(body) {
  const checklistId = clean_(body.checklistId, 100);
  const teacherName = clean_(body.teacherName, 30);
  const memo = clean_(body.memo, 300);
  if (!checklistId || !teacherName) throw new Error('체크리스트와 교사 이름을 확인하세요.');
  const checklist = findObjectByValue_(STAFF_CHECKLISTS_SHEET, 'id', checklistId);
  if (!checklist) throw new Error('체크리스트를 찾지 못했습니다.');
  if (toBooleanValue_(checklist.closed)) throw new Error('마감된 체크리스트입니다.');
  const targetNames = parseJsonArray_(checklist.targetNamesJson).map(String);
  if (targetNames.indexOf(teacherName) < 0) throw new Error('이 체크리스트의 배부 대상이 아닙니다.');
  const itemIds = {};
  parseJsonArray_(checklist.itemsJson).forEach(function(item) {
    if (item && item.id) itemIds[String(item.id)] = true;
  });
  const checkedItemIds = uniqueStrings_(
    Array.isArray(body.checkedItemIds) ? body.checkedItemIds : [],
    100,
    30
  ).filter(function(id) { return itemIds[id]; });
  const updatedAt = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_CHECKLIST_RESPONSES_SHEET);
    const values = sheet.getDataRange().getValues();
    for (let row = 1; row < values.length; row++) {
      if (String(values[row][0]) === checklistId && String(values[row][1]) === teacherName) {
        sheet.getRange(row + 1, 3, 1, 3).setValues([[
          JSON.stringify(checkedItemIds), memo, updatedAt
        ]]);
        touchSyncResource_('staffChecklists');
        return { updatedAt: updatedAt };
      }
    }
    sheet.appendRow([checklistId, teacherName, JSON.stringify(checkedItemIds), memo, updatedAt]);
    touchSyncResource_('staffChecklists');
  } finally {
    lock.releaseLock();
  }
  return { updatedAt: updatedAt };
}

function deleteStaffChecklist_(body) {
  const checklistId = clean_(body.checklistId, 100);
  const viewerName = clean_(body.viewerName, 30);
  const checklist = findObjectByValue_(STAFF_CHECKLISTS_SHEET, 'id', checklistId);
  if (!checklist) throw new Error('삭제할 체크리스트를 찾지 못했습니다.');
  if (String(checklist.creatorName || '') !== viewerName && !isAdminPassword_(body.adminPassword)) {
    throw new Error('작성자 또는 관리자만 삭제할 수 있습니다.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    deleteRowsByValue_(STAFF_CHECKLIST_RESPONSES_SHEET, 'checklistId', checklistId);
    deleteRowsByValue_(STAFF_CHECKLISTS_SHEET, 'id', checklistId);
    touchSyncResource_('staffChecklists');
  } finally {
    lock.releaseLock();
  }
}

function normalizeCommitteeMembers_(values) {
  const source = Array.isArray(values) ? values : [];
  const seen = {};
  return source.slice(0, 100).map(function(member) {
    const name = clean_(member && member.name, 30);
    const role = clean_(member && member.role, 30) || '위원';
    const sourceType = String(member && member.source || '') === 'staff' ? 'staff' : 'direct';
    if (!name || seen[name]) return null;
    seen[name] = true;
    return { name: name, role: role, source: sourceType };
  }).filter(function(member) { return member; });
}

function normalizeCommitteeTime_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return String(value.getHours()).padStart(2, '0') + ':' +
      String(value.getMinutes()).padStart(2, '0');
  }
  const text = String(value == null ? '' : value).trim();
  const direct = text.match(/^(\d{1,2}):(\d{2})/);
  if (direct) return direct[1].padStart(2, '0') + ':' + direct[2];
  const embedded = text.match(/\b(\d{1,2}):(\d{2}):\d{2}\b/);
  return embedded ? embedded[1].padStart(2, '0') + ':' + embedded[2] : text;
}

function repairCommitteeTimeCells_(book) {
  const sheet = book.getSheetByName(COMMITTEE_EVENTS_SHEET);
  if (!sheet) return;
  sheet.getRange('F:G').setNumberFormat('@');
  if (sheet.getLastRow() < 2) return;
  const range = sheet.getRange(2, 6, sheet.getLastRow() - 1, 2);
  const values = range.getValues();
  let changed = false;
  values.forEach(function(row) {
    for (let index = 0; index < 2; index++) {
      const normalized = normalizeCommitteeTime_(row[index]);
      if (Object.prototype.toString.call(row[index]) === '[object Date]' || String(row[index] || '') !== normalized) {
        row[index] = normalized;
        changed = true;
      }
    }
  });
  if (changed) range.setValues(values);
}

function listCommitteeState_() {
  const assignments = readObjects_(COMMITTEE_MEMBERS_SHEET)
    .map(function(row) {
      return {
        committeeId: String(row.committeeId || ''),
        committeeName: String(row.committeeName || ''),
        members: normalizeCommitteeMembers_(parseJsonArray_(row.membersJson)),
        updatedBy: String(row.updatedBy || ''),
        updatedAt: iso_(row.updatedAt)
      };
    })
    .filter(function(item) { return item.committeeId && item.committeeName; })
    .sort(function(a, b) { return Number(a.committeeId) - Number(b.committeeId); });

  const events = readObjects_(COMMITTEE_EVENTS_SHEET)
    .map(function(row) {
      return {
        id: String(row.id || ''),
        committeeId: String(row.committeeId || ''),
        committeeName: String(row.committeeName || ''),
        title: String(row.title || ''),
        date: dateOnly_(row.date),
        startTime: normalizeCommitteeTime_(row.startTime),
        endTime: normalizeCommitteeTime_(row.endTime),
        location: String(row.location || ''),
        agenda: String(row.agenda || ''),
        memberNames: uniqueStrings_(parseJsonArray_(row.memberNamesJson), 30, 100),
        createdBy: String(row.createdBy || ''),
        createdAt: iso_(row.createdAt)
      };
    })
    .filter(function(item) {
      return item.id && item.committeeId && item.committeeName && item.date &&
        item.startTime && item.endTime;
    })
    .sort(function(a, b) {
      return (a.date + a.startTime).localeCompare(b.date + b.startTime);
    });

  return { assignments: assignments, events: events };
}

function saveCommitteeMembers_(body) {
  const committeeId = clean_(body.committeeId, 20);
  const committeeName = clean_(body.committeeName, 120);
  const members = normalizeCommitteeMembers_(body.members);
  const updatedBy = clean_(body.updatedBy, 30) || '사용자';
  if (!committeeId || !committeeName) throw new Error('위원회 정보를 확인해 주세요.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMMITTEE_MEMBERS_SHEET);
  const updatedAt = new Date().toISOString();
  const rowValues = [committeeId, committeeName, JSON.stringify(members), updatedBy, updatedAt];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const lastRow = sheet.getLastRow();
    let targetRow = 0;
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (let index = 0; index < ids.length; index++) {
        if (String(ids[index][0]) === committeeId) {
          targetRow = index + 2;
          break;
        }
      }
    }
    if (targetRow) sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    else sheet.appendRow(rowValues);
  } finally {
    lock.releaseLock();
  }
  return { updatedAt: updatedAt };
}

function addCommitteeEvent_(body) {
  const committeeId = clean_(body.committeeId, 20);
  const committeeName = clean_(body.committeeName, 120);
  const title = clean_(body.title, 120) || committeeName;
  const date = clean_(body.date, 10);
  const startTime = clean_(body.startTime, 5);
  const endTime = clean_(body.endTime, 5);
  const location = clean_(body.location, 100);
  const agenda = clean_(body.agenda, 1000);
  const memberNames = uniqueStrings_(body.memberNames, 30, 100);
  const createdBy = clean_(body.createdBy, 30) || '사용자';

  if (!committeeId || !committeeName) throw new Error('위원회를 선택해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('개최 날짜를 확인해 주세요.');
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
    throw new Error('시작·종료 시간을 확인해 주세요.');
  }
  if (!memberNames.length) throw new Error('위원회 명단을 먼저 등록해 주세요.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const conflicts = listCommitteeState_().events.filter(function(event) {
      if (event.date !== date || startTime >= event.endTime || event.startTime >= endTime) return false;
      return event.memberNames.some(function(name) { return memberNames.indexOf(name) >= 0; });
    });
    if (conflicts.length) {
      const conflict = conflicts[0];
      const overlapping = conflict.memberNames.filter(function(name) {
        return memberNames.indexOf(name) >= 0;
      });
      throw new Error(
        '같은 시간에 다른 위원회 일정이 겹칩니다: ' + conflict.committeeName +
        ' ' + conflict.startTime + '~' + conflict.endTime +
        ' (겹치는 위원: ' + overlapping.join(', ') + ')'
      );
    }

    const id = Utilities.getUuid();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMMITTEE_EVENTS_SHEET)
      .getRange('F:G').setNumberFormat('@');
    const createdAt = new Date().toISOString();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMMITTEE_EVENTS_SHEET).appendRow([
      id, committeeId, committeeName, title, date, startTime, endTime,
      location, agenda, JSON.stringify(memberNames), createdBy, createdAt
    ]);
    return {
      id: id,
      committeeId: committeeId,
      committeeName: committeeName,
      title: title,
      date: date,
      startTime: startTime,
      endTime: endTime,
      location: location,
      agenda: agenda,
      memberNames: memberNames,
      createdBy: createdBy,
      createdAt: createdAt
    };
  } finally {
    lock.releaseLock();
  }
}

function replaceSheetRows_(sheetName, rows) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function parseJsonArray_(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function uniqueStrings_(values, maxLength, maxCount) {
  const seen = {};
  const source = Array.isArray(values) ? values : [];
  return source.map(function(value) { return clean_(value, maxLength); })
    .filter(function(value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    })
    .slice(0, maxCount);
}

function findObjectByValue_(sheetName, header, value) {
  const rows = readObjects_(sheetName);
  for (let index = 0; index < rows.length; index++) {
    if (String(rows[index][header] || '') === value) return rows[index];
  }
  return null;
}

function deleteRowsByValue_(sheetName, header, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return;
  const column = values[0].map(String).indexOf(header);
  if (column < 0) return;
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][column]) === value) sheet.deleteRow(row + 1);
  }
}

function toBooleanValue_(value) {
  return value === true || String(value || '').toLowerCase() === 'true';
}

function getNeisSyncStatus_(body) {
  const properties = PropertiesService.getScriptProperties();
  const registeredDeviceId = properties.getProperty(NEIS_SYNC_DEVICE_ID_PROPERTY) || '';
  const deviceId = clean_(body && body.deviceId, 100);
  const meta = readObjects_(NEIS_SYNC_META_SHEET)[0] || {};
  return {
    registered: Boolean(registeredDeviceId),
    isThisDevice: Boolean(registeredDeviceId && deviceId && registeredDeviceId === deviceId),
    registeredAt: properties.getProperty(NEIS_SYNC_REGISTERED_AT_PROPERTY) || '',
    registeredBy: properties.getProperty(NEIS_SYNC_REGISTERED_BY_PROPERTY) || '',
    lastSyncedAt: iso_(meta.uploadedAt),
    fromDate: clean_(meta.fromDate, 8),
    toDate: clean_(meta.toDate, 8),
    version: Number(meta.version) || 0,
    lastStatus: clean_(meta.status, 20) || 'ready',
    lastError: clean_(meta.lastError, 500)
  };
}

function registerNeisSyncDevice_(body) {
  const deviceId = clean_(body.deviceId, 100);
  const registeredBy = clean_(body.registeredBy, 30) || '관리자';
  if (!/^[A-Za-z0-9-]{20,100}$/.test(deviceId)) throw new Error('동기화 PC 식별값이 올바르지 않습니다.');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(NEIS_SYNC_DEVICE_ID_PROPERTY, deviceId);
  properties.setProperty(NEIS_SYNC_TOKEN_HASH_PROPERTY, sha256_(token));
  properties.setProperty(NEIS_SYNC_REGISTERED_AT_PROPERTY, new Date().toISOString());
  properties.setProperty(NEIS_SYNC_REGISTERED_BY_PROPERTY, registeredBy);
  // 이전 Apps Script 직접 호출 방식의 API 키는 더 이상 서버에 보관하지 않습니다.
  properties.deleteProperty(NEIS_API_KEY_PROPERTY);
  return { token: token, status: getNeisSyncStatus_({ deviceId: deviceId }) };
}

function revokeNeisSyncDevice_() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(NEIS_SYNC_DEVICE_ID_PROPERTY);
  properties.deleteProperty(NEIS_SYNC_TOKEN_HASH_PROPERTY);
  properties.deleteProperty(NEIS_SYNC_REGISTERED_AT_PROPERTY);
  properties.deleteProperty(NEIS_SYNC_REGISTERED_BY_PROPERTY);
  properties.deleteProperty(NEIS_API_KEY_PROPERTY);
}

function requireNeisSyncDevice_(body) {
  const properties = PropertiesService.getScriptProperties();
  const expectedDeviceId = properties.getProperty(NEIS_SYNC_DEVICE_ID_PROPERTY) || '';
  const expectedTokenHash = properties.getProperty(NEIS_SYNC_TOKEN_HASH_PROPERTY) || '';
  const deviceId = clean_(body.deviceId, 100);
  const token = clean_(body.syncToken, 200);
  if (!expectedDeviceId || !expectedTokenHash) throw new Error('NEIS 동기화 PC가 아직 등록되지 않았습니다.');
  if (deviceId !== expectedDeviceId || !token || sha256_(token) !== expectedTokenHash) {
    throw new Error('등록된 NEIS 동기화 PC만 공용 자료를 올릴 수 있습니다.');
  }
}

function getNeisSnapshot_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const meta = readObjects_(NEIS_SYNC_META_SHEET)[0];
    if (!meta || !Number(meta.version)) return null;
    return {
      version: Number(meta.version) || 0,
      schoolName: clean_(meta.schoolName, 100) || '웅천고등학교',
      fromDate: clean_(meta.fromDate, 8),
      toDate: clean_(meta.toDate, 8),
      fetchedAt: iso_(meta.fetchedAt),
      uploadedAt: iso_(meta.uploadedAt),
      meals: readObjects_(NEIS_MEALS_SHEET).map(function(row) {
        let dishNames = [];
        try { dishNames = JSON.parse(String(row.dishNamesJson || '[]')); } catch (ignore) {}
        return {
          date: clean_(row.date, 8), mealType: clean_(row.mealType, 30), dishNames: dishNames,
          calories: clean_(row.calories, 100), ntrInfo: clean_(row.ntrInfo, 2000)
        };
      }),
      schedules: readObjects_(NEIS_SCHEDULE_SHEET).map(function(row) {
        return { date: clean_(row.date, 8), eventName: clean_(row.eventName, 300), eventLevel: clean_(row.eventLevel, 2000) };
      }),
      timetables: readObjects_(NEIS_CLASS_TIMETABLE_SHEET).map(function(row) {
        return {
          date: clean_(row.date, 8), grade: clean_(row.grade, 2), classNm: clean_(row.classNm, 10),
          period: Number(row.period) || 0, subject: clean_(row.subject, 200),
          teacher: clean_(row.teacher, 100), classroom: clean_(row.classroom, 100)
        };
      })
    };
  } finally {
    lock.releaseLock();
  }
}

function replaceSheetRows_(sheetName, rows) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const columnCount = sheet.getLastColumn();
  const oldCount = Math.max(0, sheet.getLastRow() - 1);
  if (oldCount) sheet.getRange(2, 1, oldCount, columnCount).clearContent();
  if (!rows.length) return;
  if (sheet.getMaxRows() < rows.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  sheet.getRange(2, 1, rows.length, columnCount).setValues(rows);
}

function replaceNeisSnapshot_(body) {
  requireNeisSyncDevice_(body);
  const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {};
  const fromDate = clean_(snapshot.fromDate, 8);
  const toDate = clean_(snapshot.toDate, 8);
  if (!/^\d{8}$/.test(fromDate) || !/^\d{8}$/.test(toDate) || fromDate > toDate) throw new Error('동기화 날짜 범위가 올바르지 않습니다.');
  const from = new Date(fromDate.slice(0, 4) + '-' + fromDate.slice(4, 6) + '-' + fromDate.slice(6, 8) + 'T00:00:00');
  const to = new Date(toDate.slice(0, 4) + '-' + toDate.slice(4, 6) + '-' + toDate.slice(6, 8) + 'T00:00:00');
  if ((to.getTime() - from.getTime()) / 86400000 > 9) throw new Error('공용 NEIS 자료는 오늘 포함 최대 10일치만 저장할 수 있습니다.');
  const meals = Array.isArray(snapshot.meals) ? snapshot.meals.slice(0, 100) : [];
  const schedules = Array.isArray(snapshot.schedules) ? snapshot.schedules.slice(0, 500) : [];
  const timetables = Array.isArray(snapshot.timetables) ? snapshot.timetables.slice(0, 5000) : [];
  const allowedResources = { meals: true, schedules: true, timetables: true };
  const requestedResources = Array.isArray(snapshot.updatedResources)
    ? snapshot.updatedResources.map(String).filter(function(name) { return allowedResources[name]; })
    : ['meals', 'schedules', 'timetables'];
  const updatedResources = requestedResources.filter(function(name, index) { return requestedResources.indexOf(name) === index; });
  if (!updatedResources.length) throw new Error('갱신할 NEIS 자료 항목이 없습니다. 기존 공용 자료를 유지합니다.');

  const mealRows = meals.map(function(item) {
    return [clean_(item.date, 8), clean_(item.mealType, 30), JSON.stringify(Array.isArray(item.dishNames) ? item.dishNames.slice(0, 100) : []), clean_(item.calories, 100), clean_(item.ntrInfo, 2000)];
  });
  const scheduleRows = schedules.map(function(item) {
    return [clean_(item.date, 8), clean_(item.eventName, 300), clean_(item.eventLevel, 2000)];
  });
  const timetableRows = timetables.map(function(item) {
    return [clean_(item.date, 8), clean_(item.grade, 2), clean_(item.classNm, 10), Number(item.period) || 0, clean_(item.subject, 200), clean_(item.teacher, 100), clean_(item.classroom, 100)];
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const previous = readObjects_(NEIS_SYNC_META_SHEET)[0] || {};
    const version = (Number(previous.version) || 0) + 1;
    const uploadedAt = new Date().toISOString();
    if (updatedResources.indexOf('meals') >= 0) replaceSheetRows_(NEIS_MEALS_SHEET, mealRows);
    if (updatedResources.indexOf('schedules') >= 0) replaceSheetRows_(NEIS_SCHEDULE_SHEET, scheduleRows);
    if (updatedResources.indexOf('timetables') >= 0) replaceSheetRows_(NEIS_CLASS_TIMETABLE_SHEET, timetableRows);
    const mealCount = readObjects_(NEIS_MEALS_SHEET).length;
    const scheduleCount = readObjects_(NEIS_SCHEDULE_SHEET).length;
    const timetableCount = readObjects_(NEIS_CLASS_TIMETABLE_SHEET).length;
    const partial = updatedResources.length < 3;
    replaceSheetRows_(NEIS_SYNC_META_SHEET, [[
      version, clean_(snapshot.schoolName, 100) || '웅천고등학교', fromDate, toDate,
      iso_(snapshot.fetchedAt) || uploadedAt, uploadedAt, clean_(body.deviceId, 100),
      mealCount, scheduleCount, timetableCount, partial ? 'partial' : 'success',
      partial ? clean_(snapshot.syncWarning, 500) : ''
    ]]);
    return getNeisSnapshotWithoutLock_();
  } finally {
    lock.releaseLock();
  }
}

function getNeisSnapshotWithoutLock_() {
  const meta = readObjects_(NEIS_SYNC_META_SHEET)[0] || {};
  return {
    version: Number(meta.version) || 0,
    schoolName: clean_(meta.schoolName, 100) || '웅천고등학교',
    fromDate: clean_(meta.fromDate, 8), toDate: clean_(meta.toDate, 8),
    fetchedAt: iso_(meta.fetchedAt), uploadedAt: iso_(meta.uploadedAt),
    meals: readObjects_(NEIS_MEALS_SHEET).map(function(row) {
      let names = []; try { names = JSON.parse(String(row.dishNamesJson || '[]')); } catch (ignore) {}
      return { date: clean_(row.date, 8), mealType: clean_(row.mealType, 30), dishNames: names, calories: clean_(row.calories, 100), ntrInfo: clean_(row.ntrInfo, 2000) };
    }),
    schedules: readObjects_(NEIS_SCHEDULE_SHEET).map(function(row) { return { date: clean_(row.date, 8), eventName: clean_(row.eventName, 300), eventLevel: clean_(row.eventLevel, 2000) }; }),
    timetables: readObjects_(NEIS_CLASS_TIMETABLE_SHEET).map(function(row) { return { date: clean_(row.date, 8), grade: clean_(row.grade, 2), classNm: clean_(row.classNm, 10), period: Number(row.period) || 0, subject: clean_(row.subject, 200), teacher: clean_(row.teacher, 100), classroom: clean_(row.classroom, 100) }; })
  };
}

function deleteRowById_(sheetName, id) {
  if (!id) throw new Error('삭제할 항목 ID가 없습니다.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][0]) === id) {
      sheet.deleteRow(row + 1);
      return;
    }
  }
  throw new Error('삭제할 항목을 찾을 수 없습니다.');
}

function timetableChangeObject_(row) {
  return {
    id: String(row.id || ''), kind: String(row.kind || ''), status: String(row.status || 'pending'),
    requesterName: String(row.requesterName || ''), targetTeacherName: String(row.targetTeacherName || ''),
    originalSlotIndex: Number(row.originalSlotIndex) || 0, replacementSlotIndex: Number(row.replacementSlotIndex) || 0,
    originalDate: dateOnly_(row.originalDate), replacementDate: dateOnly_(row.replacementDate),
    originalTeacher: String(row.originalTeacher || ''), replacementTeacher: String(row.replacementTeacher || ''),
    originalClass: normalizeTimetableChangeClass_(row.originalClass), replacementClass: normalizeTimetableChangeClass_(row.replacementClass),
    originalSubject: String(row.originalSubject || ''), replacementSubject: String(row.replacementSubject || ''),
    note: String(row.note || ''), createdAt: iso_(row.createdAt), respondedAt: iso_(row.respondedAt),
    responderName: String(row.responderName || ''), requesterAppliedAt: iso_(row.requesterAppliedAt)
  };
}

function listTimetableChanges_(body) {
  const viewer = clean_(body.viewerName, 30);
  if (!viewer) return [];
  const fromDate = clean_(body.fromDate, 10);
  const toDate = clean_(body.toDate, 10);
  const includeSchool = body.includeSchool === true;
  return readObjects_(TIMETABLE_CHANGES_SHEET).map(timetableChangeObject_).filter(function(item) {
    if (includeSchool) {
      if (item.status !== 'approved') return false;
    } else {
      if (item.requesterName !== viewer && item.targetTeacherName !== viewer && item.originalTeacher !== viewer && item.replacementTeacher !== viewer) return false;
    }
    const firstDate = item.originalDate < item.replacementDate ? item.originalDate : item.replacementDate;
    const lastDate = item.originalDate > item.replacementDate ? item.originalDate : item.replacementDate;
    if (fromDate && lastDate < fromDate) return false;
    if (toDate && firstDate > toDate) return false;
    return true;
  }).sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
}

function createTimetableChange_(body) {
  const entry = body.entry || {};
  const requester = clean_(body.requesterName, 30);
  const target = clean_(entry.replacementTeacher, 30);
  const kind = clean_(entry.kind, 20);
  if (!requester || !target) throw new Error('요청 교사와 상대 교사를 확인해 주세요.');
  if (clean_(entry.originalTeacher, 30) !== requester) throw new Error('본인 수업만 반영 요청을 보낼 수 있습니다.');
  if (requester === target) throw new Error('본인에게는 반영 요청을 보낼 수 없습니다.');
  if (kind !== 'exchange' && kind !== 'substitution') throw new Error('교환 또는 대강 항목만 반영할 수 있습니다.');
  const originalDate = clean_(entry.originalDate, 10);
  const replacementDate = clean_(entry.replacementDate, 10) || originalDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(originalDate) || !/^\d{4}-\d{2}-\d{2}$/.test(replacementDate)) throw new Error('반영 날짜를 확인해 주세요.');
  const now = new Date().toISOString();
  const row = [
    Utilities.getUuid(), kind, 'pending', requester, target,
    Math.max(0, Math.min(34, Number(entry.originalSlotIndex) || 0)),
    Math.max(0, Math.min(34, Number(entry.replacementSlotIndex) || 0)),
    originalDate, replacementDate, clean_(entry.originalTeacher, 30) || requester, target,
    clean_(entry.originalClass, 20), clean_(entry.replacementClass, 20),
    clean_(entry.originalSubject, 100), clean_(entry.replacementSubject, 100),
    clean_(entry.note, 200), now, '', '', now, ''
  ];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TIMETABLE_CHANGES_SHEET);
  sheet.getRange('L:M').setNumberFormat('@');
  sheet.appendRow(row);
  touchSyncResource_('timetableChanges');
  return timetableChangeObject_({
    id: row[0], kind: row[1], status: row[2], requesterName: row[3], targetTeacherName: row[4],
    originalSlotIndex: row[5], replacementSlotIndex: row[6], originalDate: row[7], replacementDate: row[8],
    originalTeacher: row[9], replacementTeacher: row[10], originalClass: row[11], replacementClass: row[12],
    originalSubject: row[13], replacementSubject: row[14], note: row[15], createdAt: row[16], respondedAt: '', responderName: '', requesterAppliedAt: ''
  });
}

function respondTimetableChange_(body) {
  const id = clean_(body.id, 100);
  const responder = clean_(body.responderName, 30);
  const requestedDecision = clean_(body.decision, 20);
  // v1.0.39 이하 앱의 rejected 요청도 보류로 처리해 이전 버전과 호환한다.
  const decision = requestedDecision === 'rejected' ? 'held' : requestedDecision;
  if (decision !== 'approved' && decision !== 'held') throw new Error('승인 또는 보류를 선택해 주세요.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TIMETABLE_CHANGES_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idColumn = headers.indexOf('id');
  const targetColumn = headers.indexOf('targetTeacherName');
  const statusColumn = headers.indexOf('status');
  const respondedColumn = headers.indexOf('respondedAt');
  const responderColumn = headers.indexOf('responderName');
  const updatedColumn = headers.indexOf('updatedAt');
  for (let index = 1; index < values.length; index++) {
    if (String(values[index][idColumn]) !== id) continue;
    if (String(values[index][targetColumn]) !== responder) throw new Error('상대 교사 본인만 응답할 수 있습니다.');
    const currentStatus = String(values[index][statusColumn]);
    if (['pending', 'held', 'rejected'].indexOf(currentStatus) < 0) throw new Error('이미 처리된 요청입니다.');
    if (decision === 'approved') {
      const candidate = {};
      headers.forEach(function(header, column) { candidate[header] = values[index][column]; });
      const item = timetableChangeObject_(candidate);
      const conflict = readObjects_(TIMETABLE_CHANGES_SHEET).map(timetableChangeObject_).some(function(other) {
        if (other.id === id || other.status !== 'approved') return false;
        const teacherConflict = [item.originalTeacher, item.replacementTeacher].some(function(name) {
          return name && [other.originalTeacher, other.replacementTeacher].indexOf(name) >= 0;
        });
        const dateSlotConflict = (item.originalDate === other.originalDate && item.originalSlotIndex === other.originalSlotIndex) ||
          (item.replacementDate === other.replacementDate && item.replacementSlotIndex === other.replacementSlotIndex);
        return teacherConflict && dateSlotConflict;
      });
      if (conflict) throw new Error('같은 날짜·교시에 이미 승인된 수업 변경이 있습니다.');
    }
    const now = new Date().toISOString();
    sheet.getRange(index + 1, statusColumn + 1).setValue(decision);
    sheet.getRange(index + 1, respondedColumn + 1).setValue(now);
    sheet.getRange(index + 1, responderColumn + 1).setValue(responder);
    sheet.getRange(index + 1, updatedColumn + 1).setValue(now);
    touchSyncResource_('timetableChanges');
    const changed = {};
    headers.forEach(function(header, column) { changed[header] = values[index][column]; });
    changed.status = decision; changed.respondedAt = now; changed.responderName = responder;
    return timetableChangeObject_(changed);
  }
  throw new Error('처리할 요청을 찾을 수 없습니다.');
}

function applyTimetableChangeForRequester_(body) {
  const id = clean_(body.id, 100);
  const requester = clean_(body.requesterName, 30);
  if (!id || !requester) throw new Error('나만 우선 반영할 요청과 교사 이름을 확인해 주세요.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TIMETABLE_CHANGES_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idColumn = headers.indexOf('id');
  const requesterColumn = headers.indexOf('requesterName');
  const statusColumn = headers.indexOf('status');
  const respondedColumn = headers.indexOf('respondedAt');
  const responderColumn = headers.indexOf('responderName');
  const updatedColumn = headers.indexOf('updatedAt');
  const requesterAppliedColumn = headers.indexOf('requesterAppliedAt');
  for (let index = 1; index < values.length; index++) {
    if (String(values[index][idColumn]) !== id) continue;
    if (String(values[index][requesterColumn]) !== requester) throw new Error('요청한 교사 본인만 나만 우선 반영할 수 있습니다.');
    const currentStatus = String(values[index][statusColumn]);
    if (['pending', 'held', 'rejected'].indexOf(currentStatus) < 0) throw new Error('나만 우선 반영할 수 없는 요청입니다.');
    if (requesterAppliedColumn < 0) throw new Error('공유 서비스 업데이트가 필요합니다. 관리자에게 문의해 주세요.');
    if (values[index][requesterAppliedColumn]) throw new Error('이미 나만 우선 반영된 요청입니다.');
    const now = new Date().toISOString();
    sheet.getRange(index + 1, requesterAppliedColumn + 1).setValue(now);
    sheet.getRange(index + 1, updatedColumn + 1).setValue(now);
    touchSyncResource_('timetableChanges');
    const changed = {};
    headers.forEach(function(header, column) { changed[header] = values[index][column]; });
    changed.requesterAppliedAt = now;
    return timetableChangeObject_(changed);
  }
  throw new Error('나만 우선 반영할 요청을 찾을 수 없습니다.');
}

function cancelTimetableChange_(body) {
  const id = clean_(body.id, 100);
  const requester = clean_(body.requesterName, 30);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TIMETABLE_CHANGES_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  for (let index = 1; index < values.length; index++) {
    if (String(values[index][headers.indexOf('id')]) !== id) continue;
    if (String(values[index][headers.indexOf('requesterName')]) !== requester) throw new Error('요청한 교사만 취소할 수 있습니다.');
    const status = String(values[index][headers.indexOf('status')]);
    if (['pending', 'held', 'rejected', 'approved'].indexOf(status) < 0) throw new Error('취소할 수 없는 요청입니다.');
    const now = new Date().toISOString();
    sheet.getRange(index + 1, headers.indexOf('status') + 1).setValue('cancelled');
    sheet.getRange(index + 1, headers.indexOf('updatedAt') + 1).setValue(now);
    touchSyncResource_('timetableChanges');
    return;
  }
  throw new Error('취소할 요청을 찾을 수 없습니다.');
}

function requireAdmin_(password) {
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_KEY);
  if (!stored) throw new Error('관리자 비밀번호가 아직 설정되지 않았습니다.');
  if (!password || sha256_(String(password)) !== stored) throw new Error('관리자 비밀번호가 올바르지 않습니다.');
}

function isAdminPassword_(password) {
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_KEY);
  return Boolean(stored && password && sha256_(String(password)) === stored);
}

function readObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function(row) {
    const item = {};
    headers.forEach(function(header, index) { item[header] = row[index]; });
    return item;
  });
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function iso_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? String(value || '') : date.toISOString();
}

function dateOnly_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!isNaN(date.getTime())) return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
