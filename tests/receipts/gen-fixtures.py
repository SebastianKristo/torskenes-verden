#!/usr/bin/env python3
"""EVALRCPT48: lager de syntetiske norske kvitteringene i tests/receipts/fixtures/.

For hver kvittering skrives
  <id>.jpg              bildet (kvitteringspapir på grå bakgrunn, litt støy og uskarphet)
  <id>.json             fasit: {"today", "receipt": felles kvitteringsformat, "notes"}
  <id>.device_parse.json  (bare dagligvare) eksempel på tolkning fra iPhone (vei A)
  <id>.device_ocr.json  lagret «device-OCR» i felles OCR-format (source ios_vision, bbox 0–1 origo øverst til venstre),
                        laget fra oppsettet (samme tekst som i bildet, med en og annen typisk OCR-feil i varenavn)

Kjør bare når kvitteringene skal endres (bildene er sjekket inn):  python3 tests/receipts/gen-fixtures.py
Krever Pillow (pip install pillow) og fonten DejaVu Sans Mono (eller --font STI).
"""
import json
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fixtures")
TODAY = "2026-10-24"  # samme frosne dag som Glimt-evalen (lørdag 24. oktober 2026)


def find_font():
    if "--font" in sys.argv:
        return sys.argv[sys.argv.index("--font") + 1]
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/Library/Fonts/DejaVuSansMono.ttf",
              os.path.expanduser("~/Library/Fonts/DejaVuSansMono.ttf"), "/System/Library/Fonts/Menlo.ttc"):
        if os.path.exists(p):
            return p
    sys.exit("Fant ingen monospace-font. Bruk --font STI")


def mod11(base8):
    w = [3, 2, 7, 6, 5, 4, 3, 2]
    s = sum(int(d) * w[i] for i, d in enumerate(base8))
    c = 11 - s % 11
    if c == 11:
        c = 0
    if c == 10:
        return None
    return base8 + str(c)


def org(seed):
    n = seed
    while True:
        o = mod11(str(n).zfill(8))
        if o:
            return o
        n += 1


def kr(v):
    """1100.87 → '1 100,87', -20 → '-20,00'."""
    neg = v < 0
    s = f"{abs(v):,.2f}".replace(",", " ").replace(".", ",")
    return ("-" if neg else "") + s


def item(desc, amount, q=None, up=None):
    return {"description": desc, "quantity": q, "unit_price": up, "amount": round(amount, 2)}


def spaced_org(o):
    return f"{o[0:3]} {o[3:6]} {o[6:9]}"


# ---------------------------------------------------------------- kvitteringene
def dagligvare():
    o = org(91654321)
    items = [item("TINE HELMELK 1,75L", 32.90), item("BRØD KNEIPP", 29.90), item("EGG 12 STK", 49.90),
             item("NORVEGIA 1KG", 129.00), item("FARRIS 1,5L", 24.90), item("PANT", 3.00), item("BANAN", 17.70, 3, 5.90)]
    disc = [{"description": "RABATT NORVEGIA", "amount": -20.00}]
    total = round(sum(i["amount"] for i in items) + sum(d["amount"] for d in disc), 2)
    vat = round(total - total / 1.15, 2)
    rows = [("c", "KIWI 452 MAJORSTUEN"), ("c", "Kirkeveien 64, 0364 Oslo"), ("c", f"Org.nr NO {spaced_org(o)} MVA"), ("", ""),
            ("l", "22.10.2026 16:05   Kasse 2"), ("", ""),
            ("lr", "TINE HELMELK 1,75L", "32,90"), ("lr", "BRØD KNEIPP", "29,90"), ("lr", "EGG 12 STK", "49,90"),
            ("lr", "NORVEGIA 1KG", "129,00"), ("lr", "FARRIS 1,5L", "24,90"), ("lr", "PANT", "3,00"),
            ("l", "BANAN"), ("lr", "  3 X 5,90", "17,70"), ("lr", "RABATT NORVEGIA", "-20,00"), ("", ""),
            ("lr", "TOTAL", kr(total)), ("lr", "BANKAXEPT", kr(total)), ("", ""), ("lr", "MVA 15%", kr(vat)), ("", ""),
            ("c", "Takk for handelen!")]
    rc = {"merchant": "KIWI 452 Majorstuen", "org_number": o, "date": "2026-10-22", "time": "16:05", "currency": "NOK",
          "items": items, "discounts": disc, "subtotal": None, "vat": [{"rate": 15, "amount": vat}], "total": total,
          "payment_method": "BankAxept", "category_suggestion": "Mat og dagligvarer"}
    typos = {"BRØD KNEIPP": "BR0D KNEIPP", "NORVEGIA 1KG": "NORVEGlA 1KG"}
    return "dagligvare-pant-rabatt", rows, rc, typos, "Dagligvare med pant, rabatt (negativ) og vare med antall på egen rad"


