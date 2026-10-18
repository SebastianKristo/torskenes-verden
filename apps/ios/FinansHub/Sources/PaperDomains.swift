import SwiftUI

/* ---------------- Papir → Domener: toppkort, fire seksjoner (Oversikt, Publikum, Ytelse, Infra) og «Alle domener» ---------------- */

extension Store {
    /// «Alle domener»: tallene for hvert domene (høyst 12), hentet etter tur.
    func loadDomAll() async {
        let list = Array((domains ?? []).prefix(12))
        let range = domRange
        var out: [String: Analytics] = [:]
        for d in list {
            let enc = d.name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? d.name
            if let a = try? await api.module("/domains/api", "/\(enc)/analytics?range=\(range)", as: Analytics.self) {
                out[d.name] = a
                domAll = out
            }
        }
        domAll = out
    }

    func pickDomAll() {
        Haptics.shared.select()
        domAllMode = true
        Task { await self.loadDomAll() }
    }

    func pickDomainPaper(_ name: String) {
        Haptics.shared.select()
        domAllMode = false
        pickDomain(name)
    }

    func setDomRangePaper(_ r: String) {
        Haptics.shared.select()
        setRange(r)
        if domAllMode { Task { await self.loadDomAll() } }
    }
}

private func bytesText(_ b: Double) -> String {
    let f: (Double) -> String = { String(format: "%.1f", $0).replacingOccurrences(of: ".", with: ",") }
    return b >= 1e9 ? f(b / 1e9) + " GB" : b >= 1e6 ? f(b / 1e6) + " MB" : f(b / 1e3) + " kB"
}

/// Domener i Papir. Bare toppkortet overlapper bildeheaderen; resten er egne kort i full bredde.
struct PaperDomains: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(spacing: 10) {
            PaperDomTop()
            if let e = store.moduleError { PCard { Text(e).font(PF.ui(13.5)).foregroundStyle(p.lab) } }
            if store.domains?.isEmpty == true {
                PCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Ingen domener ennå.").font(PF.ui(14)).foregroundStyle(p.mut)
                        PInkButton(title: "+ Legg til domene", height: 44, full: true) { store.domainManager = true }
                    }
                }
            } else if store.domAllMode {
                PaperDomAllList()
            } else if let a = store.analytics {
                if a.mock == true { Text("Eksempeldata – legg inn Cloudflare-token i Homelab for ekte tall.").font(PF.ui(12)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading) }
                section(a)
            } else if store.moduleError == nil {
                ProgressView().padding(40)
            }
        }
        .sheet(isPresented: Binding(get: { store.domainManager }, set: { store.domainManager = $0 })) {
            DomainManager().presentationDetents([.large]).skinSheetBackground()
        }
    }

    @ViewBuilder private func section(_ a: Analytics) -> some View {
        switch store.paperTab {
        case "dpub": PaperDomAudience(a: a)
        case "dytl": PaperDomPerf(a: a)
        case "dinf": PaperDomInfra(a: a)
        default: PaperDomOverview(a: a)
        }
    }
}

