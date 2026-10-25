import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): Planlegging – Skatt, Priser og Abonnementsjeger ----------------
 Fasit: public/finans/js/plan51.js (skattView, prisView, jaktView). */

/* ---------- Skatt ---------- */

struct Plan51Skatt: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }

    var body: some View {
        let t: Tax51 = m.tax ?? Tax51()
        VStack(alignment: .leading, spacing: 12) {
            if !t.reminder.isEmpty { reminder(t) }
            PCard {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            PLabel(text: "Skattehjelp · inntektsåret \(t.year)")
                            F51Big(value: F51.kr(t.value), small: "anslått skatteverdi av " + F51.kr(t.deduction) + " i fradrag")
                        }
                        Spacer(minLength: 8)
                        yearMenu(t)
                    }
                    F51Note(text: Plan51Skatt.disc(t))
                    HStack(spacing: 8) {
                        F51Btn(title: "Del CSV", icon: "square.and.arrow.up") { Task { await m.exportTax(store, html: false) } }
                        F51Btn(title: "Utskrift / PDF", icon: "printer") { Task { await m.exportTax(store, html: true) } }
                    }
                }
            }
            F51Grid {
                ForEach(t.items) { (i: TaxItem51) in Plan51TaxRow(i: i) }
            }
            Plan51TaxForm(year: t.year, profile: t.profile)
        }
    }

    private func reminder(_ t: Tax51) -> some View {
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                PLabel(text: "Skattemeldingen")
                F51Note(text: t.reminder)
                if let u = URL(string: t.reminderUrl), u.scheme == "https" {
                    Link(destination: u) {
                        Text("skatteetaten.no ›").font(PF.ui(13, .bold)).foregroundStyle(p.lab).frame(minHeight: 44)
                    }
                }
            }
        }
    }

    nonisolated static func disc(_ t: Tax51) -> String {
        let extra: String = t.ratesNote.isEmpty ? "" : " " + t.ratesNote
        return "Forbehold: " + t.disclaimer + extra
    }

    private func yearMenu(_ t: Tax51) -> some View {
        let y0: Int = Calendar.current.component(.year, from: Date())
        return Menu {
            ForEach([y0, y0 - 1, y0 - 2], id: \.self) { (y: Int) in
                Button(String(y)) { m.year = y; Task { await m.reload(store) } }
            }
        } label: {
            Text(String(t.year) + " ▾").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 12).frame(minHeight: 34)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .frame(minHeight: 44)
        }
        .accessibilityLabel("Inntektsår \(t.year)")
    }
}

struct Plan51TaxRow: View {
    @Environment(\.paper) private var p
    let i: TaxItem51
    @State private var open: Bool = false

    var body: some View {
        let src: (String, F51Tone) = i.sourceLabel
        let skf: Bool = i.kind == "skattefradrag"
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Text(i.title).font(PF.ui(15, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    F51Tag(text: src.0, tone: src.1)
                }
                F51Big(value: F51.kr(skf ? i.basis : i.deduction), small: (skf ? "grunnlag" : "fradrag") + " · verdi " + F51.kr(i.value))
                if !i.note.isEmpty { F51Note(text: i.note) }
                if !i.orgs.isEmpty { F51Note(text: i.orgs) }
                if !i.missing.isEmpty { F51Note(text: i.missing, red: true) }
                if !i.sources.isEmpty {
                    DisclosureGroup(isExpanded: $open) {
                        ForEach(Array(i.sources.enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, String, Double))) in
                            F51Line(title: pair.element.1, sub: pair.element.0, value: F51.kr(pair.element.2, 2))
                        }
                    } label: {
                        Text("\(i.sources.count) transaksjoner").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                    }
                    .tint(p.ink)
                }
            }
        }
    }
}

