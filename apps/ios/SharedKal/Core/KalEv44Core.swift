import Foundation

/* ---------------- Prompt 44: Kalender – Media-utgivelser, deltakere, adresser og redigering (felles for iPhone, iPad og Mac) ---------------- */
// Spesifikasjon: claude-code-kalender-media-kalender.md, -deltakere-invitasjon.md, -sted-adresse.md og -apne-rediger.md.
// API (SERVER44, klientene tåler 404):
//   GET  /api/users/directory → {users:[{id, name, color, email}]} (samme husstand/organisasjon)
//   GET  /api/geo/address?q= → [{label, street, postcode, city, lat, lon}] (Kartverket, reserve OSM – cache på serveren)
//        Reserve i appen: Kartverket direkte (ws.geonorge.no, gratis, ingen nøkkel).
//   PATCH /api/kalender/events/:id {title, date, start, end, allDay, location, calendar, reminder, geo, attendees, scope, etag}
//   POST /api/kalender/events/:id/invite → .ics fra brukerens egen e-post (Gmail eller SMTP)
//   Hendelser: attendees:[{userId|email, name, status:'invited'|'accepted'|'declined'|'tentative'}], kind/statusText/deepLink (Media).

/// Status fra Media for en utgivelse i kalenderen «Media».
struct KalMedia44: Codable, Hashable {
    var status: String = ""
    var statusText: String = ""
    var deepLink: String = ""
    var code: String = ""
    var episode: String = ""
    var movie: Bool = false
}

/// En deltaker på en hendelse.
struct KalAtt44: Codable, Hashable, Identifiable {
    var userId: String? = nil
    var email: String? = nil
    var name: String = ""
    /// invited | accepted | declined | tentative | (tom = ikke sendt)
    var status: String = ""
    var id: String { (userId ?? "") + "|" + (email ?? "") }

    /// «Ikke sendt · Invitert · Ja · Kanskje · Nei».
    var statusLabel: String {
        switch status {
        case "invited", "needs-action", "sent": return "Invitert"
        case "accepted", "yes": return "Ja"
        case "declined", "no": return "Nei"
        case "tentative", "maybe": return "Kanskje"
        default: return "Ikke sendt"
        }
    }

    var json: [String: Any] {
        var o: [String: Any] = ["name": name, "status": status.isEmpty ? "invited" : status]
        if let userId { o["userId"] = userId }
        if let email { o["email"] = email }
        return o
    }
}

/// En bruker i appen (brukerlisten).
struct KalUser44: Codable, Hashable, Identifiable {
    var id: String
    var name: String
    var hex: String
    var email: String
    var initial: String { String(name.prefix(1)).uppercased() }
}

/// Et adresseforslag.
struct KalAddr44: Codable, Hashable, Identifiable {
    var street: String
    var place: String
    var lat: Double?
    var lon: Double?
    var id: String { street + "|" + place }
    /// «Storgata 1, 0155 Oslo».
    var full: String { place.isEmpty ? street : street + ", " + place }
}

enum KalEv44 {
    /// Fyller inn feltene fra prompt 44 når serveren sender dem.
    static func decorate(_ ev: inout KalEvent, _ o: [String: Any]) {
        let src: String = KalParse.str(o, "source")
        let type: String = KalParse.str(o, "type")
        if src == "media" || type == "media" || ev.cal == "media" {
            var m: KalMedia44 = KalMedia44()
            m.status = KalParse.str(o, "status")
            m.statusText = KalParse.str(o, "statusText")
            m.deepLink = KalParse.str(o, "deepLink")
            m.code = KalParse.str(o, "code")
            m.episode = KalParse.str(o, "episodeTitle")
            m.movie = KalParse.str(o, "kind") == "movie"
            ev.media44 = m
            // Fasiten: «▶ Slow Horses» med notatet «S06E03 · Dead Drop».
            if !ev.title.hasPrefix("▶") {
                var t: String = ev.title
                if !m.code.isEmpty, let r = t.range(of: " · " + m.code) { t = String(t[..<r.lowerBound]) }
                ev.title = "▶ " + t
            }
            if ev.note.isEmpty { ev.note = note(m) }
        }
        if let list = o["attendees"] as? [[String: Any]], !list.isEmpty {
            ev.att44 = list.map { (a: [String: Any]) -> KalAtt44 in
                let uid: String = KalParse.str(a, "userId")
                let em: String = KalParse.str(a, "email")
                return KalAtt44(userId: uid.isEmpty ? nil : uid, email: em.isEmpty ? nil : em, name: KalParse.str(a, "name"), status: KalParse.str(a, "status"))
            }
        }
        let rep: String = KalParse.str(o, "repeat")
        if (!rep.isEmpty && rep != "none") || (KalParse.bool(o, "recurring") ?? false) || !KalParse.str(o, "recurringEventId").isEmpty {
            ev.rec44 = true
        }
        let et: String = KalParse.str(o, "etag")
        if !et.isEmpty { ev.etag44 = et }
        if ev.lat == nil, let g = o["geo"] as? [String: Any], let la = g["lat"] as? Double, let lo = g["lon"] as? Double {
            ev.lat = la
            ev.lon = lo
        }
    }

