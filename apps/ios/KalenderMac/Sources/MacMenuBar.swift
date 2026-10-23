import SwiftUI
import AppKit
import Combine

/* ---------------- Prompt 34: Menylinje-kalenderen (MenuBarExtra) og dyplenker ---------------- */
// Ikon med dagens dato og neste hendelse («Tannlege 15:15»). Panel (340 pt): dato og ukenummer, minimåned, dagens og morgendagens
// hendelser, Glimt-felt med rød +, «Åpne Kalender ⌘0» og «Innstillinger …». Kan slås av, og vise bare ikon / dato / neste hendelse.

/// Det menylinje-etiketten viser. Egen liten modell i stedet for hele MacStore: etiketten er en del av scenen
/// (MenuBarExtra), og å observere MacStore der bygget scenen på nytt ved hver dataendring (macOS 26/27: løkke i AppGraph).
/// Verdiene settes bare når de faktisk endres, og alltid etter at MacStore er ferdig med oppdateringen (async).
@MainActor
final class MacBarModel: ObservableObject {
    static let shared: MacBarModel = MacBarModel()

    @Published private(set) var day: Int = KalD.dayOfMonth(Date())
    @Published private(set) var mode: String = "next"
    @Published private(set) var next: String = ""
    private var sub: AnyCancellable? = nil
    private var queued: Bool = false

    init() {
        refresh()
        sub = MacStore.shared.objectWillChange.sink { [weak self] (_: Void) in
            guard let self, !self.queued else { return }
            self.queued = true
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.queued = false
                self.refresh()
            }
        }
    }

    func refresh() {
        let s: MacStore = MacStore.shared
        let d: Int = KalD.dayOfMonth(Date())
        var n: String = ""
        if s.menuBarMode == "next", s.loggedIn, let e = s.nextTimed(), e.day == KalD.todayKey() {
            n = MacMenuBarLabel.short(e.title) + " " + KalD.hm(e.startMin)
        }
        if d != day { day = d }
        if s.menuBarMode != mode { mode = s.menuBarMode }
        if n != next { next = n }
    }
}

struct MacMenuBarLabel: View {
    @ObservedObject var bar: MacBarModel = MacBarModel.shared

    var body: some View {
        let icon: Image = Image(systemName: String(bar.day) + ".square")
        if bar.mode == "next" && !bar.next.isEmpty {
            Text(icon) + Text(" " + bar.next)
        } else if bar.mode == "icon" {
            Image(systemName: "calendar")
        } else {
            icon
        }
    }

    static func short(_ s: String) -> String {
        if s.count <= 22 { return s }
        return String(s.prefix(21)) + "…"
    }
}

/// Prompt 43: menylinje-menyen virker (fasit: Kalender Mac.dc.html → menylinja).
/// Før åpnet hvert klikk hovedvinduet etter en fast pause (150 ms) i stedet for å gjøre noe i menyen: datoene byttet ikke dag,
/// og når vinduet var lukket (appen kjører videre i menylinja) kom det nye vinduet etter pausen, så handlingen traff ingenting.
/// Menyen ble heller ikke lukket. Nå: datoene velger dagen her, radene lukker menyen og åpner hendelsen når vinduet er klart
/// (MacApp.showMain(then:)), Glimt-feltet legger til på valgt dag og svarer på spørsmål i menyen.
final class MacPanelRef43 {
    weak var window: NSWindow? = nil
}

struct MacPanelRow43: Identifiable {
    let e: KalEvent
    let prefix: String
    var id: String { prefix + e.id }
}

