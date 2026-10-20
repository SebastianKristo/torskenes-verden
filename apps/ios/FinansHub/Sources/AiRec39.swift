import SwiftUI
import UIKit

/* ---------------- Prompt 39: Glimt anbefaler modeller + «La Glimt velge modeller» ---------------- */
// Spesifikasjon: claude-code-ai-glimt-anbefaler-modeller.md. Fasit: AI Kontroll.dc.html → Modeller → «✦ GLIMT ANBEFALER»
// (REC, RKW, R.md.gl) og Valg → «✦ La Glimt velge modeller» (R.rt.glPlan / glGo).
// SERVER39: GET /api/ai/recommend → [{task, model, why, alt, fit, installed, inUse, sizeGb, pullCmd}],
// POST /api/ai/recommend/ask {q} → Glimt-anbefaling, POST /api/ai/recommend/apply {tasks?} → fyller ut rutingen (admin).
// Uten serverstøtte (404) brukes den kuraterte tabellen REC fra fasiten, nøkkelordene RKW og lokal utfylling via /api/ai/routing.

struct AiRec39Row: Identifiable, Hashable {
    var id: String { task }
    var task: String
    var name: String
    var model: String
    var why: String
    var alt: String
    var sizeGb: Double
    /// PASSER | TRANGT | FOR STOR
    var fit: String
    var installed: Bool
    var inUse: Bool
}

@MainActor
@Observable
final class AiRec39 {
    static let shared = AiRec39()

    var rows: [AiRec39Row] = []
    var fromServer: Bool = false
    var askText: String = ""
    var askBusy: Bool = false
    var askAnswer: String = ""
    var askModel: String = ""
    var queueBusy: Bool = false
    /// Angre for «Fyll ut» (5 s): oppgave → forrige modell.
    var undo: [String: String] = [:]
    @ObservationIgnored private var undoTask: Task<Void, Never>? = nil

    /// Kuratert tabell (REC i fasiten): oppgave → [(modell, hvorfor)], førstevalg først.
    static let rec: [String: [(String, String)]] = [
        "chat": [("gemma4:latest", "Best norsk av modellene som passer i 16 GB"), ("gemma3:12b", "Nesten like god, litt mindre")],
        "sok": [("qwen3:8b", "Rask og flink til å bruke søk og verktøy"), ("gemma4:latest", "Bedre språk, men tregere")],
        "glimt": [("qwen3:8b", "Forstår datoer og tider, rask nok til samtale"), ("gemma3:12b", "Bedre norsk, litt tregere")],
        "rc": [("qwen2.5vl:7b", "Best til å lese tekst i bilder, bare 6 GB"), ("minicpm-v", "Mindre og raskere, svakere på krøllete kvitteringer")],
        "kat": [("llama3.2:3b", "Liten og rask, kan ligge lastet sammen med en stor"), ("qwen3:8b", "Mer presis, men tar mer minne")],
        "fsok": [("qwen3:8b", "God på tall og verktøykall mot Finans"), ("gemma4:latest", "Bedre forklaringer, tregere")],
        "bar": [("qwen2.5vl:7b", "Leser tekst på pakkelapper når strekkoden svikter"), ("minicpm-v", "Lettere reserve")],
        "dom": [("gemma4:latest", "Skriver gode norske sammendrag"), ("gemma3:12b", "Nesten like god")],
        "kb": [("bge-m3", "Flerspråklig, bedre på norsk enn nomic"), ("nomic-embed-text", "Mindre og raskere")],
        "kode": [("qwen3:8b", "God på kode og verktøy, passer godt i minnet"), ("deepseek-r1:14b", "Tenker grundigere, men trangt i 16 GB")],
    ]

