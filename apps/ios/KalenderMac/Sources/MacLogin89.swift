import SwiftUI

/* ---------------- Prompt 89 (IOS89): Kalender for Mac – tannhjul for serveradresse på innloggingen ----------------
 Tannhjulet (gearshape) øverst til høyre åpner arket «Server»: Ekstern og Lokal adresse, «Test tilkobling» (GET /api/health),
 «Tilbakestill til standard», Lagre / Avbryt. Samme lagring som Innstillinger → Kontoer → Server (KalSrv89 → KalSrv47 / KalServer41).
 Lagre fyller også serverfeltet på innloggingen med den eksterne adressen. */

enum MacLogin89 {
    /// mac.lastServer: nøyaktig den gamle feilstavede standarden → ny standard (KalSrv89.fixed).
    static func migrate() {
        let u: UserDefaults = UserDefaults.standard
        if let v = u.string(forKey: "mac.lastServer"), let n = KalSrv89.fixed(v) { u.set(n, forKey: "mac.lastServer") }
    }

    /// Serverfeltet: sist brukte adresse, ellers den eksterne adressen (standard https://os.smarthjemeksperten.no).
    static var initialServer: String {
        let v: String = UserDefaults.standard.string(forKey: "mac.lastServer") ?? ""
        return v.isEmpty ? KalSrv89.external : v
    }
}

struct MacLogin89Gear: View {
    @Environment(\.mk) private var t
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "gearshape")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(t.mut)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Server")
        .accessibilityLabel("Server")
    }
}

struct MacLogin89Sheet: View {
    @Environment(\.mk) private var t
    let onSave: (String) -> Void
    let onClose: () -> Void
    @State private var external: String = ""
    @State private var local: String = ""
    @State private var extText: String = ""
    @State private var extOk: Bool = false
    @State private var locText: String = ""
    @State private var locOk: Bool = false
    @State private var testing: Bool = false
    @State private var error: String = ""
    @State private var busy: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Server").font(MacFont.serif(28)).foregroundColor(t.ink)
            Text("Adressene til Homelab-serveren. De samme verdiene finnes i Innstillinger → Kontoer → Server.")
                .font(MacFont.ui(12.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
            field("Ekstern adresse", KalSrv47.standardExternal, $external, extText, extOk)
            field("Lokal adresse", KalSrv47.standardLocal, $local, locText, locOk)
            if !error.isEmpty {
                Text(error).font(MacFont.ui(12.5, .semibold)).foregroundColor(t.red).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                MacPill(title: testing ? "Tester …" : "Test tilkobling", filled: false, enabled: !testing) { test() }
                MacPill(title: "Tilbakestill til standard", filled: false) { reset() }
            }
            HStack(spacing: 8) {
                Spacer()
                MacPill(title: "Avbryt", filled: false) { onClose() }
                MacPill(title: busy ? "Lagrer …" : "Lagre", enabled: !busy) { save() }
            }
        }
        .padding(24)
        .frame(width: 440)
        .background(t.bg)
        .onAppear {
            external = KalSrv89.external
            local = KalSrv89.local
        }
    }

    private func field(_ title: String, _ placeholder: String, _ text: Binding<String>, _ result: String, _ ok: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(MacFont.ui(12.5, .bold)).foregroundColor(t.ink)
            MacLoginField(title: placeholder, text: text, secure: false)
            if !result.isEmpty {
                Text(result).font(MacFont.ui(12, .semibold)).foregroundColor(ok ? t.green : t.red)
            }
        }
    }

    private func reset() {
        external = KalSrv47.standardExternal
        local = KalSrv47.standardLocal
        extText = ""
        locText = ""
        error = ""
    }

    private func test() {
        testing = true
        extText = ""
        locText = ""
        let e: String = external
        let l: String = local
        Task { @MainActor in
            let r1: (ok: Bool, text: String) = await KalSrv89.health(e)
            extOk = r1.ok
            extText = r1.text
            if !KalSrv89.clean(l).isEmpty {
                let r2: (ok: Bool, text: String) = await KalSrv89.health(l)
                locOk = r2.ok
                locText = r2.text
            }
            testing = false
        }
    }

    private func save() {
        let e: String = KalSrv89.clean(external)
        let l: String = KalSrv89.clean(local)
        if !KalSrv89.valid(e) {
            error = "Ekstern adresse må starte med http:// eller https://"
            return
        }
        if !l.isEmpty && !KalSrv89.valid(l) {
            error = "Lokal adresse må starte med http:// eller https://"
            return
        }
        busy = true
        let logged: Bool = MacStore.shared.loggedIn
        Task { @MainActor in
            _ = await KalSrv89.save(external: e, local: l, loggedIn: logged, device: KalDev44.name)
            busy = false
            onSave(e)
            onClose()
        }
    }
}
