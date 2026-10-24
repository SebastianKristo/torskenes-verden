import SwiftUI
import UIKit
import LocalAuthentication

/* ---------------- Prompt 51 (SEC51): nye enheter må godkjennes ---------------- */
// Innlogging fra internett på en ukjent enhet gir 403 DEVICE_APPROVAL_REQUIRED (API.send → APIError.approval51).
// Da vises «Venter på godkjenning» i innloggingen (Sec51WaitView i PaperGate.swift): appen poller statusUrl hvert 2,5 s med
// X-Approval-Key, og kaller finishUrl når en kjent enhet (eller admin) har godkjent → eget app-token (Store.adoptToken46).
// Godkjenning herfra: Innstillinger → Sikkerhet → «Nye enheter» (Sec51ApprovalsCard) med Face ID før «Godkjenn», og et
// varsel i appen (FH51Host) når en ny enhet venter. Når appen er lukket, kommer varselet fra serverens kø (Notify31).
// Token og pollKey vises aldri.

struct Sec51Approval: Identifiable, Equatable {
    let id: String
    let userName: String
    let device: String
    let method: String
    let ip: String
    let country: String
    let state: String
    let created: Date?
    let expires: Date?

    nonisolated static func from(_ o: [String: Any]) -> Sec51Approval? {
        guard let id = JS.str(o, "id") else { return nil }
        return Sec51Approval(id: id, userName: JS.str(o, "userName") ?? "", device: JS.str(o, "device") ?? "Ukjent enhet",
                             method: JS.str(o, "methodLabel") ?? JS.str(o, "method") ?? "", ip: JS.str(o, "ip") ?? "",
                             country: JS.str(o, "countryName") ?? JS.str(o, "country") ?? "", state: JS.str(o, "state") ?? "pending",
                             created: Sec51Fmt.date(JS.str(o, "createdAt")), expires: Sec51Fmt.date(JS.str(o, "expiresAt")))
    }

    /// «Sebastian · Passord · Norge · 84.x.x.x · 14:02»
    var detail: String {
        let parts: [String] = [userName, method, country, ip, Sec51Fmt.time(created)].filter { !$0.isEmpty }
        return parts.joined(separator: " · ")
    }
}

@MainActor
@Observable
final class Sec51Model {
    static let shared = Sec51Model()

    /* ---------- Innlogging som venter ---------- */

    private(set) var wait: DeviceApproval51? = nil
    /// pending | finishing | denied | expired | error
    private(set) var waitState: String = "pending"
    private(set) var waitError: String = ""
    @ObservationIgnored private var waitServer: String = ""
    @ObservationIgnored private var pollTask: Task<Void, Never>? = nil

    /* ---------- Godkjenning fra denne enheten ---------- */

    private(set) var approvals: [Sec51Approval] = []
    private(set) var loaded: Bool = false
    private(set) var busyId: String? = nil
    var err: String = ""
    /// Varselet i appen («Ny enhet vil logge inn»).
    var alert: Sec51Approval? = nil
    @ObservationIgnored private var seen: [String] = UserDefaults.standard.stringArray(forKey: "sec51_seen") ?? []

    var pending: [Sec51Approval] {
        let now = Date()
        return approvals.filter { $0.state == "pending" && ($0.expires ?? .distantFuture) > now }
    }

    func beginWait(_ ap: DeviceApproval51, server: String, _ store: Store) {
        pollTask?.cancel()
        wait = ap
        waitServer = server
        waitState = "pending"
        waitError = ""
        Haptics.shared.warning()
        startPolling(store)
    }

    func cancelWait() {
        pollTask?.cancel()
        pollTask = nil
        wait = nil
        waitState = "pending"
        waitError = ""
    }

    func retryWait(_ store: Store) {
        guard wait != nil else { return }
        waitState = "pending"
        waitError = ""
        startPolling(store)
    }

    private func startPolling(_ store: Store) {
        pollTask?.cancel()
        pollTask = Task { @MainActor in await self.poll(store) }
    }

