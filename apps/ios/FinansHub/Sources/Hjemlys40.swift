import SwiftUI
import UIKit
import CoreLocation
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 40: Hjemlys i appen – Familie-kortet, enkel start og Live Activity ----------------
   prompts/prompt-40-pakke/claude-code-hjemlys.md, fasit design/Hjemme trygt Varianter.dc.html (2a + «Felles»).
   Flyten 1a/1b/1c er IKKE valgt ennå: her er bare en enkel, nøytral start (ark: forventet tid, mottakere = husstanden,
   ventetid 5/15/30) som lett kan byttes ut (Hjemlys40StartSheet).
   API (SERVER40, klienten tåler 404 – da vises ikke kortet):
     GET  /api/hjemlys → {mine|null, household:[{userId, name, avatar, state, eta, since}]}
     POST /api/hjemlys/start {eta, mode, waitMin, recipients?} → {session}
     PATCH /api/hjemlys/:id {eta?, pos?:{lat,lon,acc}, battery?, signal?, plus?:10} (maks hvert 30. s / 50 m)
     POST /api/hjemlys/:id/ok | /home | /end
     POST /api/hjemlys/tokens {platform:'ios', kind:'liveactivity'|'pushtostart', token, sessionId?}
     GET  /api/hjemlys/suggest → {suggest, reason, eta}
   Personvern: husstanden ser bare at Hjemlys er aktivt (og tiden); posisjon, batteri osv. deles av serveren først når økta er
   «late». Appen sender posisjonen bare mens egen økt er aktiv, og stopper når du er hjemme. */

struct Hjemlys40Session: Hashable {
    var id: String = ""
    var name: String = ""
    /// onTheWay | late | home | ended
    var state: String = "onTheWay"
    var eta: Date = Date()
    var startedAt: Date = Date()
    var waitMin: Int = 15
    var progress: Double = 0
    var leg: String = ""
    var lateMinutes: Int = 0
    var recipients: [String] = []
    var homeAt: Date? = nil

    var active: Bool { state == "onTheWay" || state == "late" }

    init() {}

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? ""
        name = JS.str(o, "name") ?? ""
        state = JS.str(o, "state") ?? "onTheWay"
        eta = Hjemlys40Session.date(o["eta"]) ?? Date()
        startedAt = Hjemlys40Session.date(o["startedAt"]) ?? Date()
        waitMin = JS.int(o, "waitMin") ?? 15
        let p: Double = JS.num(o, "progress") ?? 0
        progress = p > 1 ? p / 100 : p
        leg = JS.str(o, "leg") ?? ""
        lateMinutes = JS.int(o, "lateMinutes") ?? 0
        let rec: [Any] = (o["recipients"] as? [Any]) ?? []
        recipients = rec.compactMap { (x: Any) -> String? in
            if let s = x as? String { return s }
            if let d = x as? [String: Any] { return JS.str(d, "name") }
            return nil
        }
        homeAt = Hjemlys40Session.date(o["homeAt"]) ?? Hjemlys40Session.date(o["endedAt"])
    }

    /// ISO-tid, Unix-sekunder eller millisekunder.
    static func date(_ v: Any?) -> Date? {
        if let n = v as? NSNumber {
            let d: Double = n.doubleValue
            if d <= 0 { return nil }
            return Date(timeIntervalSince1970: d > 100_000_000_000 ? d / 1000 : d)
        }
        guard let s = v as? String, !s.isEmpty else { return nil }
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    /// Fremdrift fra start til forventet tid når serveren ikke har sendt den.
    var progressNow: Double {
        if progress > 0 { return progress }
        let total: Double = eta.timeIntervalSince(startedAt)
        if total <= 0 { return 0 }
        return Swift.min(1, Swift.max(0, Date().timeIntervalSince(startedAt) / total))
    }
}

struct Hjemlys40Member: Identifiable, Hashable {
    var id: String
    var name: String
    var avatar: String
    var state: String
    var eta: Date?
    var since: Date?

    init(_ o: [String: Any]) {
        id = JS.str(o, "userId") ?? JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? "Ukjent"
        avatar = JS.str(o, "avatar") ?? JS.str(o, "avatarUrl") ?? ""
        state = JS.str(o, "state") ?? ""
        eta = Hjemlys40Session.date(o["eta"])
        since = Hjemlys40Session.date(o["since"])
    }

