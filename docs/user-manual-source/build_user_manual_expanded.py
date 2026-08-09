from __future__ import annotations

from pathlib import Path

from PIL import Image as PILImage, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable, Frame, HRFlowable, Image, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

import build_user_manual as base


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent
SCREENSHOTS = SOURCE_DIR / "screenshots-safe"
OUTPUT = ROOT / "docs" / "웅천고_업무도우미_사용자설명서_v1.1.2.pdf"
LOGO = ROOT / "ungcheon-school-helper" / "src" / "assets" / "ungcheon-logo.png"

base.PROGRAM_VERSION = "1.1.2"
base.MANUAL_VERSION = "1.1.2-r1"
base.MANUAL_DATE = "2026년 8월 10일"
base.LOGO = LOGO

MENUS = base.MENUS
MENU_BY_ID = {item["id"]: item for item in MENUS}


SCREEN_MAIN = {
    "help": "01-사용매뉴얼-기본.png",
    "notifier": "02-업무알리미-기본.png",
    "dashboard": "03-대시보드-기본.png",
    "calendar": "04-캘린더-기본.png",
    "settings": "05-환경설정-기본.png",
    "staff_tasks": "06-업무센터-기본.png",
    "school_hub": "07-학교공유링크-기본.png",
    "timetable_swap": "08-교환대강-수업교환.png",
    "student_timetable": "09-학생별시간표-기본.png",
    "attendance_print": "10-출석부출력-학급출석부.png",
    "student_locator": "11-학생위치찾기-기본.png",
    "student_identity_audit": "12-학번이름교정기-기본.png",
    "staff_roster": "13-교직원명렬-기본.png",
    "committees": "14-각종위원회-기본.png",
    "feature_requests": "15-기능개선요청-기본.png",
    "transfer_score": "16-전보내신점수-기본.png",
    "grade_preview": "17-성적산출미리보기-기본.png",
    "estimated_split_score": "18-추정분할점수-기본.png",
    "curriculum": "19-교육과정편제표-기본.png",
    "form_center": "20-서식센터-기본.png",
    "teacher_tools": "21-교사용도구-기본.png",
    "excel_processor": "22-Excel전처리-기본.png",
    "recommended_subjects": "23-대학권장과목-기본.png",
    "payroll": "24-호봉획정-기본.png",
    "insa_analysis": "25-NEIS인사기록-기본.png",
    "pdf_extractor": "26-PDF텍스트추출-기본.png",
    "file_parser": "27-만능파일파서-기본.png",
}