/// Toppkortet: «DOMENE · N», domenene som en vannrett rad med kort (valgt = svart) og periodene som segmentert kontroll.
struct PaperDomTop: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    private static let ranges = [("1h", "1t"), ("24h", "24t"), ("7d", "7d"), ("30d", "30d")]

    var body: some View {
        let list = store.domains ?? []
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                PLabel(text: "Domene · \(list.count)")
                Spacer()
                Button { store.reloadDomain() } label: {
                    Image(systemName: "arrow.clockwise").font(.system(size: 13, weight: .semibold)).foregroundStyle(p.mut).frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Oppdater")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if list.count > 1 { chip("Oversikt", "Alle domener", store.domAllMode) { store.pickDomAll() } }
                    ForEach(list, id: \.name) { d in
                        chip(sourceName(d.source), d.name, !store.domAllMode && store.domain == d.name) { store.pickDomainPaper(d.name) }
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            HStack(spacing: 2) {
                ForEach(PaperDomTop.ranges, id: \.0) { k, n in
                    let on = store.domRange == k
                    Button { store.setDomRangePaper(k) } label: {
                        Text(n).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .background(on ? p.ink : Color.clear, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3)
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
    }

    private func chip(_ src: String, _ name: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            VStack(alignment: .leading, spacing: 2) {
                Text(src.uppercased()).font(PF.mono(9.5)).tracking(0.8).foregroundStyle(on ? p.bg.opacity(0.7) : p.mut).lineLimit(1)
                Text(name).font(PF.serif(16, medium: true)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .frame(minWidth: 120, alignment: .leading)
            .background(on ? p.ink : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(on ? p.ink : p.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Kort med etikett og innhold i Papir.
struct PDomCard<C: View>: View {
    @Environment(\.paper) private var p
    let title: String
    var trailing: String? = nil
    @ViewBuilder let content: () -> C
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: title)
                Spacer()
                if let trailing { Text(trailing).font(PF.ui(12)).foregroundStyle(p.mut) }
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Tall med etikett (KPI) i Papir.
struct PKpi: View {
    @Environment(\.paper) private var p
    let label: String
    let value: String
    var color: Color? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            Text(value).font(PF.serif(24, medium: true)).foregroundStyle(color ?? p.ink).lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Liggende søyler i Papir.
struct PBars: View {
    @Environment(\.paper) private var p
    let rows: [(String, Double)]
    var percent = false
    var color: Color? = nil
    var body: some View {
        if rows.isEmpty {
            Text("Ingen data").font(PF.ui(12.5)).foregroundStyle(p.mut)
        } else {
            let mx = Swift.max(1, rows.map(\.1).max() ?? 1)
            VStack(spacing: 9) {
                ForEach(Array(rows.prefix(8).enumerated()), id: \.offset) { _, r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(r.0).font(PF.ui(13.5)).foregroundStyle(p.ink).lineLimit(1)
                            Spacer()
                            Text(percent ? pct(r.1) : count(r.1)).font(PF.mono(11.5, bold: false)).foregroundStyle(p.mut)
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(p.line.opacity(0.6))
                                Capsule().fill(color ?? p.lab).frame(width: Swift.max(4, g.size.width * CGFloat(r.1 / mx)))
                            }
                        }
                        .frame(height: 6)
                    }
                }
            }
        }
    }
}

/* ---------- Oversikt ---------- */

struct PaperDomOverview: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let a: Analytics

    var body: some View {
        VStack(spacing: 10) {
            live
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                PKpi(label: "Besøkende", value: count(a.visitors ?? 0))
                PKpi(label: "Forespørsler", value: count(a.requests ?? 0))
                PKpi(label: "Data", value: bytesText(a.bytes ?? 0))
                PKpi(label: "Bufret", value: pct(a.cachedPct ?? 0))
            }
            PDomCard(title: "Trafikk", trailing: "bufret \(pct(a.cachedPct ?? 0))") {
                Spark(values: (a.series ?? []).map { $0.requests ?? 0 }, second: (a.series ?? []).map { $0.cached ?? 0 }, color: p.lab).frame(height: 120)
                if let s = a.series, s.count >= 2 {
                    HStack { Text(String((s.first?.t ?? "").prefix(10))); Spacer(); Text(String((s.last?.t ?? "").prefix(10))) }
                        .font(PF.ui(11)).foregroundStyle(p.mut)
                }
            }
        }
    }

    private var live: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Circle().fill(p.pos).frame(width: 8, height: 8)
                PLabel(text: "Sanntid · akkurat nå", color: p.pos)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(count(a.live?.visitors ?? 0)).font(PF.serif(40)).foregroundStyle(p.ink)
                Text("besøkende").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            Text("\(count(a.live?.requests ?? 0)) forespørsler · \(String(format: "%.1f", a.live?.mb ?? 0).replacingOccurrences(of: ".", with: ",")) MB")
                .font(PF.ui(12.5)).foregroundStyle(p.mut)
            Spark(values: a.live?.spark ?? (a.series ?? []).map { $0.visitors ?? 0 }, color: p.pos).frame(height: 40)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/* ---------- Publikum ---------- */

struct PaperDomAudience: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let a: Analytics
    @State private var countries: [MapCountry] = []
    @State private var loaded = false

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                PKpi(label: "Besøk", value: count(a.visitors ?? 0))
                PKpi(label: "Sidevisninger", value: count(a.pageviews ?? 0))
                PKpi(label: "Land", value: "\(a.countries?.count ?? 0)")
            }
            PDomCard(title: "Besøk per land") {
                if countries.isEmpty {
                    Text(loaded ? "Kartet kunne ikke lastes." : "Laster kartet …").font(PF.ui(12.5)).foregroundStyle(p.mut).frame(maxWidth: .infinity, minHeight: 120)
                } else {
                    WorldMapView(countries: countries, values: values, lo: 0xEADFCA, hi: 0xB23A2A, empty: p.line.opacity(0.5), stroke: p.card)
                }
            }
            PDomCard(title: "Topp land") { PBars(rows: (a.countries ?? []).sorted { ($0.visitors ?? 0) > ($1.visitors ?? 0) }.map { (flag($0.iso2) + " " + ($0.name ?? "–"), $0.visitors ?? 0) }) }
            PDomCard(title: "Enheter") { PBars(rows: (a.devices ?? []).map { ($0.label, $0.value) }, percent: true) }
            PDomCard(title: "Nettlesere") { PBars(rows: (a.browsers ?? []).map { ($0.label, $0.value) }, percent: true) }
            PDomCard(title: "Toppsider") { PBars(rows: (a.topPages ?? []).map { ($0.label, $0.value) }) }
            PDomCard(title: "Henvisere") { PBars(rows: (a.referrers ?? []).map { ($0.label, $0.value) }) }
        }
        .task { if countries.isEmpty { countries = await store.worldMap(); loaded = true } }
    }

    private var values: [Int: (name: String, visitors: Double)] {
        var out: [Int: (name: String, visitors: Double)] = [:]
        for c in a.countries ?? [] {
            if let n = c.iso3n.flatMap({ Int($0.value) }) { out[n] = (c.name ?? "", c.visitors ?? 0) }
        }
        return out
    }
}

/* ---------- Ytelse ---------- */

struct PaperDomPerf: View {
    @Environment(\.paper) private var p
    let a: Analytics

    var body: some View {
        let sc = a.statusCodes ?? [:]
        VStack(spacing: 10) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                PKpi(label: "Median TTFB", value: "\(Int(a.ttfb?.p50 ?? 0)) ms")
                PKpi(label: "p95 TTFB", value: "\(Int(a.ttfb?.p95 ?? 0)) ms")
                PKpi(label: "Fra opprinnelse", value: "\(Int(a.originMs ?? 0)) ms")
                PKpi(label: "Feilrate", value: pct(a.errorPct ?? 0), color: (a.errorPct ?? 0) > 2 ? p.lab : nil)
            }
            PDomCard(title: "Statuskoder") {
                PBars(rows: [("2xx · OK", sc["2xx"] ?? 0), ("3xx · Omdirigert", sc["3xx"] ?? 0), ("4xx · Ikke funnet o.l.", sc["4xx"] ?? 0), ("5xx · Serverfeil", sc["5xx"] ?? 0)])
            }
            PDomCard(title: "Protokoll") {
                PBars(rows: (a.http ?? []).map { ($0.label, $0.value) }, percent: true, color: p.ink)
                PBars(rows: (a.tls ?? []).map { ($0.label, $0.value) }, percent: true, color: p.ink)
            }
            PDomCard(title: "Sikkerhet", trailing: "\(count(a.threats?.total ?? 0)) stoppet") {
                PBars(rows: (a.threats?.types ?? []).map { ($0.label, $0.value) })
                securityRows
            }
        }
    }

    private var securityRows: some View {
        let s = a.security
        return VStack(spacing: 6) {
            kv("SSL/TLS-modus", s?.sslMode ?? "–")
            kv("Alltid HTTPS", onOff(s?.alwaysHttps))
            kv("Minimum TLS", s?.minTls ?? "–")
            kv("DNSSEC", onOff(s?.dnssec))
            kv("Bot Fight Mode", onOff(s?.botFight))
        }
        .padding(.top, 6)
    }

    private func kv(_ k: String, _ v: String) -> some View {
        HStack { Text(k).font(PF.ui(13.5)).foregroundStyle(p.mut); Spacer(); Text(v).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink) }
    }

    private func onOff(_ b: Bool?) -> String { b.map { $0 ? "På" : "Av" } ?? "–" }
}

