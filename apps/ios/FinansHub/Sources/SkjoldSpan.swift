import SwiftUI
import UIKit

/* ---------------- Prompt 81 (SPANIOS): Skjold Lab – store og brede skuffer (sammenslåtte ruter) ----------------
 Kontrakt: CONTRACT81.md. En skuff er «anker» i øverste venstre rute og dekker spanR × spanC ruter (1–4).
 Serveren (SPANSRV) gir spanR, spanC og coveredBy («r-c» for ankeret, ellers null) per rute i GET /cabinets/:id/map.
 – Tegningen tegner ankeret som ett felt over spanC × spanR ruter og hopper over dekkede ruter (Skj81Drawing,
   en egen Layout så rad- og kolonnetallene står riktig). Trykk på en dekket rute gir ankeret.
 – Plassering i tekst: «Rad 4–5 · Skuff 1–2» (stor), «Rad 3 · Skuff 1–2» (bred), ellers som før.
 – Skuffdetaljer: «Bredde 1/2 · Høyde 1/2» → PUT /cabinets/:id/drawers/:row/:col {spanR, spanC} (409 ved overlapp).
 Uten spenn i kartet brukes den gamle tegningen (Skj76Drawing) uendret. */

/// Rad og kolonne for en rute (ankeret når den er dekket).
struct Skj81RC: Hashable {
    var r: Int
    var c: Int

    /// «4-1» → (4, 1).
    static func parse(_ s: String) -> Skj81RC? {
        let n: [Int] = s.split(separator: "-").compactMap { Int($0) }
        if n.count != 2 { return nil }
        return Skj81RC(r: n[0], c: n[1])
    }
}

extension Skj76Map {
    /// Om noen skuff i skapet dekker mer enn én rute.
    var hasSpans81: Bool { drawers.values.contains { $0.spanR > 1 || $0.spanC > 1 } }

    /// Ankeret for ruten: seg selv, eller skuffen som dekker den (coveredBy, ellers regnet ut fra spennene).
    func anchor81(_ r: Int, _ c: Int) -> Skj81RC {
        if let a = Skj81RC.parse(drawer(r, c).coveredBy) { return a }
        for x in drawers.values where x.spanR > 1 || x.spanC > 1 {
            let inR: Bool = r >= x.row && r < x.row + x.spanR
            let inC: Bool = c >= x.col && c < x.col + x.spanC
            if inR && inC { return Skj81RC(r: x.row, c: x.col) }
        }
        return Skj81RC(r: r, c: c)
    }

    /// Om ruten er dekket av en annen skuff.
    func covered81(_ r: Int, _ c: Int) -> Bool {
        let a: Skj81RC = anchor81(r, c)
        return a.r != r || a.c != c
    }

    /// Spennet til ankeret, holdt innenfor skapet.
    func span81(_ r: Int, _ c: Int) -> Skj81RC {
        let d: Skj76Drawer = drawer(r, c)
        let sr: Int = Swift.max(1, Swift.min(d.spanR, rows - r + 1))
        let sc: Int = Swift.max(1, Swift.min(d.spanC, cols - c + 1))
        return Skj81RC(r: sr, c: sc)
    }

    /// Alle ankre (vanlige og sammenslåtte) som skal tegnes, rad for rad.
    func boxes81() -> [Skj81Box] {
        var out: [Skj81Box] = []
        for r in 1...Swift.max(1, rows) {
            for c in 1...Swift.max(1, cols) {
                if covered81(r, c) { continue }
                let s: Skj81RC = span81(r, c)
                out.append(Skj81Box(kind: 0, r: r, c: c, sr: s.r, sc: s.c))
            }
        }
        return out
    }
}

enum Skjold81 {
    /// 4, 2 → «4–5»; 4, 1 → «4».
    static func range(_ a: Int, _ n: Int) -> String { n > 1 ? "\(a)–\(a + n - 1)" : "\(a)" }

    /// «Rad 4–5 · Skuff 1–2».
    static func place(_ r: Int, _ c: Int, _ sr: Int, _ sc: Int) -> String { "Rad " + range(r, sr) + " · Skuff " + range(c, sc) }

    /// Plassering for ruten i kartet (ankeret og spennet), som Skj76LocPicker.text.
    static func text(_ cab: String, _ map: Skj76Map?, _ r: Int, _ c: Int, _ comp: Int?) -> String {
        let a: Skj81RC = map?.anchor81(r, c) ?? Skj81RC(r: r, c: c)
        let s: Skj81RC = map?.span81(a.r, a.c) ?? Skj81RC(r: 1, c: 1)
        return cab + " · " + place(a.r, a.c, s.r, s.c) + (comp.map { " · Rom \($0)" } ?? "")
    }

