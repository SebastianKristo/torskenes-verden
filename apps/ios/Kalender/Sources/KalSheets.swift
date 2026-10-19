import SwiftUI

/* ---------------- Prompt 33: Kalender – hendelsesarket og «Ny hendelse» ---------------- */
// Ark nederfra over hele skjermen (også statuslinjen), bakteppe dim. Hendelse: tittel (Newsreader 28), kalender, Når, Sted, Vær,
// «Lagt til av Glimt «…»», Varsel-chips (Ingen · 10 min · 30 min · 1 t · 1 dag), Slett hendelse, Ferdig.
// Ny hendelse: Avbryt · «Ny hendelse» · Legg til (grå til tittel er fylt ut). Endrer man starttid, flyttes slutt med samme varighet.

/// Felles ramme for arkene: avrundet topp, grep-linje, glir opp nederfra.
struct KalSheetFrame<Content: View>: View {
    @Environment(\.kal) private var t
    var maxFraction: CGFloat = 0.9
    @ViewBuilder let content: () -> Content

    var body: some View {
        GeometryReader { (geo: GeometryProxy) in
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 12) {
                    KalGrabber().padding(.top, 10)
                    content()
                    Color.clear.frame(height: 24)
                }
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(maxHeight: geo.size.height * maxFraction, alignment: .top)
                .background(t.card)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
                .shadow(color: Color.black.opacity(0.15), radius: 20, y: -10)
            }
        }
    }
}

struct KalDetailSheet: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let e: KalEvent

    var body: some View {
        let c: KalCal? = s.cal(e.cal)
        KalSheetFrame {
            HStack {
                HStack(spacing: 6) {
                    Circle().fill(t.calColor(c)).frame(width: 10, height: 10)
                    Text(c?.name ?? "").font(KalFont.ui(13, .bold)).foregroundStyle(t.calText(c))
                }
                Spacer()
                KalPill(title: "Ferdig") { close() }
            }
            Text(e.title).font(KalFont.serif(28)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
            rows
            if !e.allDay { reminders }
            Button(action: { s.delete(e) }) {
                Text("Slett hendelse").font(KalFont.ui(14, .bold)).foregroundStyle(t.acc).frame(height: 44)
            }
            .buttonStyle(.plain)
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

/* ---------- Ny hendelse ---------- */

struct KalNewSheet: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var f: KalNewForm
    @FocusState private var titleFocus: Bool

    init(form: KalNewForm) {
        _f = State(initialValue: form)
    }

    private var ok: Bool { !f.title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        KalSheetFrame {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    top
                    TextField("Tittel", text: $f.title)
                        .font(KalFont.serif(24)).foregroundStyle(t.ink)
                        .focused($titleFocus)
                        .frame(height: 50)
                        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
                    TextField("Sted", text: $f.loc)
                        .font(KalFont.ui(16, .medium)).foregroundStyle(t.ink)
                        .frame(height: 40)
                        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
                    when
                    KalLabel(text: "KALENDER")
                    KalFlow(spacing: 6) {
                        ForEach(s.cals.filter { (c: KalCal) -> Bool in c.writable }) { (c: KalCal) in
                            KalChip(title: c.name, on: f.cal == c.id, dot: t.calColor(c)) { f.cal = c.id }
                        }
                    }
                    if !f.allDay {
                        KalLabel(text: "VARSEL")
                        KalFlow(spacing: 6) {
                            ForEach(0..<KalD.remOptions.count, id: \.self) { (i: Int) in
                                let opt: (Int?, String) = KalD.remOptions[i]
                                KalChip(title: opt.1, on: f.rem == opt.0) { f.rem = opt.0 }
                            }
                        }
                    }
                    Text("Tips: skriv heller i feltet nederst, f.eks. «frisør 14.30 25.10», så fyller Glimt ut alt.")
                        .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear {
            Task {
                try? await Task.sleep(nanoseconds: 80_000_000)
                titleFocus = true
            }
        }
        .onChange(of: f.start) { (old: Date, new: Date) in
            // Flytt slutten med samme varighet.
            let dur: TimeInterval = Swift.max(900, f.end.timeIntervalSince(old))
            f.end = new.addingTimeInterval(dur)
        }
    }

    private var top: some View {
        HStack {
            KalPill(title: "Avbryt", filled: false) {
                withAnimation(.easeOut(duration: 0.22)) { s.newForm = nil }
            }
            Spacer()
            Text("Ny hendelse").font(KalFont.serif(22)).foregroundStyle(t.ink)
            Spacer()
            KalPill(title: "Legg til", enabled: ok) {
                if ok { s.saveNew(f) }
            }
        }
    }

    private var when: some View {
        VStack(spacing: 0) {
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
            HStack {
                Text("Dato").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                Spacer()
                DatePicker("Dato", selection: $f.day, displayedComponents: .date)
                    .labelsHidden()
                    .environment(\.locale, Locale(identifier: "nb_NO"))
            }
            .padding(.vertical, 6)
            if !f.allDay {
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
        .tint(t.red)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}
