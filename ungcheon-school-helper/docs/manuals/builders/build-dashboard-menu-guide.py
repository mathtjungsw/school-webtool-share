from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[3]
ASSET_ROOT = ROOT / "manual-assets" / "대시보드"
SOURCE = ASSET_ROOT / "원본캡처"
EDITED = ASSET_ROOT / "편집캡처"
OUTPUT = ROOT / "output" / "pdf"
EDITED.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)

VERSION = "1.1.11"
DATE = "2026.08.12."
PDF_PATH = OUTPUT / f"웅천고_업무도우미_메뉴소개_01_대시보드_v{VERSION}.pdf"

FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")
pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))

PIL_BOLD = ImageFont.truetype(str(FONT_BOLD), 22)

PAGE_W, PAGE_H = landscape(A4)

# Design system
PAPER = HexColor("#F7F6F1")
WHITE = white
NAVY = HexColor("#132238")
INK = HexColor("#243247")
MUTED = HexColor("#697588")
SUBTLE = HexColor("#929CAB")
LINE = HexColor("#DDE2E8")
SOFT_SHADOW = HexColor("#E6E3DA")
GOLD = HexColor("#D9B800")
GOLD_DARK = HexColor("#9B7D00")
PALE_GOLD = HexColor("#FFF7D6")
TEAL = HexColor("#087C73")
PALE_TEAL = HexColor("#E9F6F3")
BLUE = HexColor("#2E6BE6")
PALE_BLUE = HexColor("#EDF3FF")
PURPLE = HexColor("#7346D8")
PALE_PURPLE = HexColor("#F1EDFF")
ORANGE = HexColor("#D87300")
PALE_ORANGE = HexColor("#FFF0DD")
CYAN = HexColor("#078BA6")
PALE_CYAN = HexColor("#E8F7FA")


def src(name: str) -> Path:
    path = SOURCE / name
    if not path.exists():
        raise FileNotFoundError(path)
    return path


TOP = src(f"대시보드_02_일정과개인시간표_v{VERSION}_20260812.png")
LOWER = src(f"대시보드_03_날씨급식개인업무_v{VERSION}_20260812.png")
MIDDLE = src(f"대시보드_04_선택일정주간계획날씨급식_v{VERSION}_20260812.png")
LOGO = ROOT / "src" / "assets" / "ungcheon-logo.png"


def crop_annotated(
    filename: str,
    source_path: Path,
    box: tuple[int, int, int, int],
    markers: tuple[tuple[int, int, int, str], ...] = (),
    outlines: tuple[tuple[tuple[int, int, int, int], str, int], ...] = (),
) -> Path:
    """Create a stable crop and add restrained numbered callouts."""
    out = EDITED / filename
    with Image.open(source_path) as original:
        image = original.convert("RGB").crop(box)
    draw = ImageDraw.Draw(image)
    for rect, color, width in outlines:
        draw.rounded_rectangle(rect, radius=13, outline=color, width=width)
    for number, x, y, color in markers:
        radius = 21
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline="white", width=3)
        label = str(number)
        bbox = draw.textbbox((0, 0), label, font=PIL_BOLD)
        draw.text(
            (x - (bbox[2] - bbox[0]) / 2, y - (bbox[3] - bbox[1]) / 2 - 2),
            label,
            font=PIL_BOLD,
            fill="white",
        )
    image.save(out, quality=96)
    return out


