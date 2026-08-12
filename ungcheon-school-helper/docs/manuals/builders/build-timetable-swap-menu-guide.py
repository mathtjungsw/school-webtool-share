from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[3]
ASSET_ROOT = ROOT / "manual-assets" / "교환대강계획"
SOURCE = ASSET_ROOT / "원본캡처"
EDITED = ASSET_ROOT / "편집캡처"
OUTPUT = ROOT / "output" / "pdf"
EDITED.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)

VERSION = "1.1.11"
DATE = "2026.08.13."
TOTAL_PAGES = 14
PDF_PATH = OUTPUT / f"웅천고_업무도우미_메뉴소개_02_교환대강계획_v{VERSION}.pdf"

FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")
pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))
PIL_BOLD = ImageFont.truetype(str(FONT_BOLD), 22)

PAGE_W, PAGE_H = landscape(A4)

# Editorial palette: the app's purple is kept as the feature color, while navy
# and warm gold make the guide feel distinct from the application screen.
PAPER = HexColor("#F7F6F1")
WHITE = white
NAVY = HexColor("#132238")
INK = HexColor("#253247")
MUTED = HexColor("#697588")
SUBTLE = HexColor("#929CAB")
LINE = HexColor("#DDE2E8")
SHADOW = HexColor("#E5E2D9")
GOLD = HexColor("#D9B800")
GOLD_DARK = HexColor("#927600")
PALE_GOLD = HexColor("#FFF6CF")
PURPLE = HexColor("#7346D8")
PURPLE_DARK = HexColor("#50309B")
PALE_PURPLE = HexColor("#F1EDFF")
TEAL = HexColor("#087C73")
PALE_TEAL = HexColor("#E8F6F3")
BLUE = HexColor("#2E6BE6")
PALE_BLUE = HexColor("#EDF3FF")
ORANGE = HexColor("#D87300")
PALE_ORANGE = HexColor("#FFF0DD")
RED = HexColor("#B83D48")
PALE_RED = HexColor("#FCECEE")


def source(name: str) -> Path:
    path = SOURCE / name
    if not path.exists():
        raise FileNotFoundError(path)
    return path


S = {
    1: source(f"교환대강계획_01_메뉴진입_v{VERSION}_20260813.png"),
    2: source(f"교환대강계획_02_수업선택과후보_v{VERSION}_20260813.png"),
    3: source(f"교환대강계획_03_교환후보목록_v{VERSION}_20260813.png"),
    4: source(f"교환대강계획_04_상대교사예상시간표_v{VERSION}_20260813.png"),
    5: source(f"교환대강계획_05_연강경고와계획서추가_v{VERSION}_20260813.png"),
    6: source(f"교환대강계획_06_대강교사찾기탭_v{VERSION}_20260813.png"),
    7: source(f"교환대강계획_07_대강가능교사목록_v{VERSION}_20260813.png"),
    8: source(f"교환대강계획_08_공동공강교사선택_v{VERSION}_20260813.png"),
    9: source(f"교환대강계획_09_공동공강결과_v{VERSION}_20260813.png"),
    10: source(f"교환대강계획_10_계획서편집_v{VERSION}_20260813.png"),
    11: source(f"교환대강계획_11_출력과반영요청_v{VERSION}_20260813.png"),
    12: source(f"교환대강계획_12_양식미리보기_v{VERSION}_20260813.png"),
    13: source(f"교환대강계획_13_대강후예상시간표_v{VERSION}_20260813.png"),
}
LOGO = ROOT / "src" / "assets" / "ungcheon-logo.png"


def crop_annotated(
    filename: str,
    source_path: Path,
    box: tuple[int, int, int, int],
    markers: tuple[tuple[int, int, int, str], ...] = (),
    outlines: tuple[tuple[tuple[int, int, int, int], str, int], ...] = (),
) -> Path:
    """Make a stable crop and add only restrained numeric callouts."""
    out = EDITED / filename
    with Image.open(source_path) as original:
        image = original.convert("RGB").crop(box)
    draw = ImageDraw.Draw(image)
    for rect, color, width in outlines:
        draw.rounded_rectangle(rect, radius=12, outline=color, width=width)
    for number, x, y, color in markers:
        radius = 20
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline="white", width=3)
        text = str(number)
        bbox = draw.textbbox((0, 0), text, font=PIL_BOLD)
        draw.text(
            (x - (bbox[2] - bbox[0]) / 2, y - (bbox[3] - bbox[1]) / 2 - 2),
            text,
            font=PIL_BOLD,
            fill="white",
        )
    image.save(out, quality=96)
    return out


