import SwiftUI
import UIKit

/* ---------------- Prompt 30: marker hvor i kvitteringen søketreffet er ---------------- */
// Fasit: design/Mobil Papir App.dc.html → Finans → Søk («tomat») → treff → transaksjon med kvittering, og
// prompts/prompt-30-pakke/claude-code-kvittering-highlight.md.
// – Gult banner over kvitteringen: «‹tomat› står på linje 3 · 24,90 kr» (+ «og 1 til»). Trykk scroller dit igjen, Fjern skjuler.
// – Matchende linjer: rgba(255,205,40,.42) med kant #e0a800, fet tekst; selve ordet #ffd23f. Pulserer to ganger (900 ms).
// – Match uavhengig av store/små bokstaver og aksenter. lineIndex[] fra søket (SERVER30) brukes når den finnes.
// – Bilde med bbox per linje ([x,y,w,h] i prosent): gule rektangler, zoom til første treff, knip for å zoome.
//   Uten bbox: «Les kvitteringen på nytt» (POST /finans/api/receipts/:id/reread).

@MainActor
@Observable
final class Hl30 {
    static let shared = Hl30()

    /// Søkeordet og transaksjonen det gjelder (settes når et treff åpnes fra Søk eller Liste med søketekst).
    var term: String = ""
    var txId: Int = 0
    var lineHint: [Int] = []
    var pulse: Int = 0
    var rereading: Bool = false

    func open(_ id: Int, term t: String, lines: [Int] = []) {
        let q: String = t.trimmingCharacters(in: .whitespacesAndNewlines)
        term = q
        txId = q.isEmpty ? 0 : id
        lineHint = lines
    }

    func clear() {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) {
            term = ""
            txId = 0
            lineHint = []
        }
    }

    func active(_ id: Int) -> Bool { txId == id && !term.isEmpty }

    /// Store/små bokstaver og aksenter likt («tomat» = «TOMATER», «creme» = «Crème»).
    nonisolated static func fold(_ s: String) -> String {
        s.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: Locale(identifier: "nb_NO")).lowercased()
    }

    /// Ordene som letes etter: hele søket først, ellers hvert ord på minst 3 tegn.
    nonisolated static func needles(_ term: String) -> [String] {
        let all: String = fold(term)
        let words: [String] = all.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init).filter { $0.count >= 3 }
        return [all] + words
    }

    /// Linjene som matcher (indekser), og ordet som traff.
    func matches(_ names: [String]) -> (idx: [Int], word: String) {
        let folded: [String] = names.map { Hl30.fold($0) }
        if !lineHint.isEmpty {
            let ok: [Int] = lineHint.filter { $0 >= 0 && $0 < names.count }
            if !ok.isEmpty {
                let firstLine: String = folded[ok[0]]
                let word: String = Hl30.needles(term).first(where: { (w: String) -> Bool in firstLine.contains(w) }) ?? ""
                return (ok, word)
            }
        }
        for n in Hl30.needles(term) where !n.isEmpty {
            let idx: [Int] = folded.indices.filter { folded[$0].contains(n) }
            if !idx.isEmpty { return (idx, n) }
        }
        return ([], "")
    }

    func reread(_ receiptId: String, txId: Int, _ store: Store) async {
        if receiptId.isEmpty || rereading { return }
        rereading = true
        defer { rereading = false }
        do {
            _ = try await store.api.call("POST", "/receipts/\(receiptId)/reread", json: [:])
            if let d = try? await store.api.call("GET", "/transactions/\(txId)") { store.txDetail = PaperTxData(JS.obj(d)) }
            store.flash("Kvitteringen er lest på nytt")
        } catch {
            // Prompt 50: lesbar feil (502/503/504/404) i stedet for «Feil 502» (Receipt50Reread.swift).
            store.flash(Receipt50Err.text(error).text)
        }
    }
}

/* ---------- Banneret ---------- */

struct Hl30Banner: View {
    @Environment(\.paper) private var p
    @MainActor private var h: Hl30 { Hl30.shared }
    let first: Int
    let count: Int
    let price: Double?

