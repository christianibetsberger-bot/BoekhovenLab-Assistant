"""
Generate PNG icons for BoekhovenLab Assistant PWA.
Draws the Erlenmeyer flask icon in 512x512 and 192x192.
Run: python3 generate-icons.py
"""

from PIL import Image, ImageDraw
import math, os

def cubic_bezier(p0, p1, p2, p3, steps=32):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3*p0[0] + 3*u**2*t*p1[0] + 3*u*t**2*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u**2*t*p1[1] + 3*u*t**2*p2[1] + t**3*p3[1]
        pts.append((x, y))
    return pts

def flask_polygon(scale=1.0):
    """Build the flask outline polygon (coords in 512x512 space, then scaled)."""
    s = scale
    pts = []
    pts.append((206*s, 65*s))
    pts.append((206*s, 190*s))
    pts += cubic_bezier((206*s,190*s),(148*s,220*s),(84*s,294*s),(66*s,368*s))
    pts += cubic_bezier((66*s,368*s),(48*s,428*s),(72*s,466*s),(132*s,472*s))
    pts.append((380*s, 472*s))
    pts += cubic_bezier((380*s,472*s),(440*s,466*s),(464*s,428*s),(446*s,368*s))
    pts += cubic_bezier((446*s,368*s),(428*s,294*s),(364*s,220*s),(306*s,190*s))
    pts.append((306*s, 65*s))
    return [(int(round(x)), int(round(y))) for x, y in pts]

def liquid_polygon(scale=1.0):
    """Clip-like polygon: liquid region inside flask below y=358."""
    s = scale
    top = 358 * s
    pts = []
    # Left edge: points on flask path around y≈358
    pts += cubic_bezier((206*s,190*s),(148*s,220*s),(84*s,294*s),(66*s,368*s))
    pts += cubic_bezier((66*s,368*s),(48*s,428*s),(72*s,466*s),(132*s,472*s))
    pts.append((380*s, 472*s))
    pts += cubic_bezier((380*s,472*s),(440*s,466*s),(464*s,428*s),(446*s,368*s))
    # Only keep points below top
    pts = [(x, y) for x, y in pts if y >= top]
    pts = [(int(round(x)), int(round(y))) for x, y in pts]
    return pts

