"""Kart Arenası ikon, açılış ekranı ve mağaza kapak görsellerini üretir."""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.abspath(__file__))
FD = os.path.join(ROOT, '..', 'node_modules', '@fontsource-variable', 'bricolage-grotesque', 'files')
CEVIZ, CEVIZ2, CUHA, CUHA2, PIRINC, PIRINC2, CAY, FILDISI = '#2B1A12', '#4A2F21', '#1E5A45', '#2E7A5E', '#D4A44C', '#9C7429', '#B23A2E', '#FAF5EA'
SYM = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def font(size, weight=800):
    out = []
    for sub in ('latin', 'latin-ext'):
        p = os.path.join(FD, f'bricolage-grotesque-{sub}-wght-normal.woff2')
        f = ImageFont.truetype(p, size)
        try: f.set_variation_by_axes([weight])
        except Exception: pass
        cmap = TTFont(p).getBestCmap()
        out.append((f, cmap))
    return out

def draw_text(d, xy, text, fonts, fill):
    x, y = xy
    for ch in text:
        f = next((f for f, cm in fonts if ord(ch) in cm), fonts[0][0])
        d.text((x, y), ch, font=f, fill=fill)
        x += f.getlength(ch)
    return x

def text_width(text, fonts):
    return sum(next((f for f, cm in fonts if ord(ch) in cm), fonts[0][0]).getlength(ch) for ch in text)

def card(w, h, rank, suit, red):
    """Tek bir fildişi kart (gölgesiz)."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(w * 0.11)
    d.rounded_rectangle([0, 0, w - 1, h - 1], r, fill=FILDISI, outline='#E3D6BA', width=max(2, w // 90))
    col = CAY if red else CEVIZ
    fr = ImageFont.truetype(SYM, int(w * 0.24))
    fs = ImageFont.truetype(SYM, int(w * 0.2))
    d.text((w * 0.09, h * 0.04), rank, font=fr, fill=col)
    d.text((w * 0.1, h * 0.04 + w * 0.27), suit, font=fs, fill=col)
    big = ImageFont.truetype(SYM, int(w * 0.62))
    bw = d.textlength(suit, font=big)
    d.text(((w - bw) / 2, h * 0.36), suit, font=big, fill=col)
    return im

def paste_rot(base, im, cx, cy, angle, shadow=True):
    rot = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    if shadow:
        sh = Image.new('RGBA', rot.size, (0, 0, 0, 0))
        sh.paste((0, 0, 0, 70), mask=rot.split()[3])
        sh = sh.filter(ImageFilter.GaussianBlur(rot.size[0] // 28))
        base.alpha_composite(sh, (int(cx - rot.size[0] / 2 + rot.size[0] * .01), int(cy - rot.size[1] / 2 + rot.size[1] * .015)))
    base.alpha_composite(rot, (int(cx - rot.size[0] / 2), int(cy - rot.size[1] / 2)))

def fan(base, cx, cy, cw):
    """Elde tutulmuş gibi ortak bir pivottan açılan üç kart."""
    ch = int(cw * 1.4)
    arm = ch * 0.62
    px, py = cx, cy + arm - ch * 0.08
    for rk, st, red, ang in [('Q', '♦', True, 20), ('K', '♥', True, 0), ('A', '♠', False, -20)]:
        a = math.radians(-ang)
        ccx = px + math.sin(a) * arm
        ccy = py - math.cos(a) * arm
        paste_rot(base, card(cw, ch, rk, st, red), ccx, ccy, ang)

def felt_disc(size, cx, cy, r):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([cx - r - r * .1, cy - r - r * .1, cx + r + r * .1, cy + r + r * .1], fill=PIRINC2)
    d.ellipse([cx - r - r * .06, cy - r - r * .06, cx + r + r * .06, cy + r + r * .06], fill=PIRINC)
    d.ellipse([cx - r - r * .02, cy - r - r * .02, cx + r + r * .02, cy + r + r * .02], fill=CEVIZ)
    # çuha: merkezden dışa koyulaşan yeşil
    for k in range(60, 0, -1):
        t = k / 60
        rr = r * t
        c = tuple(int(a + (b - a) * (1 - t)) for a, b in zip((23, 70, 54), (46, 122, 94)))
        d.ellipse([cx - rr, cy - rr * 0.98, cx + rr, cy + rr * 0.98], fill=c)
    return im

def walnut(w, h):
    im = Image.new('RGBA', (w, h), CEVIZ)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h
        c = tuple(int(a + (b - a) * t) for a, b in zip((74, 47, 33), (30, 18, 12)))
        d.line([(0, y), (w, y)], fill=c)
    ov = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    import random
    rnd = random.Random(7)
    for x in range(0, w, max(6, w // 140)):
        od.line([(x, 0), (x + w * .02, h)], fill=(255, 235, 210, rnd.randint(4, 14)), width=max(1, w // 400))
    im.alpha_composite(ov)
    return im

# 1) İkon (tam boyut, köşesiz — Android maskeyi kendisi uygular)
S = 1024
icon = walnut(S, S)
icon.alpha_composite(felt_disc(S, S / 2, S / 2 + 10, 380))
fan(icon, S / 2, S / 2 + 40, 260)
icon.convert('RGB').save(os.path.join(ROOT, 'icon-only.png'))

# 2) Uyarlanabilir ikon katmanları (ön plan güvenli bölgede)
bg = walnut(S, S); bg.alpha_composite(felt_disc(S, S / 2, S / 2, 470)); bg.convert('RGB').save(os.path.join(ROOT, 'icon-background.png'))
fg = Image.new('RGBA', (S, S), (0, 0, 0, 0)); fan(fg, S / 2, S / 2 + 30, 225); fg.save(os.path.join(ROOT, 'icon-foreground.png'))

# 3) Açılış ekranı
SP = 2732
sp = walnut(SP, SP)
sp.alpha_composite(felt_disc(SP, SP / 2, SP / 2 - 120, 520))
fan(sp, SP / 2, SP / 2 - 90, 330)
d = ImageDraw.Draw(sp)
f = font(190)
t = 'Kart Arenası'
draw_text(d, ((SP - text_width(t, f)) / 2, SP / 2 + 520), t, f, FILDISI)
sp.convert('RGB').save(os.path.join(ROOT, 'splash.png'))
sp.convert('RGB').save(os.path.join(ROOT, 'splash-dark.png'))

# 4) Mağaza kapak görseli 1024x500
W, H = 1024, 500
fgimg = walnut(W, H)
disc = felt_disc(W, 250, 250, 175)
fgimg.alpha_composite(disc)
fan(fgimg, 250, 266, 118)
d = ImageDraw.Draw(fgimg)
ft = font(72); fs = font(28, 500)
draw_text(d, (492, 150), 'Kart Arenası', ft, FILDISI)
d.rectangle([496, 250, 592, 254], fill=PIRINC)
draw_text(d, (496, 278), 'Pişti, Batak, Papaz Kaçtı', fs, PIRINC)
draw_text(d, (496, 320), 'Arkadaşlarınla online, ya da', fs, (250, 245, 234, 200))
draw_text(d, (496, 356), 'bilgisayara karşı.', fs, (250, 245, 234, 200))
fgimg.convert('RGB').save(os.path.join(ROOT, 'feature-graphic.png'))

# 5) Web/PWA ikonları
pub = os.path.join(ROOT, '..', 'apps', 'client', 'public')
for n in (192, 512):
    icon.convert('RGB').resize((n, n), Image.LANCZOS).save(os.path.join(pub, f'icon-{n}.png'))
print('tamam')