    var active: Bool { state == "onTheWay" || state == "late" }

    /// «på vei · hjemme ca. 23:38» / «sen · 12 min over» / «hjemme 23:36».
    var line: String {
        switch state {
        case "onTheWay": return "på vei · hjemme ca. " + (eta.map { Hjemlys40Look.clock($0) } ?? "–")
        case "late": return "sen · familien er varslet"
        case "home": return "hjemme " + (since.map { Hjemlys40Look.clock($0) } ?? "")
        default: return "ikke aktiv"
        }
    }
}

@MainActor
@Observable
final class Hjemlys40Model {
    static let shared = Hjemlys40Model()

    /// false når serveren mangler /api/hjemlys (404).
    var supported: Bool = true
    var loaded: Bool = false
    var mine: Hjemlys40Session? = nil
    var household: [Hjemlys40Member] = []
    var suggest: Bool = false
    var suggestReason: String = ""
    var suggestEta: Date? = nil
    var busy: Bool = false
    var err: String = ""
    var startOpen: Bool = false
    @ObservationIgnored private var observer: NSObjectProtocol? = nil
    @ObservationIgnored private var tokenTasks: [Task<Void, Never>] = []
    @ObservationIgnored private var pushStartWatching: Bool = false

    init() {
        observer = NotificationCenter.default.addObserver(forName: Hjemlys40Intents.changed, object: nil, queue: .main) { (_: Notification) in
            Task { @MainActor in Hjemlys40Model.shared.reloadSoon() }
        }
    }

    @ObservationIgnored private var storeRef: Store? = nil

    private func reloadSoon() {
        guard let s = storeRef else { return }
        Task { await self.load(s) }
    }