# Crops remove the application chrome and preserve the actual working screen.
OVERVIEW = crop_annotated(
    "교환대강_전체화면_번호표시.png", S[1], (226, 46, 1270, 798),
    markers=((1, 95, 122, "#7346D8"), (2, 862, 226, "#087C73"), (3, 915, 650, "#D87300")),
)
EXCHANGE_SELECT = crop_annotated(
    "교환대강_수업선택_번호표시.png", S[2], (226, 138, 1270, 798),
    markers=((1, 908, 566, "#087C73"), (2, 130, 466, "#D87300"), (3, 495, 302, "#7346D8")),
)
CANDIDATES = crop_annotated(
    "교환대강_교환후보카드_번호표시.png", S[3], (80, 430, 1270, 798),
    markers=((1, 45, 58, "#7346D8"), (2, 565, 167, "#D87300"), (3, 1030, 271, "#087C73")),
)
EXCHANGE_PREVIEW = crop_annotated(
    "교환대강_상대교사예상시간표.png", S[5], (80, 106, 1270, 791),
    markers=((1, 34, 50, "#7346D8"), (2, 583, 304, "#2E6BE6"), (3, 154, 570, "#B83D48"), (4, 1081, 626, "#087C73")),
)
SUB_TOP = crop_annotated(
    "교환대강_대강수업선택.png", S[6], (80, 47, 1270, 798),
    markers=((1, 172, 120, "#7346D8"), (2, 912, 620, "#087C73"), (3, 476, 524, "#D87300")),
)
SUB_LIST = crop_annotated(
    "교환대강_대강교사후보.png", S[7], (80, 420, 1270, 798),
    markers=((1, 45, 57, "#7346D8"), (2, 548, 164, "#D87300"), (3, 1035, 278, "#087C73")),
)
SUB_PREVIEW = crop_annotated(
    "교환대강_대강예상시간표.png", S[13], (80, 105, 1270, 792),
    markers=((1, 34, 51, "#7346D8"), (2, 615, 308, "#2E6BE6"), (3, 157, 568, "#B83D48"), (4, 1080, 625, "#087C73")),
)
COMMON_SELECT = crop_annotated(
    "교환대강_공동공강교사선택.png", S[8], (80, 48, 1270, 794),
    markers=((1, 367, 119, "#7346D8"), (2, 97, 274, "#087C73"), (3, 139, 432, "#D87300")),
)
COMMON_RESULT = crop_annotated(
    "교환대강_공동공강결과.png", S[9], (80, 47, 1270, 794),
    markers=((1, 91, 273, "#7346D8"), (2, 1083, 666, "#087C73")),
)
PLAN_EDIT = crop_annotated(
    "교환대강_계획서편집.png", S[10], (80, 91, 1270, 794),
    markers=((1, 58, 87, "#087C73"), (2, 79, 301, "#7346D8"), (3, 1023, 588, "#D87300")),
)
PLAN_REQUESTS = crop_annotated(
    "교환대강_승인과우선반영.png", S[11], (80, 268, 1270, 797),
    markers=((1, 1008, 210, "#7346D8"), (2, 1005, 413, "#087C73"), (3, 1102, 412, "#B83D48")),
)
OUTPUT_PREVIEW = crop_annotated(
    "교환대강_출력미리보기.png", S[12], (56, 45, 1220, 794),
    markers=((1, 930, 35, "#7346D8"), (2, 1038, 35, "#087C73"), (3, 575, 347, "#D87300")),
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


def pill(c: canvas.Canvas, label: str, x: float, y: float, fill=PALE_PURPLE, color=PURPLE, size=8.4, pad=10):
    w = pdfmetrics.stringWidth(label, "MalgunBold", size) + pad * 2
    rounded(c, x, y, w, 22, fill, fill, 11, 0)
    draw_text(c, label, x + pad, y + 6.5, size, color, True)
    return w


def number_badge(c: canvas.Canvas, number: int, x: float, y: float, color=PURPLE, radius=12):
    c.setFillColor(color)
    c.circle(x, y, radius, fill=1, stroke=0)
    draw_text(c, str(number), x, y - 4, 9.5, WHITE, True, "center")


def note_card(c: canvas.Canvas, number: int, title: str, body: str, x: float, y: float, w: float, h=66, color=PURPLE, fill=WHITE):
    shadow_card(c, x, y - h, w, h, fill, LINE, 11)
    number_badge(c, number, x + 23, y - 22, color)
    draw_text(c, title, x + 43, y - 18, 10.8, NAVY, True)
    wrapped(c, body, x + 43, y - 38, w - 57, 8.1, 12, MUTED, max_lines=3)


def simple_card(c: canvas.Canvas, title: str, body: str, x: float, y: float, w: float, h: float, color=PURPLE, fill=WHITE):
    shadow_card(c, x, y, w, h, fill, LINE, 12)
    c.setFillColor(color)
    c.circle(x + 18, y + h - 22, 4, fill=1, stroke=0)
    draw_text(c, title, x + 31, y + h - 27, 10.4, NAVY, True)
    wrapped(c, body, x + 17, y + h - 52, w - 34, 8.6, 14, MUTED)


def page_shell(c: canvas.Canvas, page: int, title: str, subtitle: str, accent=PURPLE):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H - 7, PAGE_W, 7, fill=1, stroke=0)
    c.drawImage(str(LOGO), 40, PAGE_H - 53, 24, 24, preserveAspectRatio=True, mask="auto")
    draw_text(c, "UNGCHON HIGH SCHOOL", 74, PAGE_H - 38, 7.8, SUBTLE, True)
    draw_text(c, "DAILY FEATURE · 02  |  TIMETABLE CHANGE", 74, PAGE_H - 51, 8.6, accent, True)
    rounded(c, PAGE_W - 97, PAGE_H - 52, 57, 23, WHITE, LINE, 11, 0.8)
    draw_text(c, f"{page:02d} / {TOTAL_PAGES:02d}", PAGE_W - 68.5, PAGE_H - 45, 8.1, MUTED, True, "center")
    draw_text(c, title, 40, PAGE_H - 96, 26, NAVY, True)
    draw_text(c, subtitle, 40, PAGE_H - 119, 10, MUTED)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(40, PAGE_H - 135, PAGE_W - 40, PAGE_H - 135)