DETAILS: dict[str, dict[str, list[str]]] = {
    "help": {
        "parts": ["공용 NEIS 자료: 급식·학사일정·학급시간표의 제공 방식을 확인합니다.", "업데이트 확인: 설치된 버전과 최신 배포 버전을 확인합니다.", "주제별 안내 카드: 로그인, 자료 저장, 인쇄와 오류 해결 방법을 펼쳐 봅니다."],
        "result": ["찾은 설명은 프로그램을 닫지 않고 같은 화면에서 다시 확인할 수 있습니다.", "새 기능은 업데이트 뒤 이 메뉴와 검색도우미에도 함께 반영됩니다."],
        "trouble": ["버튼이 열리지 않으면 인터넷 연결과 기본 브라우저 설정을 확인합니다.", "설명과 실제 화면이 다르면 업데이트 확인을 먼저 실행합니다."],
    },
    "notifier": {
        "parts": ["지금 확인: 기다리지 않고 즉시 학교 일정과 공지를 확인합니다.", "자동 확인 시작/중지: 정한 주기로 백그라운드 확인을 켜거나 끕니다.", "확인 간격과 소리: 너무 잦지 않게 업무 환경에 맞춰 조정합니다."],
        "result": ["새로 확인할 내용이 있으면 프로그램 알림과 소리로 알려줍니다.", "프로그램을 종료하면 자동 확인도 종료됩니다."],
        "trouble": ["알림이 안 뜨면 Windows 알림 설정에서 웅천고 업무도우미를 허용합니다.", "이 메뉴는 K-에듀파인 미결 공문을 직접 읽는 기능이 아닙니다."],
    },
    "dashboard": {
        "parts": ["왼쪽 2주 달력: 이번 주와 다음 주 일정을 크게 표시합니다.", "오른쪽 시간표: 선택한 날짜 또는 오늘의 교사 시간표를 표시합니다.", "달력 아래: 선택 일정과 기타 참고사항을 확인합니다.", "하단: 날씨, 급식, 업무 알림과 개인 메모를 확인합니다."],
        "result": ["날짜를 누르면 그날의 일정·시간표가 함께 바뀝니다.", "월간 캘린더 버튼은 캘린더 메뉴로 바로 이동합니다."],
        "trouble": ["시간표가 없으면 환경설정 이름과 공유 시간표의 교사 이름이 같은지 확인합니다.", "NEIS 학사일정은 기본 꺼짐이며 필요할 때만 켭니다."],
    },
    "calendar": {
        "parts": ["이전 달·다음 달·오늘: 보고 싶은 달로 이동합니다.", "일정 종류 체크: NEIS, 주간계획, 창체, 위원회, 지도, 개인 업무를 골라 표시합니다.", "날짜 칸: 해당 날짜의 일정 목록을 엽니다.", "업무 등록: 개인 업무를 날짜와 함께 저장합니다."],
        "result": ["개인 업무는 대시보드 2주 달력과 업무센터에도 표시됩니다.", "공유 원본이 갱신되면 새로고침 뒤 최신 일정으로 바뀝니다."],
        "trouble": ["처음 열었는데 비어 있으면 새로고침 후 잠시 기다립니다.", "여러 일정이 겹치면 상단 표시 항목을 하나씩 꺼서 확인합니다."],
    },
    "settings": {
        "parts": ["사용자 이름: 로그인과 개인별 일정·수업 판단 기준입니다.", "담당 학년·반: 대시보드의 학급 정보에 사용합니다.", "화면 테마: 밝은 모드 또는 다크 모드를 선택합니다.", "설정 저장: 입력한 값을 이 Windows 사용자에게 저장합니다."],
        "result": ["저장 후 대시보드로 돌아가면 변경된 이름·학급과 화면 설정이 반영됩니다.", "일반 사용자는 학교에서 동기화한 급식·학사일정·학급시간표를 별도 API 키 없이 조회합니다."],
        "trouble": ["이름은 교직원 명렬과 띄어쓰기까지 같게 입력합니다.", "공용 NEIS 자료가 비어 있으면 새로고침한 뒤 학교 담당자에게 동기화 상태를 확인합니다.", "학교 공유 URL은 일반 사용자가 수정하지 않습니다."],
    },
    "school_hub": {
        "parts": ["부서별 공유 링크: 부서 자료실과 업무 사이트를 등록·검색합니다.", "학교 공지: 학교 전체 공지와 업데이트 기록을 확인합니다.", "등록 영역: 제목, 부서, URL, 설명을 입력합니다."],
        "result": ["등록하면 별도 승인 없이 모든 사용자에게 바로 보입니다.", "링크를 누르면 기본 브라우저에서 해당 페이지가 열립니다."],
        "trouble": ["주소는 https://로 시작하는 전체 주소를 붙여넣습니다.", "학생 개인정보가 들어 있는 문서 링크는 공유 범위를 먼저 확인합니다.", "잘못 등록한 링크 삭제는 학교 담당자에게 요청합니다."],
    },
    "student_locator": {
        "parts": ["검색칸: 학번 4자리·5자리 또는 학생 이름을 입력합니다.", "동명이인 목록: 학번과 학급을 함께 보고 학생을 고릅니다.", "결과 카드: 현재 교시, 과목, 교실과 담당 교사를 표시합니다."],
        "result": ["1학년은 공용 학급시간표, 2·3학년은 개인 시간표와 공용 자료를 함께 사용해 찾습니다.", "승인된 교환·대강이 있으면 해당 날짜의 변경 시간표로 찾습니다.", "수업시간이 아니면 다음 수업 또는 수업 없음으로 안내합니다."],
        "trouble": ["학생이 없으면 학생 명렬과 공용 시간표가 최신인지 확인합니다.", "학번 앞 0이 빠졌다면 4자리와 5자리 두 방식으로 시도합니다."],
    },
    "student_identity_audit": {
        "parts": ["파일 선택·검사: Excel·한글·PDF에서 학번과 이름을 읽습니다.", "붙여넣은 내용 검사: 원본 표를 복사해 바로 검사합니다.", "결과 구분: 정상, 학번 불일치, 이름 불일치, 미등록, 동명이인을 나눕니다."],
        "result": ["틀린 조합만 화면에 모아 원본에서 수정할 수 있습니다.", "학번·이름이 같은 칸 또는 옆 칸에 있어도 찾습니다."],
        "trouble": ["스캔 PDF는 글자 자체가 이미지라 정확히 읽지 못할 수 있습니다.", "표 제목·설명까지 함께 붙여넣어도 되지만 결과는 원본과 다시 대조합니다."],
    },
    "staff_roster": {
        "parts": ["교직원 명렬: 직위, 부서, 교과와 담임을 조회합니다.", "명렬 내려받기: 현재 공유 명렬을 Excel로 저장합니다.", "연수등록부: 교원·교직원 범위, 연수명과 날짜를 정해 서명부를 만듭니다."],
        "result": ["교장·교감·교사·교무실무원·기타 교직원 순서로 표시되고, 같은 직군은 가나다순입니다.", "연수등록부 출력용 명단은 추가·삭제해도 공유 원본을 바꾸지 않습니다."],
        "trouble": ["담임 3-4가 날짜로 보이면 새로고침 후 최신 버전인지 확인합니다.", "출력 전에 왼쪽 열을 모두 채운 뒤 오른쪽 열로 이어지는 번호 순서를 확인합니다."],
    },
    "committees": {
        "parts": ["기준표·위원 명단: 경남교육청 고등학교 위원회 기준과 명단을 확인합니다.", "위원 선택: 교직원 명렬에서 누르거나 외부위원을 직접 입력합니다.", "위원회 캘린더: 개최 날짜, 시간, 장소를 등록합니다."],
        "result": ["위원으로 등록된 사용자의 대시보드와 캘린더에 일정이 표시됩니다.", "같은 위원이 같은 시간의 두 위원회에 들어가면 경고합니다."],
        "trouble": ["위원 이름은 교직원 명렬과 정확히 같아야 개인 달력에 표시됩니다.", "시간은 13:10-13:30처럼 해당 날짜의 시각만 입력합니다."],
    },
    "feature_requests": {
        "parts": ["요청 유형: 새 기능 또는 기능 개선을 선택합니다.", "제목·내용: 어떤 상황에서 무엇이 불편한지 적습니다.", "요청 목록: 접수·검토·반영 완료·반영 어려움 상태를 확인합니다."],
        "result": ["등록한 의견은 학교 담당자가 확인할 수 있습니다.", "업데이트가 되면 공지와 검색도우미 설명도 함께 정리됩니다."],
        "trouble": ["반드시 실명으로 작성합니다.", "학생 이름·학번·성적이나 외부 공개가 곤란한 화면은 올리지 않습니다."],
    },
    "transfer_score": {
        "parts": ["NEIS 파일 선택: 인사발령상황(전체) Excel을 읽습니다.", "근무 구간: 학교·지역·급지·휴직 기간을 확인합니다.", "직접 가산점: 표창, 자격, 우대조건 등 파일로 알 수 없는 값을 입력합니다.", "결과 인쇄·PDF: 항목별 계산 근거와 합계를 저장합니다."],
        "result": ["경력·휴직 내용을 월 단위로 정리하고 규정 점수로 환산합니다.", "중복 기간, 상한과 확인 필요 항목을 따로 표시합니다."],
        "trouble": ["NEIS - 인사기록 - 출력 - 인사발령상황(전체) - Excel data 순서로 받습니다.", "최종 점수는 공식 서류와 인사 담당자의 확인을 받아야 합니다."],
    },
    "grade_preview": {
        "parts": ["평가 항목 추가: 지필·수행평가 이름, 배점과 반영비율을 만듭니다.", "파일/붙여넣기: 학생 점수를 항목별로 연결합니다.", "성적 미리 계산하기: 환산점수, 석차등급과 성취도를 계산합니다.", "복원용 정리 Excel: 다음에 이어서 작업할 파일을 저장합니다."],
        "result": ["누락 점수, 배점 초과와 반영비율 합계 오류를 표시합니다.", "학생별 총점과 전체 분포를 인쇄·저장할 수 있습니다."],
        "trouble": ["성적 산출 미리보기와 추정분할점수 도우미는 서로 다른 메뉴입니다.", "NEIS 최종 산출 전 검토용이므로 공식 결과와 다시 비교합니다."],
    },
    "estimated_split_score": {
        "parts": ["시험 전 정답률 구성: 희망 분할점수에 맞는 문항 난이도와 정답률을 계산합니다.", "1·2차 시험: 실제 또는 가정 점수를 넣습니다.", "수행평가 추가: 개수, 배점, 반영비율과 분할점수를 입력합니다.", "목표 분포 역산: 원하는 성취도 분포에 필요한 분할점수를 찾습니다."],
        "result": ["선택형이 0점이면 선택형을 제외하고 서술형 정답률만 제시합니다.", "현재 분포와 목표 분포를 표·그래프로 비교합니다."],
        "trouble": ["배점과 반영비율 합계가 맞지 않으면 계산하지 않습니다.", "예측은 학생 집단과 실제 문항 특성에 따라 달라지는 참고값입니다."],
    },
    "curriculum": {
        "parts": ["전학년·1·2·3학년 탭: Excel의 네 편제표를 각각 표시합니다.", "크게 열기: 작은 글씨를 별도 큰 화면에서 확인합니다.", "PDF 저장·인쇄: 현재 선택한 시트를 출력합니다.", "과목선택 도우미: 원본 1학년·2학년 상담 웹도구를 엽니다."],
        "result": ["각 시트를 별도의 PDF로 출력할 수 있습니다.", "과목선택 상담 결과는 이 PC에 저장하고 인쇄할 수 있습니다."],
        "trouble": ["표가 잘리면 화면의 PDF 저장 버튼을 사용합니다.", "외부 과목선택 도우미가 안 열리면 인터넷 연결을 확인합니다."],
    },
    "form_center": {
        "parts": ["서식 선택: 연수등록부, 출석부, 계획서, 회의록, 안내문 등을 고릅니다.", "공통 정보: 학교명, 학년도, 부서와 작성자를 확인합니다.", "미리보기: 입력한 내용이 A4에 어떻게 들어가는지 확인합니다.", "출력 도구: 인쇄·PDF, Excel, 한글용 표 복사를 선택합니다."],
        "result": ["서식별 입력 내용은 현재 PC에 임시 저장됩니다.", "웅천고 양식이 추가되면 같은 메뉴에 새 서식으로 제공됩니다."],
        "trouble": ["한글용 표 복사는 한글 문서에서 붙여넣기 후 열 너비를 확인합니다.", "인쇄 전 날짜·부서·담당자와 붙임 목록을 다시 확인합니다."],
    },
    "teacher_tools": {
        "parts": ["명단 비교: 두 명단의 공통·추가·누락 항목을 찾습니다.", "날짜 계산: 주말·공휴일 제외, D-day와 학기 주차를 계산합니다.", "추첨·모둠: 제외 학생, 고정·분리 조건을 반영해 추첨합니다."],
        "result": ["결과는 복사하거나 Excel로 저장할 수 있습니다.", "공유 명렬 불러오기와 직접 붙여넣기를 모두 지원합니다."],
        "trouble": ["명단 비교 전 이름 앞뒤 공백과 학번 형식을 정리합니다.", "추첨 결과는 다시 실행하면 바뀌므로 필요한 경우 즉시 저장합니다."],
    },
    "excel_processor": {
        "parts": ["파일 놓기/선택: 정리할 원본 Excel을 엽니다.", "처리 옵션: 공백, 빈 행, 중복, 날짜와 열 정리를 선택합니다.", "미리보기: 실제 저장 전에 일부 결과를 확인합니다."],
        "result": ["원본을 덮어쓰지 않고 새 Excel 파일을 만듭니다.", "정리한 행·열 수와 경고를 결과에서 확인합니다."],
        "trouble": ["병합 셀과 수식이 많은 파일은 일부 모양이 달라질 수 있습니다.", "처리된 파일을 먼저 열어 확인한 뒤 업무 원본으로 사용합니다."],
    },
    "recommended_subjects": {
        "parts": ["정방향 검색: 대학·학과를 골라 권장과목을 봅니다.", "역방향 매칭: 학생이 선택한 과목으로 맞는 학과를 찾습니다.", "과목별 역검색: 특정 과목을 권장하는 대학을 찾습니다.", "비교: 여러 대학·학과의 권장과목을 나란히 봅니다."],
        "result": ["핵심과목과 권장과목, 대학별 유의사항을 상담에 활용합니다.", "검색 결과를 학생 과목선택 상담과 함께 확인합니다."],
        "trouble": ["대학 정보는 변경될 수 있으므로 지원 전 최신 모집요강을 확인합니다.", "과목명이 비슷하면 교육과정 편제표의 정식 과목명으로 다시 검색합니다."],
    },
    "payroll": {
        "parts": ["양식 다운로드/불러오기: 경력 입력 형식을 준비합니다.", "경력 추가: 기간, 경력 종류와 인정률을 입력합니다.", "참조표: 경력별 인정 기준을 확인합니다.", "호봉 계산·PDF 출력: 예상 결과와 계산 근거를 저장합니다."],
        "result": ["중복 기간을 제거하고 인정 경력을 년·월·일로 환산합니다.", "예상 초임 호봉과 경력별 반영 내역을 표시합니다."],
        "trouble": ["같은 기간이 두 번 들어가지 않았는지 확인합니다.", "공식 호봉은 증빙서류와 교육청 판단에 따라 달라질 수 있습니다."],
    },
    "insa_analysis": {
        "parts": ["파일 선택: NEIS 인사기록 PDF 또는 지원 파일을 엽니다.", "발령·경력 분석: 임용, 전보, 휴직과 복직 흐름을 정리합니다.", "법정연수 점검: 확인 가능한 연수 내역을 구분합니다."],
        "result": ["날짜순 인사 이력과 확인이 필요한 누락·중복을 보여줍니다.", "원본은 서버에 올리지 않고 이 PC에서 분석합니다."],
        "trouble": ["암호가 걸린 PDF는 암호를 해제한 사본으로 다시 시도합니다.", "스캔 PDF는 OCR 품질에 따라 일부 날짜·기관명이 틀릴 수 있습니다."],
    },
    "pdf_extractor": {
        "parts": ["PDF 선택: 여러 파일을 한 번에 고를 수 있습니다.", "OCR 설정: 스캔본일 때만 문자 인식을 사용합니다.", "저장 형식: TXT, Markdown, JSON 중 용도에 맞게 선택합니다."],
        "result": ["페이지별 텍스트를 추출하고 선택 형식으로 저장합니다.", "Markdown은 제목·표 구조를 최대한 유지하고 JSON은 좌표 정보를 포함합니다."],
        "trouble": ["OCR 사용에는 Java 설치가 필요할 수 있습니다.", "학생 개인정보 문서는 추출 결과도 개인정보 파일이므로 안전하게 보관합니다."],
    },
    "file_parser": {
        "parts": ["파일 선택/놓기: Excel·HWP·PDF 등 지원 파일을 엽니다.", "구조 보기: 시트, 표, 문단과 셀 형식을 확인합니다.", "결과 복사·저장: 필요한 데이터만 다른 작업에 사용합니다."],
        "result": ["파일 안의 표·텍스트 구조를 한 화면에서 확인할 수 있습니다.", "다른 메뉴에서 사용할 데이터 형태를 점검하는 데 활용합니다."],
        "trouble": ["복잡한 한글 개체와 스캔 이미지는 일부 구조를 읽지 못할 수 있습니다.", "변환 결과는 반드시 원본과 비교합니다."],
    },
}


