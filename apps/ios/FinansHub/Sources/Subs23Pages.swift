import SwiftUI

/* ---------------- Prompt 23: Subscription OS → Innsikt og Historikk (Subscription OS.dc.html, variant mobile) ---------------- */

/// «Abonnementer per måned»: beløpet i mono, trend og seks søyler (valgt måned med oransje striper).
struct SubMonthCard23: View {
    @Environment(\.paper) private var p
    let x: SubsX
    @State private var sel: Int? = nil

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let months: [(String, Double)] = sixMonths
        let mx: Double = Swift.max(1, months.map(\.1).max() ?? 1)
        let cur: Int = sel ?? Swift.max(0, months.count - 1)
        return VStack(alignment: .leading, spacing: 10) {
            Text("Abonnementer per måned").font(PF.ui(14)).foregroundStyle(t.mut)
            Text(SubCalc23.kr(x.monthly)).font(PF.mono(32)).foregroundStyle(t.fg).lineLimit(1).minimumScaleFactor(0.6)
            if let tr = trend {
                Text(tr).font(PF.ui(13)).foregroundStyle(t.neg)
            }
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(Array(months.enumerated()), id: \.offset) { i, m in
                    bar(i, m, mx, i == cur, t)
                }
            }
            .frame(height: 130)
            .padding(.top, 6)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func bar(_ i: Int, _ m: (String, Double), _ mx: Double, _ on: Bool, _ t: SubTok23) -> some View {
        Button { Haptics.shared.select(); sel = i } label: {
            VStack(spacing: 6) {
                Spacer(minLength: 0)
                barFill(on)
                    .frame(height: CGFloat(m.1 / mx) * 0.78 * 130)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(label(m.0)).font(PF.ui(12)).foregroundStyle(on ? t.fg : SubTok23.grey).lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func barFill(_ on: Bool) -> some View {
        if on { SubStripes23(c1: SubTok23.orange, c2: SubTok23.orangeDark) } else { SubTok23.off }
    }

    /// Siste seks måneder til og med denne (byMonth fra serveren er hele året).
    private var sixMonths: [(String, Double)] {
        let all: [(String, Double)] = x.byMonth.map { ($0.0, $0.1) }
        if all.isEmpty { return [] }
        let curM: Int = Calendar.current.component(.month, from: Date())
        let curY: Int = Calendar.current.component(.year, from: Date())
        let key: String = String(format: "%04d-%02d", curY, curM)
        let end: Int = all.lastIndex(where: { $0.0 <= key }) ?? (all.count - 1)
        let start: Int = Swift.max(0, end - 5)
        return Array(all[start...end])
    }

    private func label(_ m: String) -> String {
        let mi: Int = Int(m.suffix(2)) ?? 0
        return (1...12).contains(mi) ? SubCalc23.monthShort[mi - 1] : m
    }

    private var trend: String? {
        guard let prev = x.prevMonthly, prev > 0 else { return nil }
        let pct: Double = (x.monthly - prev) / prev * 100
        if abs(pct) < 0.05 { return "Uendret fra forrige måned" }
        let s: String = String(format: "%.1f", abs(pct)).replacingOccurrences(of: ".", with: ",")
        return (pct > 0 ? "▲ " : "▼ ") + s + " % fra forrige måned"
    }
}

/// «Abonnementshelse»: merke, strekmåler og poeng /100.
struct SubHealthCard23: View {
    @Environment(\.paper) private var p
    let x: SubsX

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let score: Double = x.score ?? 0
        return VStack(spacing: 4) {
            HStack {
                Text("Abonnementshelse").font(PF.ui(16, .semibold)).foregroundStyle(t.fg)
                Spacer()
                Text(x.healthLabel.isEmpty ? "Bra" : x.healthLabel).font(PF.ui(12.5, .semibold)).foregroundStyle(SubTok23.okFg)
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .background(SubTok23.okBg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            SubGauge23(score: score).frame(width: 230, height: 130)
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("\(Int(score.rounded()))").font(PF.ui(42, .semibold)).foregroundStyle(t.fg)
                Text("/100").font(PF.ui(15)).foregroundStyle(SubTok23.grey)
            }
            .padding(.top, -56)
            if !x.healthText.isEmpty {
                Text(x.healthText).font(PF.ui(13)).foregroundStyle(t.mut).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/// «Per kategori»: navn, beløp i mono og stripet søyle per kategori.
struct SubCatCard23: View {
    @Environment(\.paper) private var p
    let x: SubsX

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let rows: [(String, Double)] = SubCalc23.categories(x)
        let mx: Double = Swift.max(1, rows.map(\.1).max() ?? 1)
        return VStack(alignment: .leading, spacing: 12) {
            Text("Per kategori").font(PF.ui(16, .semibold)).foregroundStyle(t.fg)
            if rows.isEmpty { Text("Ingen aktive abonnementer.").font(PF.ui(13.5)).foregroundStyle(t.mut) }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                catRow(r, mx, t)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func catRow(_ r: (String, Double), _ mx: Double, _ t: SubTok23) -> some View {
        let c: (Color, Color) = SubCalc23.catColors(r.0)
        let f: CGFloat = CGFloat(Swift.min(1, Swift.max(0, r.1 / mx)))
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(r.0).font(PF.ui(13.5)).foregroundStyle(t.fg)
                Spacer()
                Text(SubCalc23.kr(r.1)).font(PF.mono(13.5, bold: false)).foregroundStyle(t.fg)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    t.bd
                    SubStripes23(c1: c.0, c2: c.1)
                        .frame(width: g.size.width * f)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
            .frame(height: 12)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
    }
}

/* ---------------- Historikk ---------------- */

/// «Smart sparing · AI-agent»: Gjennomgått og Sparehelse som segmentlinjer, oppgavene og status.
struct SubAgentCard23: View {
    @Environment(\.paper) private var p
    let x: SubsX
    @State private var done: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "fh_subs_done") ?? [])

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let tasks: [SubSuggestion] = x.suggestions
        let nd: Int = tasks.filter { done.contains($0.id) }.count
        let all: Bool = !tasks.isEmpty && nd == tasks.count
        return VStack(alignment: .leading, spacing: 14) {
            header(tasks.count - nd, t)
            HStack(spacing: 14) {
                segBar("Gjennomgått", "\(nd) av \(tasks.count)", tasks.isEmpty ? 0 : Double(nd) / Double(tasks.count), Color(hex: "#7AA7FF"), t)
                segBar("Sparehelse", "\(health(nd)) %", Double(health(nd)) / 100, SubTok23.orange, t)
            }
            taskList(tasks, t)
            HStack {
                Text("Status").font(PF.ui(13.5)).foregroundStyle(t.mut)
                Spacer()
                Text(all || tasks.isEmpty ? "Fullført" : "Pågår").font(PF.ui(13.5, .semibold)).foregroundStyle(all || tasks.isEmpty ? SubTok23.okFg : SubTok23.peach)
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .background(all || tasks.isEmpty ? SubTok23.okBg : SubTok23.warnBg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func health(_ nd: Int) -> Int {
        let base: Double = x.score ?? 72
        return Swift.min(100, Int(base.rounded()) + nd * 6)
    }

    private func header(_ left: Int, _ t: SubTok23) -> some View {
        HStack(spacing: 12) {
            Text("✦").font(PF.ui(18, .bold)).foregroundStyle(SubTok23.ink0)
                .frame(width: 44, height: 44).background(SubTok23.orange, in: Circle())
            VStack(alignment: .leading, spacing: 0) {
                Text("Smart sparing").font(PF.ui(16, .semibold)).foregroundStyle(t.fg)
                Text("AI-agent").font(PF.ui(13)).foregroundStyle(t.mut)
            }
            Spacer(minLength: 4)
            Text("⏳ \(left) igjen").font(PF.ui(12.5)).foregroundStyle(t.fg)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(t.bd, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func segBar(_ l: String, _ v: String, _ f: Double, _ c: Color, _ t: SubTok23) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(l).font(PF.ui(12.5)).foregroundStyle(t.mut)
                Spacer()
                Text(v).font(PF.ui(12.5, .semibold)).foregroundStyle(t.fg)
            }
            HStack(spacing: 2) {
                ForEach(0..<22, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Double(i) / 22 < f ? c : SubTok23.off)
                        .frame(height: 14)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func taskList(_ tasks: [SubSuggestion], _ t: SubTok23) -> some View {
        if tasks.isEmpty {
            Text("Ingen forslag. Abonnementene ser ut til å være i bruk.").font(PF.ui(14)).foregroundStyle(t.mut)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(tasks.enumerated()), id: \.element.id) { i, s in
                    if i > 0 { Rectangle().fill(SubTok23.off).frame(height: 1) }
                    taskRow(s, t)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(t.card2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func taskRow(_ s: SubSuggestion, _ t: SubTok23) -> some View {
        let on: Bool = done.contains(s.id)
        let item: SubItem? = x.item(s.subId)
        return Button { toggle(s.id) } label: {
            HStack(spacing: 12) {
                SubLogo23(name: s.name.isEmpty ? (item?.name ?? "?") : s.name, domain: s.domain ?? item?.domain, logoUrl: item?.logoUrl, category: item?.category ?? "Annet", size: 30)
                Text(s.text).font(PF.ui(14)).strikethrough(on).foregroundStyle(on ? SubTok23.grey : t.fg)
                    .multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                Text(on ? "✓" : "○").font(PF.ui(14)).foregroundStyle(on ? SubTok23.okFg : SubTok23.grey)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func toggle(_ id: String) {
        Haptics.shared.select()
        if done.contains(id) { done.remove(id) } else { done.insert(id); Haptics.shared.success() }
        UserDefaults.standard.set(Array(done), forKey: "fh_subs_done")
    }
}

/// «Denne måneden»: betalte trekk som egne kort (logo 40, navn, dato · kategori og −beløp).
struct SubHistList23: View {
    @Environment(\.paper) private var p
    let x: SubsX
    let open: (SubItem) -> Void

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let rows: [SubCharge] = paid
        return VStack(alignment: .leading, spacing: 14) {
            Text("Denne måneden").font(PF.ui(17, .semibold)).foregroundStyle(t.fg).padding(.horizontal, 4)
            if rows.isEmpty {
                Text("Ingen trekk ennå denne måneden.").font(PF.ui(14)).foregroundStyle(t.mut)
                    .padding(.vertical, 12).padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(t.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, c in row(c, t) }
        }
    }

    /// Trekk til og med i dag, nyeste først.
    private var paid: [SubCharge] {
        let today: String = isoDay(Date())
        var list: [SubCharge] = x.thisMonth
        if list.isEmpty {
            list = x.items.filter { $0.active && $0.cycle == "monthly" }.compactMap { s -> SubCharge? in
                guard let d = s.chargeDay else { return nil }
                return SubCharge(id: s.id, name: s.name, date: String(today.prefix(8)) + String(format: "%02d", d), amount: s.price)
            }
        }
        return list.filter { $0.date <= today }.sorted { $0.date > $1.date }
    }

    private func row(_ c: SubCharge, _ t: SubTok23) -> some View {
        let s: SubItem? = x.item(c.id)
        let sub: String = SubCalc23.shortDate(c.date) + (s.map { " · " + $0.category } ?? "")
        return Button { if let s { open(s) } } label: {
            HStack(spacing: 12) {
                SubLogo23(name: c.name, domain: s?.domain, logoUrl: s?.logoUrl, category: s?.category ?? "Annet", size: 40)
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.name).font(PF.ui(15, .semibold)).foregroundStyle(t.fg).lineLimit(1)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text("−" + SubCalc23.kr(c.amount)).font(PF.mono(14.5)).foregroundStyle(t.fg)
            }
            .padding(.vertical, 12).padding(.horizontal, 14)
            .background(t.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
