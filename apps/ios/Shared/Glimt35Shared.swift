import SwiftUI
import Foundation

/* ---------------- Prompt 35: Glimt-familien, Glimt-innstillinger og brief-tillegg (delt med widgetene) ----------------
   prompts/prompt-35-pakke/claude-code-glimt-figurer.md («Glimt-familien»), claude-code-glimt-brief.md og claude-code-innst-glimt.md.
   API (SERVER35): GET/PUT /api/glimt/settings → {char, friends, brief, readAloud, guide, notify, briefs{morning|day|evening|night:{on, at}},
   tts{engine, voice, rate, lang}, engines[{id, name, ready, keySet, tail?, admin}], chars[{id, name, family}]}.
   /api/brief får i tillegg news[] med image og lead, trials[] (prøver som slutter innen 7 dager), guide[] og host.
   Appen legger innstillingene i App Group (w.glimt35.cfg), så widgetene vet hvilken figur som er verten. */

/// En figur i familien. who = navnet i boblen, nameColor = fargen på navnet.
struct Glimt35Char: Identifiable, Hashable {
    let id: String
    let name: String
    let full: String
    let who: String
    let nameColor: UInt32
    /// ring (Glimt-familien) | venn
    let family: String

    static let all: [Glimt35Char] = [
        Glimt35Char(id: "glimt", name: "Glimt", full: "Glimt", who: "GLIMT", nameColor: 0xffc7b8, family: "ring"),
        Glimt35Char(id: "halo", name: "Halo", full: "Glimt Halo", who: "GLIMT", nameColor: 0xffc7b8, family: "ring"),
        Glimt35Char(id: "boble", name: "Boble", full: "Glimt Boble", who: "GLIMT", nameColor: 0xffc7b8, family: "ring"),
        Glimt35Char(id: "antenne", name: "Antenne", full: "Glimt Antenne", who: "GLIMT", nameColor: 0xffc7b8, family: "ring"),
        Glimt35Char(id: "bane", name: "Bane", full: "Glimt Bane", who: "GLIMT", nameColor: 0xffc7b8, family: "ring"),
        Glimt35Char(id: "pastell", name: "Pastell", full: "Glimt Pastell", who: "GLIMT", nameColor: 0xf4a6a0, family: "ring"),
        Glimt35Char(id: "natt", name: "Natt", full: "Glimt Natt", who: "GLIMT", nameColor: 0xffe7a8, family: "ring"),
        Glimt35Char(id: "sky", name: "Sky", full: "Sky", who: "SKY", nameColor: 0xbcd7ef, family: "venn"),
        Glimt35Char(id: "drape", name: "Dråpe", full: "Dråpe", who: "DRÅPE", nameColor: 0x9fd0f2, family: "venn"),
        Glimt35Char(id: "ugle", name: "Ugle", full: "Ugle", who: "UGLE", nameColor: 0xe8c49a, family: "venn"),
        Glimt35Char(id: "stjerne", name: "Stjerne", full: "Stjerne", who: "STJERNE", nameColor: 0xffb38a, family: "venn"),
        Glimt35Char(id: "spire", name: "Spire", full: "Spire", who: "SPIRE", nameColor: 0x9fd8a8, family: "venn"),
        Glimt35Char(id: "gris", name: "Gris", full: "Gris", who: "GRIS", nameColor: 0xf6b3c1, family: "venn"),
        // Prompt 52: Blekksprut (Runes figur), Glimt52Blekk.swift.
        Glimt35Char(id: "blekk", name: "Blekksprut", full: "Blekksprut", who: "BLEKKSPRUT", nameColor: 0xf1a3ad, family: "venn"),
    ]

    static func get(_ id: String) -> Glimt35Char {
        all.first { $0.id == id } ?? all[0]
    }

    static func valid(_ id: String) -> Bool { all.contains { $0.id == id } }

