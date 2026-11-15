import Foundation
import UIKit
import UserNotifications
import SwiftUI

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

    /// Prompt 84: ikke i Homelab-appen (KAL_EMBED) – setNotificationCategories erstatter Homelabs egne kategorier.
    static func setup() {
        #if !KAL_EMBED
        let snooze: UNNotificationAction = UNNotificationAction(identifier: snoozeAction, title: "Utsett 10 min", options: [])
        let route: UNNotificationAction = UNNotificationAction(identifier: routeAction, title: "Vis vei", options: [.foreground])
        let cat: UNNotificationCategory = UNNotificationCategory(identifier: category, actions: [snooze, route], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([cat])
        #endif
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
        // Prompt 35: Innstillinger → VARSLER (Bursdager kl. 09, Studiefrister 3 d / 1 d).
        let bdOn: Bool = (UserDefaults.standard.object(forKey: "kal.nBd") as? Bool) ?? true
        let frOn: Bool = (UserDefaults.standard.object(forKey: "kal.nFr") as? Bool) ?? true
        for e in events {
            if e.cont { continue }
            // Prompt 42: trekk fra Abonnementer har egne regler (Innstillinger → Varsler → Abonnementer).
            if e.ab42 != nil {
                out.append(contentsOf: KalAbNotify42.plans(e, now: now))
                continue
            }
            if e.kind == "bursdag" || e.cal == "b" {
                if !bdOn { continue }
                let at: Date = KalD.at(e.day, 9 * 60)
                if at > now { out.append(Plan(id: prefix + "b-" + e.id, at: at, title: e.title, body: "Bursdag i dag", link: link(e), loc: "")) }
                continue
            }
            if e.kind == "frist" {
                for d in [3, 1] where frOn {
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
        #if KAL_EMBED
        // Prompt 84: innebygd i Homelab planlegges påminnelsene bare når den frittstående Kalender-appen ikke er installert
        // (den planlegger dem selv). Trykk på varselet går via Homelabs egen varsel-delegat (Notify31 → Kalender).
        if !KalEmbed84.shared.notify { return }
        #endif
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
            // Prompt 86: appens eget varsel (ikke en lenke utenfra).
            Task { @MainActor in KalLinks.handle(url, trusted: true) }
        }
        completionHandler()
    }
}

/* ---------------- Prompt 41: Kalender – testvarsel (Innstillinger → VARSLER øverst) ---------------- */
// Fasit: Kalender App.dc.html → notTest / ntBan. Trykk: ekte lokalt varsel om 5 s via samme kanal som påminnelsene
// (UNUserNotificationCenter, kategori KAL_EVENT), «Kalender · test» / «Tannlege kl. 17:30 · om 15 min. Varsler virker.».
// Mangler tillatelse: spør først. Avslått: «Varsler er slått av for Kalender» + «Åpne Innstillinger».
// Er appen åpen når varselet kommer: banneret vises også i appen. Lang-trykk: push fra serveren
// (POST /api/kalender/notify/test, reserve POST /api/push/test {app:"kalender"}).

@MainActor
@Observable
final class KalNotify41 {
    static let shared: KalNotify41 = KalNotify41()

    var banner: Bool = false
    var denied: Bool = false
    /// «Push sendt · kom fram på 1,2 s» eller feilen.
    var pushText: String = ""
    @ObservationIgnored private var seq: Int = 0

    nonisolated static let title: String = "Kalender · test"
    nonisolated static let bodyText: String = "Tannlege kl. 17:30 · om 15 min. Varsler virker."

    func test() {
        KalHaptic.tap()
        Task {
            let center: UNUserNotificationCenter = UNUserNotificationCenter.current()
            let st: UNNotificationSettings = await center.notificationSettings()
            var allowed: Bool = st.authorizationStatus == .authorized || st.authorizationStatus == .provisional || st.authorizationStatus == .ephemeral
            if st.authorizationStatus == .notDetermined {
                allowed = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            }
            if !allowed {
                denied = true
                return
            }
            denied = false
            let c: UNMutableNotificationContent = UNMutableNotificationContent()
            c.title = KalNotify41.title
            c.body = KalNotify41.bodyText
            c.sound = .default
            c.categoryIdentifier = KalNotify.category
            c.threadIdentifier = "kalender"
            c.userInfo = ["url": "kalender://", "title": c.title, "body": c.body, "test41": true]
            let trig: UNTimeIntervalNotificationTrigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
            let req: UNNotificationRequest = UNNotificationRequest(identifier: KalNotify.prefix + "test41", content: c, trigger: trig)
            try? await center.add(req)
            KalStore.shared.showToast("Testvarsel kommer om 5 s", undo: "")
            seq += 1
            let id: Int = seq
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if UIApplication.shared.applicationState == .active && id == seq {
                withAnimation(.easeOut(duration: 0.25)) { banner = true }
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if id == seq { withAnimation(.easeOut(duration: 0.25)) { banner = false } }
            }
        }
    }

    func openSettings() {
        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
    }

    /// Lang-trykk: push via serveren (APNs/FCM).
    func pushTest() {
        KalHaptic.soft()
        pushText = "Sender push …"
        Task {
            let t0: Date = Date()
            var res: Data? = nil
            var err: String = ""
            do {
                res = try await KalNet.send("POST", "/api/kalender/notify/test", json: ["app": "kalender", "platform": "ios"], timeout: 15)
            } catch let e as KalNetError {
                if e.status == 404 || e.status == 405 {
                    do {
                        res = try await KalNet.send("POST", "/api/push/test", json: ["app": "kalender"], timeout: 15)
                    } catch let e2 as KalNetError {
                        err = e2.message
                    } catch {
                        err = error.localizedDescription
                    }
                } else {
                    err = e.message
                }
            } catch {
                err = error.localizedDescription
            }
            if res == nil {
                pushText = "Push feilet: " + (err.isEmpty ? "ukjent feil" : err)
                return
            }
            let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: res ?? Data())) as? [String: Any]) ?? [:]
            if let e = o["error"] as? String, !e.isEmpty {
                pushText = "Push feilet: " + e
                return
            }
            var ms: Double = Date().timeIntervalSince(t0) * 1000
            if let m = o["ms"] as? Double { ms = m } else if let m = o["ms"] as? Int { ms = Double(m) }
            let sec: String = String(format: "%.1f", ms / 1000).replacingOccurrences(of: ".", with: ",")
            pushText = "Push sendt · kom fram på " + sec + " s"
        }
    }
}

