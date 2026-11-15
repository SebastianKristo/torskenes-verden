import SwiftUI

/* ---------------- Prompt 46: Kalender for Mac – startverdier for «+ Ny hendelse» og standardkalender ---------------- */
// Spesifikasjon: claude-code-kalender-ny-hendelse-graa-skjerm.md og claude-code-glimt-kalender-standardkalender.md.
// «+» uten valgt dag: i dag i Måned/År/Liste, ellers i dag hvis den vises, ellers første synlige dag – kl. neste hele time.
// Ny hendelse havner i standardkalenderen (Innstillinger → Kalender → Standardkalender), ellers Google, ellers Personlig.

extension MacWin {
    func newDay46() -> String {
        let tk: String = KalD.todayKey()
        if view == "mnd" || view == "ar" || view == "liste" { return tk }
        let a: Date = KalD.date(KalD.valid(anchor) ? anchor : tk)
        let first: Date = view == "uke" ? KalWeek35.start(a) : a
        let n: Int = view == "uke" ? 7 : (view == "3d" ? 3 : 1)
        for i in 0..<n where KalD.key(KalD.add(first, i)) == tk { return tk }
        return KalD.key(first)
    }
}

/// Innstillinger → Standardkalender (skrivbare kalendere, lagres i profilen).
struct MacDefCal46Picker: View {
    @ObservedObject var store: MacStore = MacStore.shared

    private var list: [KalCal] { store.cals.filter { (c: KalCal) -> Bool in KalDef46.usable(c) } }

    var body: some View {
        Picker("Standardkalender", selection: Binding<String>(get: { store.defCalId46 }, set: { (v: String) in
            store.defCal46 = v
            store.savePrefs(["defaultCalendar": v])
        })) {
            ForEach(list) { (c: KalCal) in
                Text(c.name).tag(c.id)
            }
        }
    }
}
