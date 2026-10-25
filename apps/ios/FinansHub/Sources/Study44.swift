import SwiftUI
import UIKit
import PhotosUI
import VisionKit
import UniformTypeIdentifiers

/* ---------------- Prompt 44: Studie → Dokumenter (vitnemål, karakterutskrift …), Glimt leser og analyserer ----------------
 Fasit: design/Studie Dokumenter.dc.html og claude-code-studie-dokumenter.md. Mer → Studie åpner fullskjerm.
 Opplasting: Velg fil (PDF, JPG, PNG, HEIC), bilde fra biblioteket og «Ta bilde» (dokumentskanner, VisionKit).
 Server (SERVER44, server/study44.js), bare eieren ser dokumentene, lagres kryptert:
   POST /api/study/documents (multipart file) → {doc:{id, kind, kindLabel, title, institution, program, date, emner:[{kode, navn, sp,
        karakter, tone}], snitt:{letter, value, text}, snittVgs:{text}, sp, spText, found:[…], summary, steps:[{label, ms, ok}], compare?}}
   GET  /api/study/documents → {items, kpi:{sp, snitt, snittVgs, count}} · DELETE …/:id
   POST …/:id/ask {q} → {answer} · POST …/:id/apply → {message}
 Snitt og studiepoeng regnes på serveren, aldri av en språkmodell. Glimt-stegene vises med ekte tid fra serveren. */

struct Study44Course: Identifiable, Hashable {
    var id: String { kode + navn }
    var kode: String
    var navn: String
    var sp: String
    var karakter: String
    var tone: String
}

struct Study44Doc: Identifiable, Hashable {
    var id: String
    var title: String = ""
    var kindLabel: String = ""
    var institution: String = ""
    var program: String = ""
    var date: String = ""
    var summary: String = ""
    var snitt: String = ""
    var spText: String = ""
    var found: [String] = []
    var steps: [String] = []
    var courses: [Study44Course] = []
    var compare: String = ""
}

@MainActor
@Observable
final class Study44 {
    static let shared = Study44()

    var open: Bool = false
    var docs: [Study44Doc] = []
    var kpis: [(String, String)] = []
    var selected: Study44Doc? = nil
    var uploading: Bool = false
    var steps: [String] = []
    var error: String = ""
    var answer: String = ""
    var asking: Bool = false
    var toast: String = ""
    var missing: Bool = false
    /// Prompt 50: ✦ i toppen flytter fokus til «Spør om dokumentet» (Study44Ask).
    var askFocus50: Int = 0
    @ObservationIgnored private var loadedOnce: Bool = false

    var merSub: String {
        if docs.isEmpty { return "Vitnemål og karakterutskrift · Glimt leser" }
        let n: String = docs.count == 1 ? "1 dokument" : "\(docs.count) dokumenter"
        let sn: String = kpis.first { $0.0 == "Snitt" }?.1 ?? ""
        return sn.isEmpty ? n : n + " · snitt " + sn
    }

    func show() {
        Haptics.shared.tap()
        open = true
    }

    func load(_ store: Store) async {
        if loadedOnce && !open { return }
        loadedOnce = true
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/study/documents", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            docs = JS.list(o, "items").map { Study44.doc($0) }
            kpis = Study44.kpi(JS.dict(o, "kpi"))
            if selected == nil { selected = docs.first }
            missing = false
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {}
    }

    nonisolated static func kpi(_ k: [String: Any]?) -> [(String, String)] {
        guard let k else { return [] }
        var out: [(String, String)] = []
        out.append(("Studiepoeng", JS.str(k, "spText") ?? JS.str(k, "sp") ?? "0"))
        let sn: String = JS.str(JS.dict(k, "snitt"), "text") ?? JS.str(k, "snitt") ?? "–"
        out.append(("Snitt", sn))
        let vgs: String = JS.str(JS.dict(k, "snittVgs"), "text") ?? JS.str(k, "snittVgs") ?? "–"
        out.append(("Snitt vgs", vgs))
        out.append(("Dokumenter", JS.str(k, "count") ?? "0"))
        return out
    }

