import SwiftUI
import UIKit
import Network
import WidgetKit
import WatchConnectivity
import UserNotifications
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 51 (IOSPLAT51): plattform i appen ----------------
 plat51Host() legges på roten i App.swift (innenfor .environment(store)):
 – Offline-køen (Offline51, Shared/Plat51Shared.swift): sendes når nettet kommer tilbake (NWPathMonitor), når appen blir aktiv
   og etter innlogging. Varsler om konflikter og forkastede skrivinger vises som flash. API.send legger skrivinger som tåler
   å vente i køen når nettet mangler (API.swift → Plat51Queue.offer).
 – Live Activities: pakker ute for levering / klar for henting og nedlastinger i Media oppdateres når appen er aktiv;
   fulgte avganger som har gått, avsluttes.
 – Apple Watch (FinansHubWatch51-targetet): klokka spør etter serveradressen og ber om innlogging. Innloggingen er den
   vanlige QR-flyten fra prompt 46 (klokka lager økten, telefonen godkjenner med Face ID i «Logge inn på ny enhet?»-arket,
   Qr38Model) – klokka får sitt eget token, aldri telefonens. WatchConnectivity sender bare server, økt-id, engangskode og tall.
 – Font.dyn51: systemfont som følger Dynamisk tekst (UIFont.preferredFont), brukt i stedet for faste .system(size:) der det manglet. */

/* ---------- Dynamisk tekst ---------- */

extension Font {
    /// Som .system(size:weight:design:), men skalert med Dynamisk tekst. Store tall (≥ 28 pt) skaleres høyst 1,35×,
    /// så store sifre i kort ikke sprenger oppsettet; vanlig tekst opptil 2×.
    static func dyn51(size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default) -> Font {
        // Brødtekst er 17 pt på standard tekststørrelse → faktor 1 (ingen endring for dem som ikke har endret tekststørrelse).
        // UIFont (ikke UIFontMetrics) – trådsikker, så hjelperen kan brukes utenfor hovedaktøren.
        let factor: CGFloat = UIFont.preferredFont(forTextStyle: .body).pointSize / 17
        let scaled: CGFloat = size * Swift.max(0.85, factor)
        let cap: CGFloat = size >= 28 ? size * 1.35 : size * 2
        return .system(size: Swift.min(scaled, cap), weight: weight, design: design)
    }
}

/* ---------- Offline: hook fra API.send ---------- */

enum Plat51Queue {
    /// Feilkoden appen ser når en skriving er lagt i køen.
    static let queuedCode: String = "queued51"

    /// Kalles av API.send når nettet mangler. true = lagt i offline-køen (kalleren får APIError med code «queued51»).
    static func offer(_ req: URLRequest, base: String) -> Bool {
        guard let url = req.url, let method = req.httpMethod else { return false }
        let full: String = url.absoluteString
        let b: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var path: String = full.hasPrefix(b) ? String(full.dropFirst(b.count)) : url.path
        if !path.hasPrefix("/") { path = "/" + path }
        let ct: String = req.value(forHTTPHeaderField: "Content-Type") ?? "application/json"
        if !ct.hasPrefix("application/json") { return false }
        return Offline51.enqueue(method: method, path: path, body: req.httpBody, contentType: ct)
    }

    static var message: String { "Ingen nett. Lagret – sendes når du er på nett igjen." }
}

/* ---------- Nettovervåking ---------- */

@MainActor
@Observable
final class Plat51Model {
    static let shared: Plat51Model = Plat51Model()

    var online: Bool = true
    var pending: Int = Offline51.count
    @ObservationIgnored private var monitor: NWPathMonitor? = nil
    @ObservationIgnored private weak var store: Store? = nil
    @ObservationIgnored private var lastLive: Date = .distantPast

    func start(_ store: Store) {
        self.store = store
        Offline51.extraHeaders = { ["X-Device-Key": Device51.key] }
        if monitor != nil { return }
        let m: NWPathMonitor = NWPathMonitor()
        m.pathUpdateHandler = { (p: NWPath) in
            let ok: Bool = p.status == .satisfied
            Task { @MainActor in
                let was: Bool = Plat51Model.shared.online
                Plat51Model.shared.online = ok
                if ok && !was { await Plat51Model.shared.sync() }
            }
        }
        m.start(queue: DispatchQueue(label: "no.kristo.finanshub.plat51.net"))
        monitor = m
    }

