"""Builds the small web images from the mascot SVGs in assets/buck-svg/.

Each of those SVGs is ~1 MB: a 1254px PNG plus a luminance mask, embedded as base64. Shown at
36-150px that is far too heavy for a page (and for Google's favicon crawler), so this renders
each one exactly as the SVG draws it (same transform, same mask) and writes:

  public/buck-img/<name>.webp      512px mascots used by the pages
  public/favicon.ico               16/32/48px, for browsers and Google search results
  public/icon-192.png, icon-512.png   app/manifest icons (Google uses 48px multiples)
  public/apple-touch-icon.png      180px on the brand cream (iOS shows transparency as black)
  public/og-image.png              1200x630 preview for links shared on social apps

Run from the repo root:  python scripts/build-images.py   (needs Pillow)
"""
import base64
import io
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'buck-svg'  # source art only; pages use the small files built from it
OUT = ROOT / 'public' / 'buck-img'
CREAM = (255, 248, 240, 255)
ORANGE = (249, 115, 22, 255)
BROWN = (62, 39, 35, 255)


def render(svg_path, size):
    """The SVG's picture at size x size, with the mask applied as transparency."""
    s = svg_path.read_text(encoding='utf-8')
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    scale, _, _, _, tx, ty = [float(v) for v in re.search(r'transform="matrix\(([^)]+)\)"', s).group(1).split(',')]
    mask_b64, main_b64 = re.findall(r'data:image/png;base64,([A-Za-z0-9+/=]+)', s)[:2]
    mask = Image.open(io.BytesIO(base64.b64decode(mask_b64))).convert('RGBA')
    main = Image.open(io.BytesIO(base64.b64decode(main_b64))).convert('RGBA')

    # SVG luminance mask (0.2126 R + 0.7152 G + 0.0722 B), times the mask image's own alpha.
    r, g, b, a = mask.split()
    lum = Image.merge('RGB', (r, g, b)).convert('L')
    mask_alpha = Image.composite(lum, Image.new('L', lum.size, 0), a)
    alpha = Image.composite(main.getchannel('A'), Image.new('L', main.size, 0), mask_alpha)
    main.putalpha(alpha)

    # The viewBox maps to image pixels through the inverse of the shared transform.
    box = ((vb[0] - tx) / scale, (vb[1] - ty) / scale,
           (vb[0] + vb[2] - tx) / scale, (vb[1] + vb[3] - ty) / scale)
    # Offsets like 0.00003 come out a hair negative; keep the box inside the image.
    w, h = main.size
    box = (max(0.0, box[0]), max(0.0, box[1]), min(float(w), box[2]), min(float(h), box[3]))
    return main.resize((size, size), Image.LANCZOS, box=box)


def on_background(img, color):
    bg = Image.new('RGBA', img.size, color)
    bg.alpha_composite(img)
    return bg


def font(size):
    for name in ('seguibl.ttf', 'segoeuib.ttf', 'arialbd.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    OUT.mkdir(exist_ok=True)
    for svg in sorted(SRC.glob('*.svg')):
        out = OUT / (svg.stem + '.webp')
        render(svg, 512).save(out, 'WEBP', quality=86, method=6)
        print(f'{out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB  (from {svg.stat().st_size // 1024} KB)')

    logo = render(SRC / 'favicon.svg', 512)
    logo.save(ROOT / 'public' / 'icon-512.png', optimize=True)
    logo.resize((192, 192), Image.LANCZOS).save(ROOT / 'public' / 'icon-192.png', optimize=True)
    on_background(logo, CREAM).resize((180, 180), Image.LANCZOS).convert('RGB').save(
        ROOT / 'public' / 'apple-touch-icon.png', optimize=True)
    logo.save(ROOT / 'public' / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

    # Link preview: mascot on the left, name and promise on the right.
    og = Image.new('RGBA', (1200, 630), CREAM)
    draw = ImageDraw.Draw(og)
    draw.rectangle([0, 0, 1200, 14], fill=ORANGE)
    og.alpha_composite(render(SRC / 'hero.svg', 470), (70, 90))
    draw.text((580, 190), 'Buck the Duck', font=font(78), fill=BROWN)
    draw.text((582, 300), 'Turn any module PDF into', font=font(40), fill=(107, 66, 38, 255))
    draw.text((582, 352), 'AI flashcards & quizzes.', font=font(40), fill=(107, 66, 38, 255))
    draw.rounded_rectangle([582, 440, 1000, 510], radius=35, fill=ORANGE)
    draw.text((612, 455), 'bucktheduck.site', font=font(34), fill=(255, 255, 255, 255))
    og.convert('RGB').save(ROOT / 'public' / 'og-image.png', optimize=True)

    for name in ('favicon.ico', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og-image.png'):
        p = ROOT / 'public' / name
        print(f'public/{name}  {p.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
