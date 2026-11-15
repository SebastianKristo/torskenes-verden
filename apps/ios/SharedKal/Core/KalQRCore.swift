import Foundation
import Combine
import CoreImage

/* ---------------- Prompt 38: logg inn med QR fra mobilen (delt av Kalender for Mac og iPhone/iPad) ---------------- */
// Fasit: design/Logg inn QR.dc.html. Flyt (SERVER38):
//   POST /api/auth/qr → {sid, nonce, url, deepLink, expiresAt, ttl:60}   (QR-en inneholder bare sid + engangs-nonce, aldri token)
//   GET  /api/auth/qr/:sid/events (SSE, bundet til nonce/cookie): pending → scanned{user, match} → approved{needs2fa} | denied | expired | done
//   POST /api/auth/qr/finish {sid} → økt-cookie, eller {needs2fa:true} + pre-auth → POST /api/auth/2fa {code}
// Med økta hentes et eget app-token: POST /api/tokens/companion {app:'kalender', device} → {token, user} (lagres som før).
// Alt går i én egen URLSession (ephemeral), så cookiene følger QR-økta og ikke lekker til annet.

@MainActor
final class KalQR38Model: ObservableObject {
    /// idle | loading | pending | scanned | twofa | denied | error | done
    @Published private(set) var state: String = "idle"
    @Published private(set) var image: CGImage? = nil
    @Published private(set) var secondsLeft: Int = 60
    @Published private(set) var match: String = ""
    @Published private(set) var scannedBy: String = ""
    @Published private(set) var error: String = ""
    @Published var code: String = ""
    @Published private(set) var busy: Bool = false

    private var base: String = ""
    /// Enhetsnavnet som vises på mobilen («Kalender (MacBook)»).
    private var device: String = "Kalender"
    /// Enheten i companion-tokenet: «Mac», «iPad», «iPhone» (samme app + enhet erstatter det gamle tokenet).
    var companionDevice: String = "Mac"
    /// Kalles når innloggingen er ferdig: (server, app-token, navn). Mac: MacStore.didLogin, iOS: KalStore.didLogin.
    var onLogin: (@MainActor (String, String, String) -> Void)? = nil
    private var sid: String = ""
    private var nonce: String = ""
    private var expires: Date = Date()
    private var session: URLSession = KalQR38Model.makeSession()
    private var sseTask: Task<Void, Never>? = nil
    private var tickTask: Task<Void, Never>? = nil
    private var gen: Int = 0

    nonisolated private static func makeSession() -> URLSession {
        let cfg: URLSessionConfiguration = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 20
        cfg.timeoutIntervalForResource = 600
        return URLSession(configuration: cfg)
    }

    func start(base b: String, device d: String) {
        stop()
        device = d
        base = b.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        session = KalQR38Model.makeSession()
        renew()
    }

    func stop() {
        gen += 1
        sseTask?.cancel()
        sseTask = nil
        tickTask?.cancel()
        tickTask = nil
        session.invalidateAndCancel()
    }