def sanitize() -> dict[str, Path]:
    """Return repository-safe captures.

    These images already contain the requested student-only masking and numbered
    callouts. Keeping only the safe set in Git prevents raw student data from
    being published with the manual source.
    """
    results = {source.name: source for source in SCREENSHOTS.glob("*.png")}
    if not results:
        raise FileNotFoundError(f"설명서 화면 캡처가 없습니다: {SCREENSHOTS}")
    return results


def title(text: str, anchor: str, important: bool = False) -> list[Flowable]:
    return base.page_title(text, anchor, important)


def image_page(screens: dict[str, Path], heading: str, anchor: str, filename: str, caption: str,
               bullets: list[str], important: bool = False) -> list[Flowable]:
    flows: list[Flowable] = []
    flows += title(heading, anchor, important)
    flows += base.screenshot_flow(screens[filename], caption)
    flows += base.bullet_list(bullets, numbered=True)
    flows.append(PageBreak())
    return flows


def install_pages(screens: dict[str, Path]) -> list[Flowable]:
    flows: list[Flowable] = []
    flows += title("처음 설치하기 - 설치 파일 확인", "install_start")
    flows.append(base.p("컴퓨터 사용이 익숙하지 않아도 아래 화면 순서대로 진행하면 됩니다. 학교에서 안내한 공식 파일만 사용하세요."))
    flows += base.screenshot_flow(screens["00-설치-01-설치파일실행.png"], "① 다운로드 폴더에서 설치 파일 이름과 버전을 확인한 뒤 두 번 클릭")
    flows += base.bullet_list([
        "파일 이름이 UngcheonSchoolHelper-Setup-1.1.2.exe인지 확인합니다.",
        "파일을 한 번 선택한 뒤 두 번 빠르게 클릭합니다. 한 번만 클릭하면 실행되지 않습니다.",
        "학교에서 받은 파일과 이름·버전이 다르면 실행하지 말고 담당자에게 확인합니다.",
    ], numbered=True)
    flows.append(PageBreak())
    flows += title("처음 설치하기 - 파란색 Windows 보호 화면", "install_smartscreen")
    flows += base.screenshot_flow(screens["00-설치-02-Windows보호화면.png"], "② Windows의 PC 보호 화면에서 추가 정보를 누릅니다")
    flows.append(base.note_box("당황하지 마세요", ["전자서명되지 않은 새 학교 프로그램에서 나타날 수 있는 Windows 안내입니다.", "학교가 배포한 공식 파일인지 확인한 경우에만 다음 단계로 진행합니다.", "파일 출처가 불분명하면 실행하지 않습니다."], base.AMBER, base.AMBER_LIGHT))
    flows.append(PageBreak())
    flows += title("처음 설치하기 - 실행 허용", "install_run")
    flows += base.screenshot_flow(screens["00-설치-03-실행버튼.png"], "③ 추가 정보가 펼쳐지면 파일 이름을 다시 확인하고 실행을 누릅니다")
    flows += base.bullet_list([
        "앱 이름이 웅천고 업무도우미 설치 파일인지 확인합니다.",
        "실행 버튼을 누릅니다. 실행 안 함을 누르면 설치가 취소됩니다.",
        "Windows 버전에 따라 예/아니요 창이 한 번 더 나오면 학교 담당자의 안내에 따릅니다.",
    ], numbered=True)
    flows.append(PageBreak())
    flows += title("처음 설치하기 - 설치 옵션과 완료", "install_finish")
    flows += base.screenshot_flow(screens["00-설치-04-설치옵션.png"], "④ 학교 PC에서는 전용(내 Windows 이름)을 선택하고 다음을 누릅니다")
    flows += base.screenshot_flow(screens["00-설치-05-설치완료.png"], "⑤ 설치 완료 뒤 실행을 선택하고 마침을 누릅니다", width=400)
    flows.append(base.note_box("설치가 안 될 때", ["관리자 암호를 요구하면 임의로 다른 암호를 입력하지 말고 학교 전산 담당자에게 문의합니다.", "이미 설치되어 있다는 문구가 나오면 기존 버전을 종료한 뒤 다시 실행합니다.", "설치가 끝나면 바탕 화면 또는 시작 메뉴의 웅천고 업무도우미를 실행합니다."], base.RED, base.RED_LIGHT))
    flows.append(PageBreak())
    return flows


