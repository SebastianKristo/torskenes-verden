import SwiftUI

/* ---------------- Prompt 73 (BRIEF73): Innhold i briefen og kort som vises med en gang ----------------
 Fasit: Glimt Brief.dc.html (mode settings → INNHOLD I BRIEFEN, BK0) og claude-code-brief-velg-kort.md /
 claude-code-brief-kort-lastes-straks.md.
 - Lista (GET/PUT /api/brief-cards, POST /api/brief-cards/reset) bestemmer hvilke kort briefen har og rekkefølgen.
   Den caches per bruker (UserDefaults), så briefen tegnes fra lista fra første bilde – ikke fra data.
 - Kortene fra /api/brief52 hentes hvert for seg, alle samtidig, 6 s hver (Brief52Model). Siste svar vises straks;
   uten cache: skjelett i full høyde (#e6dfd1 på #fffdf8), ingen spinner. Tidsavbrudd: «Oppdatert kl. HH:MM» eller
   «Klarte ikke hente» med «Prøv igjen». Tomt: kort tomtekst – kortet blir stående.
 - Rader: pil opp/ned, tittel + kilde, bryter. Hele raden slår av/på, skjulte kort er dempet (45 %). Langt trykk + dra
   flytter raden, med haptikk ved flytt og bryter. «Tilbakestill» gir standard utvalg og rekkefølge. */

struct Brief73Item: Identifiable, Equatable, Codable {
    var key: String
    var title: String
    var sub: String
    var on: Bool
    var id: String { key }
}

@MainActor
@Observable
final class Brief73Model {
    static let shared = Brief73Model()

    var items: [Brief73Item] = Brief73Model.defaults
    var err: String = ""
    @ObservationIgnored private var who: String = "-"
    @ObservationIgnored private var at: Date = .distantPast

    /// Samme som server/brief73.js CATALOG73 (reserve når serveren ikke svarer).
    static let catalog: [(String, String, String, Bool)] = [
        ("vaer", "Vær", "Nå, i dag og varsel", true),
        ("kal", "Kalender", "Første avtale og resten av dagen", true),
        ("fokus", "Dagens fokus", "Det viktigste i dag, valgt av Glimt", true),
        ("gjore", "Huskeliste · 3 viktigste", "Fra Gjøremål", true),
        ("reise", "Min reise", "Ruter: neste avgang og når du må gå", true),
        ("regn", "Regninger denne uka", "Fra Finans", true),
        ("kveld", "Nytt i kveld", "Nye episoder og filmer fra Media", true),
        ("nyheter", "Nyheter", "Sammendrag fra Nyheter", true),
        ("pakker", "Pakker", "Sporing på vei", false),
        ("homelab", "Homelab-status", "Varsler fra serveren", false),
        ("domener", "Domener og SSL", "Utløper snart", false),
        ("klaer", "Klær i dag", "Hva du bør ha på deg, fra Vær", true),
        ("abo", "Prøveperioder", "Fra Abonnementer", true),
        ("bibel", "Bibelvers", "Dagens vers", true),
        ("familie", "Familie", "De som deler posisjon", true),
        ("skole", "Skole og jobb", "Prøver og frister neste 7 dager", true),
        ("bursdager", "Bursdager", "Neste bursdager", true),
        ("nordlys", "Nordlys i natt", "Når Kp er høy nok", true),
        ("aksjer", "Aksjer", "Porteføljen fra Finans", false),
    ]
    static var defaults: [Brief73Item] {
        catalog.map { (x: (String, String, String, Bool)) -> Brief73Item in Brief73Item(key: x.0, title: x.1, sub: x.2, on: x.3) }
    }
    /// Nøkkel → id i /api/brief52.
    static let b52: [String: String] = ["fokus": "focus", "gjore": "todo", "reise": "trip", "regn": "bills", "kveld": "tonight",
                                        "homelab": "homelab", "domener": "domains", "klaer": "clothes", "aksjer": "stocks"]
    /// Høyden kortet har ferdig (skjelettet tar samme plass).
    static let height: [String: CGFloat] = ["vaer": 280, "kal": 150, "fokus": 190, "gjore": 230, "reise": 180, "regn": 250, "kveld": 146,
                                            "nyheter": 760, "pakker": 150, "homelab": 200, "domener": 200, "klaer": 150, "abo": 160,
                                            "bibel": 260, "familie": 120, "skole": 160, "bursdager": 140, "nordlys": 100, "aksjer": 130]

    var onKeys: [String] { items.filter { (i: Brief73Item) -> Bool in i.on }.map { (i: Brief73Item) -> String in i.key } }
    var countText: String {
        let n: Int = items.filter { (i: Brief73Item) -> Bool in i.on }.count
        return "\(n) av \(items.count) på"
    }
    func title(_ key: String) -> String {
        items.first { (i: Brief73Item) -> Bool in i.key == key }?.title ?? key
    }

