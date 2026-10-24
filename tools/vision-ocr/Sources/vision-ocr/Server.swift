// Liten HTTP-server på BSD-sokler (ingen eksterne pakker).
// - Binder bare til den gitte LAN-adressen (aldri 0.0.0.0/127.0.0.1).
// - Avsender-IP sjekkes mot tillatelseslista rett etter accept (403), før noe leses.
// - Bearer-nøkkelen sjekkes på konstant tid etter hodet, før kroppen leses (401).
// - Maks kroppsstørrelse, tidsavbrudd på lesing, kø og jobb, og OCR én om gangen.
// - Bildeinnhold og OCR-tekst logges aldri (finansdata), heller ikke nøkkelen.
import Darwin
import Dispatch
import Foundation
import VisionOCRCore

func logLine(_ message: String) {
    let f = ISO8601DateFormatter()
    f.timeZone = TimeZone.current
    f.formatOptions = [.withInternetDateTime]
    FileHandle.standardError.write(Data("\(f.string(from: Date())) \(message)\n".utf8))
}

/// Skriver alle bytene (eller gir opp ved feil/tidsavbrudd).
func sendAll(_ fd: Int32, _ bytes: [UInt8]) {
    bytes.withUnsafeBytes { raw in
        guard let base = raw.baseAddress else { return }
        var off = 0
        while off < raw.count {
            let n = Darwin.write(fd, base + off, raw.count - off)
            if n > 0 {
                off += n
                continue
            }
            if n < 0 && errno == EINTR { continue }
            return
        }
    }
}

/// Avslutter skrivesiden, leser og kaster opptil 1 MB i høyst 1 sekund, og lukker.
func drainAndClose(_ fd: Int32) {
    shutdown(fd, SHUT_WR)
    var tv = timeval(tv_sec: 1, tv_usec: 0)
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    var scratch = [UInt8](repeating: 0, count: 16 * 1024)
    let cap = scratch.count
    var total = 0
    let until = Date().addingTimeInterval(1)
    while total < 1024 * 1024, Date() < until {
        let n = scratch.withUnsafeMutableBytes { raw -> Int in Darwin.read(fd, raw.baseAddress, cap) }
        if n <= 0 { break }
        total += n
    }
    close(fd)
}

/// Teller for /health. Låses med NSLock.
final class Stats: @unchecked Sendable {
    private let lock = NSLock()
    private var queued = 0
    private var busy = false
    private var served = 0
    private var failed = 0

    func enqueue() { lock.lock(); queued += 1; lock.unlock() }
    func dequeue() { lock.lock(); queued -= 1; lock.unlock() }
    func setBusy(_ b: Bool) { lock.lock(); busy = b; lock.unlock() }
    func markServed() { lock.lock(); served += 1; lock.unlock() }
    func markFailed() { lock.lock(); failed += 1; lock.unlock() }

    func snapshot() -> (queued: Int, busy: Bool, served: Int, failed: Int) {
        lock.lock()
        defer { lock.unlock() }
        return (queued, busy, served, failed)
    }
}

/// Alle felt er uforanderlige eller trådsikre (semaforer, Stats med lås).
final class OCRServer: @unchecked Sendable {
    let config: ServiceConfig
    let allow: IPAllowList
    let engine: OcrEngine
    let version: String
    private let ocrLock = DispatchSemaphore(value: 1)
    private let slots: DispatchSemaphore
    private let stats = Stats()
    private let started = Date()
    private let workers = DispatchQueue(label: "vision-ocr.connections", attributes: .concurrent)
    private let rejects = DispatchQueue(label: "vision-ocr.rejects")
    private let rejectSlots = DispatchSemaphore(value: 16)

    init(config: ServiceConfig, allow: IPAllowList, engine: OcrEngine, version: String) {
        self.config = config
        self.allow = allow
        self.engine = engine
        self.version = version
        slots = DispatchSemaphore(value: config.effectiveMaxConnections)
    }