    func load(_ store: Store) async {
        storeRef = store
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/hjemlys", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            supported = true
            if let mo = o["mine"] as? [String: Any] {
                let s: Hjemlys40Session = Hjemlys40Session(mo)
                mine = s.id.isEmpty ? nil : s
            } else {
                mine = nil
            }
            let hh: [Any] = (o["household"] as? [Any]) ?? []
            household = hh.compactMap { $0 as? [String: Any] }.map { (x: [String: Any]) -> Hjemlys40Member in Hjemlys40Member(x) }
            loaded = true
            await syncActivity()
            if let m = mine, m.active { Hjemlys40Location.shared.start(store, sessionId: m.id) } else { Hjemlys40Location.shared.stop() }
            watchPushToStart(store)
        } catch let e as APIError {
            if e.status == 404 { supported = false }
            loaded = true
        } catch {
            loaded = true
        }
        await loadSuggest(store)
    }

    func loadSuggest(_ store: Store) async {
        guard supported, mine == nil || mine?.active == false else { suggest = false; return }
        guard let d = try? await store.api.callAt("/api", "GET", "/hjemlys/suggest", timeout: 10) else { suggest = false; return }
        let o: [String: Any] = JS.obj(d)
        suggest = JS.bool(o, "suggest") ?? false
        suggestReason = JS.str(o, "reason") ?? ""
        suggestEta = Hjemlys40Session.date(o["eta"])
    }

    /* ---------- Handlinger ---------- */

    func start(_ store: Store, eta: Date, waitMin: Int) {
        busy = true
        err = ""
        Haptic30.double()
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        let body: [String: Any] = ["eta": f.string(from: eta), "mode": "simple", "waitMin": waitMin]
        Task {
            defer { self.busy = false }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/hjemlys/start", json: body, timeout: 20)
                let o: [String: Any] = JS.obj(d)
                let so: [String: Any] = (o["session"] as? [String: Any]) ?? o
                var s: Hjemlys40Session = Hjemlys40Session(so)
                if s.id.isEmpty { self.err = "Serveren startet ikke Hjemlys. Prøv igjen."; return }
                if JS.str(so, "eta") == nil && (so["eta"] as? NSNumber) == nil { s.eta = eta }
                self.mine = s
                self.startOpen = false
                self.suggest = false
                await self.startActivity(s, store)
                Hjemlys40Location.shared.start(store, sessionId: s.id)
                store.flash("Hjemlys er på · husstanden ser at du er på vei")
            } catch let e as APIError {
                self.err = e.status == 404 ? "Serveren støtter ikke Hjemlys ennå. Oppdater Homelab." : e.message
            } catch {
                self.err = error.localizedDescription
            }
        }
    }

    func plus(_ store: Store, _ minutes: Int = 10) {
        guard var s = mine else { return }
        Haptic30.light()
        s.eta = Swift.max(s.eta, Date()).addingTimeInterval(Double(minutes) * 60)
        if s.state == "late" { s.state = "onTheWay"; s.lateMinutes = 0 }
        mine = s
        let id: String = s.id
        Task {
            _ = try? await store.api.callAt("/api", "PATCH", "/hjemlys/" + Hjemlys40Model.enc(id), json: ["plus": minutes], timeout: 15)
            await self.syncActivity()
        }
    }

    func ok(_ store: Store) {
        guard let s = mine else { return }
        Haptic30.light()
        act(store, s.id, "ok")
    }

    func home(_ store: Store) {
        guard var s = mine else { return }
        Haptic30.double()
        s.state = "home"
        s.homeAt = Date()
        mine = s
        Hjemlys40Location.shared.stop()
        let id: String = s.id
        Task {
            #if canImport(ActivityKit)
            await Hjemlys40Activity.end(id, home: true)
            #endif
        }
        act(store, id, "home")
    }

    func end(_ store: Store) {
        guard let s = mine else { return }
        Haptic30.light()
        mine = nil
        Hjemlys40Location.shared.stop()
        let id: String = s.id
        Task {
            #if canImport(ActivityKit)
            await Hjemlys40Activity.end(id, home: false)
            #endif
        }
        act(store, id, "end")
    }

    private func act(_ store: Store, _ id: String, _ what: String) {
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/hjemlys/" + Hjemlys40Model.enc(id) + "/" + what, json: [:], timeout: 15)
            } catch let e as APIError {
                store.flash(e.message)
            } catch {
                store.flash(error.localizedDescription)
            }
            await self.load(store)
        }
    }

    static func enc(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    }

    /// «Rune og Cybele følger med» / «Husstanden følger med».
    var recipientsText: String {
        let names: [String] = (mine?.recipients.isEmpty == false ? mine?.recipients : nil) ?? household.filter { $0.id != "" }.map(\.name)
        let short: [String] = names.prefix(3).map { String($0.split(separator: " ").first ?? Substring($0)) }
        if short.isEmpty { return "Husstanden følger med" }
        if short.count == 1 { return short[0] + " følger med" }
        return short.dropLast().joined(separator: ", ") + " og " + (short.last ?? "") + " følger med"
    }

    /* ---------- Live Activity ---------- */

    private func startActivity(_ s: Hjemlys40Session, _ store: Store) async {
        #if canImport(ActivityKit)
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        if Hjemlys40Activity.find(s.id) != nil { await syncActivity(); return }
        let attr: Hjemlys40Attributes = Hjemlys40Attributes(sessionId: s.id, name: s.name.isEmpty ? store.displayName : s.name, recipients: recipientsText)
        let st: Hjemlys40Attributes.ContentState = state(s)
        let content: ActivityContent<Hjemlys40Attributes.ContentState> = Hjemlys40Activity.content(st)
        var activity: Activity<Hjemlys40Attributes>? = nil
        do {
            // Push-token krever «Push Notifications» (aps-environment). Uten det startes den uten push (oppdateres lokalt).
            activity = try Activity<Hjemlys40Attributes>.request(attributes: attr, content: content, pushType: .token)
        } catch {
            activity = try? Activity<Hjemlys40Attributes>.request(attributes: attr, content: content, pushType: nil)
        }
        if let a = activity { watchToken(a, s.id, store) }
        #endif
    }

    #if canImport(ActivityKit)
    private func state(_ s: Hjemlys40Session) -> Hjemlys40Attributes.ContentState {
        Hjemlys40Attributes.ContentState(eta: s.eta.timeIntervalSince1970, progress: s.progressNow, leg: s.leg, state: s.state,
                                         lateMinutes: s.lateMinutes, homeAt: s.homeAt?.timeIntervalSince1970 ?? 0, from: "")
    }

    private func watchToken(_ a: Activity<Hjemlys40Attributes>, _ id: String, _ store: Store) {
        let t: Task<Void, Never> = Task {
            for await data in a.pushTokenUpdates {
                let hex: String = data.map { String(format: "%02x", $0) }.joined()
                _ = try? await store.api.callAt("/api", "POST", "/hjemlys/tokens",
                                                json: ["platform": "ios", "kind": "liveactivity", "token": hex, "sessionId": id], timeout: 15)
            }
        }
        tokenTasks.append(t)
    }
    #endif

    /// Mottakere kan få «Følg … hjem» som egen Live Activity via push-to-start (iOS 17.2+).
    private func watchPushToStart(_ store: Store) {
        #if canImport(ActivityKit)
        if pushStartWatching { return }
        if #available(iOS 17.2, *) {
            pushStartWatching = true
            let t: Task<Void, Never> = Task {
                for await data in Activity<Hjemlys40Attributes>.pushToStartTokenUpdates {
                    let hex: String = data.map { String(format: "%02x", $0) }.joined()
                    _ = try? await store.api.callAt("/api", "POST", "/hjemlys/tokens",
                                                    json: ["platform": "ios", "kind": "pushtostart", "token": hex], timeout: 15)
                }
            }
            tokenTasks.append(t)
        }
        #endif
    }

    /// Live Activity følger serverens tilstand (sen → rød, hjemme → gul glød, avsluttet → borte).
    private func syncActivity() async {
        #if canImport(ActivityKit)
        guard let s = mine else {
            for a in Activity<Hjemlys40Attributes>.activities {
                await Hjemlys40Activity.end(a.attributes.sessionId, home: false)
            }
            return
        }
        if s.state == "home" { await Hjemlys40Activity.end(s.id, home: true); return }
        if s.state == "ended" { await Hjemlys40Activity.end(s.id, home: false); return }
        let st: Hjemlys40Attributes.ContentState = state(s)
        await Hjemlys40Activity.update(s.id) { (x: inout Hjemlys40Attributes.ContentState) in x = st }
        #endif
    }
}