    /// «S06E03 · Dead Drop» · «Film · digital utgivelse».
    static func note(_ m: KalMedia44) -> String {
        if m.movie {
            if m.episode.isEmpty { return "Film" }
            return "Film · " + m.episode.lowercased()
        }
        let parts: [String] = [m.code, m.episode].filter { (x: String) -> Bool in !x.isEmpty }
        return parts.joined(separator: " · ")
    }

    /// Hendelser som ikke kan redigeres her (helligdager, trekk fra Abonnementer, Media, bursdager fra kontakter).
    static func readOnly(_ e: KalEvent) -> Bool {
        if e.ab42 != nil || e.media44 != nil { return true }
        let c: String = e.cal.lowercased()
        if c == "h" || c == "hd" || c == "helligdager" || c == "media" || c.hasPrefix("ab") { return true }
        if e.id.hasPrefix("hd") || e.id.hasPrefix("ab") || e.id.hasPrefix("media-") { return true }
        return false
    }

    static func validEmail(_ s: String) -> Bool {
        KalRx44.test("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", s)
    }

    /* ---------- Brukerlisten ---------- */

    /// → (brukerne utenom meg, min e-post).
    static func directory() async -> (users: [KalUser44], me: String) {
        guard let d = try? await KalNet.get("/api/users/directory", timeout: 10) else { return ([], "") }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var raw: [[String: Any]] = KalParse.list(any, "users")
        if raw.isEmpty, let arr = any as? [[String: Any]] { raw = arr }
        let palette: [String] = ["#7a5ad6", "#2f6b4a", "#a0671a", "#2b5d8a", "#c2477a", "#3d7f8a"]
        var out: [KalUser44] = []
        var me: String = ""
        if let o = any as? [String: Any], let m = o["me"] as? [String: Any] { me = KalParse.str(m, "email") }
        for (i, u) in raw.enumerated() {
            let id: String = KalParse.str(u, "id")
            if id.isEmpty { continue }
            if KalParse.bool(u, "me") == true || KalParse.bool(u, "self") == true || KalParse.bool(u, "current") == true {
                me = KalParse.str(u, "email")
                continue
            }
            var name: String = KalParse.str(u, "name")
            if name.isEmpty { name = KalParse.str(u, "displayName") }
            if name.isEmpty { name = KalParse.str(u, "username") }
            var hex: String = KalParse.str(u, "color")
            if !hex.hasPrefix("#") { hex = palette[i % palette.count] }
            out.append(KalUser44(id: id, name: name, hex: hex, email: KalParse.str(u, "email")))
        }
        return (out, me)
    }

    /* ---------- Adresser ---------- */

    /// Serverens proxy først (cache, Kartverket + OSM), så Kartverket direkte.
    static func addresses(_ q: String) async -> [KalAddr44] {
        let v: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.count < 3 { return [] }
        if let d = try? await KalNet.get("/api/geo/address?q=" + KalNet.enc(v), timeout: 6) {
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var raw: [[String: Any]] = (any as? [[String: Any]]) ?? []
            if raw.isEmpty { raw = KalParse.list(any, "results") }
            if raw.isEmpty { raw = KalParse.list(any, "addresses") }
            let list: [KalAddr44] = raw.compactMap { (o: [String: Any]) -> KalAddr44? in fromServer(o) }
            if !list.isEmpty { return Array(list.prefix(6)) }
        }
        return await kartverket(v)
    }

