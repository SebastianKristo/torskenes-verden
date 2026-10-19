import SwiftUI
import UIKit

/* ---------------- Prompt 34: AI-kontroll (mobil) – data ----------------
   Fasit: design/AI Kontroll.dc.html (variant mobile, scope alle|chat|finans) og prompts/prompt-34-pakke/claude-code-ai-kontroll.md
   + claude-code-glimt-virker-ikke.md (selvtest, tre statuser, ugyldige ruter).
   Åpnes fra Innstillinger → APP → «AI og modeller» (Oversikt), Finans → «AI og tolkning» (scope finans), Chat → Modeller
   (fanen Modeller) og Samtaleinnstillinger → «Full AI-kontroll ›» (fanen Valg). Fullskjerm med Ferdig-pillen.

   Serveren (SERVER34) eier dataene og deler dem med web: /api/ai/status, /models (+ pull SSE, load/unload, DELETE),
   /library?q=, /routing (GET/PUT), /jobs (+ cancel/retry, queue/pause), /usage?days=, /keys (PUT, test), /tokens (POST/DELETE),
   /selftest (SSE). Lesingen er tolerant (flere navn per felt). Bare admin endrer nøkler, modeller og serveroppsett; alle ser status. */

struct AiProv34: Identifiable, Hashable {
    var id: String
    var name: String
    /// ok | warn | off
    var state: String
    var detail: String
    var ms: Int
}

struct AiModel34: Identifiable, Hashable {
    var id: String
    var desc: String = ""
    var gb: Double = 0
    var quant: String = ""
    var ctx: String = ""
    /// tekst | bilde | resonnering | embedding
    var kind: String = "tekst"
    var loaded: Bool = false
    var last: String = ""
}

struct AiPull34: Identifiable, Hashable {
    var id: String
    var pct: Double
    var gotGb: Double
    var totGb: Double
    var mbs: Double
}

struct AiLib34: Identifiable, Hashable {
    var id: String
    var desc: String
    var gb: Double
    var kind: String

    var line: String {
        if gb <= 0 { return desc }
        let size: String = AiCtl34.gb(gb)
        return desc + " · " + size
    }
}

struct AiCloud34: Identifiable, Hashable {
    var id: String
    var provider: String
    var desc: String
    var on: Bool
}

struct AiRoute34: Identifiable, Hashable {
    var id: String
    var name: String
    var sub: String
    var model: String
    var fallback: String
    var fin: Bool
    /// Advarsel fra serveren («Modellen finnes ikke · bytt»).
    var warning: String = ""
}

struct AiJob34: Identifiable, Hashable {
    var id: String
    var title: String
    var model: String
    /// run | queue | done | fail
    var st: String
    var pct: Double
    var meta: String
    var err: String
    var fin: Bool
}

struct AiFeat34: Identifiable, Hashable {
    var id: String { name }
    var name: String
    var cost: Double
    var tokens: Double
    var sub: String

    /// «qwen2.5vl · 63 stk · 38 k tok»
    var line: String {
        let tok: String = AiCtl34.tk(tokens) + " tok"
        return sub.isEmpty ? tok : sub + " · " + tok
    }
}

struct AiDay34: Identifiable, Hashable {
    var id: Int
    var local: Double
    var cloud: Double
}

struct AiKey34: Identifiable, Hashable {
    var id: String
    var name: String
    var set: Bool
    var tail: String
    var url: String
    var meta: String
    var link: String
}

struct AiToken34: Identifiable, Hashable {
    var id: String
    var name: String
    var sub: String
}

struct AiTest34: Identifiable, Hashable {
    var id: String
    var name: String
    var model: String
    /// wait | busy | ok | fail
    var st: String
    var text: String
    var fix: String
}

@MainActor
@Observable
final class AiCtl34 {
    static let shared = AiCtl34()

    var open: Bool = false
    /// alle | chat | finans
    var scope: String = "alle"
    var tab: String = "ov"
    var notice: String = ""
    var toast: String = ""
    var busy: Bool = false

    var providers: [AiProv34] = []
    var gpu: String = ""
    var vramUsed: Double = 0
    var vramTotal: Double = 0
    var diskUsed: Double = 0
    var diskTotal: Double = 0
    var running: Int = 0
    var queued: Int = 0
    var failed: Int = 0
    var tokens30: Double = 0
    var localShare: Int = 0
    var cost30: Double = 0

    var installed: [AiModel34] = []
    var pulls: [AiPull34] = []
    var cloud: [AiCloud34] = []
    var library: [AiLib34] = []
    var libQuery: String = ""
    var libCat: String = "alle"
    var defaultChat: String = ""

    var routes: [AiRoute34] = []
    var rules: [String: Bool] = ["localFirst": true, "finLocal": false, "think": false, "autoCat": true]
    var keep: String = "30m"
    var ctx: Int = 32768
    var temp: Double = 0.7
    var parallel: Int = 2
    var minConf: Int = 85

    var jobs: [AiJob34] = []
    var paused: Bool = false

    var usageDays: Int = 30
    var tokIn: Double = 0
    var tokOut: Double = 0
    var costPeriod: Double = 0
    var avgMs: Double = 0
    var days: [AiDay34] = []
    var feats: [AiFeat34] = []
    var budget: Double = 200
    var budgetHard: Bool = true
    var budgetWarn: Bool = true

    var keys: [AiKey34] = []
    var tokensList: [AiToken34] = []
    var freshToken: String = ""
    var testing: [String: String] = [:]

    var tests: [AiTest34] = []
    var testRunning: Bool = false
    var testDone: Bool = false

    @ObservationIgnored private var poll: Task<Void, Never>? = nil
    @ObservationIgnored private var pullTasks: [String: Task<Void, Never>] = [:]

    var fin: Bool { scope == "finans" }

