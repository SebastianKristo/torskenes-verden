import SwiftUI
import AppKit

/* ---------------- Prompt 34: Kalender for Mac – hendelsesark, Ny hendelse, ✦ Skriv time og Gå til dato ---------------- */

/// Kortet arkene bygger på (sentrert i vinduet).
struct MacCard<Content: View>: View {
    @Environment(\.mk) private var t
    let width: CGFloat
    let content: () -> Content

    var body: some View {
        content()
            .padding(22)
            .frame(width: width)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.bg))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(t.line, lineWidth: 1))
            .shadow(color: Color.black.opacity(0.25), radius: 30, y: 14)
    }
}

/* ---------- Hendelse ---------- */

struct MacDetailSheet: View {
    @Environment(\.mk) private var t
    let e: KalEvent
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    var body: some View {
        let c: KalCal? = KalFag37.tint(store.cal(e.cal), e)
        MacCard(width: 460) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    RoundedRectangle(cornerRadius: 3).fill(t.calColor(c)).frame(width: 6, height: 54)
                    VStack(alignment: .leading, spacing: 4) {
                        MacLabel(text: (c?.name ?? "Kalender").uppercased(), color: t.calText(c))
                        if !KalBd41.isBirthday(e, calName: c?.name ?? "") && !KalAb42.isSub(e) {
                            Text(e.title).font(MacFont.serif(28)).foregroundColor(t.ink).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 6)
                    MacPill(title: "Ferdig") { win.detId = nil }
                        .keyboardShortcut(.cancelAction)
                }
                // Prompt 42: trekk fra Abonnementer – eget innhold, ikke redigerbart (Endres i Finans → Abonnementer).
                if KalAb42.isSub(e) {
                    MacAbDetail42(e: e)
                } else {
                    normal(c)
                }
            }
        }
    }

    @ViewBuilder private func normal(_ c: KalCal?) -> some View {
                // Prompt 41: bursdager får eget kort (konfetti, avatar med festhatt, nedtelling, Gratuler · Gaveidé · Bursdager ›).
                if KalBd41.isBirthday(e, calName: c?.name ?? "") {
                    MacBdCard41(e: e, color: t.calColor(c))
                }
                rows(c)
                // Prompt 37: kart med adresse og fagfarge.
                if !e.loc.isEmpty || e.lat != nil { MacDetailMap37(e: e) }
                MacFagPick37(e: e)
                reminders
                if !e.src.isEmpty {
                    Text("Lagt til av Glimt «" + e.src + "»").font(MacFont.ui(12.5)).foregroundColor(t.mut)
                }
                actions
                if KalBd41.isBirthday(e, calName: c?.name ?? "") && KalBd41.fromGoogle(e) {
                    Text("«Slett» fjerner bare bursdagen fra Kalender. Den ligger fortsatt i Google Kontakter.")
                        .font(MacFont.ui(11.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
                }
    }

    private func whenText() -> String {
        let d: String = KalD.cap(KalD.fd(KalD.date(e.day)))
        if e.allDay {
            if e.days > 1 { return d + " · " + String(e.days) + " dager" }
            return d + " · hele dagen"
        }
        return d + " · " + KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
    }

    private func rows(_ c: KalCal?) -> some View {
        VStack(spacing: 0) {
            MacInfoRow(label: "Når", value: whenText(), top: false)
            if !e.loc.isEmpty { MacInfoRow(label: "Sted", value: e.loc, top: true) }
            if let w = store.weather(e.day) {
                let wt: String = (KalWx.text[w.kind] ?? "Skyet") + ", " + String(w.lo) + "–" + String(w.hi) + "°"
                MacInfoRow(label: "Vær", value: wt, top: true)
            }
            if !e.note.isEmpty { MacInfoRow(label: "Notat", value: e.note, top: true) }
        }
        .padding(.horizontal, 14)
        .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
    }

    private var reminders: some View {
        VStack(alignment: .leading, spacing: 8) {
            MacLabel(text: "VARSEL", color: t.acc)
            HStack(spacing: 6) {
                ForEach(0..<KalD.remOptions.count, id: \.self) { (i: Int) in
                    let opt: (Int?, String) = KalD.remOptions[i]
                    MacChip(title: opt.1, on: e.rem == opt.0) { store.setReminder(e, opt.0) }
                }
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 8) {
            if !e.loc.isEmpty {
                MacPill(title: "Vis vei", filled: false) {
                    if let u = MacNotify.routeURL(e.loc) { _ = NSWorkspace.shared.open(u) }
                }
            }
            Spacer()
            Button(action: {
                win.detId = nil
                store.delete(e)
            }) {
                Text("Slett hendelse").font(MacFont.ui(13, .bold)).foregroundColor(t.acc)
                    .padding(.horizontal, 14).frame(height: 32)
                    .overlay(Capsule().strokeBorder(t.acc.opacity(0.5), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.delete, modifiers: [.command])
        }
    }
}

struct MacInfoRow: View {
    @Environment(\.mk) private var t
    let label: String
    let value: String
    let top: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label).font(MacFont.ui(13.5)).foregroundColor(t.mut)
            Spacer(minLength: 10)
            Text(value).font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink).multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .top) { Rectangle().fill(top ? t.line2 : Color.clear).frame(height: 1) }
    }
}

