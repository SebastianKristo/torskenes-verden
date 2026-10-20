import SwiftUI
import UIKit

/* ---------------- Prompt 39: «Glimt · ukas vær» nederst i Vær ---------------- */
// Spesifikasjon: claude-code-vaer-glimt-ukas-vaer.md. Fasit: design/Vaer.dc.html → wkVals() + kortet over «Data: …».
// Data: Open-Meteo daily (past_days=7, forecast_days=7): forrige uke = indeks 0–6, denne uka = 7–13. Cache per sted i 3 t.
// SERVER39: GET /api/weather/week-summary?place=&char= → {text, char, thisWeek, lastWeek, highlights[]} (Glimt-LLM i valgt stemme).
// Tallene regnes alltid lokalt; serverens tekst brukes når den finnes for valgt personlighet, ellers den lokale teksten.

struct WxWeek39Data: Hashable {
    var maxT: [Double] = []
    var minT: [Double] = []
    var mm: [Double] = []
    var sun: [Double] = []
    var wind: [Double] = []
    var dates: [String] = []
}

@MainActor
@Observable
final class WxWeek39Model {
    static let shared = WxWeek39Model()

    var data: [String: WxWeek39Data] = [:]
    var serverText: [String: String] = [:]
    var person: String = UserDefaults.standard.string(forKey: "vaer_glimt_p") ?? "sky"
    @ObservationIgnored private var fetched: [String: Date] = [:]
    @ObservationIgnored private var busy: Set<String> = []

    static let persons: [(String, String, String)] = [("sky", "Sky", "Sky · den rolige"), ("ugle", "Ugle", "Ugle · tallknuseren"), ("spire", "Spire", "Spire · ut og lek")]

    static func key(_ lat: Double, _ lon: Double) -> String { String(format: "%.3f,%.3f", lat, lon) }

    func pick(_ k: String, _ store: Store) {
        Haptics.shared.select()
        person = k
        UserDefaults.standard.set(k, forKey: "vaer_glimt_p")
        store.savePaperLayout(["vaer_glimt_p": k])
    }

    func load(lat: Double, lon: Double, placeQuery: String, _ store: Store) async {
        let k: String = WxWeek39Model.key(lat, lon)
        if busy.contains(k) { return }
        if let t = fetched[k], Date().timeIntervalSince(t) < 3 * 3600, data[k] != nil {
            await loadServer(k, placeQuery, store)
            return
        }
        busy.insert(k)
        defer { busy.remove(k) }
        let s: String = "https://api.open-meteo.com/v1/forecast?latitude=\(lat)&longitude=\(lon)"
            + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,weather_code,wind_speed_10m_max"
            + "&wind_speed_unit=ms&timezone=auto&past_days=7&forecast_days=7"
        if let url = URL(string: s), let res = try? await URLSession.shared.data(from: url) {
            let o: [String: Any] = JS.obj(res.0)
            if let daily = o["daily"] as? [String: Any] {
                var w: WxWeek39Data = WxWeek39Data()
                w.maxT = WxWeek39Model.nums(daily["temperature_2m_max"])
                w.minT = WxWeek39Model.nums(daily["temperature_2m_min"])
                w.mm = WxWeek39Model.nums(daily["precipitation_sum"])
                w.sun = WxWeek39Model.nums(daily["sunshine_duration"])
                w.wind = WxWeek39Model.nums(daily["wind_speed_10m_max"])
                w.dates = (daily["time"] as? [Any])?.compactMap { $0 as? String } ?? []
                if w.maxT.count >= 8 {
                    data[k] = w
                    fetched[k] = Date()
                }
            }
        }
        await loadServer(k, placeQuery, store)
    }

    /// Glimt-teksten fra serveren for valgt personlighet (tåler 404).
    private func loadServer(_ k: String, _ placeQuery: String, _ store: Store) async {
        let p: String = person
        let sk: String = k + "|" + p
        if serverText[sk] != nil { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/weather/week-summary?\(placeQuery)&char=\(p)", timeout: 20) else { return }
        let o: [String: Any] = JS.obj(d)
        guard let t = JS.str(o, "text"), !t.isEmpty else { return }
        let ch: String = JS.str(o, "char") ?? p
        serverText[k + "|" + ch] = t
    }

    static func nums(_ v: Any?) -> [Double] {
        ((v as? [Any]) ?? []).map { (x: Any) -> Double in (x as? NSNumber)?.doubleValue ?? 0 }
    }
}

/// Utregnet sammendrag (tall, tekster og rader).
struct WxWeek39Summary {
    var text: String
    var stats: [(String, String, String)]
    var rows: [(String, String)]

