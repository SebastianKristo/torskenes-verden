import SwiftUI
import UIKit

/* ---------------- Prompt 37: Pakker på Hjem – «Vis bare når det er pakker» og antall pakker ---------------- */
// Fasit: prompts/prompt-37-pakke/claude-code-wiggle-krasj-ios.md (B) og h2o/h2Menu i design/Mobil Papir App.dc.html.
// Lagring: papir_wopt.h2 = {auto, n} per bruker og enhet (UserDefaults per konto), og `wopt` i /api/me/layout
// (serveren fletter; tåles at den ikke kjenner feltet).

@MainActor
@Observable
final class Wopt37 {
    static let shared = Wopt37()

    /// Vis bare når det er pakker (på som standard).
    var h2Auto: Bool = true
    /// Pakker som vises på kortet: 1, 2 eller 3.
    var h2N: Int = 1
    @ObservationIgnored private var loadedFor: String = "-"

    private static var localKey: String { AcctScope.key("papir_wopt") }

    init() { reload() }

    /// Leser lokalt lagrede valg for kontoen som er aktiv (også etter kontobytte).
    func reload() {
        let acct: String = AcctScope.current
        if loadedFor == acct { return }
        loadedFor = acct
        var auto: Bool = true
        var n: Int = 1
        if let d = UserDefaults.standard.data(forKey: Wopt37.localKey),
           let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any],
           let h2 = o["h2"] as? [String: Any] {
            if let a = h2["auto"] as? Bool { auto = a }
            if let v = h2["n"] as? Int { n = v }
        }
        h2Auto = auto
        h2N = Swift.min(3, Swift.max(1, n))
    }

    /// `wopt` fra /api/me/layout.
    func apply(_ layout: [String: Any]) {
        reload()
        guard let w = layout["wopt"] as? [String: Any], let h2 = w["h2"] as? [String: Any] else { return }
        let a: Bool = (h2["auto"] as? Bool) ?? h2Auto
        let n: Int = Swift.min(3, Swift.max(1, (h2["n"] as? Int) ?? h2N))
        if a != h2Auto { h2Auto = a }
        if n != h2N { h2N = n }
        writeLocal()
    }

    private var body: [String: Any] { ["h2": ["auto": h2Auto, "n": h2N]] }

    private func writeLocal() {
        if let d = try? JSONSerialization.data(withJSONObject: body) { UserDefaults.standard.set(d, forKey: Wopt37.localKey) }
    }

    func setAuto(_ on: Bool, _ store: Store) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { h2Auto = on }
        save(store)
    }

    func setN(_ n: Int, _ store: Store) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { h2N = Swift.min(3, Swift.max(1, n)) }
        save(store)
    }

    private func save(_ store: Store) {
        writeLocal()
        store.savePaperLayout(["wopt": body])
    }
}

/// Regler for Pakker-kortet (h2) på Hjem.
@MainActor
enum Pkg37 {
    /// Aktive pakker (registrert, på vei, klar for henting): ikke arkivert og ikke levert.
    static func active(_ store: Store) -> [Shipment] {
        let all: [Shipment] = store.homePackages ?? store.tracking?.items ?? []
        return all.filter { $0.active && $0.status != "returned" }
    }

    static func count(_ store: Store) -> Int { active(store).count }

    /// Pakker skal skjules på Hjem nå (utenfor redigeringsmodus, «vis bare når det er pakker» og 0 pakker).
    static func hiddenNow(_ page: String, _ editing: Bool, _ store: Store) -> Bool {
        page == "hjem" && !editing && Wopt37.shared.h2Auto && count(store) == 0
    }

    /// Endres når et kort skjules eller dukker opp igjen (til inn-/ut-animasjonen).
    static func animKey(_ page: String, _ editing: Bool, _ store: Store) -> String {
        let a: Bool = hiddenNow(page, editing, store)
        let b: Bool = page == "hjem" && Bible37Model.shared.hiddenOnHome
        return (a ? "1" : "0") + (b ? "1" : "0")
    }

    /// Kortene som vises: h2 tas ut når den skal skjules.
    static func visible(_ page: String, _ order: [String], _ editing: Bool, _ store: Store) -> [String] {
        var out: [String] = order
        if hiddenNow(page, editing, store) { out = out.filter { $0 != "h2" } }
        // Bibelverset er lest i en tidligere økt i dag eller sveipet bort: ikke på Hjem (står nederst i briefen).
        if page == "hjem" && !editing && Bible37Model.shared.hiddenOnHome { out = out.filter { $0 != "h13" } }
        return out
    }

