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

/// Mer-siden (Papir): liste i ett kort, redigeringskort øverst og SKJULT-seksjon i redigeringsmodus.
struct PaperMore28: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }

    var body: some View {
        let all: [More28Row] = rows
        let cur = m.arrange(all)
        VStack(alignment: .leading, spacing: 10) {
            // Prompt 30: ingen header-kort. ＋ N / ✓ flyter over listen (Mer30Pills), separate kort som vugger (Wiggle30.swift).
            if m.editing {
                Mer30EditList(visible: cur.visible, hidden: cur.hidden, all: all)
            } else {
                More28List(rows: cur.visible, all: all, hiddenList: false)
            }
            if !m.editing {
                Text("Hold inne for å endre rekkefølgen eller skjule moduler.").font(PF.ui(12)).foregroundStyle(p.mut)
                    .frame(maxWidth: .infinity).multilineTextAlignment(.center).padding(.top, 2)
            }
        }
        .onAppear { Mer30.shared.hiddenCount = cur.hidden.count }
        .onChange(of: cur.hidden.count) { _, n in Mer30.shared.hiddenCount = n }
        .task(id: store.account?.id ?? "") {
            await m.load(store)
            // Prompt 43: Media i Mer bare med modulen (403/404 skjuler raden).
            await Media43.shared.probe(store)
        }
        .onDisappear { if m.editing { m.done(store) } }
    }

    private var rows: [More28Row] {
        let inBar: Set<String> = Set(store.mainTabs(floating: store.fabMode == "float", onHome: true).map(\.0))
        var out: [More28Row] = []
        // Prompt 36: «Now Brief» øverst (✦), også når kortet er sveipet bort fra Hjem (Brief36.swift).
        out.append(More28Row(id: "brief", name: "Now Brief", sub: Brief36Model.shared.merSub, icon: "sparkle") { Brief34Model.shared.show() })
        if !inBar.contains("hjem") {
            out.append(More28Row(id: "hjem", name: "Hjem", sub: "Pakker, avganger og widgets", icon: "house") { store.paperGo("hjem") })
        }
        let n: Int = store.paperOnWay
        if !inBar.contains("sporing") {
            let s: String = n > 0 ? (n == 1 ? "1 pakke på vei" : "\(n) pakker på vei") : "Pakker og sendinger"
            out.append(More28Row(id: "sporing", name: "Sporing", sub: s, icon: "shippingbox") { store.paperGo("sporing") })
        }
        if !inBar.contains("domener") {
            out.append(More28Row(id: "domener", name: "Domener", sub: "Trafikk, besøk og oppetid", icon: "globe") { store.paperOpenDomains(from: "mer") })
        }
        // Prompt 43: Media (Sonarr, Radarr, qBittorrent og Prowlarr), fullskjerm (Media43Views.swift). Bare med modulen «media».
        if Media43.shared.allowed {
            let n: Int = Media43.shared.torrents.filter { !$0.done }.count
            out.append(More28Row(id: "media", name: "Media", sub: n > 0 ? "\(n) lastes ned · Sonarr, Radarr og mer" : "Kommer snart, serier, filmer og nedlastinger", icon: "play.rectangle") { Media43.shared.show() })
        }
        out.append(More28Row(id: "chat", name: "Chat", sub: "Ollama lokalt, Gemini og Groq", icon: "bubble.left.and.bubble.right") { store.openChat() })
        out.append(More28Row(id: "kalender", name: "Kalender", sub: "Timeplan, prøver og frister", icon: "calendar") { store.paperGo("kalender") })
        out.append(More28Row(id: "bursdag", name: "Bursdager", sub: "Hvem har bursdag snart", icon: "gift") { store.paperGo("bursdag") })
        // Prompt 37: Gjøremål står alltid i Mer (også når den er i fanelinjen).
        out.append(More28Row(id: "huske", name: "Gjøremål", sub: "To-do for hele familien", icon: "checklist") { store.paperGo("huske") })
        // Prompt 37: Bibel (bare for brukere med bibelvers-modulen).
        if Bible37Model.shared.enabled {
            let st: Int = Bible37Model.shared.streak
            let sub: String = st > 0 ? "🔥 \(st) " + (st == 1 ? "dag" : "dager") + " på rad" : "Dagens vers, rekke og leseplan"
            out.append(More28Row(id: "bibel", name: "Bibel", sub: sub, icon: "book") { store.paperGo("bibel") })
        }
        if !inBar.contains("familie") {
            out.append(More28Row(id: "kart", name: "Familie og kart", sub: "Posisjon, soner og helse", icon: "mappin.and.ellipse") { store.paperGo("familie") })
        }
        out.append(More28Row(id: "finans", name: "Finans", sub: "Oversikt, liste, Finn og mer", icon: "creditcard") { store.paperMainTab("finans") })
        // Prompt 28: Subscription OS rett etter Finans.
        out.append(More28Row(id: "abo", name: "Subscription OS", sub: "Abonnementer og faste trekk", icon: "arrow.triangle.2.circlepath") { store.paperGo("abo") })
        if !inBar.contains("nyheter") {
            out.append(More28Row(id: "rss", name: "Nyhetsleser", sub: "RSS med AI-sammendrag", icon: "dot.radiowaves.up.forward") { store.openNews() })
        }
        out.append(More28Row(id: "innst", name: "Innstillinger", sub: "Tema, bakgrunn og konto", icon: "gearshape") { store.paperGo("innst") })
        return out
    }
}

