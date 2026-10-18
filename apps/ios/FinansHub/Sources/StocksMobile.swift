import SwiftUI

/* ---------------- Aksjer (Trading 212), nytt design ---------------- */

/// Lest romslig fra GET /stocks og POST /stocks/sync.
struct StockPos: Identifiable, Hashable {
    var id: String { ticker }
    var ticker: String
    var symbol: String
    var name: String
    var qty: Double
    var avg: Double
    var price: Double
    var value: Double
    var pl: Double
    var plPct: Double
    var dayPct: Double?
    var etf: Bool
    var series: [Double]
    var ini: String { String(symbol.filter { $0.isLetter || $0.isNumber }.prefix(2)).uppercased() }
}

struct StockTxn: Identifiable, Hashable {
    var id: String
    var ticker: String
    var symbol: String
    /// Kjøp | Salg | Utbytte
    var kind: String
    /// Utført | Venter | Avvist
    var status: String
    var qty: Double
    var amount: Double
    var date: String
    var time: String
}

struct StocksX {
    var configured = false
    var mock = false
    var status = ""
    var env = ""
    var error = ""
    var syncedAt: Date?
    var total: Double = 0
    var value: Double = 0
    var invested: Double = 0
    var result: Double = 0
    var cash: Double = 0
    var positions: [StockPos] = []
    var history: [Double] = []
    var txns: [StockTxn] = []

