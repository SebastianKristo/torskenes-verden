import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): felles søk over alle moduler, med handlinger ----------------
 Server: GET /api/search51?q=&types=&limit= ($S/SERVER51-API.md, WEBX51 §1). Tom q → hurtighandlinger + nylige søk.
 Åpnes ved å dra Hjem langt ned (over 120 pt, Paper.swift → pull), Mer → «Søk i alt», ⌘K (iPad med tastatur) og
 finanshub://sok?q=…. Treff: tittel med uthevet treff, undertekst, beløp, standardhandling ved trykk, de andre i ⋯-menyen.
 Handlinger: open (rutes internt via link.route/ref eller type), http (samme API som modulen, med bekreftelse når serveren ber om det)
 og copy. Ruting: Feat51Links (også dyplenkene finanshub://planlegging, familiekalender, ikveld og sok). */

struct S51Action: Identifiable {
    let id: String
    let label: String
    let kind: String
    let method: String
    let url: String
    let body: [String: Any]?
    let value: String
    let confirm: String
    let destructive: Bool

    nonisolated static func parse(_ o: [String: Any]) -> S51Action {
        S51Action(id: JS.str(o, "id") ?? "open", label: JS.str(o, "label") ?? "Åpne", kind: JS.str(o, "kind") ?? "open",
                  method: (JS.str(o, "method") ?? "POST").uppercased(), url: JS.str(o, "url") ?? "", body: JS.dict(o, "body"),
                  value: JS.str(o, "value") ?? "", confirm: JS.str(o, "confirm") ?? "", destructive: JS.bool(o, "destructive") ?? false)
    }
}

struct S51Result: Identifiable {
    let id: String
    let type: String
    let typeLabel: String
    let icon: String
    let title: String
    let subtitle: String
    let amountText: String
    let match: [(Int, Int)]
    let route: String
    let ref: String
    let web: String
    let app: String
    let actions: [S51Action]
    let done: Bool

    nonisolated static func parse(_ o: [String: Any]) -> S51Result {
        let link: [String: Any]? = JS.dict(o, "link")
        let m: [(Int, Int)] = ((o["match"] as? [Any]) ?? []).compactMap { (v: Any) -> (Int, Int)? in
            guard let a = v as? [Any], a.count == 2, let s = (a[0] as? NSNumber)?.intValue, let e = (a[1] as? NSNumber)?.intValue else { return nil }
            return (s, e)
        }
        var amt: String = JS.str(o, "amountText") ?? ""
        if amt.isEmpty, let a = JS.num(o, "amount") { amt = F51.kr(a, 2) }
        return S51Result(id: JS.str(o, "id") ?? UUID().uuidString, type: JS.str(o, "type") ?? "page", typeLabel: JS.str(o, "typeLabel") ?? "",
                         icon: JS.str(o, "icon") ?? "", title: JS.str(o, "title") ?? "", subtitle: JS.str(o, "subtitle") ?? "", amountText: amt,
                         match: m, route: JS.str(link, "route") ?? "", ref: JS.str(link, "ref") ?? "", web: JS.str(link, "web") ?? "",
                         app: JS.str(link, "app") ?? "", actions: JS.list(o, "actions").map { S51Action.parse($0) }, done: JS.bool(o, "done") ?? false)
    }

    /// Ikonnavnene fra serveren → SF Symbols.
    var symbol: String {
        switch icon {
        case "check": return done ? "checkmark.circle.fill" : "checkmark.circle"
        case "cart": return "cart"
        case "list": return "list.bullet"
        case "calendar": return "calendar"
        case "car": return "car"
        case "receipt": return "doc.text"
        case "card": return "creditcard"
        case "pin": return "mappin.and.ellipse"
        case "person": return "person"
        case "box": return "shippingbox"
        case "book": return "graduationcap"
        case "chat": return "bubble.left"
        case "cake": return "gift"
        case "home": return "house"
        case "gear": return "gearshape"
        case "bolt": return "bolt"
        default: return "magnifyingglass"
        }
    }
}

@MainActor
@Observable
final class Search51 {
    static let shared = Search51()

    var open: Bool = false
    var q: String = ""
    var type: String = ""
    var results: [S51Result] = []
    var groups: [(String, String, Int)] = []
    var recent: [String] = []
    var engine: String = ""
    var busy: Bool = false
    var error: String = ""
    var toast: String = ""
    var confirm: (S51Result, S51Action)? = nil
    @ObservationIgnored private var armed: Bool = true
    @ObservationIgnored private var task: Task<Void, Never>? = nil
    @ObservationIgnored private var seq: Int = 0

    func show(_ text: String = "") {
        q = text
        type = ""
        Haptics.shared.tap()
        open = true
    }

    func close() {
        open = false
        task?.cancel()
    }

    /// Hjem: scroll-forskyvningen øverst (passiv, ingen gest). Langt drag ned (> 120 pt) åpner søket én gang.
    func pull(_ y: CGFloat, home: Bool) {
        guard home else { return }
        if y < 10 { armed = true; return }
        if y > 120 && armed && !open {
            armed = false
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            show()
        }
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    /// Søker 250 ms etter siste tastetrykk.
    func changed(_ store: Store) {
        task?.cancel()
        task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            await self.run(store)
        }
    }

    func run(_ store: Store) async {
        seq += 1
        let my: Int = seq
        busy = true
        defer { if my == seq { busy = false } }
        var path: String = "/api/search51?limit=30&q=" + (q.trimmingCharacters(in: .whitespaces).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")
        if !type.isEmpty { path += "&types=" + type }
        do {
            let d: Data = try await store.api.send51("GET", path, timeout: 15)
            guard my == seq else { return }
            let o: [String: Any] = JS.obj(d)
            results = JS.list(o, "results").map { S51Result.parse($0) }
            groups = JS.list(o, "groups").map { (JS.str($0, "type") ?? "", JS.str($0, "label") ?? "", JS.int($0, "count") ?? 0) }
            recent = JS.strings(o, "recent")
            engine = JS.str(o, "engine") ?? ""
            error = ""
        } catch {
            guard my == seq else { return }
            self.error = F51.err(error)
        }
    }

    func remember(_ store: Store) {
        let t: String = q.trimmingCharacters(in: .whitespaces)
        guard t.count >= 2 else { return }
        let a: API = store.api
        Task { _ = try? await a.send51("POST", "/api/search51/recent", json: ["q": t], timeout: 10) }
    }

    func clearRecent(_ store: Store) async {
        _ = try? await store.api.send51("DELETE", "/api/search51/recent", timeout: 10)
        recent = []
    }

    /// Trykk på treffet: standardhandlingen (første), ellers åpne.
    func tap(_ r: S51Result, _ store: Store) {
        if let a = r.actions.first { act(r, a, store) } else { openResult(r, store) }
    }

    func act(_ r: S51Result, _ a: S51Action, _ store: Store) {
        switch a.kind {
        case "copy":
            UIPasteboard.general.string = a.value.isEmpty ? r.title : a.value
            Haptics.shared.tick()
            flash("Kopiert")
        case "http":
            if !a.confirm.isEmpty && confirm == nil { confirm = (r, a); return }
            confirm = nil
            Task { await http(a, store) }
        default:
            openResult(r, store)
        }
    }

    private func http(_ a: S51Action, _ store: Store) async {
        guard a.url.hasPrefix("/") else { return }
        do {
            _ = try await store.api.send51(a.method, a.url, json: a.body, timeout: 20)
            Haptics.shared.tick()
            flash(a.label + " ✓")
            remember(store)
            await run(store)
        } catch {
            flash(F51.err(error))
        }
    }

    func openResult(_ r: S51Result, _ store: Store) {
        remember(store)
        close()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 400_000_000)
            Feat51Links.route(r, store)
        }
    }
}