    /// Verten: brukerens figur. Er «Glimt» valgt, blir verten Glimt Natt mellom 21 og 06.
    static func host(_ sel: String, _ d: Date = Date()) -> String {
        let h: Int = Calendar.current.component(.hour, from: d)
        let s: String = valid(sel) ? sel : "glimt"
        if s == "glimt" && (h >= 21 || h < 6) { return "natt" }
        return s
    }

    /// Figuren sover mellom 23 og 06.
    static func sleeping(_ d: Date = Date()) -> Bool {
        let h: Int = Calendar.current.component(.hour, from: d)
        return h >= 23 || h < 6
    }

    /// Hilsenen når figuren velges.
    static func hello(_ id: String) -> String {
        if id == "blekk" { return "Hei! Seks armer klare. Nå er jeg din Glimt." }
        return id == "gris" ? "Nøff! Nå er jeg din Glimt." : "Hei! Nå er jeg din Glimt."
    }

    /// Tonehøyde og tempo for nettleser-/systemstemmen (CHV i fasiten).
    static func pitch(_ id: String) -> (Double, Double) {
        switch id {
        case "natt": return (0.92, 0.95)
        case "sky": return (1.12, 1.02)
        case "drape": return (1.25, 1.06)
        case "ugle": return (0.8, 0.94)
        case "gris": return (1.1, 1.04)
        case "blekk": return (1.06, 1.02)
        default: return (1, 1)
        }
    }
}

struct Glimt35Slot: Hashable {
    var on: Bool
    var at: String
}

struct Glimt35Engine: Identifiable, Hashable {
    var id: String
    var name: String
    var ready: Bool
    var keySet: Bool
    var tail: String
    var admin: Bool
}

/// Innstillingene fra /api/glimt/settings (per bruker).
struct Glimt35Cfg: Hashable {
    var char: String = "glimt"
    var friends: Bool = true
    var brief: Bool = true
    var readAloud: Bool = false
    var guide: Bool = true
    var notify: Bool = true
    /// Prompt 39: «Glimt i briefen» (briefGlimt): figuren og vennene i briefen, på Hjem-kortet og i widgets.
    var briefGlimt: Bool = true
    /// Prompt 39: serveren sendte briefGlimt (eldre server uten feltet skal ikke overskrive valget lokalt).
    var briefGlimtSet: Bool = false
    var morning: Glimt35Slot = Glimt35Slot(on: true, at: "06:45")
    var day: Glimt35Slot = Glimt35Slot(on: false, at: "12:00")
    var evening: Glimt35Slot = Glimt35Slot(on: true, at: "18:00")
    var night: Glimt35Slot = Glimt35Slot(on: false, at: "22:30")
    /// openai | elevenlabs | azure | browser
    var engine: String = "openai"
    /// nora | henrik | lys
    var voice: String = "nora"
    /// calm | normal | fast
    var rate: String = "normal"
    /// no | en
    var lang: String = "no"
    var engines: [Glimt35Engine] = []
    /// Prompt 40: julemodus auto | av | pa, fasen ved På (advent | jul | nyttar | vinter), snø i Vær/brief og julelyd (av | bjelle).
    var jul: String = "auto"
    var julPhase: String = "advent"
    var snow: Bool = true
    var julSound: String = "av"
    /// Prompt 41: 17. mai auto | av | pa (pa = «Vis nå»). Figurene får flagg 14.–17. mai, Hjem eget design på dagen.
    var mai17: String = "auto"
    /// Serveren sendte jul (eldre server uten feltet skal ikke overskrive valget lokalt).
    var julSet: Bool = false

    var host: String { Glimt35Char.host(char) }

    func slot(_ k: String) -> Glimt35Slot {
        switch k {
        case "morning": return morning
        case "day": return day
        case "evening": return evening
        default: return night
        }
    }

    mutating func setSlot(_ k: String, _ v: Glimt35Slot) {
        switch k {
        case "morning": morning = v
        case "day": day = v
        case "evening": evening = v
        default: night = v
        }
    }

    var rateFactor: Double {
        switch rate {
        case "calm": return 0.85
        case "fast": return 1.15
        default: return 1
        }
    }

    /* ---------- Lesing og skriving ---------- */

