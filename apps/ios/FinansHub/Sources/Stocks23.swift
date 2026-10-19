import SwiftUI

/* ---------------- Prompt 23: Aksjer i Papir, nøyaktig etter design/Aksjer Mobil.dc.html (tema «papir», uten topp) ---------------- */

private func s23kr(_ v: Double) -> String { n0(v) + " kr" }
private func s23kr2(_ v: Double) -> String { n2(v) + " kr" }
private func s23signed(_ v: Double) -> String { (v < 0 ? "−" : "+") + n2(abs(v)) }
private func s23pct(_ v: Double) -> String {
    (v < 0 ? "−" : "+") + String(format: "%.2f", abs(v)).replacingOccurrences(of: ".", with: ",") + " %"
}
private func s23qty(_ q: Double) -> String {
    q == q.rounded() ? String(Int(q)) : String(format: "%.2f", q).replacingOccurrences(of: ".", with: ",").replacingOccurrences(of: #",?0+$"#, with: "", options: .regularExpression)
}

/// Fargene i Papir-temaet til Aksjer Mobil.
struct Stocks23Theme {
    let p: PaperPalette
    static let cols: [String] = ["#5FD3A8", "#9FE3C6", "#7AA7FF", "#B79CFF", "#FFB08A", "#F2C14E"]
    var up: Color { p.pos }
    var dn: Color { p.lab }
    var upBg: Color { p.pos.opacity(0.14) }
    var dnBg: Color { p.lab.opacity(0.12) }
    var deco: Color { Color.gray.opacity(0.1) }
    func col(_ i: Int) -> Color { Color(hex: Stocks23Theme.cols[((i % 6) + 6) % 6]) }
    /// color-mix(farge 30 %, kort)
    func tint(_ i: Int) -> some View {
        ZStack { p.card; col(i).opacity(0.3) }
    }
}

private let s23ranges: [(String, Int)] = [("1D", 2), ("1U", 7), ("1M", 31), ("3M", 92), ("1Å", 366), ("Alt", Int.max)]

struct Stocks23Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var range: String = "1D"
    @State private var seg: String = "Alle"
    @State private var sel: StockPos? = nil
    @State private var showTx: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let x = store.stocksX {
                content(x)
            } else {
                PCard { HStack { ProgressView(); Text("Henter aksjene …").font(PF.ui(13.5)).foregroundStyle(p.mut) } }
            }
        }
        .padding(.horizontal, 10)
        .task { if store.stocksX == nil { await store.loadStocksQuiet() } }
        .sheet(item: $sel) { s in
            PaperStockDetail(pos: s).environment(\.paper, p).presentationDetents([.medium, .large]).sheetEdge30(p.bg)
        }
        .sheet(isPresented: $showTx) {
            Stocks23TxSheet(txns: store.stocksX?.txns ?? []).environment(\.paper, p).presentationDetents([.large]).sheetEdge30(p.bg)
        }
    }

    @ViewBuilder private func content(_ x: StocksX) -> some View {
        let sorted: [StockPos] = x.positions.sorted { $0.value > $1.value }
        let vis: [StockPos] = seg == "Kontanter" ? [] : sorted.filter { seg == "Alle" || (seg == "ETF" ? $0.etf : !$0.etf) }
        Stocks23ValueCard(x: x, range: $range)
        Stocks23SyncLine(x: x)
        Stocks23Kpis(x: x)
        Stocks23Segments(seg: $seg)
        Stocks23Head(title: "Største posisjoner", trailing: "\(x.positions.count) totalt", action: nil)
        if !vis.isEmpty {
            Stocks23TopCarousel(list: Array(vis.prefix(3)), order: sorted, open: { sel = $0 })
        }
        Stocks23Head(title: "Alle posisjoner", trailing: "Transaksjoner ›", action: { showTx = true })
        VStack(spacing: 8) {
            ForEach(vis) { s in
                Button { Haptics.shared.tap(); sel = s } label: { Stocks23PosRow(s: s, i: sorted.firstIndex(of: s) ?? 0) }.buttonStyle(.plain)
            }
        }
        if seg == "Alle" || seg == "Kontanter" { Stocks23Cash(cash: x.cash) }
        if !sorted.isEmpty { Stocks23Alloc(list: sorted) }
        Stocks23Dividends(x: x, order: sorted)
        Stocks23Orders(x: x, all: { showTx = true })
        Text("Kjøp og Selg åpner ordren i Trading 212. Tallene synkes fra API-et. Nøkkel og miljø endres i Innstillinger.")
            .font(PF.ui(12.5)).foregroundStyle(p.mut).lineSpacing(3).padding(.horizontal, 4).fixedSize(horizontal: false, vertical: true)
    }
}