/// «Det du vet best selv» – lagres bare for brukeren (PUT /fin51/tax/profile).
struct Plan51TaxForm: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let year: Int
    let profile: [String: Any]

    @State private var km: String = ""
    @State private var days: String = "230"
    @State private var loan: String = ""
    @State private var union: String = ""
    @State private var bsu: String = ""
    @State private var ips: String = ""
    @State private var gifts: String = ""
    @State private var remind: Bool = true
    @State private var filled: Int = -1

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Det du vet best selv").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                F51Note(text: "Brukes i anslaget for \(year). Lagres bare for deg.")
                F51Field(label: "Avstand til jobben, én vei (km)", text: $km, placeholder: "0", keyboard: .decimalPad)
                F51Field(label: "Arbeidsdager i året", text: $days, placeholder: "230", keyboard: .numberPad)
                F51Field(label: "Renter på lån (kr, hvis ikke i transaksjonene)", text: $loan, keyboard: .decimalPad)
                F51Field(label: "Fagforening (kr, i tillegg til transaksjonene)", text: $union, keyboard: .decimalPad)
                F51Field(label: "BSU-innskudd i året (kr)", text: $bsu, keyboard: .decimalPad)
                F51Field(label: "IPS-innskudd i året (kr)", text: $ips, keyboard: .decimalPad)
                giftsField
                Toggle(isOn: $remind) {
                    Text("Påminnelse når skattemeldingen kommer (mars) og før fristen (april)").font(PF.ui(13.5)).foregroundStyle(p.ink)
                }
                .tint(p.pos)
                F51Btn(title: "Lagre", kind: .ink) { save() }
            }
        }
        .onAppear { fill() }
        .onChange(of: year) { (_: Int, _: Int) in fill() }
    }

    private var giftsField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Andre gaver (én per linje: «Organisasjon: beløp»)").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            TextEditor(text: $gifts)
                .font(PF.ui(14)).foregroundStyle(p.ink)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 80)
                .padding(8)
                .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
                .accessibilityLabel("Andre gaver")
        }
    }

    private func s(_ k: String) -> String {
        guard let v = JS.num(profile, k), v != 0 else { return "" }
        return v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(v)
    }

    private func fill() {
        if filled == year { return }
        filled = year
        km = s("commuteKm")
        days = JS.int(profile, "workDays").map { String($0) } ?? "230"
        loan = s("loanInterest")
        union = s("union")
        bsu = s("bsu")
        ips = s("ips")
        gifts = JS.list(profile, "gifts").map { (g: [String: Any]) -> String in
            (JS.str(g, "org") ?? "") + ": " + (JS.str(g, "amount") ?? "")
        }.joined(separator: "\n")
        remind = JS.bool(profile, "remind") ?? true
    }

    private func save() {
        let list: [[String: Any]] = gifts.split(separator: "\n").compactMap { (line: Substring) -> [String: Any]? in
            let parts: [Substring] = line.split(separator: ":", maxSplits: 1)
            guard parts.count == 2 else { return nil }
            let org: String = parts[0].trimmingCharacters(in: .whitespaces)
            guard !org.isEmpty, let a = F51.num(String(parts[1])), a > 0 else { return nil }
            return ["org": org, "amount": a]
        }
        let b: [String: Any] = ["commuteKm": F51.num(km) ?? 0, "workDays": F51.num(days) ?? 230, "loanInterest": F51.num(loan) ?? 0,
                                "union": F51.num(union) ?? 0, "bsu": F51.num(bsu) ?? 0, "ips": F51.num(ips) ?? 0, "gifts": list, "remind": remind]
        Task { await m.saveTax(store, b) }
    }
}

/* ---------- Priser ---------- */

struct Plan51Pris: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    @State private var q: String = ""

    var body: some View {
        let d: Prices51 = m.prices ?? Prices51()
        VStack(alignment: .leading, spacing: 12) {
            PCard {
                VStack(alignment: .leading, spacing: 6) {
                    PLabel(text: "Billigste butikk for det du kjøper")
                    Text(d.basketText).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    ForEach(Array(d.basket.enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, String, String))) in
                        F51Line(title: pair.element.0, sub: pair.element.1, value: pair.element.2, valueColor: pair.offset == 0 ? p.pos : nil)
                    }
                    F51Note(text: "\(d.receipts) kvitteringer · \(d.count) varer · \(d.raised) har økt minst 5 %")
                }
            }
            tools
            if d.items.isEmpty {
                PCard { F51Note(text: m.q.isEmpty ? "Ingen varelinjer ennå. Skann kvitteringer med varelinjer, så følger FinansHub prisene for deg." : "Ingen varer passer søket.") }
            }
            F51Grid {
                ForEach(d.items) { (i: PriceItem51) in Plan51PriceRow(i: i) }
            }
        }
        .onAppear { q = m.q }
    }

    private var tools: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(p.mut).accessibilityHidden(true)
                TextField("Søk etter vare eller butikk", text: $q)
                    .font(PF.ui(14)).foregroundStyle(p.ink)
                    .submitLabel(.search)
                    .onSubmit { m.q = q.trimmingCharacters(in: .whitespaces); Task { await m.reload(store) } }
            }
            .padding(.horizontal, 12).frame(minHeight: 44)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            Menu {
                ForEach([("change", "Mest økt"), ("count", "Mest kjøpt"), ("name", "Navn")], id: \.0) { (o: (String, String)) in
                    Button(o.1) { m.sort = o.0; Task { await m.reload(store) } }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.ink).round50()
            }
            .accessibilityLabel("Sorter")
        }
    }
}

