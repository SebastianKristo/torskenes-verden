import SwiftUI
import UIKit
import UserNotifications
import BackgroundTasks

/* ---------------- Prompt 31: varsler når appen er lukket (iOS) ---------------- */
// Serveren har ikke APNs-nøkler, så appen henter selv:
//  • BGAppRefreshTask «no.kristo.finanshub.notify» (omtrent hvert 15. minutt, når iOS tillater det) →
//    GET /api/notify/pending?since=<sist> → lokale varsler (AI-svar, prøve-varsler, oppdatering, rask time).
//  • Prøveperioder har kjente tidspunkter og planlegges som UNCalendarNotificationTrigger på enheten (Trial31.swift),
//    kategori TRIAL_REMIND med Avslutt nå / Behold / Minn meg i morgen.
//  • AI-svar (AI_ANSWER) postes med en gang når assist-jobben blir ferdig i bakgrunnen (Assist31.swift).
// Trykk på et varsel: Chat (med samtalen), Hjem, Abonnementer eller System.

enum Notify31 {
    nonisolated static let taskId: String = "no.kristo.finanshub.notify"
    nonisolated static let aiCategory: String = "AI_ANSWER"
    nonisolated static let trialCategory: String = "TRIAL_REMIND"
    nonisolated static let actCancel: String = "TRIAL_CANCEL"
    nonisolated static let actKeep: String = "TRIAL_KEEP"
    nonisolated static let actSnooze: String = "TRIAL_SNOOZE"

    private static let sinceKey: String = "notify31_since"
    private static let seenKey: String = "notify31_seen"

    /// Appen (settes fra PaperShell), så trykk på varsler kan åpne riktig side.
    @MainActor static weak var store: Store? = nil {
        didSet { if store != nil { flushQueued() } }
    }
    @MainActor private static var queued: [(String, String)] = []

    /* ---------- Oppsett (App.init) ---------- */

    nonisolated static func setup() {
        let cancel = UNNotificationAction(identifier: actCancel, title: "Avslutt nå", options: [.foreground])
        let keep = UNNotificationAction(identifier: actKeep, title: "Behold", options: [])
        let snooze = UNNotificationAction(identifier: actSnooze, title: "Minn meg i morgen", options: [])
        let trial = UNNotificationCategory(identifier: trialCategory, actions: [cancel, keep, snooze], intentIdentifiers: [], options: [])
        let ai = UNNotificationCategory(identifier: aiCategory, actions: [], intentIdentifiers: [], options: [])
        // Prompt 40 (1b): Glimt foreslår Hjemlys – «Ja, start» / «Ikke nå» (Hjemlys40Glimt.swift).
        // Prompt 41: «Drar du nå?» (Ja / + 15 min) for Hjemlys «Drar snart» (Hjemlys41.swift).
        // Prompt 50: Sjekk inn – 👍 / Ring / Hent, «👍 Alt bra» / Sjekk inn og Hent / Ring på «Hent meg» (Family50Notify.swift).
        UNUserNotificationCenter.current().setNotificationCategories(Set<UNNotificationCategory>([trial, ai, Hjemlys40Glimt.makeCategory(), Hjemlys41.makeCategory()] + Fam50Notify.categories()))
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { (task: BGTask) in
            Notify31.schedule()
            let work = Task { @MainActor in
                if let api = HealthSync.backgroundAPI() {
                    await Notify31.fetchPending(api)
                    await Trial31Model.shared.load(api)
                    await Hjemlys40Glimt.backgroundCheck(api)
                }
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { (_: Notification) in
            Notify31.schedule()
        }
    }

    nonisolated static func schedule() {
        let r = BGAppRefreshTaskRequest(identifier: taskId)
        r.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(r)
    }

    /* ---------- Lokale varsler ---------- */

    /// «Glimt» med svaret uten markdown. threadIdentifier = chat-id, så svarene i samme samtale grupperes.
    nonisolated static func postAnswer(body: String, go: String, chatId: String, id: String) {
        let c = UNMutableNotificationContent()
        c.title = "Glimt"
        c.body = body
        c.sound = NotifyModel.currentSound()
        c.categoryIdentifier = aiCategory
        c.threadIdentifier = chatId.isEmpty ? "glimt" : chatId
        c.userInfo = ["go": go, "chatId": chatId]
        // Prompt 39: Glimt-logoen på varselet (Communication Notification når det er slått på, ellers vedlegg). GlimtNotify39.swift.
        let out: UNNotificationContent = GlimtNotify39.decorate(c, chatId: chatId)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: out, trigger: nil)) { (_: Error?) in }
    }

