import SwiftUI
import PDFKit
import UniformTypeIdentifiers

/* ---------------- Felles for Mer ---------------- */

private func kr(_ v: Double) -> String { "\(neg0(v)) kr" }
private func sgn(_ v: Double) -> String { v < 0 ? "−" : "+" }
private func qty(_ q: Double) -> String {
    if q == q.rounded(), abs(q) < 1e12 { return String(Int(q)) }
    return String(format: "%.4f", q).replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression).replacingOccurrences(of: ".", with: ",")
}

/// Undertekst under tittelen.
struct SubLine: View {
    let text: String
    var body: some View { Text(text).font(.footnote).foregroundStyle(.white.opacity(0.65)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6) }
}

/// Stort tall øverst på en side (oransje glass).
struct PageHero<Extra: View>: View {
    let label: String
    let value: String
    let sub: String?
    let extra: Extra
    init(_ label: String, _ value: String, _ sub: String? = nil, @ViewBuilder extra: () -> Extra) {
        self.label = label; self.value = value; self.sub = sub; self.extra = extra()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.subheadline).foregroundStyle(.white.opacity(0.8))
            Text(value).font(.system(size: 36, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.5)
            if let sub, !sub.isEmpty { Text(sub).font(.footnote).foregroundStyle(.white.opacity(0.75)) }
            extra
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading).glass(28, tint: Color.accent.opacity(0.35))
    }
}

extension PageHero where Extra == EmptyView {
    init(_ label: String, _ value: String, _ sub: String? = nil) { self.init(label, value, sub, extra: { EmptyView() }) }
}

/// Rader i ett glasskort med skillelinjer.
struct CardList<Item, Row: View>: View {
    let items: [Item]
    let row: (Item) -> Row
    init(_ items: [Item], @ViewBuilder row: @escaping (Item) -> Row) { self.items = items; self.row = row }
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, it in
                if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                row(it)
            }
        }
        .glass(24)
    }
}

/// Én rad: tittel, undertekst (og ✦ AI-linje), verdi til høyre.
struct ItemLine: View {
    let title: String
    var sub: String? = nil
    var value: String? = nil
    var valueColor: Color = .white
    var domain: String? = nil
    var ai: String? = nil
    var chevron = false
    var body: some View {
        HStack(spacing: 12) {
            if let domain { Logo(domain: domain, name: title, color: "#FF7A3D", size: 36) }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).fontWeight(.medium).lineLimit(1)
                if let sub, !sub.isEmpty { Text(sub).font(.footnote).foregroundStyle(.white.opacity(0.6)).lineLimit(2) }
                AiLine(text: ai)
            }
            Spacer(minLength: 8)
            if let value { Text(value).font(.system(.subheadline, design: .monospaced).weight(.semibold)).foregroundStyle(valueColor).lineLimit(1) }
            if chevron { Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.white.opacity(0.45)) }
        }
        .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
    }
}

/// Navn, verdi og en stolpe (sparemål, fordeling, kategorier).
struct BarLine: View {
    let label: String
    let value: String
    let fraction: Double
    var color: Color = .accent
    var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { Text(label).lineLimit(1); Spacer(); Text(value).font(.system(.footnote, design: .monospaced)).foregroundStyle(.white.opacity(0.75)) }
            Bar(value: fraction.isFinite ? fraction : 0, color: color)
            if let sub { Text(sub).font(.caption).foregroundStyle(.white.opacity(0.6)) }
        }
    }
}

private func chip(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
    Button(action: act) {
        Text(t).font(.subheadline).lineLimit(1).padding(.horizontal, 14).frame(height: 36).foregroundStyle(on ? Color.ink : .white).contentShape(Capsule())
    }
    .buttonStyle(.plain).glass(18, tint: on ? .accent : nil)
}

private func primary(_ t: String, enabled: Bool = true, _ act: @escaping () -> Void) -> some View {
    Button(action: act) { Text(t).fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 52).contentShape(Capsule()) }
        .buttonStyle(.plain).glass(26, tint: .accent).disabled(!enabled).opacity(enabled ? 1 : 0.5)
}

private func secondary(_ t: String, _ icon: String? = nil, _ act: @escaping () -> Void) -> some View {
    Button(action: act) {
        HStack(spacing: 8) { if let icon { Image(systemName: icon) }; Text(t).fontWeight(.semibold) }.frame(maxWidth: .infinity, minHeight: 50).contentShape(Capsule())
    }
    .buttonStyle(.plain).glass(25)
}

private struct Loading: View {
    var body: some View { ProgressView().frame(maxWidth: .infinity).padding(30) }
}

/* ---------------- Mer ---------------- */

private struct MoreTile: Identifiable {
    let module: Module?
    let sub: String
    var badge = 0
    var id: String { module?.rawValue ?? "search" }
    var title: String { module?.rawValue ?? "AI-søk" }
    var icon: String { module?.icon ?? "sparkle.magnifyingglass" }
}