    /// Lytter for alltid. Finnes ikke adressen ennå (nettverket kommer opp etter innlogging),
    /// prøver vi igjen hvert 5. sekund.
    func run() -> Never {
        var listenFD: Int32 = -1
        var attempts = 0
        while listenFD < 0 {
            listenFD = openListener(logErrors: attempts % 12 == 0)
            if listenFD < 0 {
                attempts += 1
                sleep(5)
            }
        }
        logLine("Lytter på http://\(config.bindIP):\(config.port) – tillatt: \(config.allow.joined(separator: ", "))")
        var lastRejectLog: [String: Date] = [:]
        while true {
            var addr = sockaddr_in()
            var len = socklen_t(MemoryLayout<sockaddr_in>.size)
            let fd = withUnsafeMutablePointer(to: &addr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { accept(listenFD, $0, &len) }
            }
            if fd < 0 {
                let e = errno
                if e == EINTR || e == ECONNABORTED { continue }
                logLine("accept feilet: \(String(cString: strerror(e)))")
                usleep(200_000)
                continue
            }
            prepareClient(fd)
            let ip = formatIPv4(UInt32(bigEndian: addr.sin_addr.s_addr))
            if !allow.allows(ip) {
                // Ett loggeinnslag per adresse per minutt.
                let now = Date()
                if lastRejectLog[ip].map({ now.timeIntervalSince($0) > 60 }) ?? true {
                    logLine("\(ip) avvist: ikke på tillatelseslista (403)")
                    lastRejectLog[ip] = now
                    if lastRejectLog.count > 1000 { lastRejectLog.removeAll() }
                }
                sendAll(fd, errorResponse(403, "forbidden"))
                // Lukk pent (les og kast det klienten har sendt, maks 1 s) så den ser 403 og
                // ikke «connection reset». Er det mange avviste på en gang, lukkes de straks.
                if rejectSlots.wait(timeout: .now()) == .success {
                    rejects.async {
                        drainAndClose(fd)
                        self.rejectSlots.signal()
                    }
                } else {
                    close(fd)
                }
                continue
            }
            if slots.wait(timeout: .now()) == .timedOut {
                sendAll(fd, errorResponse(503, "For mange samtidige forespørsler.", extraHeaders: [("Retry-After", "2")]))
                close(fd)
                continue
            }
            workers.async {
                self.handle(fd: fd, ip: ip)
                drainAndClose(fd)
                self.slots.signal()
            }
        }
    }

    private func openListener(logErrors: Bool) -> Int32 {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else {
            if logErrors { logLine("socket() feilet: \(String(cString: strerror(errno)))") }
            return -1
        }
        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(UInt16(config.port)).bigEndian
        guard inet_pton(AF_INET, config.bindIP, &addr.sin_addr) == 1 else {
            logLine("Ugyldig bind_ip \(config.bindIP)")
            close(fd)
            return -1
        }
        let rc = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        if rc != 0 {
            let e = errno
            if logErrors {
                var hint = ""
                if e == EADDRNOTAVAIL { hint = " – Mac-en har ikke adressen \(config.bindIP) (ennå). Sjekk nettverket/UniFi, eller installer med --ip." }
                if e == EADDRINUSE { hint = " – porten \(config.port) er i bruk (kjører tjenesten allerede?)." }
                logLine("Kan ikke lytte på \(config.bindIP):\(config.port): \(String(cString: strerror(e)))\(hint) Prøver igjen hvert 5. sekund.")
            }
            close(fd)
            return -1
        }
        if listen(fd, 32) != 0 {
            if logErrors { logLine("listen() feilet: \(String(cString: strerror(errno)))") }
            close(fd)
            return -1
        }
        return fd
    }

