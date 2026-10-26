import Foundation

/* ---------------- Prompt 67 (prompt 49 del 4): Glimt strømmer svaret i appen (SERVER59-API.md) ----------------
 POST /api/glimt/agent/stream (samme body som POST /api/glimt/agent) → text/event-stream:
   start {requestId, stream} · status {stage, text, tool?} · token {t, source} · done (hele svaret) · error {error, status}.
 Kommentarlinjer («: ping») ignoreres. done.reply er fasit: den strømmede teksten byttes ut med den.
 Stopp: oppgaven avbrytes (URLSession lukker forbindelsen, serveren avbryter modellkallet) og POST /stream/stop {requestId}.
 Reserve: 404/405 (eldre server) → nil, så kalleren bruker POST /api/glimt/agent eller /api/assist som før (10 min).
 Leses med URLSession.bytes(for:) i en nonisolated hjelper; status og tekst går til MainActor i rekkefølge (await). */

/// Feil fra strømmen. status 499 = Stoppet. partial = teksten som var kommet.
struct Stream67Error: LocalizedError, Sendable {
    let message: String
    let status: Int
    var partial: String = ""
    var stopped: Bool { status == 499 }
    var errorDescription: String? { message }
}

/// Hele svaret (done) som JSON, om token-hendelser kom, og requestId.
struct Stream67Done: Sendable {
    let data: Data
    let streamed: Bool
    let requestId: String
}

/// Har serveren strømmingen? false i 10 min etter 404/405 (som stream59.js på web).
@MainActor
enum Stream67Gate {
    static var offUntil: Date = .distantPast
    static var on: Bool { Date() >= offUntil }
    static func off() { offUntil = Date().addingTimeInterval(600) }
}

enum Stream67 {
    nonisolated static func rid() -> String { "ios67-" + UUID().uuidString.lowercased() }

    /// Teksten så langt uten halv markdown: en uavsluttet «**» tas bort til den lukkes.
    nonisolated static func tidy(_ s: String) -> String {
        let parts: [String] = s.components(separatedBy: "**")
        if (parts.count - 1) % 2 == 0 {
            if s.hasSuffix("*") && !s.hasSuffix("**") { return String(s.dropLast()) }
            return s
        }
        guard let r = s.range(of: "**", options: .backwards) else { return s }
        var out: String = s
        out.removeSubrange(r)
        return out
    }

    /// Forespørsel mot Homelab-serveren med appens innlogging (samme som API.send).
    nonisolated static func request(_ api: API, _ path: String, body: Data, sse: Bool, timeout: TimeInterval) -> URLRequest? {
        guard let url = URL(string: api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api" + path) else { return nil }
        var r = URLRequest(url: url)
        r.httpMethod = "POST"
        r.timeoutInterval = timeout
        r.cachePolicy = .reloadIgnoringLocalCacheData
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue(sse ? "text/event-stream" : "application/json", forHTTPHeaderField: "Accept")
        if let tok = api.token { r.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization") }
        r.setValue(Device51.key, forHTTPHeaderField: "X-Device-Key")
        r.httpBody = body
        return r
    }

    /// Spør Glimt med strømming. nil = serveren har ikke /stream (bruk de gamle kallene). Kaster Stream67Error.
    nonisolated static func run(_ api: API, body: Data,
                                onStatus: @escaping @MainActor @Sendable (String) -> Void,
                                onToken: @escaping @MainActor @Sendable (String) -> Void) async throws -> Stream67Done? {
        let rid: String = ((try? JSONSerialization.jsonObject(with: body)) as? [String: Any]).flatMap { $0["requestId"] as? String } ?? ""
        guard let req = request(api, "/glimt/agent/stream", body: body, sse: true, timeout: 90) else { return nil }
        let bytes: URLSession.AsyncBytes
        let res: URLResponse
        do {
            (bytes, res) = try await URLSession.shared.bytes(for: req)
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw Stream67Error(message: "Stoppet", status: 499) }
            throw Stream67Error(message: "Fikk ikke kontakt med Glimt: " + error.localizedDescription, status: 0)
        }
        let http: HTTPURLResponse? = res as? HTTPURLResponse
        let code: Int = http?.statusCode ?? 0
        if code == 404 || code == 405 { return nil }
        let ct: String = (http?.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
        if code >= 400 || !ct.contains("text/event-stream") {
            let data: Data = await collect(bytes)
            let o: [String: Any] = JS.obj(data)
            if code >= 400 {
                let msg: String = JS.str(o, "error") ?? (code == 429 ? "Glimt jobber med mye nå. Prøv igjen om litt." : "Glimt svarte ikke (feil \(code)).")
                throw Stream67Error(message: msg, status: code)
            }
            // Uventet vanlig JSON (f.eks. en proxy): bruk den som svaret.
            return o.isEmpty ? nil : Stream67Done(data: data, streamed: false, requestId: rid)
        }
        var ev: String = "message"
        var txt: String = ""
        var streamed: Bool = false
        var done: Data? = nil
        var err: Stream67Error? = nil
        do {
            for try await line in bytes.lines {
                if line.hasPrefix(":") { continue }
                if line.hasPrefix("event:") {
                    ev = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                    continue
                }
                guard line.hasPrefix("data:") else { continue }
                let d: Data = Data(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces).utf8)
                let o: [String: Any] = JS.obj(d)
                switch ev {
                case "status":
                    if let t = JS.str(o, "text"), !t.isEmpty { await onStatus(t) }
                case "token":
                    if let t = o["t"] as? String, !t.isEmpty {
                        txt += t
                        streamed = true
                        await onToken(tidy(txt))
                    }
                case "done":
                    done = d
                case "error":
                    err = Stream67Error(message: JS.str(o, "error") ?? "Glimt fikk ikke gjort det akkurat nå. Prøv igjen.", status: JS.int(o, "status") ?? 502)
                default:
                    break
                }
                ev = "message"
            }
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled || error is CancellationError {
                throw Stream67Error(message: "Stoppet", status: 499, partial: tidy(txt))
            }
            throw Stream67Error(message: "Glimt ble avbrutt før svaret var ferdig. Prøv igjen.", status: 0, partial: tidy(txt))
        }
        if Task.isCancelled { throw Stream67Error(message: "Stoppet", status: 499, partial: tidy(txt)) }
        if let done { return Stream67Done(data: done, streamed: streamed, requestId: rid) }
        if var err {
            err.partial = tidy(txt)
            throw err
        }
        throw Stream67Error(message: "Glimt ble avbrutt før svaret var ferdig. Prøv igjen.", status: 0, partial: tidy(txt))
    }

    nonisolated private static func collect(_ bytes: URLSession.AsyncBytes) async -> Data {
        var data = Data()
        do {
            for try await x in bytes {
                data.append(x)
                if data.count > 100_000 { break }
            }
        } catch {
            return data
        }
        return data
    }

    /// Stopp på serveren også (alternativet for apper i SERVER59-API.md). Feil ignoreres.
    nonisolated static func stop(_ api: API, requestId: String) async {
        guard !requestId.isEmpty, let body = try? JSONSerialization.data(withJSONObject: ["requestId": requestId]),
              let req = request(api, "/glimt/agent/stream/stop", body: body, sse: false, timeout: 10) else { return }
        _ = try? await URLSession.shared.data(for: req)
    }

    /// Body-en som JSON (Data er Sendable og kan gå til den nonisolated leseren).
    nonisolated static func data(_ body: [String: Any]) -> Data {
        (try? JSONSerialization.data(withJSONObject: body)) ?? Data("{}".utf8)
    }
}