    private static func cacheKey(_ who: String) -> String { "brief73_cards_" + who }

    /// Lista fra disk for brukeren som er logget inn (ellers standard).
    func hydrate(_ store: Store) {
        let w: String = store.account?.id ?? ""
        if w == who { return }
        who = w
        at = .distantPast
        if let d = UserDefaults.standard.data(forKey: Brief73Model.cacheKey(w)),
           let l = try? JSONDecoder().decode([Brief73Item].self, from: d), !l.isEmpty {
            items = l
        } else {
            items = Brief73Model.defaults
        }
    }

    private func persist() {
        if let d = try? JSONEncoder().encode(items) { UserDefaults.standard.set(d, forKey: Brief73Model.cacheKey(who)) }
    }

    private func take(_ d: Data) {
        let o: [String: Any] = JS.obj(d)
        var out: [Brief73Item] = []
        for c in JS.list(o, "cards") {
            guard let k = JS.str(c, "key") else { continue }
            out.append(Brief73Item(key: k, title: JS.str(c, "title") ?? k, sub: JS.str(c, "sub") ?? "", on: JS.bool(c, "on") ?? false))
        }
        if out.isEmpty { return }
        items = out
        err = ""
        persist()
    }

    func load(_ store: Store, force: Bool = false) async {
        hydrate(store)
        if !force && Date().timeIntervalSince(at) < 60 { return }
        at = Date()
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/brief-cards", timeout: 6)
            take(d)
        } catch let e as APIError {
            if e.status != 404 { err = e.message }
        } catch {
            // Uten nett: lista fra disk gjelder.
        }
    }

    /// Lagrer straks lokalt og så på serveren. Briefen følger med en gang (uten omstart).
    private func save(_ store: Store) {
        persist()
        let list: [[String: Any]] = items.map { (i: Brief73Item) -> [String: Any] in ["key": i.key, "on": i.on] }
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "PUT", "/brief-cards", json: ["cards": list], timeout: 10)
                self.take(d)
                await Brief34Model.shared.load(store, force: true)
            } catch let e as APIError {
                self.err = e.message
            } catch {
                self.err = "Lagret på telefonen. Synkes når nettet er tilbake."
            }
        }
        Brief52Model.shared.fetchAll(store)
    }

    func toggle(_ key: String, _ store: Store) {
        guard let i = items.firstIndex(where: { (x: Brief73Item) -> Bool in x.key == key }) else { return }
        Haptics.shared.tap()
        items[i].on.toggle()
        save(store)
    }

    func move(_ key: String, by: Int, _ store: Store) {
        guard let i = items.firstIndex(where: { (x: Brief73Item) -> Bool in x.key == key }) else { return }
        let j: Int = i + by
        if j < 0 || j >= items.count { return }
        Haptic34.light()
        items.swapAt(i, j)
        save(store)
    }

    /// Dra-for-å-flytte: legger raden på plass `to`.
    func place(_ key: String, to: Int, _ store: Store) {
        guard let i = items.firstIndex(where: { (x: Brief73Item) -> Bool in x.key == key }) else { return }
        let j: Int = Swift.max(0, Swift.min(items.count - 1, to))
        if i == j { return }
        let it: Brief73Item = items.remove(at: i)
        items.insert(it, at: j)
        save(store)
    }

    func reset(_ store: Store) {
        Haptic34.light()
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/brief-cards/reset", json: [:], timeout: 10)
                self.take(d)
                Brief52Model.shared.fetchAll(store)
                await Brief34Model.shared.load(store, force: true)
            } catch let e as APIError {
                self.err = e.message
            } catch {
                self.err = error.localizedDescription
            }
        }
    }
}

/* ---------- Innstillinger: INNHOLD I BRIEFEN ---------- */