/* ---------- Ruting (søk og dyplenker) ---------- */

@MainActor
enum Feat51Links {
    /// finanshub://planlegging[/fane], familiekalender[/oppgave], ikveld[/fane], sok?q=, tema, invitasjon (fra AppWidgets.openDeepLink).
    static func handle(_ page: String, _ sub: String, _ url: URL, _ store: Store) -> Bool {
        switch page {
        case "planlegging", "plan51", "plan", "sparemal":
            Plan51.shared.show(sub.isEmpty ? nil : sub)
        case "familiekalender", "famcal51", "famcal":
            FamCal51.shared.show(task: sub.isEmpty ? nil : sub)
        case "ikveld", "mediakveld", "kveld":
            Kveld51.shared.show(sub.isEmpty ? nil : sub)
        case "sok", "search", "sok51":
            let q: String = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "q" })?.value ?? ""
            Search51.shared.show(q)
        case "tema", "theme":
            Theme51.shared.sheet = true
        default:
            return false
        }
        return true
    }

    static func route(_ r: S51Result, _ store: Store) {
        let ref: String = r.ref
        switch r.type {
        case "task", "shopping", "list": store.paperGo("huske")
        case "event", "famtask": FamCal51.shared.show()
        case "receipt", "line":
            store.paperFinGo("kvitt")
            if !ref.isEmpty { store.selectedReceipt = ref }
        case "transaction":
            if let id = Int(ref) { store.openPaperTx(id) } else { store.paperGo("fliste") }
        case "place", "person": store.paperGo("familie")
        case "package": store.paperGo("sporing")
        case "study": Study44.shared.show()
        case "chat": Notify31.open(go: "chat", chatId: ref, store)
        case "birthday": store.paperGo("bursdag")
        default: page(key(r), store)
        }
    }

    /// Nøkkelen for page/action: link.app «papir://open?type=page&id=<nøkkel>», ellers ref eller route.
    private static func key(_ r: S51Result) -> String {
        if let c = URLComponents(string: r.app), let id = c.queryItems?.first(where: { $0.name == "id" })?.value, !id.isEmpty { return id }
        if !r.ref.isEmpty { return r.ref }
        return r.route
    }

    static func page(_ k: String, _ store: Store) {
        switch k {
        case "dash", "hjem": store.paperGo("hjem")
        case "gjoremal", "huske", "new-task", "shop": store.paperGo("huske")
        case "kalender": store.paperGo("kalender")
        case "familiekalender": FamCal51.shared.show()
        case "famcal-new": FamCal51.shared.show(add: true)
        case "invite", "inviter": Invite51.shared.show()
        case "familie": store.paperGo("familie")
        case "sjekk", "checkin", "pickup":
            store.paperGo("familie")
            FamilyModel.shared.tab = "hjemlys"
        case "media": Media43.shared.show()
        case "mediakveld": Kveld51.shared.show()
        case "vaer": store.weatherOpen = true
        case "sporing": store.paperGo("sporing")
        case "chat": store.paperGo("chat")
        case "studie": Study44.shared.show()
        case "bursdager": store.paperGo("bursdag")
        case "matplan": store.paperGo("mat")
        case "kart": Kart46.shared.show(store)
        case "finans": store.paperGo("finans")
        case "kvitteringer", "scan": store.paperFinGo("kvitt")
        case "planlegging": Plan51.shared.show()
        case "innstillinger": store.paperGo("innst")
        case "utseende", "theme": Theme51.shared.sheet = true
        case "sikkerhet": store.paperGo("innst-sik")
        default: store.paperGo("hjem")
        }
    }
}