    private static func b(_ o: [String: Any], _ k: String, _ d: Bool) -> Bool {
        if let v = o[k] as? Bool { return v }
        if let v = o[k] as? NSNumber { return v.intValue != 0 }
        return d
    }

    private static func s(_ o: [String: Any], _ k: String, _ d: String) -> String {
        if let v = o[k] as? String, !v.isEmpty { return v }
        return d
    }

    static func parse(_ d: Data) -> Glimt35Cfg? {
        guard let any = try? JSONSerialization.jsonObject(with: d), var o = any as? [String: Any] else { return nil }
        if let inner = o["settings"] as? [String: Any] { o = inner }
        var c: Glimt35Cfg = Glimt35Cfg()
        c.char = s(o, "char", "glimt")
        if !Glimt35Char.valid(c.char) { c.char = "glimt" }
        c.friends = b(o, "friends", true)
        c.brief = b(o, "brief", b(o, "on", true))
        c.readAloud = b(o, "readAloud", b(o, "voice", false))
        c.guide = b(o, "guide", b(o, "auto", true))
        c.notify = b(o, "notify", b(o, "notif", true))
        c.briefGlimtSet = o["briefGlimt"] != nil || o["fig"] != nil
        c.briefGlimt = b(o, "briefGlimt", b(o, "fig", true))
        let br: [String: Any] = (o["briefs"] as? [String: Any]) ?? [:]
        let keys: [(String, String)] = [("morning", "morgen"), ("day", "dag"), ("evening", "kveld"), ("night", "natt")]
        for (k, alt) in keys {
            let x: [String: Any] = (br[k] as? [String: Any]) ?? (br[alt] as? [String: Any]) ?? [:]
            let def: Glimt35Slot = c.slot(k)
            let at: String = s(x, "at", s(x, "t", def.at))
            c.setSlot(k, Glimt35Slot(on: b(x, "on", def.on), at: at))
        }
        let tts: [String: Any] = (o["tts"] as? [String: Any]) ?? [:]
        c.engine = s(tts, "engine", "openai")
        if c.engine == "eleven" { c.engine = "elevenlabs" }
        c.voice = s(tts, "voice", "nora")
        c.rate = s(tts, "rate", "normal")
        c.lang = s(tts, "lang", "no")
        // Prompt 40: julemodus (glimt_jul / glimt_jul_p på web).
        c.julSet = o["jul"] != nil
        let jm: String = s(o, "jul", "auto").lowercased()
        c.jul = ["auto", "av", "pa"].contains(jm) ? jm : (jm == "på" ? "pa" : "auto")
        c.julPhase = Glimt40JulPhase.from(o["julPhase"] as? String)?.rawValue ?? "advent"
        c.snow = b(o, "snow", true)
        let js: String = s(o, "julSound", "av")
        c.julSound = js == "bjelle" ? "bjelle" : "av"
        let m17: String = s(o, "mai17", "auto").lowercased()
        c.mai17 = ["auto", "av", "pa"].contains(m17) ? m17 : "auto"
        let eng: [[String: Any]] = ((o["engines"] as? [Any]) ?? []).compactMap { $0 as? [String: Any] }
        c.engines = eng.map { (x: [String: Any]) -> Glimt35Engine in
            Glimt35Engine(id: s(x, "id", ""), name: s(x, "name", s(x, "id", "")), ready: b(x, "ready", false), keySet: b(x, "keySet", false),
                          tail: s(x, "tail", ""), admin: b(x, "admin", true))
        }
        return c
    }

    /// Hele objektet (samme form som serveren), brukes i App Group og som PUT-kropp.
    var json: [String: Any] {
        var br: [String: Any] = [:]
        for k in ["morning", "day", "evening", "night"] {
            let v: Glimt35Slot = slot(k)
            let one: [String: Any] = ["on": v.on, "at": v.at]
            br[k] = one
        }
        let tts: [String: Any] = ["engine": engine, "voice": voice, "rate": rate, "lang": lang]
        let out: [String: Any] = ["char": char, "friends": friends, "brief": brief, "readAloud": readAloud, "guide": guide, "notify": notify,
                                  "briefGlimt": briefGlimt, "briefs": br, "tts": tts,
                                  "jul": jul, "julPhase": julPhase, "snow": snow, "julSound": julSound, "mai17": mai17]
        return out
    }

