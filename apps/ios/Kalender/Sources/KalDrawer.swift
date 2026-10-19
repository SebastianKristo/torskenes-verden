import SwiftUI

/* ---------------- Prompt 33: Kalender – sidemenyen «Kalendere» (sveip fra venstre) ---------------- */
// 86 % bredde (maks 340), kortfarge, radius 0 28 28 0, glir inn på 0,3 s (cubic-bezier(.2,.8,.2,1)). Dekker hele skjermen,
// også statuslinjen (innhold starter under Dynamic Island: padding-top 62). Lukkes med sveip mot venstre, bakteppet eller Ferdig.
// Kalendere av/på med antall de neste 30 dagene · VISNING (Ukenummer, Vær) · UTSEENDE System/Lys/Mørk · STANDARDVARSEL.

struct KalDrawer: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var newName: String = ""
    @State private var newHex: String = KalCals.palette[6]
    @State private var adding: Bool = false

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
                    calendars
                    addRow
                    KalLabel(text: "VISNING").padding(.top, 4)
                    options
                    KalLabel(text: "UTSEENDE").padding(.top, 4)
                    themePicker
                    KalLabel(text: "STANDARDVARSEL FOR NYE HENDELSER").padding(.top, 4)
                    KalFlow(spacing: 6) {
                        ForEach(0..<KalD.remOptions.count, id: \.self) { (i: Int) in
                            let opt: (Int?, String) = KalD.remOptions[i]
                            KalChip(title: opt.1, on: s.defRem == opt.0) { s.defRemRaw = opt.0 ?? -1 }
                        }
                    }
                    account
                    Color.clear.frame(height: 24)
                }
                .padding(.horizontal, 18)
                .padding(.top, 62)
            }
            .scrollIndicators(.hidden)
            .frame(width: w)
            .frame(maxHeight: .infinity)
            .background(t.card)
            .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: 28, topTrailingRadius: 28))
            .shadow(color: Color.black.opacity(0.18), radius: 20, x: 12)
            .gesture(DragGesture(minimumDistance: 20).onEnded { (v: DragGesture.Value) in
                if v.translation.width < -50 { close() }
            })
        }
    }

    private func close() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { s.drawerOpen = false }
    }

    private var calendars: some View {
        VStack(spacing: 0) {
            ForEach(s.cals) { (c: KalCal) in
                Button(action: { s.setCal(c.id, on: !c.on) }) {
                    HStack(spacing: 12) {
                        Circle().strokeBorder(t.calColor(c), lineWidth: 2)
                            .background(Circle().fill(c.on ? t.calColor(c) : Color.clear))
                            .frame(width: 14, height: 14)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(c.name).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                            Text(String(c.count) + " de neste 30 dagene").font(KalFont.ui(12)).foregroundStyle(t.mut)
                        }
                        Spacer()
                        KalToggle(on: c.on)
                    }
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                    .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
                }
                .buttonStyle(.plain)
                .contextMenu {
                    if c.local || s.serverCals {
                        Button(role: .destructive, action: { Task { await s.deleteCalendar(c.id) } }) {
                            Label("Slett kalenderen", systemImage: "trash")
                        }
                    }
                }
                .accessibilityLabel(c.name + (c.on ? ", vises" : ", skjult"))
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    @ViewBuilder private var addRow: some View {
        if adding {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Navn på kalenderen", text: $newName)
                    .font(KalFont.ui(15, .medium)).foregroundStyle(t.ink)
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(RoundedRectangle(cornerRadius: 12).fill(t.chip))
                HStack(spacing: 6) {
                    ForEach(KalCals.palette, id: \.self) { (h: String) in
                        Button(action: { newHex = h }) {
                            Circle().fill(Color(kalHex: h)).frame(width: 22, height: 22)
                                .overlay(Circle().strokeBorder(t.ink, lineWidth: newHex == h ? 2 : 0).padding(-3))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Farge " + h)
                    }
                }
                HStack {
                    KalPill(title: "Avbryt", filled: false, height: 34) { adding = false }
                    Spacer()
                    KalPill(title: "Lag kalender", enabled: !newName.trimmingCharacters(in: .whitespaces).isEmpty, height: 34) {
                        let n: String = newName
                        let h: String = newHex
                        adding = false
                        newName = ""
                        Task { await s.addCalendar(name: n, hex: h) }
                    }
                }
            }
        } else {
            Button(action: {
                KalHaptic.tap()
                adding = true
            }) {
                Label("Ny kalender", systemImage: "plus.circle").font(KalFont.ui(14, .bold)).foregroundStyle(t.acc).frame(height: 40)
            }
            .buttonStyle(.plain)
        }
    }

    private var options: some View {
        VStack(spacing: 0) {
            KalOptionRow(title: "Ukenummer", sub: "Vises i måned og uke", on: s.showWeeks) { s.showWeeks.toggle() }
            KalOptionRow(title: "Vær", sub: "Oslo · MET / Open-Meteo, 16 dager frem", on: s.showWx) { s.showWx.toggle() }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private var themePicker: some View {
        HStack(spacing: 2) {
            ForEach([KalViewOpt(id: "system", name: "System"), KalViewOpt(id: "light", name: "Lys"), KalViewOpt(id: "dark", name: "Mørk")]) { (o: KalViewOpt) in
                Button(action: {
                    KalHaptic.tap()
                    s.theme = o.id
                }) {
                    Text(o.name).font(KalFont.ui(12.5, .bold))
                        .foregroundStyle(s.theme == o.id ? t.ink : t.mut)
                        .frame(maxWidth: .infinity).frame(height: 32)
                        .background(Capsule().fill(s.theme == o.id ? t.card : Color.clear).shadow(color: Color.black.opacity(s.theme == o.id ? 0.18 : 0), radius: 1.5, y: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Utseende " + o.name)
            }
        }
        .padding(3)
        .background(Capsule().fill(t.chip))
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: 6) {
            KalLabel(text: "KONTO").padding(.top, 8)
            Text(accountText).font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            if !s.lastError.isEmpty {
                Text(s.lastError).font(KalFont.ui(12.5)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                KalPill(title: "Oppdater", filled: false, height: 34) { Task { await s.load(force: true) } }
                KalPill(title: "Logg ut", filled: false, height: 34) {
                    s.drawerOpen = false
                    s.logout()
                }
            }
        }
    }

    private var accountText: String {
        let who: String = s.userName.isEmpty ? "Homelab" : s.userName
        let via: String = KalGroup.via == "homelab" ? " via Homelab-appen" : ""
        var out: String = "Logget inn som " + who + via + "."
        if let u = s.updated {
            out += " Oppdatert " + KalD.hm(KalD.minutes(u)) + "."
        }
        if !KalGroup.linked { out += " App Group mangler i signeringen, så widgetene får ikke data." }
        return out
    }
}

struct KalOptionRow: View {
    @Environment(\.kal) private var t
    let title: String
    let sub: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            action()
        }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut)
                }
                Spacer()
                KalToggle(on: on)
            }
            .padding(.vertical, 11)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title + (on ? ", på" : ", av"))
    }
}