struct Brief73Settings: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief73Model { Brief73Model.shared }
    @State private var dragKey: String = ""
    @State private var dragY: CGFloat = 0
    @State private var lastSlot: Int = 0

    private let rowH: CGFloat = 53

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Glimt35Label(text: "INNHOLD I BRIEFEN")
                Spacer(minLength: 8)
                Text(m.countText).font(PF.mono(11)).foregroundStyle(Brief34C.rgb(0x8a8478))
            }
            .padding(.top, 4)
            Text("Velg hvilke kort som er med og rekkefølgen de vises i. Gjelder Now Brief på mobil, web og widgets.")
                .font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
                .padding(.top, -6)
            VStack(spacing: 0) {
                ForEach(Array(m.items.enumerated()), id: \.element.key) { (pair: (offset: Int, element: Brief73Item)) in
                    row(pair.element, pair.offset)
                }
            }
            .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
            Button { m.reset(store) } label: {
                Text("Tilbakestill").font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.ink)
                    .padding(.horizontal, 14).frame(height: 34)
                    .overlay(Capsule().strokeBorder(Brief34C.rgb(0xddd5c5), lineWidth: 1))
            }
            .buttonStyle(.plain)
            if !m.err.isEmpty {
                Text(m.err).font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.red)
            }
        }
        .task(id: store.account?.id ?? "") { await m.load(store, force: true) }
    }

    @ViewBuilder private func row(_ it: Brief73Item, _ i: Int) -> some View {
        let dragging: Bool = dragKey == it.key
        HStack(spacing: 10) {
            VStack(spacing: 2) {
                Brief73Arrow(up: true, dim: i == 0) { m.move(it.key, by: -1, store) }
                Brief73Arrow(up: false, dim: i == m.items.count - 1) { m.move(it.key, by: 1, store) }
            }
            Button { m.toggle(it.key, store) } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(it.title).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                        Text(it.sub).font(PF.ui(12)).foregroundStyle(Brief34C.mut).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .opacity(it.on ? 1 : 0.45)
                    Glimt35Switch(on: it.on)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(it.title)
            .accessibilityValue(it.on ? "På" : "Av")
        }
        .padding(.vertical, 6)
        .frame(minHeight: 52)
        .background(dragging ? Brief34C.card : Color.clear)
        .overlay(alignment: .bottom) { Rectangle().fill(Brief34C.line).frame(height: 1) }
        .offset(y: dragging ? dragY : 0)
        .zIndex(dragging ? 1 : 0)
        .shadow(color: Color.black.opacity(dragging ? 0.12 : 0), radius: 8, y: 4)
        .gesture(drag(it, i))
        .accessibilityAction(named: "Flytt opp") { m.move(it.key, by: -1, store) }
        .accessibilityAction(named: "Flytt ned") { m.move(it.key, by: 1, store) }
    }

    /// Langt trykk (0,35 s) og dra: raden følger fingeren, haptikk for hver ny plass, slippes på nærmeste plass.
    private func drag(_ it: Brief73Item, _ i: Int) -> some Gesture {
        LongPressGesture(minimumDuration: 0.35)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { (v: SequenceGesture<LongPressGesture, DragGesture>.Value) in
                switch v {
                case .second(true, let d):
                    if dragKey != it.key { dragKey = it.key; lastSlot = 0; Haptic34.light() }
                    let dy: CGFloat = d?.translation.height ?? 0
                    dragY = dy
                    let slot: Int = Int((dy / rowH).rounded())
                    if slot != lastSlot { lastSlot = slot; Haptics.shared.tap() }
                default: break
                }
            }
            .onEnded { (_: SequenceGesture<LongPressGesture, DragGesture>.Value) in
                if dragKey == it.key {
                    let to: Int = i + Int((dragY / rowH).rounded())
                    m.place(it.key, to: to, store)
                }
                dragKey = ""
                dragY = 0
                lastSlot = 0
            }
    }
}

struct Brief73Arrow: View {
    let up: Bool
    let dim: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Image(systemName: up ? "chevron.up" : "chevron.down")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Brief34C.ink)
                .frame(width: 28, height: 22)
                .background(Brief34C.rgb(0xefe9dc), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                .opacity(dim ? 0.35 : 1)
        }
        .buttonStyle(.plain)
        .disabled(dim)
        .accessibilityLabel(up ? "Flytt opp" : "Flytt ned")
    }
}

/* ---------- Briefen: kortene i brukerens rekkefølge ---------- */

/// Alle kortene som er på, i lagret rekkefølge. Kortene fra /api/brief (vær, kalender, nyheter …) og /api/brief52
/// (fokus, reise, regninger …) får plassen sin med en gang: cache, ellers skjelett.
struct Brief73Stack: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief73Model { Brief73Model.shared }
    @MainActor private var c52: Brief52Model { Brief52Model.shared }
    let b: Brief34
    let has34: Bool
    let target: String

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(m.onKeys, id: \.self) { (k: String) in
                card(k)
            }
        }
        .task(id: store.account?.id ?? "") {
            m.hydrate(store)
            c52.hydrate(store)
            await m.load(store)
            await c52.load(store, force: true)
        }
    }

    @ViewBuilder private func card(_ k: String) -> some View {
        if let id = Brief73Model.b52[k] {
            Brief73Card52(key: k, id: id)
        } else if !has34 {
            Brief73Skeleton(title: m.title(k), height: Brief73Model.height[k] ?? 150)
        } else {
            Brief73Card34(key: k, b: b, target: target)
        }
    }
}

