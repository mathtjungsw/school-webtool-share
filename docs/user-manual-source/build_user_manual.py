from __future__ import annotations

import os
from pathlib import Path

from PIL import Image as PILImage, ImageDraw, ImageFilter, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent
SCREEN_DIR = SOURCE_DIR / "screenshots-original"
SANITIZED_DIR = SOURCE_DIR / "screenshots-generated"
OUTPUT_DIR = ROOT / "docs"
OUTPUT_PDF = OUTPUT_DIR / "웅천고_업무도우미_사용자설명서_v1.1.2.pdf"
LOGO = ROOT / "ungcheon-school-helper" / "src" / "assets" / "ungcheon-logo.png"

FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")
pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))

PROGRAM_VERSION = "1.1.2"
MANUAL_VERSION = "1.1.2"
MANUAL_DATE = "2026년 8월 10일"

INK = colors.HexColor("#10233F")
MUTED = colors.HexColor("#5E6B7D")
AMBER = colors.HexColor("#D99A00")
AMBER_LIGHT = colors.HexColor("#FFF4CF")
VIOLET = colors.HexColor("#6D45E8")
VIOLET_LIGHT = colors.HexColor("#F1EDFF")
TEAL = colors.HexColor("#087F72")
TEAL_LIGHT = colors.HexColor("#E7F7F3")
RED = colors.HexColor("#C63A43")
RED_LIGHT = colors.HexColor("#FFF0F1")
LINE = colors.HexColor("#DDE3EA")
PAPER = colors.HexColor("#FFFEFA")


def blur_region(image: PILImage.Image, box: tuple[int, int, int, int], radius: int = 14) -> None:
    x1, y1, x2, y2 = box
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(image.width, x2), min(image.height, y2)
    if x2 <= x1 or y2 <= y1:
        return
    crop = image.crop((x1, y1, x2, y2)).filter(ImageFilter.GaussianBlur(radius))
    image.paste(crop, (x1, y1))


def add_callouts(image: PILImage.Image, points: list[tuple[int, int, str]]) -> None:
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(FONT_BOLD), 22)
    for x, y, label in points:
        r = 19
        draw.ellipse((x - r, y - r, x + r, y + r), fill="#E5A400", outline="#FFFFFF", width=3)
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((x - tw / 2, y - th / 2 - 2), label, font=font, fill="#10233F")


def sanitize_screenshots() -> dict[str, Path]:
    SANITIZED_DIR.mkdir(parents=True, exist_ok=True)
    result: dict[str, Path] = {}
    extra_blurs: dict[str, list[tuple[int, int, int, int]]] = {
        "01-dashboard.png": [(1360, 0, 1515, 45), (1180, 385, 1320, 425)],
        "01-dashboard-검색도우미.png": [(1360, 0, 1515, 45)],
        "05-settings.png": [(350, 515, 665, 570)],
        "06-staff_tasks.png": [(150, 145, 330, 190)],
        "06-staff_tasks-공유_업무_배부.png": [(150, 145, 330, 190)],
        "07-school_hub.png": [(1100, 305, 1300, 365), (285, 535, 475, 575)],
        "08-timetable_swap.png": [(1160, 235, 1445, 300)],
        "08-timetable_swap-대강_교사_찾기.png": [(1160, 235, 1445, 300)],
        "09-student_timetable.png": [(105, 510, 400, 1000), (435, 390, 585, 450), (1325, 320, 1505, 370)],
        "10-attendance_print.png": [(185, 325, 390, 355), (590, 385, 830, 1000)],
        "10-attendance_print-수업_출석부.png": [(565, 310, 760, 355), (625, 385, 850, 1000)],
        "13-staff_roster.png": [(290, 385, 415, 1000)],
        "14-committees.png": [(735, 820, 1040, 1000)],
        "15-feature_requests.png": [(1095, 275, 1370, 340)],
    }
    callouts: dict[str, list[tuple[int, int, str]]] = {
        "06-staff_tasks.png": [(310, 260, "1"), (180, 345, "2"), (485, 455, "3"), (1010, 455, "4")],
        "08-timetable_swap.png": [(395, 170, "1"), (1295, 270, "2"), (825, 410, "3"), (610, 170, "4")],
        "08-timetable_swap-대강_교사_찾기.png": [(400, 170, "1"), (1295, 270, "2"), (825, 410, "3")],
        "09-student_timetable.png": [(180, 420, "1"), (245, 465, "2"), (200, 555, "3"), (830, 540, "4"), (1420, 420, "5")],
        "10-attendance_print.png": [(835, 240, "1"), (220, 380, "2"), (235, 520, "3"), (310, 600, "4"), (910, 400, "5")],
        "10-attendance_print-수업_출석부.png": [(840, 240, "1"), (260, 450, "2"), (265, 535, "3"), (270, 750, "4"), (950, 400, "5")],
    }
    version_font = ImageFont.truetype(str(FONT_REGULAR), 12)
    for source in SCREEN_DIR.glob("*.png"):
        target = SANITIZED_DIR / source.name
        if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
            result[source.name] = target
            continue
        image = PILImage.open(source).convert("RGB")
        blur_region(image, (1360, 0, 1518, 46), 12)
        for box in extra_blurs.get(source.name, []):
            blur_region(image, box)
        draw = ImageDraw.Draw(image)
        draw.rectangle((155, 4, 210, 34), fill="#FFFEFA")
        draw.text((162, 12), f"v{PROGRAM_VERSION}", font=version_font, fill="#6B7280")
        if source.name in callouts:
            add_callouts(image, callouts[source.name])
        image.save(target, format="PNG", optimize=True)
        result[source.name] = target
    return result


class AnchoredParagraph(Paragraph):
    def __init__(self, text: str, style: ParagraphStyle, key: str, level: int = 0):
        super().__init__(text, style)
        self.bookmark_key = key
        self.bookmark_level = level
        self.bookmark_text = text.replace("★ 중요 기능", "").replace("<b>", "").replace("</b>", "")


class ManualDocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable: Flowable) -> None:
        if hasattr(flowable, "bookmark_key"):
            key = flowable.bookmark_key
            self.canv.bookmarkPage(key)
            try:
                self.canv.addOutlineEntry(flowable.bookmark_text, key, level=flowable.bookmark_level, closed=False)
            except Exception:
                pass


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyKo", fontName="Malgun", fontSize=9.4, leading=15, textColor=INK, wordWrap="CJK", spaceAfter=5))
styles.add(ParagraphStyle(name="SmallKo", fontName="Malgun", fontSize=8, leading=12, textColor=MUTED, wordWrap="CJK"))
styles.add(ParagraphStyle(name="CaptionKo", fontName="Malgun", fontSize=7.6, leading=10, textColor=MUTED, alignment=TA_CENTER, wordWrap="CJK", spaceBefore=3, spaceAfter=8))
styles.add(ParagraphStyle(name="H1Ko", fontName="MalgunBold", fontSize=20, leading=26, textColor=INK, wordWrap="CJK", spaceAfter=8))
styles.add(ParagraphStyle(name="H2Ko", fontName="MalgunBold", fontSize=13.5, leading=19, textColor=INK, wordWrap="CJK", spaceBefore=3, spaceAfter=6))
styles.add(ParagraphStyle(name="H3Ko", fontName="MalgunBold", fontSize=10.5, leading=15, textColor=TEAL, wordWrap="CJK", spaceBefore=3, spaceAfter=4))
styles.add(ParagraphStyle(name="CenterKo", fontName="Malgun", fontSize=10, leading=15, textColor=INK, alignment=TA_CENTER, wordWrap="CJK"))
styles.add(ParagraphStyle(name="CoverTitleKo", fontName="MalgunBold", fontSize=30, leading=39, textColor=INK, alignment=TA_CENTER, wordWrap="CJK"))
styles.add(ParagraphStyle(name="CoverSubKo", fontName="Malgun", fontSize=12, leading=20, textColor=MUTED, alignment=TA_CENTER, wordWrap="CJK"))
styles.add(ParagraphStyle(name="LinkKo", fontName="MalgunBold", fontSize=9, leading=13, textColor=VIOLET, wordWrap="CJK"))
styles.add(ParagraphStyle(name="StepKo", fontName="Malgun", fontSize=9.2, leading=15, textColor=INK, leftIndent=14, firstLineIndent=-14, wordWrap="CJK", spaceAfter=4))


