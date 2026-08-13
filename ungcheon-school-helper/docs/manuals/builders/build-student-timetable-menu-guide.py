from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

from menu_guide_common import (
    CYAN,
    GOLD_DARK,
    GREEN,
    INK,
    MUTED,
    NAVY,
    ORANGE,
    PAGE_H,
    PAGE_W,
    PALE_CYAN,
    PALE_GOLD,
    PALE_GREEN,
    PALE_ORANGE,
    PALE_PURPLE,
    PALE_TEAL,
    PURPLE,
    RED,
    ROOT,
    TEAL,
    WHITE,
    add_cover_chips,
    arrow,
    draw_text,
    note_card,
    page_base,
    page_title,
    pill,
    place_image,
    prepare_capture,
    rounded,
    shadow_card,
    simple_card,
    wrapped,
)


VERSION = "1.1.11"
DATE = "2026.08.13."
TOTAL = 9
MENU_NO = "05"
MENU_NAME = "학생별 시간표"

ASSET_ROOT = ROOT / "manual-assets" / "학생별시간표"
SOURCE = ASSET_ROOT / "원본캡처"
EDITED = ASSET_ROOT / "편집캡처"
OUTPUT = ROOT / "output" / "pdf"
EDITED.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUTPUT / f"웅천고_업무도우미_메뉴소개_05_학생별시간표_v{VERSION}.pdf"


def src(name: str) -> Path:
    path = SOURCE / name
    if not path.exists():
        raise FileNotFoundError(path)
    return path


S1 = src(f"학생별시간표_01_첫화면_v{VERSION}_20260813.png")
S4 = src(f"학생별시간표_04_개인시간표인쇄창_v{VERSION}_20260813.png")
S5 = src(f"학생별시간표_05_선택과목현황_v{VERSION}_20260813.png")

OVERVIEW = prepare_capture(
    S1,
    EDITED / "학생별시간표_첫화면_개인정보가림_번호표시.png",
    crop=(80, 125, 1270, 795),
    blur_boxes=((128, 530, 380, 824), (445, 385, 700, 468)),
    markers=((1, 140, 290, "#087C73"), (2, 265, 290, "#187AA5"), (3, 165, 335, "#7146CC"), (4, 950, 295, "#C96B00"), (5, 755, 490, "#3E8751")),
)
FILTERS = prepare_capture(
    S1,
    EDITED / "학생별시간표_검색영역_개인정보가림_번호표시.png",
    crop=(82, 318, 590, 795),
    blur_boxes=((128, 540, 370, 800),),
    markers=((1, 78, 101, "#087C73"), (2, 217, 101, "#187AA5"), (3, 151, 147, "#7146CC"), (4, 305, 223, "#C96B00")),
)
TIMETABLE = prepare_capture(
    S1,
    EDITED / "학생별시간표_시간표표_개인정보가림_번호표시.png",
    crop=(395, 320, 1270, 795),
    blur_boxes=((445, 385, 700, 468),),
    markers=((1, 625, 103, "#C96B00"), (2, 436, 245, "#087C73"), (3, 145, 420, "#187AA5")),
)
COURSES = prepare_capture(
    S5,
    EDITED / "학생별시간표_선택과목_개인정보가림_번호표시.png",
    crop=(395, 44, 1270, 800),
    blur_boxes=(),
    markers=((1, 90, 616, "#187AA5"), (2, 160, 686, "#087C73"), (3, 625, 686, "#7146CC")),
)
PRINT_DIALOG = prepare_capture(
    S4,
    EDITED / "학생별시간표_개인인쇄창_번호표시.png",
    markers=((1, 145, 120, "#087C73"), (2, 144, 215, "#187AA5"), (3, 145, 388, "#7146CC"), (4, 540, 690, "#C96B00")),
)


def base(c, page: int, section: str, dark=False):
    page_base(c, MENU_NO, MENU_NAME, page, TOTAL, VERSION, DATE, section, dark)