def footer(c: canvas.Canvas):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(40, 28, PAGE_W - 40, 28)
    draw_text(c, "웅천고 업무도우미 · 하루 한 기능", 40, 13, 7.5, SUBTLE)
    draw_text(c, f"앱 v{VERSION} · 제작 {DATE}", PAGE_W - 40, 13, 7.5, SUBTLE, align="right")


def arrow(c: canvas.Canvas, x1, y1, x2, y2, color=SUBTLE, width=1.5):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)
    c.line(x2, y2, x2 - 7, y2 + 4)
    c.line(x2, y2, x2 - 7, y2 - 4)


c = canvas.Canvas(str(PDF_PATH), pagesize=landscape(A4))
c.setTitle("웅천고 업무도우미 메뉴 소개 02 - 교환대강 계획")
c.setAuthor("웅천고등학교")
c.setSubject("수업 교환, 대강, 공동 공강, 계획서 출력과 반영을 안내하는 동료 교사용 설명서")

# ---------------------------------------------------------------------------
# 1. Cover
# ---------------------------------------------------------------------------
c.setFillColor(NAVY)
c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
c.setFillColor(GOLD)
c.rect(0, PAGE_H - 8, PAGE_W, 8, fill=1, stroke=0)
c.setFillColor(HexColor("#1B2F4A"))
c.circle(PAGE_W - 40, 64, 190, fill=1, stroke=0)
c.setFillColor(HexColor("#172A43"))
c.circle(PAGE_W - 18, PAGE_H - 28, 125, fill=1, stroke=0)
c.drawImage(str(LOGO), 52, PAGE_H - 108, 54, 54, preserveAspectRatio=True, mask="auto")
rounded(c, 52, PAGE_H - 146, 125, 24, HexColor("#223754"), HexColor("#3B506D"), 12, 0.7)
draw_text(c, "★ 핵심 기능 · 02", 114.5, PAGE_H - 138.5, 8.8, GOLD, True, "center")
draw_text(c, "교환·대강 계획", 52, PAGE_H - 204, 34, WHITE, True)
wrapped(c, "수업을 바꾸기 전에,\n상대 선생님의 하루까지.", 52, PAGE_H - 249, 310, 18, 29, WHITE, True)
wrapped(
    c,
    "가능한 후보를 찾고, 연강을 미리 확인하고, 계획서 작성과 반영 요청까지 한곳에서 이어갑니다.",
    52, PAGE_H - 350, 303, 10.6, 18, HexColor("#C8D3E2"),
)
rounded(c, 52, 86, 298, 77, HexColor("#223754"), HexColor("#3B506D"), 13, 0.8)
draw_text(c, "TODAY'S POINT", 69, 139, 7.8, GOLD, True)
draw_text(c, "후보만 찾는 기능이 아닙니다.", 69, 116, 11.5, WHITE, True)
draw_text(c, "예상 시간표와 연강까지 보고 결정하세요.", 69, 96, 8.8, HexColor("#B9C6D7"))

