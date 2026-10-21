import Foundation
import Security

/* ---------------- Prompt 44: Kalender – utlogging av seg selv, innlogging via Homelab ved kald start, raske data ---------------- */
// Spesifikasjon: prompts/prompt-44-pakke/claude-code-kalender-ipad-topp-innlogging-hastighet.md (punkt 2–4).
// Felles for Kalender (iPhone/iPad), widgetene og Kalender for Mac (SharedKal/Core).
//
// Årsaken til «jeg blir ofte logget ut» (funnet i prompt 44):
// 1. Serveren gir hvert Kalender-token en enhet (app + device), og et NYTT token for samme app + enhet trekker tilbake det gamle
//    (server/auth41.js issueCompanion41). Kalender sendte aldri `device` til /api/auth/token og /api/auth/device-exchange, så
//    iPhone, iPad, Mac og Android fikk alle enheten «iPhone» – innlogging på én enhet logget ut de andre. Homelab-appen lager
//    i tillegg sitt eget Kalender-token med device «iPhone» (KalCompanion33) og trakk dermed tilbake Kalenders eget.
//    Nå: hver installasjon har sitt eget, stabile enhetsnavn (KalDev44.name, «Min iPad 3F2A»).
// 2. Ethvert 401 ga utlogging med en gang – også et 401 fra feil adresse (lokal adresse på et annet nett) eller et token som
//    nettopp var byttet. Nå: KalNet sender 401 til KalAuthGate44 (én fornyelse om gangen, andre kall venter på samme svar):
//    nytt token fra Homelab (App Group) → «Fortsett som»-tokenet → refresh-token (når serveren har det) → samme token mot de
//    andre adressene. Bare når serveren avviser tokenet på alle måter regnes det som tilbakekalt (KalNetError.revoked44).
//    Tidsavbrudd, 5xx og ingen nett gir aldri utlogging.

/// Stabilt enhetsnavn per installasjon (serveren erstatter bare tokenet for samme navn).
enum KalDev44 {
    private static let lock: NSLock = NSLock()
    private static var cached: String? = nil

    /// «Min iPhone 3F2A» · «Min iPad 3F2A» · «Min Mac 3F2A». Serveren gjør «iPhone…»/«iPad…» om til bare «iPhone»/«iPad»,
    /// derfor «Min» foran (navnet vises slik i Innstillinger → Enheter).
    static var name: String {
        lock.lock()
        if let c = cached {
            lock.unlock()
            return c
        }
        lock.unlock()
        let n: String = "Min " + model + " " + installId
        lock.lock()
        cached = n
        lock.unlock()
        return n
    }

    /// iPhone | iPad | Mac (fra maskinvare-id-en, uten UIKit – virker også i widget-utvidelsen og utenfor hovedtråden).
    static var model: String {
        #if os(macOS)
        return "Mac"
        #else
        let m: String = machine.lowercased()
        if m.hasPrefix("ipad") { return "iPad" }
        if m.hasPrefix("iphone") { return "iPhone" }
        let sim: String = (ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "").lowercased()
        if sim.hasPrefix("ipad") { return "iPad" }
        return "iPhone"
        #endif
    }

    /// hw.machine («iPhone15,2», «iPad13,4»).
    static var machine: String {
        var size: Int = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        if size <= 0 { return "" }
        var buf: [CChar] = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.machine", &buf, &size, nil, 0)
        return String(cString: buf)
    }

    /// Fire tegn, lagret én gang. iOS: Nøkkelringen (overlever ny installasjon og app-oppdatering, så serveren ikke får
    /// et nytt token per installasjon – maks 10 per bruker). Mac: appens egne innstillinger (ingen Nøkkelring på hovedtråden).
    static var installId: String {
        let key: String = "kal44.dev"
        #if os(macOS)
        if let v = UserDefaults.standard.string(forKey: key), v.count == 4 { return v }
        let n: String = fresh()
        UserDefaults.standard.set(n, forKey: key)
        return n
        #else
        if let d = KalKeychain41.read(key), let v = String(data: d, encoding: .utf8), v.count == 4 { return v }
        if let v = KalGroup.defaults.string(forKey: key), v.count == 4 {
            KalKeychain41.write(key, Data(v.utf8))
            return v
        }
        let n: String = fresh()
        KalKeychain41.write(key, Data(n.utf8))
        KalGroup.defaults.set(n, forKey: key)
        return n
        #endif
    }

    private static func fresh() -> String {
        let chars: [Character] = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        var out: String = ""
        for _ in 0..<4 { out.append(chars[Int.random(in: 0..<chars.count)]) }
        return out
    }
}

