import SwiftUI

/* ---------------- Papir: Aksjer (Finans → Mer → Aksjer), full mobilversjon av aksjedelen på web ---------------- */

private func skr(_ v: Double) -> String { "\(neg0(v)) kr" }
private func spct(_ v: Double) -> String { "\(v < 0 ? "−" : "+")\(pct(abs(v)))" }

private let stockRanges: [(String, String, Int)] = [("1D", "I dag", 2), ("1U", "1 uke", 7), ("1M", "1 måned", 31), ("3M", "3 måneder", 92), ("1Å", "1 år", 366), ("Alt", "Alt", Int.max)]

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
