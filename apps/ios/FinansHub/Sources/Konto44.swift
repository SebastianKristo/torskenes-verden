import SwiftUI
import UIKit

/* ---------------- Prompt 44: Kontoer og brukere – «Logg inn som» (admin) og «Overfør eierskap» ----------------
 Fasit: Mobil Papir App.dc.html → Innstillinger → Kontoer og brukere (asRows/asVals, ownRows/ownVals),
 Rediger Andres Oppsett.dc.html, claude-code-rediger-andres-oppsett.md og claude-code-overfor-servereier.md.
 Server (SERVER44, server/admin44.js):
   POST /api/admin/impersonate {userId} → {token, expiresAt, ttlSec, user:{id,name,color?}, actor:{id,name}}
   POST /api/admin/impersonate/exit (med X-tokenet) → {ok, changes, message, undo:{method,path}}
   GET/PUT /api/users/:id/layout · POST …/copy-from-me · …/reset · …/undo · PUT …/lock {locked}
   GET /api/server/owner → {owner, me:{isOwner, canTransfer, needsApproval}, pending, candidates:[{id,name,role,totp,eligible,reason}]}
   POST /api/server/owner/transfer {toUserId, reauthToken|password} · POST …/transfer/:id/approve|reject
 Sikkerhet: bare admin; aldri en annen admin eller eieren. X-tokenet er kortlevd (30 min) og ligger som en midlertidig
 konto; admin-tokenet blir liggende i nøkkelringen og brukes igjen ved «Gå ut» (ingen passord, ingen ny innlogging).
 Mens man er X: Chat, Finans og Helse er skrivebeskyttet (serveren svarer 403 readOnly). */

struct Konto44User: Identifiable, Hashable {
    var id: String
    var name: String
    var username: String = ""
    var role: String = "user"
    var totp: Bool = false
    var color: String = ""
    var eligible: Bool = true
    var reason: String = ""
    var initial: String { String(name.prefix(1)).uppercased() }
}

/// Lagres i nøkkelringen mens man er logget inn som X.
struct Imp44State: Codable, Hashable {
    var tempId: String
    var adminId: String
    var adminName: String
    var userId: String
    var name: String
    var color: String
    var expiresAt: Double
}

@MainActor
@Observable
final class Konto44 {
    static let shared = Konto44()

    var users: [Konto44User] = []
    var sheetUser: Konto44User? = nil
    var imp: Imp44State? = Konto44.readImp()
    var busy: Bool = false
    var toast: String = ""
    @ObservationIgnored var undoPath: String = ""
    @ObservationIgnored var undoMethod: String = "POST"
    @ObservationIgnored private var toastTask: Task<Void, Never>? = nil

    /* Eierskap */
    var ownerName: String = ""
    var ownerSince: String = ""
    var isOwner: Bool = false
    var canTransfer: Bool = false
    var needsApproval: Bool = false
    var candidates: [Konto44User] = []
    var pending: [[String: String]] = []
    var ownerMissing: Bool = false
    var transferOpen: Bool = false

    static func isAdmin(_ store: Store) -> Bool { (store.me?.role ?? store.account?.role ?? "") == "admin" }

    /* ---------- Nøkkelringen ---------- */

