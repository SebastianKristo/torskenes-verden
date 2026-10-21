import Foundation

/* ---------------- Prompt 33: Kalender – nettverk mot Homelab-serveren (appen + widgetene) ---------------- */
// Samme server og konto som Homelab-appene: /api/kalender*, /api/assist, /api/kalender/calendars, /api/kalender/weather.
// Endepunkt som mangler (404/405) gir fornuftige reserver: faste kalenderfarger lokalt og vær fra Open-Meteo.

struct KalNetError: LocalizedError {
    let status: Int
    let message: String
    /// Innloggingen krever 2FA-kode.
    var needsTotp: Bool = false
    /// Prompt 44: serveren avviser tokenet også etter fornyelse (KalAuthGate44) – bare da logges man ut.
    var revoked44: Bool = false
    var errorDescription: String? { message }
}

enum KalNet {
    /// Prompt 34: Mac-appen (KalenderMac) har tokenet i Nøkkelringen i stedet for App Group-en og setter denne.
    /// nil (iOS-appen og widgetene) = App Group som før.
    static var sessionProvider: (() -> ([String], String?))? = nil

    /// Adressene i rekkefølge (hoved, ekstern, lokal) og tokenet. Appen kan overstyre (innloggingsskjermen).
    static func session() -> ([String], String?) {
        if let p = sessionProvider { return p() }
        return (KalGroup.bases, KalGroup.token)
    }

    static func send(_ method: String, _ path: String, json: [String: Any]? = nil, timeout: TimeInterval = 20,
                     bases overrideBases: [String]? = nil, token overrideToken: String? = nil) async throws -> Data {
        // Prompt 44: innloggingens egne kall (egne adresser/token) går rett til serveren. Vanlige kall som får 401 går via
        // KalAuthGate44 (én fornyelse om gangen) og prøves én gang til – 401 alene logger aldri ut.
        if overrideBases != nil || overrideToken != nil {
            return try await sendOnce(method, path, json: json, timeout: timeout, bases: overrideBases, token: overrideToken)
        }
        let used: String = session().1 ?? ""
        do {
            return try await sendOnce(method, path, json: json, timeout: timeout, bases: nil, token: nil)
        } catch let e as KalNetError {
            if e.status != 401 || used.isEmpty { throw e }
            let r: KalRecover44 = await KalAuthGate44.shared.recover(failedToken: used)
            switch r {
            case .renewed:
                // Et nytt 401 her logger ikke ut: neste henting går via fornyelsen igjen, og bare den kan si «tilbakekalt».
                return try await sendOnce(method, path, json: json, timeout: timeout, bases: nil, token: nil)
            case .revoked:
                var x: KalNetError = e
                x.revoked44 = true
                throw x
            case .offline:
                throw KalNetError(status: 0, message: "Fikk ikke kontakt med serveren")
            }
        }
    }

