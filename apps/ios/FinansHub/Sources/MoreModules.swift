import SwiftUI
import UIKit

/* ---------------- Prompt 28: Mer – hold inne for å flytte og skjule moduler ---------------- */
// Fasit: fanen «Mer» i design/Mobil Papir App.dc.html og prompts/prompt-28-pakke/claude-code-mer-rekkefolge.md.
// Hold inne en rad 0,48 s → redigeringsmodus (kort «REDIGERER MER» øverst, − til venstre, ≡ til høyre, SKJULT under).
// Innstillinger kan ikke skjules (hengelås). Lagres per konto på serveren: GET/PUT /api/prefs/mer {o:[nøkler], h:[skjulte]},
// med lokal reserve (UserDefaults «papir_mer» per konto). Nye moduler som ikke finnes i o legges sist.
// Nøklene følger designet: hjem, sporing, domener, chat, kalender, bursdag, huske, kart, finans, abo, rss, innst.

@MainActor
@Observable
final class Mer28 {
    static let shared = Mer28()

    var order: [String] = []
    var hidden: [String] = []
    var editing: Bool = false
    var dragKey: String? = nil
    var dragDY: CGFloat = 0
    @ObservationIgnored private var loadedFor: String = "-"

    static let locked: String = "innst"
    static let rowH: CGFloat = 66

    private static var localKey: String { AcctScope.key("papir_mer") }

    /// Eldre eller andre navn på samme modul.
    static func canon(_ k: String) -> String {
        switch k {
        case "familie": return "kart"
        case "nyheter": return "rss"
        case "abonnementer", "subs", "subscriptions": return "abo"
        case "innstillinger": return "innst"
        default: return k
        }
    }

    func load(_ store: Store) async {
        let acct: String = store.account?.id ?? ""
        if loadedFor == acct { return }
        loadedFor = acct
        readLocal()
        if migrate37() { save(store) }
        if migrate43() { save(store) }
        guard let d = try? await store.api.callAt("/api", "GET", "/prefs/mer") else { return }
        let r: [String: Any] = JS.obj(d)
        let o: [String: Any] = JS.dict(r, "mer") ?? JS.dict(r, "prefs") ?? r
        let oo: [String] = JS.strings(o, "o").map { Mer28.canon($0) }
        let hh: [String] = JS.strings(o, "h").map { Mer28.canon($0) }
        if oo.isEmpty && hh.isEmpty { return }
        order = oo
        hidden = hh.filter { $0 != Mer28.locked }
        writeLocal()
        // Prompt 43: samme engangs-migrering for Media når oppsettet kommer fra serveren.
        if !UserDefaults.standard.bool(forKey: AcctScope.key("papir_mer_media_v2_srv")) {
            UserDefaults.standard.set(true, forKey: AcctScope.key("papir_mer_media_v2_srv"))
            hidden.removeAll { $0 == "media" }
            order.removeAll { $0 == "media" }
            order.insert("media", at: 0)
            save(store)
        }
        if hidden.contains("huske") && !UserDefaults.standard.bool(forKey: AcctScope.key("papir_mer_huske_v1_srv")) {
            UserDefaults.standard.set(true, forKey: AcctScope.key("papir_mer_huske_v1_srv"))
            hidden.removeAll { $0 == "huske" }
            save(store)
        }
    }

    /// Prompt 37: Gjøremål var skjult i noens Mer-oppsett. Én gang (papir_mer_huske_v1) tas den ut av skjult-listen;
    /// etterpå kan brukeren skjule den igjen selv. true = endret.
    private func migrate37() -> Bool {
        let k: String = AcctScope.key("papir_mer_huske_v1")
        if UserDefaults.standard.bool(forKey: k) { return false }
        UserDefaults.standard.set(true, forKey: k)
        if !hidden.contains("huske") { return false }
        hidden.removeAll { $0 == "huske" }
        return true
    }

