import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Subscription OS, nytt design (Hjem · Innsikt · Historikk) ---------------- */

struct SubItem: Identifiable, Hashable {
    var id: Int
    var name: String
    var plan: String
    var price: Double
    var monthly: Double
    var cycle: String
    var nextDate: String
    var chargeDay: Int?
    var category: String
    /// active | low_use | price_up | cancelled
    var status: String
    var active: Bool
    var domain: String?
    var usageNote: String
    var aiShort: String
    init(_ o: [String: Any]) {
        id = JS.int(o, "id") ?? 0
        name = JS.str(o, "name") ?? "Abonnement"
        plan = JS.str(o, "plan") ?? ""
        price = JS.num(o, "price") ?? 0
        cycle = JS.str(o, "cycle") ?? "monthly"
        monthly = JS.num(o, "monthly") ?? (cycle == "yearly" ? price / 12 : cycle == "biennial" ? price / 24 : price)
        nextDate = JS.str(o, "nextDate") ?? ""
        chargeDay = JS.int(o, "chargeDay") ?? (nextDate.count >= 10 ? Int(nextDate.dropFirst(8).prefix(2)) : nil)
        category = JS.str(o, "category") ?? "Annet"
        active = JS.bool(o, "active") ?? true
        status = JS.str(o, "status") ?? (!active ? "cancelled" : (JS.bool(o, "lowUse") ?? false) ? "low_use" : "active")
        domain = JS.str(o, "domain")
        usageNote = JS.str(o, "usageNote") ?? ""
        aiShort = JS.str(o, "aiShort") ?? ""
    }
    var cycleName: String { cycle == "yearly" ? "Årlig" : cycle == "biennial" ? "Hvert 2. år" : "Månedlig" }
    var flagged: Bool { active && (status == "low_use" || status == "price_up") }
}

struct SubSuggestion: Identifiable, Hashable { var id: String; var subId: Int?; var name: String; var text: String; var amount: Double; var domain: String? }
struct SubCharge: Hashable { var id: Int?; var name: String; var date: String; var amount: Double }
struct SubCandidate: Identifiable, Hashable {
    var merchant: String; var amount: Double; var cycle: String; var count: Int; var lastDate: String; var domain: String?
    var id: String { merchant + "|" + String(amount) }
    var json: [String: Any] {
        var o: [String: Any] = ["merchant": merchant, "amount": amount, "cycle": cycle, "count": count, "lastDate": lastDate]
        if let domain { o["domain"] = domain }
        return o
    }
}

struct SubsX {
    var items: [SubItem] = []
    var monthly: Double = 0
    var yearly: Double = 0
    var prevMonthly: Double?
    var categories: [String] = []
    /// month (yyyy-MM), total, byCategory
    var byMonth: [(String, Double, [String: Double])] = []
    var score: Double?
    var healthLabel = ""
    var healthText = ""
    var notes: [String] = []
    var saveMonthly: Double = 0
    var suggestions: [SubSuggestion] = []
    var upcoming: [SubCharge] = []
    var thisMonth: [SubCharge] = []
    var monthTotal: Double?

