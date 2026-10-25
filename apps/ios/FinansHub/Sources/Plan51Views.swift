import SwiftUI
import UIKit
import PhotosUI

/* ---------------- Prompt 51 (IOSFEAT51): Finans → Planlegging – siden, Sparemål og Kalender ----------------
 Fasit for oppførsel: public/finans/js/plan51.js. Skatt, Priser og Abonnementsjeger ligger i Plan51Views2.swift. */

struct Plan51Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }

    var body: some View {
        F51Scaffold(kicker: "Finans · planlegging", title: "Planlegging", sub: "Sparemål, faste trekk fremover, skatt, priser og abonnementer",
                    tabs: Plan51.tabs, tab: m.tab, pick: { (t: String) in m.pick(t, store) }, toast: m.toast,
                    close: { m.open = false }, refresh: { await m.reload(store) }) {
            Plan51Body()
        }
        .task { await m.load(store) }
        .sheet(isPresented: Binding<Bool>(get: { m.editing != nil }, set: { (v: Bool) in if !v { m.editing = nil } })) {
            Plan51GoalForm(goal: m.goals?.items.first(where: { $0.id == m.editing }), accounts: m.goals?.accounts ?? [])
                .environment(\.paper, p)
                .environment(store)
                .presentationDetents([.large])
        }
        .sheet(item: Binding<Goal51?>(get: { m.depositFor }, set: { m.depositFor = $0 })) { (g: Goal51) in
            Plan51Deposit(goal: g)
                .environment(\.paper, p)
                .environment(store)
                .presentationDetents([.height(300)])
        }
        .sheet(item: Binding<F51File?>(get: { m.export }, set: { m.export = $0 })) { (f: F51File) in
            ShareSheet(url: f.url)
        }
    }
}

struct Plan51Body: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Plan51 { Plan51.shared }

    var body: some View {
        let t: String = m.tab
        if let e = m.errors[t], !m.has(t) {
            F51Error(text: e) { Task { await m.reload(store) } }
        } else if !m.has(t) {
            F51Loading()
        } else {
            switch t {
            case "spar": Plan51Spar()
            case "kal": Plan51Kal()
            case "skatt": Plan51Skatt()
            case "pris": Plan51Pris()
            default: Plan51Jakt()
            }
        }
    }
}

/* ---------- Sparemål ---------- */

struct Plan51Spar: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }

    var body: some View {
        let d: Goals51 = m.goals ?? Goals51()
        VStack(alignment: .leading, spacing: 12) {
            F51Grid {
                if !d.items.isEmpty { Plan51Totals(d: d) }
                Plan51Round(d: d)
            }
            if d.items.isEmpty {
                PCard {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Ingen sparemål ennå").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                        F51Note(text: "Lag et mål med beløp, frist og bilde. Du ser fremdriften og hvor mye du må spare i måneden, og kan runde opp kjøpene dine til målet.")
                    }
                }
            }
            F51Grid {
                ForEach(d.items) { (g: Goal51) in Plan51GoalCard(g: g) }
            }
            F51Btn(title: "Nytt sparemål", kind: .ink, icon: "plus") { m.editing = 0 }
        }
    }
}

struct Plan51Totals: View {
    let d: Goals51

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                PLabel(text: "Totalt spart")
                F51Big(value: F51.kr(d.saved), small: "av " + F51.kr(d.target) + " · " + F51.pctText(d.pct))
                F51Bar(pct: d.pct)
            }
        }
    }
}

