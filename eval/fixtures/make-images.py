#!/usr/bin/env python3
"""Tegner eval-bildene på nytt fra fasitfilene (vitnemal.json, kvittering.json).

De ferdige bildene ligger allerede i eval/fixtures/, så dette trengs bare hvis fasiten endres.
Krever Pillow (pip install pillow) og en TrueType-font (DejaVu på Linux, Arial/Helvetica på macOS).
Bruk: python3 eval/fixtures/make-images.py
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
]
BOLD = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
]
MONO = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/System/Library/Fonts/Menlo.ttc',
]


def font(paths, size):
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def nb_date(iso):
    y, m, d = iso.split('-')
    return f'{d}.{m}.{y}'


def vitnemal():
    data = json.load(open(os.path.join(HERE, 'vitnemal.json'), encoding='utf-8'))
    W, H = 1654, 2339  # A4 i 200 dpi
    img = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    f, fb, fh, fs = font(FONTS, 30), font(BOLD, 30), font(BOLD, 54), font(FONTS, 24)
    x0 = 140
    d.text((x0, 150), 'VITNEMÅL', font=fh, fill='black')
    d.text((x0, 230), 'for videregående opplæring', font=f, fill='black')
    d.text((x0, 320), f'Navn: {data["elev"]}', font=f, fill='black')
    d.text((x0, 370), f'Skole: {data["skole"]}', font=f, fill='black')
    d.text((x0, 420), 'Utdanningsprogram: Studiespesialisering', font=f, fill='black')
    d.text((x0, 470), f'Dato: {nb_date(data["dato"])}', font=f, fill='black')
    y = 580
    cols = [x0, x0 + 230, W - 360]
    d.text((cols[0], y), 'Fagkode', font=fb, fill='black')
    d.text((cols[1], y), 'Fag', font=fb, fill='black')
    d.text((cols[2], y), 'Standpunkt', font=fb, fill='black')
    y += 50
    d.line((x0, y, W - 140, y), fill='black', width=3)
    y += 22
    for i, row in enumerate(data['fag']):
        if i % 2 == 1:
            d.rectangle((x0 - 10, y - 8, W - 130, y + 48), fill=(242, 242, 242))
        d.text((cols[0], y), row['kode'], font=f, fill='black')
        d.text((cols[1], y), row['navn'], font=f, fill='black')
        d.text((cols[2] + 60, y), row['karakter'], font=f, fill='black')
        y += 62
    d.line((x0, y, W - 140, y), fill='black', width=2)
    y += 40
    d.text((x0, y), f'Antall fag: {len(data["fag"])}', font=f, fill='black')
    d.text((x0, y + 60), 'Karakterskala 1–6, der 6 er best og 1 er laveste karakter.', font=fs, fill=(60, 60, 60))
    d.text((x0, H - 260), '______________________________', font=f, fill='black')
    d.text((x0, H - 210), 'Rektor', font=fs, fill='black')
    img.save(os.path.join(HERE, 'vitnemal.png'), optimize=True)


def kvittering():
    data = json.load(open(os.path.join(HERE, 'kvittering.json'), encoding='utf-8'))
    W = 640
    lines = data['linjer']
    H = 520 + 48 * len(lines) + 360
    img = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    f, fb, fh = font(MONO, 26), font(BOLD, 30), font(BOLD, 46)

    def center(text, y, fnt):
        w = d.textlength(text, font=fnt)
        d.text(((W - w) / 2, y), text, font=fnt, fill='black')

    def row(left, right, y, fnt=f):
        d.text((40, y), left, font=fnt, fill='black')
        w = d.textlength(right, font=fnt)
        d.text((W - 40 - w, y), right, font=fnt, fill='black')

    kr = lambda v: f'{v:,.2f}'.replace(',', ' ').replace('.', ',')
    center(data['butikk'], 50, fh)
    center(data['avdeling'].replace(data['butikk'], '').strip() or data['avdeling'], 115, f)
    center('Thorvald Meyers gate 40, 0555 Oslo', 155, f)
    center('Org.nr 912 345 678 MVA', 195, f)
    center(f'{nb_date(data["dato"])}  kl. {data["tid"]}', 250, f)
    y = 320
    d.line((40, y, W - 40, y), fill='black', width=2)
    y += 25
    for l in lines:
        row(l['navn'], kr(l['belop']), y)
        y += 48
    y += 10
    d.line((40, y, W - 40, y), fill='black', width=2)
    y += 25
    row('TOTALT', f'kr {kr(data["total"])}', y, fb)
    y += 60
    row('Bankkort', kr(data['total']), y)
    y += 45
    mva = round(data['total'] - data['total'] / 1.15, 2)
    row('herav MVA 15 %', kr(mva), y)
    y += 80
    center('Takk for handelen!', y, f)
    img.save(os.path.join(HERE, 'kvittering.png'), optimize=True)


if __name__ == '__main__':
    vitnemal()
    kvittering()
    print('Laget vitnemal.png og kvittering.png i', HERE)