/// Resultatet av et forsøk på å reparere innloggingen etter 401.
enum KalRecover44: Equatable {
    /// Nytt (eller fortsatt gyldig) token er lagret: prøv kallet igjen.
    case renewed
    /// Serveren avviser tokenet på alle måter: logg ut.
    case revoked
    /// Fikk ikke svar: behold innloggingen og prøv senere.
    case offline
}

/// Én fornyelse om gangen. Kall som får 401 samtidig venter på samme svar (ingen kappløp som gjør det nye tokenet ugyldig).
actor KalAuthGate44 {
    static let shared: KalAuthGate44 = KalAuthGate44()

    /// Lagrer en ny økt (iOS: App Group-en som widgetene leser · Mac: MacSession). Settes av appen ved oppstart.
    nonisolated(unsafe) static var saver: ((KalSession41) -> Void)? = nil

    private var running: Task<KalRecover44, Never>? = nil
    private var lastAt: Date = .distantPast
    private var lastResult: KalRecover44 = .offline

    func recover(failedToken: String) async -> KalRecover44 {
        if let r = running { return await r.value }
        // Et annet kall har allerede byttet tokenet: bare prøv igjen.
        let cur: String = KalNet.session().1 ?? ""
        if !cur.isEmpty && cur != failedToken { return .renewed }
        // Samme token avvist for et øyeblikk siden: ikke spør serveren på nytt for hvert kall.
        if Date().timeIntervalSince(lastAt) < 20 && lastResult == .revoked { return .revoked }
        let t: Task<KalRecover44, Never> = Task { await KalAuthGate44.work(failedToken) }
        running = t
        let v: KalRecover44 = await t.value
        running = nil
        lastAt = Date()
        lastResult = v
        KalLog44.send("auth.recover", ["result": String(describing: v)])
        return v
    }

    /* ---------- Selve arbeidet (utenfor aktøren, så nettkallene ikke holder den) ---------- */

    private static func work(_ failed: String) async -> KalRecover44 {
        let s: ([String], String?) = KalNet.session()
        let bases: [String] = s.0
        var sawNet: Bool = false
        // 1. Var det feil adresse som svarte 401 (lokal adresse på et annet nett)? Samme token mot alle adressene først –
        //    da lages ikke et nytt token unødig.
        if !failed.isEmpty {
            if let base = await probe(bases, failed) {
                var ordered: [String] = [base]
                for b in bases where b != base { ordered.append(b) }
                store(KalSession41(token: failed, refresh: "", user: currentUser, base: base), bases: ordered)
                KalNet44.markGood(base)
                return .renewed
            }
            if lastProbeNet { sawNet = true }
        }
        // 2. Homelab-appen har skrevet et nytt Kalender-token i App Group-en (iOS).
        #if !os(macOS)
        if let hl = KalGroup.homelabToken, hl != failed {
            let hb: [String] = KalGroup.homelabBases.isEmpty ? bases : KalGroup.homelabBases
            if let base = await probe(hb, hl) {
                store(KalSession41(token: hl, refresh: "", user: KalGroup.homelabUser, base: base), bases: hb)
                return .renewed
            }
            if lastProbeNet { sawNet = true }
        }
        #endif
        // 3. «Fortsett som»: kortlivet enhets-token fra Homelab på samme enhet.
        if let d = KalShared41.device() {
            do {
                let n: KalSession41 = try await KalAuth41.deviceExchange(d)
                store(n, bases: [n.base] + bases)
                return .renewed
            } catch let e as KalAuth41Error {
                if e.status == 0 { sawNet = true }
            } catch {
                sawNet = true
            }
        }
        // 4. Refresh-token (POST /api/auth/refresh – tåles at serveren ikke har det: 404).
        if let rd = KalKeychain44.readRefresh(), !rd.isEmpty {
            switch await refresh(rd, bases: bases) {
            case .renewed: return .renewed
            case .offline: sawNet = true
            case .revoked: return .revoked
            }
        }
        return sawNet ? .offline : .revoked
    }

    nonisolated(unsafe) private static var lastProbeNet: Bool = false

    /// Første adresse der tokenet blir godtatt. Setter lastProbeNet når ingen adresse svarte i det hele tatt.
    private static func probe(_ bases: [String], _ token: String) async -> String? {
        var anyAnswer: Bool = false
        for b in bases {
            do {
                _ = try await KalNet.send("GET", "/api/kalender/calendars", json: nil, timeout: 8, bases: [b], token: token)
                lastProbeNet = false
                return b
            } catch let e as KalNetError {
                if e.status != 0 { anyAnswer = true }
                // 404: eldre server uten kalenderlista – tokenet er likevel godtatt (ellers 401).
                if e.status == 404 || e.status == 405 {
                    lastProbeNet = false
                    return b
                }
            } catch {}
        }
        lastProbeNet = !anyAnswer
        return nil
    }

    private static func refresh(_ rt: String, bases: [String]) async -> KalRecover44 {
        let body: [String: Any] = ["refresh_token": rt, "refresh": rt, "client": KalAuth41.client, "device": KalDev44.name]
        for b in bases {
            do {
                let d: Data = try await KalNet.send("POST", "/api/auth/refresh", json: body, timeout: 12, bases: [b], token: nil)
                let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
                guard let n = try? KalAuth41.session(o, base: b) else { return .offline }
                store(KalSession41(token: n.token, refresh: n.refresh, user: n.user.isEmpty ? currentUser : n.user, base: b), bases: [b] + bases)
                return .renewed
            } catch let e as KalNetError {
                if e.status == 0 { continue }
                // Bare invalid_grant (eller 401 på selve fornyelsen) betyr at innloggingen er borte.
                if e.message.contains("invalid_grant") || e.status == 401 || e.status == 400 { return .revoked }
                // 404/405: serveren har ikke fornyelse – ikke et svar om innloggingen.
                if e.status == 404 || e.status == 405 { return .offline }
            } catch {}
        }
        return .offline
    }

    private static var currentUser: String {
        #if os(macOS)
        return UserDefaults.standard.string(forKey: "mac.user") ?? ""
        #else
        return KalGroup.user
        #endif
    }

    private static func store(_ s: KalSession41, bases: [String]) {
        if !s.refresh.isEmpty { KalKeychain44.writeRefresh(s.refresh) }
        var list: [String] = []
        for b in [s.base] + bases where !b.isEmpty && !list.contains(b) { list.append(b) }
        if let f = saver {
            f(KalSession41(token: s.token, refresh: s.refresh, user: s.user, base: list.first ?? s.base))
            return
        }
        #if !os(macOS)
        KalGroup.saveSession(bases: list, token: s.token, user: s.user.isEmpty ? KalGroup.user : s.user, via: KalGroup.via)
        #endif
    }
}

