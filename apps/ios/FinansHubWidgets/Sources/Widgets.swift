import SwiftUI
import WidgetKit
import AppIntents
import UIKit

/* ---------------- Widgets (design/Widgets.dc.html → 1a) ---------------- */

@main
struct FinansHubWidgetBundle: WidgetBundle {
    // Prompt 32: delt i to grupper (maks 10 per WidgetBundleBuilder-blokk), nå med Prøveperioder (TrialsWidget32b.swift).
    var body: some Widget {
        FinansHubWidgetsA().body
        FinansHubWidgetsB().body
        // Prompt 40: egen gruppe for Hjemlys (Live Activity), så A og B holder seg under 10.
        FinansHubWidgetsC().body
    }
}

/// Gruppe 3: Hjemlys og Media (4 av maks 10).
struct FinansHubWidgetsC: WidgetBundle {
    var body: some Widget {
        // Prompt 40: Hjemlys – Dynamic Island, låseskjerm og StandBy (HjemlysLive40.swift).
        HjemlysLive40()
        // Prompt 40 (Felles): Hjem-widgeten med «Start for meg» (HjemlysWidget40.swift).
        HjemlysWidget40()
        // Prompt 43: Media (liten, medium, stor med Pause alt) og Media · låseskjerm (MediaWidget43.swift).
        MediaWidget43()
        MediaLockWidget43()
    }
}

/// Gruppe 1: økonomi og hjem (10 widgets – full; nye widgets går i gruppe 2 eller en ny gruppe).
struct FinansHubWidgetsA: WidgetBundle {
    var body: some Widget {
        // Prompt 34: Glimt-brief (liten, medium, stor og låseskjerm), BriefWidget34.swift.
        BriefWidget34()
        WeatherWidget()
        PackagesWidget()
        BudgetWidget()
        FinanceWidget()
        NextChargeWidget()
        StocksWidget()
        DomainsWidget()
        MealWidget()
        FinnWidget()
    }
}

/// Gruppe 2: resten (9 widgets, maks 10).
struct FinansHubWidgetsB: WidgetBundle {
    var body: some Widget {
        BoligWidget()
        ScanWidget()
        TasksWidget()
        PositionWidget()
        BirthdaysWidget()
        CalendarWidget26()
        // Prompt 27: Ruter-avganger (liten, medium, stor og låseskjerm), RuterWidget27.swift.
        RuterWidget27()
        // Prompt 32: Prøveperioder (liten, medium med ✓ Avsluttet, låseskjerm rund og rektangel).
        TrialsWidget32b()
        // Prompt 37: Dagens bibelvers (liten, medium og låseskjerm), BibleWidget37.swift. Gruppen har nå 9 av maks 10.
        BibleWidget37()
    }
}

/* ---------- Byggeklosser ---------- */

private let accent = Color(red: 1, green: 0.478, blue: 0.239)          // #FF7A3D
private let accentLight = Color(red: 1, green: 0.69, blue: 0.541)       // #FFB08A
private let positive = Color(red: 0.482, green: 0.89, blue: 0.627)      // #7BE3A0
private let pink = Color(red: 1, green: 0.27, blue: 0.51)

private func hexColor(_ hex: String) -> Color {
    var h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    let v = UInt64(h, radix: 16) ?? 0xFF7A3D
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

private let nb: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "nb_NO")
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f
}()
private let nb2: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "nb_NO")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    return f
}()

private func kr(_ v: Double?) -> String {
    guard let v else { return "–" }
    let s = nb.string(from: NSNumber(value: abs(v))) ?? "\(Int(abs(v)))"
    return (v < 0 ? "−" : "") + s
}
private func signed2(_ v: Double) -> String {
    let s = nb2.string(from: NSNumber(value: abs(v))) ?? String(format: "%.2f", abs(v))
    return (v < 0 ? "−" : "+") + s
}
private func deg(_ v: Double?) -> String { v.map { "\(Int($0.rounded()))°" } ?? "–" }
private func pctText(_ v: Double) -> String { String(format: "%.1f", abs(v)).replacingOccurrences(of: ".", with: ",") + " %" }

