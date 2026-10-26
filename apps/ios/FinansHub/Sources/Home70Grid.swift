import SwiftUI
import UIKit

/* ---------------- Prompt 70 (IOSHOME70): endre størrelse på widgets på Hjem (mobil) ----------------
 Spesifikasjon: prompt-51b-pakke/claude-code-widget-storrelse-mobil.md. Fasit: Homelab.dc.html (edVals → rz_*, rzOn, gc).
 – I redigeringsmodus får hver widget et håndtak (↔, 34 pt rundt, 44 pt treffflate) nede i høyre hjørne.
   Halv → full: dra mer enn 40 pt (uansett retning). Full → halv: dra mer enn 40 pt mot venstre. Trykk bytter.
   Endringen vises live mens man drar (lett haptikk ved hvert bytte) og lagres når man slipper.
 – Gjelder alle widgets unntatt Søk (h1) og den samlede Snarveier-/flisraden (h16), som alltid er fulle.
   Standard som før: Home52.half (flisene, Bolig, Bursdager, Kalender, Prøve) er halve, resten fulle.
 – Bare på mobil (2-kolonners Hjem med «Hjem som fliser»). iPad/brettet beholder sitt rutenett.
 – Lagring: pages.hjem.sz = {nøkkel: "full"|"half"} ved siden av order/hidden i /api/me/layout. Serveren bytter ut hele
   pages.hjem ved hver lagring, så sz legges alltid ved når pages.hjem lagres (Home70Size.inject i Store.savePaperLayout).
 – Rutenettet er et eget Layout (Home70GridLayout) med én ForEach og stabile id-er, så cellen (og håndtakets gest) lever
   videre når widgeten bytter mellom halv og full midt i draget. Radlogikken er den samme som før (Home52Rows). */

@MainActor
@Observable
final class Home70Size {
    static let shared = Home70Size()

    /// Alltid fulle (ingen håndtak).
    nonisolated static let fixed: Set<String> = ["h1", "h16"]

    /// Brukerens valg per widget: "full" | "half". Mangler = standard.
    var sz: [String: String] = Home70Size.loadLocal()

    /// Det som sist ble lagret (så vi bare sender når noe er endret).
    @ObservationIgnored private var saved: [String: String] = Home70Size.loadLocal()

    nonisolated static func canResize(_ k: String) -> Bool { !fixed.contains(k) }

    private static var localKey: String { AcctScope.key("fh_home70_sz") }

    private static func loadLocal() -> [String: String] {
        guard let d = UserDefaults.standard.data(forKey: localKey),
              let v = try? JSONDecoder().decode([String: String].self, from: d) else { return [:] }
        return v
    }

    private func saveLocal() {
        if let d = try? JSONEncoder().encode(sz) { UserDefaults.standard.set(d, forKey: Home70Size.localKey) }
    }

    /// Halve kort etter brukerens valg, med `base` (Home52.half) som standard.
    func half(_ base: Set<String>) -> Set<String> {
        var out: Set<String> = base.subtracting(Home70Size.fixed)
        for (k, v) in sz where Home70Size.canResize(k) {
            if v == "half" { out.insert(k) } else if v == "full" { out.remove(k) }
        }
        return out
    }

    /// Live mens man drar (lagres ikke på serveren ennå).
    func set(_ k: String, half: Bool) {
        guard Home70Size.canResize(k) else { return }
        let v: String = half ? "half" : "full"
        if sz[k] != v { sz[k] = v }
    }

    /// Slipp: lagre lokalt og på serveren hvis noe er endret.
    func commit(_ store: Store) {
        guard sz != saved else { return }
        saved = sz
        saveLocal()
        let l: PaperPageLayout = store.paperPages["hjem"] ?? PaperPageLayout()
        store.savePaperLayout(["pages": ["hjem": ["order": l.order, "hidden": l.hidden]]])
    }

