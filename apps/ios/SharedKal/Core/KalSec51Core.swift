import Foundation
import Security
import LocalAuthentication
import UserNotifications
import Combine

/* ---------------- Prompt 51 (KAL51): Kalender – ny enhet godkjennes, krasjrapporter, feature flags, «Nytt i denne versjonen» ---------------- */
// Felles for Kalender (iPhone/iPad) og Kalender for Mac (SharedKal/Core). Widgetene kompilerer fila, men bruker den ikke:
// alt er av til appen setter KalSec51.enabled = true ved oppstart (ingen Nøkkelring-lesing eller nettkall fra widgetene).
// Server-API: SERVER51-API.md (SEC51 og QA51).
//
// 1. Enhetsnøkkel: fast, tilfeldig X-Device-Key (43 tegn base64url) sendes på innlogging, token-kall og godkjenningskall.
//    iOS: Nøkkelringen (KalKeychain41, account devkey51). Mac: appens egen sandkasse-fil (0600) – Nøkkelringen på Mac spør på
//    nytt etter hver ad hoc-signert oppdatering (se MacTokenFile44), og en ny nøkkel ville gitt ny godkjenning hver gang.
// 2. 403 {code:'DEVICE_APPROVAL_REQUIRED', approvalId, pollKey, statusUrl, finishUrl} → KalNetError.approval51. Innloggingen
//    viser «Venter på godkjenning», poller statusUrl (X-Approval-Key) og kaller finishUrl når den er godkjent. pollKey og token
//    vises aldri og logges aldri.
// 3. Innstillinger → Sikkerhet: ventende enheter med Godkjenn (Face ID / Touch ID først) og Avvis, og lokalt varsel når en ny
//    enhet venter (sjekkes når appen er aktiv, hvert 90. sekund).
// 4. Krasj: NSSetUncaughtExceptionHandler + signalhåndtering som bare skriver ett byte (signalnummeret) til en åpen fil.
//    Sendes som {reports:[…]} til /api/crash ved neste oppstart. Ingen persondata, tokens eller feltinnhold.
// 5. Flagg: GET /api/flags med X-Device-Id (fast tilfeldig id), bufret, hentet ved oppstart/aktivering og hver time.
//    KalFlags51.on("navn"). 6. «Nytt i denne versjonen»: /api/whatsnew og /api/whatsnew/seen.

enum KalSec51 {
    /// Settes av appen (iOS: KalApp.init, Mac: applicationDidFinishLaunching). Av i widgetene.
    nonisolated(unsafe) static var enabled: Bool = false

    /// ios | mac
    static var platform: String {
        #if os(macOS)
        return "mac"
        #else
        return "ios"
        #endif
    }

    static var release: String {
        let v: String = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
        let b: String = (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "1"
        return "kalender-" + platform + "@" + v + "+" + b
    }

    static var osVersion: String {
        let v: OperatingSystemVersion = ProcessInfo.processInfo.operatingSystemVersion
        return String(v.majorVersion) + "." + String(v.minorVersion) + "." + String(v.patchVersion)
    }

    /// Ekstra headere per sti (KalNet.sendOnce). Enhetsnøkkelen bare på innlogging/token/godkjenning, enhets-id-en bare på QA51.
    static func headers(_ path: String) -> [String: String] {
        if !enabled { return [:] }
        var out: [String: String] = [:]
        let keyPaths: [String] = ["/finans/api/login", "/finans/api/auth/", "/api/auth/", "/api/security51/"]
        if keyPaths.contains(where: { (p: String) -> Bool in path.hasPrefix(p) }) {
            out["X-Device-Key"] = KalDevKey51.key
        }
        let qaPaths: [String] = ["/api/flags", "/api/crash", "/api/whatsnew"]
        if qaPaths.contains(where: { (p: String) -> Bool in path.hasPrefix(p) }) {
            out["X-Device-Id"] = KalDevKey51.deviceId
            out["X-Client-Platform"] = platform
            // Bare ASCII i headere.
            let name: String = String(("Kalender (" + KalDev44.name + ")").unicodeScalars.filter { (u: Unicode.Scalar) -> Bool in u.value >= 32 && u.value < 127 })
            out["X-Device-Name"] = String(name.prefix(60))
        }
        return out
    }

    static func parseDate(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        let g: ISO8601DateFormatter = ISO8601DateFormatter()
        g.formatOptions = [.withInternetDateTime]
        return g.date(from: s)
    }

    static func hm(_ d: Date) -> String {
        let c: DateComponents = Calendar.current.dateComponents([.hour, .minute], from: d)
        let h: Int = c.hour ?? 0
        let m: Int = c.minute ?? 0
        return (h < 10 ? "0" : "") + String(h) + ":" + (m < 10 ? "0" : "") + String(m)
    }
}

/* ---------- Enhetsnøkkel og enhets-id ---------- */

enum KalDevKey51 {
    private static let lock: NSLock = NSLock()
    nonisolated(unsafe) private static var cachedKey: String? = nil