def page1(c: canvas.Canvas):
    base(c, 1, "학생별 시간표", True)
    pill(c, "하루 한 메뉴 · 05", 48, PAGE_H - 79, PALE_GOLD, GOLD_DARK)
    draw_text(c, "학생별 시간표", 48, PAGE_H - 135, 31, WHITE, True)
    wrapped(c, "학번이나 이름으로 학생을 찾아 학급 기본수업과 이동수업 선택과목이 합쳐진 개인 시간표를 한눈에 보고 인쇄해 보세요.", 48, PAGE_H - 171, 700, 12, 20, HexColor("#DCE5EE"), max_lines=3)
    add_cover_chips(c, [("학번·이름 검색", PALE_TEAL, TEAL), ("개인 시간표", PALE_CYAN, CYAN), ("선택과목 확인", PALE_PURPLE, PURPLE), ("개인·학급 인쇄", PALE_GOLD, GOLD_DARK)], 48, PAGE_H - 240)
    place_image(c, OVERVIEW, 45, 72, PAGE_W - 90, 280, 8)
    draw_text(c, "학생 정보는 설명서에서만 흐림 처리했습니다. 교사 이름·과목·교실은 사용법 이해를 위해 그대로 두었습니다.", 51, 58, 8.1, HexColor("#C9D4DF"))
    c.showPage()


def page2(c: canvas.Canvas):
    base(c, 2, "30초 사용 흐름")
    page_title(c, "30초 사용 흐름", "학생 한 명의 시간표를 찾는 네 단계", "학년·반으로 좁히거나 검색창에 학번·이름을 입력한 뒤 학생을 선택하면 됩니다.")
    steps = [
        ("1", "학년 선택", "먼저 1·2·3학년\n중 하나 선택"),
        ("2", "학생 찾기", "반 필터 또는\n학번·이름 검색"),
        ("3", "시간표 확인", "요일·교시·교실·\n담당 교사 확인"),
        ("4", "인쇄", "이 학생 또는\n학급 전체 인쇄"),
    ]
    x = 42
    for i, (num, title, body) in enumerate(steps):
        fill = [PALE_TEAL, PALE_CYAN, PALE_PURPLE, PALE_GOLD][i]
        color = [TEAL, CYAN, PURPLE, GOLD_DARK][i]
        shadow_card(c, x, 342, 178, 96, fill, fill, 14)
        c.setFillColor(color); c.circle(x + 28, 414, 15, fill=1, stroke=0)
        draw_text(c, num, x + 28, 409.5, 11, WHITE, True, "center")
        draw_text(c, title, x + 51, 410, 11.2, NAVY, True)
        wrapped(c, body, x + 20, 383, 138, 8.7, 14, INK, max_lines=3)
        if i < 3: arrow(c, x + 185, 394, x + 201, MUTED)
        x += 198
    place_image(c, FILTERS, 40, 76, 365, 245, 7)
    simple_card(c, "검색할 때 이렇게 해 보세요", "• 학번: 4자리 또는 기존 5자리 형식 모두 검색할 수 있어요.\n• 이름: 일부 글자만 입력해도 후보가 좁혀집니다.\n• 동명이인: 학년·반·번호와 학번까지 확인하세요.\n• 반 전체: 학년과 반을 선택한 뒤 ‘학급 전체 인쇄’를 사용합니다.", 435, 82, 365, 232, TEAL, WHITE)
    c.showPage()


