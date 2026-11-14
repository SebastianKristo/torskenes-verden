import SwiftUI
import UIKit

/* ---------------- Prompt 89 (IOS89): riktig domene + tannhjul for serveradresse på innloggingen ----------------
 Spesifikasjon: claude-code-innlogging-server-tannhjul.md (pakke 59 / prompt 56).
 – Standard ekstern adresse er https://os.smarthjemeksperten.no (lokal uendret: http://10.69.1.39:3000).
 – Migrering ved oppstart (Store.loadAccounts → Server89.migrate): er en lagret adresse nøyaktig den gamle feilstavede
   standarden, skrives den om til den nye. Egendefinerte adresser røres ikke.
 – Tannhjul (gearshape, 44×44) øverst til høyre på innloggingen åpner arket «Server»: Ekstern adresse, Lokal adresse,
   «Test tilkobling» (GET /api/health → «Tilkoblet» grønn / feilmelding rød), «Tilbakestill til standard», Lagre / Avbryt.
 – Validering: http:// eller https://, mellomrom og avsluttende / fjernes.
 – Under «Logg inn»: «Server: os.smarthjemeksperten.no» i liten grå tekst.
 – Én felles lagring med Innstillinger → Server: arket skriver kontoens adresser (Store.updateAddresses) når en konto finnes,
   og Store.updateAddresses skriver tilbake hit (hl89_external / hl89_local), så begge steder viser det samme. */

enum Server89 {
    /// Den gamle, feilstavede standarden (bare for migreringen).
    static let oldExternal: String = "https://os.smarthjem" + "experten.no"
    static let newExternal: String = "https://os.smarthjemeksperten.no"

    private static let extKey: String = "hl89_external"
    private static let locKey: String = "hl89_local"
    private static let doneKey: String = "hl89_migrated"

    /// Ekstern adresse før innlogging (lagret i arket eller i Innstillinger → Server), ellers standarden.
    static var external: String {
        let v: String = UserDefaults.standard.string(forKey: extKey) ?? ""
        return v.isEmpty ? Server47.defaultExternal : v
    }

    /// Lokal adresse før innlogging, ellers standarden.
    static var local: String {
        let v: String = UserDefaults.standard.string(forKey: locKey) ?? ""
        return v.isEmpty ? Server47.defaultLocal : v
    }

    /// Lokal adresse brukeren selv har lagret (tom = ikke lagret). Prøves først ved innlogging (kort tidsavbrudd).
    static var savedLocal: String { UserDefaults.standard.string(forKey: locKey) ?? "" }

    static func remember(local: String, external: String) {
        UserDefaults.standard.set(clean(external), forKey: extKey)
        UserDefaults.standard.set(clean(local), forKey: locKey)
    }

    static func forget() {
        UserDefaults.standard.removeObject(forKey: extKey)
        UserDefaults.standard.removeObject(forKey: locKey)
    }

    /// Fjerner mellomrom og avsluttende /.
    static func clean(_ raw: String) -> String {
        var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: " ", with: "")
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    /// Må starte med http:// eller https:// og ha en vert.
    static func valid(_ raw: String) -> Bool {
        let s: String = clean(raw)
        let l: String = s.lowercased()
        if !(l.hasPrefix("http://") || l.hasPrefix("https://")) { return false }
        let h: String = URL(string: s)?.host ?? ""
        return !h.isEmpty
    }

    static func host(_ raw: String) -> String {
        let s: String = clean(raw)
        if let h = URL(string: s)?.host, !h.isEmpty { return h }
        return Server47.short(s)
    }

    /// «Server: os.smarthjemeksperten.no» – domenet, ikke den interne IP-en.
    @MainActor static func displayHost(_ store: Store) -> String {
        if store.account != nil { return Server47.displayHost(store) }
        let m: String = Server41.shared.manual
        if !m.isEmpty { return host(m) }
        return host(external)
    }

    /* ---------- Migrering ---------- */

    /// Nøyaktig den gamle standarden (mellomrom og avsluttende / tåles), ellers nil.
    static func fixed(_ raw: String) -> String? {
        let s: String = clean(raw)
        if s.isEmpty { return nil }
        return s.lowercased() == oldExternal ? newExternal : nil
    }

