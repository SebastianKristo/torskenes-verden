import SwiftUI
import UIKit

/* ---------------- Prompt 27: Chat (Ollama lokalt, Gemini og Groq i skyen) – data og strømming ---------------- */
// Fasit: side «chat» i design/Mobil Papir App.dc.html og prompts/prompt-27-pakke/claude-code-chat.md.
// Appen snakker bare med vår server (/api/chat, app-token). Serveren bruker Open WebUI når det er satt opp,
// ellers egen lagring og Ollama/Gemini/Groq direkte.
// Svarene strømmes med SSE (URLSession.bytes): event meta {chatId}, delta {text}, done {tokensPerSec, ms, used}, error {error}.
// 409 {needsConfirm, model, leaves} gir arket «Sende til …?».
//
// Inngang fra andre sider: `store.openChat(prompt:)` (✦ AI i Google-feltet på Hjem, rad i Mer, Innstillinger → AI).

/// En modell i velgeren.
struct ChatLLM27: Identifiable, Hashable {
    var id: String
    var name: String
    /// lokal eller sky.
    var kind: String
    var provider: String
    var size: String
    var vision: Bool
    var installed: Bool

    var sky: Bool { kind == "sky" }
    /// Lokale modeller vises med id (llama3.1:8b), sky-modeller med navn (Gemini 2.5 Flash).
    var label: String { sky || kind == "auto" ? name : id }
}

struct ChatSummary27: Identifiable, Hashable {
    var id: String
    var title: String
    var model: String
    var updatedAt: Date
    var pinned: Bool
    var folderId: String
}

struct ChatFolder27: Identifiable, Hashable {
    var id: String
    var name: String
    var open: Bool
    var chats: [ChatSummary27]
    /// Prompt 34: systemmappen «Kvitteringer og skanninger» (kan ikke slettes eller få nytt navn, lukket som standard).
    var sys: Bool = false
    /// Prompt 34: antall samtaler i mappen der bilaget venter på godkjenning.
    var pending: Int = 0
}

struct ChatMsg27: Identifiable, Hashable {
    var id: String = UUID().uuidString
    /// user eller assistant.
    var role: String
    var content: String
    var model: String = ""
    /// «42 tok/s · 3,1 s» (svar).
    var stats: String = ""
    /// «Brukte Finans», «Brukte Husleiekontrakt …».
    var used: [String] = []
    /// Navn på vedlegg (bruker).
    var attach: [String] = []
    var images: [String] = []
    /// Prompt 31: kortet fra Glimt (vær, kalender …) som JSON, tomt = uten kort (Chat31Cards.swift).
    var card31: String = ""
    /// Prompt 41: fakta Glimt hentet før svaret (meta.facts), vist som små kort (Chat41Facts.swift).
    var facts41: [ChatFact41] = []
    /// Prompt 50: lagrede vedlegg med miniatyr (bruker), «Lest med …» og «Legg i Finans ›» (svar). Chat50Attach.swift.
    var att50: [Chat50File] = []
    var readWith50: String = ""
    var fin50: String = ""
    var fin50Label: String = ""
    /// Prompt 52: tankegangen på svaret (think: string[], thS: sekunder) og miniatyrene på brukermeldingen (attTh, data-URL).
    var think: [String] = []
    var thS: Double = 0
    var attTh: [String] = []
    /// Prompt 67: Glimt-svar fra strømmen (Convo67.swift): stoppet, traceId (tommel opp/ned), valgknapper og bekreftelse.
    var glimt67: Bool = false
    var stopped67: Bool = false
    var traceId67: String = ""
    var choices67: Choices67? = nil
    var confirm67: String = ""
}

struct ChatSettings27: Hashable {
    var persona: String = "std"
    var system: String = ""
    var temperature: Double = 0.7
    var topP: Double = 0.9
    var numCtx: Int = 8192
    var skipCloudAsk: Bool = false

    var json: [String: Any] {
        ["persona": persona, "system": system, "temperature": temperature, "topP": topP, "numCtx": numCtx, "skipCloudAsk": skipCloudAsk]
    }

    static func from(_ o: [String: Any]?) -> ChatSettings27 {
        var s = ChatSettings27()
        guard let o else { return s }
        if let v = JS.str(o, "persona") { s.persona = v }
        s.system = JS.str(o, "system") ?? ""
        if let v = JS.num(o, "temperature") { s.temperature = v }
        if let v = JS.num(o, "topP") { s.topP = v }
        if let v = JS.int(o, "numCtx") { s.numCtx = v }
        s.skipCloudAsk = JS.bool(o, "skipCloudAsk") ?? false
        return s
    }
}

/// Vedlegg i skrivefeltet: bilde (base64 til bildemodellen), fil eller dokument fra kunnskapsbasen (fil-id).
struct ChatAttach27: Identifiable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    /// img, file eller doc.
    var kind: String
    var fileId: String = ""
    var b64: String = ""
    /// Prompt 50: opplasting med fremdrift og miniatyr fra serveren (Chat50Attach.swift).
    var mime: String = ""
    var thumb: String = ""
    var uploading: Bool = false
    var pct: Double = 0
    var err: String = ""

    var icon: String { kind == "img" ? "▣" : kind == "doc" ? "#" : "⎙" }
}

struct ChatDoc27: Identifiable, Hashable {
    var id: String
    var name: String
    var sub: String
}

struct ChatShare27: Identifiable {
    let id: String = UUID().uuidString
    let url: URL
}

/// Farger og fonter: Papir (appens farger, Newsreader) eller Nøytral (mørk, systemfont, som Open WebUI).
struct ChatPal27 {
    let neutral: Bool
    let bg: Color
    let card: Color
    let ink: Color
    let mut: Color
    let line: Color
    let acc: Color
    let side: Color
    let ub: Color
    let uI: Color
    let dark: Bool

