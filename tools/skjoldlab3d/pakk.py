#!/usr/bin/env python3
"""Skjold Lab: pakker eksporterte deler i printrekkefølge, med diagram og LES-MEG.

Bruk: python3 pakk.py <eksportmappe> <eksportlogg> <utmappe>
  eksportmappe – der eksporter.sh la STL/3MF (LED-veggen i <eksportmappe>/ledvegg/)
  eksportlogg  – konsollen fra eksporter.sh (linjene SKJOLDLAB-MODUL/-DEL/-NETT fra modellen)
  utmappe      – lages: LES-MEG.md, oversikt.svg, stl/<n-gruppe>/…, 3mf/<n-gruppe>/…
Bare standardbiblioteket.
"""
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stl2_3mf import read_stl  # noqa: E402

GRUPPER = [  # (mappe, tittel, forklaring) i printrekkefølge
    ('1-prove', 'Prøvedeler', 'Print disse først og sjekk at skuffen glir i modulen og at LED-stripa passer i kanalen.'),
    ('2-veggmoduler', 'Veggmoduler', 'Print i nummerrekkefølge (M01, M02 …). Nederste rad først, fra venstre. Se oversikt.svg for hvor hver modul står.'),
    ('3-skuffer', 'Skuffer', 'Skuffplate gir flere skuffer per print. Skillevegger er valgfrie.'),
    ('4-led', 'LED (maske og diffusor)', 'Ett sett per modulkolonne, monteres etter at stripa er limt i kanalen.'),
    ('5-beslag', 'Beslag', 'Lasker og pinner som holder modulene sammen.'),
    ('6-elektronikk', 'Elektronikk', 'Boks og lokk for ESP32 og strøm.'),
]
GRUPPE_AV = {'prove': '1-prove', 'skuffer': '3-skuffer', 'led': '4-led', 'beslag': '5-beslag', 'elektronikk': '6-elektronikk', 'moduler': '2-veggmoduler'}
FAKTOR = 0.8  # slicer (2 vegger, 15 % infill) ≈ 80 % av massivt for tynnveggede deler – målt mot Creality-slicer


def kv(line):
    return dict(re.findall(r'(\w+)=("[^"]*"|\S+)', line))


def les_plan(logg):
    moduler, deler, nett = [], [], {}
    sett = set()
    for line in logg.splitlines():
        if 'SKJOLDLAB-MODUL:' in line:
            d = kv(line.split('SKJOLDLAB-MODUL:', 1)[1].rstrip('"'))
            k = (d.get('del'), d.get('modul_x'), d.get('modul_y'), d.get('nr'))
            if k not in sett:
                sett.add(k)
                moduler.append(d)
        elif 'SKJOLDLAB-DEL:' in line:
            d = kv(line.split('SKJOLDLAB-DEL:', 1)[1].rstrip('"'))
            k = ('del', d.get('del'), d.get('navn'))
            if k not in sett:
                sett.add(k)
                deler.append(d)
        elif 'SKJOLDLAB-NETT:' in line and not nett:
            nett = kv(line.split('SKJOLDLAB-NETT:', 1)[1].rstrip('"'))
    moduler.sort(key=lambda m: int(m.get('nr', 0)))
    return moduler, deler, nett


def finn(src, navn_liste):
    """Første STL som finnes blant kandidatnavnene (i src og src/ledvegg)."""
    for n in navn_liste:
        for d in (src / 'ledvegg', src):
            p = d / f'{n}.stl'
            if p.exists():
                return p
    return None