def make_icon(size, color_top=(26,82,150), color_bottom=(8,45,88)):
    s = size / 512  # scale factor

    # 1. Gradient background layer
    bg = Image.new('RGBA', (size, size), (0,0,0,0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / (size - 1)
        r = int(color_top[0]*(1-t) + color_bottom[0]*t)
        g = int(color_top[1]*(1-t) + color_bottom[1]*t)
        b = int(color_top[2]*(1-t) + color_bottom[2]*t)
        bg_draw.line([(0,y),(size,y)], fill=(r,g,b,255))

    # 2. Squircle mask (rx=114 on 512px ≈ 22%)
    radius = int(114 * s)
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=255)
    result = Image.new('RGBA', (size, size), (0,0,0,0))
    result.paste(bg, (0,0), mask)

    # 3. Gloss overlay
    gloss = Image.new('RGBA', (size, size), (0,0,0,0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_stop = int(0.55 * size)
    for y in range(gloss_stop):
        alpha = int(71 * (1 - y / gloss_stop))
        gloss_draw.line([(0,y),(size,y)], fill=(255,255,255,alpha))
    gloss_masked = Image.new('RGBA', (size, size), (0,0,0,0))
    gloss_masked.paste(gloss, (0,0), mask)
    result = Image.alpha_composite(result, gloss_masked)

    draw = ImageDraw.Draw(result)
    poly = flask_polygon(s)

    # 4. Flask glass body: translucent white fill
    fill_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    fill_draw = ImageDraw.Draw(fill_layer)
    fill_draw.polygon(poly, fill=(255,255,255,26))
    result = Image.alpha_composite(result, fill_layer)

    # 5. Liquid fill region: clipped rectangle intersected with flask shape
    # Draw a clipped liquid by compositing a white rect over a flask mask
    flask_mask = Image.new('L', (size, size), 0)
    flask_mask_draw = ImageDraw.Draw(flask_mask)
    flask_mask_draw.polygon(poly, fill=255)

    liquid = Image.new('RGBA', (size, size), (0,0,0,0))
    liquid_draw = ImageDraw.Draw(liquid)
    ly = int(358 * s)
    liquid_draw.rectangle([0, ly, size, size], fill=(255,255,255,72))
    # Apply flask mask to liquid
    liquid_masked = Image.new('RGBA', (size, size), (0,0,0,0))
    liquid_masked.paste(liquid, (0,0), flask_mask)
    result = Image.alpha_composite(result, liquid_masked)

    # 6. Molecule inside liquid (also clipped to flask mask)
    mol = Image.new('RGBA', (size, size), (0,0,0,0))
    mol_draw = ImageDraw.Draw(mol)
    # Central atom
    cx, cy = int(256*s), int(426*s)
    r_c = int(22*s)
    mol_draw.ellipse([cx-r_c, cy-r_c, cx+r_c, cy+r_c], fill=(255,255,255,235))
    # Left bond + atom
    lx, ly2 = int(170*s), int(380*s)
    mol_draw.line([(int(238*s), int(410*s)), (int(182*s), int(386*s))],
                  fill=(255,255,255,217), width=int(10*s))
    r_l = int(16*s)
    mol_draw.ellipse([lx-r_l, ly2-r_l, lx+r_l, ly2+r_l], fill=(255,255,255,224))
    # Right bond + atom
    rx2, ry2 = int(342*s), int(380*s)
    mol_draw.line([(int(274*s), int(410*s)), (int(330*s), int(386*s))],
                  fill=(255,255,255,217), width=int(10*s))
    r_r = int(16*s)
    mol_draw.ellipse([rx2-r_r, ry2-r_r, rx2+r_r, ry2+r_r], fill=(255,255,255,224))
    # Down bond + small atom
    dx, dy_top = int(256*s), int(448*s)
    mol_draw.line([(dx, dy_top), (dx, int(463*s))],
                  fill=(255,255,255,199), width=int(10*s))
    da_y = int(471*s); r_d = int(13*s)
    mol_draw.ellipse([dx-r_d, da_y-r_d, dx+r_d, da_y+r_d], fill=(255,255,255,199))
    # Micro bubbles
    for (bx, by, br, ba) in [(148,447,9,97),(354,455,7,77),(308,424,5,66)]:
        bx2, by2, br2 = int(bx*s), int(by*s), max(1,int(br*s))
        mol_draw.ellipse([bx2-br2, by2-br2, bx2+br2, by2+br2], fill=(255,255,255,ba))
    mol_masked = Image.new('RGBA', (size, size), (0,0,0,0))
    mol_masked.paste(mol, (0,0), flask_mask)
    result = Image.alpha_composite(result, mol_masked)

    # 7. Flask outline stroke (white, 14px)
    draw = ImageDraw.Draw(result)
    stroke_w = max(3, int(14*s))
    draw.polygon(poly, outline=(255,255,255,230), width=stroke_w)

    # 8. Neck stopper / rim cap
    nx1, ny1 = int(190*s), int(50*s)
    nx2, ny2 = int(322*s), int(70*s)
    rx_neck = int(10*s)
    draw.rounded_rectangle([nx1, ny1, nx2, ny2], radius=rx_neck, fill=(255,255,255,230))

    # 9. Specular highlight on flask shoulder
    spec = [
        (int(288*s),int(200*s)), (int(332*s),int(224*s)), (int(382*s),int(274*s)),
        (int(402*s),int(330*s)), (int(406*s),int(342*s)), (int(402*s),int(354*s)),
        (int(394*s),int(356*s)), (int(385*s),int(358*s)), (int(372*s),int(344*s)),
        (int(368*s),int(332*s)), (int(350*s),int(280*s)), (int(306*s),int(234*s)),
        (int(278*s),int(216*s)),
    ]
    spec_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    ImageDraw.Draw(spec_layer).polygon(spec, fill=(255,255,255,41))
    result = Image.alpha_composite(result, spec_layer)

    return result

# ── Generate and save ────────────────────────────────────────────────────────

out_dir = os.path.join(os.path.dirname(__file__), 'public')

for size in [512, 192]:
    img = make_icon(size)
    path = os.path.join(out_dir, f'icon-{size}.png')
    img.save(path, 'PNG')
    print(f'Saved {path}')

print('Done.')
