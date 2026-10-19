import SwiftUI
import UIKit

/* ---------------- Prompt 30: oppdater Homelab fra appen (banner på Hjem og i Innstillinger) ---------------- */
// Fasit: design/Mobil Papir App.dc.html → Hjem (øverst) og Innstillinger (øverst + gruppe PROGRAMVARE),
// prompts/prompt-30-pakke/claude-code-oppdatering-mobil.md. Bare admin.
// API (SERVER30):
//   GET  /api/system/version          → {current, latest, notes[], publishedAt, updateAvailable}
//   GET  /api/system/update           → {available, installed, latest, status:{id, state, step, error, steps[], pct}, running}
//   POST /api/system/update/start     {password}   (app-token + passord)
//   POST /api/system/update/rollback  {password}
//   GET/PUT /api/system/update/settings {auto_update, notify_updates}
// Fremdrift: polling hvert 1,5 s. Mister appen forbindelsen (omstart), vises «Starter tjenestene på nytt …» og den prøver
// i opptil 2 min. «Oppdater i nettleseren» er beholdt som sekundær lenke (Update28Page).

@MainActor
@Observable
final class Update30Model {
    static let shared = Update30Model()

    enum Phase { case idle, avail, run, done, failed }

    struct Step: Identifiable {
        let key: String
        let name: String
        var state: String
        var id: String { key }
    }

    var phase: Phase = .idle
    var current: String = ""
    var latest: String = ""
    var notes: [String] = []
    /// Updateren er satt opp på serveren (heartbeat).
    var updaterReady: Bool = true
    var pct: Int = 0
    var steps: [Step] = Update30Model.defaultSteps()
    var error: String = ""
    /// Forbindelsen er borte mens tjenestene starter på nytt.
    var reconnecting: Bool = false
    var autoUpdate: Bool = false
    var notifyUpdates: Bool = true
    var settingsLoaded: Bool = false
    var showNotes: Bool = false
    /// Passordarket: «update» eller «rollback».
    var askAction: String? = nil
    var busy: Bool = false
    var askError: String = ""
    var hideAt: Double = UserDefaults.standard.double(forKey: Update30Model.hideKey)

    @ObservationIgnored private var loadedAt: Date = .distantPast
    @ObservationIgnored private var poll: Task<Void, Never>? = nil
    @ObservationIgnored private var jobId: String = ""
    @ObservationIgnored private var lostSince: Date? = nil
    @ObservationIgnored private var fromVersion: String = ""

    private static var hideKey: String { AcctScope.key("upd30_hide") }

    static func defaultSteps() -> [Step] {
        [
            Step(key: "download", name: "Laster ned", state: "pending"),
            Step(key: "backup", name: "Tar backup før oppdatering", state: "pending"),
            Step(key: "install", name: "Installerer på hjemmeserveren", state: "pending"),
            Step(key: "restart", name: "Starter tjenestene på nytt", state: "pending"),
        ]
    }

    /* ---------- Visning ---------- */

    /// Skjult på Hjem i 24 t etter ✕ (bare i tilstanden «Tilgjengelig»).
    var hiddenOnHome: Bool { Date().timeIntervalSince1970 - hideAt < 86_400 }

    func showOnHome(_ store: Store) -> Bool {
        guard Update28Model.isAdmin(store) else { return false }
        switch phase {
        case .run, .done, .failed: return true
        case .avail: return notifyUpdates && !hiddenOnHome
        case .idle: return false
        }
    }

    func showInSettings(_ store: Store) -> Bool {
        Update28Model.isAdmin(store) && phase != .idle
    }

    var title: String {
        switch phase {
        case .done: return "Oppdatert til " + (latest.isEmpty ? current : latest)
        case .run: return "Oppdaterer Homelab"
        case .failed: return "Oppdateringen feilet"
        default: return "Ny versjon " + latest
        }
    }

    var subtitle: String {
        switch phase {
        case .done: return "Alt kjører. Endringene er aktive i appen og på web."
        case .run: return reconnecting ? "Starter tjenestene på nytt …" : "Du kan bruke appen mens den oppdateres."
        case .failed: return error.isEmpty ? "Noe gikk galt under oppdateringen." : error
        default:
            let you: String = current.isEmpty ? "" : "Du har \(current). "
            return you + "Oppdaterer hjemmeserveren, web og appen."
        }
    }

    var stepText: String {
        if reconnecting { return "Starter tjenestene på nytt …" }
        if let s = steps.first(where: { $0.state == "active" || $0.state == "running" }) { return s.name + " …" }
        if let s = steps.last(where: { $0.state == "done" }) { return s.name }
        return "Laster ned " + latest + " …"
    }

