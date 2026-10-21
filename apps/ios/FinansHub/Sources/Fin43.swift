import SwiftUI

/* ---------------- Prompt 43: Glimt-orben, saldokortet (4b i Papir), månedstopp i Liste og rød Glimt-knapp ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-finans-saldokort.md, -finans-liste-maned-topp.md, -finans-sok-glimt-knapp.md
 og -domener-glimt-i-kortet.md (orben, ikke figuren). Design: Mobil Papir App.dc.html (finSal, txGroups, finOrb). */

/// Firetakket stjerne (Glimt-tegnet) midt i orben.
struct Star43: Shape {
    func path(in r: CGRect) -> Path {
        let c: CGPoint = CGPoint(x: r.midX, y: r.midY)
        let R: CGFloat = Swift.min(r.width, r.height) / 2
        let k: CGFloat = R * 0.28
        var p: Path = Path()
        p.move(to: CGPoint(x: c.x, y: c.y - R))
        p.addQuadCurve(to: CGPoint(x: c.x + R, y: c.y), control: CGPoint(x: c.x + k, y: c.y - k))
        p.addQuadCurve(to: CGPoint(x: c.x, y: c.y + R), control: CGPoint(x: c.x + k, y: c.y + k))
        p.addQuadCurve(to: CGPoint(x: c.x - R, y: c.y), control: CGPoint(x: c.x - k, y: c.y + k))
        p.addQuadCurve(to: CGPoint(x: c.x, y: c.y - R), control: CGPoint(x: c.x - k, y: c.y - k))
        p.closeSubpath()
        return p
    }
}

/// Glimt-orben: konisk fargering (#b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6), kremfarget innside og rød stjerne.
/// Roterer sakte (6 s per runde), raskere (1,6 s) mens Glimt svarer. Står stille med «Reduser bevegelse».
struct Orb43: View {
    var size: CGFloat = 20
    var busy: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spin: Bool = false

    static let colors: [Color] = [Color(hex: "#b23a2a"), Color(hex: "#e8794a"), Color(hex: "#f2c14e"), Color(hex: "#3fbf9a"), Color(hex: "#7a5ad6"), Color(hex: "#b23a2a")]

    var body: some View {
        let ring: CGFloat = Swift.max(2, size * 0.12)
        ZStack {
            Circle().fill(Color(hex: "#f3efe6"))
            Circle()
                .strokeBorder(AngularGradient(colors: Orb43.colors, center: .center), lineWidth: ring)
                .rotationEffect(.degrees(spin ? 360 : 0))
            Star43().fill(Color(hex: "#b23a2a")).frame(width: size * 0.5, height: size * 0.5)
        }
        .frame(width: size, height: size)
        .onAppear { start() }
        .onChange(of: busy) { (_: Bool, _: Bool) in start() }
        .accessibilityHidden(true)
    }

    private func start() {
        guard !reduceMotion else { return }
        spin = false
        withAnimation(.linear(duration: busy ? 1.6 : 6).repeatForever(autoreverses: false)) { spin = true }
    }
}

/// Rød Glimt-pille med orben på en hvit brikke. På: rød fylt, hvit tekst. Av: rød kant, rød tekst og 12 % rød bakgrunn.
struct Glimt43Pill: View {
    @Environment(\.paper) private var p
    let on: Bool
    var height: CGFloat = 38
    var busy: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Orb43(size: 20, busy: busy)
                    .padding(2)
                    .background(Color.white.opacity(0.92), in: Circle())
                Text("Glimt").font(PF.ui(13, .bold)).foregroundStyle(on ? Color.white : p.lab)
            }
            .padding(.leading, 6).padding(.trailing, 14)
            .frame(height: height)
            .background(on ? p.lab : p.lab.opacity(0.12), in: Capsule())
            .overlay(Capsule().stroke(p.lab, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(on ? "Glimt er på" : "Glimt")
    }
}