/* ---------- Ny hendelse ---------- */

struct MacNewSheet: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var f: MacNewForm
    @FocusState private var titleFocus: Bool

    init(form: MacNewForm, win: MacWin) {
        _f = State(initialValue: form)
        self.win = win
    }

    private var canSave: Bool { !f.title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        MacCard(width: 500) {
            VStack(alignment: .leading, spacing: 14) {
                header
                TextField("Tittel", text: $f.title)
                    .textFieldStyle(.plain)
                    .font(MacFont.serif(24))
                    .foregroundColor(t.ink)
                    .focused($titleFocus)
                    .onSubmit { save() }
                TextField("Sted", text: $f.loc)
                    .textFieldStyle(.plain)
                    .font(MacFont.ui(14, .medium))
                    .padding(.horizontal, 12).frame(height: 36)
                    .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
                timeBox
                calChips
                remChips
                Text("Tips: skriv heller «frisør 14.30 25.10» i ✦ Skriv time (⌘K for Glimt), så fyller Glimt ut alt.")
                    .font(MacFont.ui(11.5)).foregroundColor(t.mut2)
            }
        }
        .onAppear { titleFocus = true }
    }

    private var header: some View {
        HStack {
            MacPill(title: "Avbryt", filled: false) { win.newForm = nil }
                .keyboardShortcut(.cancelAction)
            Spacer()
            Text("Ny hendelse").font(MacFont.ui(15, .bold)).foregroundColor(t.ink)
            Spacer()
            MacPill(title: "Legg til", enabled: canSave) { save() }
                .keyboardShortcut(.defaultAction)
        }
    }

    private func save() {
        if !canSave { return }
        win.saveNew(f)
    }

    private var timeBox: some View {
        VStack(spacing: 0) {
            Toggle(isOn: $f.allDay) { Text("Hele dagen").font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink) }
                .toggleStyle(.switch)
                .frame(height: 38)
            Rectangle().fill(t.line2).frame(height: 1)
            HStack {
                Text("Dato").font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink)
                Spacer()
                DatePicker("", selection: dayBinding, displayedComponents: [.date])
                    .labelsHidden()
                    .datePickerStyle(.field)
            }
            .frame(height: 38)
            if !f.allDay {
                Rectangle().fill(t.line2).frame(height: 1)
                HStack {
                    Text("Fra – til").font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink)
                    Spacer()
                    DatePicker("", selection: startBinding, displayedComponents: [.hourAndMinute]).labelsHidden().datePickerStyle(.field)
                    Text("–").foregroundColor(t.mut)
                    DatePicker("", selection: $f.end, displayedComponents: [.hourAndMinute]).labelsHidden().datePickerStyle(.field)
                }
                .frame(height: 38)
            }
        }
        .padding(.horizontal, 14)
        .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
    }

    /// Dato endres: start og slutt flyttes til samme dag.
    private var dayBinding: Binding<Date> {
        Binding<Date>(get: { f.day }, set: { (d: Date) in
            let k: String = KalD.key(d)
            let s: Int = KalD.minutes(f.start)
            let e: Int = KalD.minutes(f.end)
            f.day = d
            f.start = KalD.at(k, s)
            f.end = KalD.at(k, e)
        })
    }

    /// Starttid endres: slutt flyttes med samme varighet.
    private var startBinding: Binding<Date> {
        Binding<Date>(get: { f.start }, set: { (d: Date) in
            let dur: TimeInterval = f.end.timeIntervalSince(f.start)
            f.start = d
            f.end = d.addingTimeInterval(Swift.max(900, dur))
        })
    }

    private var calChips: some View {
        VStack(alignment: .leading, spacing: 8) {
            MacLabel(text: "KALENDER", color: t.acc)
            MacFlow(spacing: 6) {
                ForEach(store.cals.filter { (c: KalCal) -> Bool in c.writable }.uniqueIds()) { (c: KalCal) in
                    MacChip(title: c.name, on: f.cal == c.id, dot: t.calColor(c)) { f.cal = c.id }
                }
            }
        }
    }

    private var remChips: some View {
        VStack(alignment: .leading, spacing: 8) {
            MacLabel(text: "VARSEL", color: t.acc)
            HStack(spacing: 6) {
                ForEach(0..<KalD.remOptions.count, id: \.self) { (i: Int) in
                    let opt: (Int?, String) = KalD.remOptions[i]
                    MacChip(title: opt.1, on: f.rem == opt.0) { f.rem = opt.0 }
                }
            }
        }
    }
}