    /// Nøkkelord → oppgave (RKW i fasiten), for «Spør Glimt» uten server.
    static let rkw: [(String, [String])] = [
        ("rc", ["kvitter", "bilde", "foto", "skann", "ocr"]),
        ("bar", ["strekkode", "pakke", "qr", "etikett"]),
        ("kat", ["kategori", "sorter"]),
        ("fsok", ["finans", "penger", "budsjett", "abonnement", "forbruk"]),
        ("glimt", ["kalender", "glimt", "time", "avtale", "dato"]),
        ("sok", ["søk", "finne", "spørsmål"]),
        ("dom", ["sammendrag", "oppsumm", "nyhet", "domene", "rapport"]),
        ("kb", ["dokument", "kunnskap", "notat", "pdf", "embedding"]),
        ("kode", ["kode", "program", "script", "utvikl"]),
        ("chat", ["chat", "prat", "samtale", "skriv", "tekst", "norsk"]),
    ]

    static let taskNames: [String: String] = [
        "chat": "Chat", "sok": "AI-søk", "glimt": "Glimt", "rc": "Kvitteringer", "kat": "Kategorisering", "fsok": "Finans · spør",
        "bar": "Strekkoder", "dom": "Domener", "kb": "Kunnskapsbase", "kode": "Kode", "brief": "Glimt · brief",
    ]

    static func size(_ id: String) -> Double {
        if let m = AiCtl34.shared.installed.first(where: { $0.id == id }), m.gb > 0 { return m.gb }
        if let l = AiCtl34.fixedLibrary.first(where: { $0.id == id }), l.gb > 0 { return l.gb }
        switch id {
        case "gemma4:latest": return 9.6
        case "deepseek-r1:14b": return 9.0
        default: return 0
        }
    }

    static func isInstalled(_ id: String) -> Bool {
        AiCtl34.shared.installed.contains(where: { $0.id == id || $0.id == id + ":latest" || $0.id + ":latest" == id })
    }

    /// Glimts førstevalg for en oppgave (serverens anbefaling, ellers tabellen).
    func first(_ task: String) -> String? {
        if let r = rows.first(where: { $0.task == task }) { return r.model }
        return AiRec39.rec[task]?.first?.0
    }

    /* ---------- Lasting ---------- */

    func load(_ store: Store) async {
        if let d = try? await store.api.callAt("/api", "GET", "/ai/recommend", timeout: 20) {
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var list: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            if list.isEmpty, let o = any as? [String: Any] { list = JS.list(o, "items") + JS.list(o, "tasks") + JS.list(o, "recommend") }
            if !list.isEmpty {
                rows = list.compactMap { (o: [String: Any]) -> AiRec39Row? in
                    guard let t = JS.str(o, "task"), let md = JS.str(o, "model") else { return nil }
                    let gb: Double = JS.num(o, "sizeGb") ?? AiRec39.size(md)
                    let fit: String = (JS.str(o, "fit") ?? AiHw38.shared.fit(gb)).uppercased()
                    return AiRec39Row(task: t, name: JS.str(o, "name") ?? AiRec39.taskNames[t] ?? t, model: md, why: JS.str(o, "why") ?? "",
                                      alt: JS.str(o, "alt") ?? "", sizeGb: gb, fit: AiRec39.fitLabel(fit),
                                      installed: JS.bool(o, "installed") ?? AiRec39.isInstalled(md), inUse: JS.bool(o, "inUse") ?? false)
                }
                fromServer = true
                return
            }
        }
        fromServer = false
        rebuildLocal()
    }

    static func fitLabel(_ raw: String) -> String {
        let u: String = raw.uppercased()
        if u.contains("FOR") || u.contains("BIG") || u.contains("STOR") { return "FOR STOR" }
        if u.contains("TRANG") || u.contains("TIGHT") || u.contains("DELVIS") { return "TRANGT" }
        return "PASSER"
    }

