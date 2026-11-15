import Foundation
import WidgetKit
import SwiftUI

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

/* ---------------- Prompt 70 (KAL70): Kalender for Mac – Innstillinger → Widgets ---------------- */
// Samme valg som på iPhone/iPad (KalWPrefs70 i App Group-en): kalendere widgetene viser (standard alle) og
// «Skjul fullførte i dag». Uten Team ID-signering finnes ikke App Group-en, og widgetene får ikke data (vises som merknad).

struct MacWidgets70Section: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var off: Set<String> = KalWPrefs70.off
    @State private var hideDone: Bool = KalWPrefs70.hideDone

    private var cals: [KalCal] {
        store.cals.filter { (c: KalCal) -> Bool in c.shown }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(cals) { (c: KalCal) in
                Toggle(isOn: binding(c.id)) {
                    HStack(spacing: 8) {
                        Circle().fill(Color(kalHex: c.hex)).frame(width: 9, height: 9)
                        Text(c.name)
                    }
                }
            }
            Toggle("Skjul fullførte i dag", isOn: Binding<Bool>(get: { hideDone }, set: { (v: Bool) in
                hideDone = v
                KalWPrefs70.hideDone = v
                WidgetCenter.shared.reloadAllTimelines()
            }))
            Text(note).font(MacFont.ui(11.5)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
        }
        .font(MacFont.ui(13.5))
    }

    private var note: String {
        if !KalGroup.linked { return "Widgets på skrivebordet krever at appen er signert med Team ID (App Group)." }
        return "Legg til: høyreklikk på skrivebordet → Rediger widgets → Kalender."
    }

    private func binding(_ id: String) -> Binding<Bool> {
        Binding<Bool>(get: { !off.contains(id) }, set: { (v: Bool) in
            KalWPrefs70.set(id, shown: v)
            off = KalWPrefs70.off
            WidgetCenter.shared.reloadAllTimelines()
        })
    }
}
