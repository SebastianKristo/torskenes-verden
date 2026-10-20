import SwiftUI
import UIKit

/* ---------------- Prompt 29: Hjem → søkefelt med valgfri søkemotor og Glimt (prompt 31: tidligere System-AI) ---------------- */
// Fasit: design/Mobil Papir App.dc.html → Hjem (hsVals) og prompts/prompt-29-pakke/claude-code-hjem-sok-ai.md.
// Ikonet til venstre (med ▾) åpner «SØK MED»: Glimt (standard), Google eller DuckDuckGo. Menyen er systemets Menu,
// så den tegnes over alle kortene. Valget lagres per bruker som search_engine i /api/me/layout (og lokalt).
// Timer gjenkjennes uansett søkemotor (POST /api/kalender/quick/parse): et mørkt forslag «Legg i kalender» under feltet,
// og ↵ legger timen til i bakgrunnen (Quick29Model). Ellers: Glimt → svarboble (prompt 31), Google/DuckDuckGo → nettleseren.
// ✦ AI til høyre åpner alltid Chat.

struct Search29Engine: Identifiable {
    let id: String
    let name: String
    let sub: String
    let placeholder: String
    let icon: String

    static let all: [Search29Engine] = [
        // Prompt 31: AI-agenten heter Glimt, og svaret vises i en boble under feltet (Assist31.swift).
        Search29Engine(id: "ai", name: "Glimt", sub: "Svarer i Chat og legger til timer", placeholder: "Spør om været, eller skriv «time hos …»", icon: "sparkles"),
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
        // Prompt 36: spørsmål med dato er ikke en avtale – ingen «Legg i kalender» (Assist36.swift).
        if Assist36.blocksAppt(t) { parseTask?.cancel(); appt = nil; return }
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
        // Prompt 32: alle søk logges for brukeren (vises bare på web), og snarveier til sider åpnes med en gang (Search32.swift).
        Search32b.shared.log(t, engine: engine, store)
        if Search32b.shared.tryShortcut(t, engine: engine, store) { appt = nil; return }
        let question36: Bool = Assist36.blocksAppt(t)
        var isTime: Bool = appt != nil && !question36
        if !isTime && !question36 && t.count > 4 {
            let pv: Quick29Preview? = await Quick29Model.shared.parse(t, store)
            isTime = Search29Model.isAppt(pv)
        }
        appt = nil
        if isTime {
            Quick29Model.shared.submit(t, store)
            return
        }
        // Prompt 41: huskebeskjeder («vi må huske å …») går til Huskeliste via Glimt (Tasks41Glimt.swift).
        if !question36 && Tasks41Glimt.isHuske(t) {
            Tasks41Glimt.shared.fromHome(t, store)
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
            // Prompt 31: svarboble under feltet via POST /api/assist (eldre server: Chat som før).
            // Prompt 32: tar svaret lengre enn hs_timeout_s, fortsetter jobben i Chat (Search32.swift).
            // Prompt 36: dagslys / soloppgang / solnedgang for en dato besvares lokalt (Assist36.swift).
            if let local = Assist36.localAnswer(t, store) {
                Assist31.shared.showLocal36(t, local)
                return
            }
            if Assist31.shared.missing { store.openChat(prompt: t) } else { Search32b.shared.askHome(t, store) }
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
            } else if Tasks41Glimt.isHuske(q) {
                // Prompt 41: «Legg i Huskeliste» (Glimt deler opp i punkter).
                HomeSearch41Huske(text: q.trimmingCharacters(in: .whitespacesAndNewlines)) { submit() }
                    .transition(.opacity)
            }
            if Assist31.shared.homeOpen {
                Assist31Bubble()
                    .transition(.scale(scale: 0.96, anchor: .top).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.15), value: m.appt)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: Assist31.shared.homeOpen)
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
        if !v.isEmpty && Assist31.shared.homeAnswer != nil { Assist31.shared.closeHome() }
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

/// Ikonet til venstre med ▾: «SØK MED» som popover (tegnes over alle kortene). Prompt 31: ekte logoer (assets, ikke tint),
/// hake til høyre for valgt motor – haken erstatter aldri logoen (claude-code-sokemotor-logoer.md).
struct HomeSearch29Menu: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Search29Model { Search29Model.shared }
    @State private var open: Bool = false

    var body: some View {
        Button {
            Haptics.shared.select()
            open = true
        } label: {
            HStack(spacing: 3) {
                HomeSearch29EngineIcon(engine: m.engine, size: 20)
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(p.mut)
            }
            .padding(.leading, 8).padding(.trailing, 6).frame(height: 34)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Velg søkemotor")
        .popover(isPresented: $open, attachmentAnchor: .rect(.bounds), arrowEdge: .top) {
            Search31EngineList { (id: String) in
                m.set(id, store)
                open = false
            }
            .environment(\.paper, p)
            .presentationCompactAdaptation(.popover)
        }
    }
}

/// Logoen for valgt motor: Glimt-merket, Google-G eller DuckDuckGo-anda.
struct HomeSearch29EngineIcon: View {
    let engine: String
    var size: CGFloat = 20

    var body: some View {
        if engine == "google" {
            Image("search-google").renderingMode(.original).resizable().scaledToFit()
                .frame(width: size - 2, height: size - 2)
                .frame(width: size, height: size)
        } else if engine == "ddg" {
            Image("search-duckduckgo").renderingMode(.original).resizable().scaledToFit()
                .frame(width: size, height: size)
        } else {
            Glimt31Mark(size: size + 2, state: Assist31.shared.homeBusy ? .thinking : .ready)
        }
    }
}

/// «SØK MED»: logo (22) · navn + undertekst · hake (lab, 16) til høyre.
struct Search31EngineList: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Search29Model { Search29Model.shared }
    let pick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("SØK MED").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 6)
            ForEach(Array(Search29Engine.all.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Search29Engine)) in
                Search31EngineRow(e: pair.element, on: m.engine == pair.element.id, first: pair.offset == 0) { pick(pair.element.id) }
            }
        }
        .padding(.bottom, 4)
        .frame(width: 280)
        .background(p.card)
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }
}

struct Search31EngineRow: View {
    @Environment(\.paper) private var p
    let e: Search29Engine
    let on: Bool
    let first: Bool
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 12) {
                if e.id == "ai" {
                    Glimt31Badge(size: 22)
                } else {
                    HomeSearch29EngineIcon(engine: e.id, size: 22)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text(e.sub).font(PF.ui(12)).foregroundStyle(p.mut)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(p.lab)
                    .frame(width: 16, height: 16)
                    .opacity(on ? 1 : 0)
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .frame(minHeight: 54)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
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