struct MacMenuBarPanel: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var text: String = ""
    @State private var month: Date = KalD.firstOfMonth(Date())
    @State private var sel: String = KalD.todayKey()
    @State private var note: String = ""
    @State private var noteSeq: Int = 0
    @State private var answer: String = ""
    @State private var ref: MacPanelRef43 = MacPanelRef43()
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            MacMiniMonth(month: month, selected: sel, compact: true,
                         onPick: { (k: String) in pick(k) },
                         onWeek: { (k: String) in pick(k) },
                         onMove: { (n: Int) in month = KalD.addMonths(month, n) })
            if store.loggedIn {
                agenda
                if !answer.isEmpty { answerCard }
                if store.mbGlimt43 { composer }
                if !note.isEmpty {
                    Text(note).font(MacFont.ui(12, .semibold)).foregroundColor(t.ink).lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity)
                }
            } else {
                Text("Ikke logget inn.").font(MacFont.ui(13)).foregroundColor(t.mut)
            }
            footer
        }
        .padding(14)
        .frame(width: 340)
        .background(t.glass)
        .background(MacWindowReader { (w: NSWindow) in ref.window = w })
        .onAppear {
            MacApp.opener = openWindow
            // Lukk og åpne → tilbake til i dag.
            sel = KalD.todayKey()
            month = KalD.firstOfMonth(Date())
            answer = ""
        }
        .onExitCommand { close() }
    }

    /* ---------- Topp: valgt dag og uke ---------- */

    private var header: some View {
        let D: Date = KalD.date(sel)
        let title: String = KalD.cap(KalD.weekdays[KalD.wd(D)]) + " " + String(KalD.dayOfMonth(D)) + ". " + KalD.months[KalD.month(D) - 1]
        return HStack(alignment: .firstTextBaseline) {
            Text(title).font(MacFont.serif(22)).foregroundColor(t.ink)
            Spacer()
            Text("UKE " + String(KalD.isoWeek(D))).font(MacFont.mono(10.5)).tracking(1.2).foregroundColor(t.red)
        }
    }

    private func pick(_ k: String) {
        sel = k
        answer = ""
        let m: Date = KalD.firstOfMonth(KalD.date(k))
        if KalD.key(m) != KalD.key(month) { month = m }
    }

    /// «i dag», «i morgen», «fredag 24.»
    private var selShort: String {
        let tk: String = KalD.todayKey()
        if sel == tk { return "i dag" }
        if sel == KalD.addKey(tk, 1) { return "i morgen" }
        let D: Date = KalD.date(sel)
        return KalD.weekdays[KalD.wd(D)].lowercased() + " " + String(KalD.dayOfMonth(D)) + "."
    }

    /* ---------- Hendelsene den dagen ---------- */

    private var agenda: some View {
        let tk: String = KalD.todayKey()
        let nm: Int = KalD.minutesNow()
        var rows: [MacPanelRow43] = []
        if sel == tk {
            for e in store.on(tk).uniqueIds() where e.allDay || e.endMin > nm { rows.append(MacPanelRow43(e: e, prefix: "")) }
            if let f = store.on(KalD.addKey(tk, 1)).uniqueIds().first { rows.append(MacPanelRow43(e: f, prefix: "I morgen ")) }
        } else {
            for e in store.on(sel).uniqueIds() { rows.append(MacPanelRow43(e: e, prefix: "")) }
        }
        let shown: [MacPanelRow43] = Array(rows.prefix(7))
        return VStack(spacing: 0) {
            Rectangle().fill(t.line2).frame(height: 1)
            if shown.isEmpty {
                Text("Ingen hendelser " + selShort + ".").font(MacFont.ui(12.5)).foregroundColor(t.mut)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            }
            ForEach(shown) { (r: MacPanelRow43) in
                MacMenuRow(e: r.e, prefix: r.prefix) { open(event: r.e) }
            }
        }
    }

    private var answerCard: some View {
        HStack(alignment: .top, spacing: 8) {
            MacSpark(size: 14)
            Text(answer).font(MacFont.ui(12.5)).foregroundColor(t.ink).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button(action: { askInWindow() }) {
                Text("Mer ›").font(MacFont.ui(11.5, .bold)).foregroundColor(t.acc)
            }
            .buttonStyle(.plain)
            .help("Åpne svaret i Glimt i Kalender-vinduet")
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
    }

    /* ---------- Glimt-feltet ---------- */

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var composer: some View {
        HStack(spacing: 8) {
            MacSpark(size: 16, fast: !trimmed.isEmpty)
            TextField("Spør Glimt eller skriv en hendelse …", text: $text)
                .textFieldStyle(.plain)
                .font(MacFont.ui(13.5, .medium))
                .foregroundColor(t.ink)
                .focused($focused)
                .onSubmit { submit() }
            Button(action: { submit() }) {
                Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundColor(Color.white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(t.red))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Legg til")
        }
        .padding(.leading, 12)
        .padding(.trailing, 5)
        .frame(height: 40)
        .background(RoundedRectangle(cornerRadius: 20).fill(t.bg))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(t.line, lineWidth: 1))
        .contentShape(Rectangle())
        // Samtidig med tekstfeltets eget klikk (tar ikke klikket fra feltet eller +-knappen).
        .simultaneousGesture(TapGesture().onEnded { focusField() })
    }

    /// Tekstfeltet i menyen får fokus (panelet må være nøkkelvindu).
    private func focusField() {
        ref.window?.makeKey()
        focused = true
    }

    private func submit() {
        let q: String = trimmed
        if q.isEmpty { return }
        text = ""
        if KalQuick.isQuestion(q) {
            let a: MacAnswer = MacAsk.ask(q)
            answer = a.text.isEmpty ? "Glimt fant ikke noe svar i kalenderen." : a.text
            lastQuestion = q
            return
        }
        var p: KalParsed = KalQuick.parse(q, defaultRem: store.defRem)
        // Uten dag i teksten: valgt dag i menyen.
        if KalDay35.parseDay(KalDay35.norm(q)) == nil && KalD.valid(sel) { p.day = sel }
        let when: String = MacAsk.rel(p.day) + (p.s == nil ? "" : " " + KalD.hm(p.s ?? 0))
        flash("✦ La til «" + p.title + "» " + when)
        if p.day != sel { pick(p.day) }
        Task { await MacStore.shared.add(p) }
    }

    @State private var lastQuestion: String = ""

    private func askInWindow() {
        let q: String = lastQuestion
        close()
        MacApp.showMain { (w: MacWin) in w.openGlimt(q) }
    }

    private func flash(_ s: String) {
        noteSeq += 1
        let id: Int = noteSeq
        withAnimation(.easeOut(duration: 0.15)) { note = s }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            if noteSeq == id { withAnimation(.easeOut(duration: 0.2)) { note = "" } }
        }
    }

    /* ---------- Bunn ---------- */

    private var footer: some View {
        HStack(spacing: 4) {
            MacPanelLink43(title: "Åpne Kalender  ⌘0") {
                close()
                MacApp.showMain()
            }
            .keyboardShortcut("0", modifiers: [.command])
            Spacer()
            MacPanelLink43(title: "Innstillinger …  ⌘,") {
                close()
                MacApp.openPrefs43("gen", openWindow)
            }
            .keyboardShortcut(",", modifiers: [.command])
        }
    }

    /* ---------- Handlinger ---------- */

    /// Lukker menyen (MenuBarExtra-panelet).
    private func close() {
        ref.window?.close()
    }

    private func open(event e: KalEvent) {
        close()
        MacApp.showMain { (w: MacWin) in
            w.go(view: "dag", day: e.day)
            w.openDetail(e)
        }
    }
}