    /// Send køen, vis varsler, oppdater Live Activities.
    func sync() async {
        guard let store, store.loggedIn else { return }
        pending = Offline51.count
        if pending > 0 {
            let n: Int = await Offline51.flush()
            pending = Offline51.count
            if n > 0 { store.flash(n == 1 ? "1 endring fra offline er sendt" : "\(n) endringer fra offline er sendt") }
        }
        let notes: [String] = Offline51.takeNotices()
        if let first = notes.first {
            store.flash(notes.count == 1 ? first : first + " (+\(notes.count - 1) til)")
        }
        await live()
    }

    /// Live Activities for pakker og nedlastinger (høyst hvert 2. minutt).
    func live() async {
        #if canImport(ActivityKit)
        if Date().timeIntervalSince(lastLive) < 120 { return }
        lastLive = Date()
        await Plat51Activity.sweepBuses()
        await Plat51Activity.syncPackages(WidgetShared.cache)
        // Uten Media-tilgang svarer serveren 403 → bufferen (tom) → ingen Live Activity.
        if Plat51Activity.autoDownloads {
            let v: Media43WData = await Media43W.load()
            await Plat51Activity.syncDownloads(v)
        }
        #endif
    }
}

/* ---------- Apple Watch ---------- */

final class Watch51Link: NSObject, WCSessionDelegate {
    static let shared: Watch51Link = Watch51Link()

    @MainActor private weak var store: Store? = nil
    /// Innloggingsforespørsel fra klokka som venter på at appen blir aktiv.
    @MainActor private var pendingCode: String? = nil

    @MainActor func activate(_ store: Store) {
        self.store = store
        guard WCSession.isSupported() else { return }
        let s: WCSession = WCSession.default
        if s.delegate == nil { s.delegate = self }
        if s.activationState != .activated { s.activate() }
    }

    /// Kalles når appen blir aktiv: vis «Logge inn på ny enhet?» for klokka.
    @MainActor func takePending() {
        guard let code = pendingCode, let store, store.loggedIn else { return }
        if UIApplication.shared.applicationState != .active { return }
        pendingCode = nil
        Qr38Model.shared.reset()
        Qr38Model.shared.open = true
        Qr38Model.shared.submit(code, store)
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        let kind: String = (message["kind"] as? String) ?? ""
        let code: String = (message["code"] as? String) ?? ""
        Task { @MainActor in
            let reply: [String: Any] = Watch51Link.shared.handle(kind, code: code)
            replyHandler(reply)
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let kind: String = (message["kind"] as? String) ?? ""
        let code: String = (message["code"] as? String) ?? ""
        Task { @MainActor in _ = Watch51Link.shared.handle(kind, code: code) }
    }

    @MainActor private func handle(_ kind: String, code: String) -> [String: Any] {
        guard let store, let a = store.account else { return ["ok": false, "error": "Logg inn i FinansHub på iPhone først."] }
        switch kind {
        case "server51":
            // Bare adressene og navnet – aldri tokenet.
            return ["ok": true, "server": a.server, "external": a.external, "local": a.local, "name": store.displayName]
        case "pair51":
            guard Qr38Model.valid(code) else { return ["ok": false, "error": "Ugyldig kode fra klokka."] }
            pendingCode = code
            if UIApplication.shared.applicationState == .active {
                takePending()
                return ["ok": true, "state": "asked"]
            }
            Watch51Link.remind()
            return ["ok": true, "state": "open-phone"]
        default:
            return ["ok": false, "error": "Ukjent forespørsel."]
        }
    }

    /// Telefonen er låst eller appen i bakgrunnen: varsel som åpner appen og godkjenningsarket.
    static func remind() {
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = "Apple Watch vil logge inn"
        c.body = "Åpne FinansHub og godkjenn med Face ID."
        c.sound = .default
        let r: UNNotificationRequest = UNNotificationRequest(identifier: "watch51.pair", content: c, trigger: nil)
        UNUserNotificationCenter.current().add(r) { (_: Error?) in }
    }
}

/* ---------- Roten ---------- */

struct Plat51Host: ViewModifier {
    @Environment(Store.self) private var store

    func body(content: Content) -> some View {
        content
            .task(id: store.account?.id ?? "") {
                Plat51Model.shared.start(store)
                Watch51Link.shared.activate(store)
                await Plat51Model.shared.sync()
                Watch51Link.shared.takePending()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { (_: Notification) in
                Task { @MainActor in
                    Watch51Link.shared.takePending()
                    await Plat51Model.shared.sync()
                    Plat51Kinds.reloadAll()
                }
            }
    }
}

extension View {
    /// Prompt 51 (IOSPLAT51): offline-køen, Live Activities og Apple Watch-innloggingen. Legges på roten i App.swift.
    func plat51Host() -> some View { modifier(Plat51Host()) }
}