def staff_tasks_pages(screens: dict[str, Path]) -> list[Flowable]:
    f: list[Flowable] = []
    f += image_page(screens, "업무센터", "menu_staff_tasks", "06-업무센터-기본.png",
                    "업무센터 기본 화면 - ① 자동 분류 ② 보기 탭 ③ 공유 업무 배부",
                    ["상단 숫자 카드에서 새 업무·오늘 마감·마감 임박·기한 초과를 확인합니다.", "내 업무, 내가 만든 업무, 부서 업무, 개인 업무 중 필요한 보기를 누릅니다.", "처리한 업무는 완료 체크하고 배부자는 대상별 완료 현황을 확인합니다."], True)
    f += image_page(screens, "업무센터 - 내 업무", "menu_staff_tasks_mine", "06-업무센터-내업무.png",
                    "나에게 배부된 전체·부서·개별 업무를 보는 화면",
                    ["업무 제목을 눌러 안내, 마감일, 링크와 세부 체크 항목을 읽습니다.", "업무를 마칠 때 세부 항목을 먼저 확인한 뒤 완료로 바꿉니다.", "미완료 업무는 자동으로 마감 상태 카드에 분류됩니다."])
    f += image_page(screens, "업무센터 - 내가 만든 업무", "menu_staff_tasks_created", "06-업무센터-내가만든업무.png",
                    "내가 배부한 업무와 대상별 완료 현황을 확인하는 화면",
                    ["배부한 업무를 선택해 전체 대상자와 완료 인원을 확인합니다.", "미완료자를 확인해 필요한 경우 별도로 안내합니다.", "내용이나 마감일을 수정하면 대상자의 화면에도 반영됩니다."])
    f += image_page(screens, "업무센터 - 부서 업무와 개인 업무", "menu_staff_tasks_types", "06-업무센터-부서업무.png",
                    "부서 업무 보기 - 부서 버튼으로 필요한 부서만 골라 봅니다",
                    ["부서 업무는 해당 부서 구성원에게 함께 보이는 업무입니다.", "개인 업무는 본인 PC에서만 보는 할 일이며 캘린더와 대시보드에도 나타납니다.", "공유가 필요한 업무를 개인 업무로 등록하지 않도록 종류를 먼저 확인합니다."])
    f += image_page(screens, "업무센터 - 공유 업무 배부", "menu_staff_tasks_assign", "06-업무센터-공유업무배부.png",
                    "공유 업무 배부 창 - ① 업무 내용 ② 마감과 체크 항목 ③ 배부 대상",
                    ["제목은 짧고 분명하게, 설명에는 해야 할 일과 제출 위치를 적습니다.", "시작일·마감일, 우선순위, 관련 링크와 세부 체크 항목을 입력합니다.", "전체·부서·개별 교직원 중 대상을 확인하고 마지막에 배부합니다."])
    f += title("업무센터 - 상태 읽는 법과 문제 해결", "menu_staff_tasks_status")
    f.append(base.note_box("자동 분류 기준", ["새로 배부된 업무: 이 PC에서 아직 열지 않은 공유 업무", "오늘 마감: 마감일이 오늘이고 아직 완료하지 않은 업무", "마감 임박: 마감일까지 3일 이내인 업무", "기한 초과: 마감일이 지났지만 완료하지 않은 업무", "내가 배부한 진행 업무: 내가 만든 업무 중 아직 전원이 완료하지 않은 업무"], base.VIOLET, base.VIOLET_LIGHT))
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("처음 사용하는 교사에게 권하는 순서", ["출근 후 대시보드 알림 숫자를 확인합니다.", "업무센터의 내 업무에서 새 업무를 엽니다.", "안내와 체크 항목을 모두 읽고 처리합니다.", "완료 체크를 남깁니다. 잘못 체크했다면 다시 눌러 해제합니다."], base.TEAL, base.TEAL_LIGHT))
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("잘 안 될 때", ["업무가 안 보이면 새로고침하고 로그인 이름이 맞는지 확인합니다.", "부서 업무가 안 보이면 교직원 명렬의 부서 정보와 현재 로그인 이름을 확인합니다.", "공유 업무 설명에는 학생 개인정보를 넣지 않습니다."], base.RED, base.RED_LIGHT))
    f.append(base.back_link()); f.append(PageBreak())
    return f


