import SwiftUI

/// Domener (Cloudflare-statistikk): mørkt glass med rosa aksent. Fanelinja er byttet ut med
/// Trafikk, Besøk, Ytelse og Sikkerhet (DomTabBar); på iPad vises fanene øverst.
struct DomainsView: View {
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Tannhjulet står her (Papir-skallet har ikke tannhjul i fanelinja på iPad).
                // Domenevelgeren (bare ikonet) og Oppdater står ved siden av profilbildet.
                ModuleHeader(title: "Domener", trailing: {
                    picker
                    Button { store.reloadDomain() } label: { Image(systemName: "arrow.clockwise").frame(width: 40, height: 40) }.buttonStyle(.plain).glass(20).foregroundStyle(Color.domPink)
                        .accessibilityLabel("Oppdater")
                    if hSize == .regular {
                        Button { store.domainManager = true } label: { Image(systemName: "gearshape").frame(width: 40, height: 40) }.buttonStyle(.plain).glass(20)
                            .accessibilityLabel("Administrer domener")
                    }
                })
                if let d = store.domain {
                    HStack(spacing: 8) {
                        Circle().fill(statusColor(store.analytics?.status)).frame(width: 8, height: 8)
                        Text(d).font(.subheadline.weight(.semibold)).foregroundStyle(Color.skinFg.opacity(0.8)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
                }
                if hSize == .regular {
                    Picker("Fane", selection: Binding(get: { store.domTab }, set: { store.domTab = $0 })) { ForEach(DomTab.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
                }
                if let e = store.moduleError { Empty(text: e) }
                if store.domains?.isEmpty == true {
                    Empty(text: "Ingen domener ennå.")
                    Button { store.domainManager = true } label: { Text("＋ Legg til domene").fontWeight(.semibold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 50) }
                        .buttonStyle(.plain).glass(25, tint: .domPink)
                }
                if let a = store.analytics {
                    if a.mock == true { Text("Eksempeldata – legg inn Cloudflare-token i Homelab for ekte tall.").font(.caption).foregroundStyle(Color.skinFg.opacity(0.55)).frame(maxWidth: .infinity, alignment: .leading) }
                    switch store.domTab {
                    case .traffic: traffic(a)
                    case .visits: visits(a)
                    case .perf: perf(a)
                    case .security: security(a)
                    }
                } else if store.moduleError == nil && store.domains?.isEmpty != true { ProgressView().padding(40) }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
        .tint(.domPink)
        .refreshable { store.reloadDomain() }
    }

    private var picker: some View {
        Menu {
            ForEach(store.domains ?? [], id: \.name) { d in Button { store.pickDomain(d.name) } label: { Label(d.name, systemImage: d.name == store.domain ? "checkmark" : "globe") } }
            Divider()
            Button { store.domainManager = true } label: { Label("Administrer domener", systemImage: "plus") }
        } label: {
            Image(systemName: "globe").frame(width: 40, height: 40).glass(20)
        }
        .foregroundStyle(Color.skinFg)
        .accessibilityLabel("Velg domene, nå \(store.domain ?? "ingen")")
    }

    private func statusColor(_ s: String?) -> Color {
        switch s ?? "active" {
        case "active": return .positive
        case "pending", "unknown": return Color(hex: "#F2C14E")
        default: return .domRed
        }
    }

    /* ---------- Faner ---------- */

    @ViewBuilder private func traffic(_ a: Analytics) -> some View {
        // Live-kortet er ca. 20 % lavere enn før (mindre tall, graf og luft).
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) { Circle().fill(Color.positive).frame(width: 8, height: 8); Text("Live · akkurat nå").fontWeight(.semibold) }
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(count(a.live?.visitors ?? 0)).font(.system(size: 36, weight: .semibold, design: .monospaced))
                Text(" besøkende").foregroundStyle(Color.skinFg.opacity(0.7))
            }
            Text("\(count(a.live?.requests ?? 0)) forespørsler · \(String(format: "%.1f", a.live?.mb ?? 0).replacingOccurrences(of: ".", with: ",")) MB").font(.subheadline).foregroundStyle(Color.skinFg.opacity(0.75))
            Spark(values: a.live?.spark ?? (a.series ?? []).map { $0.visitors ?? 0 }, color: .domPink).frame(height: 44)
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(28, tint: Color.domPink.opacity(0.35))
        ranges([("24h", "Siste 24 t"), ("today", "I dag")])
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Kpi(label: "Besøk", value: count(a.visitors ?? 0))
            Kpi(label: "Forespørsler", value: count(a.requests ?? 0))
            Kpi(label: "Dataoverføring", value: bytes(a.bytes ?? 0))
            Kpi(label: "Land", value: "\(a.countries?.count ?? 0)")
        }
        domainCard(a)
        SectionLabel(text: "Historikk")
        ranges([("7d", "7 d"), ("30d", "30 d"), ("90d", "90 d"), ("1y", "1 år")])
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text("Forespørsler"); Spacer(); Text("bufret \(pct(a.cachedPct ?? 0))").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }
            Spark(values: (a.series ?? []).map { $0.requests ?? 0 }, second: (a.series ?? []).map { $0.cached ?? 0 }, color: .domPink).frame(height: 120)
            if let s = a.series, s.count >= 2 {
                HStack { Text(String((s.first?.t ?? "").prefix(10))); Spacer(); Text(String((s.last?.t ?? "").prefix(10))) }.font(.caption2).foregroundStyle(Color.skinFg.opacity(0.5))
            }
        }
        .padding(16).glass(24)
    }

    @ViewBuilder private func visits(_ a: Analytics) -> some View {
        HStack(spacing: 10) {
            Kpi(label: "Besøk", value: count(a.visitors ?? 0))
            Kpi(label: "Sidevisninger", value: count(a.pageviews ?? 0))
            Kpi(label: "Land", value: "\(a.countries?.count ?? 0)")
        }
        VisitsMap(a: a)
        card("Topp land") { Bars(rows: (a.countries ?? []).sorted { ($0.visitors ?? 0) > ($1.visitors ?? 0) }.map { (flag($0.iso2) + " " + ($0.name ?? "–"), $0.visitors ?? 0) }) }
        card("Enheter") { Bars(rows: (a.devices ?? []).map { ($0.label, $0.value) }, percent: true) }
        card("Toppsider") { Bars(rows: (a.topPages ?? []).map { ($0.label, $0.value) }) }
        card("Henvisere") { Bars(rows: (a.referrers ?? []).map { ($0.label, $0.value) }) }
        card("Nettlesere") { Bars(rows: (a.browsers ?? []).map { ($0.label, $0.value) }, percent: true) }
    }

    @ViewBuilder private func perf(_ a: Analytics) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Kpi(label: "Bufret andel", value: pct(a.cachedPct ?? 0))
            Kpi(label: "Median TTFB", value: "\(Int(a.ttfb?.p50 ?? 0)) ms")
            Kpi(label: "p95 TTFB", value: "\(Int(a.ttfb?.p95 ?? 0)) ms")
            Kpi(label: "Fra opprinnelse", value: "\(Int(a.originMs ?? 0)) ms")
        }
        Kpi(label: "Feilrate", value: pct(a.errorPct ?? 0))
        let sc = a.statusCodes ?? [:]
        card("Statuskoder") {
            Bars(rows: [("2xx · OK", sc["2xx"] ?? 0), ("3xx · Omdirigert", sc["3xx"] ?? 0), ("4xx · Ikke funnet o.l.", sc["4xx"] ?? 0), ("5xx · Serverfeil", sc["5xx"] ?? 0)])
        }
        card("Protokoll") {
            Bars(rows: (a.http ?? []).map { ($0.label, $0.value) }, percent: true)
            Divider().overlay(Color.skinFg.opacity(0.12))
            Bars(rows: (a.tls ?? []).map { ($0.label, $0.value) }, percent: true)
        }
        card("Oppetid siste 90 dager") {
            let days = Array((a.uptime90 ?? []).suffix(90))
            Text((a.uptimePct ?? 0) > 0 ? pct(a.uptimePct ?? 0) : "–").font(.system(.title2, design: .monospaced))
            HStack(spacing: 1) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, u in
                    RoundedRectangle(cornerRadius: 2).fill(u < 0 ? Color.skinFg.opacity(0.15) : u >= 0.999 ? Color.positive : u >= 0.98 ? Color(hex: "#F2C14E") : .domRed)
                }
            }
            .frame(height: 28)
            if days.isEmpty { Text("Ingen målinger ennå").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }
        }
    }

    @ViewBuilder private func security(_ a: Analytics) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Trusler stoppet").foregroundStyle(Color.skinFg.opacity(0.75))
            Text(count(a.threats?.total ?? 0)).font(.system(size: 40, weight: .semibold, design: .monospaced))
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading).glass(28, tint: Color.domPink.opacity(0.35))
        card("Hva ble stoppet") { Bars(rows: (a.threats?.types ?? []).map { ($0.label, $0.value) }) }
        card("Siste hendelser") {
            let ev = Array((a.threats?.events ?? []).prefix(10))
            if ev.isEmpty { Text("Ingen hendelser").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }
            ForEach(Array(ev.enumerated()), id: \.offset) { _, e in
                HStack(spacing: 10) {
                    Pill(text: e.action ?? "–", color: e.action == "Blokkert" ? .domRed : Color(hex: "#F2C14E"))
                    VStack(alignment: .leading, spacing: 2) {
                        Text((e.path ?? "").isEmpty ? "/" : e.path!).font(.system(.footnote, design: .monospaced)).lineLimit(1)
                        Text("\(flag(e.country)) \(e.ip ?? "") · \(String((e.time ?? "").suffix(8).prefix(5)))").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                    }
                    Spacer()
                }
            }
        }
        card("Trusler per land") {
            Bars(rows: (a.countries ?? []).filter { ($0.threats ?? 0) > 0 }.sorted { ($0.threats ?? 0) > ($1.threats ?? 0) }.map { (flag($0.iso2) + " " + ($0.name ?? "–"), $0.threats ?? 0) }, color: .domRed)
        }
        let s = a.security
        card("Innstillinger") {
            kv("SSL/TLS-modus", s?.sslMode ?? "–")
            kv("Alltid HTTPS", onOff(s?.alwaysHttps), good: s?.alwaysHttps)
            kv("Minimum TLS", s?.minTls ?? "–")
            kv("DNSSEC", onOff(s?.dnssec), good: s?.dnssec)
            kv("Bot Fight Mode", onOff(s?.botFight), good: s?.botFight)
            kv("Sertifikat utløper", (s?.certExpires ?? a.sslExpires).map { "\(ddmm($0)).\($0.prefix(4))" } ?? "–")
        }
        card("DNS-poster") {
            let recs = a.dns ?? []
            if recs.isEmpty { Text("Ingen DNS-poster").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }
            ForEach(Array(recs.prefix(30).enumerated()), id: \.offset) { i, r in
                if i > 0 { Divider().overlay(Color.skinFg.opacity(0.1)) }
                HStack(alignment: .top, spacing: 10) {
                    Text(r.type ?? "–").font(.system(.caption, design: .monospaced).weight(.bold)).foregroundStyle(Color.domPink).frame(width: 52, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.name ?? "–").font(.footnote.weight(.semibold)).lineLimit(1)
                        Text(r.content ?? "").font(.system(.caption, design: .monospaced)).foregroundStyle(Color.skinFg.opacity(0.65)).lineLimit(2)
                    }
                    Spacer(minLength: 4)
                    Pill(text: r.proxied == true ? "Proxy" : "Kun DNS", color: r.proxied == true ? Color(hex: "#F6A04D") : Color.skinFg.opacity(0.7))
                }
            }
        }
    }

    /// «Domene»: status, kilde, registrar, fornyelse, SSL (gult under 30 dager), navnetjenere, IP, TLS og DNSSEC.
    private func domainCard(_ a: Analytics) -> some View {
        let src = store.domains?.first { $0.name == store.domain }?.source ?? a.source
        let cert = a.security?.certExpires ?? a.sslExpires
        let left = cert.flatMap(parseDay).map { Int(($0.timeIntervalSinceNow / 86400).rounded(.down)) }
        let statusText = ["active": "Aktiv", "down": "Nede", "pending": "Venter", "unknown": "Ukjent"][a.status ?? "unknown"] ?? (a.status ?? "–")
        return card("Domene") {
            kv("Status", statusText, good: a.status == "active" ? true : a.status == "down" ? false : nil)
            kv("Statistikkilde", sourceName(src))
            kv("Registrar", a.registrar ?? "–")
            kv("Fornyes", a.renews.map { "\(ddmm($0)).\($0.prefix(4))" } ?? "–")
            HStack {
                Text("SSL-sertifikat").foregroundStyle(Color.skinFg.opacity(0.65)); Spacer()
                Text(left.map { "\($0) dager igjen" } ?? "–").fontWeight(.medium).foregroundStyle(left.map { $0 < 30 ? Color(hex: "#F2C14E") : Color.positive } ?? .white)
            }
            HStack(alignment: .top) {
                Text("Navnetjenere").foregroundStyle(Color.skinFg.opacity(0.65)); Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    ForEach((a.nameServers ?? []).isEmpty ? ["–"] : a.nameServers ?? [], id: \.self) { Text($0).font(.system(.footnote, design: .monospaced)).lineLimit(1) }
                }
            }
            kv("IP", a.ip ?? (a.dns ?? []).first { $0.type == "A" }?.content ?? "–")
            kv("TLS", a.security?.minTls.map { "Minst \($0)" } ?? (a.tls ?? []).first?.label ?? "–")
            kv("DNSSEC", onOff(a.security?.dnssec), good: a.security?.dnssec)
        }
    }

    /* ---------- Byggeklosser ---------- */

    private func ranges(_ opts: [(String, String)]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(opts, id: \.0) { k, n in
                    Button { store.setRange(k) } label: {
                        Text(n).font(.subheadline).padding(.horizontal, 14).frame(height: 34).foregroundStyle(store.domRange == k ? Color.ink : Color.skinFg)
                    }
                    .buttonStyle(.plain).glass(17, tint: store.domRange == k ? .domPink : nil)
                }
            }
        }
    }

    private func card<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased()).font(.footnote.weight(.semibold)).foregroundStyle(Color.domPink)
            content()
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
    }

    private func kv(_ k: String, _ v: String, good: Bool? = nil) -> some View {
        HStack { Text(k).foregroundStyle(Color.skinFg.opacity(0.65)); Spacer(); Text(v).fontWeight(.medium).foregroundStyle(good == true ? Color.positive : good == false ? .domRed : Color.skinFg) }
    }

    private func onOff(_ b: Bool?) -> String { b.map { $0 ? "På" : "Av" } ?? "–" }

    private func bytes(_ b: Double) -> String {
        let f: (Double) -> String = { String(format: "%.1f", $0).replacingOccurrences(of: ".", with: ",") }
        return b >= 1e9 ? f(b / 1e9) + " GB" : b >= 1e6 ? f(b / 1e6) + " MB" : f(b / 1e3) + " kB"
    }
}

