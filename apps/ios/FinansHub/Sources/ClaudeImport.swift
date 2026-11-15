import SwiftUI
import UniformTypeIdentifiers

/* ---------------- Prompt 43: AI-kontroll → Importer – minne og samtaler fra Claude ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-chat-claude-import.md og design/Claude Import.dc.html (fanen «Importer» i AI Kontroll).
 Steg 1: forklaring + fil (.zip eller conversations.json, maks 200 MB) + minne (valgfritt). Fila leses på serveren:
   POST /api/chat/import/claude (multipart: file, memory) → {importId, conversations, messages, projects, memory[], range, items[]}.
 Steg 2: forhåndsvisning (søk, Alle/Ingen, «Importert før» ikke valgt, 60 om gangen, minnepunkter, brytere).
   POST /api/chat/import/claude/:importId/commit {conversationIds[], memory[]}.
 Ferdig: «✓ N samtaler og M minnepunkter importert», Åpne Chat, Importer mer, Angre importen (POST …/:importId/undo). */

struct Claude43Conv: Identifiable, Hashable {
    let id: String
    let title: String
    let date: String
    let count: Int
    let before: Bool
}

@MainActor
@Observable
final class Claude43 {
    static let shared = Claude43()

    var step: Int = 1
    var busy: Bool = false
    var error: String = ""
    var steps: [String] = []
    var memoryText: String = ""
    var importId: String = ""
    var convs: [Claude43Conv] = []
    var memory: [String] = []
    var nConv: Int = 0
    var nMsg: Int = 0
    var projects: [String] = []
    var range: String = ""
    var picked: Set<String> = []
    var pickedMem: Set<String> = []
    var doConvs: Bool = true
    var doMem: Bool = true
    var skipBefore: Bool = true
    var result: String = ""
    var resultSub: String = ""

    static let maxBytes: Int = 200 * 1024 * 1024

    func reset() {
        step = 1
        busy = false
        error = ""
        steps = []
        importId = ""
        convs = []
        memory = []
        picked = []
        pickedMem = []
        result = ""
        resultSub = ""
    }

    func upload(_ url: URL?, onlyMemory: Bool, _ store: Store) {
        error = ""
        steps = []
        var parts: [API.Part] = []
        let t0: Date = Date()
        if let url {
            let access: Bool = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let size: Int = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if size > Claude43.maxBytes { error = "Fila er større enn 200 MB."; return }
            guard let d = try? Data(contentsOf: url) else { error = "Fikk ikke lest fila."; return }
            let isZip: Bool = d.starts(with: [0x50, 0x4b])
            let isJson: Bool = url.pathExtension.lowercased() == "json"
            if !isZip && !isJson { error = "Fila er ikke en gyldig ZIP"; return }
            parts.append(API.Part(name: "file", filename: url.lastPathComponent, mime: isZip ? "application/zip" : "application/json", data: d))
            steps.append("✓ Leste \(url.lastPathComponent) · \(ByteCountFormatter.string(fromByteCount: Int64(d.count), countStyle: .file))")
        }
        let mem: String = memoryText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !mem.isEmpty { parts.append(API.Part.text("memory", mem)) }
        if onlyMemory { parts.append(API.Part.text("onlyMemory", "1")) }
        if parts.isEmpty { error = "Velg en fil eller lim inn minnet først."; return }
        busy = true
        Task { @MainActor in
            defer { self.busy = false }
            do {
                let d: Data = try await store.api.upload("/chat/import/claude", parts: parts, prefix: "/api", timeout: 300)
                let o: [String: Any] = JS.obj(d)
                let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
                for s in JS.list(o, "steps") { self.steps.append("✓ " + (JS.str(s, "text") ?? "") + (JS.int(s, "ms").map { " \($0) ms" } ?? "")) }
                self.importId = JS.str(o, "importId") ?? JS.str(o, "id") ?? ""
                self.convs = JS.list(o, "items").map { (r: [String: Any]) -> Claude43Conv in
                    Claude43Conv(id: JS.str(r, "id") ?? JS.str(r, "uuid") ?? UUID().uuidString, title: JS.str(r, "title") ?? JS.str(r, "name") ?? "Uten tittel",
                                 date: JS.str(r, "date") ?? JS.str(r, "updated_at") ?? JS.str(r, "up") ?? "",
                                 count: JS.int(r, "messages") ?? JS.int(r, "count") ?? 0,
                                 before: JS.bool(r, "imported") ?? JS.bool(r, "before") ?? JS.bool(r, "importedBefore") ?? false)
                }
                self.memory = JS.strings(o, "memory")
                self.nConv = JS.int(o, "conversations") ?? self.convs.count
                self.nMsg = JS.int(o, "messages") ?? self.convs.reduce(0) { $0 + $1.count }
                self.projects = JS.strings(o, "projects")
                if let r = JS.dict(o, "range") {
                    self.range = "Fra " + Claude43.day(JS.str(r, "from")) + " til " + Claude43.day(JS.str(r, "to"))
                } else { self.range = JS.str(o, "range") ?? "" }
                if self.steps.isEmpty { self.steps.append("✓ Fant \(self.nConv) samtaler · \(ms) ms") }
                self.picked = Set(self.convs.filter { !$0.before }.map(\.id))
                self.pickedMem = Set(self.memory)
                self.doConvs = !onlyMemory && !self.convs.isEmpty
                self.step = 2
            } catch let e as APIError {
                if e.status == 404 { self.error = "Serveren kan ikke importere fra Claude ennå (oppdater Homelab)." }
                else if e.status == 413 { self.error = "Fila er større enn 200 MB." }
                else { self.error = e.message }
            } catch { self.error = error.localizedDescription }
        }
    }

