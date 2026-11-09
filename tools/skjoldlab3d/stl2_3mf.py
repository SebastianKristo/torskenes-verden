#!/usr/bin/env python3
"""Skjold Lab: gjør STL-filer om til 3MF (ett objekt per fil, mm). Bare standardbiblioteket.

Bruk: python3 stl2_3mf.py <mappe>   – lager <navn>.3mf ved siden av hver <navn>.stl (rekursivt).
"""
import struct
import sys
import zipfile
from pathlib import Path

CONTENT_TYPES = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
                 '</Types>')
RELS = ('<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
        '</Relationships>')


def read_stl(data: bytes):
    """→ liste av trekanter [(v1, v2, v3)], både binær og ASCII STL."""
    if len(data) >= 84:
        n = struct.unpack_from('<I', data, 80)[0]
        if 84 + n * 50 == len(data):
            tris = []
            for i in range(n):
                f = struct.unpack_from('<12f', data, 84 + i * 50)
                tris.append((f[3:6], f[6:9], f[9:12]))
            return tris
    tris, cur = [], []
    for line in data.decode('ascii', 'replace').splitlines():
        p = line.split()
        if p and p[0] == 'vertex' and len(p) >= 4:
            cur.append(tuple(float(x) for x in p[1:4]))
            if len(cur) == 3:
                tris.append(tuple(cur))
                cur = []
    return tris


def to_3mf(stl: Path, out: Path):
    tris = read_stl(stl.read_bytes())
    if not tris:
        raise ValueError(f'{stl}: ingen trekanter')
    index, verts, faces = {}, [], []
    for t in tris:
        ids = []
        for v in t:
            k = tuple(round(c, 5) for c in v)
            if k not in index:
                index[k] = len(verts)
                verts.append(k)
            ids.append(index[k])
        if len(set(ids)) == 3:  # hopp over degenererte trekanter
            faces.append(ids)
    fmt = lambda c: ('%.5f' % c).rstrip('0').rstrip('.') or '0'
    vx = ''.join(f'<vertex x="{fmt(a)}" y="{fmt(b)}" z="{fmt(c)}"/>' for a, b, c in verts)
    fx = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in faces)
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="nb-NO" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
             f'<metadata name="Title">{stl.stem}</metadata><metadata name="Application">Skjold Lab</metadata>'
             f'<resources><object id="1" type="model" name="{stl.stem}"><mesh><vertices>{vx}</vertices><triangles>{fx}</triangles></mesh></object></resources>'
             '<build><item objectid="1"/></build></model>')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', CONTENT_TYPES)
        z.writestr('_rels/.rels', RELS)
        z.writestr('3D/3dmodel.model', model)
    return len(verts), len(faces)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'stl')
    files = sorted(root.rglob('*.stl'))
    if not files:
        print(f'Fant ingen STL-filer i {root}', file=sys.stderr)
        return 1
    for f in files:
        v, t = to_3mf(f, f.with_suffix('.3mf'))
        print(f'-> {f.with_suffix(".3mf")} ({v} punkter, {t} trekanter)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
