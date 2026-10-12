from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


output = Path(__file__).resolve().parent / "fixtures"
output.mkdir(parents=True, exist_ok=True)
font = ImageFont.load_default()
for index in range(8):
    image = Image.new("RGB", (800, 533), (23, 27, 32))
    draw = ImageDraw.Draw(image)
    for y in range(533):
        blue = int(40 + 75 * y / 533)
        draw.line((0, y, 799, y), fill=(23 + y // 30, 28 + y // 24, blue))
    for x in range(0, 800, 50):
        draw.line((x, 0, x, 532), fill=(55, 66, 76), width=1)
    for y in range(0, 533, 50):
        draw.line((0, y, 799, y), fill=(55, 66, 76), width=1)
    draw.ellipse((188, 55, 612, 479), outline=(245, 239, 218), width=3)
    draw.line((400, 35, 400, 499), fill=(245, 239, 218), width=2)
    draw.line((166, 267, 634, 267), fill=(245, 239, 218), width=2)
    dot_x = 260 + 40 * index
    draw.ellipse((dot_x - 12, 254, dot_x + 12, 278), fill=(240, 136, 69))
    draw.rounded_rectangle((23, 20, 258, 82), radius=10, fill=(12, 16, 20))
    draw.text((38, 32), "A13 MOCK PREVIEW", fill=(255, 255, 255), font=font)
    draw.text((38, 51), f"SYNTHETIC FRAME {index + 1:02d}/08", fill=(255, 188, 130), font=font)
    image.save(output / f"preview_{index:02d}.jpg", quality=80, subsampling=2)