    nonisolated static func readImp() -> Imp44State? {
        guard let s = Keychain.get("imp44"), let d = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Imp44State.self, from: d)
    }

    private func writeImp(_ v: Imp44State?) {
        imp = v
        if let v, let d = try? JSONEncoder().encode(v) { Keychain.set("imp44", String(data: d, encoding: .utf8)) } else { Keychain.set("imp44", nil) }
    }

    /// Kontoen er byttet bort (utløpt X-token, manuelt kontobytte): glem tilstanden.
    func check(_ store: Store) {
        guard let i = imp else { return }
        if store.account?.id != i.tempId { writeImp(nil) }
    }

    /* ---------- Brukere ---------- */

    func loadUsers(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/users", timeout: 15) else { return }
        let o: [String: Any] = JS.obj(d)
        let meId: String = JS.str(JS.dict(o, "me"), "id") ?? ""
        users = JS.list(o, "users").compactMap { (r: [String: Any]) -> Konto44User? in
            let u: Konto44User = Konto44.user(r)
            return u.id == meId || u.id.isEmpty ? nil : u
        }
    }

    nonisolated static func user(_ r: [String: Any]) -> Konto44User {
        var u: Konto44User = Konto44User(id: JS.str(r, "id") ?? "", name: JS.str(r, "displayName") ?? JS.str(r, "name") ?? JS.str(r, "username") ?? "Bruker")
        u.username = JS.str(r, "username") ?? ""
        u.role = JS.str(r, "role") ?? "user"
        u.totp = JS.bool(r, "totp") ?? JS.bool(r, "totpEnabled") ?? false
        u.color = JS.str(r, "color") ?? ""
        u.eligible = JS.bool(r, "eligible") ?? true
        u.reason = JS.str(r, "reason") ?? ""
        return u
    }

    func flash(_ t: String, undo: String = "", method: String = "POST") {
        toast = t
        undoPath = undo
        undoMethod = method
        toastTask?.cancel()
        toastTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            if !Task.isCancelled { withAnimation(.easeOut(duration: 0.2)) { self.toast = ""; self.undoPath = "" } }
        }
    }

    /* ---------- Logg inn som / Gå ut ---------- */

    func loginAs(_ u: Konto44User, _ store: Store) {
        guard let admin = store.account, imp == nil else { return }
        Haptics.shared.tap()
        busy = true
        Task { @MainActor in
            defer { self.busy = false }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/admin/impersonate", json: ["userId": u.id], timeout: 20)
                let o: [String: Any] = JS.obj(d)
                guard let tok = JS.str(o, "token") else { self.flash("Serveren ga ikke noe token."); return }
                let x: [String: Any]? = JS.dict(o, "user")
                let name: String = JS.str(x, "name") ?? u.name
                let exp: Double = JS.date(o["expiresAt"])?.timeIntervalSince1970 ?? Date().addingTimeInterval(1800).timeIntervalSince1970
                let temp: String = "imp44-" + u.id
                let acc: LoginAccount = LoginAccount(id: temp, server: admin.server, username: u.username.isEmpty ? name : u.username, name: name,
                                                     role: u.role, token: tok, local: admin.local, external: admin.external)
                self.writeImp(Imp44State(tempId: temp, adminId: admin.id, adminName: admin.label, userId: u.id, name: name,
                                         color: JS.str(x, "color") ?? u.color, expiresAt: exp))
                self.sheetUser = nil
                Haptics.shared.success()
                store.beginImpersonation44(acc)
                store.paperGo("hjem")
            } catch {
                self.flash((error as? APIError)?.status == 403 ? "Du kan ikke logge inn som \(u.name)." : "Kunne ikke logge inn som \(u.name): " + error.localizedDescription)
            }
        }
    }

    func exit(_ store: Store) {
        guard let i = imp else { return }
        Haptics.shared.tap()
        let x: API = store.api
        Task { @MainActor in
            var msg: String = ""
            var changes: Int = 0
            var undo: String = ""
            var method: String = "POST"
            if let d = try? await x.callAt("/api", "POST", "/admin/impersonate/exit", json: [:], timeout: 15) {
                let o: [String: Any] = JS.obj(d)
                msg = JS.str(o, "message") ?? ""
                changes = JS.int(o, "changes") ?? 0
                undo = JS.str(JS.dict(o, "undo"), "path") ?? ""
                method = JS.str(JS.dict(o, "undo"), "method") ?? "POST"
            }
            self.writeImp(nil)
            store.endImpersonation44(i.tempId, back: i.adminId)
            if undo.hasPrefix("/api/") { undo = String(undo.dropFirst(4)) }
            if undo.isEmpty && changes > 0 { undo = "/users/\(i.userId)/layout/undo" }
            let n: String = changes == 1 ? "1 endring lagret" : "\(changes) endringer lagret"
            self.flash(msg.isEmpty ? "Logget ut av \(i.name) · \(n). Du er \(i.adminName) igjen." : msg, undo: undo, method: method)
            store.paperGo("innst-konto")
        }
    }

    /// Angre etter «Gå ut»: ruller tilbake endringene på X sin konto (som admin).
    func undo(_ store: Store) {
        let path: String = undoPath
        let method: String = undoMethod
        guard !path.isEmpty else { return }
        Haptics.shared.tap()
        toast = ""
        undoPath = ""
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", method, path, json: [:], timeout: 15)
                self.flash("Endringene er rullet tilbake")
            } catch { self.flash("Kunne ikke angre: " + error.localizedDescription) }
        }
    }

    /* ---------- Oppsett (kopier, tilbakestill, lås) ---------- */

    func layoutAction(_ u: Konto44User, _ action: String, _ store: Store) {
        Haptics.shared.tap()
        let path: String = "/users/\(u.id)/layout/" + action
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "POST", path, json: [:], timeout: 15)
                Haptics.shared.success()
                self.flash(action == "reset" ? "Oppsettet til \(u.name) er tilbakestilt" : "Oppsettet ditt er kopiert til \(u.name)", undo: "/users/\(u.id)/layout/undo")
            } catch { self.flash("Kunne ikke endre oppsettet: " + error.localizedDescription) }
        }
    }

    func lockedOf(_ u: Konto44User, _ store: Store) async -> Bool? {
        guard let d = try? await store.api.callAt("/api", "GET", "/users/\(u.id)/layout", timeout: 10) else { return nil }
        return JS.bool(JS.obj(d), "locked")
    }

    func setLocked(_ u: Konto44User, _ locked: Bool, _ store: Store) {
        Haptics.shared.select()
        Task { _ = try? await store.api.callAt("/api", "PUT", "/users/\(u.id)/layout/lock", json: ["locked": locked], timeout: 10) }
    }

    /* ---------- Eierskap ---------- */

    func loadOwner(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/server/owner", timeout: 12)
            let o: [String: Any] = JS.obj(d)
            let ow: [String: Any]? = JS.dict(o, "owner")
            ownerName = JS.str(ow, "name") ?? ""
            ownerSince = JS.fmt(JS.date(ow?["since"]), "d. MMMM yyyy")
            let me: [String: Any]? = JS.dict(o, "me")
            isOwner = JS.bool(me, "isOwner") ?? false
            canTransfer = JS.bool(me, "canTransfer") ?? false
            needsApproval = JS.bool(me, "needsApproval") ?? false
            candidates = JS.list(o, "candidates").map { Konto44.user($0) }
            pending = JS.list(o, "pending").map { (r: [String: Any]) -> [String: String] in Konto44.pendingRow(r) }
            ownerMissing = false
        } catch { ownerMissing = true }
    }

    nonisolated static func pendingRow(_ r: [String: Any]) -> [String: String] {
        let by: String = JS.str(JS.dict(r, "by"), "name") ?? JS.str(r, "byName") ?? ""
        let to: String = JS.str(JS.dict(r, "to"), "name") ?? JS.str(r, "toName") ?? ""
        let fallback: String = by + " vil overføre serveren til " + to
        return ["id": JS.str(r, "id") ?? "", "text": JS.str(r, "text") ?? fallback]
    }

    /// Face ID → lagret passord → reauth-token. nil = spør etter passordet i arket.
    func reauthToken(_ store: Store) async -> String? {
        guard let pw = Keychain.get(System31Auth.key(store)), !pw.isEmpty, !System31Auth.biometryName.isEmpty else { return nil }
        let ok: Bool = await System31Auth.evaluate("Bekreft overføringen av serveren")
        guard ok else { return nil }
        return await System31Auth.reauth(pw, store)
    }

    func transfer(_ to: Konto44User, password: String, token: String?, _ store: Store) async -> String? {
        var body: [String: Any] = ["toUserId": to.id]
        if let token { body["reauthToken"] = token } else { body["password"] = password }
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/server/owner/transfer", json: body, timeout: 30)
            let o: [String: Any] = JS.obj(d)
            Haptics.shared.success()
            let pend: Bool = JS.dict(o, "pending") != nil || JS.bool(o, "pending") == true
            let msg: String = JS.str(o, "message") ?? (pend ? "Eieren må godkjenne overføringen (48 t)." : "\(to.name) eier nå serveren. Du er fortsatt admin. \(to.name) har fått e-post og varsel.")
            flash(msg)
            await loadOwner(store)
            return nil
        } catch let e as APIError {
            Haptics.shared.error()
            return e.message
        } catch { return error.localizedDescription }
    }

    func decide(_ id: String, approve: Bool, _ store: Store) {
        Task { @MainActor in
            let tok: String? = approve ? await self.reauthToken(store) : nil
            var body: [String: Any] = [:]
            if let tok { body["reauthToken"] = tok }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/server/owner/transfer/\(id)/" + (approve ? "approve" : "reject"), json: body, timeout: 20)
                self.flash(JS.str(JS.obj(d), "message") ?? (approve ? "Overføringen er godkjent" : "Overføringen er avslått"))
                await self.loadOwner(store)
            } catch { self.flash((error as? APIError)?.message ?? error.localizedDescription) }
        }
    }
}