    /// «Homelab 2.3.1» / «Ny versjon 2.4.0 er klar» i PROGRAMVARE.
    var versionRow: (String, String) {
        let name: String = "Homelab " + (current.isEmpty ? "–" : current)
        if phase == .avail || phase == .failed { return (name, "Ny versjon \(latest) er klar") }
        if phase == .run { return (name, "Oppdaterer til \(latest) …") }
        return (name, "Siste versjon")
    }

    func hideOnHome() {
        let t: Double = Date().timeIntervalSince1970
        hideAt = t
        UserDefaults.standard.set(t, forKey: Update30Model.hideKey)
    }

    /* ---------- Lasting ---------- */

    func load(_ store: Store, force: Bool = false) async {
        guard Update28Model.isAdmin(store) else { return }
        if !force && Date().timeIntervalSince(loadedAt) < 300 { return }
        loadedAt = Date()
        await loadVersion(store)
        await loadStatus(store)
        if !settingsLoaded { await loadSettings(store) }
    }

    private func loadVersion(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/system/version") else { return }
        let o: [String: Any] = JS.obj(d)
        current = Update30Model.ver(o["current"]) ?? current
        latest = Update30Model.ver(o["latest"]) ?? latest
        let n: [String] = JS.strings(o, "notes")
        if !n.isEmpty { notes = Array(n.prefix(12)) }
        let avail: Bool = JS.bool(o, "updateAvailable") ?? false
        if phase == .idle || phase == .avail { phase = avail ? .avail : .idle }
    }

    /// Eldre form: GET /api/system/update (installed/latest/changes/status).
    private func loadStatus(_ store: Store) async {
        guard let d = try? await store.api.raw("/api", "/system/update") else { return }
        let o: [String: Any] = JS.obj(d)
        updaterReady = JS.bool(o, "available") ?? updaterReady
        if current.isEmpty { current = Update30Model.ver(o["installed"]) ?? "" }
        if latest.isEmpty { latest = Update30Model.ver(o["latest"]) ?? "" }
        if notes.isEmpty {
            let ch: [[String: Any]] = JS.list(o, "changes")
            notes = Array(ch.flatMap { JS.strings($0, "items") }.prefix(12))
        }
        let running: Bool = JS.bool(o, "running") ?? false
        let st: [String: Any] = JS.dict(o, "status") ?? [:]
        if running && phase != .run {
            phase = .run
            jobId = JS.str(st, "id") ?? ""
            apply(st)
            startPolling(store)
        } else if phase == .idle, (JS.bool(o, "updateAvailable") ?? false) {
            phase = .avail
        }
    }

    func loadSettings(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/system/update/settings") else { return }
        let o: [String: Any] = JS.obj(d)
        let s: [String: Any] = JS.dict(o, "settings") ?? o
        autoUpdate = JS.bool(s, "auto_update") ?? false
        notifyUpdates = JS.bool(s, "notify_updates") ?? true
        settingsLoaded = true
    }

    func setSetting(_ key: String, _ on: Bool, _ store: Store) {
        Haptics.shared.select()
        if key == "auto_update" { autoUpdate = on } else { notifyUpdates = on }
        let body: [String: Any] = [key: on]
        Task {
            do { _ = try await store.api.callAt("/api", "PUT", "/system/update/settings", json: body) } catch {
                store.flash("Kunne ikke lagre innstillingen")
            }
        }
    }

    private static func ver(_ any: Any?) -> String? {
        if let s = any as? String, !s.isEmpty { return s }
        if let o = any as? [String: Any], let v = o["version"] as? String, !v.isEmpty { return v }
        return nil
    }

    /* ---------- Start, rollback og fremdrift ---------- */

    func ask(_ action: String) {
        Haptics.shared.tap()
        askError = ""
        askAction = action
    }

    func confirm(_ password: String, _ store: Store) async {
        guard let action = askAction, !busy else { return }
        if password.isEmpty { askError = "Skriv passordet ditt"; return }
        busy = true
        defer { busy = false }
        let path: String = action == "rollback" ? "/system/update/rollback" : "/system/update/start"
        do {
            let d: Data = try await store.api.callAt("/api", "POST", path, json: ["password": password], timeout: 60)
            let o: [String: Any] = JS.obj(d)
            jobId = JS.str(o, "id") ?? ""
            fromVersion = current
            askAction = nil
            error = ""
            pct = 0
            steps = Update30Model.defaultSteps()
            showNotes = false
            withAnimation(.easeOut(duration: 0.2)) { phase = .run }
            startPolling(store)
        } catch let e as APIError {
            askError = e.message.isEmpty ? "Kunne ikke starte (\(e.status))" : e.message
            Haptics.shared.error()
        } catch {
            askError = error.localizedDescription
            Haptics.shared.error()
        }
    }

