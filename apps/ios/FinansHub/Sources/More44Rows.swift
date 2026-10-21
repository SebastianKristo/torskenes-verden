import SwiftUI
import CoreLocation

/* ---------------- Prompt 44: Mer – modulene og det levende innholdet ----------------
 Samme moduler og nøkler som Mer28 (prompt 28–43), pluss Studie (dokumenter, prompt 44). Moduler som er slått av
 (Media uten tilgang, Bibel uten modulen) vises ikke. Teksten er alltid ekte data eller en kort tom-tekst. */

@MainActor
enum More44Rows {
    static func rows(_ store: Store) -> [More28Row] {
        let inBar: Set<String> = Set(store.mainTabs(floating: store.fabMode == "float", onHome: true).map(\.0))
        var out: [More28Row] = []
        out.append(More28Row(id: "kalender", name: "Kalender", sub: "Timeplan, prøver og frister", icon: "calendar") { store.paperGo("kalender") })
        out.append(More28Row(id: "huske", name: "Gjøremål", sub: "To-do for hele familien", icon: "checklist") { store.paperGo("huske") })
        out.append(More28Row(id: "bursdag", name: "Bursdager", sub: "Hvem har bursdag snart", icon: "gift") { store.paperGo("bursdag") })
        if !inBar.contains("familie") {
            out.append(More28Row(id: "kart", name: "Familie og kart", sub: "Posisjon, soner og helse", icon: "mappin.and.ellipse") { store.paperGo("familie") })
        }
        out.append(More28Row(id: "brief", name: "Now Brief", sub: Brief36Model.shared.merSub, icon: "sparkle") { Brief34Model.shared.show() })
        out.append(More28Row(id: "chat", name: "Chat", sub: "Ollama lokalt, Gemini og Groq", icon: "bubble.left.and.bubble.right") { store.openChat() })
        if Media43.shared.allowed {
            out.append(More28Row(id: "media", name: "Media", sub: mediaSub, icon: "play.rectangle") { Media43.shared.show() })
        }
        if !inBar.contains("hjem") {
            out.append(More28Row(id: "hjem", name: "Hjem", sub: "Pakker, avganger og widgets", icon: "house") { store.paperGo("hjem") })
        }
        if !inBar.contains("sporing") {
            let n: Int = store.paperOnWay
            let s: String = n > 0 ? (n == 1 ? "1 pakke på vei" : "\(n) pakker på vei") : "Pakker og sendinger"
            out.append(More28Row(id: "sporing", name: "Sporing", sub: s, icon: "shippingbox") { store.paperGo("sporing") })
        }
        if !inBar.contains("domener") {
            out.append(More28Row(id: "domener", name: "Domener", sub: domainSub(store), icon: "globe") { store.paperOpenDomains(from: "mer") })
        }
        out.append(More28Row(id: "studie", name: "Studie", sub: Study44.shared.merSub, icon: "graduationcap") { Study44.shared.show() })
        out.append(More28Row(id: "finans", name: "Finans", sub: "Oversikt, liste, Finn og mer", icon: "creditcard") { store.paperMainTab("finans") })
        out.append(More28Row(id: "abo", name: "Subscription OS", sub: subsSub(store), icon: "arrow.triangle.2.circlepath") { store.paperGo("abo") })
        if Bible37Model.shared.enabled {
            out.append(More28Row(id: "bibel", name: "Bibel", sub: bibleSub, icon: "book") { store.paperGo("bibel") })
        }
        if !inBar.contains("nyheter") {
            out.append(More28Row(id: "rss", name: "Nyhetsleser", sub: "RSS med AI-sammendrag", icon: "dot.radiowaves.up.forward") { store.openNews() })
        }
        out.append(More28Row(id: "innst", name: "Innstillinger", sub: "Tema, bakgrunn og konto", icon: "gearshape") { store.paperGo("innst") })
        return out
    }

    /// Henter det som mangler for de levende kortene (én gang, i bakgrunnen).
    static func warm(_ store: Store) async {
        if !Cal26Model.shared.loaded { await Cal26Model.shared.load(store) }
        if !TasksModel.shared.loaded { await TasksModel.shared.load(store) }
        if !BirthdayModel24.shared.loaded { await BirthdayModel24.shared.load(store) }
        if FamilyModel.shared.members.isEmpty { await FamilyModel.shared.load(store) }
        if Study44.shared.docs.isEmpty { await Study44.shared.load(store) }
    }

    /* ---------- Undertekster ---------- */

    static var mediaSub: String {
        let m: Media43 = Media43.shared
        let n: Int = m.torrents.filter { !$0.done }.count
        let since: Date = Date().addingTimeInterval(-3600)
        let up: Media43Item? = m.upcoming.first(where: { (it: Media43Item) -> Bool in
            let d: Date = it.date ?? .distantPast
            return it.status != "downloaded" && d > since
        })
        let next: String = up?.title ?? ""
        var parts: [String] = []
        if n > 0 { parts.append("\(n) lastes ned") }
        if !next.isEmpty { parts.append("neste: " + next) }
        return parts.isEmpty ? "Kommer snart, serier, filmer og nedlastinger" : parts.joined(separator: " · ")
    }

