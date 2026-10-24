import SwiftUI

// ---------------- Prompt 47: standard serveradresser + Innstillinger → Konto → Server ----------------
// Spesifikasjon: prompts/prompt-47-pakke/claude-code-standard-serveradresser.md.
// – Standard: ekstern https://os.smarthjemexperten.no, lokal http://10.69.1.39:3000 (Info.plist «HomelabServer» og
//   «HomelabLocal47» kan overstyre). Serveren kan overstyre med PUBLIC_URL / LOCAL_URL; appen leser dem fra GET /api/config
//   etter innlogging (publicUrl, localUrl). Tåler 404 (eldre server): da fylles standardverdiene inn når kontoen er på en av dem.
// – Innstillinger → Server: Ekstern og Lokal adresse med status under hvert felt («Svarer · 34 ms» / «Svarer ikke») og «Test»,
//   og «Tilbakestill til standard». Endringer lagres på serveren (PUT /api/me/server) og synkes til andre enheter på kontoen.
// – Valg av adresse: lokal når den svarer innen 1,5 s, ellers ekstern. Nytt valg ved nettverksendring (Store.reroute47).
// – Klartekst-HTTP bare til lokalt nett: NSAllowsLocalNetworking (ikke global ATS-av) + NSLocalNetworkUsageDescription.
// – Meldinger viser domenet (os.smarthjemexperten.no), aldri den interne IP-en. Den lokale adressen vises bare her.

enum Server47 {
    /// Ekstern standardadresse.
    static var defaultExternal: String { Server41.defaultServer }

    /// Lokal standardadresse.
    static var defaultLocal: String {
        if let s = Bundle.main.object(forInfoDictionaryKey: "HomelabLocal47") as? String, !s.isEmpty { return s }
        return "http://10.69.1.39:3000"
    }

    static func same(_ a: String, _ b: String) -> Bool {
        let x: String = API.normalize(a).lowercased()
        return !x.isEmpty && x == API.normalize(b).lowercased()
    }

    /// Er adressen en av standardadressene (eller adressene serveren har oppgitt)?
    static func isDefault(_ s: String) -> Bool { same(s, defaultExternal) || same(s, defaultLocal) }

    static func short(_ u: String) -> String {
        u.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    /// Domenet som vises i meldinger og varsler (ekstern adresse, aldri en intern IP).
    @MainActor static func displayHost(_ store: Store) -> String {
        let a: LoginAccount? = store.account
        let ext: String = a.map { $0.external.isEmpty ? $0.server : $0.external } ?? ""
        let h: String = URL(string: API.normalize(ext))?.host ?? ""
        if !h.isEmpty && !API.isLocal(h) { return h }
        return URL(string: defaultExternal)?.host ?? "os.smarthjemexperten.no"
    }

    /// Fyller tomme adresser fra /api/config (publicUrl, localUrl) og ellers fra standardverdiene. Tåler 404.
    @MainActor static func fill(_ store: Store, local: String, external: String) async -> (local: String, external: String) {
        var l: String = local
        var e: String = external
        if l.isEmpty || e.isEmpty {
            if let d = try? await store.api.callAt("/api", "GET", "/config", timeout: 8) {
                let o: [String: Any] = JS.obj(d)
                let pub: String = JS.str(o, "publicUrl") ?? JS.str(o, "public_url") ?? ""
                let loc: String = JS.str(o, "localUrl") ?? JS.str(o, "local_url") ?? ""
                if e.isEmpty && valid(pub) { e = pub }
                if l.isEmpty && valid(loc) { l = loc }
            }
        }
        // Eldre server uten /api/config: standardverdiene gjelder bare når kontoen er på en av standardadressene.
        let srv: String = store.account?.server ?? ""
        if isDefault(srv) || isDefault(e) || isDefault(l) {
            if e.isEmpty { e = defaultExternal }
            if l.isEmpty { l = defaultLocal }
        }
        return (l, e)
    }

    static func valid(_ s: String) -> Bool {
        let l: String = s.trimmingCharacters(in: .whitespaces).lowercased()
        return l.hasPrefix("http://") || l.hasPrefix("https://")
    }
}

/// Status for hvert felt («Svarer · 34 ms» / «Svarer ikke»).
struct Server47Status: Equatable {
    var ok: Bool
    var ms: Int
}

@MainActor
@Observable
final class Server47Model {
    static let shared = Server47Model()

    /// kind (local | external) → siste resultat.
    var status: [String: Server47Status] = [:]
    var testing: Set<String> = []
    /// Adressen som ble testet (så et gammelt resultat ikke vises for en ny adresse).
    private var tested: [String: String] = [:]