def gram(stl):
    tris = read_stl(stl.read_bytes())
    vol = abs(sum((a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0 for a, b, c in tris)) / 1000.0
    return vol * 1.27 * FAKTOR


def kopier(stl, ut, gruppe, nytt):
    for ext, rot in (('.stl', 'stl'), ('.3mf', '3mf')):
        s = stl.with_suffix(ext)
        if s.exists():
            d = ut / rot / gruppe
            d.mkdir(parents=True, exist_ok=True)
            shutil.copy2(s, d / f'{nytt}{ext}')


def svg(moduler, nett, ut, hylle=(560, 760)):
    W, H = hylle
    m, s = 40, 1.0  # marg og skala (1 mm = 1 px)
    farger = ['#E8D9B5', '#CFE3D0', '#D6DDF0', '#F0D6D6', '#E6D6F0', '#D6F0EE', '#F0E6D6']
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W + 2 * m} {H + 2 * m + 60}" font-family="Helvetica, Arial, sans-serif">',
           f'<rect width="100%" height="100%" fill="#FBF8F1"/>',
           f'<text x="{m}" y="24" font-size="18" font-weight="700" fill="#1b1a17">Skjold Lab – hele hylla sett forfra ({W} × {H} mm)</text>',
           f'<rect x="{m}" y="{m}" width="{W}" height="{H}" fill="none" stroke="#1b1a17" stroke-width="2"/>']
    Y = lambda y, h: m + (H - y - h) * s  # y fra gulvet → svg-y
    rader = {}
    for mo in moduler:
        rader.setdefault(mo.get('y', '0'), len(rader))
    for mo in moduler:
        x, y, b, h = (float(mo.get(k, 0)) for k in ('x', 'y', 'b', 'h'))
        f = farger[rader[mo.get('y', '0')] % len(farger)]
        out.append(f'<rect x="{m + x * s:.1f}" y="{Y(y, h):.1f}" width="{b * s:.1f}" height="{h * s:.1f}" fill="{f}" stroke="#1b1a17" stroke-width="1.5"/>')
    # Skuffer og LED-kanal
    try:
        K, R = int(nett['kolonner']), int(nett['rader'])
        P, RP = float(nett['skuffavstand']), float(nett['radavstand'])
        x0, y0 = float(nett['x0']), float(nett['y0'])
        for r in range(R):
            yc = y0 - r * RP
            out.append(f'<line x1="{m + (x0 - P / 2) * s:.1f}" y1="{Y(yc + 24, 0):.1f}" x2="{m + (x0 + (K - 0.5) * P) * s:.1f}" y2="{Y(yc + 24, 0):.1f}" stroke="#2F6BFF" stroke-width="2" opacity=".55"/>')
            out.append(f'<text x="{m - 8}" y="{Y(yc, 0) + 4:.1f}" font-size="11" text-anchor="end" fill="#8f897c">{r + 1}</text>')
            for c in range(K):
                xc = x0 + c * P
                out.append(f'<rect x="{m + (xc - 21) * s:.1f}" y="{Y(yc - 18, 36):.1f}" width="{42 * s:.1f}" height="{36 * s:.1f}" rx="4" fill="#2a2a2a" opacity=".18"/>')
        for c in range(K):
            out.append(f'<text x="{m + (x0 + c * P) * s:.1f}" y="{m - 6}" font-size="11" text-anchor="middle" fill="#8f897c">{c + 1}</text>')
    except (KeyError, ValueError):
        pass
    for mo in moduler:
        x, y, b, h = (float(mo.get(k, 0)) for k in ('x', 'y', 'b', 'h'))
        nr = int(mo.get('nr', 0))
        cx, cy = m + (x + b / 2) * s, Y(y, h) + h * s / 2
        out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="20" fill="#1b1a17"/><text x="{cx:.1f}" y="{cy + 6:.1f}" font-size="16" font-weight="700" text-anchor="middle" fill="#fff">M{nr:02d}</text>')
    out.append(f'<text x="{m}" y="{H + 2 * m + 20}" font-size="13" fill="#1b1a17">Tall = printrekkefølge (M01 først). Blå linje = LED-stripe over hver rad. Rad 1 er øverst, skuff 1 til venstre (som i Skjold Lab).</text>')
    out.append('</svg>')
    (ut / 'oversikt.svg').write_text('\n'.join(out), encoding='utf-8')


