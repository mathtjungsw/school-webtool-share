from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[3]
ASSET_ROOT = ROOT / "manual-assets" / "학생위치찾기"
SOURCE = ASSET_ROOT / "원본캡처"
EDITED = ASSET_ROOT / "편집캡처"
OUTPUT = ROOT / "output" / "pdf"
EDITED.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)

VERSION = "1.1.11"
DATE = "2026.08.13."
TOTAL_PAGES = 10
PDF_PATH = OUTPUT / f"웅천고_업무도우미_메뉴소개_03_학생위치찾기_v{VERSION}.pdf"

FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")
pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))
PIL_BOLD = ImageFont.truetype(str(FONT_BOLD), 22)

PAGE_W, PAGE_H = landscape(A4)

PAPER = HexColor("#F7F8F5")
WHITE = white
NAVY = HexColor("#132238")
INK = HexColor("#243245")
MUTED = HexColor("#667386")
SUBTLE = HexColor("#8C98A8")
LINE = HexColor("#DCE3E8")
SHADOW = HexColor("#E4E8E6")
TEAL = HexColor("#087C73")
TEAL_DARK = HexColor("#065E58")
PALE_TEAL = HexColor("#E8F6F3")
CYAN = HexColor("#187AA5")
PALE_CYAN = HexColor("#EAF6FB")
GOLD = HexColor("#D4B500")
GOLD_DARK = HexColor("#8D7600")
PALE_GOLD = HexColor("#FFF6CF")
PURPLE = HexColor("#7146CC")
PALE_PURPLE = HexColor("#F1EDFF")
ORANGE = HexColor("#C96B00")
PALE_ORANGE = HexColor("#FFF0DD")
RED = HexColor("#B83D48")
PALE_RED = HexColor("#FCECEE")
GREEN = HexColor("#3E8751")
PALE_GREEN = HexColor("#EDF8EF")


def source(name: str) -> Path:
    path = SOURCE / name
    if not path.exists():
        raise FileNotFoundError(path)
    return path


S = {
    1: source(f"학생위치찾기_01_검색전_v{VERSION}_20260813.png"),
    2: source(f"학생위치찾기_02_학번입력_v{VERSION}_20260813.png"),
    3: source(f"학생위치찾기_03_현재위치결과_v{VERSION}_20260813.png"),
    4: source(f"학생위치찾기_04_동명이인후보_v{VERSION}_20260813.png"),
    5: source(f"학생위치찾기_05_검색결과없음_v{VERSION}_20260813.png"),
    6: source(f"학생위치찾기_06_검색도우미_v{VERSION}_20260813.png"),
}
LOGO = ROOT / "src" / "assets" / "ungcheon-logo.png"


def crop_annotated(
    filename: str,
    source_path: Path,
    box: tuple[int, int, int, int],
    markers: tuple[tuple[int, int, int, str], ...] = (),
    outlines: tuple[tuple[tuple[int, int, int, int], str, int], ...] = (),
) -> Path:
    out = EDITED / filename
    with Image.open(source_path) as original:
        image = original.convert("RGB").crop(box)
    draw = ImageDraw.Draw(image)
    for rect, color, width in outlines:
        draw.rounded_rectangle(rect, radius=12, outline=color, width=width)
    for number, x, y, color in markers:
        radius = 20
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline="white", width=3)
        label = str(number)
        bounds = draw.textbbox((0, 0), label, font=PIL_BOLD)
        draw.text(
            (x - (bounds[2] - bounds[0]) / 2, y - (bounds[3] - bounds[1]) / 2 - 2),
            label,
            font=PIL_BOLD,
            fill="white",
        )
    image.save(out, quality=96)
    return out