    private static func fromServer(_ o: [String: Any]) -> KalAddr44? {
        var street: String = KalParse.str(o, "street")
        if street.isEmpty { street = KalParse.str(o, "label") }
        if street.isEmpty { return nil }
        let pc: String = KalParse.str(o, "postcode")
        let city: String = KalParse.str(o, "city")
        var place: String = (pc + " " + city).trimmingCharacters(in: .whitespaces)
        if street.contains(",") && place.isEmpty {
            let parts: [String] = street.components(separatedBy: ", ")
            street = parts.first ?? street
            place = parts.dropFirst().joined(separator: ", ")
        }
        return KalAddr44(street: street, place: place, lat: num(o["lat"]), lon: num(o["lon"]))
    }

    static func num(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) }
        return nil
    }

    /// https://ws.geonorge.no/adresser/v1/sok?sok=…&fuzzy=true&treffPerSide=6&utkoordsys=4258
    private static func kartverket(_ v: String) async -> [KalAddr44] {
        let u: String = "https://ws.geonorge.no/adresser/v1/sok?sok=" + KalNet.enc(v) + "&fuzzy=true&treffPerSide=6&utkoordsys=4258"
        guard let url = URL(string: u) else { return [] }
        var r: URLRequest = URLRequest(url: url)
        r.timeoutInterval = 6
        r.setValue("Kalender (Homelab)", forHTTPHeaderField: "User-Agent")
        guard let pair = try? await URLSession.shared.data(for: r),
              let o = (try? JSONSerialization.jsonObject(with: pair.0)) as? [String: Any] else { return [] }
        let list: [[String: Any]] = (o["adresser"] as? [[String: Any]]) ?? []
        return list.prefix(6).compactMap { (a: [String: Any]) -> KalAddr44? in
            let street: String = KalParse.str(a, "adressetekst")
            if street.isEmpty { return nil }
            let pc: String = KalParse.str(a, "postnummer")
            let ps: String = KalParse.str(a, "poststed")
            let city: String = ps.isEmpty ? "" : String(ps.prefix(1)) + ps.dropFirst().lowercased()
            let p: [String: Any] = (a["representasjonspunkt"] as? [String: Any]) ?? [:]
            return KalAddr44(street: street, place: (pc + " " + city).trimmingCharacters(in: .whitespaces), lat: num(p["lat"]), lon: num(p["lon"]))
        }
    }

    /* ---------- Invitasjon ---------- */

    /// POST /api/kalender/events/:id/invite → antall sendt (0 = ikke støttet / feil).
    static func invite(_ id: String, _ att: [KalAtt44]) async -> Int {
        if att.isEmpty { return 0 }
        let body: [String: Any] = ["attendees": att.map { (a: KalAtt44) -> [String: Any] in a.json }]
        guard let d = try? await KalNet.send("POST", "/api/kalender/events/" + KalNet.enc(id) + "/invite", json: body, timeout: 25) else { return 0 }
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        return KalParse.int(o, "sent") ?? att.count
    }
}

/// Liten regex-hjelper (KalRx ligger i iOS-appens KalQuick.swift, som ikke er med i widgetene).
enum KalRx44 {
    static func test(_ pattern: String, _ s: String) -> Bool {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return false }
        let ns: NSString = s as NSString
        return re.firstMatch(in: s, options: [], range: NSRange(location: 0, length: ns.length)) != nil
    }
}

extension KalMedia44 {
    /// Fasitens oker (#a0671a) for Media når serveren sender standardfargen sin (ikke når brukeren har valgt en farge).
    static func tint(_ cals: inout [KalCal]) {
        for i in 0..<cals.count where cals[i].id == "media" {
            let h: String = cals[i].hex.lowercased()
            if h == "#5a4a6b" || h.isEmpty { cals[i] = KalTone35.apply(cals[i], hex: "#a0671a") }
        }
    }
}
