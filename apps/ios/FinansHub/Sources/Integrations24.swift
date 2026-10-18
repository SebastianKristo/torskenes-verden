import SwiftUI

/* ---------------- Prompt 24: Innstillinger → Integrasjoner med alle oppsettene (GET /api/integrations) ----------------
   Hver integrasjon har status, felt som redigeres rett under raden (hemmelige verdier vises som «•••• lagret»),
   Test tilkobling og Fjern verdi. Hemmeligheter sendes til backend og lagres kryptert der, aldri i appen.
   Eldre server (404): Home Assistant-kortet fra prompt 23.
   ISO2: hver integrasjon har scope 'personal' (brukerens egne, for alle) eller 'server' (bare admin får dem).
   «Dine integrasjoner» vises først og «Server (administrator)» under. */

struct Int24Field: Identifiable, Hashable {
    var key: String
    var label: String
    var type: String
    var value: String?
    var saved: Bool
    var help: String

    var id: String { key }
    var secret: Bool { type == "secret" }

    init(_ o: [String: Any]) {
        key = JS.str(o, "key") ?? "value"
        label = JS.str(o, "label") ?? key
        type = JS.str(o, "type") ?? "text"
        value = JS.str(o, "value")
        saved = JS.bool(o, "saved") ?? (value != nil)
        help = JS.str(o, "help") ?? ""
    }

    var isSet: Bool { saved || !(value ?? "").isEmpty }

    var shown: String {
        if secret { return saved ? "•••• lagret" : "Ikke satt" }
        if let v = value, !v.isEmpty { return v }
        return "Ikke satt"
    }
}

struct Int24Item: Identifiable, Hashable {
    var id: String
    var name: String
    var group: String
    /// "personal", "server" eller "" (eldre server uten scope).
    var scope: String
    var status: String
    var fields: [Int24Field]
    var canTest: Bool
    var message: String

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? id
        group = JS.str(o, "group") ?? ""
        scope = JS.str(o, "scope") ?? ""
        status = JS.str(o, "status") ?? "missing"
        fields = JS.list(o, "fields").map { Int24Field($0) }
        canTest = JS.bool(o, "canTest") ?? false
        message = JS.str(o, "error") ?? JS.str(o, "message") ?? ""
    }

    var missing: [Int24Field] { fields.filter { !$0.isSet } }
    var personal: Bool { scope == "personal" }
}

@MainActor
@Observable
final class Int24Model {
    static let shared = Int24Model()
    static let fallbackNames: [String] = ["Home Assistant", "Google Kalender", "AI", "Trading 212", "Bank", "IMAP", "Entur", "Mybring", "PostNord",
                                          "ParcelsApp", "Cloudflare", "Finn", "MET", "Kart", "Ikoner", "Unsplash/Pexels"]

    var items: [Int24Item] = []
    var loaded: Bool = false
    /// 0 = ok, 403 = nektet (eldre server), 404 = eldre server, -1 = annen feil.
    var state: Int = 0
    var failText: String = ""
    /// Integrasjonen søket åpnet (rulles til og markeres).
    var focus: String? = nil
    /// «id|key» for feltet som redigeres, og utkastet.
    var editing: String? = nil
    var draft: String = ""
    var testing: String? = nil
    var saving: Bool = false

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/integrations", timeout: 20)
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var rows: [[String: Any]] = []
            if let list = any as? [Any] { rows = list.compactMap { $0 as? [String: Any] } } else { rows = JS.list(any as? [String: Any], "items") }
            items = rows.map { Int24Item($0) }
            state = 0
        } catch let e as APIError {
            state = (e.status == 403 || e.status == 404) ? e.status : -1
            failText = e.message
        } catch {
            state = -1
            failText = error.localizedDescription
        }
        loaded = true
    }

    func edit(_ it: Int24Item, _ f: Int24Field) {
        Haptics.shared.select()
        let k: String = it.id + "|" + f.key
        if editing == k { editing = nil; return }
        editing = k
        draft = f.secret ? "" : (f.value ?? "")
    }

    func save(_ it: Int24Item, _ f: Int24Field, _ store: Store) {
        let v: String = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if f.secret && v.isEmpty { editing = nil; return }
        saving = true
        let path: String = "/integrations/" + Int24Model.enc(it.id)
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "PUT", path, json: [f.key: v])
                store.flash(f.label + " er lagret")
                editing = nil
                await load(store)
            } catch {
                store.flash("Kunne ikke lagre: \(error.localizedDescription)")
            }
            saving = false
        }
    }

    func clear(_ it: Int24Item, _ f: Int24Field, _ store: Store) {
        let path: String = "/integrations/" + Int24Model.enc(it.id) + "/" + Int24Model.enc(f.key)
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "DELETE", path)
                store.flash(f.label + " er fjernet")
                editing = nil
                await load(store)
            } catch {
                store.flash("Kunne ikke fjerne: \(error.localizedDescription)")
            }
        }
    }

    func test(_ it: Int24Item, _ store: Store) {
        guard testing == nil else { return }
        testing = it.id
        Haptics.shared.tap()
        let path: String = "/integrations/" + Int24Model.enc(it.id) + "/test"
        Task { @MainActor in
            let started: Date = Date()
            do {
                let d: Data = try await store.api.callAt("/api", "POST", path, timeout: 30)
                let o: [String: Any] = JS.obj(d)
                let ok: Bool = JS.bool(o, "ok") ?? true
                let ms: Int = JS.int(o, "ms") ?? Int(Date().timeIntervalSince(started) * 1000)
                let msg: String = JS.str(o, "message") ?? JS.str(o, "error") ?? ""
                if ok {
                    store.flash("✓ " + it.name + " svarte på \(ms) ms" + (msg.isEmpty ? "" : " · " + msg))
                } else {
                    store.flash("Feil: " + (msg.isEmpty ? it.name + " svarte ikke" : msg))
                }
                await load(store)
            } catch {
                store.flash("Feil: \(error.localizedDescription)")
            }
            testing = nil
        }
    }

    static func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s }
}