/// Lenke-knapp nederst i menyen (hover-bakgrunn, hele flaten klikkbar).
struct MacPanelLink43: View {
    @Environment(\.mk) private var t
    let title: String
    let action: () -> Void
    @State private var hover: Bool = false

    var body: some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(12)).foregroundColor(hover ? t.ink : t.mut)
                .padding(.horizontal, 8).frame(height: 26)
                .background(RoundedRectangle(cornerRadius: 7).fill(hover ? t.chip : Color.clear))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { (h: Bool) in hover = h }
    }
}

struct MacMenuRow: View {
    @Environment(\.mk) private var t
    let e: KalEvent
    let prefix: String
    let action: () -> Void
    @State private var hover: Bool = false

    var body: some View {
        let c: KalCal? = KalFag37.tint(MacStore.shared.cal(e.cal), e)
        let time: String = e.allDay ? "Hele dagen" : KalD.hm(e.startMin)
        Button(action: action) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4, height: 30)
                VStack(alignment: .leading, spacing: 1) {
                    MacBdText41.title(e, calName: c?.name ?? "").font(MacFont.ui(13.5, .bold)).foregroundColor(t.ink).lineLimit(1)
                    if !e.loc.isEmpty { Text(e.loc).font(MacFont.ui(11.5)).foregroundColor(t.mut).lineLimit(1) }
                }
                Spacer(minLength: 6)
                Text(prefix + time).font(MacFont.mono(11.5)).foregroundColor(t.mut).lineLimit(1)
            }
            .padding(.vertical, 7)
            .padding(.horizontal, 6)
            .background(RoundedRectangle(cornerRadius: 8).fill(hover ? t.chip : Color.clear))
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { (h: Bool) in hover = h }
    }
}

