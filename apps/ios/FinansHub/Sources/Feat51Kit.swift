import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): felles byggeklosser for de nye sidene ----------------
 Planlegging (Plan51*.swift), Familiekalender (FamCal51.swift), «I kveld» (Kveld51*.swift), felles søk (Search51.swift),
 tema (Theme51.swift) og onboarding (Onboard51.swift). Papir-stil: Top50Bar, kort med 20 pt radius, pilleknapper.
 Bredde: kortene ligger i et adaptivt rutenett (minst 340 pt), så iPad og Fold får to eller tre kolonner og telefonen én.
 Fullskjermene legges på PaperShell via feat51Host (Paper.swift). */

enum F51 {
    /// «12 345 kr», «−1 200 kr», med to desimaler når d = 2. Følger «Skjul beløp» (n0/n2).
    static func kr(_ v: Double, _ d: Int = 0) -> String {
        if d == 0 { return neg0(v) + " kr" }
        return (v < 0 ? "−" : "") + n2(abs(v)) + " kr"
    }

    /// «+250 kr» / «−1 200 kr».
    static func krS(_ v: Double) -> String {
        let s: String = v > 0 ? "+" : (v < 0 ? "−" : "")
        let frac: Bool = abs(v).truncatingRemainder(dividingBy: 1) > 0.004
        return s + (frac ? n2(abs(v)) : n0(abs(v))) + " kr"
    }

    nonisolated static let mon3: [String] = ["jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."]

    /// «2026-10-29» → «29. okt.»
    nonisolated static func dl(_ iso: String?) -> String {
        guard let s = iso, s.count >= 10 else { return "" }
        let c: [Character] = Array(s)
        let d: Int = Int(String(c[8...9])) ?? 0
        let m: Int = Int(String(c[5...6])) ?? 0
        guard m >= 1, m <= 12 else { return s }
        return "\(d). " + mon3[m - 1]
    }

    nonisolated static func num(_ s: String) -> Double? {
        let t: String = s.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "")
            .replacingOccurrences(of: "−", with: "-").replacingOccurrences(of: ",", with: ".")
        return Double(t)
    }

    nonisolated static func pctText(_ v: Double) -> String {
        let r: Double = (v * 10).rounded() / 10
        let s: String = r.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(r)) : String(format: "%.1f", r).replacingOccurrences(of: ".", with: ",")
        return s + " %"
    }

    nonisolated static func today() -> String { JS.fmt(Date(), "yyyy-MM-dd") }

    nonisolated static func day(_ offset: Int) -> String {
        JS.fmt(Date().addingTimeInterval(Double(offset) * 86_400), "yyyy-MM-dd")
    }

    /// Feilteksten fra serveren uten tekniske detaljer.
    nonisolated static func err(_ e: Error) -> String {
        if let a = e as? APIError {
            if a.status == 404 { return "Serveren har ikke denne funksjonen ennå. Oppdater Homelab." }
            if a.status == 403 && a.message.hasPrefix("Feil") { return "Du har ikke tilgang til dette." }
            return a.message
        }
        return e.localizedDescription
    }

    /// Lagrer data i en midlertidig fil (deling av eksport).
    nonisolated static func temp(_ d: Data, _ name: String) -> URL? {
        let u: URL = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: u)
        do { try d.write(to: u) } catch { return nil }
        return u
    }

    /// Bredt oppsett (iPad, Fold): ≥ 700 pt og ikke kompakt.
    nonisolated static func wide(_ w: CGFloat, _ hsc: UserInterfaceSizeClass?) -> Bool {
        Layout45.mode(width: w, hsc: hsc) == .wide
    }
}

/// Delingsark for en eksportert fil.
struct F51File: Identifiable {
    let id: String
    let url: URL
}

/* ---------- Grunnelementer ---------- */

enum F51Tone {
    case ok, warn, mut, red
}

/// Liten merkelapp («I rute», «Prisøkning»).
struct F51Tag: View {
    @Environment(\.paper) private var p
    let text: String
    var tone: F51Tone = .mut

    var body: some View {
        Text(text).font(PF.mono(10, bold: true)).tracking(0.6)
            .foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(fg.opacity(0.12), in: Capsule())
            .lineLimit(1)
    }