    private func prepareClient(_ fd: Int32) {
        var one: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
        var tv = timeval(tv_sec: 15, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    }

    /// Leser opptil `limit` byte. 0 = lukket, < 0 = feil/tidsavbrudd.
    private func readChunk(_ fd: Int32, _ chunk: inout [UInt8], limit: Int) -> Int {
        let cap = min(chunk.count, limit)
        while true {
            let n = chunk.withUnsafeMutableBytes { raw -> Int in
                Darwin.read(fd, raw.baseAddress, cap)
            }
            if n < 0 && errno == EINTR { continue }
            return n
        }
    }

    private func reply(_ fd: Int32, _ ip: String, _ label: String, _ status: Int, _ bytes: [UInt8],
                       _ started: Date, _ extra: String = "") {
        sendAll(fd, bytes)
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        logLine("\(ip) \(label) \(status) \(ms) ms\(extra.isEmpty ? "" : " – " + extra)")
    }

    private func handle(fd: Int32, ip: String) {
        let started = Date()
        let deadline = started.addingTimeInterval(TimeInterval(config.effectiveTimeout))
        var buf: [UInt8] = []
        var chunk = [UInt8](repeating: 0, count: 64 * 1024)
        var headEnd: Int?
        while headEnd == nil {
            if buf.count > 32 * 1024 {
                reply(fd, ip, "-", 431, errorResponse(431, "For stort forespørselshode."), started)
                return
            }
            let n = readChunk(fd, &chunk, limit: chunk.count)
            if n == 0 { return }
            if n < 0 {
                reply(fd, ip, "-", 408, errorResponse(408, "Tidsavbrudd."), started)
                return
            }
            buf.append(contentsOf: chunk[0..<n])
            headEnd = findHeaderEnd(buf)
            if headEnd == nil, Date() > deadline {
                reply(fd, ip, "-", 408, errorResponse(408, "Tidsavbrudd."), started)
                return
            }
        }
        guard let he = headEnd, let head = parseRequestHead(Array(buf[0..<he])) else {
            reply(fd, ip, "-", 400, errorResponse(400, "Ugyldig forespørsel."), started)
            return
        }
        let label = "\(head.method) \(head.path)"
        // IP er sjekket ved accept. Nøkkelen sjekkes før kroppen leses.
        guard let token = bearerToken(from: head.headers["authorization"]), constantTimeEquals(token, config.key) else {
            reply(fd, ip, label, 401, errorResponse(401, "unauthorized", extraHeaders: [("WWW-Authenticate", "Bearer")]), started)
            return
        }
        switch (head.method, head.path) {
        case ("GET", "/health"):
            reply(fd, ip, label, 200, httpResponse(status: 200, body: healthBody()), started)
        case ("POST", "/ocr"):
            handleOcr(fd: fd, ip: ip, label: label, head: head, initial: Array(buf[he...]), started: started, deadline: deadline)
        case (_, "/health"):
            reply(fd, ip, label, 405, errorResponse(405, "Bruk GET.", extraHeaders: [("Allow", "GET")]), started)
        case (_, "/ocr"):
            reply(fd, ip, label, 405, errorResponse(405, "Bruk POST.", extraHeaders: [("Allow", "POST")]), started)
        default:
            reply(fd, ip, label, 404, errorResponse(404, "Finnes ikke. Bruk POST /ocr eller GET /health."), started)
        }
    }

    private func handleOcr(fd: Int32, ip: String, label: String, head: RequestHead, initial: [UInt8],
                           started: Date, deadline: Date) {
        if head.headers["transfer-encoding"] != nil {
            reply(fd, ip, label, 411, errorResponse(411, "Send Content-Length (chunked støttes ikke)."), started)
            return
        }
        guard let lenText = head.headers["content-length"], let length = Int(lenText), length >= 0 else {
            reply(fd, ip, label, 411, errorResponse(411, "Content-Length mangler."), started)
            return
        }
        let maxMB = config.effectiveMaxBytes / (1024 * 1024)
        if length > config.effectiveMaxBody {
            reply(fd, ip, label, 413, errorResponse(413, "Bildet er for stort (maks \(maxMB) MB)."), started)
            return
        }
        if length == 0 {
            reply(fd, ip, label, 400, errorResponse(400, UploadError.noImage.message), started)
            return
        }
        if head.headers["expect"]?.lowercased() == "100-continue" {
            sendAll(fd, Array("HTTP/1.1 100 Continue\r\n\r\n".utf8))
        }
        var body = initial.count > length ? Array(initial[0..<length]) : initial
        body.reserveCapacity(length)
        var chunk = [UInt8](repeating: 0, count: 256 * 1024)
        while body.count < length {
            if Date() > deadline {
                reply(fd, ip, label, 408, errorResponse(408, "Tidsavbrudd under opplasting."), started)
                return
            }
            let n = readChunk(fd, &chunk, limit: length - body.count)
            if n == 0 {
                logLine("\(ip) \(label) avbrutt: klienten lukket under opplasting")
                return
            }
            if n < 0 {
                reply(fd, ip, label, 408, errorResponse(408, "Tidsavbrudd under opplasting."), started)
                return
            }
            body.append(contentsOf: chunk[0..<n])
        }
        let upload: UploadedImage
        switch extractUpload(contentType: head.headers["content-type"], query: head.query, body: body) {
        case .success(let u):
            upload = u
        case .failure(let e):
            reply(fd, ip, label, e.status, errorResponse(e.status, e.message), started)
            return
        }
        body = []
        if upload.data.count > config.effectiveMaxBytes {
            reply(fd, ip, label, 413, errorResponse(413, "Bildet er for stort (maks \(maxMB) MB)."), started)
            return
        }

        // Kø: én OCR-jobb om gangen.
        stats.enqueue()
        let waited = ocrLock.wait(timeout: .now() + .seconds(config.effectiveTimeout))
        stats.dequeue()
        guard waited == .success else {
            reply(fd, ip, label, 503, errorResponse(503, "Tjenesten er opptatt – prøv igjen.", extraHeaders: [("Retry-After", "5")]), started)
            return
        }
        stats.setBusy(true)
        let jobDeadline = Date().addingTimeInterval(TimeInterval(config.effectiveTimeout))
        let outcome: Result<EngineOutput, OcrError>
        do {
            outcome = .success(try engine.run(data: upload.data, crop: upload.crop, deadline: jobDeadline))
        } catch let e as OcrError {
            outcome = .failure(e)
        } catch {
            outcome = .failure(.vision(error.localizedDescription))
        }
        stats.setBusy(false)
        ocrLock.signal()

        switch outcome {
        case .success(let out):
            stats.markServed()
            let headers = [
                ("X-OCR-Languages", engine.choice.languages.joined(separator: ",")),
                ("X-OCR-Cropped", out.cropped ? "1" : "0"),
                ("X-OCR-Bands", "\(out.bands)"),
            ]
            let extra = "\(upload.data.count / 1024) kB, \(out.result.lines.count) linjer, \(out.bands) bånd, "
                + "beskåret: \(out.cropped ? "ja" : "nei"), OCR \(out.result.ms) ms"
            reply(fd, ip, label, 200, httpResponse(status: 200, body: encodeResult(out.result), extraHeaders: headers), started, extra)
        case .failure(let e):
            stats.markFailed()
            reply(fd, ip, label, e.status, errorResponse(e.status, e.message), started, "\(upload.data.count / 1024) kB")
        }
    }

    private func healthBody() -> [UInt8] {
        let s = stats.snapshot()
        let os = ProcessInfo.processInfo.operatingSystemVersion
        let obj: [String: Any] = [
            "ok": true,
            "service": "vision-ocr",
            "version": version,
            "source": ocrSource,
            "languages": engine.choice.languages,
            "norwegian": engine.choice.norwegian,
            "language_note": engine.choice.note,
            "language_correction": engine.languageCorrection,
            "supported_languages": engine.supported,
            "busy": s.busy,
            "queued": s.queued,
            "served": s.served,
            "failed": s.failed,
            "uptime_s": Int(Date().timeIntervalSince(started)),
            "max_bytes": config.effectiveMaxBytes,
            "timeout_s": config.effectiveTimeout,
            "macos": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)",
        ]
        return jsonBytes(obj)
    }
}
