import SwiftUI
import UIKit

/* ---------------- Prompt 46: Media sier «Utlogget» på mobil (andre gang) – den ekte årsaken ----------------
 Spesifikasjon: prompts/prompt-46-pakke/claude-code-media-mobil-utlogget-2.md.

 Funnet (testserver, samme token som appen får fra POST /finans/api/login, og samme kall som appen gjør):
   GET /api/media/upcoming            Bearer → 200   cookie → 200
   GET /api/media/qbit/torrents       Bearer → 401   cookie → 404
   GET /api/media/sonarr/series       Bearer → 401   cookie → 404
   GET /api/media/radarr/movie        Bearer → 401   cookie → 404
   GET /api/media/prowlarr/indexers   Bearer → 401   cookie → 404
 Serveren monterer `authed` (index.js, `authed.use('*', requireAuth)`) på /api til slutt. requireAuth godtar bare økt-cookie,
 så ALLE stier under /api som ingen rute har, svarer 401 «Ikke innlogget» til appen (Bearer) og 404 til web (cookie).
 Media-modulen prøver eldre/alternative stier først (/media/qbit/torrents før /media/torrents osv.) og går bare videre ved 404.
 Appen fikk derfor 401 på første sti, stoppet, og viste «Utlogget fra Homelab» – mens web (cookie) fikk 404 og gikk videre.
 Forrige rettelse (prompt 44) endret tekstene og statuskilden, men ikke dette.

 Retting her (appen):
 – Alle Media-kall går gjennom Media46.call: logger URL, metode, status, om Authorization-header var med, rute (Lokal/Ekstern) og tid.
 – 401 bekreftes mot GET /api/me (samme token, cache 60 s). Svarer /me 200, er innloggingen gyldig og 401 betyr «ruten finnes ikke»
   → behandles som 404 (neste sti prøves). Bare når /me også svarer 401 er man utlogget (code HOMELAB_AUTH).
 – Kanoniske stier først (de serveren faktisk har), eldre etterpå.
 – Plakater (/api/media/cover?…) lastes med token via egen laster; en bildefeil endrer aldri Media-status.
 – Trykk på feilmeldingen → «Vis detaljer» med de siste kallene.
 Serverdelen (SERVER46): ukjente /api-stier bør svare 404 også for Bearer, og 401 bør ha code:"HOMELAB_AUTH". */

struct Media46Call: Identifiable, Hashable {
    var id: Int
    var at: Date
    var method: String
    var path: String
    var status: Int
    var auth: Bool
    var route: String
    var ms: Int
    var note: String = ""
}

@MainActor
@Observable
final class Media46 {
    static let shared = Media46()

    /// De siste 40 kallene (nyeste først).
    var calls: [Media46Call] = []
    var detailsOpen: Bool = false
    @ObservationIgnored private var n: Int = 0
    @ObservationIgnored private var meAt: Date = .distantPast
    @ObservationIgnored private var meOk: Bool? = nil

    /// Ett Media-kall mot Homelab (/api…) med logg og riktig tolkning av 401.
    func call(_ store: Store, _ method: String, _ path: String, json: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
        let t0: Date = Date()
        let auth: Bool = !(store.account?.token ?? "").isEmpty
        do {
            let d: Data = try await store.api.callAt("/api", method, path, json: json, timeout: timeout)
            log(method, path, 200, auth, store, t0, "")
            return d
        } catch let e as APIError where e.status == 401 && !e.needsTotp {
            if e.code == "HOMELAB_AUTH" {
                log(method, path, 401, auth, store, t0, "HOMELAB_AUTH fra serveren")
                throw e
            }
            // SERVER46: gyldig token mot en rute som bare finnes for nettleseren – ikke utlogget.
            if e.code == "SESSION_REQUIRED" {
                log(method, path, 401, auth, store, t0, "SESSION_REQUIRED – krever nettleseren")
                throw APIError(message: "Dette kan bare gjøres i nettleseren.", status: 403, code: "SESSION_REQUIRED")
            }
            let valid: Bool? = await sessionValid(store)
            if valid == true {
                log(method, path, 401, auth, store, t0, "401 fra en sti serveren ikke har (innloggingen er gyldig, /api/me = 200) – behandlet som 404")
                throw APIError(message: "Serveren har ikke denne Media-funksjonen ennå (oppdater Homelab).", status: 404, code: "route_missing")
            }
            if valid == false {
                log(method, path, 401, auth, store, t0, "Utlogget: /api/me svarer også 401")
                throw APIError(message: e.message, status: 401, code: "HOMELAB_AUTH")
            }
            log(method, path, 401, auth, store, t0, "Kunne ikke bekrefte innloggingen (/api/me svarte ikke)")
            throw APIError(message: "Fikk ikke bekreftet innloggingen – serveren svarer ikke.", status: 0, code: "unverified")
        } catch let e as APIError {
            log(method, path, e.status, auth, store, t0, e.code ?? "")
            throw e
        }
    }

