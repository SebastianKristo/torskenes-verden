import Foundation
import SwiftUI
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 40: Hjemlys – Live Activity (iPhone 2a), felles for appen og widgetene ----------------
   prompts/prompt-40-pakke/claude-code-hjemlys.md, fasit design/Hjemme trygt Varianter.dc.html → 2a.
   «Et lite lys som står på til du er hjemme.» Glødende prikk #FFE7A3 → #F2A93B. Grønn = på vei, rød = sen, gul glød = hjemme.
   ActivityAttributes: økt-id, navn og mottakere. ContentState: eta (Unix-sekunder), progress 0…1, leg («Trikk 19»), state
   (onTheWay | late | home | ended), lateMinutes, homeAt (Unix-sekunder, 0 = ikke hjemme), from (startsted).
   Push fra serveren (APNs liveactivity-token) bruker samme form i «content-state» (alle felt valgfrie).
   App Intents «+ 10 min», «Jeg er hjemme» og «Alt OK» (LiveActivityIntent) virker uten å åpne/låse opp: de kaller
   PATCH /api/hjemlys/:id {plus:10}, POST /api/hjemlys/:id/home og POST /api/hjemlys/:id/ok med appens token fra App Group,
   og oppdaterer Live Activity lokalt med en gang. Personvern: Live Activity viser bare egen tid og fremdrift. */

/// Farger og tekst (delt mellom appen og Live Activity).
enum Hjemlys40Look {
    static func c(_ v: UInt32, _ a: Double = 1) -> Color {
        Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255, opacity: a)
    }
    static let glowIn: Color = c(0xffe7a3)
    static let glowOut: Color = c(0xf2a93b)
    static let green: Color = c(0x3fbf7a)
    static let red: Color = c(0xe0342a)
    static let gold: Color = c(0xf2c14e)
    static let track: Color = c(0x2a2a2e)

    /// «8 min» / «1 t 5 min» / «nå».
    static func mins(_ m: Int) -> String {
        if m <= 0 { return "nå" }
        if m < 60 { return "\(m) min" }
        let h: Int = m / 60
        let r: Int = m % 60
        return r == 0 ? "\(h) t" : "\(h) t \(r) min"
    }

    /// «23:38».
    static func clock(_ d: Date) -> String {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = TimeZone(identifier: "Europe/Oslo") ?? TimeZone.current
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }

    static func minutesLeft(_ eta: Double, _ now: Date = Date()) -> Int {
        Int(((eta - now.timeIntervalSince1970) / 60).rounded(.up))
    }
}

/// Den glødende prikken (radial gradient + glød). state styrer fargen.
struct Hjemlys40Dot: View {
    let size: CGFloat
    var state: String = "onTheWay"

    var body: some View {
        Group {
            if state == "late" {
                Text("!").font(.system(size: size * 0.55, weight: .heavy)).foregroundStyle(Color.white)
                    .frame(width: size, height: size)
                    .background(Hjemlys40Look.red, in: Circle())
                    .shadow(color: Hjemlys40Look.red.opacity(0.7), radius: size * 0.4)
            } else {
                Circle()
                    .fill(RadialGradient(colors: state == "home" ? [Hjemlys40Look.c(0xfff6d6), Hjemlys40Look.gold] : [Hjemlys40Look.glowIn, Hjemlys40Look.glowOut],
                                         center: UnitPoint(x: 0.5, y: 0.4), startRadius: 0, endRadius: size * 0.5))
                    .frame(width: size, height: size)
                    .shadow(color: (state == "home" ? Hjemlys40Look.gold : Hjemlys40Look.glowOut).opacity(0.8), radius: size * 0.4)
            }
        }
        .accessibilityHidden(true)
    }
}

/* ---------- Nett (fra App Group, virker i appen og i intent-prosessen) ---------- */

