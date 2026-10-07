"""
Card Wars artwork: turns supplied vehicle cutouts into the files the cards
draw, public/card-wars/<cars|bikes>/<catalog id>.png.

  python scripts/make-card-wars-art.py bikes <folder>
  python scripts/make-card-wars-art.py cars  <folder>
  python scripts/make-card-wars-art.py even  cars|bikes   (existing files: same pixel size for all)

<folder> holds <catalog id>.png files (bikes may also be 1.png .. 20.png in
BIKE_ORDER). Cards draw them pixelated, and every vehicle is about as many
pixels across (PIXELS): finer artwork is redrawn at that size.

Bikes are only trimmed to their visible bounds.

Every picture then gets the set's look (`finish`): stood level on the floor
(several were shot on a slant), brought to the set's pixel size, drawn in a
short palette of its own colours with stray pixels tidied (which takes small
sponsor lettering with it) and a dark line round the outside. New artwork gets
it as it's made; `restyle cars|bikes` gave it to the pictures already there.

Cars were generated on a chroma background and keyed, which left three things
this cleans up (the originals are the Lovable assets named in
src/assets/card-wars/*.png.asset.json):
  - windows showing the key colour through the glass (olive, blue, cyan blocks)
    become smoked glass, and so do windows that were cut clean through, so
    every car's glass looks the same on any backdrop (CABIN below says where
    each car's glass is: wing gaps and open cockpits stay see-through);
  - a one or two pixel fringe of the key colour round the silhouette takes the
    colour of the bodywork next to it;
  - the baked ground shadow goes (some cars had one, some didn't, no bike
    does): the card draws one shadow for every vehicle.
"""
import os
import sys
import math
from collections import Counter, deque
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'card-wars')

BIKE_ORDER = [
    'mt07', 'r6', '890duke', 'f3rr', 'rc8c', 'f3ss', 'striple', 'ninja', 'moto2', 'zx10rr',
    'sv650', 'gsxr', 'gs', 's1000', 'fireblade', 'firebladesbk', 'panigale', 'v4rsbk', 'rs660f', 'rs660',
    # shop-only cards, as their artwork arrives (by catalog id only: 1.png .. 20.png are the twenty above)
    'm1_15', 'gp23', 'rc213v', 'gsxrr', 'rc16', 'rsgp', 'rc211v', 'gp7', 'm1_04', 'nsr500',
    'm1000tt', 'firebladett', 'zx10tt', 'gsxrtt', 'r1tt', 'norton', 'shinden', 'rc30', 'ow01', 'striplett',
]

# Smoked glass: dark, and see-through enough that the backdrop reads behind it.
GLASS = (10, 14, 20, 132)

# Where each car's glass is, in its source image's pixels (x0, y0, x1, y1).
# A see-through hole or a tinted patch whose middle is inside becomes glass;
# outside (rear wing gaps, open cockpits, wheels) it stays as it is.
CABIN = {
    '296gtb': [(100, 5, 260, 48)],
    '911': [(115, 15, 415, 70)],
    'amggt3': [(200, 36, 330, 80)],
    'amggtbs': [(105, 20, 365, 68)],
    'civic': [(88, 18, 440, 85)],
    'gryaris': [(55, 10, 295, 55)],
    'gti': [(40, 15, 325, 68)],
    'gtitcr': [(90, 22, 322, 66)],
    'm3': [(85, 18, 420, 76)],
    'm4gt3': [(200, 28, 415, 78)],
    'mustangdh': [(62, 12, 292, 48)],
    'mx5': [(115, 12, 315, 68)],
    'mx5cup': [(172, 14, 255, 52)],
    'rally': [(48, 24, 280, 62)],
    'suprag4': [(90, 22, 312, 58)],
}


def trim(im):
    """Crop to what's visible (faint halo pixels don't count)."""
    return im.crop(im.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox())


def components(mask, w, h, diagonal):
    """Connected groups of True cells, as lists of (x, y)."""
    steps = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if diagonal else [])
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                seen[y][x] = True
                q = deque([(x, y)])
                pts = []
                while q:
                    cx, cy = q.popleft()
                    pts.append((cx, cy))
                    for dx, dy in steps:
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            q.append((nx, ny))
                out.append(pts)
    return out


def in_cabin(pts, boxes):
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    return any(x0 <= cx <= x1 and y0 <= cy <= y1 for x0, y0, x1, y1 in boxes)


def key_colour(px, w, h):
    """The chroma background, read off the faint bright pixels of the outer fringe."""
    r = g = b = n = 0
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if 16 <= p[3] <= 110 and max(p[:3]) > 150:
                r += p[0]; g += p[1]; b += p[2]; n += 1
    return (r / n, g / n, b / n) if n > 40 else None