/// Mer: alt fra FinansHub på nettsiden, som fliser med levende tall.
struct MoreView: View {
    @Environment(Store.self) private var store
    @State private var q = ""
    var body: some View {
        let b = store.boot
        let fast = store.recurring.map { l in l.filter(\.isActive).map(\.monthly).reduce(0, +) }
        let tiles: [MoreTile] = [
            MoreTile(module: .upload, sub: "\(b?.reviewCount ?? 0) til gjennomgang", badge: b?.reviewCount ?? 0),
            MoreTile(module: .fast, sub: fast.map { "\(kr($0))/mnd" } ?? "Trekk og regninger"),
            MoreTile(module: .accounts, sub: b.map { kr($0.accounts.map(\.balance).reduce(0, +)) } ?? "Saldo og sparemål"),
            MoreTile(module: .stocks, sub: store.stocks?.summary?.value.map(kr) ?? "Trading 212"),
            MoreTile(module: .reports, sub: "Måned og år"),
            MoreTile(module: .sub, sub: store.subs?.monthly.map { "\(kr($0))/mnd" } ?? "Abonnementer"),
            MoreTile(module: .folders, sub: store.folders.map { "\($0.count) boliger" } ?? "Bolig og felles"),
            MoreTile(module: .finn, sub: store.finn?.ongoing.map { "\($0) pågående" } ?? "Kjøp og salg"),
            MoreTile(module: .imports, sub: "CSV, XLSX, tekst"),
            MoreTile(module: nil, sub: "Spør om alt"),
        ]
        ScrollView {
            VStack(spacing: 12) {
                HStack { Text("Mer").font(.system(size: 34, weight: .bold)); Spacer(); Avatar() }.padding(.top, 6)
                SubLine(text: "Alt fra FinansHub på nettsiden")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(tiles) { t in
                        Button { if let m = t.module { store.openSub(m) } else { store.go(.search) } } label: { tile(t) }
                            .buttonStyle(GlassPress())
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("✦ Spør AI").fontWeight(.semibold).foregroundStyle(Color.accentLight)
                    Text("Søker i transaksjoner, kvitteringer og varelinjer").font(.footnote).foregroundStyle(.white.opacity(0.65))
                    TextField("Hvor mye brukte jeg på kaffe?", text: $q).submitLabel(.search).onSubmit(ask)
                        .padding(.horizontal, 16).frame(height: 48).glass(24)
                    primary("Spør", enabled: !q.trimmingCharacters(in: .whitespaces).isEmpty, ask)
                }
                .padding(16).glass(26)
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .tracksScroll(store)
        .refreshable { try? await store.reload() }
    }

    private func tile(_ t: MoreTile) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: t.icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.accentLight)
                    .frame(width: 40, height: 40).background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 13))
                Spacer()
                if t.badge > 0 {
                    Text("\(t.badge)").font(.caption.weight(.bold)).foregroundStyle(Color.ink).padding(.horizontal, 8).padding(.vertical, 2).background(Color.accent, in: Capsule())
                }
            }
            Text(t.title).fontWeight(.semibold).lineLimit(1).minimumScaleFactor(0.8)
            Text(t.sub).font(.caption).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
        }
        .foregroundStyle(.white)
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
    }

    private func ask() {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        q = ""
        store.go(.search)
        store.ask(t)
    }
}

/* ---------------- Søk (✦ AI) ---------------- */

private let aiSuggestions = ["Hvor mye har jeg brukt på kaffe?", "Når kjøpte jeg lyspærer?", "Mat i oktober", "Hva har jeg betalt for lading?"]
/// Forslag før søk når serveren ikke sender egne (GET /search/suggestions).
private let fallbackGroups = [
    SuggestGroup(title: "Butikker", items: ["Sist jeg var på Biltema", "Alle kjøp på Rema 1000", "Hvor ofte handler jeg på Kiwi?"]),
    SuggestGroup(title: "Varer i kvitteringer", items: ["Kvitteringer med tomater", "Når kjøpte jeg lyspærer?", "Kaffe i kvitteringene"]),
    SuggestGroup(title: "Beløp og perioder", items: ["Over 500 kr i oktober", "Største utgift denne måneden", "Til gjennomgang"]),
]

