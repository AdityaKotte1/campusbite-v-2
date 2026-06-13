"""Generate MunchAdda PWA icons + screenshots into public/.
Run: python apps/student-app/scripts/gen_pwa_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.normpath(os.path.join(HERE, "..", "public"))
os.makedirs(PUB, exist_ok=True)

BRAND = (232, 57, 14)       # #E8390E
BRAND_DK = (193, 45, 10)
WHITE = (255, 255, 255)
BG = (245, 245, 245)
TEXT = (17, 17, 17)
MUTE = (120, 120, 120)
PALE = (255, 224, 214)


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


def rounded(size, radius_frac=0.22, bg=BRAND):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_frac), fill=bg)
    return img, d


def icon(size, maskable=False):
    if maskable:
        img = Image.new("RGBA", (size, size), BRAND + (255,))
        d = ImageDraw.Draw(img)
        centered(d, "MA", font(int(size * 0.34)), size / 2, size / 2)
    else:
        img, d = rounded(size)
        centered(d, "MA", font(int(size * 0.42)), size / 2, size / 2)
    return img


def save(img, name):
    path = os.path.join(PUB, name)
    img.save(path)
    print("wrote", path)


# ── Icons ──────────────────────────────────────────────────────────────────
save(icon(192), "icon-192.png")
save(icon(512), "icon-512.png")
save(icon(192, True), "icon-maskable-192.png")
save(icon(512, True), "icon-maskable-512.png")


# ── Mobile screenshot (1080x1920) ────────────────────────────────────────────
def screenshot_mobile():
    W, H = 1080, 1920
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # header
    d.rectangle([0, 0, W, 300], fill=BRAND)
    centered(d, "MunchAdda", font(76), W / 2, 130, WHITE)
    centered(d, "Skip the queue. Order ahead.", font(36, False), W / 2, 215, PALE)
    # search bar
    d.rounded_rectangle([60, 360, W - 60, 460], radius=26, fill=WHITE)
    d.text((100, 392), "Search canteens or dishes", font=font(36, False), fill=MUTE)
    # cards
    y = 540
    for name, sub, col in [
        ("Main Canteen", "Open  ·  4.5 ★", (255, 196, 170)),
        ("Block A Cafe", "Open  ·  4.3 ★", (255, 214, 150)),
        ("Juice Corner", "Open  ·  4.7 ★", (180, 224, 200)),
    ]:
        d.rounded_rectangle([60, y, W - 60, y + 230], radius=30, fill=WHITE)
        d.rounded_rectangle([92, y + 32, 300, y + 198], radius=22, fill=col)
        d.text((340, y + 60), name, font=font(50), fill=TEXT)
        d.text((340, y + 130), sub, font=font(36, False), fill=MUTE)
        y += 290
    # bottom nav
    d.rectangle([0, H - 150, W, H], fill=WHITE)
    for i, lbl in enumerate(["Home", "Orders", "QR", "Profile"]):
        cx = W * (i + 0.5) / 4
        d.ellipse([cx - 8, H - 110, cx + 8, H - 94], fill=BRAND if i == 0 else (200, 200, 200))
        centered(d, lbl, font(28, False), cx, H - 55, BRAND if i == 0 else MUTE)
    save(img, "screenshot-mobile.png")


# ── Wide screenshot (1920x1080) ──────────────────────────────────────────────
def screenshot_wide():
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), BRAND)
    d = ImageDraw.Draw(img)
    logo, _ = rounded(240, radius_frac=0.26, bg=WHITE)
    ld = ImageDraw.Draw(logo)
    centered(ld, "MA", font(110), 120, 120, BRAND)
    img.paste(logo, (int(W / 2 - 120), 300), logo)
    centered(d, "MunchAdda", font(120), W / 2, 660, WHITE)
    centered(d, "Order food from your campus canteen", font(50, False), W / 2, 770, PALE)
    save(img, "screenshot-wide.png")


screenshot_mobile()
screenshot_wide()
print("done")