/// «REDIGERER MER · Dra ≡ for å flytte. Trykk − for å skjule.» med Ferdig. Ligger i innholdet, aldri på toppbildet.
struct More28EditCard: View {
    @Environment(\.paper) private var p
    let done: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("REDIGERER MER").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Text("Dra ≡ for å flytte. Trykk − for å skjule.").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            Button(action: done) {
                Text("Ferdig").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 16).frame(minHeight: 36)
                    .background(p.ink, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 16).padding(.trailing, 8).padding(.vertical, 8)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 12, y: 10)
        .transition(.opacity)
    }
}

/// Ett kort med rader (synlige eller skjulte).
struct More28List: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }
    let rows: [More28Row]
    let all: [More28Row]
    let hiddenList: Bool

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                More28RowView(r: r, index: i, all: all, hiddenRow: hiddenList, first: i == 0)
                    .zIndex(m.dragKey == r.id ? 2 : 0)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(hiddenList ? 0 : 0.18), radius: 12, y: 10)
    }
}

/// En rad: (− / hengelås / +) · ikon · navn og undertekst · ≡ eller ›.
struct More28RowView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }
    let r: More28Row
    let index: Int
    let all: [More28Row]
    let hiddenRow: Bool
    let first: Bool

    var body: some View {
        let dragging: Bool = m.dragKey == r.id
        content
            .padding(.horizontal, 14).padding(.vertical, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: Mer28.rowH)
            .background(p.card)
            .overlay(alignment: .top) {
                if !first && !dragging { Rectangle().fill(p.line).frame(height: 1) }
            }
            .clipShape(RoundedRectangle(cornerRadius: dragging ? 14 : 0, style: .continuous))
            .scaleEffect(dragging ? 1.02 : 1)
            .shadow(color: .black.opacity(dragging ? 0.28 : 0), radius: 14, y: 8)
            .offset(y: dragging ? m.dragDY : 0)
            .contentShape(Rectangle())
            .onTapGesture { if !m.editing { r.act() } }
            .onLongPressGesture(minimumDuration: 0.48, maximumDistance: 8) { m.start() }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(r.name)
    }

    private var content: some View {
        HStack(spacing: 12) {
            if m.editing { leading }
            icon
            VStack(alignment: .leading, spacing: 1) {
                Text(r.name).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                Text(r.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            .opacity(hiddenRow ? 0.5 : 1)
            Spacer(minLength: 6)
            trailing
        }
    }

    @ViewBuilder private var icon: some View {
        // Prompt 40: Finans/Økonomi har eget ikon (3c, Okonomi40Icon.swift).
        if r.id == "finans" {
            Okonomi40Icon(size: 40).opacity(hiddenRow ? 0.5 : 1)
        } else {
            Image(systemName: r.icon).font(.system(size: 19, weight: .medium))
                .foregroundStyle(PaperIconTheme.color(store.iconTheme, index))
                .frame(width: 40, height: 40)
                .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .opacity(hiddenRow ? 0.5 : 1)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder private var leading: some View {
        if hiddenRow {
            More28Circle(symbol: "plus", fill: p.pos, label: "Vis \(r.name)") { m.show(r.id, all, store) }
        } else if r.id == Mer28.locked {
            Image(systemName: "lock").font(.system(size: 14, weight: .semibold)).foregroundStyle(p.mut)
                .frame(width: 26, height: 26)
                .accessibilityLabel("Kan ikke skjules")
        } else {
            More28Circle(symbol: "minus", fill: p.lab, label: "Skjul \(r.name)") { m.hide(r.id, all, store) }
        }
    }

    @ViewBuilder private var trailing: some View {
        if m.editing && !hiddenRow {
            Image(systemName: "line.3.horizontal").font(.system(size: 18, weight: .medium)).foregroundStyle(p.mut)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .padding(.vertical, -8).padding(.trailing, -8)
                .gesture(handleDrag)
                .accessibilityLabel("Flytt \(r.name)")
        } else if !m.editing {
            Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
        }
    }

    private var handleDrag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { (v: DragGesture.Value) in m.drag(r.id, v.translation.height, all) }
            .onEnded { (_: DragGesture.Value) in m.dragEnd(store) }
    }
}

/// Rød minus- eller grønn pluss-sirkel, 26 pt, hvit strek.
struct More28Circle: View {
    let symbol: String
    let fill: Color
    let label: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Image(systemName: symbol).font(.system(size: 12, weight: .heavy)).foregroundStyle(Color.white)
                .frame(width: 26, height: 26)
                .background(fill, in: Circle())
                .contentShape(Circle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