struct Plan51PriceRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let i: PriceItem51

    var body: some View {
        let open: Bool = m.openPrice == i.key
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                Button { Task { await m.togglePrice(i.key, store) } } label: { head }
                    .buttonStyle(.plain)
                    .accessibilityHint(open ? "Skjul prishistorikken" : "Vis prishistorikken")
                if open { detail }
            }
        }
    }

    private var head: some View {
        let c: Color = i.changePct >= 1 ? p.lab : (i.changePct <= -1 ? p.pos : p.mut)
        return VStack(alignment: .leading, spacing: 3) {
            Text(i.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text(n2(i.lastPrice) + " kr/" + i.unit + " · " + i.lastStore + " · \(i.count) kjøp").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Text(i.changeText).font(PF.ui(13, .semibold)).foregroundStyle(c).fixedSize(horizontal: false, vertical: true)
            if !i.cheapest.isEmpty { Text(i.cheapest).font(PF.ui(12)).foregroundStyle(p.mut) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var detail: some View {
        if let pts = m.pricePoints[i.key] {
            Plan51PriceChart(points: pts).frame(height: 120)
            ForEach(i.stores) { (s: PriceStore51) in
                F51Line(title: s.store, sub: "sist " + F51.dl(s.lastDate) + " · laveste " + n2(s.min) + " kr · \(s.count) kjøp", value: n2(s.last) + " kr")
            }
        } else {
            F51Loading()
        }
    }
}

/// Pris over tid, én linje per butikk.
struct Plan51PriceChart: View {
    @Environment(\.paper) private var p
    let points: [(String, String, Double)]

    private static let tints: [String] = ["#b23a2a", "#2f7a4f", "#3a6ea5", "#a0671a", "#7a4fa0"]

    var body: some View {
        let stores: [String] = points.reduce(into: [String]()) { (a: inout [String], x: (String, String, Double)) in if !a.contains(x.1) { a.append(x.1) } }
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { (g: GeometryProxy) in
                ZStack {
                    ForEach(Array(stores.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                        line(pair.element, Color(hex: Plan51PriceChart.tints[pair.offset % 5]), g.size)
                    }
                }
            }
            legend(stores)
        }
        .accessibilityElement()
        .accessibilityLabel("Pris over tid i \(stores.count) butikker")
    }

    private func line(_ store: String, _ c: Color, _ size: CGSize) -> some View {
        let v: [Double] = points.map(\.2)
        let lo: Double = (v.min() ?? 0) * 0.95
        let hi: Double = (v.max() ?? 1) * 1.05
        let t0: Double = parseDay(points.first?.0 ?? "")?.timeIntervalSince1970 ?? 0
        let t1: Double = Swift.max(t0 + 1, parseDay(points.last?.0 ?? "")?.timeIntervalSince1970 ?? t0 + 1)
        let mine: [(String, String, Double)] = points.filter { $0.1 == store }
        let pts: [CGPoint] = mine.map { (x: (String, String, Double)) -> CGPoint in
            let t: Double = parseDay(x.0)?.timeIntervalSince1970 ?? t0
            let px: CGFloat = CGFloat((t - t0) / (t1 - t0)) * (size.width - 20) + 10
            let py: CGFloat = size.height - 10 - CGFloat((x.2 - lo) / Swift.max(0.01, hi - lo)) * (size.height - 20)
            return CGPoint(x: px, y: py)
        }
        return ZStack {
            Path { (path: inout Path) in
                for (i, pt) in pts.enumerated() { if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) } }
            }
            .stroke(c, lineWidth: 2)
            ForEach(Array(pts.enumerated()), id: \.offset) { (pair: (offset: Int, element: CGPoint)) in
                Circle().fill(c).frame(width: 6, height: 6).position(pair.element)
            }
        }
    }

    private func legend(_ stores: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(Array(stores.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                    HStack(spacing: 5) {
                        Circle().fill(Color(hex: Plan51PriceChart.tints[pair.offset % 5])).frame(width: 8, height: 8)
                        Text(pair.element).font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                }
            }
        }
    }
}

/* ---------- Abonnementsjeger ---------- */

struct Plan51Jakt: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }

    var body: some View {
        let h: Hunter51 = m.hunter ?? Hunter51()
        VStack(alignment: .leading, spacing: 12) {
            PCard {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            PLabel(text: "Abonnementsjeger")
                            F51Big(value: F51.kr(h.monthly), small: "per måned å spare (" + F51.kr(h.yearly) + " i året)")
                        }
                        Spacer(minLength: 8)
                        weeksMenu(h)
                    }
                    F51Note(text: h.text + (h.note.isEmpty ? "" : ". " + h.note))
                    if h.dismissed > 0 {
                        F51Btn(title: "Vis \(h.dismissed) skjulte igjen") { Task { await m.undismiss(store) } }
                    }
                }
            }
            if h.findings.isEmpty {
                PCard { F51Note(text: "Ingen funn akkurat nå. Appen ser etter prisøkninger i banktrekkene, doble abonnementer og abonnementer uten bruk.") }
            }
            F51Grid {
                ForEach(h.findings) { (f: Finding51) in Plan51Finding(f: f) }
            }
            F51Note(text: "Oppsigelsesteksten skrives av en lokal modell på hjemmeserveren og sendes aldri automatisk.")
        }
    }

    private func weeksMenu(_ h: Hunter51) -> some View {
        Menu {
            ForEach([4, 6, 8, 12], id: \.self) { (w: Int) in
                Button("\(w) uker") { m.weeks = w; Task { await m.reload(store) } }
            }
        } label: {
            Text("Ubrukt etter \(h.weeks) uker ▾").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(minHeight: 34)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .frame(minHeight: 44)
        }
    }
}

