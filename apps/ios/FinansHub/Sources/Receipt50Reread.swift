import SwiftUI
import os

/* ---------------- Prompt 50: «Glimt leser kvitteringen på nytt» uten 502, og lesbare feil ----------------
 claude-code-kvittering-les-pa-nytt-502.md (iOS-delen) og claude-code-finans-kvittering-fargefeil.md (iOS-delen).
 Rotårsak i appen: «Les på nytt» (Fin40) og «✦ Analyser på nytt med Gemini» kalte POST /finans/api/receipts/:id/reanalyze
 med async:false og ventet opptil 120 s på ett åpent HTTP-kall. Full oppløsning + Gemini tar ofte lenger enn proxyens
 tidsgrense, så proxyen svarte 502 (og serveren selv svarer 502 når modellen feiler). Appen viste da «Feil 502».
 Nå: jobb (async:true, apply:false) → 202 {jobId} med en gang, så GET /finans/api/receipts/reanalyze/:jobId hvert 1,5 s.
 Ingen forespørsel holdes åpen mer enn noen sekunder. Eldre server som svarer synkront ({candidateId}) virker som før.
 «Les mindre versjon» sender small:true og maxSide:1024 (serveren nedskalerer; ukjente felt ignoreres av eldre servere).
 Feilmeldinger (Receipt50Err): 502/504/tidsavbrudd · 503 modell_utilgjengelig · 404 bilde mangler · annet «kode X». */

enum Receipt50Err {
    static let log: Logger = Logger(subsystem: "no.kristo.finanshub", category: "receipt50")

    /// Melding brukeren kan handle på, og om «Les mindre versjon» skal tilbys.
    nonisolated static func text(status: Int, code: String?, message: String) -> (text: String, small: Bool) {
        let c: String = (code ?? "").lowercased()
        let m: String = message.lowercased()
        if c == "modell_utilgjengelig" || c == "model_unavailable" || c == "ollama_down" || status == 503 {
            return ("Glimt er ikke tilgjengelig akkurat nå. Prøv igjen om litt.", false)
        }
        if status == 404 || c == "bilde_mangler" || c == "original_mangler" || c == "missing_original" || m.contains("originalbildet") {
            return ("Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt.", false)
        }
        if status == 502 || status == 504 || c == "timeout" || c == "tidsavbrudd" || m.contains("svarte ikke") || m.contains("tidsavbrudd") || m.contains("for lang tid") {
            return ("Glimt brukte for lang tid på bildet. Prøv igjen, eller les en mindre versjon.", true)
        }
        // Tydelige meldinger fra serveren (f.eks. «Legg inn en Gemini-nøkkel …», «Kvitteringen leses fortsatt»).
        if [400, 409, 422].contains(status) && !message.isEmpty && !message.hasPrefix("Feil ") { return (message, false) }
        let k: String = status > 0 ? String(status) : (c.isEmpty ? "ukjent" : c)
        return ("Noe gikk galt (kode \(k)).", false)
    }

    /// Fra en feil som kastes av API-et eller jobben. Full feil logges (ikke vist).
    static func text(_ error: Error) -> (text: String, small: Bool) {
        if let e = error as? APIError {
            log.error("reread failed status=\(e.status, privacy: .public) code=\(e.code ?? "-", privacy: .public) msg=\(e.message, privacy: .public)")
            return text(status: e.status, code: e.code, message: e.message)
        }
        log.error("reread failed \(error.localizedDescription, privacy: .public)")
        return text(status: 0, code: nil, message: error.localizedDescription)
    }

    /// Feil i en ferdig jobb: status og kode hvis serveren sender dem, ellers ut fra teksten.
    nonisolated static func jobError(_ o: [String: Any]) -> APIError {
        let msg: String = JS.str(o, "error") ?? JS.str(o, "msg") ?? JS.str(o, "text") ?? ""
        let code: String? = JS.str(o, "code") ?? JS.str(o, "kode")
        var st: Int = JS.int(o, "httpStatus") ?? JS.int(o, "statusCode") ?? 0
        if st == 0 {
            let m: String = msg.lowercased()
            if m.contains("originalbildet") { st = 404 } else if m.contains("kunne ikke lese") || m.contains("svarte ikke") { st = 502 }
        }
        return APIError(message: msg.isEmpty ? "Jobben feilet" : msg, status: st, code: code)
    }
}