    static func parse(_ d: Data) -> SubsX { SubsX(JS.obj(d)) }
    init() {}
    init(_ o: [String: Any]) {
        items = JS.list(o, "items").map(SubItem.init)
        let act = items.filter(\.active)
        monthly = JS.num(o, "monthly") ?? act.map(\.monthly).reduce(0, +)
        yearly = JS.num(o, "yearly") ?? monthly * 12
        prevMonthly = JS.num(o, "prevMonthly")
        categories = JS.strings(o, "categories")
        byMonth = JS.list(o, "byMonth").map { m -> (String, Double, [String: Double]) in
            var cats: [String: Double] = [:]
            if let d = m["byCategory"] as? [String: Any] { for (k, v) in d { cats[k] = (v as? NSNumber)?.doubleValue ?? Double("\(v)") ?? 0 } }
            else { for c in JS.list(m, "byCategory") { if let k = JS.str(c, "category") ?? JS.str(c, "name") { cats[k] = JS.num(c, "amount") ?? JS.num(c, "total") ?? 0 } } }
            return (JS.str(m, "month") ?? "", JS.num(m, "total") ?? cats.values.reduce(0, +), cats)
        }
        let h = JS.dict(o, "health")
        score = JS.num(h, "score")
        healthLabel = JS.str(h, "label") ?? ""
        healthText = JS.str(h, "text") ?? ""
        notes = JS.strings(h, "notes")
        let sv = JS.dict(o, "savings")
        suggestions = JS.list(sv, "suggestions").map { s in
            SubSuggestion(id: (JS.str(s, "kind") ?? "s") + (JS.str(s, "id") ?? UUID().uuidString), subId: JS.int(s, "id"), name: JS.str(s, "name") ?? "",
                          text: JS.str(s, "text") ?? "", amount: JS.num(s, "amount") ?? 0, domain: JS.str(s, "domain"))
        }
        let flagged = act.filter(\.flagged)
        if suggestions.isEmpty {
            suggestions = flagged.map { s in
                SubSuggestion(id: "f\(s.id)", subId: s.id, name: s.name, text: s.status == "price_up" ? "\(s.name) har økt prisen. Sjekk om en billigere plan holder." : "Si opp \(s.name). Lite brukt i det siste.",
                              amount: s.monthly.rounded(), domain: s.domain)
            }
        }
        saveMonthly = JS.num(sv, "monthly") ?? suggestions.map(\.amount).reduce(0, +)
        let its = items
        func charges(_ k: String) -> [SubCharge] {
            JS.list(o, k).map { c -> SubCharge in
                let id = JS.int(c, "id")
                return SubCharge(id: id, name: JS.str(c, "name") ?? its.first { $0.id == id }?.name ?? "Abonnement", date: JS.str(c, "date") ?? "", amount: JS.num(c, "amount") ?? 0)
            }
        }
        upcoming = charges("upcoming")
        thisMonth = charges("thisMonth")
        monthTotal = JS.num(o, "monthTotal")
    }

    func item(_ id: Int?) -> SubItem? { items.first { $0.id == id } }
}

/* ---------------- Data ---------------- */

extension Store {
    func loadSubs() async throws {
        let d = try await api.call("GET", "/subscriptions")
        subs = try? JSONDecoder().decode(SubList.self, from: d)
        subsX = SubsX.parse(d)
    }

    func setSubItemActive(_ s: SubItem, _ active: Bool) {
        run {
            try await self.api.call("PATCH", "/subscriptions/\(s.id)", json: ["active": active])
            try await self.loadSubs()
            self.flash(active ? "\(s.name) er aktivert igjen" : "\(s.name) er markert som sagt opp")
        }
    }

    /// «Skriv inn selv»: tjeneste, plan, beløp, syklus og trekkdag.
    func addSubManual(name: String, plan: String, price: String, cycle: String, day: Int?) {
        run {
            var body: [String: Any] = ["name": name, "plan": plan, "price": price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: "."), "cycle": cycle]
            if let day, (1...31).contains(day) {
                body["chargeDay"] = day
                body["nextDate"] = Store.nextCharge(day)
            }
            try await self.api.call("POST", "/subscriptions", json: body)
            try await self.loadSubs()
            self.flash("\(name) lagt til")
        }
    }

    /// Neste dato med trekkdagen (denne måneden hvis den ikke er passert).
    static func nextCharge(_ day: Int, from now: Date = Date()) -> String {
        let cal = Calendar.current
        for add in 0..<3 {
            guard let m = cal.date(byAdding: .month, value: add, to: now), let r = cal.range(of: .day, in: .month, for: m) else { continue }
            var c = cal.dateComponents([.year, .month], from: m)
            c.day = Swift.min(day, r.count)
            if let d = cal.date(from: c), cal.startOfDay(for: d) >= cal.startOfDay(for: now) { return isoDay(d) }
        }
        return isoDay(now)
    }

    /// «Fra transaksjoner»: faste trekk sett minst 3 ganger som ikke er registrert.
    func loadSubCandidates() {
        subCandidates = nil
        run {
            let d = try await self.api.call("GET", "/subscriptions/candidates")
            let obj = try? JSONSerialization.jsonObject(with: d)
            let list = (obj as? [Any]) ?? ((obj as? [String: Any])?["items"] as? [Any]) ?? []
            self.subCandidates = list.compactMap { $0 as? [String: Any] }.map { c in
                SubCandidate(merchant: JS.str(c, "merchant") ?? JS.str(c, "name") ?? "?", amount: abs(JS.num(c, "amount") ?? 0), cycle: JS.str(c, "cycle") ?? "monthly",
                             count: JS.int(c, "count") ?? 0, lastDate: JS.str(c, "lastDate") ?? "", domain: JS.str(c, "domain"))
            }
        }
    }

    func addSubCandidate(_ c: SubCandidate) {
        run {
            try await self.api.call("POST", "/subscriptions", json: ["fromCandidate": c.json])
            self.subCandidates = self.subCandidates?.filter { $0.id != c.id }
            try await self.loadSubs()
            self.flash("\(c.merchant) lagt til")
        }
    }

    /// «Fra kvittering»: ✦ AI leser bildet eller PDF-en og lager abonnementet.
    func uploadSubReceipt(_ data: Data, mime: String, name: String) {
        run {
            self.busy = true
            defer { self.busy = false }
            _ = try await self.api.upload("/subscriptions/receipts", parts: [API.Part(name: "file", filename: name, mime: mime, data: data)])
            self.flash("✦ AI leser kvitteringen. Abonnementet dukker opp om litt.")
            for _ in 0..<4 {
                try? await Task.sleep(for: .seconds(5))
                try? await self.loadSubs()
            }
        }
    }
}