    /// Faner: Oversikt · Modeller · Valg · Jobber · Forbruk · API og nøkler (finans: AI-valg · Tilkoblinger · Jobber · Forbruk).
    var tabs: [(String, String)] {
        if fin { return [("rt", "AI-valg"), ("api", "Tilkoblinger"), ("job", "Jobber"), ("use", "Forbruk")] }
        return [("ov", "Oversikt"), ("mod", "Modeller"), ("rt", "Valg"), ("job", "Jobber"), ("use", "Forbruk"), ("api", "API og nøkler")]
    }

    /// Oppgavene (id, navn, beskrivelse, standard, reserve, finans) når serveren ikke sender egne navn.
    static let tasks: [(String, String, String, String, String, Bool)] = [
        ("chat", "Chat", "Standardmodell i nye samtaler", "", "", false),
        ("sok", "AI-søk", "Søkefeltet og spørsmål i hele appen", "", "", false),
        ("glimt", "Glimt · kalender", "Forstå hendelser og svare om kalenderen", "", "", false),
        ("brief", "Glimt · brief", "Morgen-, dags- og kveldsbrief", "", "", false),
        // Prompt 38: standardene for Finans (claude-code-ai-kontroll-modellvalg-fiks.md).
        ("rc", "Kvitteringer (bilde)", "Leser butikk, beløp og varelinjer", "qwen2.5vl:7b", "gemini-2.5-flash", true),
        ("kat", "Kategorisering", "Foreslår kategori for transaksjoner", "llama3.2:3b", "llama-3.3-70b-versatile", true),
        ("fsok", "Finans · spør", "«Har jeg et musikkabonnement?»", "gemma4:latest", "gemini-2.5-flash", true),
        ("bar", "Strekkoder og pakkelapper", "Bildefelt fra kamera", "roboflow/kvittering/1", "qwen2.5vl:7b", true),
        ("dom", "Domener · oppsummering", "Daglig sammendrag kl. 06:00", "", "", false),
        ("kb", "Kunnskapsbase", "Embeddings for dokumenter", "", "", false),
    ]

    static let fixedLibrary: [AiLib34] = [
        AiLib34(id: "qwen3:8b", desc: "Alibaba Qwen 3 · rask, resonnering og verktøy", gb: 5.2, kind: "tekst"),
        AiLib34(id: "qwen3:14b", desc: "Alibaba Qwen 3 · resonnering og verktøy", gb: 9.3, kind: "tekst"),
        AiLib34(id: "qwen2.5vl:7b", desc: "Qwen 2.5 VL · leser kvitteringer og bilder", gb: 6.0, kind: "bilde"),
        AiLib34(id: "gemma3:12b", desc: "Google Gemma 3 · god norsk", gb: 8.1, kind: "tekst"),
        AiLib34(id: "llama3.2:3b", desc: "Meta Llama 3.2 · liten og rask", gb: 2.0, kind: "tekst"),
        AiLib34(id: "mistral-small3.2", desc: "Mistral Small 3.2 · rask med verktøy", gb: 15, kind: "tekst"),
        AiLib34(id: "minicpm-v", desc: "MiniCPM-V · bilde på lite minne", gb: 5.5, kind: "bilde"),
        AiLib34(id: "deepseek-r1:8b", desc: "DeepSeek R1 · tenker før den svarer", gb: 5.2, kind: "resonnering"),
        AiLib34(id: "bge-m3", desc: "BGE-M3 · flerspråklige embeddings", gb: 1.2, kind: "embedding"),
        AiLib34(id: "nomic-embed-text", desc: "Nomic · embeddings for kunnskapsbasen", gb: 0.27, kind: "embedding"),
    ]

    /* ---------- Åpne og lukke ---------- */

    func show(_ tab: String, scope: String = "alle") {
        Haptic34.light()
        self.scope = scope
        self.tab = tab
        open = true
    }

    func close() {
        Haptic34.back()
        open = false
        poll?.cancel()
        poll = nil
    }

    func pick(_ t: String) {
        Haptic34.light()
        tab = t
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    /// Henter alt og oppdaterer jobber, nedlastinger og status hvert 3. sekund mens panelet er åpent.
    func start(_ store: Store) {
        poll?.cancel()
        poll = Task { @MainActor in
            await self.loadAll(store)
            while !Task.isCancelled && self.open {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if Task.isCancelled || !self.open { break }
                await self.loadJobs(store)
                if self.tab == "ov" { await self.loadStatus(store) }
                if self.tab == "mod" && self.pulls.isEmpty == false { await self.loadModels(store) }
            }
        }
    }

    func loadAll(_ store: Store) async {
        busy = true
        await loadStatus(store)
        await loadModels(store)
        await loadRouting(store)
        await loadJobs(store)
        await loadUsage(store)
        await loadKeys(store)
        busy = false
    }

    private func get(_ path: String, _ store: Store) async -> [String: Any]? {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/ai" + path, timeout: 15)
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            if let o = any as? [String: Any] { return o }
            if let l = any as? [Any] { return ["items": l] }
            return [:]
        } catch let e as APIError {
            if e.status == 404 { notice = "Serveren har ikke AI-kontroll ennå. Oppdater Homelab-serveren." }
            return nil
        } catch {
            return nil
        }
    }

    @discardableResult
    func send(_ method: String, _ path: String, _ body: [String: Any] = [:], _ store: Store) async -> [String: Any]? {
        do {
            let d: Data = try await store.api.callAt("/api", method, "/ai" + path, json: body, timeout: 30)
            return JS.obj(d)
        } catch let e as APIError {
            flash(e.status == 403 ? "Bare administrator kan endre dette" : e.message)
            Haptics.shared.error()
            return nil
        } catch {
            flash(error.localizedDescription)
            return nil
        }
    }

    /* ---------- Status ---------- */