    private static func sendOnce(_ method: String, _ path: String, json: [String: Any]?, timeout: TimeInterval,
                                 bases overrideBases: [String]?, token overrideToken: String?) async throws -> Data {
        let s: ([String], String?) = session()
        let bases: [String] = KalNet44.order(overrideBases ?? s.0)
        let token: String? = overrideToken ?? s.1
        if bases.isEmpty { throw KalNetError(status: 0, message: "Ikke logget inn") }
        var lastError: KalNetError = KalNetError(status: 0, message: "Fikk ikke kontakt med serveren")
        let good: String = KalNet44.goodBase
        for (i, base) in bases.enumerated() {
            let trimmed: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: trimmed + path) else { continue }
            var r: URLRequest = URLRequest(url: url)
            r.httpMethod = method
            // Prompt 44: en adresse som ikke har svart før får kort frist når det finnes flere å prøve.
            let isLast: Bool = i == bases.count - 1
            r.timeoutInterval = (isLast || base == good) ? timeout : Swift.min(timeout, 6)
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            if let token, !token.isEmpty { r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
            if let json {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
                r.httpBody = try? JSONSerialization.data(withJSONObject: json)
            }
            let pair: (Data, URLResponse)
            do {
                pair = try await URLSession.shared.data(for: r)
            } catch {
                lastError = KalNetError(status: 0, message: "Fikk ikke kontakt med " + (url.host ?? trimmed))
                continue
            }
            let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
            if code >= 200 && code < 300 {
                if overrideBases == nil { KalNet44.markGood(base) }
                return pair.0
            }
            let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: pair.0)) as? [String: Any]) ?? [:]
            let msg: String = (obj["error"] as? String) ?? ("Feil " + String(code))
            // Serveren svarte: ikke prøv neste adresse (samme server, samme svar).
            throw KalNetError(status: code, message: msg, needsTotp: (obj["needsTotp"] as? Bool) ?? false)
        }
        throw lastError
    }

    static func get(_ path: String, timeout: TimeInterval = 15) async throws -> Data {
        try await send("GET", path, json: nil, timeout: timeout)
    }

    static func enc(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? s
    }

    /* ---------- Data ---------- */

    /// Kalenderne. nil = serveren har ikke endepunktet (404) → faste kalendere.
    static func calendars() async -> [KalCal]? {
        do {
            let d: Data = try await get("/api/kalender/calendars")
            let list: [KalCal] = KalCals39.fromServer(KalParse.calendars(d))
            return list.isEmpty ? nil : list
        } catch {
            return nil
        }
    }

    static func events(from: String, to: String, calIds: Set<String>) async throws -> [KalEvent] {
        let d: Data = try await get("/api/kalender?from=" + from + "&to=" + to, timeout: 25)
        // Prompt 39: innebygde norske helligdager når serveren ikke har kalenderen Helligdager.
        return KalHoliday39.merge(KalParse.events(d, calIds: calIds), from: from, to: to)
    }

    /// Vær per dag: serveren først, så Open-Meteo for Oslo (16 dager).
    static func weather(from: String, to: String) async -> [KalWxDay] {
        if let d = try? await get("/api/kalender/weather?from=" + from + "&to=" + to) {
            let w: [KalWxDay] = KalParse.weather(d)
            if !w.isEmpty { return w }
        }
        let u: String = "https://api.open-meteo.com/v1/forecast?latitude=59.91&longitude=10.75&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FOslo&forecast_days=16"
        guard let url = URL(string: u) else { return [] }
        var r: URLRequest = URLRequest(url: url)
        r.timeoutInterval = 10
        guard let pair = try? await URLSession.shared.data(for: r) else { return [] }
        return KalParse.openMeteo(pair.0)
    }

    /// Henter alt widgetene trenger og lagrer bufferen. Brukes av widget-utvidelsen når appen ikke har vært åpen.
    static func refreshSnapshot() async -> KalSnapshot? {
        guard KalGroup.token != nil else { return nil }
        let old: KalSnapshot? = loadSnapshot()
        let cals: [KalCal] = await calendars() ?? old?.cals ?? KalCals.defaults
        let ids: Set<String> = Set(cals.map { (c: KalCal) -> String in c.id })
        let from: String = KalD.addKey(KalD.todayKey(), -1)
        let to: String = KalD.addKey(KalD.todayKey(), 40)
        guard let evs = try? await events(from: from, to: to, calIds: ids) else { return nil }
        let wx: [KalWxDay] = await weather(from: KalD.todayKey(), to: KalD.addKey(KalD.todayKey(), 15))
        var snap: KalSnapshot = KalSnapshot()
        snap.events = mergeLocal(evs, old)
        snap.cals = cals
        snap.wx = wx.isEmpty ? (old?.wx ?? []) : wx
        snap.updated = Date().timeIntervalSince1970
        saveSnapshot(snap)
        return snap
    }

    /// Lokale hendelser (ikke lagret på serveren ennå) beholdes i bufferen.
    private static func mergeLocal(_ fresh: [KalEvent], _ old: KalSnapshot?) -> [KalEvent] {
        guard let old else { return fresh }
        var out: [KalEvent] = fresh
        for e in old.events where e.pending { out.append(e) }
        return out
    }

    static func loadSnapshot() -> KalSnapshot? {
        guard let d = KalGroup.snapshotData else { return nil }
        return try? JSONDecoder().decode(KalSnapshot.self, from: d)
    }

    static func saveSnapshot(_ s: KalSnapshot) {
        // Bare de neste ~6 ukene (widgetene trenger ikke mer).
        var small: KalSnapshot = s
        let from: String = KalD.addKey(KalD.todayKey(), -2)
        let to: String = KalD.addKey(KalD.todayKey(), 45)
        small.events = s.events.filter { (e: KalEvent) -> Bool in e.day >= from && e.day <= to }
        if small.events.count > 500 { small.events = Array(small.events.prefix(500)) }
        if let d = try? JSONEncoder().encode(small) { KalGroup.snapshotData = d }
    }
}