    /// Lokal anbefaling: førstevalget som ikke er FOR STOR; installerte modeller foretrekkes når de er like gode.
    func rebuildLocal() {
        let m: AiCtl34 = AiCtl34.shared
        var out: [AiRec39Row] = []
        for t in AiCtl34.tasks {
            guard let cands = AiRec39.rec[t.0] else { continue }
            let ok: [(String, String)] = cands.filter { AiHw38.shared.fit(AiRec39.size($0.0)) != "FOR STOR" }
            guard let best = ok.first ?? cands.first else { continue }
            let alt: String = cands.first(where: { $0.0 != best.0 })?.0 ?? ""
            let gb: Double = AiRec39.size(best.0)
            let cur: String = m.routes.first(where: { $0.id == t.0 })?.model ?? ""
            out.append(AiRec39Row(task: t.0, name: AiRec39.taskNames[t.0] ?? t.1, model: best.0, why: best.1, alt: alt, sizeGb: gb,
                                  fit: AiRec39.fitLabel(AiHw38.shared.fit(gb)), installed: AiRec39.isInstalled(best.0), inUse: cur == best.0))
        }
        rows = out
    }

    /// Rader for visningen (inUse/installert oppdatert fra rutingen og modellene akkurat nå).
    func live(fin: Bool) -> [AiRec39Row] {
        let m: AiCtl34 = AiCtl34.shared
        let finIds: Set<String> = Set(AiCtl34.tasks.filter { $0.5 }.map { $0.0 })
        return rows.filter { !fin || finIds.contains($0.task) }.map { (r: AiRec39Row) -> AiRec39Row in
            var x: AiRec39Row = r
            x.installed = r.installed || AiRec39.isInstalled(r.model)
            let cur: String = m.routes.first(where: { $0.id == r.task })?.model ?? ""
            x.inUse = cur.isEmpty ? r.inUse : cur == r.model
            return x
        }
    }

    /* ---------- Handlinger ---------- */

    func use(_ r: AiRec39Row, _ store: Store) {
        AiCtl34.shared.setRoute(r.task, model: r.model, fallback: nil, store)
        AiCtl34.shared.flash("✦ " + r.name + " bruker nå " + r.model)
    }

    func pull(_ r: AiRec39Row, _ store: Store) {
        AiCtl34.shared.pullModel(r.model, store)
    }

    /// «Last ned det som mangler»: én om gangen.
    func pullMissing(_ list: [AiRec39Row], _ store: Store) {
        let ids: [String] = Array(Set(list.filter { !$0.installed && $0.fit != "FOR STOR" }.map { $0.model })).sorted()
        if ids.isEmpty || queueBusy { return }
        queueBusy = true
        Haptics.shared.tap()
        AiCtl34.shared.flash("Laster ned \(ids.count) " + (ids.count == 1 ? "modell" : "modeller") + " · én om gangen")
        Task {
            for id in ids {
                AiCtl34.shared.pullModel(id, store)
                var waited: Int = 0
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                while AiCtl34.shared.pulls.contains(where: { $0.id == id }) && waited < 3600 {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    waited += 2
                }
            }
            await AiCtl34.shared.loadModels(store)
            self.queueBusy = false
            self.rebuildIfLocal()
        }
    }

    func rebuildIfLocal() { if !fromServer { rebuildLocal() } }

    /// Oppgavene der Glimts førstevalg blant installerte modeller avviker fra det som er valgt nå.
    func plan(fin: Bool) -> [(String, String)] {
        let m: AiCtl34 = AiCtl34.shared
        var out: [(String, String)] = []
        for r in m.routes where !fin || r.fin {
            guard let cands = AiRec39.rec[r.id] else { continue }
            var ids: [String] = cands.map { $0.0 }
            if let s = rows.first(where: { $0.task == r.id })?.model, !ids.contains(s) { ids.insert(s, at: 0) }
            guard let best = ids.first(where: { AiRec39.isInstalled($0) }) else { continue }
            if best != r.model { out.append((r.id, best)) }
        }
        return out
    }

