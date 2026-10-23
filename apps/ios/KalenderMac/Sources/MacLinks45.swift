import SwiftUI
import AppKit

/* ---------------- Prompt 45: Kalender for Mac fryser ved trykk på widgeten ---------------- */
// Spesifikasjon: prompts/prompt-45-pakke/claude-code-kalender-mac-fryser-widget.md.
//
// Kjeden før (fra trykk til første tegning):
//   widget (widgetURL / Link kalender://…) → LaunchServices → SwiftUI sine «external events» (WindowGroup med
//   handlesExternalEvents) → MacRoot.onOpenURL → MacLinks.handle → zoom-animasjon over hele rutenettet + load(around:)
//   og samtidig applicationDidBecomeActive → MacLive.start() + load(force: true) + syncServers.
// Årsakene til frysingen (alle på hovedtråden, og de forsterket hverandre ved trykk på rad):
//   1. Hver aktivering (> 30 s siden sist) startet en FULL synk (−8 … +26 uker, kalendere, vær, kø, fagfarger) – også når
//      dataene var ferske og sanntid (WebSocket) var oppe. MacLive.connected ble først sann ved første melding fra serveren,
//      så den var nesten alltid «nede»: hver aktivering rev ned og startet WebSocket-en på nytt, og 60 s-tidtakeren synket
//      alt hvert minutt.
//   2. Etter synken ble hele bufferen JSON-kodet og skrevet til UserDefaults (mac.snapshot, ofte flere MB) TO ganger på
//      hovedtråden, og widget-bufferen kodet en gang til – samtidig som vinduet skulle tegne lenken.
//   3. Hver hendelsesbrikke kompilerte 3–5 regulære uttrykk på nytt (fagfarge, «prøveperiode») for hver tegning. Under synken
//      tegnes vinduet 6–8 ganger (én per await), så et trykk på widgeten ga tusenvis av NSRegularExpression på hovedtråden.
//   4. Lenken ble behandlet både av SwiftUI (onOpenURL – nytt vindu når hovedvinduet var lukket) og, når vinduet ikke fantes,
//      av reserven i showMain som åpnet kalender:// på nytt via NSWorkspace (ny runde gjennom LaunchServices). Flere trykk på
//      rad ga flere vinduer og flere synker oppå hverandre, og hver lenke startet en 0,38 s zoom-animasjon over hele visningen.
// Nå:
//   • Lenker tas imot ett sted (MacAppDelegate.application(_:open:) og onOpenURL som reserve), like lenker innen 0,8 s
//     regnes som én, og bare den siste av flere raske trykk utføres (koalesert til neste runde i hovedløkka).
//   • Det åpne vinduet gjenbrukes alltid (MacApp.showMain), ingen kalender:// til seg selv.
//   • Lenken tegnes fra bufferen uten animasjon; henting bare hvis datoen ligger utenfor det som er hentet.
//   • Aktivering synker bare når dataene er eldre enn 5 min eller sanntid er nede – og først etter at lenken er tegnet.
//   • Bufferen kodes og skrives i en egen bakgrunnskø (MacSnap45), widgetene får beskjed derfra.
//   • Regulære uttrykk kompileres én gang (KalRx37-bufferen i SharedKal).
// Logg: `log stream --level debug --predicate 'subsystem == "no.kristo.kalender.mac"'` viser «Lenke … ms».

@MainActor
enum MacLinks45 {
    private static var lastURL: String = ""
    private static var lastAt: Date = Date.distantPast
    /// Den siste lenken som venter på neste runde i hovedløkka (flere trykk på rad → bare den siste utføres).
    private static var queued: URL? = nil
    /// Tidspunktet lenken kom (for «svarer innen 300 ms»).
    private static var receivedAt: Date = Date()

