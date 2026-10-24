import SwiftUI
import UIKit

// ---------------- Prompt 51 (RCPTUI51): kvitteringsrettingen i FinansHub ----------------
// - Full oppløsning: bildet til POST /receipts/scan sendes som originalen (eller høyst 2560 px når «Lagre originalbildet» er av),
//   aldri bare 1600 px – OCR-en på serveren trenger minst ca. 2000 px på lengste side.
// - Merkelapp for kilden til butikknavnet (merchant_source/merchant_label fra serveren): «fra org.nr.», «kjent butikk»,
//   «modellens forslag», «rettet av deg».
// - Sammenleggbar «Rådata»: OCR-motor, rader i mono og bildestørrelse (ocr_raw), så brukeren ser om feilen ligger i OCR-en
//   eller i modellen.
// - Rettet butikknavn → POST /receipts/:id/merchant {merchant, org_number?}, så serveren lærer org.nr. → visningsnavn.
// Feltnavnene står i SERVER51-API.md (RCPTSRV51).

/// Forbehandlingen serveren gjorde før OCR (ocr_raw.preprocess).
struct Rc51Pre: Decodable, Hashable {
    var rotated: Bool?
    var perspective: Bool?
    var cropped: Bool?
    var upscaled: Bool?
    var from: String?
}

/// OCR-radene som ble lest for kvitteringen (ocr_raw i GET /finans/api/receipts/:id).
struct Rc51Raw: Decodable, Hashable {
    var engine: String?
    var engine_label: String?
    var rows: [String]?
    var image_size: [Double]?
    var ms: Double?
    var preprocess: Rc51Pre?

    enum CodingKeys: String, CodingKey { case engine, engine_label, rows, image_size, ms, preprocess }

    /// Tålende: et felt med uventet form gir nil, aldri en feil (ellers ville hele kvitteringslisten feile).
    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        engine = try? c.decodeIfPresent(String.self, forKey: .engine)
        engine_label = try? c.decodeIfPresent(String.self, forKey: .engine_label)
        rows = try? c.decodeIfPresent([String].self, forKey: .rows)
        image_size = try? c.decodeIfPresent([Double].self, forKey: .image_size)
        ms = try? c.decodeIfPresent(Double.self, forKey: .ms)
        preprocess = try? c.decodeIfPresent(Rc51Pre.self, forKey: .preprocess)
    }

    var engineText: String {
        if let l = engine_label, !l.isEmpty { return l }
        switch engine ?? "" {
        case "mac_vision": return "Mac Vision"
        case "tesseract": return "Tesseract"
        case "ios_vision": return "iPhone (Vision)"
        case "android_mlkit": return "Android (ML Kit)"
        default: return engine ?? "ukjent"
        }
    }

    var sizeText: String {
        guard let s = image_size, s.count == 2, s[0] > 0, s[1] > 0 else { return "ukjent" }
        return String(Int(s[0])) + " × " + String(Int(s[1])) + " px"
    }

    var preText: String {
        guard let p = preprocess else { return "" }
        var out: [String] = []
        if p.rotated == true { out.append("rotert") }
        if p.perspective == true { out.append("perspektiv rettet") }
        if p.cropped == true { out.append("beskåret") }
        if p.upscaled == true { out.append("skalert opp") }
        if p.from == "scan" { out.append("fra 1600 px-kopien") } else if p.from == "original" { out.append("fra originalen") }
        return out.joined(separator: ", ")
    }
}

/// Det skjemaet trenger fra GET /finans/api/receipts/:id (og «stored» i svaret fra /receipts/scan).
struct Rc51Detail: Decodable {
    var merchant_source: String?
    var merchant_label: String?
    var ocr_raw: Rc51Raw?

    enum CodingKeys: String, CodingKey { case merchant_source, merchant_label, ocr_raw }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else { return }
        merchant_source = try? c.decodeIfPresent(String.self, forKey: .merchant_source)
        merchant_label = try? c.decodeIfPresent(String.self, forKey: .merchant_label)
        ocr_raw = try? c.decodeIfPresent(Rc51Raw.self, forKey: .ocr_raw)
    }
}

enum Rc51 {
    /// Bildet til «image» når «Lagre originalbildet» er av: oppreist JPEG på høyst 2560 px (aldri ned mot 1600 px).
    nonisolated static func fullJpeg(_ image: UIImage) -> Data? {
        image.scaled(max: 2560).jpegData(compressionQuality: 0.9)
    }

    nonisolated static func sourceText(_ source: String?, label: String?) -> String? {
        if let l = label, !l.isEmpty { return l }
        switch source ?? "" {
        case "orgnr": return "fra org.nr."
        case "known": return "kjent butikk"
        case "model": return "modellens forslag"
        case "user": return "rettet av deg"
        default: return nil
        }
    }