    /// Antall oppgaver der ingen anbefalt modell er installert.
    func missing(fin: Bool) -> Int {
        let m: AiCtl34 = AiCtl34.shared
        var n: Int = 0
        for r in m.routes where !fin || r.fin {
            guard let cands = AiRec39.rec[r.id] else { continue }
            if !cands.contains(where: { AiRec39.isInstalled($0.0) }) { n += 1 }
        }
        return n
    }

    /// «Fyll ut»: setter hovedmodellen (reserven røres ikke). Angre i 5 s.
    func fill(fin: Bool, _ store: Store) {
        let p: [(String, String)] = plan(fin: fin)
        if p.isEmpty { return }
        let m: AiCtl34 = AiCtl34.shared
        var prev: [String: String] = [:]
        for (task, model) in p {
            prev[task] = m.routes.first(where: { $0.id == task })?.model ?? ""
            m.setRoute(task, model: model, fallback: nil, store)
        }
        Haptics.shared.success()
        m.flash("✦ Glimt fylte ut \(p.count) " + (p.count == 1 ? "valg" : "valg"))
        let tasks: [String] = p.map { $0.0 }
        Task { _ = try? await store.api.callAt("/api", "POST", "/ai/recommend/apply", json: ["tasks": tasks], timeout: 20) }
        undo = prev
        undoTask?.cancel()
        undoTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: 0.2)) { AiRec39.shared.undo = [:] }
        }
    }

    func undoFill(_ store: Store) {
        let m: AiCtl34 = AiCtl34.shared
        for (task, model) in undo where !model.isEmpty { m.setRoute(task, model: model, fallback: nil, store) }
        undo = [:]
        undoTask?.cancel()
        m.flash("Valgene er satt tilbake")
    }

    /// «Spør Glimt»: serveren først, ellers nøkkelord.
    func ask(_ store: Store) {
        let q: String = askText.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty || askBusy { return }
        askBusy = true
        askAnswer = ""
        askModel = ""
        Task {
            if let d = try? await store.api.callAt("/api", "POST", "/ai/recommend/ask", json: ["q": q], timeout: 30) {
                let o: [String: Any] = JS.obj(d)
                let t: String = JS.str(o, "text") ?? JS.str(o, "answer") ?? ""
                if !t.isEmpty {
                    self.askAnswer = t
                    self.askModel = JS.str(o, "model") ?? JS.str(JS.dict(o, "recommend"), "model") ?? ""
                    self.askBusy = false
                    return
                }
            }
            self.localAnswer(q)
            self.askBusy = false
        }
    }

    private func localAnswer(_ q: String) {
        let l: String = q.lowercased()
        let task: String? = AiRec39.rkw.first(where: { (e: (String, [String])) -> Bool in e.1.contains(where: { l.contains($0) }) })?.0
        guard let t = task, let c = AiRec39.rec[t], let best = c.first else {
            askAnswer = "Jeg er ikke helt sikker på hva du vil bruke den til. En god allrounder er gemma4:latest (passer i 16 GB). Prøv f.eks. «lese kvitteringer», «kode» eller «kalender»."
            askModel = AiRec39.isInstalled("gemma4:latest") ? "" : "gemma4:latest"
            return
        }
        let gb: Double = AiRec39.size(best.0)
        let fit: String = AiHw38.shared.fit(gb).lowercased()
        let alt: String = c.count > 1 ? " Alternativ: " + c[1].0 + "." : ""
        let size: String = gb > 0 ? " (" + AiCtl34.gb(gb).replacingOccurrences(of: ",0", with: "") + ", " + fit + ")" : ""
        askAnswer = "Til " + (AiRec39.taskNames[t] ?? t).lowercased() + " anbefaler jeg " + best.0 + size + ". " + best.1 + "." + alt
        askModel = AiRec39.isInstalled(best.0) ? "" : best.0
    }
}

/* ---------- Visning: Modeller → ✦ GLIMT ANBEFALER ---------- */

