import SwiftUI
import UIKit

/* ---------------- Prompt 29: Hjem → søkefelt med valgfri søkemotor og System-AI ---------------- */
// Fasit: design/Mobil Papir App.dc.html → Hjem (hsVals) og prompts/prompt-29-pakke/claude-code-hjem-sok-ai.md.
// Ikonet til venstre (med ▾) åpner «SØK MED»: System-AI (standard), Google eller DuckDuckGo. Menyen er systemets Menu,
// så den tegnes over alle kortene. Valget lagres per bruker som search_engine i /api/me/layout (og lokalt).
// Timer gjenkjennes uansett søkemotor (POST /api/kalender/quick/parse): et mørkt forslag «Legg i kalender» under feltet,
// og ↵ legger timen til i bakgrunnen (Quick29Model). Ellers: System-AI → ny samtale i Chat, Google/DuckDuckGo → nettleseren.
// ✦ AI til høyre åpner alltid Chat.

struct Search29Engine: Identifiable {
    let id: String
    let name: String
    let sub: String
    let placeholder: String
    let icon: String

    static let all: [Search29Engine] = [
        Search29Engine(id: "ai", name: "System-AI", sub: "Svarer i Chat og legger til timer", placeholder: "Spør AI eller skriv «time hos …»", icon: "sparkles"),
        Search29Engine(id: "google", name: "Google", sub: "Åpner google.com", placeholder: "Søk på Google", icon: "g.circle"),
        Search29Engine(id: "ddg", name: "DuckDuckGo", sub: "Åpner duckduckgo.com", placeholder: "Søk med DuckDuckGo", icon: "d.circle"),
    ]

    static func of(_ id: String) -> Search29Engine { all.first(where: { $0.id == id }) ?? all[0] }
}

@MainActor
@Observable
final class Search29Model {
    static let shared = Search29Model()

    var engine: String = "ai"
    /// Gjenkjent time i feltet (nil = ingen).
    var appt: Quick29Preview? = nil

    @ObservationIgnored private var loadedFor: String = ""
    @ObservationIgnored private var parseTask: Task<Void, Never>? = nil

    private var localKey: String { AcctScope.key("fh_search29") }

    func boot(_ store: Store) async {
        if let v = UserDefaults.standard.string(forKey: localKey), Search29Model.valid(v) { engine = v }
        let acct: String = store.account?.id ?? ""
        if loadedFor == acct { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/me/layout", timeout: 10) else { return }
        loadedFor = acct
        let o: [String: Any] = JS.obj(d)
        let lay: [String: Any] = JS.dict(o, "layout") ?? o
        if let v = JS.str(lay, "search_engine"), Search29Model.valid(v) {
            engine = v
            UserDefaults.standard.set(v, forKey: localKey)
        }
    }

    nonisolated static func valid(_ v: String) -> Bool { v == "ai" || v == "google" || v == "ddg" }

    func set(_ v: String, _ store: Store) {
        guard Search29Model.valid(v) else { return }
        engine = v
        Haptics.shared.select()
        UserDefaults.standard.set(v, forKey: localKey)
        let a: API = store.api
        Task { _ = try? await a.callAt("/api", "PUT", "/me/layout", json: ["search_engine": v]) }
    }

    /// Tolker teksten med 250 ms pause; viser forslaget når det er en time (dato + intensjon).
    func changed(_ q: String, _ store: Store) {
        parseTask?.cancel()
        let t: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count <= 4 { appt = nil; return }
        parseTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            let pv: Quick29Preview? = await Quick29Model.shared.parse(t, store)
            if Task.isCancelled { return }
            self.appt = Search29Model.isAppt(pv) ? pv : nil
        }
    }

    nonisolated static func isAppt(_ pv: Quick29Preview?) -> Bool {
        guard let pv else { return false }
        return pv.ok && pv.isAppointment && !pv.date.isEmpty
    }

    func clear() {
        parseTask?.cancel()
        appt = nil
    }

    /// ↵ / «Gå»: time → bakgrunnen; ellers etter søkemotoren.
    func go(_ raw: String, _ store: Store) async {
        let t: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        parseTask?.cancel()
        var isTime: Bool = appt != nil
        if !isTime && t.count > 4 {
            let pv: Quick29Preview? = await Quick29Model.shared.parse(t, store)
            isTime = Search29Model.isAppt(pv)
        }
        appt = nil
        if isTime {
            Quick29Model.shared.submit(t, store)
            return
        }
        switch engine {
        case "google":
            store.openURL(store.googleURL(t))
        case "ddg":
            let enc: String = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
            store.openURL(URL(string: "https://duckduckgo.com/?q=" + enc))
        default:
            store.suggestions = []
            store.openChat(prompt: t)
        }
    }
}