/// Finans → Oversikt: saldokortet (f1) i 4b-oppsett med Papir-farger. Bare to tall: saldo og brukt denne måneden.
struct Fin43Saldo: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let total: Double = (store.boot?.accounts ?? []).reduce(0) { $0 + $1.balance }
        let spent: Double? = store.summary.map { abs($0.ut) }
        let cal: Calendar = Calendar(identifier: .gregorian)
        let now: Date = Date()
        let d: Int = cal.component(.day, from: now)
        let dm: Int = cal.range(of: .day, in: .month, for: now)?.count ?? 30
        let frac: Double = Double(d) / Double(Swift.max(1, dm))
        Button {
            Haptics.shared.tap()
            store.paperFinGo("kontoer")
        } label: {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("SALDO · ALLE KONTOER").font(PF.mono(10.5)).tracking(1.4).foregroundStyle(p.lab)
                    Spacer()
                    Text("›").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                        .frame(width: 30, height: 30).background(p.bg, in: Circle())
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(store.boot == nil ? "–" : neg0(total)).font(PF.serif(52, medium: true)).foregroundStyle(p.ink)
                        .lineLimit(1).minimumScaleFactor(0.5)
                    Text("kr").font(PF.serif(30, medium: true)).foregroundStyle(p.mut)
                }
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(p.line.opacity(0.8))
                        Circle().inset(by: 2.5).trim(from: 0, to: frac).stroke(p.lab, lineWidth: 5).rotationEffect(.degrees(-90))
                        Circle().fill(p.bg).frame(width: 36, height: 36)
                        // «21.» på én linje: tall og punktum i samme tekst.
                        Text("\(d).").font(PF.ui(11, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                    }
                    .frame(width: 46, height: 46)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Brukt i \(Fin43Saldo.month(now)) · dag \(d) av \(dm)").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.8)
                        Text(spent.map { n0($0) + " kr" } ?? "–").font(PF.serif(26, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(p.bg, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(p.line.opacity(0.7), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.18), radius: 18, y: 12)
            .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Saldo alle kontoer \(store.boot == nil ? "" : neg0(total)) kroner. Brukt i \(Fin43Saldo.month(now)) \(spent.map { n0($0) } ?? "") kroner.")
        .accessibilityHint("Åpner Kontoer")
    }

    static func month(_ d: Date) -> String {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "LLLL"
        return f.string(from: d)
    }
}

/// Én måned i Finans → Liste.
struct Fin43Month: Identifiable {
    let id: String          // "2026-10"
    let label: String       // "OKTOBER"
    let short: String       // "OKT"
    let txs: [Tx]
    var net: Double { txs.reduce(0) { $0 + $1.amount } }

    /// Grupperer transaksjonene per måned (nyeste først, rekkefølgen i lista beholdes inne i måneden).
    static func groups(_ list: [Tx]) -> [Fin43Month] {
        var order: [String] = []
        var map: [String: [Tx]] = [:]
        for t in list {
            let k: String = String(t.date.prefix(7))
            if map[k] == nil { order.append(k); map[k] = [] }
            map[k]?.append(t)
        }
        return order.map { (k: String) -> Fin43Month in
            let parts: [Substring] = k.split(separator: "-")
            let m: Int = parts.count == 2 ? (Int(parts[1]) ?? 0) : 0
            let names: [String] = ["JANUAR", "FEBRUAR", "MARS", "APRIL", "MAI", "JUNI", "JULI", "AUGUST", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"]
            let shorts: [String] = ["JAN", "FEB", "MARS", "APR", "MAI", "JUNI", "JULI", "AUG", "SEP", "OKT", "NOV", "DES"]
            let label: String = (1...12).contains(m) ? names[m - 1] : k
            let short: String = (1...12).contains(m) ? shorts[m - 1] : k
            return Fin43Month(id: k, label: label, short: short, txs: map[k] ?? [])
        }
    }
}

/// Månedstoppen: «OKTOBER · 19» i rød mono til venstre, «Netto +25 518,09 kr» til høyre og 2 pt strek i ink under.
struct Fin43MonthHead: View {
    @Environment(\.paper) private var p
    let title: String
    let net: Double

    var body: some View {
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab).lineLimit(1)
                Spacer(minLength: 8)
                Text("Netto " + (net > 0 ? "+" : "") + Fin43MonthHead.kr(net)).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            .padding(.horizontal, 2)
            Rectangle().fill(p.ink).frame(height: 2)
        }
        .padding(.top, 4)
        .background(p.bg)
        .accessibilityElement(children: .combine)
    }

    static func kr(_ v: Double) -> String {
        if Privacy.shared.hidden { return neg0(v) + " kr" }
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        let s: String = f.string(from: NSNumber(value: abs(v))) ?? String(format: "%.2f", abs(v))
        return (v < 0 ? "−" : "") + s + " kr"
    }
}
