import SwiftUI
import UIKit

/* ---------------- Prompt 33: Kalender – hendelsesarket og «Ny hendelse» ---------------- */
// Ark nederfra over hele skjermen (også statuslinjen), bakteppe dim. Hendelse: tittel (Newsreader 28), kalender, Når, Sted, Vær,
// «Lagt til av Glimt «…»», Varsel-chips (Ingen · 10 min · 30 min · 1 t · 1 dag), Slett hendelse, Ferdig.
// Ny hendelse: Avbryt · «Ny hendelse» · Legg til (grå til tittel er fylt ut). Endrer man starttid, flyttes slutt med samme varighet.

/// Felles ramme for arkene: avrundet topp, grep-linje, glir opp nederfra.
struct KalSheetFrame<Content: View>: View {
    @Environment(\.kal) private var t
    /// Prompt 42: bred iPad-layout – arket ligger i midten (formSheet-stil, maks 560 pt), ikke nederfra.
    @Environment(\.kalPad42) private var pad
    var maxFraction: CGFloat = 0.9
    /// Prompt 37 (Ny hendelse): arket går helt ned bak tastaturet (krymper ikke). Innholdet får selv
    /// padding = tastatur + 16, og en flate i arkets farge ligger under, så dimmingen aldri synes i tastaturhjørnene.
    var behindKeyboard: Bool = false
    @ViewBuilder let content: () -> Content

    var body: some View {
        if pad { padBody } else { phoneBody }
    }

    private var padBody: some View {
        GeometryReader { (geo: GeometryProxy) in
            let kb: CGFloat = KalKb37.shared.height > 40 ? KalKb37.shared.height : 0
            let avail: CGFloat = Swift.max(240, geo.size.height - kb)
            VStack(alignment: .leading, spacing: 12) {
                content()
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 14)
            .frame(width: Swift.min(560, geo.size.width - 40), alignment: .leading)
            .frame(maxHeight: behindKeyboard ? Swift.min(640, avail - 40) : avail * 0.86, alignment: .top)
            .background(t.card)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: Color.black.opacity(0.2), radius: 30, y: 14)
            .frame(width: geo.size.width, height: avail)
        }
    }

    private var phoneBody: some View {
        GeometryReader { (geo: GeometryProxy) in
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 12) {
                    KalGrabber().padding(.top, 10)
                    content()
                    if !behindKeyboard { Color.clear.frame(height: 24) }
                }
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(maxHeight: maxHeight(geo.size.height), alignment: .top)
                .background(t.card)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
                .shadow(color: Color.black.opacity(0.15), radius: 20, y: -10)
                .background(alignment: .bottom) {
                    if behindKeyboard { t.card.frame(height: 260).offset(y: 250) }
                }
            }
        }
    }

    /// Med tastatur: 100 % − 40 pt (nesten fullhøyde). Ellers 90 %.
    private func maxHeight(_ h: CGFloat) -> CGFloat {
        if behindKeyboard && KalKb37.shared.height > 40 { return Swift.max(200, h - 40) }
        return h * maxFraction
    }
}