struct Plan51Round: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let d: Goals51

    var body: some View {
        let r: RoundUp51 = d.roundUp
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        PLabel(text: "Rund opp")
                        Text(r.count > 0 ? F51.kr(r.amount, 2) + " klar til sparing" : "Ingenting å runde opp nå")
                            .font(PF.serif(20, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    stepMenu(r)
                }
                F51Note(text: note(r))
                ForEach(r.sample.prefix(5)) { (s: RoundUp51.Sample51) in
                    F51Line(title: s.name, sub: F51.dl(s.date) + " · " + F51.kr(s.amount, 2), value: "+" + n2(s.roundUp) + " kr", valueColor: p.pos)
                }
                if !d.items.isEmpty { goalRow(r) }
            }
        }
    }

    private func note(_ r: RoundUp51) -> String {
        let t: String = r.text.isEmpty ? "" : r.text + ". "
        if r.from.isEmpty { return t + "Kjøp rundes opp til nærmeste \(r.step) kr." }
        return t + "Kjøp fra " + F51.dl(r.from) + " til " + F51.dl(r.until) + " rundes opp til nærmeste \(r.step) kr."
    }

    private func stepMenu(_ r: RoundUp51) -> some View {
        Menu {
            ForEach(r.steps, id: \.self) { (s: Int) in
                Button { Task { await m.setRoundStep(s, store) } } label: {
                    if s == r.step { Label("\(s) kr", systemImage: "checkmark") } else { Text("\(s) kr") }
                }
            }
        } label: {
            Text("Til \(r.step) kr ▾").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 12).frame(minHeight: 34)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .frame(minHeight: 44)
        }
        .accessibilityLabel("Rund til nærmeste \(r.step) kroner")
    }

    private func goalRow(_ r: RoundUp51) -> some View {
        let gid: Int = r.goalId ?? d.items.first?.id ?? 0
        let name: String = d.items.first(where: { $0.id == gid })?.name ?? "Velg mål"
        return HStack(spacing: 8) {
            Menu {
                ForEach(d.items) { (g: Goal51) in
                    Button(g.name) { Task { await m.setRoundGoal(g.id, store) } }
                }
            } label: {
                Text(name + " ▾").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    .padding(.horizontal, 12).frame(minHeight: 36)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    .frame(minHeight: 44)
            }
            .accessibilityLabel("Sparemål for rund opp: " + name)
            F51Btn(title: "Sett inn " + F51.kr(r.amount, 2), kind: .ink, disabled: r.count == 0) {
                Task { await m.applyRound(store) }
            }
        }
    }
}

struct Plan51GoalCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let g: Goal51
    @State private var photo: PhotosPickerItem? = nil
    @State private var confirm: Bool = false

    var body: some View {
        PCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                PaperServerImage(path: g.imageUrl.isEmpty ? nil : g.imageUrl, tint: Color(hex: g.color), initials: String(g.name.prefix(1)).uppercased())
                    .frame(height: 110).frame(maxWidth: .infinity)
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 20, topTrailingRadius: 20, style: .continuous))
                    .accessibilityHidden(true)
                info.padding(14)
            }
        }
        .onChange(of: photo) { (_: PhotosPickerItem?, v: PhotosPickerItem?) in
            guard let v else { return }
            Task { @MainActor in
                if let d = try? await v.loadTransferable(type: Data.self) { await m.setImage(g, d, store) }
                photo = nil
            }
        }
        .confirmationDialog("Slette sparemålet «\(g.name)»?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { Task { await m.deleteGoal(g, store) } }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private var info: some View {
        let st: (String, F51Tone) = g.statusLabel
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(g.name).font(PF.serif(21, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                F51Tag(text: st.0, tone: st.1)
            }
            F51Big(value: F51.kr(g.saved), small: "av " + F51.kr(g.target) + " · " + F51.pctText(g.pct))
            F51Bar(pct: g.pct, color: Color(hex: g.color))
            F51Note(text: paceText)
            actions
        }
    }

    private var paceText: String {
        guard g.pace > 0 else { return g.statusText }
        let t: String = F51.kr(g.pace)
        return g.statusText + " · tempo " + t + "/mnd"
    }

    private var sub: String {
        let d: String = g.deadlineLabel.isEmpty ? "Ingen frist" : "Frist " + g.deadlineLabel
        return g.account.isEmpty ? d : d + " · følger " + g.account
    }

    private var actions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if !g.followsAccount { F51Btn(title: "Sett inn", kind: .ink) { m.depositFor = g } }
                F51Btn(title: "Endre") { m.editing = g.id }
                PhotosPicker(selection: $photo, matching: .images) {
                    Text("Bilde").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 14).frame(minHeight: 36)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .frame(minHeight: 44)
                }
                .accessibilityLabel("Bytt bilde")
                if !g.imageUrl.isEmpty { F51Btn(title: "Fjern bilde") { Task { await m.deleteImage(g, store) } } }
                F51Btn(title: "Slett", kind: .red) { confirm = true }
            }
        }
    }
}