/// Refresh-tokenet (når serveren gir et). iOS: Nøkkelringen (etter første opplåsing, så bakgrunn/widget kan lese).
/// Mac: ingen Nøkkelring her (fornyelsen kan skje på hovedtråden) – appens egne innstillinger.
enum KalKeychain44 {
    static func readRefresh() -> String? {
        #if os(macOS)
        return UserDefaults.standard.string(forKey: "kal44.refresh")
        #else
        guard let d = KalKeychain41.read("refresh") else { return nil }
        return String(data: d, encoding: .utf8)
        #endif
    }

    static func writeRefresh(_ v: String) {
        #if os(macOS)
        UserDefaults.standard.set(v, forKey: "kal44.refresh")
        #else
        KalKeychain41.write("refresh", Data(v.utf8))
        #endif
    }
}

/// Adressen som sist svarte prøves først, og de andre får kort tidsavbrudd (ingen 25 s venting på en lokal adresse
/// som ikke finnes på dette nettet før den eksterne prøves).
enum KalNet44 {
    private static let lock: NSLock = NSLock()
    nonisolated(unsafe) private static var good: String = UserDefaults.standard.string(forKey: "kal44.good") ?? ""

    static func markGood(_ base: String) {
        lock.lock()
        let changed: Bool = good != base
        good = base
        lock.unlock()
        if changed { UserDefaults.standard.set(base, forKey: "kal44.good") }
    }

    static var goodBase: String {
        lock.lock()
        defer { lock.unlock() }
        return good
    }

    /// Den sist fungerende adressen først, ellers rekkefølgen som før.
    static func order(_ bases: [String]) -> [String] {
        let g: String = goodBase
        guard !g.isEmpty, bases.contains(g), bases.first != g else { return bases }
        var out: [String] = [g]
        for b in bases where b != g { out.append(b) }
        return out
    }
}

/// Prompt 44: «auth.handoff.start/return/ok/fail», «cal.firstFrame», «cal.syncDone» til serveren (Docker-loggen).
/// POST /api/apps/kalender/log {event, …} – best effort, 404 tåles. Lokalt også i konsollen.
enum KalLog44 {
    static func send(_ event: String, _ info: [String: String] = [:]) {
        var body: [String: Any] = ["event": event, "app": "kalender", "device": KalDev44.model, "at": Date().timeIntervalSince1970]
        for (k, v) in info { body[k] = v }
        #if DEBUG
        print("[kal44] " + event + " " + info.description)
        #endif
        let s: ([String], String?) = KalNet.session()
        guard let base = s.0.first, let tok = s.1, !tok.isEmpty else { return }
        Task.detached(priority: .background) {
            _ = try? await KalNet.send("POST", "/api/apps/kalender/log", json: body, timeout: 6, bases: [base], token: tok)
        }
    }
}
