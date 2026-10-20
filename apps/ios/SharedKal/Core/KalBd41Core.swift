import Foundation

/* ---------------- Prompt 41: Kalender – bursdagshendelser (ren logikk, delt av appen og widgetene) ---------------- */
// Fasit: Kalender App.dc.html → R.dt.bd. En hendelse er en bursdag når den ligger i kalenderen Bursdager, er merket «bursdag»,
// eller har «bursdag» i tittelen. Navnet hentes fra tittelen («Patryk Mis har bursdag», «Emmas bursdag», «Bursdag: Emma»)
// og kobles til personen i Bursdager (GET /api/birthdays → items) for bilde og fødselsår.

struct KalBdPerson41: Codable, Hashable {
    var id: Int
    var name: String
    var year: Int?
    var avatarUrl: String
    var phone: String
    /// «sms» eller «whatsapp» (valgt i Bursdager).
    var via: String
    var photo: String
}

enum KalBd41 {
    static func isBirthday(_ e: KalEvent, calName: String) -> Bool {
        if e.kind == "bursdag" || e.cal == "b" { return true }
        if calName.lowercased().contains("bursdag") { return true }
        return e.title.lowercased().contains("bursdag")
    }

    private static func strip(_ s: String, _ pattern: String) -> String {
        s.replacingOccurrences(of: pattern, with: "", options: [.regularExpression, .caseInsensitive])
    }

    /// «Patryk Mis har bursdag» → «Patryk Mis», «Emmas bursdag» → «Emma», «Bursdag: Emma» → «Emma», «Sebastian 12 år» → «Sebastian».
    static func name(_ title: String) -> String {
        var s: String = title.trimmingCharacters(in: .whitespaces)
        s = strip(s, "\\s+har\\s+bursdag\\s*[!.]*$")
        s = strip(s, "s?\\s+bursdag\\s*[!.]*$")
        s = strip(s, "^bursdag\\s*[:·–-]?\\s*")
        s = strip(s, "\\s+\\(?\\d{1,3}\\s*år\\)?$")
        s = s.trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? title : s
    }

    /// Tittel i liste-, dag- og ukevisning: navnet uten «har bursdag».
    static func listTitle(_ e: KalEvent, calName: String) -> String {
        isBirthday(e, calName: calName) ? name(e.title) : e.title
    }

    static func initials(_ n: String) -> String {
        let parts: [Substring] = n.split(separator: " ")
        let s: String = parts.prefix(2).compactMap { (w: Substring) -> String? in w.first.map { (c: Character) -> String in String(c) } }.joined()
        return s.uppercased()
    }

    /// Personen i Bursdager med samme navn (eller som navnet starter med).
    static func match(_ n: String, in list: [KalBdPerson41]) -> KalBdPerson41? {
        let low: String = n.lowercased()
        if low.isEmpty { return nil }
        if let p = list.first(where: { (x: KalBdPerson41) -> Bool in x.name.lowercased() == low }) { return p }
        if let p = list.first(where: { (x: KalBdPerson41) -> Bool in !x.name.isEmpty && low.hasPrefix(x.name.lowercased()) }) { return p }
        return list.first { (x: KalBdPerson41) -> Bool in
            let first: String = String(x.name.lowercased().split(separator: " ").first ?? "")
            return !first.isEmpty && low == first
        }
    }