private func shortDate(_ iso: String) -> String {
    let p = iso.prefix(10).split(separator: "-")
    guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return iso }
    let months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
    return "\(d). \(months[(m - 1) % 12])"
}

/// SF Symbol for en MET-symbolkode.
private func wxSymbol(_ code: String) -> String {
    let c = code.lowercased()
    let night = c.hasSuffix("_night")
    if c.contains("thunder") { return "cloud.bolt.rain.fill" }
    if c.contains("snow") { return "cloud.snow.fill" }
    if c.contains("sleet") { return "cloud.sleet.fill" }
    if c.contains("rain") { return "cloud.rain.fill" }
    if c.contains("fog") { return "cloud.fog.fill" }
    if c.contains("partlycloudy") || c.contains("fair") { return night ? "cloud.moon.fill" : "cloud.sun.fill" }
    if c.contains("clearsky") { return night ? "moon.stars.fill" : "sun.max.fill" }
    if c.contains("cloudy") { return "cloud.fill" }
    return "cloud.sun.fill"
}

private let carrierColors: [String: String] = ["posten": "#E32D22", "bring": "#7BC144", "postnord": "#00A0D6", "dhl": "#FFCC00", "ups": "#351C15",
                                               "fedex": "#4D148C", "gls": "#172154", "helthjem": "#2E2A6B", "budbee": "#2BCE96", "instabox": "#FF4E00"]
private let carrierIni: [String: String] = ["posten": "P", "bring": "B", "postnord": "PN", "dhl": "DHL", "ups": "UPS", "fedex": "FX", "gls": "GLS",
                                            "helthjem": "HH", "budbee": "BB", "instabox": "IB"]

private func link(_ page: String) -> URL { URL(string: "finanshub://\(page)") ?? URL(string: "finanshub://homelab")! }

/// Mørk glassaktig bakgrunn (iOS legger selv på glass/tonet modus på iOS 26).
private struct WBackground: View {
    var tint: Color? = nil
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.13, green: 0.12, blue: 0.17), Color(red: 0.06, green: 0.07, blue: 0.11)], startPoint: .topLeading, endPoint: .bottomTrailing)
            if let tint { tint.opacity(0.22) }
        }
    }
}

private struct Caption: View {
    let text: String
    var body: some View { Text(text).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.8)).lineLimit(1) }
}

/// Når appen ikke er logget inn ennå.
private struct NotLinked: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "person.crop.circle.badge.exclamationmark").font(.system(size: 22)).foregroundStyle(accentLight)
            Text(WidgetShared.linked ? "Åpne FinansHub-appen" : "Widgeten når ikke appen").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
            Text(WidgetShared.linked ? "Logg inn eller åpne appen én gang, så henter widgeten data." : "App Group mangler i signeringen. Se Innstillinger → Widgets i appen.").font(.system(size: 11)).foregroundStyle(.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Felles ramme: bakgrunn, deep link og «ikke logget inn».
private struct WFrame<Content: View>: View {
    let entry: WEntry
    let page: String
    var tint: Color? = nil
    @ViewBuilder let content: () -> Content
    var body: some View {
        Group {
            if entry.linked { content() } else { NotLinked() }
        }
        .foregroundStyle(.white)
        .widgetURL(link(page))
        .containerBackground(for: .widget) { WBackground(tint: tint) }
    }
}

private struct StepDots: View {
    let step: Int
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<5, id: \.self) { i in
                Capsule().fill(i < step ? Color.white : (i == step ? accent : Color.white.opacity(0.25))).frame(height: 4)
            }
        }
    }
}

private struct WBadge: View {
    let carrier: String
    var size: CGFloat = 28
    var body: some View {
        // Ekte logo fra widget-ressursene (samme bilder som i appen), ellers initialer på merkefargen.
        if let img = UIImage(named: "Carrier-" + carrier) {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: size * 0.28))
        } else {
            Text(carrierIni[carrier] ?? "17").font(.system(size: size * 0.36, weight: .heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.5)
                .frame(width: size, height: size).background(hexColor(carrierColors[carrier] ?? "#3A4252"), in: RoundedRectangle(cornerRadius: size * 0.28))
        }
    }
}

