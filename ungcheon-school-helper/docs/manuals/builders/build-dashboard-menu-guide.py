from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor, white
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

PIL_REGULAR = ImageFont.truetype(str(FONT_REGULAR), 20)
PIL_BOLD = ImageFont.truetype(str(FONT_BOLD), 22)

PAGE_W, PAGE_H = landscape(A4)
NAVY = HexColor("#16243A")
INK = HexColor("#1F2937")
MUTED = HexColor("#5F6B7A")
GOLD = HexColor("#DDBA00")
PALE_GOLD = HexColor("#FFF6CC")
TEAL = HexColor("#0F766E")
PALE_TEAL = HexColor("#E8F6F2")
BLUE = HexColor("#2563EB")
PALE_BLUE = HexColor("#EDF4FF")
PAPER = HexColor("#FBFAF6")
LINE = HexColor("#D9DEE7")
PURPLE = HexColor("#7C3AED")


def source(name: str) -> Path:
    path = SOURCE / name
    if not path.exists():
        raise FileNotFoundError(path)
    return path


TOP = source(f"대시보드_02_일정과개인시간표_v{VERSION}_20260812.png")
LOWER = source(f"대시보드_03_날씨급식개인업무_v{VERSION}_20260812.png")
MIDDLE = source(f"대시보드_04_선택일정주간계획날씨급식_v{VERSION}_20260812.png")
LOGO = ROOT / "src" / "assets" / "ungcheon-logo.png"


def make_crop(filename: str, src: Path, box: tuple[int, int, int, int], markers=(), outlines=()) -> Path:
    out = EDITED / filename
    with Image.open(src) as original:
        img = original.convert("RGB").crop(box)
    draw = ImageDraw.Draw(img)
    for rect, color, width in outlines:
        draw.rounded_rectangle(rect, radius=14, outline=color, width=width)
    for number, x, y, color in markers:
        r = 22
        draw.ellipse((x-r, y-r, x+r, y+r), fill=color, outline="white", width=3)
        text = str(number)
        bbox = draw.textbbox((0, 0), text, font=PIL_BOLD)
        draw.text((x-(bbox[2]-bbox[0])/2, y-(bbox[3]-bbox[1])/2-2), text, font=PIL_BOLD, fill="white")
    img.save(out, quality=95)
    return out


OVERVIEW = make_crop(
    "대시보드_전체구성_번호표시.png",
    TOP,
    (70, 125, 1265, 800),
    markers=((1, 45, 55, "#7C3AED"), (2, 835, 55, "#0F766E")),
    outlines=(((8, 10, 785, 665), "#7C3AED", 4), ((797, 10, 1190, 665), "#0F766E", 4)),
)
CALENDAR = make_crop(
    "대시보드_2주일정_확대.png",
    TOP,
    (78, 125, 860, 800),
    markers=((1, 60, 96, "#2563EB"), (2, 85, 250, "#7C3AED"), (3, 515, 445, "#0F766E")),
)
TIMETABLE = make_crop(
    "대시보드_개인시간표_확대.png",
    TOP,
    (870, 125, 1258, 800),
    markers=((1, 195, 92, "#0F766E"), (2, 265, 358, "#7C3AED"), (3, 210, 470, "#D97706")),
)
SELECTED = make_crop(
    "대시보드_선택일정과참고사항_확대.png",
    MIDDLE,
    (70, 70, 860, 337),
    markers=((1, 55, 42, "#7C3AED"), (2, 438, 42, "#0F766E")),
)
WEATHER_MEAL = make_crop(
    "대시보드_날씨와급식_확대.png",
    LOWER,
    (76, 75, 858, 560),
    markers=((1, 55, 50, "#2563EB"), (2, 450, 50, "#D97706")),
)
TASKS = make_crop(
    "대시보드_업무와메모_확대.png",
    LOWER,
    (75, 565, 1255, 800),
    markers=((1, 55, 43, "#7C3AED"), (2, 440, 43, "#0F766E"), (3, 835, 43, "#D97706")),
)