OVERVIEW = crop_annotated(
    "대시보드_전체구성_번호표시.png",
    TOP,
    (70, 125, 1265, 800),
    markers=((1, 45, 55, "#7346D8"), (2, 835, 55, "#087C73")),
    outlines=(((8, 10, 785, 665), "#7346D8", 4), ((797, 10, 1190, 665), "#087C73", 4)),
)
CALENDAR = crop_annotated(
    "대시보드_2주일정_확대.png",
    TOP,
    (78, 125, 860, 800),
    markers=((1, 60, 96, "#2E6BE6"), (2, 85, 250, "#7346D8"), (3, 515, 445, "#087C73")),
)
TIMETABLE = crop_annotated(
    "대시보드_개인시간표_확대.png",
    TOP,
    (870, 125, 1258, 800),
    markers=((1, 195, 92, "#087C73"), (2, 265, 358, "#7346D8"), (3, 210, 470, "#D87300")),
)
SELECTED = crop_annotated(
    "대시보드_선택일정과참고사항_확대.png",
    MIDDLE,
    (70, 70, 860, 337),
    markers=((1, 55, 42, "#7346D8"), (2, 438, 42, "#087C73")),
)
WEATHER_MEAL = crop_annotated(
    "대시보드_날씨와급식_확대.png",
    LOWER,
    (76, 75, 858, 560),
    markers=((1, 55, 50, "#2E6BE6"), (2, 450, 50, "#D87300")),
)
TASKS = crop_annotated(
    "대시보드_업무와메모_확대.png",
    LOWER,
    (75, 565, 1255, 800),
    markers=((1, 55, 43, "#7346D8"), (2, 440, 43, "#087C73"), (3, 835, 43, "#D87300")),
)


def set_fill(c: canvas.Canvas, color):
    c.setFillColor(color)


def rounded(c: canvas.Canvas, x, y, w, h, fill, stroke=LINE, radius=10, line_width=1):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(line_width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def shadow_card(c: canvas.Canvas, x, y, w, h, fill=WHITE, stroke=LINE, radius=13):
    c.setFillColor(SOFT_SHADOW)
    c.setStrokeColor(SOFT_SHADOW)
    c.roundRect(x + 4, y - 4, w, h, radius, fill=1, stroke=0)
    rounded(c, x, y, w, h, fill, stroke, radius, 0.8)


def draw_text(c: canvas.Canvas, value: str, x: float, y: float, size=10, color=INK, bold=False, align="left"):
    c.setFillColor(color)
    font = "MalgunBold" if bold else "Malgun"
    c.setFont(font, size)
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
    """Korean-safe character wrapping with explicit newline support."""
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


def page_shell(c: canvas.Canvas, page: int, title: str, subtitle: str, accent=TEAL):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H - 7, PAGE_W, 7, fill=1, stroke=0)
    # Editorial masthead
    c.drawImage(str(LOGO), 40, PAGE_H - 53, 24, 24, preserveAspectRatio=True, mask="auto")
    draw_text(c, "UNGCHON HIGH SCHOOL", 74, PAGE_H - 38, 7.8, SUBTLE, True)
    draw_text(c, "DAILY FEATURE · 01  |  DASHBOARD", 74, PAGE_H - 51, 8.7, accent, True)
    rounded(c, PAGE_W - 95, PAGE_H - 52, 55, 23, WHITE, LINE, 11, 0.8)
    draw_text(c, f"{page:02d} / 08", PAGE_W - 67.5, PAGE_H - 45, 8.3, MUTED, True, "center")
    draw_text(c, title, 40, PAGE_H - 96, 27, NAVY, True)
    draw_text(c, subtitle, 40, PAGE_H - 119, 10.2, MUTED)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(40, PAGE_H - 135, PAGE_W - 40, PAGE_H - 135)


def footer(c: canvas.Canvas, page: int):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(40, 28, PAGE_W - 40, 28)
    draw_text(c, "웅천고 업무도우미 · 하루 한 기능", 40, 13, 7.6, SUBTLE)
    draw_text(c, f"앱 v{VERSION} · 제작 {DATE}", PAGE_W - 40, 13, 7.6, SUBTLE, align="right")


def place_image(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float, pad=7, shadow=True):
    with Image.open(path) as image:
        iw, ih = image.size
    scale = min((w - pad * 2) / iw, (h - pad * 2) / ih)
    dw, dh = iw * scale, ih * scale
    frame_w, frame_h = dw + pad * 2, dh + pad * 2
    frame_x = x + (w - frame_w) / 2
    frame_y = y + (h - frame_h) / 2
    if shadow:
        c.setFillColor(SOFT_SHADOW)
        c.roundRect(frame_x + 4, frame_y - 4, frame_w, frame_h, 11, fill=1, stroke=0)
    rounded(c, frame_x, frame_y, frame_w, frame_h, WHITE, LINE, 11, 0.8)
    c.drawImage(str(path), frame_x + pad, frame_y + pad, dw, dh, preserveAspectRatio=True, mask="auto")
    return frame_x, frame_y, frame_w, frame_h