struct Plan51Finding: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let f: Finding51

    var body: some View {
        let lab: (String, F51Tone) = f.label
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        F51Tag(text: lab.0, tone: lab.1)
                        Text(f.title).font(PF.ui(15, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    if f.saving > 0 {
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(F51.kr(f.saving)).font(PF.mono(13)).foregroundStyle(p.pos)
                            Text("per mnd").font(PF.ui(11)).foregroundStyle(p.mut)
                        }
                    }
                }
                F51Note(text: f.text)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        if f.kind == "unused" && f.subId != nil { F51Btn(title: "Jeg bruker den") { Task { await m.used(f, store) } } }
                        if f.subId != nil { F51Btn(title: "Skriv oppsigelse", icon: "doc.text") { Task { await m.writeDraft(f, store) } } }
                        F51Btn(title: "Skjul") { Task { await m.dismiss(f, store) } }
                    }
                }
                if let d = m.draft, d.key == f.key { Plan51DraftView(d: d) }
            }
        }
    }
}

struct Plan51DraftView: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Plan51 { Plan51.shared }
    let d: Draft51

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if d.busy {
                F51Loading(text: "Skriver med den lokale modellen …")
            } else {
                Text("Emne: " + d.subject).font(PF.ui(13, .bold)).foregroundStyle(p.ink).textSelection(.enabled)
                Text(d.text).font(PF.ui(13.5)).foregroundStyle(p.ink).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                F51Note(text: source)
                HStack(spacing: 8) {
                    F51Btn(title: "Kopier", kind: .ink, icon: "doc.on.doc") { m.copyDraft() }
                    F51Btn(title: "Lukk") { m.draft = nil }
                }
            }
        }
        .padding(.top, 4)
    }

    private var source: String {
        let mdl: String = d.model.isEmpty ? "" : " (" + d.model + ")"
        let a: String = d.engine == "lokal" ? "Skrevet av lokal modell" + mdl : "Mal"
        let b: String = d.notice.isEmpty ? "" : " · " + d.notice
        let c: String = d.note.isEmpty ? "" : ". " + d.note
        return a + b + c
    }
}
