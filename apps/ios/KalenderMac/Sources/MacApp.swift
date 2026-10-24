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
        // Prompt 51: krasjfangeren tidlig (forrige økts krasj legges i køen), enhetsnøkkel og flagg (KalSec51Core.swift).
        KalSec51.enabled = true
        KalCrash51.install()
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

        // Prompt 43: «Om Kalender» – eget lite vindu med versjon (ingen tilstand som observeres i scenen).
        Window("Om Kalender", id: "om43") {
            MacThemed { MacAbout43View() }
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

    /// Prompt 43: handlingen som venter på at et nytt hovedvindu dukker opp (MacMainWindow.onAppear kjører den).
    @MainActor static var pending43: ((MacWin) -> Void)? = nil

    /// Viser hovedvinduet (åpner et nytt hvis alle er lukket). Prompt 43: `then` kjøres på vinduet når det er klart –
    /// med en gang for et åpent vindu, ellers når det nye vinduet har dukket opp (ikke etter en fast pause).
    @MainActor static func showMain(then: ((MacWin) -> Void)? = nil) {
        activate()
        let open: [MacWin] = MacWin.all.filter { (x: MacWin) -> Bool in x.window != nil }
        if let w = open.first(where: { (x: MacWin) -> Bool in x.window?.isVisible ?? false }) ?? open.first, let nw = w.window {
            if nw.isMiniaturized { nw.deminiaturize(nil) }
            nw.makeKeyAndOrderFront(nil)
            then?(w)
            return
        }
        pending43 = then
        if let o = opener {
            o(id: "main")
            return
        }
        // Prompt 45: ingen kalender:// til seg selv via NSWorkspace (ny runde gjennom LaunchServices, og med
        // application(_:open:) en mulig løkke). Ved kald start lager WindowGroup vinduet selv, og MacMainWindow.onAppear
        // kjører pending43. Kommer det ikke noe vindu, åpnes et når opener finnes.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            if MacApp.pending43 == nil { return }
            if MacWin.all.contains(where: { (x: MacWin) -> Bool in x.window != nil }) { return }
            if let o = MacApp.opener {
                o(id: "main")
            } else {
                // Ingen vinduer er laget ennå (og menylinja er ikke åpnet): be WindowGroup om et nytt vindu (Arkiv → Nytt vindu).
                NSApp.sendAction(Selector(("newWindowForTab:")), to: nil, from: nil)
            }
        }
    }

    /// Prompt 43: Innstillinger-vinduet på en bestemt fane (gen | acc | upd).
    @MainActor static func openPrefs43(_ tab: String, _ open: OpenWindowAction) {
        MacPrefsTab43.shared.tab = tab
        activate()
        open(id: "innst")
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

    /// Prompt 43: aktiveringsmodus én gang, før vinduet og menylinja lages (ikke byttet mens noe tegnes).
    func applicationWillFinishLaunching(_ notification: Notification) {
        if NSApp.activationPolicy() != .regular { NSApp.setActivationPolicy(.regular) }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        MacLog43.app.debug("Oppstart")
        MacSession.install()
        MacNotify.setup()
        UNUserNotificationCenter.current().delegate = MacNotifyDelegate.shared
        MacKeys.install()
        let s: MacStore = MacStore.shared
        MacApp.applyTheme(s.theme)
        s.startTimers()
        s.rebuild()
        MacDock.refresh()
        // Prompt 43: applicationDidBecomeActive kommer rett etter – ikke start en ny henting der også.
        lastActive = Date()
        // Prompt 43: Nøkkelringen leses i bakgrunnen (bootstrap43), vinduet viser bufferen med en gang.
        if s.loggedIn { Task { await s.bootstrap43() } }
        // Prompt 43: automatisk sjekk etter oppdateringer (én gang om dagen, standard på).
        Task { await MacUpdater43.shared.autoCheck() }
        // Prompt 51: krasjrapporter, flagg, ventende enheter (varsel) og «Nytt i denne versjonen».
        KalSec51Model.shared.active()
    }

    /// Prompt 43: «Last ned og installer i bakgrunnen» – en ferdig nedlastet versjon installeres når appen avslutter.
    func applicationWillTerminate(_ notification: Notification) {
        MacUpdater43.shared.installOnQuitIfReady()
    }

    /// Kjører videre i menylinjen når vinduet lukkes.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { MacApp.showMain() }
        return true
    }

    /// Prompt 45: lenker fra widgetene, varsler og Homelab (kalender://…) kommer hit – ett sted, gjenbruker det åpne vinduet.
    /// SwiftUI sender dem da ikke videre til WindowGroup (ingen nye vinduer per trykk); onOpenURL i vinduet er bare reserve.
    func application(_ application: NSApplication, open urls: [URL]) {
        for u in urls where (u.scheme ?? "").lowercased() == "kalender" { MacLinks45.receive(u) }
    }

    /// Prompt 45: aktivering (også trykk på widgeten) starter ikke lenger en full synk hver gang. Synk bare når dataene er
    /// eldre enn 5 min eller sanntid er nede, og først etter at vinduet/lenken er tegnet (0,6 s). WebSocket-en startes bare
    /// på nytt når den faktisk er nede.
    func applicationDidBecomeActive(_ notification: Notification) {
        let now: Date = Date()
        // Prompt 51: maks én gang per minutt (egen sperre i KalSec51Model).
        KalSec51Model.shared.active()
        if now.timeIntervalSince(lastActive) < 30 { return }
        lastActive = now
        let s: MacStore = MacStore.shared
        if !s.loggedIn { return }
        let live: Bool = MacLive.shared.connected
        if !live { MacLive.shared.start() }
        let age: TimeInterval = now.timeIntervalSince(s.updated ?? Date.distantPast)
        if live && age < 300 { return }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            await s.load(force: true)
            // Prompt 41: lokal/ekstern adresse fra Homelab (ingen SwiftUI-tilstand endres her).
            await MacLogin41Model.syncServers()
        }
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
    /// Prompt 38: web-kalenderen vises – ⌘← / ⌘→ overlates til siden (tekstfelt og egne snarveier).
    private var webMode: Bool { focus?.web ?? false }

    var body: some Commands {
        // Prompt 43: app-menyen «Kalender»: Om Kalender (eget lite vindu) · Se etter oppdateringer … · Innstillinger … ⌘, ·
        // Skjul ⌘H · Avslutt ⌘Q (de to siste er systemets egne).
        CommandGroup(replacing: .appInfo) {
            Button("Om Kalender") {
                MacApp.activate()
                openWindow(id: "om43")
            }
            Button("Se etter oppdateringer …") {
                MacApp.openPrefs43("upd", openWindow)
                Task { await MacUpdater43.shared.check() }
            }
        }
        CommandGroup(replacing: .appSettings) {
            // Prompt 43: ⌘, åpner Innstillinger-vinduet (Generelt · Kontoer · Oppdateringer). Web-kalenderens egne innstillinger
            // (prompt 38) ligger under ⌥⌘, når web-visningen er på.
            Button("Innstillinger …") {
                MacApp.openPrefs43("gen", openWindow)
            }
            .keyboardShortcut(",", modifiers: [.command])
            if webMode {
                Button("Web-innstillinger …") {
                    MacApp.activate()
                    _ = win?.web38Cmd("settings")
                }
                .keyboardShortcut(",", modifiers: [.command, .option])
            }
        }
        CommandGroup(replacing: .newItem) {
            Button("Ny hendelse") { win?.openNew() }
                .keyboardShortcut("n", modifiers: [.command])
                .disabled(off)
            Button("Nytt vindu") { openWindow(id: "main") }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button("Ny kalender …") { win?.openNewCal() }
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
            Button("Søk") { win?.openSearch() }.keyboardShortcut("f", modifiers: [.command]).disabled(off)
            Button("Spør Glimt") { win?.openGlimt(nil) }.keyboardShortcut("k", modifiers: [.command]).disabled(off)
            Divider()
            Button("Vis/skjul sidemeny") { win?.toggleSidebar() }
                .keyboardShortcut("s", modifiers: [.command, .option])
                .disabled(off)
            Toggle("Ukenummer", isOn: Binding<Bool>(get: { showWeeks }, set: { (v: Bool) in
                if MacStore.shared.showWeeks != v { MacStore.shared.showWeeks = v }
                win?.web38Cmd(v ? "weeks:1" : "weeks:0")
            }))
            Divider()
        }
        CommandMenu("Gå") {
            Button("Forrige") { win?.step(-1) }
                .keyboardShortcut(webMode ? nil : KeyboardShortcut(.leftArrow, modifiers: [.command]))
                .disabled(busy)
            Button("Neste") { win?.step(1) }
                .keyboardShortcut(webMode ? nil : KeyboardShortcut(.rightArrow, modifiers: [.command]))
                .disabled(busy)
            Divider()
            Button("Gå til dato …") { win?.openGoto() }.keyboardShortcut("t", modifiers: [.command, .shift]).disabled(off)
        }
        CommandGroup(before: .windowList) {
            Button("Kalender") { MacApp.showMain() }.keyboardShortcut("0", modifiers: [.command])
            Divider()
        }
        CommandGroup(replacing: .help) {
            Button("Kalender-hjelp") {
                if let u = URL(string: "https://github.com/SebastianKristo/torskenes-verden/wiki") { _ = NSWorkspace.shared.open(u) }
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
