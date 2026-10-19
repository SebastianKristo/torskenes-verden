import SwiftUI
import AppKit
import UserNotifications
import UniformTypeIdentifiers

/* ---------------- Prompt 34: Kalender for Mac (no.kristo.kalender.mac) ---------------- */
// Fasit: design/Kalender Mac.dc.html (skrivebord, menylinje-kalender, Dock-ikon, DMG-vindu og varsel). Innholdet i vinduet er
// samme web-kalender (Kalender.dc.html, variant web, full). Gjenbruker SharedKal (modeller, nett, tolking via KalQuick).
// macOS 13+, universal (arm64 + x86_64). Ingen nye avhengigheter (ingen Sparkle): oppdatering via lenke til siste release.

@main
struct MacApp: App {
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var delegate
    // Ikke @StateObject på hele MacStore her: da bygges alle scener og menyer på nytt ved hver dataendring, og på macOS 26/27
    // gikk det i en uendelig løkke (AppGraph.sceneList → MacCommands → … → stabeloverflyt ved oppstart). Bare menylinje-valget observeres.
    @AppStorage("mac.mb") private var menuBarOn: Bool = true

    /// Fanget fra et vindu eller menylinje-panelet, så varsler og menylinja kan åpne hovedvinduet.
    static var opener: OpenWindowAction? = nil

    init() {
        MacSession.install()
    }

    var body: some Scene {
        WindowGroup("Kalender", id: "main") {
            MacMainWindow()
                .handlesExternalEvents(preferring: Set(["*"]), allowing: Set(["*"]))
        }
        .defaultSize(width: 1320, height: 860)
        .handlesExternalEvents(matching: Set(["*"]))
        .commands { MacCommands() }

        Window("Innstillinger", id: "innst") {
            MacThemed { MacSettingsView() }
        }
        .windowResizability(.contentSize)
        .defaultPosition(.center)

        MenuBarExtra(isInserted: menuBarBinding) {
            MacThemed { MacMenuBarPanel() }
        } label: {
            MacMenuBarLabel()
        }
        .menuBarExtraStyle(.window)
    }

    /// Skriver bare når verdien faktisk endres (MenuBarExtra setter bindingen under scene-oppdateringen).
    private var menuBarBinding: Binding<Bool> {
        Binding<Bool>(get: { menuBarOn }, set: { (v: Bool) in
            if v != menuBarOn { menuBarOn = v }
            if MacStore.shared.menuBarOn != v { MacStore.shared.menuBarOn = v }
        })
    }

    /* ---------- Hjelpere ---------- */

    @MainActor static func activate() {
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Viser hovedvinduet (åpner et nytt hvis alle er lukket).
    @MainActor static func showMain() {
        activate()
        if let w = MacWin.all.first(where: { (x: MacWin) -> Bool in x.window != nil }), let nw = w.window {
            if nw.isMiniaturized { nw.deminiaturize(nil) }
            nw.makeKeyAndOrderFront(nil)
            return
        }
        if let o = opener {
            o(id: "main")
            return
        }
        if let u = URL(string: "kalender://") { _ = NSWorkspace.shared.open(u) }
    }

    /// System / Lys / Mørk.
    @MainActor static func applyTheme(_ theme: String) {
        if theme == "light" {
            NSApp.appearance = NSAppearance(named: .aqua)
        } else if theme == "dark" {
            NSApp.appearance = NSAppearance(named: .darkAqua)
        } else {
            NSApp.appearance = nil
        }
    }
}

@MainActor
final class MacAppDelegate: NSObject, NSApplicationDelegate {
    private var lastActive: Date = Date.distantPast

    func applicationDidFinishLaunching(_ notification: Notification) {
        MacSession.install()
        MacNotify.setup()
        UNUserNotificationCenter.current().delegate = MacNotifyDelegate.shared
        MacKeys.install()
        let s: MacStore = MacStore.shared
        MacApp.applyTheme(s.theme)
        s.startTimers()
        s.rebuild()
        MacDock.refresh()
        if s.loggedIn {
            MacLive.shared.start()
            Task { await s.load(force: true) }
        }
    }

    /// Kjører videre i menylinjen når vinduet lukkes.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { MacApp.showMain() }
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        let now: Date = Date()
        if now.timeIntervalSince(lastActive) < 30 { return }
        lastActive = now
        let s: MacStore = MacStore.shared
        if !s.loggedIn { return }
        if !MacLive.shared.connected { MacLive.shared.start() }
        Task { await s.load(force: true) }
    }
}

/* ---------- Menyene (norsk) ---------- */