/* ---------- Infra ---------- */

struct PaperDomInfra: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let a: Analytics

    var body: some View {
        VStack(spacing: 10) {
            uptime
            info
            dns
        }
    }

    private var uptime: some View {
        let days = Array((a.uptime90 ?? []).suffix(90))
        return PDomCard(title: "Oppetid · 90 dager", trailing: (a.uptimePct ?? 0) > 0 ? pct(a.uptimePct ?? 0) : "–") {
            HStack(spacing: 1) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, u in
                    RoundedRectangle(cornerRadius: 1.5).fill(u < 0 ? p.line : u >= 0.999 ? p.pos : u >= 0.98 ? Color(hex: "#d9a400") : p.lab)
                }
            }
            .frame(height: 28)
            if days.isEmpty { Text("Ingen målinger ennå").font(PF.ui(12.5)).foregroundStyle(p.mut) }
        }
    }

    private var info: some View {
        let src = store.domains?.first { $0.name == store.domain }?.source ?? a.source
        let cert = a.security?.certExpires ?? a.sslExpires
        let left = cert.flatMap(parseDay).map { Int(($0.timeIntervalSinceNow / 86400).rounded(.down)) }
        let status = ["active": "Aktiv", "down": "Nede", "pending": "Venter", "unknown": "Ukjent"][a.status ?? "unknown"] ?? (a.status ?? "–")
        return PDomCard(title: "Domeneinfo") {
            kv("Status", status, a.status == "active" ? p.pos : a.status == "down" ? p.lab : nil)
            kv("Statistikkilde", sourceName(src))
            kv("Registrar", a.registrar ?? "–")
            kv("Fornyes", a.renews.map { "\(ddmm($0)).\($0.prefix(4))" } ?? "–")
            kv("SSL-sertifikat", left.map { "\($0) dager igjen" } ?? "–", left.map { $0 < 30 ? p.lab : p.pos })
            kv("Navnetjenere", (a.nameServers ?? []).isEmpty ? "–" : (a.nameServers ?? []).joined(separator: ", "))
            kv("IP", a.ip ?? (a.dns ?? []).first { $0.type == "A" }?.content ?? "–")
        }
    }

    private var dns: some View {
        let recs = a.dns ?? []
        return PDomCard(title: "DNS-poster", trailing: "\(recs.count)") {
            if recs.isEmpty { Text("Ingen DNS-poster").font(PF.ui(12.5)).foregroundStyle(p.mut) }
            ForEach(Array(recs.prefix(30).enumerated()), id: \.offset) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                HStack(alignment: .top, spacing: 10) {
                    Text(r.type ?? "–").font(PF.mono(11.5)).foregroundStyle(p.lab).frame(width: 48, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.name ?? "–").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Text(r.content ?? "").font(PF.mono(11, bold: false)).foregroundStyle(p.mut).lineLimit(2)
                    }
                    Spacer(minLength: 4)
                    Text(r.proxied == true ? "Proxy" : "Kun DNS").font(PF.ui(11, .semibold)).foregroundStyle(r.proxied == true ? p.lab : p.mut)
                }
            }
        }
    }

    private func kv(_ k: String, _ v: String, _ c: Color? = nil) -> some View {
        HStack(alignment: .top) {
            Text(k).font(PF.ui(13.5)).foregroundStyle(p.mut)
            Spacer(minLength: 8)
            Text(v).font(PF.ui(13.5, .semibold)).foregroundStyle(c ?? p.ink).multilineTextAlignment(.trailing).lineLimit(3)
        }
    }
}