def pill(c: canvas.Canvas, label: str, x: float, y: float, fill=PALE_TEAL, color=TEAL, size=8.6, pad=10):
    width = pdfmetrics.stringWidth(label, "MalgunBold", size) + pad * 2
    rounded(c, x, y, width, 22, fill, fill, 11, 0)
    draw_text(c, label, x + pad, y + 6.5, size, color, True)
    return width


def number_badge(c: canvas.Canvas, number: int, x: float, y: float, color=TEAL, radius=13):
    c.setFillColor(color)
    c.circle(x, y, radius, fill=1, stroke=0)
    draw_text(c, str(number), x, y - 4, 10, WHITE, True, "center")


def number_note(
    c: canvas.Canvas,
    number: int,
    title: str,
    body: str,
    x: float,
    y: float,
    w: float,
    color=TEAL,
    fill=WHITE,
    height=67,
):
    shadow_card(c, x, y - height, w, height, fill, LINE, 11)
    number_badge(c, number, x + 24, y - 23, color, 12)
    draw_text(c, title, x + 45, y - 18, 11, NAVY, True)
    wrapped(c, body, x + 45, y - 38, w - 60, 8.7, 13, MUTED, max_lines=2)


def compact_source_card(c: canvas.Canvas, x, y, w, title: str, body: str, color, fill):
    rounded(c, x, y, w, 62, fill, fill, 10, 0)
    c.setFillColor(color)
    c.circle(x + 17, y + 43, 4.5, fill=1, stroke=0)
    draw_text(c, title, x + 29, y + 37, 10, NAVY, True)
    wrapped(c, body, x + 16, y + 17, w - 32, 8.2, 12, MUTED, max_lines=2)


c = canvas.Canvas(str(PDF_PATH), pagesize=landscape(A4))
c.setTitle("웅천고 업무도우미 메뉴 소개 01 - 대시보드")
c.setAuthor("웅천고등학교")
c.setSubject("하루에 하나씩 살펴보는 웅천고 업무도우미 기능 소개")

# ---------------------------------------------------------------------------
# 1. Cover - a small editorial brochure rather than a manual cover
# ---------------------------------------------------------------------------
c.setFillColor(NAVY)
c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
c.setFillColor(GOLD)
c.rect(0, PAGE_H - 8, PAGE_W, 8, fill=1, stroke=0)
c.setFillColor(HexColor("#1D304B"))
c.circle(PAGE_W - 45, 55, 185, fill=1, stroke=0)
c.setFillColor(HexColor("#162943"))
c.circle(PAGE_W - 20, PAGE_H - 35, 120, fill=1, stroke=0)
c.drawImage(str(LOGO), 52, PAGE_H - 108, 54, 54, preserveAspectRatio=True, mask="auto")
rounded(c, 52, PAGE_H - 146, 116, 24, HexColor("#213653"), HexColor("#334B69"), 12, 0.7)
draw_text(c, "하루 한 기능 · 01", 110, PAGE_H - 138.5, 9, GOLD, True, "center")
draw_text(c, "대시보드", 52, PAGE_H - 205, 37, WHITE, True)
wrapped(c, "오늘 학교에서\n내가 알아야 할 것부터.", 52, PAGE_H - 248, 305, 18, 29, WHITE, True)
wrapped(
    c,
    "개인 시간표, 수업변경, 당김수업, 지도 일정, 주간계획, 위원회, 급식과 날씨를 한 화면에 모았습니다.",
    52,
    PAGE_H - 350,
    305,
    10.8,
    18,
    HexColor("#C9D3E2"),
)
rounded(c, 52, 89, 296, 74, HexColor("#223754"), HexColor("#39506E"), 13, 0.8)
draw_text(c, "TODAY'S POINT", 69, 139, 7.8, GOLD, True)
draw_text(c, "여러 메뉴를 찾기 전에, 대시보드부터.", 69, 116, 11.5, WHITE, True)
draw_text(c, "이번 주와 다음 주를 한 번에 살펴보세요.", 69, 96, 9, HexColor("#B7C4D5"))