    static func make(_ p: PaperPalette, theme: String) -> ChatPal27 {
        if theme == "noytral" {
            return ChatPal27(neutral: true, bg: Color(hex: "#212121"), card: Color(hex: "#2f2f2f"), ink: Color(hex: "#ececec"), mut: Color(hex: "#a3a3a3"),
                             line: Color(hex: "#3a3a3a"), acc: Color(hex: "#ececec"), side: Color(hex: "#171717"), ub: Color(hex: "#303030"),
                             uI: Color(hex: "#ececec"), dark: true)
        }
        return ChatPal27(neutral: false, bg: p.bg, card: p.card, ink: p.ink, mut: p.mut, line: p.line, acc: p.lab,
                         side: p.dark ? Color(hex: "#1b1a15") : Color(hex: "#ebe6da"), ub: p.ink, uI: p.bg, dark: p.dark)
    }

    func ui(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font {
        neutral ? Font.system(size: size, weight: w) : PF.ui(size, w)
    }

    func head(_ size: CGFloat) -> Font {
        neutral ? Font.system(size: size, weight: .semibold) : PF.serif(size, medium: true)
    }

    func mono(_ size: CGFloat) -> Font { PF.mono(size) }
}

@MainActor
@Observable
final class ChatStore27 {
    static let shared = ChatStore27()

    /// Personaene i ⚙ (id, navn).
    nonisolated static let personas: [(String, String)] = [("std", "Standard"), ("oko", "Økonomi"), ("kode", "Homelab"), ("norsk", "Norsklærer")]
    /// Forslag på tom samtale (tekst, undertekst, bruk Mine data).
    nonisolated static let suggestions: [(String, String, Bool)] = [
        ("Hva har jeg brukt på mat i oktober?", "Bruker Mine data", true),
        ("Hva står det om oppsigelse i husleiekontrakten?", "Fra kunnskapsbasen", false),
        ("Lag en handleliste til taco for fire", "", false),
        ("Forklar Docker-volumer enkelt", "", false),
    ]
    /// Forslag under «Hent fra ollama.com».
    nonisolated static let library: [(String, String)] = [("llama3.2:3b", "Llama 3.2 · 3B · 2,0 GB"), ("qwen3:8b", "Qwen 3 · 8B · 5,2 GB"),
                                                          ("mistral:7b", "Mistral · 7B · 4,1 GB"), ("phi4:14b", "Phi-4 · 14B · 9,1 GB"),
                                                          ("qwen2.5vl:7b", "Qwen 2.5 VL · 7B · leser bilder")]

    /* ---------- Modeller ---------- */
    var models: [ChatLLM27] = []
    var model: String = ""
    var ollamaInfo: String = ""

    /* ---------- Historikk ---------- */
    var pinned: [ChatSummary27] = []
    var folders: [ChatFolder27] = []
    var chats: [ChatSummary27] = []
    var hits: [ChatSummary27] = []
    var historyQuery: String = ""
    var drawer: Bool = false
    var loadedChats: Bool = false

    /* ---------- Samtalen ---------- */
    var curId: String? = nil
    var title: String = ""
    var msgs: [ChatMsg27] = []
    var settings: ChatSettings27 = ChatSettings27()
    var defaults: ChatSettings27 = ChatSettings27()
    var theme: String = "papir"

    /* ---------- Skrivefeltet ---------- */
    var input: String = ""
    var attach: [ChatAttach27] = []
    var webOn: Bool = false
    /// Prompt 41: «Mine data» er på i hver nye samtale (kan slås av per samtale).
    var dataOn: Bool = true
    var editIndex: Int? = nil
    var editText: String = ""

    /* ---------- Strømming ---------- */
    var busy: Bool = false
    var streamText: String = ""
    var streamTool: [String] = []
    /// Prompt 31: Glimt-ruteren jobber (verktøy-spørsmål), Chat31Cards.swift.
    var pendingTool31: Bool = false
    /// Prompt 67: statuslinja mens Glimt strømmer («Sjekker kalenderen …»), og strømmen som pågår (Convo67.swift).
    var status67: String = ""
    @ObservationIgnored var task67: Task<Void, Never>? = nil
    @ObservationIgnored var rid67: String = ""
    @ObservationIgnored var api67: API? = nil
    var scrollTick: Int = 0
    /// Prompt 52: tankestegene mens modellen tenker (SSE thinking), når den startet, og sekundene når svaret begynte (thinking_done).
    var think52: [String] = []
    var think52Start: Date? = nil
    var think52S: Double? = nil

    /* ---------- Ark ---------- */
    /// model, params, menu, guard, plus, kb, mods.
    var sheet: String? = nil
    var menuChat: ChatSummary27? = nil
    var renameText: String = ""
    var newFolder: String = ""
    var delArm: Bool = false
    var guardModel: String = ""
    var guardLeaves: [String] = []
    var guardRemember: Bool = false
    var guardHasData: Bool = false
    var knowledge: [ChatDoc27] = []
    var pulls: [String: Double] = [:]
    var pullName: String = ""
    var modelDelArm: String? = nil
    var share: ChatShare27? = nil
    var copied: String? = nil

    /* ---------- Brukerinnstillinger ---------- */
    /// chat_my_data (prompt 41: PÅ som standard når verdien mangler) og chat_ask_cloud (på).
    var myDataAllowed: Bool = true
    var askCloud: Bool = true
    var defaultModel: String = ""

    var toast: String = ""
    var notice: String = ""
    /// Tekst fra ✦ AI på Hjem som skal sendes når siden er klar.
    var pendingPrompt: String? = nil
    var promptTick: Int = 0

    @ObservationIgnored private var api: API? = nil
    @ObservationIgnored private var booted: String = ""
    @ObservationIgnored private var runTask: Task<Void, Never>? = nil
    @ObservationIgnored private var finished: Bool = true
    @ObservationIgnored private var t0: Date = Date()
    @ObservationIgnored private var doneStats: [String: Any] = [:]
    @ObservationIgnored private var pendingBody: [String: Any]? = nil
    @ObservationIgnored private var toastTask: Task<Void, Never>? = nil
    @ObservationIgnored private var paramsTask: Task<Void, Never>? = nil
    @ObservationIgnored private var searchTask: Task<Void, Never>? = nil
    @ObservationIgnored private var streamModel: String = ""
    /// Prompt 41: hva Auto velger per oppgavetype ({text, vision, long}).
    var autoPicks: [String: Any] = [:]

    private var themeKey: String { AcctScope.key("fh_chat27_theme") }
    private var modelKey: String { AcctScope.key("fh_chat27_model") }

