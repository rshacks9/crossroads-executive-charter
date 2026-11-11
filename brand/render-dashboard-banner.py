"""Phoenix dashboard artwork for vAMSYS (round 11): hero banner and three link tiles.
    python render-dashboard-banner.py
Uses the login background and the dark-background logo from png/. Needs Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parent
PNG = HERE / "png"; OUT = PNG / "dashboard"; OUT.mkdir(exist_ok=True)
INK, SIGNAL, ON_INK = (27, 35, 40), (232, 112, 58), (238, 242, 243)
FONT = "C:/Windows/Fonts/bahnschrift.ttf"

def font(size):
    f = ImageFont.truetype(FONT, size)
    try: f.set_variation_by_name("Bold Condensed")
    except Exception: pass
    return f

def cover(img, w, h, focus=0.5):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x = (img.width - w) // 2; y = round((img.height - h) * focus)
    return img.crop((x, y, x + w, y + h))

bg = Image.open(PNG / "crossroads-login-background-1706x1600.jpg").convert("RGB")
logo = Image.open(PNG / "crossroads-logo-dark-1800x400.png").convert("RGBA")

# hero banner 1600x520
W, H = 1600, 520
hero = cover(bg, W, H, 0.45)
shade = Image.new("L", (W, H), 0); d = ImageDraw.Draw(shade)
for x in range(W): d.line([(x, 0), (x, H)], fill=int(225 * max(0.0, 1 - x / (W * 0.85)) ** 0.8))
hero = Image.composite(Image.new("RGB", (W, H), INK), hero, shade)
d = ImageDraw.Draw(hero)
lw = 620; lh = round(logo.height * lw / logo.width)
hero.paste(logo.resize((lw, lh), Image.LANCZOS), (70, 60), logo.resize((lw, lh), Image.LANCZOS))
d.text((74, 235), "EXECUTIVE AND CHARTER FLYING", font=font(64), fill=ON_INK)
d.text((74, 305), "FROM THE CROSSROADS OF AMERICA", font=font(64), fill=SIGNAL)
d.rectangle([74, 392, 74 + 110, 398], fill=SIGNAL)
d.text((74, 418), "KTYQ light and mid-size jets  |  KIND large-cabin, VIP, charter and cargo", font=font(30), fill=ON_INK)
d.text((W - 20, H - 14), "Fictional virtual airline for flight simulation", font=font(18), fill=(200, 208, 212), anchor="rs")
hero.save(OUT / "crossroads-dashboard-hero-1600x520.jpg", quality=90)

# link tiles 800x200
for name, label in (("book", "BOOK YOUR FLIGHT"), ("featured", "FEATURED ROUTES"), ("handbook", "PILOT HANDBOOK")):
    t = Image.new("RGB", (800, 200), INK); d = ImageDraw.Draw(t)
    d.polygon([(560, 0), (800, 0), (800, 200), (460, 200)], fill=SIGNAL)
    d.polygon([(540, 0), (556, 0), (456, 200), (440, 200)], fill=(185, 80, 31))
    lw = 300; lh = round(logo.height * lw / logo.width); small = logo.resize((lw, lh), Image.LANCZOS)
    t.paste(small, (24, 20), small)
    d.text((30, 112), label, font=font(54), fill=ON_INK)
    # crossing-routes mark on the orange side
    cx, cy = 680, 100
    d.line([(cx - 48, cy), (cx + 48, cy)], fill=INK, width=9); d.line([(cx, cy - 48), (cx, cy + 48)], fill=INK, width=9)
    for px, py in ((cx - 48, cy), (cx + 48, cy), (cx, cy - 48), (cx, cy + 48)): d.ellipse([px - 11, py - 11, px + 11, py + 11], fill=INK)
    d.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], fill=ON_INK)
    t.save(OUT / f"crossroads-tile-{name}-800x200.png")
print("wrote", [p.name for p in OUT.iterdir()])
