import SwiftUI

/* ---------------- Prompt 25: AI-søk i Finans som jobb (claude-code-ai-timeout.md) ----------------
   Klienten har ingen fast 30 s-grense lenger. Tidsgrensen leses fra GET /finans/api/ai/limits (clientTimeoutS,
   standard 180 s). Søket sendes med ?async=1 og «Prefer: respond-async». Svarer serveren med {jobId}, følger
   appen jobben (GET /finans/api/jobs/:id hvert sekund) og viser «✦ Ollama tenker … 34 s av 60 s» med
   fremdriftslinje og Avbryt (DELETE /finans/api/jobs/:id). Eldre servere svarer direkte som før, og 404 på
   jobb-endepunktet gir et vanlig synkront kall. */

/// Fremdriften til en AI-jobb.
struct AiJob25: Equatable {
    var text: String
    var elapsed: Double
    var limit: Double
    var engine: String
}

extension Store {
    /// Tidsgrensen for AI-kall fra serveren (clientTimeoutS). 404 eller feil: 180 s.
    func loadAiLimits25() async {
        if aiLimitsLoaded25 { return }
        do {
            let d: Data = try await api.call("GET", "/ai/limits")
            let o: [String: Any] = JS.obj(d)
            if let s = JS.num(o, "clientTimeoutS"), s >= 10 { aiClientTimeout25 = Swift.min(s, 1800) }
            aiLimitsLoaded25 = true
        } catch let e as APIError where e.status == 404 {
            aiLimitsLoaded25 = true
        } catch {
            // Nettfeil: prøv igjen ved neste søk.
        }
    }

    /// POST /search/ai i jobbmodus. Gir rådata i samme form som det gamle synkrone svaret.
    func aiSearch25(_ body: [String: Any]) async throws -> Data {
        await loadAiLimits25()
        let limit: TimeInterval = aiClientTimeout25
        let first: Data
        do {
            first = try await api.callAt("/finans/api", "POST", "/search/ai?async=1", json: body, timeout: limit)
        } catch let e as APIError where e.status == 404 {
            return try await api.callAt("/finans/api", "POST", "/search/ai", json: body, timeout: limit)
        }
        let o: [String: Any] = JS.obj(first)
        guard let id = AiJob25.jobId(o) else { return first }
        aiJobId25 = id
        aiJob25 = AiJob25(text: JS.str(o, "text") ?? "✦ AI tenker …", elapsed: 0, limit: JS.num(o, "limitS") ?? 0, engine: JS.str(o, "engine") ?? "")
        defer { aiJobId25 = nil; aiJob25 = nil }
        let started: Date = Date()
        while true {
            try await Task.sleep(for: .seconds(1))
            try Task.checkCancellation()
            let d: Data
            do {
                d = try await api.call("GET", "/jobs/\(id)")
            } catch let e as APIError where e.status == 404 {
                // Serveren kjenner ikke jobb-endepunktet: vanlig synkront kall.
                return try await api.callAt("/finans/api", "POST", "/search/ai", json: body, timeout: limit)
            }
            let j: [String: Any] = JS.obj(d)
            let status: String = JS.str(j, "status") ?? "running"
            switch status {
            case "done":
                if let r = j["result"], JSONSerialization.isValidJSONObject(r) {
                    return try JSONSerialization.data(withJSONObject: r)
                }
                return d
            case "error":
                throw APIError(message: JS.str(j, "error") ?? JS.str(j, "text") ?? "AI-søket feilet.", status: 0)
            case "cancelled":
                throw CancellationError()
            default:
                let el: Double = JS.num(j, "elapsedS") ?? Date().timeIntervalSince(started)
                let lim: Double = JS.num(j, "limitS") ?? (aiJob25?.limit ?? 0)
                let eng: String = JS.str(j, "engine") ?? (aiJob25?.engine ?? "")
                let txt: String = JS.str(j, "text") ?? AiJob25.label(eng, el, lim)
                aiJob25 = AiJob25(text: txt, elapsed: el, limit: lim, engine: eng)
            }
            if Date().timeIntervalSince(started) > limit + 15 {
                throw APIError(message: "AI-søket svarte ikke innen \(Int(limit)) s", status: 0)
            }
        }
    }

    /// Avbryt: stopper jobben på serveren og kallet i appen.
    func cancelAiSearch25() {
        Haptics.shared.tap()
        aiCancelled25 = true
        if let id = aiJobId25 {
            Task { _ = try? await self.api.call("DELETE", "/jobs/\(id)") }
        }
        aiTask25?.cancel()
    }
}

extension AiJob25 {
    static func jobId(_ o: [String: Any]) -> String? {
        if o["hits"] != nil || o["answer"] != nil { return nil }
        return JS.str(o, "jobId") ?? JS.str(o, "job_id")
    }

    /// «✦ Ollama tenker … 34 s av 60 s» når serveren ikke sender teksten selv.
    static func label(_ engine: String, _ elapsed: Double, _ limit: Double) -> String {
        let name: String = engine.isEmpty ? "AI" : engine
        let el: Int = Int(elapsed.rounded())
        if limit > 0 { return "✦ \(name) tenker … \(el) s av \(Int(limit.rounded())) s" }
        return "✦ \(name) tenker … \(el) s"
    }

    var fraction: Double {
        guard limit > 0 else { return 0 }
        return Swift.min(1, Swift.max(0, elapsed / limit))
    }
}

/// Fremdriften mens AI-søket går: tekst, linje og Avbryt (Papir-farger).
struct AiJobProgress25: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let job: AiJob25? = store.aiJob25
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if job == nil { ProgressView() }
                Text(job?.text ?? "✦ Søker …").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 6)
                Button { store.cancelAiSearch25() } label: {
                    Text("Avbryt").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 14).frame(height: 34)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Avbryt AI-søket")
            }
            if let job, job.limit > 0 {
                AiJobBar25(fraction: job.fraction, fill: p.lab, track: p.line)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .animation(.easeOut(duration: 0.3), value: job)
    }
}

/// Tynn fremdriftslinje (6 pt).
struct AiJobBar25: View {
    let fraction: Double
    let fill: Color
    let track: Color

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(fill).frame(width: Swift.max(6, g.size.width * CGFloat(fraction)))
            }
        }
        .frame(height: 6)
    }
}

/// Samme fremdrift i den klassiske appen (glass og aksentfarge).
struct AiJobProgressClassic25: View {
    @Environment(Store.self) private var store

    var body: some View {
        let job: AiJob25? = store.aiJob25
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if job == nil { ProgressView() }
                Text(job?.text ?? "✦ Søker …").font(.subheadline.weight(.semibold))
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 6)
                Button { store.cancelAiSearch25() } label: {
                    Text("Avbryt").font(.subheadline.weight(.bold)).padding(.horizontal, 14).frame(height: 34)
                        .overlay(Capsule().stroke(Color.skinFg.opacity(0.3), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Avbryt AI-søket")
            }
            if let job, job.limit > 0 {
                AiJobBar25(fraction: job.fraction, fill: Color.accentLight, track: Color.skinFg.opacity(0.15))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(20)
    }
}
