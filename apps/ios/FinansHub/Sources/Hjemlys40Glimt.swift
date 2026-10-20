import SwiftUI
import UIKit
import UserNotifications

/* ---------------- Prompt 40 (tillegg) 1b «Glimt foreslår»: varsel med «Ja, start» / «Ikke nå», samtale og logg ----------------
   Fasit: design/Hjemme trygt Varianter.dc.html → 1b. Varselet («✦ Glimt · nå: Kinoen er ferdig. Skal jeg si fra til Rune og Cybele
   når du er hjemme?» + «Trikk 19 fra Majorstuen · hjemme ca. 23:38») har handlingene «Ja, start» (åpner appen og starter Hjemlys
   med Live Activity) og «Ikke nå» (ingen forslag mer i dag). Varselet sendes fra bakgrunnshentingen (Notify31, hvert ~15. min) når
   GET /api/hjemlys/suggest sier suggest:true, én gang per forslag. I appen vises samme forslag som kort (Hjemlys40Suggest).
   Samtalen: Glimt sjekker inn («Startet 23:12. Rune og Cybele får beskjed …»), loggen fra GET /api/hjemlys/:id/log
   ([{at, text, who}]) og svar på det du skriver («Går innom Kiwi først» → + 10 min, «hjemme» → Jeg er hjemme). */

struct Hjemlys40Msg: Identifiable, Hashable {
    var id: String = UUID().uuidString
    /// glimt | me | family
    var who: String
    var text: String
    var at: Date = Date()
}

@MainActor
@Observable
final class Hjemlys40Glimt {
    static let shared = Hjemlys40Glimt()

    nonisolated static let category: String = "HJEMLYS_SUGGEST"
    nonisolated static let actYes: String = "HJEMLYS_YES"
    nonisolated static let actNo: String = "HJEMLYS_NO"
    nonisolated private static let dismissKey: String = "hl40_suggest_no"
    nonisolated private static let postedKey: String = "hl40_suggest_posted"
    nonisolated private static let acceptKey: String = "hl40_suggest_accept"

    var chatOpen: Bool = false
    var msgs: [Hjemlys40Msg] = []
    var draft: String = ""
    var sessionId: String = ""

    /* ---------- Varselet ---------- */

    nonisolated static func makeCategory() -> UNNotificationCategory {
        let yes: UNNotificationAction = UNNotificationAction(identifier: actYes, title: "Ja, start", options: [.foreground])
        let no: UNNotificationAction = UNNotificationAction(identifier: actNo, title: "Ikke nå", options: [])
        return UNNotificationCategory(identifier: category, actions: [yes, no], intentIdentifiers: [], options: [])
    }