    static func f1(_ x: Double) -> String {
        let r: Double = (x * 10).rounded() / 10
        let s: String = r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
        return s.replacingOccurrences(of: ".", with: ",")
    }

    static func sg(_ x: Double) -> String { (x > 0.05 ? "+" : x < -0.05 ? "−" : "±") + f1(abs(x)) }

    static func make(_ W: WxWeek39Data, person: String) -> WxWeek39Summary {
        let n: Int = Swift.min(W.maxT.count, W.minT.count, W.mm.count)
        let last: [Int] = Array(0..<Swift.min(7, n))
        let this: [Int] = Array(7..<Swift.max(7, Swift.min(14, n)))
        func at(_ a: [Double], _ i: Int) -> Double { i < a.count ? a[i] : 0 }
        func mean(_ a: [Double]) -> Double { a.isEmpty ? 0 : a.reduce(0, +) / Double(a.count) }
        let tw: Double = mean(this.map { (at(W.maxT, $0) + at(W.minT, $0)) / 2 })
        let tl: Double = mean(last.map { (at(W.maxT, $0) + at(W.minT, $0)) / 2 })
        let dT: Double = tw - tl
        let pw: Double = this.map { at(W.mm, $0) }.reduce(0, +)
        let pl: Double = last.map { at(W.mm, $0) }.reduce(0, +)
        let sw: Int = Int((this.map { at(W.sun, $0) }.reduce(0, +) / 3600).rounded())
        let sl: Int = Int((last.map { at(W.sun, $0) }.reduce(0, +) / 3600).rounded())
        let wet: [Int] = this.filter { at(W.mm, $0) >= 1 }
        func score(_ i: Int) -> Double { at(W.maxT, i) - at(W.mm, i) * 1.5 - at(W.wind, i) * 0.4 + at(W.sun, i) / 3600 * 0.3 }
        let best: Int = this.max { (a: Int, b: Int) -> Bool in score(a) < score(b) } ?? 7
        let mx: Double = mean(this.map { at(W.maxT, $0) })
        let cloth: String = mx < 3 ? "Vinterjakke, lue og votter" : mx < 8 ? "Varm jakke og skjerf" : mx < 13 ? "Lett jakke eller ullgenser" : mx < 18 ? "Genser holder" : "T-skjorte-vær"
        func dn(_ i: Int) -> String {
            if i == 7 { return "i dag" }
            if i == 8 { return "i morgen" }
            let f: DateFormatter = DateFormatter()
            f.locale = Locale(identifier: "nb_NO")
            f.dateFormat = "yyyy-MM-dd"
            guard i < W.dates.count, let d = f.date(from: W.dates[i]) else { return "dag \(i - 6)" }
            f.dateFormat = "EEEE"
            return f.string(from: d)
        }
        var umb: String = "ingen dager"
        if !wet.isEmpty {
            let names: [String] = wet.map { dn($0) }
            umb = names.count == 1 ? names[0] : names.dropLast().joined(separator: ", ") + " og " + (names.last ?? "")
        }
        let bestTxt: String = dn(best) + " med \(Int(at(W.maxT, best).rounded()))°" + (at(W.mm, best) < 0.5 ? " og opphold" : ", " + f1(at(W.mm, best)) + " mm")
        let warm: String = dT >= 0.5 ? "litt varmere enn" : dT <= -0.5 ? "litt kaldere enn" : "omtrent som"
        let wetW: String = pw > pl + 3 ? "våtere" : pw < pl - 3 ? "tørrere" : "omtrent like våt"
        var text: String
        switch person {
        case "ugle":
            text = "Snittet denne uka er \(f1(tw))°, \(sg(dT))° mot forrige uke. Nedbør \(f1(pw)) mm mot \(f1(pl)) mm, og \(sw) soltimer mot \(sl). Regn \(wet.count) av \(this.count) dager."
        case "spire":
            text = "Beste dag ute er \(bestTxt). Paraply: \(umb). \(cloth)."
        default:
            let rain: String = wet.isEmpty ? "Ingen regndager, " : "Regn \(umb), "
            let fine: String = dn(best) == "i dag" ? "og i dag" : "og " + dn(best)
            text = "Uka blir \(warm) forrige uke, og \(wetW). Snittet ligger rundt \(Int(tw.rounded()))°. " + rain + fine + " ser finest ut."
        }
        func cap(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }
        return WxWeek39Summary(
            text: text,
            stats: [("TEMP", sg(dT) + "°", "mot forrige uke"), ("NEDBØR", f1(pw) + " mm", "forrige: " + f1(pl) + " mm"), ("SOL", "\(sw) t", "forrige: \(sl) t")],
            rows: [("Beste dag ute", cap(bestTxt)), ("Paraply", cap(umb)), ("Klær", cloth)]
        )
    }
}

/// Kortet nederst i Vær: GLIMT · UKAS VÆR, personlighet (Sky / Ugle / Spire), figur + tekst, tre ruter og tre rader.
struct WxWeek39Card: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    let w: WeatherFull
    @MainActor private var m: WxWeek39Model { WxWeek39Model.shared }