struct MacCommands: Commands {
    // Ikke @FocusedObject (observerer alle @Published i vinduet): bare vinduet og om et ark er oppe.
    @FocusedValue(\.macWin) private var focus: MacWinFocus?
    private var win: MacWin? { focus?.win }
    @Environment(\.openWindow) private var openWindow
    @AppStorage("mac.sw") private var showWeeks: Bool = true

    private var off: Bool { win == nil || !MacStore.shared.loggedIn }
    /// Ark og søk er åpne: ⌘← / ⌘→ skal virke i tekstfeltene.
    private var busy: Bool { off || (focus?.modal ?? true) }

    var body: some Commands {
        CommandGroup(replacing: .appInfo) {
            Button("Om Kalender") {
                MacApp.activate()
                NSApp.orderFrontStandardAboutPanel(options: [NSApplication.AboutPanelOptionKey.applicationName: "Kalender"])
            }
        }
        CommandGroup(replacing: .appSettings) {
            Button("Innstillinger …") {
                MacApp.activate()
                openWindow(id: "innst")
            }
            .keyboardShortcut(",", modifiers: [.command])
        }
        CommandGroup(replacing: .newItem) {
            Button("Ny hendelse") { win?.openNew() }
                .keyboardShortcut("n", modifiers: [.command])
                .disabled(off)
            Button("Nytt vindu") { openWindow(id: "main") }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button("Ny kalender …") { win?.newCalOpen = true }
                .disabled(off)
            Divider()
            Button("Importer .ics …") { MacImport.run() }
                .keyboardShortcut("i", modifiers: [.command, .shift])
                .disabled(!MacStore.shared.loggedIn)
        }
        CommandGroup(before: .toolbar) {
            viewButtons
            Divider()
            Button("I dag") { win?.goToday() }.keyboardShortcut("t", modifiers: [.command]).disabled(off)
            Button("Søk") { win?.searchOpen = true }.keyboardShortcut("f", modifiers: [.command]).disabled(off)
            Button("Spør Glimt") { win?.glimtOpen = true }.keyboardShortcut("k", modifiers: [.command]).disabled(off)
            Divider()
            Button("Vis/skjul sidemeny") { win?.sidebar.toggle() }
                .keyboardShortcut("s", modifiers: [.command, .option])
                .disabled(off)
            Toggle("Ukenummer", isOn: Binding<Bool>(get: { showWeeks }, set: { (v: Bool) in
                if MacStore.shared.showWeeks != v { MacStore.shared.showWeeks = v }
            }))
            Divider()
        }
        CommandMenu("Gå") {
            Button("Forrige") { win?.step(-1) }.keyboardShortcut(.leftArrow, modifiers: [.command]).disabled(busy)
            Button("Neste") { win?.step(1) }.keyboardShortcut(.rightArrow, modifiers: [.command]).disabled(busy)
            Divider()
            Button("Gå til dato …") { win?.gotoOpen = true }.keyboardShortcut("t", modifiers: [.command, .shift]).disabled(off)
        }
        CommandGroup(before: .windowList) {
            Button("Kalender") { MacApp.showMain() }.keyboardShortcut("0", modifiers: [.command])
            Divider()
        }
        CommandGroup(replacing: .help) {
            Button("Kalender-hjelp") {
                if let u = URL(string: "https://github.com/SebastianKristo/torskenes-verden/wiki") { _ = NSWorkspace.shared.open(u) }
            }
            Button("Se etter oppdateringer …") {
                MacApp.activate()
                openWindow(id: "innst")
            }
        }
    }

    @ViewBuilder private var viewButtons: some View {
        Button("Dag") { win?.go(view: "dag") }.keyboardShortcut("1", modifiers: [.command]).disabled(off)
        Button("3 dager") { win?.go(view: "3d") }.keyboardShortcut("2", modifiers: [.command]).disabled(off)
        Button("Uke") { win?.go(view: "uke") }.keyboardShortcut("3", modifiers: [.command]).disabled(off)
        Button("Måned") { win?.go(view: "mnd") }.keyboardShortcut("4", modifiers: [.command]).disabled(off)
        Button("År") { win?.go(view: "ar") }.keyboardShortcut("5", modifiers: [.command]).disabled(off)
        Button("Liste") { win?.go(view: "liste") }.keyboardShortcut("6", modifiers: [.command]).disabled(off)
    }
}

/* ---------- Arkiv → Importer .ics ---------- */