    func loadStatus(_ store: Store) async {
        guard let o = await get("/status", store) else { return }
        notice = ""
        // Prompt 38: maskinen (Mac mini M4 · 16 GB · ekstern disk) og anbefalingene (AiCtl38.swift).
        AiHw38.shared.parse(o)
        // SERVER34: server{url, version, gpu{name, vramGb}, vramUsedGb, diskGb, loaded[]}, budget{monthlyKr, monthCostKr}.
        let srv: [String: Any] = JS.dict(o, "server") ?? o
        let g: [String: Any] = JS.dict(srv, "gpu") ?? [:]
        gpu = JS.str(g, "name") ?? JS.str(srv, "gpu") ?? gpu
        vramTotal = JS.num(g, "vramGb") ?? JS.num(srv, "vramTotalGb") ?? vramTotal
        vramUsed = JS.num(srv, "vramUsedGb") ?? vramUsed
        diskUsed = JS.num(srv, "diskGb") ?? JS.num(srv, "diskUsedGb") ?? diskUsed
        diskTotal = JS.num(srv, "diskTotalGb") ?? diskTotal
        if let b = JS.dict(o, "budget") {
            budget = JS.num(b, "monthlyKr") ?? budget
            cost30 = JS.num(b, "monthCostKr") ?? cost30
        }
        let jb: [String: Any] = JS.dict(o, "jobs") ?? o
        running = JS.int(jb, "running") ?? running
        queued = JS.int(jb, "queued") ?? queued
        failed = JS.int(jb, "failed") ?? failed
        if let us = JS.dict(o, "usage") {
            tokens30 = JS.num(us, "tokens30") ?? JS.num(us, "tokens") ?? tokens30
            localShare = JS.int(us, "localShare") ?? localShare
        }
        var list: [AiProv34] = []
        for p in JS.list(o, "providers") {
            let id: String = JS.str(p, "id") ?? JS.str(p, "provider") ?? ""
            if id.isEmpty { continue }
            let raw: String = (JS.str(p, "state") ?? JS.str(p, "status") ?? "").lowercased()
            let st: String = AiCtl34.state(raw, ok: JS.bool(p, "ok"))
            let ms: Int = JS.int(p, "ms") ?? JS.int(p, "latencyMs") ?? 0
            let err: String = JS.str(p, "error") ?? ""
            let det: String = !err.isEmpty ? err : (JS.str(p, "detail") ?? JS.str(p, "sub") ?? JS.str(p, "model") ?? "")
            list.append(AiProv34(id: id, name: JS.str(p, "name") ?? AiCtl34.provName(id), state: st, detail: det, ms: ms))
        }
        providers = list
    }

    /// Tre tilstander: svarer (ok), nås men genererer ikke (warn), ikke tilkoblet (off).
    static func state(_ raw: String, ok: Bool?) -> String {
        if raw == "ok" || raw == "svarer" || raw == "green" || raw == "connected" { return "ok" }
        if raw == "warn" || raw == "degraded" || raw == "reachable" || raw == "orange" || raw == "error" { return "warn" }
        if raw.isEmpty, let ok { return ok ? "ok" : "warn" }
        return "off"
    }

    static func provName(_ id: String) -> String {
        switch id {
        case "ollama": return "Ollama · hjemmeserver"
        case "gemini": return "Gemini"
        case "groq": return "Groq"
        case "openrouter": return "OpenRouter"
        case "roboflow": return "Roboflow"
        default: return id.capitalized
        }
    }

    /* ---------- Modeller ---------- */

    func loadModels(_ store: Store) async {
        guard let o = await get("/models", store) else {
            if installed.isEmpty { fallbackModels() }
            return
        }
        let inst: [[String: Any]] = JS.list(o, "installed").isEmpty ? JS.list(o, "items") : JS.list(o, "installed")
        installed = inst.compactMap { AiCtl34.model($0) }
        var pl: [AiPull34] = []
        for p in JS.list(o, "pulls") + JS.list(o, "downloading") {
            guard let id = JS.str(p, "id") ?? JS.str(p, "model") else { continue }
            if pullTasks[id] != nil || JS.bool(p, "done") == true { continue }
            pl.append(AiCtl34.pull(id, p))
        }
        let mine: [AiPull34] = pulls.filter { pullTasks[$0.id] != nil }
        pulls = mine + pl
        let cl: [[String: Any]] = JS.list(o, "cloud")
        if !cl.isEmpty {
            cloud = cl.compactMap { (c: [String: Any]) -> AiCloud34? in
                guard let id = JS.str(c, "id") else { return nil }
                return AiCloud34(id: id, provider: JS.str(c, "provider") ?? "", desc: JS.str(c, "desc") ?? JS.str(c, "name") ?? "", on: JS.bool(c, "on") ?? JS.bool(c, "enabled") ?? true)
            }
        }
        defaultChat = JS.str(JS.dict(o, "defaults"), "chat") ?? JS.str(o, "default") ?? defaultChat
        if let g = JS.dict(o, "gpu"), let v = JS.num(g, "vramGb") { vramTotal = v }
        if let g = JS.num(o, "diskUsedGb") { diskUsed = g }
    }

    private func fallbackModels() {
        let s: ChatStore27 = ChatStore27.shared
        installed = s.localModels.map { (m: ChatLLM27) -> AiModel34 in
            AiModel34(id: m.id, desc: m.name, gb: Double(m.size.replacingOccurrences(of: " GB", with: "").replacingOccurrences(of: ",", with: ".")) ?? 0,
                      kind: m.vision ? "bilde" : "tekst")
        }
        cloud = s.skyModels.map { (m: ChatLLM27) -> AiCloud34 in AiCloud34(id: m.id, provider: m.provider, desc: m.name, on: true) }
    }