    /// Fast, tilfeldig enhetsnøkkel (16–128 tegn [A-Za-z0-9_-]). Lages første gang og beholdes.
    static var key: String {
        lock.lock()
        if let k = cachedKey {
            lock.unlock()
            return k
        }
        lock.unlock()
        let k: String = loadOrCreate()
        lock.lock()
        if cachedKey == nil { cachedKey = k }
        let out: String = cachedKey ?? k
        lock.unlock()
        return out
    }

    /// Installasjons-id for feature flags (ikke en sikkerhetsfaktor). Lagres i appens innstillinger.
    static var deviceId: String {
        let k: String = "kal51.devid"
        if let v = UserDefaults.standard.string(forKey: k), valid(v) { return v }
        let n: String = "kal" + random(18)
        UserDefaults.standard.set(n, forKey: k)
        return n
    }

    static func valid(_ s: String) -> Bool {
        if s.count < 16 || s.count > 128 { return false }
        let ok: CharacterSet = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
        return s.unicodeScalars.allSatisfy { (u: Unicode.Scalar) -> Bool in ok.contains(u) }
    }

    /// base64url av n tilfeldige byte (systemets kryptografiske generator).
    static func random(_ n: Int) -> String {
        var bytes: [UInt8] = [UInt8](repeating: 0, count: n)
        let st: OSStatus = SecRandomCopyBytes(kSecRandomDefault, n, &bytes)
        if st != errSecSuccess {
            var g: SystemRandomNumberGenerator = SystemRandomNumberGenerator()
            for i in 0..<n { bytes[i] = UInt8.random(in: 0...255, using: &g) }
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func loadOrCreate() -> String {
        #if os(macOS)
        if let v = fileRead(), valid(v) { return v }
        let n: String = random(32)
        fileWrite(n)
        return n
        #else
        if let d = KalKeychain41.read("devkey51"), let v = String(data: d, encoding: .utf8), valid(v) { return v }
        let n: String = random(32)
        KalKeychain41.write("devkey51", Data(n.utf8))
        return n
        #endif
    }

    #if os(macOS)
    private static var fileURL: URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let d: URL = dir.appendingPathComponent("Kalender", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        return d.appendingPathComponent("devkey51")
    }

    private static func fileRead() -> String? {
        guard let u = fileURL, let d = try? Data(contentsOf: u), let s = String(data: d, encoding: .utf8) else { return nil }
        let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    private static func fileWrite(_ v: String) {
        guard let u = fileURL else { return }
        try? Data(v.utf8).write(to: u, options: [.atomic])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: u.path)
    }
    #endif
}

/* ---------- Godkjenning av ny enhet (innloggingen) ---------- */

/// Svaret 403 DEVICE_APPROVAL_REQUIRED. pollKey vises aldri.
struct KalApproval51: Equatable {
    let id: String
    let pollKey: String
    let statusUrl: String
    let finishUrl: String
    let expires: Date
    let device: String
    /// Adressen som svarte (statusUrl/finishUrl er stier på samme server).
    let base: String

    /// nil når svaret ikke er en godkjenningsforespørsel (eller stiene ser feil ut – nøkkelen sendes bare til security51).
    static func parse(_ o: [String: Any], base: String) -> KalApproval51? {
        guard (o["code"] as? String) == "DEVICE_APPROVAL_REQUIRED" else { return nil }
        let id: String = (o["approvalId"] as? String) ?? ""
        let key: String = (o["pollKey"] as? String) ?? ""
        let st: String = (o["statusUrl"] as? String) ?? ("/api/security51/approvals/" + id + "/status")
        let fin: String = (o["finishUrl"] as? String) ?? ("/api/security51/approvals/" + id + "/finish")
        let pre: String = "/api/security51/approvals/"
        if id.isEmpty || key.isEmpty || !st.hasPrefix(pre) || !fin.hasPrefix(pre) { return nil }
        let exp: Date = KalSec51.parseDate(o["expiresAt"] as? String) ?? Date().addingTimeInterval(900)
        return KalApproval51(id: id, pollKey: key, statusUrl: st, finishUrl: fin, expires: exp,
                             device: (o["device"] as? String) ?? "", base: base)
    }
}

enum KalApprove51Outcome {
    case done(KalSession41)
    case denied
    case expired
    case cancelled
    case failed(String)
}

enum KalApprove51 {
    /// Ett kall mot godkjenningsendepunktene (uten Authorization). → (HTTP-kode, JSON). 0 = fikk ikke kontakt.
    static func call(_ method: String, _ ap: KalApproval51, path: String) async -> (Int, [String: Any]) {
        let b: String = ap.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: b + path) else { return (0, [:]) }
        var r: URLRequest = URLRequest(url: url)
        r.httpMethod = method
        r.timeoutInterval = 12
        r.cachePolicy = .reloadIgnoringLocalCacheData
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue(ap.pollKey, forHTTPHeaderField: "X-Approval-Key")
        r.setValue(KalDevKey51.key, forHTTPHeaderField: "X-Device-Key")
        if method == "POST" {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = Data("{}".utf8)
        }
        guard let pair = try? await URLSession.shared.data(for: r) else { return (0, [:]) }
        let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: pair.0)) as? [String: Any]) ?? [:]
        return (code, o)
    }

    /// pending | approved | denied | expired | offline
    static func status(_ ap: KalApproval51) async -> String {
        let (code, o): (Int, [String: Any]) = await call("GET", ap, path: ap.statusUrl)
        if code == 0 || code >= 500 { return "offline" }
        if code == 404 { return "expired" }
        if code < 200 || code >= 300 { return (o["state"] as? String) ?? "offline" }
        return (o["state"] as? String) ?? "pending"
    }

    /// Venter på godkjenningen (poll hvert 2,5 s) og fullfører. Avbrytes når `cancelled` svarer true.
    static func run(_ ap: KalApproval51, cancelled: @escaping @MainActor () -> Bool) async -> KalApprove51Outcome {
        while true {
            if await cancelled() { return .cancelled }
            if Date() > ap.expires.addingTimeInterval(30) { return .expired }
            let st: String = await status(ap)
            if await cancelled() { return .cancelled }
            if st == "denied" { return .denied }
            if st == "expired" { return .expired }
            if st == "approved" {
                let (code, o): (Int, [String: Any]) = await call("POST", ap, path: ap.finishUrl)
                if await cancelled() { return .cancelled }
                if code >= 200 && code < 300 {
                    guard let token = o["token"] as? String, !token.isEmpty else { return .failed("Uventet svar fra serveren.") }
                    let u: [String: Any] = (o["user"] as? [String: Any]) ?? [:]
                    let name: String = (u["name"] as? String) ?? (u["username"] as? String) ?? ""
                    return .done(KalSession41(token: token, refresh: (o["refresh"] as? String) ?? "", user: name, base: ap.base))
                }
                if code == 403 { return .denied }
                if code == 410 || code == 404 { return .expired }
                if code == 409 && (o["state"] as? String) == "done" { return .failed("Innloggingen er allerede fullført. Logg inn på nytt.") }
                // 409 pending eller ingen kontakt: prøv igjen.
            }
            try? await Task.sleep(nanoseconds: 2_500_000_000)
        }
    }

    /// Feiltekstene til innloggingsskjermen.
    static func message(_ r: KalApprove51Outcome) -> String {
        switch r {
        case .denied: return "Innloggingen ble avvist fra en annen enhet. Var det deg, kan du prøve igjen."
        case .expired: return "Godkjenningen er utløpt (15 min). Logg inn på nytt."
        case .failed(let m): return m
        case .done, .cancelled: return ""
        }
    }
}

