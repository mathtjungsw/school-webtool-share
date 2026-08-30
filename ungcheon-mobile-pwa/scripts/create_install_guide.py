from __future__ import annotations

import shutil
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from pypdf import PdfReader


APP_URL = "https://ungcheon-mobile-schedule.jsw890122.chatgpt.site"
CHROME_GUIDE = "https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=ko"
CHROME_SHORTCUT = "https://support.google.com/chrome/answer/15085120?co=GENIE.Platform%3DAndroid&hl=ko"
APPLE_GUIDE = "https://support.apple.com/ko-kr/guide/iphone/iphea86e5236/ios"
SAMSUNG_GUIDE = "https://developer.samsung.com/automation/progressive-web-app.html"

PROJECT_DIR = Path(__file__).resolve().parents[1]
WORKSPACE_DIR = PROJECT_DIR.parent
TMP_DIR = WORKSPACE_DIR / "tmp" / "pdfs" / "ungcheon-mobile-install-guide"
OUTPUT_DIR = WORKSPACE_DIR / "output" / "pdf"
OUTPUT_PDF = OUTPUT_DIR / "웅천고_모바일_일정_홈화면_설치_안내서.pdf"
PUBLIC_PDF = PROJECT_DIR / "public" / "ungcheon-mobile-install-guide.pdf"

FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")

GREEN = "#145640"
GREEN_DARK = "#0C3A2C"
GREEN_SOFT = "#EAF3EF"
GOLD = "#E8BA56"
PAPER = "#F4F7F5"
INK = "#18231F"
MUTED = "#66736D"
LINE = "#DCE6E0"
WHITE = "#FFFFFF"
ORANGE = "#D98231"
RED = "#A73548"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def pil_wrap(text: str, draw: ImageDraw.ImageDraw, font_obj: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        test = current + char
        if current and draw.textbbox((0, 0), test, font=font_obj)[2] > max_width:
            lines.append(current.rstrip())
            current = char.lstrip()
        else:
            current = test
    if current:
        lines.append(current)
    return lines


def draw_pil_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font_obj: ImageFont.FreeTypeFont,
                  fill: str, max_width: int, line_gap: int = 6) -> int:
    x, y = xy
    lines = pil_wrap(text, draw, font_obj, max_width)
    line_height = font_obj.size + line_gap
    for index, line in enumerate(lines):
        draw.text((x, y + index * line_height), line, font=font_obj, fill=hex_rgb(fill))
    return y + len(lines) * line_height


def make_qr() -> Path:
    target = TMP_DIR / "app-qr.png"
    qr = qrcode.QRCode(version=None, box_size=12, border=3)
    qr.add_data(APP_URL)
    qr.make(fit=True)
    image = qr.make_image(fill_color=GREEN_DARK, back_color=WHITE).convert("RGB")
    image.save(target, quality=95)
    return target


