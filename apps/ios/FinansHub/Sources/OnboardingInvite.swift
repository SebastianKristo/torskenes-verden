import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): onboarding for nye familiemedlemmer (skann invitasjons-QR) ----------------
 Server: /api/onboard51/preview og /accept ($S/SERVER51-API.md, WEBX51 §2). QR-en/lenken har bare invitasjons-id, engangskode og
 serverens offentlige adresse – aldri et token: papir://join?i=<id>&c=<kode>&srv=<PUBLIC_URL> eller https://<server>/join/<id>.<kode>.
 Flyt (ferdig på ett minutt): 1) skann eller lim inn → 2) «Ingrid inviterer deg til …» (server vises tydelig) → 3) navn, brukernavn og
 passord (minst 8 tegn) → 4) hva som deles (posisjon, helse sammen med posisjon, kalender) → konto + eget app-token (client:'app'),
 innlogget med en gang. Kontoen blir alltid «bruker» (serveren bestemmer). Åpnes fra innloggingen («Har du fått en invitasjon?»)
 og dyplenken papir://join (App.swift). Er appen allerede innlogget, åpnes «Legg til konto» først. */

struct Onboard51Link {
    let base: String
    let id: String
    let code: String
    let raw: String

    /// Tolker papir://join?i=&c=&srv= og https://<server>/join/<id>.<kode>. Bare https, unntatt lokale adresser.
    nonisolated static func parse(_ text: String) -> Onboard51Link? {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let u = URLComponents(string: t) else { return nil }
        let scheme: String = (u.scheme ?? "").lowercased()
        if scheme == "papir" || scheme == "homelab" || scheme == "finanshub" {
            guard (u.host ?? "").lowercased() == "join" else { return nil }
            let q: [URLQueryItem] = u.queryItems ?? []
            guard let i = q.first(where: { $0.name == "i" })?.value, let c = q.first(where: { $0.name == "c" })?.value,
                  let srv = q.first(where: { $0.name == "srv" })?.value, let b = safeBase(srv) else { return nil }
            return Onboard51Link(base: b, id: i, code: c, raw: t)
        }
        if scheme == "https" || scheme == "http" {
            let parts: [String] = u.path.split(separator: "/").map(String.init)
            guard parts.count >= 2, parts[parts.count - 2] == "join" else { return nil }
            let last: String = parts[parts.count - 1]
            guard let dot = last.firstIndex(of: ".") else { return nil }
            var root: String = scheme + "://" + (u.host ?? "")
            if let port = u.port { root += ":\(port)" }
            guard let b = safeBase(root) else { return nil }
            return Onboard51Link(base: b, id: String(last[..<dot]), code: String(last[last.index(after: dot)...]), raw: t)
        }
        return nil
    }

    nonisolated static func safeBase(_ s: String) -> String? {
        guard let u = URL(string: s), let host = u.host, !host.isEmpty else { return nil }
        let sc: String = (u.scheme ?? "").lowercased()
        if sc == "https" || (sc == "http" && API.isLocal(host)) {
            var r: String = sc + "://" + host
            if let port = u.port { r += ":\(port)" }
            return r
        }
        return nil
    }

    var host: String { base.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "") }
}

@MainActor
@Observable
final class Onboard51 {
    static let shared = Onboard51()

    var open: Bool = false
    var step: String = "scan"
    var link: Onboard51Link? = nil
    var paste: String = ""
    var error: String = ""
    var busy: Bool = false
    var denied: Bool = false

    // Forhåndsvisning
    var inviteName: String = ""
    var invitedBy: String = ""
    var serverName: String = ""
    var expires: String = ""

    // Skjema
    var name: String = ""
    var username: String = ""
    var password: String = ""
    var shareLocation: Bool = true
    var shareHealth: Bool = false
    var shareCalendar: Bool = true

    func show() {
        reset()
        Haptics.shared.tap()
        open = true
    }

    func reset() {
        step = "scan"; link = nil; paste = ""; error = ""; busy = false; denied = false
        inviteName = ""; invitedBy = ""; serverName = ""; expires = ""
        name = ""; username = ""; password = ""
    }

