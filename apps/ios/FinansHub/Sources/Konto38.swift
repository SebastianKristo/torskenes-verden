import SwiftUI
import UIKit
import LocalAuthentication

/* ---------------- Prompt 38: Konto → «Logg inn på ny enhet» og ØKT (Lås skjermen, Logg ut, Logg ut av alle enheter) ----------------
   claude-code-konto-profilbilde.md (2026-10-20): «Lås skjermen» og «Logg ut» er fjernet fra oversikten i Innstillinger og ligger
   nederst på Konto-siden under ØKT. Fasit: Innstillinger Web.dc.html / Mobil Papir App.dc.html.
   - Lås skjermen (blå lock-brikke): låser appen med en gang og krever Face ID/kode (Store.locked + unlock()).
   - Logg ut (rød log-out-brikke, rød tekst): bekreftelse «Logge ut av Homelab på denne enheten?».
   - Logg ut av alle enheter: Face ID + lagret passord → POST /api/auth/reauth → POST /api/auth/logout-all {reauthToken} → {ok, count}.
     Uten lagret passord (eller avvist): appen spør etter passordet og sender {password}. Antall økter fra GET /api/me/sessions. */

@MainActor
@Observable
final class Konto38Model {
    static let shared = Konto38Model()

    var sessions: Int? = nil
    var busy: Bool = false
    var askPassword: Bool = false
    var password: String = ""

    func load(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/me/sessions", timeout: 10) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        if let o = any as? [String: Any] {
            sessions = JS.int(o, "count") ?? JS.int(o, "sessions") ?? JS.list(o, "items").count
        } else if let l = any as? [Any] {
            sessions = l.count
        }
    }

    func lock(_ store: Store) {
        Haptics.shared.tap()
        store.locked = true
        store.unlock()
    }

    /// Face ID → lagret passord (fra Nordlys OS-oppdateringen) → reauth-token. Uten lagret passord: spør etter passordet.
    func logoutAll(_ store: Store) {
        Task { @MainActor in
            let saved: String? = Keychain.get(System31Auth.key(store))
            if let pw = saved, !pw.isEmpty, !System31Auth.biometryName.isEmpty {
                let ok: Bool = await System31Auth.evaluate("Logg ut av Homelab på alle enheter")
                if ok, let tok = await System31Auth.reauth(pw, store) {
                    self.send(store, body: ["reauthToken": tok])
                    return
                }
            }
            self.askPassword = true
        }
    }

    func sendPassword(_ store: Store) {
        let pw: String = password
        password = ""
        if pw.isEmpty { return }
        send(store, body: ["password": pw])
    }

    fileprivate func send(_ store: Store, body: [String: Any]) {
        busy = true
        let withPw: Bool = body["password"] != nil
        Task { @MainActor in
            defer { self.busy = false }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/auth/logout-all", json: body, timeout: 15)
                let o: [String: Any] = JS.obj(d)
                let n: Int = JS.int(o, "count") ?? 0
                Haptics.shared.success()
                store.flash(n > 0 ? "Logget ut av " + String(n) + (n == 1 ? " enhet" : " enheter") : "Logget ut av alle enheter")
                // Denne enhetens økt er også ugyldig nå: logg ut lokalt.
                try? await Task.sleep(nanoseconds: 900_000_000)
                store.logout()
            } catch let e as APIError {
                if (e.status == 401 || e.status == 403) && !withPw && !e.needsTotp {
                    self.askPassword = true
                } else if e.status == 403 && withPw {
                    store.flash("Feil passord. Prøv igjen.")
                } else if e.status == 404 {
                    store.flash("Feil: serveren støtter ikke «Logg ut av alle enheter» ennå. Oppdater Homelab.")
                } else {
                    store.flash("Kunne ikke logge ut av alle enheter: " + e.message)
                }
            } catch {
                store.flash("Kunne ikke logge ut av alle enheter: " + error.localizedDescription)
            }
        }
    }
}

/// Nederst på Konto-siden: «Logg inn på ny enhet» og seksjonen ØKT.
struct Konto38Session: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Konto38Model { Konto38Model.shared }
    @State private var confirmLogout: Bool = false
    @State private var confirmAll: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PLabel(text: "Ny enhet").padding(.top, 8).padding(.leading, 4)
            Qr38KontoRow()
            PLabel(text: "Økt").padding(.top, 8).padding(.leading, 4)
            VStack(spacing: 0) {
                Konto38Row(icon: "lock.fill", tint: Color(hex: "#2b5d8a"), name: "Lås skjermen", sub: "Krever Face ID eller kode for å fortsette",
                           red: false, first: true) { m.lock(store) }
                Konto38Row(icon: "rectangle.portrait.and.arrow.right", tint: Color(hex: "#b23a2a"), name: "Logg ut", sub: "Bare denne enheten",
                           red: true, first: false) { confirmLogout = true }
                Konto38Row(icon: "iphone.and.arrow.forward", tint: Color(hex: "#b23a2a"), name: "Logg ut av alle enheter", sub: allSub,
                           red: true, first: false) { confirmAll = true }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .task { await m.load(store) }
        .confirmationDialog("Logge ut av Homelab på denne enheten?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("Logg ut", role: .destructive) { store.logout() }
            Button("Avbryt", role: .cancel) {}
        }
        .confirmationDialog("Logge ut av Homelab på alle enheter?", isPresented: $confirmAll, titleVisibility: .visible) {
            Button("Logg ut av alle", role: .destructive) { m.logoutAll(store) }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Alle økter blir ugyldige, også denne. Du må logge inn på nytt overalt.")
        }
        .alert("Bekreft med passord", isPresented: Binding<Bool>(get: { m.askPassword }, set: { (v: Bool) in m.askPassword = v })) {
            SecureField("Passord", text: Binding<String>(get: { m.password }, set: { (v: String) in m.password = v }))
            Button("Avbryt", role: .cancel) { m.password = "" }
            Button("Logg ut av alle") { m.sendPassword(store) }
        } message: {
            Text("Serveren krever passordet ditt for å logge ut alle enheter.")
        }
    }

    private var allSub: String {
        if m.busy { return "Logger ut …" }
        if let n = m.sessions, n > 0 { return String(n) + (n == 1 ? " aktiv økt" : " aktive økter") + " · krever Face ID" }
        return "Ugyldiggjør alle økter · krever Face ID"
    }
}

struct Konto38Row: View {
    @Environment(\.paper) private var p
    let icon: String
    let tint: Color
    let name: String
    let sub: String
    let red: Bool
    let first: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            VStack(spacing: 0) {
                if !first { Rectangle().fill(p.line).frame(height: 1).padding(.leading, 56) }
                HStack(spacing: 12) {
                    Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(tint)
                        .frame(width: 30, height: 30)
                        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(name).font(PF.ui(14.5, .bold)).foregroundStyle(red ? Color(hex: "#b23a2a") : p.ink)
                        Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                }
                .padding(.horizontal, 14).frame(minHeight: 56)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
