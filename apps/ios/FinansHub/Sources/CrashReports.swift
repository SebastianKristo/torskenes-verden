import Foundation
import Darwin

/* ---------------- Prompt 51 (QA51): krasjrapporter ---------------- */
// • NSSetUncaughtExceptionHandler: navn, årsak (maks 300 tegn) og stakk skrives til exception.json.
// • Signaler (SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGTRAP – også Swift-feil som fatalError og tvungen utpakking):
//   håndtereren gjør bare open/write/close av «sig:<nr>» i en ferdig tildelt buffer (asynk-signal-sikkert), og lar så
//   standardhåndteringen avslutte appen.
// • Ved neste oppstart (install) legges funnet i en lokal kø (maks 20), som sendes til POST /api/crash som {reports:[…]}
//   (maks 10 per kall, også uten innlogging). Ingen persondata: ingen enhetsnavn, brukernavn, tokens eller feltinnhold –
//   bare plattform, melding, stakk, versjon, iOS-versjon og maskinvare-id.

enum Crash51 {
    nonisolated(unsafe) static var sigPath: UnsafeMutablePointer<CChar>? = nil
    nonisolated(unsafe) static var sigBuf: UnsafeMutablePointer<UInt8>? = nil
    nonisolated(unsafe) private static var installed: Bool = false
    @MainActor private static var flushing: Bool = false

    /// Kalles først i App.init.
    nonisolated static func install() {
        if installed { return }
        installed = true
        let dir: URL = folder()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        collect()
        sigPath = strdup(dir.appendingPathComponent("signal.txt").path)
        sigBuf = UnsafeMutablePointer<UInt8>.allocate(capacity: 16)
        NSSetUncaughtExceptionHandler { (e: NSException) in Crash51.record(e) }
        for s in [SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGTRAP] { _ = signal(s, crash51OnSignal) }
    }

    nonisolated static func folder() -> URL {
        let base: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return base.appendingPathComponent("crash51", isDirectory: true)
    }

    /// Ukontrollert NSException (kjører før appen avsluttes).
    nonisolated static func record(_ e: NSException) {
        let stack: String = e.callStackSymbols.prefix(40).joined(separator: "\n")
        let reason: String = String((e.reason ?? "").prefix(300))
        let o: [String: Any] = ["message": "\(e.name.rawValue): \(reason)", "stack": stack, "at": Date().timeIntervalSince1970]
        if let d = try? JSONSerialization.data(withJSONObject: o) {
            try? d.write(to: folder().appendingPathComponent("exception.json"), options: .atomic)
        }
    }

    /// Forrige krasj (fil fra håndtererne) → køen.
    nonisolated private static func collect() {
        let fm = FileManager.default
        let dir: URL = folder()
        let ex: URL = dir.appendingPathComponent("exception.json")
        let sg: URL = dir.appendingPathComponent("signal.txt")
        var found: [[String: Any]] = []
        if let d = try? Data(contentsOf: ex), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
            let at: Date? = JS.num(o, "at").map { Date(timeIntervalSince1970: $0) }
            found.append(report(message: JS.str(o, "message") ?? "NSException", stack: JS.str(o, "stack"), kind: "exception", at: at))
        } else if let d = try? Data(contentsOf: sg), let s = String(data: d, encoding: .utf8), s.hasPrefix("sig:") {
            let n: Int32 = Int32(s.dropFirst(4).trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
            let at: Date? = (try? fm.attributesOfItem(atPath: sg.path))?[.modificationDate] as? Date
            found.append(report(message: "Appen krasjet (\(signalName(n)))", stack: nil, kind: "signal", at: at))
        }
        try? fm.removeItem(at: ex)
        try? fm.removeItem(at: sg)
        if !found.isEmpty { save(Array((load() + found).suffix(20))) }
    }

    nonisolated private static func report(message: String, stack: String?, kind: String, at: Date?) -> [String: Any] {
        var r: [String: Any] = ["platform": "ios", "message": String(message.prefix(500)), "level": "fatal", "release": Device51.release,
                                "osVersion": Device51.osVersion, "model": Device51.machine, "tags": ["app": "finanshub", "kind": kind]]
        if let stack, !stack.isEmpty { r["stack"] = String(stack.prefix(8000)) }
        if let at { r["extra"] = ["crashedAt": ISO8601DateFormatter().string(from: at)] }
        return r
    }

    nonisolated private static func signalName(_ n: Int32) -> String {
        switch n {
        case SIGABRT: return "SIGABRT"
        case SIGSEGV: return "SIGSEGV"
        case SIGBUS: return "SIGBUS"
        case SIGILL: return "SIGILL"
        case SIGFPE: return "SIGFPE"
        case SIGTRAP: return "SIGTRAP"
        default: return "signal \(n)"
        }
    }

    /* ---------- Køen ---------- */

    nonisolated private static func queueURL() -> URL { folder().appendingPathComponent("queue.json") }

    nonisolated private static func load() -> [[String: Any]] {
        guard let d = try? Data(contentsOf: queueURL()), let a = (try? JSONSerialization.jsonObject(with: d)) as? [Any] else { return [] }
        return a.compactMap { $0 as? [String: Any] }
    }

    nonisolated private static func save(_ q: [[String: Any]]) {
        if q.isEmpty { try? FileManager.default.removeItem(at: queueURL()); return }
        if let d = try? JSONSerialization.data(withJSONObject: q) { try? d.write(to: queueURL(), options: .atomic) }
    }

    /// Sender køen (FH51Host ved oppstart og når appen kommer i forgrunnen). 429/nett borte/eldre server: prøver senere.
    @MainActor static func flush(_ store: Store) async {
        if flushing { return }
        var q: [[String: Any]] = load()
        guard !q.isEmpty else { return }
        let api: API = store.loggedIn ? store.api : API(base: store.server, token: nil)
        guard !api.base.isEmpty else { return }
        flushing = true
        defer { flushing = false }
        while !q.isEmpty {
            let n: Int = Swift.min(10, q.count)
            let batch: [[String: Any]] = Array(q.prefix(n))
            do {
                _ = try await api.callAt("/api", "POST", "/crash", json: ["reports": batch], timeout: 20)
            } catch let e as APIError where e.status >= 400 && e.status < 500 && e.status != 404 && e.status != 408 && e.status != 429 {
                // Ugyldig eller for stor rapport: forkastes, så køen ikke blir stående fast.
            } catch {
                return
            }
            q.removeFirst(n)
            save(q)
        }
    }
}

/// Signalhåndtereren: bare asynk-signal-sikre kall (open/write/close/signal/raise) og ferdig tildelt minne.
private func crash51OnSignal(_ sig: Int32) {
    if let path = Crash51.sigPath, let buf = Crash51.sigBuf {
        let fd: Int32 = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0o644)
        if fd >= 0 {
            buf[0] = 0x73 // s
            buf[1] = 0x69 // i
            buf[2] = 0x67 // g
            buf[3] = 0x3A // :
            var n: Int = 4
            let s: Int = Int(sig < 0 ? 0 : sig)
            if s >= 10 { buf[n] = UInt8(48 + (s / 10) % 10); n += 1 }
            buf[n] = UInt8(48 + s % 10)
            n += 1
            _ = write(fd, buf, n)
            _ = close(fd)
        }
    }
    signal(sig, SIG_DFL)
    raise(sig)
}