/// Søk-fanen: ✦ AI eller vanlig søk. Feltet får fokus med en gang, så tastaturet kommer opp. Enter sender spørsmålet.
struct SearchView: View {
    @Environment(Store.self) private var store
    @State private var q = ""
    @FocusState private var focused: Bool
    var body: some View {
        @Bindable var s = store
        let r = store.ai
        let ai = store.searchMode == "ai"
        let provider = store.boot?.settings.provider == "gemini" ? "Gemini" : "Ollama"
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack { Text(store.tabName(.search)).font(.system(size: 34, weight: .bold)); Spacer(); Avatar() }.padding(.top, 6)
                Picker("Søketype", selection: $s.searchMode) {
                    Text("✦ AI").tag("ai")
                    Text("Vanlig søk").tag("plain")
                }
                .pickerStyle(.segmented)
                SubLine(text: ai ? "\(provider) · leser også innholdet i kvitteringene" : "Butikker, kategorier, notater og varelinjer i kvitteringene")
                HStack(spacing: 10) {
                    if ai { Text("✦").font(.system(size: 18)).foregroundStyle(Color.accentLight) } else { Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.6)) }
                    TextField(ai ? "f.eks. Når kjøpte jeg lyspærer?" : "f.eks. tomater, Biltema, over 500 kr", text: $q).focused($focused).submitLabel(.search).onSubmit { send(q) }
                        .textInputAutocapitalization(.never)
                    if !q.isEmpty {
                        Button { q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.white.opacity(0.5)).frame(width: 30, height: 30) }.buttonStyle(.plain).accessibilityLabel("Tøm feltet")
                    }
                }
                .padding(.horizontal, 18).frame(height: 56).glass(28)
                primary(store.aiBusy ? "Søker …" : ai ? "Spør AI" : "Søk", enabled: !q.trimmingCharacters(in: .whitespaces).isEmpty && !store.aiBusy) { send(q) }
                if let n = store.aiNote {
                    Label(n, systemImage: "info.circle").font(.footnote).foregroundStyle(Color.accentLight)
                }
                if store.aiBusy { Loading() }
                if let r, !store.aiBusy {
                    results(r)
                } else if !store.aiBusy {
                    ForEach(store.suggestGroups.isEmpty ? fallbackGroups : store.suggestGroups, id: \.title) { g in
                        SectionLabel(text: g.title)
                        Flow(spacing: 8) { ForEach(g.items, id: \.self) { x in chip(x, false) { q = x; send(x) } } }
                    }
                }
                if !store.aiHistory.isEmpty {
                    HStack {
                        SectionLabel(text: "Tidligere spørsmål")
                        Button("Tøm") { store.clearAiHistory() }.font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight).padding(.top, 6)
                    }
                    CardList(Array(store.aiHistory.prefix(8))) { t in
                        Button { q = t; send(t) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "clock.arrow.circlepath").foregroundStyle(.white.opacity(0.55))
                                Text(t).lineLimit(1)
                                Spacer()
                            }
                            .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .tracksScroll(store)
        .onAppear {
            if q.isEmpty { q = store.aiQuery }
            Task { try? await Task.sleep(for: .milliseconds(350)); focused = true }
        }
    }

    /// Svar, butikker, treff (med hvorfor de traff) og «Prøv også» / «Flere forslag» under treffene.
    @ViewBuilder private func results(_ r: AiAnswer) -> some View {
        let plain = r.mode == "plain"
        VStack(alignment: .leading, spacing: 6) {
            Text(plain ? "Vanlig søk" : "✦ Svar" + (r.engine.map { " · \($0)" } ?? "")).font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight)
            Text((r.text ?? "").isEmpty ? "Fant ingen treff. Prøv et butikknavn, en kategori eller en vare fra kvitteringen." : r.text ?? "")
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).glass(26, tint: Color.accent.opacity(0.25))
        if let st = r.stores, !st.isEmpty {
            SectionLabel(text: "Butikker med dette navnet")
            CardList(st) { x in
                ItemLine(title: x.name ?? "–", sub: [x.count.map { "\($0) kjøp" }, x.last.map { "sist \(ddmm($0))" }].compactMap { $0 }.joined(separator: " · "), value: nil, valueColor: .white, chevron: false)
            }
        }
        let hits = r.hits ?? []
        if !hits.isEmpty {
            SectionLabel(text: "Treff (\(hits.count))")
            CardList(hits) { h in
                Button { if let id = h.txId { focused = false; store.showTx(id, hint: h.description) } } label: {
                    // Andre linje: hvorfor det traff («I kvitteringen · Tomater 500 g 24,90 kr»).
                    let meta = [h.date.map { ddmm($0) }, h.source].compactMap { $0 }.joined(separator: " · ")
                    ItemLine(title: h.description ?? "Treff", sub: [meta, h.reason ?? ""].filter { !$0.isEmpty }.joined(separator: "\n"),
                             value: h.amount.map(signed), valueColor: (h.amount ?? 0) > 0 ? .positive : .white, chevron: h.txId != nil)
                }
                .buttonStyle(.plain).disabled(h.txId == nil)
            }
        }
        if let f = r.followUps, !f.isEmpty {
            SectionLabel(text: "Prøv også")
            Flow(spacing: 8) { ForEach(f, id: \.self) { x in chip(x, false) { q = x; send(x) } } }
        }
        let more = (r.suggestions ?? []).filter { !(r.followUps ?? []).contains($0) }
        SectionLabel(text: "Flere forslag")
        Flow(spacing: 8) { ForEach(more.isEmpty ? aiSuggestions : more, id: \.self) { x in chip(x, false) { q = x; send(x) } } }
    }

    private func send(_ s: String) {
        let t = s.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        focused = false
        store.ask(t)
    }
}

/* ---------------- Faste utgifter ---------------- */

struct FastView: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Faste utgifter")
                if let e = store.moduleError { Empty(text: e) }
                if let list = store.recurring {
                    let active = list.filter(\.isActive)
                    let m = active.map(\.monthly).reduce(0, +)
                    HStack(spacing: 10) {
                        Kpi(label: "Per måned · \(active.count) aktive", value: kr(m))
                        Kpi(label: "Per år", value: kr(m * 12))
                    }
                    if list.isEmpty { Empty(text: "Ingen faste utgifter funnet ennå.") } else {
                        SectionLabel(text: "Trekk")
                        CardList(list.sorted { ($0.day ?? 99) < ($1.day ?? 99) }) { r in
                            HStack(spacing: 0) {
                                Button { store.openDetail(detail(r)) } label: {
                                    ItemLine(title: r.name, sub: [r.day.map { "Den \($0). hver måned" }, r.category].compactMap { $0 }.joined(separator: " · "),
                                             value: kr(abs(r.amount)), valueColor: r.isActive ? .white : .white.opacity(0.5))
                                }
                                .buttonStyle(.plain)
                                Toggle(r.name, isOn: Binding(get: { r.isActive }, set: { store.setRecurring(r, active: $0) })).labelsHidden().tint(.accent).padding(.trailing, 14)
                            }
                        }
                    }
                    SubLine(text: "Oppdages automatisk fra gjentakende transaksjoner. Skru av det som ikke lenger trekkes.")
                } else if store.moduleError == nil { Loading() }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .tracksScroll(store)
        .refreshable { await store.reloadModule() }
    }

    private func detail(_ r: Recurring) -> DetailInfo {
        var rows: [DetailRow] = []
        if let d = r.day { rows.append(DetailRow(k: "Trekkdato", v: "Den \(d). hver måned")) }
        rows += [DetailRow(k: "Kategori", v: r.category ?? "–"), DetailRow(k: "Per måned", v: kr(r.monthly)), DetailRow(k: "Per år", v: kr(r.monthly * 12)),
                 DetailRow(k: "Neste", v: ddmmyyyy(r.next)), DetailRow(k: "Status", v: r.isActive ? "Aktiv" : "Av")]
        return DetailInfo(title: r.name, sub: r.category, value: kr(abs(r.amount)), valueSub: "per trekk", groups: [DetailGroup(title: "Trekk", rows: rows)], txQuery: r.name)
    }
}

/* ---------------- Kontoer ---------------- */

