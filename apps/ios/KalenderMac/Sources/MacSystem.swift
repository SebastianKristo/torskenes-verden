import SwiftUI
import AppKit
import UserNotifications
import ServiceManagement

/* ---------------- Prompt 34: Kalender for Mac – sanntid, Dock, varsler, tastatur og innlogging ved start ---------------- */

/// Sanntid: samme WebSocket som Homelab-appene (/api/ws?token=…). {type:'kalender'} → last på nytt (endring på iPhone vises innen få sekunder).
@MainActor
final class MacLive {
    static let shared: MacLive = MacLive()

    private var task: URLSessionWebSocketTask? = nil
    private var retry: Int = 0
    private var reloadPending: Bool = false
    private(set) var connected: Bool = false

    func start() {
        stop()
        guard let token = MacSession.token, let base = MacSession.bases.first else { return }
        var s: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if s.hasPrefix("https://") {
            s = "wss://" + String(s.dropFirst(8))
        } else if s.hasPrefix("http://") {
            s = "ws://" + String(s.dropFirst(7))
        }
        guard let url = URL(string: s + "/api/ws?token=" + KalNet.enc(token)) else { return }
        let t: URLSessionWebSocketTask = URLSession.shared.webSocketTask(with: url)
        task = t
        t.resume()
        receive(t)
    }

    func stop() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        connected = false
    }

    private func receive(_ t: URLSessionWebSocketTask) {
        t.receive { (result: Result<URLSessionWebSocketTask.Message, Error>) in
            Task { @MainActor in MacLive.shared.handle(result, t) }
        }
    }

    private func handle(_ result: Result<URLSessionWebSocketTask.Message, Error>, _ t: URLSessionWebSocketTask) {
        guard t === task else { return }
        switch result {
        case .failure:
            connected = false
            task = nil
            retry += 1
            let wait: UInt64 = UInt64(Swift.min(60, 2 * retry)) * 1_000_000_000
            Task {
                try? await Task.sleep(nanoseconds: wait)
                if MacStore.shared.loggedIn && self.task == nil { self.start() }
            }
        case .success(let msg):
            connected = true
            retry = 0
            var text: String = ""
            switch msg {
            case .string(let s): text = s
            case .data(let d): text = String(data: d, encoding: .utf8) ?? ""
            @unknown default: text = ""
            }
            onMessage(text)
            receive(t)
        }
    }

    private func onMessage(_ text: String) {
        guard let d = text.data(using: .utf8),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return }
        let type: String = (o["type"] as? String) ?? ""
        if type == "kalender" || type == "calendar" {
            if reloadPending { return }
            reloadPending = true
            Task {
                // Flere endringer på rad (import, Glimt) gir én henting.
                try? await Task.sleep(nanoseconds: 600_000_000)
                self.reloadPending = false
                await MacStore.shared.load(force: true)
            }
        }
    }
}

/// Dock-ikonet med dagens dato (oppdateres ved midnatt) og antall hendelser i dag som merke (valgfritt).
@MainActor
enum MacDock {
    private static var lastKey: String = ""

    static func refresh() {
        let s: MacStore = MacStore.shared
        let tk: String = KalD.todayKey()
        let tile: NSDockTile = NSApp.dockTile
        if lastKey != tk || tile.contentView == nil {
            lastKey = tk
            let host: NSHostingView<MacDockIcon> = NSHostingView(rootView: MacDockIcon(date: Date()))
            host.frame = NSRect(x: 0, y: 0, width: 128, height: 128)
            tile.contentView = host
        }
        var badge: String? = nil
        if s.dockBadge && s.loggedIn {
            let n: Int = s.on(tk).filter { (e: KalEvent) -> Bool in !e.cont }.count
            if n > 0 { badge = String(n) }
        }
        tile.badgeLabel = badge
        tile.display()
    }
}

/// Dock-flisen: samme ikon som appikonet, med macOS-marg rundt.
struct MacDockIcon: View {
    let date: Date

    var body: some View {
        MacAppIcon(size: 104, date: date)
            .shadow(color: Color.black.opacity(0.22), radius: 3, y: 2)
            .frame(width: 128, height: 128)
    }
}

