"""
Generate PNG icons for BoekhovenLab Assistant PWA — coacervate droplet design.
Draws a polydisperse cluster of liquid droplets (coacervates) with a
radial-gradient approximation: translucent body + bright upper-left highlight.
Run: python3 generate-icons.py
"""

from PIL import Image, ImageDraw
import os

# ---------------------------------------------------------------------------
# Droplet definitions — (cx, cy, r) in 512×512 space
# Ordered largest → smallest so painter's algorithm works correctly.
# ---------------------------------------------------------------------------
DROPLETS = [
    (210, 238, 118),   # main large
    (322, 298,  76),   # second large — overlaps main (coalescence)
    (390, 155,  50),   # medium upper-right
    (128, 372,  36),   # medium lower-left
    (416, 276,  22),   # small right
    (105, 190,  15),   # micro upper-left
    (422, 394,  11),   # micro lower-right
    (170, 462,   8),   # micro bottom
]

# Stroke opacity fractions matching the SVG design
STROKE_OPACITIES = [0.72, 0.65, 0.60, 0.55, 0.50, 0.45, 0.40, 0.35]


def draw_droplet(result, cx, cy, r, stroke_opacity, scale):
    """
    Composite one coacervate droplet onto *result* (RGBA Image).
    Approximates the SVG radial gradient with three layered ellipses:
      1. Translucent body (very low alpha, covers the full circle)
      2. Highlight zone (upper-left offset, ~55% radius, medium alpha)
      3. Specular spot (upper-left offset, ~18% radius, high alpha)
    Plus a white stroke outline.
    """
    cx = int(round(cx * scale))
    cy = int(round(cy * scale))
    r  = int(round(r  * scale))
    if r < 1:
        return result

    size = result.size[0]
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # 1. Translucent body — white at ~7 % opacity (100% – stop at edge of gradient)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255, 255, 255, 18))

    # 2. Highlight zone — offset upper-left, ~55% of r, white at ~38% opacity
    hx = cx - int(r * 0.20)
    hy = cy - int(r * 0.24)
    hr = max(1, int(r * 0.56))
    d.ellipse([hx-hr, hy-hr, hx+hr, hy+hr], fill=(255, 255, 255, 97))

    # 3. Specular spot — tighter upper-left, white at ~87% opacity
    sx = cx - int(r * 0.30)
    sy = cy - int(r * 0.36)
    sr = max(1, int(r * 0.19))
    d.ellipse([sx-sr, sy-sr, sx+sr, sy+sr], fill=(255, 255, 255, 222))

    # 4. Stroke outline
    sw = max(1, int(6.5 * scale))  # scaled from 512-space stroke-width
    sa = int(stroke_opacity * 255)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=(255, 255, 255, sa), width=sw)

    return Image.alpha_composite(result, layer)


def make_icon(size, color_top=(26, 82, 150), color_bottom=(8, 45, 88)):
    s = size / 512  # uniform scale factor

    # ── 1. Gradient background ───────────────────────────────────────────────
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(color_top[0] * (1 - t) + color_bottom[0] * t)
        g = int(color_top[1] * (1 - t) + color_bottom[1] * t)
        b = int(color_top[2] * (1 - t) + color_bottom[2] * t)
        bg_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # ── 2. Squircle mask (rx = 114/512 ≈ 22 %) ──────────────────────────────
    radius = int(114 * s)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, fill=255)

    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(bg, (0, 0), mask)

    # ── 3. Gloss overlay (white 0→0 % fade from top to 50 %) ────────────────
    gloss = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    stop = max(1, int(0.50 * size))
    for y in range(stop):
        alpha = int(64 * (1 - y / stop))
        gloss_draw.line([(0, y), (size, y)], fill=(255, 255, 255, alpha))
    gloss_masked = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gloss_masked.paste(gloss, (0, 0), mask)
    result = Image.alpha_composite(result, gloss_masked)

    # ── 4. Coacervate droplets ───────────────────────────────────────────────
    for (cx, cy, r), so in zip(DROPLETS, STROKE_OPACITIES):
        result = draw_droplet(result, cx, cy, r, so, s)

    return result


# ── Generate and save ────────────────────────────────────────────────────────

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

for size in [512, 192]:
    img = make_icon(size)
    path = os.path.join(out_dir, f'icon-{size}.png')
    img.save(path, 'PNG')
    print(f'Saved {path}')

print('Done.')
