from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "screenshots-original"
OUT.mkdir(parents=True, exist_ok=True)

REGULAR = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 24)
SMALL = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 18)
BOLD = ImageFont.truetype(r"C:\Windows\Fonts\malgunbd.ttf", 28)
TITLE = ImageFont.truetype(r"C:\Windows\Fonts\malgunbd.ttf", 38)


def callout(draw: ImageDraw.ImageDraw, x: int, y: int, number: str) -> None:
    r = 24
    draw.ellipse((x-r, y-r, x+r, y+r), fill="#F5B400", outline="white", width=4)
    bbox = draw.textbbox((0, 0), number, font=BOLD)
    draw.text((x-(bbox[2]-bbox[0])/2, y-(bbox[3]-bbox[1])/2-4), number, font=BOLD, fill="#10233F")


def file_explorer() -> None:
    image = Image.new("RGB", (1200, 720), "#F7F9FC")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1200, 54), fill="#EAF0F7")
    draw.text((24, 13), "다운로드", font=BOLD, fill="#172033")
    draw.rounded_rectangle((18, 70, 1180, 120), 12, fill="white", outline="#D9E1EC")
    draw.text((42, 84), "내 PC  >  다운로드", font=SMALL, fill="#4B5D73")
    draw.rectangle((0, 130, 240, 720), fill="#EFF4F9")
    for i, label in enumerate(["홈", "바탕 화면", "다운로드", "문서", "사진"]):
        y = 170 + i * 54
        if label == "다운로드":
            draw.rounded_rectangle((18, y-8, 220, y+34), 10, fill="#DDEBFF")
        draw.text((42, y), label, font=SMALL, fill="#203247")
    draw.text((280, 160), "이름", font=SMALL, fill="#5F7085")
    draw.text((820, 160), "수정한 날짜", font=SMALL, fill="#5F7085")
    draw.text((1030, 160), "크기", font=SMALL, fill="#5F7085")
    draw.rounded_rectangle((265, 195, 1170, 270), 10, fill="#DDEBFF", outline="#7FB0F2", width=2)
    draw.rounded_rectangle((286, 212, 326, 252), 8, fill="#19B8A2")
    draw.text((295, 216), "웅", font=SMALL, fill="white")
    draw.text((345, 214), "UngcheonSchoolHelper-Setup-1.1.2.exe", font=BOLD, fill="#12233A")
    draw.text((820, 218), "2026-08-10 오전", font=SMALL, fill="#52647B")
    draw.text((1030, 218), "약 130MB", font=SMALL, fill="#52647B")
    callout(draw, 1110, 232, "1")
    draw.rounded_rectangle((270, 310, 1110, 405), 14, fill="#FFF4CF", outline="#E1A600", width=2)
    draw.text((295, 330), "설치 파일을 두 번 빠르게 클릭합니다.", font=BOLD, fill="#6F4A00")
    draw.text((295, 370), "파일 이름과 버전이 학교에서 안내한 것과 같은지 먼저 확인하세요.", font=SMALL, fill="#6F4A00")
    image.save(OUT / "00-설치-01-설치파일실행.png")


def smart_screen(expanded: bool) -> None:
    image = Image.new("RGB", (1200, 720), "#0878D1")
    draw = ImageDraw.Draw(image)
    draw.text((72, 72), "Windows의 PC 보호", font=TITLE, fill="white")
    draw.text((72, 145), "Microsoft Defender SmartScreen에서 인식할 수 없는 앱의 시작을 차단했습니다.", font=REGULAR, fill="white")
    draw.text((72, 185), "이 앱을 실행하면 PC가 위험에 노출될 수 있습니다.", font=REGULAR, fill="white")
    if not expanded:
        draw.text((72, 270), "추가 정보", font=BOLD, fill="white")
        draw.line((72, 308, 190, 308), fill="white", width=2)
        callout(draw, 225, 288, "2")
        draw.rounded_rectangle((765, 570, 1100, 640), 4, fill="#F4F4F4")
        draw.text((850, 586), "실행 안 함", font=BOLD, fill="#172033")
        filename = "00-설치-02-Windows보호화면.png"
    else:
        draw.text((72, 265), "앱: UngcheonSchoolHelper-Setup-1.1.2.exe", font=REGULAR, fill="white")
        draw.text((72, 310), "게시자: 알 수 없는 게시자", font=REGULAR, fill="white")
        draw.rounded_rectangle((610, 570, 825, 640), 4, fill="#F4F4F4")
        draw.text((660, 586), "실행 안 함", font=BOLD, fill="#172033")
        draw.rounded_rectangle((850, 570, 1100, 640), 4, fill="#F4F4F4")
        draw.text((930, 586), "실행", font=BOLD, fill="#172033")
        callout(draw, 1120, 604, "3")
        filename = "00-설치-03-실행버튼.png"
    draw.text((72, 665), "※ Windows 버전에 따라 문구와 버튼 위치가 조금 다를 수 있습니다.", font=SMALL, fill="#DCEFFF")
    image.save(OUT / filename)


def finish() -> None:
    image = Image.new("RGB", (1100, 660), "#F7F9FC")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1100, 62), fill="#EAF0F7")
    draw.text((22, 14), "웅천고 업무도우미 설치", font=BOLD, fill="#172033")
    draw.text((55, 105), "설치 완료", font=TITLE, fill="#172033")
    draw.text((55, 180), "웅천고 업무도우미가 컴퓨터에 설치되었습니다.", font=REGULAR, fill="#34465B")
    draw.text((55, 225), "마침을 누르면 프로그램을 실행할 수 있습니다.", font=REGULAR, fill="#34465B")
    draw.rounded_rectangle((55, 320, 90, 355), 5, fill="white", outline="#63748A", width=2)
    draw.line((62, 337, 72, 347), fill="#6550E8", width=4)
    draw.line((72, 347, 86, 326), fill="#6550E8", width=4)
    draw.text((108, 321), "웅천고 업무도우미 실행", font=REGULAR, fill="#172033")
    draw.rounded_rectangle((815, 540, 1035, 610), 8, fill="#6D45E8")
    draw.text((890, 557), "마침", font=BOLD, fill="white")
    callout(draw, 1050, 575, "5")
    image.save(OUT / "00-설치-05-설치완료.png")


def install_options() -> None:
    source_path = OUT / "00-설치-설치마법사시작.png"
    if not source_path.exists():
        return
    source = Image.open(source_path).convert("RGB")
    canvas = Image.new("RGB", (1200, 720), "#F7F9FC")
    resized = source.resize((1050, int(source.height * 1050 / source.width)))
    canvas.paste(resized, (75, 45))
    draw = ImageDraw.Draw(canvas)
    callout(draw, 1060, 625, "4")
    draw.rounded_rectangle((110, 610, 810, 690), 13, fill="#FFF4CF", outline="#D99A00", width=2)
    draw.text((135, 625), "학교 PC에서는 '전용(내 이름)'을 선택한 뒤 다음을 누르세요.", font=SMALL, fill="#6F4A00")
    draw.text((135, 658), "관리자 권한을 요구하면 학교 담당자에게 문의합니다.", font=SMALL, fill="#6F4A00")
    canvas.save(OUT / "00-설치-04-설치옵션.png")


file_explorer()
smart_screen(False)
smart_screen(True)
install_options()
finish()
print(OUT)