    /// Liten eksempel-eksport (to samtaler og minne) for å prøve flyten.
    func sample(_ store: Store) {
        let json: String = """
        [{"uuid":"ex-1","name":"Plan for homelab-oppgradering","created_at":"2026-01-20T10:00:00Z","updated_at":"2026-01-20T10:20:00Z","chat_messages":[{"sender":"human","text":"Hva bør jeg oppgradere først?"},{"sender":"assistant","text":"Start med lagringen: **mer disk** og hardlinks mellom nedlastinger og bibliotek."}]},
         {"uuid":"ex-2","name":"Middagsforslag uke 42","created_at":"2026-10-12T17:00:00Z","updated_at":"2026-10-12T17:05:00Z","chat_messages":[{"sender":"human","text":"Fem middager uten fisk?"},{"sender":"assistant","text":"Taco, lasagne, kyllingwok, linsesuppe og pizza."}]}]
        """
        let url: URL = FileManager.default.temporaryDirectory.appendingPathComponent("conversations.json")
        try? Data(json.utf8).write(to: url)
        if memoryText.isEmpty { memoryText = "Bruker heter Sebastian\nFølger Papir-temaet\nHar homelab på home.kristo.no" }
        upload(url, onlyMemory: false, store)
    }

    func commit(_ store: Store) {
        guard !importId.isEmpty || doMem else { return }
        busy = true
        error = ""
        let ids: [String] = doConvs ? convs.filter { picked.contains($0.id) && !(skipBefore && $0.before) }.map(\.id) : []
        let mem: [String] = doMem ? memory.filter { pickedMem.contains($0) } : []
        let skipped: Int = convs.filter { $0.before && skipBefore }.count
        Task { @MainActor in
            defer { self.busy = false }
            do {
                let path: String = "/chat/import/claude/" + (self.importId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? self.importId) + "/commit"
                let d: Data = try await store.api.callAt("/api", "POST", path, json: ["conversationIds": ids, "memory": mem], timeout: 300)
                let o: [String: Any] = JS.obj(d)
                let nc: Int = JS.int(o, "conversations") ?? JS.int(o, "imported") ?? ids.count
                let nm: Int = JS.int(o, "memory") ?? mem.count
                let sk: Int = JS.int(o, "skipped") ?? skipped
                Haptics.shared.success()
                self.result = "✓ \(nc) samtaler og \(nm) minnepunkter importert"
                self.resultSub = "Samtalene ligger i mappen «Claude» i Chat. Minnet ligger under Chat → ⚙ → Minne." + (sk > 0 ? " \(sk) var importert før og ble hoppet over." : "")
                self.step = 3
            } catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
        }
    }

    func undo(_ store: Store) {
        guard !importId.isEmpty else { return }
        busy = true
        Task { @MainActor in
            defer { self.busy = false }
            do {
                _ = try await store.api.callAt("/api", "POST", "/chat/import/claude/" + self.importId + "/undo", json: [:], timeout: 120)
                Haptics.shared.success()
                store.flash("Importen er angret")
                self.reset()
            } catch { self.error = (error as? APIError)?.message ?? error.localizedDescription }
        }
    }