struct AccountsView: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Kontoer")
                if let e = store.moduleError { Empty(text: e) }
                if let b = store.boot {
                    PageHero("Total saldo", kr(b.accounts.map(\.balance).reduce(0, +)), "\(b.accounts.count) kontoer")
                    SectionLabel(text: "Kontoer")
                    CardList(b.accounts) { a in
                        Button { store.openDetail(detail(a)) } label: {
                            ItemLine(title: a.name, sub: [a.type.isEmpty ? nil : a.type, a.last4.map { "•••• \($0)" }].compactMap { $0 }.joined(separator: " · "),
                                     value: kr(a.balance), valueColor: a.balance < 0 ? .accentLight : .white, chevron: true)
                        }
                        .buttonStyle(.plain)
                    }
                    let goals = b.goals ?? []
                    if !goals.isEmpty {
                        SectionLabel(text: "Sparemål")
                        VStack(spacing: 16) {
                            ForEach(Array(goals.enumerated()), id: \.offset) { _, g in
                                let saved = g.saved ?? 0
                                let target = g.target ?? 0
                                let done = target > 0 && saved >= target
                                BarLine(label: g.name ?? "Sparemål", value: "\(n0(saved)) / \(n0(target)) kr", fraction: target > 0 ? saved / target : 0,
                                        color: done ? Color.positive : (g.color.map { Color(hex: $0) } ?? Color.accent),
                                        sub: done ? "Nådd ✓" : target > 0 ? "\(Int(saved / target * 100)) % · \(kr(target - saved)) igjen" : nil)
                            }
                        }
                        .padding(16).glass(24)
                    }
                } else if store.moduleError == nil { Loading() }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .tracksScroll(store)
        .refreshable { await store.reloadModule() }
    }

    private func detail(_ a: Account) -> DetailInfo {
        var rows = [DetailRow(k: "Type", v: a.type.isEmpty ? "–" : a.type)]
        if let l = a.last4 { rows.append(DetailRow(k: "Kontonummer", v: "•••• \(l)")) }
        rows.append(DetailRow(k: "Saldo", v: "\(n2(a.balance)) kr"))
        return DetailInfo(title: a.name, sub: a.type, value: kr(a.balance), valueSub: "Saldo", groups: [DetailGroup(title: "Konto", rows: rows)])
    }
}

/* ---------------- Aksjer (Trading 212) ---------------- */

private let periods: [(String, Int)] = [("1D", 2), ("1U", 7), ("1M", 31), ("1Å", 366), ("Alt", Int.max)]