    /// Prompt 43: den gamle Media-siden kan ha vært skjult (papir_mer.h inneholder «media»). Én gang (papir_mer_media_v2)
    /// tas den ut av skjult-listen og legges øverst i Mer, ellers finner man ikke den nye Media-siden. true = endret.
    private func migrate43() -> Bool {
        let k: String = AcctScope.key("papir_mer_media_v2")
        if UserDefaults.standard.bool(forKey: k) { return false }
        UserDefaults.standard.set(true, forKey: k)
        hidden.removeAll { $0 == "media" }
        order.removeAll { $0 == "media" }
        order.insert("media", at: 0)
        return true
    }

    private func readLocal() {
        guard let d = UserDefaults.standard.data(forKey: Mer28.localKey),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else {
            order = []
            hidden = []
            return
        }
        order = ((o["o"] as? [String]) ?? []).map { Mer28.canon($0) }
        hidden = ((o["h"] as? [String]) ?? []).map { Mer28.canon($0) }
    }

    private func writeLocal() {
        let o: [String: Any] = ["o": order, "h": hidden]
        if let d = try? JSONSerialization.data(withJSONObject: o) { UserDefaults.standard.set(d, forKey: Mer28.localKey) }
    }

    func save(_ store: Store) {
        writeLocal()
        let body: [String: Any] = ["o": order, "h": hidden]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/prefs/mer", json: body) }
    }

    /// Radene i lagret rekkefølge (nye sist), delt i synlige og skjulte.
    func arrange(_ rows: [More28Row]) -> (visible: [More28Row], hidden: [More28Row]) {
        var out: [More28Row] = []
        // Prompt 36: «Now Brief» er ny – står den ikke i lagret rekkefølge, legges den øverst.
        if !order.contains("brief"), let b = rows.first(where: { $0.id == "brief" }) { out.append(b) }
        for k in order {
            if let r = rows.first(where: { $0.id == k }), !out.contains(where: { $0.id == k }) { out.append(r) }
        }
        for r in rows where !out.contains(where: { $0.id == r.id }) { out.append(r) }
        let vis: [More28Row] = out.filter { !hidden.contains($0.id) || $0.id == Mer28.locked }
        let hid: [More28Row] = out.filter { hidden.contains($0.id) && $0.id != Mer28.locked }
        return (vis, hid)
    }

    func start() {
        if editing { return }
        Mer30.shared.showHidden = false
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.easeOut(duration: 0.2)) { editing = true }
    }

    func done(_ store: Store) {
        Haptics.shared.success()
        dragKey = nil
        dragDY = 0
        withAnimation(.easeOut(duration: 0.2)) { editing = false }
        save(store)
    }

    func hide(_ k: String, _ all: [More28Row], _ store: Store) {
        if k == Mer28.locked { return }
        Haptics.shared.tick()
        let cur = arrange(all)
        withAnimation(.easeOut(duration: 0.2)) {
            order = cur.visible.map(\.id).filter { $0 != k } + cur.hidden.map(\.id) + [k]
            hidden = cur.hidden.map(\.id) + [k]
        }
        save(store)
    }

    func show(_ k: String, _ all: [More28Row], _ store: Store) {
        Haptics.shared.tick()
        let cur = arrange(all)
        let rest: [String] = cur.hidden.map(\.id).filter { $0 != k }
        withAnimation(.easeOut(duration: 0.2)) {
            order = cur.visible.map(\.id) + [k] + rest
            hidden = rest
        }
        save(store)
    }

    /// Dra ≡: bytter plass med naboen når raden er flyttet en halv radhøyde.
    func drag(_ k: String, _ ty: CGFloat, _ all: [More28Row]) {
        if dragKey != k {
            dragKey = k
            dragBase = 0
        }
        var dy: CGFloat = ty - dragBase
        let cur = arrange(all)
        var keys: [String] = cur.visible.map(\.id)
        guard let i = keys.firstIndex(of: k) else { return }
        // Prompt 30: separate kort med 10 pt mellomrom i redigeringsmodus.
        let h: CGFloat = Mer28.rowH + Wiggle30.gap
        var sw: Int = 0
        if dy > h / 2 && i < keys.count - 1 { sw = 1 } else if dy < -h / 2 && i > 0 { sw = -1 }
        if sw != 0 {
            keys.swapAt(i, i + sw)
            dragBase += CGFloat(sw) * h
            dy -= CGFloat(sw) * h
            Haptics.shared.tick()
            withAnimation(.easeOut(duration: 0.18)) { order = keys + cur.hidden.map(\.id) }
        }
        dragDY = dy
    }

    @ObservationIgnored private var dragBase: CGFloat = 0

    func dragEnd(_ store: Store) {
        withAnimation(.easeOut(duration: 0.18)) {
            dragKey = nil
            dragDY = 0
        }
        save(store)
    }
}

