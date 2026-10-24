import SwiftUI
import UIKit

// ---------------- Prompt 48: veien en kvittering tar fra iPhonen ----------------
// 1. Bilde (dokumentskanneren retter opp selv; bilder fra kamera/bibliotek rettes med Vision når OCR er på).
// 2. «Les teksten på iPhone» på (av som standard): Vision-OCR → device_ocr (felles OCR-format, Receipt48Ocr.swift).
// 3. «Tolk kvitteringer på iPhone» på (av som standard, krever 2 og Apple Intelligence): Foundation Models → device_parse.
// 4. Alltid: POST /finans/api/receipts/scan (multipart: image + scan + thumb + device_ocr? + device_parse? + client) til den
//    innloggede Homelab-serveren – aldri til noen annen tjeneste. Glimt validerer alt og kjører kjeden A → B → C → T → D.
// 5. Svaret vises i et redigerbart skjema (Receipt48Sheet.swift) med usikre felt markert og merkelapp for veien. Rettelser
//    lagres med PATCH /receipts/:id + POST /receipts/:id/corrections (testdata på serveren).
// Uten nett / serveren nede: bildet + device_ocr + device_parse legges i «Venter på opplasting» (UploadQueue18) og sendes til
// /receipts/scan når serveren svarer igjen; utkastet fra device_parse vises lokalt. Eldre server uten /receipts/scan (404/405):
// bildet lastes opp som før (POST /receipts).

/// Ett resultat som vises i skjemaet: fra serveren (response) eller et lokalt utkast (draft, lagret i køen).
struct Rc48Result: Identifiable {
    let id: String = UUID().uuidString
    let image: UIImage
    let response: Rc48ScanResponse?
    let draft: Rc48Receipt?
    let categories: [String]

    var receipt: Rc48Receipt { response?.receipt ?? draft ?? Rc48Receipt() }
    var flagged: Set<String> {
        if let r = response { return r.flagged }
        return Rc48Check.localFlags(draft ?? Rc48Receipt())
    }
    var label: String { response.map { (r: Rc48ScanResponse) in Rc48Check.label(r) } ?? "iPhone · utkast" }
    var offline: Bool { response == nil }
}

@MainActor
@Observable
final class Receipt48Flow {
    static let shared = Receipt48Flow()

