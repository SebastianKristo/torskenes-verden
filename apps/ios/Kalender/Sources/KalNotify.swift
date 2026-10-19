import Foundation
import UIKit
import UserNotifications

/* ---------------- Prompt 33: Kalender – lokale varsler ---------------- */
// «Nina frisør» · «om 1 t · 14:30–15:30 · Frisør Nina, Grünerløkka». Handlinger: Utsett 10 min og Vis vei.
// Bursdager varsles kl. 09:00 samme dag, studiefrister 3 dager og 1 dag før (kl. 09:00). iOS tillater 64 ventende varsler.

enum KalNotify {
    static let prefix: String = "kal33-"
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

    /// Ett planlagt varsel.
    struct Plan {
        let id: String
        let at: Date
        let title: String
        let body: String
        let link: String
        let loc: String
    }

    static func link(_ e: KalEvent) -> String {
        var s: String = "kalender://hendelse?id=" + KalNet.enc(e.id) + "&date=" + e.day + "&t=" + KalNet.enc(e.title)
        if let st = e.s { s += "&s=" + KalD.hm(st) + "&e=" + KalD.hm(e.endMin) }
        return s
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
                if at > now { out.append(Plan(id: prefix + "b-" + e.id, at: at, title: e.title, body: "Bursdag i dag", link: link(e), loc: "")) }
                continue
            }
            if e.kind == "frist" {
                for d in [3, 1] {
                    let at: Date = KalD.at(KalD.addKey(e.day, -d), 9 * 60)
                    if at > now {
                        let body: String = (d == 1 ? "I morgen" : "Om 3 dager") + (e.s == nil ? "" : " kl. " + KalD.hm(e.startMin))
                        out.append(Plan(id: prefix + "f" + String(d) + "-" + e.id, at: at, title: e.title, body: body, link: link(e), loc: e.loc))
                    }
                }
                if e.allDay { continue }
            }
            guard let r = e.rem, let st = e.s else { continue }
            let start: Date = KalD.at(e.day, st)
            let at: Date = start.addingTimeInterval(TimeInterval(-r * 60))
            if at <= now { continue }
            var parts: [String] = [lead(r), KalD.hm(st) + "–" + KalD.hm(e.endMin)]
            if !e.loc.isEmpty { parts.append(e.loc) }
            out.append(Plan(id: prefix + e.id, at: at, title: e.title, body: parts.joined(separator: " · "), link: link(e), loc: e.loc))
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
            let old: [String] = reqs.map { (r: UNNotificationRequest) -> String in r.identifier }.filter { (id: String) -> Bool in id.hasPrefix(KalNotify.prefix) }
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
        c.userInfo = ["url": p.link, "loc": p.loc, "title": p.title, "body": p.body]
        let comps: DateComponents = KalD.cal.dateComponents([.year, .month, .day, .hour, .minute], from: p.at)
        let trig: UNCalendarNotificationTrigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(identifier: p.id, content: c, trigger: trig)) { (_: Error?) in }
    }

    /// «Utsett 10 min»: samme varsel om 10 minutter.
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

/// Varsel-delegaten: vis varsler også når appen er åpen, og håndter handlingene.
final class KalNotifyDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared: KalNotifyDelegate = KalNotifyDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info: [AnyHashable: Any] = response.notification.request.content.userInfo
        let action: String = response.actionIdentifier
        if action == KalNotify.snoozeAction {
            KalNotify.snooze(info)
            completionHandler()
            return
        }
        if action == KalNotify.routeAction {
            let loc: String = (info["loc"] as? String) ?? ""
            if let url = KalNotify.routeURL(loc) {
                Task { @MainActor in UIApplication.shared.open(url) }
            }
            completionHandler()
            return
        }
        if let s = info["url"] as? String, let url = URL(string: s) {
            Task { @MainActor in KalLinks.handle(url) }
        }
        completionHandler()
    }
}