/* ---------- Posisjon mens egen økt er aktiv ---------- */

/// Sender posisjon og batteri til PATCH /api/hjemlys/:id høyst hvert 30. sekund eller etter 50 m. Serveren avgjør hjemme
/// (geofence 60 m) og deler ingenting før økta er sen.
final class Hjemlys40Location: NSObject, CLLocationManagerDelegate {
    static let shared = Hjemlys40Location()

    private let manager: CLLocationManager = CLLocationManager()
    private var sessionId: String = ""
    private var base: String = ""
    private var token: String? = nil
    private var lastSent: CLLocation? = nil
    private var lastSentAt: Date = .distantPast
    private var running: Bool = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 50
        manager.activityType = .otherNavigation
        manager.pausesLocationUpdatesAutomatically = false
    }

    @MainActor func start(_ store: Store, sessionId id: String) {
        sessionId = id
        base = store.api.base
        token = store.api.token
        if running { return }
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted: return
        default: break
        }
        UIDevice.current.isBatteryMonitoringEnabled = true
        if manager.authorizationStatus == .authorizedAlways { manager.allowsBackgroundLocationUpdates = true }
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        running = true
    }

    @MainActor func stop() {
        if !running { return }
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        running = false
        sessionId = ""
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        if running || sessionId.isEmpty { return }
        let st: CLAuthorizationStatus = m.authorizationStatus
        if st == .authorizedWhenInUse || st == .authorizedAlways {
            m.startUpdatingLocation()
            running = true
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, loc.horizontalAccuracy >= 0, !sessionId.isEmpty else { return }
        let far: Bool = lastSent.map { loc.distance(from: $0) >= 50 } ?? true
        guard far && Date().timeIntervalSince(lastSentAt) >= 30 else { return }
        lastSent = loc
        lastSentAt = Date()
        let id: String = sessionId
        let b: String = base
        let tk: String? = token
        let lat: Double = loc.coordinate.latitude
        let lon: Double = loc.coordinate.longitude
        let acc: Double = loc.horizontalAccuracy
        Task { @MainActor in
            let level: Float = UIDevice.current.batteryLevel
            var body: [String: Any] = ["pos": ["lat": lat, "lon": lon, "acc": acc]]
            if level >= 0 { body["battery"] = Int((level * 100).rounded()) }
            let api: API = API(base: b, token: tk)
            _ = try? await api.callAt("/api", "PATCH", "/hjemlys/" + Hjemlys40Model.enc(id), json: body, timeout: 15)
        }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}
}

/* ---------- Familie-kortet ---------- */