    nonisolated static func markDelivered(_ id: String) {
        var seen: [String] = UserDefaults.standard.stringArray(forKey: seenKey) ?? []
        if seen.contains(id) { return }
        seen.append(id)
        UserDefaults.standard.set(Array(seen.suffix(200)), forKey: seenKey)
    }

    nonisolated static func delivered(_ id: String) -> Bool {
        (UserDefaults.standard.stringArray(forKey: seenKey) ?? []).contains(id)
    }

    /// GET /api/notify/pending?since= → lokale varsler. Køen inneholder AI-svar, prøve-varsler, oppdatering og rask time.
    /// post = false (appen er åpen): ingen varsler, og ingen banner (prompt 45: Glimt-svar bare som systemvarsel).
    @MainActor static func fetchPending(_ api: API, post: Bool = true) async {
        let since: String = UserDefaults.standard.string(forKey: sinceKey) ?? ""
        let q: String = since.isEmpty ? "" : "?since=" + (since.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? since)
        guard let d = try? await api.callAt("/api", "GET", "/notify/pending" + q, timeout: 20) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        let root: [String: Any] = (any as? [String: Any]) ?? [:]
        var items: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        if items.isEmpty { items = JS.list(root, "items") }
        if items.isEmpty { items = JS.list(root, "pending") }
        var newest: String = since
        var lastAi: String = ""
        for it in items {
            if post {
                Notify31.post(it)
            } else if Fam50Notify.wants(it["data"] as? [String: Any]) {
                // Prompt 50: innsjekker og «Hent meg» vises også når appen er åpen (samme varsel som sanntid, bare én gang).
                let qid: String = JS.str(it, "id") ?? ""
                if !qid.isEmpty && !delivered(qid) { markDelivered(qid); Fam50Notify.postPending(it) }
            } else {
                let id: String = JS.str(it, "jobId") ?? JS.str(it, "id") ?? ""
                let cat: String = (JS.str(it, "category") ?? JS.str(it, "kind") ?? "").lowercased()
                if !id.isEmpty && !delivered(id) {
                    markDelivered(id)
                    if cat.hasPrefix("ai") { lastAi = (JS.str(it, "body") ?? "").replacingOccurrences(of: "**", with: "") }
                }
            }
            let at: String = JS.str(it, "createdAt") ?? JS.str(it, "created") ?? JS.str(it, "at") ?? ""
            if at > newest { newest = at }
        }
        if let now = JS.str(root, "now") ?? JS.str(root, "cursor") { newest = now }
        if !newest.isEmpty { UserDefaults.standard.set(newest, forKey: sinceKey) }
        // Prompt 45: ingen banner i appen for svar som kom mens den var lukket (bare systemvarsel).
        _ = lastAi
    }