struct StocksView: View {
    @Environment(Store.self) private var store
    var body: some View {
        let st = store.stocks
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Aksjer", trailing: {
                    Button { store.syncStocks() } label: {
                        Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 16, weight: .semibold)).foregroundStyle(.white).frame(width: 44, height: 44).contentShape(Circle())
                    }
                    .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Synk nå")
                })
                SubLine(text: "Trading 212 · \(st?.status ?? "Invest")")
                if let e = store.moduleError { Empty(text: e) }
                if let st {
                    if st.configured != true && st.mock != true {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Ikke koblet til Trading 212").fontWeight(.semibold)
                            Text("Lag en API-nøkkel hos Trading 212 under Innstillinger → API (Beta). Gi bare lesetilgang (account, portfolio, history:orders, history:dividends), og lås den gjerne til IP-en til homelaben. Nøkkel og secret legges inn i FinansHub på PC og lagres bare på serveren.")
                                .font(.footnote).foregroundStyle(.white.opacity(0.7))
                            if let e = st.error, !e.isEmpty { Text(e).font(.footnote).foregroundStyle(Color.accentLight) }
                        }
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
                    }
                    if let sm = st.summary { content(st, sm) }
                } else if store.moduleError == nil { Loading() }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .tracksScroll(store)
        .refreshable { await store.reloadModule() }
    }

    @ViewBuilder private func content(_ st: Stocks, _ sm: StockSummary) -> some View {
        let value = sm.value ?? sm.total ?? 0
        let result = sm.result ?? 0
        let invested = sm.invested ?? 0
        let days = periods.first { $0.0 == store.stockPeriod }?.1 ?? 31
        let all = (st.history ?? []).compactMap(\.value)
        let hist = Array(all.suffix(min(days, all.count)))
        let low = hist.min() ?? 0
        let pos = st.positions ?? []
        let day = pos.map { ($0.value ?? 0) * ($0.dayPct ?? 0) / 100 }.reduce(0, +)
        let year = String(Calendar.current.component(.year, from: Date()))
        let divYear = (st.dividends ?? []).filter { ($0.date ?? "").hasPrefix(year) }
        PageHero("Porteføljeverdi", kr(value), "\(sgn(result))\(kr(abs(result)))" + (invested > 0 ? " (\(pct(result / invested * 100)))" : "") + " totalt") {
            if hist.count > 1 { Spark(values: hist.map { $0 - low }, color: .white).frame(height: 56).padding(.vertical, 4) }
            HStack(spacing: 6) {
                ForEach(periods, id: \.0) { k, _ in
                    Button { store.stockPeriod = k } label: {
                        Text(k).font(.footnote.weight(.semibold)).foregroundStyle(store.stockPeriod == k ? Color.ink : .white)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(store.stockPeriod == k ? Color.white : Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Kpi(label: "I dag", value: "\(sgn(day))\(kr(abs(day)))", tint: day < 0 ? Color.accentLight : Color.positive)
            Kpi(label: "Kontanter", value: kr(sm.cash ?? 0))
            Kpi(label: "Utbytte i år · \(divYear.count)", value: kr(divYear.compactMap(\.amount).reduce(0, +)))
            Kpi(label: "Avkastning", value: "\(sgn(result))\(kr(abs(result)))", tint: result < 0 ? Color.accentLight : Color.positive)
        }
        if !pos.isEmpty {
            SectionLabel(text: "Posisjoner")
            CardList(pos) { p in
                let plPct = p.plPct ?? 0
                Button { store.openDetail(detail(p, value, divYear)) } label: {
                    ItemLine(title: p.name ?? p.ticker ?? p.symbol ?? "–", sub: "\(qty(p.quantity ?? 0)) stk · snitt \(n0(p.avg ?? 0)) · \(sgn(plPct))\(pct(abs(plPct)))",
                             value: kr(p.value ?? 0), chevron: true)
                }
                .buttonStyle(.plain)
            }
            if value > 0 {
                SectionLabel(text: "Fordeling")
                VStack(spacing: 14) {
                    ForEach(Array(pos.sorted { ($0.value ?? 0) > ($1.value ?? 0) }.enumerated()), id: \.offset) { _, p in
                        BarLine(label: p.name ?? p.ticker ?? "–", value: "\(Int((p.value ?? 0) / value * 100)) %", fraction: (p.value ?? 0) / value)
                    }
                }
                .padding(16).glass(24)
            }
        }
        let orders = Array((st.orders ?? []).prefix(20))
        if !orders.isEmpty {
            SectionLabel(text: "Ordrer")
            CardList(orders) { o in
                ItemLine(title: "\(o.side ?? "") \(o.symbol ?? "")", sub: "\(ddmmyyyy(o.date)) · \(qty(o.quantity ?? 0)) stk à \(n2(o.price ?? 0))", value: kr(o.value ?? 0))
            }
        }
        let divs = st.dividends ?? []
        if !divs.isEmpty {
            SectionLabel(text: "Utbytte")
            CardList(divs) { d in ItemLine(title: d.symbol ?? "–", sub: ddmmyyyy(d.date), value: "+\(n2(d.amount ?? 0))", valueColor: .positive) }
        }
        primary("Synk nå") { store.syncStocks() }
        SubLine(text: "API-nøkkel og secret ligger på serveren. Endres i FinansHub på PC under Innstillinger → Aksjer · Trading 212.")
    }

    private func detail(_ p: Position, _ total: Double, _ divYear: [Dividend]) -> DetailInfo {
        let q = p.quantity ?? 0, avg = p.avg ?? 0, pl = p.pl ?? 0, plPct = p.plPct ?? 0, dayPct = p.dayPct ?? 0
        let sym = p.symbol ?? p.ticker ?? ""
        return DetailInfo(title: p.name ?? sym, sub: "\(sym) · Trading 212", value: kr(p.value ?? 0), valueSub: "\(sgn(pl))\(kr(abs(pl))) (\(sgn(plPct))\(pct(abs(plPct)))) siden kjøp", groups: [
            DetailGroup(title: "Posisjon", rows: [
                DetailRow(k: "Antall", v: "\(qty(q)) stk"), DetailRow(k: "Snittkurs", v: "\(n2(avg)) kr"), DetailRow(k: "Kurs nå", v: "\(n2(p.price ?? 0)) kr"),
                DetailRow(k: "Kostpris", v: kr(q * avg)), DetailRow(k: "Andel av portefølje", v: total > 0 ? "\(Int((p.value ?? 0) / total * 100)) %" : "–"),
            ]),
            DetailGroup(title: "Utvikling", rows: [
                DetailRow(k: "I dag", v: "\(sgn(dayPct))\(pct(abs(dayPct)))"), DetailRow(k: "Totalt", v: "\(sgn(plPct))\(pct(abs(plPct)))"),
                DetailRow(k: "Utbytte i år", v: kr(divYear.filter { $0.symbol == sym }.compactMap(\.amount).reduce(0, +))),
            ]),
        ])
    }
}

/* ---------------- Rapporter ---------------- */

struct ReportsView: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var csv: URL?
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Rapporter")
                HStack(spacing: 8) {
                    chip("Denne måneden", !store.reportYear) { store.pickReportYear(false) }
                    chip("Hittil i år", store.reportYear) { store.pickReportYear(true) }
                    Spacer()
                }
                if let e = store.moduleError { Empty(text: e) }
                if let r = store.report { content(r) } else if store.moduleError == nil { Loading() }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .tracksScroll(store)
        .refreshable { await store.reloadModule() }
    }

    @ViewBuilder private func content(_ r: Report) -> some View {
        let cur = String(isoDay(Date()).prefix(7))
        let months = r.months ?? []
        let thisMonth = months.first { $0.month == cur } ?? months.first
        let inn = store.reportYear ? months.compactMap(\.inn).reduce(0, +) : (thisMonth?.inn ?? 0)
        let ut = store.reportYear ? months.compactMap(\.ut).reduce(0, +) : (thisMonth?.ut ?? r.total ?? 0)
        let period = store.reportYear ? "Hittil i år" : "Denne måneden"
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Kpi(label: "Inn", value: kr(inn), tint: .positive)
            Kpi(label: "Ut", value: kr(ut))
            Kpi(label: "Spart", value: kr(inn - ut))
            Kpi(label: "Sparerate", value: inn > 0 ? "\(Int((inn - ut) / inn * 100)) %" : "–")
        }
        let cats = r.byCategory ?? []
        if !cats.isEmpty {
            let mx = max(1, cats.compactMap(\.amount).max() ?? 1)
            SectionLabel(text: "Per kategori")
            VStack(spacing: 14) {
                ForEach(Array(cats.enumerated()), id: \.offset) { _, c in
                    BarLine(label: c.category ?? "–", value: kr(c.amount ?? 0), fraction: (c.amount ?? 0) / mx, color: Color(hex: c.color ?? "#FF7A3D"))
                }
            }
            .padding(16).glass(24)
        }
        let shops = r.merchants ?? []
        if !shops.isEmpty {
            SectionLabel(text: "Topp butikker")
            CardList(shops) { m in
                Button {
                    store.openDetail(DetailInfo(title: m.name ?? "Butikk", sub: "Topp butikk", value: "−\(kr(m.amount ?? 0))", valueSub: period,
                                                groups: [DetailGroup(title: "Butikk", rows: [DetailRow(k: "Antall kjøp", v: "\(m.count ?? 0)"), DetailRow(k: "Brukt", v: kr(m.amount ?? 0))])], txQuery: m.name))
                } label: { ItemLine(title: m.name ?? "–", sub: "\(m.count ?? 0) kjøp", value: "−\(kr(m.amount ?? 0))", chevron: true) }
                .buttonStyle(.plain)
            }
        }
        if !months.isEmpty {
            SectionLabel(text: "Måned for måned")
            CardList(months) { m in
                let mi = m.inn ?? 0
                let mu = m.ut ?? 0
                let key = m.month ?? ""
                Button {
                    store.openDetail(DetailInfo(title: "\(monthLabel(key)) \(key.prefix(4))", sub: "Månedsrapport", value: kr(mi - mu), valueSub: mi > 0 ? "Sparerate \(Int((mi - mu) / mi * 100)) %" : nil,
                                                groups: [DetailGroup(title: "Sammendrag", rows: [DetailRow(k: "Inn", v: kr(mi)), DetailRow(k: "Ut", v: kr(mu)), DetailRow(k: "Spart", v: kr(mi - mu))])]))
                } label: { ItemLine(title: monthLabel(key), sub: "Inn +\(n0(mi)) · ut −\(n0(mu))", value: kr(mi - mu), valueColor: mi - mu < 0 ? .accentLight : .positive, chevron: true) }
                .buttonStyle(.plain)
            }
        }
        HStack(spacing: 10) {
            if let csv {
                ShareLink(item: csv) { Label("Del CSV", systemImage: "square.and.arrow.up").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50) }
                    .buttonStyle(.plain).glass(25)
            } else {
                secondary("Eksporter CSV", "tablecells") { Task { csv = await store.exportCsv() } }
            }
            secondary("PDF-rapport", "doc.richtext") {
                let b = store.base.hasSuffix("/") ? String(store.base.dropLast()) : store.base
                if let u = URL(string: b + "/finans/?desktop=1#/rap") { openURL(u) }
            }
        }
    }
}

