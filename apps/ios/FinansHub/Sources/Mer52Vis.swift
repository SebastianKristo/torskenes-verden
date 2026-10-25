import SwiftUI
import UIKit

/* ---------------- Prompt 52 (IOS52A): Finans → Mer – farge, og skjul søkefelt og titler i wiggle ----------------
   Spesifikasjon: prompt-52-pakke/claude-code-finans-mer-farge-skjul.md. Fasit: Mer Ny.dc.html (mode="finans" og vanlig Mer).
   – Kortene øverst i Finans → Mer: modulfargen 13 % blandet inn i kortfargen; ikonbrikkene helfylt i modulfargen med hvitt symbol.
   – I wiggle: en rad med tre brytere (piller) øverst: Søkefelt · Finans/Hverdag (tittel) · Verktøy (tittel). På = svart pille med ✓,
     av = kontur med +. Av fjerner elementet helt (også luften rundt).
   – Lagres per side: papir_fmer_hid_vis / papir_mer_hid_vis = {sok, tit, vkt} (false = skjult), lokalt per konto og synket med
     resten av oppsettet i layout.mer45 (fmerVis / merVis / salsty – mer45 er et fritt objekt på serveren, se Mer45.save). */

@MainActor
@Observable
final class Mer52Vis {
    static let shared = Mer52Vis()

    /// Finans → Mer.
    var fin: [String: Bool] = Mer52Vis.load("papir_fmer_hid_vis")
    /// Vanlig Mer (tittelen er Mer45.titleHidden, som før).
    var mer: [String: Bool] = Mer52Vis.load("papir_mer_hid_vis")

    @ObservationIgnored private var loadedFor: String = ""

    private static func load(_ k: String) -> [String: Bool] {
        (UserDefaults.standard.dictionary(forKey: AcctScope.key(k)) as? [String: Bool]) ?? [:]
    }

    /// Ny konto: les nøklene på nytt.
    func boot() {
        let k: String = AcctScope.key("papir_fmer_hid_vis")
        if loadedFor == k { return }
        loadedFor = k
        fin = Mer52Vis.load("papir_fmer_hid_vis")
        mer = Mer52Vis.load("papir_mer_hid_vis")
    }

    func on(_ page: String, _ k: String) -> Bool {
        (page == "fmer" ? fin : mer)[k] ?? true
    }

    func toggle(_ page: String, _ k: String, _ store: Store) {
        Haptics.shared.tick()
        let v: Bool = !on(page, k)
        withAnimation(.easeOut(duration: 0.2)) {
            if page == "fmer" { fin[k] = v } else { mer[k] = v }
        }
        if page == "fmer" {
            UserDefaults.standard.set(fin, forKey: AcctScope.key("papir_fmer_hid_vis"))
        } else {
            UserDefaults.standard.set(mer, forKey: AcctScope.key("papir_mer_hid_vis"))
        }
        if page == "fmer" && k == "sok" && !v { Fin45More.shared.query = "" }
        if page == "mer" && k == "sok" && !v { Mer44.shared.query = "" }
        Mer45.shared.save52(store)
    }

    /// Feltene som legges i layout.mer45.
    var payload: [String: Any] { ["fmerVis": fin, "merVis": mer, "salsty": Sal52.shared.style] }

    /// layout.mer45 fra serveren.
    func take(_ m: [String: Any]) {
        // Prompt 52: utseendet på saldokortet ligger i samme objekt (Saldo52.swift).
        Sal52.shared.take(m)
        if let f = m["fmerVis"] as? [String: Bool] {
            fin = f
            UserDefaults.standard.set(f, forKey: AcctScope.key("papir_fmer_hid_vis"))
        }
        if let f = m["merVis"] as? [String: Bool] {
            mer = f
            UserDefaults.standard.set(f, forKey: AcctScope.key("papir_mer_hid_vis"))
        }
    }

    /* ---------- Farger ---------- */

    /// Modulfarger i Finans → Mer (fasiten).
    nonisolated static func hex(_ id: String) -> String {
        switch id {
        case "saldo", "aksjer", "abo": return "#2f6b4a"
        case "budsjett", "boliger": return "#b23a2a"
        case "kvitt", "finn": return "#a0671a"
        case "faste", "kontoer", "plan51": return "#2b5d8a"
        case "import": return "#7a5ad6"
        default: return "#6b665c"
        }
    }

    /// `a` blandet inn i `b` (som color-mix(a x %, b)).
    nonisolated static func mix(_ a: Color, _ b: Color, _ x: Double) -> Color {
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        guard UIColor(a).getRed(&r1, green: &g1, blue: &b1, alpha: &a1), UIColor(b).getRed(&r2, green: &g2, blue: &b2, alpha: &a2) else { return b }
        let k: CGFloat = CGFloat(Swift.max(0, Swift.min(1, x)))
        return Color(red: Double(r1 * k + r2 * (1 - k)), green: Double(g1 * k + g2 * (1 - k)), blue: Double(b1 * k + b2 * (1 - k)), opacity: Double(a2))
    }
}

/// Raden med de tre bryterne øverst i wiggle.
struct Mer52VisRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var v: Mer52Vis { Mer52Vis.shared }
    /// fmer eller mer.
    let page: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                pill("sok", "Søkefelt")
                pill("tit", page == "fmer" ? "Finans" : "Tittel")
                pill("vkt", "Verktøy")
            }
            .padding(.horizontal, 2)
        }
        .padding(.bottom, 2)
    }

    private func isOn(_ k: String) -> Bool {
        if page == "mer" && k == "tit" { return !Mer45.shared.titleHidden }
        return v.on(page, k)
    }

    private func pill(_ k: String, _ label: String) -> some View {
        let on: Bool = isOn(k)
        return Button {
            if page == "mer" && k == "tit" {
                if on { Mer45.shared.hideTitle(store) } else { Mer45.shared.showTitle(store) }
            } else {
                v.toggle(page, k, store)
            }
        } label: {
            HStack(spacing: 5) {
                Text(on ? "✓" : "+").font(PF.ui(12, .bold))
                Text(label).font(PF.ui(12.5, .bold))
            }
            .foregroundStyle(on ? p.bg : p.ink)
            .padding(.horizontal, 12).frame(height: 32)
            .background(on ? p.ink : Color.clear, in: Capsule())
            .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1.2))
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label + (on ? ", vises" : ", skjult"))
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Ikonbrikke helfylt i modulfargen med hvitt symbol (Finans → Mer).
struct Mer52Chip: View {
    let row: More28Row
    let size: CGFloat
    let radius: CGFloat

    var body: some View {
        Image(systemName: row.icon).font(.system(size: size * 0.44, weight: .semibold)).foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(Color(hex: Mer52Vis.hex(row.id)), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .accessibilityHidden(true)
    }
}