    static func parse(_ d: Data) -> StocksX { StocksX(JS.obj(d)) }
    init() {}
    init(_ o: [String: Any]) {
        configured = JS.bool(o, "configured") ?? (o["summary"] is [String: Any])
        mock = JS.bool(o, "mock") ?? false
        status = JS.str(o, "status") ?? ""
        env = JS.str(o, "env") ?? ""
        error = JS.str(o, "error") ?? ""
        syncedAt = JS.date(o["syncedAt"])
        let sm = JS.dict(o, "summary")
        value = JS.num(sm, "value") ?? 0
        invested = JS.num(sm, "invested") ?? 0
        result = JS.num(sm, "result") ?? (value - invested)
        cash = JS.num(sm, "cash") ?? 0
        total = JS.num(sm, "total") ?? (value + cash)
        let hist = JS.list(o, "history")
        history = hist.compactMap { JS.num($0, "value") }
        positions = JS.list(o, "positions").map { p -> StockPos in
            let ticker = JS.str(p, "ticker") ?? JS.str(p, "symbol") ?? "?"
            let sym = JS.str(p, "symbol") ?? ticker.components(separatedBy: "_").first ?? ticker
            let name = JS.str(p, "name") ?? sym
            let qty = JS.num(p, "quantity") ?? 0, avg = JS.num(p, "avg") ?? 0, px = JS.num(p, "price") ?? 0
            let val = JS.num(p, "value") ?? qty * px
            let pl = JS.num(p, "pl") ?? (val - qty * avg)
            let type = (JS.str(p, "type") ?? JS.str(p, "kind") ?? "").lowercased()
            let etf = type.isEmpty ? name.range(of: #"ETF|UCITS|Vanguard|iShares|Xtrackers|SPDR|Amundi|Invesco|Lyxor|Index"#, options: [.regularExpression, .caseInsensitive]) != nil : type.contains("etf") || type.contains("fund")
            // Kursserie: egen liste på posisjonen, ellers kursene per dag i historikken (history[].prices[ticker]).
            var series = (p["history"] as? [Any] ?? p["spark"] as? [Any] ?? p["prices"] as? [Any] ?? []).compactMap { v -> Double? in
                if let n = v as? NSNumber { return n.doubleValue }
                if let d = v as? [String: Any] { return JS.num(d, "price") ?? JS.num(d, "value") ?? JS.num(d, "close") }
                return nil
            }
            if series.isEmpty { series = hist.compactMap { JS.num(JS.dict($0, "prices"), ticker) } }
            return StockPos(ticker: ticker, symbol: sym, name: name, qty: qty, avg: avg, price: px, value: val, pl: pl,
                            plPct: JS.num(p, "plPct") ?? (qty * avg > 0 ? pl / (qty * avg) * 100 : 0), dayPct: JS.num(p, "dayPct"), etf: etf, series: series)
        }
        let orders = JS.list(o, "orders").map { x -> StockTxn in
            let t = JS.str(x, "ticker") ?? JS.str(x, "symbol") ?? ""
            let side = (JS.str(x, "side") ?? "").lowercased()
            let st = (JS.str(x, "status") ?? "").uppercased()
            let status = st.isEmpty || st.contains("FILL") || st.contains("EXECUT") ? "Utført" : (st.contains("CANCEL") || st.contains("REJECT") ? "Avvist" : "Venter")
            let date = JS.str(x, "date") ?? ""
            return StockTxn(id: "o" + (JS.str(x, "id") ?? UUID().uuidString), ticker: t, symbol: JS.str(x, "symbol") ?? t.components(separatedBy: "_").first ?? t,
                            kind: side.hasPrefix("s") ? "Salg" : "Kjøp", status: status, qty: JS.num(x, "quantity") ?? 0, amount: JS.num(x, "value") ?? 0,
                            date: String(date.prefix(10)), time: StocksX.clock(JS.str(x, "time") ?? date))
        }
        let divs = JS.list(o, "dividends").enumerated().map { pair -> StockTxn in
            let i = pair.offset, x = pair.element
            let t = JS.str(x, "ticker") ?? JS.str(x, "symbol") ?? ""
            let date = JS.str(x, "date") ?? ""
            return StockTxn(id: "d\(i)" + t + date, ticker: t, symbol: JS.str(x, "symbol") ?? t.components(separatedBy: "_").first ?? t, kind: "Utbytte", status: "Utført",
                            qty: JS.num(x, "quantity") ?? 0, amount: JS.num(x, "amount") ?? 0, date: String(date.prefix(10)), time: StocksX.clock(date))
        }
        txns = (orders + divs).sorted { ($0.date + $0.time) > ($1.date + $1.time) }
    }

    private static func clock(_ s: String) -> String {
        guard s.count > 10, let d = JS.date(s) else { return "" }
        return JS.fmt(d, "HH:mm")
    }

    var dayChange: Double { positions.compactMap { p in p.dayPct.map { p.value * $0 / (100 + $0) } }.reduce(0, +) }
    var hasDay: Bool { positions.contains { $0.dayPct != nil } }
}

private let ranges: [(String, String, Int)] = [("1D", "I dag", 2), ("1U", "1 uke", 7), ("1M", "1 måned", 31), ("3M", "3 måneder", 92), ("1Å", "1 år", 366), ("Alt", "Alt", Int.max)]

private func krs(_ v: Double) -> String { "\(neg0(v)) kr" }
private func chg(_ v: Double) -> String { "\(v < 0 ? "−" : "+")\(pct(abs(v)))" }

/// Farger som følger appens tema: iOS (mørkt glass, hvite piller, dempede pasteller) eller Material You.
private struct StockTheme {
    let up: Color, down: Color, upBg: Color, downBg: Color, blue: Color, blueBg: Color, pill: Color, onPill: Color, tints: [Color]
    static var current: StockTheme {
        if DesignStyle.material {
            return StockTheme(up: Color(hex: "#9FE3C6"), down: Color(hex: "#FF8A80"), upBg: Color(hex: "#1F3A2F"), downBg: Color(hex: "#FF8A80").opacity(0.16),
                              blue: Color(hex: "#FFDBC8"), blueBg: Color(hex: "#3D332C"), pill: M3.primary, onPill: M3.onPrimary,
                              tints: ["#1F3A2F", "#3A2F33", "#763300", "#31281F", "#5D4033", "#3D332C"].map { Color(hex: $0) })
        }
        return StockTheme(up: Color(hex: "#7BE3A0"), down: Color(hex: "#FF8A80"), upBg: Color(hex: "#7BE3A0").opacity(0.16), downBg: Color(hex: "#FF8A80").opacity(0.16),
                          blue: Color(hex: "#A9C3FF"), blueBg: Color(hex: "#8FB3FF").opacity(0.18), pill: .white, onPill: .black,
                          tints: [Color(hex: "#7BE3A0").opacity(0.22), Color(hex: "#BEAAFF").opacity(0.24), Color(hex: "#FFBE78").opacity(0.22),
                                  Color(hex: "#78BEF0").opacity(0.22), Color(hex: "#FF9682").opacity(0.22), Color.skinFg.opacity(0.12)])
    }
    func tint(_ i: Int) -> Color { tints[((i % tints.count) + tints.count) % tints.count] }
}

/// Område-graf med valgfri markør og verdi (dra over grafen).
struct AreaChart: View {
    let values: [Double]
    var color: Color = .white
    var marker = false
    var label: (Int) -> String = { _ in "" }
    @State private var at: Int?
    var body: some View {
        GeometryReader { g in
            let lo = values.min() ?? 0, hi = values.max() ?? 1
            let span = Swift.max(hi - lo, 0.0001)
            let pts: [CGPoint] = values.count > 1 ? values.enumerated().map { i, v in
                CGPoint(x: CGFloat(i) / CGFloat(values.count - 1) * g.size.width, y: g.size.height - 6 - CGFloat((v - lo) / span) * (g.size.height - 16))
            } : []
            ZStack(alignment: .topLeading) {
                if pts.count > 1 {
                    Path { p in p.move(to: CGPoint(x: 0, y: g.size.height)); pts.forEach { p.addLine(to: $0) }; p.addLine(to: CGPoint(x: g.size.width, y: g.size.height)); p.closeSubpath() }
                        .fill(LinearGradient(colors: [color.opacity(0.32), color.opacity(0)], startPoint: .top, endPoint: .bottom))
                    Path { p in p.addLines(pts) }.stroke(color, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                    if marker {
                        let i = at ?? (values.firstIndex(of: hi) ?? pts.count - 1)
                        let pt = pts[Swift.min(i, pts.count - 1)]
                        Path { p in p.move(to: CGPoint(x: pt.x, y: 0)); p.addLine(to: CGPoint(x: pt.x, y: g.size.height)) }
                            .stroke(Color.skinFg.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        Circle().fill(color).frame(width: 10, height: 10).overlay(Circle().stroke(.white, lineWidth: 2)).position(pt)
                        Text(label(i)).font(.caption.weight(.semibold)).foregroundStyle(.black).padding(.horizontal, 8).padding(.vertical, 4)
                            .background(.white, in: Capsule()).fixedSize()
                            .position(x: Swift.min(Swift.max(pt.x, 50), g.size.width - 50), y: Swift.max(pt.y - 22, 12))
                    }
                }
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                guard marker, values.count > 1 else { return }
                let i = Int((v.location.x / Swift.max(g.size.width, 1) * CGFloat(values.count - 1)).rounded())
                let n = Swift.min(Swift.max(i, 0), values.count - 1)
                if n != at { at = n; Haptics.shared.select() }
            }, including: marker ? .all : .subviews)
        }
    }
}

/// Aksjer: Portefølje, Aksjedetaljer og Transaksjoner (design/Aksjer Mobil.dc.html).
struct StocksMobileView: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var range = "1M"
    @State private var seg = "Alle"
    @State private var q = ""
    @State private var tseg = "Alle"

