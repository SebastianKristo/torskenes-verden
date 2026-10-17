import SwiftUI

/* ---------------- Felles ---------------- */

struct Kpi: View {
    let label: String
    let value: String
    var tint: Color? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(tint ?? .white.opacity(0.65)).lineLimit(1)
            Text(value).font(.system(.title3, design: .monospaced).weight(.semibold)).foregroundStyle(tint ?? .white).lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading).glass(20, tint: tint.map { $0.opacity(0.25) })
    }
}

struct Pill: View {
    let text: String
    var color: Color = .white
    var body: some View {
        Text(text).font(.caption.weight(.semibold)).foregroundStyle(color).padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
    }
}

private let blue = Color(hex: "#A9C3FF")

/* ---------------- Subscription OS ---------------- */

private let cycles = [("monthly", "Månedlig"), ("yearly", "Årlig"), ("biennial", "Hvert 2. år")]

struct SubView: View {
    @Environment(Store.self) private var store
    @State private var adding = false
    @State private var name = ""
    @State private var plan = ""
    @State private var price = ""
    @State private var cycle = "monthly"
    @State private var next = ""
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Subscription OS", trailing: {
                    Button { adding.toggle() } label: { Image(systemName: adding ? "xmark" : "plus").frame(width: 40, height: 40) }.buttonStyle(.plain).glass(20)
                })
                if let e = store.moduleError { Empty(text: e) }
                if let s = store.subs {
                    HStack(spacing: 10) { Kpi(label: "Per måned", value: "\(n0(s.monthly ?? 0)) kr"); Kpi(label: "Per år", value: "\(n0(s.yearly ?? 0)) kr") }
                    Kpi(label: "Lite brukt, kan sies opp", value: "\(n0(s.lowUse ?? 0)) kr/mnd", tint: .accentLight)
                } else if store.moduleError == nil { ProgressView().padding(30) }
                if adding { form }
                if let s = store.subs {
                    if s.items.isEmpty { Empty(text: "Ingen abonnementer ennå.") }
                    VStack(spacing: 0) {
                        ForEach(Array(s.items.enumerated()), id: \.element.id) { i, sub in
                            if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                            row(sub)
                        }
                    }
                    .glass(24)
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
        .refreshable { await store.reloadModule() }
    }

    private var form: some View {
        let p = Double(price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: "."))
        return VStack(alignment: .leading, spacing: 10) {
            Text("Nytt abonnement").font(.headline)
            TextField("Tjeneste", text: $name).padding(.horizontal, 14).frame(height: 46).glass(16)
            TextField("Plan", text: $plan).padding(.horizontal, 14).frame(height: 46).glass(16)
            HStack(spacing: 10) {
                TextField("kr per trekk", text: $price).keyboardType(.decimalPad).padding(.horizontal, 14).frame(height: 46).glass(16)
                TextField("Neste trekk (dd.mm)", text: $next).keyboardType(.numbersAndPunctuation).padding(.horizontal, 14).frame(height: 46).glass(16)
            }
            Picker("Trekk", selection: $cycle) { ForEach(cycles, id: \.0) { Text($0.1).tag($0.0) } }.pickerStyle(.segmented)
            if let p {
                Text(cycle == "yearly" ? "= \(n0(p / 12)) kr/mnd · \(n0(p)) kr/år" : cycle == "biennial" ? "= \(n0(p / 24)) kr/mnd · \(n0(p / 2)) kr/år" : "= \(n0(p)) kr/mnd · \(n0(p * 12)) kr/år")
                    .font(.footnote).foregroundStyle(.white.opacity(0.65))
            }
            Button { store.addSub(name: name, plan: plan, price: price, cycle: cycle, next: next); adding = false; name = ""; plan = ""; price = ""; next = "" } label: {
                Text("Legg til").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 48)
            }
            .buttonStyle(.plain).glass(24, tint: .accent).disabled(name.isEmpty || p == nil)
            Text("Fra kvittering eller transaksjoner: bruk FinansHub på PC.").font(.caption).foregroundStyle(.white.opacity(0.55))
        }
        .padding(16).glass(24)
    }

    private func row(_ s: Sub) -> some View {
        let active = s.active ?? true, low = s.lowUse ?? false
        return HStack(spacing: 12) {
            Logo(domain: s.domain, name: s.name, color: "#FF7A3D", size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name + (s.plan.map { " · \($0)" } ?? "")).fontWeight(.medium).lineLimit(1)
                Text([s.nextDate.map { "Neste \(ddmm($0))" }, s.usageNote, cycles.first { $0.0 == s.cycle }?.1].compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote).foregroundStyle(low ? Color.accentLight : .white.opacity(0.6)).lineLimit(1)
                AiLine(text: s.aiShort)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 4) {
                Text(n0(s.price ?? 0)).font(.system(.body, design: .monospaced).weight(.semibold))
                Pill(text: !active ? "Sagt opp" : low ? "Si opp" : "Aktiv", color: !active ? .white.opacity(0.6) : low ? .accentLight : .positive)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .contentShape(Rectangle())
        .contextMenu {
            if active { Button("Marker som sagt opp") { store.setSubActive(s, false) } } else { Button("Aktiver igjen") { store.setSubActive(s, true) } }
        }
    }
}