/* ---------- Seksjonene i Kontoer og brukere ---------- */

struct Konto44Sections: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if Konto44.isAdmin(store) && k.imp == nil { Konto44Family() }
            Konto44Owner()
        }
        .task(id: store.account?.id ?? "") {
            if Konto44.isAdmin(store) { await k.loadUsers(store) }
            await k.loadOwner(store)
        }
        .sheet(item: Binding<Konto44User?>(get: { k.sheetUser }, set: { k.sheetUser = $0 })) { (u: Konto44User) in
            Konto44PersonSheet(u: u).konto44Sheet(store, p)
        }
        .sheet(isPresented: Binding<Bool>(get: { k.transferOpen }, set: { k.transferOpen = $0 })) {
            Konto44TransferSheet().konto44Sheet(store, p)
        }
    }
}

struct Konto44SheetMod: ViewModifier {
    let store: Store
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .environment(\.paper, p)
            .environment(store)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .sheetEdge30(p.bg)
    }
}

extension View {
    func konto44Sheet(_ store: Store, _ p: PaperPalette) -> some View { modifier(Konto44SheetMod(store: store, p: p)) }
}

/// FAMILIE · LOGG INN SOM: én rad per person (ikke admin), trykk åpner arket.
struct Konto44Family: View {
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }

    var body: some View {
        let list: [Konto44User] = k.users.filter { $0.role != "admin" }
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                PLabel(text: "Familie · Logg inn som").padding(.top, 12).padding(.leading, 4).padding(.bottom, 6)
                VStack(spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Konto44User)) in
                        if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1).padding(.leading, 60) }
                        Konto44PersonRow(u: pair.element) { k.sheetUser = pair.element }
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }
}