    static func domainSub(_ store: Store) -> String {
        guard let d = store.domainToday, d.visitors > 0 else { return "Trafikk, besøk og oppetid" }
        return More44Rows.thousands(Int(d.visitors)) + " besøk siste døgn"
    }

    static func subsSub(_ store: Store) -> String {
        guard let m = store.subs?.monthly, m > 0 else { return "Abonnementer og faste trekk" }
        return More44Rows.thousands(Int(m.rounded())) + " kr/mnd"
    }

    static var bibleSub: String {
        let st: Int = Bible37Model.shared.streak
        return st > 0 ? "Dag \(st) på rad" : "Dagens vers, rekke og leseplan"
    }

    nonisolated static func thousands(_ n: Int) -> String {
        let f: NumberFormatter = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = "\u{00A0}"
        f.locale = Locale(identifier: "nb_NO")
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    /// Raden (Lave og verktøy): levende linje for Hverdag, ellers modulens undertekst.
    static func line(_ r: More28Row, _ store: Store) -> String {
        if Mer44.dailyKeys.contains(r.id) { return live(r.id, store).line }
        return r.sub
    }

    /* ---------- Levende innhold ---------- */

    static func live(_ k: String, _ store: Store) -> More44Live {
        switch k {
        case "kalender": return calendar()
        case "huske": return tasks()
        case "bursdag": return birthday()
        case "kart": return family()
        default: return More44Live(key: k)
        }
    }

    static func calendar() -> More44Live {
        let now: Date = Date()
        let next: CalEvent26? = Cal26Model.shared.events
            .filter { $0.end > now && !$0.allDay }
            .sorted { $0.start < $1.start }
            .first
        guard let e = next else {
            return More44Live(key: "kalender", kicker: "", value: "Ingen hendelser i dag", sub: "", line: "Ingen hendelser i dag")
        }
        let when: String = More44Rows.when(e.start)
        return More44Live(key: "kalender", kicker: "Neste", value: e.title, sub: when, line: "Neste: " + e.title + " · " + when.lowercased())
    }

    /// «I dag · 15:15», «I morgen · 09:00», «Fre 24. okt · 09:00».
    nonisolated static func when(_ d: Date) -> String {
        let cal: Calendar = Calendar.current
        let hm: String = JS.fmt(d, "HH:mm")
        if cal.isDateInToday(d) { return "I dag · " + hm }
        if cal.isDateInTomorrow(d) { return "I morgen · " + hm }
        let day: String = JS.fmt(d, "EEE d. MMM").replacingOccurrences(of: ".", with: "", options: [], range: nil)
        let cap: String = day.prefix(1).uppercased() + day.dropFirst()
        return cap + " · " + hm
    }

    static func tasks() -> More44Live {
        let n: Int = TasksModel.shared.openCount
        let s: String = n == 1 ? "åpen for familien" : "åpne for familien"
        return More44Live(key: "huske", kicker: "", value: "\(n)", sub: s, big: true, line: "\(n) " + s)
    }

    static func birthday() -> More44Live {
        let next: Birthday24? = BirthdayModel24.shared.items.filter { $0.daysLeft >= 0 && $0.daysLeft <= 30 }.min { $0.daysLeft < $1.daysLeft }
        guard let b = next else {
            return More44Live(key: "bursdag", value: "Ingen bursdager", sub: "de neste 30 dagene", line: "Ingen bursdager de neste 30 dagene")
        }
        let first: String = b.name.split(separator: " ").first.map(String.init) ?? b.name
        let d: String = b.daysLeft == 0 ? "i dag" : (b.daysLeft == 1 ? "i morgen" : "om \(b.daysLeft) dager")
        return More44Live(key: "bursdag", kicker: "Snart", value: first, sub: d, line: first + " " + d)
    }

    static func family() -> More44Live {
        let fm: FamilyModel = FamilyModel.shared
        let people: [FamMember] = fm.members
        if people.isEmpty { return More44Live(key: "kart", value: "", sub: "Posisjon, soner og helse", line: "Posisjon, soner og helse") }
        let homes: [FamZone] = fm.zones.filter { $0.icon == "home" || $0.name.lowercased().hasPrefix("hjem") }
        let atHome: Int = people.filter { (m: FamMember) -> Bool in
            guard let pos = m.last else { return false }
            let c = CLLocationCoordinate2D(latitude: pos.lat, longitude: pos.lon)
            return homes.contains { famDistance($0.coord, c) <= Swift.max(60, $0.radius) }
        }.count
        let s: String = homes.isEmpty ? "\(people.count) i familien" : "\(atHome) av \(people.count) hjemme"
        let av: [(String, Color)] = people.map { (m: FamMember) -> (String, Color) in
            let i: String = String(m.name.prefix(1)).uppercased()
            return (i, m.color.isEmpty ? Media43Poster.tint(m.name) : Color(hex: m.color))
        }
        return More44Live(key: "kart", value: "", sub: s, avatars: av, line: s)
    }
}
