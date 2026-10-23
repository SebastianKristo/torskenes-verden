import SwiftUI

/* ---------------- Prompt 23: Subscription OS i Papir, nøyaktig etter Subscription OS.dc.html (variant mobile) ---------------- */

/// Fargene i MT.papir / MT.papirDark (Subscription OS.dc.html).
struct SubTok23 {
    let dark: Bool
    let bg: Color
    let card: Color
    let card2: Color
    let fg: Color
    let mut: Color
    let bd: Color
    let chip: Color
    let neg: Color
    let on: Color
    let onFg: Color

    static let light: SubTok23 = SubTok23(dark: false, bg: Color(hex: "#f3efe6"), card: Color(hex: "#ffffff"), card2: Color(hex: "#f6f2ea"),
                                          fg: Color(hex: "#1b1a17"), mut: Color(hex: "#6b665c"), bd: Color(hex: "#ddd6c7"), chip: Color(hex: "#ece6da"),
                                          neg: Color(hex: "#b23a2a"), on: Color(hex: "#1b1a17"), onFg: Color(hex: "#f3efe6"))
    static let night: SubTok23 = SubTok23(dark: true, bg: Color(hex: "#14130f"), card: Color(hex: "#211f19"), card2: Color(hex: "#1a1814"),
                                          fg: Color(hex: "#ece7dc"), mut: Color(hex: "#a39d90"), bd: Color(hex: "#3a372e"), chip: Color(hex: "#2a2821"),
                                          neg: Color(hex: "#f08a76"), on: Color(hex: "#ece7dc"), onFg: Color(hex: "#14130f"))

    static func of(_ p: PaperPalette) -> SubTok23 { p.dark ? SubTok23.night : SubTok23.light }

    /// Faste farger i designet (like i lys og mørk).
    static let orange: Color = Color(hex: "#FF7A3D")
    static let orangeDark: Color = Color(hex: "#C85A26")
    static let peach: Color = Color(hex: "#FFB08A")
    static let off: Color = Color(hex: "#2A2A32")
    static let grey: Color = Color(hex: "#8C8C96")
    static let okBg: Color = Color(hex: "#1F3A2F")
    static let okFg: Color = Color(hex: "#9FE3C6")
    static let warnBg: Color = Color(hex: "#2A1A10")
    static let ink0: Color = Color(hex: "#1A0C04")
}

/// Beregninger for kortene (neste 7 dager, datoer og kategorifarger).
enum SubCalc23 {
    static let months: [String] = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
    static let monthShort: [String] = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"]
    static let fallbackCats: [String] = ["Underholdning", "Produktivitet", "Lagring og sky", "Helse og trening", "Transport", "Mobil og internett", "Nyheter og lesing", "Annet"]

    static func kr(_ v: Double) -> String { "\(n0(v)) kr" }