    static func model(_ m: [String: Any]) -> AiModel34? {
        guard let id = JS.str(m, "id") ?? JS.str(m, "name") ?? JS.str(m, "model") else { return nil }
        var r: AiModel34 = AiModel34(id: id)
        let det: [String: Any] = JS.dict(m, "details") ?? [:]
        let fam: String = JS.str(m, "family") ?? ""
        let par: String = JS.str(m, "params") ?? JS.str(det, "parameter_size") ?? ""
        r.desc = JS.str(m, "desc") ?? [fam, par].filter { !$0.isEmpty }.joined(separator: " · ")
        let bytes: Double = JS.num(m, "size") ?? 0
        r.gb = JS.num(m, "gb") ?? JS.num(m, "sizeGb") ?? (bytes > 1_000_000 ? bytes / 1_000_000_000 : bytes)
        r.quant = JS.str(m, "quant") ?? JS.str(m, "quantization") ?? JS.str(det, "quantization_level") ?? ""
        if let c = JS.int(m, "ctx") ?? JS.int(m, "context") { r.ctx = c >= 1024 ? String(c / 1024) + "k" : String(c) } else { r.ctx = JS.str(m, "ctx") ?? "" }
        r.kind = (JS.str(m, "kind") ?? JS.str(m, "type") ?? (JS.bool(m, "vision") == true ? "bilde" : "tekst")).lowercased()
        r.loaded = JS.bool(m, "loaded") ?? JS.bool(m, "inVram") ?? false
        r.last = JS.str(m, "lastUsedText") ?? JS.str(m, "last") ?? AiCtl34.ago(JS.date(m["lastUsed"]))
        return r
    }

    static func pull(_ id: String, _ p: [String: Any]) -> AiPull34 {
        let tot: Double = JS.num(p, "total") ?? 0
        let got: Double = JS.num(p, "completed") ?? 0
        let calc: Double = tot > 0 ? got / tot * 100 : 0
        let pct: Double = JS.num(p, "pct") ?? JS.num(p, "progress") ?? calc
        return AiPull34(id: id, pct: pct, gotGb: got / 1_000_000_000, totGb: tot / 1_000_000_000, mbs: JS.num(p, "mbps") ?? JS.num(p, "mbs") ?? 0)
    }

    static func ago(_ d: Date?) -> String {
        guard let d else { return "" }
        let s: Double = Date().timeIntervalSince(d)
        if s < 120 { return "nå" }
        if s < 3600 { return "for " + String(Int(s / 60)) + " min siden" }
        if Calendar.current.isDateInToday(d) { return "i dag " + JS.fmt(d, "HH:mm") }
        if Calendar.current.isDateInYesterday(d) { return "i går" }
        return "for " + String(Int(s / 86_400)) + " dager siden"
    }

    /// Prompt 38: PASSER ≤ 8 GB · TRANGT ≤ 10,5 GB · FOR STOR, regnet fra GPU-budsjettet på Mac mini (AiCtl38.swift).
    func fit(_ gb: Double) -> String {
        AiHw38.shared.fit(gb)
    }

    func libraryRows() -> [AiLib34] {
        let q: String = libQuery.trimmingCharacters(in: .whitespaces).lowercased()
        let base: [AiLib34] = library.isEmpty ? AiCtl34.fixedLibrary : library
        return base.filter { (l: AiLib34) -> Bool in
            let catOk: Bool = libCat == "alle" || l.kind == libCat
            let qOk: Bool = q.isEmpty || (l.id + " " + l.desc).lowercased().contains(q)
            return catOk && qOk
        }
    }

    func searchLibrary(_ store: Store) async {
        let q: String = libQuery.trimmingCharacters(in: .whitespaces)
        let enc: String = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        guard let o = await get("/library?q=" + enc, store) else { return }
        let rows: [[String: Any]] = JS.list(o, "items").isEmpty ? JS.list(o, "models") : JS.list(o, "items")
        let list: [AiLib34] = rows.compactMap { (m: [String: Any]) -> AiLib34? in
            guard let id = JS.str(m, "id") ?? JS.str(m, "name") else { return nil }
            let bytes: Double = JS.num(m, "size") ?? 0
            let gb: Double = JS.num(m, "sizeGb") ?? JS.num(m, "gb") ?? (bytes > 1_000_000 ? bytes / 1_000_000_000 : bytes)
            let kind: String = (JS.str(m, "cat") ?? JS.str(m, "kind") ?? "tekst").lowercased()
            return AiLib34(id: id, desc: JS.str(m, "desc") ?? JS.str(m, "description") ?? "", gb: gb, kind: kind)
        }
        if !list.isEmpty { library = list }
    }

    /// «Last ned»: POST /api/ai/models/pull {model} som SSE ({completed, total, status}). Kjører videre i bakgrunnen.
    func pullModel(_ raw: String, _ store: Store) {
        let id: String = raw.trimmingCharacters(in: .whitespaces)
        if id.isEmpty || installed.contains(where: { $0.id == id }) || pulls.contains(where: { $0.id == id }) { return }
        Haptic34.light()
        libQuery = ""
        let gb: Double = AiCtl34.fixedLibrary.first(where: { $0.id == id })?.gb ?? 0
        pulls.append(AiPull34(id: id, pct: 0, gotGb: 0, totGb: gb, mbs: 0))
        let api: API = store.api
        pullTasks[id] = Task { @MainActor in
            let ok: Bool = await AiCtl34.sse(api, "/api/ai/models/pull", ["model": id, "name": id]) { (o: [String: Any]) in
                self.pullProgress(id, o)
            }
            self.pullTasks[id] = nil
            self.pulls.removeAll { $0.id == id }
            if ok {
                self.flash(id + " er lastet ned")
                Haptics.shared.success()
            }
            await self.loadModels(store)
        }
    }

    private func pullProgress(_ id: String, _ o: [String: Any]) {
        guard let i = pulls.firstIndex(where: { $0.id == id }) else { return }
        if let e = JS.str(o, "error") { flash("Nedlastingen feilet: " + e); return }
        var p: AiPull34 = AiCtl34.pull(id, o)
        if p.totGb == 0 { p.totGb = pulls[i].totGb }
        if p.pct == 0 && pulls[i].pct > 0 && JS.num(o, "pct") == nil && JS.num(o, "total") == nil { return }
        pulls[i] = p
    }

    func cancelPull(_ id: String, _ store: Store) {
        Haptic34.light()
        pullTasks[id]?.cancel()
        pullTasks[id] = nil
        pulls.removeAll { $0.id == id }
        Task { await self.send("DELETE", "/models/pulls/" + Cal27Model.enc(id), [:], store) }
    }

