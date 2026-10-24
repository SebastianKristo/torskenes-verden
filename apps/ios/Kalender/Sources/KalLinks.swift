import Foundation
import SwiftUI

/* ---------------- Prompt 33: Kalender – dyplenker (applyLink() i fasiten) ---------------- */
// kalender://                      i dag
// kalender://dag/2026-10-21        Dag for datoen
// kalender://hendelse?id=…&date=…&t=…&s=…&e=…   Dag + hendelsesarket (id først, ellers dato + tittel + starttid)
// kalender://hendelse/<id>
// kalender://liste                 Agenda
// kalender://mnd · kalender://ar   Måned / År
// kalender://ny?text=…             Glimt-feltet ferdig utfylt
// kalender://glimt?q=…             Glimt-panelet med spørsmålet
// kalender://login                 Homelab-appen har skrevet innloggingen til App Group
// kalender://auth?code=…&state=…   Prompt 41: svaret fra Homelab etter «Logg inn med Homelab-appen»
// https://kalender.kristo.no/d/2026-10-21 (Universal Link, krever associated domains) → samme som dag/

@MainActor
enum KalLinks {
    static func handle(_ url: URL) {
        let s: KalStore = KalStore.shared
        let scheme: String = (url.scheme ?? "").lowercased()
        var host: String = (url.host ?? "").lowercased()
        var parts: [String] = url.pathComponents.filter { (p: String) -> Bool in p != "/" }
        if scheme == "https" || scheme == "http" {
            // /d/2026-10-21
            if parts.first == "d" { host = "dag"; parts = Array(parts.dropFirst()) }
        }
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ k: String) -> String? {
            let v: String? = items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value
            return (v ?? "").isEmpty ? nil : v
        }
        // Prompt 41: kalender://auth?code=…&state=… fra Homelab (PKCE). Håndteres før arkene lukkes.
        if host == "auth" && scheme == "kalender" {
            KalLogin41Model.shared.handleRedirect(url)
            return
        }
        if q("from") == "homelab" { s.fromHomelab = true }
        s.searchOpen = false
        s.drawerOpen = false
        s.newForm = nil
        s.detId = nil
        switch host {
        case "login":
            s.bootstrap()
            if !s.loggedIn { _ = s.adoptHomelab() }
        case "dag", "day":
            let d: String = parts.first ?? q("date") ?? KalD.todayKey()
            s.view = "dag"
            s.anchor = KalD.valid(d) ? d : KalD.todayKey()
            Task { await s.load() }
        case "hendelse", "event":
            openEvent(id: q("id") ?? parts.first, date: q("date"), title: q("t"), start: q("s"), end: q("e"))
        case "liste", "agenda":
            s.view = "liste"
            s.anchor = KalD.todayKey()
        case "mnd", "maned", "month":
            s.view = "mnd"
            s.anchor = q("date") ?? KalD.todayKey()
        case "ar", "year":
            s.view = "ar"
        case "ny", "new":
            if let t = q("text") { KalComposerModel.shared.text = t } else { s.openNew() }
        // Prompt 51: varselet «Ny enhet vil logge inn» → Innstillinger (SIKKERHET).
        case "innstillinger", "sikkerhet":
            if s.loggedIn { s.settingsOpen = true }
        case "glimt", "spor":
            s.glimtOpen = true
            if let text = q("q") { KalGlimtModel.shared.send(text) }
        default:
            s.anchor = KalD.todayKey()
            if let d = q("date"), KalD.valid(d) { s.anchor = d; s.view = "dag" }
        }
    }

    static func minutes(_ v: String?) -> Int? {
        guard let v else { return nil }
        let p: [Substring] = v.split(whereSeparator: { (c: Character) -> Bool in c == ":" || c == "." })
        guard let h = p.first.flatMap({ (x: Substring) -> Int? in Int(x) }) else { return nil }
        let m: Int = p.count > 1 ? (Int(p[1]) ?? 0) : 0
        return h * 60 + m
    }

    static func openEvent(id: String?, date: String?, title: String?, start: String?, end: String?) {
        let s: KalStore = KalStore.shared
        var day: String = date ?? ""
        if !KalD.valid(day), let id {
            // Serverens id-er slutter med datoen («g-…-20261021T1430»).
            if let m = KalRx.first("(\\d{4})(\\d{2})(\\d{2})(?:T\\d{4})?$", id) {
                day = (m.g(1) ?? "") + "-" + (m.g(2) ?? "") + "-" + (m.g(3) ?? "")
            }
        }
        if KalD.valid(day) {
            s.view = "dag"
            s.anchor = day
        }
        if let f = find(id: id, day: day, title: title, start: minutes(start)) {
            s.detId = f.id
            return
        }
        Task {
            await s.load(force: true)
            if let f = find(id: id, day: day, title: title, start: minutes(start)) {
                s.detId = f.id
                return
            }
            guard let title, KalD.valid(day) else { return }
            // Fant ikke hendelsen: arket viser data fra lenken.
            let st: Int? = minutes(start)
            var en: Int? = minutes(end)
            if st != nil && en == nil { en = (st ?? 0) + 60 }
            var ev: KalEvent = KalEvent(id: "x-" + (id ?? title), title: title, cal: KalCals.guess(title), day: day, s: st, e: en)
            ev.loc = "Fra Homelab"
            ev.rem = st == nil ? nil : 15
            s.linkEvent = ev
            s.detId = ev.id
        }
    }

    static func find(id: String?, day: String, title: String?, start: Int?) -> KalEvent? {
        let s: KalStore = KalStore.shared
        if let id, let e = s.event(id) { return e }
        guard let title, KalD.valid(day) else { return nil }
        let low: String = title.lowercased()
        return s.all.first { (e: KalEvent) -> Bool in
            if e.day != day { return false }
            let t: String = e.title.lowercased()
            if !(t.contains(low) || low.contains(t)) { return false }
            if let start { return e.s == start }
            return true
        }
    }
}
