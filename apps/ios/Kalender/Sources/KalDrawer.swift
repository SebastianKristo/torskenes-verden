import SwiftUI
import UIKit

/* ---------------- Prompt 33/35: Kalender – sidemenyen «Kalendere» (sveip fra venstre) ---------------- */
// 86 % bredde (maks 340), kortfarge, radius 0 28 28 0, glir inn på 0,3 s (cubic-bezier(.2,.8,.2,1)). Dekker hele skjermen,
// også statuslinjen (innhold starter under Dynamic Island: padding-top 62). Lukkes med sveip mot venstre, bakteppet eller Ferdig.
// Prompt 35: sidemenyen inneholder nå bare kalenderne: MINE KALENDERE (+ Rediger), farge (trykk på prikken → 12 farger),
// vis/skjul, «Skjul fra menyen» / × i Rediger, «Vis skjulte (N)», «+ Legg til kalender» (iCal-lenke / Home Assistant / Konto)
// og ⚙ Innstillinger helt nederst (Visning, Utseende og Standardvarsel er flyttet dit).

struct KalDrawer: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var editing: Bool = false
    @State private var showHidden: Bool = false
    @State private var picking: String? = nil

    var body: some View {
        GeometryReader { (geo: GeometryProxy) in
            let w: CGFloat = Swift.min(340, geo.size.width * 0.86)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Kalendere").font(KalFont.serif(28)).foregroundStyle(t.ink)
                        Spacer()
                        KalPill(title: "Ferdig") { close() }
                    }
                    mineHeader
                    calendars
                    hiddenToggle
                    addButton
                    if let tab = s.addCalTab {
                        KalAddCal35(tab: tab)
                            .transition(.opacity.combined(with: .offset(y: -6)))
                    }
                    if !s.lastError.isEmpty {
                        Text(s.lastError).font(KalFont.ui(12.5)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 16)
                    settingsRow
                    Color.clear.frame(height: 22)
                }
                .padding(.horizontal, 18)
                .padding(.top, 62)
                .frame(minHeight: geo.size.height, alignment: .top)
            }
            .scrollIndicators(.hidden)
            .frame(width: w)
            .frame(maxHeight: .infinity)
            .background(t.card)
            .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: 28, topTrailingRadius: 28))
            .shadow(color: Color.black.opacity(0.18), radius: 20, x: 12)
            .gesture(DragGesture(minimumDistance: 20).onEnded { (v: DragGesture.Value) in
                if v.translation.width < -50 && abs(v.translation.width) > abs(v.translation.height) { close() }
            })
            .animation(.easeOut(duration: 0.2), value: editing)
            .animation(.easeOut(duration: 0.2), value: picking)
            .animation(.easeOut(duration: 0.2), value: showHidden)
            .animation(.easeOut(duration: 0.22), value: s.addCalTab)
        }
    }

    private func close() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) {
            s.drawerOpen = false
            s.addCalTab = nil
        }
    }

    private var mineHeader: some View {
        HStack {
            KalLabel(text: "MINE KALENDERE")
            Spacer()
            Button(action: {
                KalHaptic.tap()
                editing.toggle()
                picking = nil
            }) {
                Text(editing ? "Ferdig" : "Rediger").font(KalFont.ui(13, .bold)).foregroundStyle(t.acc).frame(minHeight: 32)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(editing ? "Ferdig med å redigere" : "Rediger kalendere")
        }
    }

    private var visible: [KalCal] {
        s.cals.filter { (c: KalCal) -> Bool in editing || showHidden || c.inMenu }
    }

    private var calendars: some View {
        VStack(spacing: 0) {
            ForEach(visible) { (c: KalCal) in
                KalCalRow35(c: c, editing: editing, picking: picking == c.id) {
                    KalHaptic.tap()
                    picking = picking == c.id ? nil : c.id
                }
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    @ViewBuilder private var hiddenToggle: some View {
        let n: Int = s.hiddenFromMenu.count
        if n > 0 && !editing {
            Button(action: {
                KalHaptic.tap()
                showHidden.toggle()
            }) {
                Text(showHidden ? "Skjul skjulte" : "Vis skjulte (" + String(n) + ")")
                    .font(KalFont.ui(12.5, .bold)).foregroundStyle(t.mut).frame(minHeight: 30)
            }
            .buttonStyle(.plain)
        }
    }

    private var addButton: some View {
        Button(action: {
            KalHaptic.tap()
            s.addCalTab = s.addCalTab == nil ? "ics" : nil
        }) {
            Text("+ Legg til kalender").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink)
                .frame(maxWidth: .infinity).frame(height: 44)
                .overlay(Capsule().strokeBorder(t.line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Legg til kalender")
    }

    private var settingsRow: some View {
        Button(action: {
            KalHaptic.tap()
            s.settingsOpen = true
        }) {
            HStack(spacing: 12) {
                Image(systemName: "gearshape").font(.system(size: 16, weight: .semibold)).foregroundStyle(t.ink)
                    .frame(width: 34, height: 34)
                    .background(RoundedRectangle(cornerRadius: 10).fill(t.chip))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Innstillinger").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Text("Visning, utseende, varsler og Glimt").font(KalFont.ui(12)).foregroundStyle(t.mut)
                }
                Spacer()
                Text("›").font(KalFont.ui(16, .bold)).foregroundStyle(t.mut)
            }
            .padding(.top, 14).padding(.bottom, 6)
            .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Innstillinger")
    }
}

/// Én kalender: fargeprikk (velg farge), navn med merke, antall de neste 30 dagene og bryter – eller Skjul/× i Rediger.
struct KalCalRow35: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let c: KalCal
    let editing: Bool
    let picking: Bool
    let pick: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                dot
                main
                if editing { editButtons }
            }
            .padding(.vertical, 10)
            if picking { KalSwatches35(selected: c.hex) { (h: String) in s.setColor(c.id, h) }.padding(.leading, 38).padding(.bottom, 12) }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private var dot: some View {
        Button(action: pick) {
            Circle().strokeBorder(t.calColor(c), lineWidth: 2.5)
                .background(Circle().fill(c.shown ? t.calColor(c) : Color.clear))
                .frame(width: 16, height: 16)
                .frame(width: 26, height: 26)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Velg farge for " + c.name)
    }

    private var sub: String {
        if !c.inMenu { return "Skjult fra menyen" }
        return String(c.count) + " de neste 30 dagene"
    }

    private var main: some View {
        Button(action: { if !editing { s.setCal(c.id, on: !c.on) } }) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text(c.name).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                        if !c.badgeText.isEmpty {
                            Text(c.badgeText).font(KalFont.mono(9.5)).foregroundStyle(t.mut)
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .background(Capsule().fill(t.chip))
                                .fixedSize()
                        }
                    }
                    Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !editing { KalToggle(on: c.on) }
            }
            .opacity(c.inMenu ? 1 : 0.5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(c.name + (c.on ? ", vises" : ", skjult"))
    }

    private var editButtons: some View {
        HStack(spacing: 4) {
            Button(action: { s.setHidMenu(c.id, c.inMenu) }) {
                Text(c.inMenu ? "Skjul fra menyen" : "Vis i menyen").font(KalFont.ui(12, .bold)).foregroundStyle(t.ink)
                    .lineLimit(1).fixedSize()
                    .padding(.horizontal, 11).frame(height: 30)
                    .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if c.removable {
                Button(action: { s.removeCal(c) }) {
                    Text("×").font(KalFont.ui(17, .bold)).foregroundStyle(t.acc).frame(width: 30, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Fjern " + c.name)
            }
        }
    }
}

/// De 12 fargene. Valgt farge har ring.
struct KalSwatches35: View {
    @Environment(\.kal) private var t
    let selected: String
    var size: CGFloat = 28
    let choose: (String) -> Void

    var body: some View {
        KalFlow(spacing: 8) {
            ForEach(KalTone35.swatches, id: \.self) { (h: String) in
                let on: Bool = h.lowercased() == selected.lowercased()
                Button(action: { choose(h) }) {
                    Circle().fill(Color(kalHex: h)).frame(width: size, height: size)
                        .overlay(Circle().strokeBorder(Color(kalHex: h), lineWidth: on ? 2 : 0).padding(-4))
                        .padding(4)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Farge " + h + (on ? ", valgt" : ""))
            }
        }
    }
}

/// «+ Legg til kalender»: iCal-lenke (eller egen kalender uten lenke), Home Assistant og Konto.
struct KalAddCal35: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let tab: String
    @State private var url: String = ""
    @State private var name: String = ""
    @State private var nameEdited: Bool = false
    @State private var hex: String = KalTone35.swatches[6]
    @State private var hexSet: Bool = false
    @State private var ha: KalHaList35? = nil
    @State private var haSel: [String] = []
    @State private var busy: Bool = false
    @State private var error: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            tabs
            switch tab {
            case "ha": haTab
            case "acc": accTab
            default: icsTab
            }
            if tab != "acc" {
                KalSwatches35(selected: hex, size: 24) { (h: String) in
                    KalHaptic.tap()
                    hex = h
                }
            }
            if !error.isEmpty {
                Text(error).font(KalFont.ui(12)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Spacer()
                KalPill(title: "Avbryt", filled: false, height: 36) { s.addCalTab = nil }
                if tab != "acc" {
                    KalPill(title: busy ? "Legger til …" : okLabel, enabled: canSave && !busy, height: 36) { save() }
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.chip))
        .onAppear {
            if !hexSet {
                hexSet = true
                hex = KalTone35.pick(s.cals.count)
            }
            if tab == "ha" { loadHa() }
        }
        .onChange(of: tab) { (_: String, v: String) in
            error = ""
            if v == "ha" { loadHa() }
        }
    }

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach([KalViewOpt(id: "ics", name: "iCal-lenke"), KalViewOpt(id: "ha", name: "Home Assistant"), KalViewOpt(id: "acc", name: "Konto")]) { (o: KalViewOpt) in
                Button(action: {
                    KalHaptic.tap()
                    s.addCalTab = o.id
                }) {
                    Text(o.name).font(KalFont.ui(12, .bold)).lineLimit(1).minimumScaleFactor(0.8)
                        .foregroundStyle(tab == o.id ? t.bg : t.ink)
                        .frame(maxWidth: .infinity).frame(height: 30)
                        .background(Capsule().fill(tab == o.id ? t.ink : Color.clear))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == o.id ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Capsule().fill(t.card))
    }

    private var icsTab: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("webcal://… eller https://…/kalender.ics", text: Binding(get: { url }, set: { (v: String) in
                url = v
                if !nameEdited { name = KalTone35.guessName(v) }
            }))
            .font(.system(size: 13.5, weight: .medium, design: .monospaced))
            .foregroundStyle(t.ink)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .padding(.horizontal, 12).frame(height: 42)
            .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
            TextField("Navn, f.eks. Fotballkamper", text: Binding(get: { name }, set: { (v: String) in
                name = v
                nameEdited = true
            }))
            .font(KalFont.ui(14, .medium))
            .foregroundStyle(t.ink)
            .padding(.horizontal, 12).frame(height: 42)
            .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
            Text("Abonnerer og oppdateres hver time. Fungerer med Google, iCloud, Outlook, skole (Visma/itslearning), lag og ligaer. Uten lenke lages en egen kalender.")
                .font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var haTab: some View {
        if let ha {
            VStack(alignment: .leading, spacing: 6) {
                Text("Home Assistant · " + String(ha.entities.count) + " kalendere funnet").font(KalFont.ui(12)).foregroundStyle(t.mut)
                if !ha.error.isEmpty {
                    Text(ha.error).font(KalFont.ui(12)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
                }
                ForEach(ha.entities) { (x: KalHaEntity35) in
                    haRow(x)
                }
            }
        } else {
            HStack(spacing: 8) {
                ProgressView()
                Text("Henter kalendere fra Home Assistant …").font(KalFont.ui(12)).foregroundStyle(t.mut)
            }
        }
    }

    private func haRow(_ x: KalHaEntity35) -> some View {
        let on: Bool = haSel.contains(x.id)
        return Button(action: {
            if x.added { return }
            KalHaptic.tap()
            if on { haSel.removeAll { (v: String) -> Bool in v == x.id } } else { haSel.append(x.id) }
        }) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(x.name).font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(x.id + (x.added ? " · lagt til" : "")).font(KalFont.mono(11)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer()
                Text(on || x.added ? "✓" : "").font(KalFont.ui(14, .heavy)).foregroundStyle(t.acc)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(on ? t.ink : t.line, lineWidth: 1.5))
            .opacity(x.added ? 0.6 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(x.name + (on ? ", valgt" : ""))
    }

    private var accTab: some View {
        VStack(alignment: .leading, spacing: 6) {
            accRow("Google Kalender", "Koble til")
            accRow("iCloud", "App-spesifikt passord")
            accRow("Outlook / Microsoft 365", "Koble til")
            Text("Kontoer kobles til i Homelab → Innstillinger → Integrasjoner. Etter innlogging velger du flere kalendere fra kontoen, og de vises her.")
                .font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func accRow(_ n: String, _ sub: String) -> some View {
        Button(action: {
            KalHaptic.tap()
            s.showToast(n + ": koble til i Homelab → Integrasjoner", undo: "")
            if let u = URL(string: "finanshub://integrasjoner"), UIApplication.shared.canOpenURL(u) { UIApplication.shared.open(u) }
        }) {
            HStack(spacing: 10) {
                Text(n).font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                Spacer()
                Text(sub).font(KalFont.ui(12, .semibold)).foregroundStyle(t.mut).lineLimit(1)
            }
            .padding(.horizontal, 14).frame(height: 44)
            .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
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
        KalHaptic.tap()
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
                err = await s.addHa(sel, baseHex: h)
            } else if u.isEmpty {
                await s.addCalendar(name: n, hex: h)
            } else {
                err = await s.addIcal(url: u, name: n, hex: h)
            }
            busy = false
            if err.isEmpty {
                KalHaptic.done()
                s.addCalTab = nil
            } else {
                error = err
            }
        }
    }
}