    /// Ny kode (hvert 60. sekund, etter avvisning eller «Ny kode»).
    func renew() {
        gen += 1
        let g: Int = gen
        sseTask?.cancel()
        tickTask?.cancel()
        state = "loading"
        error = ""
        match = ""
        scannedBy = ""
        code = ""
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let o: [String: Any] = try await self.post("/api/auth/qr", ["device": self.device, "app": "kalender"])
                guard g == self.gen else { return }
                let sid: String = (o["sid"] as? String) ?? ""
                let nonce: String = (o["nonce"] as? String) ?? ""
                let url: String = (o["url"] as? String) ?? (o["deepLink"] as? String) ?? ""
                if sid.isEmpty || url.isEmpty {
                    self.failed("Uventet svar fra serveren.")
                    return
                }
                self.sid = sid
                self.nonce = nonce
                let ttl: Double = (o["ttl"] as? Double) ?? 60
                self.expires = Date().addingTimeInterval(ttl)
                if let ms = o["expiresAt"] as? Double, ms > 1_000_000_000_000 { self.expires = Date(timeIntervalSince1970: ms / 1000) }
                self.image = KalQR38Model.qr(url)
                self.secondsLeft = Swift.max(0, Int(self.expires.timeIntervalSinceNow.rounded()))
                self.state = "pending"
                self.listen(g)
                self.tick(g)
            } catch let e as KalQR38Error {
                guard g == self.gen else { return }
                self.failed(e.status == 404 ? "Serveren støtter ikke QR-innlogging ennå. Logg inn med passord." : e.message)
            } catch {
                guard g == self.gen else { return }
                self.failed("Fikk ikke kontakt med Homelab (" + error.localizedDescription + ").")
            }
        }
    }

    private func failed(_ m: String) {
        error = m
        state = "error"
    }

    /// Nedtelling; ny kode når den går ut (ikke mens mobilen holder på å godkjenne).
    private func tick(_ g: Int) {
        tickTask = Task { @MainActor [weak self] in
            while true {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self, g == self.gen, !Task.isCancelled else { return }
                let left: Int = Swift.max(0, Int(self.expires.timeIntervalSinceNow.rounded()))
                if left != self.secondsLeft { self.secondsLeft = left }
                if left == 0 && self.state == "pending" {
                    self.renew()
                    return
                }
            }
        }
    }

    /// SSE: «event: scanned» + «data: {…}» (eller {state:'scanned', …} i data-linja).
    private func listen(_ g: Int) {
        let path: String = "/api/auth/qr/" + KalNet.enc(sid) + "/events?nonce=" + KalNet.enc(nonce)
        guard let url = URL(string: base + path) else { return }
        var r: URLRequest = URLRequest(url: url)
        r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        r.timeoutInterval = 600
        let s: URLSession = session
        sseTask = Task { @MainActor [weak self] in
            var name: String = ""
            do {
                let pair: (URLSession.AsyncBytes, URLResponse) = try await s.bytes(for: r)
                if let h = pair.1 as? HTTPURLResponse, h.statusCode >= 400 {
                    guard let self, g == self.gen else { return }
                    self.failed("QR-koden kunne ikke følges (" + String(h.statusCode) + ").")
                    return
                }
                for try await line in pair.0.lines {
                    guard let self, g == self.gen else { return }
                    if line.hasPrefix("event:") {
                        name = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                        continue
                    }
                    if line.hasPrefix("data:") {
                        let raw: String = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: Data(raw.utf8))) as? [String: Any]) ?? [:]
                        let st: String = (obj["state"] as? String) ?? (obj["status"] as? String) ?? (obj["type"] as? String) ?? name
                        name = ""
                        self.handle(st, obj)
                    }
                }
            } catch {
                guard let self, g == self.gen else { return }
                if self.state == "pending" || self.state == "scanned" {
                    // Forbindelsen falt: prøv igjen med ny kode.
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    if g == self.gen { self.renew() }
                }
            }
        }
    }

    private func handle(_ st: String, _ o: [String: Any]) {
        switch st {
        case "scanned":
            let u: [String: Any] = (o["user"] as? [String: Any]) ?? [:]
            scannedBy = (u["name"] as? String) ?? (u["username"] as? String) ?? ""
            if let m = o["match"] as? String { match = m } else if let n = o["match"] as? Int { match = String(n) }
            state = "scanned"
        case "approved":
            finish()
        case "denied":
            error = "Innloggingen ble avvist."
            state = "denied"
            sseTask?.cancel()
            tickTask?.cancel()
        case "expired":
            if state == "pending" || state == "scanned" { renew() }
        default:
            break
        }
    }

    /// Godkjent på mobilen: hent økta (eller be om 2FA-koden).
    private func finish() {
        if busy { return }
        busy = true
        let g: Int = gen
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let o: [String: Any] = try await self.post("/api/auth/qr/finish", ["sid": self.sid, "nonce": self.nonce])
                guard g == self.gen else { return }
                self.busy = false
                if (o["needs2fa"] as? Bool) == true || (o["needsTotp"] as? Bool) == true {
                    self.sseTask?.cancel()
                    self.tickTask?.cancel()
                    self.state = "twofa"
                    return
                }
                await self.companion(g)
            } catch let e as KalQR38Error {
                guard g == self.gen else { return }
                self.busy = false
                self.failed(e.message)
            } catch {
                guard g == self.gen else { return }
                self.busy = false
                self.failed(error.localizedDescription)
            }
        }
    }

    /// Totrinnsbekreftelse: 6 sifre fra autentiseringsappen, eller en reservekode.
    func submitCode() {
        let c: String = code.trimmingCharacters(in: .whitespacesAndNewlines)
        if c.count < 6 || busy { return }
        busy = true
        error = ""
        let g: Int = gen
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                _ = try await self.post("/api/auth/2fa", ["code": c, "sid": self.sid])
                guard g == self.gen else { return }
                await self.companion(g)
            } catch let e as KalQR38Error {
                guard g == self.gen else { return }
                self.busy = false
                self.code = ""
                self.error = e.status == 429 ? "For mange feil. Prøv igjen om 15 minutter." : (e.message.isEmpty ? "Feil kode." : e.message)
            } catch {
                guard g == self.gen else { return }
                self.busy = false
                self.error = error.localizedDescription
            }
        }
    }

    /// Med økta: eget app-token for Kalender (Mac) – samme som «Logg inn med Homelab-appen».
    private func companion(_ g: Int) async {
        do {
            let o: [String: Any] = try await post("/api/tokens/companion", ["app": "kalender", "device": companionDevice])
            guard g == gen else { return }
            busy = false
            guard let token = o["token"] as? String, !token.isEmpty else {
                failed("Fikk ikke app-token fra serveren.")
                return
            }
            let u: [String: Any] = (o["user"] as? [String: Any]) ?? [:]
            let name: String = (u["name"] as? String) ?? (u["username"] as? String) ?? scannedBy
            state = "done"
            stop()
            onLogin?(base, token, name)
        } catch let e as KalQR38Error {
            guard g == gen else { return }
            busy = false
            failed(e.message)
        } catch {
            guard g == gen else { return }
            busy = false
            failed(error.localizedDescription)
        }
    }

    /* ---------- Nett ---------- */

    private func post(_ path: String, _ body: [String: Any]) async throws -> [String: Any] {
        guard let url = URL(string: base + path) else { throw KalQR38Error(status: 0, message: "Ugyldig serveradresse.") }
        var r: URLRequest = URLRequest(url: url)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue(device, forHTTPHeaderField: "X-Device-Name")
        r.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        let pair: (Data, URLResponse) = try await session.data(for: r)
        let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: pair.0)) as? [String: Any]) ?? [:]
        if code < 200 || code >= 300 {
            let msg: String = (obj["error"] as? String) ?? ("Feil " + String(code) + " fra serveren.")
            throw KalQR38Error(status: code, message: msg)
        }
        return obj
    }

    /// QR med høy feilretting (plass til Glimt-merket i midten).
    static func qr(_ text: String) -> CGImage? {
        guard let f = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        f.setValue(Data(text.utf8), forKey: "inputMessage")
        f.setValue("H", forKey: "inputCorrectionLevel")
        guard let out = f.outputImage else { return nil }
        let scaled: CIImage = out.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        return CIContext(options: nil).createCGImage(scaled, from: scaled.extent)
    }
}

struct KalQR38Error: Error {
    let status: Int
    let message: String
}