/// Nytt eller endre sparemål.
struct Plan51GoalForm: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var m: Plan51 { Plan51.shared }
    let goal: Goal51?
    let accounts: [Acc51]

    @State private var name: String = ""
    @State private var target: String = ""
    @State private var saved: String = ""
    @State private var hasDeadline: Bool = false
    @State private var deadline: Date = Date().addingTimeInterval(180 * 86_400)
    @State private var color: Color = Color(hex: "#2f7a4f")
    @State private var accountId: Int? = nil
    @State private var saving: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(goal == nil ? "Nytt sparemål" : "Endre «\(goal?.name ?? "")»").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                F51Field(label: "Navn", text: $name, placeholder: "F.eks. Japan-tur")
                F51Field(label: "Målbeløp (kr)", text: $target, placeholder: "30 000", keyboard: .decimalPad)
                if goal == nil { F51Field(label: "Allerede spart (kr)", text: $saved, placeholder: "0", keyboard: .decimalPad) }
                Toggle(isOn: $hasDeadline) { Text("Frist").font(PF.ui(14, .semibold)).foregroundStyle(p.ink) }.tint(p.pos)
                if hasDeadline {
                    DatePicker("Dato", selection: $deadline, displayedComponents: .date).font(PF.ui(14)).environment(\.locale, Locale(identifier: "nb_NO"))
                }
                accountPicker
                ColorPicker(selection: $color, supportsOpacity: false) { Text("Farge").font(PF.ui(14, .semibold)).foregroundStyle(p.ink) }
                HStack(spacing: 8) {
                    F51Btn(title: goal == nil ? "Lag sparemål" : "Lagre", kind: .ink, busy: saving) { save() }
                    F51Btn(title: "Avbryt") { dismiss() }
                }
            }
            .padding(22)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear { fill() }
    }

    private var accountPicker: some View {
        let cur: String = accounts.first(where: { $0.id == accountId })?.name ?? "Nei – jeg registrerer innskudd selv"
        return VStack(alignment: .leading, spacing: 4) {
            Text("Følg en sparekonto").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            Menu {
                Button("Nei – jeg registrerer innskudd selv") { accountId = nil }
                ForEach(accounts) { (a: Acc51) in
                    Button(a.name + " (" + F51.kr(a.balance) + ")") { accountId = a.id }
                }
            } label: {
                Text(cur + " ▾").font(PF.ui(14)).foregroundStyle(p.ink).lineLimit(1)
                    .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
            }
        }
    }

    private func fill() {
        guard let g = goal else { return }
        name = g.name
        target = g.target.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(g.target)) : String(g.target)
        color = Color(hex: g.color)
        accountId = g.accountId
        if g.deadline.count >= 10, let d = parseDay(g.deadline) { hasDeadline = true; deadline = d }
    }

    private func save() {
        saving = true
        let hex: String = Plan51GoalForm.hex(color)
        Task { @MainActor in
            let ok: Bool = await m.saveGoal(store, id: goal?.id, name: name, target: target, saved: saved,
                                            deadline: hasDeadline ? deadline : nil, color: hex, accountId: accountId)
            saving = false
            if ok { m.editing = nil }
        }
    }

    static func hex(_ c: Color) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(c).getRed(&r, green: &g, blue: &b, alpha: &a)
        let v: (Int, Int, Int) = (Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
        return String(format: "#%02x%02x%02x", Swift.max(0, Swift.min(255, v.0)), Swift.max(0, Swift.min(255, v.1)), Swift.max(0, Swift.min(255, v.2)))
    }
}