    private func poll(_ store: Store) async {
        var fails: Int = 0
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(2500))
            guard !Task.isCancelled, let ap = wait else { return }
            if let exp = ap.expires, exp < Date() { waitState = "expired"; return }
            do {
                let d: Data = try await API(base: waitServer, token: nil).send51("GET", ap.statusUrl, headers: ["X-Approval-Key": ap.pollKey], timeout: 10)
                fails = 0
                waitError = ""
                let st: String = JS.str(JS.obj(d), "state") ?? "pending"
                if st == "approved" { await finish(store); return }
                if st == "denied" { waitState = "denied"; Haptics.shared.error(); return }
                if st == "expired" { waitState = "expired"; return }
            } catch let e as APIError where e.status == 404 || e.status == 410 {
                waitState = "expired"
                return
            } catch {
                fails += 1
                if fails >= 3 { waitError = "Får ikke kontakt med serveren. Prøver igjen …" }
            }
        }
    }

    private func finish(_ store: Store) async {
        guard let ap = wait else { return }
        waitState = "finishing"
        do {
            let d: Data = try await API(base: waitServer, token: nil).send51("POST", ap.finishUrl, headers: ["X-Approval-Key": ap.pollKey], json: [:], timeout: 20)
            let o: [String: Any] = JS.obj(d)
            guard let token = JS.str(o, "token") else {
                waitState = "error"
                waitError = "Uventet svar fra serveren."
                return
            }
            let u: [String: Any]? = JS.dict(o, "user")
            let username: String = JS.str(u, "username") ?? ""
            let server: String = waitServer
            pollTask = nil
            wait = nil
            waitState = "pending"
            Haptics.shared.success()
            store.adoptToken46(server: server, token: token, username: username, name: JS.str(u, "name") ?? username, role: JS.str(u, "role") ?? "")
        } catch let e as APIError {
            if e.status == 403 { waitState = "denied" } else if e.status == 404 || e.status == 410 { waitState = "expired" } else {
                waitState = "error"
                waitError = e.message
            }
        } catch {
            waitState = "error"
            waitError = error.localizedDescription
        }
    }

    /* ---------- Liste og avgjørelse ---------- */

    func load(_ store: Store) async {
        guard store.loggedIn else { approvals = []; return }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/security51/approvals", timeout: 15)
            approvals = JS.list(JS.obj(d), "approvals").compactMap { Sec51Approval.from($0) }
            loaded = true
            err = ""
        } catch let e as APIError where e.status == 404 || e.status == 403 {
            // Eldre server uten SEC51 (eller token uten tilgang): ingen liste.
            approvals = []
            loaded = true
        } catch {
            if !loaded { err = "Kunne ikke hente enheter som venter." }
        }
    }

    /// Henter listen og viser varselet for den første nye forespørselen (én gang per forespørsel).
    func checkNew(_ store: Store) async {
        guard store.loggedIn, !store.locked else { return }
        await load(store)
        guard alert == nil, let a = pending.first(where: { !seen.contains($0.id) }) else { return }
        seen = Array((seen + [a.id]).suffix(100))
        UserDefaults.standard.set(seen, forKey: "sec51_seen")
        Haptics.shared.warning()
        alert = a
    }

    /// Godkjenn krever Face ID (eller kode når Face ID mangler). Avvis krever det ikke.
    func decide(_ a: Sec51Approval, approve: Bool, _ store: Store) {
        guard busyId == nil else { return }
        err = ""
        if !approve { send(a, approve: false, store); return }
        let ctx = LAContext()
        var e1: NSError?
        let bio: Bool = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &e1)
        let policy: LAPolicy = bio ? .deviceOwnerAuthenticationWithBiometrics : .deviceOwnerAuthentication
        var e2: NSError?
        guard ctx.canEvaluatePolicy(policy, error: &e2) else {
            err = "Slå på Face ID eller kode på mobilen for å godkjenne innlogginger."
            Haptics.shared.error()
            return
        }
        busyId = a.id
        let reason: String = "Godkjenn innlogging på \(a.device)"
        ctx.evaluatePolicy(policy, localizedReason: reason) { (ok: Bool, _: Error?) in
            Task { @MainActor in
                Sec51Model.shared.busyId = nil
                if ok { Sec51Model.shared.send(a, approve: true, store) }
            }
        }
    }

    private func send(_ a: Sec51Approval, approve: Bool, _ store: Store) {
        busyId = a.id
        let path: String = "/security51/approvals/" + (a.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? a.id)
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "POST", path, json: ["approve": approve], timeout: 15)
                store.flash(approve ? "Enheten er godkjent" : "Innloggingen er avvist")
            } catch let e as APIError {
                self.err = e.status == 409 ? "Forespørselen er allerede behandlet." : (e.status == 410 ? "Forespørselen er utløpt." : e.message)
                Haptics.shared.error()
            } catch {
                self.err = error.localizedDescription
            }
            self.busyId = nil
            await self.load(store)
        }
    }
}

