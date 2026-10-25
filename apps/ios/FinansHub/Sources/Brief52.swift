import SwiftUI

/* ---------------- Prompt 52: brief-kortene per innlogget bruker ----------------
 Fasit: Glimt Brief.dc.html (valgt 1b Dagens fokus, 3b Min reise, 4a Huskeliste, 2a Regninger, 9b Klær, 5b Nytt i kveld,
 6a Homelab med Start-knapp, 7a Domener, 8b Aksjer). Ingen velger i toppen: GET /api/brief52 gir kortene for brukeren som er
 logget inn, allerede filtrert på tilgang (admin alt; Homelab/Domener/Aksjer bare admin eller med tilgang; barn uten Regninger/Media).
 Appen hardkoder ingen navn og viser bare det serveren sender. Start (bare admin, can_start): POST /api/brief52/homelab/:id/start.
 Kort med `data: null` vises med «Ingen data akkurat nå» (Min reise skjules da – ingen reise i dag). */

struct Brief52Card: Identifiable {
    let id: String
    let title: String
    let variant: String
    let data: [String: Any]?
    let error: String
}

@MainActor
@Observable
final class Brief52Model {
    static let shared = Brief52Model()

    var cards: [Brief52Card] = []
    var greeting: String = ""
    var first: String = ""
    var loaded: Bool = false
    /// Tjenester som startes nå (id → «Starter …»), og siste svar per tjeneste.
    var starting: Set<String> = []
    var startNote: [String: String] = [:]
    @ObservationIgnored private var loadedFor: String = ""
    @ObservationIgnored private var at: Date = .distantPast

    func load(_ store: Store, force: Bool = false) async {
        let who: String = store.account?.id ?? ""
        if !force && loaded && who == loadedFor && Date().timeIntervalSince(at) < 60 { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/brief52", timeout: 15) else {
            // Eldre server uten /api/brief52: ingen nye kort (briefen ellers er som før).
            if who != loadedFor { cards = [] }
            loaded = true
            loadedFor = who
            return
        }
        let o: [String: Any] = JS.obj(d)
        var out: [Brief52Card] = []
        for c in JS.list(o, "cards") {
            guard let id = JS.str(c, "id") else { continue }
            out.append(Brief52Card(id: id, title: JS.str(c, "title") ?? id, variant: JS.str(c, "variant") ?? "",
                                   data: c["data"] as? [String: Any], error: JS.str(c, "error") ?? ""))
        }
        cards = out
        greeting = JS.str(o, "greeting") ?? ""
        first = JS.str(JS.dict(o, "user"), "first") ?? JS.str(JS.dict(o, "user"), "name") ?? ""
        loaded = true
        loadedFor = who
        at = Date()
    }

    func start(_ id: String, _ store: Store) async {
        if starting.contains(id) { return }
        Haptics.shared.tap()
        starting.insert(id)
        defer { starting.remove(id) }
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        do {
            let d = try await store.api.callAt("/api", "POST", "/brief52/homelab/\(enc)/start", json: [:], timeout: 40)
            let o: [String: Any] = JS.obj(d)
            let act: String = JS.str(o, "action") ?? "start"
            startNote[id] = act == "restart" ? "Startet på nytt" : "Startet"
            Haptics.shared.success()
            await load(store, force: true)
        } catch let e as APIError {
            startNote[id] = e.status == 403 ? "Bare admin kan starte tjenester" : "Fikk ikke startet: " + e.message
        } catch {
            startNote[id] = "Fikk ikke startet"
        }
    }
}

/// Alle kortene i fast rekkefølge (serverens). Legges i briefen (Brief35Content).
struct Brief52Stack: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief52Model { Brief52Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(m.cards) { (c: Brief52Card) in card(c) }
        }
        .task(id: store.account?.id ?? "") { await m.load(store) }
    }

    @ViewBuilder private func card(_ c: Brief52Card) -> some View {
        switch c.id {
        case "focus": Brief52Focus(c: c)
        case "trip": if Brief52Data.has(c.data, "items") { Brief52Trip(c: c) }
        case "todo": Brief52Todo(c: c)
        case "bills": Brief52Bills(c: c)
        case "clothes": if c.data != nil { Brief52Clothes(c: c) }
        case "tonight": Brief52Tonight(c: c)
        case "homelab": Brief52Homelab(c: c)
        case "domains": Brief52Domains(c: c)
        case "stocks": Brief52Stocks(c: c)
        default: EmptyView()
        }
    }
}

