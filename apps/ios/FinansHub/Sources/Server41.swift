import SwiftUI
import UIKit

/* ---------------- Prompt 41: innlogging uten serveradresse + Innstillinger → Konto → SERVER ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-innlogging-uten-server.md. Fasit: Mobil Papir App.dc.html (innlogging uten
// SERVER-felt, Innstillinger → Konto → SERVER).
// – Innloggingen spør aldri om adresse. Appen prøver (i rekkefølge) sist brukte adresse, adressene den har lært (lokal/ekstern)
//   og standardadressen https://home.kristo.no (Info.plist «HomelabServer» kan overstyre). Svarer ingen: «Får ikke kontakt med
//   Homelab» + «Prøv igjen» og lenken «Endre serveradresse» (samme ark som i Innstillinger).
// – Etter innlogging: GET /api/discovery (uinnlogget, {name, version, local:[url], external}) og GET /api/me/server
//   ({local, external, auto}) fyller lokal og ekstern adresse. Klientene tåler 404 (eldre server).
// – Innstillinger → Konto → SERVER: Lokal adresse, Ekstern adresse, Bytt automatisk («nå: Lokal/Ekstern»). Endre åpner et ark
//   med URL-tastatur, Test («✓ Homelab svarer på … · 12 ms») og Lagre (krever http:// eller https://). Lagres per bruker på
//   serveren (PUT /api/me/server) og deles med Kalender via App Group (KalCompanion33).
// – Bonjour (_homelab._tcp) er ikke brukt: lokal adresse kommer fra serveren etter første innlogging.

@MainActor
@Observable
final class Server41 {
    static let shared = Server41()

    /// Ingen adresse svarte ved innlogging.
    var unreachable: Bool = false
    var probing: Bool = false
    /// Arket «Endre serveradresse» (fra innloggingen eller Innstillinger). kind = local | external | login.
    var editKind: String? = nil
    /// Adresse brukeren har skrevet inn i arket ved innlogging (brukes foran standarden).
    var manual: String = UserDefaults.standard.string(forKey: "hl41_manual_server") ?? "" {
        didSet { UserDefaults.standard.set(manual, forKey: "hl41_manual_server") }
    }

    /// Standardadressen som leveres med appen.
    nonisolated static var defaultServer: String {
        if let s = Bundle.main.object(forInfoDictionaryKey: "HomelabServer") as? String, !s.isEmpty { return s }
        return "https://home.kristo.no"
    }

    /// Adressene som prøves ved innlogging, i rekkefølge, uten duplikater.
    func candidates(_ store: Store) -> [String] {
        var out: [String] = []
        func add(_ s: String) {
            let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { return }
            let n: String = API.normalize(t)
            if !n.isEmpty && !out.contains(n) { out.append(n) }
        }
        add(manual)
        for a in store.accounts {
            add(a.local)
            add(a.external)
            add(a.server)
        }
        add(Keychain.get("server") ?? "")
        for b in KalGroup.homelabBases { add(b) }
        add(Server41.defaultServer)
        return out
    }

    /// Første adresse som svarer (lokale først prøves med kort tidsavbrudd).
    func pick(_ store: Store) async -> String? {
        probing = true
        defer { probing = false }
        for c in candidates(store) {
            let host: String = URL(string: c)?.host ?? ""
            let t: TimeInterval = API.isLocal(host) ? 1.5 : 6
            if await API(base: c, token: nil).reachable(timeout: t) { return c }
        }
        return nil
    }

    /// Lærer lokal og ekstern adresse fra serveren etter innlogging (tåler 404).
    func learn(_ store: Store) async {
        guard let a = store.account else { return }
        var local: String = a.local
        var external: String = a.external
        var auto: Bool? = nil
        if let d = try? await API(base: store.base.isEmpty ? a.server : store.base, token: nil).callAt("/api", "GET", "/discovery", timeout: 8) {
            let o: [String: Any] = JS.obj(d)
            if local.isEmpty { local = JS.strings(o, "local").first ?? (JS.str(o, "local") ?? "") }
            if external.isEmpty { external = JS.str(o, "external") ?? "" }
        }
        if let d = try? await store.api.callAt("/api", "GET", "/me/server", timeout: 8) {
            let o: [String: Any] = JS.obj(d)
            if let l = JS.str(o, "local"), !l.isEmpty { local = l }
            if let e = JS.str(o, "external"), !e.isEmpty { external = e }
            auto = JS.bool(o, "auto")
        }
        if let v = auto, v != store.useLocal { store.useLocal = v }
        if local != a.local || external != a.external {
            store.updateAddresses(local: local, external: external)
        }
        shareWithKalender(store)
    }

    /// Kalender leser lokal/ekstern adresse fra App Group (KalServer41 i SharedKal): kal41.local / kal41.external / kal41.auto / kal41.now.
    func shareWithKalender(_ store: Store) {
        guard let a = store.account else { return }
        let d: UserDefaults = KalGroup.defaults
        d.set(a.local.isEmpty ? [] : [a.local], forKey: "kal41.local")
        d.set(a.external.isEmpty ? a.server : a.external, forKey: "kal41.external")
        d.set(store.useLocal, forKey: "kal41.auto")
        d.set(store.route == "Lokal" ? "Lokal" : "Ekstern", forKey: "kal41.now")
    }

    /// Lagrer en adresse fra arket i Innstillinger (lokalt og på serveren).
    func save(_ store: Store, kind: String, value: String) {
        guard let a = store.account else { return }
        let v: String = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let local: String = kind == "local" ? v : a.local
        let external: String = kind == "external" ? v : (a.external.isEmpty ? a.server : a.external)
        store.updateAddresses(local: local, external: external)
        push(store)
    }

    func setAuto(_ store: Store, _ on: Bool) {
        store.useLocal = on
        store.refresh()
        push(store)
    }

    private func push(_ store: Store) {
        guard let a = store.account else { return }
        let body: [String: Any] = ["local": a.local, "external": a.external.isEmpty ? a.server : a.external, "auto": store.useLocal]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/me/server", json: body, timeout: 10) }
        shareWithKalender(store)
        KalCompanion33.sync(store, force: true)
    }

    /// «✓ Homelab svarer på home.kristo.no · 12 ms» eller en feilmelding.
    nonisolated static func test(_ raw: String) async -> (ok: Bool, text: String) {
        let t: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower: String = t.lowercased()
        guard lower.hasPrefix("http://") || lower.hasPrefix("https://") else {
            return (false, "Adressen må starte med http:// eller https://")
        }
        let u: String = API.normalize(t)
        let t0: Date = Date()
        let ok: Bool = await API(base: u, token: nil).reachable(timeout: 5)
        let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
        let host: String = u.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
        return ok ? (true, "✓ Homelab svarer på \(host) · \(ms) ms") : (false, "Får ikke kontakt med \(host)")
    }
}

extension Store {
    /// Prompt 41: innlogging uten adressefelt. Velger en adresse som svarer, og logger inn der.
    func login41(username: String, password: String) {
        let s41: Server41 = Server41.shared
        s41.unreachable = false
        Task { @MainActor in
            guard let srv = await s41.pick(self) else {
                s41.unreachable = true
                Haptics.shared.warning()
                return
            }
            self.login(server: srv, username: username, password: password)
        }
    }
}

/* ---------- Innlogging: feilkortet ---------- */