/// Liggende søyler med navn og verdi.
struct Bars: View {
    let rows: [(String, Double)]
    var percent = false
    var color: Color = .domPink
    var body: some View {
        if rows.isEmpty { Text("Ingen data").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) } else {
            let max = rows.map(\.1).max() ?? 1
            VStack(spacing: 10) {
                ForEach(Array(rows.prefix(8).enumerated()), id: \.offset) { _, r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(r.0).lineLimit(1); Spacer(); Text(percent ? pct(r.1) : count(r.1)).font(.system(.footnote, design: .monospaced)).foregroundStyle(Color.skinFg.opacity(0.7)) }
                        Bar(value: r.1 / Swift.max(1, max), color: color)
                    }
                }
            }
        }
    }
}

/// Kurve med fylt område under.
struct Spark: View {
    let values: [Double]
    var second: [Double] = []
    var color: Color = .domPink
    var body: some View {
        GeometryReader { g in
            let max = Swift.max(1, (values + second).max() ?? 1)
            let pts: ([Double]) -> [CGPoint] = { v in
                guard v.count > 1 else { return [] }
                let step = g.size.width / CGFloat(v.count - 1)
                return v.enumerated().map { CGPoint(x: CGFloat($0.offset) * step, y: g.size.height - CGFloat($0.element / max) * g.size.height * 0.92) }
            }
            let main = pts(values)
            ZStack {
                if main.count > 1 {
                    Path { p in p.move(to: CGPoint(x: 0, y: g.size.height)); main.forEach { p.addLine(to: $0) }; p.addLine(to: CGPoint(x: g.size.width, y: g.size.height)); p.closeSubpath() }
                        .fill(LinearGradient(colors: [color.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom))
                    Path { p in p.addLines(main) }.stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                }
                let sec = pts(second)
                if sec.count > 1 { Path { p in p.addLines(sec) }.stroke(Color.skinFg.opacity(0.45), lineWidth: 1.5) }
            }
        }
    }
}

/// Landskode (ISO 3166-1 alfa-2) → flagg-emoji.
func flag(_ iso2: String?) -> String {
    guard let s = iso2?.uppercased(), s.count == 2 else { return "" }
    var out = ""
    for u in s.unicodeScalars {
        guard u.value >= 65, u.value <= 90, let f = UnicodeScalar(0x1F1E6 + u.value - 65) else { return "" }
        out.unicodeScalars.append(f)
    }
    return out
}

/// «Administrer domener»: samme liste som i Homelab. API-token for Plausible og Umami legges inn på web.
struct DomainManager: View {
    @Environment(Store.self) private var store
    @State private var name = ""
    @State private var source = "cloudflare"
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Administrer domener").font(.title2.weight(.bold))
                    Spacer()
                    Button { store.domainManager = false } label: { Text("Ferdig").fontWeight(.semibold).foregroundStyle(Color.domPink).frame(height: 44) }.buttonStyle(.plain)
                }
                SectionLabel(text: "Domener")
                VStack(spacing: 0) {
                    let list = store.domains ?? []
                    if list.isEmpty { Text("Ingen domener ennå.").foregroundStyle(Color.skinFg.opacity(0.6)).padding(16) }
                    ForEach(Array(list.enumerated()), id: \.element.name) { i, d in
                        if i > 0 { Divider().overlay(Color.skinFg.opacity(0.12)) }
                        HStack(spacing: 12) {
                            Image(systemName: "globe").foregroundStyle(Color.domPink).frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(d.name).fontWeight(.semibold).lineLimit(1)
                                Text(sourceName(d.source)).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                            }
                            Spacer()
                            Button("Fjern") { store.removeDomain(d) }.font(.subheadline.weight(.semibold)).foregroundStyle(Color.domRed)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                }
                .glass(22)
                SectionLabel(text: "Legg til domene")
                VStack(spacing: 10) {
                    TextField("eksempel.no", text: $name).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(.horizontal, 16).frame(height: 50).glass(25)
                    Picker("Statistikkilde", selection: $source) { ForEach(domainSources, id: \.0) { Text($0.1).tag($0.0) } }
                        .pickerStyle(.menu).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 8).frame(height: 46).glass(23)
                    Button { store.addDomain(name, source: source); name = "" } label: {
                        Text("Legg til domene").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.plain).glass(25, tint: .domPink).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    Text(source == "plausible" || source == "umami" ? "Plausible og Umami trenger API-token. Legg det inn i Homelab på web etterpå." : "API-token (Cloudflare) legges inn i Homelab på web. Uten eget token brukes standard-tokenet.")
                        .font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6))
                }
            }
            .padding(20)
        }
        .tint(.domPink)
        .skinScheme()
    }
}