def timetable_pages(screens: dict[str, Path]) -> list[Flowable]:
    f: list[Flowable] = []
    f += image_page(screens, "교환·대강 계획", "menu_timetable_swap", "08-교환대강-수업교환.png",
                    "수업 교환 탭 - ① 기능 탭 ② 교사 선택 ③ 주간 수업 칸",
                    ["상단 교사 선택에서 본인 이름과 시간표가 맞는지 확인합니다.", "수업 교환 탭을 누르고 이동하려는 수업 칸을 누릅니다.", "교환 제한 표시가 있는 칸은 교환 대상에서 제외됩니다."], True)
    f += image_page(screens, "교환·대강 - 교환 후보 확인", "menu_timetable_swap_candidates", "08-교환대강-교환후보표시.png",
                    "수업을 선택하면 이동 가능한 칸 안에 상대 교사와 수업 정보가 표시됩니다",
                    ["선택한 수업은 초록색으로 표시됩니다.", "노란 후보 칸에는 상대 교사 이름과 그 시간의 수업 정보가 표시됩니다.", "후보 칸 또는 아래 교환 후보 카드를 눌러 예상 시간표를 엽니다."])
    f += image_page(screens, "교환·대강 - 상대 교사 예상 시간표", "menu_timetable_swap_preview", "08-교환대강-교환예상시간표.png",
                    "후보 클릭 뒤 변경 전·후 시간표와 연강 경고를 확인하는 화면",
                    ["왼쪽 변경 전과 오른쪽 변경 후를 한 칸씩 비교합니다.", "보라색으로 바뀐 칸과 새 연강 경고를 확인합니다.", "상대 교사에게 무리가 없는 후보일 때만 계획서에 추가를 누릅니다."])
    f += image_page(screens, "교환·대강 - 대강 교사 찾기 탭", "menu_timetable_swap_substitute", "08-교환대강-대강교사실제후보.png",
                    "대강 교사 찾기 - 교환 제한 수업도 대강 대상으로 선택할 수 있습니다",
                    ["대강 교사 찾기 탭을 누릅니다.", "대강이 필요한 수업을 누르면 그 시간에 공강인 교사가 표시됩니다.", "후보를 눌러 대강이 추가된 뒤의 시간표와 연강을 확인합니다."])
    f += title("교환·대강 - 교환과 대강의 차이", "menu_timetable_swap_difference")
    rows = [[base.p("구분", "H3Ko"), base.p("수업 교환", "H3Ko"), base.p("대강", "H3Ko")],
            [base.p("의미"), base.p("두 교사가 서로 수업 시간을 바꿉니다."), base.p("원 교사의 수업을 공강 교사가 대신 진행합니다.")],
            [base.p("후보"), base.p("서로 공강이고 같은 학급 수업 조건을 만족하는 교사"), base.p("해당 시간에 공강인 교사")],
            [base.p("확인"), base.p("두 수업 이동과 양쪽 연강"), base.p("대강 교사의 추가 수업과 연강")],
            [base.p("계획서"), base.p("교환으로 추가"), base.p("대강으로 추가")]]
    table = Table(rows, colWidths=[80, 215, 215])
    table.setStyle(TableStyle([("GRID", (0,0), (-1,-1), .5, base.LINE), ("BACKGROUND", (0,0), (-1,0), base.AMBER_LIGHT), ("VALIGN", (0,0), (-1,-1), "TOP"), ("PADDING", (0,0), (-1,-1), 8)]))
    f.append(table)
    f.append(Spacer(1, 6 * mm))
    f.append(base.note_box("대강 후보를 고를 때", ["같은 날 총 수업 수와 연강 길이를 확인합니다.", "담임·업무·회의 일정이 겹치지 않는지 캘린더도 확인합니다.", "확정 전 상대 교사와 학교의 공식 절차를 따릅니다."], base.TEAL, base.TEAL_LIGHT))
    f.append(PageBreak())
    f += image_page(screens, "교환·대강 - 계획서 편집", "menu_timetable_swap_plan", "08-교환대강-계획서편집.png",
                    "계획서 편집 탭 - ① 기본 정보 ② 행별 직접 수정 ③ 저장·미리보기",
                    ["사유, 시작일·종료일, 작성 교사와 작성일을 확인합니다.", "구분·날짜·요일·교시·학반·과목·교사를 모든 칸에서 직접 고칠 수 있습니다.", "잘못 추가한 행은 휴지통, 모두 지우려면 전체 삭제를 사용합니다."])
    f += image_page(screens, "교환·대강 - 계획서 미리보기와 출력", "menu_timetable_swap_print", "08-교환대강-계획서미리보기.png",
                    "교환·보강 계획서 A4 미리보기 - HWP 저장 또는 출력/PDF 선택",
                    ["양식 미리보기·출력을 누릅니다.", "제목, 사유, 기간과 각 행이 학교 양식 칸에 맞는지 확인합니다.", "수정이 필요하면 닫고 편집표에서 고친 뒤 다시 미리보기를 엽니다.", "HWP 저장 또는 출력/PDF를 선택합니다."])
    f += image_page(screens, "교환·대강 - 자동 반영 요청 경고", "menu_timetable_swap_apply", "08-교환대강-반영요청경고.png",
                    "계획서 행의 보내기 버튼을 누를 때 확인하는 경고 화면",
                    ["이름·날짜·교시·학급과 상대 교사를 다시 확인합니다.", "반영 요청을 누르면 상대 교사에게 승인 알림이 전송됩니다.", "이 기록은 편의 기능이며 NEIS 원본과 학교 공유 기본 시간표는 바뀌지 않습니다."])
    f += image_page(screens, "교환·대강 - 상대 교사 승인·보류", "menu_timetable_swap_approval", "08-교환대강-상대교사승인알림.png",
                    "상대 교사의 수업변경 알림 - 보류 또는 승인·반영 선택",
                    ["상대 교사는 상단 수업변경 알림을 열어 요약을 읽습니다.", "바로 결정하기 어렵다면 보류를 누릅니다. 보류한 요청은 나중에 다시 승인할 수 있습니다.", "승인·반영하면 해당 날짜에 한해 양쪽 교사·학급 시간표와 캘린더에 반영됩니다."])
    f += title("교환·대강 - 승인 뒤 확인과 반영 해제", "menu_timetable_swap_history")
    f.append(base.note_box("승인 뒤 표시되는 곳", ["요청 교사와 상대 교사의 캘린더", "해당 날짜의 교사 시간표", "해당 날짜의 학급 시간표", "학생 위치 찾기의 현재 수업 결과", "교환·대강 계획의 반영 요청·처리 내역"], base.VIOLET, base.VIOLET_LIGHT))
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("취소·반영 해제", ["요청자가 반영 요청·처리 내역에서 취소·반영 해제를 누릅니다.", "승인 전 요청은 취소되고 승인된 요청은 날짜별 변경 기록도 해제됩니다.", "상대 교사와 학급에 변경 사실을 별도로 안내합니다.", "학교의 공식 시간표와 NEIS 처리는 별도로 확인합니다."], base.RED, base.RED_LIGHT))
    f.append(base.back_link()); f.append(PageBreak())
    return f