    nonisolated static func doc(_ r: [String: Any]) -> Study44Doc {
        var d: Study44Doc = Study44Doc(id: JS.str(r, "id") ?? UUID().uuidString)
        d.title = JS.str(r, "title") ?? JS.str(r, "filename") ?? "Dokument"
        d.kindLabel = JS.str(r, "kindLabel") ?? JS.str(r, "kind") ?? ""
        d.institution = JS.str(r, "institution") ?? ""
        d.program = JS.str(r, "program") ?? ""
        d.date = JS.str(r, "date") ?? ""
        d.summary = JS.str(r, "summary") ?? ""
        let sn: [String: Any]? = JS.dict(r, "snitt")
        d.snitt = JS.str(sn, "text") ?? JS.str(sn, "letter") ?? JS.str(JS.dict(r, "snittVgs"), "text") ?? ""
        d.spText = JS.str(r, "spText") ?? (JS.str(r, "sp").map { $0 + " sp" } ?? "")
        d.found = JS.strings(r, "found")
        d.steps = JS.list(r, "steps").map { Study44.step($0) }
        d.courses = JS.list(r, "emner").map { (e: [String: Any]) -> Study44Course in
            Study44Course(kode: JS.str(e, "kode") ?? "", navn: JS.str(e, "navn") ?? "", sp: JS.str(e, "sp") ?? "",
                          karakter: JS.str(e, "karakter") ?? "", tone: JS.str(e, "tone") ?? "neutral")
        }
        d.compare = JS.str(JS.dict(r, "compare"), "text") ?? ""
        return d
    }

    nonisolated static func step(_ s: [String: Any]) -> String {
        let ms: Int = JS.int(s, "ms") ?? 0
        let ok: Bool = JS.bool(s, "ok") ?? true
        let t: String = ms >= 1000 ? String(format: "%.1f s", Double(ms) / 1000).replacingOccurrences(of: ".", with: ",") : "\(ms) ms"
        return (ok ? "✓ " : "✕ ") + (JS.str(s, "label") ?? "") + (ms > 0 ? " · " + t : "")
    }

    /* ---------- Opplasting ---------- */

    func upload(_ data: Data, name: String, mime: String, _ store: Store) {
        Haptics.shared.tap()
        uploading = true
        error = ""
        steps = ["Laster opp og krypterer …"]
        let api: API = store.api
        Task { @MainActor in
            defer { self.uploading = false }
            do {
                let d: Data = try await Study44.multipart(api, data, name: name, mime: mime)
                let o: [String: Any] = JS.obj(d)
                guard let doc = JS.dict(o, "doc") else { self.error = JS.str(o, "error") ?? "Glimt fant ikke noe i dokumentet."; return }
                let x: Study44Doc = Study44.doc(doc)
                self.steps = x.steps
                self.docs.removeAll { $0.id == x.id }
                self.docs.insert(x, at: 0)
                self.selected = x
                Haptics.shared.success()
                await self.reloadKpi(store)
            } catch let e as APIError {
                self.error = e.status == 404 ? "Serveren har ikke Studie-dokumenter ennå (oppdater Homelab)." : e.message
                self.steps = []
            } catch {
                self.error = error.localizedDescription
                self.steps = []
            }
        }
    }

    private func reloadKpi(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/study/documents", timeout: 15) else { return }
        kpis = Study44.kpi(JS.dict(JS.obj(d), "kpi"))
    }

