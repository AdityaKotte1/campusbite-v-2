"""Generate MunchAdda ADMIN PWA icons + screenshots into public/.
Dark theme so the installed icon is visually distinct from the student app.
Run: python apps/admin-app/scripts/gen_pwa_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.normpath(os.path.join(HERE, "..", "public"))
os.makedirs(PUB, exist_ok=True)

BRAND = (232, 57, 14)      # #E8390E
SLATE = (31, 41, 55)       # #1f2937
SLATE_DK = (17, 24, 39)    # #111827
WHITE = (255, 255, 255)
BG = (245, 245, 245)
TEXT = (17, 17, 17)
MUTE = (130, 138, 150)
CARD = (255, 255, 255)


def font(size, bold=True):
    names = (["arialbd.ttf", "segoeuib.ttf"] if bold else []) + ["arial.ttf", "segoeui.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(os.path.join(r"C:\Windows\Fonts", n), size)
        except Exception:
            pass
    return ImageFont.load_default()


def centered(d, text, fnt, cx, cy, fill=WHITE):
    b = d.textbbox((0, 0), text, font=fnt)
    w, h = b[2] - b[0], b[3] - b[1]
    d.text((cx - w / 2 - b[0], cy - h / 2 - b[1]), text, font=fnt, fill=fill)


def rounded(size, radius_frac=0.22, bg=SLATE):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_frac), fill=bg)
    return img, d


def icon(size, maskable=False):
    if maskable:
        img = Image.new("RGBA", (size, size), SLATE + (255,))
        d = ImageDraw.Draw(img)
    else:
        img, d = rounded(size)
    centered(d, "MA", font(int(size * (0.30 if maskable else 0.36))), size / 2, size * 0.42)
    # small ADMIN wordmark in brand orange
    centered(d, "ADMIN", font(int(size * 0.12)), size / 2, size * 0.72, BRAND)
    return img


def save(img, name):
    p = os.path.join(PUB, name)
    img.save(p)
    print("wrote", p)


save(icon(192), "icon-192.png")
save(icon(512), "icon-512.png")
save(icon(192, True), "icon-maskable-192.png")
save(icon(512, True), "icon-maskable-512.png")


def screenshot_mobile():
    W, H = 1080, 1920
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # top bar
    d.rectangle([0, 0, W, 230], fill=SLATE)
    d.text((60, 90), "MunchAdda Admin", font=font(60), fill=WHITE)
    # stat cards
    stats = [("Today's Orders", "342"), ("Revenue", "Rs.18,400"), ("Active Kiosks", "3")]
    y = 290
    for label, val in stats:
        d.rounded_rectangle([60, y, W - 60, y + 180], radius=26, fill=CARD)
        d.text((100, y + 36), label, font=font(36, False), fill=MUTE)
        d.text((100, y + 90), val, font=font(64), fill=TEXT)
        y += 210
    # recent orders list
    d.rounded_rectangle([60, y, W - 60, H - 80], radius=26, fill=CARD)
    d.text((100, y + 36), "Recent Orders", font=font(42), fill=TEXT)
    ry = y + 120
    for i in range(6):
        d.text((100, ry), f"MA-2606{i:02d}", font=font(34, False), fill=TEXT)
        d.text((W - 320, ry), "Rs.{}".format(40 + i * 15), font=font(34, False), fill=TEXT)
        d.rounded_rectangle([W - 220, ry - 4, W - 100, ry + 40], radius=16, fill=(220, 245, 230))
        d.text((W - 205, ry + 2), "paid", font=font(28, False), fill=(20, 130, 80))
        ry += 80
    save(img, "screenshot-mobile.png")


def screenshot_wide():
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # sidebar
    d.rectangle([0, 0, 300, H], fill=SLATE)
    d.text((40, 50), "MunchAdda", font=font(44), fill=WHITE)
    d.text((40, 110), "Admin", font=font(30, False), fill=BRAND)
    for i, item in enumerate(["Dashboard", "Orders", "Menu", "Kiosks", "Subscriptions", "Settings"]):
        d.text((40, 210 + i * 70), item, font=font(34, False), fill=(200, 205, 212) if i else WHITE)
    # header
    d.text((360, 50), "Dashboard", font=font(56), fill=TEXT)
    # stat cards
    for i, (label, val) in enumerate([("Orders Today", "342"), ("Revenue", "Rs.18,400"), ("Kiosks Online", "3/3"), ("Active Subs", "12")]):
        x = 360 + i * 380
        d.rounded_rectangle([x, 170, x + 340, 360], radius=24, fill=CARD)
        d.text((x + 30, 210), label, font=font(30, False), fill=MUTE)
        d.text((x + 30, 270), val, font=font(64), fill=TEXT)
    # chart placeholder
    d.rounded_rectangle([360, 410, 1860, 980], radius=24, fill=CARD)
    d.text((400, 450), "Orders this week", font=font(38), fill=TEXT)
    import math
    pts = [(400 + i * 95, 880 - int(180 * (0.5 + 0.45 * math.sin(i / 1.6)))) for i in range(16)]
    d.line(pts, fill=BRAND, width=6, joint="curve")
    save(img, "screenshot-wide.png")


screenshot_mobile()
screenshot_wide()
print("done")