    /// Fra GET /api/me/layout (Store.applyPaper15): pages.hjem.sz. Finnes pages.hjem uten sz, er alt standard.
    func take(_ pages: [String: Any]) {
        guard let h = pages["hjem"] as? [String: Any] else { return }
        var out: [String: String] = [:]
        if let raw = h["sz"] as? [String: Any] {
            for (k, v) in raw {
                if let s = v as? String, s == "full" || s == "half" { out[k] = s }
            }
        }
        if out != sz { sz = out }
        saved = out
        saveLocal()
    }

    /// Store.savePaperLayout: når pages.hjem lagres (order/hidden), beholdes sz.
    func inject(_ body: [String: Any]) -> [String: Any] {
        guard var pages = body["pages"] as? [String: Any], var h = pages["hjem"] as? [String: Any], h["sz"] == nil else { return body }
        if sz.isEmpty { return body }
        h["sz"] = sz
        pages["hjem"] = h
        var out: [String: Any] = body
        out["pages"] = pages
        return out
    }
}

/* ---------- Rutenettet ---------- */

/// Nøkkelen til hver celle i Home70GridLayout.
struct Home70KeyLV: LayoutValueKey {
    static let defaultValue: String = ""
}

/// To kolonner: hele kort får egen rad, halve pares to og to, et høyt halvt kort (Avgang) tar med seg de to neste halve.
/// Samme rader som Home52Rows (og samme høyder som HStack/VStack-utgaven fra prompt 52).
struct Home70GridLayout: Layout {
    let half: Set<String>
    let tall: Set<String>
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w: CGFloat = proposal.width ?? 360
        let frames: [CGRect] = place(w, subviews)
        var h: CGFloat = 0
        for f in frames { h = Swift.max(h, f.maxY) }
        return CGSize(width: w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let frames: [CGRect] = place(bounds.width, subviews)
        for (i, f) in frames.enumerated() {
            let pt: CGPoint = CGPoint(x: bounds.minX + f.minX, y: bounds.minY + f.minY)
            subviews[i].place(at: pt, anchor: .topLeading, proposal: ProposedViewSize(width: f.width, height: f.height))
        }
    }

    private func height(_ s: LayoutSubview, _ w: CGFloat) -> CGFloat {
        s.sizeThatFits(ProposedViewSize(width: w, height: nil)).height
    }

    private func place(_ w: CGFloat, _ subviews: Subviews) -> [CGRect] {
        var keys: [String] = []
        var idx: [String: Int] = [:]
        for (i, s) in subviews.enumerated() {
            let k: String = s[Home70KeyLV.self]
            keys.append(k)
            idx[k] = i
        }
        var out: [CGRect] = Array(repeating: CGRect.zero, count: subviews.count)
        let colW: CGFloat = Swift.max(0, (w - spacing) / 2)
        var y: CGFloat = 0
        var first: Bool = true
        for r in Home52Rows.rows(keys, half: half, tall: tall) {
            let ids: [Int] = r.keys.compactMap { (k: String) -> Int? in idx[k] }
            guard let i0 = ids.first else { continue }
            if !first { y += spacing }
            first = false
            switch r.kind {
            case .full:
                let h: CGFloat = height(subviews[i0], w)
                out[i0] = CGRect(x: 0, y: y, width: w, height: h)
                y += h
            case .pair:
                y += pairRow(ids, colW, y, subviews, &out)
            case .tall:
                y += tallRow(ids, colW, y, subviews, &out)
            }
        }
        return out
    }

    /// To halve ved siden av hverandre, like høye (den høyeste bestemmer).
    private func pairRow(_ ids: [Int], _ colW: CGFloat, _ y: CGFloat, _ subviews: Subviews, _ out: inout [CGRect]) -> CGFloat {
        var h: CGFloat = 0
        for i in ids { h = Swift.max(h, height(subviews[i], colW)) }
        for (n, i) in ids.enumerated() {
            let x: CGFloat = CGFloat(n) * (colW + spacing)
            out[i] = CGRect(x: x, y: y, width: colW, height: h)
        }
        return h
    }