def rounded(c: canvas.Canvas, x, y, w, h, fill, stroke=LINE, radius=10, width=1):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def text(c: canvas.Canvas, value: str, x: float, y: float, size=11, color=INK, bold=False):
    c.setFillColor(color)
    c.setFont("MalgunBold" if bold else "Malgun", size)
    c.drawString(x, y, value)


def wrapped(c: canvas.Canvas, value: str, x: float, y: float, width: float, size=11, leading=17, color=INK, bold=False, max_lines=None):
    font_name = "MalgunBold" if bold else "Malgun"
    c.setFont(font_name, size)
    c.setFillColor(color)
    words = list(value)
    lines, current = [], ""
    for char in words:
        candidate = current + char
        if pdfmetrics.stringWidth(candidate, font_name, size) <= width or not current:
            current = candidate
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    if max_lines:
        lines = lines[:max_lines]
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def header(c: canvas.Canvas, section: str, title: str, subtitle: str = ""):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H - 10, PAGE_W, 10, fill=1, stroke=0)
    text(c, section, 38, PAGE_H - 43, 10, TEAL, True)
    text(c, title, 38, PAGE_H - 78, 24, NAVY, True)
    if subtitle:
        text(c, subtitle, 38, PAGE_H - 100, 10.5, MUTED)


def footer(c: canvas.Canvas, page: int):
    c.setStrokeColor(LINE)
    c.line(38, 27, PAGE_W - 38, 27)
    text(c, "웅천고 업무도우미 · 메뉴별 하루 한 기능 소개", 38, 13, 8, MUTED)
    text(c, f"앱 v{VERSION} · 제작 {DATE} · {page}", PAGE_W - 175, 13, 8, MUTED)


def place_image(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float, border=True):
    with Image.open(path) as image:
        iw, ih = image.size
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    if border:
        rounded(c, dx - 5, dy - 5, dw + 10, dh + 10, white, LINE, 8, 1)
    c.drawImage(str(path), dx, dy, width=dw, height=dh, preserveAspectRatio=True, mask="auto")
    return dx, dy, dw, dh


def pill(c: canvas.Canvas, label: str, x: float, y: float, fill=PALE_BLUE, color=BLUE):
    width = pdfmetrics.stringWidth(label, "MalgunBold", 9) + 20
    rounded(c, x, y, width, 23, fill, fill, 11, 0)
    text(c, label, x + 10, y + 7, 9, color, True)
    return width


