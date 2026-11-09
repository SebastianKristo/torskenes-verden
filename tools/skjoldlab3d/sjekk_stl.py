#!/usr/bin/env python3
"""Skjold Lab: kontroll av eksporterte STL-filer – ikke tom, og mål innenfor byggevolumet.

Bruk: python3 sjekk_stl.py <mappe> [byggevolum_mm=256]  → tabell i markdown; exit 1 hvis noe feiler.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stl2_3mf import read_stl  # noqa: E402


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'stl')
    plate = float(sys.argv[2]) if len(sys.argv) > 2 else 256.0
    rows, bad = [], []
    for f in sorted(root.rglob('*.stl')):
        tris = read_stl(f.read_bytes())
        if not tris:
            rows.append((str(f.relative_to(root)), 0, '-', 'TOM'))
            bad.append(f.name)
            continue
        xs = [v[0] for t in tris for v in t]
        ys = [v[1] for t in tris for v in t]
        zs = [v[2] for t in tris for v in t]
        dim = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
        ok = all(d <= plate + 0.01 for d in dim)
        rows.append((str(f.relative_to(root)), len(tris), ' × '.join(f'{d:.1f}' for d in dim), 'ok' if ok else f'FOR STOR (> {plate:g} mm)'))
        if not ok:
            bad.append(f.name)
    print(f'| Del | Trekanter | Mål (mm) | Status |\n|---|---:|---|---|')
    for r in rows:
        print(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} |')
    print(f'\n{len(rows)} filer, {len(bad)} med feil' + (f': {", ".join(bad)}' if bad else ''))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