@MainActor
enum MacImport {
    static func run() {
        let p: NSOpenPanel = NSOpenPanel()
        p.title = "Importer kalender (.ics)"
        p.prompt = "Importer"
        p.allowsMultipleSelection = false
        p.canChooseDirectories = false
        var types: [UTType] = [UTType.calendarEvent]
        if let ics = UTType(filenameExtension: "ics") { types.append(ics) }
        p.allowedContentTypes = types
        MacApp.activate()
        if p.runModal() != .OK { return }
        guard let url = p.url, let raw = try? String(contentsOf: url, encoding: .utf8) else {
            MacStore.shared.showToast("Kunne ikke lese fila.", undo: "")
            return
        }
        let list: [KalParsed] = parse(raw)
        if list.isEmpty {
            MacStore.shared.showToast("Fant ingen hendelser i fila.", undo: "")
            return
        }
        Task {
            for e in list.prefix(500) { await MacStore.shared.add(e) }
            MacStore.shared.showToast("Importerte " + String(Swift.min(500, list.count)) + " hendelser", undo: "")
        }
    }

    /// Enkel VEVENT-lesing: SUMMARY, DTSTART, DTEND, LOCATION (linjer som starter med mellomrom er fortsettelser).
    static func parse(_ raw: String) -> [KalParsed] {
        var lines: [String] = []
        for l in raw.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n") {
            if (l.hasPrefix(" ") || l.hasPrefix("\t")), let last = lines.popLast() {
                lines.append(last + String(l.dropFirst()))
            } else {
                lines.append(l)
            }
        }
        var out: [KalParsed] = []
        var cur: [String: String] = [:]
        var inside: Bool = false
        for l in lines {
            if l == "BEGIN:VEVENT" {
                inside = true
                cur = [:]
                continue
            }
            if l == "END:VEVENT" {
                inside = false
                if let p = make(cur) { out.append(p) }
                continue
            }
            if !inside { continue }
            guard let colon = l.firstIndex(of: ":") else { continue }
            let keyPart: String = String(l[..<colon])
            let value: String = String(l[l.index(after: colon)...])
            let key: String = String(keyPart.split(separator: ";").first ?? "")
            cur[key] = value
            if keyPart.contains("VALUE=DATE") && !keyPart.contains("DATE-TIME") { cur[key + "#date"] = "1" }
        }
        return out
    }

    static func unescape(_ s: String) -> String {
        s.replacingOccurrences(of: "\\n", with: " ").replacingOccurrences(of: "\\,", with: ",").replacingOccurrences(of: "\\;", with: ";")
    }

    /// «20261021», «20261021T143000» eller «20261021T123000Z» → (dag, minutter eller nil).
    static func when(_ v: String) -> (String, Int?)? {
        let digits: String = v.trimmingCharacters(in: .whitespaces)
        if digits.count < 8 { return nil }
        let y: String = String(digits.prefix(4))
        let m: String = String(digits.dropFirst(4).prefix(2))
        let d: String = String(digits.dropFirst(6).prefix(2))
        let day: String = y + "-" + m + "-" + d
        if !KalD.valid(day) { return nil }
        guard digits.count >= 13, let tIdx = digits.firstIndex(of: "T") else { return (day, nil) }
        let tp: String = String(digits[digits.index(after: tIdx)...])
        let hh: Int = Int(tp.prefix(2)) ?? 0
        let mm: Int = Int(tp.dropFirst(2).prefix(2)) ?? 0
        if digits.hasSuffix("Z") {
            var c: DateComponents = DateComponents()
            c.year = Int(y)
            c.month = Int(m)
            c.day = Int(d)
            c.hour = hh
            c.minute = mm
            var utc: Calendar = Calendar(identifier: .gregorian)
            utc.timeZone = TimeZone(identifier: "UTC") ?? TimeZone.current
            guard let date = utc.date(from: c) else { return (day, hh * 60 + mm) }
            return (KalD.key(date), KalD.minutes(date))
        }
        return (day, hh * 60 + mm)
    }

    static func make(_ o: [String: String]) -> KalParsed? {
        let title: String = unescape(o["SUMMARY"] ?? "").trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty, let st = when(o["DTSTART"] ?? "") else { return nil }
        let allDay: Bool = o["DTSTART#date"] != nil || st.1 == nil
        var e: Int? = nil
        if !allDay, let en = when(o["DTEND"] ?? "") { e = en.0 == st.0 ? en.1 : 1439 }
        if !allDay && e == nil { e = (st.1 ?? 0) + 60 }
        let s: Int? = allDay ? nil : st.1
        let rem: Int? = allDay ? nil : MacStore.shared.defRem
        return KalParsed(title: title, cal: KalCals.guess(title), day: st.0, s: s, e: e, rem: rem, src: "")
    }
}