    /// Dager fra i dag (0 = i dag), eller nil for ugyldig dato.
    static func daysAway(_ s: String) -> Int? {
        guard let d = parseDay(s) else { return nil }
        let cal: Calendar = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: d)).day
    }

    /// «21. oktober».
    static func longDate(_ s: String) -> String {
        guard let d = parseDay(s) else { return s }
        let cal: Calendar = Calendar.current
        let day: Int = cal.component(.day, from: d)
        let m: Int = cal.component(.month, from: d)
        return "\(day). \(months[Swift.max(0, Swift.min(11, m - 1))])"
    }

    /// «17. okt».
    static func shortDate(_ s: String) -> String {
        guard let d = parseDay(s) else { return s }
        let cal: Calendar = Calendar.current
        let day: Int = cal.component(.day, from: d)
        let m: Int = cal.component(.month, from: d)
        let name: String = monthShort[Swift.max(0, Swift.min(11, m - 1))].lowercased()
        return "\(day). \(name)"
    }

    /// «I dag», «I morgen» eller «21. oktober».
    static func when(_ s: String) -> String {
        guard let n = daysAway(s) else { return s }
        if n == 0 { return "I dag" }
        if n == 1 { return "I morgen" }
        return longDate(s)
    }

    /// Trekk de neste 7 dagene (i morgen til og med om 7 dager), fra serverens «upcoming» eller abonnementenes neste dato.
    static func next7(_ x: SubsX) -> [SubCharge] {
        var src: [SubCharge] = x.upcoming
        if src.isEmpty {
            src = x.items.filter { $0.active && !$0.nextDate.isEmpty }.map { s in SubCharge(id: s.id, name: s.name, date: s.nextDate, amount: s.price) }
        }
        let list: [SubCharge] = src.filter { c in
            guard let n = daysAway(c.date) else { return false }
            return n >= 1 && n <= 7
        }
        return list.sorted { $0.date < $1.date }
    }

    /// 14 søyler, to per dag (som i designet).
    static func weekBars(_ charges: [SubCharge]) -> [Double] {
        var out: [Double] = []
        for i in 0..<14 {
            let day: Int = 1 + i / 2
            var sum: Double = 0
            for c in charges where daysAway(c.date) == day { sum += c.amount }
            out.append(sum)
        }
        return out
    }

    static func catColors(_ name: String) -> (Color, Color) {
        switch name {
        case "Underholdning": return (Color(hex: "#FF7A3D"), Color(hex: "#C85A26"))
        case "Produktivitet": return (Color(hex: "#7AA7FF"), Color(hex: "#4F78D0"))
        case "Lagring og sky": return (Color(hex: "#F2C14E"), Color(hex: "#BD9330"))
        case "Helse og trening": return (Color(hex: "#5FD3A8"), Color(hex: "#3A9F7B"))
        case "Transport": return (Color(hex: "#B79CFF"), Color(hex: "#8A70D6"))
        case "Mobil og internett": return (Color(hex: "#30B0C7"), Color(hex: "#1F7F90"))
        case "Nyheter og lesing": return (Color(hex: "#FF8A80"), Color(hex: "#D0605A"))
        default: return (Color(hex: "#A0A0AA"), Color(hex: "#76767F"))
        }
    }

    static func catHex(_ name: String) -> String {
        switch name {
        case "Underholdning": return "#FF7A3D"
        case "Produktivitet": return "#7AA7FF"
        case "Lagring og sky": return "#F2C14E"
        case "Helse og trening": return "#5FD3A8"
        case "Transport": return "#B79CFF"
        default: return "#A0A0AA"
        }
    }

    /// Per kategori per måned (aktive abonnementer), størst først.
    static func categories(_ x: SubsX) -> [(String, Double)] {
        var per: [String: Double] = [:]
        for s in x.items where s.active { per[s.category, default: 0] += s.monthly }
        let rows: [(String, Double)] = per.map { ($0.key, $0.value) }
        return rows.sorted { $0.1 > $1.1 }
    }

    /// Abonnementer som AI har flagget (lite brukt eller prisøkning).
    static func flagged(_ x: SubsX) -> [SubItem] { x.items.filter(\.flagged) }

    static func savingsText(_ x: SubsX) -> String {
        let f: [SubItem] = flagged(x)
        let up: Int = f.filter { $0.status == "price_up" }.count
        let n: Int = Swift.max(f.count, x.suggestions.count)
        if n == 0 { return x.healthText.isEmpty ? "Alle abonnementene ser ut til å være i bruk." : x.healthText }
        let what: String = n == 1 ? "1 abonnement" : "\(n) abonnementer"
        if up == 0 { return "AI fant \(what) å se på." }
        let upText: String = up == 1 ? "én prisøkning" : "\(up) prisøkninger"
        return "AI fant \(what) å se på, og \(upText)."
    }
}

/// Rekkefølgen på kortene på Hjem (ai, next7, check, list). Lokalt i sub_home_order og per bruker som subHomeOrder.
enum SubHomeOrder23 {
    static let key: String = "sub_home_order"
    /// Prompt 37: «trials» (Gratis prøveperioder) øverst, før AI-sparing.
    static let all: [String] = ["trials", "ai", "next7", "check", "list"]

    static func full(_ o: [String]) -> [String] {
        var out: [String] = o.map { $0 == "next" ? "next7" : $0 }.filter { all.contains($0) }
        var seen: Set<String> = []
        out = out.filter { seen.insert($0).inserted }
        if !out.isEmpty && !out.contains("trials") { out.insert("trials", at: 0) }
        for k in all where !out.contains(k) { out.append(k) }
        return out
    }

