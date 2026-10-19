import SwiftUI

/* ---------------- Prompt 36: Glimt – spørsmål eller handling, og dagslys for en dato ----------------
   prompts/prompt-36-pakke/claude-code-glimt-en-indikator.md, fasit: Mobil Papir App.dc.html → hsVals() isQ.
   · Spørsmål (svaret skal leses) vises BARE i kortet under søkefeltet. Handlinger (legg til, påminn, avtaler) vises BARE i
     Glimt-pillen øverst. Aldri begge: spørsmål fra søkefeltet publiseres ikke til pillen (Assist31.ask / AiJobs31.update).
   · Spørsmålsvakt før avtaletolkning: «?», spørreord først, eller «hvor mange/mye/lenge/langt, hva er/blir, når går/er,
     hvordan blir». Unntak: «legg til / book / bestill / påminn» gir fortsatt handling. Da vises aldri «Legg i kalender».
   · Intensjonsord må være hele ord: \b(time|timen|timeavtale|avtale)\b – «timer», «timeplan» og «sommertid» teller ikke.
   · Dagslys, soloppgang og solnedgang for en dato besvares lokalt (NOAA-formelen, valgt værsted eller Oslo), med «Åpne Vær ›».
   Serveren (SERVER36) svarer også kind:'question'|'action' fra /api/assist; kind:'action' flytter jobben til pillen. */

enum Assist36 {
    private static let starts: [String] = ["spørsmål", "hva ", "hva?", "hvor ", "hvem ", "hvilken ", "hvilke ", "hvilket ", "hvordan ",
                                           "hvorfor ", "når ", "kan du ", "vet du ", "fortell ", "what ", "when ", "where ", "how ",
                                           "who ", "why ", "is ", "are ", "do ", "does "]
    private static let inner: [String] = ["hvor mange", "hvor mye", "hvor lenge", "hvor langt", "hva er", "hva blir", "når går",
                                          "når er", "hvordan blir", "hva skjer"]
    private static let actions: [String] = ["legg til", "legg inn", "book ", "bestill", "påminn", "minn meg", "lagre ", "last opp",
                                            "avbestill", "add ", "remind me"]

