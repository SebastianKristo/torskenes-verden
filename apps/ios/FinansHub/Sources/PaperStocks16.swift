import SwiftUI

/* ---------------- Papir: Aksjer (Finans → Mer → Aksjer), full mobilversjon av aksjedelen på web ---------------- */

private func skr(_ v: Double) -> String { "\(neg0(v)) kr" }
private func spct(_ v: Double) -> String { "\(v < 0 ? "−" : "+")\(pct(abs(v)))" }

private let stockRanges: [(String, String, Int)] = [("1D", "I dag", 2), ("1U", "1 uke", 7), ("1M", "1 måned", 31), ("3M", "3 måneder", 92), ("1Å", "1 år", 366), ("Alt", "Alt", Int.max)]

/// Verdikortet ligger delvis oppe i toppbildet (som på Sporing). Ingen «Portefølje»-tittel eller tannhjul:
/// innstillingene for Trading 212 ligger under Innstillinger → Aksjer · Trading 212.
struct PaperStocks: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var range = "1M"
    @State private var seg = "Alle"
    @State private var sel: StockPos?

    var body: some View {
        VStack(spacing: 10) {
            if let x = store.stocksX {
                valueCard(x)
                if !x.configured && !x.mock && x.positions.isEmpty { notLinked }
                keyFigures(x)
                segments
                positions(x)
                orders(x)
                syncLine(x)
            } else {
                PCard { HStack { ProgressView(); Text("Henter aksjene …").font(PF.ui(13.5)).foregroundStyle(p.mut) } }
            }
        }
        .task { if store.stocksX == nil { await store.loadStocksQuiet() } }
        .sheet(item: $sel) { s in
            PaperStockDetail(pos: s).environment(\.paper, p).presentationDetents([.medium, .large]).presentationBackground(p.bg)
        }
    }

    private func series(_ all: [Double]) -> [Double] {
        let n = stockRanges.first { $0.0 == range }?.2 ?? 31
        return Array(all.suffix(Swift.min(n, all.count)))
    }

    private func rangeChange(_ x: StocksX, _ hist: [Double]) -> Double? {
        if range == "1D" && x.hasDay {
            let base = x.value - x.dayChange
            return base > 0 ? x.dayChange / base * 100 : nil
        }
        guard hist.count > 1, hist[0] > 0 else { return nil }
        return (hist[hist.count - 1] - hist[0]) / hist[0] * 100
    }

    private func valueCard(_ x: StocksX) -> some View {
        let hist = series(x.history)
        let ch = rangeChange(x, hist)
        let up = (hist.last ?? 0) >= (hist.first ?? 0)
        let label = stockRanges.first { $0.0 == range }?.1.lowercased() ?? ""
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                PLabel(text: "Verdi i dag", color: p.mut)
                Spacer()
                Text(x.mock || x.env.lowercased() == "demo" ? "Demo" : "Live").font(PF.mono(10)).foregroundStyle(p.mut)
                    .padding(.horizontal, 8).padding(.vertical, 3).overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            Text(skr(x.total)).font(PF.serif(38, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
            if let c = ch {
                Text("\(spct(c)) \(range == "1D" ? "i dag" : label)").font(PF.ui(12.5, .semibold)).foregroundStyle(c < 0 ? p.lab : p.pos)
            }
            if hist.count > 1 {
                AreaChart(values: hist, color: up ? p.pos : p.lab).frame(height: 130)
            }
            rangePicker
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
    }

    private var rangePicker: some View {
        HStack(spacing: 4) {
            ForEach(stockRanges, id: \.0) { k, _, _ in
                let on = range == k
                Button { Haptics.shared.select(); range = k } label: {
                    Text(k).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.mut)
                        .frame(maxWidth: .infinity, minHeight: 30)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var notLinked: some View {
        Button { store.paperOpen(.settings); store.settingsPage = "stocks" } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Ikke koblet til Trading 212").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Text("Legg inn API-nøkkel og secret under Innstillinger → Aksjer · Trading 212. Gi bare lesetilgang.")
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    /// Nøkkeltallene i hel lengde (ingen «…»): to kolonner, teksten brytes heller enn å kuttes.
    private func keyFigures(_ x: StocksX) -> some View {
        let n = x.positions.count
        let figs: [(String, String, Color?)] = [
            ("Avkastning", (x.result < 0 ? "−" : "+") + skr(abs(x.result)), x.result < 0 ? p.lab : p.pos),
            ("Avkastning i %", x.invested > 0 ? spct(x.result / x.invested * 100) : "–", x.result < 0 ? p.lab : p.pos),
            ("Investert", skr(x.invested), nil),
            ("Verdi aksjer", skr(x.value), nil),
            ("Kontanter", skr(x.cash), nil),
            ("I dag", x.hasDay ? (x.dayChange < 0 ? "−" : "+") + skr(abs(x.dayChange)) : "–", x.dayChange < 0 ? p.lab : p.pos),
            ("Posisjoner", "\(n)", nil),
            ("ETF / aksjer", "\(x.positions.filter(\.etf).count) / \(x.positions.filter { !$0.etf }.count)", nil),
        ]
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(Array(figs.enumerated()), id: \.offset) { _, f in
                VStack(alignment: .leading, spacing: 3) {
                    Text(f.0).font(PF.mono(10, bold: false)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    Text(f.1).font(PF.serif(19, medium: true)).foregroundStyle(f.2 ?? p.ink).fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, minHeight: 66, alignment: .topLeading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    private var segments: some View {
        HStack(spacing: 4) {
            ForEach(["Alle", "Aksjer", "ETF"], id: \.self) { k in
                let on = seg == k
                Button { Haptics.shared.select(); seg = k } label: {
                    Text(k).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                        .padding(.horizontal, 16).frame(height: 34)
                        .background(on ? p.ink : p.card, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.top, 4)
    }

    @ViewBuilder private func positions(_ x: StocksX) -> some View {
        let list = x.positions.filter { seg == "Alle" || (seg == "ETF" ? $0.etf : !$0.etf) }.sorted { $0.value > $1.value }
        PSection(title: "Posisjoner", trailing: "\(list.count)")
        if list.isEmpty {
            PCard { Text("Ingen posisjoner.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
        } else {
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Button { Haptics.shared.tap(); sel = s } label: { posRow(s, i) }.buttonStyle(.plain)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func posRow(_ s: StockPos, _ i: Int) -> some View {
        HStack(spacing: 12) {
            Text(s.ini).font(PF.ui(12, .heavy)).foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(PaperIconTheme.color(store.iconTheme, i), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Text("\(s.symbol) · \(qty(s.qty)) stk").font(PF.ui(12)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                Text(skr(s.value)).font(PF.serif(16, medium: true)).foregroundStyle(p.ink)
                Text(spct(s.plPct)).font(PF.ui(12, .semibold)).foregroundStyle(s.pl < 0 ? p.lab : p.pos)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    @ViewBuilder private func orders(_ x: StocksX) -> some View {
        if !x.txns.isEmpty {
            PSection(title: "Siste ordre og utbytte", trailing: "\(x.txns.count)")
            VStack(spacing: 0) {
                ForEach(Array(x.txns.prefix(12).enumerated()), id: \.element.id) { i, t in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    HStack(spacing: 10) {
                        Text(t.kind).font(PF.mono(10)).foregroundStyle(t.kind == "Salg" ? p.lab : t.kind == "Utbytte" ? p.pos : p.ink).frame(width: 62, alignment: .leading)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(t.symbol).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                            Text([ddmm(t.date), t.time, t.status].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut)
                        }
                        Spacer()
                        Text(skr(t.amount)).font(PF.serif(15, medium: true)).foregroundStyle(p.ink)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func syncLine(_ x: StocksX) -> some View {
        let when = x.syncedAt.map { JS.fmt($0, Calendar.current.isDateInToday($0) ? "HH:mm" : "dd.MM HH:mm") }
        let txt = ["Trading 212", x.error.isEmpty ? (x.mock ? "Demodata" : x.configured ? "Synkronisert" : "Ikke koblet til") : x.error, when].compactMap { $0 }.joined(separator: " · ")
        return HStack {
            Circle().fill(x.error.isEmpty ? p.pos : p.lab).frame(width: 8, height: 8)
            Text(txt).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Spacer()
            Button { store.syncStocks() } label: {
                Text("Synk nå").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 30).overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 4).padding(.top, 4)
    }

    private func qty(_ q: Double) -> String {
        q == q.rounded() ? String(Int(q)) : String(format: "%.3f", q).replacingOccurrences(of: ".", with: ",")
    }
}

/// Én posisjon: kursserie, antall, snittkurs, kurs, verdi og avkastning.
struct PaperStockDetail: View {
    @Environment(\.paper) private var p
    let pos: StockPos

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(pos.symbol).font(PF.mono(11)).foregroundStyle(p.lab)
                Text(pos.name).font(PF.serif(26, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(skr(pos.value)).font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
                Text(spct(pos.plPct) + " siden kjøp").font(PF.ui(13, .semibold)).foregroundStyle(pos.pl < 0 ? p.lab : p.pos)
                if pos.series.count > 1 {
                    AreaChart(values: pos.series, color: (pos.series.last ?? 0) >= (pos.series.first ?? 0) ? p.pos : p.lab, marker: true,
                              label: { i in pos.series.indices.contains(i) ? String(format: "%.2f", pos.series[i]).replacingOccurrences(of: ".", with: ",") : "" })
                        .frame(height: 160)
                }
                VStack(spacing: 0) {
                    row("Antall", pos.qty == pos.qty.rounded() ? "\(Int(pos.qty))" : String(format: "%.3f", pos.qty).replacingOccurrences(of: ".", with: ","))
                    row("Snittkurs", String(format: "%.2f", pos.avg).replacingOccurrences(of: ".", with: ","))
                    row("Kurs nå", String(format: "%.2f", pos.price).replacingOccurrences(of: ".", with: ","))
                    row("Avkastning", (pos.pl < 0 ? "−" : "+") + skr(abs(pos.pl)))
                    if let d = pos.dayPct { row("I dag", spct(d)) }
                    row("Type", pos.etf ? "ETF / fond" : "Aksje")
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            .padding(18)
        }
        .background(p.bg.ignoresSafeArea())
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(PF.ui(14)).foregroundStyle(p.mut)
            Spacer()
            Text(v).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }
}