/// Lokale varsler (UNUserNotificationCenter) med «Utsett 10 min» og «Vis vei». Samme regler som mobil.
enum MacNotify {
    static let prefix: String = "kalmac-"
    static let category: String = "KAL_EVENT"
    static let snoozeAction: String = "KAL_SNOOZE"
    static let routeAction: String = "KAL_ROUTE"

    @MainActor private static var lastSignature: String = ""
    @MainActor private static var asked: Bool = false

    static func setup() {
        let snooze: UNNotificationAction = UNNotificationAction(identifier: snoozeAction, title: "Utsett 10 min", options: [])
        let route: UNNotificationAction = UNNotificationAction(identifier: routeAction, title: "Vis vei", options: [.foreground])
        let cat: UNNotificationCategory = UNNotificationCategory(identifier: category, actions: [snooze, route], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([cat])
    }

    @MainActor static func requestIfNeeded() {
        if asked { return }
        asked = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { (_: Bool, _: Error?) in }
    }

    struct Plan {
        let id: String
        let at: Date
        let title: String
        let body: String
        let loc: String
        let eventId: String
        let day: String
    }

    static func lead(_ minutes: Int) -> String {
        if minutes >= 1440 { return "i morgen" }
        if minutes >= 60 { return "om " + String(minutes / 60) + " t" }
        return "om " + String(minutes) + " min"
    }

    static func plans(_ events: [KalEvent], now: Date) -> [Plan] {
        var out: [Plan] = []
        for e in events {
            if e.cont { continue }
            if e.kind == "bursdag" || e.cal == "b" {
                let at: Date = KalD.at(e.day, 9 * 60)
                if at > now { out.append(Plan(id: prefix + "b-" + e.id, at: at, title: e.title, body: "Bursdag i dag", loc: "", eventId: e.id, day: e.day)) }
                continue
            }
            if e.kind == "frist" {
                for d in [3, 1] {
                    let at: Date = KalD.at(KalD.addKey(e.day, -d), 9 * 60)
                    if at <= now { continue }
                    let when: String = d == 1 ? "I morgen" : "Om 3 dager"
                    let body: String = e.s == nil ? when : when + " kl. " + KalD.hm(e.startMin)
                    out.append(Plan(id: prefix + "f" + String(d) + "-" + e.id, at: at, title: e.title, body: body, loc: e.loc, eventId: e.id, day: e.day))
                }
                if e.allDay { continue }
            }
            guard let r = e.rem, let st = e.s else { continue }
            let at: Date = KalD.at(e.day, st).addingTimeInterval(TimeInterval(-r * 60))
            if at <= now { continue }
            var parts: [String] = [lead(r), KalD.hm(st) + "–" + KalD.hm(e.endMin)]
            if !e.loc.isEmpty { parts.append(e.loc) }
            out.append(Plan(id: prefix + e.id, at: at, title: e.title, body: parts.joined(separator: " · "), loc: e.loc, eventId: e.id, day: e.day))
        }
        out.sort { (a: Plan, b: Plan) -> Bool in a.at < b.at }
        return Array(out.prefix(60))
    }

    @MainActor static func reschedule(_ events: [KalEvent]) {
        let list: [Plan] = plans(events, now: Date())
        let sig: String = list.map { (p: Plan) -> String in p.id + "@" + String(Int(p.at.timeIntervalSince1970)) + p.body }.joined(separator: "|")
        if sig == lastSignature { return }
        lastSignature = sig
        if !list.isEmpty { requestIfNeeded() }
        let center: UNUserNotificationCenter = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { (reqs: [UNNotificationRequest]) in
            let old: [String] = reqs.map { (r: UNNotificationRequest) -> String in r.identifier }.filter { (id: String) -> Bool in id.hasPrefix(MacNotify.prefix) }
            center.removePendingNotificationRequests(withIdentifiers: old)
            for p in list { add(p, center) }
        }
    }

    static func add(_ p: Plan, _ center: UNUserNotificationCenter) {
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = p.title
        c.body = p.body
        c.sound = .default
        c.categoryIdentifier = category
        c.threadIdentifier = "kalender"
        c.userInfo = ["id": p.eventId, "day": p.day, "loc": p.loc, "title": p.title, "body": p.body]
        let comps: DateComponents = KalD.cal.dateComponents([.year, .month, .day, .hour, .minute], from: p.at)
        let trig: UNCalendarNotificationTrigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(identifier: p.id, content: c, trigger: trig)) { (_: Error?) in }
    }