    /// «Les teksten på iPhone» (Vision på enheten). Av som standard, per enhet.
    static let ocrKey: String = "rc48_device_ocr"
    static var ocrEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: ocrKey) }
        set { UserDefaults.standard.set(newValue, forKey: ocrKey) }
    }
    /// «Tolk kvitteringer på iPhone» (Foundation Models) – samme bryter som i prompt 47 (av som standard). Krever OCR-bryteren.
    static var parseEnabled: Bool { Receipt47.enabled && ocrEnabled }

    /// Teksten i pillen nederst («Leser teksten på iPhonen …»), nil = skjult.
    var status: String? = nil
    /// Skjemaet som vises nå.
    var shown: Rc48Result? = nil
    private var ready: [Rc48Result] = []
    private var waiting: [(imgs: [UIImage], scanned: Bool)] = []
    private var running: Bool = false
    private var cats: [String] = []
    private var catsAt: Date? = nil

    /// Hver gruppe er én kvittering (flere sider fra dokumentskanneren = én gruppe). scanned = fra dokumentskanneren (rettet opp).
    func handle(_ groups: [[UIImage]], _ store: Store, scanned: Bool) {
        for g in groups where !g.isEmpty { waiting.append((imgs: g, scanned: scanned)) }
        if running { return }
        running = true
        Task { @MainActor in
            while !self.waiting.isEmpty {
                let w: (imgs: [UIImage], scanned: Bool) = self.waiting.removeFirst()
                await self.process(w.imgs, scanned: w.scanned, store)
            }
            self.running = false
            self.status = nil
            try? await store.loadReceipts()
            await store.loadJobs()
        }
    }

    /// Lukker skjemaet og viser neste resultat.
    func close() {
        shown = nil
        if ready.isEmpty { return }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            if self.shown == nil, !self.ready.isEmpty { self.shown = self.ready.removeFirst() }
        }
    }

    private func present(_ r: Rc48Result, _ store: Store) async {
        if shown != nil { ready.append(r); return }
        // Skanne-arket kan stå oppe: lukk det før skjemaet vises (ett ark om gangen).
        if store.paperScanOpen {
            store.paperScanOpen = false
            try? await Task.sleep(for: .milliseconds(450))
        }
        if shown == nil { shown = r } else { ready.append(r) }
    }

    /* ---------- Én kvittering ---------- */

    private func process(_ imgs: [UIImage], scanned: Bool, _ store: Store) async {
        guard let first = imgs.first else { return }
        var image: UIImage = first
        if imgs.count > 1 {
            guard let joined = Rc48Prep.stitch(imgs) else {
                // For lang til ett bilde: som før, én PDF til Glimt.
                store.upload([.pdf(Receipts23Page.pdf(imgs))], onDevice47: false)
                return
            }
            image = joined
        }
        var ocr: ReceiptOcrResult? = nil
        var parse: Rc48Receipt? = nil
        if Receipt48Flow.ocrEnabled {
            status = "Leser teksten på iPhonen …"
            image = await Rc48Prep.prepared(image, rectify: !scanned)
            ocr = try? await ReceiptOcrScanner.shared.extractText(from: image)
        }
        let categories: [String] = await categoryList(store, fetch: Receipt48Flow.parseEnabled && ocr != nil)
        if Receipt48Flow.parseEnabled, let o = ocr {
            status = "✦ Tolker kvitteringen på iPhonen …"
            parse = await Receipt48Parse.parse(rows: o.rows, categories: categories)
        }
        let ocrJson: String? = ocr?.json
        let parseJson: String? = parse?.json
        guard store.canUploadNow else {
            await offline(image, ocrJson, parseJson, parse, categories, store, error: "Venter på Wi-Fi")
            return
        }
        status = "Glimt kontrollerer kvitteringen …"
        let parts: [API.Part] = store.scan48Parts(image, ocr: ocrJson, parse: parseJson)
        do {
            let d: Data = try await store.api.upload("/receipts/scan", parts: parts, timeout: 180)
            let res: Rc48ScanResponse = try JSONDecoder().decode(Rc48ScanResponse.self, from: d)
            status = nil
            await present(Rc48Result(image: image, response: res, draft: nil, categories: categories), store)
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            // Eldre server uten /receipts/scan: bildet tolkes av Glimt som før.
            status = nil
            store.upload([.image(image)], onDevice47: false)
        } catch let e as APIError where e.status == 0 && e.code == "timeout" {
            // Kjeden fullføres på serveren selv om appen gir opp å vente – ikke legg den i køen (da blir den dobbel).
            status = nil
            store.flash("Glimt bruker lang tid – kvitteringen dukker opp under Kvitteringer")
        } catch let e as APIError where e.status == 0 || e.status >= 500 {
            await offline(image, ocrJson, parseJson, parse, categories, store, error: e.message)
        } catch let e as APIError {
            status = nil
            store.flash(e.message)
        } catch is DecodingError {
            status = nil
            store.flash("Kvitteringen er lagret · åpne den under Kvitteringer")
        } catch {
            await offline(image, ocrJson, parseJson, parse, categories, store, error: error.localizedDescription)
        }
    }

    /// Uten forbindelse: i køen (sendes til /receipts/scan senere). Utkastet fra device_parse vises lokalt.
    private func offline(_ image: UIImage, _ ocr: String?, _ parse: String?, _ draft: Rc48Receipt?, _ categories: [String], _ store: Store, error: String) async {
        status = nil
        store.enqueuePending(.image(image), folder: nil, error: error, scan48: true, ocr48: ocr, parse48: parse)
        if let draft {
            await present(Rc48Result(image: image, response: nil, draft: draft, categories: categories), store)
        } else {
            store.flash("Lagret på telefonen · sendes til Glimt når forbindelsen er tilbake")
        }
    }

    /// Brukerens utgiftskategorier: fra GET /receipts/health (bufret i 10 min) når modellen på iPhonen skal velge, ellers /bootstrap.
    func categoryList(_ store: Store, fetch: Bool) async -> [String] {
        if let at = catsAt, Date().timeIntervalSince(at) < 600, !cats.isEmpty { return cats }
        if fetch, store.canUploadNow, let h = try? await store.api.module("/finans/api", "/receipts/health", as: Rc48Health.self, timeout: 8),
           let c = h.categories, !c.isEmpty {
            cats = c
            catsAt = Date()
            return c
        }
        let boot: [String] = (store.boot?.categories ?? []).filter { (c: Category) in c.kind == "expense" }.map { (c: Category) in c.name }
        return boot.isEmpty ? cats : boot
    }

    /* ---------- Lagre fra skjemaet ---------- */

    /// Lagrer brukerens rettelser. Returnerer en feilmelding (vises i skjemaet), ellers nil.
    func save(_ r: Rc48Result, edited: Rc48Receipt, _ store: Store) async -> String? {
        guard let res = r.response else { close(); return nil }
        let id: String = res.receiptId
        let orig: Rc48Receipt = res.receipt ?? Rc48Receipt()
        var patch: [String: Any] = [:]
        if edited.merchant != orig.merchant { patch["merchant"] = edited.merchant }
        if edited.date != orig.date, Rc48Check.validDate(edited.date) { patch["date"] = edited.date }
        if abs(edited.total - orig.total) >= 0.005 { patch["total"] = edited.total }
        if edited.categorySuggestion != orig.categorySuggestion,
           let c = (store.boot?.categories ?? []).first(where: { (c: Category) in c.kind == "expense" && c.name.lowercased() == edited.categorySuggestion.lowercased() }) {
            patch["categoryId"] = c.id
        }
        do {
            // Prompt 51: rettet butikknavn (eller org.nr.) → POST /receipts/:id/merchant, så serveren lærer org.nr. → navn.
            // Eldre server (404/405) eller feil: navnet går med PATCH som før (serveren lærer også der).
            if edited.merchant != orig.merchant || (edited.orgNumber ?? "") != (orig.orgNumber ?? "") {
                await waitDone(id, store)
                if await Rc51.learn(store, id: id, merchant: edited.merchant, org: edited.orgNumber) { patch.removeValue(forKey: "merchant") }
            }
            if !patch.isEmpty {
                // Køen på serveren (kategori, bankmatch) skal være ferdig før rettelsen, ellers kan den skrive over.
                await waitDone(id, store)
                try await store.api.call("PATCH", "/receipts/\(id)", json: patch)
            }
            if edited.cleaned != orig.cleaned, let o = edited.object {
                // Testdata for eval (modellens svar + rettelsen). 400 = følger ikke formatet → ignoreres.
                _ = try? await store.api.call("POST", "/receipts/\(id)/corrections", json: ["receipt": o])
            }
        } catch let e as APIError {
            return e.message
        } catch {
            return error.localizedDescription
        }
        store.flash(patch.isEmpty ? "Lagret · ligger under Til godkjenning" : "Rettelsen er lagret")
        close()
        try? await store.loadReceipts()
        return nil
    }

    /// «Forkast»: kvitteringen er allerede lagret på serveren – den avvises (bildet beholdes og kan hentes fram igjen).
    func discard(_ r: Rc48Result, _ store: Store) async {
        if let id = r.response?.receiptId { _ = try? await store.api.call("POST", "/receipts/\(id)/reject") }
        store.flash(r.offline ? "Utkastet er lukket · kvitteringen sendes fortsatt" : "Kvitteringen er avvist")
        close()
        try? await store.loadReceipts()
    }

    private struct Status: Decodable { let status: String }

    private func waitDone(_ id: String, _ store: Store) async {
        for _ in 0..<15 {
            guard let s = try? await store.api.get("/receipts/\(id)", as: Status.self) else { return }
            if s.status != "pending" && s.status != "processing" { return }
            try? await Task.sleep(for: .milliseconds(1500))
        }
    }
}