struct Konto44Avatar: View {
    let u: Konto44User
    var size: CGFloat = 36

    var body: some View {
        Text(u.initial).font(PF.ui(size * 0.4, .heavy)).foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(u.color.isEmpty ? Media43Poster.tint(u.name) : Color(hex: u.color), in: Circle())
            .accessibilityHidden(true)
    }
}

struct Konto44PersonRow: View {
    @Environment(\.paper) private var p
    let u: Konto44User
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Konto44Avatar(u: u)
                VStack(alignment: .leading, spacing: 1) {
                    Text(u.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text("Logg inn som \(u.name) · uten passord").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Arket for en person: Logg inn som X (rød), Kopier mitt oppsett hit, Tilbakestill, «X kan endre selv».
struct Konto44PersonSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }
    let u: Konto44User
    @State private var canEdit: Bool = true
    @State private var askCopy: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader30(title: u.name, closeTitle: "Ferdig") { k.sheetUser = nil }
                HStack(spacing: 12) {
                    Konto44Avatar(u: u, size: 52)
                    Text(u.username.isEmpty ? u.role : "@" + u.username + " · " + u.role).font(PF.ui(13)).foregroundStyle(p.mut)
                }
                loginButton
                Text("Uten passord, fordi du er admin. Du ser appen akkurat som \(u.name), og endringer lagres på kontoen deres. Chat, Finans og Helse er skrivebeskyttet.")
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                Konto44SheetRows(u: u, canEdit: $canEdit, askCopy: $askCopy)
            }
            .padding(20)
        }
        .task { if let l = await k.lockedOf(u, store) { canEdit = !l } }
        .confirmationDialog("Kopiere oppsettet ditt til \(u.name)?", isPresented: $askCopy, titleVisibility: .visible) {
            Button("Kopier mitt oppsett hit") { k.layoutAction(u, "copy-from-me", store) }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private var loginButton: some View {
        Button { k.loginAs(u, store) } label: {
            Text(k.busy ? "Logger inn …" : "Logg inn som \(u.name)").font(PF.ui(16, .bold)).foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Color(hex: "#b23a2a"), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(k.busy)
    }
}

struct Konto44SheetRows: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }
    let u: Konto44User
    @Binding var canEdit: Bool
    @Binding var askCopy: Bool

    var body: some View {
        VStack(spacing: 0) {
            row("Kopier mitt oppsett hit", "Hjem, fanelinje og Mer") { askCopy = true }
            Rectangle().fill(p.line).frame(height: 1)
            row("Tilbakestill til standard", "Oppsettet til \(u.name) blir som nytt") { k.layoutAction(u, "reset", store) }
            Rectangle().fill(p.line).frame(height: 1)
            Toggle(isOn: Binding<Bool>(get: { canEdit }, set: { (v: Bool) in canEdit = v; k.setLocked(u, !v, store) })) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(u.name) kan endre selv").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(canEdit ? "Wiggle er på på telefonen deres" : "Oppsettet styres av deg").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
            }
            .tint(Color(hex: "#2f7d4f"))
            .padding(.horizontal, 14).frame(minHeight: 60)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func row(_ t: String, _ sub: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(t).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 6)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Pillen «Logget inn som X · Gå ut» og toasten ---------- */

struct Konto44Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var k: Konto44 { Konto44.shared }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) { if k.imp != nil { Konto44Pill().environment(\.paper, p) } }
            .overlay(alignment: .bottom) { if !k.toast.isEmpty { Konto44Toast().environment(\.paper, p) } }
            .onChange(of: store.account?.id ?? "") { (_: String, _: String) in k.check(store) }
            .onAppear { k.check(store) }
    }
}