def main():
    src, logg, ut = Path(sys.argv[1]), Path(sys.argv[2]).read_text(encoding='utf-8', errors='replace'), Path(sys.argv[3])
    moduler, deler, nett = les_plan(logg)
    if not moduler:
        print('Fant ingen SKJOLDLAB-MODUL-linjer i loggen', file=sys.stderr)
        return 1
    ut.mkdir(parents=True, exist_ok=True)
    rader, mangler, total = [], [], 0.0
    # Veggmoduler i nummerrekkefølge
    for mo in moduler:
        d, mx, my = mo.get('del', 'modul'), mo.get('modul_x', '0'), mo.get('modul_y', '0')
        stl = finn(src, [f'{d}_x{mx}_y{my}', f'{d}_x{mx}', f'modul_x{mx}_y{my}'])
        nr = int(mo.get('nr', 0))
        navn = f'M{nr:02d}_{mo.get("seksjon", "vegg")}_etasje{int(my) + 1}_kol{int(mx) + 1}'  # etasje nedenfra (ikke Skjold Lab-rad)
        if not stl:
            mangler.append(navn)
            continue
        g = gram(stl)
        total += g
        kopier(stl, ut, '2-veggmoduler', navn)
        rader.append(('2-veggmoduler', navn, 1, g, f'{mo.get("b")} × {mo.get("h")} mm, {mo.get("rader")} rader × {mo.get("kolonner")} kolonner'))
    # Øvrige deler. Filer søkes i ledvegg/ først (LED-veggen), ellers i rotmappa; «maske» treffer maske, maske_hele_x0 …
    har_plate = any(d.get('del') == 'skuffplate' for d in deler)
    def treff(dn):
        for mappe in (src / 'ledvegg', src):
            h = [p for p in sorted(mappe.glob(f'{dn}*.stl')) if p.stem == dn or p.stem.startswith(f'{dn}_')
                 and not any(p.stem.startswith(f'{x.get("del")}') for x in deler if x.get('del') != dn and len(x.get('del', '')) > len(dn))]
            if h:
                return h
        return []
    for d in deler:
        grp = GRUPPE_AV.get(d.get('gruppe', ''), '5-beslag')
        n = int(float(d.get('antall', 1)))
        hits = treff(d.get('del', ''))
        if not hits:
            mangler.append(d.get('navn', d.get('del')))
            continue
        for stl in hits:
            g = gram(stl)
            per = n if len(hits) == 1 else max(1, round(n / len(hits)))
            alternativ = d.get('del') == 'skuff' and har_plate  # enkeltskuff er et alternativ til skuffplate – telles ikke dobbelt
            if not alternativ:
                total += g * per
            kopier(stl, ut, grp, stl.stem)
            rader.append((grp, stl.stem, per, g, 'enkeltvis – alternativ til skuffplate' if alternativ else d.get('navn', '')))
    # Prøvedeler: én skuff + minste veggmodul + én maske
    prove = []
    sk = finn(src, ['skuff'])
    if sk:
        prove.append((sk, '1_skuff'))
    mod_rader = [r for r in rader if r[0] == '2-veggmoduler']
    if mod_rader:
        minst = min(mod_rader, key=lambda r: r[3])
        prove.append((ut / 'stl' / '2-veggmoduler' / f'{minst[1]}.stl', f'2_{minst[1]}'))
    mk = next(iter(sorted((src / 'ledvegg').glob('maske*.stl'))), None)
    if mk:
        prove.append((mk, '3_maske'))
    for stl, navn in prove:
        kopier(stl, ut, '1-prove', navn)
    svg(moduler, nett, ut)
    # LES-MEG
    L = ['# Skjold Lab – hele hylla som sorteringsskap', '',
         'Print i mappe-rekkefølge. Samme filer finnes som **stl/** og **3mf/** (3MF anbefales for Creality Print).', '',
         f'**Anslag filament (alt): ca. {total / 1000:.1f} kg PETG** (massivt × {FAKTOR}, sliceren gir fasit) · ca. {total / 1000 * 25:.0f} timer på K2.', '',
         '![Oversikt](oversikt.svg)', '']
    if nett:
        L += [f'Skuffer: {nett.get("kolonner")} kolonner × {nett.get("rader")} rader = {int(nett.get("kolonner", 0)) * int(nett.get("rader", 0))} skuffer · LED-er: {nett.get("leds", "?")}.', '']
    for mappe, tittel, tekst in GRUPPER:
        r = [x for x in rader if x[0] == mappe]
        if mappe == '1-prove':
            L += [f'## {mappe} – {tittel}', '', tekst, ''] + [f'- `{n}`' for _, n in prove] + ['']
            continue
        if not r:
            continue
        L += [f'## {mappe} – {tittel}', '', tekst, '', '| Fil | Antall | Gram per stk | Merknad |', '|---|---:|---:|---|']
        L += [f'| `{n}` | {a} | {g:.0f} | {mer} |' for _, n, a, g, mer in r] + ['']
    L += ['## Montering', '',
          '1. Print prøvedelene og sjekk passform. Juster `toleranse` i modellen hvis skuffen går tregt.',
          '2. Bygg veggen nedenfra: modulene i nummerrekkefølge, skru/pinn sammen med lasker og pinner.',
          '3. Lim LED-stripa i kanalen over hver rad (serpentine: annenhver rad motsatt vei), sett på maske og diffusor.',
          '4. Koble til ESP32 i elektronikkboksen (se tools/skjoldlab-led/README.md), installer WLED.',
          '5. Skjold Lab → Skap-oppsett: «Sorteringsskap (LED)» med rader × kolonner over, LED-oppsett, kalibrer.', '']
    if mangler:
        L += ['## Mangler', '', 'Disse delene var i planen, men fantes ikke som fil: ' + ', '.join(mangler), '']
    (ut / 'LES-MEG.md').write_text('\n'.join(L), encoding='utf-8')
    print(f'Pakket {len(rader)} filer + {len(prove)} prøvedeler i {ut} · ca. {total / 1000:.1f} kg' + (f' · MANGLER: {", ".join(mangler)}' if mangler else ''))
    return 1 if mangler else 0


if __name__ == '__main__':
    sys.exit(main())