    var body: some View {
        HStack(spacing: 10) {
            Button {
                Haptics.shared.select()
                h.pulse += 1
                Set25Focus.shared.flash("hl30")
            } label: {
                Text(text).font(PF.ui(13.5, .semibold)).foregroundStyle(Color(hex: "#3a2e00"))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { h.clear() } label: {
                Text("Fjern").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#3a2e00"))
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(Color.white.opacity(0.55), in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 14).padding(.trailing, 8).padding(.vertical, 8)
        .background(Color(red: 1, green: 210.0 / 255.0, blue: 63.0 / 255.0).opacity(0.85), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color(hex: "#e0a800"), lineWidth: 1))
    }

    private var text: String {
        let pr: String = price.map { " · " + n2(abs($0)) + " kr" } ?? ""
        let more: String = count > 1 ? " og \(count - 1) til" : ""
        return "‹\(h.term)› står på linje \(first + 1)\(pr)\(more)"
    }
}

/* ---------- Én varelinje (med eller uten markering) ---------- */

struct Hl30Line: View {
    @MainActor private var h: Hl30 { Hl30.shared }
    let name: String
    let price: Double?
    let hit: Bool
    let word: String
    let first: Bool
    @State private var flash: Bool = false

    private static let ink: Color = Color(hex: "#2a2620")

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.dyn51(size: 12, weight: hit ? .bold : .regular, design: .monospaced)).foregroundStyle(Hl30Line.ink).lineLimit(1)
            Spacer(minLength: 6)
            Text(price.map { n2(abs($0)) } ?? "").font(.dyn51(size: 12, weight: hit ? .bold : .regular, design: .monospaced)).foregroundStyle(Hl30Line.ink)
        }
        .padding(.horizontal, hit ? 6 : 0).padding(.vertical, hit ? 3 : 0)
        .background {
            if hit {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Color(red: 1, green: 205.0 / 255.0, blue: 40.0 / 255.0).opacity(flash ? 0.75 : 0.42))
                    .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(Color(hex: "#e0a800"), lineWidth: 1))
            }
        }
        .padding(.horizontal, hit ? -6 : 0)
        .id(first ? Set25Focus.rowId("hl30") : "hl30-\(name)")
        .onAppear { if hit && first { pulseTwice() } }
        .onChange(of: h.pulse) { _, _ in if hit { pulseTwice() } }
    }

    /// Navnet i versaler med ordet sterkere markert (#ffd23f, som en markeringstusj).
    private var label: AttributedString {
        var a: AttributedString = AttributedString(name.uppercased())
        guard hit, !word.isEmpty else { return a }
        let upper: String = name.uppercased()
        let opts: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        if let r = upper.range(of: word, options: opts), let ar = Range(r, in: a) {
            a[ar].backgroundColor = Color(hex: "#ffd23f")
        }
        return a
    }

    private func pulseTwice() {
        Task { @MainActor in
            for _ in 0..<2 {
                try? await Task.sleep(for: .milliseconds(120))
                withAnimation(.easeInOut(duration: 0.22)) { flash = true }
                try? await Task.sleep(for: .milliseconds(225))
                withAnimation(.easeInOut(duration: 0.22)) { flash = false }
            }
        }
    }
}

/* ---------- Bildet med bbox-rektangler ---------- */

/// Kvitteringsbildet med gule rektangler over matchende linjer. Zoomer til første treff; knip for å zoome mer.
struct Hl30Image: View {
    @Environment(Store.self) private var store
    let path: String
    /// [x, y, w, h] i prosent av bildet.
    let boxes: [[Double]]
    @State private var img: UIImage? = nil
    @State private var zoom: CGFloat = 1
    @State private var pinch: CGFloat = 1

    var body: some View {
        ZStack {
            Color(hex: "#fbf8f1")
            if let img {
                content(img)
            } else {
                ProgressView().padding(30)
            }
        }
        .frame(height: 320)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .task(id: path) {
            img = await store.image(path.hasPrefix("/") || path.hasPrefix("http") ? path : "/" + path)
            zoom = boxes.isEmpty ? 1 : 2
        }
    }

    private func content(_ img: UIImage) -> some View {
        let first: [Double] = boxes.first ?? [0, 0, 100, 100]
        let ax: CGFloat = CGFloat((first[0] + first[2] / 2) / 100)
        let ay: CGFloat = CGFloat((first[1] + first[3] / 2) / 100)
        return Image(uiImage: img).resizable().scaledToFit()
            .overlay { Hl30Boxes(boxes: boxes) }
            .scaleEffect(zoom * pinch, anchor: UnitPoint(x: ax, y: ay))
            .gesture(
                MagnificationGesture()
                    .onChanged { (v: CGFloat) in pinch = v }
                    .onEnded { (v: CGFloat) in
                        zoom = Swift.max(1, Swift.min(5, zoom * v))
                        pinch = 1
                    }
            )
            .onTapGesture(count: 2) { withAnimation(.easeOut(duration: 0.25)) { zoom = zoom > 1 ? 1 : 2 } }
    }
}

/// Rektanglene i bildets koordinater (prosent → punkter).
struct Hl30Boxes: View {
    let boxes: [[Double]]

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ForEach(Array(boxes.enumerated()), id: \.offset) { pair in
                Hl30Box(b: pair.element, size: g.size)
            }
        }
    }
}

struct Hl30Box: View {
    let b: [Double]
    let size: CGSize

    var body: some View {
        let x: CGFloat = CGFloat(b[0] / 100) * size.width
        let y: CGFloat = CGFloat(b[1] / 100) * size.height
        let w: CGFloat = CGFloat(b[2] / 100) * size.width
        let h: CGFloat = CGFloat(b[3] / 100) * size.height
        RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(Color(red: 1, green: 210.0 / 255.0, blue: 63.0 / 255.0).opacity(0.35))
            .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(Color(hex: "#e0a800"), lineWidth: 2))
            .frame(width: Swift.max(4, w), height: Swift.max(4, h))
            .position(x: x + w / 2, y: y + h / 2)
    }
}

/// «Les kvitteringen på nytt» når treffene mangler posisjoner.
struct Hl30Reread: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var h: Hl30 { Hl30.shared }
    let receiptId: String
    let txId: Int

    var body: some View {
        Button {
            Haptics.shared.tap()
            Task { await h.reread(receiptId, txId: txId, store) }
        } label: {
            HStack(spacing: 6) {
                if h.rereading { ProgressView().controlSize(.small) } else { Image(systemName: "doc.text.viewfinder").font(.dyn51(size: 13, weight: .semibold)) }
                Text(h.rereading ? "Leser kvitteringen …" : "Les kvitteringen på nytt").font(PF.ui(13, .semibold))
            }
            .foregroundStyle(p.ink)
            .padding(.horizontal, 14).frame(height: 36)
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(h.rereading)
        .frame(maxWidth: .infinity)
    }
}