    static func load() -> [String] {
        let raw: [String] = (UserDefaults.standard.array(forKey: key) as? [String]) ?? []
        return full(raw)
    }

    @MainActor static func save(_ order: [String], _ store: Store) {
        UserDefaults.standard.set(order, forKey: key)
        // Eldre servere kjenner ikke subHomeOrder (400); da gjelder bare den lokale rekkefølgen.
        store.savePaperLayout(["subHomeOrder": order])
    }

    @MainActor static func reset(_ store: Store) {
        UserDefaults.standard.removeObject(forKey: key)
        store.savePaperLayout(["subHomeOrder": NSNull()])
    }

    /// subHomeOrder fra serveren (valgt på en annen enhet).
    @MainActor static func fetch(_ store: Store) async -> [String]? {
        guard let d = try? await store.api.callAt("/api", "GET", "/me/layout") else { return nil }
        let list: [String] = JS.strings(JS.obj(d), "subHomeOrder")
        if list.isEmpty { return nil }
        let o: [String] = full(list)
        UserDefaults.standard.set(o, forKey: key)
        return o
    }
}

/// Rund logo (logobiblioteket, egen logo eller initialer).
struct SubLogo23: View {
    let name: String
    let domain: String?
    let logoUrl: String?
    let category: String
    var size: CGFloat = 34

    var body: some View {
        Logo(domain: domain, name: name, color: SubCalc23.catHex(category), size: size, logoUrl: logoUrl)
            .frame(width: size, height: size)
            .clipShape(Circle())
    }
}

/// repeating-linear-gradient(135deg, c 0 6px, c2 6px 9px).
struct SubStripes23: View {
    let c1: Color
    let c2: Color
    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(c1))
            var x: CGFloat = -size.height
            while x < size.width + size.height {
                var line: Path = Path()
                line.move(to: CGPoint(x: x, y: size.height))
                line.addLine(to: CGPoint(x: x + size.height, y: 0))
                ctx.stroke(line, with: .color(c2), lineWidth: 3)
                x += 12.7
            }
        }
    }
}

/// Abonnementshelse: 30 streker i en halvsirkel (viewBox 220 × 124, r 78–100, senter 110/112).
struct SubGauge23: View {
    let score: Double
    var body: some View {
        Canvas { ctx, size in
            let sx: CGFloat = size.width / 220
            let sy: CGFloat = size.height / 124
            for i in 0..<30 {
                let a: CGFloat = CGFloat.pi * (1 - CGFloat(i) / 29)
                let on: Bool = CGFloat(i) / 29 <= CGFloat(score / 100)
                var p: Path = Path()
                p.move(to: CGPoint(x: (110 + 78 * cos(a)) * sx, y: (112 - 78 * sin(a)) * sy))
                p.addLine(to: CGPoint(x: (110 + 100 * cos(a)) * sx, y: (112 - 100 * sin(a)) * sy))
                let c: Color = !on ? SubTok23.off : i < 10 ? SubTok23.orangeDark : i < 20 ? SubTok23.orange : SubTok23.peach
                ctx.stroke(p, with: .color(c), style: StrokeStyle(lineWidth: 5 * sx, lineCap: .round))
            }
        }
    }
}

/* ---------------- Hjem: kortene ---------------- */