/* ---------- Feature flags ---------- */

enum KalFlags51 {
    private static let key: String = "kal51.flags"

    /// Av når flagget er ukjent eller ikke er hentet ennå.
    static func on(_ name: String) -> Bool {
        let d: [String: Bool] = (UserDefaults.standard.dictionary(forKey: key) as? [String: Bool]) ?? [:]
        return d[name] ?? false
    }

    static var fetchedAt: Date? {
        let t: Double = UserDefaults.standard.double(forKey: key + ".at")
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }

    static func refresh() async {
        guard KalSec51.enabled, let d = try? await KalNet.get("/api/flags", timeout: 10) else { return }
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        guard let f = o["flags"] as? [String: Any] else { return }
        var out: [String: Bool] = [:]
        for (k, v) in f { if let b = v as? Bool { out[k] = b } }
        UserDefaults.standard.set(out, forKey: key)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: key + ".at")
    }
}

/* ---------- Krasjrapporter ---------- */

/// Fanger ukontrollerte unntak og signaler. Signalhåndteringen skriver bare ett byte til en fil som allerede er åpen.
enum KalCrash51 {
    nonisolated(unsafe) static var fd: Int32 = -1
    nonisolated(unsafe) static var hadException: Bool = false
    nonisolated(unsafe) static var installed: Bool = false
    static let signals: [Int32] = [SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGTRAP]