/* ---------------- Import ---------------- */

private let importTypes: [UTType] = [UTType.commaSeparatedText, .plainText, .spreadsheet, .data] + [UTType(filenameExtension: "xlsx"), UTType(filenameExtension: "xls")].compactMap { $0 }

struct ImportView: View {
    @Environment(Store.self) private var store
    @State private var picking = false
    var body: some View {
        @Bindable var s = store
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ModuleHeader(title: "Import")
                SubLine(text: "Kontoutskrift som CSV, XLSX eller innlimt tekst. DNB-format renses automatisk.")
                secondary(store.importFiles.isEmpty ? "Velg filer (.xlsx, .csv, .txt)" : "\(store.importFiles.count) fil(er) valgt", "folder") { picking = true }
                if !store.importFiles.isEmpty {
                    CardList(Array(store.importFiles.enumerated()).map { ($0.offset, $0.element.name) }) { f in
                        HStack {
                            Image(systemName: "doc").foregroundStyle(.white.opacity(0.6))
                            Text(f.1).lineLimit(1)
                            Spacer()
                            Button { if f.0 < store.importFiles.count { store.importFiles.remove(at: f.0); store.importResult = nil } } label: {
                                Image(systemName: "xmark").font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.6)).frame(width: 32, height: 32)
                            }
                            .buttonStyle(.plain).accessibilityLabel("Fjern \(f.1)")
                        }
                        .padding(.horizontal, 16).padding(.vertical, 8)
                    }
                }
                ZStack(alignment: .topLeading) {
                    if store.importText.isEmpty {
                        Text("…eller lim inn tekst fra nettbanken").foregroundStyle(.white.opacity(0.4)).padding(.horizontal, 5).padding(.vertical, 8).allowsHitTesting(false)
                    }
                    TextEditor(text: $s.importText).scrollContentBackground(.hidden).frame(minHeight: 120).font(.system(.footnote, design: .monospaced))
                }
                .padding(12).glass(20)
                .onChange(of: store.importText) { _, _ in store.importResult = nil }
                primary("Forhåndsvis", enabled: (!store.importFiles.isEmpty || !store.importText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) && !store.busy) { store.runImport(commit: false) }
                if let r = store.importResult {
                    let rows = r.rows ?? []
                    ForEach(r.errors ?? [], id: \.self) { e in Text(e).font(.footnote).foregroundStyle(Color.accentLight).padding(.horizontal, 6) }
                    let dup = rows.filter { $0.duplicate == true }.count
                    SubLine(text: "\(rows.count) poster" + ((r.skipped ?? 0) > 0 ? " · \(r.skipped ?? 0) hoppet over" : "") + (dup > 0 ? " · \(dup) finnes fra før" : ""))
                    if !rows.isEmpty {
                        SectionLabel(text: "Forhåndsvisning")
                        CardList(Array(rows.prefix(200))) { row in
                            let desc = row.description ?? row.raw ?? "–"
                            ItemLine(title: desc, sub: [ddmm(row.date), row.category, row.raw == desc ? nil : row.raw, row.duplicate == true ? "finnes fra før" : nil].compactMap { $0 }.joined(separator: " · "),
                                     value: signed(row.amount ?? 0), valueColor: (row.amount ?? 0) > 0 ? .positive : .white, domain: row.domain, ai: row.aiShort)
                                .opacity(row.duplicate == true ? 0.5 : 1)
                        }
                    }
                    let n = rows.count - dup
                    primary("Importer \(n) poster", enabled: n > 0 && !store.busy) { store.runImport(commit: true) }
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 60)
        }
        .scrollDismissesKeyboard(.interactively)
        .fileImporter(isPresented: $picking, allowedContentTypes: importTypes, allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            var files: [(name: String, data: Data)] = []
            for url in urls {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                if let d = try? Data(contentsOf: url) { files.append((name: url.lastPathComponent, data: d)) }
            }
            if !files.isEmpty { store.importFiles = files; store.importResult = nil }
        }
    }
}

