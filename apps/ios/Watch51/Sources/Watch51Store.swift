import Foundation
import Security
import WatchConnectivity
import CoreLocation
import WatchKit

/* ---------------- Prompt 51 (IOSPLAT51): FinansHub for Apple Watch – innlogging, nett og data ----------------
 Eget target (FinansHubWatch51) som ikke avhenger av FinansHub-targetet; bygges med egen scheme (se project.yml).
 Innlogging: klokka spør iPhone om serveradressen (WatchConnectivity, bare adressene – aldri token), lager en QR-økt
 (POST /api/auth/qr/session {app:'finans', platform:'ios', device:'Apple Watch'}) og sender økt-id + engangskode til iPhone,
 som viser «Logge inn på ny enhet?» og godkjenner med Face ID. Klokka viser tallet som skal stemme, og henter sitt eget
 token (GET /api/auth/qr/session/:id med X-QR-Key). Tokenet ligger i klokkas Nøkkelring.
 Data: Sjekk inn og «Hent meg» (/api/family/checkin), avganger (/api/widgets/departures), handleliste (/mat/api/week og
 /mat/api/shopping) og Glimt (/api/chat/send, strømmet svar; tekst fra diktering). */

/* ---------- Nøkkelring ---------- */

enum W51Keychain {
    static let service: String = "no.kristo.finanshub.watch51"