    static let cacheKey: String = "w.glimt35.cfg"

    static var cached: Glimt35Cfg? {
        guard let d = WidgetShared.defaults.data(forKey: cacheKey) else { return nil }
        return parse(d)
    }

    static func store(_ c: Glimt35Cfg) {
        if let d = try? JSONSerialization.data(withJSONObject: c.json) {
            WidgetShared.defaults.set(d, forKey: cacheKey)
        }
    }
}

/* ---------- Tillegg i briefen (prompt 35) ---------- */

struct Brief35News: Hashable, Identifiable {
    var id: String { url + title }
    var source: String
    var title: String
    var url: String
    var time: String
    var image: String
    var lead: String
}

struct Brief35Trial: Hashable, Identifiable {
    var id: String
    var service: String
    var logo: String
    var endsAt: String
    /// «tir 21.»
    var endsLabel: String
    var daysLeft: Int
    /// «149 kr/mnd»
    var priceLabel: String
    /// 0 … 1
    var progress: Double
    var cancelUrl: String

    /// Rødt ≤ 2 dager, oransje ≤ 7, ellers blekk.
    var colorHex: UInt32 { daysLeft <= 2 ? 0xb23a2a : (daysLeft <= 7 ? 0xa8661a : 0x1b1a17) }

    /// «Prøve · avslutt før tir 21. · deretter 149 kr/mnd»
    var sub: String {
        let base: String = "Prøve · avslutt før " + endsLabel
        return priceLabel.isEmpty ? base : base + " · deretter " + priceLabel
    }

    var unit: String { daysLeft == 1 ? "dag igjen" : "dager igjen" }

    /// «149» fra «149 kr/mnd».
    var priceNumber: String {
        let digits: String = priceLabel.prefix { $0.isNumber || $0 == " " || $0 == "," }.trimmingCharacters(in: .whitespaces)
        return digits.isEmpty ? "0" : digits
    }

    /// Logo: serverens, ellers favicon for kjente tjenester.
    var logoURL: URL? {
        if !logo.isEmpty, let u = URL(string: logo), logo.hasPrefix("http") { return u }
        let known: [String: String] = ["viaplay": "viaplay.no", "storytel": "storytel.com", "hbo max": "max.com", "netflix": "netflix.com",
                                       "tv 2 play": "tv2.no", "spotify": "spotify.com"]
        let key: String = service.lowercased()
        let dom: String = known[key] ?? key.replacingOccurrences(of: " ", with: "") + ".com"
        return URL(string: "https://www.google.com/s2/favicons?sz=64&domain=" + dom)
    }
}

/// Et steg i guide-runden. target = kortet (vaer, kal, abo, nyh) eller tomt (hei / ferdig).
struct Brief35Step: Hashable {
    var target: String
    var char: String
    var text: String
    var textEn: String
    var action: String
}

struct Brief35Extra: Hashable {
    var news: [Brief35News] = []
    var trials: [Brief35Trial] = []
    var guide: [Brief35Step] = []
    var host: String = ""

    private static func s(_ o: [String: Any], _ keys: [String]) -> String {
        for k in keys {
            if let v = o[k] as? String, !v.isEmpty { return v }
            if let n = o[k] as? NSNumber { return n.stringValue }
        }
        return ""
    }

    private static func n(_ o: [String: Any], _ k: String) -> Double? {
        if let v = o[k] as? NSNumber { return v.doubleValue }
        if let v = o[k] as? String { return Double(v) }
        return nil
    }