def despill(c, key):
    """Takes as much of the key colour out of a pixel as leaves it neutral."""
    cm = sum(c) / 3
    km = sum(key) / 3
    var = sum((k - km) ** 2 for k in key)
    t = sum((c[i] - cm) * (key[i] - km) for i in range(3)) / var if var else 0
    t = max(0.0, t)
    return tuple(max(0, round(c[i] - t * key[i])) for i in range(3))


def clean_car(card, im):
    w, h = im.size
    px = im.load()
    boxes = CABIN.get(card, [])
    key = key_colour(px, w, h)
    opaque = [[px[x, y][3] == 255 for x in range(w)] for y in range(h)]
    semi = [[0 < px[x, y][3] < 255 for x in range(w)] for y in range(h)]

    def solid_near(x, y, r):
        out = []
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and opaque[ny][nx]:
                    out.append(px[nx, ny][:3])
        return out

    glass = [[False] * w for _ in range(h)]
    groups = sorted(components(semi, w, h, True), key=len, reverse=True)
    # Tinted glass: every see-through patch inside the cabin except the outline itself.
    for pts in groups[1:]:
        if in_cabin(pts, boxes):
            for x, y in pts:
                glass[y][x] = True
    # Windows that were cut clean through.
    clear = [[px[x, y][3] == 0 for x in range(w)] for y in range(h)]
    for pts in components(clear, w, h, False):
        edge = any(x == 0 or y == 0 or x == w - 1 or y == h - 1 for x, y in pts)
        if not edge and len(pts) >= 12 and in_cabin(pts, boxes):
            for x, y in pts:
                glass[y][x] = True

    out = im.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if glass[y][x]:
                op[x, y] = GLASS
            elif semi[y][x]:
                r, g, b, a = px[x, y]
                near = solid_near(x, y, 1) or solid_near(x, y, 2)
                if near:
                    # Outline: the bodywork's colour, at the softness it had.
                    n = len(near)
                    op[x, y] = (sum(c[0] for c in near) // n, sum(c[1] for c in near) // n, sum(c[2] for c in near) // n, a)
                elif y < h * 0.4 and a >= 96 and max(r, g, b) < 120:
                    # A thin dark detail on its own up top (an aerial): kept, minus the key colour.
                    op[x, y] = (*(despill((r, g, b), key) if key else (r, g, b)), a)
                else:
                    # Ground shadow, or a halo of the key colour.
                    op[x, y] = (0, 0, 0, 0)
    # Dark trim beside the glass still tinted by the key colour.
    if key and boxes:
        for y in range(h):
            for x in range(w):
                if opaque[y][x] and max(px[x, y][:3]) < 110 and any(x0 - 4 <= x <= x1 + 4 and y0 - 4 <= y <= y1 + 4 for x0, y0, x1, y1 in boxes):
                    if any(0 <= x + dx < w and 0 <= y + dy < h and glass[y + dy][x + dx] for dy in range(-3, 4) for dx in range(-3, 4)):
                        op[x, y] = (*despill(px[x, y][:3], key), 255)
    # The silhouette's own edge: dark pixels there still carry the key colour
    # (the keyed shadow met the car in a tinted line).
    if key:
        gone = [[op[x, y][3] == 0 for x in range(w)] for y in range(h)]
        for y in range(h):
            for x in range(w):
                r, g, b, a = op[x, y]
                if a >= 96 and not glass[y][x] and max(r, g, b) < 110:
                    if any(not (0 <= x + dx < w and 0 <= y + dy < h) or gone[y + dy][x + dx] for dy in range(-2, 3) for dx in range(-2, 3)):
                        op[x, y] = (*despill((r, g, b), key), a)
    return out


# Every card's artwork has pixels of about the same size on the card: the
# vehicle is this many pixels across its longer side (the supplied pixel art
# runs from 100 to 160). Finer artwork is cut down to it, so nothing looks
# like a photograph beside the rest.
PIXELS = {'cars': 132, 'bikes': 120}
STORE = 4  # file pixels to one pixel of the artwork
FINE = 1.25  # only artwork finer than this much over the target is touched


def block_size(im):
    """How many file pixels make one pixel of the artwork (1: not upscaled pixel art)."""
    px = im.load()
    w, h = im.size
    runs = {}
    for y in range(0, h, max(1, h // 40)):
        run = 1
        for x in range(1, w):
            if px[x, y] == px[x - 1, y]:
                run += 1
            else:
                if px[x - 1, y][3] > 200:
                    runs[run] = runs.get(run, 0) + 1
                run = 1
    return max(runs, key=runs.get) if runs else 1


def pixelate(im, across):
    """Redraws `im` with `across` pixels on its longer side: averaged down, hard-edged, scaled back up."""
    w, h = im.size
    scale = across / max(w, h)
    small = (max(1, round(w * scale)), max(1, round(h * scale)))
    # Average with the alpha weighed in, or the see-through background bleeds dark into the edges.
    pre = im.copy()
    r, g, b, a = pre.split()
    pre = Image.merge('RGBA', tuple(Image.composite(c, Image.new('L', im.size, 0), a) for c in (r, g, b)) + (a,))
    down = pre.resize(small, Image.BOX)
    px = down.load()
    for y in range(small[1]):
        for x in range(small[0]):
            pr, pg, pb, pa = px[x, y]
            # A pixel is there or it isn't: no soft edge.
            px[x, y] = (min(255, pr * 255 // pa), min(255, pg * 255 // pa), min(255, pb * 255 // pa), 255) if pa >= 128 else (0, 0, 0, 0)
    up = max(1, round(max(w, h) / max(small)))
    return down.resize((small[0] * up, small[1] * up), Image.NEAREST)


INK = (16, 18, 24, 255)
COLOURS = 20
# Artwork that came out noisy from its source takes the stronger setting (fewer colours, one smoothing pass).
HEAVY = {'norton', 'firebladett', 'rc30'}
LEVEL_MOST = 22.0  # degrees: further off level than this is the picture's own angle (a bike seen from the front), not a slant
LEVEL_LEAST = 1.2


def ground_angle(im):
    """How far off level the vehicle stands, in degrees: the line through the bottom of its tyre at each end. A tyre's
    bottom is dark, a few pixels thick and wide just above its lowest point, which tells it from a paddock stand's foot
    (a thin bar, often lower than the tyre it holds up) so a bike on a stand is levelled by its wheels, not the stand."""
    px = im.load()
    w, h = im.size

    def dark(x, y):
        if not (0 <= x < w and 0 <= y < h):
            return False
        r, g, b, a = px[x, y]
        return a > 128 and 0.299 * r + 0.587 * g + 0.114 * b < 78

    def tyre(x0, x1):
        best = None
        for x in range(x0, x1):
            for y in range(h - 1, h // 3, -1):
                if not dark(x, y):
                    continue
                thick = all(dark(x, y - k) for k in range(1, 4))
                wide = sum(1 for dx in range(-7, 8) if dark(x + dx, y - 2)) >= 9
                if thick and wide:
                    if best is None or y > best[1]:
                        best = (x, y)
                    break
        return best

    left, right = tyre(0, int(w * 0.42)), tyre(int(w * 0.58), w)
    if not left or not right or right[0] - left[0] < w * 0.3:
        return 0.0
    return math.degrees(math.atan2(right[1] - left[1], right[0] - left[0]))


def level(im, block):
    """Stands the vehicle level on the garage floor: several source pictures were shot on a slant. The slant is read
    at the artwork's real pixel size (`block` file pixels a pixel); the picture is turned as it is, hard-edged."""
    seen = im.resize((max(1, round(im.width / block)), max(1, round(im.height / block))), Image.NEAREST) if block > 1 else im
    angle = ground_angle(seen)
    if not LEVEL_LEAST <= abs(angle) <= LEVEL_MOST:
        return im, 0.0
    return trim(im.rotate(angle, resample=Image.NEAREST if block > 1 else Image.BICUBIC, expand=True)), angle


def style(im, heavy=False):
    """The set's look, on artwork at its real pixel size (one file pixel a pixel): a short palette taken from the
    vehicle's own colours, stray pixels tidied (small lettering goes with them), and a dark line round the outside."""
    a = im.getchannel('A').point(lambda v: 255 if v > 110 else 0)
    am = a.load()
    w, h = im.size
    rp = im.convert('RGB').load()
    lumas = sorted(0.299 * r + 0.587 * g + 0.114 * b for r, g, b in (rp[x, y] for y in range(h) for x in range(w) if am[x, y]))
    # A dark vehicle (a black car, a carbon bike) lives in a narrow band of tones: it needs more of the palette to keep
    # its shape, and pushing its colour only turns the shadows into blotches.
    dark = bool(lumas) and lumas[len(lumas) // 2] < 62
    rgb = im.convert('RGB') if dark else ImageEnhance.Contrast(ImageEnhance.Color(im.convert('RGB')).enhance(1.18)).enhance(1.08)
    rp = rgb.load()
    only = [rp[x, y] for y in range(h) for x in range(w) if am[x, y]]
    strip = Image.new('RGB', (max(1, len(only)), 1))
    strip.putdata(only or [(0, 0, 0)])
    pal = strip.quantize(16 if heavy else 30 if dark else COLOURS, method=Image.MEDIANCUT, dither=Image.NONE)
    q = rgb.quantize(palette=pal, dither=Image.NONE)
    if heavy:
        q = q.filter(ImageFilter.ModeFilter(3))
    else:
        src = q.load()
        fixed = q.copy()
        dst = fixed.load()
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if not am[x, y]:
                    continue
                near = [src[x + dx, y + dy] for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and am[x + dx, y + dy]]
                # A pixel that matches at most one of its neighbours takes the commonest colour round it.
                if len(near) >= 5 and near.count(src[x, y]) <= 1:
                    dst[x, y] = Counter(near).most_common(1)[0][0]
        q = fixed
    out = Image.new('RGBA', im.size)
    out.paste(q.convert('RGB'), mask=a)
    px = out.load()
    edge = [(x, y) for y in range(h) for x in range(w)
            if am[x, y] and any(not (0 <= x + dx < w and 0 <= y + dy < h) or not am[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        px[x, y] = INK
    return out


def finish(card, im, kind):
    """A cleaned cutout to the finished card picture: level, the set's pixel size, the set's look, stored 4x."""
    im = trim(im)
    block = block_size(im)
    fine = max(im.size) / block > PIXELS[kind] * FINE
    # Bikes only: the cars were generated standing level, and their wings and splitters fool the tyre finder.
    im, angle = level(im, 1 if fine else block) if kind == 'bikes' else (im, 0.0)
    if fine:
        # Finer than the set: averaged down to PIXELS on the longer side.
        down = pixelate(im, PIXELS[kind])
        up = block_size(down)
        down = down.resize((max(1, round(down.width / up)), max(1, round(down.height / up))), Image.NEAREST)
    else:
        # Pixel art already: one sample from each of its pixels. Averaging here would mix neighbours across every
        # edge (the file's pixels aren't a whole number of file pixels wide) and turn a dark car to mud.
        down = im.resize((max(1, round(im.width / block)), max(1, round(im.height / block))), Image.NEAREST)
    art = trim(style(down, card in HEAVY))
    return art.resize((art.width * STORE, art.height * STORE), Image.NEAREST), angle


def restyle(kind):
    """Gives every finished picture in public/card-wars/<kind> the set's look. Run once: it works on what's there."""
    out_dir = os.path.join(ROOT, kind)
    for f in sorted(os.listdir(out_dir)):
        if not f.endswith('.png'):
            continue
        path = os.path.join(out_dir, f)
        im, angle = finish(f[:-4], Image.open(path).convert('RGBA'), kind)
        im.save(path, optimize=True)
        print(f'{f[:-4]}: {im.size[0] // STORE}x{im.size[1] // STORE} pixels' + (f', levelled {angle:+.1f} deg' if angle else ''))


def even(kind):
    """Brings every finished image in public/card-wars/<kind> to the same pixel size."""
    out_dir = os.path.join(ROOT, kind)
    for f in sorted(os.listdir(out_dir)):
        if not f.endswith('.png'):
            continue
        path = os.path.join(out_dir, f)
        im = Image.open(path).convert('RGBA')
        across = max(im.size) / block_size(im)
        if across <= PIXELS[kind] * FINE:
            continue
        im = trim(pixelate(im, PIXELS[kind]))
        im.save(path, optimize=True)
        print(f'{f[:-4]}: {round(across)} -> {PIXELS[kind]} pixels across, {im.size[0]}x{im.size[1]}')


def main(kind, src):
    out_dir = os.path.join(ROOT, kind)
    os.makedirs(out_dir, exist_ok=True)
    if kind == 'bikes':
        names = BIKE_ORDER
    else:
        names = sorted(f[:-4] for f in os.listdir(src) if f.endswith('.png') and not f.startswith('_'))
    for n, card in enumerate(names, 1):
        path = next((p for p in (os.path.join(src, f'{card}.png'), os.path.join(src, f'{n}.png')) if os.path.exists(p)), None)
        if not path:
            print(f'{card}: no file, skipped')
            continue
        im = Image.open(path).convert('RGBA')
        if kind == 'cars':
            im = clean_car(card, im)
        im, _ = finish(card, im, kind)
        out = os.path.join(out_dir, f'{card}.png')
        im.save(out, optimize=True)
        print(f'{card}: {im.size[0]}x{im.size[1]}, {os.path.getsize(out) // 1024} KB')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'even' and sys.argv[2] in ('cars', 'bikes'):
        even(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == 'restyle' and sys.argv[2] in ('cars', 'bikes'):
        restyle(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] in ('cars', 'bikes'):
        main(sys.argv[1], sys.argv[2])
    else:
        sys.exit(__doc__)