/* ---------- Dyplenker (kalender://, samme som iOS-appen) ---------- */
// kalender:// · kalender://dag/2026-10-21 · kalender://hendelse?id=…&date=… · kalender://liste · kalender://mnd · kalender://ar
// kalender://ny?text=… · kalender://glimt?q=…

@MainActor
enum MacLinks {
    /// Prompt 45: `animated: false` for lenker fra widgeten/varsler – visningen byttes uten zoom-animasjon over hele rutenettet.
    static func handle(_ url: URL, win: MacWin, animated: Bool = true) {
        let host: String = (url.host ?? "").lowercased()
        let parts: [String] = url.pathComponents.filter { (p: String) -> Bool in p != "/" }
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ k: String) -> String? {
            let v: String? = items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value
            return (v ?? "").isEmpty ? nil : v
        }
        // Prompt 41: kalender://auth?code=…&state=… (svaret fra Homelab / web-godkjenningen).
        if host == "auth" {
            MacLogin41Model.shared.handleRedirect(url)
            return
        }
        win.closeAll()
        func go(_ v: String, _ day: String? = nil) {
            if animated { win.go(view: v, day: day) } else { win.jump45(view: v, day: day) }
        }
        switch host {
        case "dag", "day":
            let d: String = parts.first ?? q("date") ?? KalD.todayKey()
            go("dag", KalD.valid(d) ? d : KalD.todayKey())
        case "hendelse", "event":
            let day: String = q("date") ?? ""
            if KalD.valid(day) { go("dag", day) }
            let id: String = q("id") ?? parts.first ?? ""
            if let e = MacStore.shared.event(id) {
                win.openDetail(e)
            } else if let e = MacLinks45.eventFromLink(id: id, day: day, title: q("t") ?? "", s: q("s"), e: q("e")) {
                // Prompt 45: ikke i bufferen ennå (widgeten kan være nyere enn appen) – vis det lenken vet.
                win.openDetail(e)
            }
        case "liste", "agenda":
            go("liste")
        case "mnd", "maned", "month":
            let d: String = q("date") ?? ""
            go("mnd", KalD.valid(d) ? d : KalD.todayKey())
        case "ar", "year":
            go("ar")
        case "ny", "new":
            if let text = q("text") {
                let p: KalParsed = KalQuick.parse(text, defaultRem: MacStore.shared.defRem)
                Task { await MacStore.shared.add(p, toastPrefix: "Glimt la til") }
                if KalD.valid(p.day) { win.anchor = p.day }
            } else {
                win.openNew()
            }
        case "glimt", "spor":
            win.openGlimt(q("q"))
        default:
            break
        }
    }
}