/// Øverst i Familie: egen økt (tid, fremdrift, knapper) eller «Start Hjemlys», Glimt-forslag og status for husstanden.
struct Hjemlys40Card: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        Group {
            if m.supported {
                VStack(alignment: .leading, spacing: 12) {
                    head
                    if let s = m.mine, s.active || s.state == "home" {
                        Hjemlys40Mine(s: s)
                    } else {
                        if m.suggest { Hjemlys40Suggest() }
                        Button { Haptic30.light(); m.startOpen = true } label: {
                            Text("Start Hjemlys").font(PF.ui(15, .bold)).foregroundStyle(p.bg)
                                .frame(maxWidth: .infinity).frame(height: 48)
                                .background(p.ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    let others: [Hjemlys40Member] = m.household.filter { $0.active || $0.state == "home" }
                    if !others.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(others) { (h: Hjemlys40Member) in Hjemlys40MemberRow(h: h) }
                        }
                    }
                }
                .padding(16)
                .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .sheet(isPresented: Binding<Bool>(get: { m.startOpen }, set: { (v: Bool) in m.startOpen = v })) {
                    Hjemlys40StartSheet()
                        .environment(\.paper, p)
                        .presentationDetents([.medium, .large])
                }
            }
        }
        .task { await m.load(store) }
    }

    private var head: some View {
        HStack(spacing: 10) {
            Hjemlys40Dot(size: 22, state: m.mine?.state ?? "onTheWay")
            VStack(alignment: .leading, spacing: 1) {
                Text("HJEMLYS").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                Text("Et lite lys som står på til du er hjemme.").font(PF.ui(12.5)).foregroundStyle(p.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }
}

/// Egen aktive økt.
struct Hjemlys40Mine: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    let s: Hjemlys40Session

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(PF.serif(24, medium: true)).foregroundStyle(color)
                Spacer()
                if s.state == "onTheWay" {
                    Text("ca. " + Hjemlys40Look.clock(s.eta)).font(PF.mono(13)).foregroundStyle(p.mut)
                }
            }
            Text(sub).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            if s.state != "home" {
                GeometryReader { (g: GeometryProxy) in
                    ZStack(alignment: .leading) {
                        Capsule().fill(p.line)
                        Capsule().fill(color).frame(width: Swift.max(6, g.size.width * CGFloat(s.progressNow)))
                    }
                }
                .frame(height: 6)
            }
            buttons
        }
    }

    private var color: Color {
        switch s.state {
        case "late": return Hjemlys40Look.red
        case "home": return Color(hex: "#a8661a")
        default: return Color(hex: "#2f7a4f")
        }
    }

    private var title: String {
        switch s.state {
        case "late": return "\(s.lateMinutes) min over"
        case "home": return "Hjemme " + Hjemlys40Look.clock(s.homeAt ?? Date()) + " ✓"
        default: return "På vei hjem · " + Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(s.eta.timeIntervalSince1970))
        }
    }

    private var sub: String {
        switch s.state {
        case "late": return "Familien har fått beskjed. Svar «Alt OK» hvis alt er i orden."
        case "home": return "Familien har fått beskjed. Deling er stoppet."
        default: return m.recipientsText + ". Ingenting deles før du eventuelt er sen."
        }
    }

    @ViewBuilder private var buttons: some View {
        if s.state == "late" {
            HStack(spacing: 8) {
                Hjemlys40Pill(title: "Alt OK", dark: true) { m.ok(store) }
                Hjemlys40Pill(title: "+ 15 min", dark: false) { m.plus(store, 15) }
            }
        } else if s.state == "onTheWay" {
            HStack(spacing: 8) {
                Hjemlys40Pill(title: "+ 10 min", dark: false) { m.plus(store, 10) }
                Hjemlys40Pill(title: "Jeg er hjemme", dark: true) { m.home(store) }
            }
            Button { m.end(store) } label: {
                Text("Avslutt Hjemlys").font(PF.ui(13, .semibold)).foregroundStyle(p.mut).frame(height: 32)
            }
            .buttonStyle(.plain)
        }
    }
}