def restaurant():
    o = org(92011223)
    items = [item("PASTA CARBONARA", 398.00, 2), item("TIRAMISU", 119.00, 1), item("ØL 0,5L", 238.00, 2), item("TIPS", 75.00)]
    sub = 755.00
    total = 830.00
    rows = [("c", "TRATTORIA LUCCA"), ("c", "Bryggen 12, 5003 Bergen"), ("c", f"Org.nr {spaced_org(o)} MVA"), ("", ""),
            ("l", "Dato: 17.10.2026  Kl. 19:48  Bord 7"), ("", ""),
            ("lr", "2 PASTA CARBONARA", "398,00"), ("lr", "1 TIRAMISU", "119,00"), ("lr", "2 ØL 0,5L", "238,00"), ("", ""),
            ("lr", "SUBTOTAL", "755,00"), ("lr", "TIPS", "75,00"), ("lr", "TOTALT Å BETALE", "830,00"), ("", ""),
            ("lr", "Herav mva 25%", "151,00"), ("l", "MASTERCARD ************4821"), ("", ""), ("c", "Grazie e arrivederci!")]
    rc = {"merchant": "Trattoria Lucca", "org_number": o, "date": "2026-10-17", "time": "19:48", "currency": "NOK",
          "items": items, "discounts": [], "subtotal": sub, "vat": [{"rate": 25, "amount": 151.00}], "total": total,
          "payment_method": "Mastercard", "category_suggestion": "Restaurant og kafé"}
    typos = {"1 TIRAMISU": "1 TIRAMlSU"}
    return "restaurant-tips", rows, rc, typos, "Restaurant med subtotal og tips som egen varelinje"


def bensin():
    o = org(93177001)
    fuel = round(38.52 * 22.79, 2)
    items = [item("BENSIN 95 PUMPE 3", fuel, 38.52, 22.79), item("BILVASK STANDARD", 189.00), item("KAFFE MEDIUM", 34.00)]
    total = round(sum(i["amount"] for i in items), 2)
    v25 = round((fuel + 189.00) / 1.25 * 0.25, 2)
    v15 = round(34.00 / 1.15 * 0.15, 2)
    rows = [("c", "ESSO EXPRESS LYSAKER"), ("c", "Drammensveien 165, 1366 Lysaker"), ("c", f"Org.nr NO {spaced_org(o)} MVA"), ("", ""),
            ("l", "2026-10-20 07:31"), ("", ""),
            ("l", "BENSIN 95 PUMPE 3"), ("lr", "38,52 L X 22,79", kr(fuel)), ("lr", "BILVASK STANDARD", "189,00"),
            ("lr", "KAFFE MEDIUM", "34,00"), ("", ""), ("lr", "SUM", kr(total)), ("lr", "BANKAXEPT", kr(total)), ("", ""),
            ("lr", "MVA 25%", kr(v25)), ("lr", "MVA 15%", kr(v15)), ("", ""), ("c", "God tur!")]
    rc = {"merchant": "Esso Express Lysaker", "org_number": o, "date": "2026-10-20", "time": "07:31", "currency": "NOK",
          "items": items, "discounts": [], "subtotal": None, "vat": [{"rate": 25, "amount": v25}, {"rate": 15, "amount": v15}], "total": total,
          "payment_method": "BankAxept", "category_suggestion": "Transport og lading"}
    typos = {"BILVASK STANDARD": "BILVASK STANDAKD"}
    return "bensinstasjon", rows, rc, typos, "Bensinstasjon med liter × literpris på egen rad, bilvask og kaffe (25 % og 15 % mva)"