/* ---------- Vær ---------- */

struct WeatherWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.weather", provider: WProvider()) { e in WeatherView(entry: e) }
            .configurationDisplayName("Vær")
            .description("Temperatur, tilstand og de neste timene.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct WeatherView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    var body: some View {
        WFrame(entry: entry, page: "homelab") {
            if let w = entry.data.weather {
                if family == .systemSmall { small(w) } else { medium(w) }
            } else {
                Text("Ingen værdata").font(.footnote).foregroundStyle(.white.opacity(0.6))
            }
        }
    }

    private func small(_ w: WWeather) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack { Caption(text: w.place); Spacer(); Image(systemName: wxSymbol(w.symbol)).symbolRenderingMode(.multicolor) }
            Spacer(minLength: 0)
            Text(deg(w.temp)).font(.system(size: 44, weight: .light)).monospacedDigit()
            Text(w.desc).font(.system(size: 13, weight: .medium)).lineLimit(1).padding(.top, 4)
            Text("H \(deg(w.hi)) · L \(deg(w.lo))").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
        }
    }

    private func medium(_ w: WWeather) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Caption(text: w.place)
                    Text(deg(w.temp)).font(.system(size: 40, weight: .light)).monospacedDigit()
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Image(systemName: wxSymbol(w.symbol)).symbolRenderingMode(.multicolor).font(.system(size: 22))
                    Text(w.desc).font(.system(size: 13, weight: .medium)).lineLimit(1)
                    Text("H \(deg(w.hi)) · L \(deg(w.lo))").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                }
            }
            HStack(spacing: 0) {
                ForEach(Array(w.hours.prefix(6).enumerated()), id: \.offset) { _, h in
                    VStack(spacing: 3) {
                        Text(h.t).font(.system(size: 11)).foregroundStyle(.white.opacity(0.65))
                        Image(systemName: wxSymbol(h.symbol)).symbolRenderingMode(.multicolor).font(.system(size: 14))
                        Text(deg(h.temp)).font(.system(size: 12, weight: .semibold)).monospacedDigit()
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

/* ---------- Pakker ---------- */

struct PackagesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.packages", provider: WProvider()) { e in PackagesView(entry: e) }
            .configurationDisplayName("Pakker")
            .description("Pakker på vei og klar for henting.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

private struct PackagesView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    private var limit: Int { family == .systemLarge ? 5 : (family == .systemSmall ? 1 : 2) }
    var body: some View {
        let d = entry.data
        let ready = d.packages.filter { $0.ready }.count
        WFrame(entry: entry, page: "tracking") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Pakker").font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Text(ready > 0 ? "\(d.packagesActive) på vei · \(ready) klar" : "\(d.packagesActive) på vei").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                }
                if d.packages.isEmpty {
                    Spacer(minLength: 0)
                    Text("Ingen pakker på vei").font(.footnote).foregroundStyle(.white.opacity(0.6))
                    Spacer(minLength: 0)
                } else {
                    ForEach(d.packages.prefix(limit)) { p in row(p) }
                    Spacer(minLength: 0)
                    if let first = d.packages.first, family != .systemSmall { StepDots(step: first.step) }
                }
            }
        }
    }

    private func row(_ p: WPackage) -> some View {
        HStack(spacing: 10) {
            WBadge(carrier: p.carrier)
            if family == .systemSmall {
                VStack(alignment: .leading, spacing: 1) {
                    Text(p.name).font(.system(size: 13)).lineLimit(1)
                    Text(p.statusText).font(.system(size: 11, weight: .semibold)).foregroundStyle(p.ready ? accentLight : .white.opacity(0.7)).lineLimit(1)
                }
            } else {
                Text(p.name).font(.system(size: 14)).lineLimit(1)
                Spacer(minLength: 4)
                Text(p.ready || p.eta.isEmpty ? p.statusText : shortDate(p.eta)).font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(p.ready ? accentLight : .white).lineLimit(1)
            }
        }
    }
}

/* ---------- Budsjett ---------- */

struct BudgetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.budget", provider: WProvider()) { e in BudgetView(entry: e) }
            .configurationDisplayName("Budsjett")
            .description("Brukt denne måneden mot budsjettet.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct WMeter: View {
    let value: Double
    var color: Color = accent
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.2))
                Capsule().fill(color).frame(width: g.size.width * Swift.min(1, Swift.max(0, value)))
            }
        }
        .frame(height: 6)
    }
}