    /* ---------- Avledet ---------- */

    var current: ChatLLM27 {
        models.first(where: { $0.id == model }) ?? ChatLLM27(id: model, name: model, kind: "lokal", provider: "ollama", size: "", vision: false, installed: true)
    }

    var localModels: [ChatLLM27] { models.filter { !$0.sky && $0.installed && $0.kind != "auto" } }
    /// Prompt 41: «✦ Auto» (nil = serveren har ikke Auto).
    var autoModel: ChatLLM27? { models.first { $0.kind == "auto" } }
    var skyModels: [ChatLLM27] { models.filter { $0.sky } }

    /// Innstillingene som gjelder nå (samtalen, eller nye samtaler).
    var params: ChatSettings27 { curId == nil ? defaults : settings }

    var empty: Bool { msgs.isEmpty && !busy }

    /* ---------- Oppstart ---------- */

    func boot(_ store: Store) async {
        api = store.api
        let acct: String = store.account?.id ?? "-"
        if booted != acct {
            booted = acct
            reset()
            theme = UserDefaults.standard.string(forKey: themeKey) ?? "papir"
            model = UserDefaults.standard.string(forKey: modelKey) ?? ""
            await loadUserSettings(store)
            await loadModels(store)
            await loadChats(store)
        }
        if let pr = pendingPrompt {
            pendingPrompt = nil
            send(pr, store)
        }
    }

    private func reset() {
        models = []
        pinned = []; folders = []; chats = []; hits = []
        curId = nil; title = ""; msgs = []
        settings = ChatSettings27(); defaults = ChatSettings27()
        input = ""; attach = []; editIndex = nil
        busy = false; streamText = ""; sheet = nil; notice = ""
        loadedChats = false
    }

    func loadUserSettings(_ store: Store) async {
        guard let d = try? await store.api.call("GET", "/bootstrap") else { return }
        let s: [String: Any] = JS.dict(JS.obj(d), "settings") ?? [:]
        myDataAllowed = JS.bool(s, "chat_my_data") ?? true
        askCloud = JS.bool(s, "chat_ask_cloud") ?? true
        defaultModel = JS.str(s, "chat_default_model") ?? ""
        if let t = JS.str(s, "chat_theme"), t == "papir" || t == "noytral" { theme = t }
        if !myDataAllowed { dataOn = false }
    }

    func loadModels(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/chat/models", timeout: 20)
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var raw: [[String: Any]] = []
            var def: String = ""
            if let a = any as? [Any] {
                raw = a.compactMap { $0 as? [String: Any] }
            } else if let o = any as? [String: Any] {
                raw = JS.list(o, "models")
                def = JS.str(o, "default") ?? ""
                ollamaInfo = JS.str(o, "ollama") ?? JS.str(o, "ollamaUrl") ?? ""
            }
            models = raw.compactMap { (o: [String: Any]) -> ChatLLM27? in
                guard let id = JS.str(o, "id") ?? JS.str(o, "name") else { return nil }
                return ChatLLM27(id: id, name: JS.str(o, "name") ?? id, kind: JS.str(o, "kind") ?? "lokal", provider: JS.str(o, "provider") ?? "ollama",
                                 size: JS.str(o, "size") ?? "", vision: JS.bool(o, "vision") ?? false, installed: JS.bool(o, "installed") ?? true)
            }
            // Prompt 41: «✦ Auto» – Glimt velger beste installerte/sky-modell per melding (GET /api/chat/models → auto).
            if let o = any as? [String: Any], let a = JS.dict(o, "auto") {
                let aid: String = JS.str(a, "id") ?? "auto"
                models.removeAll { $0.id == aid }
                models.insert(ChatLLM27(id: aid, name: JS.str(a, "label") ?? "✦ Auto", kind: "auto", provider: "glimt", size: "", vision: true, installed: true), at: 0)
                autoPicks = JS.dict(a, "picks") ?? [:]
                // Én gang: eksisterende brukere flyttes til Auto (autoMig). Senere fast valg gjelder.
                let migKey: String = AcctScope.key("fh_chat41_automig")
                if !UserDefaults.standard.bool(forKey: migKey) {
                    UserDefaults.standard.set(true, forKey: migKey)
                    model = aid
                    defaultModel = aid
                    UserDefaults.standard.set(aid, forKey: modelKey)
                }
                if defaultModel.isEmpty || defaultModel == "auto" { def = aid }
            }
            if model.isEmpty || !models.contains(where: { $0.id == model }) {
                let pref: String = !defaultModel.isEmpty ? defaultModel : def
                model = models.first(where: { $0.id == pref })?.id ?? localModels.first?.id ?? models.first?.id ?? ""
            }
            notice = ""
        } catch let e as APIError {
            notice = e.status == 404 ? "Serveren har ikke chat ennå. Oppdater homelab-serveren." : e.message
        } catch {
            notice = error.localizedDescription
        }
    }

    /* ---------- Historikk ---------- */

    private static func summary(_ o: [String: Any]) -> ChatSummary27? {
        guard let id = JS.str(o, "id") else { return nil }
        let up: Date = JS.date(o["updatedAt"]) ?? JS.date(o["updated_at"]) ?? Date()
        return ChatSummary27(id: id, title: JS.str(o, "title") ?? "Ny samtale", model: JS.str(o, "model") ?? "", updatedAt: up,
                             pinned: JS.bool(o, "pinned") ?? false, folderId: JS.str(o, "folderId") ?? JS.str(o, "folder_id") ?? "")
    }