    static func get(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func set(_ key: String, _ value: String?) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(q as CFDictionary)
        guard let value else { return }
        var add: [String: Any] = q
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

/* ---------- iPhone (WatchConnectivity) ---------- */

final class W51Phone: NSObject, WCSessionDelegate {
    static let shared: W51Phone = W51Phone()

    func activate() {
        guard WCSession.isSupported() else { return }
        let s: WCSession = WCSession.default
        if s.delegate == nil { s.delegate = self }
        if s.activationState != .activated { s.activate() }
    }

    var reachable: Bool { WCSession.isSupported() && WCSession.default.activationState == .activated && WCSession.default.isReachable }

    /// Melding til FinansHub på iPhone med svar (nil = iPhone svarte ikke).
    func ask(_ msg: [String: Any]) async -> [String: Any]? {
        activate()
        for _ in 0..<10 {
            if WCSession.default.activationState == .activated { break }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        guard WCSession.default.activationState == .activated else { return nil }
        return await withCheckedContinuation { (c: CheckedContinuation<[String: Any]?, Never>) in
            let once: W51Once = W51Once(c)
            WCSession.default.sendMessage(msg, replyHandler: { (r: [String: Any]) in once.resume(r) }, errorHandler: { (_: Error) in once.resume(nil) })
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
}

/// Sikrer at fortsettelsen bare gjenopptas én gang.
final class W51Once: @unchecked Sendable {
    private var c: CheckedContinuation<[String: Any]?, Never>?
    private let lock: NSLock = NSLock()

    init(_ c: CheckedContinuation<[String: Any]?, Never>) { self.c = c }

    func resume(_ v: [String: Any]?) {
        lock.lock()
        let x: CheckedContinuation<[String: Any]?, Never>? = c
        c = nil
        lock.unlock()
        x?.resume(returning: v)
    }
}

/* ---------- Posisjon til «Hent meg» ---------- */

final class W51Locator: NSObject, CLLocationManagerDelegate {
    static let shared: W51Locator = W51Locator()
    private let m: CLLocationManager = CLLocationManager()
    private var waiters: [CheckedContinuation<CLLocation?, Never>] = []

    override init() {
        super.init()
        m.delegate = self
        m.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// Fersk posisjon (maks ca. 6 s), ellers nil. Spør om tillatelse første gang.
    func fix() async -> CLLocation? {
        if m.authorizationStatus == .notDetermined { m.requestWhenInUseAuthorization() }
        if m.authorizationStatus == .denied || m.authorizationStatus == .restricted { return nil }
        if let l = m.location, Date().timeIntervalSince(l.timestamp) < 120 { return l }
        let task: Task<CLLocation?, Never> = Task { @MainActor in
            await withCheckedContinuation { (c: CheckedContinuation<CLLocation?, Never>) in
                self.waiters.append(c)
                self.m.requestLocation()
            }
        }
        let timeout: Task<Void, Never> = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            self.finish(nil)
        }
        let l: CLLocation? = await task.value
        timeout.cancel()
        return l
    }

    @MainActor private func finish(_ l: CLLocation?) {
        let w: [CheckedContinuation<CLLocation?, Never>] = waiters
        waiters = []
        for c in w { c.resume(returning: l) }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let l: CLLocation? = locations.last
        Task { @MainActor in self.finish(l) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(nil) }
    }
}

/* ---------- Modeller ---------- */

struct W51Dep: Hashable, Identifiable {
    var id: String { line + dest + String(Int(at.timeIntervalSince1970)) }
    var line: String
    var dest: String
    var color: String
    var at: Date

    var minutes: Int { Swift.max(0, Int(at.timeIntervalSinceNow / 60)) }
}

struct W51Stop: Hashable, Identifiable {
    var id: String
    var name: String
    var deps: [W51Dep]
}

struct W51ShopItem: Hashable, Identifiable {
    var id: String
    var text: String
    var done: Bool
}

struct W51Quick: Hashable, Identifiable {
    var id: String
    var text: String
}

/* ---------- Butikken ---------- */

@MainActor
@Observable
final class W51Store {
    static let shared: W51Store = W51Store()

    var token: String? = W51Keychain.get("token")
    var name: String = W51Keychain.get("name") ?? ""
    var bases: [String] = (W51Keychain.get("bases") ?? "").split(separator: "\n").map { String($0) }

    /// Innlogging: idle | phone | waiting | match | done | error
    var phase: String = "idle"
    var match: String = ""
    var info: String = ""

    var people: [(String, String)] = []
    var quick: [W51Quick] = []
    var stops: [W51Stop] = []
    var shop: [W51ShopItem] = []
    var busy: Bool = false
    var flash: String = ""

    var glimtAnswer: String = ""
    var glimtBusy: Bool = false
    @ObservationIgnored private var chatId: String? = nil

    var loggedIn: Bool { !(token ?? "").isEmpty }

    /// Fast nøkkel for denne klokka (SEC51 kjenner igjen godkjente enheter).
    static let deviceKey: String = {
        if let k = W51Keychain.get("deviceKey") { return k }
        let k: String = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased() + UUID().uuidString.prefix(8).lowercased()
        W51Keychain.set("deviceKey", k)
        return k
    }()

    static var defaultBases: [String] {
        let b: Bundle = Bundle.main
        return [b.object(forInfoDictionaryKey: "HomelabServer") as? String, b.object(forInfoDictionaryKey: "HomelabLocal47") as? String]
            .compactMap { $0 }.filter { !$0.isEmpty }
    }

    /* ---------- Nett ---------- */

    struct Reply {
        var data: Data
        var status: Int
        var base: String
        var ok: Bool { status >= 200 && status < 300 }
        var obj: [String: Any] { ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:] }
    }

    func call(_ method: String, _ path: String, _ body: [String: Any]? = nil, bases: [String]? = nil, auth: Bool = true,
              headers: [String: String] = [:], timeout: TimeInterval = 15) async -> Reply {
        let list: [String] = bases ?? (self.bases.isEmpty ? W51Store.defaultBases : self.bases)
        for base in list {
            let b: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: b + path) else { continue }
            var r: URLRequest = URLRequest(url: url)
            r.httpMethod = method
            r.timeoutInterval = timeout
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            r.setValue(W51Store.deviceKey, forHTTPHeaderField: "X-Device-Key")
            if auth, let t = token { r.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
            for (k, v) in headers { r.setValue(v, forHTTPHeaderField: k) }
            if let body {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
                r.httpBody = try? JSONSerialization.data(withJSONObject: body)
            }
            guard let pair = try? await URLSession.shared.data(for: r) else { continue }
            let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 && auth { logout(silent: true) }
            if code > 0 { return Reply(data: pair.0, status: code, base: base) }
        }
        return Reply(data: Data(), status: 0, base: "")
    }

    static func err(_ r: Reply) -> String {
        if r.status == 0 { return "Fikk ikke kontakt med serveren." }
        return (r.obj["error"] as? String) ?? "Feil \(r.status)"
    }

    /* ---------- Innlogging via iPhone ---------- */

    func pair() async {
        phase = "phone"
        info = "Spør iPhone …"
        match = ""
        var list: [String] = []
        if let r = await W51Phone.shared.ask(["kind": "server51"]) {
            if (r["ok"] as? Bool) != true {
                fail((r["error"] as? String) ?? "Logg inn i FinansHub på iPhone først.")
                return
            }
            for k in ["server", "external", "local"] {
                if let v = r[k] as? String, !v.isEmpty, !list.contains(v) { list.append(v) }
            }
        }
        if list.isEmpty {
            fail("Fant ikke iPhone. Åpne FinansHub på iPhone (samme Apple-konto, Bluetooth på) og prøv igjen.")
            return
        }
        info = "Lager innloggingskode …"
        let c: Reply = await call("POST", "/api/auth/qr/session", ["app": "finans", "platform": "ios", "device": "Apple Watch"], bases: list, auth: false)
        let o: [String: Any] = c.obj
        guard c.status == 201 || c.ok, let sid = o["sessionId"] as? String, let code = o["code"] as? String, let key = o["clientKey"] as? String else {
            fail(c.status == 404 ? "Serveren støtter ikke QR-innlogging. Oppdater Homelab." : W51Store.err(c))
            return
        }
        // Samme server videre (økten finnes bare der).
        let base: String = c.base
        guard let r = await W51Phone.shared.ask(["kind": "pair51", "code": sid + "." + code]), (r["ok"] as? Bool) == true else {
            fail("iPhone svarte ikke. Åpne FinansHub på iPhone og prøv igjen.")
            return
        }
        phase = "waiting"
        info = (r["state"] as? String) == "open-phone" ? "Åpne FinansHub på iPhone og godkjenn med Face ID." : "Godkjenn på iPhone med Face ID."
        await poll(sid: sid, key: key, base: base, all: list)
    }

    private func poll(sid: String, key: String, base: String, all: [String]) async {
        let path: String = "/api/auth/qr/session/" + (sid.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sid)
        for _ in 0..<70 {
            if phase == "idle" { return }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            let r: Reply = await call("GET", path, bases: [base], auth: false, headers: ["X-QR-Key": key], timeout: 8)
            let o: [String: Any] = r.obj
            let st: String = (o["state"] as? String) ?? (r.status == 404 ? "expired" : "")
            switch st {
            case "scanned", "approved":
                if let m = o["match"] as? String ?? (o["match"] as? NSNumber)?.stringValue { match = m }
                phase = "match"
                info = "Sjekk at tallet stemmer med iPhone."
            case "done":
                guard let t = o["token"] as? String, !t.isEmpty else {
                    fail("Fikk ikke token fra serveren.")
                    return
                }
                let u: [String: Any] = (o["user"] as? [String: Any]) ?? [:]
                token = t
                name = (u["name"] as? String) ?? (u["username"] as? String) ?? ""
                bases = [base] + all.filter { $0 != base }
                W51Keychain.set("token", t)
                W51Keychain.set("name", name)
                W51Keychain.set("bases", bases.joined(separator: "\n"))
                phase = "done"
                WKInterfaceDevice.current().play(.success)
                return
            case "denied":
                fail("Innloggingen ble avvist på iPhone.")
                return
            case "expired":
                fail("Koden gikk ut. Prøv igjen.")
                return
            default:
                continue
            }
        }
        fail("Tiden gikk ut. Prøv igjen.")
    }

    func cancelPair() {
        phase = "idle"
        info = ""
        match = ""
    }

    private func fail(_ msg: String) {
        phase = "error"
        info = msg
        WKInterfaceDevice.current().play(.failure)
    }

    func logout(silent: Bool = false) {
        token = nil
        W51Keychain.set("token", nil)
        phase = "idle"
        if !silent { name = "" }
    }

    /* ---------- Sjekk inn og «Hent meg» ---------- */

    func loadCheckin() async {
        let r: Reply = await call("GET", "/api/family/checkin")
        guard r.ok else { return }
        let o: [String: Any] = r.obj
        people = ((o["people"] as? [Any]) ?? []).compactMap { (x: Any) -> (String, String)? in
            guard let p = x as? [String: Any], let id = (p["userId"] as? String) ?? (p["userId"] as? NSNumber)?.stringValue else { return nil }
            return (id, (p["name"] as? String) ?? "")
        }
        quick = ((o["quick"] as? [Any]) ?? []).compactMap { (x: Any) -> W51Quick? in
            guard let q = x as? [String: Any], let id = q["id"] as? String, id != "pickup" else { return nil }
            return W51Quick(id: id, text: (q["text"] as? String) ?? id)
        }
    }

    var recipients: String {
        let n: [String] = people.map { String($0.1.split(separator: " ").first ?? "") }.filter { !$0.isEmpty }
        if n.isEmpty { return "familien" }
        if n.count == 1 { return n[0] }
        return n.dropLast().joined(separator: ", ") + " og " + (n.last ?? "")
    }

    /// true = sendt.
    func checkIn(_ quick: String) async -> Bool {
        busy = true
        defer { busy = false }
        if people.isEmpty { await loadCheckin() }
        if people.isEmpty {
            flash = "Fant ingen i familien."
            return false
        }
        var b: [String: Any] = ["to": people.map { $0.0 }, "quick": quick]
        if quick == "pickup", let l = await W51Locator.shared.fix() {
            b["lat"] = l.coordinate.latitude
            b["lon"] = l.coordinate.longitude
            b["acc"] = Swift.max(0, l.horizontalAccuracy)
        }
        let r: Reply = await call("POST", "/api/family/checkin", b)
        if r.ok {
            flash = (quick == "pickup" ? "«Hent meg» sendt til " : "Sendt til ") + recipients
            WKInterfaceDevice.current().play(.success)
            return true
        }
        flash = W51Store.err(r)
        WKInterfaceDevice.current().play(.failure)
        return false
    }

    /* ---------- Avganger ---------- */

    func loadDepartures() async {
        let r: Reply = await call("GET", "/api/widgets/departures")
        guard r.ok else {
            flash = W51Store.err(r)
            return
        }
        let o: [String: Any] = r.obj
        stops = ((o["stops"] as? [Any]) ?? []).compactMap { (x: Any) -> W51Stop? in
            guard let s = x as? [String: Any] else { return nil }
            let id: String = (s["id"] as? String) ?? UUID().uuidString
            let deps: [W51Dep] = ((s["departures"] as? [Any]) ?? []).compactMap { W51Store.dep($0 as? [String: Any]) }
            return W51Stop(id: id, name: (s["name"] as? String) ?? id, deps: deps.filter { $0.at.timeIntervalSinceNow > -30 }.sorted { $0.at < $1.at })
        }
    }

    static func dep(_ o: [String: Any]?) -> W51Dep? {
        guard let o, let line = (o["line"] as? String) ?? (o["publicCode"] as? String), !line.isEmpty else { return nil }
        let dest: String = (o["dest"] as? String) ?? (o["to"] as? String) ?? (o["destination"] as? String) ?? ""
        var color: String = (o["color"] as? String) ?? ""
        if !color.isEmpty && !color.hasPrefix("#") { color = "#" + color }
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        var when: Date? = nil
        for k in ["expected", "time", "aimed"] {
            guard let s = o[k] as? String, s.count >= 16 else { continue }
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            when = f.date(from: s)
            if when == nil {
                f.formatOptions = [.withInternetDateTime]
                when = f.date(from: s)
            }
            if when != nil { break }
        }
        if when == nil, let m = (o["minutes"] as? NSNumber)?.doubleValue { when = Date().addingTimeInterval(m * 60) }
        guard let at = when else { return nil }
        return W51Dep(line: line, dest: dest, color: color, at: at)
    }

    /* ---------- Handleliste ---------- */

    func loadShop() async {
        let r: Reply = await call("GET", "/mat/api/week")
        guard r.ok else {
            flash = W51Store.err(r)
            return
        }
        shop = ((r.obj["shopping"] as? [Any]) ?? []).compactMap { (x: Any) -> W51ShopItem? in
            guard let s = x as? [String: Any] else { return nil }
            let id: String = (s["id"] as? String) ?? (s["id"] as? NSNumber)?.stringValue ?? ""
            if id.isEmpty { return nil }
            return W51ShopItem(id: id, text: (s["text"] as? String) ?? "", done: (s["done"] as? Bool) ?? false)
        }
    }

    func addShop(_ text: String) async {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return }
        let v: String = t.prefix(1).uppercased() + t.dropFirst()
        let r: Reply = await call("POST", "/mat/api/shopping", ["text": v])
        if r.ok {
            WKInterfaceDevice.current().play(.success)
            await loadShop()
        } else {
            flash = W51Store.err(r)
        }
    }

    func toggleShop(_ it: W51ShopItem) async {
        if let i = shop.firstIndex(of: it) { shop[i].done.toggle() }
        let enc: String = it.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? it.id
        let r: Reply = await call("POST", "/mat/api/shopping/" + enc + "/toggle", [:])
        WKInterfaceDevice.current().play(.click)
        if !r.ok {
            flash = W51Store.err(r)
            await loadShop()
        }
    }

    /* ---------- Glimt ---------- */

    func ask(_ text: String) async {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || glimtBusy { return }
        glimtBusy = true
        glimtAnswer = ""
        defer { glimtBusy = false }
        let list: [String] = bases.isEmpty ? W51Store.defaultBases : bases
        guard let tok = token, let b = list.first, let url = URL(string: b.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/chat/send") else { return }
        var body: [String: Any] = ["model": "auto", "messages": [["role": "user", "content": t]], "myData": true]
        if let chatId { body["chatId"] = chatId }
        var r: URLRequest = URLRequest(url: url)
        r.httpMethod = "POST"
        r.timeoutInterval = 120
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        r.setValue("Bearer " + tok, forHTTPHeaderField: "Authorization")
        r.setValue(W51Store.deviceKey, forHTTPHeaderField: "X-Device-Key")
        r.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (bytes, res) = try await URLSession.shared.bytes(for: r)
            let code: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
            if code >= 400 {
                glimtAnswer = code == 404 ? "Serveren har ikke Glimt-chat." : "Glimt svarte ikke (feil \(code))."
                return
            }
            var event: String = "message"
            for try await line in bytes.lines {
                if line.hasPrefix("event:") {
                    event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                    continue
                }
                guard line.hasPrefix("data:") else { continue }
                let payload: String = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                handle(event, payload)
                event = "message"
            }
            if glimtAnswer.isEmpty { glimtAnswer = "Glimt hadde ikke noe svar." }
        } catch {
            glimtAnswer = "Fikk ikke kontakt med Glimt."
        }
    }

    private func handle(_ event: String, _ payload: String) {
        if payload == "[DONE]" { return }
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: Data(payload.utf8))) as? [String: Any]) ?? [:]
        switch event {
        case "meta":
            if let id = o["chatId"] as? String { chatId = id }
        case "delta", "message":
            if let t = o["text"] as? String {
                glimtAnswer += t
            } else if let ch = (o["choices"] as? [Any])?.first as? [String: Any], let d = ch["delta"] as? [String: Any], let t = d["content"] as? String {
                glimtAnswer += t
            }
        case "error":
            glimtAnswer += (glimtAnswer.isEmpty ? "" : "\n\n") + ((o["error"] as? String) ?? "Noe gikk galt")
        default:
            break
        }
    }

    func newChat() {
        chatId = nil
        glimtAnswer = ""
    }
}