private struct BudgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    var body: some View {
        let d = entry.data
        let frac = (d.pct ?? ((d.spent ?? 0) / Swift.max(d.limit ?? 1, 1) * 100)) / 100
        WFrame(entry: entry, page: "budget") {
            VStack(alignment: .leading, spacing: 8) {
                Caption(text: d.budgetMonth.isEmpty ? "Brukt denne måneden" : "Brukt i \(d.budgetMonth)")
                Spacer(minLength: 0)
                Text(kr(d.spent)).font(.system(size: 30, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6)
                Text("av \(kr(d.limit)) kr").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                WMeter(value: frac, color: frac > 1 ? pink : accent)
                if family == .systemMedium {
                    ForEach(Array(d.budgetTop.prefix(2).enumerated()), id: \.offset) { _, r in
                        HStack(spacing: 8) {
                            Text(r.name).font(.system(size: 12)).lineLimit(1).frame(width: 110, alignment: .leading)
                            WMeter(value: r.limit > 0 ? r.spent / r.limit : 0, color: hexColor(r.color))
                        }
                    }
                }
            }
        }
    }
}

/* ---------- Finans ---------- */

struct FinanceWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.finance", provider: WProvider()) { e in FinanceView(entry: e) }
            .configurationDisplayName("Finans")
            .description("Saldo, siste transaksjoner og kvitteringer til gjennomgang.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

private struct FinanceView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    var body: some View {
        let d = entry.data
        let rows = family == .systemLarge ? 4 : 2
        WFrame(entry: entry, page: "home") {
            VStack(alignment: .leading, spacing: family == .systemLarge ? 12 : 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Finans").font(.system(size: 15, weight: .bold))
                    Spacer()
                    Text(shortDate(ISO8601DateFormatter().string(from: entry.date))).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("Saldo · alle kontoer").font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.7))
                    Text("\(kr(d.balance)) kr").font(.system(size: family == .systemLarge ? 34 : 26, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6)
                }
                if !d.recent.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(d.recent.prefix(rows).enumerated()), id: \.offset) { i, t in
                            if i > 0 { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1) }
                            HStack {
                                Text(t.merchant).font(.system(size: 14)).lineLimit(1)
                                Spacer()
                                Text(signed2(t.amount)).font(.system(size: 14, design: .monospaced)).foregroundStyle(t.amount > 0 ? positive : .white)
                            }
                            .padding(.vertical, family == .systemLarge ? 8 : 4)
                        }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(Color.black.opacity(0.2), in: RoundedRectangle(cornerRadius: 16))
                }
                if family == .systemLarge {
                    Spacer(minLength: 0)
                    Link(destination: link("receipts")) {
                        HStack {
                            Text(d.toReview == 1 ? "1 kvittering til gjennomgang" : "\(d.toReview) kvitteringer til gjennomgang").font(.system(size: 13.5))
                            Spacer()
                            Text("›")
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(accent.opacity(0.22), in: RoundedRectangle(cornerRadius: 14))
                    }
                }
            }
        }
    }
}

/* ---------- Neste trekk ---------- */

struct NextChargeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.nextcharge", provider: WProvider()) { e in NextChargeView(entry: e) }
            .configurationDisplayName("Neste trekk")
            .description("Neste abonnement som trekkes.")
            .supportedFamilies([.systemSmall])
    }
}

