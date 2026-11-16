import SwiftUI
import WidgetKit

/* ---------------- Widgets: innlogging i App Group og deep links ---------------- */

extension Store {
    /// Gir widgetene serveradressen og app-tokenet til kontoen som er i bruk (App Group).
    func syncWidgets(force: Bool = false) {
        guard let a = account else {
            if WidgetShared.token != nil { WidgetShared.clear(); WidgetCenter.shared.reloadAllTimelines() }
            KalCompanion33.clear()
            // Prompt 41: «Fortsett som» i Kalender forsvinner ved utlogging.
            KalShared41.clear()
            return
        }
        // Prompt 41: delt enhets-token for «Fortsett som» i Kalender (AppAuth.swift).
        AppAuth41.shareDevice(self)
        // Prompt 33: eget app-token for Kalender-appen i App Group-en (KalenderLink.swift).
        KalCompanion33.sync(self)
        // Prompt 85: offline-køen følger kontoen, ikke enheten (Offline51.bind i PlatformShared.swift).
        Offline51.bind(a.username.trimmingCharacters(in: .whitespaces).lowercased() + "|" + API.normalize(a.server).lowercased())
        // «Skjul beløp»: widgetene følger appens personvernvalg (WidgetShared.medBelopsvalg / skjulBelop).
        let skjul: Bool = hideAmounts
        let changed = WidgetShared.token != a.token || WidgetShared.bases.first != (base.isEmpty ? a.server : base) || WidgetShared.hideAmounts != skjul
        WidgetShared.hideAmounts = skjul
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

    /// finanshub://<side>[/<under>] og homelab://<side>[/<under>]. Et trykk på en widget åpner riktig side.
    /// Fase 6: modul-id-ene og hash-rutene fra web går via modullisten (Dyplenker.swift).
    func openDeepLink(_ url: URL) {
        guard url.scheme == "finanshub" || url.scheme == "homelab", loggedIn else { return }
        let page = (url.host ?? "").lowercased()
        let sub = url.pathComponents.dropFirst().first?.lowercased() ?? ""
        // Q35: dyplenker går forbi velkomststegene.
        noteDeepLink()
        // En hash-rute fra web (homelab://app#/kalender/bursdager) slås opp blant rutene og aliasene i modullisten.
        if let f = url.fragment, f.hasPrefix("/"), openRute("#" + f) { return }
        if openOkonomiLenke(page, sub) { return }
        // Prompt 26: finanshub://kalender[/<id>] åpner Kalender (og detaljkortet for timen).
        // Prompt 33: kalender-login fra Kalender-appen, og widget-lenkene videre til Kalender-appen når den er installert.
        if page == "kalender-login" { KalCompanion33.loginLink(self); return }
        // Prompt 51 (IOSFEAT51): planlegging, familiekalender, ikveld, sok (Feat51Links i GlobalSearch.swift).
        if Feat51Links.handle(page, sub, url, self) { return }
        // Prompt 34: finanshub://brief (Glimt-brief-widgetene) åpner briefen i fullskjerm.
        if page == "brief" { paperGo("hjem"); Brief34Model.shared.show(); return }
        // Prompt 37: bibelvers-widgetene (finanshub://bibel) åpner Bibel-siden.
        if page == "bibel" || page == "bible" { paperGo("bibel"); return }
        // Prompt 35: fra Kalender-appen – finanshub://glimt (Innstillinger → Glimt) og finanshub://integrasjoner.
        if page == "glimt" { paperGo("hjem"); Glimt35Model.shared.showPage = true; return }
        if page == "integrasjoner" || page == "integrations" { paperGo("innst-integ"); return }
        // Prompt 68: finanshub://husstand, brukere-og-familie og innstillinger/familie → Innstillinger → Brukere og familie.
        if Users68.isLink(page, sub) { paperGo(Users68.key); return }
        // Prompt 67: finanshub://faste-oppgaver, glimt-husker, kvalitet/run/<id> og kvalitet/uke/<uke> (deepLink i push fra serveren).
        if ["faste-oppgaver", "glimt-husker", "kvalitet"].contains(page), let go = G67Nav.page("/" + page + url.path) { G67Nav.open(go, self); return }
        if (page == "kalender" || page == "calendar") && KalLink33.forward(url) { return }
        if page == "kalender" || page == "calendar" { KalenderData.shared.openLink(url, self); return }
        // Prompt 42: bare Papir (de klassiske dyplenkene er slettet).
        paperDeepLink(page, sub)
    }

    /// Samme dyplenker i Papir: fanene og sidene i Papir-skallet.
    private func paperDeepLink(_ page: String, _ sub: String) {
        switch page {
        case "huske", "tasks", "huskeliste", "gjoremal", "todo": paperGo("huske")
        case "bursdager", "bursdag", "birthdays": paperGo("bursdag")
        case "avganger", "ruter", "avg": paperGo("avg")
        case "familie", "family", "posisjon": paperGo("familie")
        // Prompt 40: Live Activity / Hjemlys-varsel → Familie (Hjemlys-kortet øverst).
        case "hjemlys": paperGo("familie"); Task { await Hjemlys40Model.shared.load(self) }
        case "tracking", "packages", "sporing": paperGo("sporing")
        case "mat", "matplan": paperGo("mat")
        case "home", "finance", "finans": paperGo("finans")
        case "list", "liste": paperGo("fliste")
        case "budget", "budsjett": paperGo("fmer"); paperOpenFin(.budget)
        case "finn": paperGo("finn")
        case "receipts", "review", "kvitteringer": paperGo("finans"); paperOpen(.upload)
        // Fase 6 (Q4): Abonnementer er et filter i Faste betalinger (finanshub://abonnement fra Glimt og widgetene).
        case "subs", "nextcharge", "abonnement", "abonnementer": FasteBetalingerModell.shared.filter = "abonnementer"; paperGo("abo")
        case "stocks", "aksjer": paperGo("fmer"); paperOpen(.stocks)
        case "domains", "domener": paperOpenDomains(from: "hjem")
        case "boliger", "folders": paperFinGo("boliger")
        // Prompt 32: Prøveperiode-widgeten åpner Abonnement; den gamle oppdateringssiden sendes til Nordlys OS.
        case "abo", "trials", "prover", "proveperioder": paperGo("abo")
        case "update", "oppdatering", "nordlys", "system": System31Model.shared.show()
        case "news", "nyheter", "rss": openNews()
        case "scan", "skann": pendingScan = sub == "files" ? "files" : "camera"
        default:
            // Fase 6: modul-id-ene og de nye rutene («reise/kart», «kalender/familie», «oversikt», «skjold» …).
            if let t = ModulListe.shared.liste?.treff(rute: "#/" + page + (sub.isEmpty ? "" : "/" + sub)), openModul(t.modul.id, underside: t.underside?.id) { return }
            if openModul(page, underside: sub.isEmpty ? nil : sub) { return }
            paperGo("hjem")
        }
    }
}