extension View {
    func konto44Host(_ p: PaperPalette) -> some View { modifier(Konto44Host(p: p)) }

    /// Prompt 44: alle nye fullskjermer og lag i PaperShell samlet i ett kall (kort kjede for typesjekkeren).
    func hosts44(_ p: PaperPalette) -> some View { modifier(Hosts44(p: p)) }
}

struct Hosts44: ViewModifier {
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .logs44Host(p)
            .study44Host(p)
            .konto44Host(p)
    }
}

struct Konto44Pill: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }

    var body: some View {
        if let i = k.imp {
            HStack(spacing: 10) {
                Text(String(i.name.prefix(1)).uppercased()).font(PF.ui(11, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 24, height: 24).background(Color.white.opacity(0.25), in: Circle())
                Text("Logget inn som \(i.name)").font(PF.ui(13, .bold)).foregroundStyle(Color.white).lineLimit(1)
                Button { k.exit(store) } label: {
                    Text("Gå ut").font(PF.ui(13, .heavy)).foregroundStyle(Konto44Pill.tint(i))
                        .padding(.horizontal, 12).frame(height: 28)
                        .background(Color.white, in: Capsule())
                        .frame(minHeight: 44).contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 8).padding(.trailing, 4)
            .background(Konto44Pill.tint(i), in: Capsule())
            .shadow(color: Color.black.opacity(0.25), radius: 8, y: 4)
            .padding(.top, 4)
            .accessibilityElement(children: .contain)
        }
    }

    static func tint(_ i: Imp44State) -> Color { i.color.isEmpty ? Color(hex: "#7a3b5a") : Color(hex: i.color) }
}

struct Konto44Toast: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }

    var body: some View {
        HStack(spacing: 12) {
            Text(k.toast).font(PF.ui(13, .semibold)).foregroundStyle(p.bg).fixedSize(horizontal: false, vertical: true)
            if !k.undoPath.isEmpty {
                Button { k.undo(store) } label: {
                    Text("Angre").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#f0a6b4")).frame(minHeight: 36)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(p.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.horizontal, 16).padding(.bottom, 96)
        .transition(.opacity)
    }
}