    /// papir://join… eller https://…/join/… fra App.swift (onOpenURL og universell lenke).
    func handleURL(_ u: URL, _ store: Store) -> Bool {
        guard let l = Onboard51Link.parse(u.absoluteString) else { return false }
        if store.loggedIn && !store.addingAccount { store.addingAccount = true }
        reset()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            self.open = true
            await self.preview(l)
        }
        return true
    }

    func scanned(_ s: String) {
        guard step == "scan", !busy else { return }
        guard let l = Onboard51Link.parse(s) else {
            error = "Dette er ikke en invitasjon. Be den som inviterte deg om en ny QR-kode."
            return
        }
        Haptics.shared.tick()
        Task { await preview(l) }
    }

    func usePaste() {
        let s: String = paste.isEmpty ? (UIPasteboard.general.string ?? "") : paste
        guard let l = Onboard51Link.parse(s) else { error = "Fant ingen invitasjonslenke. Lim inn hele lenken (papir://join… eller https://…/join/…)."; return }
        Task { await preview(l) }
    }

    func preview(_ l: Onboard51Link) async {
        busy = true
        error = ""
        defer { busy = false }
        let api: API = API(base: l.base, token: nil)
        do {
            let d: Data = try await api.send51("POST", "/api/onboard51/preview", json: ["id": l.id, "code": l.code], timeout: 20)
            let o: [String: Any] = JS.obj(d)
            link = l
            inviteName = JS.str(o, "name") ?? ""
            invitedBy = JS.str(o, "invitedBy") ?? ""
            serverName = JS.str(o, "serverName") ?? l.host
            if let e = JS.date(o["expiresAt"]) { expires = More44Rows.when(e).lowercased() }
            name = inviteName
            username = JS.str(o, "usernameSuggestion") ?? ""
            let sh: [String: Any]? = JS.dict(o, "share")
            shareLocation = JS.bool(sh, "location") ?? true
            shareHealth = (JS.bool(sh, "health") ?? false) && shareLocation
            shareCalendar = JS.bool(sh, "calendar") ?? true
            step = "preview"
        } catch let e as APIError {
            error = Onboard51.message(e)
        } catch {
            self.error = error.localizedDescription
        }
    }

    nonisolated static func message(_ e: APIError) -> String {
        switch e.code ?? "" {
        case "expired": return "Invitasjonen har gått ut. Be om en ny."
        case "used": return "Invitasjonen er allerede brukt."
        case "revoked": return "Invitasjonen er trukket tilbake."
        case "invalid": return "Invitasjonen er ugyldig. Sjekk at du skannet riktig QR-kode."
        default: break
        }
        if e.status == 429 { return "For mange forsøk. Vent litt og prøv igjen." }
        if e.status == 409 { return "Brukernavnet er tatt. Velg et annet." }
        if e.status == 404 { return "Fant ikke invitasjonen på serveren." }
        return e.message
    }

    func accept(_ store: Store) async {
        guard let l = link else { return }
        let u: String = username.trimmingCharacters(in: .whitespaces)
        guard !u.isEmpty else { error = "Velg et brukernavn."; return }
        guard password.count >= 8 else { error = "Passordet må ha minst 8 tegn."; return }
        busy = true
        error = ""
        defer { busy = false }
        let share: [String: Any] = ["location": shareLocation, "health": shareHealth && shareLocation, "calendar": shareCalendar]
        var b: [String: Any] = ["id": l.id, "code": l.code, "username": u, "password": password, "share": share,
                                "client": "app", "platform": "ios", "device": "FinansHub · " + UIDevice.current.name]
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !n.isEmpty { b["name"] = n }
        do {
            let d: Data = try await API(base: l.base, token: nil).send51("POST", "/api/onboard51/accept", json: b, timeout: 30)
            let o: [String: Any] = JS.obj(d)
            guard let token = JS.str(o, "token") else { error = "Uventet svar fra serveren."; return }
            let user: [String: Any]? = JS.dict(o, "user")
            password = ""
            step = "done"
            // Innloggingen lukkes når kontoen er lagt til (PaperGate forsvinner), så fullskjermen lukkes også her.
            open = false
            store.adoptToken46(server: l.base, token: token, username: JS.str(user, "username") ?? u,
                               name: JS.str(user, "name") ?? n, role: JS.str(user, "role") ?? "bruker")
        } catch let e as APIError {
            error = Onboard51.message(e)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/* ---------- Visning ---------- */

struct Onboard51Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { Onboard51.shared.open }, set: { (v: Bool) in if !v { Onboard51.shared.open = false } })) {
                Onboard51Page()
                    .environment(\.paper, p)
                    .environment(store)
            }
    }
}

