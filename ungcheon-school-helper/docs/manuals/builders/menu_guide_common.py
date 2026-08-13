from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[3]
PAGE_W, PAGE_H = landscape(A4)

FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")
pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))
PIL_BOLD = ImageFont.truetype(str(FONT_BOLD), 22)

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
    draw_text(c, title, x + 43, y - 18, 10.2, NAVY, True)
    wrapped(c, body, x + 43, y - 38, w - 57, 7.8, 11.2, MUTED, max_lines=3)


def simple_card(c: canvas.Canvas, title: str, body: str, x: float, y: float, w: float, h: float, color=TEAL, fill=WHITE):
    shadow_card(c, x, y, w, h, fill, LINE, 12)
    c.setFillColor(color)
    c.roundRect(x, y, 6, h, 3, fill=1, stroke=0)
    draw_text(c, title, x + 20, y + h - 25, 10.8, NAVY, True)
    wrapped(c, body, x + 20, y + h - 47, w - 36, 8.2, 12.5, MUTED, max_lines=6)


def page_base(c: canvas.Canvas, menu_no: str, menu_name: str, page: int, total: int, version: str, date: str, section: str, dark=False):
    c.setFillColor(NAVY if dark else PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    if not dark:
        c.setStrokeColor(LINE)
        c.line(38, 47, PAGE_W - 38, 47)
    header_color = PALE_TEAL if dark else TEAL
    footer_color = HexColor("#BAC5D2") if dark else SUBTLE
    draw_text(c, f"MENU {menu_no}  ·  {section}", 40, PAGE_H - 29, 8.4, header_color, True)
    draw_text(c, f"웅천고 업무도우미 v{version}", PAGE_W - 40, PAGE_H - 29, 8.4, WHITE if dark else MUTED, False, "right")
    draw_text(c, "학생 이름·학번은 개인정보 보호를 위해 흐림 처리했습니다.", 40, 27, 7.8, footer_color)
    draw_text(c, f"{date}  |  {page}/{total}", PAGE_W - 40, 27, 7.8, footer_color, False, "right")


def page_title(c: canvas.Canvas, kicker: str, title: str, subtitle: str):
    pill(c, kicker, 40, PAGE_H - 75, PALE_TEAL, TEAL)
    draw_text(c, title, 40, PAGE_H - 116, 22, NAVY, True)
    wrapped(c, subtitle, 40, PAGE_H - 140, PAGE_W - 80, 9.2, 14, MUTED, max_lines=2)


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


def arrow(c: canvas.Canvas, x1: float, y: float, x2: float, color=TEAL):
    c.setStrokeColor(color)
    c.setLineWidth(2.2)
    c.line(x1, y, x2, y)
    c.line(x2 - 8, y + 5, x2, y)
    c.line(x2 - 8, y - 5, x2, y)


def _privacy_blur(image: Image.Image, box: tuple[int, int, int, int]):
    left, top, right, bottom = box
    left, top = max(0, left), max(0, top)
    right, bottom = min(image.width, right), min(image.height, bottom)
    if right <= left or bottom <= top:
        return
    region = image.crop((left, top, right, bottom))
    tiny = region.resize((max(2, region.width // 24), max(2, region.height // 24)), Image.Resampling.BILINEAR)
    obscured = tiny.resize(region.size, Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(4))
    image.paste(obscured, (left, top))


def prepare_capture(
    source: Path,
    output: Path,
    crop: tuple[int, int, int, int] | None = None,
    blur_boxes: Iterable[tuple[int, int, int, int]] = (),
    markers: Iterable[tuple[int, int, int, str]] = (),
    outlines: Iterable[tuple[tuple[int, int, int, int], str, int]] = (),
) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        image = original.convert("RGB")
    for box in blur_boxes:
        _privacy_blur(image, box)
    if crop is not None:
        image = image.crop(crop)
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
    image.save(output, quality=96)
    return output


def add_cover_chips(c: canvas.Canvas, labels: list[tuple[str, object, object]], x: float, y: float):
    for label, fill, color in labels:
        x += pill(c, label, x, y, fill, color, 9.1, 12) + 10
