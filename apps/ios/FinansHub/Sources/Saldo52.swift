import SwiftUI
import UIKit

/* ---------------- Prompt 52 (IOS52A): saldokortet i Finans – fire utseender, velges ved å holde inne ----------------
   Spesifikasjon: prompt-52-pakke/claude-code-saldokort-utseende.md. Fasit: Saldo Kort Varianter.dc.html (2a, 2b, 2d) og
   Homelab.dc.html → Finans (finSal.isStd/isGlass/isKvitt/isFarge, salSheet, papir_salsty).
   – Standard (std) som før · Glass (2a) · Kvittering (2b) · Fargebunn (2d). Samme innhold i alle.
   – Hold inne 0,5 s → haptikk + bunnark «Utseende på saldokortet» med 2 × 2 forhåndsvisninger. Trykk velger straks.
   – Kort trykk åpner Kontoer som før; et langt trykk åpner ikke Kontoer og starter ikke wiggle (Sal52.blocksWiggle).
   – Lagres per bruker (papir_salsty lokalt per konto) og synkes i layout.mer45.salsty (fritt objekt på serveren).
   Scroll-lærdommen: holdet er .simultaneousGesture(LongPressGesture(minimumDuration:maximumDistance: 8).onEnded). */

@MainActor
@Observable
final class Sal52 {
    static let shared = Sal52()
    static let styles: [(String, String)] = [("std", "Standard"), ("glass", "Glass"), ("kvitt", "Kvittering"), ("farge", "Fargebunn")]

    var style: String = UserDefaults.standard.string(forKey: AcctScope.key("papir_salsty")) ?? "std"
    var sheet: Bool = false
    /// Sist holdet på saldokortet slo inn (wiggle og trykk på Kontoer hoppes over like etter).
    @ObservationIgnored var heldAt: Date = .distantPast
    @ObservationIgnored private var loadedFor: String = ""

    var blocksWiggle: Bool { Date().timeIntervalSince(heldAt) < 1.2 }

    func boot() {
        let k: String = AcctScope.key("papir_salsty")
        if loadedFor == k { return }
        loadedFor = k
        style = UserDefaults.standard.string(forKey: k) ?? "std"
    }

    func hold() {
        heldAt = Date()
        Haptics.shared.select()
        sheet = true
    }

    func pick(_ s: String, _ store: Store) {
        guard Sal52.styles.contains(where: { $0.0 == s }) else { return }
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { style = s }
        UserDefaults.standard.set(s, forKey: AcctScope.key("papir_salsty"))
        Mer45.shared.save52(store)
    }

    func take(_ m: [String: Any]) {
        if let s = m["salsty"] as? String, Sal52.styles.contains(where: { $0.0 == s }) {
            style = s
            UserDefaults.standard.set(s, forKey: AcctScope.key("papir_salsty"))
        }
    }
}

/// Tallene på kortet (de samme i alle utseender).
struct Sal52Data {
    let amount: String
    let spent: String
    let day: Int
    let days: Int
    let month: String

    var frac: Double { Double(day) / Double(Swift.max(1, days)) }
    var line: String { "Brukt i " + month + " · dag " + String(day) + " av " + String(days) }

    @MainActor static func of(_ store: Store) -> Sal52Data {
        let total: Double = (store.boot?.accounts ?? []).reduce(0) { $0 + $1.balance }
        let spent: Double? = store.summary.map { abs($0.ut) }
        let cal: Calendar = Calendar(identifier: .gregorian)
        let now: Date = Date()
        return Sal52Data(amount: store.boot == nil ? "–" : neg0(total), spent: spent.map { n0($0) + " kr" } ?? "–",
                         day: cal.component(.day, from: now), days: cal.range(of: .day, in: .month, for: now)?.count ?? 30,
                         month: Fin43Saldo.month(now))
    }

    static let sample: Sal52Data = Sal52Data(amount: "24 310", spent: "8 420 kr", day: 21, days: 31, month: "oktober")
}

/// Fargene for ett utseende.
struct Sal52Look {
    let ink: Color
    let mut: Color
    let label: Color
    let ring: Color
    let ringBg: Color
    let hole: Color
    let rowBg: Color

    static func of(_ s: String, _ p: PaperPalette) -> Sal52Look {
        switch s {
        case "glass":
            return Sal52Look(ink: .white, mut: Color.white.opacity(0.78), label: Color(hex: "#ffd2c8"), ring: Color(hex: "#f08a76"),
                             ringBg: Color.white.opacity(0.25), hole: Color.white.opacity(0.14), rowBg: Color.white.opacity(0.1))
        default:
            return Sal52Look(ink: p.ink, mut: p.mut, label: p.lab, ring: p.lab, ringBg: p.line.opacity(0.8), hole: p.bg, rowBg: p.bg)
        }
    }
}