def lang():
    o = org(94455120)
    rnd = random.Random(48)
    names = ["GULROT 1KG", "POTET 2,5KG", "LØK GUL 1KG", "AGURK", "TOMAT 500G", "PAPRIKA RØD", "EPLE RØDE 1KG", "APPELSIN 1KG",
             "TINE LETTMELK 1L", "TINE YOGHURT NATURELL", "JARLSBERG 700G", "SMØR 500G", "KYLLINGFILET 1KG", "KJØTTDEIG 400G",
             "LAKSEFILET 4PK", "FISKEBOLLER", "PASTA PENNE 1KG", "RIS JASMIN 1KG", "HAVREGRYN 1KG", "KNEKKEBRØD", "SYLTETØY JORDBÆR",
             "KAFFE FILTERMALT", "TE EARL GREY", "OPPVASKMIDDEL", "TOALETTPAPIR 12PK", "TANNKREM", "SJAMPO", "MINERALVANN 1,5L"]
    items, rows = [], [("c", "COOP EXTRA STORO"), ("c", "Vitaminveien 7, 0485 Oslo"), ("c", f"Org.nr NO {spaced_org(o)} MVA"), ("", ""),
                       ("l", "23.10.2026 18:22  Kasse 5  Kvittering 20411"), ("", "")]
    for n in names:
        a = round(rnd.choice([12.9, 19.9, 24.9, 29.9, 34.9, 39.9, 49.9, 59.9, 79.9, 89.9, 119.0, 149.0]), 2)
        if n in ("TINE YOGHURT NATURELL", "MINERALVANN 1,5L"):
            q = 2
            up = a
            a = round(q * up, 2)
            items.append(item(n, a, q, up))
            rows.append(("l", n))
            rows.append(("lr", f"  {q} X {kr(up)}", kr(a)))
        else:
            items.append(item(n, a))
            rows.append(("lr", n, kr(a)))
    items.append(item("PANT", 6.00))
    rows.append(("lr", "PANT", "6,00"))
    disc = [{"description": "COOP MEDLEMSRABATT", "amount": -25.00}, {"description": "RABATT KYLLINGFILET", "amount": -30.00}]
    rows += [("lr", "COOP MEDLEMSRABATT", "-25,00"), ("lr", "RABATT KYLLINGFILET", "-30,00"), ("", "")]
    total = round(sum(i["amount"] for i in items) + sum(d["amount"] for d in disc), 2)
    nonfood = sum(i["amount"] for i in items if i["description"] in ("OPPVASKMIDDEL", "TOALETTPAPIR 12PK", "TANNKREM", "SJAMPO"))
    food = total - nonfood
    v15 = round(food - food / 1.15, 2)
    v25 = round(nonfood - nonfood / 1.25, 2)
    rows += [("lr", f"{len(items)} VARER   TOTAL", kr(total)), ("lr", "VISA", kr(total)), ("", ""), ("lr", "MVA 15%", kr(v15)),
             ("lr", "MVA 25%", kr(v25)), ("", ""), ("c", "Coop – medlemmene eier"), ("c", "Takk for besøket")]
    rc = {"merchant": "Coop Extra Storo", "org_number": o, "date": "2026-10-23", "time": "18:22", "currency": "NOK",
          "items": items, "discounts": disc, "subtotal": None, "vat": [{"rate": 15, "amount": v15}, {"rate": 25, "amount": v25}],
          "total": total, "payment_method": "Visa", "category_suggestion": "Mat og dagligvarer"}
    typos = {"JARLSBERG 700G": "JARLSBERG 7OOG", "SYLTETØY JORDBÆR": "SYLTETOY JORDBÆR"}
    return "lang-kvittering", rows, rc, typos, "Lang kvittering (høyde > 2,5 × bredde, Mac-OCR leser i bånd), 29 varelinjer, pant og to rabatter"