enum Hjemlys40Net {
    /// Kall mot /api/hjemlys… med appens token. Prøver hovedadressen, ekstern og lokal adresse.
    @discardableResult
    static func call(_ method: String, _ path: String, _ body: [String: Any]?) async -> Data? {
        guard let token = WidgetShared.token, !token.isEmpty else { return nil }
        for base in WidgetShared.bases {
            let b: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: b + "/api" + path) else { continue }
            var r: URLRequest = URLRequest(url: url)
            r.httpMethod = method
            r.timeoutInterval = 12
            r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            if let body {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
                r.httpBody = try? JSONSerialization.data(withJSONObject: body)
            }
            do {
                let pair: (Data, URLResponse) = try await URLSession.shared.data(for: r)
                let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
                if code > 0 && code < 400 { return pair.0 }
                if code >= 400 { return nil }
            } catch {
                continue
            }
        }
        return nil
    }
}

/* ---------- Live Activity ---------- */

#if canImport(ActivityKit)
@available(iOS 16.2, *)
struct Hjemlys40Attributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var eta: Double
        var progress: Double
        var leg: String
        var state: String
        var lateMinutes: Int
        var homeAt: Double
        var from: String

        init(eta: Double, progress: Double, leg: String, state: String, lateMinutes: Int, homeAt: Double, from: String) {
            self.eta = eta
            self.progress = progress
            self.leg = leg
            self.state = state
            self.lateMinutes = lateMinutes
            self.homeAt = homeAt
            self.from = from
        }

        enum CodingKeys: String, CodingKey {
            case eta, progress, leg, state, lateMinutes, homeAt, from
        }

        /// Tolerant mot push fra serveren: alle felt er valgfrie, eta kan være sekunder eller millisekunder.
        init(from decoder: Decoder) throws {
            let c: KeyedDecodingContainer<CodingKeys> = try decoder.container(keyedBy: CodingKeys.self)
            let rawEta: Double = (try? c.decodeIfPresent(Double.self, forKey: .eta)) ?? Date().timeIntervalSince1970
            eta = rawEta > 100_000_000_000 ? rawEta / 1000 : rawEta
            progress = (try? c.decodeIfPresent(Double.self, forKey: .progress)) ?? 0
            leg = (try? c.decodeIfPresent(String.self, forKey: .leg)) ?? ""
            state = (try? c.decodeIfPresent(String.self, forKey: .state)) ?? "onTheWay"
            lateMinutes = (try? c.decodeIfPresent(Int.self, forKey: .lateMinutes)) ?? 0
            let rawHome: Double = (try? c.decodeIfPresent(Double.self, forKey: .homeAt)) ?? 0
            homeAt = rawHome > 100_000_000_000 ? rawHome / 1000 : rawHome
            from = (try? c.decodeIfPresent(String.self, forKey: .from)) ?? ""
        }

        var etaDate: Date { Date(timeIntervalSince1970: eta) }
        var homeDate: Date? { homeAt > 0 ? Date(timeIntervalSince1970: homeAt) : nil }
    }

    var sessionId: String
    var name: String
    /// «Rune og Cybele følger med» / «Husstanden følger med».
    var recipients: String
}

@available(iOS 16.2, *)
enum Hjemlys40Activity {
    static func find(_ id: String) -> Activity<Hjemlys40Attributes>? {
        Activity<Hjemlys40Attributes>.activities.first { (a: Activity<Hjemlys40Attributes>) -> Bool in a.attributes.sessionId == id }
    }

    static var anyId: String? { Activity<Hjemlys40Attributes>.activities.first?.attributes.sessionId }

    static func content(_ st: Hjemlys40Attributes.ContentState) -> ActivityContent<Hjemlys40Attributes.ContentState> {
        ActivityContent(state: st, staleDate: Date(timeIntervalSince1970: Swift.max(st.eta, Date().timeIntervalSince1970) + 3 * 3600),
                        relevanceScore: st.state == "late" ? 100 : 60)
    }