/// Et kort fra /api/brief52: cache → innhold, ellers skjelett eller «Klarte ikke hente».
struct Brief73Card52: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief52Model { Brief52Model.shared }
    let key: String
    let id: String

    var body: some View {
        let title: String = Brief73Model.shared.title(key)
        if let c = m.card(id) {
            VStack(alignment: .leading, spacing: 6) {
                Brief52One(c: c)
                if m.state[id] == "stale" {
                    Brief73Stale(at: m.fetchedAt[id]) { m.retry(id, store) }
                }
            }
        } else if m.state[id] == "fail" {
            Brief73Empty(title: title, text: "Klarte ikke hente", height: Brief73Model.height[key] ?? 150) { m.retry(id, store) }
        } else {
            Brief73Skeleton(title: title, height: Brief73Model.height[key] ?? 150)
        }
    }
}

/// Et kort fra /api/brief (eller Glimt-/Brief38-dataene). Tomt innhold gir en kort tomtekst.
struct Brief73Card34: View {
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    @MainActor private var c38: Brief38Cards { Brief38Cards.shared }
    let key: String
    let b: Brief34
    let target: String

    var body: some View {
        switch key {
        case "vaer": Brief37WeatherButton(b: b).brief36Ring(target == "vaer").id("gb35-vaer")
        case "kal": Brief34Calendar(b: b).brief36Ring(target == "kal").id("gb35-kal")
        case "nyheter": Brief35NewsCard(b: b, extra: g.extra).brief36Ring(target == "nyh").id("gb35-nyh")
        case "abo":
            if !g.extra.trials.isEmpty {
                Brief35TrialsCard(trials: g.extra.trials).brief36Ring(target == "abo").id("gb35-abo")
            } else {
                Brief73Empty(title: "Prøveperioder", text: "Ingen prøveperioder slutter snart")
            }
        case "bibel": Bible37BriefCard()
        case "pakker":
            if !c38.packages.isEmpty { Brief38PkgCard() } else { Brief73Empty(title: "Pakker", text: "Ingen pakker på vei") }
        case "familie":
            if !c38.family.isEmpty { Brief38FamCard() } else { Brief73Empty(title: "Familie", text: "Ingen deler posisjon nå") }
        case "skole":
            if !c38.school.isEmpty { Brief38SchoolCard() } else { Brief73Empty(title: "Skole og jobb", text: "Ingen prøver eller frister neste 7 dager") }
        case "bursdager":
            if !c38.birthdays.isEmpty { Brief38BdayCard() } else { Brief73Empty(title: "Bursdager", text: "Ingen bursdager den nærmeste tiden") }
        case "nordlys":
            if c38.aurora.show && Brief38AuroraCard.evening { Brief38AuroraCard() } else { Brief73Empty(title: "Nordlys i natt", text: "Ikke nordlys i natt") }
        default: EmptyView()
        }
    }
}

/// Skjelett i full høyde: tittel og grå linjer i papirstil. Ingen spinner, ingen innfading.
struct Brief73Skeleton: View {
    let title: String
    let height: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(PF.serif(20, medium: true)).foregroundStyle(Brief34C.ink)
            Brief73Bar(w: 0.72)
            Brief73Bar(w: 0.54)
            Brief73Bar(w: 0.63)
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: height, alignment: .topLeading)
        .background(Brief34C.rgb(0xfffdf8), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title + " lastes")
    }
}

struct Brief73Bar: View {
    let w: CGFloat

    var body: some View {
        GeometryReader { (geo: GeometryProxy) in
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Brief34C.rgb(0xe6dfd1))
                .frame(width: geo.size.width * w, height: 12)
        }
        .frame(height: 12)
    }
}

/// Kort uten innhold (eller som ikke kunne hentes): tittel, kort tekst og ev. «Prøv igjen».
struct Brief73Empty: View {
    let title: String
    let text: String
    var height: CGFloat = 0
    var retry: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(PF.serif(20, medium: true)).foregroundStyle(Brief34C.ink)
            Text(text).font(PF.ui(13.5)).foregroundStyle(Brief34C.mut)
            if let r = retry {
                Button(action: r) {
                    Text("Prøv igjen").font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.ink)
                        .padding(.horizontal, 14).frame(height: 32)
                        .overlay(Capsule().strokeBorder(Brief34C.rgb(0xddd5c5), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: height, alignment: .topLeading)
        .background(Brief34C.rgb(0xfffdf8), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/// «Oppdatert kl. HH:MM · Prøv igjen» under et kort som viser cache etter tidsavbrudd.
struct Brief73Stale: View {
    let at: Date?
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Text(at.map { (d: Date) -> String in "Oppdatert kl. " + JS.fmt(d, "HH:mm") } ?? "Klarte ikke hente")
                .font(PF.ui(12)).foregroundStyle(Brief34C.rgb(0x8a8478))
            Button(action: retry) {
                Text("Prøv igjen").font(PF.ui(12, .bold)).foregroundStyle(Brief34C.red).underline()
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 4)
    }
}