def page3(c: canvas.Canvas):
    base(c, 3, "화면 한눈에 보기")
    page_title(c, "화면 한눈에 보기", "왼쪽에서 찾고, 오른쪽에서 확인합니다", "공유 버전과 학생·학급·강좌 수가 보이면 최신 공유 시간표가 정상적으로 불러와진 상태입니다.")
    place_image(c, OVERVIEW, 35, 69, 550, 426, 6)
    note_card(c, 1, "학년", "먼저 학년을 선택해 학생 목록을 줄입니다.", 604, 494, 197, 64, TEAL)
    note_card(c, 2, "반", "담임 학급처럼 특정 반만 보고 싶을 때 사용합니다.", 604, 417, 197, 68, CYAN)
    note_card(c, 3, "검색", "학번 또는 이름을 직접 입력해 빠르게 찾습니다.", 604, 336, 197, 68, PURPLE)
    note_card(c, 4, "인쇄", "선택 학생 한 명 또는 선택 학급 전체를 출력합니다.", 604, 255, 197, 68, ORANGE)
    note_card(c, 5, "시간표", "요일·교시별 수업, 교실, 교사 정보를 확인합니다.", 604, 174, 197, 68, GREEN)
    c.showPage()


def page4(c: canvas.Canvas):
    base(c, 4, "학생 검색")
    pill(c, "학생 검색", 40, PAGE_H - 75, PALE_TEAL, TEAL)
    draw_text(c, "학년·반·학번·이름을 함께 쓰면 더 빨라요", 40, PAGE_H - 116, 22, NAVY, True)
    wrapped(c, "왼쪽 목록에서 학생을 누르면 오른쪽 개인 시간표가 즉시 바뀝니다.\n동명이인은 학급과 학번을 꼭 비교하세요.", 40, PAGE_H - 140, 390, 9.2, 14, MUTED, max_lines=2)
    place_image(c, FILTERS, 40, 88, 380, 318, 6)
    note_card(c, 1, "학년 필터", "1·2·3학년 중 먼저 하나를 선택합니다.", 447, 478, 354, 64, TEAL)
    note_card(c, 2, "반 필터", "특정 반만 볼 때 선택합니다. 전체 반 상태도 괜찮습니다.", 447, 401, 354, 66, CYAN)
    note_card(c, 3, "학번·이름", "학번은 4·5자리 모두, 이름은 일부 글자로도 검색합니다.", 447, 322, 354, 68, PURPLE)
    note_card(c, 4, "학생 카드", "반-번호, 이름, 학번, 선택과목 수를 확인하고 클릭합니다.", 447, 241, 354, 68, ORANGE)
    rounded(c, 447, 80, 354, 94, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "목록에 학생이 없을 때", 466, 146, 9.8, GOLD_DARK, True)
    wrapped(c, "학년 필터를 다시 확인하고 새로고침을 눌러 보세요. 계속 없으면 공유 학생 명렬 또는 학생별 시간표에 빠진 학생인지 관리자에게 알려주세요.", 466, 121, 316, 8.1, 12, INK, max_lines=4)
    c.showPage()


def page5(c: canvas.Canvas):
    base(c, 5, "개인 시간표 읽기")
    page_title(c, "개인 시간표 읽기", "한 칸에 과목·교실·교사가 함께 표시됩니다", "교시 왼쪽에는 고정 수업시간이, 각 수업 칸에는 과목과 필요한 이동 정보가 나타납니다.")
    place_image(c, TIMETABLE, 35, 82, 548, 406, 6)
    note_card(c, 1, "이 학생 인쇄", "현재 선택 학생의 개인 시간표 한 장을 출력합니다.", 602, 482, 199, 68, ORANGE)
    note_card(c, 2, "수업 칸", "과목 아래에 교실·담당 교사가 함께 표시될 수 있습니다.", 602, 399, 199, 72, TEAL)
    note_card(c, 3, "교시·시간", "왼쪽에서 1~7교시와 시작·종료 시각을 확인합니다.", 602, 315, 199, 70, CYAN)
    rounded(c, 602, 167, 199, 82, PALE_TEAL, PALE_TEAL, 12, 0)
    draw_text(c, "색으로 구분하기", 619, 224, 9.7, TEAL, True)
    wrapped(c, "연한 파랑은 학급 기본수업, 연한 초록은 학생 선택과목입니다.", 619, 201, 165, 8.0, 12, INK, max_lines=4)
    rounded(c, 602, 70, 199, 80, PALE_ORANGE, PALE_ORANGE, 12, 0)
    draw_text(c, "‘여유’와 ‘·’", 619, 125, 9.7, ORANGE, True)
    wrapped(c, "여유는 수업이 없는 칸, 점 표시는 등록된 수업 정보가 없는 칸입니다.", 619, 102, 165, 8.0, 12, INK, max_lines=4)
    c.showPage()