# Screenshot stage with a deliberately angled editorial frame
c.saveState()
c.translate(390, 158)
c.rotate(1.2)
c.setFillColor(HexColor("#0D1829"))
c.roundRect(5, -5, 408, 264, 16, fill=1, stroke=0)
rounded(c, 0, 0, 408, 264, WHITE, HexColor("#738199"), 16, 0.7)
c.drawImage(str(TOP), 12, 12, 384, 240, preserveAspectRatio=True, mask="auto")
c.restoreState()

# Floating feature labels
cover_tags = [
    ("2주 일정", 394, 438, PALE_PURPLE, PURPLE),
    ("개인 시간표", 488, 444, PALE_TEAL, TEAL),
    ("수업변경", 590, 439, PALE_BLUE, BLUE),
    ("날씨·급식", 680, 427, PALE_ORANGE, ORANGE),
]
for label, x, y, fill, color in cover_tags:
    pill(c, label, x, y, fill, color, 8.3, 9)
draw_text(c, "11가지 정보가 하나의 화면으로", 420, 127, 14, WHITE, True)
cover_items = [("수업", GOLD), ("일정", TEAL), ("지도", CYAN), ("학교생활", ORANGE)]
for idx, (label, color) in enumerate(cover_items):
    x = 420 + idx * 83
    c.setFillColor(color)
    c.circle(x + 4, 99, 3.2, fill=1, stroke=0)
    draw_text(c, label, x + 13, 95, 8.7, HexColor("#C9D3E2"), True)
draw_text(c, f"앱 v{VERSION}  ·  제작 {DATE}", 52, 36, 7.8, HexColor("#8FA0B7"))
c.showPage()

# ---------------------------------------------------------------------------
# 2. Overview
# ---------------------------------------------------------------------------
page_shell(c, 2, "한 화면에 모이는 11가지 핵심 정보", "로그인하면 가장 먼저 만나는 화면입니다.")
place_image(c, OVERVIEW, 38, 64, 570, 382)

rounded(c, 626, 315, 175, 132, NAVY, NAVY, 14, 0)
draw_text(c, "11", 648, 377, 42, GOLD, True)
draw_text(c, "가지 정보를", 714, 394, 11, WHITE, True)
draw_text(c, "한 화면에서", 714, 373, 11, WHITE, True)
wrapped(c, "학교에서 오늘 필요한 것을 한곳에 모아 보는 화면입니다.", 648, 347, 130, 8.8, 14, HexColor("#CAD5E3"))

rounded(c, 626, 64, 175, 235, WHITE, LINE, 14, 0.8)
draw_text(c, "한 번에 확인할 수 있어요", 644, 273, 10.5, NAVY, True)
info_items = [
    ("개인 시간표", GOLD), ("위원회 일정", TEAL),
    ("수업교체 반영", PURPLE), ("급식", ORANGE),
    ("당김수업", GOLD), ("날씨", BLUE),
    ("등교지도", CYAN), ("창체", TEAL),
    ("급식지도", CYAN), ("학사일정", TEAL),
    ("주간업무계획", BLUE),
]
for idx, (label, color) in enumerate(info_items):
    col = idx % 2
    row = idx // 2
    x = 644 + col * 77
    y = 243 - row * 31
    c.setFillColor(color)
    c.circle(x + 4, y + 4, 3.2, fill=1, stroke=0)
    draw_text(c, label, x + 13, y, 8.4, INK, idx in (0, 2, 4))
footer(c, 2)
c.showPage()

