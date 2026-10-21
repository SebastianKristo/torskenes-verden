import SwiftUI
import UIKit

/* ---------------- Prompt 33: Homelab → Kalender-appen ---------------- */
// Fasit: design/Mobil Papir App.dc.html → goKal(o) / kalLink. Alt kalender-relatert i Homelab (widget på Hjem, kalenderfanen,
// Glimt «Åpne kalender», varsler) åpner Kalender-appen på riktig sted med kalender://…. Er Kalender ikke installert
// (canOpenURL er false – krever LSApplicationQueriesSchemes [kalender]) brukes Homelabs egen kalenderside som før.
// KalCompanion33: et eget app-token for Kalender (POST /api/tokens/companion {app:'kalender'}, reserve POST /finans/api/tokens)
// skrives til App Group-en (KalGroup.saveHomelab), så Kalender logger inn uten passord.

@MainActor
enum KalLink33 {
    /// Satt rundt flyter som må vise Homelabs egen kalenderside (skjemaet for en feilet rask time).
    static var stayInHomelab: Bool = false

    static var installed: Bool {
        guard let u = URL(string: "kalender://") else { return false }
        return UIApplication.shared.canOpenURL(u)
    }

    /// true = Kalender-appen åpnes.
    @discardableResult
    static func open(_ link: String) -> Bool {
        if stayInHomelab { return false }
        guard let u = URL(string: link), installed else { return false }
        Haptics.shared.select()
        UIApplication.shared.open(u)
        return true
    }

    static func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? s }

    @discardableResult static func today() -> Bool { open("kalender://?from=homelab") }
    @discardableResult static func list() -> Bool { open("kalender://liste?from=homelab") }

    @discardableResult
    static func day(_ key: String) -> Bool {
        let k: String = String(key.prefix(10))
        return open("kalender://dag/" + k + "?from=homelab")
    }

    /// kalender://hendelse?id=…&date=…&t=…&s=…&e=… (Kalender matcher på id, ellers dato + tittel + starttid).
    @discardableResult
    static func event(_ e: CalEvent26) -> Bool {
        var s: String = "kalender://hendelse?id=" + enc(e.id) + "&date=" + e.dayKey + "&t=" + enc(e.title)
        if !e.allDay && e.startMin >= 0 { s += "&s=" + e.startText + "&e=" + e.endText }
        return open(s + "&from=homelab")
    }

    /// finanshub://kalender[/<id>][?date=…] fra widgetene → tilsvarende kalender://. ?quick= blir i Homelab (skjemaet).
    static func forward(_ url: URL) -> Bool {
        if !installed { return false }
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if items.contains(where: { (i: URLQueryItem) -> Bool in i.name == "quick" }) { return false }
        let parts: [String] = url.pathComponents.filter { (p: String) -> Bool in p != "/" }
        if let raw = parts.first, !raw.isEmpty {
            let id: String = raw.removingPercentEncoding ?? raw
            if let e = Cal26Model.shared.events.first(where: { (x: CalEvent26) -> Bool in x.id == id }) { return event(e) }
            return open("kalender://hendelse?id=" + enc(id) + "&from=homelab")
        }
        if let d = items.first(where: { (i: URLQueryItem) -> Bool in i.name == "date" })?.value, d.count >= 10 { return day(d) }
        return today()
    }
}

@MainActor
enum KalCompanion33 {
    static let scopes: [String] = ["finance:read", "finance:write", "receipts:write", "read:transactions", "read:summary", "read:budget", "write:transactions"]
    private static var busy: Bool = false

    /// Kalles fra syncWidgets(): lager et nytt Kalender-token når kontoen er ny eller tokenet mangler.
    static func sync(_ store: Store, force: Bool = false) {
        guard KalGroup.linked, let a = store.account, !busy else { return }
        let fp: String = KalGroup.fingerprint(a.token)
        if !force && KalGroup.homelabToken != nil && KalGroup.homelabFor == fp { return }
        // Ikke prøv igjen hvert sekund når serveren sier nei.
        let last: Double = UserDefaults.standard.double(forKey: "kal33.lastTry")
        if !force && Date().timeIntervalSince1970 - last < 3600 && KalGroup.homelabFor == fp { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "kal33.lastTry")
        busy = true
        Task {
            defer { busy = false }
            await create(store, a)
        }
    }

    private static func create(_ store: Store, _ a: LoginAccount) async {
        let api: API = store.api
        var token: String? = nil
        do {
            // Prompt 44 (KAL44): iPad fikk også «iPhone», og et nytt token for samme app + enhet trekker tilbake det gamle –
            // Homelab på iPad logget dermed ut Kalender på iPhone.
            let dev: String = UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
            let d: Data = try await api.callAt("/api", "POST", "/tokens/companion", json: ["app": "kalender", "device": dev], timeout: 15)
            token = JS.str(JS.obj(d), "token")
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 {
                let body: [String: Any] = ["name": "Kalender (iPhone)", "scopes": scopes, "expiresDays": NSNull()]
                if let d = try? await api.call("POST", "/tokens", json: body) { token = JS.str(JS.obj(d), "token") }
            }
        } catch {}
        guard let token, !token.isEmpty else {
            // Ingen nytt token: Kalender bruker sin egen innloggingsskjerm.
            if KalGroup.homelabFor != KalGroup.fingerprint(a.token) { KalGroup.clearHomelab() }
            return
        }
        var bases: [String] = []
        for b in [store.base.isEmpty ? a.server : store.base, a.server, a.external, a.local] where !b.isEmpty && !bases.contains(b) { bases.append(b) }
        KalGroup.saveHomelab(bases: bases, token: token, user: a.label, accountToken: a.token)
    }

    static func clear() {
        KalGroup.clearHomelab()
    }

    /// finanshub://kalender-login fra Kalender-appen: lag tokenet og send brukeren tilbake.
    static func loginLink(_ store: Store) {
        guard store.loggedIn, let a = store.account else { return }
        Task {
            await create(store, a)
            if let u = URL(string: "kalender://login") { _ = await UIApplication.shared.open(u) }
        }
    }
}