struct PaperIntegrations24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Int24Model { Int24Model.shared }

    var body: some View {
        Group {
            if m.state == 404 {
                PaperIntegrations23()
            } else {
                list
            }
        }
        .task { await m.load(store) }
    }

    private var list: some View {
        ScrollViewReader { proxy in
            VStack(alignment: .leading, spacing: 4) {
                if m.state == 403 {
                    note("Serveren gir ikke denne kontoen egne integrasjoner ennå. Oppdater homelab.")
                } else if m.state == -1 {
                    note(m.failText.isEmpty ? "Fikk ikke kontakt med serveren." : m.failText)
                } else if !m.loaded {
                    PCard {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Henter integrasjonene …").font(PF.ui(13.5)).foregroundStyle(p.mut)
                        }
                    }
                }
                if hasScope {
                    if !personalItems.isEmpty {
                        header("Dine integrasjoner", "Bare du ser og bruker disse verdiene.")
                        ForEach(personalItems) { it in
                            Int24Group(item: it).set25Highlight(it.name, id: false).id(it.id)
                        }
                    }
                    if !serverItems.isEmpty {
                        header("Server (administrator)", "Felles oppsett for hele serveren.")
                        ForEach(serverItems) { it in
                            Int24Group(item: it).set25Highlight(it.name, id: false).id(it.id)
                        }
                    }
                } else {
                    ForEach(m.items) { it in
                        Int24Group(item: it).set25Highlight(it.name, id: false).id(it.id)
                    }
                }
                if !hasScope || !serverItems.isEmpty {
                    PLabel(text: "Synk med Home Assistant").padding(.leading, 4).padding(.top, 14)
                    TaskHASection22()
                }
            }
            .onAppear { scrollToFocus(proxy) }
            .onChange(of: m.items.count) { _, _ in scrollToFocus(proxy) }
        }
    }

    private var hasScope: Bool { m.items.contains { !$0.scope.isEmpty } }
    private var personalItems: [Int24Item] { m.items.filter { $0.personal } }
    private var serverItems: [Int24Item] { m.items.filter { !$0.personal } }

    private func header(_ title: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(PF.ui(18, .bold)).foregroundStyle(p.ink)
            Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut)
        }
        .padding(.leading, 4).padding(.top, 14)
    }

    private func scrollToFocus(_ proxy: ScrollViewProxy) {
        guard let f = m.focus else { return }
        let hit: Int24Item? = m.items.first { $0.id == f || $0.name.lowercased() == f }
        guard let hit else { return }
        withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(hit.id, anchor: .top) }
        m.focus = nil
    }

    private func note(_ s: String) -> some View {
        Text(s).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Én integrasjon: tittel i versaler, så Status, feltene (redigeres under raden) og Test tilkobling.
struct Int24Group: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let item: Int24Item
    @MainActor private var m: Int24Model { Int24Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            PLabel(text: item.name).padding(.leading, 4).padding(.top, 8)
            VStack(spacing: 0) {
                statusRow
                ForEach(item.fields) { f in
                    Rectangle().fill(p.line).frame(height: 1)
                    fieldRow(f)
                    if m.editing == item.id + "|" + f.key { editor(f) }
                }
                if item.canTest {
                    Rectangle().fill(p.line).frame(height: 1)
                    testRow
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private var statusValue: (String, Color) {
        switch item.status {
        case "ok": return ("Tilkoblet", p.pos)
        case "error": return ("Feil", p.lab)
        default: return ("Ikke koblet", p.mut)
        }
    }

    private var statusSub: String {
        if item.status == "error" && !item.message.isEmpty { return item.message }
        let miss: [Int24Field] = item.missing
        if miss.isEmpty { return "Alle felt er fylt ut" }
        return "Mangler " + miss.map { $0.label.lowercased() }.joined(separator: ", ")
    }

    private var statusRow: some View {
        let v: (String, Color) = statusValue
        return HStack(spacing: 12) {
            Image(systemName: Int24Group.icon(item.id)).font(.system(size: 15, weight: .semibold)).foregroundStyle(v.1 == p.mut ? p.lab : v.1)
                .frame(width: 34, height: 34)
                .background(p.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text("Status").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(statusSub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(v.0).font(PF.ui(13, .semibold)).foregroundStyle(v.1).lineLimit(1).fixedSize()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(minHeight: 56)
    }

    private func fieldRow(_ f: Int24Field) -> some View {
        Button { m.edit(item, f) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(f.label).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    if !f.help.isEmpty { Text(f.help).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(f.shown).font(PF.ui(13, .semibold)).foregroundStyle(f.isSet ? p.ink : p.lab).lineLimit(1).truncationMode(.middle)
                    .frame(maxWidth: 170, alignment: .trailing)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var draft: Binding<String> {
        Binding<String>(get: { m.draft }, set: { v in m.draft = v })
    }

    @ViewBuilder private func input(_ f: Int24Field) -> some View {
        if f.secret {
            SecureField("Lim inn ny verdi", text: draft)
        } else {
            TextField(f.type == "url" ? "https://" : "", text: draft)
                .keyboardType(f.type == "url" ? .URL : .default)
        }
    }

    private func editor(_ f: Int24Field) -> some View {
        VStack(spacing: 10) {
            input(f)
                .font(PF.mono(14.5, bold: false)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 14).frame(height: 46)
                .background(RoundedRectangle(cornerRadius: 14).fill(p.bg))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, lineWidth: 1))
            HStack(spacing: 8) {
                Bol24Button(title: "Avbryt", fg: p.ink, bg: Color.clear, border: p.line, height: 44) { m.editing = nil }
                Bol24Button(title: m.saving ? "Lagrer …" : "Lagre", fg: p.bg, bg: p.ink, border: nil, height: 44) { m.save(item, f, store) }
            }
            if f.isSet {
                Button { m.clear(item, f, store) } label: {
                    Text("Fjern verdi").font(PF.ui(13, .bold)).foregroundStyle(p.lab).frame(maxWidth: .infinity).frame(height: 36)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 16)
    }

    private var testRow: some View {
        Button { m.test(item, store) } label: {
            HStack {
                Text(m.testing == item.id ? "Tester …" : "Test tilkobling").font(PF.ui(15, .semibold)).foregroundStyle(p.lab)
                Spacer()
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(m.testing != nil)
    }

    static func icon(_ id: String) -> String {
        let k: String = id.lowercased()
        if k.contains("ha") || k.contains("home") { return "house" }
        if k.contains("google") || k.contains("cal") { return "calendar" }
        if k.contains("ai") || k.contains("gemini") || k.contains("groq") || k.contains("ollama") { return "sparkles" }
        if k.contains("t212") || k.contains("trading") { return "chart.line.uptrend.xyaxis" }
        if k.contains("bank") { return "building.columns" }
        if k.contains("imap") || k.contains("mail") { return "envelope" }
        if k.contains("entur") { return "tram" }
        if k.contains("bring") || k.contains("postnord") || k.contains("parcel") { return "shippingbox" }
        if k.contains("cloudflare") || k.contains("cf") { return "globe" }
        if k.contains("finn") { return "tag" }
        if k.contains("met") || k.contains("yr") { return "cloud.sun" }
        if k.contains("map") || k.contains("kart") { return "map" }
        if k.contains("icon") || k.contains("ikon") { return "square.grid.2x2" }
        if k.contains("unsplash") || k.contains("pexels") || k.contains("photo") { return "photo" }
        return "point.3.connected.trianglepath.dotted"
    }
}