    /// Glimt-svar som kom mens appen var skjult.
    static func glimt(_ text: String) {
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = "Glimt"
        c.body = text
        c.sound = .default
        c.userInfo = ["glimt": true]
        let id: String = prefix + "glimt-" + String(Int(Date().timeIntervalSince1970))
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil)) { (_: Error?) in }
    }

    static func snooze(_ info: [AnyHashable: Any]) {
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = (info["title"] as? String) ?? "Kalender"
        c.body = (info["body"] as? String) ?? ""
        c.sound = .default
        c.categoryIdentifier = category
        c.userInfo = info
        let trig: UNTimeIntervalNotificationTrigger = UNTimeIntervalNotificationTrigger(timeInterval: 600, repeats: false)
        let id: String = prefix + "snooze-" + String(Int(Date().timeIntervalSince1970))
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: trig)) { (_: Error?) in }
    }

    /// «Vis vei»: Apple Kart med stedet.
    static func routeURL(_ loc: String) -> URL? {
        let q: String = loc.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if q.isEmpty { return nil }
        return URL(string: "http://maps.apple.com/?daddr=" + q)
    }
}

final class MacNotifyDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared: MacNotifyDelegate = MacNotifyDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info: [AnyHashable: Any] = response.notification.request.content.userInfo
        let action: String = response.actionIdentifier
        if action == MacNotify.snoozeAction {
            MacNotify.snooze(info)
            completionHandler()
            return
        }
        if action == MacNotify.routeAction {
            let loc: String = (info["loc"] as? String) ?? ""
            if let url = MacNotify.routeURL(loc) {
                Task { @MainActor in _ = NSWorkspace.shared.open(url) }
            }
            completionHandler()
            return
        }
        let id: String = (info["id"] as? String) ?? ""
        let day: String = (info["day"] as? String) ?? ""
        let glimt: Bool = (info["glimt"] as? Bool) ?? false
        Task { @MainActor in
            MacApp.showMain()
            guard let w = MacWin.key else { return }
            if glimt {
                w.glimtOpen = true
                return
            }
            if KalD.valid(day) { w.go(view: "dag", day: day) }
            if let e = MacStore.shared.event(id) { w.openDetail(e) }
        }
        completionHandler()
    }
}

/// Tastatursnarveier som på web (D 3 W M L Y T ← → N /). Ingen når fokus er i et felt eller et ark/søk er åpent.
@MainActor
enum MacKeys {
    private static var monitor: Any? = nil

    static func install() {
        if monitor != nil { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { (ev: NSEvent) -> NSEvent? in
            MacKeys.handle(ev) ? nil : ev
        }
    }

    static func handle(_ ev: NSEvent) -> Bool {
        let mods: NSEvent.ModifierFlags = ev.modifierFlags.intersection([.command, .control, .option])
        if !mods.isEmpty { return false }
        guard let win = ev.window, win === NSApp.keyWindow else { return false }
        // Tekstfelt har fokus (feltredigereren er NSText / NSTextView).
        if win.firstResponder is NSText { return false }
        guard let w = MacWin.all.first(where: { (x: MacWin) -> Bool in x.window === win }) else { return false }
        if ev.keyCode == 53 {
            if w.modal {
                withAnimation(.easeOut(duration: 0.18)) { w.closeAll() }
                return true
            }
            return false
        }
        if w.modal { return false }
        if ev.keyCode == 123 { w.step(-1); return true }
        if ev.keyCode == 124 { w.step(1); return true }
        let ch: String = (ev.charactersIgnoringModifiers ?? "").lowercased()
        switch ch {
        case "d": w.go(view: "dag")
        case "3": w.go(view: "3d")
        case "w", "u": w.go(view: "uke")
        case "m": w.go(view: "mnd")
        case "y", "å": w.go(view: "ar")
        case "l": w.go(view: "liste")
        case "t": w.goToday()
        case "n": w.openNew()
        case "/", "s": w.searchOpen = true
        default: return false
        }
        return true
    }
}

/// «Start ved innlogging» (SMAppService.mainApp, macOS 13+).
enum MacLogin {
    static var enabled: Bool { SMAppService.mainApp.status == .enabled }

    static func set(_ on: Bool) -> String {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            return ""
        } catch {
            return "Kunne ikke endre: " + error.localizedDescription
        }
    }
}