def number_note(c: canvas.Canvas, number: int, title_value: str, body: str, x: float, y: float, w: float, color=PURPLE):
    c.setFillColor(color)
    c.circle(x + 13, y - 2, 13, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("MalgunBold", 10)
    c.drawCentredString(x + 13, y - 5.5, str(number))
    text(c, title_value, x + 34, y + 2, 12, NAVY, True)
    wrapped(c, body, x + 34, y - 17, w - 34, 9.5, 14, MUTED)


c = canvas.Canvas(str(PDF_PATH), pagesize=landscape(A4))
c.setTitle("웅천고 업무도우미 메뉴 소개 01 - 대시보드")
c.setAuthor("웅천고등학교")

# 1. Cover
c.setFillColor(NAVY)
c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
c.setFillColor(GOLD)
c.rect(0, PAGE_H - 12, PAGE_W, 12, fill=1, stroke=0)
c.drawImage(str(LOGO), 48, PAGE_H - 102, width=58, height=58, preserveAspectRatio=True, mask="auto")
text(c, "하루 한 기능 · 01", 48, PAGE_H - 135, 11, GOLD, True)
text(c, "대시보드", 48, PAGE_H - 185, 34, white, True)
wrapped(c, "학교에서 오늘 필요한 정보를\n한 화면에서 먼저 확인해 보세요.", 48, PAGE_H - 226, 305, 17, 27, white, True)
wrapped(c, "개인 시간표부터 수업변경, 당김수업, 지도 일정, 주간업무계획, 위원회, 급식과 날씨까지 한곳에 모았습니다.", 48, PAGE_H - 320, 305, 11, 19, HexColor("#D7DFEA"))
rounded(c, 48, 83, 292, 72, HexColor("#223450"), HexColor("#3A4D68"), 12, 1)
text(c, "오늘의 핵심", 64, 132, 10, GOLD, True)
wrapped(c, "메뉴를 여러 번 옮겨 다니지 않고, 대시보드 한 화면에서 하루와 다음 주를 함께 살펴봅니다.", 64, 111, 260, 10, 16, white)
place_image(c, TOP, 375, 52, 430, 465, border=False)
text(c, f"기준 버전 v{VERSION}  ·  제작 {DATE}", 48, 38, 8.5, HexColor("#AEBBD0"))
c.showPage()

# 2. Overview
header(c, "대시보드", "한 화면에 모이는 11가지 핵심 정보", "로그인하면 가장 먼저 만나는 화면입니다.")
place_image(c, OVERVIEW, 38, 72, 560, 405)
number_note(c, 1, "이번 주·다음 주 일정", "학교 일정과 개인 관련 일정을 2주 달력으로 한꺼번에 확인합니다.", 620, 451, 180)
number_note(c, 2, "개인 시간표", "오늘 수업과 주간 시간표, 변경 수업과 당김수업을 함께 확인합니다.", 620, 382, 180, TEAL)
rounded(c, 615, 95, 188, 224, PALE_GOLD, HexColor("#E8D57B"), 12, 1)
text(c, "이 한 화면에서 확인할 수 있어요", 630, 295, 11, NAVY, True)
items = ["개인 시간표", "수업교체 반영", "당김수업", "등교지도", "급식지도", "주간업무계획", "위원회 일정", "급식", "날씨", "창체", "학사일정"]
for idx, item in enumerate(items):
    col = idx // 6
    row = idx % 6
    x = 630 + col * 88
    y = 267 - row * 29
    c.setFillColor(GOLD if idx in (0, 1, 2) else TEAL)
    c.circle(x + 4, y + 4, 3.5, fill=1, stroke=0)
    text(c, item, x + 12, y, 8.8, INK, idx in (0, 1, 2))
footer(c, 2)
c.showPage()

# 3. Calendar
header(c, "대시보드", "이번 주와 다음 주를 크게", "여러 출처의 일정을 날짜 순서로 합쳐 보여줍니다.")
place_image(c, CALENDAR, 35, 61, 515, 430)
number_note(c, 1, "표시할 일정 직접 선택", "종류별 체크 버튼으로 보고 싶은 일정만 켜고 끌 수 있습니다. NEIS 학사일정은 기본적으로 꺼져 있습니다.", 575, 469, 230, BLUE)
number_note(c, 2, "이번 주 일정", "오늘을 포함한 이번 주 일정을 크게 보여주어 아침에 빠르게 훑어보기 좋습니다.", 575, 380, 230)
number_note(c, 3, "다음 주 일정", "바로 다음 주까지 이어서 보여주므로 다가오는 업무를 미리 준비할 수 있습니다.", 575, 301, 230, TEAL)
rounded(c, 570, 74, 238, 161, PALE_TEAL, HexColor("#B8E1D6"), 12, 1)
text(c, "달력에 함께 모이는 일정", 585, 210, 11, TEAL, True)
chips = ["주간업무계획", "창체", "학사일정", "위원회", "등교지도", "급식지도", "수업변경", "당김수업"]
x, y = 585, 178
for label in chips:
    w = pill(c, label, x, y, white, TEAL)
    x += w + 7
    if x > 770:
        x = 585
        y -= 34
footer(c, 3)
c.showPage()

# 4. Timetable
header(c, "대시보드", "개인 시간표도 일정과 나란히", "환경설정에 등록한 교사 이름을 기준으로 본인의 수업을 보여줍니다.")
place_image(c, TIMETABLE, 42, 58, 290, 447)
number_note(c, 1, "원래 주간 시간표", "교시별 학급·과목을 확인하고, 오늘 수업이 끝났는지도 바로 알 수 있습니다.", 360, 470, 430, TEAL)
number_note(c, 2, "수업교체 반영", "승인된 수업교체는 원래 시간표와 구분되는 색으로 표시됩니다.", 360, 393, 430)
number_note(c, 3, "당김수업 반영", "관리자가 등록한 당김수업도 해당 날짜·교시에 자동으로 추가됩니다.", 360, 326, 430, HexColor("#D97706"))
rounded(c, 355, 152, 438, 115, PALE_GOLD, HexColor("#E4C442"), 12, 1.5)
text(c, "중요 · 상대 교사도 프로그램을 사용한다면", 374, 235, 12, NAVY, True)
wrapped(c, "교환·대강 계획에서 상대 교사가 요청을 확인하고 승인하면 두 선생님의 캘린더와 날짜별 시간표에 함께 반영됩니다. 승인 전에는 ‘나만 우선 반영’으로 내 화면에 먼저 적용할 수도 있습니다.", 374, 208, 400, 10.5, 18, INK)
rounded(c, 355, 72, 438, 60, PALE_BLUE, HexColor("#BFD2F8"), 10, 1)
text(c, "편의를 위한 표시입니다", 374, 110, 10, BLUE, True)
wrapped(c, "수업변경 표시는 NEIS와 별개이며, 실제 수업 운영과 NEIS 처리는 학교 절차에 따라 확인해 주세요.", 374, 90, 400, 9.2, 15, MUTED)
footer(c, 4)
c.showPage()

# 5. What each event means
header(c, "대시보드", "일정의 출처가 달라도 한 달력에서", "색과 이름으로 어떤 일정인지 구분할 수 있습니다.")
place_image(c, TOP, 38, 212, 765, 285)
groups = [
    ("주간업무계획", "교무기획부에서 올린 주간계획 시트를 자동 반영", BLUE),
    ("창체·학사일정", "창의적체험활동과 학교 학사일정을 날짜별 표시", TEAL),
    ("위원회 일정", "내 이름이 위원 명단에 포함된 일정만 확인", HexColor("#D97706")),
    ("등교·급식지도", "해당 교사로 배정된 날과 시간·장소를 표시", HexColor("#0891B2")),
    ("수업변경·당김수업", "승인된 변경 수업과 등록된 당김수업을 반영", PURPLE),
]
for idx, (title_value, body, color) in enumerate(groups):
    x = 42 + (idx % 3) * 265
    y = 166 - (idx // 3) * 86
    rounded(c, x, y, 245, 67, white, LINE, 10, 1)
    c.setFillColor(color)
    c.circle(x + 18, y + 45, 5, fill=1, stroke=0)
    text(c, title_value, x + 31, y + 39, 10, NAVY, True)
    wrapped(c, body, x + 18, y + 19, 210, 8.5, 13, MUTED)
footer(c, 5)
c.showPage()

# 6. Selected date
header(c, "대시보드", "날짜를 고르면, 그날의 내용이 더 자세히", "달력 칸을 선택하면 일정과 주간 참고사항을 아래에서 확인합니다.")
place_image(c, SELECTED, 45, 245, 750, 235)
number_note(c, 1, "선택한 날짜의 일정", "당김수업, 지도 일정, 위원회 등 그날 확인할 항목을 한곳에 모아 보여줍니다.", 70, 194, 330)
number_note(c, 2, "기타·참고사항", "청렴교육, 안전, 복무 등 주간계획 시트의 공통 참고사항도 함께 확인할 수 있습니다.", 440, 194, 330, TEAL)
rounded(c, 65, 74, 710, 70, PALE_GOLD, HexColor("#E4C442"), 12, 1)
text(c, "이렇게 활용해 보세요", 85, 119, 10.5, NAVY, True)
wrapped(c, "아침에 오늘 날짜를 한 번 선택해 보세요. 수업과 일정뿐 아니라 주간 공통 안내까지 함께 훑으면 여러 문서를 다시 열어볼 일이 줄어듭니다.", 85, 95, 665, 10, 17, INK)
footer(c, 6)
c.showPage()

# 7. Weather and meal
header(c, "대시보드", "날씨와 급식도 같은 화면에서", "대시보드 아래로 조금만 내려오면 오늘 필요한 생활 정보를 바로 볼 수 있습니다.")
place_image(c, WEATHER_MEAL, 40, 85, 550, 405)
number_note(c, 1, "오늘 날씨와 주간 예보", "현재 기온·습도·풍속·미세먼지와 일주일 예보를 확인합니다.", 620, 443, 180, BLUE)
number_note(c, 2, "오늘과 다음 날 급식", "중식·석식 메뉴와 열량을 확인합니다. 관리자 동기화 자료를 사용하므로 일반 사용자는 API 키를 따로 넣지 않습니다.", 620, 344, 180, HexColor("#D97706"))
rounded(c, 615, 132, 190, 130, PALE_TEAL, HexColor("#B8E1D6"), 12, 1)
text(c, "대시보드의 장점", 632, 235, 11, TEAL, True)
wrapped(c, "달력과 시간표를 확인한 뒤 다른 메뉴로 옮겨 가지 않고, 같은 화면에서 날씨와 급식까지 이어서 볼 수 있습니다.", 632, 208, 154, 10, 17, INK)
footer(c, 7)
c.showPage()

# 8. Quick use
header(c, "대시보드", "내일부터 이렇게 시작해 보세요", "처음에는 아래 세 가지만 기억하셔도 충분합니다.")
steps = [
    ("1", "로그인하면 대시보드부터", "프로그램을 실행하고 이름으로 로그인하면 항상 대시보드에서 시작합니다."),
    ("2", "2주 일정과 시간표 확인", "오늘 날짜의 일정과 오른쪽 개인 시간표를 먼저 살펴봅니다."),
    ("3", "아래로 내려 날씨·급식 확인", "필요하면 개인 업무와 메모도 같은 화면에서 이어서 사용합니다."),
]
for idx, (num, title_value, body) in enumerate(steps):
    x = 42 + idx * 257
    rounded(c, x, 330, 235, 138, white, LINE, 13, 1)
    c.setFillColor(GOLD if idx == 0 else TEAL)
    c.circle(x + 31, 435, 18, fill=1, stroke=0)
    c.setFillColor(NAVY if idx == 0 else white)
    c.setFont("MalgunBold", 13)
    c.drawCentredString(x + 31, 430, num)
    text(c, title_value, x + 58, 426, 12, NAVY, True)
    wrapped(c, body, x + 20, 391, 195, 9.5, 16, MUTED)
rounded(c, 42, 115, 490, 174, PALE_BLUE, HexColor("#BFD2F8"), 13, 1)
text(c, "검색도우미에는 이렇게 물어보세요", 62, 260, 12, BLUE, True)
queries = [
    "“오늘 내 시간표를 보고 싶어.”",
    "“수업교체가 대시보드에 어떻게 반영돼?”",
    "“위원회 일정을 어디서 확인해?”",
    "“급식과 날씨를 보고 싶어.”",
]
for idx, query in enumerate(queries):
    text(c, query, 66, 229 - idx * 29, 10, INK, idx == 1)
rounded(c, 555, 115, 246, 174, PALE_GOLD, HexColor("#E4C442"), 13, 1)
text(c, "한 줄로 정리하면", 575, 260, 11, NAVY, True)
wrapped(c, "대시보드는 ‘오늘 학교에서 내가 알아야 할 것’을 가장 먼저 모아 보는 화면입니다.", 575, 225, 205, 14, 23, NAVY, True)
text(c, "내일 아침, 달력의 오늘 날짜를 눌러보세요.", 575, 143, 9.5, MUTED)
footer(c, 8)
c.save()

print(PDF_PATH)
