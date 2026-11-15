import Foundation

/* ---------------- Dyplenker til modulene (Fase 6, Q29, Q35) ----------------
 Gamle og nye lenker går til samme sted via modullisten (shared/schemas/moduler.json, rute og aliaser):
 – finanshub://<modul>[/<underside>] og homelab://<modul>[/<underside>] med modul-id-ene («gjoremal», «reise», «oversikt»),
   undersidene («kalender/bursdager», «reise/kart», «familie/kart») og de eldre navnene som før («huskeliste», «avganger» …).
 – En hash-rute fra web i lenken (homelab://app#/kalender/familie, https://<server>/#/huskeliste) slås opp blant rutene og
   aliasene i modullisten («#/huskeliste» → Gjøremål, «#/kart» → Reise → Kart, «#/bursdager» → Kalender → Bursdager).
 – Q35: en dyplenke åpnes uten at velkomststegene legger seg over (de kommer neste gang appen startes). */

extension Store {
    /// true like etter en dyplenke (to minutter): velkomststegene vises ikke over siden lenken åpnet.
    var deepLinkRecent: Bool { Date().timeIntervalSince(deepLinkAt) < 120 }

    /// Noter en dyplenke og lukk velkomststegene for denne gangen (Q35). Ingenting lagres som «fullført».
    func noteDeepLink() {
        deepLinkAt = Date()
        if onboarding != nil { onboarding = nil }
    }

    /// En rute fra web («#/huskeliste», «#/kalender/bursdager», «/finans/») → riktig side i appen. false = ukjent rute.
    @discardableResult
    func openRute(_ rute: String) -> Bool {
        guard let t = ModulListe.shared.liste?.treff(rute: rute) else { return false }
        return openModul(t.modul.id, underside: t.underside?.id)
    }

    /// Åpne en modul (modul-id) og ev. en underside. false = modulen finnes ikke i appen.
    @discardableResult
    func openModul(_ id: String, underside: String?) -> Bool {
        let u: String = underside ?? ""
        switch id {
        case "kalender":
            if u == "bursdager" { paperGo("bursdag"); return true }
            if u == "familie" { FamCal51.shared.show(); return true }
            paperGo("kalender")
            return true
        case "reise":
            if u == "kart" { Kart46.shared.show(self); return true }
            paperGo("avg")
            return true
        case "familie":
            paperGo("familie")
            let fane: [String: String] = ["kart": "fkart", "steder": "soner", "helse": "helse", "sjekk": "hjemlys", "folk": "kart"]
            if let f = fane[u] { FamilyModel.shared.tab = f }
            return true
        case "finans":
            paperGo("finans")
            return true
        case "nyheter":
            openNews()
            return true
        default:
            guard let side = ModulSider.side[id] else { return false }
            paperMainTab(side)
            return true
        }
    }

    /// Undersider i Økonomi som har egne lenker (finanshub://transaksjoner, finanshub://faste-betalinger/<filter>).
    func openOkonomiLenke(_ page: String, _ sub: String) -> Bool {
        switch page {
        case "transaksjoner":
            paperGo("fliste")
            return true
        case "faste-betalinger", "faste", "fast":
            let f: String = ["abonnementer", "faste", "planlagte"].contains(sub) ? sub : FasteBetalingerModell.shared.filter
            FasteBetalingerModell.shared.filter = f
            paperGo("abo")
            return true
        case "sparing", "sparing-og-planer", "plan":
            Plan51.shared.show()
            return true
        default:
            return false
        }
    }
}