/* ---------- Alle domener: ett kort per domene ---------- */

struct PaperDomAllList: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let list = store.domains ?? []
        VStack(spacing: 10) {
            if store.domAll.isEmpty { ProgressView().padding(30) }
            ForEach(list, id: \.name) { d in
                if let a = store.domAll[d.name] { card(d, a) }
            }
        }
    }

    private func card(_ d: DomainRef, _ a: Analytics) -> some View {
        let up = a.status == "active"
        let cert = a.security?.certExpires ?? a.sslExpires
        let left = cert.flatMap(parseDay).map { Int(($0.timeIntervalSinceNow / 86400).rounded(.down)) }
        return Button { store.pickDomainPaper(d.name) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(d.name).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                        Text(sourceName(d.source)).font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                    Spacer()
                    Text(up ? "Oppe" : a.status == "down" ? "Nede" : "Ukjent").font(PF.ui(11.5, .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 10).frame(height: 24)
                        .background(up ? p.pos : p.lab, in: Capsule())
                }
                HStack(spacing: 8) {
                    num("Forespørsler", count(a.requests ?? 0))
                    num("Besøkende", count(a.visitors ?? 0))
                    num("Oppetid", (a.uptimePct ?? 0) > 0 ? pct(a.uptimePct ?? 0) : "–")
                }
                Rectangle().fill(p.line).frame(height: 1)
                HStack {
                    Text("Bufret \(pct(a.cachedPct ?? 0))").font(PF.ui(12)).foregroundStyle(p.mut)
                    Spacer()
                    Text(left.map { "SSL om \($0) dager" } ?? "SSL –").font(PF.ui(12, .semibold)).foregroundStyle(left.map { $0 < 30 ? p.lab : p.mut } ?? p.mut)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func num(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(v).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
            Text(k).font(PF.ui(11)).foregroundStyle(p.mut).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