    /// Eksplisitt handlingsverb (vinner over spørsmålsvakten).
    static func explicitAction(_ raw: String) -> Bool {
        let t: String = " " + raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) + " "
        return actions.contains { (a: String) -> Bool in t.contains(" " + a) }
    }

    /// Er teksten et spørsmål (svaret skal leses)?
    static func isQuestion(_ raw: String) -> Bool {
        let t: String = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || explicitAction(t) { return false }
        if t.contains("?") { return true }
        let padded: String = t + " "
        if starts.contains(where: { (s: String) -> Bool in padded.hasPrefix(s) }) { return true }
        return inner.contains { (s: String) -> Bool in t.contains(s) }
    }

    /// Hele ord: time, timen, timeavtale, avtale (ikke «timer», «timeplan», «sommertid»).
    static func hasApptWord(_ raw: String) -> Bool {
        let t: String = raw.lowercased()
        return t.range(of: "\\b(time|timen|timeavtale|avtale)\\b", options: .regularExpression) != nil
    }

    /// Søket skal ikke foreslå «Legg i kalender»: spørsmål uten eksplisitt handling.
    static func blocksAppt(_ raw: String) -> Bool { isQuestion(raw) }

    /* ---------- Dagslys og sol ---------- */

    static func isSunQuestion(_ raw: String) -> Bool {
        let t: String = raw.lowercased()
        let keys: [String] = ["dagslys", "soloppgang", "solnedgang", "sola opp", "sola ned", "solen opp", "solen ned",
                              "sola går", "solen går", "lyst ute", "sunrise", "sunset", "daylight"]
        return keys.contains { (k: String) -> Bool in t.contains(k) }
    }

    private static let months: [(String, Int)] = [("januar", 1), ("februar", 2), ("mars", 3), ("april", 4), ("mai", 5), ("juni", 6),
                                                  ("juli", 7), ("august", 8), ("september", 9), ("oktober", 10), ("november", 11),
                                                  ("desember", 12), ("jan", 1), ("feb", 2), ("mar", 3), ("apr", 4), ("jun", 6),
                                                  ("jul", 7), ("aug", 8), ("sep", 9), ("okt", 10), ("nov", 11), ("des", 12)]

    /// Datoen i teksten: 29.06.2027, 29.06, 29/6, «29. juni 2027», «i morgen», ellers i dag.
    static func dateIn(_ raw: String, now: Date = Date()) -> Date {
        let t: String = raw.lowercased()
        let cal: Calendar = Calendar.current
        let today: Date = cal.startOfDay(for: now)
        if t.contains("i overmorgen") { return cal.date(byAdding: .day, value: 2, to: today) ?? today }
        if t.contains("i morgen") || t.contains("tomorrow") { return cal.date(byAdding: .day, value: 1, to: today) ?? today }
        let year: Int = cal.component(.year, from: now)
        if let r = t.range(of: "\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\b", options: .regularExpression) {
            let parts: [Int] = t[r].split(whereSeparator: { $0 == "." || $0 == "/" }).compactMap { Int($0) }
            if parts.count >= 2 {
                var y: Int = parts.count >= 3 ? parts[2] : year
                if y < 100 { y += 2000 }
                if let d = make(y, parts[1], parts[0]) { return d }
            }
        }
        for (name, m) in months {
            if let r = t.range(of: "\\b(\\d{1,2})\\.?\\s+" + name + "\\b(\\s+\\d{4})?", options: .regularExpression) {
                let nums: [Int] = t[r].split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
                if let day = nums.first {
                    let y: Int = nums.count >= 2 ? nums[1] : year
                    if let d = make(y, m, day) { return d }
                }
            }
        }
        return today
    }

    private static func make(_ y: Int, _ m: Int, _ d: Int) -> Date? {
        if m < 1 || m > 12 || d < 1 || d > 31 { return nil }
        var c: DateComponents = DateComponents()
        c.year = y
        c.month = m
        c.day = d
        c.hour = 12
        return Calendar.current.date(from: c)
    }

    /// NOAA/suncalc-formelen (solhøyde −0,833°). nil = midnattssol eller mørketid.
    static func sun(_ day: Date, lat: Double, lon: Double) -> (rise: Date, set: Date)? {
        let rad: Double = Double.pi / 180
        var c: DateComponents = Calendar.current.dateComponents([.year, .month, .day], from: day)
        c.hour = 12
        let noon: Date = Calendar.current.date(from: c) ?? day
        let jd: Double = noon.timeIntervalSince1970 / 86400 + 2440587.5
        let n: Double = (jd - 2451545.0 + 0.0008).rounded()
        let jStar: Double = n - lon / 360
        let mDeg: Double = (357.5291 + 0.98560028 * jStar).truncatingRemainder(dividingBy: 360)
        let mR: Double = mDeg * rad
        let cEq: Double = 1.9148 * sin(mR) + 0.02 * sin(2 * mR) + 0.0003 * sin(3 * mR)
        let lam: Double = (mDeg + cEq + 180 + 102.9372).truncatingRemainder(dividingBy: 360) * rad
        let jTransit: Double = 2451545.0 + jStar + 0.0053 * sin(mR) - 0.0069 * sin(2 * lam)
        let dec: Double = asin(sin(lam) * sin(23.4397 * rad))
        let phi: Double = lat * rad
        let cosW: Double = (sin(-0.833 * rad) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec))
        if cosW < -1 || cosW > 1 { return nil }
        let w: Double = acos(cosW) / rad
        let jRise: Double = jTransit - w / 360
        let jSet: Double = jTransit + w / 360
        let rise: Date = Date(timeIntervalSince1970: (jRise - 2440587.5) * 86400)
        let set: Date = Date(timeIntervalSince1970: (jSet - 2440587.5) * 86400)
        return (rise, set)
    }

    private static let monthNames: [String] = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august",
                                               "september", "oktober", "november", "desember"]

    /// «29. juni 2027 i Oslo: soloppgang 03:54, solnedgang 22:44, 18 t 50 min dagslys.»
    static func sunText(_ raw: String, place: String, lat: Double, lon: Double) -> String {
        let day: Date = dateIn(raw)
        let cal: Calendar = Calendar.current
        let d: Int = cal.component(.day, from: day)
        let m: Int = cal.component(.month, from: day)
        let y: Int = cal.component(.year, from: day)
        let head: String = "\(d). " + monthNames[(m - 1) % 12] + " \(y) i " + place
        guard let s = sun(day, lat: lat, lon: lon) else {
            let summer: Bool = (m >= 4 && m <= 9) == (lat >= 0)
            return head + (summer ? ": **midnattssol** – sola går ikke ned, 24 t dagslys." : ": **mørketid** – sola står ikke opp.")
        }
        let mins: Int = Int(s.set.timeIntervalSince(s.rise) / 60)
        let len: String = "\(mins / 60) t \(mins % 60) min"
        return head + ": soloppgang **" + JS.fmt(s.rise, "HH:mm") + "**, solnedgang **" + JS.fmt(s.set, "HH:mm") + "**, **" + len + "** dagslys."
    }

    /// Lokalt svar for sol-spørsmål (stedet: valgt værsted, ellers Oslo). nil = ikke et sol-spørsmål.
    @MainActor static func localAnswer(_ raw: String, _ store: Store) -> Assist31Answer? {
        if !isSunQuestion(raw) { return nil }
        var name: String = "Oslo"
        var lat: Double = 59.9139
        var lon: Double = 10.7522
        if let p = store.weatherPlaces.first(where: { $0.id == store.weatherPlace }) ?? store.weatherPlaces.first,
           let la = p.lat, let lo = p.lon {
            name = p.name
            lat = la
            lon = lo
        } else if let la = store.weatherLat, let lo = store.weatherLon {
            name = store.homeWeather?.place ?? "her"
            lat = la
            lon = lo
        }
        var a: Assist31Answer = Assist31Answer()
        a.text = sunText(raw, place: name, lat: lat, lon: lon)
        a.source = "Sol · beregnet lokalt"
        a.intent = "sun"
        a.wx35Name = name
        a.wx35Lat = lat
        a.wx35Lon = lon
        return a
    }
}
