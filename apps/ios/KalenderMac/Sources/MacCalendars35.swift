import SwiftUI
import AppKit

/* ---------------- Prompt 35: Kalender for Mac – kalendere i sidemenyen ---------------- */
// Fasit: Kalender App.dc.html → sidemenyen «Kalendere» (calRows, ac). Klikk på prikken → 12 farger. Hake = vis/skjul.
// «Rediger»: «Skjul fra menyen» / «Vis i menyen» og × for egne, iCal og HA. «Vis skjulte (N)». «+ Legg til kalender» →
// ark med iCal-lenke (uten lenke = egen kalender), Home Assistant (velg flere) og Konto.

struct MacCalendars35: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var editing: Bool = false
    @State private var showHidden: Bool = false

    private var visible: [KalCal] {
        store.cals.filter { (c: KalCal) -> Bool in editing || showHidden || c.inMenu }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                MacLabel(text: "KALENDERE")
                Spacer()
                Button(editing ? "Ferdig" : "Rediger") { editing.toggle() }
                    .buttonStyle(.plain)
                    .font(MacFont.ui(12, .bold))
                    .foregroundColor(t.acc)
            }
            .padding(.bottom, 4)
            ForEach(visible) { (c: KalCal) in
                MacCalRow35(cal: c, editing: editing)
            }
            let n: Int = store.hiddenFromMenu.count
            if n > 0 && !editing {
                Button(showHidden ? "Skjul skjulte" : "Vis skjulte (" + String(n) + ")") { showHidden.toggle() }
                    .buttonStyle(.plain)
                    .font(MacFont.ui(12, .bold))
                    .foregroundColor(t.mut)
                    .padding(.top, 4)
            }
            Button(action: { win.addCalOpen = true }) {
                Text("+ Legg til kalender").font(MacFont.ui(12.5, .bold)).foregroundColor(t.ink)
                    .frame(maxWidth: .infinity).frame(height: 32)
                    .overlay(Capsule().strokeBorder(t.line, style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
    }
}

struct MacCalRow35: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    let cal: KalCal
    let editing: Bool
    @State private var hover: Bool = false
    @State private var picking: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            dot
            Button(action: { if !editing { store.setCal(cal.id, on: !cal.on) } }) {
                HStack(spacing: 8) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 5).fill(cal.on ? t.calColor(cal) : Color.clear)
                        RoundedRectangle(cornerRadius: 5).strokeBorder(t.calColor(cal), lineWidth: 1.5)
                        if cal.on { Text("✓").font(.system(size: 10, weight: .heavy)).foregroundColor(Color.white) }
                    }
                    .frame(width: 18, height: 18)
                    Text(cal.name).font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink).lineLimit(1)
                    if !cal.badgeText.isEmpty {
                        Text(cal.badgeText).font(MacFont.mono(9)).foregroundColor(t.mut)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Capsule().fill(t.chip))
                            .fixedSize()
                    }
                    Spacer(minLength: 4)
                    if !editing && cal.count > 0 { Text(String(cal.count)).font(MacFont.mono(10.5)).foregroundColor(t.mut2) }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if editing {
                Button(cal.inMenu ? "Skjul" : "Vis") { store.setHidMenu(cal.id, cal.inMenu) }
                    .buttonStyle(.plain)
                    .font(MacFont.ui(11.5, .bold))
                    .foregroundColor(t.ink)
                    .padding(.horizontal, 8).frame(height: 22)
                    .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                    .help(cal.inMenu ? "Skjul fra menyen" : "Vis i menyen")
                if cal.removable {
                    Button("×") { store.removeCal(cal) }
                        .buttonStyle(.plain)
                        .font(MacFont.ui(15, .bold))
                        .foregroundColor(t.acc)
                        .help("Fjern kalenderen")
                }
            }
        }
        .padding(.horizontal, 6)
        .frame(height: 32)
        .background(RoundedRectangle(cornerRadius: 10).fill(hover ? t.card : Color.clear))
        .opacity(cal.inMenu ? 1 : 0.5)
        .onHover { (h: Bool) in hover = h }
        .contextMenu {
            Button(cal.inMenu ? "Skjul fra menyen" : "Vis i menyen") { store.setHidMenu(cal.id, cal.inMenu) }
            Button("Velg farge …") { picking = true }
            if cal.removable {
                Divider()
                Button("Fjern «" + cal.name + "»") { store.removeCal(cal) }
            }
        }
        .accessibilityLabel(cal.name + (cal.on ? ", vises" : ", skjult"))
    }

    private var dot: some View {
        Button(action: { picking = true }) {
            Circle().fill(t.calColor(cal)).frame(width: 10, height: 10)
                .frame(width: 18, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Velg farge")
        .popover(isPresented: $picking, arrowEdge: .trailing) {
            MacThemed {
                MacSwatches35(selected: cal.hex) { (h: String) in
                    store.setColor(cal.id, h)
                    picking = false
                }
                .padding(12)
            }
        }
    }
}

/// De 12 kalenderfargene (6 × 2). Valgt farge har ring.
struct MacSwatches35: View {
    @Environment(\.mk) private var t
    let selected: String
    let choose: (String) -> Void

    var body: some View {
        VStack(spacing: 8) {
            row(Array(KalTone35.swatches.prefix(6)))
            row(Array(KalTone35.swatches.suffix(6)))
        }
    }

    private func row(_ list: [String]) -> some View {
        HStack(spacing: 8) {
            ForEach(list, id: \.self) { (h: String) in
                Button(action: { choose(h) }) {
                    Circle().fill(Color(kalHex: h)).frame(width: 22, height: 22)
                        .overlay(Circle().strokeBorder(Color(kalHex: h), lineWidth: h.lowercased() == selected.lowercased() ? 2 : 0).padding(-4))
                        .padding(4)
                }
                .buttonStyle(.plain)
                .help(h)
            }
        }
    }
}

/// «+ Legg til kalender»: iCal-lenke (eller egen kalender), Home Assistant og Konto.
struct MacAddCal35Sheet: View {
    @Environment(\.mk) private var t
    @Binding var open: Bool
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var tab: String = "ics"
    @State private var url: String = ""
    @State private var name: String = ""
    @State private var nameEdited: Bool = false
    @State private var hex: String = KalTone35.swatches[6]
    @State private var ha: KalHaList35? = nil
    @State private var haSel: [String] = []
    @State private var busy: Bool = false
    @State private var error: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Legg til kalender").font(MacFont.serif(24)).foregroundColor(t.ink)
            Picker("", selection: $tab) {
                Text("iCal-lenke").tag("ics")
                Text("Home Assistant").tag("ha")
                Text("Konto").tag("acc")
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            content
            if tab != "acc" {
                MacSwatches35(selected: hex) { (h: String) in hex = h }
            }
            if !error.isEmpty {
                Text(error).font(MacFont.ui(12)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Spacer()
                Button("Avbryt") { open = false }.keyboardShortcut(.cancelAction)
                if tab != "acc" {
                    Button(busy ? "Legger til …" : okLabel) { save() }
                        .keyboardShortcut(.defaultAction)
                        .disabled(!canSave || busy)
                }
            }
        }
        .padding(22)
        .frame(width: 460)
        .background(t.bg)
        .onAppear { hex = KalTone35.pick(store.cals.count) }
        .onChange(of: tab) { (v: String) in
            error = ""
            if v == "ha" { loadHa() }
        }
    }

    @ViewBuilder private var content: some View {
        if tab == "ha" {
            haTab
        } else if tab == "acc" {
            accTab
        } else {
            icsTab
        }
    }

    private var icsTab: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("webcal://… eller https://…/kalender.ics", text: Binding(get: { url }, set: { (v: String) in
                url = v
                if !nameEdited { name = KalTone35.guessName(v) }
            }))
            .textFieldStyle(.roundedBorder)
            .font(.system(size: 13, weight: .medium, design: .monospaced))
            TextField("Navn, f.eks. Fotballkamper", text: Binding(get: { name }, set: { (v: String) in
                name = v
                nameEdited = true
            }))
            .textFieldStyle(.roundedBorder)
            .font(MacFont.ui(13.5))
            Text("Abonnerer og oppdateres hver time. Fungerer med Google, iCloud, Outlook, skole (Visma/itslearning), lag og ligaer. Uten lenke lages en egen kalender.")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var haTab: some View {
        if let ha {
            VStack(alignment: .leading, spacing: 6) {
                Text("Home Assistant · " + String(ha.entities.count) + " kalendere funnet").font(MacFont.ui(12)).foregroundColor(t.mut)
                if !ha.error.isEmpty {
                    Text(ha.error).font(MacFont.ui(12)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
                }
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(ha.entities) { (x: KalHaEntity35) in haRow(x) }
                    }
                }
                .frame(maxHeight: 240)
            }
        } else {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Henter kalendere fra Home Assistant …").font(MacFont.ui(12)).foregroundColor(t.mut)
            }
            .onAppear { loadHa() }
        }
    }

    private func haRow(_ x: KalHaEntity35) -> some View {
        let on: Bool = haSel.contains(x.id)
        return Button(action: {
            if x.added { return }
            if on { haSel.removeAll { (v: String) -> Bool in v == x.id } } else { haSel.append(x.id) }
        }) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(x.name).font(MacFont.ui(13, .bold)).foregroundColor(t.ink).lineLimit(1)
                    Text(x.id + (x.added ? " · lagt til" : "")).font(MacFont.mono(10.5)).foregroundColor(t.mut).lineLimit(1)
                }
                Spacer()
                Text(on || x.added ? "✓" : "").font(MacFont.ui(13, .heavy)).foregroundColor(t.acc)
            }
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 10).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(on ? t.ink : t.line, lineWidth: 1.2))
            .opacity(x.added ? 0.6 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var accTab: some View {
        VStack(alignment: .leading, spacing: 8) {
            accRow("Google Kalender", "Koble til")
            accRow("iCloud", "App-spesifikt passord")
            accRow("Outlook / Microsoft 365", "Koble til")
            Text("Kontoer kobles til i Homelab → Innstillinger → Integrasjoner. Etter innlogging velger du flere kalendere fra kontoen, og de vises her.")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func accRow(_ n: String, _ sub: String) -> some View {
        Button(action: {
            store.showToast(n + ": koble til i Homelab → Integrasjoner", undo: "")
            if let base = MacSession.bases.first, let u = URL(string: base) { _ = NSWorkspace.shared.open(u) }
        }) {
            HStack {
                Text(n).font(MacFont.ui(13, .bold)).foregroundColor(t.ink)
                Spacer()
                Text(sub).font(MacFont.ui(11.5, .semibold)).foregroundColor(t.mut)
            }
            .padding(.horizontal, 12).frame(height: 36)
            .background(RoundedRectangle(cornerRadius: 10).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(t.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var trimmedURL: String { url.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var okLabel: String {
        if tab == "ha" {
            let n: Int = haSel.count
            return "Legg til " + (n > 0 ? String(n) + " " : "") + (n == 1 ? "kalender" : "kalendere")
        }
        return trimmedURL.isEmpty ? "Lag kalender" : "Abonner"
    }

    private var canSave: Bool {
        if tab == "ha" { return !haSel.isEmpty }
        if trimmedURL.isEmpty { return !trimmedName.isEmpty }
        return KalTone35.validURL(trimmedURL) && !trimmedName.isEmpty
    }

    private func loadHa() {
        if ha != nil { return }
        Task {
            let r: KalHaList35 = await KalCalAPI35.haList()
            ha = r
        }
    }

    private func save() {
        if !canSave { return }
        error = ""
        busy = true
        let u: String = trimmedURL
        let n: String = trimmedName
        let h: String = hex
        let sel: [String] = haSel
        let isHa: Bool = tab == "ha"
        Task {
            var err: String = ""
            if isHa {
                err = await store.addHa(sel, baseHex: h)
            } else if u.isEmpty {
                await store.addCalendar(name: n, hex: h)
            } else {
                err = await store.addIcal(url: u, name: n, hex: h)
            }
            busy = false
            if err.isEmpty { open = false } else { error = err }
        }
    }
}