MENUS = [
    {"id": "help", "title": "사용 매뉴얼", "summary": "프로그램 기본 사용법, 공용 NEIS 자료, 개인정보 원칙과 업데이트 방법을 확인합니다.", "steps": ["메뉴를 열고 필요한 주제의 설명 카드를 찾습니다.", "급식·학사일정·학급시간표는 학교 공용 자료로 제공된다는 안내를 확인합니다.", "화면 하단의 업데이트 확인으로 최신 버전을 확인합니다."], "tips": ["일반 사용자는 NEIS API 키를 발급받거나 입력하지 않습니다.", "설명서와 프로그램 내 매뉴얼을 함께 활용하면 변경된 기능을 빠르게 확인할 수 있습니다."]},
    {"id": "notifier", "title": "업무알리미", "summary": "학교 공지와 오늘의 학사일정을 정해 둔 간격으로 확인합니다.", "steps": ["알림 확인 간격과 알림 조건을 선택합니다.", "알리미 시작을 누르고 실행 상태를 확인합니다.", "업무가 끝나면 중지하거나 조건을 조정합니다."], "tips": ["실제 미결 공문을 읽는 기능은 아니며 학교 공지와 일정 확인용입니다."]},
    {"id": "dashboard", "title": "대시보드", "summary": "2주 일정, 주간 시간표, 날씨·급식, 업무 알림과 개인 메모를 한 화면에서 봅니다.", "steps": ["로그인하면 항상 대시보드에서 시작합니다.", "2주 달력에서 날짜를 선택해 일정과 참고사항을 확인합니다.", "오른쪽 시간표에서 오늘 수업을 확인하고, 아래 업무 알림과 개인 메모를 사용합니다.", "필요할 때만 NEIS 학사일정 켜기를 선택합니다."], "tips": ["NEIS 학사일정은 기본적으로 꺼져 있습니다.", "개인 메모는 현재 Windows 사용자 PC에만 저장됩니다."]},
    {"id": "calendar", "title": "캘린더", "summary": "학사일정, 주간계획, 창체, 지도 일정, 위원회, 개인 업무를 월간 달력으로 통합 표시합니다.", "steps": ["상단의 이전·다음 달 버튼으로 원하는 달을 엽니다.", "표시 항목을 켜거나 끄고 필요한 일정만 확인합니다.", "날짜를 눌러 상세 일정과 개인 업무를 확인·등록합니다."], "tips": ["일정은 앱 실행 중 임시 저장되어 다시 열 때 빠르게 표시됩니다.", "공유 일정의 원본이 바뀌면 새로고침으로 즉시 반영할 수 있습니다."]},
    {"id": "settings", "title": "환경설정", "summary": "교사 이름, 담당 학년·반, 화면 테마와 임시 저장자료 설정을 관리합니다.", "steps": ["사용자 설정에서 이름과 담당 학년·반을 확인합니다.", "밝은 모드 또는 다크 모드와 임시 저장자료 상태를 확인합니다.", "변경한 설정을 저장한 뒤 대시보드에서 반영 여부를 확인합니다."], "tips": ["일반 사용자는 NEIS API 키와 학교 공유 서비스 URL을 입력하거나 수정하지 않습니다.", "급식·학사일정·학급시간표는 학교에서 동기화한 공용 자료를 조회합니다."]},
    {"id": "staff_tasks", "title": "업무센터", "summary": "개인 업무와 전체·부서·개별 교직원에게 배부된 공유 업무의 진행 상태를 관리합니다.", "critical": True},
    {"id": "school_hub", "title": "학교 공유 링크", "summary": "교직원이 함께 사용하는 부서별 자료·사이트 URL을 등록하고 검색합니다.", "steps": ["부서명, 자료 이름, URL과 설명을 입력합니다.", "등록을 누르면 모든 교직원 화면에 즉시 표시됩니다.", "검색창에서 부서·자료명·등록자로 필요한 링크를 찾습니다."], "tips": ["학생 이름, 연락처, 성적 등 개인정보가 포함된 주소나 설명은 등록하지 않습니다.", "잘못 등록한 링크는 학교 담당자에게 삭제를 요청합니다."]},
    {"id": "timetable_swap", "title": "교환·대강 계획", "summary": "교환 가능한 수업과 공강 교사를 찾고 예상 시간표·계획서를 확인합니다.", "critical": True},
    {"id": "student_timetable", "title": "학생별 시간표", "summary": "학생의 선택과목을 포함한 개인 시간표를 조회하고 학생별·학급별로 인쇄합니다.", "critical": True},
    {"id": "attendance_print", "title": "출석부 출력", "summary": "학급 출석부와 이동수업 출석부를 한 장에 맞춰 인쇄하거나 Excel로 저장합니다.", "critical": True},
    {"id": "student_locator", "title": "학생 위치 찾기", "summary": "1·2·3학년 학생을 학번 4·5자리 또는 이름으로 검색해 현재 수업 교실과 담당 교사를 찾습니다.", "steps": ["학번 또는 이름을 입력하고 찾기를 누릅니다.", "동명이인이 나오면 학번·학급을 확인해 학생을 선택합니다.", "현재 교시의 과목, 교실과 담당 교사를 확인합니다."], "tips": ["1학년은 학교 공용 학급시간표를 기준으로 현재 위치를 찾습니다.", "승인된 교환·대강 일정이 있으면 해당 날짜의 변경 내용이 반영됩니다.", "현재 시간과 수업시간 계획을 기준으로 결과가 표시됩니다."]},
    {"id": "student_identity_audit", "title": "학생 학번·이름 교정기", "summary": "Excel·한글·PDF 또는 붙여넣기 자료에서 잘못 연결된 학번과 이름을 찾습니다.", "steps": ["파일을 선택하거나 원본 표를 복사해 붙여넣습니다.", "분석을 실행해 이름 불일치, 학번 불일치, 동명이인과 미등록 값을 확인합니다.", "오류 목록을 복사해 원본 자료를 수정합니다."], "tips": ["학번과 이름이 한 셀에 있거나 서로 옆 칸에 있어도 분석할 수 있습니다.", "원본 파일과 공유 학생 명렬은 수정하지 않습니다."]},
    {"id": "staff_roster", "title": "교직원 명렬", "summary": "교직원의 직책·부서·교과·담임 정보를 조회하고 연수등록부를 출력합니다.", "steps": ["명렬에서 이름과 부서·교과·담임 정보를 확인합니다.", "필요하면 명렬 내려받기로 Excel 파일을 저장합니다.", "연수등록부 탭에서 대상 범위, 제목과 날짜를 지정하고 출력용 명단을 정리한 뒤 인쇄합니다."], "tips": ["기본 정렬은 교장, 교감, 교사, 교무실무원, 기타 교직원 순서이며 같은 직군은 가나다순입니다.", "연수등록부에서 추가·삭제한 이름은 출력용 임시 목록이며 공유 명렬 원본을 바꾸지 않습니다."]},
    {"id": "committees", "title": "각종 위원회 현황", "summary": "경남교육청 고등학교 위원회 기준, 위원 명단과 개최 일정을 함께 관리합니다.", "steps": ["왼쪽 목록에서 위원회를 검색하고 법정·비법정 등의 조건을 확인합니다.", "교직원 명렬에서 위원을 선택하거나 외부위원을 직접 입력합니다.", "위원회 캘린더에서 일시와 장소를 등록합니다.", "위원이 겹치는 같은 시간 일정 경고가 나오면 시간을 조정합니다."], "tips": ["내가 포함된 위원회 일정은 대시보드와 캘린더에도 표시됩니다."]},
    {"id": "feature_requests", "title": "기능개선 요청", "summary": "새 기능 제안과 기존 기능 개선 의견을 실명으로 등록합니다.", "steps": ["요청 유형을 새 기능 또는 기능 개선으로 선택합니다.", "제목과 구체적인 사용 상황·원하는 동작을 작성합니다.", "작성자 이름을 확인하고 등록합니다."], "tips": ["학생·학부모 이름이나 연락처 등 개인정보는 작성하지 않습니다.", "요청 상태와 답변은 같은 메뉴에서 확인할 수 있습니다."]},
    {"id": "transfer_score", "title": "전보내신점수 계산기", "summary": "2027 경남 중등 일반교사 기준으로 근무경력점·교육활동경력점·가산점을 계산합니다.", "steps": ["NEIS 인사기록 - 출력 - 인사발령상황(전체) - Excel data에서 파일을 내려받습니다.", "NEIS Excel 불러오기로 경력·휴직·담임·보직 월수를 자동 반영합니다.", "표창·자격·우대조건 등 자동으로 알 수 없는 가산점을 직접 입력합니다.", "중복·상한 경고와 계산 내역을 확인하고 PDF로 저장합니다."], "tips": ["파견과 예외 기간은 인정 기준이 다를 수 있으므로 인사 담당자에게 최종 확인합니다.", "계산 결과는 참고용이며 공식 점수 확정 자료가 아닙니다."]},
    {"id": "grade_preview", "title": "성적 산출 미리보기", "summary": "평가항목별 점수와 반영비율을 적용해 환산점수·석차등급·성취도를 미리 계산합니다.", "steps": ["기존 성적 파일 또는 입력 양식에 평가 자료를 준비합니다.", "평가항목, 배점과 반영비율을 확인합니다.", "산출을 실행해 누락·범위 오류와 분포를 확인합니다.", "정리 Excel로 저장해 다음 작업에 활용합니다."], "tips": ["공식 NEIS 성적 입력 전 검토용이며 최종 결과와 다를 수 있습니다."]},
    {"id": "estimated_split_score", "title": "추정분할점수 도우미", "summary": "희망 분할점수에 필요한 정답률 구성과 성취도 분포 예측·역산을 수행합니다.", "steps": ["시험 전에는 선택형·서술형 배점과 희망 분할점수를 입력합니다.", "난이도별 예상 정답률 구성을 확인합니다.", "시험 후에는 1·2차 시험과 수행평가 비율·점수를 넣어 성취도 분포를 예측합니다.", "희망 분포에 맞는 분할점수와 필요한 정답률을 역산합니다."], "tips": ["선택형 배점이 0이면 선택형 계산을 제외하고 서술형 정답률만 제시합니다.", "실제 성취도는 학생 집단과 문항 특성에 따라 달라질 수 있습니다."]},
    {"id": "curriculum", "title": "교육과정 편제표 출력", "summary": "전학년·학년별 교육과정 편제표를 확인·PDF 출력하고 과목선택 상담 도구로 이동합니다.", "steps": ["전학년 또는 1·2·3학년 시트를 선택합니다.", "미리보기에서 표가 한 페이지에 맞는지 확인합니다.", "PDF 출력 또는 인쇄를 선택합니다.", "과목선택 도우미로 이동해 학생 상담과 선택결과 저장을 진행합니다."], "tips": ["과목선택 상담 결과는 현재 PC에만 저장됩니다."]},
    {"id": "form_center", "title": "서식센터", "summary": "학교 공통 정보를 이용해 회의록·계획서·결과보고서·명단·안내문을 작성합니다.", "steps": ["학교명, 학년도, 부서, 작성자 등 공통 정보를 확인합니다.", "필요한 서식을 선택하고 항목을 입력합니다.", "A4 미리보기에서 내용을 검토합니다.", "인쇄·PDF, Excel 또는 한글 붙여넣기용 표를 선택합니다."], "tips": ["작성 중인 내용은 서식별로 현재 PC에 자동 저장됩니다."]},
    {"id": "teacher_tools", "title": "교사용 도구", "summary": "명단 비교, 날짜 계산, 무작위 추첨과 모둠 편성을 한곳에서 사용합니다.", "steps": ["명단 비교에서는 두 목록을 붙여넣거나 파일로 불러옵니다.", "날짜 계산에서는 주말·휴업일 제외 여부를 선택합니다.", "추첨·모둠에서는 제외 대상과 같은 모둠·분리 조건을 설정합니다.", "결과를 복사, 인쇄 또는 Excel로 저장합니다."], "tips": ["공유 학생·교직원 명렬을 불러올 수도 있고 직접 입력할 수도 있습니다."]},
    {"id": "excel_processor", "title": "Excel 전처리", "summary": "Excel의 불필요한 공백·빈 행·중복·열 구성을 정리해 새 파일로 저장합니다.", "steps": ["원본 Excel 파일을 선택합니다.", "필요한 정리 옵션과 대상 시트·열을 선택합니다.", "미리보기로 변경 결과를 확인합니다.", "처리된 새 Excel 파일을 저장합니다."], "tips": ["원본 파일을 직접 덮어쓰지 않으므로 결과 파일을 확인한 뒤 사용합니다."]},
    {"id": "recommended_subjects", "title": "대학 권장과목", "summary": "대학·학과별 권장 선택과목과 과목선택 상담 정보를 확인합니다.", "steps": ["대학 또는 관심 계열·학과를 검색합니다.", "핵심·권장과목과 안내 내용을 확인합니다.", "학생의 교육과정 편제와 비교해 상담에 활용합니다."], "tips": ["대학별 안내는 변경될 수 있으므로 실제 지원 전 최신 모집요강을 확인합니다."]},
    {"id": "payroll", "title": "호봉획정 계산기", "summary": "경력 기간과 인정률을 적용해 예상 호봉 획정 결과를 계산합니다.", "steps": ["임용 전·후 경력 기간과 경력 종류를 입력합니다.", "중복 기간과 제외 기간을 확인합니다.", "인정률과 환산 경력을 검토합니다.", "예상 결과를 인쇄하거나 저장합니다."], "tips": ["공식 호봉 확정은 인사 담당자의 증빙 검토 결과를 따릅니다."]},
    {"id": "insa_analysis", "title": "NEIS 인사기록 분석", "summary": "NEIS에서 내려받은 인사기록 파일을 PC에서 분석해 경력과 발령 이력을 정리합니다.", "steps": ["NEIS 인사기록 출력 파일을 준비합니다.", "파일을 선택해 발령·경력 항목을 분석합니다.", "누락·중복·확인 필요 항목을 검토합니다.", "정리 결과를 저장해 인사 업무에 참고합니다."], "tips": ["원본은 학교 공유 서비스로 전송되지 않으며 현재 PC에서만 처리합니다."]},
    {"id": "pdf_extractor", "title": "PDF 텍스트 추출", "summary": "일반 PDF의 텍스트를 추출해 복사하거나 문서 작업에 활용합니다.", "steps": ["PDF 파일을 선택합니다.", "페이지별 추출 결과를 확인합니다.", "필요한 텍스트를 복사하거나 저장합니다."], "tips": ["사진으로 스캔된 PDF는 글자 정보가 없어 OCR 도구가 추가로 필요할 수 있습니다."]},
    {"id": "file_parser", "title": "만능 파일 파서", "summary": "Excel·한글·PDF 등 다양한 파일의 표와 텍스트 구조를 확인하고 변환 작업에 활용합니다.", "steps": ["분석할 파일을 선택합니다.", "인식된 시트·표·텍스트 영역을 확인합니다.", "필요한 데이터를 복사하거나 지원되는 형식으로 저장합니다."], "tips": ["복잡한 한글 문서나 스캔 파일은 일부 표 구조가 달라질 수 있으므로 결과를 확인합니다."]},
]