/// «Største posisjoner» / «Alle posisjoner» med tekst eller knapp til høyre.
struct Stocks23Head: View {
    @Environment(\.paper) private var p
    let title: String
    let trailing: String
    let action: (() -> Void)?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(PF.ui(18, .semibold)).foregroundStyle(p.ink)
            Spacer()
            if let action {
                Button { Haptics.shared.tap(); action() } label: { Text(trailing).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink) }.buttonStyle(.plain)
            } else {
                Text(trailing).font(PF.ui(13)).foregroundStyle(p.mut)
            }
        }
    }
}

/// Verdikortet: Live-merke, verdi, dagsendring, graf og periodevelger.
struct Stocks23ValueCard: View {
    @Environment(\.paper) private var p
    let x: StocksX
    @Binding var range: String

    var body: some View {
        let t = Stocks23Theme(p: p)
        let n: Int = s23ranges.first { $0.0 == range }?.1 ?? 2
        let hist: [Double] = Array(x.history.suffix(Swift.min(n, x.history.count)))
        let dayPct: Double = x.value > 0 ? x.dayChange / Swift.max(x.value - x.dayChange, 1) * 100 : 0
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Verdi i dag").font(PF.ui(13.5)).foregroundStyle(p.mut)
                Spacer()
                Text(x.mock || x.env.lowercased() == "demo" ? "Demo" : "Live").font(PF.ui(12, .semibold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 10).padding(.vertical, 4).background(p.ink, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(s23kr(x.total)).font(PF.mono(34)).tracking(-1).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(s23pct(dayPct) + " i dag").font(PF.ui(12.5, .semibold)).foregroundStyle(dayPct < 0 ? t.dn : t.up)
                    .padding(.horizontal, 9).padding(.vertical, 4).background(dayPct < 0 ? t.dnBg : t.upBg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            if hist.count > 1 {
                AreaChart(values: hist, color: t.up).frame(height: 130)
            } else {
                Color.clear.frame(height: 130)
            }
            Stocks23RangePicker(range: $range)
        }
        .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}

struct Stocks23RangePicker: View {
    @Environment(\.paper) private var p
    @Binding var range: String
    var body: some View {
        HStack(spacing: 4) {
            ForEach(s23ranges, id: \.0) { r in
                let on: Bool = range == r.0
                Button { Haptics.shared.select(); range = r.0 } label: {
                    Text(r.0).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.ink : p.mut)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(on ? p.card : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .shadow(color: .black.opacity(on ? 0.1 : 0), radius: 1.5, y: 1)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// «Live-konto · synket i dag kl. 16:20 · lesetilgang» og «↻ 16:20».
struct Stocks23SyncLine: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let x: StocksX

    var body: some View {
        let when: String = x.syncedAt.map { JS.fmt($0, "HH:mm") } ?? "–"
        let demo: Bool = x.mock || x.env.lowercased() == "demo"
        let linked: Bool = x.configured || x.mock
        let account: String = demo ? "Demo-konto (paper trading)" : "Live-konto"
        let okTxt: String = linked ? account + " · synket i dag kl. " + when + " · lesetilgang" : "Ikke koblet til Trading 212 · trykk for å legge inn nøkkel"
        let txt: String = x.error.isEmpty ? okTxt : x.error
        Button { Haptics.shared.tap(); store.paperGo("innst-aksjer") } label: {
            HStack(spacing: 10) {
                Circle().fill(x.error.isEmpty && (x.configured || x.mock) ? p.pos : p.lab).frame(width: 9, height: 9)
                Text(txt).font(PF.ui(13)).foregroundStyle(p.mut).lineSpacing(2).frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                Button { store.syncStocks() } label: { Text("↻ \(when)").font(PF.ui(13, .semibold)).foregroundStyle(p.ink) }.buttonStyle(.plain)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// 2×2 nøkkelkort: Porteføljeverdi, Avkastning totalt, I dag og Ledig kontanter.
struct Stocks23Kpis: View {
    @Environment(\.paper) private var p
    let x: StocksX

    var body: some View {
        let t = Stocks23Theme(p: p)
        let plPct: Double = x.invested > 0 ? x.result / x.invested * 100 : 0
        let dayPct: Double = x.value > 0 ? x.dayChange / x.value * 100 : 0
        let k: [(String, String, String, Color)] = [
            ("Porteføljeverdi", s23kr2(x.total), "Investert \(s23kr(x.value)) + kontanter", p.ink),
            ("Avkastning totalt", s23signed(x.result) + " kr", s23pct(plPct) + " på " + s23kr(x.invested), x.result < 0 ? t.dn : t.up),
            ("I dag", s23signed(x.dayChange) + " kr", s23pct(dayPct), x.dayChange < 0 ? t.dn : t.up),
            ("Ledig kontanter", s23kr2(x.cash), "Klar til investering", p.ink),
        ]
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(k, id: \.0) { f in
                VStack(alignment: .leading, spacing: 4) {
                    Text(f.0).font(PF.ui(12.5)).foregroundStyle(p.mut)
                    Text(f.1).font(PF.mono(15)).tracking(-0.3).foregroundStyle(f.3).fixedSize(horizontal: false, vertical: true)
                    Text(f.2).font(PF.ui(11.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
    }
}

/// Filter-pillene Alle · Aksjer · ETF · Kontanter.
struct Stocks23Segments: View {
    @Environment(\.paper) private var p
    @Binding var seg: String
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(["Alle", "Aksjer", "ETF", "Kontanter"], id: \.self) { n in
                    let on: Bool = seg == n
                    Button { Haptics.shared.select(); seg = n } label: {
                        Text(n).font(PF.ui(14, .medium)).foregroundStyle(on ? p.bg : p.ink).padding(.horizontal, 18).frame(height: 40)
                            .background(on ? p.ink : p.card, in: Capsule())
                            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.horizontal, -16)
    }
}

/// «Største posisjoner»: vannrett karusell med fargede kort og Kjøp/Selg.
struct Stocks23TopCarousel: View {
    let list: [StockPos]
    let order: [StockPos]
    let open: (StockPos) -> Void
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(list) { s in Stocks23TopCard(s: s, i: order.firstIndex(of: s) ?? 0, open: { open(s) }) }
            }
            .padding(.horizontal, 16).padding(.bottom, 4)
        }
        .padding(.horizontal, -16)
    }
}

struct Stocks23TopCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let s: StockPos
    let i: Int
    let open: () -> Void

    var body: some View {
        let t = Stocks23Theme(p: p)
        let d: Double = s.dayPct ?? s.plPct
        VStack(alignment: .leading, spacing: 10) {
            Button { Haptics.shared.tap(); open() } label: {
                HStack(spacing: 10) {
                    Text(s.ini).font(PF.ui(13, .bold)).foregroundStyle(p.ink).frame(width: 36, height: 36).background(p.card, in: Circle())
                    VStack(alignment: .leading, spacing: 0) {
                        Text(s.symbol).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Text(s.name).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                    }
                }
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 4) {
                Text(s23kr(s.value)).font(PF.mono(20)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.7)
                HStack(spacing: 6) {
                    Text(s23qty(s.qty) + " stk").font(PF.ui(12)).foregroundStyle(p.mut)
                    Text(s23pct(d)).font(PF.ui(12, .semibold)).foregroundStyle(d < 0 ? t.dn : t.up)
                        .padding(.horizontal, 7).padding(.vertical, 2).background(p.bg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            HStack(spacing: 8) {
                Button { trade("kjøp") } label: {
                    Text("Kjøp").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 36)
                        .overlay(Capsule().stroke(p.ink, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                Button { trade("salg") } label: {
                    Text("Selg").font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 36)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(width: 200, alignment: .leading)
        .background(alignment: .topTrailing) {
            ZStack(alignment: .topTrailing) {
                t.tint(i)
                Circle().fill(t.deco).frame(width: 90, height: 90).offset(x: 26, y: -26)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    /// Kjøp og Selg åpner Trading 212.
    private func trade(_ what: String) {
        Haptics.shared.tap()
        store.flash("Åpner \(what) av \(s.symbol) i Trading 212")
        store.openURL(URL(string: "https://app.trading212.com/"))
    }
}

/// En rad i «Alle posisjoner» med sparkline og prosent-chip.
struct Stocks23PosRow: View {
    @Environment(\.paper) private var p
    let s: StockPos
    let i: Int

    var body: some View {
        let t = Stocks23Theme(p: p)
        let d: Double = s.dayPct ?? s.plPct
        HStack(spacing: 12) {
            Text(s.ini).font(PF.ui(13, .bold)).foregroundStyle(p.ink).frame(width: 40, height: 40).background(t.tint(i)).clipShape(Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(s.symbol).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Text(s.name).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Stocks23Spark(values: s.series, color: d < 0 ? t.dn : t.up).frame(width: 64, height: 26)
            VStack(alignment: .trailing, spacing: 3) {
                Text(s23kr(s.value)).font(PF.mono(14.5)).foregroundStyle(p.ink).lineLimit(1)
                Text(s23pct(d)).font(PF.ui(11.5, .semibold)).foregroundStyle(d < 0 ? t.dn : t.up)
                    .padding(.horizontal, 7).padding(.vertical, 2).background(d < 0 ? t.dnBg : t.upBg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Liten kurslinje (80 × 30 i designet, vist som 64 × 26).
struct Stocks23Spark: View {
    let values: [Double]
    let color: Color
    var body: some View {
        GeometryReader { g in
            let v: [Double] = Array(values.suffix(30))
            let lo: Double = v.min() ?? 0
            let hi: Double = v.max() ?? 1
            let span: Double = Swift.max(hi - lo, 0.0001)
            Path { path in
                guard v.count > 1 else { return }
                for (i, y) in v.enumerated() {
                    let pt = CGPoint(x: CGFloat(i) / CGFloat(v.count - 1) * g.size.width,
                                     y: g.size.height - 2 - CGFloat((y - lo) / span) * (g.size.height - 4))
                    if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
        }
    }
}

struct Stocks23Cash: View {
    @Environment(\.paper) private var p
    let cash: Double
    var body: some View {
        HStack {
            Text("Kontanter").font(PF.ui(14)).foregroundStyle(p.mut)
            Spacer()
            Text(s23kr(cash)).font(PF.mono(15)).foregroundStyle(p.ink)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Fordeling: stolpe og forklaring i to kolonner.
struct Stocks23Alloc: View {
    @Environment(\.paper) private var p
    let list: [StockPos]

    var body: some View {
        let t = Stocks23Theme(p: p)
        let sum: Double = Swift.max(list.reduce(0) { $0 + $1.value }, 0.0001)
        VStack(alignment: .leading, spacing: 18) {
            Text("Fordeling").font(PF.ui(18, .semibold)).foregroundStyle(p.ink)
            VStack(alignment: .leading, spacing: 12) {
                GeometryReader { g in
                    let gaps: CGFloat = CGFloat(Swift.max(list.count - 1, 0)) * 2
                    HStack(spacing: 2) {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                            Rectangle().fill(t.col(i)).frame(width: Swift.max(3, (g.size.width - gaps) * CGFloat(s.value / sum)))
                        }
                    }
                }
                .frame(height: 14)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], alignment: .leading, spacing: 8) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(t.col(i)).frame(width: 10, height: 10)
                            Text(s.symbol).font(PF.ui(13)).foregroundStyle(p.ink).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                            Text(String(format: "%.1f", s.value / sum * 100).replacingOccurrences(of: ".", with: ",") + " %").font(PF.mono(12.5)).foregroundStyle(p.ink)
                        }
                    }
                }
            }
            .padding(16)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

/// Utbytte i år.
struct Stocks23Dividends: View {
    @Environment(\.paper) private var p
    let x: StocksX
    let order: [StockPos]

    var body: some View {
        let t = Stocks23Theme(p: p)
        let year: String = JS.fmt(Date(), "yyyy")
        let divs: [StockTxn] = x.txns.filter { $0.kind == "Utbytte" }
        let sum: Double = divs.filter { $0.date.hasPrefix(year) }.reduce(0) { $0 + $1.amount }
        if !divs.isEmpty {
            VStack(alignment: .leading, spacing: 18) {
                Stocks23Head(title: "Utbytte", trailing: s23kr2(sum) + " i år", action: nil)
                VStack(spacing: 0) {
                    ForEach(Array(divs.prefix(5).enumerated()), id: \.element.id) { i, d in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        HStack(spacing: 12) {
                            Text(String(d.symbol.prefix(2)).uppercased()).font(PF.ui(11.5, .bold)).foregroundStyle(p.ink)
                                .frame(width: 34, height: 34).background(t.tint(order.firstIndex { $0.ticker == d.ticker } ?? 0)).clipShape(Circle())
                            VStack(alignment: .leading, spacing: 1) {
                                Text(d.symbol).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                                Text(ddmmyyyy(d.date)).font(PF.ui(12)).foregroundStyle(p.mut)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text("+" + s23kr2(d.amount)).font(PF.mono(14)).foregroundStyle(t.up)
                        }
                        .padding(.vertical, 11)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 4)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }
}

/// Siste ordre med «Alle ›».
struct Stocks23Orders: View {
    @Environment(\.paper) private var p
    let x: StocksX
    let all: () -> Void

    var body: some View {
        let orders: [StockTxn] = x.txns.filter { $0.kind != "Utbytte" }
        if !orders.isEmpty {
            VStack(alignment: .leading, spacing: 18) {
                Stocks23Head(title: "Siste ordre", trailing: "Alle ›", action: all)
                VStack(spacing: 0) {
                    ForEach(Array(orders.prefix(4).enumerated()), id: \.element.id) { i, o in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        Stocks23OrderRow(o: o)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 4)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }
}

struct Stocks23OrderRow: View {
    @Environment(\.paper) private var p
    let o: StockTxn
    var body: some View {
        let t = Stocks23Theme(p: p)
        let buy: Bool = o.kind != "Salg"
        HStack(spacing: 12) {
            Text(o.kind).font(PF.ui(12, .bold)).foregroundStyle(o.kind == "Utbytte" || buy ? t.up : t.dn)
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(o.kind == "Utbytte" || buy ? t.upBg : t.dnBg, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(o.qty > 0 ? "\(o.symbol) · \(s23qty(o.qty)) stk" : o.symbol).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Text([ddmmyyyy(o.date), o.time, o.status].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(s23kr2(o.amount)).font(PF.mono(14)).foregroundStyle(p.ink)
        }
        .padding(.vertical, 11)
    }
}

/// «Transaksjoner ›»: alle ordre og utbytter.
struct Stocks23TxSheet: View {
    @Environment(\.paper) private var p
    let txns: [StockTxn]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Transaksjoner").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                if txns.isEmpty {
                    Text("Ingen handler ennå.").font(PF.ui(14)).foregroundStyle(p.mut)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(txns.enumerated()), id: \.element.id) { i, o in
                            if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                            Stocks23OrderRow(o: o)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 4)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
            .padding(18)
        }
        .background(p.bg.ignoresSafeArea())
    }
}