extension View {
    /// Prompt 51 (IOSFEAT51): innloggingen (PaperGate.swift).
    func onboard51Host(_ p: PaperPalette) -> some View { modifier(Onboard51Host(p: p)) }
}

/// «Har du fått en invitasjon?» under innloggingen.
struct Onboard51Button: View {
    @Environment(\.paper) private var p

    var body: some View {
        Button { Onboard51.shared.show() } label: {
            HStack(spacing: 10) {
                Image(systemName: "person.badge.plus").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.lab)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Har du fått en invitasjon?").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    Text("Skann QR-koden fra familien – ferdig på ett minutt").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 4)
                Text("›").font(PF.ui(18, .bold)).foregroundStyle(p.mut).accessibilityHidden(true)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct Onboard51Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Onboard51 { Onboard51.shared }

    var body: some View {
        Group {
            if m.step == "scan" { Onboard51Scan() } else { Onboard51Form() }
        }
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }
}

struct Onboard51Scan: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Onboard51 { Onboard51.shared }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Qr38CameraView(onCode: { (s: String) in m.scanned(s) }, onDenied: { m.denied = true })
                .ignoresSafeArea()
            Color.black.opacity(0.35).ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 16) {
                HStack {
                    Button { m.open = false } label: {
                        Text("Avbryt").font(PF.ui(14, .bold)).foregroundStyle(Color.white).frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 20)
                Spacer()
                Text("Skann invitasjonen").font(PF.serif(26, medium: true)).foregroundStyle(Color.white)
                Qr38Frame(busy: m.busy)
                Text(m.denied ? "Kameraet er avslått. Slå det på i Innstillinger → FinansHub, eller lim inn lenken." : "Hold mobilen over QR-koden fra den som inviterte deg")
                    .font(PF.ui(13.5, .semibold)).foregroundStyle(Color.white)
                    .multilineTextAlignment(.center).padding(.horizontal, 30)
                    .fixedSize(horizontal: false, vertical: true)
                if !m.error.isEmpty {
                    Text(m.error).font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#ffb4a6"))
                        .multilineTextAlignment(.center).padding(.horizontal, 30)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                pasteRow.padding(.horizontal, 24).padding(.bottom, 26)
            }
        }
    }

