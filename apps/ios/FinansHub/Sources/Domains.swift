import SwiftUI

/// Domener (Cloudflare-statistikk): mørkt glass med rosa aksent. Fanelinja er byttet ut med
/// Trafikk, Besøk, Ytelse og Sikkerhet (DomTabBar); på iPad vises fanene øverst.
struct DomainsView: View {
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Domener", trailing: {
                    Button { store.reloadDomain() } label: { Image(systemName: "arrow.clockwise").frame(width: 40, height: 40) }.buttonStyle(.plain).glass(20).foregroundStyle(Color.domPink)
                    Button { store.openSub(.settings) } label: { Image(systemName: "gearshape").frame(width: 40, height: 40) }.buttonStyle(.plain).glass(20)
                })
                picker
                if hSize == .regular {
                    Picker("Fane", selection: Binding(get: { store.domTab }, set: { store.domTab = $0 })) { ForEach(DomTab.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
                }
                if let e = store.moduleError { Empty(text: e) }
                if store.domains?.isEmpty == true { Empty(text: "Ingen domener ennå. Nye domener legges til i Homelab → Domener.") }
                if let a = store.analytics {
                    if a.mock == true { Text("Eksempeldata – legg inn Cloudflare-token i Homelab for ekte tall.").font(.caption).foregroundStyle(.white.opacity(0.55)).frame(maxWidth: .infinity, alignment: .leading) }
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
        } label: {
            HStack(spacing: 8) {
                Circle().fill(statusColor(store.analytics?.status)).frame(width: 8, height: 8)
                Text(store.domain ?? "Velg domene").fontWeight(.semibold)
                Image(systemName: "chevron.down").font(.caption)
            }
            .padding(.horizontal, 16).frame(height: 40).glass(20)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
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
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) { Circle().fill(Color.positive).frame(width: 8, height: 8); Text("Live · akkurat nå").fontWeight(.semibold) }
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(count(a.live?.visitors ?? 0)).font(.system(size: 44, weight: .semibold, design: .monospaced))
                Text(" besøkende").foregroundStyle(.white.opacity(0.7))
            }
            Text("\(count(a.live?.requests ?? 0)) forespørsler · \(String(format: "%.1f", a.live?.mb ?? 0).replacingOccurrences(of: ".", with: ",")) MB").font(.subheadline).foregroundStyle(.white.opacity(0.75))
            Spark(values: a.live?.spark ?? (a.series ?? []).map { $0.visitors ?? 0 }, color: .domPink).frame(height: 56)
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading).glass(28, tint: Color.domPink.opacity(0.35))
        ranges([("24h", "Siste 24 t"), ("today", "I dag")])
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Kpi(label: "Besøk", value: count(a.visitors ?? 0))
            Kpi(label: "Forespørsler", value: count(a.requests ?? 0))
            Kpi(label: "Dataoverføring", value: bytes(a.bytes ?? 0))
            Kpi(label: "Land", value: "\(a.countries?.count ?? 0)")
        }
        SectionLabel(text: "Historikk")
        ranges([("7d", "7 d"), ("30d", "30 d"), ("90d", "90 d"), ("1y", "1 år")])
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text("Forespørsler"); Spacer(); Text("bufret \(pct(a.cachedPct ?? 0))").font(.footnote).foregroundStyle(.white.opacity(0.6)) }
            Spark(values: (a.series ?? []).map { $0.requests ?? 0 }, second: (a.series ?? []).map { $0.cached ?? 0 }, color: .domPink).frame(height: 120)
            if let s = a.series, s.count >= 2 {
                HStack { Text(String((s.first?.t ?? "").prefix(10))); Spacer(); Text(String((s.last?.t ?? "").prefix(10))) }.font(.caption2).foregroundStyle(.white.opacity(0.5))
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
            Divider().overlay(.white.opacity(0.12))
            Bars(rows: (a.tls ?? []).map { ($0.label, $0.value) }, percent: true)
        }
        card("Oppetid siste 30 dager") {
            let days = Array((a.uptime90 ?? []).suffix(30))
            Text((a.uptimePct ?? 0) > 0 ? pct(a.uptimePct ?? 0) : "–").font(.system(.title2, design: .monospaced))
            HStack(spacing: 2) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, u in
                    RoundedRectangle(cornerRadius: 2).fill(u >= 0.999 ? Color.positive : u >= 0.98 ? Color(hex: "#F2C14E") : .domRed)
                }
            }
            .frame(height: 28)
            if days.isEmpty { Text("Ingen målinger ennå").font(.footnote).foregroundStyle(.white.opacity(0.6)) }
        }
    }

    @ViewBuilder private func security(_ a: Analytics) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Trusler stoppet").foregroundStyle(.white.opacity(0.75))
            Text(count(a.threats?.total ?? 0)).font(.system(size: 40, weight: .semibold, design: .monospaced))
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading).glass(28, tint: Color.domPink.opacity(0.35))
        card("Hva ble stoppet") { Bars(rows: (a.threats?.types ?? []).map { ($0.label, $0.value) }) }
        card("Siste hendelser") {
            let ev = Array((a.threats?.events ?? []).prefix(10))
            if ev.isEmpty { Text("Ingen hendelser").font(.footnote).foregroundStyle(.white.opacity(0.6)) }
            ForEach(Array(ev.enumerated()), id: \.offset) { _, e in
                HStack(spacing: 10) {
                    Pill(text: e.action ?? "–", color: e.action == "Blokkert" ? .domRed : Color(hex: "#F2C14E"))
                    VStack(alignment: .leading, spacing: 2) {
                        Text((e.path ?? "").isEmpty ? "/" : e.path!).font(.system(.footnote, design: .monospaced)).lineLimit(1)
                        Text("\(flag(e.country)) \(e.ip ?? "") · \(String((e.time ?? "").suffix(8).prefix(5)))").font(.caption).foregroundStyle(.white.opacity(0.6))
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
    }

    /* ---------- Byggeklosser ---------- */

    private func ranges(_ opts: [(String, String)]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(opts, id: \.0) { k, n in
                    Button { store.setRange(k) } label: {
                        Text(n).font(.subheadline).padding(.horizontal, 14).frame(height: 34).foregroundStyle(store.domRange == k ? Color.ink : .white)
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
        HStack { Text(k).foregroundStyle(.white.opacity(0.65)); Spacer(); Text(v).fontWeight(.medium).foregroundStyle(good == true ? Color.positive : good == false ? .domRed : .white) }
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
        if rows.isEmpty { Text("Ingen data").font(.footnote).foregroundStyle(.white.opacity(0.6)) } else {
            let max = rows.map(\.1).max() ?? 1
            VStack(spacing: 10) {
                ForEach(Array(rows.prefix(8).enumerated()), id: \.offset) { _, r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(r.0).lineLimit(1); Spacer(); Text(percent ? pct(r.1) : count(r.1)).font(.system(.footnote, design: .monospaced)).foregroundStyle(.white.opacity(0.7)) }
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
                if sec.count > 1 { Path { p in p.addLines(sec) }.stroke(.white.opacity(0.45), lineWidth: 1.5) }
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