    func loadChats(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/chat/chats", timeout: 20) else { loadedChats = true; return }
        let o: [String: Any] = JS.obj(d)
        let old: [String: Bool] = Dictionary(folders.map { ($0.id, $0.open) }, uniquingKeysWith: { a, _ in a })
        pinned = JS.list(o, "pinned").compactMap { ChatStore27.summary($0) }
        chats = JS.list(o, "chats").compactMap { ChatStore27.summary($0) }
        let raw: [ChatFolder27] = JS.list(o, "folders").compactMap { (f: [String: Any]) -> ChatFolder27? in
            guard let id = JS.str(f, "id") else { return nil }
            let list: [ChatSummary27] = JS.list(f, "chats").compactMap { ChatStore27.summary($0) }
            let name: String = JS.str(f, "name") ?? "Mappe"
            // Prompt 34: skanne-mappen er lukket som standard (Chat34Scans.swift).
            let sys: Bool = Chat34Scans.isScanFolder(f, name: name)
            let open: Bool = old[id] ?? JS.bool(f, "open") ?? !sys
            var folder: ChatFolder27 = ChatFolder27(id: id, name: name, open: open, chats: list)
            folder.sys = sys
            folder.pending = JS.int(f, "pending") ?? JS.int(f, "review") ?? JS.int(f, "needsReview") ?? 0
            return folder
        }
        folders = Chat34Scans.sorted(raw)
        loadedChats = true
    }