    func toggleLoad(_ m: AiModel34, _ store: Store) {
        Haptic34.light()
        let path: String = "/models/" + Cal27Model.enc(m.id) + (m.loaded ? "/unload" : "/load")
        Task {
            if await self.send("POST", path, [:], store) != nil {
                self.flash(m.loaded ? m.id + " lastet ut av VRAM" : m.id + " lastet inn")
                await self.loadModels(store)
            }
        }
    }

    func makeDefault(_ m: AiModel34, _ store: Store) {
        Haptic34.light()
        defaultChat = m.id
        Task {
            if await self.send("PUT", "/models/default", ["model": m.id], store) != nil {
                self.flash(m.id + " er standard i Chat")
                await self.loadRouting(store)
            }
        }
    }

    func delete(_ m: AiModel34, _ store: Store) {
        Haptic34.light()
        Task {
            if await self.send("DELETE", "/models/" + Cal27Model.enc(m.id), [:], store) != nil {
                self.installed.removeAll { $0.id == m.id }
                self.flash(m.id + " slettet")
                await self.loadModels(store)
                await self.loadRouting(store)
            }
        }
    }

    func toggleCloud(_ c: AiCloud34, _ store: Store) {
        Haptic34.light()
        if let i = cloud.firstIndex(where: { $0.id == c.id }) { cloud[i].on.toggle() }
        Task { await self.send("PUT", "/cloud", ["id": c.id, "on": !c.on], store) }
    }

    /* ---------- Ruting ---------- */

    func loadRouting(_ store: Store) async {
        // Prompt 38: Finans har egen ruting (alltid fire rader: Kvitteringer, Kategorisering, Finans · spør, Strekkoder).
        guard let o = await get(fin ? "/routing?scope=finans" : "/routing", store) else {
            if routes.isEmpty { routes = AiCtl34.tasks.map { AiRoute34(id: $0.0, name: $0.1, sub: $0.2, model: $0.3, fallback: $0.4, fin: $0.5) } }
            return
        }
        var byId: [String: [String: Any]] = [:]
        if let d = JS.dict(o, "tasks") {
            for (k, v) in d { if let vv = v as? [String: Any] { byId[k] = vv } }
        } else {
            for t in JS.list(o, "tasks") + JS.list(o, "routes") {
                if let k = JS.str(t, "id") ?? JS.str(t, "task") { byId[k] = t }
            }
        }
        // Prompt 38: options[{id, label, local}] per rad fyller nedtrekkslistene når /models ikke har svart.
        AiHw38.shared.takeOptions(Array(byId.values))
        var out: [AiRoute34] = []
        var seen: Set<String> = []
        for t in AiCtl34.tasks {
            let r: [String: Any] = byId[t.0] ?? AiCtl34.alias38(t.0, byId) ?? [:]
            var x: AiRoute34 = AiCtl34.route(t.0, r, name: t.1, sub: t.2, fin: t.5)
            // Prompt 38: de fire Finans-radene er alltid Finans (serveren kan sende fin:false eller mangle raden).
            if t.5 { x.fin = true }
            if x.model.isEmpty { x.model = t.3 }
            out.append(x)
            seen.insert(t.0)
            for a in AiCtl34.aliases38[t.0] ?? [] { seen.insert(a) }
        }
        for (k, r) in byId where !seen.contains(k) {
            out.append(AiCtl34.route(k, r, name: JS.str(r, "name") ?? k, sub: JS.str(r, "sub") ?? "", fin: JS.bool(r, "fin") ?? false))
        }
        routes = out
        let ru: [String: Any] = JS.dict(o, "rules") ?? o
        for k in ["localFirst", "finLocal", "think", "autoCat"] {
            if let b = JS.bool(ru, k) { rules[k] = b }
        }
        let pa: [String: Any] = JS.dict(o, "params") ?? o
        if let k = JS.str(pa, "keepAlive") ?? JS.str(pa, "keep_alive") { keep = AiCtl34.keepLabel(k) }
        if let c = JS.int(pa, "numCtx") ?? JS.int(pa, "num_ctx") ?? JS.int(pa, "ctx") { ctx = c }
        if let t = JS.num(pa, "temperature") ?? JS.num(pa, "temp") { temp = t }
        if let n = JS.int(pa, "parallel") ?? JS.int(pa, "concurrency") { parallel = n }
        if let m = JS.int(pa, "minConf") ?? JS.int(pa, "minConfidence") { minConf = m <= 1 ? m * 100 : m }
    }

    static func route(_ id: String, _ r: [String: Any], name: String, sub: String, fin: Bool) -> AiRoute34 {
        var x: AiRoute34 = AiRoute34(id: id, name: JS.str(r, "name") ?? name, sub: JS.str(r, "desc") ?? JS.str(r, "sub") ?? sub,
                                     model: JS.str(r, "model") ?? JS.str(r, "v") ?? "", fallback: JS.str(r, "fallback") ?? JS.str(r, "fb") ?? "", fin: JS.bool(r, "fin") ?? fin)
        x.warning = JS.str(r, "warning") ?? JS.str(r, "error") ?? (JS.bool(r, "valid") == false ? "Modellen finnes ikke · bytt" : "")
        return x
    }

    /// Prompt 38: andre navn serveren kan bruke på Finans-oppgavene (GET /api/ai/routing?scope=finans).
    static let aliases38: [String: [String]] = [
        "rc": ["receipts", "receipt", "kvitteringer", "kvittering"],
        "kat": ["categorize", "category", "kategorisering", "cat"],
        "fsok": ["finance_ask", "finans_spor", "finAsk", "ask"],
        "bar": ["barcodes", "barcode", "labels", "strekkoder"],
    ]

    static func alias38(_ id: String, _ byId: [String: [String: Any]]) -> [String: Any]? {
        for a in aliases38[id] ?? [] { if let r = byId[a] { return r } }
        return nil
    }

    /// keep_alive som serveren forstår: "5m", "30m", -1 (alltid), 0 (aldri). Aldri strengen «alltid».
    static func keepLabel(_ raw: String) -> String {
        if raw == "-1" || raw == "alltid" { return "alltid" }
        if raw == "0" || raw == "aldri" { return "aldri" }
        return raw
    }