    static func parse(_ d: Data) -> Brief35Extra {
        var x: Brief35Extra = Brief35Extra()
        guard let any = try? JSONSerialization.jsonObject(with: d), var o = any as? [String: Any] else { return x }
        if let inner = o["brief"] as? [String: Any] { o = inner }
        x.host = s(o, ["host"])
        let nws: [[String: Any]] = ((o["news"] as? [Any]) ?? []).compactMap { $0 as? [String: Any] }
        x.news = nws.map { (v: [String: Any]) -> Brief35News in
            var tm: String = s(v, ["timeLabel", "time", "tm"])
            if tm.isEmpty, let p = s(v, ["published", "at"]).split(separator: "T").last { tm = String(p.prefix(5)) }
            return Brief35News(source: s(v, ["source", "s", "feed"]), title: s(v, ["title", "t"]), url: s(v, ["url", "u", "link"]), time: tm,
                               image: s(v, ["image", "img", "thumb"]), lead: s(v, ["lead", "summary", "d"]))
        }
        let trs: [[String: Any]] = ((o["trials"] as? [Any]) ?? []).compactMap { $0 as? [String: Any] }
        x.trials = trs.map { (v: [String: Any]) -> Brief35Trial in
            let p: Double = n(v, "progress") ?? 0
            return Brief35Trial(id: s(v, ["id"]), service: s(v, ["service", "name"]), logo: s(v, ["logo"]), endsAt: s(v, ["endsAt", "ends_at"]),
                                endsLabel: s(v, ["endsLabel"]), daysLeft: Int(n(v, "daysLeft") ?? 0), priceLabel: s(v, ["priceLabel"]),
                                progress: p > 1 ? p / 100 : p, cancelUrl: s(v, ["cancelUrl"]))
        }
        .sorted { $0.daysLeft < $1.daysLeft }
        let gd: [[String: Any]] = ((o["guide"] as? [Any]) ?? []).compactMap { $0 as? [String: Any] }
        x.guide = gd.compactMap { (v: [String: Any]) -> Brief35Step? in
            let text: String = s(v, ["text"])
            if text.isEmpty { return nil }
            let raw: String = s(v, ["target", "k"]).lowercased()
            return Brief35Step(target: Brief35Extra.card(raw), char: s(v, ["char"]), text: text, textEn: s(v, ["textEn"]), action: s(v, ["action", "button"]))
        }
        return x
    }

    /// Serverens mål-navn → kortene i briefen.
    static func card(_ raw: String) -> String {
        switch raw {
        case "vaer", "vær", "weather", "wx": return "vaer"
        case "kal", "kalender", "calendar", "events": return "kal"
        case "abo", "trials", "trial", "abonnement", "subs": return "abo"
        case "nyh", "news", "nyheter": return "nyh"
        default: return ""
        }
    }

    static var cached: Brief35Extra {
        guard let d = WidgetShared.defaults.data(forKey: Brief34.cacheKey) else { return Brief35Extra() }
        return parse(d)
    }
}

extension Brief34 {
    /// Regn eller snø i dag (Dråpe tar været, og widgetene viser Dråpe).
    var wet35: Bool {
        if icon == "regn" || icon == "sno" { return true }
        let c: String = cond.lowercased()
        if c.contains("regn") || c.contains("snø") || c.contains("byge") { return true }
        return rain.prefix(12).contains { (v: Double) -> Bool in v >= 0.2 }
    }

    /// «oppholdsvær de neste 12 timene» / «regn nå» / «regn fra ca. 20».
    var rainSoon35: String {
        let vals: [Double] = Array(rain.prefix(12))
        guard let i = vals.firstIndex(where: { (v: Double) -> Bool in v >= 0.2 }) else { return "oppholdsvær de neste 12 timene" }
        if i == 0 { return "regn nå" }
        let h: Int = (Calendar.current.component(.hour, from: Date()) + i) % 24
        return "regn fra ca. " + String(h)
    }

    /// Temafiguren for widgetene: Dråpe på regndager (når vennene er på), ellers verten.
    static func themeFig35(_ b: Brief34, _ cfg: Glimt35Cfg) -> String {
        if cfg.friends && b.wet35 { return "drape" }
        return cfg.host
    }
}