SCREEN_ORDER = [
    "dashboard", "help", "notifier", "calendar", "settings", "staff_tasks", "school_hub",
    "timetable_swap", "student_timetable", "attendance_print", "student_locator",
    "student_identity_audit", "staff_roster", "committees", "feature_requests", "transfer_score",
    "grade_preview", "estimated_split_score", "curriculum", "form_center", "teacher_tools",
    "excel_processor", "recommended_subjects", "payroll", "insa_analysis", "pdf_extractor", "file_parser",
]
SCREEN_MAP = {menu_id: f"{index + 1:02d}-{menu_id}.png" for index, menu_id in enumerate(SCREEN_ORDER)}


def p(text: str, style: str = "BodyKo") -> Paragraph:
    return Paragraph(text, styles[style])


def bullet_list(items: list[str], numbered: bool = False) -> list[Flowable]:
    flows: list[Flowable] = []
    for index, item in enumerate(items, 1):
        mark = f"{index}." if numbered else "•"
        flows.append(Paragraph(f"{mark} {item}", styles["StepKo"]))
    return flows


def note_box(title: str, items: list[str], color=TEAL, background=TEAL_LIGHT) -> Table:
    content = [p(f"<b>{title}</b>", "BodyKo")] + bullet_list(items)
    table = Table([[content]], colWidths=[510])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.8, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def screenshot_flow(path: Path, caption: str, width: float = 510) -> list[Flowable]:
    if not path.exists():
        return [note_box("화면 자료", ["화면을 불러오지 못했습니다."], RED, RED_LIGHT)]
    with PILImage.open(path) as image:
        ratio = image.height / image.width
    return [Image(str(path), width=width, height=width * ratio), p(caption, "CaptionKo")]


