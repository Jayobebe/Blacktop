"""
Builds every native app icon and splash from public/apple-touch-icon.png (the BT
mark): the iOS App Store icon, Android launcher icons (legacy, round and
adaptive foreground) and both platforms' splash screens.

    python scripts/make-app-icons.py      (needs Pillow: python -m pip install pillow)

Stores and launchers apply their own corner masks, so the master is cropped
inside the source's baked-in rounded corners to a full-bleed square.
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'apple-touch-icon.png')
BG = (10, 10, 10)  # the app's near-black (--background)

src = Image.open(SRC).convert('RGB')
w, h = src.size
inset = round(w * 0.05)  # clears the rounded corners and their worn edge
master = src.crop((inset, inset, w - inset, h - inset)).resize((1024, 1024), Image.LANCZOS)


def save(img, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print('wrote', os.path.relpath(path, ROOT), img.size)


def rounded(img, radius_frac):
    size = img.size[0]
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=round(size * 4 * radius_frac), fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def circle(img):
    size = img.size[0]
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


# iOS: one 1024 icon, no alpha (App Store rejects transparency).
save(master, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')

# Android launcher icons per density.
densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
res = ('android', 'app', 'src', 'main', 'res')
for name, k in densities.items():
    legacy = master.resize((round(48 * k),) * 2, Image.LANCZOS)
    save(rounded(legacy, 0.18), *res, f'mipmap-{name}', 'ic_launcher.png')
    save(circle(legacy), *res, f'mipmap-{name}', 'ic_launcher_round.png')
    # Adaptive foreground: 108dp, full bleed; the launcher's mask shows the middle ~66%, where BT sits.
    save(master.resize((round(108 * k),) * 2, Image.LANCZOS), *res, f'mipmap-{name}', 'ic_launcher_foreground.png')


def splash(width, height):
    img = Image.new('RGB', (width, height), BG)
    mark = round(min(width, height) * 0.28)
    icon = rounded(master.resize((mark, mark), Image.LANCZOS), 0.22)
    img.paste(icon, ((width - mark) // 2, (height - mark) // 2), icon)
    return img


# Android splash screens: replace each existing image at its own size.
for folder in os.listdir(os.path.join(ROOT, *res)):
    if not folder.startswith('drawable'):
        continue
    p = os.path.join(ROOT, *res, folder, 'splash.png')
    if os.path.exists(p):
        size = Image.open(p).size
        save(splash(*size), *res, folder, 'splash.png')

# iOS splash (the storyboard shows it scaled to fill).
for n in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
    save(splash(2732, 2732), 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset', n)