    /// I redigeringsmodus: Pakker vises dempet når den ellers ville vært skjult.
    static func dimmed(_ page: String, _ key: String, _ store: Store) -> Bool {
        page == "hjem" && key == "h2" && Wopt37.shared.h2Auto && count(store) == 0
    }

    /// Status under bryteren.
    static func status(_ store: Store) -> String {
        let n: Int = count(store)
        if n == 0 { return "Ingen pakker nå · widgeten er skjult" }
        return n == 1 ? "1 pakke på vei nå" : "\(n) pakker på vei nå"
    }

    /// Rekkefølge på kortet: klar for henting først.
    static func sorted(_ store: Store) -> [Shipment] {
        let list: [Shipment] = active(store)
        let ready: [Shipment] = list.filter { $0.status == "ready_for_pickup" }
        let rest: [Shipment] = list.filter { $0.status != "ready_for_pickup" }
        return ready + rest
    }
}

/// Merket «Skjult når ingen pakker» under «Rediger widget».
struct Pkg37HiddenBadge: View {
    @Environment(\.paper) private var p

    var body: some View {
        Text("Skjult når ingen pakker").font(PF.ui(11, .semibold)).foregroundStyle(p.mut)
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(p.card, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .shadow(color: .black.opacity(0.15), radius: 3, y: 2)
    }
}

/// Pakker-kortet med 2 eller 3 pakker (valgt i «Rediger widget»).
struct Pkg37ListCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let items: [Shipment]
    let more: Int

    var body: some View {
        Button { store.paperGo("sporing") } label: {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, s in
                    row(s, first: i == 0)
                }
                if more > 0 {
                    Text(more == 1 ? "+1 pakke til ›" : "+\(more) pakker til ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
                        .padding(.top, 8)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func row(_ s: Shipment, first: Bool) -> some View {
        let sub: String = [s.pickupPoint, s.eta].filter { !$0.isEmpty }.joined(separator: " · ")
        return HStack(spacing: 12) {
            PaperCarrierBadge(s: s, size: 42, radius: 12)
            VStack(alignment: .leading, spacing: 1) {
                PLabel(text: s.status == "ready_for_pickup" ? "Hent nå" : s.statusText)
                Text(s.displayTitle).font(PF.serif(17, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                if !sub.isEmpty { Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1) }
            }
            Spacer(minLength: 4)
            Text("›").font(PF.ui(13)).foregroundStyle(p.mut)
        }
        .padding(.vertical, 7)
        .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
    }
}

/// Panelet «Sporing» fra «✎ Rediger widget» på Pakker: bryter, antall og Ferdig.
struct Pkg37OptionsSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let close: () -> Void

    var body: some View {
        let w: Wopt37 = Wopt37.shared
        VStack(alignment: .leading, spacing: 16) {
            Text("Sporing").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            autoRow(w)
            countRow(w)
            Spacer(minLength: 0)
            SheetButton30(kind: .primary, title: "Ferdig") { close() }
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 20)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private func autoRow(_ w: Wopt37) -> some View {
        Button { w.setAuto(!w.h2Auto, store) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Vis bare når det er pakker").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(Pkg37.status(store)).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 8)
                Pkg37Switch(on: w.h2Auto)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Vis bare når det er pakker")
        .accessibilityValue(w.h2Auto ? "På" : "Av")
    }

    private func countRow(_ w: Wopt37) -> some View {
        HStack(spacing: 10) {
            Text("Pakker som vises").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
            Spacer(minLength: 8)
            HStack(spacing: 4) {
                ForEach([1, 2, 3], id: \.self) { (n: Int) in
                    countButton(n, on: w.h2N == n) { w.setN(n, store) }
                }
            }
            .padding(3)
            .background(p.bg, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
        }
    }

    private func countButton(_ n: Int, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text("\(n)").font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.ink)
                .frame(minWidth: 34, minHeight: 30)
                .background(on ? p.ink : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(n) pakker")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Bryter 46 × 28 som i designet (grønn når på).
struct Pkg37Switch: View {
    @Environment(\.paper) private var p
    let on: Bool

    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule().fill(on ? p.pos : p.line).frame(width: 46, height: 28)
            Circle().fill(Color.white).frame(width: 22, height: 22)
                .shadow(color: .black.opacity(0.25), radius: 1.5, y: 1)
                .padding(3)
        }
        .frame(width: 46, height: 28)
        .animation(.easeOut(duration: 0.2), value: on)
    }
}
