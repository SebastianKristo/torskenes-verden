import SwiftUI

/* ---------------- Papir → Finans → Abonnementer: Subscription OS (Hjem · Innsikt · Historikk) i Papir-farger ---------------- */

private func krs(_ v: Double) -> String { "\(neg0(v)) kr" }
private let monthShortP = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"]

struct PaperSubs: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var month: Int?
    @State private var done: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "fh_subs_done") ?? [])

    var body: some View {
        // Hjem, Innsikt og Historikk ligger i fanelinja nederst, med den røde +-sirkelen for å legge til.
        VStack(spacing: 10) {
            if let x = store.subsX {
                switch store.subTab {
                case "ins": insights(x)
                case "hist": history(x)
                default: home(x)
                }
            } else {
                ProgressView().padding(30)
            }
        }
        .task { if store.subsX == nil { try? await store.loadSubs() } }
        .sheet(isPresented: Binding(get: { store.subAdding }, set: { store.subAdding = $0 })) {
            SubAddSheet().presentationDetents([.medium, .large]).presentationBackground(.ultraThinMaterial).preferredColorScheme(.dark)
        }
        .sheet(isPresented: Binding(get: { store.subEdit != nil || store.subNew }, set: { if !$0 { store.subEdit = nil; store.subNew = false } })) {
            SubEditSheet(item: store.subEdit).presentationDetents([.large]).presentationBackground(.ultraThinMaterial).preferredColorScheme(.dark)
        }
    }

    /* ---------- Hjem ---------- */

    @ViewBuilder private func home(_ x: SubsX) -> some View {
        savings(x)
        HStack(spacing: 10) {
            PKpi(label: "Per måned", value: krs(x.monthly))
            PKpi(label: "Per år", value: krs(x.yearly))
        }
        if !x.upcoming.isEmpty {
            PSection(title: "Neste trekk", trailing: "\(x.upcoming.count)")
            list(x.upcoming.prefix(6).map { c -> (String, String, String, SubItem?) in (c.name, when(c.date), krs(c.amount), x.item(c.id)) })
        }
        PSection(title: "Alle abonnementer", trailing: "\(x.items.filter(\.active).count) aktive")
        if x.items.isEmpty {
            PCard { Text("Ingen abonnementer ennå. Trykk + for å legge til.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
        } else {
            VStack(spacing: 0) {
                ForEach(Array(x.items.enumerated()), id: \.element.id) { i, s in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    subRow(s)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        PLineButton(title: "Skriv inn selv", height: 44, full: true) { store.subNew = true }
    }

    /// AI-kortet i mørk gradient.
    private func savings(_ x: SubsX) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("✦ AI-SPARING").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(.white.opacity(0.8))
            Text(x.saveMonthly > 0 ? "Spar \(krs(x.saveMonthly)) i måneden" : "Ingen sparetips akkurat nå").font(PF.serif(26, medium: true)).foregroundStyle(.white)
            Text(x.suggestions.first?.text ?? (x.healthText.isEmpty ? "Alle abonnementene ser ut til å være i bruk." : x.healthText))
                .font(PF.ui(13)).foregroundStyle(.white.opacity(0.8)).lineLimit(3)
            if !x.suggestions.isEmpty {
                Button { Haptics.shared.select(); store.subTab = "hist" } label: {
                    Text("Gå gjennom \(x.suggestions.count) forslag ›").font(PF.ui(13, .bold)).foregroundStyle(.white).padding(.horizontal, 14).frame(height: 34)
                        .background(Color(hex: "#b23a2a"), in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Color(hex: "#2a2620"), Color(hex: "#4a2a20")], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func list(_ rows: [(String, String, String, SubItem?)]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Button { if let s = r.3 { store.subEdit = s } } label: {
                    HStack(spacing: 12) {
                        Logo(domain: r.3?.domain, name: r.0, color: "#b23a2a", size: 34)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(r.0).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                            Text(r.1).font(PF.ui(12)).foregroundStyle(p.mut)
                        }
                        Spacer()
                        Text(r.2).font(PF.serif(16, medium: true)).foregroundStyle(p.ink)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func subRow(_ s: SubItem) -> some View {
        let pill: (String, Color) = !s.active ? ("Sagt opp", p.mut) : s.status == "price_up" ? ("▲ Pris økt", p.lab) : s.status == "low_use" ? ("⚠ Lite brukt", p.lab) : ("Aktiv", p.pos)
        return Button { Haptics.shared.tap(); store.subEdit = s } label: {
            HStack(spacing: 12) {
                Logo(domain: s.domain, name: s.name, color: "#b23a2a", size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name + (s.plan.isEmpty ? "" : " · \(s.plan)")).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text([s.cycleName, s.nextDate.isEmpty ? nil : "Neste \(ddmm(s.nextDate))", s.category].compactMap { $0 }.joined(separator: " · "))
                        .font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                    if !s.aiShort.isEmpty { Text("✦ " + s.aiShort).font(PF.ui(11.5)).foregroundStyle(p.lab).lineLimit(1) }
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(n0(s.price)).font(PF.serif(17, medium: true)).foregroundStyle(p.ink)
                    Text(pill.0).font(PF.ui(11, .semibold)).foregroundStyle(pill.1)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Endre") { store.subEdit = s }
            if s.active { Button("Marker som sagt opp") { store.setSubItemActive(s, false) } } else { Button("Aktiver igjen") { store.setSubItemActive(s, true) } }
        }
    }

    private func when(_ date: String) -> String {
        guard let d = parseDay(date) else { return date }
        let n = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: d).day ?? 0
        return n <= 0 ? "I dag" : n == 1 ? "I morgen" : n < 7 ? "Om \(n) dager · \(ddmm(date))" : ddmm(date)
    }

    /* ---------- Innsikt ---------- */

    @ViewBuilder private func insights(_ x: SubsX) -> some View {
        let cur = Calendar.current.component(.month, from: Date()) - 1
        let months = x.byMonth.count == 12 ? Array(x.byMonth[Swift.max(0, cur - 5)...cur]) : Array(x.byMonth.suffix(6))
        let sel = month ?? (months.count - 1)
        PDomCard(title: "Per måned", trailing: krs(x.monthly)) { monthBars(months, sel) }
        if let score = x.score {
            PDomCard(title: "Abonnementshelse", trailing: x.healthLabel) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(Int(score))").font(PF.serif(48)).foregroundStyle(p.ink)
                    Text("/ 100").font(PF.ui(14)).foregroundStyle(p.mut)
                }
                Text(x.healthText.isEmpty ? x.notes.joined(separator: " · ") : x.healthText).font(PF.ui(13)).foregroundStyle(p.mut)
            }
        }
        PDomCard(title: "Per kategori", trailing: "per måned") { PBars(rows: categories(x)) }
    }

    private func monthBars(_ months: [(String, Double, [String: Double])], _ sel: Int) -> some View {
        let mx = Swift.max(months.map(\.1).max() ?? 0, 1)
        return HStack(alignment: .bottom, spacing: 10) {
            ForEach(Array(months.enumerated()), id: \.offset) { i, m in
                Button { Haptics.shared.select(); month = i } label: {
                    VStack(spacing: 4) {
                        Text(i == sel ? n0(m.1) : " ").font(PF.ui(9.5, .semibold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                        RoundedRectangle(cornerRadius: 6).fill(i == sel ? p.lab : p.line)
                            .frame(height: Swift.max(6, CGFloat(m.1 / mx) * 90))
                        Text(monthLabel(m.0)).font(PF.ui(11)).foregroundStyle(i == sel ? p.ink : p.mut)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(height: 126, alignment: .bottom)
    }

    private func monthLabel(_ m: String) -> String {
        let mi = Int(m.suffix(2)) ?? 0
        return (1...12).contains(mi) ? monthShortP[mi - 1] : m
    }

    private func categories(_ x: SubsX) -> [(String, Double)] {
        var per: [String: Double] = [:]
        for s in x.items where s.active { per[s.category, default: 0] += s.monthly }
        return per.sorted { $0.value > $1.value }.map { ($0.key, $0.value) }
    }

    /* ---------- Historikk ---------- */

    @ViewBuilder private func history(_ x: SubsX) -> some View {
        let tasks = x.suggestions
        let doneCount = tasks.filter { done.contains($0.id) }.count
        let saved = tasks.filter { done.contains($0.id) }.map(\.amount).reduce(0, +)
        PDomCard(title: "✦ Smart sparing · AI-agent", trailing: "\(tasks.count - doneCount) igjen") {
            HStack(spacing: 10) {
                PKpi(label: "Spart per måned", value: krs(saved), color: saved > 0 ? p.pos : nil)
                PKpi(label: "Mulig per måned", value: krs(x.saveMonthly))
            }
            if tasks.isEmpty { Text("Ingen forslag. Abonnementene ser ut til å være i bruk.").font(PF.ui(13)).foregroundStyle(p.mut) }
            ForEach(tasks) { t in
                let on = done.contains(t.id)
                Button { toggle(t.id) } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Text(on ? "✓" : "○").font(PF.ui(16, .bold)).foregroundStyle(on ? p.pos : p.mut).frame(width: 22)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.text).font(PF.ui(14)).strikethrough(on).foregroundStyle(on ? p.mut : p.ink).multilineTextAlignment(.leading)
                            if t.amount > 0 { Text("−\(krs(t.amount))/mnd").font(PF.ui(12, .semibold)).foregroundStyle(p.lab) }
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        thisMonth(x)
    }

    private func toggle(_ id: String) {
        Haptics.shared.select()
        if done.contains(id) { done.remove(id) } else { done.insert(id); Haptics.shared.success() }
        UserDefaults.standard.set(Array(done), forKey: "fh_subs_done")
    }

    @ViewBuilder private func thisMonth(_ x: SubsX) -> some View {
        let today = isoDay(Date())
        let rows: [SubCharge] = !x.thisMonth.isEmpty ? x.thisMonth : x.items.filter { $0.active && $0.cycle == "monthly" }.compactMap { s -> SubCharge? in
            guard let d = s.chargeDay else { return nil }
            return SubCharge(id: s.id, name: s.name, date: String(today.prefix(8)) + String(format: "%02d", d), amount: s.price)
        }.sorted { $0.date < $1.date }
        PSection(title: "Trekk denne måneden", trailing: krs(x.monthTotal ?? rows.map(\.amount).reduce(0, +)))
        if rows.isEmpty {
            PCard { Text("Ingen trekk denne måneden.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
        } else {
            list(rows.map { c -> (String, String, String, SubItem?) in (c.name, (c.date <= today ? "Trukket " : "Kommer ") + ddmm(c.date), krs(c.amount), x.item(c.id)) })
        }
    }
}
