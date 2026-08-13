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
TOTAL = 10
MENU_NO = "04"
MENU_NAME = "출석부 출력"

ASSET_ROOT = ROOT / "manual-assets" / "출석부출력"
SOURCE = ASSET_ROOT / "원본캡처"
EDITED = ASSET_ROOT / "편집캡처"
OUTPUT = ROOT / "output" / "pdf"
EDITED.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUTPUT / f"웅천고_업무도우미_메뉴소개_04_출석부출력_v{VERSION}.pdf"


def src(name: str) -> Path:
    path = SOURCE / name
    if not path.exists():
        raise FileNotFoundError(path)
    return path


S1 = src(f"출석부출력_01_학급출석부첫화면_v{VERSION}_20260813.png")
S2 = src(f"출석부출력_02_학급선택후_v{VERSION}_20260813.png")
S3 = src(f"출석부출력_03_학급출석부인쇄창_v{VERSION}_20260813.png")
S4 = src(f"출석부출력_04_수업출석부한강좌_v{VERSION}_20260813.png")
S5 = src(f"출석부출력_05_교사별전체묶음_v{VERSION}_20260813.png")
S6 = src(f"출석부출력_06_과목별전체묶음_v{VERSION}_20260813.png")

CLASS_OVERVIEW = prepare_capture(
    S1,
    EDITED / "출석부출력_학급출석부_개인정보가림_번호표시.png",
    crop=(225, 42, 1536, 825),
    blur_boxes=((718, 382, 930, 864),),
    markers=((1, 235, 195, "#087C73"), (2, 195, 340, "#7146CC"), (3, 850, 305, "#187AA5"), (4, 247, 555, "#C96B00")),
    outlines=(((20, 165, 1265, 215), "#087C73", 4), ((20, 235, 408, 600), "#7146CC", 4)),
)
CLASS_SELECTED = prepare_capture(
    S2,
    EDITED / "출석부출력_2학년1반_개인정보가림_번호표시.png",
    crop=(80, 202, 1520, 830),
    blur_boxes=((548, 382, 790, 864),),
    markers=((1, 130, 175, "#087C73"), (2, 326, 175, "#187AA5"), (3, 166, 410, "#7146CC"), (4, 374, 410, "#C96B00")),
)
PRINT_DIALOG = prepare_capture(
    S3,
    EDITED / "출석부출력_인쇄창_번호표시.png",
    crop=(343, 24, 1193, 758),
    markers=((1, 80, 122, "#087C73"), (2, 78, 220, "#187AA5"), (3, 78, 390, "#7146CC"), (4, 530, 690, "#C96B00")),
)
COURSE_SINGLE = prepare_capture(
    S4,
    EDITED / "출석부출력_한강좌_개인정보가림_번호표시.png",
    crop=(80, 205, 1520, 830),
    blur_boxes=((588, 382, 840, 864),),
    markers=((1, 154, 168, "#087C73"), (2, 234, 242, "#187AA5"), (3, 235, 320, "#7146CC"), (4, 120, 545, "#C96B00"), (5, 319, 545, "#3E8751")),
)
TEACHER_BUNDLE = prepare_capture(
    S5,
    EDITED / "출석부출력_교사별묶음_개인정보가림_번호표시.png",
    crop=(80, 205, 1280, 755),
    blur_boxes=((560, 401, 1160, 421), (560, 471, 1160, 491), (560, 541, 1160, 561), (560, 611, 1160, 631), (560, 681, 1160, 701)),
    markers=((1, 255, 174, "#087C73"), (2, 190, 253, "#187AA5"), (3, 730, 121, "#7146CC"), (4, 100, 467, "#C96B00")),
)
SUBJECT_BUNDLE = prepare_capture(
    S6,
    EDITED / "출석부출력_과목별묶음_개인정보가림_번호표시.png",
    crop=(80, 205, 1280, 700),
    blur_boxes=((560, 400, 1160, 420), (560, 470, 1160, 490), (560, 540, 1160, 560)),
    markers=((1, 385, 174, "#087C73"), (2, 190, 253, "#187AA5"), (3, 730, 121, "#7146CC"), (4, 100, 467, "#C96B00")),
)


