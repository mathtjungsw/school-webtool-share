from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    title = sys.argv[3]
    pages = sorted(source.glob("page-*.png"))
    if not pages:
        raise SystemExit(f"렌더링 페이지가 없습니다: {source}")

    font_path = Path(r"C:\Windows\Fonts\malgunbd.ttf")
    title_font = ImageFont.truetype(str(font_path), 28)
    label_font = ImageFont.truetype(str(font_path), 18)
    thumb_w = 760
    gap = 28
    margin = 32
    title_h = 64
    thumbs: list[tuple[Image.Image, str]] = []
    for index, page_path in enumerate(pages, 1):
        with Image.open(page_path) as src:
            image = src.convert("RGB")
        thumb_h = round(image.height * thumb_w / image.width)
        thumbs.append((image.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS), f"{index}쪽"))

    row_h = max(image.height for image, _ in thumbs) + 46
    rows = (len(thumbs) + 1) // 2
    sheet = Image.new("RGB", (margin * 2 + thumb_w * 2 + gap, margin * 2 + title_h + rows * row_h + (rows - 1) * gap), "#e9edf0")
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, margin), title, font=title_font, fill="#132238")
    for index, (image, label) in enumerate(thumbs):
        row, col = divmod(index, 2)
        x = margin + col * (thumb_w + gap)
        y = margin + title_h + row * (row_h + gap)
        draw.rounded_rectangle((x - 5, y - 5, x + image.width + 5, y + image.height + 5), radius=10, fill="white", outline="#cbd4db", width=2)
        sheet.paste(image, (x, y))
        draw.text((x, y + image.height + 12), label, font=label_font, fill="#243245")
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=94)
    print(output)


if __name__ == "__main__":
    main()