/* ---------------- Detaljside ---------------- */

/// Detalj for en rad på en Mer-side: felt og tilhørende transaksjoner.
struct DetailView: View {
    @Environment(Store.self) private var store
    var body: some View {
        if let d = store.detail {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ModuleHeader(title: d.title, back: { store.detail = nil; store.detailTx = nil })
                    if let sub = d.sub, !sub.isEmpty { SubLine(text: sub) }
                    if let v = d.value { PageHero(d.sub ?? d.title, v, d.valueSub) }
                    ForEach(d.groups, id: \.self) { g in
                        if !g.rows.isEmpty {
                            SectionLabel(text: g.title)
                            CardList(g.rows) { r in
                                HStack(alignment: .firstTextBaseline) {
                                    Text(r.k).foregroundStyle(.white.opacity(0.65))
                                    Spacer(minLength: 12)
                                    Text(r.v).fontWeight(.medium).multilineTextAlignment(.trailing)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 14)
                            }
                        }
                    }
                    if d.txQuery != nil {
                        SectionLabel(text: "Transaksjoner")
                        if let list = store.detailTx {
                            if list.isEmpty { Empty(text: "Ingen transaksjoner funnet.") } else {
                                CardList(list) { t in
                                    Button { store.showTx(t.id) } label: { TxRow(tx: t) }.buttonStyle(.plain)
                                }
                            }
                        } else { Loading() }
                    }
                }
                .padding(.horizontal, 18).padding(.bottom, 40)
            }
        }
    }
}

/* ---------------- Legg til / rediger transaksjon ---------------- */

struct TxEditView: View {
    @Environment(Store.self) private var store
    let scan: ScanActions
    var body: some View {
        if let e = store.editing {
            TxForm(d: Binding(get: { store.editing ?? e }, set: { store.editing = $0 }), scan: scan)
        }
    }
}

private struct TxForm: View {
    @Environment(Store.self) private var store
    @Binding var d: TxDraft
    let scan: ScanActions
    @State private var confirm = false
    var body: some View {
        let all = store.boot?.categories ?? []
        let kind = all.filter { $0.kind == (d.income ? "income" : "expense") }
        let cats = kind.isEmpty ? all : kind
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ModuleHeader(title: d.id == nil ? "Ny transaksjon" : "Rediger", back: { store.editing = nil })
                Picker("Type", selection: $d.income) {
                    Text("Utgift").tag(false)
                    Text("Inntekt").tag(true)
                }
                .pickerStyle(.segmented)
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel(text: "Beskrivelse")
                    TextField("f.eks. REMA 1000", text: $d.description).padding(.horizontal, 16).frame(height: 50).glass(22)
                }
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 6) {
                        SectionLabel(text: "Beløp (kr)")
                        TextField("0,00", text: $d.amount).keyboardType(.decimalPad).font(.system(.body, design: .monospaced)).padding(.horizontal, 16).frame(height: 50).glass(22)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        SectionLabel(text: "Dato")
                        DatePicker("Dato", selection: $d.date, displayedComponents: .date).labelsHidden().environment(\.locale, Locale(identifier: "nb_NO"))
                            .frame(maxWidth: .infinity, minHeight: 50).glass(22)
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Kategori")
                    FlowChips(cats: cats, selected: d.categoryId) { d.categoryId = $0 }
                }
                if let accounts = store.boot?.accounts, !accounts.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: "Konto")
                        Flow(spacing: 8) { ForEach(accounts) { a in chip(a.name, d.accountId == a.id) { d.accountId = a.id } } }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Kvittering")
                    if let r = d.receipt { SubLine(text: r == "booked" ? "Kvittering vedlagt" : "Kvittering til gjennomgang") }
                    secondary("Legg ved kvittering", "paperclip") { scan.choices() }
                    SubLine(text: "Kvitteringen legges i opplastingskøen og kobles til transaksjonen når den bokføres (samme beløp og dato).")
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Bolig")
                    Flow(spacing: 8) {
                        chip("Ingen", d.folderId == nil) { d.folderId = nil }
                        ForEach(store.folders ?? []) { f in chip(f.name, d.folderId == f.id) { d.folderId = f.id } }
                    }
                    SubLine(text: "Utgiften vises også i boligen og fordeles på medlemmene.")
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "Notat")
                    TextField("Valgfritt", text: $d.note, axis: .vertical).lineLimit(2...6).padding(16).glass(22)
                }
                VStack(spacing: 10) {
                    primary(d.id == nil ? "Legg til" : "Lagre", enabled: !store.busy) { store.saveTx(d) }
                    if d.id != nil {
                        Button { confirm = true } label: { Text("Slett transaksjon").fontWeight(.semibold).foregroundStyle(Color.domRed).frame(maxWidth: .infinity, minHeight: 50).contentShape(Capsule()) }
                            .buttonStyle(.plain).glass(25)
                    }
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 18).padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .confirmationDialog("Slette transaksjonen?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { if let id = d.id { store.deleteTx(id) } }
            Button("Avbryt", role: .cancel) {}
        } message: { Text("Den forsvinner fra liste, rapporter, budsjett og AI-søk.") }
    }
}

/* ---------------- Original kvittering og banktransaksjon ---------------- */

