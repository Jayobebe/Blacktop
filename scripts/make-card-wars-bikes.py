"""
Card Wars bike artwork: trims supplied transparent cutouts to their visible
bounds and writes them to public/card-wars/bikes/<catalog id>.png (the card
CSS fits any trimmed cutout into its centred photo box, as with the cars).

  python scripts/make-card-wars-bikes.py <folder>

<folder> holds either <catalog id>.png files (mt07.png, r6.png, ...) or
1.png .. 20.png in ORDER below. Pixels stay as supplied: cards draw them
pixelated, so nothing is resampled.
"""
import os
import sys
from PIL import Image

ORDER = [
    'mt07', 'r6', '890duke', 'f3rr', 'rc8c', 'f3ss', 'striple', 'ninja', 'moto2', 'zx10rr',
    'sv650', 'gsxr', 'gs', 's1000', 'fireblade', 'firebladesbk', 'panigale', 'v4rsbk', 'rs660f', 'rs660',
]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'card-wars', 'bikes')


def main(src: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    for n, card in enumerate(ORDER, 1):
        path = next((p for p in (os.path.join(src, f'{card}.png'), os.path.join(src, f'{n}.png')) if os.path.exists(p)), None)
        if not path:
            print(f'{card}: no file, skipped')
            continue
        im = Image.open(path).convert('RGBA')
        # Faint halo pixels don't count as the bike.
        box = im.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
        im = im.crop(box)
        out = os.path.join(OUT, f'{card}.png')
        im.save(out, optimize=True)
        print(f'{card}: {im.size[0]}x{im.size[1]}, {os.path.getsize(out) // 1024} KB')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