    private func startPolling(_ store: Store) {
        poll?.cancel()
        lostSince = nil
        poll = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(1500))
                guard let self else { return }
                let finished: Bool = await self.tick(store)
                if finished { return }
            }
        }
    }

    /// Ett statuskall. true = ferdig (eller gitt opp).
    private func tick(_ store: Store) async -> Bool {
        do {
            let d: Data = try await store.api.raw("/api", "/system/update")
            let o: [String: Any] = JS.obj(d)
            lostSince = nil
            reconnecting = false
            let st: [String: Any] = JS.dict(o, "status") ?? [:]
            let id: String = JS.str(st, "id") ?? ""
            if !jobId.isEmpty && !id.isEmpty && id != jobId {
                // Updateren har ikke plukket opp forespørselen ennå.
                return false
            }
            apply(st)
            let state: String = JS.str(st, "state") ?? "idle"
            if state == "done" {
                if let v = Update30Model.ver(o["installed"]) { current = v }
                finish(ok: true, store)
                return true
            }
            if state == "failed" {
                error = JS.str(st, "error") ?? JS.str(st, "step") ?? ""
                finish(ok: false, store)
                return true
            }
            return false
        } catch let e as APIError where e.status >= 400 && e.status != 502 && e.status != 503 && e.status != 504 {
            error = e.message
            finish(ok: false, store)
            return true
        } catch {
            // Serveren starter på nytt: prøv igjen i opptil 2 minutter.
            let since: Date = lostSince ?? Date()
            lostSince = since
            reconnecting = true
            markRestarting()
            if Date().timeIntervalSince(since) > 120 {
                reconnecting = false
                self.error = "Fikk ikke kontakt med serveren etter omstart. Sjekk den, eller prøv igjen."
                finish(ok: false, store)
                return true
            }
            return false
        }
    }

    private func finish(ok: Bool, _ store: Store) {
        poll = nil
        reconnecting = false
        if ok {
            pct = 100
            steps = steps.map { (s: Step) -> Step in Step(key: s.key, name: s.name, state: "done") }
            withAnimation(.easeOut(duration: 0.2)) { phase = .done }
            Haptic30.double()
            Task { await self.loadVersion(store) }
        } else {
            withAnimation(.easeOut(duration: 0.2)) { phase = .failed }
            Haptics.shared.error()
        }
    }

    /// «Ferdig» i banneret: tilbake til vanlig visning («Siste versjon ✓»).
    func acknowledge() {
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) { phase = .idle }
    }

    private func markRestarting() {
        if pct < 85 { pct = 85 }
        steps = steps.map { (s: Step) -> Step in
            Step(key: s.key, name: s.name, state: s.key == "restart" ? "active" : "done")
        }
    }

    /// status.steps/pct fra SERVER30, ellers grove anslag fra state.
    private func apply(_ st: [String: Any]) {
        let list: [[String: Any]] = JS.list(st, "steps")
        if !list.isEmpty {
            var next: [Step] = Update30Model.defaultSteps()
            for i in next.indices {
                if let m = list.first(where: { JS.str($0, "key") == next[i].key }) {
                    next[i].state = JS.str(m, "state") ?? "pending"
                }
            }
            steps = next
        } else {
            steps = Update30Model.guess(JS.str(st, "state") ?? "")
        }
        if let p = JS.int(st, "pct") {
            pct = Swift.max(0, Swift.min(100, p))
        } else {
            pct = Update30Model.guessPct(JS.str(st, "state") ?? "")
        }
    }

    private static func guess(_ state: String) -> [Step] {
        var s: [Step] = defaultSteps()
        let active: Int
        switch state {
        case "downloading": active = 0
        case "building": active = 2
        case "restarting": active = 3
        case "done": active = 4
        default: active = 0
        }
        for i in s.indices {
            // Backup tas av serveren før forespørselen skrives, så den er alltid ferdig når updateren jobber.
            if i < active || (i == 1 && active >= 0 && state != "") { s[i].state = "done" }
            else if i == active { s[i].state = "active" }
        }
        if state.isEmpty || state == "idle" { s[0].state = "active" }
        return s
    }

    private static func guessPct(_ state: String) -> Int {
        switch state {
        case "downloading": return 15
        case "building": return 60
        case "restarting": return 88
        case "done": return 100
        default: return 3
        }
    }
}

