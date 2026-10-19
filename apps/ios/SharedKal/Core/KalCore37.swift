import Foundation

/* ---------------- Prompt 37: Kalender – felles for iOS-appen, widgetene og Mac-appen ---------------- */
// Fasit: design/Kalender App.dc.html (prompt-37-pakke) → fagKey(), CC(), FAGP, ask() (blokken før «neste»), geoFor(), mapOf().
// • KalEv37: nye felt fra serveren – subjectColor, address, map {lat, lon}, kind «trial» (prøveperioder fra Subscription OS).
// • KalFag37: egen farge per fag i Studie (emnekode «MEK1300» eller første ord etter «Frist:/Prøve ·/Eksamen …»).
//   8 farger, nye fag får neste ledige. Tildeling og egne valg lagres i App Group (widgetene får samme) og i profilen på
//   serveren (PUT /api/me/layout {subjectColors:{fag: hex}} – flettes per nøkkel), så fargen er lik på alle enheter.
// • KalSchool37: «Neste prøve på skolen» er en skoleprøve i Studie, aldri «Viaplay-prøven slutter». Skole-ordene avgrenser
//   til Studie og er ikke søkeord. Søkeord: stoppord ut, ingen «-en/-et»-stripping, og alle ordene må treffe.
// • KalPlace37: stedet i teksten Glimt legger inn («hos Nina frisør», «på Majorstuen legesenter», «Hoffsveien 4»).
// • KalGeoCache37: geokoding-cachen (treff permanent, bomtreff {fail} prøves igjen etter 1 t) og forsøksrekkefølgen.

private enum KalRx37 {
    static func re(_ p: String, _ ci: Bool = true) -> NSRegularExpression? {
        try? NSRegularExpression(pattern: p, options: ci ? [.caseInsensitive] : [])
    }

    static func test(_ p: String, _ s: String, _ ci: Bool = true) -> Bool {
        guard let r = re(p, ci) else { return false }
        let range: NSRange = NSRange(s.startIndex..<s.endIndex, in: s)
        return r.firstMatch(in: s, options: [], range: range) != nil
    }

    /// Første gruppe (eller hele treffet når gruppe 1 mangler).
    static func first(_ p: String, _ s: String, _ ci: Bool = true) -> String? {
        guard let r = re(p, ci) else { return nil }
        let range: NSRange = NSRange(s.startIndex..<s.endIndex, in: s)
        guard let m = r.firstMatch(in: s, options: [], range: range) else { return nil }
        let idx: Int = m.numberOfRanges > 1 ? 1 : 0
        guard let rr = Range(m.range(at: idx), in: s) else { return nil }
        return String(s[rr])
    }

    static func replace(_ p: String, _ s: String, _ with: String, _ ci: Bool = true) -> String {
        guard let r = re(p, ci) else { return s }
        let range: NSRange = NSRange(s.startIndex..<s.endIndex, in: s)
        return r.stringByReplacingMatches(in: s, options: [], range: range, withTemplate: with)
    }
}

/* ---------- Nye felt på hendelsen ---------- */

enum KalEv37 {
    /// Leser subjectColor, address, map {lat, lon, url}, lat/lon og kind «trial» fra serverens hendelse.
    static func decorate(_ ev: inout KalEvent, _ o: [String: Any]) {
        let sc: String = KalParse.str(o, "subjectColor")
        if KalRx37.test("^#[0-9a-f]{6}$", sc) { ev.subjectHex = sc.lowercased() }
        let addr: String = KalParse.str(o, "address")
        if !addr.isEmpty { ev.address = addr }
        var la: Double? = KalParse.dbl(o, "lat")
        var lo: Double? = KalParse.dbl(o, "lon")
        if let m = o["map"] as? [String: Any] {
            if la == nil { la = KalParse.dbl(m, "lat") }
            if lo == nil { lo = KalParse.dbl(m, "lon") ?? KalParse.dbl(m, "lng") }
        }
        if let la, let lo, abs(la) <= 90, abs(lo) <= 180, !(la == 0 && lo == 0) {
            ev.lat = la
            ev.lon = lo
        }
        let src: String = KalParse.str(o, "source").lowercased()
        let cal: String = KalParse.str(o, "calendar").lowercased()
        if ev.kind != "trial" && (src == "trials" || cal == "trials" || KalParse.str(o, "type") == "trial") { ev.kind = "trial" }
    }
}