    /// Høyt halvt kort til venstre, de andre stablet til høyre. Ekstra høyde fordeles likt på de stablede.
    private func tallRow(_ ids: [Int], _ colW: CGFloat, _ y: CGFloat, _ subviews: Subviews, _ out: inout [CGRect]) -> CGFloat {
        let left: Int = ids[0]
        let right: [Int] = Array(ids.dropFirst())
        let lh: CGFloat = height(subviews[left], colW)
        let rhs: [CGFloat] = right.map { (i: Int) -> CGFloat in height(subviews[i], colW) }
        let gaps: CGFloat = spacing * CGFloat(Swift.max(0, right.count - 1))
        let rSum: CGFloat = rhs.reduce(0, +) + gaps
        let h: CGFloat = Swift.max(lh, rSum)
        out[left] = CGRect(x: 0, y: y, width: colW, height: h)
        let extra: CGFloat = right.isEmpty ? 0 : (h - rSum) / CGFloat(right.count)
        var ry: CGFloat = y
        let rx: CGFloat = colW + spacing
        for (n, i) in right.enumerated() {
            let ch: CGFloat = rhs[n] + extra
            out[i] = CGRect(x: rx, y: ry, width: colW, height: ch)
            ry += ch + spacing
        }
        return h
    }
}

/* ---------- Håndtaket ---------- */

/// ↔ nede i høyre hjørne i redigeringsmodus. Dra ut/inn eller trykk. DragGesture bare på håndtaket (34 pt),
/// i globale koordinater, så vuggingen og at cellen blir bredere ikke flytter fingerens nullpunkt.
struct Home70Handle: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let key: String
    let isHalf: Bool
    let label: String

    @State private var start: Bool? = nil
    @State private var cur: Bool = true

    var body: some View {
        Image(systemName: "arrow.left.and.right")
            .font(.dyn51(size: 13, weight: .bold))
            .foregroundStyle(p.ink)
            .frame(width: 34, height: 34)
            .background(p.card, in: Circle())
            .overlay(Circle().stroke(p.line, lineWidth: 1))
            .shadow(color: .black.opacity(0.3), radius: 5, y: 4)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
            .gesture(drag)
            .accessibilityElement()
            .accessibilityLabel("Endre størrelse på " + label)
            .accessibilityValue(isHalf ? "Halv bredde" : "Full bredde")
            .accessibilityHint("Dra ut for full bredde, inn for halv. Trykk for å bytte.")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { toggle() }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { (v: DragGesture.Value) in changed(v.translation) }
            .onEnded { (v: DragGesture.Value) in ended(v.translation) }
    }

    nonisolated static func want(_ h0: Bool, _ dx: CGFloat) -> Bool {
        if h0 { return Swift.abs(dx) <= 40 }
        return dx < -40
    }

    private func changed(_ t: CGSize) {
        let h0: Bool = start ?? isHalf
        let c: Bool = start == nil ? h0 : cur
        start = h0
        let w: Bool = Home70Handle.want(h0, t.width)
        cur = w
        guard w != c else { return }
        apply(w)
        if Haptics.shared.on { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.6) }
    }

    private func ended(_ t: CGSize) {
        let h0: Bool = start ?? isHalf
        start = nil
        let moved: CGFloat = Swift.abs(t.width) + Swift.abs(t.height)
        if moved < 6 {
            // Trykk uten å dra: bytt mellom halv og full.
            apply(!h0)
            Haptics.shared.tick()
        }
        Home70Size.shared.commit(store)
    }

    private func toggle() {
        apply(!isHalf)
        Home70Size.shared.commit(store)
    }

    private func apply(_ half: Bool) {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) { Home70Size.shared.set(key, half: half) }
    }
}