/* ---------------- Boliger (delte mapper) ---------------- */

private let roleLabel = ["owner": "Eier", "editor": "Kan redigere", "edit": "Kan redigere", "viewer": "Kan se", "view": "Kan se", "member": "Medlem"]

struct FoldersView: View {
    @Environment(Store.self) private var store
    var body: some View {
        if let f = store.folder { FolderDetailView(f: f) } else {
            ScrollView {
                VStack(spacing: 12) {
                    ModuleHeader(title: "Boliger")
                    Text("Boliger, hytter og felles utgifter. Brukere ser bare mapper de er medlem av.").font(.footnote).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading)
                    if let e = store.moduleError { Empty(text: e) }
                    if let list = store.folders {
                        if list.isEmpty { Empty(text: "Ingen boliger ennå. Opprett en i FinansHub på PC.") }
                        ForEach(list) { f in
                            Button { store.openFolder(f.id) } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: f.type == "Hytte" ? "mountain.2" : "house").font(.title3).foregroundStyle(Color.ink).frame(width: 44, height: 44).background(Color.accent, in: RoundedRectangle(cornerRadius: 14))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(f.name).fontWeight(.semibold).lineLimit(1)
                                        Text([f.type, f.address, (f.members ?? []).map(\.display).joined(separator: ", ")].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                            .font(.footnote).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                                    }
                                    Spacer()
                                    Text("\(n0(f.total ?? 0)) kr").font(.system(.body, design: .monospaced).weight(.semibold))
                                }
                                .padding(16).glass(24)
                            }
                            .buttonStyle(.plain)
                        }
                    } else if store.moduleError == nil { ProgressView().padding(30) }
                }
                .padding(.horizontal, 18).padding(.bottom, 30)
            }
        }
    }
}

struct FolderDetailView: View {
    @Environment(Store.self) private var store
    let f: Folder
    @State private var adding = false
    @State private var desc = ""
    @State private var amount = ""
    @State private var payer: String? = nil
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: f.name, back: { store.folder = nil }, trailing: {
                    if !f.readOnly { Button { adding.toggle() } label: { Image(systemName: adding ? "xmark" : "plus").frame(width: 40, height: 40) }.buttonStyle(.plain).glass(20) }
                })
                Text([f.type, f.address, f.access.map { roleLabel[$0] ?? $0 }].compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading)
                if f.readOnly {
                    Text("Du har lesetilgang. Be en eier om redigeringstilgang for å legge til utgifter.").font(.footnote).padding(14).frame(maxWidth: .infinity, alignment: .leading).glass(18, tint: Color.accent.opacity(0.3))
                }
                HStack(spacing: 10) { Kpi(label: "Totalt", value: "\(n0(f.total ?? 0)) kr", tint: .accentLight); Kpi(label: "Poster", value: "\(f.count ?? f.entries?.count ?? 0)") }
                if let b = f.balances, !b.isEmpty {
                    SectionLabel(text: "Fordeling")
                    Flow(spacing: 8) {
                        ForEach(Array(b.enumerated()), id: \.offset) { _, x in
                            let v = x.balance ?? 0
                            Pill(text: "\(x.name ?? "?") \(v >= 0 ? "+" : "−")\(n0(v)) kr", color: v >= 0 ? .positive : .accentLight)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                if adding && !f.readOnly {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Ny utgift").font(.headline)
                        TextField("Beskrivelse", text: $desc).padding(.horizontal, 14).frame(height: 46).glass(16)
                        TextField("Beløp", text: $amount).keyboardType(.decimalPad).padding(.horizontal, 14).frame(height: 46).glass(16)
                        Menu { ForEach(f.members ?? [], id: \.self) { m in Button(m.display) { payer = m.display } } } label: { Label("Betalt av \(payer ?? "meg")", systemImage: "person") }
                        Button { store.addFolderEntry(desc, amount, paidBy: payer); adding = false; desc = ""; amount = "" } label: {
                            Text("Legg til").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 48)
                        }
                        .buttonStyle(.plain).glass(24, tint: .accent).disabled(desc.isEmpty || amount.isEmpty)
                    }
                    .padding(16).glass(24)
                }
                if let cats = f.categories, !cats.isEmpty {
                    SectionLabel(text: "Kategorier")
                    let max = cats.map { $0.amount ?? 0 }.max() ?? 1
                    VStack(spacing: 10) {
                        ForEach(Array(cats.enumerated()), id: \.offset) { _, c in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack { Text(c.name ?? "–"); Spacer(); Text("\(n0(c.amount ?? 0)) kr").font(.system(.subheadline, design: .monospaced)) }
                                Bar(value: (c.amount ?? 0) / Swift.max(1, max), color: .accent)
                            }
                        }
                    }
                    .padding(16).glass(24)
                }
                if let ps = f.projects, !ps.isEmpty {
                    SectionLabel(text: "Prosjekter")
                    ForEach(Array(ps.enumerated()), id: \.offset) { _, p in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack { Text(p.name ?? "–").fontWeight(.semibold); Spacer(); Text("\(n0(p.spent ?? 0)) / \(n0(p.budget ?? 0))").font(.system(.subheadline, design: .monospaced)).foregroundStyle(.white.opacity(0.7)) }
                            if let v = p.vendor { Text(v).font(.footnote).foregroundStyle(.white.opacity(0.6)) }
                            if let b = p.budget, b > 0 { Bar(value: (p.spent ?? 0) / b, color: .accent) }
                            Text("\(n0(Swift.max(0, (p.budget ?? 0) - (p.spent ?? 0)))) kr gjenstår").font(.footnote).foregroundStyle(.white.opacity(0.6))
                            ForEach(Array((p.installments ?? []).enumerated()), id: \.offset) { _, ins in
                                HStack {
                                    Image(systemName: ins.isPaid ? "checkmark.circle.fill" : "clock").foregroundStyle(ins.isPaid ? Color.positive : .accentLight)
                                    Text((ins.label ?? "Avdrag") + (ins.due.map { " · \(ddmm($0))" } ?? "")).font(.subheadline)
                                    Spacer()
                                    Text(n0(ins.amount ?? 0)).font(.system(.subheadline, design: .monospaced))
                                }
                            }
                        }
                        .padding(16).glass(24)
                    }
                }
                if let bills = f.bills, !bills.isEmpty {
                    SectionLabel(text: "Faste regninger")
                    VStack(spacing: 0) {
                        ForEach(Array(bills.enumerated()), id: \.offset) { i, b in
                            if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(b.name ?? "–").fontWeight(.medium)
                                    Text([b.freq, b.payer.map { "betales av \($0)" }, b.lastPaid.map { "sist \(ddmm($0))" }].compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.white.opacity(0.6))
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    if let a = b.amount { Text(n0(a)).font(.system(.body, design: .monospaced)) }
                                    if let n = b.nextDue { Text("neste \(ddmm(n))").font(.caption).foregroundStyle(Color.accentLight) }
                                }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 12)
                        }
                    }
                    .glass(24)
                }
                SectionLabel(text: "Utgifter")
                let entries = f.entries ?? []
                if entries.isEmpty { Empty(text: "Ingen utgifter i mappen ennå.") } else {
                    VStack(spacing: 0) {
                        ForEach(Array(entries.enumerated()), id: \.element.id) { i, e in
                            if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                            HStack(spacing: 12) {
                                Logo(domain: e.domain, name: e.description ?? "", color: "#FF7A3D", size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(e.description ?? "–").fontWeight(.medium).lineLimit(1)
                                    Text([ddmm(e.date), e.paidBy.map { "betalt av \($0)" }, e.split, e.category].compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                                    AiLine(text: e.aiShort)
                                }
                                Spacer(minLength: 6)
                                Text(n2(e.amount ?? 0)).font(.system(.body, design: .monospaced).weight(.semibold))
                            }
                            .padding(.horizontal, 16).padding(.vertical, 12)
                        }
                    }
                    .glass(24)
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
    }
}