/* ---------- ✦ Skriv time (Glimt-feltet) ---------- */

/// Ett felt for alt: hendelse («frisør 14.30 25.10») med forhåndsvisning «GLIMT FORSTÅR», eller spørsmål → Glimt-panelet.
struct MacComposer: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    @Binding var text: String
    var compact: Bool = false
    /// Spørsmål: åpne Glimt med teksten.
    let onAsk: (String) -> Void
    /// Hendelsen ble lagt til (dag).
    let onAdded: (String) -> Void
    @FocusState private var focused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var question: Bool { KalQuick.isQuestion(trimmed) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            field
            if !trimmed.isEmpty {
                if question { askCard } else { preview(KalQuick.parse(trimmed, defaultRem: store.defRem)) }
            }
        }
        .onAppear { focused = true }
    }

    private var field: some View {
        HStack(spacing: 8) {
            MacSpark(size: compact ? 16 : 20, fast: !trimmed.isEmpty)
            TextField("Spør Glimt eller skriv en hendelse …", text: $text)
                .textFieldStyle(.plain)
                .font(MacFont.ui(compact ? 13.5 : 15, .medium))
                .foregroundColor(t.ink)
                .focused($focused)
                .onSubmit { submit() }
            Button(action: { submit() }) {
                Image(systemName: "plus").font(.system(size: compact ? 13 : 15, weight: .bold)).foregroundColor(Color.white)
                    .frame(width: compact ? 30 : 34, height: compact ? 30 : 34)
                    .background(Circle().fill(t.red))
                    .shadow(color: t.red.opacity(0.35), radius: 6, y: 3)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Legg til")
        }
        .padding(.leading, 12)
        .padding(.trailing, 5)
        .frame(height: compact ? 40 : 46)
        .background(RoundedRectangle(cornerRadius: compact ? 20 : 23).fill(t.bg))
        .overlay(RoundedRectangle(cornerRadius: compact ? 20 : 23).strokeBorder(t.line, lineWidth: 1))
    }

    private func submit() {
        let q: String = trimmed
        if q.isEmpty { return }
        text = ""
        if KalQuick.isQuestion(q) {
            onAsk(q)
            return
        }
        let p: KalParsed = KalQuick.parse(q, defaultRem: store.defRem)
        Task { await MacStore.shared.add(p, toastPrefix: "Glimt la til") }
        onAdded(p.day)
    }

    private var askCard: some View {
        HStack(spacing: 8) {
            MacLabel(text: "SPØR GLIMT", color: t.acc)
            Text("«" + trimmed + "»").font(MacFont.ui(12.5, .semibold)).foregroundColor(t.ink).lineLimit(1)
            Spacer()
            Text("Enter ›").font(MacFont.mono(10.5)).foregroundColor(t.mut)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
    }

    private func preview(_ p: KalParsed) -> some View {
        let c: KalCal? = store.cal(p.cal)
        let day: String = KalD.cap(MacAsk.rel(p.day))
        let time: String = p.allDay ? "hele dagen" : KalD.hm(p.s ?? 0) + "–" + KalD.hm(p.e ?? 0)
        let rem: String = KalD.remLabel(p.rem)
        let sub: String = day + " · " + time + " · " + rem
        return HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4, height: 34)
            VStack(alignment: .leading, spacing: 2) {
                MacLabel(text: "GLIMT FORSTÅR", color: t.acc)
                Text(p.title).font(MacFont.ui(13.5, .bold)).foregroundColor(t.ink).lineLimit(1)
                Text(sub).font(MacFont.ui(11.5)).foregroundColor(t.mut).lineLimit(1)
            }
            Spacer()
            Text(c?.name ?? "").font(MacFont.ui(11.5, .bold)).foregroundColor(t.calText(c))
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
    }
}