    private var pasteRow: some View {
        HStack(spacing: 8) {
            TextField("", text: Binding<String>(get: { m.paste }, set: { m.paste = $0 }), prompt: Text("Lim inn invitasjonslenke").foregroundStyle(Color.white.opacity(0.6)))
                .font(PF.ui(14)).foregroundStyle(Color.white)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 14).frame(minHeight: 44)
                .background(Color.white.opacity(0.14), in: Capsule())
            Button { m.usePaste() } label: {
                Text("Bruk").font(PF.ui(14, .bold)).foregroundStyle(Color.black)
                    .padding(.horizontal, 16).frame(minHeight: 44)
                    .background(Color.white, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

struct Onboard51Form: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Onboard51 { Onboard51.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Back50Pill(label: m.step == "done" ? "Lukk" : "Avbryt") { m.open = false }
                    Spacer()
                }
                if m.step == "done" { done } else { form }
            }
            .padding(22)
            .frame(maxWidth: 520, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.bg.ignoresSafeArea())
    }

    @ViewBuilder private var form: some View {
        PLabel(text: "Invitasjon · " + (m.link?.host ?? ""))
        Text(title).font(PF.serif(30, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
        F51Note(text: joinText)
        F51Field(label: "Navnet ditt", text: Binding<String>(get: { m.name }, set: { m.name = $0 }), placeholder: "Ingrid")
        VStack(alignment: .leading, spacing: 4) {
            Text("Brukernavn").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            TextField("ingrid", text: Binding<String>(get: { m.username }, set: { m.username = $0 }))
                .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                .modifier(Onboard51FieldStyle())
        }
        VStack(alignment: .leading, spacing: 4) {
            Text("Passord (minst 8 tegn)").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            SecureField("Passord", text: Binding<String>(get: { m.password }, set: { m.password = $0 }))
                .textContentType(.newPassword)
                .modifier(Onboard51FieldStyle())
        }
        share
        if !m.error.isEmpty { F51Note(text: m.error, red: true) }
        PInkButton(title: m.busy ? "Lager kontoen …" : "Bli med", height: 54, full: true) { Task { await m.accept(store) } }
            .disabled(m.busy)
        F51Note(text: "Kontoen blir en vanlig bruker. Du kan endre hva som deles senere i Familie → Deling.")
    }

    private var title: String {
        let who: String = m.invitedBy.isEmpty ? "Familien" : m.invitedBy
        let to: String = m.inviteName.isEmpty ? "" : ", " + m.inviteName
        return who + " inviterer deg" + to
    }

    private var joinText: String {
        let host: String = m.link?.host ?? ""
        let exp: String = m.expires.isEmpty ? "" : " Invitasjonen gjelder til " + m.expires + "."
        return "Du blir med på " + m.serverName + " (" + host + ")." + exp
    }

    private var share: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Hva vil du dele med familien?", color: p.mut).padding(.top, 6)
            Toggle(isOn: Binding<Bool>(get: { m.shareLocation }, set: { (v: Bool) in m.shareLocation = v; if !v { m.shareHealth = false } })) {
                label("Posisjon", "Når du sjekker inn og i Familie-kartet")
            }
            Toggle(isOn: Binding<Bool>(get: { m.shareHealth }, set: { m.shareHealth = $0 })) {
                label("Helse", "Skritt, hvilepuls og søvn – deles sammen med posisjon")
            }
            .disabled(!m.shareLocation)
            Toggle(isOn: Binding<Bool>(get: { m.shareCalendar }, set: { m.shareCalendar = $0 })) {
                label("Kalender", "Familiekalenderen og «hvem kjører?»")
            }
        }
        .tint(p.pos)
    }

    private func label(_ t: String, _ s: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(t).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
            Text(s).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
    }

    private var done: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Velkommen, " + (m.name.isEmpty ? m.username : m.name) + "!").font(PF.serif(30, medium: true)).foregroundStyle(p.ink)
            F51Note(text: "Du er logget inn. Familien ser deg nå i Familie" + (m.shareLocation ? ", og posisjonen deles når du sjekker inn." : "."))
            PInkButton(title: "Ferdig", height: 54, full: true) { m.open = false }
        }
    }
}

struct Onboard51FieldStyle: ViewModifier {
    @Environment(\.paper) private var p

    func body(content: Content) -> some View {
        content
            .font(PF.ui(15)).foregroundStyle(p.ink)
            .padding(.horizontal, 12).frame(minHeight: 48)
            .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
    }
}

/* ---------- Admin: inviter et familiemedlem (POST /api/onboard51/invites) ---------- */

struct Invite51Row: Identifiable {
    let id: String
    let name: String
    let state: String
    let expires: String
}

@MainActor
@Observable
final class Invite51 {
    static let shared = Invite51()

    var open: Bool = false
    var name: String = ""
    var location: Bool = true
    var health: Bool = false
    var calendar: Bool = true
    var hours: Int = 48
    var busy: Bool = false
    var error: String = ""
    var code: String = ""
    var url: String = ""
    var qr: String = ""
    var list: [Invite51Row] = []

    func show() {
        name = ""; code = ""; url = ""; qr = ""; error = ""
        Haptics.shared.tap()
        open = true
    }

    func load(_ store: Store) async {
        guard let d = try? await store.api.send51("GET", "/api/onboard51/invites", timeout: 15) else { return }
        list = JS.list(JS.obj(d), "invites").map { (o: [String: Any]) -> Invite51Row in
            let exp: String = JS.date(o["expiresAt"]).map { More44Rows.when($0) } ?? ""
            return Invite51Row(id: JS.str(o, "id") ?? "", name: JS.str(o, "name") ?? "", state: JS.str(o, "state") ?? "", expires: exp)
        }
    }