    static func day(_ s: String?) -> String {
        guard let s, let d = JS.date(s) else { return s ?? "" }
        return JS.fmt(d, "d. MMM yyyy")
    }
}

struct ClaudeImport43Tab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var c: Claude43 { Claude43.shared }
    @State private var picking: Bool = false
    @State private var q: String = ""
    @State private var limit: Int = 60

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch c.step {
            case 2: preview
            case 3: done
            default: intro
            }
            if !c.error.isEmpty {
                Text(c.error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.zip, .json], allowsMultipleSelection: false) { (r: Result<[URL], Error>) in
            if case .success(let urls) = r, let u = urls.first { c.upload(u, onlyMemory: false, store) }
        }
    }

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) { content() }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            card {
                HStack(spacing: 12) {
                    Text("✳").font(.dyn51(size: 22, weight: .bold)).foregroundStyle(Color(hex: "#d97757"))
                        .frame(width: 44, height: 44).background(Color(hex: "#d97757").opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Importer fra Claude").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                        Text("Samtaler havner i Chat i mappen «Claude». Minnet brukes av Chat og Glimt.").font(PF.ui(12.5)).foregroundStyle(p.mut)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            PLabel(text: "Slik eksporterer du fra Claude").padding(.leading, 4)
            card {
                num(1, "claude.ai → Innstillinger → Personvern → Eksporter data", "Mobil: profil → Innstillinger → Personvern.")
                num(2, "E-post med lenke, gyldig 24 timer", "Last ned ZIP-fila.")
                num(3, "Velg den her", "Leser conversations.json, projects.json og minnet hvis det ligger med. Alt lagres på hjemmeserveren.")
                num(4, "Minne", "Claude → Innstillinger → Minne → Vis og rediger → kopier teksten og lim inn under hvis den ikke er i ZIP-fila.")
            }
            Button { Haptics.shared.tap(); picking = true } label: {
                VStack(spacing: 4) {
                    Image(systemName: "square.and.arrow.down").font(.dyn51(size: 20, weight: .semibold))
                    Text(c.busy ? "Leser fila …" : "Velg .zip eller conversations.json").font(PF.ui(14, .bold))
                    Text("Maks 200 MB").font(PF.ui(11.5)).foregroundStyle(p.mut)
                }
                .foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 110)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(p.ink.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
            }
            .buttonStyle(.plain)
            .disabled(c.busy)
            ForEach(c.steps, id: \.self) { (s: String) in Text(s).font(PF.mono(11, bold: false)).foregroundStyle(p.mut) }
            PLabel(text: "Minne (valgfritt)").padding(.leading, 4)
            TextEditor(text: Binding<String>(get: { c.memoryText }, set: { c.memoryText = $0 }))
                .font(PF.ui(14)).foregroundStyle(p.ink)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 110)
                .padding(10).background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text("Ett punkt per linje.").font(PF.ui(11.5)).foregroundStyle(p.mut)
            HStack(spacing: 8) {
                Button { c.upload(nil, onlyMemory: true, store) } label: {
                    Text("Importer bare minnet").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 44).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(c.busy || c.memoryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button { c.sample(store) } label: {
                    Text("Prøv med en eksempel-eksport").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 44).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(c.busy)
            }
        }
    }

    private func num(_ n: Int, _ t: String, _ d: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)").font(PF.ui(13, .bold)).foregroundStyle(p.bg).frame(width: 26, height: 26)
                .background(p.ink, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(d).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var preview: some View {
        let list: [Claude43Conv] = c.convs.filter { q.isEmpty || $0.title.localizedCaseInsensitiveContains(q) }
        let nPick: Int = c.doConvs ? c.convs.filter { c.picked.contains($0.id) && !(c.skipBefore && $0.before) }.count : 0
        let nMem: Int = c.doMem ? c.pickedMem.count : 0
        return VStack(alignment: .leading, spacing: 12) {
            ForEach(c.steps, id: \.self) { (s: String) in Text(s).font(PF.mono(11, bold: false)).foregroundStyle(p.mut) }
            card {
                HStack(spacing: 0) {
                    stat("\(c.nConv)", "samtaler")
                    stat("\(c.nMsg)", "meldinger")
                    stat("\(c.projects.count)", "prosjekter")
                    stat("\(c.memory.count)", "minnepunkter")
                }
                if !c.range.isEmpty || !c.projects.isEmpty {
                    Text([c.range, c.projects.isEmpty ? "" : "prosjekter: " + c.projects.joined(separator: ", ")].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(PF.ui(12)).foregroundStyle(p.mut)
                }
            }
            if !c.convs.isEmpty {
                HStack {
                    PLabel(text: "Samtaler")
                    Spacer()
                    Button("Alle") { c.picked = Set(c.convs.map(\.id)) }.font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                    Button("Ingen") { c.picked = [] }.font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).padding(.leading, 10)
                }
                .padding(.horizontal, 4)
                TextField("Søk i titler", text: $q).font(PF.ui(14.5)).foregroundStyle(p.ink)
                    .padding(.horizontal, 14).frame(height: 44).background(p.card, in: Capsule())
                VStack(spacing: 0) {
                    ForEach(list.prefix(limit)) { (cv: Claude43Conv) in
                        Button {
                            Haptics.shared.select()
                            if c.picked.contains(cv.id) { c.picked.remove(cv.id) } else { c.picked.insert(cv.id) }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: c.picked.contains(cv.id) ? "checkmark.square.fill" : "square").font(.dyn51(size: 18)).foregroundStyle(c.picked.contains(cv.id) ? p.ink : p.mut)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(cv.title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                                    Text([Claude43.day(cv.date), "\(cv.count) meldinger", cv.before ? "Importert før" : ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(PF.ui(11.5)).foregroundStyle(cv.before ? p.lab : p.mut).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 14).frame(minHeight: 50).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Rectangle().fill(p.line).frame(height: 1)
                    }
                    if list.count > limit {
                        Button("Vis 60 til") { limit += 60 }.font(PF.ui(13, .semibold)).foregroundStyle(p.ink).frame(minHeight: 44)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            if !c.memory.isEmpty {
                PLabel(text: "Minne").padding(.leading, 4)
                VStack(spacing: 0) {
                    ForEach(c.memory, id: \.self) { (m: String) in
                        Button {
                            if c.pickedMem.contains(m) { c.pickedMem.remove(m) } else { c.pickedMem.insert(m) }
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: c.pickedMem.contains(m) ? "checkmark.square.fill" : "square").font(.dyn51(size: 18)).foregroundStyle(c.pickedMem.contains(m) ? p.ink : p.mut)
                                Text(m).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            card {
                Toggle("Importer samtaler", isOn: Binding<Bool>(get: { c.doConvs }, set: { c.doConvs = $0 }))
                Toggle("Importer minne", isOn: Binding<Bool>(get: { c.doMem }, set: { c.doMem = $0 }))
                Toggle("Hopp over det som er importert før", isOn: Binding<Bool>(get: { c.skipBefore }, set: { c.skipBefore = $0 }))
            }
            .font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).tint(p.lab)
            Button { c.commit(store) } label: {
                Text(c.busy ? "Importerer …" : "Importer \(nPick) samtaler og \(nMem) minnepunkter").font(PF.ui(15, .bold)).foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity, minHeight: 50).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(c.busy || (nPick == 0 && nMem == 0))
            Button("Avbryt") { c.reset() }.font(PF.ui(13.5, .semibold)).foregroundStyle(p.mut).frame(maxWidth: .infinity, minHeight: 44)
        }
    }

    private func stat(_ v: String, _ l: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(v).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Text(l).font(PF.ui(11)).foregroundStyle(p.mut)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var done: some View {
        card {
            Text(c.result).font(PF.serif(21, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text(c.resultSub).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Button {
                AiCtl34.shared.close()
                store.openChat()
            } label: {
                Text("Åpne Chat").font(PF.ui(14.5, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 46).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            HStack(spacing: 8) {
                Button { c.reset() } label: {
                    Text("Importer mer").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 44).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                Button { c.undo(store) } label: {
                    Text(c.busy ? "Angrer …" : "Angre importen").font(PF.ui(13.5, .semibold)).foregroundStyle(p.lab).frame(maxWidth: .infinity, minHeight: 44).overlay(Capsule().stroke(p.lab, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(c.busy)
            }
        }
    }
}