struct MacQuickSheet: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @State private var text: String = ""

    var body: some View {
        MacCard(width: 560) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        MacLabel(text: "✦ AI · RASK TIME", color: t.acc)
                        Text("Skriv en time").font(MacFont.serif(24)).foregroundColor(t.ink)
                    }
                    Spacer()
                    MacPill(title: "Lukk", filled: false) { win.quickOpen = false }
                        .keyboardShortcut(.cancelAction)
                }
                MacComposer(text: $text, onAsk: { (q: String) in
                    win.quickOpen = false
                    win.glimtOpen = true
                    MacGlimtModel.shared.send(q)
                }, onAdded: { (day: String) in
                    win.quickOpen = false
                    win.anchor = day
                    win.miniMonth = KalD.firstOfMonth(KalD.date(day))
                })
                Text("F.eks. «time hos Nina frisør 14.30 25.10», «tannlege fredag kl 9 varsle 1 dag før» eller «hva skjer i morgen?».")
                    .font(MacFont.ui(12)).foregroundColor(t.mut)
            }
        }
    }
}

/* ---------- Gå til dato (⇧⌘T) ---------- */

struct MacGotoSheet: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @State private var d: Date = Date()

    var body: some View {
        MacCard(width: 320) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Gå til dato").font(MacFont.serif(22)).foregroundColor(t.ink)
                DatePicker("", selection: $d, displayedComponents: [.date])
                    .labelsHidden()
                    .datePickerStyle(.graphical)
                HStack {
                    Spacer()
                    MacPill(title: "Avbryt", filled: false) { win.gotoOpen = false }.keyboardShortcut(.cancelAction)
                    MacPill(title: "Gå") {
                        win.gotoOpen = false
                        win.goTo(d)
                    }
                    .keyboardShortcut(.defaultAction)
                }
            }
        }
        .onAppear { d = KalD.date(win.anchor) }
    }
}