    func create(_ store: Store) async {
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { error = "Skriv navnet på den du inviterer."; return }
        busy = true
        error = ""
        defer { busy = false }
        let b: [String: Any] = ["name": n, "ttlHours": hours, "share": ["location": location, "health": health && location, "calendar": calendar]]
        do {
            let d: Data = try await store.api.send51("POST", "/api/onboard51/invites", json: b, timeout: 20)
            let o: [String: Any] = JS.obj(d)
            code = JS.str(o, "code") ?? ""
            url = JS.str(o, "url") ?? ""
            qr = JS.str(o, "qr") ?? url
            await load(store)
        } catch let e as APIError {
            error = e.status == 403 ? "Bare en administrator kan invitere." : e.message
        } catch {
            self.error = error.localizedDescription
        }
    }

    func revoke(_ r: Invite51Row, _ store: Store) async {
        _ = try? await store.api.send51("DELETE", "/api/onboard51/invites/" + r.id, timeout: 15)
        await load(store)
    }

    nonisolated static func stateText(_ s: String) -> String {
        switch s {
        case "open": return "Venter"
        case "used": return "Brukt"
        case "expired": return "Utløpt"
        case "revoked": return "Trukket tilbake"
        default: return s
        }
    }
}

struct Invite51Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Invite51 { Invite51.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PLabel(text: "Familie")
                Text("Inviter et familiemedlem").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                if m.code.isEmpty { form } else { result }
                if !m.list.isEmpty { invites }
            }
            .padding(22)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task { await m.load(store) }
    }

    @ViewBuilder private var form: some View {
        F51Field(label: "Navn", text: Binding<String>(get: { m.name }, set: { m.name = $0 }), placeholder: "Ingrid")
        Toggle(isOn: Binding<Bool>(get: { m.location }, set: { (v: Bool) in m.location = v; if !v { m.health = false } })) {
            Text("Del posisjon").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
        }
        Toggle(isOn: Binding<Bool>(get: { m.health }, set: { m.health = $0 })) {
            Text("Del helse (sammen med posisjon)").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
        }
        .disabled(!m.location)
        Toggle(isOn: Binding<Bool>(get: { m.calendar }, set: { m.calendar = $0 })) {
            Text("Familiekalenderen").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
        }
        Kveld51Menu(label: "Gyldig i \(m.hours) timer", options: [("24", "24 timer"), ("48", "48 timer"), ("72", "3 døgn"), ("168", "1 uke")]) { (v: String) in
            m.hours = Int(v) ?? 48
        }
        if !m.error.isEmpty { F51Note(text: m.error, red: true) }
        F51Btn(title: "Lag invitasjon", kind: .ink, icon: "qrcode", busy: m.busy) { Task { await m.create(store) } }
        F51Note(text: "Den nye personen skanner QR-koden med FinansHub («Har du fått en invitasjon?») eller åpner lenken. Koden kan brukes én gang og er aldri et token.")
    }

    @ViewBuilder private var result: some View {
        if let img = Qr46Show.image(m.qr) {
            Image(uiImage: img).interpolation(.none).resizable().scaledToFit()
                .frame(maxWidth: 260).frame(maxWidth: .infinity)
                .padding(14).background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .accessibilityLabel("QR-kode for invitasjonen")
        }
        F51Line(title: "Engangskode", value: m.code)
        if let u = URL(string: m.url) {
            ShareLink(item: u) {
                Text("Del lenken").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 16).frame(minHeight: 44)
                    .background(p.ink, in: Capsule())
            }
        }
        F51Btn(title: "Ny invitasjon") { m.code = ""; m.name = "" }
    }

    private var invites: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Invitasjoner", color: p.mut).padding(.top, 8)
            ForEach(m.list) { (r: Invite51Row) in
                HStack(spacing: 8) {
                    F51Line(title: r.name, sub: Invite51.stateText(r.state) + (r.expires.isEmpty ? "" : " · " + r.expires))
                    if r.state == "open" { F51Btn(title: "Trekk tilbake", kind: .red) { Task { await m.revoke(r, store) } } }
                }
            }
        }
    }
}
