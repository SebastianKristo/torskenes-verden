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

struct MacMenuBarPanel: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var text: String = ""
    @State private var month: Date = KalD.firstOfMonth(Date())

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            MacMiniMonth(month: month, selected: "", compact: true,
                         onPick: { (k: String) in open(day: k) },
                         onWeek: { (k: String) in open(day: k, view: "uke") },
                         onMove: { (n: Int) in month = KalD.addMonths(month, n) })
            if store.loggedIn {
                agenda
                MacComposer(text: $text, compact: true, onAsk: { (q: String) in
                    MacGlimtModel.shared.send(q)
                    MacApp.showMain()
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 200_000_000)
                        MacWin.key?.glimtOpen = true
                    }
                }, onAdded: { (_: String) in })
            } else {
                Text("Ikke logget inn.").font(MacFont.ui(13)).foregroundColor(t.mut)
            }
            footer
        }
        .padding(14)
        .frame(width: 340)
        .background(t.glass)
        .onAppear {
            MacApp.opener = openWindow
            month = KalD.firstOfMonth(Date())
        }
    }

    private var header: some View {
        let T: Date = Date()
        let title: String = KalD.cap(KalD.weekdays[KalD.wd(T)]) + " " + String(KalD.dayOfMonth(T)) + ". " + KalD.months[KalD.month(T) - 1]
        return HStack(alignment: .firstTextBaseline) {
            Text(title).font(MacFont.serif(22)).foregroundColor(t.ink)
            Spacer()
            Text("UKE " + String(KalD.isoWeek(T))).font(MacFont.mono(10.5)).tracking(1.2).foregroundColor(t.red)
        }
    }

    private var agenda: some View {
        let tk: String = KalD.todayKey()
        let tm: String = KalD.addKey(tk, 1)
        let nm: Int = KalD.minutesNow()
        let today: [KalEvent] = store.on(tk).filter { (e: KalEvent) -> Bool in e.allDay || e.endMin > nm }
        let tomorrow: [KalEvent] = store.on(tm)
        return VStack(spacing: 0) {
            Rectangle().fill(t.line2).frame(height: 1)
            if today.isEmpty && tomorrow.isEmpty {
                Text("Ingenting i dag eller i morgen.").font(MacFont.ui(12.5)).foregroundColor(t.mut)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            }
            ForEach(Array(today.uniqueIds().prefix(5))) { (e: KalEvent) in MacMenuRow(e: e, prefix: "") { open(event: e) } }
            ForEach(Array(tomorrow.uniqueIds().prefix(3))) { (e: KalEvent) in MacMenuRow(e: e, prefix: "I morgen ") { open(event: e) } }
        }
    }

    private var footer: some View {
        HStack {
            Button(action: { open(day: nil, view: nil) }) {
                Text("Åpne Kalender  ⌘0").font(MacFont.ui(12)).foregroundColor(t.mut)
            }
            .buttonStyle(.plain)
            .keyboardShortcut("0", modifiers: [.command])
            Spacer()
            Button(action: {
                MacApp.activate()
                openWindow(id: "innst")
            }) {
                Text("Innstillinger …  ⌘,").font(MacFont.ui(12)).foregroundColor(t.mut)
            }
            .buttonStyle(.plain)
        }
    }

    private func open(day: String?, view: String? = "dag") {
        MacApp.showMain()
        guard let day else { return }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 150_000_000)
            MacWin.key?.go(view: view ?? "dag", day: day)
        }
    }

    private func open(event e: KalEvent) {
        MacApp.showMain()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard let w = MacWin.key else { return }
            w.go(view: "dag", day: e.day)
            w.openDetail(e)
        }
    }
}

struct MacMenuRow: View {
    @Environment(\.mk) private var t
    let e: KalEvent
    let prefix: String
    let action: () -> Void

    var body: some View {
        let c: KalCal? = KalFag37.tint(MacStore.shared.cal(e.cal), e)
        let time: String = e.allDay ? "Hele dagen" : KalD.hm(e.startMin)
        Button(action: action) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4, height: 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(MacFont.ui(13.5, .bold)).foregroundColor(t.ink).lineLimit(1)
                    if !e.loc.isEmpty { Text(e.loc).font(MacFont.ui(11.5)).foregroundColor(t.mut).lineLimit(1) }
                }
                Spacer(minLength: 6)
                Text(prefix + time).font(MacFont.mono(11.5)).foregroundColor(t.mut).lineLimit(1)
            }
            .padding(.vertical, 7)
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Dyplenker (kalender://, samme som iOS-appen) ---------- */
// kalender:// · kalender://dag/2026-10-21 · kalender://hendelse?id=…&date=… · kalender://liste · kalender://mnd · kalender://ar
// kalender://ny?text=… · kalender://glimt?q=…

@MainActor
enum MacLinks {
    static func handle(_ url: URL, win: MacWin) {
        let host: String = (url.host ?? "").lowercased()
        let parts: [String] = url.pathComponents.filter { (p: String) -> Bool in p != "/" }
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ k: String) -> String? {
            let v: String? = items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value
            return (v ?? "").isEmpty ? nil : v
        }
        win.closeAll()
        switch host {
        case "dag", "day":
            let d: String = parts.first ?? q("date") ?? KalD.todayKey()
            win.go(view: "dag", day: KalD.valid(d) ? d : KalD.todayKey())
        case "hendelse", "event":
            let day: String = q("date") ?? ""
            if KalD.valid(day) { win.go(view: "dag", day: day) }
            let id: String = q("id") ?? parts.first ?? ""
            if let e = MacStore.shared.event(id) { win.openDetail(e) }
        case "liste", "agenda":
            win.go(view: "liste")
        case "mnd", "maned", "month":
            let d: String = q("date") ?? ""
            win.go(view: "mnd", day: KalD.valid(d) ? d : KalD.todayKey())
        case "ar", "year":
            win.go(view: "ar")
        case "ny", "new":
            if let text = q("text") {
                let p: KalParsed = KalQuick.parse(text, defaultRem: MacStore.shared.defRem)
                Task { await MacStore.shared.add(p, toastPrefix: "Glimt la til") }
                if KalD.valid(p.day) { win.anchor = p.day }
            } else {
                win.openNew()
            }
        case "glimt", "spor":
            win.glimtOpen = true
            if let text = q("q") { MacGlimtModel.shared.send(text) }
        default:
            break
        }
    }
}