struct KalDetailSheet: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let e: KalEvent

    var body: some View {
        KalSheetFrame {
            ViewThatFits(in: .vertical) {
                detailBody
                ScrollView { detailBody }.scrollIndicators(.hidden)
            }
        }
    }

    private var detailBody: some View {
        let c: KalCal? = KalFag37.tint(s.cal(e.cal), e)
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 6) {
                    Circle().fill(t.calColor(c)).frame(width: 10, height: 10)
                    Text(c?.name ?? "").font(KalFont.ui(13, .bold)).foregroundStyle(t.calText(c))
                }
                Spacer()
                // Prompt 44: Rediger ved siden av Ferdig (ikke for helligdager, trekk, Media og bursdager fra kontakter).
                if s.canEdit44(e) { KalPill(title: "Rediger", filled: false) { s.edit44(e) } }
                KalPill(title: "Ferdig") { close() }
            }
            // Prompt 42: trekk fra Abonnementer – egne felt, ikke redigerbare her (Endres i Finans → Abonnementer).
            if KalAb42.isSub(e) {
                KalAbDetail42(e: e)
            } else {
                normalBody(c)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func normalBody(_ c: KalCal?) -> some View {
            // Prompt 41: bursdager får eget kort (konfetti, avatar med festhatt, nedtelling, Gratuler · Gaveidé · Bursdager ›).
            if KalBd41.isBirthday(e, calName: c?.name ?? "") {
                KalBdCard41(e: e, color: t.calColor(c))
            } else {
                Text(e.title).font(KalFont.serif(28)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
            }
            rows
            // Prompt 44: Media-utgivelse – status fra Media og «Åpne i Media».
            if let m = e.media44 { KalMediaInfo44(e: e, m: m) }
            if let att = e.att44, !att.isEmpty { KalAttList44(att: att) }
            KalFagPick37(e: e)
            if !e.allDay { reminders }
            Button(action: { s.delete(e) }) {
                Text("Slett hendelse").font(KalFont.ui(14, .bold)).foregroundStyle(t.acc).frame(height: 44)
            }
            .buttonStyle(.plain)
            if KalBd41.isBirthday(e, calName: c?.name ?? "") && KalBd41.fromGoogle(e) {
                Text("«Slett» fjerner bare bursdagen fra Kalender-visningen. Den ligger fortsatt i Google Kontakter.")
                    .font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
    }

    private func close() {
        withAnimation(.easeOut(duration: 0.22)) { s.detId = nil }
    }

    private var whenText: String {
        let d: Date = KalD.date(e.day)
        let base: String = KalD.cap(KalD.fd(d))
        if e.allDay { return base + (e.days > 1 ? " · " + String(e.days) + " dager" : " · hele dagen") }
        return base + " · " + KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
    }

    private var rows: some View {
        let wx: KalWxDay? = s.weather(e.day)
        return VStack(spacing: 0) {
            KalInfoRow(label: "Når", value: whenText)
            if !e.loc.isEmpty {
                KalInfoRow(label: "Sted", value: e.loc)
                // Prompt 37: kart med pin, full adresse, «Åpne i Kart» og «Veibeskrivelse ›».
                KalDetailMap37(e: e)
            }
            if let wx {
                wxRow(wx)
            }
            if !e.src.isEmpty {
                srcRow
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private func wxLabel(_ wx: KalWxDay) -> String {
        let desc: String = KalWx.text[wx.kind] ?? ""
        let hi: String = String(wx.hi)
        let lo: String = String(wx.lo)
        return desc + " · " + hi + "° / " + lo + "°"
    }

    private func wxRow(_ wx: KalWxDay) -> some View {
        let label: String = wxLabel(wx)
        let tint: Color = KalWx.color(wx.kind, mut: t.mut)
        return HStack(spacing: 10) {
            Text("Vær").font(KalFont.ui(14)).foregroundStyle(t.mut)
            Spacer()
            Image(systemName: KalWx.symbol(wx.kind)).font(.system(size: 14, weight: .semibold)).foregroundStyle(tint)
            Text(label).font(KalFont.ui(14, .bold)).foregroundStyle(t.ink)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private var srcRow: some View {
        let quoted: String = "«" + e.src + "»"
        return HStack(alignment: .top, spacing: 10) {
            Text("Lagt til av Glimt").font(KalFont.ui(14)).foregroundStyle(t.mut)
            Spacer()
            Text(quoted).font(KalFont.ui(14)).italic().foregroundStyle(t.mut).multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private var reminders: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "VARSEL")
            KalFlow(spacing: 6) {
                ForEach(0..<KalD.remOptions.count, id: \.self) { (i: Int) in
                    let opt: (Int?, String) = KalD.remOptions[i]
                    KalChip(title: opt.1, on: e.rem == opt.0) { s.setReminder(e, opt.0) }
                }
            }
        }
    }
}

struct KalInfoRow: View {
    @Environment(\.kal) private var t
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(label).font(KalFont.ui(14)).foregroundStyle(t.mut)
            Spacer()
            Text(value).font(KalFont.ui(14, .bold)).foregroundStyle(t.ink).multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}

/* ---------- Ny hendelse / Rediger (prompt 44: delt opp i små visninger for typesjekkeren i Xcode 16) ---------- */

struct KalNewSheet: View {
    @Environment(\.kal) private var t
    @Environment(\.kalPad42) private var pad
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var f: KalNewForm
    @State private var askScope: Bool = false
    @FocusState private var titleFocus: Bool

    init(form: KalNewForm) {
        _f = State(initialValue: form)
    }

    private var ok: Bool { !f.title.trimmingCharacters(in: .whitespaces).isEmpty }
    private var editing: Bool { f.editId != nil }
    private var recurring: Bool { editing && (s.event(f.editId ?? "")?.rec44 ?? false) }

    /// Prompt 37: padding nederst = tastatur + 16 (34 uten tastatur), så innholdet kan scrolles over tastaturet.
    private var kbPad: CGFloat {
        // Prompt 42: på iPad ligger arket i midten over tastaturet (ingen ekstra padding).
        if pad { return 20 }
        let k: CGFloat = KalKb37.shared.height
        return k > 40 ? k + 16 : 34
    }

    var body: some View {
        KalSheetFrame(behindKeyboard: true) {
            ScrollView {
                // Prompt 46: arket melder fra til vakten når innholdet er lagt ut (ellers lukkes bakteppet med en feilmelding).
                fields.padding(.bottom, kbPad).modifier(KalNewSeen46())
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear { appear() }
        .onDisappear { KalKeyboard37.windowBg(nil) }
        .onChange(of: f.start) { (old: Date, new: Date) in moveEnd(old, new) }
        .confirmationDialog("Gjentakende hendelse", isPresented: $askScope, titleVisibility: .visible) {
            Button("Bare denne") { s.saveForm44(f, scope: "this") }
            Button("Denne og fremtidige") { s.saveForm44(f, scope: "future") }
            Button("Alle") { s.saveForm44(f, scope: "all") }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 12) {
            KalNewTop44(editing: editing, ok: ok, cancel: { cancel() }, save: { save() })
            titleField
            KalAddrField44(f: $f)
            KalNewWhen44(f: $f)
            KalNewCals44(cal: $f.cal)
            if !f.allDay { KalNewRem44(rem: $f.rem) }
            KalPeople44(att: $f.att)
            if !editing { tip }
        }
    }

    private var titleField: some View {
        TextField("Tittel", text: $f.title)
            .font(KalFont.serif(24)).foregroundStyle(t.ink)
            .focused($titleFocus)
            .frame(height: 50)
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private var tip: some View {
        Text("Tips: skriv heller i feltet nederst, f.eks. «frisør 14.30 25.10», så fyller Glimt ut alt.")
            .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
    }

    private func appear() {
        KalKeyboard37.windowBg(UIColor(t.card))
        Task {
            try? await Task.sleep(nanoseconds: 80_000_000)
            titleFocus = true
        }
    }

    /// Flytt slutten med samme varighet.
    private func moveEnd(_ old: Date, _ new: Date) {
        let dur: TimeInterval = Swift.max(900, f.end.timeIntervalSince(old))
        f.end = new.addingTimeInterval(dur)
    }

    private func cancel() {
        withAnimation(.easeOut(duration: 0.22)) {
            let back: String? = f.editId
            s.newForm = nil
            // Rediger → Avbryt: tilbake til detaljarket.
            if let back { s.detId = back }
        }
    }

    private func save() {
        if !ok { return }
        if recurring {
            askScope = true
            return
        }
        s.saveForm44(f)
    }
}

/// Avbryt · «Ny hendelse» / «Rediger» · Legg til / Lagre.
struct KalNewTop44: View {
    @Environment(\.kal) private var t
    let editing: Bool
    let ok: Bool
    let cancel: () -> Void
    let save: () -> Void

    var body: some View {
        HStack {
            KalPill(title: "Avbryt", filled: false) { cancel() }
            Spacer()
            Text(editing ? "Rediger" : "Ny hendelse").font(KalFont.serif(22)).foregroundStyle(t.ink)
            Spacer()
            KalPill(title: editing ? "Lagre" : "Legg til", enabled: ok) { save() }
        }
    }
}

struct KalNewWhen44: View {
    @Environment(\.kal) private var t
    @Binding var f: KalNewForm

    var body: some View {
        VStack(spacing: 0) {
            allDayRow
            dateRow
            if !f.allDay { timeRow }
        }
        .tint(t.red)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private var allDayRow: some View {
        Button(action: {
            KalHaptic.tap()
            f.allDay.toggle()
        }) {
            HStack {
                Text("Hele dagen").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                Spacer()
                KalToggle(on: f.allDay)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var dateRow: some View {
        HStack {
            Text("Dato").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
            Spacer()
            DatePicker("Dato", selection: $f.day, displayedComponents: .date)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "nb_NO"))
        }
        .padding(.vertical, 6)
    }

    private var timeRow: some View {
        HStack {
            Text("Fra – til").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
            Spacer()
            DatePicker("Fra", selection: $f.start, displayedComponents: .hourAndMinute)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "nb_NO"))
            Text("–").foregroundStyle(t.mut2)
            DatePicker("Til", selection: $f.end, displayedComponents: .hourAndMinute)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "nb_NO"))
        }
        .padding(.vertical, 6)
    }
}

struct KalNewCals44: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @Binding var cal: String

    private var list: [KalCal] { s.cals.filter { (c: KalCal) -> Bool in c.writable } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "KALENDER")
            KalNewCalsHint46()
            KalFlow(spacing: 6) {
                ForEach(list) { (c: KalCal) in
                    KalChip(title: c.name, on: cal == c.id, dot: t.calColor(c)) { cal = c.id }
                }
            }
        }
    }
}

struct KalNewRem44: View {
    @Binding var rem: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "VARSEL")
            KalFlow(spacing: 6) {
                ForEach(0..<KalD.remOptions.count, id: \.self) { (i: Int) in
                    KalChip(title: KalD.remOptions[i].1, on: rem == KalD.remOptions[i].0) { rem = KalD.remOptions[i].0 }
                }
            }
        }
    }
}