/// «Sett inn» (negativt = uttak).
struct Plan51Deposit: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let goal: Goal51
    @State private var amount: String = ""
    @State private var busy: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Sett inn på «\(goal.name)»").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            F51Field(label: "Beløp (kr), minus for uttak", text: $amount, placeholder: "500", keyboard: .numbersAndPunctuation)
            HStack(spacing: 8) {
                F51Btn(title: "Sett inn", kind: .ink, busy: busy) {
                    busy = true
                    Task { @MainActor in
                        let ok: Bool = await m.deposit(goal, amount, store)
                        busy = false
                        if ok { m.depositFor = nil }
                    }
                }
                F51Btn(title: "Avbryt") { m.depositFor = nil }
            }
            Spacer(minLength: 0)
        }
        .padding(22)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }
}

/* ---------- Kalender med saldoprognose ---------- */

struct Plan51Kal: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }

    var body: some View {
        let c: Cal51 = m.cal ?? Cal51()
        let series: [(String, Double)] = c.series(m.acc)
        let start: Double = c.start(m.acc)
        let end: Double = series.last?.1 ?? start
        VStack(alignment: .leading, spacing: 12) {
            PCard {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            PLabel(text: "Saldoprognose · " + F51.dl(c.from) + "–" + F51.dl(c.to))
                            F51Big(value: F51.kr(end), small: "om \(c.days.count) dager (nå " + F51.kr(start) + ")")
                        }
                        Spacer(minLength: 8)
                        daysMenu
                    }
                    Plan51AccChips(c: c)
                    Plan51Spark(series: series).frame(height: 110)
                    Plan51KalKpis(c: c)
                    ForEach(c.warnings, id: \.self) { (w: String) in F51Note(text: w, red: true) }
                    if !c.unassigned.isEmpty { F51Note(text: c.unassigned) }
                }
            }
            Plan51Days(c: c, series: series)
        }
    }

    private var daysMenu: some View {
        Menu {
            ForEach([30, 60, 90], id: \.self) { (n: Int) in
                Button("\(n) dager") { m.days = n; Task { await m.reload(store) } }
            }
        } label: {
            Text("\(m.days) dager ▾").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 12).frame(minHeight: 34)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .frame(minHeight: 44)
        }
        .accessibilityLabel("Periode: \(m.days) dager")
    }
}

struct Plan51AccChips: View {
    @MainActor private var m: Plan51 { Plan51.shared }
    let c: Cal51

    var body: some View {
        let tabs: [(String, String)] = [("all", "Alle kontoer")] + c.accounts.map { (String($0.id), $0.name) }
        F51Tabs(tabs: tabs, sel: m.acc.map { String($0) } ?? "all") { (k: String) in m.acc = k == "all" ? nil : Int(k) }
            .padding(.horizontal, -14)
    }
}

struct Plan51KalKpis: View {
    @Environment(\.paper) private var p
    let c: Cal51

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            F51Line(title: "Ut", value: F51.kr(c.out))
            F51Line(title: "Inn", value: F51.kr(c.inn), valueColor: p.pos)
            F51Line(title: "\(c.count) trekk og innbetalinger", sub: c.lowestText, value: "")
        }
    }
}

/// Saldo dag for dag (linje, null-linje og laveste punkt). Ingen gester – bare tegning.
struct Plan51Spark: View {
    @Environment(\.paper) private var p
    let series: [(String, Double)]