struct AiRec39Card: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var r: AiRec39 { AiRec39.shared }
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let list: [AiRec39Row] = r.live(fin: m.fin)
        let admin: Bool = Update28Model.isAdmin(store)
        let miss: [AiRec39Row] = list.filter { !$0.installed && $0.fit != "FOR STOR" }
        let missGb: Double = AiRec39Card.total(miss)
        let canUse: [AiRec39Row] = list.filter { $0.installed && !$0.inUse }
        let title: String = "✦ GLIMT ANBEFALER · " + AiHw38.shared.model.uppercased() + " · " + String(Int(AiHw38.shared.memGb.rounded())) + " GB"
        VStack(alignment: .leading, spacing: 8) {
            AiCard34(title: title) {
                if list.isEmpty {
                    Text("Glimt ser på maskinen og modellene …").font(PF.ui(13)).foregroundStyle(p.mut).padding(.vertical, 12)
                }
                ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiRec39Row)) in
                    AiRec39RowView(row: pair.element, first: pair.offset == 0, admin: admin)
                }
                if admin && (!miss.isEmpty || !canUse.isEmpty) {
                    AiLine34()
                    VStack(alignment: .leading, spacing: 8) {
                        if !miss.isEmpty {
                            AiMini34(title: r.queueBusy ? "Laster ned i kø …" : "Last ned det som mangler · " + AiCtl34.gb(missGb), filled: true) {
                                r.pullMissing(list, store)
                            }
                            .disabled(r.queueBusy)
                        }
                        if !canUse.isEmpty {
                            AiMini34(title: "Bruk alle anbefalinger (\(canUse.count))") {
                                for x in canUse { AiCtl34.shared.setRoute(x.task, model: x.model, fallback: nil, store) }
                                Haptics.shared.success()
                                AiCtl34.shared.flash("✦ Bruker Glimts anbefaling for \(canUse.count) oppgaver")
                            }
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
            AiRec39Ask()
        }
        .task {
            await AiRec39.shared.load(store)
        }
        .onChange(of: m.installed.count) { (_: Int, _: Int) in AiRec39.shared.rebuildIfLocal() }
    }

    /// Samlet størrelse (hver modell telles én gang).
    static func total(_ rows: [AiRec39Row]) -> Double {
        var seen: Set<String> = []
        var sum: Double = 0
        for x in rows where !seen.contains(x.model) {
            seen.insert(x.model)
            sum += x.sizeGb
        }
        return sum
    }
}

struct AiRec39RowView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let row: AiRec39Row
    let first: Bool
    let admin: Bool

    var body: some View {
        let pulling: Bool = m.pulls.contains(where: { $0.id == row.model })
        VStack(spacing: 0) {
            if !first { AiLine34() }
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(row.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(1)
                        Text(row.model).font(PF.mono(12)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                        AiFit34(fit: row.fit)
                    }
                    if !row.why.isEmpty {
                        Text(row.why).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                    if !row.alt.isEmpty {
                        Text("Alternativ: " + row.alt).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                button(pulling)
            }
            .padding(.vertical, 11)
        }
    }

    @ViewBuilder private func button(_ pulling: Bool) -> some View {
        if row.inUse {
            AiMini34(title: "I bruk", color: p.pos) {}.disabled(true).opacity(0.7)
        } else if row.installed {
            AiMini34(title: "Bruk", filled: true) { AiRec39.shared.use(row, store) }.disabled(!admin)
        } else if pulling {
            AiMini34(title: "Laster …") {}.disabled(true).opacity(0.6)
        } else {
            AiMini34(title: row.sizeGb > 0 ? "Last ned · " + AiCtl34.gb(row.sizeGb) : "Last ned") { AiRec39.shared.pull(row, store) }
                .disabled(!admin || row.fit == "FOR STOR")
                .opacity(!admin || row.fit == "FOR STOR" ? 0.5 : 1)
        }
    }
}

/// «Spør Glimt: Hva vil du bruke AI til?»
struct AiRec39Ask: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var r: AiRec39 { AiRec39.shared }

    private var text: Binding<String> {
        Binding<String>(get: { AiRec39.shared.askText }, set: { (v: String) in AiRec39.shared.askText = v })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                TextField("", text: text, prompt: Text("Spør Glimt: Hva vil du bruke AI til?").foregroundColor(p.mut))
                    .font(PF.ui(14.5)).foregroundStyle(p.ink)
                    .submitLabel(.send)
                    .onSubmit { r.ask(store) }
                    .padding(.horizontal, 14).frame(height: 44)
                    .background(p.card, in: Capsule())
                AiMini34(title: r.askBusy ? "Tenker …" : "✦ Spør", filled: true) { r.ask(store) }
                    .disabled(r.askBusy)
            }
            if !r.askAnswer.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("✦ " + r.askAnswer).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    if !r.askModel.isEmpty && Update28Model.isAdmin(store) {
                        AiMini34(title: "Last ned " + r.askModel, filled: true) { AiCtl34.shared.pullModel(r.askModel, store) }
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: r.askAnswer)
    }
}

