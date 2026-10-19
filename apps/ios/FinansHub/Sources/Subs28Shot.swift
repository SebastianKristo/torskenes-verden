import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Prompt 28: abonnement fra skjermbilde – lesing og feilkort ---------------- */
// prompts/prompt-28-pakke/claude-code-abo-skjermbilde-fiks.md. Klienten sender alltid JPEG 0.85 ≤ 1600 px (aldri HEIC).
// POST /finans/api/subscriptions/from-screenshot[?engine=gemini] (multipart «image»), 130 s tidsgrense.
// Feil: {error, code:'ollama_down'|'no_vision'|'timeout'|'not_found'|…, canGemini}. Gemini bare etter trykk.

/// Lesetilstand for ett skjermbilde.
@MainActor
@Observable
final class SubShot28Model {
    var busy: Bool = false
    var slow: Bool = false
    var result: SubShotResult27? = nil
    var code: String = ""
    var message: String = ""
    var canGemini: Bool = false
    var engine: String = "ollama"
    var installing: Bool = false
    var installPct: Double = 0
    var installText: String = ""
    @ObservationIgnored var image: UIImage? = nil
    @ObservationIgnored private var started: Bool = false

    func startOnce(_ img: UIImage?, _ store: Store) {
        if started { return }
        started = true
        image = img
        Task { await read(store, gemini: false) }
    }

    func read(_ store: Store, gemini: Bool) async {
        guard let img = image else { return }
        result = nil
        code = ""
        message = ""
        busy = true
        slow = false
        engine = gemini ? "gemini" : "ollama"
        let slowTask: Task<Void, Never> = Task { @MainActor in
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled && self.busy { self.slow = true }
        }
        defer { slowTask.cancel(); busy = false; slow = false }
        guard let jpg = img.scaled(max: 1600).jpegData(compressionQuality: 0.85) else {
            code = "bad_image"
            message = "Fikk ikke lest bildet."
            return
        }
        let path: String = "/subscriptions/from-screenshot" + (gemini ? "?engine=gemini" : "")
        do {
            let part: API.Part = API.Part(name: "image", filename: "skjermbilde.jpg", mime: "image/jpeg", data: jpg)
            let d: Data = try await store.api.upload(path, parts: [part], timeout: 130)
            let r: SubShotResult27 = SubShotResult27(JS.obj(d))
            if r.name.isEmpty || r.price <= 0 {
                code = "not_found"
                message = "Fant ikke et abonnement i bildet."
            } else {
                result = r
            }
        } catch let e as APIError {
            apply(e)
        } catch {
            code = "ollama_down"
            message = error.localizedDescription
        }
    }

    private func apply(_ e: APIError) {
        canGemini = e.canGemini
        if let c = e.code, !c.isEmpty {
            code = c
            message = e.message
            return
        }
        // Eldre server eller nettverksfeil uten code.
        if e.status == 0 && e.message.contains("i tide") { code = "timeout" }
        else if e.status == 404 { code = "old_server" }
        else if e.status == 504 { code = "timeout" }
        else if e.status == 422 { code = "not_found" }
        else { code = "ollama_down" }
        message = e.message
    }

    /// POST /finans/api/ai/vision/install → SSE {name, status, pct, completed, total, done, error}; «done» til slutt.
    func install(_ store: Store) async {
        if installing { return }
        installing = true
        installPct = 0
        installText = "Starter nedlastingen …"
        defer { installing = false }
        let base: String = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + "/finans/api/ai/vision/install") else { return }
        var r: URLRequest = URLRequest(url: url)
        r.httpMethod = "POST"
        r.timeoutInterval = 3600
        r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if let t = store.api.token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        var ok: Bool = false
        do {
            let (bytes, res) = try await URLSession.shared.bytes(for: r)
            let status: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
            if status == 403 { installText = "Bare administratorer kan installere modeller."; return }
            if status >= 400 { installText = "Installeringen feilet (\(status))."; return }
            for try await line in bytes.lines {
                guard line.hasPrefix("data:") else { continue }
                let json: String = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                let o: [String: Any] = JS.obj(Data(json.utf8))
                if let err = JS.str(o, "error") { installText = err; if o["ok"] != nil || (o["done"] as? Bool) == true { break } }
                if let pct = JS.num(o, "pct") { installPct = Swift.min(1, Swift.max(0, pct > 1 ? pct / 100 : pct)) }
                if let st = JS.str(o, "status"), JS.str(o, "error") == nil { installText = st }
                if (o["ok"] as? Bool) == true { ok = true; break }
                if (o["done"] as? Bool) == true && JS.str(o, "error") == nil { ok = true }
            }
        } catch {
            installText = "Mistet kontakten under installeringen."
        }
        if ok {
            installPct = 1
            installText = "qwen2.5vl er installert."
            Haptics.shared.success()
            await read(store, gemini: false)
        }
    }
}