/// «Får ikke kontakt med Homelab» + «Prøv igjen» og «Endre serveradresse».
struct Server41LoginError: View {
    @Environment(\.paper) private var p
    @MainActor private var s: Server41 { Server41.shared }
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Får ikke kontakt med Homelab").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
            Text("Sjekk at telefonen er på nett. Er du hjemme, prøv igjen om litt.").font(PF.ui(13)).foregroundStyle(p.mut)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 14) {
                Button(action: retry) {
                    Text("Prøv igjen").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 16).frame(height: 38).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { s.editKind = "login" } label: {
                    Text("Endre serveradresse").font(PF.ui(13.5, .semibold)).foregroundStyle(p.lab).underline()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/* ---------- Arket «Endre serveradresse» ---------- */

struct Server41Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var s: Server41 { Server41.shared }
    let kind: String
    @State private var text: String = ""
    @State private var result: String = ""
    @State private var ok: Bool = false
    @State private var testing: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(title).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Button { dismiss() } label: {
                    Text("Avbryt").font(PF.ui(13.5, .semibold)).foregroundStyle(p.mut)
                }
                .buttonStyle(.plain)
            }
            Text(sub).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            TextField(kind == "local" ? "http://192.168.1.40:8080" : "https://home.kristo.no", text: $text)
                .keyboardType(.URL).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                .font(PF.mono(15, bold: false)).foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(height: 48)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
            if !result.isEmpty {
                Text(result).font(PF.ui(13, .semibold)).foregroundStyle(ok ? p.pos : p.lab)
            }
            HStack(spacing: 10) {
                Button { test() } label: {
                    HStack(spacing: 6) {
                        if testing { ProgressView() }
                        Text("Test").font(PF.ui(14, .bold))
                    }
                    .foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 46)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                Button { save() } label: {
                    Text("Lagre").font(PF.ui(14, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 46)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!valid)
                .opacity(valid ? 1 : 0.5)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(p.bg.ignoresSafeArea())
        .onAppear { text = initial }
    }

    private var title: String {
        switch kind {
        case "local": return "Lokal adresse"
        case "external": return "Ekstern adresse"
        default: return "Serveradresse"
        }
    }

    private var sub: String {
        switch kind {
        case "local": return "Brukes når du er hjemme på Wi-Fi."
        case "external": return "Brukes når du er borte, f.eks. https://home.kristo.no."
        default: return "Adressen til Homelab-serveren din. Den lagres og kan endres senere i Innstillinger → Konto → Server."
        }
    }

    private var initial: String {
        let a: LoginAccount? = store.account
        switch kind {
        case "local": return a?.local ?? ""
        case "external": return a.map { $0.external.isEmpty ? $0.server : $0.external } ?? ""
        default: return s.manual.isEmpty ? Server41.defaultServer : s.manual
        }
    }

    private var valid: Bool {
        let l: String = text.trimmingCharacters(in: .whitespaces).lowercased()
        if kind == "local" && l.isEmpty { return true }
        return l.hasPrefix("http://") || l.hasPrefix("https://")
    }

    private func test() {
        testing = true
        let t: String = text
        Task {
            let r: (ok: Bool, text: String) = await Server41.test(t)
            ok = r.ok
            result = r.text
            testing = false
            if r.ok { Haptics.shared.success() } else { Haptics.shared.warning() }
        }
    }

    private func save() {
        let v: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if kind == "login" {
            s.manual = v
            s.unreachable = false
        } else {
            s.save(store, kind: kind, value: v)
            store.flash("Lagret · " + title.lowercased())
        }
        dismiss()
    }
}

/* ---------- Innstillinger → Konto → SERVER ---------- */

struct Server41Group: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Server41 { Server41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Server").padding(.leading, 4).padding(.bottom, 6)
            VStack(spacing: 0) {
                row("Lokal adresse", value: local.isEmpty ? "Ikke satt" : short(local), sub: "Brukes når du er hjemme på Wi-Fi") { s.editKind = "local" }
                Rectangle().fill(p.line).frame(height: 1)
                row("Ekstern adresse", value: short(external), sub: "Brukes ellers") { s.editKind = "external" }
                Rectangle().fill(p.line).frame(height: 1)
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
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(.bottom, 8)
        .task { await s.learn(store) }
    }

    private var local: String { store.account?.local ?? "" }
    private var external: String { store.account.map { $0.external.isEmpty ? $0.server : $0.external } ?? "" }

    private func short(_ u: String) -> String {
        u.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    private func row(_ name: String, value: String, sub: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 8)
                Text(value).font(PF.mono(12.5, bold: false)).foregroundStyle(p.mut).lineLimit(1).truncationMode(.middle)
                Text("›").font(PF.ui(16)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Arket for Server41 (legges på innloggingen og på Konto-siden).
struct Server41Host: ViewModifier {
    @MainActor private var s: Server41 { Server41.shared }
    let p: PaperPalette

    func body(content: Content) -> some View {
        content.sheet(item: Binding<Sec32bId?>(get: { s.editKind.map { Sec32bId(id: $0) } }, set: { (v: Sec32bId?) in s.editKind = v?.id })) { (k: Sec32bId) in
            Server41Sheet(kind: k.id).environment(\.paper, p).presentationDetents([.medium])
        }
    }
}

extension View {
    func server41Host(_ p: PaperPalette) -> some View { modifier(Server41Host(p: p)) }
}
