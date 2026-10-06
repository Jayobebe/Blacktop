"""
Mecha-Nick as pixel art: `python scripts/make-mecha-nick.py [source.png]`.

Redraws public/garage/mecha-nick.png (or a fresh source cutout) small, at the
size he's really shown, so each of his pixels covers whole screen pixels. A
bigger file shrunk by the browser picks stray pixels along his edge, which
showed as a pale outline. Edge pixels left pale by the cutout are taken off,
and the colours are flattened to a short palette.
"""
import sys
from PIL import Image

OUT = 'public/garage/mecha-nick.png'
ACROSS = 96  # his canvas in pixels; he's shown 128 to 144 CSS px wide
COLOURS = 40
PALE = 92    # an edge pixel brighter than this is cutout fringe, unless it's joined to more of the same (the spanner)


def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def main():
    src = Image.open(sys.argv[1] if len(sys.argv) > 1 else OUT).convert('RGBA')
    w = ACROSS
    h = round(src.height * w / src.width)
    # Colour averaged over what's solid only, so the cutout's see-through surround doesn't grey the edge.
    solid = src.copy()
    alpha = src.getchannel('A').point(lambda a: 255 if a > 127 else 0)
    solid.putalpha(alpha)
    pre = Image.new('RGBA', src.size)
    pre.paste(solid.convert('RGB'), mask=alpha)
    small_rgb = pre.convert('RGB').resize((w, h), Image.BOX)
    cover = alpha.resize((w, h), Image.BOX)
    out = Image.new('RGBA', (w, h))
    sp, cp, op = small_rgb.load(), cover.load(), out.load()
    for y in range(h):
        for x in range(w):
            c = cp[x, y]
            if c < 140:
                continue
            k = 255 / c
            r, g, b = sp[x, y]
            op[x, y] = (min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)), 255)

    def clear(x, y):
        return x < 0 or y < 0 or x >= w or y >= h or op[x, y][3] == 0

    # Fringe: a pale pixel on the outside with nothing but dark or empty next to it.
    for _ in range(2):
        gone = []
        for y in range(h):
            for x in range(w):
                if op[x, y][3] == 0 or luma(op[x, y]) < PALE:
                    continue
                near = [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
                if not any(clear(*n) for n in near):
                    continue
                pale_friends = sum(1 for n in near if not clear(*n) and luma(op[n]) >= PALE)
                if pale_friends == 0:
                    gone.append((x, y))
        for x, y in gone:
            op[x, y] = (0, 0, 0, 0)

    # A dark line round him where the edge is still pale (the spanner, a hand), like the rest of his outline.
    ink = (14, 24, 30, 255)
    edge = []
    for y in range(h):
        for x in range(w):
            if op[x, y][3] and luma(op[x, y]) >= PALE and any(clear(*n) for n in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]):
                edge.append((x, y))
    for x, y in edge:
        op[x, y] = ink

    a = out.getchannel('A')
    flat = out.convert('RGB').quantize(COLOURS, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    flat.putalpha(a)
    flat.save(OUT, optimize=True)
    print(OUT, flat.size, len(edge), 'edge pixels inked')


main()