private struct NextChargeView: View {
    let entry: WEntry
    private func whenText(_ d: WidgetData) -> String {
        guard let n = d.nextDays else { return shortDate(d.nextDate) }
        if n <= 0 { return "I dag" }
        if d.nextDate.isEmpty { return "Om \(n) d" }
        return shortDate(d.nextDate) + " · om \(n) d"
    }
    var body: some View {
        let d = entry.data
        WFrame(entry: entry, page: "subs") {
            VStack(alignment: .leading, spacing: 4) {
                Caption(text: "Neste trekk")
                Spacer(minLength: 0)
                if d.nextName.isEmpty {
                    Text("Ingen trekk").font(.footnote).foregroundStyle(.white.opacity(0.6))
                } else {
                    HStack(spacing: 8) {
                        Text(String(d.nextName.prefix(1)).uppercased()).font(.system(size: 11, weight: .heavy))
                            .frame(width: 26, height: 26).background(accent, in: RoundedRectangle(cornerRadius: 7))
                        Text(d.nextName).font(.system(size: 15, weight: .bold)).lineLimit(1)
                    }
                    Text("\(kr(d.nextAmount)) kr").font(.system(size: 24, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6).padding(.top, 2)
                    Text(whenText(d))
                        .font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                }
            }
        }
    }
}

/* ---------- Aksjer ---------- */

struct StocksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.stocks", provider: WProvider()) { e in StocksView(entry: e) }
            .configurationDisplayName("Aksjer")
            .description("Trading 212: verdi og endring i dag.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct StocksView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    var body: some View {
        let d = entry.data
        let up = (d.stockPct ?? 0) >= 0
        WFrame(entry: entry, page: "stocks") {
            VStack(alignment: .leading, spacing: 4) {
                Caption(text: "Trading 212")
                Spacer(minLength: 0)
                if d.stockValue == nil {
                    Text("Ikke koblet til").font(.footnote).foregroundStyle(.white.opacity(0.6))
                } else {
                    Text(kr(d.stockValue)).font(.system(size: 26, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6)
                    Text("\(up ? "▲" : "▼") \(pctText(d.stockPct ?? 0)) i dag").font(.system(size: 13, weight: .semibold)).foregroundStyle(up ? positive : pink)
                    if family == .systemMedium {
                        HStack(spacing: 8) {
                            ForEach(Array(d.stockTop.prefix(3).enumerated()), id: \.offset) { _, s in
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(s.ticker).font(.system(size: 12, weight: .bold)).lineLimit(1)
                                    Text("\(s.changePct >= 0 ? "+" : "−")\(pctText(s.changePct))").font(.system(size: 11)).foregroundStyle(s.changePct >= 0 ? positive : pink)
                                }
                                .padding(8).frame(maxWidth: .infinity, alignment: .leading).background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                            }
                        }
                        .padding(.top, 4)
                    }
                }
            }
        }
    }
}

/* ---------- Domener ---------- */

struct DomainsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.domains", provider: WProvider()) { e in DomainsView(entry: e) }
            .configurationDisplayName("Domener")
            .description("Hvor mange domener som er oppe.")
            .supportedFamilies([.systemSmall])
    }
}

private struct DomainsView: View {
    let entry: WEntry
    var body: some View {
        let d = entry.data
        WFrame(entry: entry, page: "domains", tint: pink) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Circle().fill(d.domDown > 0 ? pink : positive).frame(width: 7, height: 7)
                    Caption(text: "Domener")
                }
                Spacer(minLength: 0)
                Text("\(d.domUp)/\(d.domTotal)").font(.system(size: 34, weight: .heavy)).lineLimit(1)
                Text(d.domDown > 0 ? "\(d.domDown) nede" : "Alle oppe").font(.system(size: 12, weight: .semibold)).foregroundStyle(d.domDown > 0 ? pink : positive)
            }
        }
    }
}

/* ---------- Mat ---------- */