/// Selve kortet i valgt utseende. `mini` = forhåndsvisning i arket (mindre skrift, ingen skygge).
struct Sal52Card: View {
    @Environment(\.paper) private var p
    let style: String
    let data: Sal52Data
    var mini: Bool = false

    private var k: CGFloat { mini ? 0.42 : 1 }

    var body: some View {
        switch style {
        case "glass": glass
        case "kvitt": kvitt
        case "farge": farge
        default: std
        }
    }

    /* ---------- Biter ---------- */

    private func head(_ l: Sal52Look, circle: Bool) -> some View {
        HStack {
            Text("SALDO · ALLE KONTOER").font(PF.mono(10.5 * Swift.max(0.7, k))).tracking(1.4 * k).foregroundStyle(l.label).lineLimit(1)
            Spacer(minLength: 2)
            if circle {
                Text("›").font(PF.ui(15 * Swift.max(0.7, k), .bold)).foregroundStyle(l.ink)
                    .frame(width: 30 * k, height: 30 * k).background(l.hole, in: Circle())
            } else {
                Text("›").font(PF.ui(17 * Swift.max(0.7, k), .bold)).foregroundStyle(l.mut)
            }
        }
    }

    private func amount(_ l: Sal52Look) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8 * k) {
            Text(data.amount).font(PF.serif(52 * k, medium: true)).foregroundStyle(l.ink).lineLimit(1).minimumScaleFactor(0.5)
            Text("kr").font(PF.serif(30 * k, medium: true)).foregroundStyle(l.mut)
        }
    }

    private func ring(_ l: Sal52Look) -> some View {
        ZStack {
            Circle().fill(l.ringBg)
            Circle().inset(by: 2.5 * k).trim(from: 0, to: data.frac).stroke(l.ring, lineWidth: 5 * k).rotationEffect(.degrees(-90))
            Circle().fill(l.hole).frame(width: 36 * k, height: 36 * k)
            if !mini { Text(String(data.day) + ".").font(PF.ui(11, .bold)).foregroundStyle(l.ink).lineLimit(1).fixedSize() }
        }
        .frame(width: 46 * k, height: 46 * k)
    }

    private func spentRow(_ l: Sal52Look, box: Bool) -> some View {
        HStack(spacing: 14 * k) {
            ring(l)
            VStack(alignment: .leading, spacing: 1) {
                if !mini { Text(data.line).font(PF.ui(12.5)).foregroundStyle(l.mut).lineLimit(1).minimumScaleFactor(0.8) }
                Text(data.spent).font(PF.serif(26 * k, medium: true)).foregroundStyle(l.ink).lineLimit(1).minimumScaleFactor(0.6)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, box ? 14 * k : 0).padding(.vertical, box ? 12 * k : 0)
        .background(box ? l.rowBg : Color.clear, in: RoundedRectangle(cornerRadius: 18 * k, style: .continuous))
    }

    /* ---------- Standard ---------- */

    private var std: some View {
        let l: Sal52Look = Sal52Look.of("std", p)
        return VStack(alignment: .leading, spacing: 16 * k) {
            head(l, circle: true)
            amount(l)
            spentRow(l, box: true)
        }
        .padding(20 * k)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 26 * k, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26 * k, style: .continuous).stroke(p.line.opacity(0.7), lineWidth: 1))
        .shadow(color: Color.black.opacity(mini ? 0 : 0.18), radius: 18, y: 12)
    }

    /* ---------- Glass (2a) ---------- */

    private var glass: some View {
        let l: Sal52Look = Sal52Look.of("glass", p)
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 28 * k, style: .continuous)
        return VStack(alignment: .leading, spacing: 16 * k) {
            head(l, circle: true)
            amount(l)
            spentRow(l, box: true)
        }
        .padding(20 * k)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                shape.fill(.ultraThinMaterial)
                shape.fill(Color(red: 27 / 255, green: 26 / 255, blue: 23 / 255).opacity(0.5))
            }
            .saturation(1.6)
        }
        // Lys toppkant (inset 0 1px 0 rgba(255,255,255,.4)).
        .overlay(shape.stroke(LinearGradient(colors: [Color.white.opacity(0.4), Color.white.opacity(0.06)], startPoint: .top, endPoint: .bottom), lineWidth: 1))
        .clipShape(shape)
        .shadow(color: Color.black.opacity(mini ? 0 : 0.28), radius: 18, y: 12)
        .environment(\.colorScheme, .dark)
    }

    /* ---------- Kvittering (2b) ---------- */

    private var kvitt: some View {
        let l: Sal52Look = Sal52Look.of("kvitt", p)
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 18 * k, style: .continuous)
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16 * k) {
                head(l, circle: false)
                amount(l)
            }
            .padding(20 * k)
            // Stiplet skillelinje med halvsirkel-hakk (Ø 20) i bakgrunnsfargen på hver side.
            ZStack {
                Sal52Dash().stroke(p.line, style: StrokeStyle(lineWidth: 2 * Swift.max(0.6, k), dash: [6 * k, 5 * k]))
                    .frame(height: 2).padding(.horizontal, 18 * k)
                HStack {
                    Circle().fill(p.bg).frame(width: 20 * k, height: 20 * k).offset(x: -10 * k)
                    Spacer()
                    Circle().fill(p.bg).frame(width: 20 * k, height: 20 * k).offset(x: 10 * k)
                }
            }
            .frame(height: 20 * k)
            spentRow(l, box: false).padding(20 * k)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: shape)
        .clipShape(shape)
        .shadow(color: Color.black.opacity(mini ? 0 : 0.14), radius: 14, y: 10)
    }

    /* ---------- Fargebunn (2d) ---------- */

    private var farge: some View {
        let top: Sal52Look = Sal52Look.of("std", p)
        let bottom: Sal52Look = Sal52Look(ink: p.onLab, mut: p.onLab.opacity(0.8), label: p.onLab, ring: p.onLab, ringBg: p.onLab.opacity(0.28),
                                          hole: p.lab, rowBg: Color.clear)
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 32 * k, style: .continuous)
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16 * k) {
                head(top, circle: true)
                amount(top)
            }
            .padding(20 * k)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: UnevenRoundedRectangle(topLeadingRadius: 32 * k, bottomLeadingRadius: 28 * k, bottomTrailingRadius: 28 * k,
                                                           topTrailingRadius: 32 * k, style: .continuous))
            spentRow(bottom, box: false).padding(.horizontal, 20 * k).padding(.vertical, 16 * k)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.lab, in: shape)
        .clipShape(shape)
        .shadow(color: p.lab.opacity(mini ? 0 : 0.35), radius: 18, y: 12)
    }
}