    nonisolated static func today() -> String {
        let f: DateFormatter = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    nonisolated static var dismissedToday: Bool { UserDefaults.standard.string(forKey: dismissKey) == today() }

    nonisolated static func markDismissed() { UserDefaults.standard.set(today(), forKey: dismissKey) }

    /// «Ikke nå» (kortet i appen).
    static func dismiss() {
        Haptic30.light()
        markDismissed()
        Hjemlys40Model.shared.suggest = false
    }

    /// «Ja, start»: Glimts tid (ellers om 30 min), kollektiv når ruten har det.
    static func accept(_ store: Store) {
        let m: Hjemlys40Model = Hjemlys40Model.shared
        let eta: Date = (m.suggestEta.flatMap { $0 > Date().addingTimeInterval(120) ? $0 : nil }) ?? Date().addingTimeInterval(30 * 60)
        markDismissed()
        m.suggest = false
        m.start(store, eta: eta, waitMin: 15, mode: "walk", leg: "")
    }

    /// Fra «Ja, start» i varselet før appen har en innlogget Store: tas når PaperShell er klar.
    static func consumeAccept(_ store: Store) {
        if !UserDefaults.standard.bool(forKey: acceptKey) { return }
        UserDefaults.standard.set(false, forKey: acceptKey)
        Task { @MainActor in
            await Hjemlys40Model.shared.loadSuggest(store)
            accept(store)
        }
    }

    /// Fra appen: bare når appen ikke er aktiv (i appen vises kortet).
    static func notify(_ m: Hjemlys40Model) {
        if UIApplication.shared.applicationState == .active { return }
        post(text: m.suggestLine, eta: m.suggestEta, key: m.suggestReason)
    }

    nonisolated static func post(text: String, eta: Date?, key: String) {
        if dismissedToday { return }
        let k: String = today() + "|" + key
        if UserDefaults.standard.string(forKey: postedKey) == k { return }
        UserDefaults.standard.set(k, forKey: postedKey)
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = "✦ Glimt"
        c.body = text + (eta.map { "\nHjemme ca. " + Hjemlys40Look.clock($0) } ?? "")
        c.categoryIdentifier = category
        c.sound = .default
        c.threadIdentifier = "hjemlys"
        c.interruptionLevel = .timeSensitive
        c.userInfo = ["go": "familie"]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "hjemlys-suggest", content: c, trigger: nil)) { (_: Error?) in }
    }

    /// Bakgrunnshentingen (Notify31): spør Glimt og legg varselet.
    nonisolated static func backgroundCheck(_ api: API) async {
        if dismissedToday { return }
        guard let d = try? await api.callAt("/api", "GET", "/hjemlys/suggest", timeout: 10),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any], (o["suggest"] as? Bool) == true else { return }
        let reason: String = (o["reason"] as? String) ?? ""
        var text: String = (o["text"] as? String) ?? ""
        if text.isEmpty {
            let rec: [String] = ((o["recipients"] as? [Any]) ?? []).compactMap { (x: Any) -> String? in (x as? String) ?? ((x as? [String: Any])?["name"] as? String) }
            let who: String = Hjemlys40Model.names(rec)
            text = (reason.isEmpty ? "Det er sent." : reason + ".") + " Skal jeg si fra til " + (who.isEmpty ? "husstanden" : who) + " når du er hjemme?"
        }
        let eta: Date? = Hjemlys40Look.unix(o["eta"]).map { Date(timeIntervalSince1970: $0) }
        post(text: text, eta: eta, key: reason)
    }

    /// Fra NotifyDelegate (Notify31.handle). true = håndtert.
    nonisolated static func handle(_ response: UNNotificationResponse) -> Bool {
        if response.notification.request.content.categoryIdentifier != category { return false }
        let action: String = response.actionIdentifier
        if action == actNo {
            markDismissed()
            return true
        }
        if action == actYes { UserDefaults.standard.set(true, forKey: acceptKey) }
        Task { @MainActor in
            if let s = Notify31.store {
                s.paperGo("familie")
                if action == actYes { consumeAccept(s) }
            }
        }
        return true
    }

    /* ---------- Samtalen og loggen ---------- */

    func open(_ s: Hjemlys40Session, _ store: Store) {
        Haptic30.light()
        if sessionId != s.id {
            sessionId = s.id
            msgs = [Hjemlys40Msg(who: "glimt", text: intro(s), at: s.startedAt)]
        }
        chatOpen = true
        Task { await self.loadLog(store) }
    }

    private func intro(_ s: Hjemlys40Session) -> String {
        let who: String = Hjemlys40Model.names(s.recipients.isEmpty ? Hjemlys40Model.shared.household.map(\.name) : s.recipients)
        var t: String = "Startet " + Hjemlys40Look.clock(s.startedAt) + ". " + (who.isEmpty ? "Husstanden" : who) + " får beskjed når du er hjemme, ca. " + Hjemlys40Look.clock(s.eta) + "."
        if !s.leg.isEmpty { t += " Du er på " + s.leg.lowercased() + "." }
        return t
    }

    func loadLog(_ store: Store) async {
        if sessionId.isEmpty { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/hjemlys/" + Hjemlys40Model.enc(sessionId) + "/log", timeout: 15) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        let raw: [[String: Any]] = (any as? [[String: Any]]) ?? JS.list(any as? [String: Any], "log")
        let log: [Hjemlys40Msg] = raw.compactMap { (x: [String: Any]) -> Hjemlys40Msg? in
            guard let t = JS.str(x, "text"), !t.isEmpty else { return nil }
            let who: String = JS.str(x, "who") ?? "glimt"
            let w: String = who == "glimt" || who == "system" ? "glimt" : (who == "me" ? "me" : "family")
            return Hjemlys40Msg(id: (JS.str(x, "id") ?? UUID().uuidString), who: w, text: t, at: Hjemlys40Session.date(x["at"]) ?? Date())
        }
        if log.isEmpty { return }
        let local: [Hjemlys40Msg] = msgs.filter { $0.who == "me" || $0.id.hasPrefix("local-") }
        msgs = ([msgs.first].compactMap { $0 } + log + local).sorted { $0.at < $1.at }
    }

    /// Svar på det brukeren skriver. Tid som nevnes («20 min», «innom Kiwi») → mer tid; «hjemme» → Jeg er hjemme.
    func send(_ store: Store) {
        let t: String = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return }
        draft = ""
        msgs.append(Hjemlys40Msg(who: "me", text: t))
        let m: Hjemlys40Model = Hjemlys40Model.shared
        let low: String = t.lowercased()
        var reply: String = "Notert. Familien ser bare tiden, ikke meldingene dine."
        if low.contains("hjemme") && !low.contains("ikke") {
            m.home(store)
            reply = "Så bra! Jeg sier fra at du er hjemme."
        } else if let n = Hjemlys40Glimt.minutes(low) ?? (["innom", "senere", "forsink", "venter", "stopper"].contains(where: { low.contains($0) }) ? 10 : nil) {
            m.plus(store, n)
            let eta: Date = Swift.max(m.mine?.eta ?? Date(), Date())
            reply = "Greit, jeg legger til \(n) minutter. Ny tid ca. " + Hjemlys40Look.clock(eta) + ". Familien ser bare den nye tiden."
        } else if low.contains("ok") || low.contains("fint") {
            m.ok(store)
            reply = "Fint, da vet familien at alt er OK."
        }
        msgs.append(Hjemlys40Msg(id: "local-" + UUID().uuidString, who: "glimt", text: reply))
    }

    /// «20 min», «+15», «en halvtime».
    nonisolated static func minutes(_ s: String) -> Int? {
        if s.contains("halvtime") { return 30 }
        if s.contains("en time") { return 60 }
        guard let r = s.range(of: "[0-9]{1,3}(?= ?(min|m\\b))", options: .regularExpression) else { return nil }
        return Int(s[r])
    }
}