def student_timetable_pages(screens: dict[str, Path]) -> list[Flowable]:
    f: list[Flowable] = []
    f += image_page(screens, "학생별 시간표", "menu_student_timetable", "09-학생별시간표-기본.png",
                    "학생별 시간표 기본 화면 - 학년·반, 검색, 학생 목록과 출력 버튼",
                    ["학년과 반을 고르거나 학번·이름을 검색합니다.", "동명이인은 학번과 학급을 함께 확인합니다.", "학생을 누르면 학급 수업과 선택과목을 합친 시간표가 표시됩니다."], True)
    f += image_page(screens, "학생별 시간표 - 학생 상세 화면", "menu_student_timetable_detail", "09-학생별시간표-학생선택결과.png",
                    "학생 선택 결과 - ① 학생 목록 ② 과목·교실·담당 교사가 있는 시간표 ③ 인쇄",
                    ["요일과 교시를 따라 과목을 확인합니다.", "이동수업은 선택과목명, 교실과 담당 교사를 함께 확인합니다.", "빈 칸과 자료 누락 안내가 있는지 확인합니다."])
    f += title("학생별 시간표 - 한 명 인쇄", "menu_student_timetable_single")
    f += base.bullet_list(["학생을 정확히 선택합니다.", "이 학생 인쇄를 누릅니다.", "미리보기의 학생 이름·학번과 모든 요일을 확인합니다.", "프린터를 선택하거나 PDF로 저장을 선택합니다.", "용지는 A4, 배율은 페이지에 맞춤으로 확인합니다."], numbered=True)
    f.append(Spacer(1, 5 * mm))
    f.append(base.note_box("PDF로 저장하는 방법", ["인쇄 창의 프린터 목록에서 Microsoft Print to PDF 또는 PDF로 저장을 선택합니다.", "저장 위치와 파일 이름을 정한 뒤 저장합니다.", "저장된 PDF를 열어 한 페이지에 잘 들어갔는지 확인합니다."], base.TEAL, base.TEAL_LIGHT))
    f.append(PageBreak())
    f += title("학생별 시간표 - 학급 전체 인쇄", "menu_student_timetable_class")
    f += base.bullet_list(["학년과 반을 먼저 선택합니다.", "화면 왼쪽 학생 수가 실제 학급 인원과 같은지 확인합니다.", "학급 전체 인쇄를 누릅니다.", "학생마다 한 페이지씩 연속 미리보기 되는지 확인합니다.", "필요한 페이지만 선택하거나 전체를 인쇄합니다."], numbered=True)
    f.append(Spacer(1, 5 * mm))
    f.append(base.note_box("잘 안 될 때", ["학생이 없으면 새로고침 후 잠시 기다립니다.", "선택과목이 비어 있으면 학생별 시간표의 공유 원본이 최신인지 학교 담당자에게 확인합니다.", "사용자는 원본 Excel을 따로 넣거나 내려받지 않습니다.", "출력물은 학생 개인정보이므로 외부 공유와 보관에 주의합니다."], base.RED, base.RED_LIGHT))
    f.append(base.back_link()); f.append(PageBreak())
    return f