struct MealWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.mat", provider: WProvider()) { e in MealView(entry: e) }
            .configurationDisplayName("Mat")
            .description("Middag i dag og i morgen.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct MealView: View {
    let entry: WEntry
    var body: some View {
        let d = entry.data
        WFrame(entry: entry, page: "mat") {
            VStack(alignment: .leading, spacing: 4) {
                Caption(text: "Middag i dag")
                Spacer(minLength: 0)
                Text(d.mealToday.isEmpty ? "Ingen rett" : d.mealToday).font(.system(size: 20, weight: .bold)).lineLimit(2).minimumScaleFactor(0.7)
                if !d.mealCook.isEmpty { Text("\(d.mealCook) lager").font(.system(size: 12.5)).foregroundStyle(accentLight) }
                if !d.mealTomorrow.isEmpty { Text("I morgen: \(d.mealTomorrow)").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).lineLimit(1) }
            }
        }
    }
}

/* ---------- Finn ---------- */

struct FinnWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.finn", provider: WProvider()) { e in FinnView(entry: e) }
            .configurationDisplayName("Finn")
            .description("Pågående Finn-handler og netto i år.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

private struct FinnView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    var body: some View {
        let d = entry.data
        WFrame(entry: entry, page: "finn") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Finn · \(d.finnActive) pågående").font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Text("netto \((d.finnNet ?? 0) >= 0 ? "+" : "")\(kr(d.finnNet)) kr").font(.system(size: 12, weight: .semibold))
                        .foregroundStyle((d.finnNet ?? 0) >= 0 ? positive : .white)
                }
                if d.finnItems.isEmpty {
                    Spacer(minLength: 0)
                    Text("Ingen pågående handler").font(.footnote).foregroundStyle(.white.opacity(0.6))
                }
                ForEach(Array(d.finnItems.prefix(family == .systemLarge ? 5 : 2).enumerated()), id: \.offset) { _, f in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(f.step.uppercased()).font(.system(size: 10, weight: .bold)).foregroundStyle(accentLight)
                        Text(f.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                        Text(f.status).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                }
                Spacer(minLength: 0)
            }
        }
    }
}

/* ---------- Boliger ---------- */

struct BoligWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.boliger", provider: WProvider()) { e in BoligView(entry: e) }
            .configurationDisplayName("Boliger")
            .description("Regninger som snart forfaller.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct BoligView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    var body: some View {
        let d = entry.data
        let total = d.boligDue.compactMap { $0.amount }.reduce(0, +)
        WFrame(entry: entry, page: "boliger") {
            VStack(alignment: .leading, spacing: 4) {
                Caption(text: d.bolig.isEmpty ? "Boliger" : "Boliger · \(d.bolig)")
                Spacer(minLength: 0)
                Text("\(kr(total)) kr").font(.system(size: 24, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6)
                Text(d.boligDue.isEmpty ? "Ingenting forfaller snart" : d.boligDue.prefix(family == .systemSmall ? 2 : 4).map { $0.title }.joined(separator: " · "))
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).lineLimit(family == .systemSmall ? 2 : 1)
            }
        }
    }
}

/* ---------- Skann ---------- */

struct ScanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "fh.scan", provider: WProvider()) { e in ScanView(entry: e) }
            .configurationDisplayName("Skann")
            .description("Ta bilde av en kvittering eller last opp en fil.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct ScanView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry
    var body: some View {
        let d = entry.data
        WFrame(entry: entry, page: "scan/camera") {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Skann").font(.system(size: 15, weight: .bold))
                    Spacer()
                    if d.toReview > 0 { Text("\(d.toReview) i kø").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)) }
                }
                Spacer(minLength: 0)
                if family == .systemSmall {
                    VStack(spacing: 8) { cameraButton; filesButton }
                } else {
                    HStack(spacing: 10) { cameraButton; filesButton }
                }
            }
        }
    }

    private var cameraButton: some View {
        Button(intent: ScanCameraIntent()) {
            Label("Kamera", systemImage: "camera.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color(red: 0.1, green: 0.05, blue: 0.02))
                .frame(maxWidth: .infinity, minHeight: 38).background(accent, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var filesButton: some View {
        Button(intent: ScanFilesIntent()) {
            Label("Filer", systemImage: "folder.fill").font(.system(size: 14, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 38).background(Color.white.opacity(0.14), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