/* ---------- Farge per fag ---------- */

struct KalFagRow37: Identifiable, Hashable {
    let key: String
    let label: String
    let hex: String
    let own: Bool
    var id: String { key }
}

enum KalFag37 {
    /// FAGP i fasiten: [c, tx (lyst tema), lt (mørkt tema)].
    static let palette: [[String]] = [
        ["#2f7a4f", "#235c3b", "#8fd4a8"], ["#2b5d8a", "#1f4568", "#9cc2ee"], ["#a8661a", "#7a4a12", "#ecbb74"],
        ["#8a3fa0", "#6a2f7c", "#d6a8e6"], ["#3d7f8a", "#2a5c64", "#8fcdd6"], ["#c2477a", "#8f2f58", "#f0a6c4"],
        ["#5b4fc4", "#40368f", "#b3abf2"], ["#7a8a2a", "#55611c", "#c9d685"],
    ]

    /// Kalender-id-er og serverkalendere som er Studie (eller timeplan-integrasjonen).
    static let studyIds: Set<String> = ["s", "studie", "timeplan", "prover", "skole", "canvas", "study"]

    /// Appene setter denne til true (widgetene skriver ikke til serveren).
    static var pushEnabled: Bool = false

    private static let lock: NSLock = NSLock()
    private static var idxCache: [String: Int]? = nil
    private static var hexCache: [String: String]? = nil
    private static var queued: [String: Any] = [:]
    private static var flushing: Bool = false
    private static let idxKey: String = "kal.fag37.idx"
    private static let hexKey: String = "kal.fag37.hex"

    /// MEK1300 / «TRE 1400» → «TRE1400»; ellers første ord etter «Frist: / Prøve · / Eksamen / Forelesning …» (små bokstaver).
    static func key(_ title: String) -> String {
        if let m = KalRx37.first("\\b([A-ZÆØÅ]{2,5}\\s?\\d{3,4})\\b", title, false) {
            return m.replacingOccurrences(of: " ", with: "")
        }
        let rest: String = KalRx37.replace("^(Frist:|Prøve ·|Prøve:|Eksamen|Forelesning|Øving|Lab|Seminar)\\s*", title.trimmingCharacters(in: .whitespaces), "")
        let parts: [Substring] = rest.split { (ch: Character) -> Bool in ch == " " || ch == "·" || ch == "–" || ch == "-" }
        guard let w = parts.first else { return "" }
        let low: String = String(w).lowercased()
        let clean: String = low.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        return clean.count >= 2 ? clean : ""
    }

    /// Visningsnavnet i Innstillinger → Fag («MEK1300», «Fysikk»).
    static func label(_ key: String) -> String {
        if KalRx37.test("\\d", key) { return key.uppercased() }
        return key.prefix(1).uppercased() + key.dropFirst()
    }

    static func isStudy(_ e: KalEvent, _ c: KalCal?) -> Bool {
        if KalSchool37.isTrialEvent(e) { return false }
        if studyIds.contains(e.cal.lowercased()) || studyIds.contains(e.serverCal.lowercased()) { return true }
        let n: String = (c?.name ?? "").lowercased()
        return n == "studie" || n == "skole" || n == "timeplan"
    }

    /// Kalenderen med fagfargen lagt på (bare hendelser i Studie). Sidemenyen og filteret bruker fortsatt kalenderens egen farge.
    static func tint(_ c: KalCal?, _ e: KalEvent) -> KalCal? {
        guard let base = c else { return c }
        if !isStudy(e, base) { return base }
        let k: String = key(e.title)
        if let h = e.subjectHex, k.isEmpty || own(k) == nil { return apply(base, h) }
        if k.isEmpty { return base }
        return apply(base, hex(k))
    }