def make_app_preview() -> Path:
    target = TMP_DIR / "app-first-screen.png"
    image = Image.new("RGB", (900, 1560), hex_rgb(PAPER))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((50, 30, 850, 1530), radius=64, fill=hex_rgb("#101916"))
    draw.rounded_rectangle((72, 62, 828, 1498), radius=48, fill=hex_rgb(PAPER))
    draw.rounded_rectangle((72, 62, 828, 192), radius=48, fill=hex_rgb(GREEN_DARK))
    draw.rectangle((72, 140, 828, 192), fill=hex_rgb(GREEN_DARK))
    draw.rounded_rectangle((105, 92, 175, 162), radius=18, fill=hex_rgb("#245D4B"))
    draw.text((127, 102), "웅", font=font(27, True), fill=hex_rgb(GOLD))
    draw.text((195, 91), "웅천고등학교", font=font(18, True), fill=hex_rgb("#BBD1C8"))
    draw.text((195, 121), "모바일 일정", font=font(29, True), fill=hex_rgb(WHITE))
    for x, glyph in [(665, "⇩"), (733, "◐"), (790, "↪")]:
        draw.rounded_rectangle((x, 98, x + 44, 142), radius=12, fill=hex_rgb("#1E5141"))
        draw.text((x + 11, 101), glyph, font=font(20, True), fill=hex_rgb(WHITE))

    draw.rectangle((72, 192, 828, 256), fill=hex_rgb("#F6DC9A"))
    note = "개인 업무와 개인 일정은 PC용 웅천고 업무도우미에서만 확인할 수 있습니다."
    draw.text((115, 211), note, font=font(15, True), fill=hex_rgb("#49370E"))

    draw.rectangle((72, 256, 828, 334), fill=hex_rgb(WHITE))
    tabs = ["오늘", "주간 시간표", "이번 주", "다음 주"]
    for index, tab in enumerate(tabs):
        center = 166 + index * 190
        color = INK if index == 0 else MUTED
        draw.text((center, 285), tab, anchor="mm", font=font(18, True), fill=hex_rgb(color))
    draw.rounded_rectangle((125, 326, 205, 331), radius=3, fill=hex_rgb(GOLD))

    draw.text((112, 372), "홍길동 선생님", font=font(17, True), fill=hex_rgb(GREEN))
    draw.text((112, 410), "8월 24일 월요일", font=font(38, True), fill=hex_rgb(INK))
    draw.rounded_rectangle((112, 470, 226, 516), radius=23, fill=hex_rgb(WHITE), outline=hex_rgb(LINE), width=2)
    draw.rounded_rectangle((236, 470, 350, 516), radius=23, fill=hex_rgb(WHITE), outline=hex_rgb(LINE), width=2)
    draw.text((140, 482), "5 수업", font=font(17, True), fill=hex_rgb(INK))
    draw.text((264, 482), "3 일정", font=font(17, True), fill=hex_rgb(INK))

    draw.rounded_rectangle((96, 558, 804, 1160), radius=30, fill=hex_rgb(WHITE), outline=hex_rgb("#9BC0B2"), width=3)
    draw.rounded_rectangle((122, 586, 184, 648), radius=16, fill=hex_rgb(GREEN))
    draw.text((144, 599), "시", font=font(22, True), fill=hex_rgb(WHITE))
    draw.text((207, 588), "FIRST CHECK", font=font(12, True), fill=hex_rgb(MUTED))
    draw.text((207, 614), "오늘의 교사 시간표", font=font(22, True), fill=hex_rgb(INK))
    draw.rounded_rectangle((657, 598, 773, 638), radius=20, fill=hex_rgb(PAPER))
    draw.text((680, 608), "5개 수업", font=font(14, True), fill=hex_rgb(MUTED))

    lessons = [(1, "국어", "1-3"), (2, "문학", "2-5"), (3, "공강", ""), (4, "화법과 작문", "3-2"), (5, "국어", "1-7"), (6, "독서", "2-1")]
    row_y = 674
    for period, subject, class_name in lessons:
        draw.rounded_rectangle((125, row_y, 179, row_y + 54), radius=13, fill=hex_rgb(PAPER))
        draw.text((152, row_y + 12), str(period), anchor="mm", font=font(18, True), fill=hex_rgb(INK))
        draw.text((152, row_y + 34), "교시", anchor="mm", font=font(9), fill=hex_rgb(MUTED))
        draw.text((204, row_y + 7), subject, font=font(19, True), fill=hex_rgb(INK if subject != "공강" else MUTED))
        if class_name:
            draw.text((204, row_y + 34), class_name, font=font(13), fill=hex_rgb(MUTED))
        if period < len(lessons):
            draw.line((122, row_y + 70, 778, row_y + 70), fill=hex_rgb(LINE), width=2)
        row_y += 78

    draw.rounded_rectangle((96, 1190, 804, 1435), radius=30, fill=hex_rgb(WHITE), outline=hex_rgb(LINE), width=2)
    draw.text((125, 1222), "오늘 일정", font=font(21, True), fill=hex_rgb(INK))
    for index, (label, title) in enumerate([("주간계획", "교직원 연수"), ("위원회", "교육과정위원회"), ("급식지도", "2학년 급식지도")]):
        y = 1270 + index * 54
        draw.rounded_rectangle((125, y, 134, y + 38), radius=4, fill=hex_rgb(GREEN if index == 0 else ORANGE))
        draw.text((151, y - 2), label, font=font(12, True), fill=hex_rgb(MUTED))
        draw.text((248, y - 2), title, font=font(16, True), fill=hex_rgb(INK))
    image.save(target, quality=94)
    return target