/// Søkefeltet på Hjem (erstatter «Søk på Google» fra PaperPages.swift).
struct HomeSearch29: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var q: String = ""
    @FocusState private var focused: Bool
    @MainActor private var m: Search29Model { Search29Model.shared }

    var body: some View {
        VStack(spacing: 6) {
            card
            if let a = m.appt, !q.trimmingCharacters(in: .whitespaces).isEmpty {
                HomeSearch29Appt(appt: a) { submit() }
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.15), value: m.appt)
        .task(id: store.account?.id ?? "") { await m.boot(store) }
    }

    private var showSuggest: Bool { m.engine != "ai" && focused }

    private var card: some View {
        let empty: Bool = q.trimmingCharacters(in: .whitespaces).isEmpty
        let items: [String] = empty ? Array(store.history.prefix(5)) : Array(store.suggestions.prefix(6))
        return VStack(spacing: 0) {
            row
            if showSuggest && !items.isEmpty {
                Rectangle().fill(p.line).frame(height: 1)
                ForEach(items, id: \.self) { s in suggestRow(s, empty) }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 23, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 15, y: 10)
        .animation(.easeOut(duration: 0.15), value: focused)
    }

    private var row: some View {
        let e: Search29Engine = Search29Engine.of(m.engine)
        return HStack(spacing: 8) {
            HomeSearch29Menu()
            TextField(e.placeholder, text: $q)
                .font(PF.ui(14.5, .medium))
                .foregroundStyle(p.ink)
                .keyboardType(m.engine == "ai" ? .default : .webSearch)
                .textInputAutocapitalization(m.engine == "ai" ? .sentences : .never)
                .autocorrectionDisabled(m.engine != "ai")
                .submitLabel(.go)
                .focused($focused)
                .onSubmit { submit() }
                .onChange(of: q) { _, v in changed(v) }
            if !q.isEmpty {
                SearchClear27 { clearField() }
            }
            Button { askAi() } label: {
                Text("✦ AI").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                    .padding(.horizontal, 12).frame(height: 34)
                    .background(p.bg, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Åpne Chat")
        }
        .padding(.leading, 6).padding(.trailing, 6).frame(height: 46)
    }

    private func suggestRow(_ s: String, _ empty: Bool) -> some View {
        Button { q = s; submit() } label: {
            HStack(spacing: 10) {
                Image(systemName: empty ? "clock.arrow.circlepath" : "magnifyingglass").font(.system(size: 13)).foregroundStyle(p.mut)
                Text(s).font(PF.ui(14)).foregroundStyle(p.ink).lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func changed(_ v: String) {
        if m.engine != "ai" { store.suggest(v) }
        m.changed(v, store)
    }

    private func clearField() {
        q = ""
        store.suggestions = []
        m.clear()
    }

    private func submit() {
        let t: String = q
        if t.trimmingCharacters(in: .whitespaces).isEmpty { return }
        focused = false
        q = ""
        store.suggestions = []
        Task { await m.go(t, store) }
    }

    private func askAi() {
        Haptics.shared.tap()
        focused = false
        store.suggestions = []
        m.clear()
        let t: String = q
        q = ""
        store.openChat(prompt: t)
    }
}

/// Ikonet til venstre med ▾: systemets Menu «SØK MED» (over alle kortene).
struct HomeSearch29Menu: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Search29Model { Search29Model.shared }

    var body: some View {
        Menu {
            Section("Søk med") {
                ForEach(Search29Engine.all) { e in
                    Button { m.set(e.id, store) } label: {
                        Label {
                            Text(e.name)
                            Text(e.sub)
                        } icon: {
                            Image(systemName: m.engine == e.id ? "checkmark" : e.icon)
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 3) {
                HomeSearch29EngineIcon(engine: m.engine)
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(p.mut)
            }
            .padding(.leading, 8).padding(.trailing, 6).frame(height: 34)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Velg søkemotor")
    }
}

struct HomeSearch29EngineIcon: View {
    @Environment(\.paper) private var p
    let engine: String

    var body: some View {
        if engine == "google" {
            GoogleG(size: 18)
        } else if engine == "ddg" {
            Text("D").font(PF.ui(11, .heavy)).foregroundStyle(Color.white)
                .frame(width: 20, height: 20)
                .background(Color(hex: "#de5833"), in: Circle())
        } else {
            Text("✦").font(PF.ui(11, .bold)).foregroundStyle(Color.white)
                .frame(width: 20, height: 20)
                .background(p.lab, in: Circle())
        }
    }
}

/// Mørkt forslag under feltet: kalender-ikon · «Nina frisør» · «fre 25. sep · 14:30» · Legg i kalender.
struct HomeSearch29Appt: View {
    @Environment(\.paper) private var p
    let appt: Quick29Preview
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 10) {
                Image(systemName: "calendar").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.bg)
                VStack(alignment: .leading, spacing: 0) {
                    Text(appt.title.isEmpty ? "Avtale" : appt.title).font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).lineLimit(1)
                    Text(appt.shortLabel).font(PF.ui(12)).foregroundStyle(p.bg.opacity(0.8)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("Legg i kalender").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(p.bg, in: Capsule())
            }
            .padding(.leading, 14).padding(.trailing, 8).padding(.vertical, 6)
            .frame(minHeight: 44)
            .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Legg i kalender: \(appt.title), \(appt.shortLabel)")
    }
}
