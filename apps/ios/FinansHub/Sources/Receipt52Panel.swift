import SwiftUI
import UIKit

/* ---------------- Prompt 52 (IOS52A): én kvitteringsvisning i Finans → transaksjon og Boliger ----------------
   Spesifikasjon: prompt-52-pakke/claude-code-kvittering-lokal-lik-overalt.md (Mobil). Fasit: Homelab.dc.html → tx1 og
   Boliger.dc.html → det: kort med logo, butikk, «kategori · dato · bolig/konto», stort beløp og ✦ Glimt-tekst, deretter
   «ORIGINAL KVITTERING» med papir-gjengivelsen (trykk åpner originalen).
   – Rc52Head og Rc52Paper brukes av PaperTxDetailView (PaperFin15.swift) og Boliger-arket (Boliger24Sheets.swift), så endringer
     gjøres ett sted. Ingen egen leser i Boliger: opplastingen går til /folders/:id/receipts, som bruker samme kvitteringskjede
     på serveren (SERVER52-API.md § 2). Kilden vises som «Lokal AI». */

struct Rc52Line: Hashable {
    let name: String
    let price: Double?
}

/// Logoen i hodet: butikkdomenet (PaperLogo) eller en logo-URL fra serverens logobibliotek.
enum Rc52Logo {
    case domain(String?, String)
    case path(String, String)
}