/// Raden «Send testvarsel» (rødt bjelle-ikon) · «Kommer om 5 sekunder · lås skjermen for å se det» · «Test».
struct KalTestRow41: View {
    @Environment(\.kal) private var t
    @MainActor private var n: KalNotify41 { KalNotify41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "bell").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.white)
                    .frame(width: 34, height: 34)
                    .background(RoundedRectangle(cornerRadius: 10).fill(t.red))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Send testvarsel").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Text("Kommer om 5 sekunder · lås skjermen for å se det").font(KalFont.ui(12.5)).foregroundStyle(t.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                Text("Test").font(KalFont.ui(13, .bold)).foregroundStyle(t.red)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 16))
            .onTapGesture { n.test() }
            .onLongPressGesture(minimumDuration: 0.6) { n.pushTest() }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Lang-trykk sender push fra serveren")
            if n.denied {
                HStack(spacing: 10) {
                    Text("Varsler er slått av for Kalender").font(KalFont.ui(13, .semibold)).foregroundStyle(t.acc)
                    Spacer(minLength: 4)
                    KalPill(title: "Åpne Innstillinger", filled: false, height: 32) { n.openSettings() }
                }
            }
            if !n.pushText.isEmpty {
                Text(n.pushText).font(KalFont.ui(12.5)).foregroundStyle(t.mut)
            }
        }
    }
}

/// Banneret i appen når testvarselet kommer mens appen er åpen (ntBan i fasiten).
struct KalTestBanner41: View {
    var body: some View {
        VStack {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    KalTheme.brandRed.frame(height: 11)
                    Text(String(KalD.dayOfMonth(Date()))).font(KalFont.serif(18)).foregroundStyle(Color(kalHex: "#1b1a17"))
                        .frame(maxHeight: .infinity)
                }
                .frame(width: 36, height: 36)
                .background(Color(kalHex: "#fffdf8"))
                .clipShape(RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 1) {
                    HStack {
                        Text(KalNotify41.title).font(KalFont.ui(12, .bold)).foregroundStyle(Color(kalHex: "#1b1a17"))
                        Spacer()
                        Text("nå").font(KalFont.ui(12)).foregroundStyle(Color(kalHex: "#6b665c"))
                    }
                    Text("Tannlege kl. 17:30 · om 15 min").font(KalFont.ui(14, .bold)).foregroundStyle(Color(kalHex: "#1b1a17"))
                    Text("Varsler virker.").font(KalFont.ui(13)).foregroundStyle(Color(kalHex: "#3d3a33"))
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(kalHex: "#f5f0e6", opacity: 0.96)))
            .shadow(color: Color.black.opacity(0.3), radius: 20, y: 12)
            .padding(.horizontal, 10)
            .padding(.top, 6)
            .onTapGesture {
                withAnimation(.easeOut(duration: 0.2)) { KalNotify41.shared.banner = false }
            }
            Spacer(minLength: 0)
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
    }
}