/// Panelet i arket: miniatyr, status (leser / resultat / feilkort) og knappene.
struct SubShot28Panel: View {
    @Environment(Store.self) private var store
    let c: SubPal28
    let image: UIImage?
    let add: (SubShotResult27) -> Void
    let edit: (SubShotResult27) -> Void
    let manual: () -> Void
    @Binding var pick: PhotosPickerItem?
    @State private var m: SubShot28Model = SubShot28Model()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                SubShot28Thumb(c: c, image: image)
                SubShot28Status(c: c, m: m).frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.border, lineWidth: 1))
            if let r = m.result, !m.busy { SubShot28ResultButtons(c: c, r: r, add: add, edit: edit) }
            if !m.code.isEmpty && !m.busy { SubShot28Error(c: c, m: m, manual: manual) }
            PhotosPicker(selection: $pick, matching: .images) {
                Text("Velg et annet bilde").font(PF.ui(15, .bold)).foregroundStyle(c.ink)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(c.border, lineWidth: 1))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(m.busy)
            Text(m.engine == "gemini" ? "Bildet ble sendt til Google Gemini fordi du ba om det." : "Leses lokalt av bildemodellen på hjemmeserveren. Bildet lagres ikke.")
                .font(PF.ui(12.5)).foregroundStyle(c.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
        .onAppear { m.startOnce(image, store) }
        .onChange(of: image) { _, img in
            m.image = img
            Task { await m.read(store, gemini: false) }
        }
    }
}

struct SubShot28Thumb: View {
    let c: SubPal28
    let image: UIImage?

    var body: some View {
        ZStack(alignment: .top) {
            c.seg
            if let image { Image(uiImage: image).resizable().scaledToFill() }
        }
        .frame(width: 76, height: 130)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(c.border, lineWidth: 1))
    }
}

struct SubShot28Status: View {
    let c: SubPal28
    let m: SubShot28Model

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if m.busy {
                Text(m.engine == "gemini" ? "✦ Gemini leser skjermbildet …" : "✦ Ollama leser skjermbildet …").font(PF.ui(15, .bold)).foregroundStyle(c.ink)
                Text(m.slow ? "Laster bildemodellen … Første lesing kan ta opptil ett minutt." : "Finner tjeneste, plan, pris og trekkdato …")
                    .font(PF.ui(13.5)).foregroundStyle(c.mut).fixedSize(horizontal: false, vertical: true)
                ProgressView().tint(c.lab).padding(.top, 8)
            } else if let r = m.result {
                SubShot28Rows(c: c, r: r)
            } else if !m.code.isEmpty {
                Text("Kunne ikke lese bildet").font(PF.ui(15, .bold)).foregroundStyle(c.ink)
                Text("Se forklaringen under.").font(PF.ui(13.5)).foregroundStyle(c.mut)
            } else {
                Text("Velg et skjermbilde fra App Store, e-post eller kontosiden.").font(PF.ui(13.5)).foregroundStyle(c.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct SubShot28Rows: View {
    let c: SubPal28
    let r: SubShotResult27

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            row("Tjeneste", r.name.isEmpty ? "–" : r.name, r.check(["tjeneste", "name"]))
            row("Plan", r.plan.isEmpty ? "–" : r.plan, r.check(["plan"]))
            row("Pris", r.priceText, r.check(["pris", "price"]))
            row("Syklus", r.cycle == "yearly" ? "Årlig" : "Månedlig", r.check(["syklus", "cycle"]))
            row("Neste trekk", r.nextText, r.check(["neste_trekk", "next"]))
            row("Kategori", r.category, r.check(["kategori", "category"]))
        }
    }

    private func row(_ k: String, _ v: String, _ unsure: Bool) -> some View {
        HStack(spacing: 8) {
            Text(k).font(PF.ui(12.5)).foregroundStyle(c.mut).frame(width: 80, alignment: .leading)
            Text(v).font(PF.ui(14, .semibold)).foregroundStyle(c.ink).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            Text(unsure ? "Sjekk" : "✓").font(PF.ui(11.5, .bold)).foregroundStyle(unsure ? c.lab : c.pos)
        }
        .frame(minHeight: 30)
        .overlay(alignment: .bottom) { Rectangle().fill(c.sep).frame(height: 1) }
    }
}

struct SubShot28ResultButtons: View {
    let c: SubPal28
    let r: SubShotResult27
    let add: (SubShotResult27) -> Void
    let edit: (SubShotResult27) -> Void