    static func fix(_ raw: String) -> String { fixed(raw) ?? raw }

    /// Kalles fra Store.loadAccounts (før kontoene leses). Kontoene selv skrives om i migrateAccounts.
    static func migrate() {
        let d: UserDefaults = UserDefaults.standard
        for k in [extKey, "hl41_manual_server"] {
            if let v = d.string(forKey: k), let n = fixed(v) { d.set(n, forKey: k) }
        }
        if let v = Keychain.get("server"), let n = fixed(v) { Keychain.set("server", n) }
        let g: UserDefaults = KalGroup.defaults
        if let v = g.string(forKey: "kal41.external"), let n = fixed(v) { g.set(n, forKey: "kal41.external") }
        d.set(true, forKey: doneKey)
    }

    /// Lagrede kontoer: server / ekstern adresse som er nøyaktig den gamle standarden.
    static func migrateAccounts(_ list: [LoginAccount]) -> [LoginAccount] {
        list.map { (a: LoginAccount) -> LoginAccount in
            var b: LoginAccount = a
            b.server = fix(a.server)
            b.external = fix(a.external)
            b.local = fix(a.local)
            return b
        }
    }

    /* ---------- Test tilkobling ---------- */

    struct Health: Equatable {
        var ok: Bool
        var text: String
    }

    /// GET <adresse>/api/health → «Tilkoblet · 34 ms» eller en feilmelding.
    static func health(_ raw: String) async -> Health {
        if !valid(raw) { return Health(ok: false, text: "Adressen må starte med http:// eller https://") }
        let s: String = clean(raw)
        guard let url = URL(string: s + "/api/health") else { return Health(ok: false, text: "Ugyldig adresse") }
        var r: URLRequest = URLRequest(url: url)
        r.timeoutInterval = API.isLocal(URL(string: s)?.host ?? "") ? 3 : 8
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        let t0: Date = Date()
        do {
            let pair: (Data, URLResponse) = try await URLSession.shared.data(for: r)
            let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
            let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
            if code >= 200 && code < 300 { return Health(ok: true, text: "Tilkoblet · \(ms) ms") }
            return Health(ok: false, text: "Serveren svarte med HTTP \(code)")
        } catch let e as URLError {
            if e.code == .timedOut { return Health(ok: false, text: "Svarer ikke (tidsavbrudd)") }
            if e.code == .cannotFindHost { return Health(ok: false, text: "Fant ikke " + host(s)) }
            if e.code == .notConnectedToInternet { return Health(ok: false, text: "Ingen nettilkobling") }
            return Health(ok: false, text: "Får ikke kontakt med " + host(s))
        } catch {
            return Health(ok: false, text: "Får ikke kontakt med " + host(s))
        }
    }
}

@MainActor
@Observable
final class Login89Model {
    static let shared: Login89Model = Login89Model()
    /// Arket «Server» (tannhjulet på innloggingen og «Endre serveradresse» i feilkortet).
    var open: Bool = false
}

/* ---------- Tannhjulet ---------- */

struct Login89Gear: View {
    var body: some View {
        Button {
            Haptics.shared.select()
            Login89Model.shared.open = true
        } label: {
            Image(systemName: "gearshape")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: 40, height: 40)
                .background(Color.black.opacity(0.28), in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Server")
        .accessibilityHint("Endre ekstern og lokal serveradresse")
    }
}

/// «Server: os.smarthjemeksperten.no» under innloggingsknappen.
struct Login89ServerLine: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button {
            Login89Model.shared.open = true
        } label: {
            Text("Server: " + Server89.displayHost(store))
                .font(PF.ui(12.5)).foregroundStyle(p.mut)
                .lineLimit(1).truncationMode(.middle)
                .frame(maxWidth: .infinity, minHeight: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Arket «Server» ---------- */

struct Login89Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var external: String = ""
    @State private var local: String = ""
    @State private var extResult: Server89.Health? = nil
    @State private var locResult: Server89.Health? = nil
    @State private var testing: Bool = false
    @State private var error: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                Text("Adressene til Homelab-serveren. De samme verdiene finnes i Innstillinger → Server etter innlogging.")
                    .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                field("Ekstern adresse", Server47.defaultExternal, $external, extResult)
                field("Lokal adresse", Server47.defaultLocal, $local, locResult)
                if !error.isEmpty {
                    Text(error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                }
                testButton
                resetButton
                saveRow
            }
            .padding(20)
        }
        .background(p.bg.ignoresSafeArea())
        .onAppear(perform: load)
    }