struct More28Row: Identifiable {
    let id: String
    let name: String
    let sub: String
    let icon: String
    let act: () -> Void
}

// ---- Tidligere More24.swift ----

/* ---------------- Prompt 24: «Mer» lik på iOS og Android, Ruter fullskjerm og Hjem-oppsett ---------------- */
// Fasit: side «mer» i design/Mobil Papir App.dc.html og prompts/claude-code-mer-lik.md.
// Ett kort (radius 20, skygge), rader med Newsreader 19 og undertekst, «›», skillelinjer bare mellom rader,
// Prompt 25: ikon til venstre (40 × 40-boks, radius 12, bg, strekikon 21 i ikonpaletten). Faner som allerede står i fanelinjen tas ut.

extension Store {
    /// Ruter-visningen vises som fullskjerm (uten fanelinje og FAB) når Avganger er åpen i Papir.
    var ruter24Full: Bool {
        paperTab == "avg" && paperClassic == nil && paperFin == nil && !newsOpen && dishSel == nil
    }
}

/* ---------- Hjem: Pakker vises alltid, Bursdager (h9) legges til ---------- */

/// Pakker-kortet når ingen pakker er aktive (design: «SPORING · Ingen aktive pakker · Legg til et sporingsnummer»).
struct PaperNoPackagesCard24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { store.paperGo("sporing") } label: {
            HStack(spacing: 14) {
                Image(systemName: "shippingbox").font(.system(size: 22, weight: .semibold)).foregroundStyle(p.mut)
                    .frame(width: 52, height: 52)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    PLabel(text: "Sporing")
                    Text("Ingen aktive pakker").font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text("Legg til et sporingsnummer").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("›").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

extension Store {
    /// Engangsretting (prompt 24): et tidligere oppsett kunne ha mistet Pakker (h2) på Hjem. Pakker hentes fram
    /// igjen og settes tilbake på plass 2 hvis den mangler. Nye kort (Bursdager h9) legges bakerst av pageCards
    /// uten å erstatte noe i lagret rekkefølge.
    func migrateHome24() {
        let flag: String = AcctScope.key("fh_home24_h2")
        if UserDefaults.standard.bool(forKey: flag) { return }
        UserDefaults.standard.set(true, forKey: flag)
        guard var l = paperPages["hjem"] else { return }
        let wasHidden: Bool = l.hidden.contains("h2")
        let missing: Bool = !l.order.isEmpty && !l.order.contains("h2")
        guard wasHidden || missing else { return }
        l.hidden.removeAll { $0 == "h2" }
        if missing {
            let at: Int = l.order.firstIndex(of: "h1").map { $0 + 1 } ?? 0
            l.order.insert("h2", at: Swift.min(at, l.order.count))
        }
        paperPages["hjem"] = l
        savePaperLayout(["pages": ["hjem": ["order": l.order, "hidden": l.hidden]]])
    }
}
