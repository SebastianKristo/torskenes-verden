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

    static func publish(_ snap: KalSnapshot) {
        guard KalGroup.linked else { return }
        let bases: [String] = MacSession.bases
        if let tok = MacSession.token, !bases.isEmpty, KalGroup.token != tok || KalGroup.bases != bases {
            KalGroup.saveSession(bases: bases, token: tok, user: MacSession.user, via: "mac")
        }
        KalNet.saveSnapshot(snap)
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
        if sig == lastSig { return }
        lastSig = sig
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func clear() {
        guard KalGroup.linked else { return }
        KalGroup.clearSession()
        lastSig = 0
        WidgetCenter.shared.reloadAllTimelines()
    }
}