def base(c, page: int, section: str, dark=False):
    page_base(c, MENU_NO, MENU_NAME, page, TOTAL, VERSION, DATE, section, dark)


def page1(c: canvas.Canvas):
    base(c, 1, "출석부 출력", True)
    pill(c, "하루 한 메뉴 · 04", 48, PAGE_H - 79, PALE_GOLD, GOLD_DARK)
    draw_text(c, "출석부 출력", 48, PAGE_H - 135, 31, WHITE, True)
    wrapped(c, "학급 출석부부터 이동수업 한 강좌, 교사별 전체 수업, 과목별 전체 강좌까지 필요한 명단을 바로 골라 인쇄해 보세요.", 48, PAGE_H - 171, 700, 12, 20, HexColor("#DCE5EE"), max_lines=3)
    add_cover_chips(c, [("학급 출석부", PALE_TEAL, TEAL), ("수업 출석부", PALE_CYAN, CYAN), ("교사·과목별 묶음", PALE_PURPLE, PURPLE), ("PDF·Excel", PALE_GOLD, GOLD_DARK)], 48, PAGE_H - 240)
    place_image(c, CLASS_OVERVIEW, 45, 72, PAGE_W - 90, 280, 8)
    draw_text(c, "화면의 학생 이름과 학번은 설명서에서만 흐림 처리했으며, 실제 프로그램에서는 권한에 따라 정상 표시됩니다.", 51, 58, 8.1, HexColor("#C9D4DF"))
    c.showPage()