# ---------------------------------------------------------------- tegning
def render(rid, rows, typos, font_path):
    rnd = random.Random(sum(map(ord, rid)))  # stabilt frø (hash() er tilfeldig per prosess)
    font = ImageFont.truetype(font_path, 22)
    pw, lh, pad = 620, 34, 36
    ph = pad * 2 + lh * len(rows)
    margin = 70
    W, H = pw + margin * 2, ph + margin * 2
    img = Image.new("RGB", (W, H), (92, 96, 104))
    d = ImageDraw.Draw(img)
    d.rectangle([margin, margin, margin + pw, margin + ph], fill=(250, 249, 244))
    lines = []

    def put(text, x, y):
        bb = d.textbbox((x, y), text, font=font)
        d.text((x, y), text, font=font, fill=(28, 28, 30))
        t = typos.get(text, text)
        lines.append({"text": t, "confidence": round(rnd.uniform(0.86, 0.99), 2),
                      "bbox": [round(bb[0] / W, 4), round(bb[1] / H, 4), round((bb[2] - bb[0]) / W, 4), round((bb[3] - bb[1]) / H, 4)]})

    y = margin + pad
    for r in rows:
        kind = r[0]
        if kind == "c":
            tw = d.textlength(r[1], font=font)
            put(r[1], margin + (pw - tw) / 2, y)
        elif kind == "l":
            put(r[1], margin + 30, y)
        elif kind == "lr":
            put(r[1], margin + 30, y)
            tw = d.textlength(r[2], font=font)
            put(r[2], margin + pw - 30 - tw, y)
        y += lh
    # litt «foto»: uskarphet og støy
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    px = img.load()
    for _ in range(W * H // 40):
        x, yy = rnd.randrange(W), rnd.randrange(H)
        v = px[x, yy]
        n = rnd.randint(-28, 28)
        px[x, yy] = tuple(max(0, min(255, c + n)) for c in v)
    return img, lines, [W, H]


def rows_of(lines):
    """Samme radregel som server/receipts48/normalize.js (rows48): overlappende y, sortert på x."""
    items = sorted(lines, key=lambda l: l["bbox"][1])
    groups = []
    for l in items:
        y, h = l["bbox"][1], l["bbox"][3]
        for g in groups:
            gy, gh = g["y"], g["h"]
            ov = min(y + h, gy + gh) - max(y, gy)
            if ov >= 0.5 * min(h, gh):
                g["l"].append(l)
                break
        else:
            groups.append({"y": y, "h": h, "l": [l]})
    return [" ".join(x["text"] for x in sorted(g["l"], key=lambda l: l["bbox"][0])) for g in groups]


def main():
    font = find_font()
    os.makedirs(OUT, exist_ok=True)
    for fn in (dagligvare, restaurant, bensin, lang):
        rid, rows, rc, typos, notes = fn()
        img, lines, size = render(rid, rows, typos, font)
        img.save(os.path.join(OUT, f"{rid}.jpg"), quality=88)
        rws = rows_of(lines)
        ocr = {"source": "ios_vision", "lines": lines, "rows": rws, "full_text": "\n".join(rws), "image_size": size, "ms": 380 + len(lines) * 4}
        with open(os.path.join(OUT, f"{rid}.device_ocr.json"), "w", encoding="utf-8") as f:
            json.dump(ocr, f, ensure_ascii=False, indent=1)
        if rid == "dagligvare-pant-rabatt":
            # Eksempel på device_parse (vei A, «Tolk kvitteringer på iPhone»): slik Foundation Models-svaret ser ut.
            with open(os.path.join(OUT, f"{rid}.device_parse.json"), "w", encoding="utf-8") as f:
                json.dump(rc, f, ensure_ascii=False, indent=2)
        with open(os.path.join(OUT, f"{rid}.json"), "w", encoding="utf-8") as f:
            json.dump({"today": TODAY, "notes": notes, "receipt": rc}, f, ensure_ascii=False, indent=2)
        s = round(sum(i["amount"] for i in rc["items"]) + sum(x["amount"] for x in rc["discounts"]), 2)
        assert abs(s - rc["total"]) < 0.005, (rid, s, rc["total"])
        print(f"{rid}: {size[0]}×{size[1]} px, {len(rc['items'])} varer, total {kr(rc['total'])}")


if __name__ == "__main__":
    main()