c.saveState()
c.translate(389, 151)
c.rotate(1.1)
c.setFillColor(HexColor("#0D1829"))
c.roundRect(5, -5, 410, 275, 16, fill=1, stroke=0)
rounded(c, 0, 0, 410, 275, WHITE, HexColor("#75839A"), 16, 0.7)
c.drawImage(str(EXCHANGE_PREVIEW), 12, 12, 386, 251, preserveAspectRatio=True, mask="auto")
c.restoreState()

for label, x, y, fill, color in [
    ("수업 교환", 393, 445, PALE_PURPLE, PURPLE),
    ("대강 찾기", 493, 450, PALE_TEAL, TEAL),
    ("공동 공강", 594, 444, PALE_BLUE, BLUE),
    ("HWP·PDF", 697, 431, PALE_ORANGE, ORANGE),
]:
    pill(c, label, x, y, fill, color, 8.2, 9)
draw_text(c, "선택 → 비교 → 반영 → 출력", 421, 121, 14, WHITE, True)
for idx, (label, color) in enumerate([("후보", PURPLE), ("연강", RED), ("승인", TEAL), ("계획서", GOLD)]):
    x = 421 + idx * 82
    c.setFillColor(color)
    c.circle(x + 4, 96, 3.2, fill=1, stroke=0)
    draw_text(c, label, x + 13, 92, 8.5, HexColor("#C8D3E2"), True)
draw_text(c, f"앱 v{VERSION}  ·  제작 {DATE}", 52, 35, 7.8, HexColor("#8FA0B7"))
c.showPage()

# ---------------------------------------------------------------------------
# 2. Journey overview
# ---------------------------------------------------------------------------
page_shell(c, 2, "교환·대강은 이 순서로 진행됩니다", "처음이라면 아래 다섯 단계만 먼저 기억해 주세요.")
steps = [
    ("01", "내 수업 선택", "바꾸거나 대강이 필요한 수업을 누릅니다.", PURPLE, PALE_PURPLE),
    ("02", "후보 확인", "가능한 교사·수업 후보를 비교합니다.", ORANGE, PALE_ORANGE),
    ("03", "예상 시간표", "상대 교사의 연강과 하루 수업을 봅니다.", RED, PALE_RED),
    ("04", "계획서 작성", "날짜·교시·학반을 확인하고 편집합니다.", BLUE, PALE_BLUE),
    ("05", "승인·출력", "반영을 요청하고 HWP 또는 PDF로 냅니다.", TEAL, PALE_TEAL),
]
for idx, (num, title, body, color, fill) in enumerate(steps):
    x = 40 + idx * 155
    shadow_card(c, x, 305, 140, 139, WHITE, LINE, 13)
    rounded(c, x + 15, 397, 40, 26, fill, fill, 13, 0)
    draw_text(c, num, x + 35, 405, 8.8, color, True, "center")
    draw_text(c, title, x + 15, 369, 11.1, NAVY, True)
    wrapped(c, body, x + 15, 342, 109, 8.4, 14, MUTED, max_lines=3)
    if idx < 4:
        arrow(c, x + 141, 374, x + 153, 374, HexColor("#AAB4C0"), 1.2)