struct Bar: View {
    let value: Double
    var color: Color = .accent
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.12))
                Capsule().fill(color).frame(width: g.size.width * Swift.min(1, Swift.max(0.02, value)))
            }
        }
        .frame(height: 6)
    }
}

/* ---------------- Finn-handler ---------------- */

struct FinnView: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Finn-handler")
                if let e = store.moduleError { Empty(text: e) }
                if let f = store.finn {
                    HStack(spacing: 10) {
                        Kpi(label: "Kjøpt i år", value: "\(n0(f.bought ?? 0)) kr", tint: blue)
                        Kpi(label: "Solgt i år", value: "\(n0(f.sold ?? 0)) kr", tint: .positive)
                        Kpi(label: "Pågående", value: "\(f.ongoing ?? 0)")
                    }
                    if f.items.isEmpty { Empty(text: "Ingen Finn-handler ennå. Lim inn en e-post fra Finn i FinansHub på PC.") }
                    ForEach(f.items) { d in
                        let sold = d.role == "sold"
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 10) {
                                Pill(text: sold ? "Solgt" : "Kjøpt", color: sold ? .positive : blue)
                                Text(d.item ?? "–").fontWeight(.semibold).lineLimit(1)
                                Spacer()
                                Text(n0(d.amount ?? 0)).font(.system(.body, design: .monospaced).weight(.semibold)).foregroundStyle(sold ? Color.positive : .white)
                            }
                            Text([d.counterpart, d.date.map { ddmm($0) }].compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.white.opacity(0.6))
                            if let steps = d.steps, !steps.isEmpty {
                                Flow(spacing: 6) {
                                    ForEach(Array(steps.enumerated()), id: \.offset) { _, st in
                                        Pill(text: (st.done == true ? "✓ " : "") + (st.t ?? ""), color: st.done == true ? .positive : .white.opacity(0.7))
                                    }
                                }
                            }
                        }
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
                    }
                } else if store.moduleError == nil { ProgressView().padding(30) }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
    }
}