def on_page(canvas, doc) -> None:
    canvas.saveState()
    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(42, A4[1] - 30, A4[0] - 42, A4[1] - 30)
        canvas.setFont("Malgun", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(42, A4[1] - 22, f"웅천고 업무도우미 사용자 설명서 | 프로그램 v{PROGRAM_VERSION} | 설명서 v{MANUAL_VERSION}")
        canvas.drawRightString(A4[0] - 42, 22, f"{doc.page}")
        canvas.drawString(42, 22, "웅천고등학교")
    canvas.restoreState()


def page_title(title: str, anchor: str, critical: bool = False) -> list[Flowable]:
    badge = "<font color='#C63A43'>★ 중요 기능</font>  " if critical else ""
    return [
        AnchoredParagraph(f"{badge}{title}", styles["H1Ko"], anchor, 0),
        HRFlowable(width="100%", thickness=1, color=AMBER if critical else LINE, spaceAfter=8),
    ]


def back_link() -> Paragraph:
    return Paragraph("<link href='#menu_overview' color='#6D45E8'>← 전체 메뉴 간결 설명으로 돌아가기</link>", styles["SmallKo"])


def build_story(screens: dict[str, Path]) -> list[Flowable]:
    story: list[Flowable] = []
    story.append(Spacer(1, 25 * mm))
    if LOGO.exists():
        story.append(Image(str(LOGO), width=36 * mm, height=36 * mm))
        story[-1].hAlign = "CENTER"
    story.append(Spacer(1, 8 * mm))
    story.append(AnchoredParagraph("웅천고 업무도우미<br/>사용자 설명서", styles["CoverTitleKo"], "cover", 0))
    story.append(Spacer(1, 7 * mm))
    story.append(p(f"프로그램 버전 <b>v{PROGRAM_VERSION}</b>  |  설명서 제작 버전 <b>v{MANUAL_VERSION}</b><br/>{MANUAL_DATE}", "CoverSubKo"))
    story.append(Spacer(1, 18 * mm))
    story.append(note_box("이 설명서의 특징", ["전체 메뉴를 한 문장으로 빠르게 확인할 수 있습니다.", "메뉴명을 누르면 해당 상세 설명으로 바로 이동합니다.", "실제 프로그램 화면을 사용했으며 개인정보 영역은 흐림 처리했습니다.", "★ 표시가 있는 네 가지 핵심 기능은 사용 절차를 더 자세히 설명합니다."], AMBER, AMBER_LIGHT))
    story.append(Spacer(1, 13 * mm))
    story.append(p("창원시 웅천고등학교", "CenterKo"))
    story.append(PageBreak())

    story += page_title("처음 사용하는 분을 위한 5분 시작", "quick_start")
    story += bullet_list([
        "배포받은 UngcheonSchoolHelper-Setup-1.1.2.exe를 실행해 설치합니다.",
        "Windows 보호 화면이 나타나면 파일 출처가 웅천고 배포 파일인지 확인한 뒤 추가 정보 - 실행을 선택합니다.",
        "프로그램 시작 화면에서 교직원 명렬에 등록된 본인 이름을 키보드로 정확히 입력합니다.",
        "시범운영 중에는 비밀번호 없이 로그인하며, 로그인 상태는 10시간 유지됩니다.",
        "로그인 후 대시보드에서 일정과 시간표를 확인하고, Ctrl+K 검색도우미로 원하는 기능을 찾습니다.",
    ], numbered=True)
    story.append(Spacer(1, 4 * mm))
    story.append(note_box("설치 후 꼭 확인", ["프로그램은 항상 대시보드로 시작합니다.", "급식·NEIS 학사일정·학급시간표는 학교 공용 자료로 제공되며 일반 사용자는 API 키를 입력하지 않습니다.", "새 버전은 실행 중 자동으로 내려받고, 안내가 표시되면 지금 설치를 선택합니다.", "학생·교직원 자료가 보이는 화면은 학교 업무 목적으로만 사용하고 외부에 공유하지 않습니다."], TEAL, TEAL_LIGHT))
    story.append(Spacer(1, 6 * mm))
    story += screenshot_flow(screens["01-dashboard.png"], "그림 1. 로그인 후 시작되는 대시보드 화면")
    story.append(PageBreak())

    story += page_title("전체 메뉴 간결 설명", "menu_overview")
    story.append(p("아래 메뉴명을 누르면 뒤쪽의 자세한 설명으로 이동합니다. ★ 표시는 배포 초기 핵심 기능입니다."))
    rows = [[p("메뉴", "H3Ko"), p("간결 설명", "H3Ko")]]
    for menu in MENUS:
        star = "★ " if menu.get("critical") else ""
        rows.append([
            Paragraph(f"<link href='#menu_{menu['id']}' color='#6D45E8'><b>{star}{menu['title']}</b></link>", styles["LinkKo"]),
            p(menu["summary"], "SmallKo"),
        ])
    table = Table(rows, colWidths=[135, 375], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AMBER_LIGHT),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)
    story.append(PageBreak())

    story += page_title("검색도우미", "search_assistant")
    story.append(p("메뉴 이름을 몰라도 평소 말하듯 원하는 일을 입력하면 관련 메뉴와 단계별 사용법을 찾아줍니다."))
    story += screenshot_flow(screens["01-dashboard-검색도우미.png"], "그림 2. Ctrl+K로 여는 검색도우미")
    story.append(p("<b>여는 방법</b>  상단 업무 검색을 누르거나 키보드에서 Ctrl+K를 누릅니다."))
    story += bullet_list([
        "내 수업 출석부 출력하고 싶어",
        "학생 이름으로 지금 수업 교실 찾고 싶어",
        "개인 업무를 달력에 넣고 싶어",
        "급식이나 학사일정이 안 보여",
        "교환 가능한 선생님을 찾고 싶어",
    ])
    story.append(note_box("검색도우미가 하는 일", ["관련 메뉴, 간단한 설명과 단계별 사용 순서를 보여줍니다.", "바로가기를 누르면 해당 메뉴로 이동합니다.", "질문은 이 PC에서만 검색하며 외부 AI나 유료 API로 전송하지 않습니다.", "등록·삭제·출력은 해당 메뉴에서 사용자가 직접 최종 확인합니다."], VIOLET, VIOLET_LIGHT))
    story.append(PageBreak())

    story += build_staff_tasks_pages(screens)
    story += build_timetable_swap_pages(screens)
    story += build_student_timetable_pages(screens)
    story += build_attendance_pages(screens)

    for menu in MENUS:
        if menu.get("critical"):
            continue
        story += page_title(menu["title"], f"menu_{menu['id']}")
        story.append(p(menu["summary"]))
        screenshot_name = SCREEN_MAP[menu["id"]]
        story += screenshot_flow(screens[screenshot_name], f"{menu['title']} 기본 화면 - 개인정보 영역은 흐림 처리")
        story.append(p("<b>사용 순서</b>", "H2Ko"))
        story += bullet_list(menu["steps"], numbered=True)
        story.append(note_box("알아두세요", menu["tips"], TEAL, TEAL_LIGHT))
        story.append(Spacer(1, 3 * mm))
        story.append(back_link())
        story.append(PageBreak())

    story += page_title("개인정보·자료 저장 원칙", "privacy")
    story.append(note_box("학교 공유 자료", ["교직원 명렬, 학생 명렬, 시간표, 위원회 일정과 공유 업무는 학교 구성원이 함께 사용하는 자료입니다.", "조회·출력 목적에 필요한 최소 정보만 사용하며 외부에 공유하지 않습니다.", "프로그램을 종료하면 실행 중 빠른 조회를 위해 내려받은 임시 캐시는 삭제됩니다."], AMBER, AMBER_LIGHT))
    story.append(Spacer(1, 4 * mm))
    story.append(note_box("현재 PC에만 저장되는 자료", ["개인 메모, 개인 업무, 일부 서식 작성 내용과 상담 결과는 현재 Windows 사용자 PC에 저장됩니다.", "같은 Windows 계정을 여러 사람이 함께 쓰는 공용 PC에는 민감한 내용을 기록하지 않습니다.", "일반 사용자는 NEIS API 키를 입력하지 않으며 학교가 동기화한 공용 자료를 조회합니다."], TEAL, TEAL_LIGHT))
    story.append(Spacer(1, 4 * mm))
    story.append(note_box("파일 처리", ["NEIS 인사기록, 점수 Excel, PDF 원본은 별도 안내가 없는 한 이 PC에서만 처리됩니다.", "원본을 덮어쓰지 않고 새 결과 파일을 만들며, 결과를 확인한 뒤 사용합니다.", "출력물에는 개인정보가 포함될 수 있으므로 보관·전송·폐기 시 학교 개인정보 지침을 따릅니다."], VIOLET, VIOLET_LIGHT))
    story.append(PageBreak())

    story += page_title("자주 묻는 질문", "faq")
    faq = [
        ("프로그램을 켤 때마다 로그인해야 하나요?", "아닙니다. 한 번 로그인하면 10시간 동안 유지됩니다. 시간이 지나거나 로그아웃하면 이름을 다시 입력합니다."),
        ("학교 자료가 메뉴를 열 때 늦게 보입니다.", "앱 실행 직후 공유 자료를 미리 불러옵니다. 처음 몇 초 동안은 로딩이 있을 수 있고 이후에는 임시 캐시를 먼저 표시합니다. 새로고침하면 서버 변경 여부를 바로 확인합니다."),
        ("급식이나 NEIS 학사일정이 보이지 않습니다.", "새로고침 뒤에도 비어 있으면 학교 담당자에게 공용 NEIS 동기화 상태를 확인합니다. NEIS 학사일정은 기본적으로 꺼져 있으므로 필요할 때 켭니다."),
        ("출석부나 시간표가 한 페이지에서 잘립니다.", "프로그램의 전용 인쇄 버튼을 사용하고 인쇄 창에서 용지 A4, 배율 기본 또는 페이지에 맞춤을 확인합니다."),
        ("업데이트는 어떻게 하나요?", "새 버전이 있으면 자동으로 내려받고 설치 안내가 나타납니다. 안내에서 지금 설치를 누르면 재시작 후 적용됩니다."),
        ("검색도우미가 답을 못 찾습니다.", "메뉴명 대신 하려는 일을 짧게 다시 입력합니다. 예: 출석부, 학생 위치, 교환, 연수등록부, 전보 점수처럼 핵심 단어를 포함합니다."),
    ]
    for question, answer in faq:
        story.append(KeepTogether([p(f"<b>Q. {question}</b>", "H2Ko"), p(f"A. {answer}"), Spacer(1, 2 * mm)]))
    story.append(Spacer(1, 6 * mm))
    story.append(note_box("문제가 계속되면", ["기능개선 요청 메뉴에 실명으로 사용 상황과 오류 문구를 적습니다.", "가능하면 개인정보를 가린 화면 캡처와 재현 순서를 함께 남깁니다.", "오류가 발생한 메뉴, 날짜·시간과 수행한 작업을 적으면 확인이 빨라집니다."], RED, RED_LIGHT))
    return story


