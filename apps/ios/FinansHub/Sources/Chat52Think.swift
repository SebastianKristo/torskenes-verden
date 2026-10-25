import SwiftUI
import UIKit

/* ---------------- Prompt 52 (IOS52A): Chat – tankegangen og miniatyr av opplastede bilder ----------------
   Spesifikasjon: prompt-52-pakke/claude-code-chat-tankegang-bildeminiatyr.md. Fasit: Homelab.dc.html → Chat (chThk, m.think,
   m.thS, chThumb(), attTh). Server: SERVER52-API.md § 7 – SSE `thinking` {step, i, source, s}, `thinking_done` {thS, count},
   `done` med think/thS/thinkSource; lagrede meldinger har think/thS (svar) og attTh (bruker).
   – Pillen «✦ Tenker … 2,1 s ▾» mens modellen tenker (listen åpen), «✦ Tenkte i 2,1 s ›» (lukket) når svaret strømmer og
     på lagrede svar. Trykk viser eller skjuler stegene (nummerert, dempet, tynn strek til venstre).
   – Tankegangen sendes aldri tilbake til modellen (body() i Chat27Model.swift tar bare role/content).
   – Bilder over brukerens boble: 96 × 120 pt, radius 16/16/6/16, 1 pt kontur, myk skygge, på rad og brutt til ny linje.
   – attTh: JPEG maks 220 px, kvalitet 0,72, som data-URL på meldingen (historikken viser miniatyren uten originalen). */

enum Chat52 {
    /// Miniatyr som data-URL (maks 220 px, kvalitet 0,72).
    nonisolated static func thumbURL(_ img: UIImage) -> String? {
        let s: CGSize = img.size
        guard s.width > 0, s.height > 0 else { return nil }
        let k: CGFloat = Swift.min(1, 220 / Swift.max(s.width, s.height))
        let size: CGSize = CGSize(width: Swift.max(1, (s.width * k).rounded()), height: Swift.max(1, (s.height * k).rounded()))
        let f: UIGraphicsImageRendererFormat = UIGraphicsImageRendererFormat()
        f.scale = 1
        let out: UIImage = UIGraphicsImageRenderer(size: size, format: f).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        guard let d = out.jpegData(compressionQuality: 0.72) else { return nil }
        return "data:image/jpeg;base64," + d.base64EncodedString()
    }

    /// Base64-delen av en data-URL (tom når det ikke er en).
    nonisolated static func b64(_ dataURL: String) -> String {
        guard dataURL.hasPrefix("data:"), let r = dataURL.range(of: "base64,") else { return "" }
        return String(dataURL[r.upperBound...])
    }

    /// «2,1» (én desimal, norsk komma).
    nonisolated static func secs(_ s: Double) -> String {
        String(format: "%.1f", Swift.max(0, s.isFinite ? s : 0)).replacingOccurrences(of: ".", with: ",")
    }

    /// Miniatyrer til meldingen: fra de lokale forhåndsvisningene eller base64 (bilder i skrivefeltet).
    @MainActor static func thumbs(_ list: [ChatAttach27]) -> [String] {
        var out: [String] = []
        for a in list where a.kind == "img" {
            var img: UIImage? = Chat50.shared.previews[a.id]
            if img == nil, !a.b64.isEmpty, let d = Data(base64Encoded: a.b64) { img = UIImage(data: d) }
            if let img, let u = thumbURL(img) { out.append(u) }
            if out.count >= 4 { break }
        }
        return out
    }

    /// Bildene i en melding: vedleggene/base64 som før, ellers de lagrede miniatyrene (attTh).
    @MainActor static func items(_ m: ChatMsg27) -> [Chat50LBItem] {
        let list: [Chat50LBItem] = Chat50.shared.items(m)
        if !list.isEmpty { return list }
        return m.attTh.enumerated().compactMap { (pair: (offset: Int, element: String)) -> Chat50LBItem? in
            let b: String = Chat52.b64(pair.element)
            if b.isEmpty { return nil }
            return Chat50LBItem(id: m.id + "#th" + String(pair.offset), name: "Bilde " + String(pair.offset + 1), b64: b)
        }
    }

    /// Filnavn som ser ut som bilder (de vises som miniatyr, ikke som «# Bilde 1.jpg»-pille).
    nonisolated static func isImageName(_ n: String) -> Bool {
        let l: String = n.lowercased()
        return [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"].contains { l.hasSuffix($0) }
    }
}

/* ---------- Tankegangen ---------- */

/// Pillen og stegene. Live: mens modellen tenker; ellers lagret på meldingen.
struct Chat52ThinkView: View {
    let steps: [String]
    /// Sekunder brukt (lagret) – nil mens den fortsatt tenker.
    let secs: Double?
    /// Når tenkingen startet (bare live).
    var start: Date? = nil
    let c: ChatPal27
    @State private var open: Bool? = nil