/* ---------------- Visning ---------------- */

private let catColors = ["#FF7A3D", "#7AA7FF", "#F2C14E", "#5FD3A8", "#B79CFF", "#FF8A80", "#30B0C7", "#A0A0AA"]
private func krs(_ v: Double) -> String { "\(neg0(v)) kr" }
private let monthShort = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"]

/// Diagonale striper (kategorilinjer og valgt måned).
private struct Stripes: View {
    let color: Color
    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(color.opacity(0.75)))
            var x: CGFloat = -size.height
            while x < size.width {
                var p = Path()
                p.move(to: CGPoint(x: x, y: size.height)); p.addLine(to: CGPoint(x: x + size.height, y: 0))
                ctx.stroke(p, with: .color(color), lineWidth: 3)
                x += 7
            }
        }
    }
}

/// Abonnementshelse 0–100 som en halvsirkel av streker.
private struct HealthGauge: View {
    let score: Double
    var body: some View {
        ZStack(alignment: .bottom) {
            Canvas { ctx, size in
                let cx = size.width / 2, cy = size.height - 4
                let r2 = Swift.min(size.width / 2, size.height) - 4, r1 = r2 * 0.78
                for i in 0..<30 {
                    let a = CGFloat.pi * (1 - CGFloat(i) / 29)
                    let on = CGFloat(i) / 29 <= CGFloat(score / 100)
                    var p = Path()
                    p.move(to: CGPoint(x: cx + r1 * cos(a), y: cy - r1 * sin(a)))
                    p.addLine(to: CGPoint(x: cx + r2 * cos(a), y: cy - r2 * sin(a)))
                    let c: Color = on ? (i < 10 ? Color(hex: "#C85A26") : i < 20 ? Color.accent : Color.accentLight) : Color.white.opacity(0.14)
                    ctx.stroke(p, with: .color(c), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                }
            }
            VStack(spacing: 0) {
                Text("\(Int(score))").font(.system(size: 36, weight: .bold)).monospacedDigit()
                Text("/100").font(.caption).foregroundStyle(.white.opacity(0.6))
            }
        }
    }
}

struct SubsMobileView: View {
    @Environment(Store.self) private var store
    @State private var adding = false
    @State private var month: Int?
    @State private var done: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "fh_subs_done") ?? [])

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Subscription OS", trailing: {
                    Button { Haptics.shared.tap(); adding = true } label: {
                        Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(width: 44, height: 44).contentShape(Circle())
                    }
                    .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Legg til abonnement")
                })
                tabs
                if let e = store.moduleError { Empty(text: e) }
                if let x = store.subsX {
                    switch store.subTab {
                    case "ins": insights(x)
                    case "hist": history(x)
                    default: home(x)
                    }
                } else if store.moduleError == nil { ProgressView().padding(30) }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .tracksScroll(store)
        .refreshable { await store.reloadModule() }
        .sheet(isPresented: $adding) {
            SubAddSheet().presentationDetents([.medium, .large]).presentationBackground(.ultraThinMaterial)
        }
    }

    private var tabs: some View {
        HStack(spacing: 4) {
            ForEach([("home", "Hjem", "house"), ("ins", "Innsikt", "chart.bar"), ("hist", "Historikk", "clock")], id: \.0) { k, n, icon in
                let on = store.subTab == k
                Button { Haptics.shared.select(); store.subTab = k } label: {
                    HStack(spacing: 6) { Image(systemName: icon).font(.system(size: 13, weight: .semibold)); Text(n).font(.subheadline.weight(.semibold)) }
                        .foregroundStyle(on ? (DesignStyle.material ? M3.onPrimary : Color.black) : .white.opacity(0.7))
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(on ? (DesignStyle.material ? M3.primary : Color.white) : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4).glass(23)
    }

    /* ---------- Hjem ---------- */

    @ViewBuilder private func home(_ x: SubsX) -> some View {
        savingsCard(x)
        week(x)
        let flagged = x.items.filter(\.flagged)
        if !flagged.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("♛ Abonnementssjekk").fontWeight(.semibold)
                    Spacer()
                    Text("Gå gjennom før fornyelse").font(.caption).foregroundStyle(.white.opacity(0.6))
                }
                Text("\(flagged.count) abonnement\(flagged.count == 1 ? "" : "er") trenger en titt · spar opptil \(krs(x.saveMonthly))/mnd").font(.footnote).foregroundStyle(.white.opacity(0.75))
                ForEach(flagged) { s in
                    HStack(spacing: 12) {
                        Logo(domain: s.domain, name: s.name, color: "#FF7A3D", size: 34)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.name).fontWeight(.medium).lineLimit(1)
                            Text(s.status == "price_up" ? "▲ Pris økt" : "⚠ Lite brukt").font(.caption).foregroundStyle(s.status == "price_up" ? Color(hex: "#FF8A80") : .accentLight)
                        }
                        Spacer()
                        Button { Haptics.shared.tap(); store.setSubItemActive(s, false) } label: {
                            Text("Si opp").font(.footnote.weight(.semibold)).padding(.horizontal, 12).frame(height: 32).contentShape(Capsule())
                        }
                        .buttonStyle(.plain).glass(16)
                    }
                }
            }
            .padding(16).glass(24)
        }
        if !x.upcoming.isEmpty {
            SectionLabel(text: "Kommende trekk")
            CardList(x.upcoming) { c in
                ItemLine(title: c.name, sub: when(c.date), value: krs(c.amount), domain: x.item(c.id)?.domain ?? "")
            }
        }
        SectionLabel(text: "Alle abonnementer · \(x.items.filter(\.active).count) aktive")
        if x.items.isEmpty { Empty(text: "Ingen abonnementer ennå. Trykk + for å legge til.") } else {
            CardList(x.items) { s in subRow(s) }
        }
    }

    private func savingsCard(_ x: SubsX) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("✦ AI-SPARING").font(.caption.weight(.bold)).foregroundStyle(.white.opacity(0.85))
            Text(x.saveMonthly > 0 ? "Spar \(krs(x.saveMonthly)) i måneden" : "Ingen sparetips akkurat nå").font(.title2.weight(.bold))
            Text(x.suggestions.first?.text ?? (x.healthText.isEmpty ? "Alle abonnementene ser ut til å være i bruk." : x.healthText)).font(.footnote).foregroundStyle(.white.opacity(0.8)).lineLimit(3)
            HStack {
                Text("\(krs(x.monthly))/mnd · \(krs(x.yearly))/år").font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.85))
                Spacer()
                if !x.suggestions.isEmpty {
                    Button { Haptics.shared.select(); store.subTab = "hist" } label: {
                        Text("Gå gjennom \(x.suggestions.count) forslag").font(.footnote.weight(.bold)).foregroundStyle(Color.ink).padding(.horizontal, 14).frame(height: 34).background(.white, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).glass(26, tint: Color.accent.opacity(0.45))
    }

    private func week(_ x: SubsX) -> some View {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let days = (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: today) }
        let sums = days.map { d in x.upcoming.filter { $0.date.hasPrefix(isoDay(d)) }.map(\.amount).reduce(0, +) }
        let mx = Swift.max(sums.max() ?? 0, 1)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Neste 7 dager").fontWeight(.semibold)
                Spacer()
                Text("\(krs(sums.reduce(0, +))) · \(x.upcoming.count) trekk").font(.footnote).foregroundStyle(.white.opacity(0.7))
            }
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(Array(days.enumerated()), id: \.offset) { i, d in
                    VStack(spacing: 4) {
                        if sums[i] > 0 { Text(n0(sums[i])).font(.system(size: 9)).foregroundStyle(.white.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.6) }
                        RoundedRectangle(cornerRadius: 5).fill(sums[i] > 0 ? Color.accent : Color.white.opacity(0.1))
                            .frame(height: Swift.max(6, CGFloat(sums[i] / mx) * 70))
                        Text(i == 0 ? "I dag" : JS.fmt(d, "EEE").capitalized).font(.system(size: 10)).foregroundStyle(.white.opacity(i == 0 ? 0.9 : 0.6)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 104, alignment: .bottom)
        }
        .padding(16).glass(24)
    }

    private func when(_ date: String) -> String {
        guard let d = parseDay(date) else { return date }
        let n = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: d).day ?? 0
        return n <= 0 ? "I dag" : n == 1 ? "I morgen" : n < 7 ? "Om \(n) dager · \(ddmm(date))" : ddmm(date)
    }

    private func subRow(_ s: SubItem) -> some View {
        let pill: (String, Color) = !s.active ? ("Sagt opp", .white.opacity(0.6)) : s.status == "price_up" ? ("▲ Pris økt", Color(hex: "#FF8A80")) : s.status == "low_use" ? ("⚠ Lite brukt", .accentLight) : ("Aktiv", .positive)
        return HStack(spacing: 12) {
            Logo(domain: s.domain, name: s.name, color: "#FF7A3D", size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name + (s.plan.isEmpty ? "" : " · \(s.plan)")).fontWeight(.medium).lineLimit(1)
                Text([s.cycleName, s.nextDate.isEmpty ? nil : "Neste \(ddmm(s.nextDate))", s.category].compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                AiLine(text: s.aiShort)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 4) {
                Text(n0(s.price)).font(.system(.body, design: .monospaced).weight(.semibold))
                Pill(text: pill.0, color: pill.1)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
        .contextMenu {
            if s.active { Button("Marker som sagt opp") { store.setSubItemActive(s, false) } } else { Button("Aktiver igjen") { store.setSubItemActive(s, true) } }
        }
    }

    /* ---------- Innsikt ---------- */

    @ViewBuilder private func insights(_ x: SubsX) -> some View {
        let cur = Calendar.current.component(.month, from: Date()) - 1
        let months = x.byMonth.count == 12 ? Array(x.byMonth[Swift.max(0, cur - 5)...cur]) : Array(x.byMonth.suffix(6))
        let sel = month ?? (months.count - 1)
        let mx = Swift.max(months.map(\.1).max() ?? 0, 1)
        VStack(alignment: .leading, spacing: 10) {
            Text("Abonnementer per måned").fontWeight(.semibold)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(krs(x.monthly)).font(.title2.weight(.bold)).monospacedDigit()
                if let p = x.prevMonthly, p > 0, abs(x.monthly - p) >= 1 {
                    Text("\(x.monthly >= p ? "▲" : "▼") \(krs(abs(x.monthly - p))) fra forrige måned").font(.caption).foregroundStyle(x.monthly > p ? Color.accentLight : .positive)
                }
            }
            if !months.isEmpty {
                HStack(alignment: .bottom, spacing: 10) {
                    ForEach(Array(months.enumerated()), id: \.offset) { i, m in
                        Button { Haptics.shared.select(); month = i } label: {
                            VStack(spacing: 4) {
                                Text(i == sel ? n0(m.1) : " ").font(.system(size: 9, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.6)
                                Group {
                                    if i == sel { Stripes(color: .accent) } else { Color.white.opacity(0.14) }
                                }
                                .frame(height: Swift.max(6, CGFloat(m.1 / mx) * 90)).clipShape(RoundedRectangle(cornerRadius: 6))
                                let mi = Int(m.0.suffix(2)) ?? 0
                                Text((1...12).contains(mi) ? monthShort[mi - 1] : m.0).font(.caption2).foregroundStyle(.white.opacity(i == sel ? 0.95 : 0.6))
                            }
                            .frame(maxWidth: .infinity).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(height: 126, alignment: .bottom)
            }
        }
        .padding(16).glass(24)
        if let score = x.score {
            VStack(spacing: 8) {
                HStack { Text("Abonnementshelse").fontWeight(.semibold); Spacer(); Text(x.healthLabel).font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight) }
                HealthGauge(score: score).frame(height: 120)
                Text(x.healthText.isEmpty ? x.notes.joined(separator: " · ") : x.healthText).font(.footnote).foregroundStyle(.white.opacity(0.7)).multilineTextAlignment(.center)
            }
            .padding(16).glass(24)
        }
        categories(x, months.indices.contains(sel) ? months[sel].2 : [:])
    }

    private func categories(_ x: SubsX, _ fromMonth: [String: Double]) -> some View {
        var per: [String: Double] = [:]
        for s in x.items where s.active { per[s.category, default: 0] += s.monthly }
        let src = per.isEmpty ? fromMonth : per
        let list = src.sorted { $0.value > $1.value }
        let mx = Swift.max(list.first?.value ?? 0, 1)
        let order = x.categories.isEmpty ? list.map(\.key) : x.categories
        return VStack(alignment: .leading, spacing: 12) {
            HStack { Text("Per kategori").fontWeight(.semibold); Spacer(); Text("per måned").font(.caption).foregroundStyle(.white.opacity(0.6)) }
            if list.isEmpty { Text("Ingen aktive abonnementer.").font(.footnote).foregroundStyle(.white.opacity(0.6)) }
            ForEach(list, id: \.key) { k, v in
                let c = Color(hex: catColors[(order.firstIndex(of: k) ?? 7) % catColors.count])
                VStack(alignment: .leading, spacing: 5) {
                    HStack { Text(k).font(.subheadline).lineLimit(1); Spacer(); Text(krs(v)).font(.system(.footnote, design: .monospaced).weight(.semibold)) }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.1))
                            Stripes(color: c).frame(width: Swift.max(8, g.size.width * CGFloat(v / mx))).clipShape(Capsule())
                        }
                    }
                    .frame(height: 10)
                }
            }
        }
        .padding(16).glass(24)
    }

    /* ---------- Historikk ---------- */

    @ViewBuilder private func history(_ x: SubsX) -> some View {
        let tasks = x.suggestions
        let doneCount = tasks.filter { done.contains($0.id) }.count
        let saved = tasks.filter { done.contains($0.id) }.map(\.amount).reduce(0, +)
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("✦ Smart sparing").fontWeight(.semibold)
                Text("AI-agent").font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2).background(.white.opacity(0.14), in: Capsule())
                Spacer()
                Text("⏳ \(tasks.count - doneCount) igjen").font(.caption).foregroundStyle(.white.opacity(0.7))
            }
            Bar(value: tasks.isEmpty ? 1 : Double(doneCount) / Double(tasks.count))
            HStack(spacing: 10) {
                Kpi(label: "Spart per måned", value: krs(saved), tint: saved > 0 ? Color.positive : nil)
                Kpi(label: "Mulig per måned", value: krs(x.saveMonthly))
            }
            if tasks.isEmpty { Text("Ingen forslag. Abonnementene ser ut til å være i bruk.").font(.footnote).foregroundStyle(.white.opacity(0.65)) }
            ForEach(tasks) { t in
                let on = done.contains(t.id)
                Button { toggle(t.id) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.title3).foregroundStyle(on ? Color.positive : .white.opacity(0.5))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.text).font(.subheadline).strikethrough(on).foregroundStyle(.white.opacity(on ? 0.55 : 1)).multilineTextAlignment(.leading)
                            if t.amount > 0 { Text("−\(krs(t.amount))/mnd").font(.caption.weight(.semibold)).foregroundStyle(Color.accentLight) }
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Text("Status: " + (tasks.isEmpty ? "Ferdig" : doneCount == tasks.count ? "Alle forslag er gjennomgått ✓" : "Venter på \(tasks.count - doneCount) forslag")).font(.caption).foregroundStyle(.white.opacity(0.6))
        }
        .padding(16).glass(24)
        thisMonth(x)
    }

    private func toggle(_ id: String) {
        Haptics.shared.select()
        if done.contains(id) { done.remove(id) } else { done.insert(id); Haptics.shared.success() }
        UserDefaults.standard.set(Array(done), forKey: "fh_subs_done")
    }

    @ViewBuilder private func thisMonth(_ x: SubsX) -> some View {
        let today = isoDay(Date())
        let list: [SubCharge] = !x.thisMonth.isEmpty ? x.thisMonth : x.items.filter { $0.active && $0.cycle == "monthly" }.compactMap { s -> SubCharge? in
            guard let d = s.chargeDay else { return nil }
            return SubCharge(id: s.id, name: s.name, date: String(today.prefix(8)) + String(format: "%02d", d), amount: s.price)
        }.sorted { $0.date < $1.date }
        HStack {
            SectionLabel(text: "Denne måneden")
            Text(krs(x.monthTotal ?? list.map(\.amount).reduce(0, +))).font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.75)).padding(.top, 6)
        }
        if list.isEmpty { Empty(text: "Ingen trekk denne måneden.") } else {
            CardList(list) { c in
                ItemLine(title: c.name, sub: (c.date <= today ? "Trukket " : "Kommer ") + ddmm(c.date), value: krs(c.amount),
                         valueColor: c.date <= today ? .white.opacity(0.6) : .white, domain: x.item(c.id)?.domain ?? "")
            }
        }
    }
}