    static var dir: URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let d: URL = base.appendingPathComponent("Kalender", isDirectory: true).appendingPathComponent("crash51", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true, attributes: nil)
        return d
    }

    /// Kalles én gang tidlig ved oppstart: forrige økts krasj legges i køen, så installeres fangerne.
    static func install() {
        if installed { return }
        installed = true
        collectPrevious()
        NSSetUncaughtExceptionHandler { (e: NSException) in KalCrash51.record(e) }
        guard let d = dir else { return }
        let path: String = d.appendingPathComponent("signal.bin").path
        fd = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_APPEND, 0o600)
        for s in signals { signal(s, kalCrash51Signal) }
    }

    /// Unntak: navn, årsak (kortet ned) og stakken (bare symboler).
    static func record(_ e: NSException) {
        hadException = true
        var msg: String = e.name.rawValue
        if let r = e.reason, !r.isEmpty { msg += ": " + String(r.prefix(300)) }
        let stack: String = e.callStackSymbols.prefix(40).joined(separator: "\n")
        let rep: [String: Any] = report(message: msg, stack: stack, kind: "exception")
        guard let d = dir, let data = try? JSONSerialization.data(withJSONObject: rep) else { return }
        let name: String = "exc-" + String(Int(Date().timeIntervalSince1970)) + ".json"
        try? data.write(to: d.appendingPathComponent(name), options: [.atomic])
    }

    static func report(message: String, stack: String?, kind: String) -> [String: Any] {
        var r: [String: Any] = [
            "platform": KalSec51.platform,
            "message": String(message.prefix(500)),
            "level": "fatal",
            "release": KalSec51.release,
            "osVersion": KalSec51.osVersion,
            "model": KalDev44.machine.isEmpty ? KalDev44.model : KalDev44.machine,
            "tags": ["app": "kalender", "kind": kind],
            "extra": ["at": ISO8601DateFormatter().string(from: Date())],
        ]
        if let stack, !stack.isEmpty { r["stack"] = String(stack.prefix(8000)) }
        return r
    }

    static func signalName(_ s: Int32) -> String {
        switch s {
        case SIGABRT: return "SIGABRT"
        case SIGSEGV: return "SIGSEGV"
        case SIGBUS: return "SIGBUS"
        case SIGILL: return "SIGILL"
        case SIGFPE: return "SIGFPE"
        case SIGTRAP: return "SIGTRAP"
        default: return "signal " + String(s)
        }
    }

    /// Forrige økt: unntaksfiler og signalbyte → køen.
    private static func collectPrevious() {
        guard let d = dir else { return }
        var reps: [[String: Any]] = []
        let files: [URL] = (try? FileManager.default.contentsOfDirectory(at: d, includingPropertiesForKeys: nil)) ?? []
        var hadExc: Bool = false
        for f in files where f.lastPathComponent.hasPrefix("exc-") {
            if let data = try? Data(contentsOf: f), let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                reps.append(o)
                hadExc = true
            }
            try? FileManager.default.removeItem(at: f)
        }
        if let b = try? Data(contentsOf: d.appendingPathComponent("signal.bin")), let s = b.first {
            // SIGABRT etter et unntak er samme krasj.
            if !(hadExc && Int32(s) == SIGABRT) {
                reps.append(report(message: "Krasj: " + signalName(Int32(s)), stack: nil, kind: "signal"))
            }
        }
        if !reps.isEmpty { enqueue(reps) }
    }

    private static var queueURL: URL? { dir?.appendingPathComponent("queue.json") }

    static func queue() -> [[String: Any]] {
        guard let u = queueURL, let d = try? Data(contentsOf: u) else { return [] }
        return ((try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]]) ?? []
    }

    static func enqueue(_ reps: [[String: Any]]) {
        var q: [[String: Any]] = queue() + reps
        if q.count > 20 { q = Array(q.suffix(20)) }
        save(q)
    }

    private static func save(_ q: [[String: Any]]) {
        guard let u = queueURL else { return }
        if q.isEmpty {
            try? FileManager.default.removeItem(at: u)
            return
        }
        if let d = try? JSONSerialization.data(withJSONObject: q) { try? d.write(to: u, options: [.atomic]) }
    }

    /// Sender køen (maks 10 per kall). Beholdes ved feil (ikke innlogget, ingen nett, 429).
    static func flush() async {
        guard KalSec51.enabled else { return }
        var q: [[String: Any]] = queue()
        while !q.isEmpty {
            let batch: [[String: Any]] = Array(q.prefix(10))
            do {
                _ = try await KalNet.send("POST", "/api/crash", json: ["reports": batch], timeout: 15)
            } catch let e as KalNetError {
                // 400/413: rapporten blir aldri godtatt – kast den. Andre feil: prøv ved neste oppstart.
                if e.status == 400 || e.status == 413 {
                    q.removeFirst(batch.count)
                    save(q)
                    continue
                }
                return
            } catch {
                return
            }
            q.removeFirst(batch.count)
            save(q)
        }
    }
}

