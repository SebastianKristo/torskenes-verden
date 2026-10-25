import SwiftUI

/* ---------------- Prompt 52: Glimt-figur per bruker ----------------
 Spesifikasjon: claude-code-glimt-blekksprut.md («Figur per bruker») og SERVER52-API.md § 6.
 – Valget ligger på brukerprofilen på serveren (glimt_char), så det følger brukeren på alle enheter. /api/glimt/settings er per bruker
   og gir `char` = brukerens valg, ellers admins standard for brukeren, ellers «glimt».
 – På enheten bufres figuren per konto (`glimt_char_<konto>`), så et kontobytte ikke viser forrige brukers figur før serveren svarer.
 – Admin: «Standardfigur per bruker» (GET /api/admin/glimt-char52, PUT /api/admin/glimt-char52/:userId {default}).
   Ingen navn er hardkodet – standarden settes som innstilling. */

@MainActor
enum Glimt52CharCache {
    static func key(_ store: Store) -> String? {
        guard let id = store.account?.id, !id.isEmpty else { return nil }
        return "glimt_char_" + id
    }

    /// Figuren som sist ble brukt for denne kontoen (nil = ingen buffer).
    static func cached(_ store: Store) -> String? {
        guard let k = key(store), let v = UserDefaults.standard.string(forKey: k), Glimt35Char.valid(v) else { return nil }
        return v
    }

    static func remember(_ store: Store, _ char: String) {
        guard let k = key(store), Glimt35Char.valid(char) else { return }
        UserDefaults.standard.set(char, forKey: k)
    }
}

struct Glimt52UserDefault: Identifiable, Hashable {
    let id: String
    let name: String
    var def: String
    var char: String
    var source: String
}

@MainActor
@Observable
final class Glimt52Admin {
    static let shared = Glimt52Admin()

    var users: [Glimt52UserDefault] = []
    var loaded: Bool = false
    var unsupported: Bool = false
    var note: String = ""

    func load(_ store: Store) async {
        guard store.account?.role == "admin" else { return }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/admin/glimt-char52", timeout: 15)
            users = JS.list(JS.obj(d), "users").compactMap { (o: [String: Any]) -> Glimt52UserDefault? in
                guard let id = JS.str(o, "id") else { return nil }
                return Glimt52UserDefault(id: id, name: JS.str(o, "name") ?? id, def: JS.str(o, "default") ?? "",
                                          char: JS.str(o, "char") ?? "glimt", source: JS.str(o, "source") ?? "")
            }
            unsupported = false
        } catch let e as APIError where e.status == 404 {
            unsupported = true
        } catch {}
        loaded = true
    }

    func setDefault(_ u: Glimt52UserDefault, _ char: String?, _ store: Store) {
        Haptics.shared.select()
        if let i = users.firstIndex(where: { $0.id == u.id }) { users[i].def = char ?? "" }
        let enc: String = u.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? u.id
        let body: [String: Any] = ["default": char.map { $0 as Any } ?? NSNull()]
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/admin/glimt-char52/\(enc)", json: body, timeout: 15)
                self.note = "Lagret"
                await self.load(store)
            } catch let e as APIError {
                self.note = e.message
            } catch {
                self.note = error.localizedDescription
            }
        }
    }
}

/// Innstillinger → Glimt: «Standardfigur per bruker» (bare admin). Gjelder til brukeren velger selv.
struct Glimt52AdminDefaults: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt52Admin { Glimt52Admin.shared }

    var body: some View {
        if store.account?.role == "admin" {
            VStack(alignment: .leading, spacing: 8) {
                Glimt35Label(text: "STANDARDFIGUR PER BRUKER").padding(.top, 4)
                if m.unsupported {
                    Text("Serveren støtter ikke dette ennå. Oppdater homelab.").font(PF.ui(12.5)).foregroundStyle(Brief34C.mut)
                } else if m.users.isEmpty {
                    Text(m.loaded ? "Ingen brukere" : "Henter …").font(PF.ui(12.5)).foregroundStyle(Brief34C.mut)
                }
                ForEach(m.users) { (u: Glimt52UserDefault) in row(u) }
                Text("Standarden gjelder til brukeren velger en figur selv.").font(PF.ui(12)).foregroundStyle(Brief34C.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .task(id: store.account?.id ?? "") { await m.load(store) }
        }
    }

    private func row(_ u: Glimt52UserDefault) -> some View {
        HStack(spacing: 10) {
            Glimt35Live(id: u.char, size: 28, mood: .idle).glimt40NoJul().frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(u.name).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                Text(u.source == "user" ? "Valgt selv: " + Glimt35Char.get(u.char).name : "Bruker standard").font(PF.ui(12)).foregroundStyle(Brief34C.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            Menu {
                Button("Ingen standard") { m.setDefault(u, nil, store) }
                ForEach(Glimt35Char.all) { (c: Glimt35Char) in
                    Button(c.name + (u.def == c.id ? " ✓" : "")) { m.setDefault(u, c.id, store) }
                }
            } label: {
                Text(u.def.isEmpty ? "Ingen" : Glimt35Char.get(u.def).name).font(PF.ui(13, .bold)).foregroundStyle(Brief34C.ink)
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(Brief34C.rgb(0xefe9dc), in: Capsule())
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