    var body: some View {
        let v: [Double] = series.map(\.1)
        let lo0: Double = v.min() ?? 0
        let hi0: Double = v.max() ?? 0
        let pad: Double = Swift.max(1, (hi0 - lo0) * 0.12)
        let lo: Double = lo0 - pad
        let hi: Double = hi0 + pad
        GeometryReader { (g: GeometryProxy) in
            let w: CGFloat = g.size.width
            let h: CGFloat = g.size.height
            ZStack {
                if lo < 0 && hi > 0 {
                    Path { (path: inout Path) in
                        let y0: CGFloat = Plan51Spark.y(0, lo, hi, h)
                        path.move(to: CGPoint(x: 0, y: y0))
                        path.addLine(to: CGPoint(x: w, y: y0))
                    }
                    .stroke(p.lab.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                }
                Path { (path: inout Path) in
                    for (i, b) in v.enumerated() {
                        let pt: CGPoint = CGPoint(x: Plan51Spark.x(i, v.count, w), y: Plan51Spark.y(b, lo, hi, h))
                        if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
                    }
                }
                .stroke(p.ink, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                if let mi = v.indices.min(by: { v[$0] < v[$1] }) {
                    Circle().fill(v[mi] < 0 ? p.lab : p.pos).frame(width: 8, height: 8)
                        .position(x: Plan51Spark.x(mi, v.count, w), y: Plan51Spark.y(v[mi], lo, hi, h))
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel(label(v))
    }

    nonisolated static func x(_ i: Int, _ n: Int, _ w: CGFloat) -> CGFloat { CGFloat(i) / CGFloat(Swift.max(1, n - 1)) * w }
    nonisolated static func y(_ b: Double, _ lo: Double, _ hi: Double, _ h: CGFloat) -> CGFloat {
        let r: Double = hi - lo == 0 ? 1 : hi - lo
        return h - 6 - CGFloat((b - lo) / r) * (h - 12)
    }

    private func label(_ v: [Double]) -> String {
        guard let mi = v.indices.min(by: { v[$0] < v[$1] }) else { return "Ingen saldo" }
        return "Saldo de neste \(v.count) dagene, lavest " + F51.kr(v[mi]) + " " + F51.dl(series[mi].0)
    }
}

struct Plan51Days: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let c: Cal51
    let series: [(String, Double)]

    var body: some View {
        let acc: Int? = m.acc
        let days: [CalDay51] = c.days.filter { (d: CalDay51) -> Bool in d.today || d.items.contains { acc == nil || $0.accountId == acc } }
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Neste \(c.days.count) dager").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                if days.isEmpty { F51Note(text: "Ingen faste trekk i perioden.") }
                ForEach(days) { (d: CalDay51) in day(d, acc) }
                F51Note(text: "Kilder: abonnementer, faste utgifter, gjentakende trekk funnet i transaksjonene og inntekter som kommer hver måned. Samme tjeneste telles bare én gang.")
                    .padding(.top, 6)
            }
        }
    }

    private func day(_ d: CalDay51, _ acc: Int?) -> some View {
        let its: [CalItem51] = d.items.filter { acc == nil || $0.accountId == acc }
        let bal: Double? = series.first(where: { $0.0 == d.date })?.1
        return VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(d.label).font(PF.ui(13.5, .bold)).foregroundStyle(d.today ? p.lab : p.ink)
                Spacer()
                if let bal { Text("Saldo " + F51.kr(bal)).font(PF.mono(11.5)).foregroundStyle(bal < 0 ? p.lab : p.mut) }
            }
            if its.isEmpty { Text("Ingen trekk i dag").font(PF.ui(12)).foregroundStyle(p.mut) }
            ForEach(its) { (it: CalItem51) in
                F51Line(title: it.name, sub: it.kindLabel + (it.account.isEmpty || acc != nil ? "" : " · " + it.account),
                        value: F51.krS(it.amount), valueColor: it.amount > 0 ? p.pos : nil)
            }
        }
        .padding(.vertical, 6)
        .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
    }
}