    /// Fargen faget har (eget valg, eller fast tildelt fra paletten).
    static func hex(_ k: String) -> String {
        if let o = own(k) { return o }
        let i: Int = index(k)
        return palette[i % palette.count][0]
    }

    static func own(_ k: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        loadLocked()
        return hexCache?[k]
    }

    private static func loadLocked() {
        if idxCache == nil {
            idxCache = (KalGroup.defaults.dictionary(forKey: idxKey) as? [String: Int]) ?? [:]
        }
        if hexCache == nil {
            hexCache = (KalGroup.defaults.dictionary(forKey: hexKey) as? [String: String]) ?? [:]
        }
    }

    /// Fast plass i paletten. Nye fag får neste ledige farge og beholder den.
    static func index(_ k: String) -> Int {
        lock.lock()
        loadLocked()
        var map: [String: Int] = idxCache ?? [:]
        if let i = map[k] {
            lock.unlock()
            return i
        }
        let used: Set<Int> = Set(map.values.map { (v: Int) -> Int in v % palette.count })
        var next: Int = map.count % palette.count
        for i in 0..<palette.count where !used.contains(i) {
            next = i
            break
        }
        map[k] = next
        idxCache = map
        KalGroup.defaults.set(map, forKey: idxKey)
        let push: Bool = pushEnabled && hexCache?[k] == nil
        lock.unlock()
        if push { queue(k, palette[next][0]) }
        return next
    }

    static func apply(_ c: KalCal, _ hex: String) -> KalCal {
        var x: KalCal = c
        let h: String = hex.lowercased()
        if let p = palette.first(where: { (row: [String]) -> Bool in row[0] == h }) {
            x.hex = p[0]
            x.textHex = p[1]
            x.lightHex = p[2]
            return x
        }
        x.hex = h
        x.textHex = KalCals.mix(h, "#000000", 0.28)
        x.lightHex = KalCals.mix(h, "#ffffff", 0.45)
        return x
    }

    /// Brukerens eget valg (nil = tilbake til fast palettfarge). Lagres lokalt og i profilen.
    static func set(_ k: String, _ hexValue: String?) {
        if k.isEmpty { return }
        lock.lock()
        loadLocked()
        var map: [String: String] = hexCache ?? [:]
        if let h = hexValue { map[k] = h.lowercased() } else { map.removeValue(forKey: k) }
        hexCache = map
        KalGroup.defaults.set(map, forKey: hexKey)
        lock.unlock()
        if let h = hexValue { queue(k, h.lowercased()) } else { queue(k, NSNull()) }
    }

    /// Fagene i hendelsene (Innstillinger → Kalendere → Studie → Fag).
    static func rows(_ events: [KalEvent], cal: (String) -> KalCal?) -> [KalFagRow37] {
        var seen: Set<String> = []
        var out: [KalFagRow37] = []
        for e in events where isStudy(e, cal(e.cal)) {
            let k: String = key(e.title)
            if k.isEmpty || seen.contains(k) { continue }
            seen.insert(k)
            out.append(KalFagRow37(key: k, label: label(k), hex: hex(k), own: own(k) != nil))
        }
        return out.sorted { (a: KalFagRow37, b: KalFagRow37) -> Bool in a.label.lowercased() < b.label.lowercased() }
    }