def attendance_pages(screens: dict[str, Path]) -> list[Flowable]:
    f: list[Flowable] = []
    f += image_page(screens, "출석부 출력", "menu_attendance_print", "10-출석부-학급.png",
                    "학급 출석부 - ① 학년·반과 제목·날짜 ② 명단 ③ 인쇄/PDF",
                    ["학급 출석부 탭을 누릅니다.", "학년과 반을 고르고 제목·날짜를 확인합니다.", "오른쪽 명단의 인원과 번호를 확인한 뒤 전용 인쇄 버튼을 누릅니다."], True)
    f += title("출석부 출력 - 학급 출석부 한 장 맞추기", "menu_attendance_class")
    f += base.bullet_list(["학급 인원이 맞는지 확인합니다.", "학급 출석부 인쇄·PDF 저장을 누릅니다.", "A4 세로, 여백 기본, 페이지에 맞춤을 확인합니다.", "미리보기에서 마지막 학생까지 한 페이지 안에 있는지 확인합니다.", "PDF 저장 또는 인쇄를 진행합니다."], numbered=True)
    f.append(base.note_box("중요", ["브라우저 메뉴의 인쇄가 아니라 화면의 전용 인쇄 버튼을 사용합니다.", "학생 수가 많아도 글자와 행 높이를 자동 조정해 한 페이지에 맞춥니다.", "출석부에는 개인정보가 있으므로 업무 후 안전하게 보관·폐기합니다."], base.AMBER, base.AMBER_LIGHT))
    f.append(PageBreak())
    f += image_page(screens, "출석부 출력 - 수업 출석부 한 강좌", "menu_attendance_course", "10-출석부-수업-한강좌.png",
                    "수업 출석부의 한 강좌 보기 - 과목·교실 하나를 골라 출력",
                    ["수업 출석부 탭을 누릅니다.", "출력 기준에서 한 강좌를 선택합니다.", "담당 교사와 과목·교실을 고릅니다.", "연결된 학생 수와 실제 과목선택 인원을 비교하고 출력합니다."])
    f += image_page(screens, "출석부 출력 - 교사별 전체", "menu_attendance_teacher", "10-출석부-수업-교사별전체.png",
                    "교사별 전체 - 선택한 교사가 담당하는 모든 강좌를 묶어서 출력",
                    ["출력 기준에서 교사별 전체를 누릅니다.", "담당 교사를 선택합니다.", "묶음 출력 목록에 담당 강좌가 모두 나타나는지 확인합니다.", "출석부 인쇄 또는 Excel 내려받기를 누릅니다."])
    f += title("출석부 출력 - 과목별 전체", "menu_attendance_subject")
    f += base.bullet_list(["수업 출석부 탭에서 과목별 전체를 누릅니다.", "과목 목록에서 원하는 과목을 선택합니다.", "같은 과목의 모든 분반·교실이 묶음 목록에 나타나는지 확인합니다.", "인쇄는 강좌마다 한 페이지씩, Excel은 강좌별 시트 또는 구분으로 저장됩니다."], numbered=True)
    f.append(Spacer(1, 5 * mm))
    f.append(base.note_box("예시", ["교사별 전체: 정승원 교사를 선택하면 그 교사가 담당하는 모든 수업 출석부를 연속 출력합니다.", "과목별 전체: 경제 수학을 선택하면 담당 교사·교실이 다른 모든 경제 수학 분반을 출력합니다.", "한 강좌: 경제 수학 306처럼 특정 강좌 한 부만 출력합니다."], base.VIOLET, base.VIOLET_LIGHT))
    f.append(PageBreak())
    f += title("출석부 출력 - Excel 저장과 문제 해결", "menu_attendance_help")
    f.append(base.note_box("Excel 내려받기", ["수업 출석부에서 출력 기준과 교사·과목을 먼저 선택합니다.", "Excel 내려받기를 누르고 저장 위치를 정합니다.", "파일을 열어 강좌명, 날짜, 학생 수와 번호를 확인합니다.", "원본 공유 학생 명렬을 내려받는 기능은 제공하지 않습니다."], base.TEAL, base.TEAL_LIGHT))
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("명단이 안 나올 때", ["학생별 시간표 메뉴에서 해당 학생과 선택과목이 보이는지 확인합니다.", "출석부 출력에서 새로고침을 누릅니다.", "한 강좌의 과목·교실과 학생별 시간표의 과목·교실 이름이 연결되는지 확인합니다.", "계속 비어 있으면 학교 담당자에게 공유 시간표 갱신을 요청합니다."], base.RED, base.RED_LIGHT))
    f.append(base.back_link()); f.append(PageBreak())
    return f


def regular_pages(screens: dict[str, Path], menu: dict) -> list[Flowable]:
    guide = DETAILS[menu["id"]]
    f: list[Flowable] = []
    f += title(menu["title"], f"menu_{menu['id']}")
    f.append(base.p(menu["summary"]))
    f += base.screenshot_flow(screens[SCREEN_MAIN[menu["id"]]], f"{menu['title']} 실제 기본 화면")
    f.append(base.p("<b>화면에서 먼저 볼 곳</b>", "H2Ko"))
    f += base.bullet_list(guide["parts"])
    f.append(PageBreak())
    f += title(f"{menu['title']} - 따라 하기", f"menu_{menu['id']}_steps")
    f.append(base.p("아래 순서대로 한 단계씩 진행하고, 각 단계가 화면에 반영됐는지 확인한 뒤 다음으로 넘어갑니다."))
    f += base.bullet_list(menu.get("steps", []), numbered=True)
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("작업 결과 확인", guide["result"], base.TEAL, base.TEAL_LIGHT))
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("잘 안 될 때", guide["trouble"], base.RED, base.RED_LIGHT))
    f.append(Spacer(1, 3 * mm)); f.append(base.back_link()); f.append(PageBreak())
    return f