    var body: some View {
        let n: String = r.name.isEmpty ? "abonnementet" : r.name
        VStack(alignment: .leading, spacing: 8) {
            SubPrimary28(c: c, title: r.existingId != nil ? "Oppdater \(n)" : "+ Legg til \(n)", enabled: !r.name.isEmpty) { add(r) }
            SubSecondary28(c: c, title: "Rediger først") { edit(r) }
            if r.existingId != nil {
                Text("\(n) finnes allerede. «Oppdater» endrer plan og pris.").font(PF.ui(12.5)).foregroundStyle(c.mut)
            }
        }
    }
}

/// Feilkortet: tekst etter code og knappene fra spesifikasjonen (kort i card, tekst i ink, knapp i lab).
struct SubShot28Error: View {
    @Environment(Store.self) private var store
    let c: SubPal28
    let m: SubShot28Model
    let manual: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text).font(PF.ui(15, .semibold)).foregroundStyle(c.ink).fixedSize(horizontal: false, vertical: true)
            if m.installing || !m.installText.isEmpty { installView }
            VStack(spacing: 8) { buttons }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.border, lineWidth: 1))
    }

    private var text: String {
        switch m.code {
        case "ollama_down": return "Får ikke kontakt med Ollama på hjemmeserveren."
        case "no_vision": return "Ingen bildemodell installert."
        case "timeout": return "Bildemodellen brukte for lang tid."
        case "not_found": return "Fant ikke et abonnement i bildet."
        case "old_server": return "Skjermbilde-lesing finnes ikke på serveren ennå. Oppdater Homelab."
        default: return m.message.isEmpty ? "Noe gikk galt under lesingen." : m.message
        }
    }

    private var gemini: Bool { m.canGemini && ["ollama_down", "no_vision", "timeout"].contains(m.code) }

    @ViewBuilder private var buttons: some View {
        switch m.code {
        case "no_vision":
            SubPrimary28(c: c, title: m.installing ? "Installerer qwen2.5vl …" : "Installer qwen2.5vl", enabled: !m.installing) {
                Task { await m.install(store) }
            }
        case "not_found":
            SubPrimary28(c: c, title: "Skriv inn selv") { manual() }
        case "ollama_down", "timeout":
            SubPrimary28(c: c, title: "Prøv igjen") { retry() }
        default:
            SubPrimary28(c: c, title: "Prøv igjen") { retry() }
            SubSecondary28(c: c, title: "Skriv inn selv") { manual() }
        }
        if gemini {
            SubSecondary28(c: c, title: "Les med Gemini") {
                Haptics.shared.tap()
                Task { await m.read(store, gemini: true) }
            }
            Text("Gemini sender bildet til Google. Brukes bare når du trykker.").font(PF.ui(12)).foregroundStyle(c.mut)
        }
    }

    private var installView: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(c.seg)
                    Capsule().fill(c.lab).frame(width: g.size.width * m.installPct)
                }
            }
            .frame(height: 6)
            Text(m.installText + (m.installing && m.installPct > 0 ? " · \(Int((m.installPct * 100).rounded())) %" : ""))
                .font(PF.ui(12.5)).foregroundStyle(c.mut).lineLimit(2)
        }
    }

    private func retry() {
        Haptics.shared.tap()
        Task { await m.read(store, gemini: false) }
    }
}