struct Hjemlys40Pill: View {
    @Environment(\.paper) private var p
    let title: String
    let dark: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(PF.ui(14, .bold)).foregroundStyle(dark ? p.bg : p.ink)
                .frame(maxWidth: .infinity).frame(height: 42)
                .background(dark ? p.ink : p.bg, in: Capsule())
                .overlay(Capsule().strokeBorder(dark ? Color.clear : p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// «✦ Glimt foreslår …» (kalenderhendelse som slutter sent, etter 22, nattbuss).
struct Hjemlys40Suggest: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("✦").font(PF.ui(15, .bold)).foregroundStyle(Color(hex: "#e0553d"))
            Text(m.suggestReason.isEmpty ? "Glimt foreslår Hjemlys for turen hjem i kveld." : "Glimt: " + m.suggestReason)
                .font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Én i husstanden: bare tilstand og tid (aldri posisjon).
struct Hjemlys40MemberRow: View {
    @Environment(\.paper) private var p
    let h: Hjemlys40Member

    var body: some View {
        HStack(spacing: 10) {
            Text(String(h.name.prefix(1)).uppercased()).font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                .frame(width: 32, height: 32)
                .background(p.bg, in: Circle())
                .overlay(Circle().strokeBorder(ring, lineWidth: 2))
            VStack(alignment: .leading, spacing: 1) {
                Text(h.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                Text(h.line).font(PF.ui(12)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 0)
            Hjemlys40Dot(size: 12, state: h.state)
        }
        .padding(.vertical, 8)
        .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    private var ring: Color {
        switch h.state {
        case "late": return Hjemlys40Look.red
        case "home": return Hjemlys40Look.gold
        default: return Hjemlys40Look.green
        }
    }
}

/* ---------- Enkel start (nøytral, byttes ut når flyten 1a/1b/1c er valgt) ---------- */

struct Hjemlys40StartSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    @State private var eta: Date = Hjemlys40Time.rounded(Date().addingTimeInterval(30 * 60))
    @State private var wait: Int = 15

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button("Avbryt") { m.startOpen = false }.font(PF.ui(15, .semibold)).foregroundStyle(p.mut)
                    Spacer()
                    Text("Hjemlys").font(PF.ui(16, .bold)).foregroundStyle(p.ink)
                    Spacer()
                    Color.clear.frame(width: 52, height: 1)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("NÅR ER DU HJEMME?").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    DatePicker("Forventet tid", selection: $eta, in: Date()..., displayedComponents: [.hourAndMinute])
                        .datePickerStyle(.compact)
                        .font(PF.ui(15))
                    HStack(spacing: 6) {
                        ForEach([15, 30, 45, 60], id: \.self) { (n: Int) in
                            Button { eta = Date().addingTimeInterval(Double(n) * 60) } label: {
                                Text("om \(n) min").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                                    .padding(.horizontal, 10).frame(height: 30)
                                    .background(p.card, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("FÅR BESKJED").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    Text(recipients).font(PF.ui(14.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("VENT FØR FAMILIEN VARSLES").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    Picker("Ventetid", selection: $wait) {
                        Text("5 min").tag(5)
                        Text("15 min").tag(15)
                        Text("30 min").tag(30)
                    }
                    .pickerStyle(.segmented)
                    Text("Passerer tiden, spør Hjemlys «Alt OK?». Svarer du ikke innen ventetiden, får familien beskjed med siste posisjon, batteri og dekning. Ingenting deles før det.")
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                if !m.err.isEmpty {
                    Text(m.err).font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#b23a2a"))
                }
                Button { m.start(store, eta: eta, waitMin: wait) } label: {
                    HStack(spacing: 8) {
                        if m.busy { ProgressView().tint(p.bg) }
                        Text("Start Hjemlys").font(PF.ui(16, .bold))
                    }
                    .foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(m.busy)
            }
            .padding(20)
        }
        .background(p.bg.ignoresSafeArea())
        .onAppear {
            // Glimt-forslaget har gjerne en tid (f.eks. når kinoen slutter + reisetid).
            if let s = m.suggestEta, s > Date() { eta = Hjemlys40Time.rounded(s) }
        }
    }

    private var recipients: String {
        let names: [String] = FamilyModel.shared.members.filter { $0.id != FamilyModel.shared.meId }.map(\.name)
        if names.isEmpty { return "Alle i husstanden" }
        return "Alle i husstanden: " + names.joined(separator: ", ")
    }
}

/// Runder opp til nærmeste 5 minutter.
enum Hjemlys40Time {
    static func rounded(_ d: Date) -> Date {
        Date(timeIntervalSince1970: (d.timeIntervalSince1970 / 300).rounded(.up) * 300)
    }
}