    static func keepValue(_ label: String) -> Any {
        if label == "alltid" { return -1 }
        if label == "aldri" { return 0 }
        return label
    }

    /// Alle modellene som kan velges i nedtrekkslistene (lokale + sky som er på).
    var choices: [(String, String)] {
        var out: [(String, String)] = installed.map { ($0.id, $0.id + " · lokal") }
        for c in cloud where c.on { out.append((c.id, c.id + " · " + (c.provider.isEmpty ? "sky" : c.provider))) }
        for o in AiHw38.shared.options where !out.contains(where: { (x: (String, String)) -> Bool in x.0 == o.id }) {
            out.append((o.id, o.text + " · " + o.env))
        }
        return out
    }

    func isCloud(_ id: String) -> Bool {
        if id.isEmpty { return false }
        if installed.contains(where: { $0.id == id }) { return false }
        if let o = AiHw38.shared.options.first(where: { (x: AiRec38) -> Bool in x.id == id }) { return o.env == "sky" }
        return cloud.contains(where: { $0.id == id }) || id.hasPrefix("gemini") || id.contains("/") || id.contains("versatile")
    }

    func setRoute(_ id: String, model: String?, fallback: String?, _ store: Store) {
        Haptic34.light()
        guard let i = routes.firstIndex(where: { $0.id == id }) else { return }
        var body: [String: Any] = [:]
        if let model { routes[i].model = model; body["model"] = model }
        if let fallback { routes[i].fallback = fallback; body["fallback"] = fallback }
        routes[i].warning = ""
        Task { await self.send("PUT", "/routing", ["tasks": [id: body]], store) }
    }

    func setRule(_ k: String, _ store: Store) {
        Haptic34.light()
        let v: Bool = !(rules[k] ?? false)
        rules[k] = v
        Task { await self.send("PUT", "/routing", ["rules": [k: v]], store) }
    }

    func setParam(_ k: String, _ v: Any, _ store: Store) {
        Haptic34.light()
        switch k {
        case "keepAlive": keep = AiCtl34.keepLabel(String(describing: v))
        case "numCtx": ctx = (v as? Int) ?? ctx
        case "temperature": temp = (v as? Double) ?? temp
        case "parallel": parallel = (v as? Int) ?? parallel
        case "minConf": minConf = (v as? Int) ?? minConf
        default: break
        }
        Task { await self.send("PUT", "/routing", ["params": [k: v]], store) }
    }

    /* ---------- Jobber ---------- */

    func loadJobs(_ store: Store) async {
        guard let o = await get("/jobs", store) else { return }
        // SERVER34: {running[], queued[], recent[], paused}.
        var rows: [[String: Any]] = JS.list(o, "running") + JS.list(o, "queued") + JS.list(o, "recent")
        if rows.isEmpty { rows = JS.list(o, "jobs").isEmpty ? JS.list(o, "items") : JS.list(o, "jobs") }
        jobs = rows.compactMap { AiCtl34.job($0) }
        paused = JS.bool(o, "paused") ?? paused
        running = jobs.filter { $0.st == "run" }.count
        queued = jobs.filter { $0.st == "queue" }.count
        failed = jobs.filter { $0.st == "fail" }.count
    }

    static func job(_ j: [String: Any]) -> AiJob34? {
        guard let id = JS.str(j, "id") else { return nil }
        let raw: String = (JS.str(j, "status") ?? JS.str(j, "state") ?? JS.str(j, "st") ?? "").lowercased()
        let st: String
        switch raw {
        case "running", "run", "processing", "active": st = "run"
        case "queued", "queue", "pending", "waiting": st = "queue"
        case "failed", "fail", "error", "cancelled": st = "fail"
        default: st = "done"
        }
        var meta: [String] = []
        if let ms = JS.num(j, "ms") { meta.append(String(format: "%.1f s", ms / 1000).replacingOccurrences(of: ".", with: ",")) }
        let tdict: [String: Any] = JS.dict(j, "tokens") ?? [:]
        let tin: Double = JS.num(tdict, "in") ?? 0
        let tout: Double = JS.num(tdict, "out") ?? 0
        let tok: Double = JS.num(j, "tokens") ?? (tin + tout)
        if tok > 0 { meta.append(AiCtl34.tk(tok) + " tok") }
        if let c = JS.num(j, "costKr") ?? JS.num(j, "cost"), c > 0 { meta.append(AiCtl34.kr(c)) }
        if let w = JS.str(j, "when") ?? JS.str(j, "scheduled") { meta.append(w) }
        let kind: String = (JS.str(j, "kind") ?? "").lowercased()
        let task: String = (JS.str(j, "task") ?? "").lowercased()
        let finKinds: [String] = ["receipt", "categorize", "fsok", "rc", "kat", "bar", "finans"]
        let fin: Bool = JS.bool(j, "fin") ?? (finKinds.contains(kind) || finKinds.contains(task))
        return AiJob34(id: id, title: JS.str(j, "title") ?? JS.str(j, "t") ?? kind, model: JS.str(j, "model") ?? JS.str(j, "m") ?? "",
                       st: st, pct: JS.num(j, "progress") ?? JS.num(j, "p") ?? 0, meta: meta.joined(separator: " · "),
                       err: JS.str(j, "error") ?? JS.str(j, "err") ?? "", fin: fin)
    }

    func jobAction(_ j: AiJob34, _ store: Store) {
        Haptic34.light()
        let act: String = j.st == "fail" ? "/retry" : "/cancel"
        Task {
            await self.send("POST", "/jobs/" + Cal27Model.enc(j.id) + act, [:], store)
            await self.loadJobs(store)
        }
    }

    func togglePause(_ store: Store) {
        Haptic34.light()
        paused.toggle()
        let v: Bool = paused
        Task { await self.send("POST", "/queue/pause", ["paused": v], store) }
    }