    /// Rektangelet (i rutenettet w × h) som en uthevet skuff dekker på bildet.
    static func markRect(_ m: Skj76Loc, _ map: Skj76Map?, _ rows: Int, _ cols: Int, _ cw: CGFloat, _ rh: CGFloat) -> CGRect? {
        let a: Skj81RC = map?.anchor81(m.row, m.col) ?? Skj81RC(r: m.row, c: m.col)
        guard a.r >= 1, a.r <= rows, a.c >= 1, a.c <= cols else { return nil }
        let s: Skj81RC = map?.span81(a.r, a.c) ?? Skj81RC(r: 1, c: 1)
        return CGRect(x: CGFloat(a.c - 1) * cw, y: CGFloat(a.r - 1) * rh, width: CGFloat(s.c) * cw, height: CGFloat(s.r) * rh)
    }

    /// Strekene over bildet: én ramme per skuff når kartet har sammenslåtte skuffer.
    static func outline(_ map: Skj76Map, _ cw: CGFloat, _ rh: CGFloat) -> Path {
        var path: Path = Path()
        for b in map.boxes81() {
            let x: CGFloat = CGFloat(b.c - 1) * cw
            let y: CGFloat = CGFloat(b.r - 1) * rh
            path.addRect(CGRect(x: x, y: y, width: CGFloat(b.sc) * cw, height: CGFloat(b.sr) * rh))
        }
        return path
    }
}

/* ---------- Tegningen med sammenslåtte skuffer ---------- */