    /// Ett element fra køen som lokalt varsel (hopper over det som allerede er vist).
    @MainActor private static func post(_ it: [String: Any]) {
        let id: String = JS.str(it, "jobId") ?? JS.str(it, "id") ?? UUID().uuidString
        if delivered(id) { return }
        markDelivered(id)
        // Prompt 50: Sjekk inn med handlinger (👍 / Ring / Hent) og «Hent meg» som tidskritisk varsel (Family50Notify.swift).
        if Fam50Notify.wants(it["data"] as? [String: Any]) { Fam50Notify.postPending(it); return }
        let cat: String = (JS.str(it, "category") ?? JS.str(it, "kind") ?? "").lowercased()
        if !NotifyModel.allowed(nil) { return }
        if cat.hasPrefix("ai") && !NotifyModel.shared.aiBg { return }
        let c = UNMutableNotificationContent()
        c.title = JS.str(it, "title") ?? "Nordlys"
        c.body = (JS.str(it, "body") ?? "").replacingOccurrences(of: "**", with: "")
        c.sound = NotifyModel.currentSound()
        var info: [String: Any] = ["url": JS.str(it, "url") ?? ""]
        if cat.hasPrefix("ai") {
            c.categoryIdentifier = aiCategory
            let chat: String = JS.str(it, "chatId") ?? ""
            c.threadIdentifier = chat.isEmpty ? "glimt" : chat
            info["go"] = chat.isEmpty && (JS.str(it, "source") ?? "") == "search" ? "hjem" : "chat"
            info["chatId"] = chat
        } else if cat.hasPrefix("trial") {
            c.categoryIdentifier = trialCategory
            info["trialId"] = JS.str(it, "trialId") ?? JS.str(it, "refId") ?? ""
            info["cancelUrl"] = JS.str(it, "cancelUrl") ?? ""
            info["service"] = JS.str(it, "service") ?? ""
        }
        if let tag = JS.str(it, "tag") { c.threadIdentifier = tag }
        c.userInfo = info
        // Prompt 39: AI-svar har tittelen «Glimt» og Glimt-logoen (GlimtNotify39.swift).
        var out: UNNotificationContent = c
        if cat.hasPrefix("ai") || cat.hasPrefix("receipt") || cat.hasPrefix("kvitt") {
            if cat.hasPrefix("ai") { c.title = "Glimt" }
            out = GlimtNotify39.decorate(c, chatId: (info["chatId"] as? String) ?? "")
        }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "pending-" + id, content: out, trigger: nil)) { (_: Error?) in }
    }

    /* ---------- Trykk og handlinger ---------- */

    /// Fra NotifyDelegate (Haptics.swift).
    nonisolated static func handle(_ response: UNNotificationResponse) {
        if Fam50Notify.handle(response) { return }
        if Hjemlys40Glimt.handle(response) { return }
        if Hjemlys41.handle(response) { return }
        let info: [AnyHashable: Any] = response.notification.request.content.userInfo
        let action: String = response.actionIdentifier
        let go: String = (info["go"] as? String) ?? ""
        let chat: String = (info["chatId"] as? String) ?? ""
        let url: String = (info["url"] as? String) ?? ""
        let trialId: String = (info["trialId"] as? String) ?? ""
        let cancelUrl: String = (info["cancelUrl"] as? String) ?? ""
        let service: String = (info["service"] as? String) ?? ""
        let cat: String = response.notification.request.content.categoryIdentifier
        Task { @MainActor in
            if cat == trialCategory || !trialId.isEmpty {
                Trial31Model.shared.action(action, id: trialId, service: service, cancelUrl: cancelUrl)
                if action == UNNotificationDefaultActionIdentifier { route("abo", chat: "") }
                return
            }
            if cat == aiCategory { Assist31.shared.clearAway() }
            if action != UNNotificationDefaultActionIdentifier { return }
            if !go.isEmpty { route(go, chat: chat); return }
            if !url.isEmpty { route(Notify31.page(url), chat: chat) }
        }
    }

    /// /chat/… → chat, /kalender → kalender, abonnement → abo, system/oppdatering → system.
    nonisolated static func page(_ url: String) -> String {
        let u: String = url.lowercased()
        // Prompt 51 (SEC51): «Ny enhet vil logge inn» → Innstillinger → Sikkerhet.
        if u.contains("sikkerhet") || u.contains("security") { return "innst-sik" }
        if u.contains("chat") { return "chat" }
        if u.contains("kalender") || u.contains("calendar") { return "kalender" }
        if u.contains("abonnement") || u.contains("subscription") || u.contains("trial") { return "abo" }
        if u.contains("system") || u.contains("oppdater") || u.contains("update") { return "system" }
        return "hjem"
    }

    @MainActor private static func route(_ go: String, chat: String) {
        guard let s = store else { queued.append((go, chat)); return }
        open(go: go, chatId: chat, s)
    }

    @MainActor private static func flushQueued() {
        guard let s = store, !queued.isEmpty else { return }
        let q: [(String, String)] = queued
        queued = []
        for (g, c) in q { open(go: g, chatId: c, s) }
    }

    /// Åpner siden varselet gjelder.
    @MainActor static func open(go: String, chatId: String, _ store: Store) {
        switch go {
        case "chat":
            store.paperGo("chat")
            if !chatId.isEmpty {
                let c: ChatStore27 = ChatStore27.shared
                c.curId = chatId
                Task { await c.loadChat(chatId, store) }
            }
        case "abo":
            store.paperGo("abo")
        case "kalender":
            store.paperGo("kalender")
        case "system":
            System31Model.shared.show()
        case "innst-sik":
            store.paperGo("innst-sik")
        default:
            store.paperGo("hjem")
        }
    }
}