    func clearHistory(_ store: Store) {
        Haptic34.light()
        jobs.removeAll { $0.st == "done" || $0.st == "fail" }
        Task { await self.send("DELETE", "/jobs", [:], store) }
    }

    /* ---------- Forbruk ---------- */

    func loadUsage(_ store: Store) async {
        guard let o = await get("/usage?days=" + String(usageDays) + (fin ? "&scope=finans" : ""), store) else { return }
        let t: [String: Any] = JS.dict(o, "totals") ?? o
        tokIn = JS.num(t, "tokIn") ?? JS.num(t, "tokensIn") ?? 0
        tokOut = JS.num(t, "tokOut") ?? JS.num(t, "tokensOut") ?? 0
        costPeriod = JS.num(t, "costKr") ?? JS.num(t, "cost") ?? 0
        avgMs = JS.num(t, "avgMs") ?? 0
        if let ls = JS.num(t, "localShare") { localShare = Int(ls <= 1 ? ls * 100 : ls) }
        var ds: [AiDay34] = []
        let dayRows: [[String: Any]] = JS.list(o, "byDay").isEmpty ? JS.list(o, "days") : JS.list(o, "byDay")
        for (i, d) in dayRows.enumerated() {
            let lo: Double = JS.num(d, "localTok") ?? JS.num(d, "local") ?? 0
            let cl: Double = JS.num(d, "cloudTok") ?? JS.num(d, "cloud") ?? 0
            ds.append(AiDay34(id: i, local: lo, cloud: cl))
        }
        days = ds
        let fl: [[String: Any]] = JS.list(o, "byTask").isEmpty ? JS.list(o, "features") : JS.list(o, "byTask")
        feats = fl.compactMap { (f: [String: Any]) -> AiFeat34? in
            guard let n = JS.str(f, "name") ?? JS.str(f, "feature") ?? JS.str(f, "task") else { return nil }
            let cnt: Int = JS.int(f, "count") ?? 0
            let models: [String] = JS.strings(f, "models")
            let m: String = models.isEmpty ? (JS.str(f, "model") ?? "") : models.prefix(2).joined(separator: ", ")
            let sub: String = [m, cnt > 0 ? String(cnt) + " stk" : ""].filter { !$0.isEmpty }.joined(separator: " · ")
            return AiFeat34(name: n, cost: JS.num(f, "costKr") ?? JS.num(f, "cost") ?? 0, tokens: JS.num(f, "tokens") ?? 0, sub: sub)
        }
        let b: [String: Any] = JS.dict(o, "budget") ?? [:]
        budget = JS.num(b, "monthlyKr") ?? JS.num(b, "limit") ?? budget
        budgetHard = JS.bool(b, "hardStop") ?? JS.bool(b, "hard") ?? budgetHard
        budgetWarn = JS.bool(b, "warn80") ?? budgetWarn
        if let used = JS.num(b, "monthCostKr") ?? JS.num(b, "used") { cost30 = used }
        if usageDays == 30 { tokens30 = tokIn + tokOut }
    }

    func setBudget(_ v: Double, _ store: Store) {
        budget = v
        let body: [String: Any] = ["budget": ["monthlyKr": v, "hardStop": budgetHard, "warn80": budgetWarn]]
        Task { await self.send("PUT", "/routing", body, store) }
    }

    func toggleBudget(_ k: String, _ store: Store) {
        Haptic34.light()
        if k == "hard" { budgetHard.toggle() } else { budgetWarn.toggle() }
        let body: [String: Any] = ["budget": ["monthlyKr": budget, "hardStop": budgetHard, "warn80": budgetWarn]]
        Task { await self.send("PUT", "/routing", body, store) }
    }

    /* ---------- API og nøkler ---------- */

    func loadKeys(_ store: Store) async {
        guard let o = await get("/keys", store) else { return }
        let rows: [[String: Any]] = JS.list(o, "providers").isEmpty ? JS.list(o, "items") : JS.list(o, "providers")
        keys = rows.compactMap { (k: [String: Any]) -> AiKey34? in
            guard let id = JS.str(k, "id") ?? JS.str(k, "provider") else { return nil }
            let meta: String = JS.str(k, "meta") ?? JS.str(k, "model") ?? (JS.bool(k, "optional") == true ? "Valgfri" : "")
            return AiKey34(id: id, name: JS.str(k, "name") ?? AiCtl34.provName(id), set: JS.bool(k, "set") ?? JS.bool(k, "configured") ?? false,
                           tail: JS.str(k, "tail") ?? JS.str(k, "last4") ?? "", url: JS.str(k, "url") ?? JS.str(k, "address") ?? "",
                           meta: meta, link: JS.str(k, "link") ?? JS.str(k, "keyUrl") ?? "")
        }
        // GET /api/ai/tokens → [{id, name, display, created, lastUsed}]
        guard let tk = await get("/tokens", store) else { return }
        tokensList = JS.list(tk, "items").compactMap { (t: [String: Any]) -> AiToken34? in
            guard let id = JS.str(t, "id") else { return nil }
            let disp: String = JS.str(t, "display") ?? "fh_pat_••••"
            let made: String = JS.fmt(JS.date(t["created"]), "d. MMM")
            let used: String = AiCtl34.ago(JS.date(t["lastUsed"]))
            var parts: [String] = [disp]
            if !made.isEmpty { parts.append("opprettet " + made) }
            parts.append(used.isEmpty ? "aldri brukt" : "brukt " + used)
            return AiToken34(id: id, name: JS.str(t, "name") ?? "Nøkkel", sub: parts.joined(separator: " · "))
        }
    }

    func saveKey(_ id: String, _ value: String, _ store: Store) {
        let v: String = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { return }
        Haptic34.light()
        let body: [String: Any] = id == "ollama" ? ["url": v] : ["key": v]
        Task {
            if await self.send("PUT", "/keys/" + id, body, store) != nil {
                self.flash("Lagret")
                await self.loadKeys(store)
                await self.runSelftest(store)
            }
        }
    }