enum Brief52Data {
    static func has(_ d: [String: Any]?, _ k: String) -> Bool { !JS.list(d, k).isEmpty }

    static func num(_ o: [String: Any]?, _ k: String) -> Double? { JS.num(o, k) }

    /// «+1,2 %» / «−0,8 %».
    static func pct(_ v: Double) -> String {
        let s: String = String(format: "%.1f", abs(v)).replacingOccurrences(of: ".", with: ",")
        return (v >= 0 ? "+" : "−") + s + " %"
    }

    /// Lukker briefen og åpner en side.
    @MainActor static func go(_ store: Store, _ page: String) {
        Haptic34.light()
        Brief34Model.shared.close()
        store.paperGo(page)
    }
}

/// Felles ramme: papirkort med serif-tittel og rød mono-etikett (som Brief38).
struct Brief52Paper<C: View>: View {
    let title: String
    let kick: String
    @ViewBuilder let content: () -> C

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Brief38Head(title: title, kick: kick)
            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct Brief52Empty: View {
    let c: Brief52Card

    var body: some View {
        Text(c.error.isEmpty ? "Ingen data akkurat nå" : c.error).font(PF.ui(13)).foregroundStyle(Brief34C.mut)
    }
}

/* ---------- 1b Dagens fokus ---------- */

struct Brief52Focus: View {
    @Environment(Store.self) private var store
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let next: [String: Any]? = JS.dict(d, "next")
        Button { Brief52Data.go(store, "kalender") } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text("ÉN TING I DAG").font(PF.mono(10)).tracking(1.2).foregroundStyle(Brief34C.rgb(0xf29a8a))
                Text(JS.str(d, "text") ?? (c.error.isEmpty ? "Ingen data akkurat nå" : c.error))
                    .font(PF.serif(34)).foregroundStyle(Brief34C.paper).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                if !sub(next, d).isEmpty { Text(sub(next, d)).font(PF.ui(14)).foregroundStyle(Brief34C.rgb(0xa9a397)) }
                Text("Åpne kalenderen").font(PF.ui(13, .bold)).foregroundStyle(Brief34C.ink)
                    .padding(.horizontal, 16).frame(height: 38)
                    .background(Brief34C.paper, in: Capsule())
                    .padding(.top, 6)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brief34C.ink, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func sub(_ n: [String: Any]?, _ d: [String: Any]?) -> String {
        var parts: [String] = []
        if let n {
            let t: String = [JS.str(n, "time"), JS.str(n, "title"), JS.str(n, "place")].compactMap { $0 }.joined(separator: " · ")
            if !t.isEmpty { parts.append("Neste: " + t) }
        }
        if let k = JS.int(d, "count"), k > 0 { parts.append(k == 1 ? "1 avtale i dag" : "\(k) avtaler i dag") }
        if let f = JS.str(d, "free_from") { parts.append("fri fra " + f) }
        return parts.joined(separator: " · ")
    }
}

/* ---------- 3b Min reise ---------- */

struct Brief52Trip: View {
    @Environment(Store.self) private var store
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let items: [[String: Any]] = JS.list(d, "items")
        let first: [String: Any]? = items.first
        let line: String = JS.str(first, "line") ?? ""
        let stop: String = JS.str(d, "stop") ?? JS.str(first, "from") ?? ""
        Button { Brief52Data.go(store, "avg") } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(("Min reise" + (stop.isEmpty ? "" : " · " + stop)).uppercased()).font(PF.mono(10)).tracking(1.2)
                    .foregroundStyle(Brief34C.rgb(0xf29a8a)).lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(JS.int(first, "in_min").map { $0 <= 0 ? "nå" : "\($0)" } ?? "–").font(PF.serif(64))
                    if (JS.int(first, "in_min") ?? 1) > 0 { Text("min").font(PF.ui(15, .semibold)).foregroundStyle(Brief34C.rgb(0xa9a397)) }
                }
                HStack(spacing: 8) {
                    Text(line.isEmpty ? "–" : line).font(PF.ui(12, .heavy)).foregroundStyle(Brief34C.ink)
                        .padding(.horizontal, 4).frame(minWidth: 30).frame(height: 24)
                        .background(Color(hex: Ruter27Shared.fallbackHex(line)).opacity(0.85), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                    Text(JS.str(first, "dest") ?? "").font(PF.ui(15, .semibold)).foregroundStyle(Brief34C.paper).lineLimit(1)
                }
                if let dep = JS.str(first, "dep") {
                    Text("Går " + dep + (items.count > 1 ? " · så " + rest(items[1]) : "")).font(PF.ui(12.5)).foregroundStyle(Brief34C.rgb(0xa9a397)).lineLimit(1)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brief34C.ink, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func rest(_ o: [String: Any]) -> String {
        let l: String = JS.str(o, "line") ?? ""
        let m: String = JS.int(o, "in_min").map { "\($0) min" } ?? (JS.str(o, "dep") ?? "")
        return [l, m].filter { !$0.isEmpty }.joined(separator: " om ")
    }
}

/* ---------- 4a Huskeliste ---------- */

struct Brief52Todo: View {
    @Environment(Store.self) private var store
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let top: [[String: Any]] = Array(JS.list(d, "top").prefix(3))
        let open: Int = JS.int(d, "open") ?? top.count
        Brief52Paper(title: c.title, kick: open == 1 ? "1 ÅPEN" : "\(open) ÅPNE") {
            if d == nil || top.isEmpty {
                if d == nil { Brief52Empty(c: c) } else { Text("Ingenting å huske i dag").font(PF.ui(13)).foregroundStyle(Brief34C.mut) }
            }
            ForEach(Array(top.enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Button { Brief52Data.go(store, "huske") } label: { row(pair.element) }.buttonStyle(.plain)
            }
        }
    }

    private func row(_ x: [String: Any]) -> some View {
        let late: Bool = JS.bool(x, "overdue") ?? false
        return VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                Circle().stroke(late ? Brief34C.red : Brief34C.mut2, lineWidth: 2).frame(width: 22, height: 22)
                Text(JS.str(x, "title") ?? "").font(PF.ui(15, .semibold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                Spacer(minLength: 6)
                if let due = JS.str(x, "due") {
                    Text(due).font(PF.mono(12)).foregroundStyle(late ? Brief34C.red : Brief34C.mut).lineLimit(1)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
    }
}

/* ---------- 2a Regninger ---------- */

struct Brief52Bills: View {
    @Environment(Store.self) private var store
    let c: Brief52Card

    private static let colors: [UInt32] = [0x22476b, 0xb23a2a, 0x2f6b4a, 0x8a4f12, 0x7a5ad6]

    var body: some View {
        let d: [String: Any]? = c.data
        let items: [[String: Any]] = Array(JS.list(d, "items").prefix(4))
        Brief52Paper(title: c.title, kick: (JS.str(d, "sum_text") ?? "").uppercased()) {
            if d == nil { Brief52Empty(c: c) } else if items.isEmpty {
                Text("Ingen regninger forfaller snart").font(PF.ui(13)).foregroundStyle(Brief34C.mut)
            }
            ForEach(Array(items.enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Button { Brief52Data.go(store, "finans") } label: { row(pair.element, pair.offset) }.buttonStyle(.plain)
            }
        }
    }

    private func row(_ x: [String: Any], _ i: Int) -> some View {
        let name: String = JS.str(x, "name") ?? ""
        let days: Int? = JS.int(x, "days")
        let soon: Bool = (days ?? 99) <= 3
        return VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                Text(String(name.prefix(1)).uppercased()).font(PF.ui(12, .heavy)).foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Brief34C.rgb(Brief52Bills.colors[i % Brief52Bills.colors.count]), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    Text(when(days, JS.str(x, "due"))).font(PF.ui(12.5, soon ? .bold : .regular)).foregroundStyle(soon ? Brief34C.red : Brief34C.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text(JS.str(x, "amount_text") ?? JS.num(x, "amount").map { n0($0) + " kr" } ?? "").font(PF.mono(13)).foregroundStyle(Brief34C.ink).lineLimit(1)
            }
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
    }

    private func when(_ days: Int?, _ due: String?) -> String {
        guard let days else { return due.map { "Forfaller " + $0 } ?? "" }
        if days < 0 { return "Forfalt" }
        if days == 0 { return "Forfaller i dag" }
        if days == 1 { return "Forfaller i morgen" }
        return "Forfaller om \(days) dager"
    }
}

/* ---------- 9b Klær ---------- */

struct Brief52Clothes: View {
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let items: [String] = JS.strings(d ?? [:], "items")
        VStack(alignment: .leading, spacing: 8) {
            Text("KLÆR I DAG").font(PF.mono(10)).tracking(1.2).foregroundStyle(Brief34C.rgb(0x2b5d8a))
            Text(JS.str(d, "text") ?? "Ingen data akkurat nå").font(PF.serif(26, medium: true)).foregroundStyle(Brief34C.rgb(0x1b2a40))
                .fixedSize(horizontal: false, vertical: true)
            if !items.isEmpty {
                HStack(spacing: 6) {
                    ForEach(items.prefix(4), id: \.self) { (x: String) in
                        Text(x).font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.rgb(0x1b2a40))
                            .padding(.horizontal, 12).frame(height: 30)
                            .background(Brief34C.card, in: Capsule())
                    }
                }
            }
            if let t = JS.num(d, "temp") {
                let f: Double? = JS.num(d, "feels")
                Text("\(Int(t.rounded()))°" + (f.map { " · føles som \(Int($0.rounded()))°" } ?? "")).font(PF.ui(12.5)).foregroundStyle(Brief34C.rgb(0x2b5d8a))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brief34C.rgb(0xdfe8f3), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/* ---------- 5b Nytt i kveld ---------- */

struct Brief52Tonight: View {
    @Environment(Store.self) private var store
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let items: [[String: Any]] = Array(JS.list(d, "items").prefix(4))
        Brief52Paper(title: c.title, kick: items.isEmpty ? "" : "\(items.count) NYE") {
            if d == nil { Brief52Empty(c: c) } else if items.isEmpty {
                Text("Ingenting nytt i kveld").font(PF.ui(13)).foregroundStyle(Brief34C.mut)
            }
            ForEach(Array(items.enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Button {
                    Haptic34.light()
                    Brief34Model.shared.close()
                    Media43.shared.show()
                } label: { row(pair.element) }
                .buttonStyle(.plain)
            }
        }
    }

    private func row(_ x: [String: Any]) -> some View {
        let kind: String = JS.str(x, "kind") ?? ""
        return VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                Image(systemName: kind == "movie" ? "film" : "tv").font(.system(size: 15, weight: .semibold)).foregroundStyle(Brief34C.mut)
                    .frame(width: 30, height: 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(JS.str(x, "title") ?? "").font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    if let s = JS.str(x, "subtitle") { Text(s).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).lineLimit(1) }
                }
                Spacer(minLength: 6)
                if let t = JS.str(x, "time") { Text(t).font(PF.mono(12)).foregroundStyle(Brief34C.mut) }
            }
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
    }
}

/* ---------- 6a Homelab (Start-knapp) ---------- */

struct Brief52Homelab: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief52Model { Brief52Model.shared }
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let services: [[String: Any]] = JS.list(d, "services")
        let down: Int = JS.int(d, "down") ?? services.filter { (JS.str($0, "state") ?? "") != "running" }.count
        let ok: Int = JS.int(d, "ok") ?? 0
        let shown: [[String: Any]] = Array(services.sorted { rank($0) < rank($1) }.prefix(5))
        Brief52Paper(title: c.title, kick: down > 0 ? "\(down) NEDE" : "\(ok) OK") {
            if d == nil { Brief52Empty(c: c) }
            ForEach(Array(shown.enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in row(pair.element) }
        }
    }

    private func rank(_ o: [String: Any]) -> Int {
        switch JS.str(o, "state") ?? "" {
        case "unhealthy": return 0
        case "exited": return 1
        default: return 2
        }
    }

    private func row(_ x: [String: Any]) -> some View {
        let id: String = JS.str(x, "id") ?? ""
        let state: String = JS.str(x, "state") ?? ""
        let can: Bool = (JS.bool(x, "can_start") ?? false) && state != "running"
        let busy: Bool = m.starting.contains(id)
        let note: String = m.startNote[id] ?? ""
        let dot: Color = state == "running" ? Brief34C.rgb(0x2f7a4f) : state == "unhealthy" ? Brief34C.rgb(0xe8794a) : Brief34C.red
        return VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                Circle().fill(dot).frame(width: 10, height: 10)
                VStack(alignment: .leading, spacing: 1) {
                    Text(JS.str(x, "name") ?? id).font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    Text(note.isEmpty ? label(state) : note).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                if can {
                    Button { Task { await m.start(id, store) } } label: {
                        Text(busy ? "Starter …" : (state == "unhealthy" ? "Start på nytt" : "Start")).font(PF.ui(12, .bold)).foregroundStyle(Brief34C.paper)
                            .padding(.horizontal, 12).frame(height: 30)
                            .background(Brief34C.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                    .accessibilityLabel("Start " + (JS.str(x, "name") ?? id))
                }
            }
            .frame(minHeight: 46)
        }
    }

    private func label(_ s: String) -> String {
        switch s {
        case "running": return "Kjører"
        case "unhealthy": return "Svarer ikke"
        case "exited": return "Stoppet"
        default: return s
        }
    }
}

/* ---------- 7a Domener ---------- */

struct Brief52Domains: View {
    @Environment(Store.self) private var store
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let items: [[String: Any]] = Array(JS.list(d, "items").prefix(4))
        let warn: Int = JS.int(d, "warn") ?? 0
        Brief52Paper(title: c.title, kick: warn > 0 ? "\(warn) TRENGER TILSYN" : "ALT OK") {
            if d == nil { Brief52Empty(c: c) }
            ForEach(Array(items.enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Button {
                    Haptic34.light()
                    Brief34Model.shared.close()
                    store.paperOpenDomains(from: "hjem")
                } label: { row(pair.element) }
                .buttonStyle(.plain)
            }
        }
    }

    private func row(_ x: [String: Any]) -> some View {
        let days: Int? = JS.int(x, "days")
        let ssl: Int? = JS.int(x, "ssl_days")
        let low: Int = Swift.min(days ?? 999, ssl ?? 999)
        let bad: Bool = low < 14
        let sub: String = [ssl.map { "SSL om \($0) dager" }, JS.str(x, "expires").map { "fornyes " + $0 }].compactMap { $0 }.joined(separator: " · ")
        return VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(JS.str(x, "name") ?? "").font(PF.mono(14)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    Text(sub).font(PF.ui(12.5, bad ? .bold : .regular)).foregroundStyle(bad ? Brief34C.red : Brief34C.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                if low < 999 { Text("\(low) d").font(PF.serif(22, medium: true)).foregroundStyle(bad ? Brief34C.red : Brief34C.ink) }
            }
            .frame(minHeight: 46)
            .contentShape(Rectangle())
        }
    }
}

/* ---------- 8b Aksjer ---------- */

struct Brief52Stocks: View {
    @Environment(Store.self) private var store
    let c: Brief52Card

    var body: some View {
        let d: [String: Any]? = c.data
        let items: [[String: Any]] = JS.list(d, "items")
        let top: [String: Any]? = items.max { abs(JS.num($0, "change_pct") ?? 0) < abs(JS.num($1, "change_pct") ?? 0) }
        let ch: Double = JS.num(top, "change_pct") ?? JS.num(d, "change_pct") ?? 0
        Button { Brief52Data.go(store, "aksjer") } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(top == nil ? "AKSJER" : "STØRST I GÅR").font(PF.mono(10)).tracking(1.2).foregroundStyle(Brief34C.mut)
                if d == nil {
                    Brief52Empty(c: c)
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(JS.str(top, "name") ?? JS.str(d, "value_text") ?? "Portefølje").font(PF.serif(26, medium: true)).foregroundStyle(Brief34C.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        Text(Brief52Data.pct(ch)).font(PF.serif(40)).foregroundStyle(ch >= 0 ? Brief34C.rgb(0x2f7a4f) : Brief34C.red).lineLimit(1).minimumScaleFactor(0.6)
                    }
                    Text(sub(d)).font(PF.ui(13)).foregroundStyle(Brief34C.mut).lineLimit(1)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func sub(_ d: [String: Any]?) -> String {
        var parts: [String] = []
        if let v = JS.str(d, "value_text") { parts.append("Porteføljen " + v) }
        if let p = JS.num(d, "change_pct") { parts.append(Brief52Data.pct(p) + " i går") }
        return parts.joined(separator: " · ")
    }
}