/// ✦ AI-SPARING: radial-gradient(120% 100% at 100% 0%, #6A3218 0%, #2A160C 50%, #17161B 85%), radius 28, minst 250 høy.
struct SubAiCard23: View {
    let x: SubsX
    let review: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("✦ AI-SPARING").font(PF.ui(12, .semibold)).foregroundStyle(SubTok23.peach)
                .padding(.horizontal, 11).padding(.vertical, 5)
                .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text("Spar \(SubCalc23.kr(x.saveMonthly))\ni måneden").font(PF.ui(34, .semibold)).foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Text(SubCalc23.savingsText(x)).font(PF.ui(14)).foregroundStyle(Color(hex: "#D8C6BB")).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button(action: review) {
                Text("Gå gjennom").font(PF.ui(15, .semibold)).foregroundStyle(Color(hex: "#0B0B0E"))
                    .padding(.horizontal, 20).frame(height: 44)
                    .background(Color(hex: "#F4F4F6"), in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 250, alignment: .topLeading)
        .background(gradient, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    private var gradient: RadialGradient {
        RadialGradient(stops: [.init(color: Color(hex: "#6A3218"), location: 0), .init(color: Color(hex: "#2A160C"), location: 0.5), .init(color: Color(hex: "#17161B"), location: 0.85)],
                       center: .topTrailing, startRadius: 0, endRadius: 430)
    }
}

/// Neste 7 dager: beløp i mono, «N trekk» og 14 oransje søyler.
struct SubNextCard23: View {
    @Environment(\.paper) private var p
    let x: SubsX

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let list: [SubCharge] = SubCalc23.next7(x)
        let sum: Double = list.map(\.amount).reduce(0, +)
        let bars: [Double] = SubCalc23.weekBars(list)
        return HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Neste 7 dager").font(PF.ui(14)).foregroundStyle(t.mut)
                Text(SubCalc23.kr(sum)).font(PF.mono(30)).foregroundStyle(t.fg).padding(.top, 6).lineLimit(1).minimumScaleFactor(0.6)
                Text("\(list.count) trekk").font(PF.ui(13)).foregroundStyle(t.mut)
            }
            Spacer(minLength: 0)
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(Array(bars.enumerated()), id: \.offset) { _, v in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(v > 0 ? SubTok23.orange : SubTok23.off)
                        .frame(width: 7, height: CGFloat(Swift.max(4, Swift.min(56, v / 16))))
                }
            }
            .frame(height: 56, alignment: .bottom)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/// Abonnementssjekk: «Gå gjennom før fornyelse», «N abonnementer trenger en titt · spar opptil …» og logoene.
struct SubCheckCard23: View {
    @Environment(\.paper) private var p
    let x: SubsX

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let f: [SubItem] = SubCalc23.flagged(x)
        let n: Int = Swift.max(f.count, x.suggestions.count)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Text("♛").font(.system(size: 18)).foregroundStyle(SubTok23.peach)
                    .frame(width: 42, height: 42).background(SubTok23.warnBg, in: Circle())
                VStack(alignment: .leading, spacing: 0) {
                    Text("Abonnementssjekk").font(PF.ui(16, .semibold)).foregroundStyle(t.fg)
                    Text("Gå gjennom før fornyelse").font(PF.ui(13)).foregroundStyle(t.mut)
                }
            }
            HStack(alignment: .center, spacing: 10) {
                summary(n, t).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                logos(f, t)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func summary(_ n: Int, _ t: SubTok23) -> Text {
        let what: String = n == 1 ? "1 abonnement" : "\(n) abonnementer"
        let a: Text = Text(what).font(PF.ui(14, .semibold)).foregroundColor(t.fg)
        let b: Text = Text(" trenger en titt · spar opptil ").font(PF.ui(14)).foregroundColor(t.fg)
        let c: Text = Text(SubCalc23.kr(x.saveMonthly)).font(PF.ui(14)).foregroundColor(SubTok23.peach)
        return a + b + c
    }

    private func logos(_ f: [SubItem], _ t: SubTok23) -> some View {
        HStack(spacing: -8) {
            ForEach(Array(f.prefix(3))) { s in
                SubLogo23(name: s.name, domain: s.domain, logoUrl: s.logoUrl, category: s.category, size: 30)
                    .overlay(Circle().stroke(t.card, lineWidth: 2))
            }
        }
    }
}

/// Listen: logo, navn, plan og neste trekk, og prisen høyrejustert i mono.
struct SubListCard23: View {
    @Environment(\.paper) private var p
    let x: SubsX
    let open: (SubItem) -> Void

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let rows: [SubItem] = sorted
        return VStack(spacing: 0) {
            if rows.isEmpty {
                Text("Ingen abonnementer ennå. Trykk + Legg til abonnement.").font(PF.ui(14)).foregroundStyle(t.mut)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                if i > 0 { Rectangle().fill(t.bd).frame(height: 1) }
                row(s, t)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    /// Aktive etter neste trekk, så de som er sagt opp.
    private var sorted: [SubItem] {
        let act: [SubItem] = x.items.filter(\.active).sorted { a, b in
            let da: String = a.nextDate.isEmpty ? "9999" : a.nextDate
            let db: String = b.nextDate.isEmpty ? "9999" : b.nextDate
            return da < db
        }
        let off: [SubItem] = x.items.filter { !$0.active }
        return act + off
    }

    private func row(_ s: SubItem, _ t: SubTok23) -> some View {
        Button { open(s) } label: {
            HStack(spacing: 12) {
                SubLogo23(name: s.name, domain: s.domain, logoUrl: s.logoUrl, category: s.category, size: 34)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text(s.name).font(PF.ui(14.5, .medium)).foregroundStyle(t.fg).lineLimit(1)
                        // Prompt 37: delte abonnementer – små avatarer etter navnet.
                        if s.shared37 { Task37Avatars(names: s.members.map(\.name)) }
                    }
                    Text(sub(s)).font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                    if s.shared37 {
                        Text(Subs37.shareLine(s)).font(PF.ui(12, .semibold)).foregroundStyle(Subs37.green).lineLimit(1)
                    }
                }
                Spacer(minLength: 6)
                Text(SubCalc23.kr(s.price)).font(PF.mono(14)).foregroundStyle(s.active ? t.fg : t.mut)
            }
            .padding(.vertical, 10)
            .opacity(s.active ? 1 : 0.6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func sub(_ s: SubItem) -> String {
        var parts: [String] = []
        if !s.plan.isEmpty { parts.append(s.plan) }
        if !s.active { parts.append("Sagt opp") } else if !s.nextDate.isEmpty { parts.append(SubCalc23.when(s.nextDate)) }
        if s.active && s.status == "price_up" { parts.append("▲ Pris økt") }
        if s.active && s.status == "low_use" { parts.append("⚠ Lite brukt") }
        return parts.joined(separator: " · ")
    }
}

/// «Dra for å flytte · Tilbakestill · Ferdig» øverst mens kortene redigeres.
struct SubOrderBar23: View {
    @Environment(\.paper) private var p
    let reset: () -> Void
    let done: () -> Void

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        return HStack(spacing: 8) {
            Text("Dra for å flytte").font(PF.ui(13, .semibold)).foregroundStyle(t.fg).lineLimit(1)
            Spacer(minLength: 4)
            Button(action: reset) {
                Text("Tilbakestill").font(PF.ui(13, .semibold)).foregroundStyle(t.fg)
                    .padding(.horizontal, 14).frame(height: 34).background(t.chip, in: Capsule())
            }
            .buttonStyle(.plain)
            Button(action: done) {
                Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(t.card)
                    .padding(.horizontal, 16).frame(height: 34).background(t.fg, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 14).padding(.trailing, 8).padding(.vertical, 8)
        .background(t.card, in: Capsule())
        .shadow(color: Color.black.opacity(0.18), radius: 15, y: 10)
    }
}

/// Hjem: kortene i lagret rekkefølge. Hold inne 0,45 s → stiplet ramme, dra for å flytte. Trykk inne i kortene er blokkert
/// mens du redigerer, og et langt trykk åpner ikke et abonnement.
struct SubHome23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let x: SubsX
    @State private var order: [String] = SubHomeOrder23.load()
    /// Prompt 37: skjulte kort (− i wiggle-modus), ＋ henter dem tilbake.
    @State private var hid: [String] = SubHid37.load()
    @State private var addOpen: Bool = false
    @State private var wig: Bool = false
    @State private var editing: Bool = false
    @State private var pressAt: Date = .distantPast
    @State private var width: CGFloat = 358

    var body: some View {
        VStack(spacing: 14) {
            if editing {
                HStack(spacing: 8) {
                    // Prompt 37: ＋ med antall skjulte kort.
                    Edit28Pill(kind: .add, text: hid.isEmpty ? "" : "\(hid.count)") {
                        Haptics.shared.tap()
                        addOpen = true
                    }
                    SubOrderBar23(reset: { resetOrder() }, done: { stopEditing() })
                }
            }
            // Prompt 46: «Gratis prøveperioder» skjules når ingen er aktive (vises i wiggle, så kortet kan flyttes/skjules).
            ForEach(order.filter { !hid.contains($0) && ($0 != "trials" || editing || !Trial31Model.shared.active.isEmpty) }, id: \.self) { k in cell(k) }
        }
        .task(id: store.account?.id ?? "") { if !Trial31Model.shared.loaded { await Trial31Model.shared.load(store.api) } }
        .sheet(isPresented: $addOpen) {
            Sub37AddCardsSheet(hidden: hid, show: { (k: String) in
                Haptics.shared.tick()
                withAnimation(.easeOut(duration: 0.2)) { hid.removeAll { $0 == k } }
                SubHid37.save(hid, store)
            }, close: { addOpen = false })
            .environment(\.paper, p)
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .background(GeometryReader { g in Color.clear.onAppear { width = g.size.width } })
        .task {
            if let o = await SubHomeOrder23.fetch(store), !editing { order = o }
        }
    }

    @ViewBuilder private func card(_ k: String) -> some View {
        switch k {
        // Prompt 37: Gratis prøveperioder (Subs37.swift).
        case "trials": Sub37TrialsCard(editing: editing)
        case "ai": SubAiCard23(x: x) { act { store.subTab = "hist" } }
        case "next7": SubNextCard23(x: x)
        case "check": SubCheckCard23(x: x).contentShape(Rectangle()).onTapGesture { act { store.subTab = "hist" } }
        default: SubListCard23(x: x) { s in act { store.subEdit = s } }
        }
    }

    @ViewBuilder private func cell(_ k: String) -> some View {
        let t: SubTok23 = SubTok23.of(p)
        let r: CGFloat = k == "ai" ? 28 : 24
        let i: Int = order.firstIndex(of: k) ?? 0
        let sign: Double = i % 2 == 0 ? 1 : -1
        if editing {
            card(k)
                .allowsHitTesting(false)
                // Trykk inne i kortet er blokkert mens du redigerer (act() sjekker også editing).
                .overlay(Color.white.opacity(0.001))
                .overlay(
                    RoundedRectangle(cornerRadius: r + 3, style: .continuous)
                        .stroke(t.bd, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                        .padding(-3)
                )
                // Prompt 37: − skjuler kortet, og kortene vugger (±0,6°, 0,6 s, annenhver retning).
                .overlay(alignment: .topLeading) {
                    Edit28Minus(label: "Skjul " + SubHid37.label(k)) {
                        Haptics.shared.tick()
                        withAnimation(.easeOut(duration: 0.2)) { hid.append(k) }
                        SubHid37.save(hid, store)
                    }
                    .offset(x: -9, y: -9)
                }
                .rotationEffect(.degrees((wig ? 0.6 : -0.6) * sign))
                .contentShape(Rectangle())
                .draggable(k) {
                    card(k).frame(width: width).scaleEffect(1.03).opacity(0.85).environment(\.paper, p).environment(store)
                }
                .dropDestination(for: String.self) { items, _ in
                    drop(items.first, on: k)
                    return true
                }
        } else {
            card(k)
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.45, maximumDistance: 8).onEnded { _ in startEditing() })
        }
    }

    /// Trykk inne i et kort: ikke rett etter et langt trykk.
    private func act(_ f: () -> Void) {
        if editing || Date().timeIntervalSince(pressAt) < 0.8 { return }
        Haptics.shared.tap()
        f()
    }

    private func startEditing() {
        guard !editing else { return }
        pressAt = Date()
        Haptics.shared.tick()
        withAnimation(.easeOut(duration: 0.15)) { editing = true }
        wig = false
        withAnimation(.easeInOut(duration: 0.3).repeatForever(autoreverses: true)) { wig = true }
    }

    private func stopEditing() {
        Haptics.shared.success()
        withAnimation(.easeOut(duration: 0.15)) { editing = false; wig = false }
        pressAt = Date()
        SubHomeOrder23.save(order, store)
    }

    private func resetOrder() {
        Haptics.shared.select()
        SubHomeOrder23.reset(store)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order = SubHomeOrder23.all; hid = [] }
        SubHid37.save([], store)
    }

    private func drop(_ src: String?, on target: String) {
        guard let src else { return }
        let next: [String] = FinTileOrder20.moved(order, src, before: target)
        guard next != order else { return }
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order = next }
        UserDefaults.standard.set(next, forKey: SubHomeOrder23.key)
    }
}