# ---------------------------------------------------------------------------
# 3. Two-week calendar
# ---------------------------------------------------------------------------
page_shell(c, 3, "이번 주와 다음 주를 크게", "여러 출처의 일정을 날짜 순서로 합쳐 보여줍니다.", PURPLE)
place_image(c, CALENDAR, 36, 58, 520, 389)
number_note(c, 1, "표시할 일정 직접 선택", "종류별로 보고 싶은 일정만 켜고 끌 수 있습니다.", 580, 381, 222, BLUE, PALE_BLUE)
number_note(c, 2, "이번 주 일정", "오늘을 포함한 이번 주를 크게 펼쳐 보여줍니다.", 580, 296, 222, PURPLE, PALE_PURPLE)
number_note(c, 3, "다음 주 일정", "다가오는 업무까지 미리 준비할 수 있습니다.", 580, 211, 222, TEAL, PALE_TEAL)
rounded(c, 580, 58, 222, 71, NAVY, NAVY, 12, 0)
draw_text(c, "NEIS 학사일정", 598, 104, 9.6, WHITE, True)
draw_text(c, "기본값은 꺼짐", 778, 104, 8, GOLD, True, "right")
wrapped(c, "필요할 때만 체크하면 다른 학교 일정과 중복되는 표시를 줄일 수 있습니다.", 598, 82, 183, 8.2, 13, HexColor("#C8D2E0"))
footer(c, 3)
c.showPage()

# ---------------------------------------------------------------------------
# 4. Timetable and change reflection
# ---------------------------------------------------------------------------
page_shell(c, 4, "개인 시간표도 일정과 나란히", "원래 수업, 수업교체, 당김수업을 한 표에서 구분합니다.")
place_image(c, TIMETABLE, 42, 57, 286, 392)
number_note(c, 1, "원래 주간 시간표", "교시별 학급·과목과 오늘 수업 종료 여부를 확인합니다.", 352, 391, 448, TEAL, PALE_TEAL, 62)
number_note(c, 2, "수업교체 반영", "승인된 수업교체는 원래 시간표와 다른 색으로 표시됩니다.", 352, 314, 448, PURPLE, PALE_PURPLE, 62)
number_note(c, 3, "당김수업 반영", "등록된 당김수업도 해당 날짜·교시에 자동으로 추가됩니다.", 352, 237, 448, ORANGE, PALE_ORANGE, 62)

rounded(c, 352, 70, 448, 105, PALE_GOLD, HexColor("#E7CE58"), 14, 1.1)
rounded(c, 369, 145, 72, 20, GOLD, GOLD, 10, 0)
draw_text(c, "꼭 알아두세요", 405, 151, 8.1, NAVY, True, "center")
draw_text(c, "상대 교사도 이 프로그램을 사용한다면", 369, 124, 12, NAVY, True)
wrapped(
    c,
    "상대 교사가 요청을 확인하고 승인하면 두 선생님의 캘린더와 날짜별 시간표에 함께 반영됩니다. 승인 전에는 ‘나만 우선 반영’으로 내 화면에 먼저 적용할 수도 있습니다.",
    369,
    101,
    412,
    8.7,
    14,
    INK,
    max_lines=3,
)
rounded(c, 352, 38, 448, 24, PALE_BLUE, PALE_BLUE, 9, 0)
draw_text(c, "※ 수업변경 표시는 NEIS와 별개인 편의 기능입니다.", 369, 45.5, 8.1, BLUE, True)
footer(c, 4)
c.showPage()

# ---------------------------------------------------------------------------
# 5. Source-to-dashboard visual map
# ---------------------------------------------------------------------------
page_shell(c, 5, "일정의 출처가 달라도, 한 달력에서", "색과 이름으로 일정의 종류를 구분하고 날짜별로 함께 확인합니다.", BLUE)

draw_text(c, "학교의 여러 자료", 42, 422, 10, MUTED, True)
sources = [
    ("주간업무계획", "교무기획부 주간계획", BLUE, PALE_BLUE),
    ("창체·학사일정", "창체 활동과 학사일정", TEAL, PALE_TEAL),
    ("위원회 일정", "내가 위원인 일정", ORANGE, PALE_ORANGE),
    ("등교·급식지도", "배정된 날짜·시간", CYAN, PALE_CYAN),
    ("수업변경·당김", "승인·등록된 수업", PURPLE, PALE_PURPLE),
]
for idx, (title, body, color, fill) in enumerate(sources):
    y = 351 - idx * 65
    compact_source_card(c, 42, y, 190, title, body, color, fill)