struct OriginalView: View {
    @Environment(Store.self) private var store
    @State private var data: Data?
    @State private var loading = false
    @State private var shareURL: URL?
    var body: some View {
        @Bindable var s = store
        let o = store.original
        let bank = store.originalTab == "bank"
        VStack(alignment: .leading, spacing: 12) {
            ModuleHeader(title: "Original", back: { store.original = nil })
            Picker("Vis", selection: $s.originalTab) {
                Text("Kvittering").tag("receipt")
                Text("Banktransaksjon").tag("bank")
            }
            .pickerStyle(.segmented)
            if bank {
                if let b = o?.bank {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            CardList(b.rows) { r in
                                HStack(alignment: .firstTextBaseline) { Text(r.k).foregroundStyle(.white.opacity(0.65)); Spacer(minLength: 12); Text(r.v).fontWeight(.medium).multilineTextAlignment(.trailing) }
                                    .padding(.horizontal, 16).padding(.vertical, 12)
                            }
                            if !b.raw.isEmpty {
                                SectionLabel(text: "Original fra banken")
                                Text(b.raw).font(.system(size: 12, design: .monospaced)).textSelection(.enabled).padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(20)
                                SubLine(text: "Teksten er bankens original, slik den var før navnevasking.")
                            }
                        }
                    }
                } else { missing("Ingen bankrad", "Transaksjonen er ikke importert fra banken.") }
            } else {
                if let f = o?.receipt, f.fileUrl != nil {
                    if let data {
                        if isPdf(f) { PDFKitView(data: data).clipShape(RoundedRectangle(cornerRadius: 22)) }
                        else if let img = UIImage(data: data) { ZoomImage(image: img) }
                        else { missing("Kan ikke vise filen", "Last den ned eller del den for å åpne den i en annen app.") }
                    } else if loading { Loading(); Spacer() } else { missing("Fant ikke filen", "Kvitteringsfilen kunne ikke hentes fra serveren.") }
                } else { missing("Ingen kvittering", "Det er ikke lagt ved noen kvittering for denne transaksjonen.") }
            }
            HStack(spacing: 10) {
                secondary("Last ned", "arrow.down.to.line") { download() }
                if let shareURL {
                    ShareLink(item: shareURL) { Label("Del", systemImage: "square.and.arrow.up").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50) }
                        .buttonStyle(.plain).glass(25)
                }
            }
            .disabled(bank ? o?.bank == nil : data == nil)
        }
        .padding(.horizontal, 18).padding(.bottom, 12)
        .task(id: "\(o?.receipt?.fileUrl ?? "")|\(store.originalTab)") { await prepare() }
    }

    private func missing(_ title: String, _ text: String) -> some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: "doc.questionmark").font(.system(size: 34)).foregroundStyle(.white.opacity(0.5))
            Text(title).fontWeight(.semibold)
            Text(text).font(.footnote).foregroundStyle(.white.opacity(0.65)).multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func isPdf(_ f: OriginalFile) -> Bool { (f.mime ?? "").contains("pdf") || (f.fileUrl ?? "").lowercased().hasSuffix(".pdf") }

    private var fileName: String {
        guard let f = store.original?.receipt else { return "kvittering" }
        let ext = isPdf(f) ? "pdf" : (f.mime ?? "").contains("png") ? "png" : (f.mime ?? "").contains("heic") ? "heic" : "jpg"
        return "kvittering.\(ext)"
    }

    private var bankText: String? {
        guard let b = store.original?.bank else { return nil }
        return (b.rows.map { "\($0.k): \($0.v)" } + ["", b.raw]).joined(separator: "\n")
    }

    private func prepare() async {
        shareURL = nil
        let tmp = FileManager.default.temporaryDirectory
        if store.originalTab == "bank" {
            guard let text = bankText else { return }
            let u = tmp.appendingPathComponent("banktransaksjon.txt")
            if (try? text.write(to: u, atomically: true, encoding: .utf8)) != nil { shareURL = u }
        } else {
            guard let path = store.original?.receipt?.fileUrl else { return }
            if data == nil {
                loading = true
                data = await store.bytes(path)
                loading = false
            }
            if let data {
                let u = tmp.appendingPathComponent(fileName)
                if (try? data.write(to: u)) != nil { shareURL = u }
            }
        }
    }

    private func download() {
        let stamp = Int(Date().timeIntervalSince1970)
        if store.originalTab == "bank" {
            if let t = bankText { store.saveToFiles(Data(t.utf8), name: "banktransaksjon-\(stamp).txt") }
        } else if let data {
            store.saveToFiles(data, name: fileName.replacingOccurrences(of: "kvittering.", with: "kvittering-\(stamp)."))
        }
    }
}

/// PDF med zoom (PDFKit).
struct PDFKitView: UIViewRepresentable {
    let data: Data
    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.displayMode = .singlePageContinuous
        v.backgroundColor = .clear
        v.document = PDFDocument(data: data)
        return v
    }
    func updateUIView(_ v: PDFView, context: Context) {}
}

/// Bilde med knipezoom, panorering og dobbelttrykk.
struct ZoomImage: View {
    let image: UIImage
    @State private var scale: CGFloat = 1
    @State private var last: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    var body: some View {
        Image(uiImage: image).resizable().scaledToFit()
            .scaleEffect(scale).offset(offset)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(MagnifyGesture()
                .onChanged { v in scale = min(6, max(1, last * v.magnification)) }
                .onEnded { _ in last = scale; if scale <= 1 { offset = .zero; lastOffset = .zero } })
            .simultaneousGesture(DragGesture()
                .onChanged { v in if scale > 1 { offset = CGSize(width: lastOffset.width + v.translation.width, height: lastOffset.height + v.translation.height) } }
                .onEnded { _ in lastOffset = offset })
            .onTapGesture(count: 2) {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    if scale > 1 { scale = 1; last = 1; offset = .zero; lastOffset = .zero } else { scale = 2.5; last = 2.5 }
                }
            }
            .background(Color.white.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .accessibilityLabel("Kvittering. Knip for å zoome, dobbelttrykk for å zoome inn eller ut.")
    }
}