    /// Henter subjectColors fra profilen (GET /api/me/layout). Serverens valg vinner, så alle enheter blir like.
    static func pull() async {
        guard let d = try? await KalNet.get("/api/me/layout") else { return }
        guard let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return }
        guard let sc = o["subjectColors"] as? [String: Any] else { return }
        merge(sc)
    }

    /// Synkron (NSLock kan ikke brukes direkte i async-funksjoner).
    private static func merge(_ sc: [String: Any]) {
        lock.lock()
        loadLocked()
        var map: [String: String] = hexCache ?? [:]
        for (k, v) in sc {
            guard let h = v as? String, KalRx37.test("^#[0-9a-f]{6}$", h) else { continue }
            map[k] = h.lowercased()
            // Web lagrer fagnavn («Fysikk»); appene bruker små bokstaver for ord-nøkler.
            if k.lowercased() != k { map[k.lowercased()] = h.lowercased() }
        }
        hexCache = map
        KalGroup.defaults.set(map, forKey: hexKey)
        lock.unlock()
    }

    private static func queue(_ k: String, _ v: Any) {
        if !pushEnabled || k.count > 40 { return }
        lock.lock()
        queued[k] = v
        let start: Bool = !flushing
        flushing = true
        lock.unlock()
        if !start { return }
        Task.detached {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await KalFag37.flush()
        }
    }

    private static func flush() async {
        let body: [String: Any] = takeQueued()
        if body.isEmpty { return }
        _ = try? await KalNet.send("PUT", "/api/me/layout", json: ["subjectColors": body])
    }

    private static func takeQueued() -> [String: Any] {
        lock.lock()
        let body: [String: Any] = queued
        queued = [:]
        flushing = false
        lock.unlock()
        return body
    }
}

/* ---------- «Neste prøve på skolen» ---------- */

struct KalSchoolAnswer37 {
    var steps: [String] = []
    var text: String = ""
    var cards: [KalEvent] = []
}

enum KalSchool37 {
    /// Prøveperiode: går til Subscription OS / prøveperioder, ikke kalendersøk.
    static func isTrialQ(_ ql: String) -> Bool {
        KalRx37.test("prøveperiode|prøvetid|gratis ?periode|abonnement|trial|viaplay|netflix|hbo|disney|spotify|storytel|tv ?2 play", ql)
    }

    /// Skolekontekst: avgrenser til Studie og er ikke et søkeord.
    static func isSchoolQ(_ ql: String) -> Bool {
        KalRx37.test(" (skole|skolen|skola|universitet|universitetet|uni|uio|ntnu|oslomet|høgskole|høgskolen|studie|studiet|studier|klassen|fag|faget) ", ql)
    }

    /// Skoleprøve.
    static func isTestQ(_ ql: String) -> Bool {
        KalRx37.test(" (prøve|prøva|prøven|prøver|prøvene|eksamen|eksamenen|eksamener|test|testen|quiz|quizen|midtveis|midtveiseksamen|tentamen|heldagsprøve|heldagsprøven) ", ql)
    }

    /// «Neste eksamen» (uten prøve/test i spørsmålet).
    static func isExamQ(_ ql: String) -> Bool {
        KalRx37.test(" (eksamen|eksamenen|eksamener|midtveiseksamen) ", ql) && !KalRx37.test(" (prøve|prøva|prøven|prøver|test|testen|quiz) ", ql)
    }

    /// «Viaplay-prøven slutter», prøveperioder og abonnementer (kind «trial»).
    static func isTrialEvent(_ e: KalEvent) -> Bool {
        if e.kind == "trial" || e.serverCal.lowercased() == "trials" || e.cal.lowercased() == "trials" { return true }
        return KalRx37.test("prøven slutter|prøveperiode|prøvetid|abonnement|gratisperiode", e.title)
    }

    static func isTestEvent(_ e: KalEvent) -> Bool {
        if isTrialEvent(e) { return false }
        if e.kind == "prove" || e.kind == "eksamen" { return true }
        return KalRx37.test("prøve|eksamen|\\btest\\b|quiz|midtveis|tentamen", e.title)
    }

    /// «Prøve · Fysikk 2» → «prøve i Fysikk 2», «Eksamen IN2010» → «eksamen i IN2010».
    static func what(_ t: String) -> String {
        var s: String = KalRx37.replace("^Prøve ·\\s*", t, "prøve i ")
        s = KalRx37.replace("^Prøve:\\s*", s, "prøve i ")
        s = KalRx37.replace("^Eksamen\\s+", s, "eksamen i ")
        return s
    }