ENTRY_FULL = crop_annotated(
    "학생위치찾기_전체화면_번호표시.png",
    S[1],
    (0, 43, 1385, 650),
    markers=(
        (1, 27, 478, "#087C73"),
        (2, 749, 142, "#7146CC"),
        (3, 1316, 142, "#C96B00"),
        (4, 1254, 38, "#187AA5"),
    ),
    outlines=(
        ((5, 451, 50, 505), "#087C73", 4),
        ((294, 100, 1282, 183), "#7146CC", 4),
    ),
)
ENTRY_PANEL = crop_annotated(
    "학생위치찾기_검색영역_번호표시.png",
    S[1],
    (285, 55, 1370, 246),
    markers=((1, 70, 132, "#7146CC"), (2, 1036, 132, "#C96B00"), (3, 945, 27, "#187AA5")),
)
INPUT_PANEL = crop_annotated(
    "학생위치찾기_학번입력_번호표시.png",
    S[2],
    (285, 55, 1370, 246),
    markers=((1, 302, 133, "#087C73"), (2, 1036, 132, "#C96B00")),
)
RESULT_PANEL = crop_annotated(
    "학생위치찾기_현재위치결과_번호표시.png",
    S[3],
    (285, 55, 1370, 470),
    markers=(
        (1, 46, 221, "#7146CC"),
        (2, 52, 332, "#C96B00"),
        (3, 434, 302, "#087C73"),
        (4, 657, 302, "#187AA5"),
        (5, 885, 302, "#3E8751"),
    ),
)
DUP_PANEL = crop_annotated(
    "학생위치찾기_동명이인후보_번호표시.png",
    S[4],
    (285, 55, 1370, 500),
    markers=(
        (1, 63, 222, "#7146CC"),
        (2, 78, 312, "#087C73"),
        (3, 548, 312, "#187AA5"),
        (4, 78, 389, "#C96B00"),
    ),
)
EMPTY_PANEL = crop_annotated(
    "학생위치찾기_검색없음_번호표시.png",
    S[5],
    (285, 55, 1370, 430),
    markers=((1, 540, 264, "#B83D48"), (2, 945, 27, "#187AA5")),
)
HELP_PANEL = crop_annotated(
    "학생위치찾기_검색도우미_번호표시.png",
    S[6],
    (375, 28, 1160, 790),
    markers=((1, 386, 105, "#7146CC"), (2, 87, 245, "#087C73"), (3, 687, 242, "#C96B00")),
)