    private var thinking: Bool { secs == nil }
    private var isOpen: Bool { open ?? thinking }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Haptics.shared.select()
                withAnimation(.easeOut(duration: 0.18)) { open = !isOpen }
            } label: { pill }
            .buttonStyle(.plain)
            .accessibilityLabel(thinking ? "Tenker. Trykk for å vise eller skjule tankegangen" : "Tenkte i " + Chat52.secs(secs ?? 0) + " sekunder. Trykk for å vise tankegangen")
            if isOpen && !steps.isEmpty { list }
        }
    }

    private var pill: some View {
        HStack(spacing: 6) {
            Text("✦").font(c.ui(12, .bold)).foregroundStyle(c.acc)
            if thinking {
                TimelineView(.periodic(from: Date(), by: 0.1)) { ctx in
                    Text("Tenker … " + Chat52.secs(ctx.date.timeIntervalSince(start ?? ctx.date)) + " s")
                        .font(c.ui(12.5, .semibold)).foregroundStyle(c.mut).monospacedDigit()
                }
            } else {
                Text("Tenkte i " + Chat52.secs(secs ?? 0) + " s").font(c.ui(12.5, .semibold)).foregroundStyle(c.mut).monospacedDigit()
            }
            Text(isOpen ? "▾" : "›").font(c.ui(12.5, .bold)).foregroundStyle(c.mut)
        }
        .padding(.horizontal, 11).frame(height: 28)
        .background(c.card, in: Capsule())
        .overlay(Capsule().stroke(c.line, lineWidth: 1))
        .contentShape(Capsule())
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(steps.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(String(pair.offset + 1) + ".").font(PF.mono(11, bold: false)).foregroundStyle(c.mut).frame(minWidth: 18, alignment: .trailing)
                    Text(pair.element).font(c.ui(13)).foregroundStyle(c.mut).lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
            }
        }
        .padding(.leading, 12).padding(.vertical, 2)
        .overlay(alignment: .leading) { Rectangle().fill(c.line).frame(width: 1.5) }
        .padding(.leading, 6)
        .transition(.opacity)
    }
}

/* ---------- Miniatyrer over brukerens boble ---------- */

/// Hjørnene i designet: 16/16/6/16 (nederst til høyre peker mot boblen).
struct Chat52ThumbShape: Shape {
    func path(in rect: CGRect) -> Path {
        UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 6, topTrailingRadius: 16, style: .continuous)
            .path(in: rect)
    }
}

struct Chat52BubbleThumbs: View {
    let m: ChatMsg27
    let c: ChatPal27

    var body: some View {
        let list: [Chat50LBItem] = Chat52.items(m)
        if !list.isEmpty {
            Chat52TrailingFlow(spacing: 6) {
                ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Chat50LBItem)) in
                    Button { Haptics.shared.tap(); Chat50.shared.open(list, pair.offset) } label: {
                        Chat50Thumb(it: pair.element, c: c)
                            .frame(width: 96, height: 120)
                            .clipShape(Chat52ThumbShape())
                            .overlay(Chat52ThumbShape().stroke(c.line, lineWidth: 1))
                            .shadow(color: Color.black.opacity(0.14), radius: 8, x: 0, y: 4)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Åpne " + pair.element.name)
                }
            }
            .frame(maxWidth: 320, alignment: .trailing)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}

/// Rader som brytes, høyrejustert (som Flow i Views.swift, men hver rad legges inntil høyre kant).
struct Chat52TrailingFlow: Layout {
    var spacing: CGFloat = 6

    private func rows(_ w: CGFloat, _ subviews: Subviews) -> [[(Int, CGSize)]] {
        var out: [[(Int, CGSize)]] = [[]]
        var x: CGFloat = 0
        for (i, v) in subviews.enumerated() {
            let s: CGSize = v.sizeThatFits(.unspecified)
            if x + s.width > w, x > 0 { out.append([]); x = 0 }
            out[out.count - 1].append((i, s))
            x += s.width + spacing
        }
        return out
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w: CGFloat = proposal.width ?? .infinity
        let rs: [[(Int, CGSize)]] = rows(w, subviews)
        var h: CGFloat = 0, maxW: CGFloat = 0
        for (k, r) in rs.enumerated() {
            let rw: CGFloat = r.reduce(0) { $0 + $1.1.width } + spacing * CGFloat(Swift.max(0, r.count - 1))
            maxW = Swift.max(maxW, rw)
            h += (r.map { $0.1.height }.max() ?? 0) + (k > 0 ? spacing : 0)
        }
        return CGSize(width: w.isFinite ? Swift.min(w, maxW) : maxW, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y: CGFloat = bounds.minY
        for r in rows(bounds.width, subviews) {
            let rw: CGFloat = r.reduce(0) { $0 + $1.1.width } + spacing * CGFloat(Swift.max(0, r.count - 1))
            var x: CGFloat = bounds.maxX - rw
            let rh: CGFloat = r.map { $0.1.height }.max() ?? 0
            for (i, s) in r {
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
                x += s.width + spacing
            }
            y += rh + spacing
        }
    }
}

/// 24 × 24 miniatyr i skrivefeltet for bildevedlegg (andre filer beholder ikonet).
struct Chat52AttachIcon: View {
    let a: ChatAttach27
    let c: ChatPal27

    var body: some View {
        if a.kind == "img", let img = image {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: 24, height: 24)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .accessibilityHidden(true)
        } else {
            Text(a.icon).font(c.ui(12, .bold)).foregroundStyle(c.mut)
        }
    }

    @MainActor private var image: UIImage? {
        if let p = Chat50.shared.previews[a.id] { return p }
        if !a.thumb.isEmpty, let m = Img50Cache.shared.memory(a.thumb) { return m }
        if !a.b64.isEmpty, let d = Data(base64Encoded: a.b64) { return UIImage(data: d) }
        return nil
    }
}