struct Sal52Dash: Shape {
    func path(in r: CGRect) -> Path {
        var p: Path = Path()
        p.move(to: CGPoint(x: r.minX, y: r.midY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        return p
    }
}

/// Bunnarket «Utseende på saldokortet»: 2 × 2 forhåndsvisninger, valgt med rød kant og ✓.
struct Sal52Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Sal52 { Sal52.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text("Utseende på saldokortet").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                SheetButton30(kind: .primary, title: "Ferdig") { s.sheet = false }
            }
            Text("Trykk for å velge. Kortet bak byttes med en gang.").font(PF.ui(13)).foregroundStyle(p.mut)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(Sal52.styles, id: \.0) { (st: (String, String)) in cell(st.0, st.1) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 12)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private func cell(_ id: String, _ name: String) -> some View {
        let on: Bool = s.style == id
        return Button { s.pick(id, store) } label: {
            VStack(spacing: 8) {
                ZStack {
                    // Glass trenger noe bak seg for å vises riktig i forhåndsvisningen.
                    if id == "glass" {
                        LinearGradient(colors: [Color(hex: "#2b5d8a"), Color(hex: "#b23a2a"), Color(hex: "#a0671a")], startPoint: .topLeading, endPoint: .bottomTrailing)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    Sal52Card(style: id, data: Sal52Data.sample, mini: true).padding(id == "glass" ? 8 : 0)
                        .allowsHitTesting(false)
                }
                .frame(height: 118)
                .padding(8)
                .background(p.card.opacity(0.5), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? p.lab : p.line, lineWidth: on ? 2 : 1))
                .overlay(alignment: .topTrailing) {
                    if on {
                        Text("✓").font(PF.ui(12, .bold)).foregroundStyle(Color.white).frame(width: 22, height: 22).background(p.lab, in: Circle())
                            .offset(x: 6, y: -6)
                    }
                }
                Text(name).font(PF.ui(13, .bold)).foregroundStyle(p.ink)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}