/* ---------- Banneret ---------- */

struct Update30Banner: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Update30Model { Update30Model.shared }
    /// true = Hjem (✕ skjuler i 24 t), false = Innstillinger (kan ikke skjules).
    let home: Bool

    var body: some View {
        let show: Bool = home ? m.showOnHome(store) : m.showInSettings(store)
        if show {
            VStack(alignment: .leading, spacing: 12) {
                Update30Head(home: home)
                if m.phase == .run { Update30Progress() }
                if m.phase == .avail && m.showNotes { Update30Notes() }
                Update30Actions()
            }
            .padding(.leading, 16).padding(.trailing, 14).padding(.vertical, 14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color.black.opacity(0.35), radius: 15, x: 0, y: 10)
            .transition(.opacity)
        }
    }
}

struct Update30Head: View {
    @Environment(\.paper) private var p
    @Environment(Store.self) private var store
    @MainActor private var m: Update30Model { Update30Model.shared }
    let home: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: icon).font(.system(size: 16, weight: .bold)).foregroundStyle(p.onLab)
                .frame(width: 40, height: 40)
                .background(p.lab, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(m.title).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                Text(m.subtitle).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if home && m.phase == .avail {
                Button {
                    Haptic30.light()
                    withAnimation(.easeOut(duration: 0.2)) { m.hideOnHome() }
                    store.flash("Du finner oppdateringen i Innstillinger")
                } label: {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(p.ink)
                        .frame(width: 30, height: 30).background(p.line, in: Circle())
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Skjul i 24 timer")
                .frame(maxHeight: .infinity, alignment: .top)
                .padding(.top, -7).padding(.trailing, -7)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var icon: String {
        switch m.phase {
        case .done: return "checkmark"
        case .failed: return "exclamationmark"
        default: return "arrow.down.to.line"
        }
    }
}

struct Update30Progress: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { (g: GeometryProxy) in
                let w: CGFloat = g.size.width * CGFloat(m.pct) / 100
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(p.lab).frame(width: Swift.max(6, w))
                }
            }
            .frame(height: 6)
            .animation(.easeOut(duration: 0.4), value: m.pct)
            HStack {
                Text(m.stepText).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                Spacer(minLength: 6)
                Text("\(m.pct) %").font(PF.mono(12, bold: false)).foregroundStyle(p.mut)
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(m.steps) { (s: Update30Model.Step) in Update30StepRow(step: s) }
            }
            .padding(.top, 2)
        }
    }
}

struct Update30StepRow: View {
    @Environment(\.paper) private var p
    let step: Update30Model.Step

    var body: some View {
        let done: Bool = step.state == "done"
        let active: Bool = step.state == "active" || step.state == "running"
        HStack(spacing: 8) {
            Image(systemName: done ? "checkmark.circle.fill" : (active ? "circle.dotted" : "circle"))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(done ? p.pos : (active ? p.lab : p.line))
            Text(step.name).font(PF.ui(12.5, active ? .bold : .regular)).foregroundStyle(active ? p.ink : p.mut)
        }
    }
}

struct Update30Notes: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if m.notes.isEmpty {
                Text("Ingen endringsliste for denne versjonen.").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            ForEach(Array(m.notes.enumerated()), id: \.offset) { pair in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•").foregroundStyle(p.lab)
                    Text(pair.element).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                }
                .font(PF.ui(13))
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct Update30Actions: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Update30Model { Update30Model.shared }

    var body: some View {
        switch m.phase {
        case .avail:
            HStack(spacing: 8) {
                Update30Pill(title: "Oppdater nå", primary: true, full: true) { m.ask("update") }
                Update30Pill(title: m.showNotes ? "Skjul" : "Hva er nytt", primary: false, full: false) {
                    Haptics.shared.select()
                    withAnimation(.easeOut(duration: 0.2)) { m.showNotes.toggle() }
                }
            }
        case .done:
            Update30Pill(title: "Ferdig", primary: true, full: true) { m.acknowledge() }
        case .failed:
            HStack(spacing: 8) {
                Update30Pill(title: "Prøv igjen", primary: true, full: true) { m.ask("update") }
                Update30Pill(title: "Gjenopprett " + (m.current.isEmpty ? "forrige" : m.current), primary: false, full: true) { m.ask("rollback") }
            }
        default:
            EmptyView()
        }
    }
}