    /// Rettet butikknavn → serveren lærer koblingen org.nr. → navn. false = eldre server (404/405) eller feil – PATCH lærer da.
    @MainActor static func learn(_ store: Store, id: String, merchant: String, org: String?) async -> Bool {
        let m: String = merchant.trimmingCharacters(in: .whitespacesAndNewlines)
        if m.isEmpty { return false }
        var body: [String: Any] = ["merchant": m]
        let digits: String = (org ?? "").filter { (c: Character) in c.isNumber }
        if digits.count == 9 { body["org_number"] = digits }
        do {
            _ = try await store.api.call("POST", "/receipts/\(id)/merchant", json: body)
            return true
        } catch {
            return false
        }
    }
}

/// Merkelappen ved butikkfeltet («fra org.nr.», «kjent butikk», «modellens forslag», «rettet av deg»).
struct Receipt51SourceTag: View {
    @Environment(\.paper) private var p
    let source: String?
    let label: String?

    var body: some View {
        if let t = Rc51.sourceText(source, label: label) {
            Text(t).font(PF.ui(11, .bold)).foregroundStyle(color)
                .padding(.horizontal, 8).frame(height: 20)
                .background(color.opacity(0.13), in: Capsule())
                .accessibilityLabel("Butikknavn " + t)
        }
    }

    private var color: Color {
        switch source ?? "" {
        case "orgnr": return p.pos
        case "model": return Color(hex: "#b07612")
        default: return p.mut
        }
    }
}

/// «Rådata» (lukket som standard). Uten ocr_raw i svaret hentes detaljen når den åpnes.
struct Receipt51RawSection: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let receiptId: String?
    let raw: Rc51Raw?
    @State private var open: Bool = false
    @State private var loaded: Rc51Raw? = nil
    @State private var loading: Bool = false
    @State private var missing: Bool = false

    private var shown: Rc51Raw? { raw ?? loaded }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Haptics.shared.select()
                withAnimation(.easeOut(duration: 0.18)) { open.toggle() }
                if open { load() }
            } label: {
                HStack(spacing: 6) {
                    Text("RÅDATA").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                    Text(summary).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                    Spacer(minLength: 6)
                    Image(systemName: open ? "chevron.up" : "chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(p.mut)
                }
                .frame(minHeight: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(open ? "Skjul rådata" : "Vis rådata")
            if open { content }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var summary: String {
        guard let r = shown else { return "" }
        return "· " + r.engineText + " · " + String((r.rows ?? []).count) + " rader"
    }

    @ViewBuilder private var content: some View {
        if let r = shown {
            Receipt51RawBody(raw: r)
        } else if loading {
            Text("Henter rådata …").font(PF.ui(12.5)).foregroundStyle(p.mut)
        } else {
            Text("Ingen OCR-rader er lagret for denne kvitteringen.").font(PF.ui(12.5)).foregroundStyle(p.mut)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func load() {
        if shown != nil || loading || missing { return }
        guard let id = receiptId else { missing = true; return }
        loading = true
        Task { @MainActor in
            let d: Rc51Detail? = try? await store.api.get("/receipts/\(id)", as: Rc51Detail.self)
            loaded = d?.ocr_raw
            missing = d?.ocr_raw == nil
            loading = false
        }
    }
}

struct Receipt51RawBody: View {
    @Environment(\.paper) private var p
    let raw: Rc51Raw

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            fact("OCR-motor", raw.engineText)
            fact("Bildestørrelse", raw.sizeText)
            if let ms = raw.ms, ms > 0 { fact("Tid", ms < 1000 ? String(Int(ms)) + " ms" : String(format: "%.1f s", ms / 1000)) }
            if !raw.preText.isEmpty { fact("Forbehandling", raw.preText) }
            rows
            Text("Står teksten riktig her, men feltene over er feil, ligger feilen i modellen. Mangler teksten, ligger den i OCR-en.")
                .font(PF.ui(11.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
    }

    @ViewBuilder private var rows: some View {
        let r: [String] = raw.rows ?? []
        if r.isEmpty {
            Text("OCR-en fant ingen tekst.").font(PF.ui(12.5)).foregroundStyle(p.mut)
        } else {
            Text(Receipt51RawBody.numbered(r)).font(PF.mono(11.5, bold: false)).foregroundStyle(p.ink)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    nonisolated static func numbered(_ rows: [String]) -> String {
        var out: [String] = []
        for (i, s) in rows.enumerated() {
            let n: String = String(i + 1)
            out.append(String(repeating: " ", count: max(0, 3 - n.count)) + n + "  " + s)
        }
        return out.joined(separator: "\n")
    }

    private func fact(_ k: String, _ v: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(k).font(PF.ui(12)).foregroundStyle(p.mut).frame(width: 110, alignment: .leading)
            Text(v).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}
