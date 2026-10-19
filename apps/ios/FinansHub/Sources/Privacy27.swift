import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Prompt 27: PERSONVERN OG LOGOER, AI-logg og «Velg logo» ---------------- */
// Fasit: Innstillinger → AI og tolkning i design/Mobil Papir App.dc.html og prompts/prompt-27-pakke/claude-code-logo-oppslag.md.
// Tre personlige brytere (logo_local_receipts, logo_gemini, logo_verify; alle på), «AI-logg» fra GET /finans/api/ai-audit
// (hva som ble sendt til hvilken motor), og «Velg logo» der en butikk mangler logo:
// POST /finans/api/merchants/logo {name} (kjeden i koden), POST /finans/api/merchants/logo/manual (bilde eller {domain}).

struct AiAuditRow27: Identifiable, Hashable {
    let id: String
    let ts: Date?
    let engine: String
    let purpose: String
    let fields: String

    init(_ o: [String: Any], _ i: Int) {
        id = JS.str(o, "id") ?? "\(i)"
        ts = JS.date(o["ts"] ?? o["at"] ?? o["created_at"])
        engine = JS.str(o, "engine") ?? ""
        purpose = JS.str(o, "purpose") ?? ""
        fields = AiAuditRow27.fieldsText(o["fields_sent"] ?? o["fieldsSent"] ?? o["fields"])
    }

    /// fields_sent kan være tekst, en JSON-streng, en liste eller et objekt.
    static func fieldsText(_ v: Any?) -> String {
        if let a = v as? [Any] { return a.map { "\($0)" }.joined(separator: ", ") }
        if let o = v as? [String: Any] { return o.keys.sorted().map { k in "\(k): \(o[k].map { "\($0)" } ?? "")" }.joined(separator: ", ") }
        if let s = v as? String {
            if let d = s.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d), !(j is String) { return fieldsText(j) }
            return s
        }
        return ""
    }

    var engineName: String {
        switch engine.lowercased() {
        case "gemini": return "Gemini"
        case "ollama": return "Ollama (lokalt)"
        case "groq": return "Groq"
        default: return engine.isEmpty ? "AI" : engine
        }
    }

    var purposeName: String {
        switch purpose.lowercased() {
        case "logo", "logo_lookup", "logolookup": return "Logo-oppslag"
        case "receipt", "kvittering": return "Kvittering"
        case "subscription", "abonnement", "screenshot": return "Abonnement fra skjermbilde"
        case "news", "rss": return "Nyhetssammendrag"
        case "chat": return "Chat"
        default: return purpose
        }
    }
}

@MainActor
@Observable
final class AiAudit27 {
    static let shared = AiAudit27()
    var rows: [AiAuditRow27] = []
    var loaded: Bool = false
    var missing: Bool = false

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.call("GET", "/ai-audit")
            let raw: [Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [Any]) ?? JS.list(JS.obj(d), "items")
            let dicts: [[String: Any]] = raw.compactMap { $0 as? [String: Any] }
            rows = dicts.enumerated().map { AiAuditRow27($0.element, $0.offset) }
            missing = false
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {}
        loaded = true
    }
}