/* ---------- Opplastingen ---------- */

extension Store {
    /// Delene til POST /finans/api/receipts/scan: image (originalen i full oppløsning, eller høyst 2560 px når «Lagre originalbildet»
    /// er av – prompt 51: aldri bare 1600 px, OCR-en på serveren trenger minst ca. 2000 px), scan (1600 px JPEG), thumb,
    /// device_ocr og device_parse (JSON, når bryterne er på) og client («ios <versjon>»).
    func scan48Parts(_ image: UIImage, ocr: String?, parse: String?) -> [API.Part] {
        var parts: [API.Part] = uploadParts(image).map { (p: API.Part) -> API.Part in
            p.name == "file" ? API.Part(name: "image", filename: p.filename, mime: p.mime, data: p.data) : p
        }
        if !keepOriginal, let big = Rc51Image.fullJpeg(image), let i = parts.firstIndex(where: { (p: API.Part) in p.name == "image" }) {
            parts[i] = API.Part(name: "image", filename: "kvittering.jpg", mime: "image/jpeg", data: big)
        }
        if let ocr, !ocr.isEmpty { parts.append(API.Part.text("device_ocr", ocr)) }
        if let parse, !parse.isEmpty { parts.append(API.Part.text("device_parse", parse)) }
        let v: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        parts.append(API.Part.text("client", "ios " + v))
        return parts
    }

    /// Fra dokumentskanneren (Receipts23): flere sider er én kvittering. I en bolig eller fra «Legg ved kvittering» som før.
    func uploadScanned48(_ imgs: [UIImage]) {
        guard let first = imgs.first else { return }
        let inFolder: Bool = (module == .folders || paperTab == "boliger") && editing == nil && (uploadFolder ?? folder?.id) != nil
        if editing != nil || inFolder {
            upload([imgs.count == 1 ? .image(first) : .pdf(Receipts23Page.pdf(imgs))])
            return
        }
        if paperTab != "kvitt" { paperGo("kvitt") }
        Receipt48Flow.shared.handle([imgs], self, scanned: true)
    }
}