# Connectors
c.setStrokeColor(HexColor("#AAB4C0"))
c.setLineWidth(1.4)
for idx in range(5):
    y = 382 - idx * 65
    c.line(232, y, 279, 268)
c.setFillColor(TEAL)
c.circle(279, 268, 6, fill=1, stroke=0)

# Central hub
shadow_card(c, 288, 160, 225, 205, WHITE, LINE, 16)
rounded(c, 306, 319, 87, 22, PALE_TEAL, PALE_TEAL, 11, 0)
draw_text(c, "DASHBOARD", 349.5, 326, 7.7, TEAL, True, "center")
draw_text(c, "2주 통합 달력", 306, 289, 18, NAVY, True)
draw_text(c, "서로 다른 일정이 날짜별로 모입니다.", 306, 260, 8.4, MUTED)
place_image(c, TOP, 304, 178, 194, 70, pad=4, shadow=False)

c.setStrokeColor(HexColor("#AAB4C0"))
c.setLineWidth(1.4)
c.line(513, 268, 556, 268)
c.setFillColor(GOLD)
c.circle(556, 268, 6, fill=1, stroke=0)

# Outcome
rounded(c, 567, 160, 233, 205, NAVY, NAVY, 16, 0)
draw_text(c, "결과", 587, 327, 8, GOLD, True)
draw_text(c, "오늘 내가 볼 것", 587, 298, 18, WHITE, True)
outcome_items = ["수업과 변경사항", "지도·위원회 일정", "학교 주간계획", "창체·학사일정"]
for idx, label in enumerate(outcome_items):
    y = 264 - idx * 29
    c.setFillColor(GOLD if idx == 0 else TEAL)
    c.circle(590, y + 4, 3.5, fill=1, stroke=0)
    draw_text(c, label, 603, y, 9.2, WHITE, idx == 0)

rounded(c, 288, 72, 512, 70, PALE_GOLD, HexColor("#E8D66F"), 12, 0.9)
draw_text(c, "핵심은 ‘자료를 찾는 시간’을 줄이는 것", 308, 116, 10.5, NAVY, True)
wrapped(c, "각 시트나 메뉴를 따로 열기 전에 대시보드에서 오늘과 다음 주를 먼저 훑어보세요.", 308, 91, 468, 9, 15, INK)
footer(c, 5)
c.showPage()

# ---------------------------------------------------------------------------
# 6. Selected date details
# ---------------------------------------------------------------------------
page_shell(c, 6, "날짜를 고르면, 그날의 내용이 더 자세히", "달력 칸을 선택하면 일정과 주간 참고사항을 아래에서 확인합니다.", PURPLE)
place_image(c, SELECTED, 54, 237, 734, 203)
number_note(c, 1, "선택한 날짜의 일정", "당김수업, 지도, 위원회 등 그날 확인할 항목을 모아 보여줍니다.", 54, 201, 352, PURPLE, PALE_PURPLE, 68)
number_note(c, 2, "기타·참고사항", "청렴교육·안전·복무 등 주간계획의 공통 안내도 함께 확인합니다.", 436, 201, 352, TEAL, PALE_TEAL, 68)
rounded(c, 54, 58, 734, 61, NAVY, NAVY, 12, 0)
draw_text(c, "TIP", 73, 96, 8, GOLD, True)
draw_text(c, "아침에 오늘 날짜를 한 번 눌러보세요.", 107, 94, 11, WHITE, True)
draw_text(c, "수업과 일정뿐 아니라 주간 공통 안내까지 한 번에 훑을 수 있습니다.", 107, 72, 8.9, HexColor("#C7D2E0"))
footer(c, 6)
c.showPage()