    /// Fra MacAppDelegate.application(_:open:) (og onOpenURL som reserve når systemet bare sender dit).
    static func receive(_ url: URL) {
        let s: String = url.absoluteString
        let now: Date = Date()
        // Samme lenke levert to ganger (AppKit + SwiftUI) eller dobbeltklikk på widgeten.
        if s == lastURL && now.timeIntervalSince(lastAt) < 0.8 { return }
        lastURL = s
        lastAt = now
        let host: String = (url.host ?? "").lowercased()
        // Innloggingssvaret trenger ikke et nytt vindu – bare at det åpne vises.
        if host == "auth" {
            MacLogin41Model.shared.handleRedirect(url)
            MacApp.showMain()
            return
        }
        let first: Bool = queued == nil
        queued = url
        receivedAt = now
        if !first { return }
        // Neste runde i hovedløkka: flere trykk som kommer samtidig blir til ett (den siste).
        Task { @MainActor in MacLinks45.flush() }
    }

    private static func flush() {
        guard let url = queued else { return }
        queued = nil
        let t0: Date = receivedAt
        MacApp.showMain { (w: MacWin) in
            MacLinks.handle(url, win: w, animated: false)
            let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
            let h: String = url.host ?? ""
            MacLog43.app.debug("Lenke \(h, privacy: .public): \(ms, privacy: .public) ms")
        }
    }

    /// Hendelsen fra widgetens lenke når den ikke finnes i bufferen (id, dato, tittel og tid står i lenken).
    static func eventFromLink(id: String, day: String, title: String, s: String?, e: String?) -> KalEvent? {
        if id.isEmpty || !KalD.valid(day) { return nil }
        let st: Int? = minutes(s)
        var en: Int? = minutes(e)
        if let a = st, let b = en, b <= a { en = nil }
        let name: String = title.isEmpty ? "Hendelse" : title
        return KalEvent(id: id, title: name, cal: "p", day: day, s: st, e: st == nil ? nil : (en ?? (st ?? 0) + 60))
    }

    /// «14:30» → 870.
    static func minutes(_ v: String?) -> Int? {
        guard let v else { return nil }
        let p: [Substring] = v.split(separator: ":")
        if p.count != 2 { return nil }
        guard let h = Int(p[0]), let m = Int(p[1]), h >= 0, h < 24, m >= 0, m < 60 else { return nil }
        return h * 60 + m
    }
}

/// Prompt 45: bufferen (mac.snapshot) og widget-bufferen kodes og skrives utenfor hovedtråden, i rekkefølge.
/// Bare den nyeste venter: kommer det en ny før den forrige er skrevet, hoppes den forrige over.
enum MacSnap45 {
    private static let queue: DispatchQueue = DispatchQueue(label: "no.kristo.kalender.mac.snapshot45", qos: .utility)
    private static let lock: NSLock = NSLock()
    private static var seq: Int = 0
    private static var reloadPending: Bool = false

    /// Utlogging: forkast det som venter og slett bufferen (i samme kø, så ingen eldre skriving kommer etter).
    static func clear() {
        lock.lock()
        seq += 1
        lock.unlock()
        queue.async { UserDefaults.standard.removeObject(forKey: "mac.snapshot") }
    }

    /// `widgets`: skriv også App Group-bufferen. `reload`: be widgetene tegne på nytt (bare når innholdet er endret).
    static func save(_ snap: KalSnapshot, widgets: Bool, reload: Bool) {
        lock.lock()
        seq += 1
        let mine: Int = seq
        // En hoppet-over skriving skal ikke ta med seg beskjeden til widgetene.
        if reload { reloadPending = true }
        lock.unlock()
        queue.async {
            lock.lock()
            let newest: Bool = mine == seq
            let doReload: Bool = newest && reloadPending
            if doReload { reloadPending = false }
            lock.unlock()
            if !newest { return }
            if let d = try? JSONEncoder().encode(snap) { UserDefaults.standard.set(d, forKey: "mac.snapshot") }
            if widgets { KalNet.saveSnapshot(snap) }
            if widgets && doReload { MacWidgets41.reloadFromBackground() }
        }
    }
}
