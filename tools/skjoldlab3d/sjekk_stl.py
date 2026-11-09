#!/usr/bin/env python3
"""Skjold Lab: kontroll av eksporterte STL-filer – ikke tom, mål innenfor byggevolumet, og volum/vekt.

Bruk: python3 sjekk_stl.py <mappe> [byggevolum_mm=256] [maks_gram_per_modul=0]  → tabell i markdown; exit 1 hvis noe feiler.
Vekt = volum × 1,27 g/cm³ (PETG, massivt) – et øvre anslag; slicer med 2 vegger og 15 % infill gir typisk 35–60 % av dette.
Med maks_gram_per_modul > 0 feiler filer som heter *modul* og er tyngre enn grensen (massivt anslag).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stl2_3mf import read_stl  # noqa: E402


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'stl')
    plate = float(sys.argv[2]) if len(sys.argv) > 2 else 256.0
    maks_g = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
    rows, bad, total_g = [], [], 0.0
    for f in sorted(root.rglob('*.stl')):
        tris = read_stl(f.read_bytes())
        if not tris:
            rows.append((str(f.relative_to(root)), 0, '-', '-', 'TOM'))
            bad.append(f.name)
            continue
        xs = [v[0] for t in tris for v in t]
        ys = [v[1] for t in tris for v in t]
        zs = [v[2] for t in tris for v in t]
        dim = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
        # Volum via signerte tetraedre (lukket mesh) → cm³ → gram PETG (massivt)
        vol = abs(sum((a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0 for a, b, c in tris)) / 1000.0
        g = vol * 1.27
        total_g += g
        status = 'ok'
        if not all(d <= plate + 0.01 for d in dim):
            status = f'FOR STOR (> {plate:g} mm)'
        elif maks_g > 0 and 'modul' in f.stem and g > maks_g:
            status = f'FOR TUNG (> {maks_g:g} g)'
        rows.append((str(f.relative_to(root)), len(tris), ' × '.join(f'{d:.1f}' for d in dim), f'{vol:.0f} cm³ · {g:.0f} g', status))
        if status != 'ok':
            bad.append(f.name)
    print(f'| Del | Trekanter | Mål (mm) | Volum · vekt (massiv PETG) | Status |\n|---|---:|---|---:|---|')
    for r in rows:
        print(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} |')
    print(f'\n{len(rows)} filer, {len(bad)} med feil' + (f': {", ".join(bad)}' if bad else '') + f'. Sum én av hver: {total_g / 1000:.2f} kg massivt.')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