    private var fg: Color {
        switch tone {
        case .ok: return p.pos
        case .warn: return Color(hex: p.dark ? "#e0b060" : "#a0671a")
        case .red: return p.lab
        case .mut: return p.mut
        }
    }
}

enum F51BtnKind {
    case ink, line, red
}

/// Pilleknapp (minst 44 pt høy berøringsflate).
struct F51Btn: View {
    @Environment(\.paper) private var p
    let title: String
    var kind: F51BtnKind = .line
    var icon: String? = nil
    var busy: Bool = false
    var disabled: Bool = false
    let act: () -> Void

    var body: some View {
        Button {
            Haptics.shared.tap()
            act()
        } label: {
            HStack(spacing: 6) {
                if busy { ProgressView().controlSize(.small) }
                if let icon, !busy { Image(systemName: icon).font(.system(size: 12, weight: .semibold)) }
                Text(title).font(PF.ui(13, .bold)).lineLimit(1)
            }
            .foregroundStyle(fg)
            .padding(.horizontal, 14).frame(minHeight: 36)
            .background(bg, in: Capsule())
            .overlay(Capsule().stroke(kind == .ink ? Color.clear : p.line, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(disabled || busy)
        .opacity(disabled ? 0.45 : 1)
    }

    private var fg: Color {
        switch kind {
        case .ink: return p.bg
        case .line: return p.ink
        case .red: return p.lab
        }
    }

    private var bg: Color { kind == .ink ? p.ink : Color.clear }
}

/// Fremdriftslinje (6 pt).
struct F51Bar: View {
    @Environment(\.paper) private var p
    let pct: Double
    var color: Color? = nil

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let f: CGFloat = CGFloat(Swift.max(0, Swift.min(100, pct)) / 100)
            ZStack(alignment: .leading) {
                Capsule().fill(p.line.opacity(0.6))
                Capsule().fill(color ?? p.pos).frame(width: Swift.max(4, g.size.width * f))
            }
        }
        .frame(height: 6)
        .accessibilityElement()
        .accessibilityLabel("Fremdrift")
        .accessibilityValue(F51.pctText(pct))
    }
}

/// Rad i en liste: tittel + undertekst til venstre, verdi til høyre.
struct F51Line: View {
    @Environment(\.paper) private var p
    let title: String
    var sub: String = ""
    var value: String = ""
    var valueColor: Color? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                if !sub.isEmpty {
                    Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if !value.isEmpty {
                Text(value).font(PF.mono(12.5)).foregroundStyle(valueColor ?? p.ink).lineLimit(1)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

/// Tom- eller feiltekst i et kort.
struct F51Note: View {
    @Environment(\.paper) private var p
    let text: String
    var red: Bool = false

    var body: some View {
        Text(text).font(PF.ui(13.5)).foregroundStyle(red ? p.lab : p.mut).fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Stort tall med liten tekst etter («12 000 kr av 30 000 kr»).
struct F51Big: View {
    @Environment(\.paper) private var p
    let value: String
    var small: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(PF.serif(30, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
            if !small.isEmpty {
                Text(small).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Fanene øverst (pille-chips, vannrett scroll).
struct F51Tabs: View {
    @Environment(\.paper) private var p
    let tabs: [(String, String)]
    let sel: String
    let pick: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(tabs, id: \.0) { (t: (String, String)) in
                    chip(t.0, t.1)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func chip(_ k: String, _ name: String) -> some View {
        let on: Bool = k == sel
        return Button {
            Haptics.shared.select()
            pick(k)
        } label: {
            Text(name).font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 14).frame(height: 34)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }
}

/// Tekstfelt med etikett over (skjema i ark).
struct F51Field: View {
    @Environment(\.paper) private var p
    let label: String
    @Binding var text: String
    var placeholder: String = ""
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            TextField(placeholder, text: $text)
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .keyboardType(keyboard)
                .padding(.horizontal, 12).frame(minHeight: 44)
                .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
        }
    }
}

/// Rutenett for kortene: én kolonne på telefon, to–tre på iPad/Fold.
struct F51Grid<C: View>: View {
    @ViewBuilder let content: () -> C

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 12, alignment: .top)], alignment: .leading, spacing: 12) {
            content()
        }
    }
}

/// Fullskjerm-sidene: topplinje som i Nyheter, fanene, innhold i scroll og en kort beskjed nederst.
struct F51Scaffold<C: View>: View {
    @Environment(\.paper) private var p
    let kicker: String
    let title: String
    var sub: String = ""
    var tabs: [(String, String)] = []
    var tab: String = ""
    var pick: (String) -> Void = { (_: String) in }
    var toast: String = ""
    let close: () -> Void
    let refresh: () async -> Void
    @ViewBuilder let content: () -> C

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Top50Bar(kicker: kicker, title: title, back: close) { EmptyView() }
                if !sub.isEmpty {
                    Text(sub).font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 6)
            if !tabs.isEmpty {
                F51Tabs(tabs: tabs, sel: tab, pick: pick).padding(.bottom, 4)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) { content() }
                    .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 48)
                    .frame(maxWidth: 1180).frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await refresh() }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .overlay(alignment: .bottom) {
            if !toast.isEmpty { Logs44Toast(text: toast).transition(.opacity).allowsHitTesting(false) }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
    }
}

/// Lasteindikator i et kort.
struct F51Loading: View {
    @Environment(\.paper) private var p
    var text: String = "Laster …"

    var body: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text(text).font(PF.ui(13.5)).foregroundStyle(p.mut)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 18)
    }
}

/// Feil med «Prøv igjen».
struct F51Error: View {
    @Environment(\.paper) private var p
    let text: String
    let retry: () -> Void

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                F51Note(text: text, red: true)
                F51Btn(title: "Prøv igjen", icon: "arrow.clockwise", act: retry)
            }
        }
    }
}