    /// Søk i samtaler (serveren, 200 ms pause).
    func searchHistory(_ store: Store) {
        searchTask?.cancel()
        let q: String = historyQuery.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { hits = []; return }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            if Task.isCancelled { return }
            let qq: String = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
            guard let d = try? await store.api.callAt("/api", "GET", "/chat/chats?q=\(qq)", timeout: 15) else { return }
            if Task.isCancelled { return }
            let o: [String: Any] = JS.obj(d)
            var all: [ChatSummary27] = JS.list(o, "pinned").compactMap { ChatStore27.summary($0) } + JS.list(o, "chats").compactMap { ChatStore27.summary($0) }
            for f in JS.list(o, "folders") { all += JS.list(f, "chats").compactMap { ChatStore27.summary($0) } }
            var seen: Set<String> = []
            self.hits = all.filter { seen.insert($0.id).inserted }.sorted { $0.updatedAt > $1.updatedAt }
        }
    }

    var allSummaries: [ChatSummary27] {
        var out: [ChatSummary27] = pinned + chats
        for f in folders { out += f.chats }
        return out
    }

    func open(_ c: ChatSummary27, _ store: Store) {
        stop()
        drop67()
        drawer = false
        editIndex = nil
        curId = c.id
        title = c.title
        if !c.model.isEmpty { model = c.model }
        msgs = []
        attach = []
        Haptics.shared.select()
        Task { await self.loadChat(c.id, store) }
    }

    func loadChat(_ id: String, _ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/chat/chats/" + Cal27Model.enc(id), timeout: 20) else { return }
        var o: [String: Any] = JS.obj(d)
        if let inner = JS.dict(o, "chat") { o = inner }
        guard curId == id else { return }
        title = JS.str(o, "title") ?? title
        if let m = JS.str(o, "model"), models.contains(where: { $0.id == m }) { model = m }
        settings = ChatSettings27.from(JS.dict(o, "settings"))
        msgs = JS.list(o, "messages").compactMap { (m: [String: Any]) -> ChatMsg27? in
            let role: String = JS.str(m, "role") ?? "user"
            if role == "system" { return nil }
            var text: String = JS.str(m, "content") ?? ""
            if text.isEmpty, let parts = m["content"] as? [Any] {
                text = parts.compactMap { ($0 as? [String: Any]).flatMap { JS.str($0, "text") } }.joined(separator: "\n")
            }
            var msg = ChatMsg27(role: role == "assistant" ? "assistant" : "user", content: text)
            msg.model = JS.str(m, "model") ?? ""
            msg.used = JS.strings(m, "used")
            msg.attach = JS.strings(m, "files")
            // Prompt 50: vedlegg med miniatyr (bilder i boblen), andre filer som piller.
            msg.att50 = Chat50File.list(JS.list(m, "attachments"))
            for f in msg.att50 where !f.isImage && !msg.attach.contains(f.name) { msg.attach.append(f.name) }
            // Prompt 52: tankegangen (svar) og miniatyrene (bruker). Bilder vises som miniatyr, ikke som «# Bilde 1.jpg».
            msg.think = JS.strings(m, "think")
            msg.thS = JS.num(m, "thS") ?? 0
            msg.attTh = JS.strings(m, "attTh")
            if !msg.attTh.isEmpty || msg.att50.contains(where: { $0.isImage }) { msg.attach.removeAll { Chat52.isImageName($0) } }
            // Prompt 31: kort og verktøy lagret i meldingen.
            if let cd = m["card"] as? [String: Any], let cj = try? JSONSerialization.data(withJSONObject: cd) {
                msg.card31 = String(data: cj, encoding: .utf8) ?? ""
            }
            if let tool = JS.str(m, "tool"), msg.used.isEmpty { msg.used = [tool] }
            // Prompt 41: brukte kilder og faktakort ligger i meta.
            let meta41: [String: Any]? = JS.dict(m, "meta")
            // Prompt 67: Glimt-svar (meta.glimt), så korte oppfølgere går til Glimt og tommelen vises når traceId finnes.
            if role == "assistant" && JS.bool(meta41, "glimt") == true {
                msg.glimt67 = true
                msg.stopped67 = JS.bool(meta41, "stopped") ?? false
                msg.traceId67 = JS.str(meta41, "traceId") ?? ""
                if msg.model.isEmpty { msg.model = Glimt31.name }
            }
            if msg.used.isEmpty { msg.used = JS.strings(meta41, "used") }
            msg.facts41 = ChatFact41.parse41(JS.list(meta41, "facts"))
            if role == "assistant" { Chat50.shared.apply(&msg, meta41) }
            if let tps = JS.num(m, "tokensPerSec") {
                msg.stats = ChatStore27.stats(tps: tps, ms: JS.num(m, "ms") ?? 0, stopped: false)
            }
            return msg
        }
        scrollTick += 1
    }

    func newChat() {
        stop()
        drop67()
        Convo67.shared.newChat()
        curId = nil
        title = ""
        msgs = []
        input = ""
        attach = []
        editIndex = nil
        drawer = false
        settings = defaults
        // Prompt 41: «Mine data» på i hver nye samtale, og Auto (eller valgt standard) for nye samtaler.
        dataOn = myDataAllowed
        if !defaultModel.isEmpty && models.contains(where: { $0.id == defaultModel }) { model = defaultModel }
        Haptics.shared.select()
    }

    func toggleFolder(_ f: ChatFolder27, _ store: Store) {
        guard let i = folders.firstIndex(where: { $0.id == f.id }) else { return }
        folders[i].open.toggle()
        let v: Bool = folders[i].open
        Task { _ = try? await store.api.callAt("/api", "PATCH", "/chat/folders/" + Cal27Model.enc(f.id), json: ["open": v]) }
    }

    /* ---------- ⋯ på en samtale ---------- */

    func openMenu(_ c: ChatSummary27) {
        menuChat = c
        renameText = c.title
        newFolder = ""
        delArm = false
        sheet = "menu"
    }

    private func patchChat(_ id: String, _ body: [String: Any], _ store: Store) async {
        _ = try? await store.api.callAt("/api", "PATCH", "/chat/chats/" + Cal27Model.enc(id), json: body)
        await loadChats(store)
    }

    func rename(_ store: Store) {
        guard let c = menuChat else { return }
        let t: String = renameText.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return }
        if curId == c.id { title = t }
        sheet = nil
        Task { await self.patchChat(c.id, ["title": t], store) }
    }

    func togglePin(_ store: Store) {
        guard let c = menuChat else { return }
        sheet = nil
        Task { await self.patchChat(c.id, ["pinned": !c.pinned], store) }
    }

    func move(to folderId: String, _ store: Store) {
        guard var c = menuChat else { return }
        c.folderId = folderId
        menuChat = c
        Haptics.shared.select()
        let v: Any = folderId.isEmpty ? (NSNull() as Any) : (folderId as Any)
        Task { await self.patchChat(c.id, ["folderId": v], store) }
    }

    func addFolder(_ store: Store) {
        let n: String = newFolder.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty, let c = menuChat else { return }
        newFolder = ""
        Task {
            guard let d = try? await store.api.callAt("/api", "POST", "/chat/folders", json: ["name": n]) else { self.flash("Fikk ikke laget mappen"); return }
            let o: [String: Any] = JS.obj(d)
            let id: String = JS.str(o, "id") ?? JS.str(JS.dict(o, "folder"), "id") ?? ""
            if !id.isEmpty {
                var cc: ChatSummary27 = c
                cc.folderId = id
                self.menuChat = cc
                await self.patchChat(c.id, ["folderId": id], store)
            } else {
                await self.loadChats(store)
            }
        }
    }

    func deleteChat(_ store: Store) {
        guard let c = menuChat else { return }
        if !delArm { delArm = true; Haptics.shared.warning(); return }
        sheet = nil
        delArm = false
        if curId == c.id { newChat() }
        Task {
            _ = try? await store.api.callAt("/api", "DELETE", "/chat/chats/" + Cal27Model.enc(c.id))
            await self.loadChats(store)
        }
    }

    /// Eksporter som Markdown: filen deles med delingsarket.
    func export(_ store: Store) {
        guard let c = menuChat else { return }
        sheet = nil
        Task {
            guard let d = try? await store.api.callAt("/api", "GET", "/chat/chats/" + Cal27Model.enc(c.id) + "/export", timeout: 20) else { self.flash("Fikk ikke eksportert"); return }
            let safe: String = String(c.title.filter { $0.isLetter || $0.isNumber || $0 == " " || $0 == "-" }.prefix(40)).trimmingCharacters(in: .whitespaces)
            let url: URL = FileManager.default.temporaryDirectory.appendingPathComponent((safe.isEmpty ? "samtale" : safe) + ".md")
            do {
                try d.write(to: url)
                try? await Task.sleep(nanoseconds: 400_000_000)
                self.share = ChatShare27(url: url)
            } catch {
                self.flash("Fikk ikke lagret filen")
            }
        }
    }

    func shareLink(_ store: Store) {
        guard let c = menuChat else { return }
        sheet = nil
        Task {
            guard let d = try? await store.api.callAt("/api", "POST", "/chat/chats/" + Cal27Model.enc(c.id) + "/share", json: [:]),
                  let s = JS.str(JS.obj(d), "url"), let u = URL(string: s) else { self.flash("Fikk ikke laget lenke"); return }
            UIPasteboard.general.string = s
            try? await Task.sleep(nanoseconds: 400_000_000)
            self.share = ChatShare27(url: u)
        }
    }

    /* ---------- Modell og innstillinger ---------- */

    func select(_ m: ChatLLM27, _ store: Store) {
        model = m.id
        sheet = nil
        Haptics.shared.select()
        UserDefaults.standard.set(m.id, forKey: modelKey)
        // Siste valg blir standard for nye samtaler.
        defaultModel = m.id
        Task { _ = try? await store.api.call("PUT", "/settings", json: ["chat_default_model": m.id]) }
    }

    /// Endrer ⚙-innstillingene: lagres på samtalen (PATCH) eller som standard for nye.
    func setParams(_ store: Store, _ change: (inout ChatSettings27) -> Void) {
        if let id = curId {
            change(&settings)
            let body: [String: Any] = ["settings": settings.json]
            paramsTask?.cancel()
            paramsTask = Task {
                try? await Task.sleep(nanoseconds: 500_000_000)
                if Task.isCancelled { return }
                _ = try? await store.api.callAt("/api", "PATCH", "/chat/chats/" + Cal27Model.enc(id), json: body)
            }
        } else {
            change(&defaults)
        }
    }

    func setTheme(_ t: String, _ store: Store) {
        theme = t
        UserDefaults.standard.set(t, forKey: themeKey)
        Haptics.shared.select()
        Task { _ = try? await store.api.call("PUT", "/settings", json: ["chat_theme": t]) }
    }

    func toggleData() {
        if !myDataAllowed {
            flash("Slått av i Innstillinger → AI og tolkning")
            return
        }
        dataOn.toggle()
        Haptics.shared.select()
    }

    func flash(_ t: String) {
        toast = t
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            if !Task.isCancelled { self.toast = "" }
        }
    }

    func copy(_ m: ChatMsg27) {
        UIPasteboard.general.string = m.content
        copied = m.id
        Haptics.shared.success()
        Task {
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            if self.copied == m.id { self.copied = nil }
        }
    }

    /* ---------- Sende ---------- */

    nonisolated static func stats(tps: Double, ms: Double, stopped: Bool) -> String {
        let sec: String = String(format: "%.1f", ms / 1000).replacingOccurrences(of: ".", with: ",")
        return (stopped ? "Stoppet · " : "") + "\(Int(tps.rounded())) tok/s · \(sec) s"
    }

    /// Ny melding fra skrivefeltet (eller et forslag).
    func send(_ raw: String, _ store: Store, data: Bool? = nil) {
        if busy { return }
        let t: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty && attach.isEmpty { return }
        // Prompt 50: send er av til alle vedlegg er lastet opp.
        if attach.contains(where: { $0.uploading }) { flash("Venter på at vedleggene lastes opp …"); return }
        if model.isEmpty {
            flash(notice.isEmpty ? "Ingen modell er valgt" : notice)
            return
        }
        if let d = data, d, myDataAllowed { dataOn = true }
        var m = ChatMsg27(role: "user", content: t)
        m.attach = attach.filter { $0.kind != "img" }.map { $0.name }
        // Prompt 50: opplastede bilder sendes som id (attachments) og vises som miniatyr; base64 bare for eldre server.
        m.images = attach.filter { $0.kind == "img" && $0.fileId.isEmpty && !$0.b64.isEmpty }.map { $0.b64 }
        m.att50 = attach.filter { $0.kind == "img" && !$0.fileId.isEmpty }.map { (a: ChatAttach27) -> Chat50File in
            Chat50File(id: a.fileId, name: a.name, mime: a.mime.isEmpty ? "image/jpeg" : a.mime, kind: "image", thumb: a.thumb,
                       url: "/api/chat/files/" + a.fileId, preview: a.id)
        }
        // Prompt 52: miniatyr (maks 220 px) på meldingen, så historikken viser bildet uten å hente originalen (Chat52Think.swift).
        m.attTh = Chat52.thumbs(attach)
        msgs.append(m)
        if title.isEmpty { title = String(t.prefix(48)) }
        input = ""
        // Prompt 67: Glimt strømmer svaret (statuslinje, Stopp) og forstår oppfølgere; eldre server → prompt 31 under.
        if toolRun67(t, store) { return }
        // Prompt 31: vær, kalender, avganger … svarer Glimt med et kort (Chat31Cards.swift).
        if toolRun31(t, store) { return }
        run(store, editFrom: nil)
    }

    /// Prompt 31: Glimt-ruteren ga ikke svar – strøm fra valgt modell som vanlig.
    func runAfterTool31(_ store: Store) {
        run(store, editFrom: nil)
    }

    /// Nytt svar på det siste spørsmålet.
    func regenerate(_ store: Store) {
        if busy { return }
        guard let i = msgs.lastIndex(where: { $0.role == "assistant" }) else { return }
        msgs = Array(msgs.prefix(i))
        run(store, editFrom: i)
    }

    func startEdit(_ i: Int) {
        guard msgs.indices.contains(i) else { return }
        editIndex = i
        editText = msgs[i].content
    }

    /// Lagre og send på nytt fra meldingen som ble endret.
    func saveEdit(_ store: Store) {
        guard let i = editIndex, msgs.indices.contains(i) else { return }
        let t: String = editText.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return }
        var m: ChatMsg27 = msgs[i]
        m.content = t
        msgs = Array(msgs.prefix(i)) + [m]
        editIndex = nil
        run(store, editFrom: i)
    }

    private func body(editFrom: Int?) -> [String: Any] {
        let lastUser: Int = msgs.lastIndex(where: { $0.role == "user" }) ?? -1
        var list: [[String: Any]] = []
        for i in msgs.indices {
            let m: ChatMsg27 = msgs[i]
            var o: [String: Any] = ["role": m.role, "content": m.content]
            if i == lastUser && !m.images.isEmpty { o["images"] = m.images }
            if i == lastUser && !m.att50.isEmpty { o["attachments"] = m.att50.map { $0.id } }
            // Prompt 52: miniatyrene lagres med meldingen. Tankegangen (think/thS) sendes aldri tilbake til modellen.
            if i == lastUser && !m.attTh.isEmpty { o["attTh"] = Array(m.attTh.prefix(4)) }
            list.append(o)
        }
        var b: [String: Any] = ["model": model, "messages": list, "settings": params.json, "webSearch": webOn,
                                "myData": dataOn && myDataAllowed, "files": attach.filter { !$0.fileId.isEmpty }.map { $0.fileId }]
        if let id = curId { b["chatId"] = id }
        if let e = editFrom { b["editFrom"] = e }
        return b
    }

    private func run(_ store: Store, editFrom: Int?) {
        var tools: [String] = []
        if dataOn && myDataAllowed { tools += ["Finans", "Kalender", "Huskeliste"] }
        if webOn { tools.append("Nettsøk") }
        tools += attach.map { $0.name }
        streamTool = tools
        stream(body(editFrom: editFrom), store)
    }

    private func stream(_ b: [String: Any], _ store: Store) {
        guard let url = URL(string: store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/chat/send") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 300
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let tok = store.api.token { req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try? JSONSerialization.data(withJSONObject: b)
        pendingBody = b
        Chat50.shared.clearMeta()
        busy = true
        finished = false
        streamText = ""
        doneStats = [:]
        think52 = []
        think52Start = nil
        think52S = nil
        streamModel = model
        t0 = Date()
        scrollTick += 1
        let request: URLRequest = req
        runTask = Task {
            do {
                let (bytes, res) = try await URLSession.shared.bytes(for: request)
                let code: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
                if code >= 400 {
                    var data = Data()
                    for try await x in bytes {
                        data.append(x)
                        if data.count > 100_000 { break }
                    }
                    let o: [String: Any] = JS.obj(data)
                    if code == 409 && JS.bool(o, "needsConfirm") == true {
                        self.askGuard(o)
                        return
                    }
                    self.fail(JS.str(o, "error") ?? (code == 404 ? "Serveren har ikke chat ennå." : "Feil \(code)"))
                    return
                }
                var event: String = "message"
                for try await line in bytes.lines {
                    if Task.isCancelled { break }
                    if line.hasPrefix("event:") {
                        event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                        continue
                    }
                    if line.hasPrefix("data:") {
                        let payload: String = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                        self.handle(event, payload)
                        event = "message"
                    }
                }
                self.finish(stopped: Task.isCancelled, store)
            } catch {
                if Task.isCancelled || (error as? URLError)?.code == .cancelled {
                    self.finish(stopped: true, store)
                } else {
                    self.fail(error.localizedDescription)
                }
            }
        }
    }

    private func handle(_ event: String, _ payload: String) {
        if payload == "[DONE]" { return }
        let o: [String: Any] = JS.obj(Data(payload.utf8))
        switch event {
        case "meta":
            if let id = JS.str(o, "chatId") { curId = id }
            Chat50.shared.noteMeta(o)
        case "delta", "message":
            if let t = o["text"] as? String {
                streamText += t
            } else if let ch = (o["choices"] as? [Any])?.first as? [String: Any], let dd = JS.dict(ch, "delta"), let t = dd["content"] as? String {
                streamText += t
            }
        case "thinking":
            // Prompt 52: ett steg per hendelse (modellens egen tenkning eller Glimts steg).
            if think52Start == nil { think52Start = Date().addingTimeInterval(-(JS.num(o, "s") ?? 0)) }
            if let st = JS.str(o, "step"), !st.isEmpty { think52.append(st) }
        case "thinking_done":
            think52S = JS.num(o, "thS") ?? think52Start.map { Date().timeIntervalSince($0) }
        case "done":
            doneStats = o
        case "error":
            let msg: String = JS.str(o, "error") ?? "Noe gikk galt"
            streamText += (streamText.isEmpty ? "" : "\n\n") + msg
        default:
            break
        }
    }

    private func finish(stopped: Bool, _ store: Store) {
        if finished { return }
        finished = true
        let elapsed: Double = Date().timeIntervalSince(t0) * 1000
        let ms: Double = JS.num(doneStats, "ms") ?? elapsed
        let tps: Double = JS.num(doneStats, "tokensPerSec") ?? (Double(streamText.count) / 4) / Swift.max(0.5, ms / 1000)
        let used: [String] = JS.strings(doneStats, "used")
        if !streamText.isEmpty || stopped {
            var a = ChatMsg27(role: "assistant", content: streamText + (stopped ? " …" : ""))
            a.model = streamModel
            a.stats = ChatStore27.stats(tps: tps, ms: ms, stopped: stopped)
            a.used = used
            a.facts41 = ChatFact41.parse41(JS.list(doneStats, "facts"))
            Chat50.shared.apply(&a, doneStats)
            // Prompt 52: tankegangen lagres på svaret (fra done, ellers det som kom underveis).
            let th: [String] = JS.strings(doneStats, "think")
            a.think = th.isEmpty ? think52 : th
            a.thS = JS.num(doneStats, "thS") ?? think52S ?? think52Start.map { Date().timeIntervalSince($0) } ?? 0
            msgs.append(a)
        }
        think52 = []
        think52Start = nil
        think52S = nil
        busy = false
        streamText = ""
        streamTool = []
        attach = []
        pendingBody = nil
        runTask = nil
        scrollTick += 1
        Task { await self.loadChats(store) }
    }

    private func fail(_ message: String) {
        finished = true
        busy = false
        streamText = ""
        streamTool = []
        runTask = nil
        var a = ChatMsg27(role: "assistant", content: "Jeg får ikke svar fra " + current.label + " akkurat nå. " + message)
        a.model = streamModel
        msgs.append(a)
        Haptics.shared.error()
    }

    func stop() {
        runTask?.cancel()
        stop67()
    }

    /* ---------- «Sende til …?» ---------- */

    private func askGuard(_ o: [String: Any]) {
        finished = true
        busy = false
        streamText = ""
        runTask = nil
        guardModel = JS.str(o, "model") ?? current.label
        guardLeaves = JS.strings(o, "leaves")
        if guardLeaves.isEmpty { guardLeaves = ["Meldingen din"] }
        guardHasData = dataOn && myDataAllowed
        guardRemember = false
        sheet = "guard"
    }

    func guardSend(_ store: Store, withoutData: Bool) {
        guard var b = pendingBody else { sheet = nil; return }
        sheet = nil
        b["confirmCloud"] = true
        if withoutData {
            b["myData"] = false
            b["withoutMyData"] = true
            streamTool = streamTool.filter { !["Finans", "Kalender", "Huskeliste"].contains($0) }
        }
        if guardRemember {
            settings.skipCloudAsk = true
            defaults.skipCloudAsk = curId == nil ? true : defaults.skipCloudAsk
            var s: [String: Any] = (b["settings"] as? [String: Any]) ?? [:]
            s["skipCloudAsk"] = true
            b["settings"] = s
            if let id = curId {
                let body: [String: Any] = ["settings": settings.json]
                Task { _ = try? await store.api.callAt("/api", "PATCH", "/chat/chats/" + Cal27Model.enc(id), json: body) }
            }
        }
        stream(b, store)
    }

    /// Bytter til første lokale modell og sender på nytt.
    func guardLocal(_ store: Store) {
        guard var b = pendingBody else { sheet = nil; return }
        sheet = nil
        guard let loc = localModels.first else { flash("Ingen lokale modeller er installert"); return }
        model = loc.id
        b["model"] = loc.id
        stream(b, store)
    }

    var guardLocalName: String { localModels.first?.id ?? "lokal modell" }

    /* ---------- Vedlegg ---------- */

    func addImage(_ img: UIImage) {
        let maxSide: CGFloat = 2048
        let s: CGSize = img.size
        let scale: CGFloat = Swift.min(1, maxSide / Swift.max(1, Swift.max(s.width, s.height)))
        let size: CGSize = CGSize(width: s.width * scale, height: s.height * scale)
        let r = UIGraphicsImageRenderer(size: size)
        let out: UIImage = r.image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        guard let d = out.jpegData(compressionQuality: 0.85) else { return }
        let n: Int = attach.filter { $0.kind == "img" }.count + 1
        sheet = nil
        // Prompt 50: lastes opp med en gang (miniatyr + fremdrift, Chat50Attach.swift). Serveren velger vision-modell eller
        // lokal OCR når valgt modell ikke ser bilder («Lest med …» under svaret).
        guard let api else {
            attach.append(ChatAttach27(name: "Bilde \(n).jpg", kind: "img", b64: d.base64EncodedString()))
            return
        }
        Chat50.shared.upload(ChatAttach27(name: "Bilde \(n).jpg", kind: "img", mime: "image/jpeg"), data: d, preview: out, api: api)
    }

    /// Fil fra Filer: lastes opp (POST /api/chat/files) og sendes som fil-id.
    func addFile(_ url: URL, _ store: Store, toKnowledge: Bool) {
        let ok: Bool = url.startAccessingSecurityScopedResource()
        defer { if ok { url.stopAccessingSecurityScopedResource() } }
        guard let d = try? Data(contentsOf: url) else { flash("Fikk ikke lest filen"); return }
        let name: String = url.lastPathComponent
        let mime: String = ChatStore27.mime(url.pathExtension)
        sheet = toKnowledge ? "kb" : nil
        // Prompt 50: vedlegg til meldingen får miniatyrkort med fremdrift (Chat50Attach.swift).
        if !toKnowledge {
            Chat50.shared.upload(ChatAttach27(name: name, kind: "file", mime: mime), data: d, preview: nil, api: store.api)
            return
        }
        Task {
            do {
                let r: Data = try await store.api.upload("/chat/files", parts: [API.Part(name: "file", filename: name, mime: mime, data: d)], prefix: "/api")
                let o: [String: Any] = JS.obj(r)
                let id: String = JS.str(o, "id") ?? ""
                if toKnowledge {
                    await self.loadKnowledge(store)
                    self.flash("Lastet opp til kunnskapsbasen")
                } else {
                    self.attach.append(ChatAttach27(name: JS.str(o, "name") ?? name, kind: "file", fileId: id))
                }
            } catch {
                self.flash("Fikk ikke lastet opp " + name)
            }
        }
    }

    nonisolated static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": return "application/pdf"
        case "txt", "md": return "text/plain"
        case "csv": return "text/csv"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "doc": return "application/msword"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
        }
    }

    func removeAttach(_ a: ChatAttach27) { attach.removeAll { $0.id == a.id } }

    func loadKnowledge(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/chat/knowledge", timeout: 20) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var raw: [[String: Any]] = []
        if let a = any as? [Any] { raw = a.compactMap { $0 as? [String: Any] } } else if let o = any as? [String: Any] {
            raw = JS.list(o, "documents")
            if raw.isEmpty { raw = JS.list(o, "files") }
            if raw.isEmpty { raw = JS.list(o, "items") }
        }
        knowledge = raw.compactMap { (o: [String: Any]) -> ChatDoc27? in
            guard let id = JS.str(o, "id") else { return nil }
            let name: String = JS.str(o, "name") ?? JS.str(o, "filename") ?? JS.str(o, "title") ?? id
            var sub: String = JS.str(o, "description") ?? JS.str(o, "sub") ?? ""
            if sub.isEmpty, let sz = JS.num(o, "size") { sub = ChatStore27.size(sz) }
            return ChatDoc27(id: id, name: name, sub: sub)
        }
    }

    nonisolated static func size(_ b: Double) -> String {
        if b >= 1_000_000 { return String(format: "%.1f MB", b / 1_000_000).replacingOccurrences(of: ".", with: ",") }
        return "\(Int((b / 1000).rounded())) kB"
    }

    func toggleDoc(_ d: ChatDoc27) {
        if let i = attach.firstIndex(where: { $0.kind == "doc" && $0.fileId == d.id }) {
            attach.remove(at: i)
        } else {
            attach.append(ChatAttach27(name: d.name, kind: "doc", fileId: d.id))
        }
        Haptics.shared.select()
    }

    /* ---------- Modeller: hent og slett ---------- */

    func pull(_ name: String, _ store: Store) {
        let n: String = name.trimmingCharacters(in: .whitespaces)
        if n.isEmpty || pulls[n] != nil { return }
        pulls[n] = 0
        guard let url = URL(string: store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/chat/models/pull") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 3600
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let tok = store.api.token { req.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["name": n])
        let request: URLRequest = req
        Task {
            do {
                let (bytes, res) = try await URLSession.shared.bytes(for: request)
                let code: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
                if code >= 400 {
                    self.pulls[n] = nil
                    self.flash(code == 403 ? "Bare administrator kan hente modeller" : "Fikk ikke hentet \(n)")
                    return
                }
                for try await line in bytes.lines where line.hasPrefix("data:") {
                    let o: [String: Any] = JS.obj(Data(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces).utf8))
                    if let e = JS.str(o, "error") { self.pulls[n] = nil; self.flash(e); return }
                    if let c = JS.num(o, "completed"), let t = JS.num(o, "total"), t > 0 { self.pulls[n] = Swift.min(100, c / t * 100) }
                    if JS.str(o, "status") == "success" { self.pulls[n] = 100 }
                }
                self.pulls[n] = nil
                await self.loadModels(store)
                self.flash(n + " er installert")
            } catch {
                self.pulls[n] = nil
                self.flash("Fikk ikke hentet \(n)")
            }
        }
    }

    func deleteModel(_ m: ChatLLM27, _ store: Store) {
        if modelDelArm != m.id { modelDelArm = m.id; Haptics.shared.warning(); return }
        modelDelArm = nil
        Task {
            do {
                _ = try await store.api.callAt("/api", "DELETE", "/chat/models/" + Cal27Model.enc(m.id))
                await self.loadModels(store)
                self.flash(m.id + " er slettet")
            } catch let e as APIError {
                self.flash(e.status == 403 ? "Bare administrator kan slette modeller" : e.message)
            } catch {
                self.flash(error.localizedDescription)
            }
        }
    }
}

extension Store {
    /// Prompt 27: åpner Chat. Med tekst startes en ny samtale og teksten sendes med en gang (✦ AI i Google-feltet på Hjem).
    func openChat(prompt: String? = nil) {
        let s: ChatStore27 = ChatStore27.shared
        let t: String = (prompt ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty {
            s.newChat()
            s.pendingPrompt = t
            s.promptTick += 1
        }
        paperGo("chat")
    }
}