/* ---------- Siden ---------- */

struct Search51Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Search51 { Search51.shared }
    @FocusState private var focus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            field.padding(.horizontal, 16).padding(.top, 12)
            if !m.groups.isEmpty { chips.padding(.top, 8) }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) { Search51List() }
                    .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 48)
                    .frame(maxWidth: 880).frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .overlay(alignment: .bottom) { if !m.toast.isEmpty { Logs44Toast(text: m.toast).allowsHitTesting(false) } }
        .task {
            await m.run(store)
            focus = true
        }
        .confirmationDialog(m.confirm?.1.confirm ?? "", isPresented: Binding<Bool>(get: { m.confirm != nil }, set: { if !$0 { m.confirm = nil } }), titleVisibility: .visible) {
            if let c = m.confirm {
                Button(c.1.label, role: c.1.destructive ? ButtonRole.destructive : nil) { m.act(c.0, c.1, store) }
            }
            Button("Avbryt", role: .cancel) { m.confirm = nil }
        }
    }

    private var field: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.mut).accessibilityHidden(true)
                TextField("Søk i gjøremål, kvitteringer, familie …", text: Binding<String>(get: { m.q }, set: { m.q = $0; m.changed(store) }))
                    .font(PF.ui(16)).foregroundStyle(p.ink)
                    .focused($focus)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .onSubmit {
                        m.remember(store)
                        if let r = m.results.first { m.tap(r, store) }
                    }
                if m.busy { ProgressView().controlSize(.small) }
                if !m.q.isEmpty {
                    Button { m.q = ""; m.changed(store) } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(p.mut).frame(width: 32, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Tøm søket")
                }
            }
            .padding(.horizontal, 14).frame(minHeight: 48)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            Button { m.close() } label: {
                Text("Lukk").font(PF.ui(14, .bold)).foregroundStyle(p.ink).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
        }
    }

    private var chips: some View {
        let tabs: [(String, String)] = [("", "Alle")] + m.groups.map { ($0.0, $0.1 + " \($0.2)") }
        return F51Tabs(tabs: tabs, sel: m.type) { (k: String) in
            m.type = k
            Task { await m.run(store) }
        }
    }
}

