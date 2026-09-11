"""Renders the synthetic Japanese business card used for live-provider smoke runs.

Python rather than TypeScript because this draws a raster image once and the
repository has no image library; nothing in the app imports it. Run it only to
regenerate the committed PNG:

    python packages/test-fixtures/assets/generate-synthetic-card.py

Every value is fictional and every domain ends in .invalid, so the fixture
cannot identify a real person or company. AGENTS.md forbids using real
business-card data as a fixture, and a live provider run sends this image to a
third party, which makes that rule load-bearing here rather than a formality.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1000, 600
OUTPUT = Path(__file__).with_name("synthetic-card-ja.png")
FONT_DIR = Path("C:/Windows/Fonts")


def font(name: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size, index=index)


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#ffffff")
    draw = ImageDraw.Draw(image)

    accent = "#1b4f9c"
    draw.rectangle([(0, 0), (18, HEIGHT)], fill=accent)

    bold = font("YuGothB.ttc", 34)
    draw.text((72, 62), "株式会社ミライオ架空製作所", font=bold, fill=accent)
    draw.text(
        (74, 112),
        "産業用センサーとデータ基盤",
        font=font("YuGothR.ttc", 19),
        fill="#666666",
    )

    draw.text(
        (72, 214),
        "デジタル推進本部 データ基盤部",
        font=font("YuGothR.ttc", 23),
        fill="#333333",
    )
    draw.text((72, 252), "部長", font=font("YuGothR.ttc", 25), fill="#333333")
    draw.text((72, 296), "架空 花子", font=font("YuGothB.ttc", 54), fill="#111111")
    draw.text(
        (76, 366),
        "K A K U   H A N A K O",
        font=font("YuGothR.ttc", 17),
        fill="#777777",
    )

    contact = font("YuGothR.ttc", 19)
    lines = [
        "〒108-0075 東京都港区架空台 3-2-1 架空タワー 18F",
        "TEL 03-1234-5678 ／ MOBILE 090-1234-5678",
        "hanako.kaku@miraio-kakuu.invalid ／ www.miraio-kakuu.invalid",
    ]
    for offset, line in enumerate(lines):
        draw.text((72, 452 + offset * 34), line, font=contact, fill="#333333")

    image.save(OUTPUT, format="PNG", optimize=True)
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