struct Rc52Head<Extra: View>: View {
    @Environment(\.paper) private var p
    let logo: Rc52Logo
    let merchant: String
    let sub: String
    let amount: Double
    let ai: String
    @ViewBuilder var extra: () -> Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                logoView
                VStack(alignment: .leading, spacing: 2) {
                    Text(merchant).font(PF.serif(22, medium: true)).foregroundStyle(p.ink).lineLimit(2)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                extra()
            }
            Text((amount > 0 ? "+" : "") + neg0(amount) + " kr").font(PF.serif(40)).foregroundStyle(amount > 0 ? p.pos : p.ink).lineLimit(1).minimumScaleFactor(0.6)
            if !ai.isEmpty {
                Text("✦ " + ai).font(PF.ui(13.5, .medium)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
    }

    @ViewBuilder private var logoView: some View {
        switch logo {
        case .domain(let d, let color):
            PaperLogo(domain: d, name: merchant, color: color, size: 46, radius: 13)
        case .path(let path, let color):
            PaperServerImage(path: path, tint: Color(hex: color), initials: String(merchant.prefix(1)).uppercased())
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
    }
}

extension Rc52Head where Extra == EmptyView {
    init(logo: Rc52Logo, merchant: String, sub: String, amount: Double, ai: String) {
        self.init(logo: logo, merchant: merchant, sub: sub, amount: amount, ai: ai, extra: { EmptyView() })
    }
}

/// «ORIGINAL KVITTERING» + status til høyre.
struct Rc52Label: View {
    @Environment(\.paper) private var p
    let status: String
    let ok: Bool

    var body: some View {
        HStack {
            PLabel(text: "Original kvittering")
            Spacer()
            Text(status).font(PF.ui(12, .semibold)).foregroundStyle(ok ? p.pos : p.lab)
        }
        .padding(.horizontal, 2).padding(.top, 4)
    }
}

/// Kvitteringen som papirlapp. Et trykk åpner originalen.
struct Rc52Paper: View {
    let merchant: String
    let date: String
    let lines: [Rc52Line]
    let total: Double
    let hasFile: Bool
    var hlIdx: [Int] = []
    var hlWord: String = ""
    let open: () -> Void

    var body: some View {
        let ink: Color = Color(hex: "#2a2620")
        Button(action: open) {
            VStack(spacing: 6) {
                Text(merchant.uppercased()).font(.system(size: 14, weight: .bold, design: .monospaced)).foregroundStyle(ink).multilineTextAlignment(.center)
                Text(Rc52Paper.dmy(date) + " · KVITTERING").font(.system(size: 11, design: .monospaced)).foregroundStyle(ink.opacity(0.7))
                dashed(ink)
                if lines.isEmpty {
                    Text(hasFile ? "Trykk for å se originalen" : "Ingen varelinjer lest ennå").font(.system(size: 12, design: .monospaced)).foregroundStyle(ink.opacity(0.7))
                }
                // Prompt 30: linjene som matcher søket markeres gult (Receipt30.swift).
                ForEach(Array(lines.prefix(40).enumerated()), id: \.offset) { (pair: (offset: Int, element: Rc52Line)) in
                    Hl30Line(name: pair.element.name, price: pair.element.price, hit: hlIdx.contains(pair.offset), word: hlWord, first: hlIdx.first == pair.offset)
                }
                dashed(ink)
                HStack {
                    Text("TOTAL").font(.system(size: 13, weight: .bold, design: .monospaced))
                    Spacer()
                    Text(n2(abs(total))).font(.system(size: 13, weight: .bold, design: .monospaced))
                }
                .foregroundStyle(ink)
                if hasFile {
                    Text("Trykk for originalen ›").font(PF.ui(11.5, .semibold)).foregroundStyle(ink.opacity(0.6)).padding(.top, 4)
                }
                Text("Lest av Lokal AI").font(PF.ui(10.5, .semibold)).foregroundStyle(ink.opacity(0.45))
            }
            .padding(.horizontal, 18).padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(Color(hex: "#fbf8f1"), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
            .padding(.horizontal, 8)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Original kvittering, \(lines.count) varelinjer")
    }

    private func dashed(_ c: Color) -> some View {
        Rectangle().stroke(c.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [4, 3])).frame(height: 1).padding(.vertical, 2)
    }

    nonisolated static func dmy(_ iso: String) -> String {
        let p = iso.prefix(10).split(separator: "-")
        return p.count == 3 ? "\(p[2]).\(p[1]).\(p[0])" : iso
    }
}

/* ---------- Boliger: samme panel, data fra GET /folders/:id/expenses/:eid ---------- */

struct Bol52Receipt {
    var logoPath: String = ""
    var logoColor: String = "#6b665c"
    var ai: String = ""
    var lines: [Rc52Line] = []
    var fileUrl: String = ""
    var thumbUrl: String = ""
    var isPdf: Bool = false

    init() {}

    init(_ o: [String: Any]) {
        let lg: [String: Any]? = JS.dict(o, "logo") ?? JS.dict(o, "merchant_logo")
        logoPath = JS.str(lg, "url") ?? ""
        logoColor = JS.str(lg, "color") ?? "#6b665c"
        ai = JS.str(o, "aiLong") ?? JS.str(o, "aiShort") ?? ""
        lines = JS.list(o, "lines").map { (l: [String: Any]) -> Rc52Line in
            Rc52Line(name: JS.str(l, "name") ?? JS.str(l, "description") ?? "", price: JS.num(l, "amount") ?? JS.num(l, "price"))
        }
        let r: [String: Any]? = JS.dict(o, "receipt")
        fileUrl = JS.str(r, "fileUrl") ?? JS.str(o, "fileUrl") ?? ""
        thumbUrl = JS.str(r, "thumbUrl") ?? JS.str(o, "thumbUrl") ?? ""
        isPdf = JS.bool(r, "isPdf") ?? false
    }
}

/// Kvitteringsdelen i Boliger-arket: samme hode og papirlapp som Finans → transaksjon. Trykk åpner originalen i full skjerm.
struct Bol52ReceiptPanel: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    let entry: Bol24Entry
    @State private var data: Bol52Receipt? = nil
    @State private var full: Bol52Full? = nil

    var body: some View {
        let d: Bol52Receipt = data ?? Bol52Receipt()
        VStack(alignment: .leading, spacing: 10) {
            Rc52Head(logo: d.logoPath.isEmpty ? .domain(nil, entry.color) : .path(d.logoPath, d.logoColor),
                     merchant: merchant, sub: [entry.category, Rc52Paper.dmy(entry.date), home.name].filter { !$0.isEmpty }.joined(separator: " · "),
                     amount: -abs(entry.amount), ai: entry.pending ? "Glimt leser lokalt …" : (d.ai.isEmpty ? entry.aiShort : d.ai))
            Rc52Label(status: entry.receiptId.isEmpty ? "Mangler" : "Lest av Lokal AI", ok: !entry.receiptId.isEmpty)
            if entry.receiptId.isEmpty {
                Text("Ingen kvittering er koblet til denne utgiften.").font(PF.ui(13.5)).foregroundStyle(p.mut)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            } else {
                Rc52Paper(merchant: merchant, date: entry.date, lines: d.lines, total: abs(entry.amount), hasFile: !d.fileUrl.isEmpty || !d.thumbUrl.isEmpty) {
                    openOriginal(d)
                }
            }
        }
        .task(id: String(entry.id) + "|" + entry.receiptId + "|" + String(entry.pending)) { await load() }
        .fullScreenCover(item: $full) { (f: Bol52Full) in
            Bol52Original(path: f.path, close: { full = nil }).environment(store)
        }
    }

    private var merchant: String {
        let m: String = entry.description.components(separatedBy: " · ").first ?? entry.description
        return m.isEmpty ? "Utgift" : m
    }

    private func load() async {
        guard let raw = try? await store.api.call("GET", "/folders/\(home.id)/expenses/\(entry.id)") else { return }
        data = Bol52Receipt(JS.obj(raw))
    }

    private func openOriginal(_ d: Bol52Receipt) {
        Haptics.shared.tap()
        let path: String = d.isPdf || d.fileUrl.isEmpty ? (d.thumbUrl.isEmpty ? d.fileUrl : d.thumbUrl) : d.fileUrl
        if path.isEmpty { return }
        full = Bol52Full(path: path)
    }
}

struct Bol52Full: Identifiable {
    var id: String { path }
    let path: String
}

/// Originalen i full skjerm (mørk bakgrunn, trykk lukker).
struct Bol52Original: View {
    @Environment(Store.self) private var store
    let path: String
    let close: () -> Void
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            if let img {
                Image(uiImage: img).resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView().tint(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Button(action: close) {
                Text("✕").font(PF.ui(16, .bold)).foregroundStyle(.white).frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.15), in: Circle())
            }
            .buttonStyle(.plain)
            .padding(16)
            .accessibilityLabel("Lukk")
        }
        .contentShape(Rectangle())
        .onTapGesture { close() }
        .task { img = await store.image(path) }
    }
}
