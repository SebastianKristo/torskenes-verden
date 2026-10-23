import Foundation
import WidgetKit

/* ---------------- Prompt 41: Kalender for Mac – data til widgetene (KalenderMacWidgets) ---------------- */
// Widgetene (samme kode som iOS, KalenderWidgets/Sources) leser bufferen og innloggingen fra App Group-en
// <TeamID>.group.no.kristo.kalender. Den finnes bare når appen er signert med et team (KalGroup.linked); ellers gjør dette ingenting
// og widgetene viser «Krever signering med Team ID». Oppdatering: WidgetCenter.reloadAllTimelines() når dataene endres
// (lagring i appen eller push fra Homelab via MacLive → load → saveSnapshot), og tidslinjen selv per hendelse + midnatt.

@MainActor
enum MacWidgets41 {
    private static var lastSig: Int = 0

    /// Prompt 45: bare sjekken her (hovedtråden, rask). true = innholdet er endret og widgetene skal tegnes på nytt.
    /// Selve kodingen og skrivingen til App Group-en gjør MacSnap45 i bakgrunnen (den låste hovedtråden før).
    static func needsPublish(_ snap: KalSnapshot) -> Bool {
        guard KalGroup.linked else { return false }
        let bases: [String] = MacSession.bases
        if let tok = MacSession.token, !bases.isEmpty, KalGroup.token != tok || KalGroup.bases != bases {
            KalGroup.saveSession(bases: bases, token: tok, user: MacSession.user, via: "mac")
        }
        var h: Hasher = Hasher()
        for e in snap.events.prefix(300) {
            h.combine(e.id)
            h.combine(e.day)
            h.combine(e.s)
            h.combine(e.e)
            h.combine(e.title)
            h.combine(e.cal)
        }
        h.combine(KalD.todayKey())
        let sig: Int = h.finalize()
        if sig == lastSig { return false }
        lastSig = sig
        return true
    }

    /// Fra MacSnap45-køen etter at bufferen er skrevet (én gang per endring, aldri i løkke).
    nonisolated static func reloadFromBackground() {
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func clear() {
        guard KalGroup.linked else { return }
        KalGroup.clearSession()
        lastSig = 0
        WidgetCenter.shared.reloadAllTimelines()
    }
}