    func testKey(_ id: String, _ store: Store) {
        Haptic34.light()
        testing[id] = "Tester …"
        Task {
            let o: [String: Any]? = await self.send("POST", "/keys/" + id + "/test", [:], store)
            if let o {
                let ok: Bool = JS.bool(o, "ok") ?? false
                let ms: Int = JS.int(o, "ms") ?? 0
                self.testing[id] = ok ? "Svarte på " + String(ms) + " ms" : (JS.str(o, "error") ?? "Svarer ikke")
            } else {
                self.testing[id] = "Feilet"
            }
        }
    }

    func newToken(_ store: Store) {
        Haptic34.light()
        Task {
            if let o = await self.send("POST", "/tokens", ["name": "Ny nøkkel"], store) {
                self.freshToken = JS.str(o, "token") ?? JS.str(o, "key") ?? ""
                await self.loadKeys(store)
            }
        }
    }

    func revoke(_ t: AiToken34, _ store: Store) {
        Haptic34.light()
        tokensList.removeAll { $0.id == t.id }
        Task { await self.send("DELETE", "/tokens/" + Cal27Model.enc(t.id), [:], store) }
    }

    /* ---------- Selvtest ---------- */

    /// POST /api/ai/selftest (SSE): {task, model, ok, ms, error, fix} per rute. Uten SSE: ett JSON-svar {results:[…]}.
    func runSelftest(_ store: Store) async {
        if testRunning { return }
        Haptic34.light()
        testRunning = true
        testDone = false
        let list: [(String, String, String, String, String, Bool)] = AiCtl34.tasks.filter { !fin || $0.5 }
        tests = list.map { (t: (String, String, String, String, String, Bool)) -> AiTest34 in
            let m: String = routes.first(where: { $0.id == t.0 })?.model ?? ""
            return AiTest34(id: t.0, name: t.1, model: m, st: "wait", text: "Venter", fix: "")
        }
        if !tests.isEmpty { tests[0].st = "busy"; tests[0].text = "Sender testprompt …" }
        let ok: Bool = await AiCtl34.sse(store.api, "/api/ai/selftest", fin ? ["scope": "finans"] : [:]) { (o: [String: Any]) in
            if let rs = o["results"] as? [Any] {
                for r in rs { if let d = r as? [String: Any] { self.testResult(d) } }
            } else {
                self.testResult(o)
            }
        }
        if !ok {
            for i in 0..<tests.count where tests[i].st == "busy" || tests[i].st == "wait" {
                tests[i].st = "fail"
                tests[i].text = "Fikk ikke kjørt selvtesten (oppdater serveren)"
            }
        }
        testRunning = false
        testDone = true
        let bad: Int = tests.filter { $0.st == "fail" }.count
        flash(bad > 0 ? String(bad) + " AI-funksjoner virker ikke" : "Alle AI-funksjoner svarer")
        if bad > 0 { Haptics.shared.warning() } else { Haptics.shared.success() }
        await loadStatus(store)
    }

    private func testResult(_ o: [String: Any]) {
        guard let task = JS.str(o, "task") ?? JS.str(o, "id") else { return }
        let okv: Bool = JS.bool(o, "ok") ?? false
        let model: String = JS.str(o, "model") ?? ""
        let ms: Int = JS.int(o, "ms") ?? 0
        let err: String = JS.str(o, "error") ?? ""
        let fix: String = JS.str(o, "fix") ?? ""
        let text: String = okv ? model + " svarte «ok» på " + String(ms) + " ms" : (err.isEmpty ? "Svarer ikke" : err)
        if let i = tests.firstIndex(where: { $0.id == task }) {
            tests[i].st = okv ? "ok" : "fail"
            tests[i].text = text
            tests[i].fix = fix
            if !model.isEmpty { tests[i].model = model }
            if i + 1 < tests.count && tests[i + 1].st == "wait" {
                tests[i + 1].st = "busy"
                let nm: String = tests[i + 1].model.isEmpty ? "modellen" : tests[i + 1].model
                tests[i + 1].text = "Sender testprompt til " + nm + " …"
            }
        } else {
            tests.append(AiTest34(id: task, name: JS.str(o, "name") ?? task, model: model, st: okv ? "ok" : "fail", text: text, fix: fix))
        }
    }

    /* ---------- SSE ---------- */

    /// Leser en SSE- eller NDJSON-strøm og kaller each for hver JSON-linje. true = strømmen ble ferdig uten feil.
    static func sse(_ api: API, _ path: String, _ body: [String: Any], each: @escaping @MainActor ([String: Any]) -> Void) async -> Bool {
        guard let url = URL(string: api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else { return false }
        var req: URLRequest = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 600
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let tok = api.token { req.setValue("Bearer " + tok, forHTTPHeaderField: "Authorization") }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (bytes, res) = try await URLSession.shared.bytes(for: req)
            let code: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
            if code >= 400 { return false }
            var failed: Bool = false
            for try await line in bytes.lines {
                if Task.isCancelled { return false }
                var s: String = line.trimmingCharacters(in: .whitespaces)
                if s.hasPrefix("data:") { s = String(s.dropFirst(5)).trimmingCharacters(in: .whitespaces) }
                if s.isEmpty || s.hasPrefix("event:") || s.hasPrefix(":") || s == "[DONE]" { continue }
                let o: [String: Any] = JS.obj(Data(s.utf8))
                if o.isEmpty { continue }
                if JS.str(o, "error") != nil && JS.str(o, "task") == nil { failed = true }
                await MainActor.run { each(o) }
            }
            return !failed
        } catch {
            return false
        }
    }

    /* ---------- Format ---------- */

    nonisolated static func tk(_ n: Double) -> String {
        if n >= 1_000_000 { return String(format: "%.1f M", n / 1_000_000).replacingOccurrences(of: ".", with: ",") }
        if n >= 1000 { return String(Int((n / 1000).rounded())) + " k" }
        return String(Int(n))
    }

    nonisolated static func kr(_ v: Double) -> String { Receipt34Ai.kr(v) + " kr" }

    nonisolated static func gb(_ v: Double) -> String { String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",") + " GB" }
}