/// Signalhåndteringen: bare async-signal-sikre kall (write, signal, raise).
private func kalCrash51Signal(_ sig: Int32) {
    let f: Int32 = KalCrash51.fd
    if f >= 0 && !KalCrash51.hadException {
        var b: UInt8 = UInt8(truncatingIfNeeded: sig)
        _ = write(f, &b, 1)
    }
    signal(sig, SIG_DFL)
    raise(sig)
}

/* ---------- «Nytt i denne versjonen» ---------- */

struct KalWhatsNew51: Equatable {
    let version: String
    let title: String
    let date: String
    let items: [String]
}

/* ---------- Ventende enheter, varsler og oppfriskning (Innstillinger → Sikkerhet) ---------- */

struct KalPendingDev51: Identifiable, Equatable {
    let id: String
    let device: String
    let place: String
    let method: String
    let created: Date?
    let expires: Date?
    let userName: String
}

@MainActor
final class KalSec51Model: ObservableObject {
    static let shared: KalSec51Model = KalSec51Model()

    @Published var pending: [KalPendingDev51] = []
    @Published var whatsNew: KalWhatsNew51? = nil
    /// Id-en som behandles nå (knappene viser fremdrift).
    @Published var busyId: String = ""
    @Published var message: String = ""
    @Published var loadedOnce: Bool = false

