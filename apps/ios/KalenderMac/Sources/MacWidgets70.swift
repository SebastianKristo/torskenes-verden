import SwiftUI
import WidgetKit

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