struct Search51List: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Search51 { Search51.shared }

    var body: some View {
        let empty: Bool = m.q.trimmingCharacters(in: .whitespaces).isEmpty
        if !m.error.isEmpty { F51Note(text: m.error, red: true) }
        if empty && !m.recent.isEmpty { recentRow }
        if !empty && m.results.isEmpty && !m.busy && m.error.isEmpty {
            F51Note(text: "Ingen treff på «\(m.q)».")
        }
        ForEach(sections, id: \.0) { (s: (String, [S51Result])) in
            PLabel(text: s.0, color: p.mut).padding(.top, 4)
            PCard(padding: 6) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(s.1) { (r: S51Result) in Search51Row(r: r) }
                }
            }
        }
        if !m.engine.isEmpty && !empty {
            Text(m.engine == "fts+vektor" ? "Søk: tekst og lokale embeddings" : "Søk: tekst").font(PF.ui(11.5)).foregroundStyle(p.mut)
        }
    }

    /// Gruppene i rekkefølgen serveren ga treffene (beste gruppe først).
    private var sections: [(String, [S51Result])] {
        var order: [String] = []
        var by: [String: [S51Result]] = [:]
        for r in m.results {
            let k: String = r.typeLabel.isEmpty ? r.type : r.typeLabel
            if by[k] == nil { order.append(k) }
            by[k, default: []].append(r)
        }
        return order.map { ($0, by[$0] ?? []) }
    }

    private var recentRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                PLabel(text: "Nylige søk", color: p.mut)
                Spacer()
                Button("Tøm") { Task { await m.clearRecent(store) } }.font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut).frame(minHeight: 44)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(m.recent, id: \.self) { (t: String) in
                        F51Btn(title: t, icon: "clock") { m.q = t; Task { await m.run(store) } }
                    }
                }
            }
        }
    }
}

struct Search51Row: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Search51 { Search51.shared }
    let r: S51Result

    var body: some View {
        HStack(spacing: 10) {
            Button { m.tap(r, store) } label: { main }
                .buttonStyle(.plain)
                .accessibilityHint(r.actions.first?.label ?? "Åpne")
            if r.actions.count > 1 || r.actions.first?.kind == "http" { menu }
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
    }

    private var main: some View {
        HStack(spacing: 12) {
            Image(systemName: r.symbol).font(.system(size: 16, weight: .semibold)).foregroundStyle(p.lab)
                .frame(width: 34, height: 34)
                .background(p.lab.opacity(0.1), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(Search51Row.highlight(r.title, r.match)).font(PF.ui(15)).foregroundStyle(p.ink).lineLimit(2)
                if !r.subtitle.isEmpty { Text(r.subtitle).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2) }
            }
            Spacer(minLength: 6)
            if !r.amountText.isEmpty { Text(r.amountText).font(PF.mono(12)).foregroundStyle(p.ink).lineLimit(1) }
        }
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }

    private var menu: some View {
        Menu {
            Button("Åpne") { m.openResult(r, store) }
            ForEach(r.actions) { (a: S51Action) in
                Button(a.label, role: a.destructive ? ButtonRole.destructive : nil) { m.act(r, a, store) }
            }
        } label: {
            Image(systemName: "ellipsis").font(.system(size: 15, weight: .bold)).foregroundStyle(p.ink).frame(width: 44, height: 44)
        }
        .accessibilityLabel("Handlinger for " + r.title)
    }

    /// Fet skrift på tegnene som traff (match = [[start, slutt]] i tittelen).
    nonisolated static func highlight(_ s: String, _ m: [(Int, Int)]) -> AttributedString {
        var a: AttributedString = AttributedString(s)
        let chars: [Character] = Array(s)
        for (st, en) in m {
            guard st >= 0, en > st, en <= chars.count else { continue }
            let lo: AttributedString.Index = a.index(a.startIndex, offsetByCharacters: st)
            let hi: AttributedString.Index = a.index(lo, offsetByCharacters: en - st)
            a[lo..<hi].inlinePresentationIntent = .stronglyEmphasized
        }
        return a
    }
}