/// Gruppene PERSONVERN OG LOGOER og AI-LOGG (settes inn i PaperAiSettings).
struct Privacy27Section: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiSettingsModel { AiSettingsModel.shared }
    @MainActor private var audit: AiAudit27 { AiAudit27.shared }
    @State private var all: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Personvern og logoer").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    toggle("Les kvitteringer lokalt", "Ollama på hjemmeserveren leser hele kvitteringen. Ingenting sendes ut", "logo_local_receipts")
                    Rectangle().fill(p.line).frame(height: 1)
                    toggle("Finn logo med Gemini", "Gemini får bare butikknavnet, f.eks. «Blomsterlandet»", "logo_gemini")
                    Rectangle().fill(p.line).frame(height: 1)
                    toggle("Sjekk logoen før den lagres", "Domenet må svare, og bildet må være et ekte bilde", "logo_verify")
                }
            }
            Text("Av: logoen finnes uten Gemini (Brønnøysund, nettsiden og favicon).").font(PF.ui(12)).foregroundStyle(p.mut)
                .padding(.horizontal, 6).padding(.top, 6).fixedSize(horizontal: false, vertical: true)
            PLabel(text: "AI-logg").padding(.leading, 4).padding(.top, 14)
            logCard
        }
        .task { await audit.load(store) }
    }

    private func toggle(_ t: String, _ sub: String, _ key: String) -> some View {
        Toggle(isOn: Binding<Bool>(get: { m.flag(key, default: true) }, set: { v in m.setFlag(key, v, store) })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    @ViewBuilder private var logCard: some View {
        let rows: [AiAuditRow27] = all ? audit.rows : Array(audit.rows.prefix(6))
        PCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                if !audit.loaded {
                    Text("Henter …").font(PF.ui(13)).foregroundStyle(p.mut).padding(14)
                } else if audit.missing {
                    Text("AI-loggen finnes ikke på serveren ennå. Oppdater homelab.").font(PF.ui(13)).foregroundStyle(p.mut).padding(14)
                } else if rows.isEmpty {
                    Text("Ingenting er sendt til AI ennå.").font(PF.ui(13)).foregroundStyle(p.mut).padding(14)
                }
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    logRow(r)
                }
                if audit.rows.count > 6 {
                    Rectangle().fill(p.line).frame(height: 1)
                    Button { withAnimation(.easeOut(duration: 0.2)) { all.toggle() } } label: {
                        Text(all ? "Vis færre" : "Vis alle \(audit.rows.count) ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        Text("Viser hva som ble sendt til hvilken motor. Gemini får aldri bildet, varelinjer, beløp, org.nr. eller kortdata.")
            .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 6).fixedSize(horizontal: false, vertical: true)
    }

    private func logRow(_ r: AiAuditRow27) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("\(r.engineName) · \(r.purposeName)").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Spacer(minLength: 6)
                Text(r.ts.map { JS.fmt($0, "dd.MM HH:mm") } ?? "").font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
            }
            if !r.fields.isEmpty {
                Text("Sendt: \(r.fields)").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }
}

/* ---------- Velg logo ---------- */

/// Liten pille «Velg logo» som åpner arket. Vises der butikken mangler logo.
struct MerchantLogo27Button: View {
    @Environment(\.paper) private var p
    let name: String
    var receiptId: Int? = nil
    var onDone: () -> Void = {}
    @State private var open: Bool = false

    var body: some View {
        Button { Haptics.shared.tap(); open = true } label: {
            Text("Velg logo").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                .padding(.horizontal, 12).frame(height: 30)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $open) {
            MerchantLogo27Sheet(name: name, receiptId: receiptId, done: { open = false; onDone() }).environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .sheetEdge30(p.bg)
        }
    }
}

struct MerchantLogo27Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let name: String
    let receiptId: Int?
    let done: () -> Void
    @State private var domain: String = ""
    @State private var photo: PhotosPickerItem? = nil
    @State private var busy: Bool = false
    @State private var note: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        PLabel(text: "Logo")
                        Text(name).font(PF.serif(24, medium: true)).foregroundStyle(p.ink).lineLimit(2)
                    }
                    Spacer()
                    Button { done() } label: {
                        Text("Lukk").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 16).frame(height: 36).background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Text("Koden finner logoen på nettsiden til butikken. AI får aldri bildet av kvitteringen.").font(PF.ui(13)).foregroundStyle(p.mut)
                    .fixedSize(horizontal: false, vertical: true)
                PInkButton(title: busy ? "Leter …" : "✦ Finn logo automatisk", height: 46, full: true) { findAuto() }
                    .disabled(busy)
                PLabel(text: "Lim inn domene").padding(.top, 6)
                HStack(spacing: 8) {
                    TextField("", text: $domain, prompt: Text("f.eks. blomsterlandet.no").foregroundColor(p.mut))
                        .font(PF.ui(15, .medium)).foregroundStyle(p.ink)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.done).onSubmit { saveDomain() }
                        .padding(.horizontal, 14).frame(height: 46)
                        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
                    Button { saveDomain() } label: {
                        Text("Bruk").font(PF.ui(14, .bold)).foregroundStyle(p.bg).padding(.horizontal, 18).frame(height: 46).background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(busy || cleanDomain.isEmpty)
                    .opacity(cleanDomain.isEmpty ? 0.4 : 1)
                }
                PLabel(text: "Last opp bilde").padding(.top, 6)
                PhotosPicker(selection: $photo, matching: .images) {
                    Text("Velg bilde").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(busy)
                if !note.isEmpty { Text(note).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 30)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onChange(of: photo) { _, it in
            guard let it else { return }
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d), let png = img.scaled(max: 256).pngData() {
                    await upload(png)
                }
                photo = nil
            }
        }
    }

    private var cleanDomain: String {
        var s: String = domain.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for pre in ["https://", "http://", "www."] where s.hasPrefix(pre) { s = String(s.dropFirst(pre.count)) }
        if let i = s.firstIndex(of: "/") { s = String(s[..<i]) }
        return s.contains(".") ? s : ""
    }

    private func findAuto() {
        busy = true
        note = ""
        var body: [String: Any] = ["name": name]
        if let r = receiptId { body["receiptId"] = r }
        Task {
            defer { busy = false }
            do {
                let d: Data = try await store.api.call("POST", "/merchants/logo", json: body)
                let o: [String: Any] = JS.obj(d)
                if JS.bool(o, "none") == true {
                    note = "Fant ingen logo. Lim inn domenet eller last opp et bilde."
                } else {
                    finish("Logoen er lagret" + (JS.str(o, "domain").map { " (\($0))" } ?? ""))
                }
            } catch let e as APIError {
                note = e.status == 404 ? "Logo-oppslaget finnes ikke på serveren ennå. Oppdater homelab." : e.message
            } catch {
                note = error.localizedDescription
            }
        }
    }

    private func saveDomain() {
        let dm: String = cleanDomain
        guard !dm.isEmpty else { return }
        busy = true
        note = ""
        Task {
            defer { busy = false }
            do {
                _ = try await store.api.call("POST", "/merchants/logo/manual", json: ["name": name, "domain": dm])
                finish("Logoen fra \(dm) er lagret")
            } catch let e as APIError {
                note = e.message
            } catch {
                note = error.localizedDescription
            }
        }
    }

    private func upload(_ png: Data) async {
        busy = true
        note = ""
        defer { busy = false }
        do {
            _ = try await store.api.upload("/merchants/logo/manual", parts: [API.Part.text("name", name),
                                                                              API.Part(name: "file", filename: "logo.png", mime: "image/png", data: png)])
            finish("Logoen er lagret")
        } catch let e as APIError {
            note = e.message
        } catch {
            note = error.localizedDescription
        }
    }

    private func finish(_ msg: String) {
        Haptics.shared.success()
        store.flash(msg)
        done()
    }
}