/// Vanlig skuff: fast forhold (Raaco-front). Sammenslått (ratio nil): fyller feltet Skj81GridLayout gir den.
struct Skj81Ratio: ViewModifier {
    let ratio: CGFloat?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let ratio {
            content.aspectRatio(ratio, contentMode: .fit).frame(maxWidth: .infinity)
        } else {
            content.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Hva et felt i Skj81GridLayout er: 0 skuff, 1 radtall, 2 kolonnetall, 3 rammen.
struct Skj81Box: Hashable {
    var kind: Int
    var r: Int
    var c: Int
    var sr: Int
    var sc: Int
}

struct Skj81Slot: LayoutValueKey {
    static let defaultValue: Skj81Box = Skj81Box(kind: 0, r: 1, c: 1, sr: 1, sc: 1)
}

/// Rutenettet: radtall til venstre, kolonnetall over, mørk ramme og skuffer i Raaco-proporsjoner (bredde / høyde 1,33).
struct Skj81GridLayout: Layout {
    let rows: Int
    let cols: Int
    static let gap: CGFloat = 3
    static let lead: CGFloat = 21
    static let top: CGFloat = 17
    static let pad: CGFloat = 7

    private func width(_ p: ProposedViewSize) -> CGFloat {
        let w: CGFloat = p.width ?? CGFloat(cols) * 60 + 40
        return w.isFinite ? w : CGFloat(cols) * 78 + 40
    }

    /// Bredde og høyde for én rute.
    private func cell(_ w: CGFloat) -> CGSize {
        let n: CGFloat = CGFloat(Swift.max(1, cols))
        let inner: CGFloat = w - Skj81GridLayout.lead - 2 * Skj81GridLayout.pad - Skj81GridLayout.gap * (n - 1)
        let cw: CGFloat = Swift.max(4, inner / n)
        return CGSize(width: cw, height: cw / Skj76Look.aspect)
    }

    private func height(_ w: CGFloat) -> CGFloat {
        let n: CGFloat = CGFloat(Swift.max(1, rows))
        let ch: CGFloat = cell(w).height
        return Skj81GridLayout.top + 2 * Skj81GridLayout.pad + ch * n + Skj81GridLayout.gap * (n - 1)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w: CGFloat = width(proposal)
        return CGSize(width: w, height: height(w))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for s in subviews {
            let f: CGRect = frame(s[Skj81Slot.self], bounds.width)
            let pt: CGPoint = CGPoint(x: bounds.minX + f.minX, y: bounds.minY + f.minY)
            s.place(at: pt, anchor: .topLeading, proposal: ProposedViewSize(width: f.width, height: f.height))
        }
    }

    func frame(_ b: Skj81Box, _ w: CGFloat) -> CGRect {
        let k: CGSize = cell(w)
        let g: CGFloat = Skj81GridLayout.gap
        let x0: CGFloat = Skj81GridLayout.lead + Skj81GridLayout.pad
        let y0: CGFloat = Skj81GridLayout.top + Skj81GridLayout.pad
        let x: CGFloat = x0 + CGFloat(b.c - 1) * (k.width + g)
        let y: CGFloat = y0 + CGFloat(b.r - 1) * (k.height + g)
        switch b.kind {
        case 1: return CGRect(x: 0, y: y, width: 18, height: k.height)
        case 2: return CGRect(x: x, y: 0, width: k.width, height: 14)
        case 3: return CGRect(x: Skj81GridLayout.lead, y: Skj81GridLayout.top, width: w - Skj81GridLayout.lead, height: height(w) - Skj81GridLayout.top)
        default:
            let bw: CGFloat = k.width * CGFloat(b.sc) + g * CGFloat(b.sc - 1)
            let bh: CGFloat = k.height * CGFloat(b.sr) + g * CGFloat(b.sr - 1)
            return CGRect(x: x, y: y, width: bw, height: bh)
        }
    }
}

/// Skapet tegnet med store og brede skuffer som ett felt. `pick` får alltid ankeret.
struct Skj81Drawing: View {
    @Environment(\.paper) private var p
    let rows: Int
    let cols: Int
    let map: Skj76Map
    let mark: Skj76Loc?
    let pulse: Int
    var pick: ((Int, Int) -> Void)? = nil

    /// Den uthevede skuffen som anker og spenn.
    private var marked: Skj81Box? {
        guard let m = mark else { return nil }
        let a: Skj81RC = map.anchor81(m.row, m.col)
        let s: Skj81RC = map.span81(a.r, a.c)
        return Skj81Box(kind: 0, r: a.r, c: a.c, sr: s.r, sc: s.c)
    }

    var body: some View {
        let mk: Skj81Box? = marked
        Skj81GridLayout(rows: rows, cols: cols) {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Skj76Look.frame)
                .layoutValue(key: Skj81Slot.self, value: Skj81Box(kind: 3, r: 1, c: 1, sr: 1, sc: 1))
            ForEach(1...Swift.max(1, cols), id: \.self) { (c: Int) in
                Text("\(c)").font(PF.mono(9.5)).foregroundStyle(Skj81Drawing.within(c, mk?.c, mk?.sc) ? p.lab : p.mut)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .layoutValue(key: Skj81Slot.self, value: Skj81Box(kind: 2, r: 1, c: c, sr: 1, sc: 1))
            }
            ForEach(1...Swift.max(1, rows), id: \.self) { (r: Int) in
                Text("\(r)").font(PF.mono(9.5)).foregroundStyle(Skj81Drawing.within(r, mk?.r, mk?.sr) ? p.lab : p.mut)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .layoutValue(key: Skj81Slot.self, value: Skj81Box(kind: 1, r: r, c: 1, sr: 1, sc: 1))
            }
            ForEach(map.boxes81(), id: \.self) { (b: Skj81Box) in
                cell(b, mk)
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// Om tallet n ligger innenfor a … a + len − 1.
    static func within(_ n: Int, _ a: Int?, _ len: Int?) -> Bool {
        guard let a, let len else { return false }
        return n >= a && n < a + len
    }

    private func cell(_ b: Skj81Box, _ mk: Skj81Box?) -> some View {
        let d: Skj76Drawer = map.drawer(b.r, b.c)
        let on: Bool = mk?.r == b.r && mk?.c == b.c
        return Skj76Cell(d: d, on: on, pulse: pulse, ratio: nil)
            .contentShape(Rectangle())
            .onTapGesture { pick?(b.r, b.c) }
            .accessibilityLabel(Skjold81.place(b.r, b.c, b.sr, b.sc) + (d.count > 0 ? ", \(d.count) deler" : ", tom"))
            .accessibilityAddTraits(pick == nil ? [] : .isButton)
            .layoutValue(key: Skj81Slot.self, value: b)
    }
}

/* ---------- Skuffdetaljer: «Bredde 1/2 · Høyde 1/2» ---------- */

/// Slå sammen eller dele en skuff (enkelt: 1 eller 2 ruter i hver retning).
struct Skj81SpanPicker: View {
    @Environment(\.paper) private var p
    @Binding var spanR: Int
    @Binding var spanC: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text("Bredde").font(PF.ui(14.5)).foregroundStyle(p.ink).frame(width: 64, alignment: .leading)
                Picker("Bredde", selection: $spanC) {
                    Text("1").tag(1)
                    Text("2").tag(2)
                }
                .pickerStyle(.segmented)
            }
            HStack(spacing: 10) {
                Text("Høyde").font(PF.ui(14.5)).foregroundStyle(p.ink).frame(width: 64, alignment: .leading)
                Picker("Høyde", selection: $spanR) {
                    Text("1").tag(1)
                    Text("2").tag(2)
                }
                .pickerStyle(.segmented)
            }
            Text("2 i bredden eller høyden slår sammen skuffen med naborutene til én stor skuff.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
    }
}