/* ---------------- «Venter på godkjenning» (i innloggingen, Papir) ---------------- */

struct Sec51WaitView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Sec51Model { Sec51Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            PLabel(text: "Ny enhet")
            Text(title).font(PF.serif(28, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text(explain).font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            statusLine
            buttons
        }
    }

    private var title: String {
        switch m.waitState {
        case "denied": return "Innloggingen ble avvist"
        case "expired": return "Forespørselen er utløpt"
        case "finishing": return "Godkjent – logger inn …"
        default: return "Venter på godkjenning"
        }
    }

    private var explain: String {
        switch m.waitState {
        case "denied": return "Innloggingen ble avvist fra en annen enhet. Var det deg, kan du prøve igjen og godkjenne den selv."
        case "expired": return "Ingen godkjente innloggingen innen 15 minutter. Logg inn på nytt for å prøve igjen."
        default:
            let dev: String = (m.wait?.device ?? "").isEmpty ? "Denne enheten" : "Denne enheten (\(m.wait?.device ?? ""))"
            return "\(dev) er ny for kontoen din. Godkjenn innloggingen fra en enhet som allerede er logget inn (Innstillinger → Sikkerhet), "
                + "eller logg inn hjemme på samme nett. En administrator kan også godkjenne."
        }
    }

    @ViewBuilder private var statusLine: some View {
        if m.waitState == "pending" || m.waitState == "finishing" {
            HStack(spacing: 10) {
                ProgressView()
                Text(waitingText).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        if !m.waitError.isEmpty {
            Text(m.waitError).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var waitingText: String {
        if m.waitState == "finishing" { return "Henter tilgang …" }
        let t: String = Sec51Fmt.time(m.wait?.expires)
        return t.isEmpty ? "Venter …" : "Venter … (utløper \(t))"
    }

    @ViewBuilder private var buttons: some View {
        if m.waitState == "error" {
            PInkButton(title: "Prøv igjen", height: 50, full: true) { m.retryWait(store) }
        }
        if m.waitState == "pending" || m.waitState == "finishing" || m.waitState == "error" {
            PLineButton(title: "Avbryt", height: 48, full: true) { m.cancelWait() }
        } else {
            PInkButton(title: "← Tilbake til innlogging", height: 50, full: true) { m.cancelWait() }
        }
    }
}

/* ---------------- Innstillinger → Sikkerhet → «Nye enheter» ---------------- */

struct Sec51ApprovalsCard: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Sec51Model { Sec51Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            if m.pending.isEmpty {
                empty
            } else {
                ForEach(Array(m.pending.enumerated()), id: \.element.id) { i, a in
                    if i > 0 { Divider().padding(.leading, 54) }
                    Sec51ApprovalRow(a: a)
                }
            }
            if !m.err.isEmpty {
                Text(m.err).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(hex: "#b23a2a"))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14).padding(.bottom, 12)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .task { await m.load(store) }
    }

    private var empty: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.shield").font(.system(size: 18, weight: .medium)).foregroundStyle(Color.secondary).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text("Ingen enheter venter").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.primary)
                Text("Logger noen inn på en ny enhet fra internett, må det godkjennes her.")
                    .font(.system(size: 13)).foregroundStyle(Color.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12).padding(.horizontal, 14)
    }
}

struct Sec51ApprovalRow: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Sec51Model { Sec51Model.shared }
    let a: Sec51Approval

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "iphone.and.arrow.forward").font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Color(hex: "#b23a2a")).frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(a.device).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.primary)
                    Text(a.detail).font(.system(size: 13)).foregroundStyle(Color.secondary).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            actions
        }
        .padding(.vertical, 12).padding(.horizontal, 14)
    }

    private var actions: some View {
        let busy: Bool = m.busyId == a.id
        return HStack(spacing: 10) {
            Spacer(minLength: 40)
            Button { m.decide(a, approve: false, store) } label: {
                Text("Avvis").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color(hex: "#b23a2a"))
                    .padding(.horizontal, 16).frame(height: 36)
                    .overlay(Capsule().stroke(Color(hex: "#b23a2a").opacity(0.6), lineWidth: 1))
            }
            .buttonStyle(.plain)
            Button { m.decide(a, approve: true, store) } label: {
                HStack(spacing: 6) {
                    Image(systemName: "faceid").font(.system(size: 13, weight: .semibold))
                    Text(busy ? "Godkjenner …" : "Godkjenn").font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(Color.white)
                .padding(.horizontal, 16).frame(height: 36)
                .background(Color(hex: "#2f7a4f"), in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .disabled(m.busyId != nil)
        .opacity(m.busyId != nil && !busy ? 0.5 : 1)
    }
}

/* ---------------- Roten: varsel, «Nytt i denne versjonen», flagg og krasjrapporter ---------------- */

struct FH51Host: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.colorScheme) private var scheme
    @MainActor private var sec: Sec51Model { Sec51Model.shared }
    @MainActor private var news: WhatsNew51 { WhatsNew51.shared }

    func body(content: Content) -> some View {
        content
            .alert("Ny enhet vil logge inn", isPresented: alertShown, presenting: sec.alert) { (a: Sec51Approval) in
                Button("Godkjenn med Face ID") { sec.decide(a, approve: true, store) }
                Button("Avvis", role: .destructive) { sec.decide(a, approve: false, store) }
                Button("Senere", role: .cancel) { }
            } message: { (a: Sec51Approval) in
                Text(alertText(a))
            }
            .sheet(isPresented: newsShown) {
                WhatsNew51Sheet()
                    .environment(\.paper, PaperPalette.of(store.paperMode, system: scheme))
                    .presentationDetents([.medium, .large])
            }
            .task(id: store.account?.id ?? "") { await loop() }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { (_: Notification) in
                Task { @MainActor in await wake() }
            }
    }

    private var alertShown: Binding<Bool> {
        Binding<Bool>(get: { Sec51Model.shared.alert != nil }, set: { (v: Bool) in if !v { Sec51Model.shared.alert = nil } })
    }

    private var newsShown: Binding<Bool> {
        Binding<Bool>(get: { WhatsNew51.shared.card != nil }, set: { (v: Bool) in if !v { WhatsNew51.shared.dismiss() } })
    }

    private func alertText(_ a: Sec51Approval) -> String {
        let who: String = a.detail.isEmpty ? "" : "\n" + a.detail
        return "\(a.device) prøver å logge inn.\(who)\n\nGodkjenn bare hvis det er deg eller noen i husstanden."
    }

    @MainActor private func loop() async {
        await Crash51.flush(store)
        guard store.loggedIn else { return }
        await Flags51.shared.refresh(store, force: true)
        await news.check(store)
        await sec.checkNew(store)
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(60))
            if Task.isCancelled { return }
            guard UIApplication.shared.applicationState == .active else { continue }
            await sec.checkNew(store)
            // Flaggene oppdateres hver time (refresh hopper over når de er ferskere).
            await Flags51.shared.refresh(store)
        }
    }

    @MainActor private func wake() async {
        await Crash51.flush(store)
        guard store.loggedIn else { return }
        await Flags51.shared.refresh(store)
        await sec.checkNew(store)
    }
}

extension View {
    /// Prompt 51: legges på roten i App.swift (innenfor .environment(store)).
    func fh51Host() -> some View { modifier(FH51Host()) }
}