def page6(c: canvas.Canvas):
    base(c, 6, "선택과목 확인")
    page_title(c, "선택과목 확인", "시간표 아래에서 선택과목만 따로 다시 확인할 수 있어요", "A·B·C·D군별 과목, 수업 요일·교시, 교실, 담당 교사를 카드 형태로 보여 줍니다.")
    place_image(c, COURSES, 35, 72, 548, 344, 6)
    note_card(c, 1, "색상 범례", "표 아래에서 기본수업과 선택과목 색을 확인합니다.", 602, 482, 199, 68, CYAN)
    note_card(c, 2, "과목 카드", "선택 군과 정식 과목명을 확인합니다.", 602, 399, 199, 68, TEAL)
    note_card(c, 3, "상세 정보", "요일·교시, 교실, 담당 교사가 한 줄에 정리됩니다.", 602, 316, 199, 72, PURPLE)
    rounded(c, 602, 168, 199, 82, PALE_GREEN, PALE_GREEN, 12, 0)
    draw_text(c, "상담할 때 편리해요", 619, 225, 9.7, GREEN, True)
    wrapped(c, "학생에게 ‘무슨 과목을 어디서 듣는지’를 시간표와 선택과목 카드로 함께 설명할 수 있습니다.", 619, 202, 165, 7.9, 11.5, INK, max_lines=4)
    rounded(c, 602, 70, 199, 80, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "내용이 다르면", 619, 125, 9.7, GOLD_DARK, True)
    wrapped(c, "개별 수정이 아니라 관리자 공유 시간표 자료를 고쳐 다시 반영해야 합니다.", 619, 102, 165, 8.0, 12, INK, max_lines=4)
    c.showPage()


def page7(c: canvas.Canvas):
    base(c, 7, "개인 시간표 인쇄")
    page_title(c, "개인 시간표 인쇄", "‘이 학생 인쇄’를 누른 뒤 프린터를 선택합니다", "Windows 인쇄창에서 종이 프린터 또는 PDF 프린터를 고르면 개인 시간표를 한 장으로 출력할 수 있습니다.")
    place_image(c, PRINT_DIALOG, 40, 68, 515, 344, 6)
    note_card(c, 1, "프린터", "종이는 학교 프린터, 파일은 Hancom PDF 등을 선택합니다.", 577, 485, 224, 72, TEAL)
    note_card(c, 2, "방향", "기본 세로 방향으로 출력합니다.", 577, 400, 224, 62, CYAN)
    note_card(c, 3, "페이지", "개인 시간표는 모든 페이지 상태로 두면 됩니다.", 577, 325, 224, 66, PURPLE)
    note_card(c, 4, "인쇄", "설정을 확인한 뒤 인쇄를 누르거나 취소로 돌아갑니다.", 577, 245, 224, 68, ORANGE)
    rounded(c, 577, 68, 224, 92, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "미리보기가 비어 있어도 괜찮아요", 594, 134, 9.4, GOLD_DARK, True)
    wrapped(c, "앱이 Windows 미리보기를 지원하지 않는다는 안내일 수 있으며, 출력 데이터 자체가 없는 것은 아닙니다.", 594, 111, 191, 7.9, 11.5, INK, max_lines=4)
    c.showPage()