    var body: some View {
        let lat: Double = w.lat ?? store.weatherPlaceObj?.lat ?? 59.91
        let lon: Double = w.lon ?? store.weatherPlaceObj?.lon ?? 10.75
        let k: String = WxWeek39Model.key(lat, lon)
        let who: String = WxWeek39Model.persons.first(where: { $0.0 == m.person })?.2 ?? "Sky · den rolige"
        let sum: WxWeek39Summary? = m.data[k].map { WxWeek39Summary.make($0, person: m.person) }
        let txt: String = m.serverText[k + "|" + m.person] ?? sum?.text ?? "Henter ukas vær og forrige uke …"
        VStack(alignment: .leading, spacing: 14) {
            header
            HStack(alignment: .top, spacing: 12) {
                Glimt35Fig(id: m.person, size: 54, mood: .glad, still: true)
                    .frame(width: 58, height: 62)
                VStack(alignment: .leading, spacing: 4) {
                    Text(who).font(.system(size: 13, weight: .bold)).opacity(0.75)
                    Text(txt).font(.system(size: 15.5)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                        .animation(.easeOut(duration: 0.2), value: txt)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let sum {
                HStack(spacing: 8) {
                    ForEach(0..<sum.stats.count, id: \.self) { (i: Int) in
                        stat(sum.stats[i])
                    }
                }
                VStack(spacing: 0) {
                    ForEach(0..<sum.rows.count, id: \.self) { (i: Int) in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(sum.rows[i].0).font(.system(size: 14)).opacity(0.75)
                            Spacer(minLength: 6)
                            Text(sum.rows[i].1).font(.system(size: 14, weight: .semibold)).multilineTextAlignment(.trailing)
                        }
                        .padding(.vertical, 10)
                        .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1) }
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.07), lineWidth: 1))
        .task(id: k + m.person) {
            await WxWeek39Model.shared.load(lat: lat, lon: lon, placeQuery: store.weatherPlaceObj?.query ?? "place=\(store.weatherPlace)", store)
        }
    }

    /// Prompt 40: tittelen alene på raden, personlighetsvelgeren på egen rad under (full bredde, tre like knapper, 32 pt).
    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                ZStack {
                    Circle().fill(AngularGradient(colors: [Color(hex: "#b23a2a"), Color(hex: "#e8794a"), Color(hex: "#f2c14e"), Color(hex: "#3fbf9a"),
                                                           Color(hex: "#4f8fd6"), Color(hex: "#7a5ad6"), Color(hex: "#b23a2a")], center: .center))
                    Circle().fill(Color(hex: "#fffdf8")).frame(width: 10, height: 10)
                }
                .frame(width: 16, height: 16)
                Text("GLIMT · UKAS VÆR").font(.system(size: 12, weight: .heavy)).tracking(1).opacity(0.8).lineLimit(1)
            }
            HStack(spacing: 4) {
                ForEach(WxWeek39Model.persons, id: \.0) { (p: (String, String, String)) in
                    Button { m.pick(p.0, store) } label: {
                        Text(p.1).font(.system(size: 13, weight: .bold))
                            .foregroundStyle(m.person == p.0 ? Color(hex: "#1b2a40") : Color.white)
                            .frame(maxWidth: .infinity).frame(height: 32)
                            .background(m.person == p.0 ? Color.white.opacity(0.9) : Color.clear, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(3)
            .background(Color.black.opacity(0.18), in: Capsule())
            .animation(.easeOut(duration: 0.2), value: m.person)
        }
    }

    private func stat(_ s: (String, String, String)) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(s.0).font(.system(size: 11, weight: .heavy)).tracking(0.9).opacity(0.65)
            Text(s.1).font(.system(size: 20, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
            // Prompt 40: undertekstene får gå over to linjer i stedet for å kuttes.
            Text(s.2).font(.system(size: 11.5)).opacity(0.7).lineLimit(2).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
