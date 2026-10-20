import Foundation
import SwiftUI
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 41: Hjemlys «Si fra» og rettelser i Live Activity (felles for appen og widgetene) ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-hjemlys.md («Si fra», «Feil i Live Activity»), fasit
   Hjemme trygt Varianter.dc.html → 3a–3c og 4a–4d.
   – Gløden: Circle med RadialGradient + skygge med 6 pt luft og compositingGroup (aldri et bilde som klippes til en firkant).
   – «Rune og Cybele følger med», ved 3+: «Rune, Cybele og 1 til». Du selv er aldri med.
   – «Drar snart»: knappene «+ 15 min» og «Drar nå» virker uten å åpne appen:
     PATCH /api/hjemlys/notice/:id {plus:15} og POST /api/hjemlys/notice/:id/now (id = serverens beskjed-id; uten den:
     POST /api/hjemlys/notice {kind, to}) og oppdaterer/avslutter Live Activity. */

/// Den glødende prikken uten klipping (Live Activity, Dynamic Island og låseskjermen).
struct Hjemlys41Glow: View {
    let size: CGFloat
    var state: String = "onTheWay"

    var body: some View {
        Group {
            if state == "late" {
                Text("!").font(.system(size: size * 0.55, weight: .heavy)).foregroundStyle(Color.white)
                    .frame(width: size, height: size)
                    .background(Circle().fill(Hjemlys40Look.red))
                    .shadow(color: Hjemlys40Look.red.opacity(0.6), radius: 6)
            } else {
                Circle()
                    .fill(RadialGradient(colors: state == "home" ? [Hjemlys40Look.c(0xfff6d6), Hjemlys40Look.gold] : [Hjemlys40Look.glowIn, Hjemlys40Look.glowOut],
                                         center: UnitPoint(x: 0.5, y: 0.4), startRadius: 0, endRadius: size * 0.5))
                    .frame(width: size, height: size)
                    .shadow(color: Color.orange.opacity(0.6), radius: 6)
            }
        }
        .padding(6)
        .compositingGroup()
        .accessibilityHidden(true)
    }
}

enum Hjemlys41Text {
    /// «Rune følger med» · «Rune og Cybele følger med» · «Rune, Cybele og 1 til følger med». Tom = «Husstanden følger med».
    static func following(_ names: [String]) -> String {
        let first: [String] = names.map { (n: String) -> String in String(n.split(separator: " ").first ?? Substring(n)) }.filter { !$0.isEmpty }
        if first.isEmpty { return "Husstanden følger med" }
        return list(first) + " følger med"
    }

    /// «Rune» · «Rune og Cybele» · «Rune, Cybele og 1 til».
    static func list(_ first: [String]) -> String {
        if first.count == 1 { return first[0] }
        if first.count == 2 { return first[0] + " og " + first[1] }
        return first[0] + ", " + first[1] + " og \(first.count - 2) til"
    }

    /// Fjerner deg selv (navn eller brukernavn) fra en navneliste.
    static func withoutMe(_ names: [String], me: [String]) -> [String] {
        let mine: Set<String> = Set(me.map { (s: String) -> String in s.lowercased().trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
        let myFirst: Set<String> = Set(mine.map { (s: String) -> String in String(s.split(separator: " ").first ?? Substring(s)) })
        return names.filter { (n: String) -> Bool in
            let l: String = n.lowercased().trimmingCharacters(in: .whitespaces)
            if l.isEmpty || mine.contains(l) { return false }
            let f: String = String(l.split(separator: " ").first ?? Substring(l))
            return !myFirst.contains(f)
        }
    }
}

/* ---------- App Intents for «Drar snart» ---------- */

/// «+ 15 min» på «Drar snart».
struct Hjemlys41SoonPlusIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Vel fremme: drar senere"
    static var description: IntentDescription = IntentDescription("Flytter tiden du drar 15 minutter frem og sier fra.")

    @Parameter(title: "Økt")
    var sessionId: String

    init() {}

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let id: String = sessionId
        var to: [String] = []
        var newEta: Double = Date().timeIntervalSince1970 + 15 * 60
        #if canImport(ActivityKit)
        if let a = Hjemlys40Activity.find(id) {
            to = a.attributes.to ?? []
            newEta = Swift.max(a.content.state.eta, Date().timeIntervalSince1970) + 15 * 60
        }
        let e: Double = newEta
        await Hjemlys40Activity.update(id) { (st: inout Hjemlys40Attributes.ContentState) in st.eta = e }
        #endif
        if id.hasPrefix("notice-") {
            let iso: String = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: newEta))
            await Hjemlys40Net.call("POST", "/hjemlys/notice", ["kind": "leaving_soon", "leave_at": iso, "to": to])
        } else {
            let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
            await Hjemlys40Net.call("PATCH", "/hjemlys/notice/" + enc, ["plus": 15])
        }
        NotificationCenter.default.post(name: Hjemlys40Intents.changed, object: nil)
        return .result()
    }
}

/// «Drar nå» på «Drar snart»: én beskjed (uten mål), Live Activity forsvinner.
struct Hjemlys41LeaveNowIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Vel fremme: drar nå"
    static var description: IntentDescription = IntentDescription("Sier fra at du drar nå.")

    @Parameter(title: "Økt")
    var sessionId: String

    init() {}

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let id: String = sessionId
        var to: [String] = []
        #if canImport(ActivityKit)
        if let a = Hjemlys40Activity.find(id) { to = a.attributes.to ?? [] }
        #endif
        if id.hasPrefix("notice-") {
            await Hjemlys40Net.call("POST", "/hjemlys/notice", ["kind": "leaving_now", "to": to])
        } else {
            let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
            await Hjemlys40Net.call("POST", "/hjemlys/notice/" + enc + "/now", [:])
        }
        #if canImport(ActivityKit)
        await Hjemlys40Activity.end(id, home: false)
        #endif
        NotificationCenter.default.post(name: Hjemlys40Intents.changed, object: nil)
        return .result()
    }
}