def page8(c: canvas.Canvas):
    base(c, 8, "학급 전체·자료 이해")
    page_title(c, "학급 전체·자료 이해", "반 전체 개인 시간표도 한 번에 이어서 출력할 수 있어요", "왼쪽에서 반을 선택해야 ‘학급 전체 인쇄’가 활성화됩니다. 학생별 한 페이지씩 연속 출력됩니다.")
    place_image(c, OVERVIEW, 40, 230, 500, 200, 5)
    simple_card(c, "학급 전체 인쇄 순서", "1. 학년을 선택합니다.\n2. ‘전체 반’ 대신 특정 반을 고릅니다.\n3. 오른쪽 ‘학급 전체 인쇄’가 활성화되는지 봅니다.\n4. 인쇄창에서 모든 페이지를 선택해 출력합니다.", 565, 230, 235, 200, TEAL, PALE_TEAL)
    simple_card(c, "자료는 어디에서 오나요?", "관리자가 학생 명렬·학급 시간표·이동수업 선택 정보를 분석해 조회용 시간표로 공유합니다. 일반 사용자는 이 화면에서 내용을 수정하거나 관리자 원본 Excel을 내려받지 않습니다.", 40, 78, 365, 145, CYAN, PALE_CYAN)
    simple_card(c, "최신 내용이 안 보일 때", "새로고침을 한 번 누르고 공유 버전·업로드 시각을 확인하세요. 그래도 다르면 관리자에게 학생 학번과 잘못 보이는 과목·요일·교시를 알려주면 확인이 빨라집니다.", 435, 78, 365, 145, ORANGE, PALE_ORANGE)
    c.showPage()


def page9(c: canvas.Canvas):
    base(c, 9, "검색도우미·자주 묻는 질문")
    page_title(c, "검색도우미·자주 묻는 질문", "메뉴가 기억나지 않을 때는 문장으로 물어보세요", "대시보드 위쪽 업무 검색(Ctrl+K)에 하고 싶은 일을 그대로 적으면 알맞은 메뉴와 사용 방법을 안내합니다.")
    simple_card(c, "이렇게 검색해 보세요", "“2728 학생 시간표를 보고 싶어”\n“학생 이름으로 개인 시간표 찾는 법”\n“2학년 1반 개인 시간표를 모두 인쇄하고 싶어”\n“선택과목 교실과 담당 교사를 확인하고 싶어”", 40, 316, 365, 154, TEAL, PALE_TEAL)
    simple_card(c, "자주 묻는 질문", "Q. 학급 전체 인쇄가 회색이에요.\nA. 왼쪽에서 특정 반을 먼저 선택하세요.\n\nQ. 학생의 선택과목이 다르게 보여요.\nA. 화면에서 직접 바꾸지 말고 관리자에게 공유 시간표 수정을 요청하세요.", 435, 316, 365, 154, CYAN, PALE_CYAN)
    place_image(c, TIMETABLE, 40, 76, 365, 210, 5)
    rounded(c, 435, 76, 365, 210, WHITE, PALE_PURPLE, 14, 1)
    draw_text(c, "마지막으로 한 번 연습해 볼까요?", 458, 253, 12, NAVY, True)
    checks = ["학생별 시간표 메뉴 열기", "학년 선택 → 학번 또는 이름 검색", "학생 카드 선택 → 시간표·선택과목 확인", "이 학생 인쇄 또는 학급 전체 인쇄"]
    y = 218
    for i, item in enumerate(checks, 1):
        c.setFillColor(PURPLE); c.circle(470, y + 2, 10, fill=1, stroke=0)
        draw_text(c, str(i), 470, y - 1.8, 7.7, WHITE, True, "center")
        draw_text(c, item, 490, y - 2, 9.0, INK, i == 4)
        y -= 34
    draw_text(c, "이제 학생 한 명의 ‘이번 학기 실제 수업 흐름’을 한 화면에서 설명할 수 있습니다.", 458, 91, 8.4, PURPLE, True)
    c.showPage()


def build():
    c = canvas.Canvas(str(PDF_PATH), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle(f"웅천고 업무도우미 메뉴 소개 - {MENU_NAME}")
    c.setAuthor("웅천고등학교")
    for page in (page1, page2, page3, page4, page5, page6, page7, page8, page9):
        page(c)
    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    build()