def draw_phone_base(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int, title: str) -> tuple[int, int, int, int]:
    draw.rounded_rectangle((x, y, x + width, y + height), radius=34, fill=hex_rgb("#111815"))
    draw.rounded_rectangle((x + 10, y + 12, x + width - 10, y + height - 12), radius=26, fill=hex_rgb(WHITE))
    draw.rounded_rectangle((x + width // 2 - 38, y + 17, x + width // 2 + 38, y + 25), radius=4, fill=hex_rgb("#2E3733"))
    draw.text((x + width // 2, y + 42), title, anchor="mm", font=font(15, True), fill=hex_rgb(MUTED))
    return x + 22, y + 72, x + width - 22, y + height - 28


def make_android_steps() -> Path:
    target = TMP_DIR / "android-chrome-steps.png"
    image = Image.new("RGB", (1800, 860), hex_rgb(PAPER))
    draw = ImageDraw.Draw(image)
    panels = [(55, "1  Chrome에서 사이트 열기"), (625, "2  설치 메뉴 선택"), (1195, "3  설치 확인")]
    for x, title in panels:
        x1, y1, x2, y2 = draw_phone_base(draw, x, 45, 520, 760, title)
        if x == 55:
            draw.rounded_rectangle((x1, y1, x2, y1 + 64), radius=14, fill=hex_rgb("#EEF2F0"))
            draw.text((x1 + 24, y1 + 18), "ungcheon-mobile-schedule…", font=font(16), fill=hex_rgb(INK))
            draw.text((x2 - 38, y1 + 11), "⋮", font=font(32, True), fill=hex_rgb(RED))
            draw.ellipse((x2 - 56, y1 - 4, x2 - 4, y1 + 52), outline=hex_rgb(RED), width=5)
            draw.rounded_rectangle((x1 + 18, y1 + 95, x2 - 18, y1 + 420), radius=24, fill=hex_rgb(GREEN_DARK))
            draw.text(((x1 + x2) // 2, y1 + 155), "웅천고", anchor="mm", font=font(40, True), fill=hex_rgb(WHITE))
            draw.text(((x1 + x2) // 2, y1 + 210), "모바일 일정", anchor="mm", font=font(34, True), fill=hex_rgb(WHITE))
            draw.rounded_rectangle((x1 + 80, y1 + 275, x2 - 80, y1 + 342), radius=18, fill=hex_rgb(WHITE))
            draw.text(((x1 + x2) // 2, y1 + 308), "교직원 로그인", anchor="mm", font=font(19, True), fill=hex_rgb(GREEN_DARK))
            draw_pil_text(draw, (x1 + 25, y1 + 470), "주소 표시줄 오른쪽의 세로 점 3개(⋮)를 누르세요.", font(19, True), INK, x2 - x1 - 50)
        elif x == 625:
            menu_items = ["새 탭", "북마크", "최근 탭", "설치 및 바로가기 만들기", "데스크톱 사이트"]
            row_y = y1 + 18
            for item in menu_items:
                highlight = item == "설치 및 바로가기 만들기"
                draw.rounded_rectangle((x1 + 8, row_y, x2 - 8, row_y + 70), radius=13, fill=hex_rgb("#FFF2D2" if highlight else WHITE), outline=hex_rgb(GOLD if highlight else LINE), width=3 if highlight else 1)
                draw.text((x1 + 34, row_y + 21), item, font=font(18, highlight), fill=hex_rgb(INK))
                row_y += 82
            draw_pil_text(draw, (x1 + 25, y2 - 128), "현재 Chrome 메뉴명은 '설치 및 바로가기 만들기'입니다.", font(18, True), INK, x2 - x1 - 50)
        else:
            draw.rounded_rectangle((x1 + 20, y1 + 120, x2 - 20, y1 + 440), radius=24, fill=hex_rgb(WHITE), outline=hex_rgb(LINE), width=3)
            draw.rounded_rectangle((x1 + 52, y1 + 160, x1 + 136, y1 + 244), radius=22, fill=hex_rgb(GREEN))
            draw.text((x1 + 94, y1 + 199), "웅", anchor="mm", font=font(30, True), fill=hex_rgb(GOLD))
            draw.text((x1 + 162, y1 + 170), "웅천고 모바일 일정", font=font(21, True), fill=hex_rgb(INK))
            draw_pil_text(draw, (x1 + 162, y1 + 208), "홈 화면과 앱 목록에 추가합니다.", font(16), MUTED, x2 - x1 - 190)
            draw.rounded_rectangle((x1 + 56, y1 + 325, x2 - 56, y1 + 393), radius=20, fill=hex_rgb(GREEN))
            draw.text(((x1 + x2) // 2, y1 + 359), "설치", anchor="mm", font=font(22, True), fill=hex_rgb(WHITE))
            draw_pil_text(draw, (x1 + 25, y1 + 490), "'설치'를 누른 뒤 홈 화면의 앱 아이콘으로 실행하세요.", font(19, True), INK, x2 - x1 - 50)
    image.save(target, quality=94)
    return target


def make_iphone_steps() -> Path:
    target = TMP_DIR / "iphone-safari-steps.png"
    image = Image.new("RGB", (1800, 860), hex_rgb(PAPER))
    draw = ImageDraw.Draw(image)
    panels = [(55, "1  Safari 공유 열기"), (625, "2  홈 화면에 추가"), (1195, "3  웹 앱으로 추가")]
    for x, title in panels:
        x1, y1, x2, y2 = draw_phone_base(draw, x, 45, 520, 760, title)
        if x == 55:
            draw.rounded_rectangle((x1 + 18, y1 + 30, x2 - 18, y1 + 375), radius=24, fill=hex_rgb(GREEN_DARK))
            draw.text(((x1 + x2) // 2, y1 + 120), "웅천고", anchor="mm", font=font(40, True), fill=hex_rgb(WHITE))
            draw.text(((x1 + x2) // 2, y1 + 175), "모바일 일정", anchor="mm", font=font(34, True), fill=hex_rgb(WHITE))
            draw.rounded_rectangle((x1 + 12, y2 - 94, x2 - 12, y2 - 22), radius=24, fill=hex_rgb("#EEF2F0"))
            draw.text(((x1 + x2) // 2, y2 - 58), "□↑", anchor="mm", font=font(29, True), fill=hex_rgb(RED))
            draw.ellipse(((x1 + x2) // 2 - 37, y2 - 94, (x1 + x2) // 2 + 37, y2 - 20), outline=hex_rgb(RED), width=5)
            draw_pil_text(draw, (x1 + 25, y1 + 430), "iPhone에서는 Safari로 열고 공유 아이콘(사각형 위쪽 화살표)을 누르세요.", font(19, True), INK, x2 - x1 - 50)
        elif x == 625:
            draw.rounded_rectangle((x1 + 5, y1 + 20, x2 - 5, y2 - 20), radius=25, fill=hex_rgb("#F5F6F5"))
            draw.text((x1 + 32, y1 + 45), "공유", font=font(23, True), fill=hex_rgb(INK))
            items = ["복사", "즐겨찾기에 추가", "홈 화면에 추가", "페이지에서 찾기"]
            row_y = y1 + 105
            for item in items:
                highlight = item == "홈 화면에 추가"
                draw.rounded_rectangle((x1 + 24, row_y, x2 - 24, row_y + 78), radius=15, fill=hex_rgb("#FFF2D2" if highlight else WHITE), outline=hex_rgb(GOLD if highlight else LINE), width=3 if highlight else 1)
                draw.text((x1 + 48, row_y + 24), "＋" if highlight else "○", font=font(20, True), fill=hex_rgb(GREEN if highlight else MUTED))
                draw.text((x1 + 94, row_y + 25), item, font=font(18, highlight), fill=hex_rgb(INK))
                row_y += 92
            draw_pil_text(draw, (x1 + 25, y2 - 120), "공유 목록을 아래로 내려 '홈 화면에 추가'를 선택하세요.", font(18, True), INK, x2 - x1 - 50)
        else:
            draw.text((x1 + 20, y1 + 18), "홈 화면에 추가", font=font(23, True), fill=hex_rgb(INK))
            draw.text((x2 - 58, y1 + 18), "추가", font=font(20, True), fill=hex_rgb(RED))
            draw.rounded_rectangle((x1 + 34, y1 + 85, x1 + 130, y1 + 181), radius=24, fill=hex_rgb(GREEN))
            draw.text((x1 + 82, y1 + 130), "웅", anchor="mm", font=font(34, True), fill=hex_rgb(GOLD))
            draw.text((x1 + 160, y1 + 104), "웅천고 모바일 일정", font=font(20, True), fill=hex_rgb(INK))
            draw.text((x1 + 160, y1 + 142), APP_URL.split("//")[1][:28] + "…", font=font(12), fill=hex_rgb(MUTED))
            draw.rounded_rectangle((x1 + 24, y1 + 235, x2 - 24, y1 + 315), radius=15, fill=hex_rgb(WHITE), outline=hex_rgb(LINE), width=2)
            draw.text((x1 + 50, y1 + 261), "웹 앱으로 열기", font=font(19, True), fill=hex_rgb(INK))
            draw.rounded_rectangle((x2 - 118, y1 + 253, x2 - 50, y1 + 293), radius=20, fill=hex_rgb(GREEN))
            draw.ellipse((x2 - 88, y1 + 257, x2 - 54, y1 + 289), fill=hex_rgb(WHITE))
            draw_pil_text(draw, (x1 + 25, y1 + 370), "'웹 앱으로 열기'를 켠 뒤 오른쪽 위 '추가'를 누르세요.", font(19, True), INK, x2 - x1 - 50)
    image.save(target, quality=94)
    return target


def reportlab_wrap(text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        test = current + char
        if current and pdfmetrics.stringWidth(test, font_name, font_size) > max_width:
            lines.append(current.rstrip())
            current = char.lstrip()
        else:
            current = test
    if current:
        lines.append(current)
    return lines


class GuidePDF:
    def __init__(self, output_path: Path):
        self.width, self.height = A4
        self.canvas = canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
        self.canvas.setTitle("웅천고 모바일 일정 홈 화면 설치 안내서")
        self.canvas.setAuthor("웅천고등학교")
        self.page = 0

    def color(self, value: str):
        return HexColor(value)

    def new_page(self, title: str | None = None, section: str | None = None):
        if self.page:
            self.canvas.showPage()
        self.page += 1
        self.canvas.setFillColor(self.color(PAPER))
        self.canvas.rect(0, 0, self.width, self.height, stroke=0, fill=1)
        if title:
            self.canvas.setFillColor(self.color(GREEN_DARK))
            self.canvas.setFont("MalgunBold", 9)
            self.canvas.drawString(40, self.height - 36, section or "웅천고 모바일 일정")
            self.canvas.setFillColor(self.color(INK))
            self.canvas.setFont("MalgunBold", 24)
            self.canvas.drawString(40, self.height - 70, title)
            self.canvas.setStrokeColor(self.color(LINE))
            self.canvas.line(40, self.height - 84, self.width - 40, self.height - 84)

    def footer(self):
        self.canvas.setFillColor(self.color(MUTED))
        self.canvas.setFont("Malgun", 7.5)
        self.canvas.drawString(40, 24, "웅천고 모바일 일정 · 2026.08.24 기준")
        self.canvas.drawRightString(self.width - 40, 24, str(self.page))

    def text(self, x: float, y: float, text: str, size: float = 10, color: str = INK,
             bold: bool = False, max_width: float | None = None, leading: float | None = None) -> float:
        font_name = "MalgunBold" if bold else "Malgun"
        self.canvas.setFont(font_name, size)
        self.canvas.setFillColor(self.color(color))
        lines = reportlab_wrap(text, font_name, size, max_width or self.width - x - 40)
        line_height = leading or size * 1.55
        for index, line in enumerate(lines):
            self.canvas.drawString(x, y - index * line_height, line)
        return y - len(lines) * line_height

    def pill(self, x: float, y: float, label: str, fill: str = GREEN_SOFT, color: str = GREEN):
        width = pdfmetrics.stringWidth(label, "MalgunBold", 8.5) + 20
        self.canvas.setFillColor(self.color(fill))
        self.canvas.roundRect(x, y - 11, width, 22, 11, stroke=0, fill=1)
        self.canvas.setFillColor(self.color(color))
        self.canvas.setFont("MalgunBold", 8.5)
        self.canvas.drawCentredString(x + width / 2, y - 3, label)

    def step(self, number: int, x: float, y: float, title: str, body: str, width: float) -> float:
        self.canvas.setFillColor(self.color(GREEN))
        self.canvas.circle(x + 13, y - 11, 13, stroke=0, fill=1)
        self.canvas.setFillColor(self.color(WHITE))
        self.canvas.setFont("MalgunBold", 9)
        self.canvas.drawCentredString(x + 13, y - 14, str(number))
        self.canvas.setFillColor(self.color(INK))
        self.canvas.setFont("MalgunBold", 10.5)
        self.canvas.drawString(x + 34, y - 7, title)
        next_y = self.text(x + 34, y - 24, body, size=8.7, color=MUTED, max_width=width - 34, leading=12)
        return min(y - 46, next_y - 6)

    def callout(self, x: float, y: float, width: float, height: float, title: str, body: str,
                fill: str = WHITE, accent: str = GREEN):
        self.canvas.setFillColor(self.color(fill))
        self.canvas.setStrokeColor(self.color(LINE))
        self.canvas.roundRect(x, y, width, height, 12, stroke=1, fill=1)
        self.canvas.setFillColor(self.color(accent))
        self.canvas.roundRect(x, y, 5, height, 2.5, stroke=0, fill=1)
        self.text(x + 16, y + height - 22, title, size=10, bold=True, max_width=width - 30)
        self.text(x + 16, y + height - 42, body, size=8.4, color=MUTED, max_width=width - 30, leading=12)

    def link_label(self, x: float, y: float, label: str, url: str, width: float):
        self.canvas.setFillColor(self.color(GREEN))
        self.canvas.setFont("MalgunBold", 8)
        self.canvas.drawString(x, y, label)
        self.canvas.linkURL(url, (x, y - 3, x + width, y + 10), relative=0)

    def finish(self):
        self.canvas.save()


def create_pdf(qr_path: Path, app_preview: Path, android_steps: Path, iphone_steps: Path):
    pdf = GuidePDF(OUTPUT_PDF)
    w, h = pdf.width, pdf.height

    # 1. Cover
    pdf.new_page()
    pdf.canvas.setFillColor(pdf.color(GREEN_DARK))
    pdf.canvas.roundRect(28, 28, w - 56, h - 56, 24, stroke=0, fill=1)
    pdf.canvas.setFillColor(pdf.color("#1A5B46"))
    pdf.canvas.circle(w - 68, h - 92, 118, stroke=0, fill=1)
    icon = ImageReader(str(PROJECT_DIR / "public" / "icon-512.png"))
    pdf.canvas.drawImage(icon, 52, h - 166, 70, 70, mask="auto")
    pdf.pill(52, h - 205, "교직원용 읽기 전용 PWA", fill="#2A6A55", color="#F7D486")
    pdf.text(52, h - 250, "웅천고 모바일 일정", size=30, color=WHITE, bold=True, max_width=350, leading=42)
    pdf.text(52, h - 297, "홈 화면 설치 안내서", size=22, color="#F3D27F", bold=True, max_width=350)
    pdf.text(52, h - 350, "Android Chrome과 iPhone Safari에서\n앱처럼 설치하고 빠르게 여는 방법", size=12.5, color="#D8E7E1", max_width=360, leading=20)
    pdf.canvas.setFillColor(pdf.color(WHITE))
    pdf.canvas.roundRect(52, 250, w - 104, 210, 18, stroke=0, fill=1)
    pdf.canvas.drawImage(ImageReader(str(qr_path)), 70, 282, 150, 150, mask="auto")
    pdf.text(246, 410, "휴대폰 카메라로 QR을 스캔하세요", size=12, bold=True, max_width=260)
    pdf.text(246, 377, APP_URL, size=8.2, color=GREEN, max_width=260, leading=12)
    pdf.canvas.linkURL(APP_URL, (246, 350, 500, 395), relative=0)
    pdf.text(246, 329, "처음 열 때는 인터넷 연결이 필요합니다. 로그인 후에는 마지막으로 정상 조회한 일정과 시간표를 오프라인에서도 확인할 수 있습니다.", size=9, color=MUTED, max_width=260, leading=14)
    pdf.text(52, 175, "보안 안내", size=10, color="#F3D27F", bold=True)
    pdf.text(52, 151, "교직원 명렬에 등록된 이름과 학교 공통 비밀번호로 로그인합니다. 공통 비밀번호는 이 안내서에 적지 않으며, 학교 내부 전달 경로로만 확인하세요.", size=9.2, color="#D8E7E1", max_width=w - 104, leading=15)
    pdf.text(52, 84, "개인 업무와 개인 일정은 PC용 웅천고 업무도우미에서만 확인할 수 있습니다.", size=9, color="#F6DC9A", bold=True, max_width=w - 104)
    pdf.footer()

    # 2. App overview
    pdf.new_page("설치 전에 알아두세요", "01 · 앱 화면과 로그인")
    pdf.canvas.drawImage(ImageReader(str(app_preview)), 48, 112, 230, 604, preserveAspectRatio=True, anchor="c", mask="auto")
    pdf.pill(307, 715, "첫 화면 개선")
    pdf.text(307, 681, "로그인하면 오늘 시간표가\n가장 먼저 보입니다.", size=17, bold=True, max_width=240, leading=24)
    y = 613
    y = pdf.step(1, 307, y, "사이트 열기", "QR 또는 배포 주소로 웅천고 모바일 일정을 엽니다.", 240)
    y = pdf.step(2, 307, y, "교직원 로그인", "교직원 명렬과 일치하는 이름, 학교 공통 비밀번호를 입력합니다.", 240)
    y = pdf.step(3, 307, y, "오늘 시간표 확인", "오늘 수업, 승인·반영된 교환·대강·당김수업을 먼저 확인합니다.", 240)
    y = pdf.step(4, 307, y, "일정 확인", "오늘 일정은 시간표 아래에, 이번 주와 다음 주 일정은 상단 탭에 표시됩니다.", 240)
    pdf.callout(307, 198, 240, 94, "72시간 로그인 유지", "개인 휴대폰에서만 사용하세요. 로그아웃하면 사용자 식별 정보와 사용자별 로컬 캐시가 삭제됩니다.", fill="#FFF9EA", accent=GOLD)
    pdf.callout(307, 91, 240, 91, "읽기 전용", "모바일 앱에서는 일정·시간표를 만들거나 수정·삭제·승인할 수 없습니다. NEIS 정보도 읽지 않습니다.", fill=WHITE, accent=GREEN)
    pdf.footer()

    # 3. Android Chrome
    pdf.new_page("Android Chrome에서 설치", "02 · 안드로이드")
    pdf.text(40, h - 108, "Chrome에서 사이트를 연 뒤 아래 순서대로 진행하세요. 메뉴 명칭은 2026년 8월 공식 도움말 기준입니다.", size=9.2, color=MUTED, max_width=w - 80)
    pdf.canvas.drawImage(ImageReader(str(android_steps)), 40, 372, w - 80, 250, preserveAspectRatio=True, anchor="c", mask="auto")
    left_x, right_x = 40, 306
    y1 = 340
    y1 = pdf.step(1, left_x, y1, "Chrome으로 사이트 열기", "앱 주소를 Chrome에서 엽니다. 페이지가 완전히 표시될 때까지 기다립니다.", 235)
    y1 = pdf.step(2, left_x, y1, "더보기 누르기", "주소 표시줄 오른쪽의 세로 점 3개(⋮)를 누릅니다.", 235)
    y1 = pdf.step(3, left_x, y1, "설치 메뉴 선택", "'설치 및 바로가기 만들기'를 누른 뒤 '설치'를 선택합니다.", 235)
    y2 = 340
    y2 = pdf.step(4, right_x, y2, "설치 확인", "화면 안내에 따라 설치를 완료합니다.", 245)
    y2 = pdf.step(5, right_x, y2, "홈 화면에서 실행", "홈 화면 또는 앱 목록의 '웅천고 모바일 일정' 아이콘을 누릅니다.", 245)
    pdf.callout(40, 102, w - 80, 86, "'설치' 대신 '바로가기 만들기'만 보이는 경우", "더보기 → 설치 및 바로가기 만들기 → 바로가기 만들기 → 추가 순서로 진행하세요. Chrome 로고가 붙은 바로가기는 Chrome 탭으로 열릴 수 있습니다.", fill="#FFF9EA", accent=GOLD)
    pdf.link_label(40, 75, "Google Chrome 공식 도움말 보기", CHROME_GUIDE, 180)
    pdf.footer()

    # 4. iPhone Safari
    pdf.new_page("iPhone Safari에서 설치", "03 · 아이폰")
    pdf.text(40, h - 108, "Apple iOS 26 공식 안내 기준입니다. iPhone에서는 Safari로 열고, 도구 막대 위치는 설정에 따라 위나 아래에 있을 수 있습니다.", size=9.2, color=MUTED, max_width=w - 80)
    pdf.canvas.drawImage(ImageReader(str(iphone_steps)), 40, 372, w - 80, 250, preserveAspectRatio=True, anchor="c", mask="auto")
    y1 = 340
    y1 = pdf.step(1, 40, y1, "Safari로 사이트 열기", "웅천고 모바일 일정 주소를 Safari에서 엽니다.", 235)
    y1 = pdf.step(2, 40, y1, "공유 메뉴 열기", "공유 아이콘(사각형 위쪽 화살표)을 누릅니다. 일부 화면에서는 더 보기(…) 후 '공유'를 누릅니다.", 235)
    y1 = pdf.step(3, 40, y1, "홈 화면에 추가", "공유 목록을 아래로 스크롤해 '홈 화면에 추가'를 누릅니다.", 235)
    y2 = 340
    y2 = pdf.step(4, 306, y2, "웹 앱으로 열기 켜기", "'웹 앱으로 열기' 스위치를 켭니다.", 220)
    y2 = pdf.step(5, 306, y2, "추가 누르기", "오른쪽 위의 '추가'를 누릅니다.", 220)
    y2 = pdf.step(6, 306, y2, "홈 화면에서 실행", "생성된 아이콘을 누르면 Safari 주소창 없이 앱처럼 열립니다.", 220)
    pdf.callout(40, 102, w - 80, 86, "'홈 화면에 추가'가 보이지 않는 경우", "공유 목록 맨 아래의 '동작 편집'을 열고 '홈 화면에 추가'를 선택해 목록에 표시하세요.", fill="#FFF9EA", accent=GOLD)
    pdf.link_label(40, 75, "Apple iPhone 공식 사용 설명서 보기", APPLE_GUIDE, 200)
    pdf.footer()

    # 5. Troubleshooting and sources
    pdf.new_page("문제가 생기면 이렇게 확인하세요", "04 · 문제 해결과 참고")
    pdf.callout(40, 638, 515, 92, "설치 메뉴가 보이지 않아요", "페이지를 완전히 불러온 뒤 브라우저를 최신 버전으로 업데이트하고 다시 시도하세요. Android는 Chrome, iPhone은 Safari 사용을 권장합니다.", fill=WHITE, accent=GREEN)
    pdf.callout(40, 528, 515, 92, "새로고침하거나 네트워크가 끊겼어요", "온라인일 때 한 번 정상 조회하면 일정과 시간표가 안전한 사용자별 로컬 캐시에 저장됩니다. 오프라인에서는 마지막 정상 조회 자료를 표시합니다.", fill=WHITE, accent=GREEN)
    pdf.callout(40, 418, 515, 92, "공용 기기에서 사용했어요", "오른쪽 위 로그아웃 버튼을 누르세요. 로그인 정보와 해당 사용자의 로컬 캐시가 삭제됩니다. 공용 기기에서는 72시간 로그인 유지를 피하세요.", fill="#FFF9EA", accent=GOLD)
    pdf.callout(40, 308, 515, 92, "삼성 인터넷을 사용해요", "주소 표시줄의 설치 또는 + 아이콘을 누르거나, 메뉴의 '현재 페이지 추가/페이지 추가 → 홈 화면'을 선택하세요. 메뉴명은 삼성 인터넷 버전에 따라 달라질 수 있습니다.", fill=WHITE, accent=ORANGE)
    pdf.text(40, 270, "빠른 점검 목록", size=12, bold=True)
    checks = [
        "사이트 주소가 https:// 로 시작하는지 확인",
        "교직원 이름의 띄어쓰기와 철자가 명렬과 정확히 같은지 확인",
        "최초 로그인과 최신 자료 조회 시 인터넷 연결 확인",
        "일정 종류가 보이지 않으면 필터 버튼에서 켜짐 상태 확인",
        "개인 업무·개인 일정은 PC용 웅천고 업무도우미에서 확인",
    ]
    y = 244
    for item in checks:
        pdf.canvas.setFillColor(pdf.color(GREEN))
        pdf.canvas.circle(48, y + 2, 4, stroke=0, fill=1)
        pdf.text(60, y + 5, item, size=9.1, max_width=485)
        y -= 25
    pdf.text(40, 99, "공식 참고 자료", size=10, bold=True)
    pdf.link_label(40, 79, "Google Chrome 웹 앱 설치", CHROME_GUIDE, 160)
    pdf.link_label(215, 79, "Chrome 바로가기 만들기", CHROME_SHORTCUT, 150)
    pdf.link_label(380, 79, "Apple Safari 웹 앱 만들기", APPLE_GUIDE, 165)
    pdf.link_label(40, 58, "Samsung Developer PWA 설치", SAMSUNG_GUIDE, 180)
    pdf.footer()

    pdf.finish()


def validate_pdf():
    reader = PdfReader(str(OUTPUT_PDF))
    if len(reader.pages) != 5:
        raise RuntimeError(f"Expected 5 pages, got {len(reader.pages)}")
    if OUTPUT_PDF.stat().st_size < 100_000:
        raise RuntimeError("PDF output is unexpectedly small")
    if any(page.get_contents() is None for page in reader.pages):
        raise RuntimeError("A PDF page has no content stream")
    link_count = sum(len(page.get("/Annots", [])) for page in reader.pages)
    if link_count < 5:
        raise RuntimeError(f"Expected at least 5 links, got {link_count}")


def main():
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_PDF.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))
    qr_path = make_qr()
    app_preview = make_app_preview()
    android_steps = make_android_steps()
    iphone_steps = make_iphone_steps()
    create_pdf(qr_path, app_preview, android_steps, iphone_steps)
    validate_pdf()
    shutil.copyfile(OUTPUT_PDF, PUBLIC_PDF)
    print(OUTPUT_PDF)
    print(PUBLIC_PDF)


if __name__ == "__main__":
    main()