    /// Er tokenet gyldig? GET /api/me (authOrToken – godtar Bearer). nil = vet ikke (nett/tidsavbrudd).
    func sessionValid(_ store: Store) async -> Bool? {
        if let ok = meOk, Date().timeIntervalSince(meAt) < 60 { return ok }
        let t0: Date = Date()
        let auth: Bool = !(store.account?.token ?? "").isEmpty
        do {
            _ = try await store.api.callAt("/api", "GET", "/me", timeout: 8)
            log("GET", "/me", 200, auth, store, t0, "kontroll av innlogging")
            meOk = true
        } catch let e as APIError {
            log("GET", "/me", e.status, auth, store, t0, "kontroll av innlogging")
            if e.status == 401 { meOk = false } else if e.status > 0 { meOk = true } else { return nil }
        } catch {
            return nil
        }
        meAt = Date()
        return meOk
    }

    /// Serverens logg over de samme kallene (SERVER46: GET /api/media/diag → {calls:[{at, method, path, status, auth, ms, tokenAgeDays}]}).
    var serverCalls: [String] = []

    func loadServerLog(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/media/diag", timeout: 10) else { serverCalls = []; return }
        serverCalls = JS.list(JS.obj(d), "calls").prefix(15).map { (r: [String: Any]) -> String in
            let t: String = String((JS.str(r, "at") ?? "").dropFirst(11).prefix(8))
            var line: String = t + " " + (JS.str(r, "method") ?? "") + " " + (JS.str(r, "path") ?? "") + " → " + String(JS.int(r, "status") ?? 0)
            line += " · " + (JS.str(r, "auth") ?? "?")
            if let a = JS.int(r, "tokenAgeDays") { line += " · token \(a) d" }
            return line
        }
    }

    /// Ny konto eller ny innlogging: glem kontrollen.
    func reset() {
        meOk = nil
        meAt = .distantPast
    }

    private func log(_ method: String, _ path: String, _ status: Int, _ auth: Bool, _ store: Store, _ t0: Date, _ note: String) {
        n += 1
        let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
        let c: Media46Call = Media46Call(id: n, at: Date(), method: method, path: "/api" + path, status: status, auth: auth, route: store.route, ms: ms, note: note)
        calls.insert(c, at: 0)
        if calls.count > 40 { calls.removeLast(calls.count - 40) }
        #if DEBUG
        print("[media46] \(method) /api\(path) → \(status) auth=\(auth) route=\(store.route) \(ms) ms \(note)")
        #endif
    }

    /// Siste kall som feilet (for «Vis detaljer»).
    var lastFailure: Media46Call? { calls.first { $0.status >= 400 || $0.status == 0 } }

    /// Teksten «Vis detaljer» kopierer.
    var report: String {
        let f: DateFormatter = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return calls.prefix(20).map { (c: Media46Call) -> String in
            f.string(from: c.at) + " " + c.method + " " + c.path + " → " + String(c.status) + " · token " + (c.auth ? "ja" : "nei") + " · " + c.route + " · " + String(c.ms) + " ms" + (c.note.isEmpty ? "" : " · " + c.note)
        }.joined(separator: "\n")
    }
}