    static func parsePeople(_ d: Data) -> [KalBdPerson41] {
        guard let any = try? JSONSerialization.jsonObject(with: d) else { return [] }
        var rows: [[String: Any]] = []
        if let o = any as? [String: Any] {
            rows = (o["items"] as? [[String: Any]]) ?? (o["people"] as? [[String: Any]]) ?? []
        } else if let a = any as? [[String: Any]] {
            rows = a
        }
        var out: [KalBdPerson41] = []
        for r in rows {
            let id: Int = (r["id"] as? Int) ?? Int((r["id"] as? String) ?? "") ?? 0
            let n: String = (r["name"] as? String) ?? ""
            if n.isEmpty { continue }
            let via: String = (r["congratsVia"] as? String) ?? (r["greetVia"] as? String) ?? (r["via"] as? String) ?? ""
            let photo: String = (r["photoUrl"] as? String) ?? (r["photo"] as? String) ?? ""
            out.append(KalBdPerson41(id: id, name: n, year: r["year"] as? Int, avatarUrl: (r["avatarUrl"] as? String) ?? "",
                                     phone: (r["phone"] as? String) ?? "", via: via.lowercased(), photo: photo))
        }
        return out
    }

    /// GET /api/birthdays/:id/photos → første bilde-URL ({photos:[{url}]}, {items:[…]} eller [..]).
    static func firstPhoto(_ d: Data) -> String? {
        guard let any = try? JSONSerialization.jsonObject(with: d) else { return nil }
        var rows: [[String: Any]] = []
        if let o = any as? [String: Any] {
            rows = (o["photos"] as? [[String: Any]]) ?? (o["items"] as? [[String: Any]]) ?? []
        } else if let a = any as? [[String: Any]] {
            rows = a
        }
        for r in rows {
            if let u = (r["url"] as? String) ?? (r["src"] as? String) ?? (r["thumb"] as? String), !u.isEmpty { return u }
        }
        return nil
    }

    /// «BURSDAG» / «BURSDAG I DAG», stort tall og enhet («25 dager igjen», «I dag», «2 dager siden»).
    static func counter(_ day: String) -> (kicker: String, big: String, unit: String) {
        let n: Int = KalD.daysBetween(KalD.todayKey(), day)
        if n == 0 { return ("BURSDAG I DAG", "I dag", "") }
        if n < 0 { return ("BURSDAG", String(-n), n == -1 ? "dag siden" : "dager siden") }
        return ("BURSDAG", String(n), n == 1 ? "dag igjen" : "dager igjen")
    }

    /// «Fyller 21 · lørdag 14. november» (alder bare når år er kjent).
    static func sub(_ day: String, year: Int?) -> String {
        let d: Date = KalD.date(day)
        let date: String = KalD.cap(KalD.weekdays[KalD.wd(d)]) + " " + String(KalD.dayOfMonth(d)) + ". " + KalD.months[KalD.month(d) - 1]
        if let y = year, y > 1900 {
            let age: Int = KalD.year(d) - y
            if age > 0 && age < 130 { return "Fyller " + String(age) + " · " + date }
        }
        return date
    }

    /// Statisk konfetti (16 biter): x, y (0…1), bredde, høyde, rund, fargeindeks, vinkel.
    struct Bit: Hashable {
        let x: Double
        let y: Double
        let w: Double
        let h: Double
        let round: Bool
        let color: Int
        let angle: Double
    }

    static func rr(_ i: Int) -> Double {
        let v: Double = (sin(Double(i) * 91.7) * 43758.5).truncatingRemainder(dividingBy: 1)
        return (v + 1).truncatingRemainder(dividingBy: 1)
    }

    static let confettiHex: [String] = ["#f2c14e", "#ffffff", "#3fbf9a", "#a8d4fb", "#ffd2c2"]

    static func confetti() -> [Bit] {
        (0..<16).map { (i: Int) -> Bit in
            Bit(x: rr(i), y: rr(i + 9), w: 5 + rr(i + 3) * 5, h: 8 + rr(i + 4) * 6, round: rr(i + 2) > 0.6,
                color: i % confettiHex.count, angle: (rr(i + 6) * 180).rounded())
        }
    }

    /// Google-hendelser: «Slett» fjerner bare i Kalender-visningen.
    static func fromGoogle(_ e: KalEvent) -> Bool {
        let sc: String = e.serverCal.lowercased()
        return e.id.hasPrefix("g-") || e.id.hasPrefix("gc") || sc.contains("google") || sc.hasPrefix("g:")
    }
}