extension Store {
    /// Prompt 50: les kvitteringen på nytt som jobb (ingen lange HTTP-kall). Gir begge resultatene til sammenligningen.
    func reanalyze50(_ id: String, engine: String = "ollama", small: Bool = false) async throws -> ReanalyzeResult {
        var body: [String: Any] = ["engine": engine, "async": true, "apply": false]
        if small { body["small"] = true; body["maxSide"] = 1024 }
        let d: Data = try await api.callAt("/finans/api", "POST", "/receipts/\(id)/reanalyze", json: body, timeout: 30)
        let o: [String: Any] = JS.obj(d)
        if let e = JS.str(o, "error") { throw APIError(message: e, status: 0, code: JS.str(o, "code") ?? JS.str(o, "kode")) }
        if JS.str(o, "candidateId") != nil { return Store.reanalyzeParse50(id, o) }
        guard let jid = JS.str(o, "jobId") ?? JS.str(o, "id"), !jid.isEmpty else {
            throw APIError(message: "Uventet svar fra serveren", status: 0)
        }
        return try await pollReanalyze50(id, jid)
    }

    private func pollReanalyze50(_ id: String, _ jid: String) async throws -> ReanalyzeResult {
        let start: Date = Date()
        var misses: Int = 0
        while Date().timeIntervalSince(start) < 8 * 60 {
            try await Task.sleep(nanoseconds: 1_500_000_000)
            let enc: String = jid.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? jid
            let o: [String: Any]
            do {
                o = JS.obj(try await api.callAt("/finans/api", "GET", "/receipts/reanalyze/\(enc)", timeout: 15))
                misses = 0
            } catch let e as APIError where e.status == 404 && misses == 0 {
                // Eldre server uten den egne ruten: den generelle jobbruten.
                misses += 1
                guard let x = try? await api.callAt("/finans/api", "GET", "/jobs/\(enc)", timeout: 15) else { continue }
                o = JS.obj(x)
            } catch {
                misses += 1
                if misses >= 4 { throw error }
                continue
            }
            switch JS.str(o, "status") ?? "" {
            case "done":
                return Store.reanalyzeParse50(id, JS.dict(o, "result") ?? [:])
            case "error":
                throw Receipt50Err.jobError(o)
            case "cancelled":
                throw APIError(message: "Avbrutt · ingenting ble endret", status: 409)
            default:
                continue
            }
        }
        throw APIError(message: "Glimt brukte for lang tid", status: 504, code: "timeout")
    }

    nonisolated static func reanalyzeParse50(_ id: String, _ o: [String: Any]) -> ReanalyzeResult {
        ReanalyzeResult(receiptId: id, candidateId: JS.str(o, "candidateId") ?? "",
                        previous: ReadResult(JS.dict(o, "previous")), result: ReadResult(JS.dict(o, "result")))
    }
}

/* ---------- «Lav sikkerhet»-boksen på Bekreft kvittering (fargefeil) ---------- */

/// Temafarger for boksen: sand/mørk flate, tydelig kant og ink-2-tekst (≥ 4,5:1). Ingen hardkodede blåtoner.
enum Receipt50Look {
    /// Primærknappen («✦ Analyser på nytt med Gemini») – blå med hvit tekst, som «Prøv igjen».
    static let acc: Color = Color(hex: "#4f63ff")

    static func surface2(_ p: PaperPalette) -> Color { p.dark ? Color.white.opacity(0.06) : Color(hex: "#efeadf") }
    static func line(_ p: PaperPalette) -> Color { p.dark ? p.line : Color(hex: "#ddd6c8") }
    static func ink2(_ p: PaperPalette) -> Color { p.dark ? Color(hex: "#c9c3b6") : Color(hex: "#5f5a50") }
}

/// Teksten øverst, knappene på én rad under (Gemini først).
struct Receipt50LowBox: View {
    @Environment(Store.self) private var store
    let r: Receipt

    var body: some View {
        let p: PaperPalette = PaperSkin.palette ?? PaperPalette.light
        VStack(alignment: .leading, spacing: 10) {
            Text(text).font(PF.ui(13.5)).foregroundStyle(Receipt50Look.ink2(p)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                ReanalyzeButton(receiptId: r.id, compact: true, primary50: true, disabledWhy: store.canReanalyze(r) ? nil : (r.reanalyzeReason ?? "Kan ikke leses på nytt akkurat nå"))
                if (r.mime ?? "") != "text/plain" {
                    ReanalyzeButton(receiptId: r.id, compact: true, engine50: "tesseract")
                }
            }
            if !store.canReanalyze(r), let why = r.reanalyzeReason {
                Text(why).font(PF.ui(12)).foregroundStyle(Receipt50Look.ink2(p)).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Receipt50Look.surface2(p), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Receipt50Look.line(p), lineWidth: 1))
    }

    private var text: String {
        let by: String = r.provider ?? r.engine ?? "lesingen"
        let pct: String = r.confidence.map { c in " (\(Int(((c <= 1 ? c * 100 : c)).rounded())) %)" } ?? ""
        let flag: String = r.flag ?? r.error ?? ""
        return "Lav sikkerhet fra \(by)\(pct)." + (flag.isEmpty ? "" : " " + flag)
    }
}