    var body: some View {
        let x = store.stocksX
        let th = StockTheme.current
        Group {
            if store.stockScreen == "det", let x, let i = x.positions.firstIndex(where: { $0.ticker == store.stockSel }) {
                detail(x, i, th)
            } else if store.stockScreen == "tx", let x {
                txList(x, th)
            } else {
                overview(x, th)
            }
        }
    }

    /* ---------- Portefølje ---------- */

    private func overview(_ x: StocksX?, _ th: StockTheme) -> some View {
        ScrollView {
            VStack(spacing: 14) {
                ModuleHeader(title: "Aksjer", trailing: {
                    Button { store.syncStocks() } label: {
                        Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.skinFg).frame(width: 44, height: 44).contentShape(Circle())
                    }
                    .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Synk nå")
                })
                if let x { statusLine(x, th) }
                if let e = store.moduleError { Empty(text: e) }
                if let x {
                    if !x.configured && !x.mock && x.positions.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Ikke koblet til Trading 212").fontWeight(.semibold)
                            Text("Legg inn API-nøkkel og secret i FinansHub på web under Innstillinger → Aksjer · Trading 212. Gi bare lesetilgang.").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.7))
                        }
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
                    }
                    valueCard(x, th)
                    segments(["Alle", "Aksjer", "ETF", "Kontanter"], $seg, th)
                    positions(x, th)
                } else if store.moduleError == nil { ProgressView().padding(30) }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .tracksScroll(store)
        .refreshable { await store.reloadModule() }
    }

    private func statusLine(_ x: StocksX, _ th: StockTheme) -> some View {
        let ok = x.error.isEmpty && (x.configured || x.mock)
        let when = x.syncedAt.map { JS.fmt($0, Calendar.current.isDateInToday($0) ? "HH:mm" : "dd.MM HH:mm") }
        let txt = ["Trading 212", x.error.isEmpty ? (x.mock ? "Demodata" : x.configured ? "Synkronisert" : "Ikke koblet til") : x.error, when].compactMap { $0 }.joined(separator: " · ")
        return Button { store.openSub(.settings); store.settingsPage = "stocks" } label: {
            HStack(spacing: 8) {
                Circle().fill(ok ? th.up : th.down).frame(width: 8, height: 8)
                Text(txt).font(.footnote).foregroundStyle(Color.skinFg.opacity(0.75)).lineLimit(1)
                Spacer(minLength: 6)
                Text("Innstillinger ›").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight)
            }
            .padding(.horizontal, 6).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func series(_ all: [Double]) -> [Double] {
        let n = ranges.first { $0.0 == range }?.2 ?? 31
        return Array(all.suffix(Swift.min(n, all.count)))
    }

    private func valueCard(_ x: StocksX, _ th: StockTheme) -> some View {
        let hist = series(x.history)
        let day = x.dayChange
        let base = x.value - day
        let rangeCh: Double? = range == "1D" && x.hasDay ? (base > 0 ? day / base * 100 : nil) : (hist.count > 1 && hist[0] > 0 ? (hist[hist.count - 1] - hist[0]) / hist[0] * 100 : nil)
        let label = ranges.first { $0.0 == range }?.1 ?? ""
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Verdi i dag").font(.subheadline).foregroundStyle(Color.skinFg.opacity(0.7))
                Spacer()
                Text(x.mock ? "Demo" : x.env.lowercased() == "demo" ? "Demo" : "Live").font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 3).background(Color.skinFg.opacity(0.12), in: Capsule())
            }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(krs(x.total)).font(.system(size: 34, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                if let c = rangeCh {
                    Text("\(chg(c)) \(range == "1D" ? "i dag" : label.lowercased())").font(.caption.weight(.semibold)).foregroundStyle(c < 0 ? th.down : th.up)
                        .padding(.horizontal, 8).padding(.vertical, 4).background(c < 0 ? th.downBg : th.upBg, in: Capsule())
                }
            }
            if hist.count > 1 {
                AreaChart(values: hist, color: (hist.last ?? 0) >= (hist.first ?? 0) ? th.up : th.down).frame(height: 130)
            }
            rangePicker(th)
            HStack(spacing: 16) {
                mini("Avkastning", "\(x.result < 0 ? "−" : "+")\(krs(abs(x.result)))", x.result < 0 ? th.down : th.up)
                mini("Investert", krs(x.invested), .white)
                mini("Kontanter", krs(x.cash), .white)
            }
        }
        .padding(18).glass(28)
    }

    private func mini(_ l: String, _ v: String, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(l).font(.caption2).foregroundStyle(Color.skinFg.opacity(0.6))
            Text(v).font(.footnote.weight(.semibold)).foregroundStyle(c).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func rangePicker(_ th: StockTheme) -> some View {
        HStack(spacing: 4) {
            ForEach(ranges, id: \.0) { k, _, _ in
                Button { Haptics.shared.select(); range = k } label: {
                    Text(k).font(.footnote.weight(.semibold)).foregroundStyle(range == k ? Color.white : Color.skinFg.opacity(0.6))
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(range == k ? Color.skinFg.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 10))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3).background(Color.skinFg.opacity(0.06), in: RoundedRectangle(cornerRadius: 13))
    }

    private func segments(_ list: [String], _ sel: Binding<String>, _ th: StockTheme) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(list, id: \.self) { n in
                    let on = sel.wrappedValue == n
                    Button { Haptics.shared.select(); sel.wrappedValue = n } label: {
                        Text(n).font(.subheadline.weight(.semibold)).foregroundStyle(on ? th.onPill : Color.skinFg).padding(.horizontal, 16).frame(height: 36)
                            .background(on ? th.pill : .clear, in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.clear : Color.skinFg.opacity(0.18), lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private func positions(_ x: StocksX, _ th: StockTheme) -> some View {
        let vis = seg == "Kontanter" ? [] : x.positions.filter { seg == "Alle" || (seg == "ETF") == $0.etf }
        let idx = Dictionary(x.positions.enumerated().map { ($1.ticker, $0) }, uniquingKeysWith: { a, _ in a })
        if !vis.isEmpty {
            HStack { Text("Største posisjoner").font(.headline); Spacer(); Text("\(x.positions.count) totalt").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }
                .padding(.horizontal, 4)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(vis.sorted { $0.value > $1.value }.prefix(3)) { p in topCard(p, th.tint(idx[p.ticker] ?? 0), th) }
                }
                .padding(.vertical, 2)
            }
            HStack {
                Text("Alle posisjoner").font(.headline)
                Spacer()
                Button { Haptics.shared.select(); store.stockScreen = "tx" } label: { Text("Transaksjoner ›").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight) }.buttonStyle(.plain)
            }
            .padding(.horizontal, 4).padding(.top, 4)
            VStack(spacing: 0) {
                ForEach(Array(vis.enumerated()), id: \.element.id) { i, p in
                    if i > 0 { Divider().overlay(Color.skinFg.opacity(0.1)) }
                    Button { open(p) } label: { row(p, th.tint(idx[p.ticker] ?? 0), th) }.buttonStyle(.plain)
                }
            }
            .glass(24)
        } else if seg != "Kontanter" && x.positions.isEmpty {
            Empty(text: "Ingen posisjoner ennå.")
        }
        if seg == "Alle" || seg == "Kontanter" {
            HStack {
                Image(systemName: "banknote").foregroundStyle(Color.accentLight).frame(width: 40, height: 40).background(Color.skinFg.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                Text("Kontanter").fontWeight(.medium)
                Spacer()
                Text(krs(x.cash)).font(.system(.body, design: .monospaced).weight(.semibold))
            }
            .padding(14).glass(22)
        }
        if seg == "Kontanter" || vis.isEmpty {
            Button { store.stockScreen = "tx" } label: { Text("Transaksjoner ›").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight) }.buttonStyle(.plain)
        }
        Text("Kjøp og Selg åpner ordren i Trading 212. Tallene synkes fra API-et. Nøkkel og miljø endres i Innstillinger.")
            .font(.caption).foregroundStyle(Color.skinFg.opacity(0.55)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
    }

    private func open(_ p: StockPos) {
        Haptics.shared.select()
        store.stockSel = p.ticker
        store.stockFrom = store.stockScreen == "tx" ? "tx" : nil
        store.stockScreen = "det"
    }

    private func tickerBadge(_ ini: String, _ tint: Color, _ size: CGFloat = 40) -> some View {
        Text(ini).font(.system(size: size * 0.34, weight: .bold)).foregroundStyle(Color.skinFg).frame(width: size, height: size)
            .background(tint, in: RoundedRectangle(cornerRadius: size * 0.3)).overlay(RoundedRectangle(cornerRadius: size * 0.3).stroke(Color.skinFg.opacity(0.12), lineWidth: 1))
    }

    private func changePill(_ v: Double?, _ th: StockTheme) -> some View {
        let c = v ?? 0
        return Text(v.map(chg) ?? "–").font(.caption.weight(.semibold)).foregroundStyle(v == nil ? .white.opacity(0.6) : c < 0 ? th.down : th.up)
            .padding(.horizontal, 7).padding(.vertical, 3).background(v == nil ? Color.skinFg.opacity(0.08) : c < 0 ? th.downBg : th.upBg, in: Capsule())
    }

    private func topCard(_ p: StockPos, _ tint: Color, _ th: StockTheme) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { open(p) } label: {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        tickerBadge(p.ini, Color.black.opacity(0.25), 36)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(p.symbol).font(.subheadline.weight(.bold)).lineLimit(1)
                            Text(p.name).font(.caption).foregroundStyle(Color.skinFg.opacity(0.7)).lineLimit(1)
                        }
                    }
                    Text(krs(p.value)).font(.title3.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                    HStack { Text("\(qtyText(p.qty)) stk").font(.caption).foregroundStyle(Color.skinFg.opacity(0.7)); Spacer(); changePill(p.dayPct ?? p.plPct, th) }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            HStack(spacing: 8) {
                tradeButton("Kjøp", p, buy: true, th)
                tradeButton("Selg", p, buy: false, th)
            }
        }
        .foregroundStyle(Color.skinFg)
        .padding(14).frame(width: 200, alignment: .leading)
        .background(tint, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.skinFg.opacity(0.1), lineWidth: 1))
    }

    private func tradeButton(_ t: String, _ p: StockPos, buy: Bool, _ th: StockTheme, big: Bool = false) -> some View {
        Button { trade(p, buy: buy) } label: {
            Text(t).font((big ? Font.body : Font.footnote).weight(.bold)).foregroundStyle(buy ? th.onPill : Color.skinFg)
                .frame(maxWidth: .infinity, minHeight: big ? 50 : 34)
                .background(buy ? th.pill : Color.black.opacity(0.25), in: Capsule())
                .overlay(Capsule().stroke(buy ? Color.clear : Color.skinFg.opacity(0.25), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Åpner Trading 212-appen (deep link), ellers nettsiden. Ordre-API brukes ikke.
    private func trade(_ p: StockPos, buy: Bool) {
        Haptics.shared.tap()
        store.flash("Åpner \(buy ? "kjøp" : "salg") av \(p.symbol) i Trading 212")
        guard let app = URL(string: "trading212://"), let web = URL(string: "https://app.trading212.com/") else { return }
        openURL(app) { ok in if !ok { openURL(web) } }
    }

    private func row(_ p: StockPos, _ tint: Color, _ th: StockTheme) -> some View {
        HStack(spacing: 12) {
            tickerBadge(p.ini, tint)
            VStack(alignment: .leading, spacing: 1) {
                Text(p.symbol).fontWeight(.semibold).lineLimit(1)
                Text(p.name).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(1)
            }
            Spacer(minLength: 6)
            if p.series.count > 1 {
                AreaChart(values: Array(p.series.suffix(18)), color: (p.series.last ?? 0) >= (p.series.first ?? 0) ? th.up : th.down).frame(width: 64, height: 28)
            }
            VStack(alignment: .trailing, spacing: 3) {
                Text(krs(p.value)).font(.subheadline.weight(.semibold)).monospacedDigit().lineLimit(1)
                changePill(p.dayPct ?? p.plPct, th)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11).contentShape(Rectangle())
    }

    /* ---------- Aksjedetaljer ---------- */

    private func detail(_ x: StocksX, _ i: Int, _ th: StockTheme) -> some View {
        let p = x.positions[i]
        let s = series(p.series)
        let ch = s.count > 1 && s[0] > 0 ? (s[s.count - 1] - s[0]) / s[0] * 100 : (range == "1D" ? p.dayPct : p.plPct)
        let tx = x.txns.filter { $0.ticker == p.ticker || $0.symbol == p.symbol }
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ModuleHeader(title: "Aksjedetaljer", back: { store.back() })
                HStack(spacing: 12) {
                    tickerBadge(p.ini, th.tint(i), 48)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(p.symbol).font(.headline)
                        Text(p.name).font(.footnote).foregroundStyle(Color.skinFg.opacity(0.65)).lineLimit(1)
                    }
                    Spacer()
                    Text(ranges.first { $0.0 == range }?.1 ?? "").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                }
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(n2(p.price)) kr").font(.system(size: 32, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                    changePill(ch, th)
                }
                VStack(spacing: 10) {
                    if s.count > 1 {
                        AreaChart(values: s, color: (s.last ?? 0) >= (s.first ?? 0) ? th.up : th.down, marker: true, label: { "\(n2(s[$0])) kr" }).frame(height: 170)
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            BarLine(label: "Snittkurs \(n2(p.avg)) → kurs nå \(n2(p.price))", value: chg(p.plPct), fraction: p.avg > 0 ? Swift.min(1, p.price / (p.avg * 2)) : 0, color: p.plPct < 0 ? th.down : th.up)
                            Text("Kursgraf vises når serveren sender kurshistorikk for aksjen.").font(.caption).foregroundStyle(Color.skinFg.opacity(0.5))
                        }
                    }
                    rangePicker(th)
                }
                .padding(16).glass(26)
                Text("Min posisjon").font(.headline).padding(.horizontal, 4)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    Kpi(label: "Antall", value: "\(qtyText(p.qty)) stk")
                    Kpi(label: "Verdi", value: krs(p.value))
                    Kpi(label: "Snittkurs", value: "\(n2(p.avg)) kr")
                    Kpi(label: "Avkastning", value: "\(chg(p.plPct))", tint: p.plPct < 0 ? th.down : th.up)
                }
                Text("Handler i \(p.symbol)").font(.headline).padding(.horizontal, 4)
                VStack(spacing: 0) {
                    if tx.isEmpty { Text("Ingen handler ennå.").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading).padding(16) }
                    ForEach(Array(tx.enumerated()), id: \.element.id) { j, t in
                        if j > 0 { Divider().overlay(Color.skinFg.opacity(0.1)) }
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(t.kind + (t.qty > 0 ? " · \(qtyText(t.qty)) stk" : "")).fontWeight(.medium)
                                Text(ddmmyyyy(t.date) + (t.time.isEmpty ? "" : " kl. \(t.time)")).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                            }
                            Spacer()
                            Text(krs(t.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                }
                .glass(24)
            }
            .padding(.horizontal, 18).padding(.bottom, 130)
        }
        .tracksScroll(store)
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 10) {
                tradeButton("Selg", p, buy: false, th, big: true)
                tradeButton("Kjøp", p, buy: true, th, big: true)
            }
            .padding(10).glass(30).padding(.horizontal, 18).padding(.bottom, 6)
        }
    }

    /* ---------- Transaksjoner ---------- */

    private func txList(_ x: StocksX, _ th: StockTheme) -> some View {
        let ql = q.trimmingCharacters(in: .whitespaces).lowercased()
        let names = Dictionary(x.positions.map { ($0.ticker, $0.name) }, uniquingKeysWith: { a, _ in a })
        let idx = Dictionary(x.positions.enumerated().map { ($1.ticker, $0) }, uniquingKeysWith: { a, _ in a })
        let list = x.txns.filter { t in
            (tseg == "Alle" || t.kind == tseg) && (ql.isEmpty || "\(t.symbol) \(names[t.ticker] ?? "") \(t.kind)".lowercased().contains(ql))
        }
        let days = list.reduce(into: [String]()) { a, t in if !a.contains(t.date) { a.append(t.date) } }
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ModuleHeader(title: "Transaksjoner", back: { store.back() })
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.skinFg.opacity(0.6))
                    TextField("Søk i ticker, navn eller type", text: $q).textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                .padding(.horizontal, 16).frame(height: 48).glass(24)
                segments(["Alle", "Kjøp", "Salg", "Utbytte"], $tseg, th)
                if list.isEmpty { Empty(text: "Ingen transaksjoner passer.") }
                ForEach(days, id: \.self) { d in
                    Text(dayName(d)).font(.footnote.weight(.semibold)).foregroundStyle(Color.skinFg.opacity(0.6)).padding(.horizontal, 6).padding(.top, 4)
                    VStack(spacing: 0) {
                        ForEach(Array(list.filter { $0.date == d }.enumerated()), id: \.element.id) { j, t in
                            if j > 0 { Divider().overlay(Color.skinFg.opacity(0.1)) }
                            txRow(t, names[t.ticker] ?? "", th.tint(idx[t.ticker] ?? 5), th)
                        }
                    }
                    .glass(24)
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .tracksScroll(store)
    }

    private func dayName(_ d: String) -> String {
        guard let date = parseDay(d) else { return d.isEmpty ? "Uten dato" : d }
        if Calendar.current.isDateInToday(date) { return "I dag" }
        if Calendar.current.isDateInYesterday(date) { return "I går" }
        return ddmmyyyy(d)
    }

    private func txRow(_ t: StockTxn, _ name: String, _ tint: Color, _ th: StockTheme) -> some View {
        let (bg, fg): (Color, Color) = t.status == "Utført" ? (th.upBg, th.up) : t.status == "Venter" ? (th.blueBg, th.blue) : (th.downBg, th.down)
        let pos = store.stocksX?.positions.first { $0.ticker == t.ticker }
        return Button { if let pos { open(pos) } } label: {
            HStack(spacing: 12) {
                tickerBadge(String(t.symbol.prefix(2)).uppercased(), tint)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(t.symbol).fontWeight(.semibold).lineLimit(1)
                        Text(t.status).font(.caption2.weight(.semibold)).foregroundStyle(fg).padding(.horizontal, 6).padding(.vertical, 2).background(bg, in: Capsule())
                    }
                    Text([name, t.kind + (t.qty > 0 ? " · \(qtyText(t.qty)) stk" : "")].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(1)
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 2) {
                    Text((t.kind == "Kjøp" ? "−" : "+") + krs(t.amount)).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(t.kind == "Kjøp" ? Color.skinFg : th.up)
                    if !t.time.isEmpty { Text(t.time).font(.caption2).foregroundStyle(Color.skinFg.opacity(0.5)) }
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 11).contentShape(Rectangle())
        }
        .buttonStyle(.plain).disabled(pos == nil)
    }
}

private func qtyText(_ q: Double) -> String {
    if q == q.rounded(), abs(q) < 1e12 { return String(Int(q)) }
    return String(format: "%.4f", q).replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression).replacingOccurrences(of: ".", with: ",")
}