/* ---------- Beskjed nederst (felles for sidene) ---------- */

@MainActor
@Observable
final class F51Toast {
    static let shared = F51Toast()
    var text: String = ""

    func show(_ t: String) {
        text = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if self.text == t { self.text = "" }
        }
    }
}

/* ---------- Fullskjermene ---------- */

struct Feat51Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { Plan51.shared.open }, set: { (v: Bool) in if !v { Plan51.shared.open = false } })) {
                Plan51Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { Plan51.shared.open = false }
            }
            .fullScreenCover(isPresented: Binding<Bool>(get: { FamCal51.shared.open }, set: { (v: Bool) in if !v { FamCal51.shared.open = false } })) {
                FamCal51Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { FamCal51.shared.open = false }
            }
            .modifier(Feat51Host2(p: p))
    }
}

/// Delt i to, så typesjekkeren i Xcode 16 får små uttrykk.
struct Feat51Host2: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { Kveld51.shared.open }, set: { (v: Bool) in if !v { Kveld51.shared.open = false } })) {
                Kveld51Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { Kveld51.shared.open = false }
            }
            .modifier(Feat51Host3(p: p))
    }
}

struct Feat51Host3: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { Search51.shared.open }, set: { (v: Bool) in if !v { Search51.shared.close() } })) {
                Search51Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { Search51.shared.close() }
            }
            .sheet(isPresented: Binding<Bool>(get: { Theme51.shared.sheet }, set: { Theme51.shared.sheet = $0 })) {
                Theme51Sheet()
                    .environment(\.paper, p)
                    .environment(store)
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: Binding<Bool>(get: { Invite51.shared.open }, set: { Invite51.shared.open = $0 })) {
                Invite51Sheet()
                    .environment(\.paper, p)
                    .environment(store)
                    .presentationDetents([.large])
            }
            // ⌘K på iPad med tastatur: felles søk.
            .background {
                Button("Søk") { Search51.shared.show() }
                    .keyboardShortcut("k", modifiers: .command)
                    .opacity(0)
                    .frame(width: 0, height: 0)
                    .accessibilityHidden(true)
            }
            .task(id: store.account?.id ?? "") { await Theme51.shared.boot(store) }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { (_: Notification) in
                Task { @MainActor in await Theme51.shared.wake(store) }
            }
    }
}

extension View {
    /// Prompt 51 (IOSFEAT51): Planlegging, Familiekalender, «I kveld», søk og onboarding i fullskjerm (Paper.swift).
    func feat51Host(_ p: PaperPalette) -> some View { modifier(Feat51Host(p: p)) }
}