    /// nil = ikke en skoleprøve-spørsmål (eller et prøveperiode-spørsmål).
    static func answer(_ ql: String, up: [KalEvent], cal: (String) -> KalCal?, rel: (String) -> String, tk: String) -> KalSchoolAnswer37? {
        if !isTestQ(ql) || isTrialQ(ql) { return nil }
        let school: Bool = isSchoolQ(ql)
        let found: [KalEvent] = up.filter { (e: KalEvent) -> Bool in
            if !isTestEvent(e) { return false }
            return KalFag37.isStudy(e, cal(e.cal)) || !school
        }.uniqueIds()
        // «Neste eksamen»: eksamener først (ellers alle prøver).
        let examQ: Bool = isExamQ(ql)
        let exams: [KalEvent] = found.filter { (e: KalEvent) -> Bool in e.kind == "eksamen" || KalRx37.test("eksamen", e.title) }
        let useExams: Bool = examQ && !exams.isEmpty
        let list: [KalEvent] = useExams ? exams : found
        let noun: String = useExams ? "eksamen" : "prøve"
        var a: KalSchoolAnswer37 = KalSchoolAnswer37()
        if let m = list.first {
            let days: Int = KalD.daysBetween(tk, m.day)
            let n: Int = list.count
            a.steps = ["Ser i Studie-kalenderen", "Fant " + String(n) + (n == 1 ? " " + noun : " prøver/eksamener")]
            var t: String = "Neste " + noun + (school ? " på skolen" : "") + " er " + what(m.title) + " " + rel(m.day)
            if !m.allDay { t += " kl. " + KalD.hm(m.startMin) }
            if !m.loc.isEmpty { t += ", " + m.loc }
            t += "."
            if days > 1 { t += " Det er om " + String(days) + " dager." }
            if n > 1 {
                let rest: [String] = list.dropFirst().prefix(2).map { (e: KalEvent) -> String in
                    KalRx37.replace("^Prøve ·\\s*", e.title, "") + " " + rel(e.day)
                }
                t += " Etter det: " + rest.joined(separator: ", ") + "."
            }
            a.text = t
            a.cards = Array(list.prefix(3))
            return a
        }
        let nf: KalEvent? = up.first { (e: KalEvent) -> Bool in e.kind == "frist" && !isTrialEvent(e) && KalFag37.isStudy(e, cal(e.cal)) }
        a.steps = ["Ser i Studie-kalenderen", "Ingen prøver funnet"]
        a.text = "Jeg finner ingen prøver eller eksamener i Studie-kalenderen."
        if let nf { a.text += " Neste frist er " + KalRx37.replace("^Frist:\\s*", nf.title, "") + " " + rel(nf.day) + "." }
        a.cards = nf.map { (e: KalEvent) -> [KalEvent] in [e] } ?? []
        return a
    }

    /// Stoppord for «når er neste …» – også skole-ordene (kontekst, ikke søkeord).
    static let stop: Set<String> = ["når", "er", "neste", "min", "mitt", "mine", "har", "jeg", "skal", "må", "time", "timen", "timer",
                                    "hos", "til", "på", "i", "en", "et", "ei", "den", "det", "avtale", "avtalen", "hva", "meg", "kommer", "blir", "om",
                                    "skole", "skolen", "skola", "universitet", "universitetet", "uni", "studie", "studiet", "studier", "klassen",
                                    "høgskole", "høgskolen", "uio", "ntnu", "oslomet", "fag", "faget"]

    /// «når er neste frisørtime» → ["frisør"]. Ingen «-en/-et»-stripping (det ga «skol» og «prøv»).
    static func terms(_ q: String) -> [String] {
        let cleaned: String = KalRx37.replace("[?!.,:;«»\"]", q.lowercased(), " ")
        var out: [String] = []
        for raw in cleaned.split(separator: " ") {
            let w: String = String(raw)
            if w.count < 3 || stop.contains(w) { continue }
            let t: String = KalRx37.replace("(timen|timer|time|avtalen|avtale|økta|økt)$", w, "")
            if t.count >= 3 && !stop.contains(t) { out.append(t) }
        }
        return out
    }