    /// Lokal oppdatering (knappene og appen). Ingenting skjer hvis aktiviteten ikke finnes.
    static func update(_ id: String, _ mutate: (inout Hjemlys40Attributes.ContentState) -> Void) async {
        guard let a = find(id) else { return }
        var st: Hjemlys40Attributes.ContentState = a.content.state
        mutate(&st)
        await a.update(content(st))
    }

    /// Hjemme → gul glød «Hjemme 23:36 ✓», forsvinner etter 5 min. Avsluttet → borte med en gang.
    static func end(_ id: String, home: Bool) async {
        guard let a = find(id) else { return }
        var st: Hjemlys40Attributes.ContentState = a.content.state
        if home {
            st.state = "home"
            if st.homeAt <= 0 { st.homeAt = Date().timeIntervalSince1970 }
            st.progress = 1
            await a.end(content(st), dismissalPolicy: .after(Date().addingTimeInterval(5 * 60)))
        } else {
            st.state = "ended"
            await a.end(content(st), dismissalPolicy: .immediate)
        }
    }
}
#endif

/* ---------- App Intents (knappene i Live Activity) ---------- */

/// «+ 10 min» (og «+ 15 min» når du er sen).
struct Hjemlys40PlusIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Hjemlys: mer tid"
    static var description: IntentDescription = IntentDescription("Gir deg mer tid før familien får beskjed.")

    @Parameter(title: "Økt")
    var sessionId: String

    @Parameter(title: "Minutter")
    var minutes: Int

    init() {}

    init(sessionId: String, minutes: Int) {
        self.sessionId = sessionId
        self.minutes = minutes
    }

    func perform() async throws -> some IntentResult {
        let id: String = sessionId
        let m: Int = minutes > 0 ? minutes : 10
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        await Hjemlys40Net.call("PATCH", "/hjemlys/" + enc, ["plus": m])
        #if canImport(ActivityKit)
        await Hjemlys40Activity.update(id) { (st: inout Hjemlys40Attributes.ContentState) in
            let base: Double = Swift.max(st.eta, Date().timeIntervalSince1970)
            st.eta = base + Double(m) * 60
            if st.state == "late" {
                st.state = "onTheWay"
                st.lateMinutes = 0
            }
        }
        #endif
        NotificationCenter.default.post(name: Hjemlys40Intents.changed, object: nil)
        return .result()
    }
}

/// «Jeg er hjemme».
struct Hjemlys40HomeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Hjemlys: jeg er hjemme"
    static var description: IntentDescription = IntentDescription("Sier fra til familien at du er hjemme, og avslutter Hjemlys.")

    @Parameter(title: "Økt")
    var sessionId: String

    init() {}

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let id: String = sessionId
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        await Hjemlys40Net.call("POST", "/hjemlys/" + enc + "/home", [:])
        #if canImport(ActivityKit)
        await Hjemlys40Activity.end(id, home: true)
        #endif
        NotificationCenter.default.post(name: Hjemlys40Intents.changed, object: nil)
        return .result()
    }
}

/// «Alt OK» (svar på «Alt OK?» når tiden er passert).
struct Hjemlys40OkIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Hjemlys: alt OK"
    static var description: IntentDescription = IntentDescription("Sier fra at alt er i orden.")

    @Parameter(title: "Økt")
    var sessionId: String

    init() {}

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    func perform() async throws -> some IntentResult {
        let id: String = sessionId
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        await Hjemlys40Net.call("POST", "/hjemlys/" + enc + "/ok", [:])
        #if canImport(ActivityKit)
        await Hjemlys40Activity.update(id) { (st: inout Hjemlys40Attributes.ContentState) in
            st.state = "onTheWay"
            st.lateMinutes = 0
            st.eta = Swift.max(st.eta, Date().timeIntervalSince1970 + 10 * 60)
        }
        #endif
        NotificationCenter.default.post(name: Hjemlys40Intents.changed, object: nil)
        return .result()
    }
}

enum Hjemlys40Intents {
    /// Appen henter Hjemlys på nytt når en knapp er brukt.
    static let changed: Notification.Name = Notification.Name("no.kristo.finanshub.hjemlys40")
}