def build_staff_tasks_pages(screens: dict[str, Path]) -> list[Flowable]:
    flows: list[Flowable] = []
    flows += page_title("업무센터", "menu_staff_tasks", True)
    flows.append(p("개인 업무와 학교 공유 업무를 한 화면에서 관리합니다. 새 업무·오늘 마감·3일 이내·기한 초과가 자동 분류됩니다."))
    flows += screenshot_flow(screens["06-staff_tasks.png"], "그림 3. 업무센터 - ① 자동 분류 ② 보기 탭 ③ 업무 입력 ④ 업무 목록")
    flows += bullet_list(["상단 자동 분류 카드에서 새 업무와 마감 상태를 먼저 확인합니다.", "내 업무에서는 나에게 배부된 업무를 확인하고 완료 여부를 체크합니다.", "내가 만든 업무에서는 내가 배부한 업무와 교직원별 진행 상태를 확인합니다.", "부서 업무와 개인 업무 탭에서 업무 종류를 구분합니다."], numbered=True)
    flows.append(PageBreak())
    flows += page_title("업무센터 - 개인 업무와 공유 업무", "menu_staff_tasks_use", True)
    flows.append(p("<b>개인 업무</b>는 나만 보는 일정이고, <b>공유 업무</b>는 전체·부서·선택 교직원에게 배부되는 업무입니다."))
    flows.append(note_box("개인 업무 등록", ["개인 업무 탭을 선택합니다.", "업무 제목, 설명, 시작일·마감일, 우선순위와 상태를 입력합니다.", "저장하면 업무센터와 캘린더·대시보드에 함께 표시됩니다.", "완료하면 체크하고, 필요하면 수정·삭제합니다."], TEAL, TEAL_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("공유 업무 배부", ["내가 만든 업무에서 제목·안내와 세부 확인 항목을 입력합니다.", "시작일·마감일, 우선순위, 상태와 관련 링크를 지정합니다.", "전체·부서·개별 교직원 중 배부 대상을 선택합니다.", "배부 후에는 대상별 완료 상태를 확인합니다."], VIOLET, VIOLET_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("주의", ["로그인한 이름이 작성자·응답자 판별 기준입니다.", "다른 사람의 이름으로 로그인하지 않습니다.", "공유 업무 설명과 링크에는 학생 개인정보를 입력하지 않습니다."], RED, RED_LIGHT))
    flows.append(PageBreak())
    flows += page_title("업무센터 - 마감과 대시보드 알림", "menu_staff_tasks_alert", True)
    flows += bullet_list(["새로 배부된 업무: 이 PC에서 아직 확인하지 않은 업무", "오늘 마감: 마감일이 오늘인 미완료 업무", "마감 임박: 마감까지 3일 이내인 미완료 업무", "기한 초과: 마감일이 지났지만 완료되지 않은 업무", "내가 배부한 진행 업무: 대상자의 완료 현황을 확인해야 하는 업무"])
    flows.append(Spacer(1, 5 * mm))
    flows.append(note_box("권장 사용 순서", ["출근 후 대시보드 업무 알림을 확인합니다.", "업무센터에서 새 업무의 안내와 세부 확인 항목을 읽습니다.", "처리 후 완료 체크를 남깁니다.", "업무를 배부한 사람은 미완료 대상만 확인해 안내합니다."], AMBER, AMBER_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(back_link())
    flows.append(PageBreak())
    return flows


def build_timetable_swap_pages(screens: dict[str, Path]) -> list[Flowable]:
    flows: list[Flowable] = []
    flows += page_title("교환·대강 계획", "menu_timetable_swap", True)
    flows.append(p("학교 공유 시간표를 바탕으로 수업 교환 후보와 대강 가능한 공강 교사를 찾습니다. 원본 시간표는 바뀌지 않습니다."))
    flows += screenshot_flow(screens["08-timetable_swap.png"], "그림 4. 수업 교환 - ① 기능 탭 ② 교사 선택 ③ 주간 시간표 ④ 계획서")
    flows += bullet_list(["교사를 선택하고 이동할 수업을 누릅니다.", "색칠된 후보 칸에서 상대 교사의 수업 정보를 확인합니다.", "후보를 눌러 양쪽 교사의 예상 시간표와 연강 변화를 확인합니다.", "교환 내용을 계획서에 추가합니다."], numbered=True)
    flows.append(PageBreak())
    flows += page_title("교환·대강 계획 - 대강 교사 찾기", "menu_timetable_swap_substitute", True)
    flows.append(p("대강 교사 찾기에서는 선택한 시간에 공강인 교사를 확인합니다. 교환 제한 수업도 대강 대상으로 선택할 수 있습니다."))
    flows += screenshot_flow(screens["08-timetable_swap-대강_교사_찾기.png"], "그림 5. 대강 교사 찾기 - 보라색 칸은 대강 대상으로 선택 가능")
    flows += bullet_list(["대강 교사 찾기 탭을 누릅니다.", "대강이 필요한 수업 칸을 선택합니다.", "공강 교사 목록에서 후보를 눌러 예상 시간표와 연속 수업을 확인합니다.", "확정할 후보를 계획서에 추가합니다."], numbered=True)
    flows.append(PageBreak())
    flows += page_title("교환·대강 계획 - 계획서와 일정 반영", "menu_timetable_swap_plan", True)
    flows.append(note_box("계획서 출력", ["계획서 편집·출력에서 교환·대강 행을 확인합니다.", "사유, 기간, 교시와 수업 정보를 필요한 만큼 수정합니다.", "잘못 추가한 행을 삭제합니다.", "교환보강 계획서 양식으로 인쇄·PDF 또는 지원되는 문서 형식으로 저장합니다."], TEAL, TEAL_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("캘린더·시간표 반영", ["계획서 행에서 반영 요청을 선택하면 상대 교사에게 알림이 표시됩니다.", "상대 교사가 확인 후 승인하면 두 교사의 캘린더와 해당 날짜 시간표에 반영됩니다.", "바로 결정하기 어려우면 보류할 수 있고 나중에 다시 확인할 수 있습니다.", "이 반영은 NEIS와 별개인 편의 기능이며 학교 공유 원본 시간표는 수정하지 않습니다."], VIOLET, VIOLET_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("반드시 확인", ["교환 전후 양쪽 교사의 연강과 공강을 확인합니다.", "학급·교실·날짜와 교시를 다시 확인합니다.", "공식 수업 변경 절차와 NEIS 처리는 학교 지침에 따라 별도로 진행합니다."], RED, RED_LIGHT))
    flows.append(Spacer(1, 3 * mm))
    flows.append(back_link())
    flows.append(PageBreak())
    return flows


def build_student_timetable_pages(screens: dict[str, Path]) -> list[Flowable]:
    flows: list[Flowable] = []
    flows += page_title("학생별 시간표", "menu_student_timetable", True)
    flows.append(p("학생의 학급 수업과 선택과목·이동수업을 합친 개인 시간표를 조회합니다. 사용자는 별도 Excel 파일을 넣지 않습니다."))
    flows += screenshot_flow(screens["09-student_timetable.png"], "그림 6. 학생별 시간표 - ① 학년·반 ② 검색 ③ 학생 목록 ④ 시간표 ⑤ 인쇄")
    flows += bullet_list(["학년과 반을 선택하거나 검색창에 학번·이름을 입력합니다.", "왼쪽 목록에서 학생을 선택합니다.", "과목, 교실과 담당 교사를 포함한 주간 시간표를 확인합니다.", "이 학생 인쇄로 개인 시간표를 출력합니다."], numbered=True)
    flows.append(PageBreak())
    flows += page_title("학생별 시간표 - 검색과 출력", "menu_student_timetable_print", True)
    flows.append(note_box("학생 찾기", ["학번 전체 또는 이름 일부를 입력해 검색합니다.", "동명이인은 학번과 학급을 함께 확인합니다.", "목록의 선택과목 수와 시간표의 이동수업 칸을 확인합니다."], TEAL, TEAL_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("출력", ["이 학생 인쇄: 선택한 학생 1명의 시간표를 인쇄하거나 PDF로 저장합니다.", "학급 전체 인쇄: 현재 선택한 학년·반 학생의 개인 시간표를 연속 출력합니다.", "인쇄 창에서 A4와 페이지에 맞춤을 확인합니다."], VIOLET, VIOLET_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("알아두세요", ["화면의 자료는 학교에서 미리 공유한 시간표를 조회하는 것입니다.", "일반 사용자는 원본 Excel을 내려받거나 공유 시간표 내용을 바꾸지 않습니다.", "승인된 날짜별 교환·대강이 있으면 해당 날짜 확인 기능에 반영될 수 있습니다."], RED, RED_LIGHT))
    flows.append(Spacer(1, 3 * mm))
    flows.append(back_link())
    flows.append(PageBreak())
    return flows


def build_attendance_pages(screens: dict[str, Path]) -> list[Flowable]:
    flows: list[Flowable] = []
    flows += page_title("출석부 출력", "menu_attendance_print", True)
    flows.append(p("학급 출석부와 선택과목·이동수업 출석부를 조회하고 A4 한 페이지에 맞춰 출력합니다."))
    flows += screenshot_flow(screens["10-attendance_print.png"], "그림 7. 학급 출석부 - ① 종류 탭 ② 학년·반 ③ 제목·날짜 ④ 출력 ⑤ 명단")
    flows += bullet_list(["학급 출석부 탭을 선택합니다.", "학년과 반을 선택합니다.", "출석부 제목과 날짜를 확인합니다.", "오른쪽 명단을 검토한 뒤 학급 출석부 인쇄·PDF 저장을 누릅니다."], numbered=True)
    flows.append(PageBreak())
    flows += page_title("출석부 출력 - 수업 출석부", "menu_attendance_course", True)
    flows.append(p("이동수업은 한 강좌, 교사별 전체 강좌 또는 과목별 전체 분반으로 묶어서 출력할 수 있습니다."))
    flows += screenshot_flow(screens["10-attendance_print-수업_출석부.png"], "그림 8. 수업 출석부 - ① 수업 탭 ② 출력 기준 ③ 강좌 선택 ④ 인쇄·Excel ⑤ 명단")
    flows += bullet_list(["수업 출석부 탭을 누릅니다.", "한 강좌·교사별 전체·과목별 전체 중 출력 기준을 선택합니다.", "담당 교사 또는 과목·교실 강좌를 선택합니다.", "학생 명단을 확인한 뒤 인쇄 또는 Excel 내려받기를 선택합니다."], numbered=True)
    flows.append(PageBreak())
    flows += page_title("출석부 출력 - 묶음 출력과 문제 해결", "menu_attendance_batch", True)
    flows.append(note_box("묶음 출력 예시", ["교사별 전체: 선택한 교사가 담당하는 모든 강좌 출석부를 연속 출력합니다.", "과목별 전체: 선택한 과목의 모든 분반 출석부를 연속 출력합니다.", "한 강좌: 특정 과목·교실의 출석부 한 부만 출력합니다."], VIOLET, VIOLET_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("출력이 안 될 때", ["새로고침 후 공유 학생 명렬과 학생별 시간표가 표시되는지 확인합니다.", "이동수업 자료는 학생별 시간표의 공유 과목선택 자료와 연결됩니다.", "인쇄 창에서 용지 A4, 방향과 페이지에 맞춤을 확인합니다.", "명단이 다음 페이지로 넘어가면 브라우저 인쇄가 아니라 화면의 전용 인쇄 버튼을 사용합니다."], RED, RED_LIGHT))
    flows.append(Spacer(1, 4 * mm))
    flows.append(note_box("개인정보", ["출석부에는 학생 이름과 학번이 포함됩니다.", "업무 목적 범위에서만 출력하고 불필요한 사본은 안전하게 폐기합니다.", "메신저·메일로 전송할 때 수신자를 다시 확인합니다."], AMBER, AMBER_LIGHT))
    flows.append(Spacer(1, 3 * mm))
    flows.append(back_link())
    flows.append(PageBreak())
    return flows


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sanitized = sanitize_screenshots()
    doc = ManualDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=42,
        rightMargin=42,
        topMargin=38,
        bottomMargin=36,
        title=f"웅천고 업무도우미 사용자 설명서 v{PROGRAM_VERSION}",
        author="웅천고등학교",
        subject="웅천고 업무도우미 배포용 사용자 설명서",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="manual", frames=[frame], onPage=on_page)])
    story = build_story(sanitized)
    if story and isinstance(story[-1], PageBreak):
        story.pop()
    doc.build(story)
    print(OUTPUT_PDF)


if __name__ == "__main__":
    main()