    /// Ordstamme-treff: hele ordet, eller felles begynnelse på minst 4 tegn begge veier («frisøren» ↔ «frisør»).
    static func hit(_ hay: String, _ w: String) -> Bool {
        if hay.contains(w) { return true }
        let words: [Substring] = hay.split { (c: Character) -> Bool in !(c.isLetter || c.isNumber) }
        let need: Int = Swift.max(4, w.count - 2)
        let wp: String = String(w.prefix(need))
        for x in words where x.count >= 4 {
            let xs: String = String(x)
            if w.hasPrefix(xs) { return true }
            if wp.count >= 4 && xs.hasPrefix(wp) { return true }
        }
        return false
    }

    /// Alle søkeordene må treffe.
    static func all(_ hay: String, _ terms: [String]) -> Bool {
        terms.allSatisfy { (w: String) -> Bool in hit(hay, w) }
    }
}

/* ---------- Sted i teksten ---------- */

enum KalPlace37 {
    private static let notPlace: Set<String> = ["kl", "klokka", "klokken", "i", "på", "fra", "til", "og", "med", "om", "den", "neste", "denne",
                                                "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag", "morgen", "dag", "kveld",
                                                "januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober",
                                                "november", "desember", "varsle", "varsel", "påminn", "for", "før", "etter", "uke", "uka", "ca"]

    /// Stedet Glimt fant i teksten, eller tom.
    static func extract(_ text: String) -> String {
        let t: String = text.replacingOccurrences(of: "\n", with: " ")
        if let a = KalRx37.first("adresse\\s*:\\s*([^.;\\n]{4,80})", text) {
            return a.trimmingCharacters(in: .whitespaces)
        }
        let street: String = "([A-Za-zÆØÅæøåé.\\-]+(?:veien|vegen|vei|veg|gata|gate|gaten|plass|plassen|allé|alle|stien|bakken|svingen|ringen|torget|torg|kaia|brygge|terrasse)\\s+\\d{1,4}[A-Za-z]?\\b(?:\\s*,\\s*\\d{4}\\s+[A-ZÆØÅ][a-zæøå]+)?)"
        if let s = KalRx37.first(street, t) {
            let v: String = s.trimmingCharacters(in: .whitespaces)
            return v.prefix(1).uppercased() + v.dropFirst()
        }
        for trigger in ["hos", "på", "ved"] {
            if let p = after(trigger, t) { return p }
        }
        return ""
    }

    /// «hos Nina frisør» → «Nina frisør». Første ord med stor forbokstav, så opptil to ord til (ingen tall, dager eller tidsord).
    private static func after(_ trigger: String, _ t: String) -> String? {
        let words: [String] = t.split(separator: " ").map { (s: Substring) -> String in String(s) }
        var i: Int = 0
        while i < words.count {
            if words[i].lowercased() == trigger, i + 1 < words.count {
                let first: String = words[i + 1].trimmingCharacters(in: CharacterSet(charactersIn: ",.;:!?«»\""))
                if let ch = first.first, ch.isUppercase, ch.isLetter, !notPlace.contains(first.lowercased()) {
                    var out: [String] = [first]
                    var j: Int = i + 2
                    while j < words.count && out.count < 3 {
                        let raw: String = words[j]
                        let w: String = raw.trimmingCharacters(in: CharacterSet(charactersIn: ",.;:!?«»\""))
                        let letters: Bool = !w.isEmpty && w.allSatisfy { (c: Character) -> Bool in c.isLetter || c == "-" }
                        if !letters || notPlace.contains(w.lowercased()) { break }
                        out.append(w)
                        if raw.hasSuffix(",") || raw.hasSuffix(".") { break }
                        j += 1
                    }
                    return out.joined(separator: " ")
                }
            }
            i += 1
        }
        return nil
    }
}

/* ---------- Geokoding-cache ---------- */

struct KalGeoHit37: Codable, Hashable {
    var la: Double? = nil
    var lo: Double? = nil
    /// Etiketten «Gate husnr, bydel» (ikke rå display_name).
    var a: String? = nil
    /// Bomtreff: tidspunktet (sekunder siden 1970). Prøves igjen etter 1 t.
    var fail: Double? = nil