def page2(c: canvas.Canvas):
    base(c, 2, "30초 사용 흐름")
    page_title(c, "30초 사용 흐름", "필요한 출석부를 네 단계로 만들어요", "학급 출석부와 수업 출석부는 시작점만 다르고, 대상 선택 → 내용 확인 → 출력 순서는 같습니다.")
    steps = [
        ("1", "종류 선택", "학급 출석부 또는\n수업 출석부"),
        ("2", "대상 선택", "학년·반 / 강좌 /\n교사 / 과목"),
        ("3", "제목·날짜", "인쇄물에 보일\n제목과 기준일"),
        ("4", "출력", "인쇄·PDF 또는\nExcel 내려받기"),
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
    place_image(c, CLASS_SELECTED, 40, 76, 515, 245, 7)
    simple_card(c, "먼저 이것만 기억하세요", "• 학급 명단은 학년·반을 고르면 바로 바뀝니다.\n• 이동수업은 한 강좌, 교사별 전체, 과목별 전체로 나눌 수 있어요.\n• 일반 사용자는 조회·출력만 하며 원본 명렬 파일을 내려받지 않습니다.\n• 인쇄창이 뜨면 프린터나 PDF 저장 장치를 고릅니다.", 575, 82, 225, 232, TEAL, WHITE)
    c.showPage()


def page3(c: canvas.Canvas):
    base(c, 3, "화면 한눈에 보기")
    page_title(c, "화면 한눈에 보기", "학급 출석부 화면은 이렇게 읽으면 됩니다", "왼쪽에서 조건을 정하고, 오른쪽에서 명단이 맞는지 확인한 다음 출력합니다.")
    place_image(c, CLASS_OVERVIEW, 35, 70, 550, 425, 6)
    note_card(c, 1, "출석부 종류", "위쪽 탭에서 학급 출석부와 수업 출석부를 바꿉니다.", 604, 494, 197, 68, TEAL)
    note_card(c, 2, "학년·반", "원하는 학급을 선택하면 오른쪽 명단이 즉시 바뀝니다.", 604, 411, 197, 68, PURPLE)
    note_card(c, 3, "명단 확인", "학급, 담임, 인원 수와 학생 명단을 먼저 확인하세요.", 604, 328, 197, 68, CYAN)
    note_card(c, 4, "인쇄·PDF", "제목과 날짜를 확인한 뒤 노란 버튼을 누릅니다.", 604, 245, 197, 68, ORANGE)
    rounded(c, 604, 64, 197, 95, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "명단이 이상해 보이면", 621, 133, 9.8, GOLD_DARK, True)
    wrapped(c, "새로고침을 한 번 누른 뒤 다시 확인하세요. 계속 다르면 관리자에게 공유 명렬 갱신을 요청하면 됩니다.", 621, 111, 164, 8.0, 12, INK, max_lines=4)
    c.showPage()


def page4(c: canvas.Canvas):
    base(c, 4, "학급 출석부")
    page_title(c, "학급 출석부", "담임 학급 명단을 가장 빠르게 뽑는 방법", "학년과 반을 선택하면 공유 명렬을 기준으로 담임, 인원 수, 학생 목록이 자동으로 연결됩니다.")
    place_image(c, CLASS_SELECTED, 38, 90, 525, 388, 6)
    note_card(c, 1, "학년 선택", "먼저 1·2·3학년 중 하나를 고릅니다.", 585, 470, 216, 64, TEAL)
    note_card(c, 2, "반 선택", "반을 바꾸면 오른쪽 학생 목록도 함께 바뀝니다.", 585, 393, 216, 64, CYAN)
    note_card(c, 3, "제목", "인쇄물 맨 위에 들어갈 문구입니다. 필요하면 수정하세요.", 585, 316, 216, 70, PURPLE)
    note_card(c, 4, "날짜", "기본값은 오늘이며 달력 아이콘으로 바꿀 수 있습니다.", 585, 233, 216, 70, ORANGE)
    rounded(c, 585, 70, 216, 78, PALE_GREEN, PALE_GREEN, 12, 0)
    draw_text(c, "출력 전 마지막 확인", 603, 124, 9.6, GREEN, True)
    wrapped(c, "오른쪽 상단의 ‘학급·담임·인원’과 실제 학급이 맞는지 확인해 주세요.", 603, 102, 180, 8.1, 12, INK, max_lines=4)
    c.showPage()


def page5(c: canvas.Canvas):
    base(c, 5, "인쇄와 PDF 저장")
    page_title(c, "인쇄와 PDF 저장", "노란 출력 버튼을 누르면 Windows 인쇄창이 열립니다", "미리보기 영역이 비어 보여도 오류가 아닙니다. 왼쪽 설정을 확인하고 인쇄 또는 PDF 저장을 진행하세요.")
    place_image(c, PRINT_DIALOG, 40, 68, 515, 344, 6)
    note_card(c, 1, "프린터", "종이 출력은 학교 프린터, PDF는 Hancom PDF 등 PDF 프린터를 고릅니다.", 577, 485, 224, 74, TEAL)
    note_card(c, 2, "방향", "기본 세로 방향으로 한 장에 맞춰 출력합니다.", 577, 398, 224, 64, CYAN)
    note_card(c, 3, "페이지", "모든 페이지를 선택하면 묶음 출석부 전체가 출력됩니다.", 577, 321, 224, 68, PURPLE)
    note_card(c, 4, "인쇄", "설정이 맞으면 인쇄를 누릅니다. 취소는 프로그램으로 돌아갑니다.", 577, 240, 224, 72, ORANGE)
    rounded(c, 577, 68, 224, 90, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "PDF 파일로 남기고 싶을 때", 594, 132, 9.6, GOLD_DARK, True)
    wrapped(c, "Hancom PDF를 선택하고 인쇄를 누른 뒤 저장 위치와 파일명을 정하면 됩니다.", 594, 109, 191, 8.1, 12, INK, max_lines=4)
    c.showPage()


def page6(c: canvas.Canvas):
    base(c, 6, "한 강좌 출석부")
    page_title(c, "한 강좌 출석부", "이동수업 한 반만 필요할 때", "수업 출석부 탭에서 ‘한 강좌’를 고르면 과목·교사·교실 단위의 실제 수강 명단을 확인할 수 있습니다.")
    place_image(c, COURSE_SINGLE, 35, 65, 548, 425, 6)
    note_card(c, 1, "한 강좌", "출력 기준에서 한 강좌를 선택합니다.", 602, 486, 199, 62, TEAL)
    note_card(c, 2, "담당 교사", "교사를 먼저 좁히면 강좌를 찾기 쉬워요.", 602, 412, 199, 64, CYAN)
    note_card(c, 3, "과목·교실", "학년·과목·교사·교실·인원을 보고 정확한 강좌를 고릅니다.", 602, 336, 199, 72, PURPLE)
    note_card(c, 4, "출석부 인쇄", "현재 강좌 한 장을 인쇄하거나 PDF로 저장합니다.", 602, 252, 199, 68, ORANGE)
    note_card(c, 5, "Excel", "명단을 편집하거나 별도 양식에 쓸 때 내려받습니다.", 602, 172, 199, 68, GREEN)
    c.showPage()


def page7(c: canvas.Canvas):
    base(c, 7, "교사별 전체")
    page_title(c, "교사별 전체", "한 선생님의 모든 수업 출석부를 한 번에", "교사를 선택하면 그 선생님이 담당하는 강좌가 묶음 목록으로 나타나며, 강좌별 한 페이지씩 연속 출력됩니다.")
    place_image(c, TEACHER_BUNDLE, 35, 84, 548, 405, 6)
    note_card(c, 1, "교사별 전체", "출력 기준에서 교사별 전체를 선택합니다.", 602, 486, 199, 64, TEAL)
    note_card(c, 2, "교사 선택", "본인 이름 또는 필요한 교사를 고릅니다.", 602, 409, 199, 64, CYAN)
    note_card(c, 3, "묶음 목록", "강좌 수·교실·수강 인원을 먼저 확인하세요.", 602, 332, 199, 68, PURPLE)
    note_card(c, 4, "묶음 인쇄", "버튼의 숫자만큼 출석부가 강좌별로 이어서 출력됩니다.", 602, 251, 199, 72, ORANGE)
    rounded(c, 602, 70, 199, 95, PALE_GREEN, PALE_GREEN, 12, 0)
    draw_text(c, "Excel도 같은 범위", 619, 138, 9.7, GREEN, True)
    wrapped(c, "교사별 전체 상태에서 Excel 내려받기를 누르면 해당 교사의 모든 강좌가 함께 저장됩니다.", 619, 115, 165, 8.0, 12, INK, max_lines=4)
    c.showPage()


def page8(c: canvas.Canvas):
    base(c, 8, "과목별 전체")
    page_title(c, "과목별 전체", "같은 과목의 여러 강좌를 빠짐없이 출력", "과목을 선택하면 교사나 교실이 다른 분반도 함께 모입니다. 교과 협의나 평가 자료 준비에 편리해요.")
    place_image(c, SUBJECT_BUNDLE, 35, 92, 548, 392, 6)
    note_card(c, 1, "과목별 전체", "출력 기준에서 과목별 전체를 선택합니다.", 602, 482, 199, 64, TEAL)
    note_card(c, 2, "과목 선택", "동일 과목명을 기준으로 전체 강좌를 모읍니다.", 602, 405, 199, 64, CYAN)
    note_card(c, 3, "분반 확인", "교사·교실·학생 수가 다른 강좌를 목록에서 확인합니다.", 602, 328, 199, 70, PURPLE)
    note_card(c, 4, "전체 출력", "버튼의 강좌 수만큼 한 페이지씩 이어서 출력됩니다.", 602, 245, 199, 70, ORANGE)
    rounded(c, 602, 70, 199, 92, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "같은 과목인데 안 보이면", 619, 136, 9.5, GOLD_DARK, True)
    wrapped(c, "공유 시간표의 과목명이 서로 다르게 적힌 경우일 수 있습니다. 관리자에게 과목명 확인을 부탁하세요.", 619, 113, 165, 7.9, 11.5, INK, max_lines=4)
    c.showPage()


def page9(c: canvas.Canvas):
    base(c, 9, "출력 방식과 점검")
    page_title(c, "출력 방식과 점검", "인쇄·PDF·Excel은 이렇게 구분하면 쉬워요", "목적에 맞는 버튼을 고르고, 이상할 때는 자료 출처를 확인합니다.")
    cards = [
        ("종이 인쇄", "교실에서 바로 사용할 때\n학교 프린터 선택", TEAL, PALE_TEAL),
        ("PDF 저장", "메신저 공유·보관할 때\nPDF 프린터 선택", CYAN, PALE_CYAN),
        ("Excel 내려받기", "명단 추가 편집·가공이 필요할 때\n수업 출석부에서 사용", PURPLE, PALE_PURPLE),
    ]
    x = 40
    for title, body, color, fill in cards:
        simple_card(c, title, body, x, 352, 238, 105, color, fill)
        x += 261
    simple_card(c, "명단이 비거나 학생이 빠졌어요", "• 학급 출석부는 ‘교직원·학생 명렬’의 공유 학급 명단을 사용합니다.\n• 수업 출석부는 ‘학생별 시간표’의 이동수업 수강 정보를 사용합니다.\n• 새로고침 후에도 같으면 관리자에게 어느 학급·강좌인지 알려주세요.", 40, 164, 365, 155, RED, PALE_ORANGE)
    simple_card(c, "개인정보를 다룰 때", "• 출력물은 학생 개인정보가 포함된 업무 자료입니다.\n• 필요한 부수만 인쇄하고 사용 후에는 학교 기준에 맞게 보관·폐기해 주세요.\n• 일반 사용자에게는 관리자 원본 Excel 다운로드 기능이 제공되지 않습니다.", 435, 164, 365, 155, GREEN, PALE_GREEN)
    rounded(c, 40, 76, 760, 56, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "한 페이지 맞춤", 58, 110, 9.4, GOLD_DARK, True)
    wrapped(c, "출석부 출력물은 학생 수에 따라 글자와 간격을 조정해 한 강좌·한 학급이 한 페이지에 들어가도록 구성됩니다.", 150, 110, 625, 8.4, 13, INK, max_lines=2)
    c.showPage()


def page10(c: canvas.Canvas):
    base(c, 10, "검색도우미·자주 묻는 질문")
    page_title(c, "검색도우미·자주 묻는 질문", "메뉴가 기억나지 않을 때는 문장으로 물어보세요", "대시보드 위쪽 업무 검색(Ctrl+K)에 하고 싶은 일을 그대로 적으면 메뉴와 사용 방법을 안내합니다.")
    simple_card(c, "이렇게 검색해 보세요", "“내 수업 출석부를 모두 출력하고 싶어”\n“경제 수학 출석부를 한꺼번에 뽑고 싶어”\n“2학년 1반 학급 출석부 PDF 저장 방법”\n“일본어 이동수업 명단을 Excel로 받고 싶어”", 40, 316, 365, 154, TEAL, PALE_TEAL)
    simple_card(c, "자주 묻는 질문", "Q. 미리보기가 안 보여요.\nA. Windows 인쇄창 안내 문구일 수 있어요. 왼쪽 설정 후 출력하면 됩니다.\n\nQ. Excel 버튼이 안 보여요.\nA. 학급 출석부가 아닌 수업 출석부 탭에서 확인하세요.", 435, 316, 365, 154, CYAN, PALE_CYAN)
    place_image(c, COURSE_SINGLE, 40, 76, 365, 210, 5)
    rounded(c, 435, 76, 365, 210, WHITE, PALE_PURPLE, 14, 1)
    draw_text(c, "마지막으로 한 번 연습해 볼까요?", 458, 253, 12, NAVY, True)
    checks = ["출석부 출력 → 수업 출석부", "교사별 전체 → 본인 이름 선택", "강좌 수 확인 → 묶음 인쇄", "인쇄창에서 프린터 또는 PDF 선택"]
    y = 218
    for i, item in enumerate(checks, 1):
        c.setFillColor(PURPLE); c.circle(470, y + 2, 10, fill=1, stroke=0)
        draw_text(c, str(i), 470, y - 1.8, 7.7, WHITE, True, "center")
        draw_text(c, item, 490, y - 2, 9.0, INK, i == 4)
        y -= 34
    draw_text(c, "이제 필요한 출석부를 ‘한 장’ 또는 ‘묶음’으로 바로 출력할 수 있습니다.", 458, 91, 8.4, PURPLE, True)
    c.showPage()


def build():
    c = canvas.Canvas(str(PDF_PATH), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle(f"웅천고 업무도우미 메뉴 소개 - {MENU_NAME}")
    c.setAuthor("웅천고등학교")
    for page in (page1, page2, page3, page4, page5, page6, page7, page8, page9, page10):
        page(c)
    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    build()