/// 40 pt pille i banneret: ink (primær) eller line-bakgrunn (sekundær).
struct Update30Pill: View {
    @Environment(\.paper) private var p
    let title: String
    let primary: Bool
    let full: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(PF.ui(14, .bold)).foregroundStyle(primary ? p.bg : p.ink).lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 16)
                .frame(maxWidth: full ? .infinity : nil, minHeight: 40)
                .background(primary ? p.ink : p.line, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Passordarket ---------- */

struct Update30PasswordSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Update30Model { Update30Model.shared }
    @State private var password: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        let rollback: Bool = m.askAction == "rollback"
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader30(title: rollback ? "Gjenopprett" : "Oppdater Homelab", closeTitle: "Avbryt", closeKind: .secondary) {
                m.askAction = nil
            }
            Text(info(rollback)).font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            SecureField("Passord", text: $password)
                .textContentType(.password)
                .font(PF.ui(16))
                .foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(height: 48)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
                .focused($focused)
                .submitLabel(.go)
                .onSubmit { go() }
            if !m.askError.isEmpty {
                Text(m.askError).font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
            }
            PInkButton(title: m.busy ? "Starter …" : (rollback ? "Gjenopprett" : "Oppdater nå"), height: 48, full: true) { go() }
                .disabled(m.busy)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 16)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear { focused = true }
    }

    private func info(_ rollback: Bool) -> String {
        if rollback {
            return "Forrige versjon av programmet installeres på nytt. Dataene dine beholdes. Skriv passordet ditt for å fortsette."
        }
        let v: String = m.latest.isEmpty ? "" : " til \(m.latest)"
        return "Hjemmeserveren tar backup og oppdateres\(v). Det tar vanligvis 2–5 minutter. Skriv passordet ditt for å fortsette."
    }

    private func go() {
        let pw: String = password
        Task { await m.confirm(pw, store) }
    }
}

/// Arket (legges på Hjem og Innstillinger).
struct Update30SheetHost: ViewModifier {
    @Environment(\.paper) private var p
    @MainActor private var m: Update30Model { Update30Model.shared }

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: Binding<Bool>(get: { m.askAction != nil }, set: { v in if !v { m.askAction = nil } })) {
                Update30PasswordSheet().environment(\.paper, p)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
                    .sheetEdge30(p.bg)
            }
            .dismissHaptic30(m.askAction != nil)
    }
}

extension View {
    func update30Sheet() -> some View { modifier(Update30SheetHost()) }
}

/* ---------- PROGRAMVARE i Innstillinger ---------- */

struct Update30Software: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Update30Model { Update30Model.shared }

    var body: some View {
        let row: (String, String) = m.versionRow
        let canUpdate: Bool = m.phase == .avail || m.phase == .failed
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Programvare").padding(.top, 12).padding(.leading, 4)
            VStack(spacing: 0) {
                Button {
                    if canUpdate { m.ask("update") } else { store.paperGo("innst-oppdatering") }
                } label: {
                    HStack(spacing: 10) {
                        Set30Icon(symbol: "arrow.down.circle", tint: Set30Colors.system)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.0).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                            Text(row.1).font(PF.ui(12.5)).foregroundStyle(p.mut)
                        }
                        Spacer(minLength: 6)
                        Text(canUpdate ? "Oppdater ›" : "✓").font(PF.ui(14, .bold)).foregroundStyle(canUpdate ? p.lab : p.pos)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Rectangle().fill(p.line).frame(height: 1)
                Update30Toggle(name: "Automatiske oppdateringer", sub: "Installeres om natten kl. 03:30, etter backup",
                               symbol: "externaldrive.badge.timemachine", tint: Set30Colors.backup, on: m.autoUpdate) { v in
                    m.setSetting("auto_update", v, store)
                }
                Rectangle().fill(p.line).frame(height: 1)
                Update30Toggle(name: "Varsle om nye versjoner", sub: "Banner på Hjem og push",
                               symbol: "bell", tint: Set30Colors.notify, on: m.notifyUpdates) { v in
                    m.setSetting("notify_updates", v, store)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }
}

struct Update30Toggle: View {
    @Environment(\.paper) private var p
    let name: String
    let sub: String
    let symbol: String
    let tint: Color
    let on: Bool
    let set: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding<Bool>(get: { on }, set: { v in set(v) })) {
            HStack(spacing: 10) {
                Set30Icon(symbol: symbol, tint: tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }
}