/* ---------- «Vis detaljer» ---------- */

struct Media46Details: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media46 { Media46.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader30(title: "Detaljer", closeTitle: "Ferdig") { m.detailsOpen = false }
                Text("SISTE MEDIA-KALL · STATUSKODE, TJENESTE OG TIDSPUNKT").font(PF.mono(10)).tracking(1.1).foregroundStyle(p.lab)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 0) {
                    ForEach(m.calls) { (c: Media46Call) in
                        Media46CallRow(c: c)
                        Rectangle().fill(p.line).frame(height: 1)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                if !m.serverCalls.isEmpty {
                    Text("SERVERENS LOGG (SAMME KALL)").font(PF.mono(10)).tracking(1.1).foregroundStyle(p.lab)
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(m.serverCalls.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                            Text(pair.element).font(PF.mono(10.5, bold: false)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                Button {
                    UIPasteboard.general.string = m.report + (m.serverCalls.isEmpty ? "" : "\n--- server ---\n" + m.serverCalls.joined(separator: "\n"))
                    Haptics.shared.success()
                } label: {
                    Text("Kopier logg").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(20)
        }
        .task { await m.loadServerLog(store) }
    }
}

struct Media46CallRow: View {
    @Environment(\.paper) private var p
    let c: Media46Call

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 8) {
                Text(String(c.status)).font(PF.mono(12)).foregroundStyle(color)
                Text(c.method + " " + c.path).font(PF.mono(11, bold: false)).foregroundStyle(p.ink).lineLimit(2)
            }
            Text(meta).font(PF.ui(11.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var color: Color {
        if c.status >= 200 && c.status < 300 { return Color(hex: "#2f6b4a") }
        if c.status == 404 { return Color(hex: "#a0671a") }
        return Color(hex: "#b23a2a")
    }

    private var meta: String {
        let f: DateFormatter = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        var s: String = f.string(from: c.at) + " · token " + (c.auth ? "med" : "mangler") + " · " + c.route + " · " + String(c.ms) + " ms"
        if !c.note.isEmpty { s += " · " + c.note }
        return s
    }
}

/* ---------- Plakater med token ---------- */

/// Laster plakater fra Homelab (/api/media/cover?… og /api/media/poster?…) med Authorization-header, cachet i minnet.
/// Absolutte https-URL-er (TMDB/TheTVDB) lastes direkte. Feil gir bare forbokstaven – aldri «Utlogget».
@MainActor
final class Media46Images {
    static let shared = Media46Images()
    private let cache: NSCache<NSString, UIImage> = NSCache<NSString, UIImage>()
    private var failed: Set<String> = []

    func cached(_ url: String) -> UIImage? { cache.object(forKey: url as NSString) }

    func load(_ url: String, _ store: Store) async -> UIImage? {
        if let i = cached(url) { return i }
        if failed.contains(url) { return nil }
        var data: Data? = nil
        if url.hasPrefix("/") {
            data = try? await store.api.bytes(url)
        } else if let u = URL(string: url), u.scheme == "https" || u.scheme == "http" {
            data = try? await URLSession.shared.data(from: u).0
        }
        guard let data, let img = UIImage(data: data) else {
            failed.insert(url)
            return nil
        }
        cache.setObject(img, forKey: url as NSString)
        return img
    }
}

struct Media46PosterImage: View {
    @Environment(Store.self) private var store
    let url: String
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            if let img { Image(uiImage: img).resizable().scaledToFill().transition(.opacity) } else { Color.clear }
        }
        .task(id: url) {
            if let c = Media46Images.shared.cached(url) { img = c; return }
            let i: UIImage? = await Media46Images.shared.load(url, store)
            withAnimation(.easeOut(duration: 0.2)) { img = i }
        }
    }
}