    func current(_ kind: String, _ url: String) -> Server47Status? {
        tested[kind] == url ? status[kind] : nil
    }

    func test(_ kind: String, _ url: String) {
        let u: String = url
        if u.isEmpty || testing.contains(kind) { return }
        testing.insert(kind)
        Task { @MainActor in
            let t0: Date = Date()
            let host: String = URL(string: API.normalize(u))?.host ?? ""
            let ok: Bool = await API(base: API.normalize(u), token: nil).reachable(timeout: API.isLocal(host) ? 1.5 : 5)
            let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
            self.status[kind] = Server47Status(ok: ok, ms: ms)
            self.tested[kind] = u
            self.testing.remove(kind)
        }
    }

    /// «Tilbakestill til standard»: begge feltene får standardverdiene (lagres og synkes).
    func reset(_ store: Store) {
        store.updateAddresses(local: Server47.defaultLocal, external: Server47.defaultExternal)
        Server41.shared.push(store)
        status = [:]
        tested = [:]
        Haptics.shared.success()
        store.flash("Tilbakestilt til standard · " + Server47.short(Server47.defaultExternal))
    }
}

/* ---------- Innstillinger → Konto → SERVER ---------- */

struct Server47Group: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Server41 { Server41.shared }
    @MainActor private var m: Server47Model { Server47Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Server").padding(.leading, 4).padding(.bottom, 6)
            VStack(spacing: 0) {
                Server47Row(kind: "external", name: "Ekstern adresse", sub: "Brukes ellers", value: external) { s.editKind = "external" }
                Rectangle().fill(p.line).frame(height: 1)
                Server47Row(kind: "local", name: "Lokal adresse", sub: "Brukes når du er hjemme på Wi-Fi", value: local) { s.editKind = "local" }
                Rectangle().fill(p.line).frame(height: 1)
                autoRow
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            resetButton
        }
        .padding(.bottom, 8)
        .task {
            await s.learn(store)
            m.test("external", external)
            m.test("local", local)
        }
    }

    private var local: String { store.account?.local ?? "" }
    private var external: String { store.account.map { $0.external.isEmpty ? $0.server : $0.external } ?? "" }

    private var autoRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Bytt automatisk").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text("Lokal når den svarer · nå: " + store.route).font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: Binding(get: { store.useLocal }, set: { (v: Bool) in s.setAuto(store, v) }))
                .labelsHidden().tint(p.pos)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    private var isDefault: Bool {
        Server47.same(external, Server47.defaultExternal) && Server47.same(local, Server47.defaultLocal)
    }

    private var resetButton: some View {
        Button { m.reset(store) } label: {
            Text("Tilbakestill til standard").font(PF.ui(13.5, .bold)).foregroundStyle(isDefault ? p.mut : p.ink)
                .padding(.horizontal, 16).frame(height: 40)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .padding(.top, 10)
        .accessibilityHint("Setter ekstern og lokal adresse tilbake til standardverdiene")
    }
}

/// Én adresse: navn, verdi, status og «Test». Trykk på raden åpner «Endre» (Server41Sheet).
struct Server47Row: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Server47Model { Server47Model.shared }
    let kind: String
    let name: String
    let sub: String
    let value: String
    let edit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: edit) { head }.buttonStyle(.plain)
            HStack(spacing: 10) {
                statusText
                Spacer(minLength: 8)
                testButton
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    private var head: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 8)
            Text(value.isEmpty ? "Ikke satt" : Server47.short(value)).font(PF.mono(12.5, bold: false)).foregroundStyle(p.mut)
                .lineLimit(1).truncationMode(.middle)
            Text("›").font(PF.ui(16)).foregroundStyle(p.mut)
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder private var statusText: some View {
        if m.testing.contains(kind) {
            Text("Tester …").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
        } else if let st = m.current(kind, value) {
            HStack(spacing: 6) {
                Circle().fill(st.ok ? p.pos : p.lab).frame(width: 8, height: 8)
                Text(st.ok ? "Svarer · \(st.ms) ms" : "Svarer ikke").font(PF.ui(12.5, .semibold)).foregroundStyle(st.ok ? p.pos : p.lab)
            }
        } else {
            Text(value.isEmpty ? "Ikke satt" : "Ikke testet").font(PF.ui(12.5)).foregroundStyle(p.mut)
        }
    }

    private var testButton: some View {
        Button { m.test(kind, value) } label: {
            Text("Test").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(height: 30)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(value.isEmpty)
        .opacity(value.isEmpty ? 0.5 : 1)
    }
}