place_image(c, OVERVIEW, 40, 57, 500, 225)
rounded(c, 565, 57, 236, 225, NAVY, NAVY, 14, 0)
draw_text(c, "이 메뉴에서 한 번에", 586, 250, 8.2, GOLD, True)
wrapped(c, "교환 후보 탐색\n대강 가능 교사 탐색\n공동 공강 확인\n상대 교사 예상 시간표\n연강 경고\n계획서 편집·출력\n승인 요청과 날짜별 반영", 586, 219, 190, 10.4, 24, WHITE, True)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 3. Four tabs and source timetable
# ---------------------------------------------------------------------------
page_shell(c, 3, "먼저, 네 개 탭의 역할을 익혀볼까요?", "관리자가 올린 공유 시간표를 읽어 사용하며 원본은 건드리지 않습니다.")
place_image(c, OVERVIEW, 37, 61, 510, 385)
tab_cards = [
    ("수업 교환", "두 수업을 서로 바꿀 때", PURPLE, PALE_PURPLE),
    ("대강 교사 찾기", "해당 교시에 비는 교사를 찾을 때", TEAL, PALE_TEAL),
    ("공동 공강 확인", "여러 교사의 공통 빈 시간을 찾을 때", BLUE, PALE_BLUE),
    ("계획서 편집·출력", "항목 수정·승인 요청·출력할 때", ORANGE, PALE_ORANGE),
]
for idx, (title, body, color, fill) in enumerate(tab_cards):
    x = 574 + (idx % 2) * 119
    y = 337 - (idx // 2) * 123
    simple_card(c, title, body, x, y, 108, 102, color, fill)
rounded(c, 574, 70, 227, 105, PALE_GOLD, HexColor("#E4CF61"), 12, 0.9)
draw_text(c, "원본 시간표 보호", 592, 145, 10.5, GOLD_DARK, True)
wrapped(c, "이 화면의 계획은 현재 PC에 저장됩니다. 교환·대강을 작성하거나 출력해도 관리자가 올린 공유 시간표 원본은 수정되지 않습니다.", 592, 120, 190, 8.5, 14, INK, max_lines=4)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 4. Exchange - choose a class
# ---------------------------------------------------------------------------
page_shell(c, 4, "수업 교환 ① 바꿀 수업을 먼저 누릅니다", "금요일 4교시 논술 수업을 선택한 실제 예시입니다.", PURPLE)
place_image(c, EXCHANGE_SELECT, 37, 59, 562, 386)
note_card(c, 1, "내 수업 선택", "바꾸고 싶은 수업 칸을 누르면 선택 색으로 바뀝니다.", 623, 421, 178, 69, TEAL, PALE_TEAL)
note_card(c, 2, "교환 가능한 후보", "노란 칸에는 상대 교사의 수업 정보가 바로 나타납니다.", 623, 334, 178, 69, ORANGE, PALE_ORANGE)
note_card(c, 3, "색상 제한", "회색 칸은 현재 조건에서는 교환할 수 없는 수업입니다.", 623, 247, 178, 69, PURPLE, PALE_PURPLE)
rounded(c, 623, 66, 178, 92, NAVY, NAVY, 12, 0)
draw_text(c, "화면을 읽는 순서", 641, 132, 9.5, GOLD, True)
wrapped(c, "① 내 수업을 누르고\n② 노란 후보를 살펴본 뒤\n③ 마음에 드는 칸을 다시 누르세요.", 641, 108, 143, 8.5, 15, WHITE)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 5. Exchange candidate cards
# ---------------------------------------------------------------------------
page_shell(c, 5, "수업 교환 ② 아래 후보 카드도 함께 보세요", "같은 후보라도 상대 수업의 요일·교시가 다를 수 있습니다.", ORANGE)
place_image(c, CANDIDATES, 40, 210, 761, 236)
note_card(c, 1, "선택한 수업 확인", "후보 목록 제목에서 내가 고른 요일·교시를 다시 확인합니다.", 40, 177, 238, 85, PURPLE, PALE_PURPLE)
note_card(c, 2, "후보별 비교", "상대 교사 이름과 서로 바뀔 두 수업의 시간·학반·과목이 보입니다.", 302, 177, 238, 85, ORANGE, PALE_ORANGE)
note_card(c, 3, "카드를 눌러 미리보기", "결정하기 전 반드시 ‘예상 시간표 보기’로 상대 교사의 하루를 확인하세요.", 563, 177, 238, 85, TEAL, PALE_TEAL)
rounded(c, 40, 52, 761, 31, PALE_GOLD, PALE_GOLD, 10, 0)
draw_text(c, "TIP  후보 이름이 같아도 상대 수업 시간이 다르면 별도 카드로 나타납니다.", 58, 62, 8.7, GOLD_DARK, True)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 6. Exchange preview and consecutive warning
# ---------------------------------------------------------------------------
page_shell(c, 6, "수업 교환 ③ 상대 교사의 ‘변경 후’를 확인합니다", "이 단계가 교환·대강 계획의 가장 중요한 확인 화면입니다.", RED)
place_image(c, EXCHANGE_PREVIEW, 36, 57, 568, 389)
note_card(c, 1, "누구의 예상 시간표인지", "상대 교사 이름과 교환 결과라는 설명을 먼저 확인합니다.", 626, 421, 175, 69, PURPLE, PALE_PURPLE)
note_card(c, 2, "변경 전 ↔ 변경 후", "보라색 칸이 이동하거나 새로 생긴 수업입니다.", 626, 334, 175, 69, BLUE, PALE_BLUE)
note_card(c, 3, "연강 경고", "2연강이 4연강으로 늘어나는 등 부담이 커지면 빨간 안내가 뜹니다.", 626, 247, 175, 69, RED, PALE_RED)
note_card(c, 4, "계획서에 추가", "상대 시간표까지 확인한 뒤에만 버튼을 눌러 항목을 담습니다.", 626, 160, 175, 69, TEAL, PALE_TEAL)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 7. Substitute - select any class including restricted colors
# ---------------------------------------------------------------------------
page_shell(c, 7, "대강 찾기 ① 대강이 필요한 수업을 고릅니다", "수업 교환과 달리, 색상 제한 수업도 대강 대상으로 선택할 수 있습니다.", TEAL)
place_image(c, SUB_TOP, 37, 58, 562, 388)
note_card(c, 1, "대강 교사 찾기 탭", "상단 탭을 바꾸면 보라색으로 선택 가능한 수업이 표시됩니다.", 623, 421, 178, 69, PURPLE, PALE_PURPLE)
note_card(c, 2, "대강 대상 수업 선택", "대강이 필요한 수업을 누르면 선택 색으로 바뀝니다.", 623, 334, 178, 69, TEAL, PALE_TEAL)
note_card(c, 3, "교환 제한도 선택 가능", "창체·여유 등 교환에서는 제한된 칸도 대강에서는 선택할 수 있습니다.", 623, 247, 178, 83, ORANGE, PALE_ORANGE)
rounded(c, 623, 66, 178, 93, NAVY, NAVY, 12, 0)
draw_text(c, "교환과 대강의 차이", 641, 132, 9.5, GOLD, True)
wrapped(c, "교환은 두 수업을 맞바꾸고, 대강은 그 시간에 비는 다른 교사를 배정합니다.", 641, 106, 143, 8.6, 15, WHITE, max_lines=4)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 8. Substitute candidates and preview
# ---------------------------------------------------------------------------
page_shell(c, 8, "대강 찾기 ② ‘현재 공강’과 수업 수를 비교합니다", "후보 카드를 누르면 대강 후 예상 시간표도 바로 확인할 수 있습니다.", TEAL)
place_image(c, SUB_LIST, 38, 246, 470, 200)
place_image(c, SUB_PREVIEW, 526, 246, 275, 200)
note_card(c, 1, "대강 가능 교사", "선택한 시간에 수업이 없는 교사만 목록에 나타납니다.", 38, 211, 238, 80, PURPLE, PALE_PURPLE)
note_card(c, 2, "당일 수업 수", "현재 몇 시간인지, 대강 후 몇 시간이 되는지 함께 비교합니다.", 298, 211, 238, 80, ORANGE, PALE_ORANGE)
note_card(c, 3, "예상 시간표와 연강", "후보를 눌러 변경 후 시간표와 연강 경고를 반드시 살펴봅니다.", 558, 211, 243, 80, TEAL, PALE_TEAL)
rounded(c, 38, 53, 763, 43, PALE_RED, PALE_RED, 10, 0)
draw_text(c, "배정 가능하다고 해서 부담이 같은 것은 아닙니다. 당일 수업 수와 연강을 함께 보고 정해 주세요.", 57, 68, 8.9, RED, True)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 9. Common free periods
# ---------------------------------------------------------------------------
page_shell(c, 9, "공동 공강: 여러 선생님의 빈 시간을 한 번에", "회의·협의 시간을 잡을 때 시간표를 한 명씩 대조하지 않아도 됩니다.", BLUE)
place_image(c, COMMON_SELECT, 38, 247, 369, 199)
place_image(c, COMMON_RESULT, 434, 247, 367, 199)
note_card(c, 1, "교사를 2명 이상 선택", "이름을 검색하거나 목록에서 눌러 선택 태그를 만듭니다.", 38, 211, 238, 80, PURPLE, PALE_PURPLE)
note_card(c, 2, "공동 공강 개수 확인", "선택한 모든 교사에게 수업이 없는 요일·교시만 결과에 남습니다.", 300, 211, 238, 80, TEAL, PALE_TEAL)
note_card(c, 3, "요일별로 살펴보기", "결과 카드는 월요일부터 금요일까지 나뉘어 표시됩니다.", 562, 211, 239, 80, BLUE, PALE_BLUE)
rounded(c, 38, 54, 763, 41, PALE_GOLD, PALE_GOLD, 10, 0)
draw_text(c, "TIP  선택한 교사가 늘어날수록 모두가 함께 비는 시간은 줄어듭니다.", 57, 68, 8.8, GOLD_DARK, True)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 10. Plan editor
# ---------------------------------------------------------------------------
page_shell(c, 10, "계획서 편집 ① 출력 전에 모든 칸을 고칠 수 있어요", "계획서에 담은 항목은 원본 시간표가 아니라 현재 PC의 작업 목록입니다.", BLUE)
place_image(c, PLAN_EDIT, 37, 58, 566, 389)
note_card(c, 1, "원본 시간표 보호", "계획서를 고쳐도 관리자가 올린 공유 시간표는 수정되지 않습니다.", 626, 421, 175, 69, TEAL, PALE_TEAL)
note_card(c, 2, "기본 정보", "사유·시작일·종료일·작성 교사·작성일을 확인하고 수정합니다.", 626, 334, 175, 69, PURPLE, PALE_PURPLE)
note_card(c, 3, "항목별 직접 편집", "결강일, 실시일, 요일·교시, 학반, 과목, 담당 교사를 모두 고칠 수 있습니다.", 626, 247, 175, 83, ORANGE, PALE_ORANGE)
rounded(c, 626, 66, 175, 92, NAVY, NAVY, 12, 0)
draw_text(c, "삭제가 필요하면", 644, 132, 9.5, GOLD, True)
wrapped(c, "행 오른쪽 ‘삭제’를 누르거나, 전체를 비우려면 ‘전체 삭제’를 사용하세요.", 644, 108, 139, 8.5, 15, WHITE, max_lines=4)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 11. Approval and reflection flow
# ---------------------------------------------------------------------------
page_shell(c, 11, "계획서 편집 ② 승인 요청과 ‘나만 우선 반영’", "상대 교사가 프로그램을 사용하는 경우, 날짜별 시간표와 캘린더까지 이어집니다.", PURPLE)
place_image(c, PLAN_REQUESTS, 39, 271, 762, 175)

flow_y = 187
flow = [
    ("1", "승인 요청", "상대 교사에게\n요약 알림 전송", PURPLE, PALE_PURPLE),
    ("2", "상대 교사 확인", "승인 또는 보류", ORANGE, PALE_ORANGE),
    ("3", "승인 완료", "두 교사와 학급의\n날짜별 화면에 반영", TEAL, PALE_TEAL),
]
for idx, (num, title, body, color, fill) in enumerate(flow):
    x = 40 + idx * 248
    shadow_card(c, x, flow_y - 76, 205, 105, fill, LINE, 13)
    number_badge(c, int(num), x + 24, flow_y + 5, color, 12)
    draw_text(c, title, x + 46, flow_y + 10, 10.8, NAVY, True)
    wrapped(c, body, x + 20, flow_y - 20, 165, 8.8, 15, MUTED, max_lines=2)
    if idx < 2:
        arrow(c, x + 207, flow_y - 24, x + 239, flow_y - 24, SUBTLE, 1.3)

rounded(c, 40, 49, 464, 44, PALE_BLUE, PALE_BLUE, 10, 0)
draw_text(c, "나만 우선 반영", 58, 65, 8.9, BLUE, True)
draw_text(c, "상대 승인 전 내 캘린더·날짜별 시간표에만 먼저 적용합니다. 요청은 그대로 유지됩니다.", 139, 65, 8.1, INK)
rounded(c, 522, 49, 279, 44, PALE_RED, PALE_RED, 10, 0)
draw_text(c, "요청 취소·반영 해제", 540, 65, 8.9, RED, True)
wrapped(c, "상태에 따라 표시되는 버튼으로\n되돌릴 수 있습니다.", 660, 70, 122, 7.7, 11, INK, max_lines=2)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 12. Output
# ---------------------------------------------------------------------------
page_shell(c, 12, "출력: 학교 양식을 미리 보고 HWP 또는 PDF로", "출력 전에 화면에서 양식을 확인하고 필요한 형식을 선택하세요.", ORANGE)
place_image(c, OUTPUT_PREVIEW, 37, 59, 569, 387)
note_card(c, 1, "HWP 저장", "한글에서 다시 열어 문구나 결재란을 추가로 편집할 수 있습니다.", 628, 421, 173, 69, PURPLE, PALE_PURPLE)
note_card(c, 2, "출력 / PDF", "인쇄 대화상자에서 프린터 출력 또는 PDF 저장을 선택합니다.", 628, 334, 173, 69, TEAL, PALE_TEAL)
note_card(c, 3, "학교 양식 미리보기", "제목, 기본 정보, 결재란, 교환·보강 표를 한 번 더 확인합니다.", 628, 247, 173, 69, ORANGE, PALE_ORANGE)
rounded(c, 628, 66, 173, 93, PALE_GOLD, HexColor("#E4CF61"), 12, 0.8)
draw_text(c, "항목이 7개 이상이면", 646, 132, 9.4, GOLD_DARK, True)
wrapped(c, "6개씩 나누어 다음 페이지에 같은 표와 기본 정보를 자동으로 이어 만듭니다.", 646, 107, 138, 8.5, 15, INK, max_lines=4)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 13. Important boundaries and practical FAQ
# ---------------------------------------------------------------------------
page_shell(c, 13, "반영할 때 꼭 기억할 세 가지", "편의를 위한 날짜별 기록이며, 공식 원본과는 구분해서 사용합니다.", RED)
boundaries = [
    ("01", "NEIS와 별개입니다", "승인·반영을 눌러도 NEIS 시간표나 공식 수업 정보가 자동으로 바뀌지는 않습니다.", RED, PALE_RED),
    ("02", "공유 시간표 원본은 그대로", "관리자가 업로드한 원본 시간표는 수정하지 않고 특정 날짜의 변경 기록만 따로 적용합니다.", TEAL, PALE_TEAL),
    ("03", "상대 승인 전 범위를 확인", "‘나만 우선 반영’은 내 화면에만 먼저 적용됩니다. 상대 교사와 학급은 승인 후 반영됩니다.", PURPLE, PALE_PURPLE),
]
for idx, (num, title, body, color, fill) in enumerate(boundaries):
    x = 40 + idx * 258
    shadow_card(c, x, 287, 238, 158, fill, LINE, 14)
    rounded(c, x + 17, 397, 42, 27, WHITE, WHITE, 13, 0)
    draw_text(c, num, x + 38, 405, 9, color, True, "center")
    draw_text(c, title, x + 17, 366, 12, NAVY, True)
    wrapped(c, body, x + 17, 337, 204, 8.7, 15, MUTED, max_lines=5)

faq = [
    ("상대 교사가 보류하면?", "요청은 알림에 남아 나중에 다시 승인할 수 있습니다."),
    ("대강 후보가 너무 많다면?", "당일 수업 수와 예상 시간표의 연강 경고를 먼저 비교하세요."),
    ("공동 공강은 몇 명부터?", "2명 이상 선택하면 모두에게 수업이 없는 시간만 표시됩니다."),
    ("계획서를 수정하고 싶다면?", "HWP로 저장하면 한글에서 문구를 더 손볼 수 있습니다."),
]
for idx, (q, a) in enumerate(faq):
    x = 40 + (idx % 2) * 389
    y = 177 - (idx // 2) * 75
    rounded(c, x, y, 369, 60, WHITE, LINE, 11, 0.8)
    draw_text(c, q, x + 16, y + 36, 9.3, NAVY, True)
    draw_text(c, a, x + 16, y + 16, 8.1, MUTED)
footer(c)
c.showPage()

# ---------------------------------------------------------------------------
# 14. Friendly quick start and search helper prompts
# ---------------------------------------------------------------------------
page_shell(c, 14, "처음에는 이 네 문장만 따라 해보세요", "검색도우미에 자연스럽게 물어봐도 해당 메뉴와 사용법을 안내합니다.")
quick = [
    ("01", "“바꿀 내 수업을 누른다.”", PURPLE, PALE_PURPLE),
    ("02", "“후보 카드에서 예상 시간표를 본다.”", ORANGE, PALE_ORANGE),
    ("03", "“연강을 확인한 뒤 계획서에 담는다.”", RED, PALE_RED),
    ("04", "“편집 후 승인 요청하고 출력한다.”", TEAL, PALE_TEAL),
]
for idx, (num, text_value, color, fill) in enumerate(quick):
    x = 40 + (idx % 2) * 385
    y = 353 - (idx // 2) * 99
    shadow_card(c, x, y, 365, 77, fill, LINE, 12)
    rounded(c, x + 15, y + 25, 41, 27, WHITE, WHITE, 13, 0)
    draw_text(c, num, x + 35.5, y + 33.5, 8.7, color, True, "center")
    draw_text(c, text_value, x + 72, y + 32, 10.5, NAVY, True)

rounded(c, 40, 58, 498, 168, PALE_BLUE, HexColor("#C8D8F8"), 14, 0.8)
draw_text(c, "검색도우미에는 이렇게 물어보세요", 62, 195, 11, BLUE, True)
queries = [
    "“내 수업을 다른 선생님과 교체하고 싶어.”",
    "“금요일 4교시에 대강 가능한 선생님을 찾아줘.”",
    "“정승원 선생님과 조승현 선생님의 공동 공강은?”",
    "“교환보강 계획서를 HWP로 출력하고 싶어.”",
    "“나만 우선 반영은 무슨 뜻이야?”",
]
for idx, query in enumerate(queries):
    y = 165 - idx * 24
    c.setFillColor(BLUE if idx in (0, 4) else HexColor("#9CB6ED"))
    c.circle(65, y + 3.5, 3, fill=1, stroke=0)
    draw_text(c, query, 78, y, 8.6, NAVY, idx in (0, 4))

rounded(c, 559, 58, 242, 168, PALE_GOLD, HexColor("#E4CF61"), 14, 0.9)
draw_text(c, "한 줄로 정리하면", 582, 195, 9.3, GOLD_DARK, True)
wrapped(c, "교환·대강 계획은\n‘가능한가?’만 보는 도구가 아니라\n‘상대 선생님도 괜찮은가?’까지\n살펴보고 결정하는 화면입니다.", 582, 163, 198, 11.4, 23, NAVY, True, max_lines=4)
draw_text(c, "후보를 정하기 전, 예상 시간표를 꼭 눌러보세요.", 582, 66, 7.8, MUTED)
footer(c)
c.save()

print(PDF_PATH)