    private var header: some View {
        HStack {
            Text("Server").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
            Spacer()
            Button { dismiss() } label: {
                Text("Avbryt").font(PF.ui(14, .semibold)).foregroundStyle(p.mut).frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
        }
    }

    private func field(_ title: String, _ placeholder: String, _ text: Binding<String>, _ r: Server89.Health?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PLabel(text: title)
            TextField(placeholder, text: text)
                .keyboardType(.URL).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                .font(PF.mono(15, bold: false)).foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(height: 48)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
            if let r {
                HStack(spacing: 6) {
                    Circle().fill(r.ok ? p.pos : p.lab).frame(width: 8, height: 8)
                    Text(r.text).font(PF.ui(12.5, .semibold)).foregroundStyle(r.ok ? p.pos : p.lab)
                }
            }
        }
    }

    private var testButton: some View {
        Button { test() } label: {
            HStack(spacing: 8) {
                if testing { ProgressView() }
                Text(testing ? "Tester …" : "Test tilkobling").font(PF.ui(14, .bold))
            }
            .foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 46)
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(testing)
    }

    private var resetButton: some View {
        Button {
            external = Server47.defaultExternal
            local = Server47.defaultLocal
            extResult = nil
            locResult = nil
            error = ""
            Haptics.shared.select()
        } label: {
            Text("Tilbakestill til standard").font(PF.ui(13.5, .semibold)).foregroundStyle(p.mut).underline()
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.plain)
    }

    private var saveRow: some View {
        HStack(spacing: 10) {
            PLineButton(title: "Avbryt", height: 48, full: true) { dismiss() }
            PInkButton(title: "Lagre", height: 48, full: true, act: save)
        }
    }

    private func load() {
        if let a = store.account {
            external = a.external.isEmpty ? a.server : a.external
            local = a.local
        } else {
            let m: String = Server41.shared.manual
            external = m.isEmpty ? Server89.external : m
            local = Server89.local
        }
    }

    private func test() {
        testing = true
        extResult = nil
        locResult = nil
        let e: String = external
        let l: String = local
        Task { @MainActor in
            let r1: Server89.Health = await Server89.health(e)
            extResult = r1
            if !Server89.clean(l).isEmpty { locResult = await Server89.health(l) }
            testing = false
            if r1.ok || (locResult?.ok ?? false) { Haptics.shared.success() } else { Haptics.shared.warning() }
        }
    }

    private func save() {
        let e: String = Server89.clean(external)
        let l: String = Server89.clean(local)
        if !Server89.valid(e) {
            error = "Ekstern adresse må starte med http:// eller https://"
            Haptics.shared.warning()
            return
        }
        if !l.isEmpty && !Server89.valid(l) {
            error = "Lokal adresse må starte med http:// eller https://"
            Haptics.shared.warning()
            return
        }
        Server89.remember(local: l, external: e)
        let s41: Server41 = Server41.shared
        // Innloggingen prøver den lagrede adressen først (Server41.candidates); standarden trenger ingen egen oppføring.
        s41.manual = Server47.same(e, Server47.defaultExternal) ? "" : e
        s41.unreachable = false
        if store.account != nil {
            store.updateAddresses(local: l, external: e)
            s41.push(store)
        }
        Haptics.shared.success()
        store.flash("Lagret · " + Server89.host(e))
        dismiss()
    }
}

struct Login89Host: ViewModifier {
    @MainActor private var m: Login89Model { Login89Model.shared }
    let p: PaperPalette

    func body(content: Content) -> some View {
        content.sheet(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if m.open != v { m.open = v } })) {
            Login89Sheet().environment(\.paper, p).presentationDetents([.large])
        }
    }
}

extension View {
    /// Prompt 89: arket «Server» (tannhjulet på innloggingen).
    func login89Host(_ p: PaperPalette) -> some View { modifier(Login89Host(p: p)) }
}