    /// multipart/form-data med feltet «file» og innloggings-tokenet.
    nonisolated static func multipart(_ api: API, _ data: Data, name: String, mime: String) async throws -> Data {
        let base: String = api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let u = URL(string: base + "/api/study/documents") else { throw APIError(message: "Ugyldig adresse", status: 0) }
        let boundary: String = "nordlys-" + UUID().uuidString
        var r: URLRequest = URLRequest(url: u)
        r.httpMethod = "POST"
        r.timeoutInterval = 180
        r.setValue("multipart/form-data; boundary=" + boundary, forHTTPHeaderField: "Content-Type")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let t = api.token { r.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
        var body: Data = Data()
        let safe: String = name.replacingOccurrences(of: "\"", with: "")
        body.append(Data(("--" + boundary + "\r\n").utf8))
        body.append(Data(("Content-Disposition: form-data; name=\"file\"; filename=\"" + safe + "\"\r\n").utf8))
        body.append(Data(("Content-Type: " + mime + "\r\n\r\n").utf8))
        body.append(data)
        body.append(Data(("\r\n--" + boundary + "--\r\n").utf8))
        r.httpBody = body
        let (d, res) = try await URLSession.shared.data(for: r)
        let code: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code >= 400 {
            let o: [String: Any] = JS.obj(d)
            throw APIError(message: JS.str(o, "error") ?? "Feil \(code)", status: code)
        }
        return d
    }

    /* ---------- Spør, legg i Studie, slett ---------- */

    func ask(_ q: String, _ store: Store) {
        guard let d = selected, !q.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        asking = true
        answer = ""
        Task { @MainActor in
            defer { self.asking = false }
            do {
                let r: Data = try await store.api.callAt("/api", "POST", "/study/documents/\(d.id)/ask", json: ["q": q], timeout: 60)
                self.answer = JS.str(JS.obj(r), "answer") ?? "Fant ikke svaret i dokumentet."
            } catch { self.answer = (error as? APIError)?.message ?? error.localizedDescription }
        }
    }

    func apply(_ store: Store) {
        guard let d = selected else { return }
        Haptics.shared.tap()
        Task { @MainActor in
            do {
                let r: Data = try await store.api.callAt("/api", "POST", "/study/documents/\(d.id)/apply", json: [:], timeout: 30)
                self.flash(JS.str(JS.obj(r), "message") ?? "Emnene er lagt i Studie")
            } catch { self.flash((error as? APIError)?.message ?? error.localizedDescription) }
        }
    }

    func delete(_ store: Store) {
        guard let d = selected else { return }
        Haptics.shared.warning()
        docs.removeAll { $0.id == d.id }
        selected = docs.first
        Task { _ = try? await store.api.callAt("/api", "DELETE", "/study/documents/\(d.id)", timeout: 15); await self.reloadKpi(store) }
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    nonisolated static func toneColor(_ t: String) -> Color {
        switch t {
        case "good": return Color(hex: "#2f6b4a")
        case "warn": return Color(hex: "#a0671a")
        case "bad": return Color(hex: "#b23a2a")
        default: return Color(hex: "#6b665c")
        }
    }
}

/* ---------- Fullskjerm ---------- */

struct Study44Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Study44 { Study44.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { m.open = $0 })) {
                Study44Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { m.open = false }
            }
    }
}

extension View {
    func study44Host(_ p: PaperPalette) -> some View { modifier(Study44Host(p: p)) }
}

struct Study44Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Study44 { Study44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Study44Top()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if m.missing { Playback44Note(text: "Serveren har ikke Studie-dokumenter ennå (oppdater Homelab).", red: false) }
                    if !m.kpis.isEmpty { Playback44Kpis(items: m.kpis.map { Play44Stat(name: $0.0, value: $0.1) }) }
                    Study44Upload()
                    Study44DocList()
                    if let d = m.selected { Study44DocView(d: d) }
                }
                .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 40)
                .frame(maxWidth: 720).frame(maxWidth: .infinity)
            }
            .refreshable { await m.load(store) }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .overlay(alignment: .bottom) { if !m.toast.isEmpty { Logs44Toast(text: m.toast) } }
        .task { await m.load(store) }
    }
}

/// Prompt 50: topplinje som i Nyheter (Top50.swift): «‹ Tilbake», STUDIE · DOKUMENTER / Dokumenter, ✦ og ⋯.
/// Underteksten ligger rett under raden (14 pt, mut).
struct Study44Top: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Study44 { Study44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Top50Bar(kicker: "Studie · dokumenter", title: "Dokumenter", back: { m.open = false }) {
                Glimt50Button(label: "Spør Glimt om dokumentet") { glimt() }
                menu
            }
            Text("Vitnemål, karakterutskrift og attester · Glimt leser og regner ut").font(PF.ui(14)).foregroundStyle(p.mut)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 6)
    }

    private var menu: some View {
        Menu {
            Button { Task { await m.load(store) } } label: { Label("Oppdater", systemImage: "arrow.clockwise") }
            Button {
                m.open = false
                store.openChat()
            } label: { Label("Spør Glimt i Chat", systemImage: "sparkles") }
        } label: {
            Image(systemName: "ellipsis").font(.dyn51(size: 16, weight: .bold)).foregroundStyle(p.ink).round50()
        }
        .accessibilityLabel("Mer for Studie")
    }

    /// ✦: til spørsmålsfeltet for valgt dokument; uten dokumenter åpnes Chat.
    private func glimt() {
        if m.selected != nil {
            m.askFocus50 += 1
        } else {
            m.open = false
            store.openChat()
        }
    }
}