    private var lastRefresh: Date = Date.distantPast
    private var loop: Task<Void, Never>? = nil

    /// Er det et token? (Mac: bufferen, aldri Nøkkelringen på hovedtråden.)
    private var hasToken: Bool { !(KalNet.session().1 ?? "").isEmpty }

    /// Oppstart / aktivering / etter innlogging. Henter maks én gang per 60 s, og starter løkken (hvert 90. s mens appen er aktiv).
    func active() {
        if !KalSec51.enabled { return }
        startLoop()
        if Date().timeIntervalSince(lastRefresh) < 60 { return }
        lastRefresh = Date()
        Task { @MainActor in await self.refreshAll() }
    }

    /// Appen går i bakgrunnen (iOS). Mac-appen kjører videre i menylinjen.
    func inactive() {
        loop?.cancel()
        loop = nil
    }

    /// Ny innlogging: hent alt med en gang.
    func didLogin() {
        lastRefresh = Date.distantPast
        active()
    }

    private func startLoop() {
        if loop != nil { return }
        loop = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 90_000_000_000)
                if Task.isCancelled { break }
                await self.loadPending()
                let age: TimeInterval = Date().timeIntervalSince(KalFlags51.fetchedAt ?? Date.distantPast)
                if age > 3600 && self.hasToken { await KalFlags51.refresh() }
            }
        }
    }

    func refreshAll() async {
        await KalCrash51.flush()
        if !hasToken { return }
        await KalFlags51.refresh()
        await loadPending()
        await loadWhatsNew(force: false)
    }

    /* ---------- Ventende enheter ---------- */

    func loadPending() async {
        if !hasToken { return }
        guard let d = try? await KalNet.get("/api/security51/approvals", timeout: 12) else { return }
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        let list: [[String: Any]] = (o["approvals"] as? [[String: Any]]) ?? []
        let now: Date = Date()
        var out: [KalPendingDev51] = []
        for a in list {
            guard (a["state"] as? String) == "pending", let id = a["id"] as? String else { continue }
            let exp: Date? = KalSec51.parseDate(a["expiresAt"] as? String)
            if let exp, exp < now { continue }
            out.append(KalSec51Model.pendingRow(a, id: id, exp: exp))
        }
        if out != pending { pending = out }
        loadedOnce = true
        notifyNew(out)
    }

    nonisolated static func pendingRow(_ a: [String: Any], id: String, exp: Date?) -> KalPendingDev51 {
        var place: [String] = []
        if let c = a["countryName"] as? String, !c.isEmpty { place.append(c) } else if let c = a["country"] as? String, !c.isEmpty { place.append(c) }
        if let ip = a["ip"] as? String, !ip.isEmpty { place.append(ip) }
        return KalPendingDev51(id: id, device: (a["device"] as? String) ?? "Ukjent enhet", place: place.joined(separator: " · "),
                               method: (a["methodLabel"] as? String) ?? "", created: KalSec51.parseDate(a["createdAt"] as? String),
                               expires: exp, userName: (a["userName"] as? String) ?? "")
    }

    /// Lokalt varsel én gang per ventende enhet.
    private func notifyNew(_ list: [KalPendingDev51]) {
        let k: String = "kal51.notified"
        var seen: [String] = UserDefaults.standard.stringArray(forKey: k) ?? []
        var changed: Bool = false
        for p in list where !seen.contains(p.id) {
            seen.append(p.id)
            changed = true
            let c: UNMutableNotificationContent = UNMutableNotificationContent()
            c.title = "Ny enhet vil logge inn"
            var body: String = p.device
            if !p.place.isEmpty { body += " · " + p.place }
            c.body = body + ". Godkjenn eller avvis i Kalender → Innstillinger → Sikkerhet."
            c.sound = .default
            c.threadIdentifier = "sikkerhet"
            c.userInfo = ["sec51": p.id, "url": "kalender://sikkerhet"]
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "kal51-approve-" + p.id, content: c, trigger: nil)) { (_: Error?) in }
        }
        if changed {
            if seen.count > 50 { seen = Array(seen.suffix(50)) }
            UserDefaults.standard.set(seen, forKey: k)
        }
    }

    /// Godkjenn (Face ID / Touch ID / enhetskode først) eller avvis.
    func decide(_ p: KalPendingDev51, approve: Bool) {
        if !busyId.isEmpty { return }
        busyId = p.id
        message = ""
        Task { @MainActor in
            if approve {
                let ok: Bool = await KalSec51Model.confirmOwner("Godkjenn innloggingen på " + p.device)
                if !ok {
                    self.busyId = ""
                    self.message = "Ikke godkjent – bekreftelsen ble avbrutt."
                    return
                }
            }
            do {
                _ = try await KalNet.send("POST", "/api/security51/approvals/" + KalNet.enc(p.id), json: ["approve": approve], timeout: 15)
                self.message = approve ? "✓ " + p.device + " er godkjent." : p.device + " ble avvist."
            } catch let e as KalNetError {
                if e.status == 409 { self.message = "Allerede behandlet." }
                else if e.status == 410 { self.message = "Forespørselen er utløpt." }
                else { self.message = e.message }
            } catch {
                self.message = "Fikk ikke kontakt med serveren."
            }
            self.busyId = ""
            self.pending.removeAll { (x: KalPendingDev51) -> Bool in x.id == p.id }
            await self.loadPending()
        }
    }

    /// Biometri med enhetskoden som reserve. Er ingen lås satt opp på enheten, godtas trykket på Godkjenn alene.
    nonisolated static func confirmOwner(_ reason: String) async -> Bool {
        let ctx: LAContext = LAContext()
        var err: NSError? = nil
        if !ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) { return true }
        do {
            return try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }

    /* ---------- «Nytt i denne versjonen» ---------- */

    /// force = fra Innstillinger (vis uansett). Ellers bare når serveren sier show og versjonen ikke er sett her.
    func loadWhatsNew(force: Bool) async {
        if !hasToken { return }
        guard let d = try? await KalNet.get("/api/whatsnew", timeout: 12) else {
            if force { message = "Fant ikke nyhetene for denne versjonen." }
            return
        }
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        let version: String = (o["version"] as? String) ?? ""
        let items: [String] = ((o["items"] as? [Any]) ?? []).compactMap { (x: Any) -> String? in x as? String }
        if version.isEmpty || items.isEmpty { return }
        let show: Bool = (o["show"] as? Bool) ?? false
        let seenHere: String = UserDefaults.standard.string(forKey: "kal51.wnSeen") ?? ""
        if !force && (!show || seenHere == version) { return }
        whatsNew = KalWhatsNew51(version: version, title: (o["title"] as? String) ?? "", date: (o["date"] as? String) ?? "",
                                 items: Array(items.prefix(12)))
    }

    func dismissWhatsNew() {
        guard let w = whatsNew else { return }
        whatsNew = nil
        UserDefaults.standard.set(w.version, forKey: "kal51.wnSeen")
        Task { _ = try? await KalNet.send("POST", "/api/whatsnew/seen", json: ["version": w.version], timeout: 10) }
    }
}