def rounded(c: canvas.Canvas, x, y, w, h, fill, stroke=LINE, radius=10, line_width=1):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(line_width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def shadow_card(c: canvas.Canvas, x, y, w, h, fill=WHITE, stroke=LINE, radius=13):
    c.setFillColor(SHADOW)
    c.roundRect(x + 4, y - 4, w, h, radius, fill=1, stroke=0)
    rounded(c, x, y, w, h, fill, stroke, radius, 0.8)


def draw_text(c: canvas.Canvas, value: str, x: float, y: float, size=10, color=INK, bold=False, align="left"):
    c.setFillColor(color)
    c.setFont("MalgunBold" if bold else "Malgun", size)
    if align == "center":
        c.drawCentredString(x, y, value)
    elif align == "right":
        c.drawRightString(x, y, value)
    else:
        c.drawString(x, y, value)


def wrapped(
    c: canvas.Canvas,
    value: str,
    x: float,
    y: float,
    width: float,
    size=10,
    leading=16,
    color=INK,
    bold=False,
    max_lines: int | None = None,
):
    font = "MalgunBold" if bold else "Malgun"
    c.setFont(font, size)
    c.setFillColor(color)
    lines: list[str] = []
    for paragraph in value.split("\n"):
        current = ""
        for char in paragraph:
            candidate = current + char
            if not current or pdfmetrics.stringWidth(candidate, font, size) <= width:
                current = candidate
            else:
                lines.append(current.rstrip())
                current = char.lstrip()
        lines.append(current)
    if max_lines is not None:
        lines = lines[:max_lines]
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def place_image(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float, pad=7, shadow=True):
    with Image.open(path) as image:
        iw, ih = image.size
    scale = min((w - pad * 2) / iw, (h - pad * 2) / ih)
    dw, dh = iw * scale, ih * scale
    fw, fh = dw + pad * 2, dh + pad * 2
    fx, fy = x + (w - fw) / 2, y + (h - fh) / 2
    if shadow:
        c.setFillColor(SHADOW)
        c.roundRect(fx + 4, fy - 4, fw, fh, 11, fill=1, stroke=0)
    rounded(c, fx, fy, fw, fh, WHITE, LINE, 11, 0.8)
    c.drawImage(str(path), fx + pad, fy + pad, dw, dh, preserveAspectRatio=True, mask="auto")
    return fx, fy, fw, fh


def pill(c: canvas.Canvas, label: str, x: float, y: float, fill=PALE_TEAL, color=TEAL, size=8.4, pad=10):
    w = pdfmetrics.stringWidth(label, "MalgunBold", size) + pad * 2
    rounded(c, x, y, w, 22, fill, fill, 11, 0)
    draw_text(c, label, x + pad, y + 6.5, size, color, True)
    return w


def number_badge(c: canvas.Canvas, number: int, x: float, y: float, color=TEAL, radius=12):
    c.setFillColor(color)
    c.circle(x, y, radius, fill=1, stroke=0)
    draw_text(c, str(number), x, y - 4, 9.5, WHITE, True, "center")


def note_card(c: canvas.Canvas, number: int, title: str, body: str, x: float, y: float, w: float, h=66, color=TEAL, fill=WHITE):
    shadow_card(c, x, y - h, w, h, fill, LINE, 11)
    number_badge(c, number, x + 23, y - 22, color)
    draw_text(c, title, x + 43, y - 18, 10.5, NAVY, True)
    wrapped(c, body, x + 43, y - 38, w - 57, 7.9, 11.5, MUTED, max_lines=3)


def simple_card(c: canvas.Canvas, title: str, body: str, x: float, y: float, w: float, h: float, color=TEAL, fill=WHITE):
    shadow_card(c, x, y, w, h, fill, LINE, 12)
    c.setFillColor(color)
    c.roundRect(x, y, 6, h, 3, fill=1, stroke=0)
    draw_text(c, title, x + 20, y + h - 25, 10.8, NAVY, True)
    wrapped(c, body, x + 20, y + h - 47, w - 36, 8.4, 13, MUTED, max_lines=5)


def page_base(c: canvas.Canvas, page: int, section: str, dark=False):
    c.setFillColor(NAVY if dark else PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    if not dark:
        c.setStrokeColor(LINE)
        c.line(38, 47, PAGE_W - 38, 47)
    draw_text(c, f"MENU 03  ·  {section}", 40, PAGE_H - 29, 8.4, PALE_TEAL if dark else TEAL, True)
    draw_text(c, f"웅천고 업무도우미 v{VERSION}", PAGE_W - 40, PAGE_H - 29, 8.4, WHITE if dark else MUTED, False, "right")
    draw_text(c, f"{DATE}  |  {page}/{TOTAL_PAGES}", PAGE_W - 40, 27, 7.8, SUBTLE if not dark else HexColor("#BAC5D2"), False, "right")
    draw_text(c, "학생 이름·학번은 개인정보 보호를 위해 가렸습니다.", 40, 27, 7.8, SUBTLE if not dark else HexColor("#BAC5D2"))


def page_title(c: canvas.Canvas, kicker: str, title: str, subtitle: str):
    pill(c, kicker, 40, PAGE_H - 75, PALE_TEAL, TEAL)
    draw_text(c, title, 40, PAGE_H - 116, 22, NAVY, True)
    wrapped(c, subtitle, 40, PAGE_H - 140, PAGE_W - 80, 9.3, 14, MUTED, max_lines=2)


def arrow(c: canvas.Canvas, x1: float, y: float, x2: float, color=TEAL):
    c.setStrokeColor(color)
    c.setLineWidth(2.2)
    c.line(x1, y, x2, y)
    c.line(x2 - 8, y + 5, x2, y)
    c.line(x2 - 8, y - 5, x2, y)


def page_1(c: canvas.Canvas):
    page_base(c, 1, "학생 위치 찾기", dark=True)
    pill(c, "하루 한 메뉴 · 03", 48, PAGE_H - 79, PALE_GOLD, GOLD_DARK)
    draw_text(c, "학생 위치 찾기", 48, PAGE_H - 135, 31, WHITE, True)
    wrapped(
        c,
        "“이 학생, 지금 어느 교실에서 무슨 수업 중일까요?”\n학번이나 이름만 입력하면 현재 교시의 수업·교실·담당 교사를 한 번에 보여줍니다.",
        48,
        PAGE_H - 171,
        700,
        12,
        20,
        HexColor("#DCE5EE"),
        max_lines=3,
    )
    x = 48
    for label, fill, color in (
        ("4·5자리 학번", PALE_CYAN, CYAN),
        ("이름·동명이인 선택", PALE_PURPLE, PURPLE),
        ("현재 교실 바로 확인", PALE_TEAL, TEAL),
    ):
        x += pill(c, label, x, PAGE_H - 240, fill, color, 9.1, 12) + 10
    place_image(c, RESULT_PANEL, 45, 72, PAGE_W - 90, 280, pad=8)
    draw_text(c, "학번과 이름은 가렸지만, 실제 화면의 수업·교실·담당 교사 정보는 그대로 보여드렸습니다.", 51, 58, 8.1, HexColor("#C9D4DF"))
    c.showPage()


def page_2(c: canvas.Canvas):
    page_base(c, 2, "30초 사용 흐름")
    page_title(c, "30초 사용 흐름", "찾는 순서는 딱 네 단계입니다", "처음 쓰는 선생님도 아래 순서만 따라가면 바로 확인할 수 있습니다.")
    steps = [
        ("1", "메뉴 열기", "왼쪽 메뉴에서\n학생 위치 찾기"),
        ("2", "학번·이름 입력", "4자리 학번 권장\n기존 5자리도 가능"),
        ("3", "후보 선택", "동명이인이면\n학급·번호 확인"),
        ("4", "현재 위치 확인", "수업·교실·\n담당 교사 확인"),
    ]
    sx = 42
    for idx, (num, title, body) in enumerate(steps):
        w = 178
        fill = [PALE_TEAL, PALE_CYAN, PALE_PURPLE, PALE_GOLD][idx]
        color = [TEAL, CYAN, PURPLE, GOLD_DARK][idx]
        shadow_card(c, sx, 342, w, 96, fill, fill, 14)
        c.setFillColor(color)
        c.circle(sx + 28, 414, 15, fill=1, stroke=0)
        draw_text(c, num, sx + 28, 409.5, 11, WHITE, True, "center")
        draw_text(c, title, sx + 51, 410, 11.2, NAVY, True)
        wrapped(c, body, sx + 20, 383, w - 40, 8.7, 14, INK, max_lines=3)
        if idx < 3:
            arrow(c, sx + w + 7, 394, sx + w + 23, MUTED)
        sx += 198
    place_image(c, ENTRY_PANEL, 40, 82, 510, 245, pad=7)
    simple_card(c, "검색 전에 이것만 기억하세요", "• 1101과 10101은 같은 학생으로 찾습니다.\n• 결과 화면의 학번은 4자리로 통일됩니다.\n• 이름 검색은 정확한 전체 이름이 가장 빠릅니다.\n• 자료가 오래되어 보이면 새로고침을 눌러 주세요.", 575, 91, 225, 225, TEAL, WHITE)
    c.showPage()


def page_3(c: canvas.Canvas):
    page_base(c, 3, "화면 익히기")
    page_title(c, "화면 익히기", "무엇을 어디에서 눌러야 할까요?", "아래 번호와 오른쪽 설명을 함께 보면 메뉴 구조가 한눈에 들어옵니다.")
    place_image(c, ENTRY_FULL, 37, 77, 538, 420, pad=6)
    note_card(c, 1, "학생 위치 찾기 메뉴", "왼쪽 메뉴에서 이 항목을 누르면 검색 화면이 열립니다.", 595, 490, 205, 68, TEAL)
    note_card(c, 2, "학번·이름 입력칸", "4자리/5자리 학번 또는 학생 이름을 직접 입력합니다.", 595, 407, 205, 68, PURPLE)
    note_card(c, 3, "찾기 버튼", "입력을 마친 뒤 누르면 후보 또는 현재 위치가 나타납니다.", 595, 324, 205, 68, ORANGE)
    note_card(c, 4, "새로고침", "명렬·시간표가 바뀌었거나 결과가 이상할 때 최신 자료를 다시 받습니다.", 595, 241, 205, 78, CYAN)
    rounded(c, 595, 64, 205, 84, PALE_GOLD, PALE_GOLD, 12, 0)
    draw_text(c, "동료 선생님께 이렇게 안내해 보세요", 614, 125, 9.5, GOLD_DARK, True)
    wrapped(c, "“왼쪽 학생 위치 찾기를 누르고, 검색창에 학번이나 이름을 넣은 다음 찾기만 누르면 됩니다.”", 614, 102, 168, 8.1, 12, INK, max_lines=4)
    c.showPage()


def page_4(c: canvas.Canvas):
    page_base(c, 4, "학번으로 찾기")
    page_title(c, "학번으로 찾기", "4자리로 입력해도, 기존 5자리로 입력해도 됩니다", "학교 안에서 자주 쓰는 4자리 학번을 권장하며, 예전 5자리 표기도 같은 학생으로 연결합니다.")
    place_image(c, INPUT_PANEL, 40, 250, PAGE_W - 80, 190, pad=7)
    cards = [
        ("4자리 권장", "예: 1101, 2728\n학년·반·번호를 이어 입력합니다.", TEAL, PALE_TEAL),
        ("기존 5자리도 검색", "예: 10101, 20728\n기존 표기라도 같은 학생을 찾습니다.", CYAN, PALE_CYAN),
        ("결과는 4자리 통일", "화면 표시와 새로 넣는 학생 자료는\n4자리 학번으로 통일됩니다.", PURPLE, PALE_PURPLE),
    ]
    x = 40
    for title, body, color, fill in cards:
        simple_card(c, title, body, x, 112, 238, 133, color, fill)
        x += 261
    rounded(c, 40, 68, PAGE_W - 80, 30, PALE_GOLD, PALE_GOLD, 9, 0)
    draw_text(c, "개인정보 보호", 55, 78, 8.2, GOLD_DARK, True)
    draw_text(c, "설명서의 검색값은 가렸습니다. 실제 앱에서는 입력한 학번을 그대로 확인할 수 있습니다.", 133, 78, 8.2, INK)
    c.showPage()


def page_5(c: canvas.Canvas):
    page_base(c, 5, "이름·동명이인 찾기")
    page_title(c, "이름·동명이인 찾기", "같은 이름이 여러 명이면, 학급과 번호를 보고 고릅니다", "이름으로 찾을 때 후보가 한 명이면 바로 결과가 열리고, 여러 명이면 선택 화면이 먼저 나타납니다.")
    place_image(c, DUP_PANEL, 36, 84, 548, 414, pad=6)
    note_card(c, 1, "후보 인원 확인", "‘동명이인·검색 후보 3명’처럼 찾은 학생 수가 먼저 표시됩니다.", 603, 495, 198, 74, PURPLE)
    note_card(c, 2, "첫 번째 후보", "학생 이름 아래의 학번·학급·번호를 확인합니다.", 603, 405, 198, 68, TEAL)
    note_card(c, 3, "다른 학급 후보", "같은 이름이어도 학년과 반이 다를 수 있으니 꼭 비교합니다.", 603, 322, 198, 74, CYAN)
    note_card(c, 4, "정확한 학생 클릭", "맞는 학생 카드 하나를 누르면 현재 위치 화면으로 넘어갑니다.", 603, 232, 198, 74, ORANGE)
    rounded(c, 603, 65, 198, 82, PALE_RED, PALE_RED, 12, 0)
    draw_text(c, "실수 방지 팁", 620, 123, 10, RED, True)
    wrapped(c, "이름만 보고 누르지 말고 학급·번호까지 확인해 주세요. 학생 이름과 학번은 이 설명서에서 모두 가렸습니다.", 620, 101, 166, 8.1, 12, INK, max_lines=4)
    c.showPage()


def page_6(c: canvas.Canvas):
    page_base(c, 6, "결과 읽기")
    page_title(c, "결과 읽기", "현재 위치 결과는 이렇게 읽으면 됩니다", "왼쪽은 학생과 현재 시각, 오른쪽은 바로 확인해야 할 수업·교실·담당 교사입니다.")
    place_image(c, RESULT_PANEL, 36, 78, 552, 421, pad=6)
    note_card(c, 1, "학생 확인", "선택한 학생의 이름과 학번·학급·번호가 표시됩니다.", 607, 496, 194, 68, PURPLE)
    note_card(c, 2, "현재 시각·교시", "오늘 요일, 현재 시각과 해당 교시 운영 시간을 보여줍니다.", 607, 414, 194, 74, ORANGE)
    note_card(c, 3, "수업", "학생이 지금 듣는 과목명을 확인합니다.", 607, 324, 194, 62, TEAL)
    note_card(c, 4, "교실", "학생이 있어야 할 교실 또는 수업 장소입니다.", 607, 250, 194, 62, CYAN)
    note_card(c, 5, "담당 교사", "해당 교시 수업을 맡은 선생님을 확인합니다.", 607, 176, 194, 62, GREEN)
    rounded(c, 607, 61, 194, 44, PALE_GOLD, PALE_GOLD, 11, 0)
    wrapped(c, "표시 내용은 업무 편의를 위한 정보이며 실제 나이스 입력을 대신하지 않습니다.", 622, 91, 164, 7.6, 10, INK, max_lines=3)
    c.showPage()


def page_7(c: canvas.Canvas):
    page_base(c, 7, "시간표 반영 원리")
    page_title(c, "시간표 반영 원리", "수업교체·대강이 승인되면 학생 위치에도 반영됩니다", "학생별 이동수업 자료와 학교 시간표, 승인된 변경 기록을 합쳐 오늘의 위치를 계산합니다.")
    boxes = [
        ("관리자 업로드\n학생별 시간표", PALE_TEAL, TEAL),
        ("학교 공유\n학급 시간표", PALE_CYAN, CYAN),
        ("승인된\n교환·대강", PALE_PURPLE, PURPLE),
        ("오늘의 수업·\n교실·담당 교사", PALE_GOLD, GOLD_DARK),
    ]
    x = 45
    for idx, (label, fill, color) in enumerate(boxes):
        rounded(c, x, 352, 166, 91, fill, fill, 16, 0)
        c.setFillColor(color)
        c.circle(x + 30, 397, 16, fill=1, stroke=0)
        draw_text(c, str(idx + 1), x + 30, 392.5, 11, WHITE, True, "center")
        wrapped(c, label, x + 56, 408, 96, 10, 16, NAVY, True, max_lines=2)
        if idx < len(boxes) - 1:
            arrow(c, x + 171, 397, x + 194, MUTED)
        x += 202
    simple_card(c, "승인된 변경만 반영", "수업교체·대강 요청이 승인되면 교사와 학급 일정에 반영되고, 학생 위치 결과도 함께 바뀝니다.", 45, 191, 235, 125, PURPLE, PALE_PURPLE)
    simple_card(c, "특별 운영일도 적용", "화요일이지만 월요일 시간표로 운영하는 날처럼 특별 운영일이 지정되면, 그 운영 요일의 시간표를 기준으로 찾습니다.", 303, 191, 235, 125, CYAN, PALE_CYAN)
    simple_card(c, "실제 상황과 다르면", "행사·긴급 교실 변경처럼 앱에 아직 등록되지 않은 사항은 학교 안내를 먼저 확인하고 새로고침해 주세요.", 561, 191, 235, 125, ORANGE, PALE_ORANGE)
    rounded(c, 45, 86, 751, 75, WHITE, LINE, 12, 1)
    draw_text(c, "기억할 점", 62, 136, 10.2, TEAL_DARK, True)
    wrapped(c, "이 기능은 나이스와 별개로 제공되는 학교 업무 편의 기능입니다. 앱의 결과가 실제 수업 운영과 다르면 담당 부서의 최신 안내가 우선입니다.", 62, 113, 710, 8.7, 14, INK, max_lines=3)
    c.showPage()


def page_8(c: canvas.Canvas):
    page_base(c, 8, "결과가 이상할 때")
    page_title(c, "결과가 이상할 때", "‘일치하는 학생이 없습니다’가 떠도 당황하지 마세요", "입력값과 최신 자료 여부를 차례로 확인하면 대부분 바로 해결됩니다.")
    place_image(c, EMPTY_PANEL, 40, 260, PAGE_W - 80, 175, pad=7)
    cards = [
        ("① 학번 다시 확인", "4자리 학번인지, 숫자가 뒤바뀌지 않았는지 확인합니다.", TEAL, PALE_TEAL),
        ("② 이름 철자 확인", "이름은 정확한 전체 이름으로 다시 검색해 봅니다.", PURPLE, PALE_PURPLE),
        ("③ 새로고침", "명렬·시간표가 갱신된 직후라면 오른쪽 위 새로고침을 누릅니다.", CYAN, PALE_CYAN),
        ("④ 관리자 자료 확인", "계속 없으면 학생 명렬 또는 학생별 시간표 업로드 여부를 확인합니다.", ORANGE, PALE_ORANGE),
    ]
    x = 40
    for title, body, color, fill in cards:
        simple_card(c, title, body, x, 116, 180, 128, color, fill)
        x += 198
    rounded(c, 40, 68, PAGE_W - 80, 32, PALE_GOLD, PALE_GOLD, 9, 0)
    draw_text(c, "쉬는 시간·점심·주말", 55, 79, 8.4, GOLD_DARK, True)
    draw_text(c, "정규 수업 시간이 아니면 ‘현재 정규 수업 시간이 아닙니다’, 주말에는 ‘현재 수업이 없습니다’라고 안내합니다.", 157, 79, 8.2, INK)
    c.showPage()


def page_9(c: canvas.Canvas):
    page_base(c, 9, "검색도우미")
    page_title(c, "검색도우미", "메뉴 이름이 생각나지 않으면 말하듯 검색하세요", "상단 업무 검색(Ctrl+K)에 하고 싶은 일을 적으면 메뉴와 사용 순서를 함께 알려줍니다.")
    place_image(c, HELP_PANEL, 38, 76, 520, 350, pad=6)
    note_card(c, 1, "하고 싶은 일 입력", "“학생이 지금 어느 교실에 있는지 찾고 싶어”처럼 자연스럽게 적습니다.", 579, 491, 222, 76, PURPLE)
    note_card(c, 2, "사용 순서 확인", "‘학생 현재 수업·교실 찾기’ 카드에서 4·5자리 검색과 동명이인 선택 방법을 읽습니다.", 579, 400, 222, 82, TEAL)
    note_card(c, 3, "바로가기", "카드 오른쪽의 바로가기를 누르면 학생 위치 찾기 메뉴로 즉시 이동합니다.", 579, 303, 222, 76, ORANGE)
    rounded(c, 579, 63, 222, 148, PALE_CYAN, PALE_CYAN, 12, 0)
    draw_text(c, "이렇게 물어보세요", 597, 181, 10.3, CYAN, True)
    examples = [
        "학생이 지금 어느 교실에 있는지 찾고 싶어",
        "학생 위치 찾기 어디 있어?",
        "4자리 학번으로 학생 찾는 방법",
    ]
    for idx, (example, yy) in enumerate(zip(examples, (150, 108, 76)), start=1):
        draw_text(c, f"{idx}.", 598, yy, 8.5, CYAN, True)
        wrapped(c, example, 617, yy, 166, 8.2, 12, INK, max_lines=2)
    c.showPage()


def page_10(c: canvas.Canvas):
    page_base(c, 10, "한 장 요약")
    page_title(c, "한 장 요약", "동료 선생님께는 이 한 줄만 알려주셔도 됩니다", "학생 위치 찾기 → 학번 또는 이름 입력 → 동명이인이면 후보 선택 → 현재 수업·교실·담당 교사 확인")
    rounded(c, 42, 350, PAGE_W - 84, 88, NAVY, NAVY, 16, 0)
    draw_text(c, "학생 위치 찾기", 66, 398, 14, WHITE, True)
    arrow(c, 178, 395, 220, PALE_TEAL)
    draw_text(c, "학번·이름 입력", 238, 398, 14, WHITE, True)
    arrow(c, 359, 395, 401, PALE_TEAL)
    draw_text(c, "후보 선택", 419, 398, 14, WHITE, True)
    arrow(c, 505, 395, 547, PALE_TEAL)
    draw_text(c, "수업·교실·교사 확인", 565, 398, 14, WHITE, True)
    checklist = [
        ("4자리 학번을 권장하며 5자리도 검색 가능", TEAL),
        ("1·2·3학년 학생을 학번 또는 이름으로 검색", CYAN),
        ("동명이인은 학급·번호를 보고 정확히 선택", PURPLE),
        ("승인된 수업교체·대강과 특별 운영일 반영", ORANGE),
        ("결과가 이상하면 새로고침 후 최신 안내 확인", GREEN),
    ]
    x, y = 52, 290
    for idx, (label, color) in enumerate(checklist):
        col = idx % 2
        row = idx // 2
        xx = x + col * 380
        yy = y - row * 62
        rounded(c, xx, yy, 352, 46, WHITE, LINE, 11, 1)
        c.setFillColor(color)
        c.circle(xx + 24, yy + 23, 12, fill=1, stroke=0)
        draw_text(c, "✓", xx + 24, yy + 18.5, 10, WHITE, True, "center")
        draw_text(c, label, xx + 46, yy + 18, 9.2, INK, True)
    rounded(c, 52, 59, 732, 83, PALE_GOLD, PALE_GOLD, 13, 0)
    draw_text(c, "마지막으로 꼭 기억해 주세요", 70, 114, 10.8, GOLD_DARK, True)
    wrapped(c, "학생 위치 찾기는 수업 중 학생을 빠르게 찾기 위한 편의 도구입니다. 실제 나이스 입력을 바꾸지 않으며, 긴급한 상황에서는 학교의 공식 연락과 최신 안내를 함께 확인해 주세요.", 70, 89, 695, 8.7, 14, INK, max_lines=3)
    c.showPage()


def build():
    c = canvas.Canvas(str(PDF_PATH), pagesize=landscape(A4))
    c.setTitle(f"웅천고 업무도우미 메뉴 소개 03 - 학생 위치 찾기 v{VERSION}")
    c.setAuthor("웅천고등학교")
    c.setSubject("학생 위치 찾기 메뉴 사용 안내")
    for page in (page_1, page_2, page_3, page_4, page_5, page_6, page_7, page_8, page_9, page_10):
        page(c)
    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    build()