/// «+ Legg til abonnement»: Skriv inn selv · Fra kvittering · Fra transaksjoner.
struct SubAddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var mode: String?
    @State private var name = ""
    @State private var plan = ""
    @State private var price = ""
    @State private var cycle = "monthly"
    @State private var day = ""
    @State private var photo: PhotosPickerItem?
    @State private var files = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    if mode != nil {
                        Button { mode = nil } label: { Image(systemName: "chevron.left").font(.system(size: 16, weight: .semibold)).frame(width: 40, height: 40) }.buttonStyle(.plain).glass(20)
                    }
                    Text(mode == "manual" ? "Skriv inn selv" : mode == "receipt" ? "Fra kvittering" : mode == "tx" ? "Fra transaksjoner" : "Legg til abonnement").font(.title3.weight(.bold))
                    Spacer()
                    Button("Lukk") { dismiss() }.fontWeight(.semibold).foregroundStyle(Color.accentLight)
                }
                switch mode {
                case "manual": manual
                case "receipt": receipt
                case "tx": candidates
                default: options
                }
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
        .fileImporter(isPresented: $files, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .image]) { r in
            guard case .success(let url) = r, url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let d = try? Data(contentsOf: url) else { return }
            if url.pathExtension.lowercased() == "pdf" { send(d, "application/pdf", "kvittering.pdf") }
            else if let img = UIImage(data: d), let j = img.scaled(max: 2400).jpegData(compressionQuality: 0.85) { send(j, "image/jpeg", "kvittering.jpg") }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d), let j = img.scaled(max: 2400).jpegData(compressionQuality: 0.85) { send(j, "image/jpeg", "kvittering.jpg") }
                photo = nil
            }
        }
    }

    private var options: some View {
        VStack(spacing: 0) {
            option("square.and.pencil", "Skriv inn selv", "Tjeneste, beløp, syklus og trekkdag") { mode = "manual" }
            Divider().overlay(.white.opacity(0.12))
            option("doc.viewfinder", "Fra kvittering", "✦ AI leser bilde eller PDF og fyller inn") { mode = "receipt" }
            Divider().overlay(.white.opacity(0.12))
            option("arrow.triangle.2.circlepath", "Fra transaksjoner", "✦ Faste trekk sett minst 3 ganger, ikke registrert") { mode = "tx"; store.loadSubCandidates() }
        }
        .glass(24)
    }

    private func option(_ icon: String, _ t: String, _ s: String, _ act: @escaping () -> Void) -> some View {
        Button { Haptics.shared.select(); act() } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.accentLight).frame(width: 40, height: 40).background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) { Text(t).fontWeight(.semibold); Text(s).font(.caption).foregroundStyle(.white.opacity(0.65)) }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.45))
            }
            .padding(14).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var manual: some View {
        let p = Double(price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: "."))
        let d = Int(day.trimmingCharacters(in: .whitespaces))
        return VStack(alignment: .leading, spacing: 10) {
            TextField("Tjeneste, f.eks. Netflix", text: $name).padding(.horizontal, 14).frame(height: 46).glass(16)
            TextField("Plan (valgfritt)", text: $plan).padding(.horizontal, 14).frame(height: 46).glass(16)
            HStack(spacing: 10) {
                TextField("Beløp i kr", text: $price).keyboardType(.decimalPad).padding(.horizontal, 14).frame(height: 46).glass(16)
                TextField("Trekkdag (1–31)", text: $day).keyboardType(.numberPad).padding(.horizontal, 14).frame(height: 46).glass(16)
            }
            Picker("Syklus", selection: $cycle) {
                Text("Månedlig").tag("monthly")
                Text("Årlig").tag("yearly")
                Text("Hvert 2. år").tag("biennial")
            }
            .pickerStyle(.segmented)
            if let p {
                Text(cycle == "yearly" ? "= \(n0(p / 12)) kr/mnd" : cycle == "biennial" ? "= \(n0(p / 24)) kr/mnd" : "= \(n0(p * 12)) kr/år").font(.footnote).foregroundStyle(.white.opacity(0.65))
            }
            Button {
                Haptics.shared.tap()
                store.addSubManual(name: name.trimmingCharacters(in: .whitespaces), plan: plan, price: price, cycle: cycle, day: d)
                dismiss()
            } label: {
                Text("Legg til").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 50).contentShape(Capsule())
            }
            .buttonStyle(.plain).glass(25, tint: .accent).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || p == nil).opacity(name.isEmpty || p == nil ? 0.5 : 1)
        }
    }

    private var receipt: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("✦ AI leser kvitteringen eller fakturaen, finner tjeneste, beløp, syklus og trekkdag, og lager abonnementet. E-poster i kvitteringsmappen i Proton Mail leses automatisk.")
                .font(.footnote).foregroundStyle(.white.opacity(0.7))
            PhotosPicker(selection: $photo, matching: .images) {
                Label("Velg bilde", systemImage: "photo").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50).contentShape(Capsule())
            }
            .buttonStyle(.plain).glass(25)
            Button { files = true } label: {
                Label("Velg fil (PDF eller bilde)", systemImage: "doc").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50).contentShape(Capsule())
            }
            .buttonStyle(.plain).glass(25)
        }
    }

    @ViewBuilder private var candidates: some View {
        if let list = store.subCandidates {
            if list.isEmpty { Empty(text: "Fant ingen nye faste trekk. Alt ser ut til å være registrert.") }
            ForEach(list) { c in
                HStack(spacing: 12) {
                    Logo(domain: c.domain, name: c.merchant, color: "#FF7A3D", size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.merchant).fontWeight(.medium).lineLimit(1)
                        Text("\(c.count) trekk · \(c.cycle == "yearly" ? "årlig" : "månedlig")" + (c.lastDate.isEmpty ? "" : " · sist \(ddmm(c.lastDate))")).font(.caption).foregroundStyle(.white.opacity(0.6))
                    }
                    Spacer(minLength: 6)
                    Text(n0(c.amount)).font(.system(.subheadline, design: .monospaced).weight(.semibold))
                    Button { Haptics.shared.tap(); store.addSubCandidate(c) } label: {
                        Text("+ Legg til").font(.footnote.weight(.bold)).foregroundStyle(Color.ink).padding(.horizontal, 10).frame(height: 32).contentShape(Capsule())
                    }
                    .buttonStyle(.plain).glass(16, tint: .accent)
                }
                .padding(12).glass(20)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(30)
        }
    }

    private func send(_ d: Data, _ mime: String, _ name: String) {
        store.uploadSubReceipt(d, mime: mime, name: name)
        dismiss()
    }
}
