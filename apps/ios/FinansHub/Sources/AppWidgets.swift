import SwiftUI
import WidgetKit

/* ---------------- Widgets: innlogging i App Group og deep links ---------------- */

extension Store {
    /// Gir widgetene serveradressen og app-tokenet til kontoen som er i bruk (App Group).
    func syncWidgets(force: Bool = false) {
        guard let a = account else {
            if WidgetShared.token != nil { WidgetShared.clear(); WidgetCenter.shared.reloadAllTimelines() }
            KalCompanion33.clear()
            return
        }
        // Prompt 33: eget app-token for Kalender-appen i App Group-en (KalLink33.swift).
        KalCompanion33.sync(self)
        let changed = WidgetShared.token != a.token || WidgetShared.bases.first != (base.isEmpty ? a.server : base)
        WidgetShared.save(server: base.isEmpty ? a.server : base, external: a.external, local: a.local, token: a.token)
        if changed || force { WidgetCenter.shared.reloadAllTimelines() }
    }

    /// Skann bestilt fra widgeten (AppIntent) mens appen var lukket.
    func takePendingScan() {
        if let s = WidgetShared.pendingScan {
            WidgetShared.pendingScan = nil
            pendingScan = s
        }
    }

    /// finanshub://<side>[/<under>]. Et trykk på en widget åpner riktig side.
    func openDeepLink(_ url: URL) {
        guard url.scheme == "finanshub", loggedIn else { return }
        let page = (url.host ?? "").lowercased()
        let sub = url.pathComponents.dropFirst().first?.lowercased() ?? ""
        // Prompt 26: finanshub://kalender[/<id>] åpner Kalender (og detaljkortet for timen).
        // Prompt 33: kalender-login fra Kalender-appen, og widget-lenkene videre til Kalender-appen når den er installert.
        if page == "kalender-login" { KalCompanion33.loginLink(self); return }
        // Prompt 34: finanshub://brief (Glimt-brief-widgetene) åpner briefen i fullskjerm.
        if page == "brief" { if paper { paperGo("hjem") }; Brief34Model.shared.show(); return }
        if (page == "kalender" || page == "calendar") && KalLink33.forward(url) { return }
        if page == "kalender" || page == "calendar" { Cal26Model.shared.openLink(url, self); return }
        if paper { paperDeepLink(page, sub); return }
        switch page {
        case "homelab", "weather", "vaer": open(.homelab)
        case "tracking", "packages", "sporing": open(.tracking)
        case "budget", "budsjett": go(.budget)
        case "home", "finance", "finans": go(.home)
        case "list", "liste": go(.list)
        case "receipts", "review", "kvitteringer": open(.upload)
        case "subs", "nextcharge", "abonnement": open(.sub)
        case "stocks", "aksjer": open(.stocks)
        case "domains", "domener": open(.domains)
        case "mat", "matplan": open(.mat)
        case "finn": go(.finn)
        case "boliger", "folders": open(.folders)
        case "scan", "skann": pendingScan = sub == "files" ? "files" : "camera"
        case "news", "nyheter", "rss": openNews()
        default: goStart()
        }
    }

    /// Samme dyplenker i Papir: fanene og sidene i Papir-skallet.
    private func paperDeepLink(_ page: String, _ sub: String) {
        switch page {
        case "huske", "tasks", "huskeliste": paperGo("huske")
        case "bursdager", "bursdag", "birthdays": paperGo("bursdag")
        case "avganger", "ruter", "avg": paperGo("avg")
        case "familie", "family", "posisjon": paperGo("familie")
        case "tracking", "packages", "sporing": paperGo("sporing")
        case "mat", "matplan": paperGo("mat")
        case "home", "finance", "finans": paperGo("finans")
        case "list", "liste": paperGo("fliste")
        case "budget", "budsjett": paperGo("fmer"); paperOpenFin(.budget)
        case "finn": paperGo("finn")
        case "receipts", "review", "kvitteringer": paperGo("finans"); paperOpen(.upload)
        case "subs", "nextcharge", "abonnement": paperGo("fmer"); paperOpen(.sub)
        case "stocks", "aksjer": paperGo("fmer"); paperOpen(.stocks)
        case "domains", "domener": paperOpenDomains(from: "hjem")
        case "boliger", "folders": paperFinGo("boliger")
        // Prompt 32: Prøveperiode-widgeten åpner Abonnement; den gamle oppdateringssiden sendes til Nordlys OS.
        case "abo", "trials", "prover", "proveperioder": paperGo("abo")
        case "update", "oppdatering", "nordlys", "system": System31Model.shared.show()
        case "news", "nyheter", "rss": openNews()
        case "scan", "skann": pendingScan = sub == "files" ? "files" : "camera"
        default: paperGo("hjem")
        }
    }
}