# ---------------------------------------------------------------------------
# 7. Weather and meals
# ---------------------------------------------------------------------------
page_shell(c, 7, "날씨와 급식도 같은 화면에서", "달력과 시간표를 확인한 뒤 아래로 조금만 내려오면 됩니다.", ORANGE)
place_image(c, WEATHER_MEAL, 38, 58, 566, 386)
number_note(c, 1, "오늘 날씨와 주간 예보", "기온·습도·풍속·미세먼지와 일주일 예보를 확인합니다.", 628, 400, 174, BLUE, PALE_BLUE, 72)
number_note(c, 2, "오늘과 다음 날 급식", "중식·석식 메뉴와 열량을 확인합니다.", 628, 310, 174, ORANGE, PALE_ORANGE, 72)
rounded(c, 628, 137, 174, 82, PALE_TEAL, PALE_TEAL, 12, 0)
draw_text(c, "관리자 동기화 자료", 647, 193, 9.5, TEAL, True)
wrapped(c, "일반 사용자는 NEIS API 키를 따로 입력하지 않아도 됩니다.", 647, 171, 138, 8.5, 14, INK, max_lines=3)
rounded(c, 628, 58, 174, 63, NAVY, NAVY, 12, 0)
draw_text(c, "같은 화면에서 계속", 647, 96, 9.5, GOLD, True)
wrapped(c, "달력 → 시간표 → 날씨·급식 순으로 이어서 확인하세요.", 647, 75, 138, 8.2, 13, WHITE, max_lines=2)
footer(c, 7)
c.showPage()

# ---------------------------------------------------------------------------
# 8. Friendly quick-start page
# ---------------------------------------------------------------------------
page_shell(c, 8, "내일부터 이렇게 시작해 보세요", "처음에는 세 가지만 기억하셔도 충분합니다.")

steps = [
    ("01", "대시보드부터", "로그인하면 항상 대시보드에서 시작합니다.", GOLD, PALE_GOLD),
    ("02", "2주 일정과 시간표", "오늘 일정과 오른쪽 개인 시간표를 먼저 봅니다.", TEAL, PALE_TEAL),
    ("03", "아래로 조금 더", "날씨·급식과 개인 업무까지 이어서 봅니다.", BLUE, PALE_BLUE),
]
for idx, (num, title, body, color, fill) in enumerate(steps):
    x = 40 + idx * 258
    shadow_card(c, x, 296, 238, 145, WHITE, LINE, 14)
    rounded(c, x + 16, 394, 46, 28, fill, fill, 14, 0)
    draw_text(c, num, x + 39, 403, 9.5, color, True, "center")
    draw_text(c, title, x + 18, 365, 13, NAVY, True)
    wrapped(c, body, x + 18, 336, 198, 9.2, 16, MUTED)

rounded(c, 40, 65, 498, 198, PALE_BLUE, HexColor("#C8D8F8"), 14, 0.8)
draw_text(c, "검색도우미에는 이렇게 물어보세요", 62, 231, 11, BLUE, True)
queries = [
    "“오늘 내 시간표를 보고 싶어.”",
    "“수업교체가 대시보드에 어떻게 반영돼?”",
    "“위원회 일정을 어디서 확인해?”",
    "“급식과 날씨를 보고 싶어.”",
]
for idx, query in enumerate(queries):
    y = 198 - idx * 34
    c.setFillColor(BLUE if idx == 1 else HexColor("#9DB6EC"))
    c.circle(65, y + 4, 3, fill=1, stroke=0)
    draw_text(c, query, 78, y, 9.7, NAVY, idx == 1)

rounded(c, 559, 65, 242, 198, PALE_GOLD, HexColor("#E7CE58"), 14, 0.9)
draw_text(c, "한 줄로 정리하면", 582, 231, 9.5, GOLD_DARK, True)
wrapped(c, "대시보드는\n‘오늘 학교에서 내가\n알아야 할 것’을\n가장 먼저 모아 보는\n화면입니다.", 582, 196, 198, 14, 20, NAVY, True)
draw_text(c, "내일 아침, 달력의 오늘 날짜를 눌러보세요.", 582, 91, 8.5, MUTED)
footer(c, 8)
c.save()

print(PDF_PATH)