/* ---------- Visning: Valg → ✦ La Glimt velge modeller ---------- */

struct AiRec39FillCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var r: AiRec39 { AiRec39.shared }
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let plan: [(String, String)] = r.plan(fin: m.fin)
        let miss: Int = r.missing(fin: m.fin)
        let admin: Bool = Update28Model.isAdmin(store)
        let missTxt: String = miss > 0 ? " · \(miss) mangler (se Modeller)" : ""
        let sub: String = plan.isEmpty
            ? "Alle oppgaver bruker allerede Glimts anbefaling" + (miss > 0 ? " · \(miss) modell(er) bør lastes ned" : "")
            : "Fyller ut \(plan.count) " + (plan.count == 1 ? "oppgave" : "oppgaver") + " med beste installerte modell" + missTxt
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("✦ La Glimt velge modeller").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                if !r.undo.isEmpty {
                    Button { r.undoFill(store) } label: {
                        Text("Angre").font(PF.ui(13, .heavy)).foregroundStyle(p.lab).padding(.top, 2)
                    }
                    .buttonStyle(.plain)
                    .transition(.opacity)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { r.fill(fin: m.fin, store) } label: {
                Text(plan.isEmpty ? "✓ Ferdig" : "Fyll ut").font(PF.ui(13.5, .bold))
                    .foregroundStyle(plan.isEmpty ? p.pos : p.bg)
                    .padding(.horizontal, 16).frame(height: 36)
                    .background(plan.isEmpty ? p.pos.opacity(0.12) : p.ink, in: Capsule())
                    .overlay(Capsule().strokeBorder(plan.isEmpty ? p.pos.opacity(0.35) : Color.clear, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(plan.isEmpty || !admin)
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .animation(.easeOut(duration: 0.2), value: r.undo.isEmpty)
        .task { if AiRec39.shared.rows.isEmpty { await AiRec39.shared.load(store) } }
    }
}

/// «Brukes til: Glimt · AI-søk» og «✦ Glimt anbefaler til …» under en modell i biblioteket.
struct AiRec39LibTags: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let model: String

    var body: some View {
        let used: [String] = m.routes.filter { $0.model == model }.map { $0.name }
        let recFor: [String] = AiCtl34.tasks.filter { AiRec39.shared.first($0.0) == model }.map { AiRec39.taskNames[$0.0] ?? $0.1 }
        if !used.isEmpty || !recFor.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                if !used.isEmpty {
                    Text("Brukes til: " + used.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                if !recFor.isEmpty {
                    Text("✦ Glimt anbefaler til " + recFor.joined(separator: ", ").lowercased()).font(PF.ui(11.5, .semibold)).foregroundStyle(p.lab).lineLimit(2)
                }
            }
        }
    }
}