def story(screens: dict[str, Path]) -> list[Flowable]:
    f: list[Flowable] = []
    f.append(Spacer(1, 20 * mm))
    if LOGO.exists():
        logo = Image(str(LOGO), width=38 * mm, height=38 * mm); logo.hAlign = "CENTER"; f.append(logo)
    f.append(Spacer(1, 8 * mm))
    f.append(base.AnchoredParagraph("웅천고 업무도우미<br/>초보자용 상세 사용자 설명서", base.styles["CoverTitleKo"], "cover", 0))
    f.append(Spacer(1, 7 * mm))
    f.append(base.p("프로그램 버전 <b>v1.1.2</b><br/>설명서 제작 버전 <b>v1.1.2-r1</b> (첫 배포 상세판)<br/>2026년 8월 10일", "CoverSubKo"))
    f.append(Spacer(1, 14 * mm))
    f.append(base.note_box("이 설명서는", ["컴퓨터 사용이 익숙하지 않은 교직원도 화면을 보며 따라 할 수 있게 작성했습니다.", "설치부터 로그인, 검색, 입력, 저장, 인쇄와 오류 해결을 순서대로 설명합니다.", "★는 업무센터·교환/대강·학생별 시간표·출석부 출력 네 기능에만 표시합니다.", "화면 예시에서는 학생 이름과 학번만 흐림 처리했습니다. 교사 이름은 실제 사용 흐름을 보여주기 위해 그대로 표시합니다."], base.AMBER, base.AMBER_LIGHT))
    f.append(Spacer(1, 12 * mm)); f.append(base.p("창원시 웅천고등학교", "CenterKo")); f.append(PageBreak())

    f += install_pages(screens)

    f += title("첫 실행과 로그인", "first_login")
    f += base.bullet_list(["바탕 화면 또는 시작 메뉴에서 웅천고 업무도우미를 실행합니다.", "로그인 화면이 나오면 본인 이름을 키보드로 직접 입력합니다. 이름 목록에서 검색하는 방식이 아닙니다.", "교직원 명렬에 등록된 이름과 같으면 로그인됩니다.", "화면의 ‘시범운영 뒤 비밀번호 생성예정입니다’ 문구를 확인합니다.", "한 번 로그인하면 10시간 동안 다시 입력하지 않아도 됩니다.", "로그인 뒤에는 항상 대시보드에서 시작합니다."], numbered=True)
    f.append(base.note_box("로그인이 안 될 때", ["이름의 띄어쓰기와 철자를 교직원 명렬과 똑같이 입력합니다.", "명렬에 아직 등록되지 않았다면 학교 담당자에게 등록을 요청합니다.", "다른 교직원의 이름으로 로그인하지 않습니다."], base.RED, base.RED_LIGHT))
    f.append(PageBreak())

    f += title("전체 메뉴 간결 설명", "menu_overview")
    f.append(base.p("메뉴 이름을 누르면 상세 설명으로 이동합니다. ★는 네 가지 중요 기능에만 표시합니다."))
    rows = [[base.p("메뉴", "H3Ko"), base.p("무엇을 하는 기능인가", "H3Ko")]]
    for menu in MENUS:
        star = "★ " if menu.get("critical") else ""
        rows.append([Paragraph(f"<link href='#menu_{menu['id']}' color='#6D45E8'><b>{star}{menu['title']}</b></link>", base.styles["LinkKo"]), base.p(menu["summary"], "SmallKo")])
    table = Table(rows, colWidths=[145, 365], repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), base.AMBER_LIGHT), ("GRID", (0,0), (-1,-1), .4, base.LINE), ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4)]))
    f.append(table); f.append(PageBreak())

    f += title("검색도우미 - 메뉴 이름을 몰라도 찾기", "search_assistant")
    search = screens.get("01-dashboard-검색도우미.png")
    if search and search.exists(): f += base.screenshot_flow(search, "상단 업무 검색 또는 Ctrl+K로 여는 검색도우미")
    f += base.bullet_list(["키보드에서 Ctrl과 K를 함께 누릅니다.", "평소 말하듯 하려는 일을 입력합니다. 예: ‘내 수업 출석부 출력하고 싶어’. ", "검색 결과의 관련 메뉴와 단계별 안내를 읽습니다.", "바로가기를 누르면 해당 메뉴로 이동합니다.", "원하는 답이 없으면 ‘출석부’, ‘학생 위치’, ‘교환’, ‘연수등록부’처럼 핵심 단어를 넣어 다시 검색합니다."], numbered=True)
    f.append(base.note_box("검색 예시", ["내 수업 출석부 출력", "교환 가능한 선생님 찾기", "개인 업무 달력에 등록", "학생이 지금 어느 교실인지 찾기", "급식이나 학사일정이 안 보일 때", "연수등록부 출력"], base.VIOLET, base.VIOLET_LIGHT)); f.append(PageBreak())

    f += staff_tasks_pages(screens)
    f += timetable_pages(screens)
    f += student_timetable_pages(screens)
    f += attendance_pages(screens)

    for menu in MENUS:
        if menu.get("critical"):
            continue
        f += regular_pages(screens, menu)

    f += title("개인정보와 자료 저장", "privacy")
    f.append(base.note_box("학교 공유 자료", ["학생·교직원 명렬, 시간표, 공유 업무, 위원회 일정과 학교 링크는 학교 구성원이 함께 사용합니다.", "필요한 범위에서만 조회·출력하고 외부에 공유하지 않습니다.", "프로그램을 종료하면 빠른 조회용 임시 캐시는 삭제됩니다."], base.AMBER, base.AMBER_LIGHT))
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("현재 PC에만 저장", ["개인 메모, 개인 업무, 일부 서식 작성 내용과 상담 결과는 현재 Windows 사용자에게만 저장됩니다.", "같은 Windows 계정을 여러 사람이 쓰는 PC에는 민감한 내용을 기록하지 않습니다.", "일반 사용자는 NEIS API 키를 입력하지 않으며 학교가 동기화한 공용 자료를 조회합니다."], base.TEAL, base.TEAL_LIGHT))
    f.append(Spacer(1, 4 * mm))
    f.append(base.note_box("출력물", ["출석부와 학생 시간표에는 개인정보가 들어갑니다.", "메신저·메일로 보낼 때 수신자를 다시 확인합니다.", "불필요한 종이와 PDF는 학교 지침에 따라 안전하게 폐기합니다."], base.RED, base.RED_LIGHT)); f.append(PageBreak())

    f += title("자주 묻는 질문", "faq")
    faqs = [
        ("매번 로그인해야 하나요?", "아닙니다. 한 번 로그인하면 10시간 유지됩니다."),
        ("메뉴를 열 때 자료가 늦게 보입니다.", "실행 직후 공유 자료를 미리 불러옵니다. 처음 몇 초는 기다리고 이후에도 비어 있으면 새로고침합니다."),
        ("급식·학사일정이 안 나옵니다.", "새로고침한 뒤 다시 확인합니다. 계속 비어 있으면 학교 담당자에게 공용 NEIS 동기화 상태를 문의합니다. NEIS 학사일정은 기본적으로 꺼져 있으므로 필요할 때 켭니다."),
        ("인쇄가 두 장으로 나뉩니다.", "화면의 전용 인쇄 버튼을 사용하고 A4·페이지에 맞춤을 확인합니다."),
        ("교환·대강 승인 뒤 NEIS도 바뀌나요?", "아닙니다. 앱의 날짜별 편의 표시만 바뀌며 공식 NEIS 처리는 별도입니다."),
        ("8월 11일 시간표는 어떻게 표시되나요?", "8월 11일은 화요일이지만 학교 운영 계획에 따라 월요일 시간표가 표시되고 대시보드에서 안내 메시지를 확인할 수 있습니다."),
        ("프로그램 업데이트는 어떻게 하나요?", "새 버전이 자동으로 내려오면 지금 설치를 누릅니다. 재시작 후 적용됩니다."),
    ]
    for q, a in faqs:
        f.append(KeepTogether([base.p(f"<b>Q. {q}</b>", "H2Ko"), base.p(f"A. {a}"), Spacer(1, 3 * mm)]))
    f.append(base.note_box("문제가 계속되면", ["기능개선 요청에 실명으로 메뉴, 오류 문구와 수행 순서를 적습니다.", "화면을 첨부할 때 학생 이름·학번 등 학생 개인정보를 가립니다.", "발생 날짜·시간과 어떤 버튼을 눌렀는지 함께 적습니다."], base.RED, base.RED_LIGHT))
    return f


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    screens = sanitize()
    doc = base.ManualDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=42, rightMargin=42, topMargin=38, bottomMargin=36,
        title="웅천고 업무도우미 초보자용 상세 사용자 설명서 v1.1.2",
        author="웅천고등학교", subject="웅천고 업무도우미 배포용 상세 사용자 설명서",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="manual", frames=[frame], onPage=base.on_page)])
    content = story(screens)
    if content and isinstance(content[-1], PageBreak): content.pop()
    doc.build(content)
    print(OUTPUT)


if __name__ == "__main__":
    main()