/// Samtalen med Glimt under en aktiv økt (1b).
struct Hjemlys40ChatSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var g: Hjemlys40Glimt { Hjemlys40Glimt.shared }
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Hjemlys40Dot(size: 22, state: m.mine?.state ?? "onTheWay")
                VStack(alignment: .leading, spacing: 1) {
                    Text("✦ Vel fremme").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text("Glimt følger med").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                Spacer()
                Button("Ferdig") { g.chatOpen = false }.font(PF.ui(15, .bold)).foregroundStyle(p.lab)
            }
            .padding(16)
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(g.msgs) { (x: Hjemlys40Msg) in Hjemlys40Bubble(x: x) }
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
            }
            if let s = m.mine, s.active {
                Hjemlys40Buttons40(s: s, night: false).padding(.horizontal, 16)
            }
            HStack(spacing: 8) {
                TextField("Skriv til Glimt …", text: Binding<String>(get: { g.draft }, set: { (v: String) in g.draft = v }))
                    .font(PF.ui(15)).padding(.horizontal, 14).frame(height: 46)
                    .background(p.card, in: Capsule())
                    .submitLabel(.send)
                    .onSubmit { g.send(store) }
                Button { g.send(store) } label: {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(p.bg)
                        .frame(width: 42, height: 42).background(p.ink, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Send")
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
    }
}

struct Hjemlys40Bubble: View {
    @Environment(\.paper) private var p
    let x: Hjemlys40Msg

    var body: some View {
        HStack {
            if x.who == "me" { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 3) {
                if x.who == "family" { Text("FAMILIEN").font(PF.mono(9.5)).tracking(1).foregroundStyle(p.mut) }
                Text(x.text).font(PF.ui(14)).foregroundStyle(x.who == "me" ? p.bg : p.ink).fixedSize(horizontal: false, vertical: true)
                Text(Hjemlys40Look.clock(x.at)).font(PF.ui(10.5)).foregroundStyle(x.who == "me" ? p.bg.opacity(0.7) : p.mut)
            }
            .padding(.horizontal, 13).padding(.vertical, 9)
            .background(x.who == "me" ? p.ink : p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if x.who != "me" { Spacer(minLength: 40) }
        }
    }
}