    var ok: Bool { la != nil && lo != nil }
}

enum KalGeoCache37 {
    private static let key: String = "kal.geo37"
    private static let lock: NSLock = NSLock()
    private static var cache: [String: KalGeoHit37]? = nil

    static func all() -> [String: KalGeoHit37] {
        lock.lock()
        defer { lock.unlock() }
        if let c = cache { return c }
        var out: [String: KalGeoHit37] = [:]
        if let d = KalGroup.defaults.data(forKey: key), let m = try? JSONDecoder().decode([String: KalGeoHit37].self, from: d) { out = m }
        cache = out
        return out
    }

    /// Treff, eller nil (ukjent eller bom). retry = true når stedet bør slås opp (ukjent, eller bom eldre enn 1 t).
    static func lookup(_ loc: String) -> (hit: KalGeoHit37?, retry: Bool) {
        let k: String = norm(loc)
        if k.isEmpty { return (nil, false) }
        guard let h = all()[k] else { return (nil, true) }
        if h.ok { return (h, false) }
        let age: Double = Date().timeIntervalSince1970 - (h.fail ?? 0)
        return (nil, age > 3600)
    }

    static func store(_ loc: String, _ hit: KalGeoHit37) {
        let k: String = norm(loc)
        if k.isEmpty { return }
        lock.lock()
        var m: [String: KalGeoHit37] = cache ?? [:]
        if cache == nil, let d = KalGroup.defaults.data(forKey: key), let old = try? JSONDecoder().decode([String: KalGeoHit37].self, from: d) { m = old }
        m[k] = hit
        if m.count > 400 {
            // Bomtreff ryddes først.
            for (kk, v) in m where !v.ok { m.removeValue(forKey: kk) }
        }
        cache = m
        if let d = try? JSONEncoder().encode(m) { KalGroup.defaults.set(d, forKey: key) }
        lock.unlock()
    }

    static func norm(_ loc: String) -> String {
        loc.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Rekkefølgen: stedet → «…, Oslo» → delen etter komma + by → uten første ledd.
    static func tries(_ loc: String, city: String = "Oslo") -> [String] {
        let l: String = loc.trimmingCharacters(in: .whitespacesAndNewlines)
        if l.count < 3 { return [] }
        let lastPart: String = (l.split(separator: ",").last.map { (s: Substring) -> String in String(s) } ?? "").trimmingCharacters(in: .whitespaces)
        let noFirst: String = KalRx37.replace("^[^,]*,\\s*", l, "")
        var out: [String] = []
        let cands: [String] = [l, l + ", " + city, lastPart + ", " + city, noFirst]
        for c in cands where c.count > 2 && !out.contains(c) { out.append(c) }
        return out
    }

    /// «Hoffsveien 4, Sofienlund» fra adressedelene, ellers navnet + område, ellers det brukeren skrev.
    static func label(road: String?, number: String?, area: String?, name: String?, fallback: String) -> String {
        let ar: String = area ?? ""
        if let r = road, !r.isEmpty {
            var s: String = r
            if let n = number, !n.isEmpty { s += " " + n }
            if !ar.isEmpty { s += ", " + ar }
            return s
        }
        if let n = name, !n.isEmpty { return ar.isEmpty || ar == n ? n : n + ", " + ar }
        return fallback
    }

    /// Apple Kart / Google Maps (veibeskrivelse) for et treff.
    static func appleURL(_ loc: String, _ h: KalGeoHit37) -> URL? {
        let q: String = loc.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://maps.apple.com/?q=" + q + "&ll=" + String(h.la ?? 0) + "," + String(h.lo ?? 0))
    }

    static func directionsURL(_ h: KalGeoHit37, apple: Bool) -> URL? {
        if apple { return URL(string: "https://maps.apple.com/?daddr=" + String(h.la ?? 0) + "," + String(h.lo ?? 0) + "&dirflg=r") }
        return URL(string: "https://www.google.com/maps/dir/?api=1&destination=" + String(h.la ?? 0) + "," + String(h.lo ?? 0))
    }
}
