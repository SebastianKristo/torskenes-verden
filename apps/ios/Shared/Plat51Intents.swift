import Foundation
import AppIntents
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 51 (IOSPLAT51): App Intents (Siri/Snarveier/widget-knapper) og Live Activities ----------------
 Intentene ligger i Shared (appen og widgetene), så widget-knappene (Button(intent:)) og Siri bruker samme kode.
 Snarveiene/Siri-frasene registreres bare i appen (Quick29Shortcuts i Quick29Intent.swift – én AppShortcutsProvider per app).
 – «Sjekk inn» (CheckIn51Intent): POST /api/family/checkin {to: alle i familien, quick}. Uten nett → offline-køen.
 – «Hent meg» (PickMe51Intent): samme med quick:'pickup' (høy prioritet hos mottakerne).
 – «Legg til melk» (ShopAdd51Intent): POST /mat/api/shopping {text}. Uten nett → offline-køen.
 – «Hva er saldoen» (Balance51Intent): GET /finans/api/fin51/calendar?days=30 (saldo nå + laveste de neste 30 dagene).
   Krever opplåst telefon (authenticationPolicy), så Siri aldri leser opp saldoen fra låseskjermen.
 – «Når går bussen» (NextBus51Intent): GET /api/widgets/departures (Hjem-stoppene).
 – «Følg avgangen» (BusFollow51Intent, LiveActivityIntent): «Bussen kommer om 3 min» som Live Activity.
 «På vei hjem» er Vel fremme/Hjemlys (Hjemlys40StartIntent + HjemlysLive40) – samme Live Activity som før.

 Live Activities (Plat51Attributes, én type med kind):
 – bus: linje, mål og avgangstid (teller ned selv, Text(timerInterval:)), avsluttes 2 min etter avgang.
 – package: pakke ute for levering / klar for henting (fra /api/mobile/widgets), avsluttes når den er levert/hentet.
 – download: nedlastinger i Media (fra /api/widgets/media), fremdrift i prosent, avsluttes når køen er tom.
 Appen oppdaterer pakker og nedlastinger når den er aktiv og ved bakgrunnshenting (Plat51Host.swift). */

/* ---------- Live Activity ---------- */

#if canImport(ActivityKit)
struct Plat51Attributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var sub: String
        /// Unix-sekunder (bus: avgangstid). 0 = ingen nedtelling.
        var endAt: Double
        /// 0…1, -1 = ingen fremdrift.
        var progress: Double
        /// active | soon | done | stalled
        var state: String
        /// «64 %», «Klar», «I dag»
        var value: String

        init(title: String, sub: String, endAt: Double = 0, progress: Double = -1, state: String = "active", value: String = "") {
            self.title = title
            self.sub = sub
            self.endAt = endAt
            self.progress = progress
            self.state = state
            self.value = value
        }

        var endDate: Date { Date(timeIntervalSince1970: endAt) }
    }

    /// bus | package | download
    var kind: String
    /// Unik nøkkel: «bus:<stopp>:<linje>:<tid>», «pkg:<id>», «downloads».
    var key: String
    /// Farge (hex) – linjefarge eller transportørens farge.
    var color: String
}

enum Plat51Activity {
    static func all() -> [Activity<Plat51Attributes>] { Activity<Plat51Attributes>.activities }

    static func find(_ key: String) -> Activity<Plat51Attributes>? {
        all().first { (a: Activity<Plat51Attributes>) -> Bool in a.attributes.key == key }
    }

    static var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    static func content(_ st: Plat51Attributes.ContentState, kind: String) -> ActivityContent<Plat51Attributes.ContentState> {
        let stale: Date
        if kind == "bus" && st.endAt > 0 {
            stale = Date(timeIntervalSince1970: st.endAt + 120)
        } else {
            stale = Date().addingTimeInterval(kind == "download" ? 30 * 60 : 4 * 3600)
        }
        return ActivityContent(state: st, staleDate: stale, relevanceScore: kind == "bus" ? 80 : (kind == "package" ? 50 : 30))
    }

    /// Starter eller oppdaterer. Ingenting skjer når brukeren har slått av Live Activities.
    static func upsert(kind: String, key: String, color: String, _ st: Plat51Attributes.ContentState) async {
        if let a = find(key) {
            await a.update(content(st, kind: kind))
            return
        }
        guard enabled else { return }
        let attr: Plat51Attributes = Plat51Attributes(kind: kind, key: key, color: color)
        _ = try? Activity<Plat51Attributes>.request(attributes: attr, content: content(st, kind: kind), pushType: nil)
    }

    static func end(_ key: String, state st: Plat51Attributes.ContentState? = nil, after: TimeInterval = 0) async {
        guard let a = find(key) else { return }
        let fin: Plat51Attributes.ContentState = st ?? a.content.state
        let policy: ActivityUIDismissalPolicy = after > 0 ? .after(Date().addingTimeInterval(after)) : .immediate
        await a.end(content(fin, kind: a.attributes.kind), dismissalPolicy: policy)
    }

    /// Avganger som har gått, avsluttes (kalles av appen og av intentene).
    static func sweepBuses() async {
        let now: Double = Date().timeIntervalSince1970
        for a in all() where a.attributes.kind == "bus" && a.content.state.endAt > 0 && a.content.state.endAt + 120 < now {
            await a.end(nil, dismissalPolicy: .immediate)
        }
    }

    /* ---------- Pakker og nedlastinger (fra appen) ---------- */

    static var autoPackages: Bool {
        get { WidgetShared.defaults.object(forKey: "plat51.la.packages") as? Bool ?? true }
        set { WidgetShared.defaults.set(newValue, forKey: "plat51.la.packages") }
    }

    static var autoDownloads: Bool {
        get { WidgetShared.defaults.object(forKey: "plat51.la.downloads") as? Bool ?? true }
        set { WidgetShared.defaults.set(newValue, forKey: "plat51.la.downloads") }
    }

    /// Pakker fra /api/mobile/widgets (packages.items): ute for levering eller klar for henting → Live Activity.
    static func syncPackages(_ widgetsJSON: Data?) async {
        guard autoPackages, let widgetsJSON else { return }
        let o: [String: Any] = Plat51Net.obj(widgetsJSON)
        let items: [[String: Any]] = Plat51Net.list(o["packages"] as? [String: Any], "items")
        var live: Set<String> = []
        for p in items.prefix(8) {
            let status: String = Plat51Net.str(p, "status") ?? ""
            guard status == "out_for_delivery" || status == "ready_for_pickup" else { continue }
            let id: String = Plat51Net.str(p, "id") ?? ""
            if id.isEmpty || live.count >= 2 { continue }
            let key: String = "pkg:" + id
            live.insert(key)
            let ready: Bool = status == "ready_for_pickup"
            let step: Double = Plat51Net.num(p, "step") ?? (ready ? 4 : 3)
            let st: Plat51Attributes.ContentState = Plat51Attributes.ContentState(
                title: Plat51Net.str(p, "name") ?? "Pakke",
                sub: Plat51Net.str(p, "statusText") ?? (ready ? "Klar for henting" : "Ute for levering"),
                progress: Swift.min(1, Swift.max(0, step / 4)), state: ready ? "done" : "active",
                value: ready ? "Klar" : (Plat51Net.str(p, "carrierName") ?? "I dag"))
            await upsert(kind: "package", key: key, color: Plat51Net.str(p, "carrier") ?? "", st)
        }
        for a in all() where a.attributes.kind == "package" && !live.contains(a.attributes.key) {
            var st: Plat51Attributes.ContentState = a.content.state
            st.state = "done"
            st.sub = "Levert eller hentet"
            st.progress = 1
            await a.end(content(st, kind: "package"), dismissalPolicy: .after(Date().addingTimeInterval(15 * 60)))
        }
    }

    /// Nedlastinger i Media → én Live Activity med samlet fremdrift.
    static func syncDownloads(_ v: Media43WData) async {
        guard autoDownloads else { return }
        let active: [Media43WDownload] = v.downloads.filter { $0.progress < 0.999 }
        if active.isEmpty || v.paused {
            if let a = find("downloads") {
                var st: Plat51Attributes.ContentState = a.content.state
                st.state = "done"
                st.progress = v.paused ? st.progress : 1
                st.sub = v.paused ? "Satt på pause" : "Ferdig"
                st.value = v.paused ? "Pause" : "100 %"
                await a.end(content(st, kind: "download"), dismissalPolicy: .after(Date().addingTimeInterval(10 * 60)))
            }
            return
        }
        let avg: Double = active.map { $0.progress }.reduce(0, +) / Double(active.count)
        let stalled: Bool = active.allSatisfy { $0.stalled }
        let title: String = active.count == 1 ? (active[0].name.isEmpty ? "Laster ned" : active[0].name) : "Laster ned \(active.count)"
        let sub: String = active.count == 1 ? (active[0].sub.isEmpty ? Media43W.speed(v.speed) : active[0].sub + " · " + Media43W.speed(v.speed))
            : (active.first?.name ?? "") + " · " + Media43W.speed(v.speed)
        let st: Plat51Attributes.ContentState = Plat51Attributes.ContentState(title: title, sub: sub, progress: avg, state: stalled ? "stalled" : "active",
                                                                             value: "\(Int((avg * 100).rounded())) %")
        await upsert(kind: "download", key: "downloads", color: "#7BC144", st)
    }
}
#endif

/* ---------- Sjekk inn ---------- */

enum CheckIn51Kind: String, AppEnum {
    case arrived
    case party
    case late
    case ok

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Innsjekk"
    static var caseDisplayRepresentations: [CheckIn51Kind: DisplayRepresentation] = [
        .arrived: "Er framme",
        .party: "Alt bra",
        .late: "Blir sent",
        .ok: "Alt OK",
    ]
}

enum Plat51Checkin {
    /// Mottakerne (alle i familien). Fra bufferen når nettet mangler.
    static func people() async -> [Plat51Person] {
        let s: Plat51CheckinSnap = await Plat51CheckinSnap.load()
        return s.people
    }

    /// (tekst til Siri/widgeten, ok)
    static func send(quick: String) async -> (String, Bool) {
        let p: [Plat51Person] = await people()
        if p.isEmpty { return ("Fant ingen i familien å sjekke inn til. Åpne Familie i appen først.", false) }
        let label: String = quick == "pickup" ? "Hent meg" : "Sjekk inn"
        let res: (Bool, Bool, Data) = await Offline51.send("POST", "/api/family/checkin", ["to": p.map { $0.id }, "quick": quick], label: label)
        let who: String = Plat51CheckinSnap.names(p)
        WidgetCenter.shared.reloadTimelines(ofKind: Plat51Kinds.checkin)
        if res.0 {
            return (quick == "pickup" ? "«Hent meg» er sendt til " + who + "." : "Sjekket inn. Sendt til " + who + ".", true)
        }
        if res.1 { return ("Ingen nett. Sendes til " + who + " så snart telefonen er på nett.", true) }
        let err: String = Plat51Net.str(Plat51Net.obj(res.2), "error") ?? "Fikk ikke kontakt med serveren."
        return (err, false)
    }
}

/// «Sjekk inn» (Siri, Snarveier og Sjekk inn-widgeten).
struct CheckIn51Intent: AppIntent {
    static var title: LocalizedStringResource = "Sjekk inn"
    static var description: IntentDescription = IntentDescription("Sier fra til familien at alt er bra, uten å åpne appen.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Hva", default: .arrived)
    var kind: CheckIn51Kind

    init() {}

    init(kind: CheckIn51Kind) {
        self.kind = kind
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r: (String, Bool) = await Plat51Checkin.send(quick: kind.rawValue)
        return .result(dialog: "\(r.0)")
    }
}

/// «Hent meg» – høy prioritet hos mottakerne.
struct PickMe51Intent: AppIntent {
    static var title: LocalizedStringResource = "Hent meg"
    static var description: IntentDescription = IntentDescription("Ber familien om å hente deg (høy prioritet).")
    static var openAppWhenRun: Bool = false

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let r: (String, Bool) = await Plat51Checkin.send(quick: "pickup")
        return .result(dialog: "\(r.0)")
    }
}

/* ---------- Handleliste ---------- */

struct ShopAdd51Intent: AppIntent {
    static var title: LocalizedStringResource = "Legg til på handlelisten"
    static var description: IntentDescription = IntentDescription("Legger en vare på handlelisten i Matplan, f.eks. «melk».")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Vare", requestValueDialog: IntentDialog("Hva skal på handlelisten?"))
    var item: String

    init() {}

    init(item: String) {
        self.item = item
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let t: String = item.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return .result(dialog: "Si hvilken vare som skal på listen.") }
        let text: String = t.prefix(1).uppercased() + t.dropFirst()
        let res: (Bool, Bool, Data) = await Offline51.send("POST", "/mat/api/shopping", ["text": text], label: text)
        if res.0 { return .result(dialog: "\(text) er lagt på handlelisten.") }
        if res.1 { return .result(dialog: "Ingen nett. \(text) legges på handlelisten så snart telefonen er på nett.") }
        let err: String = Plat51Net.str(Plat51Net.obj(res.2), "error") ?? "Fikk ikke kontakt med serveren."
        return .result(dialog: "\(err)")
    }
}

/* ---------- Saldo ---------- */

struct Balance51Intent: AppIntent {
    static var title: LocalizedStringResource = "Hva er saldoen"
    static var description: IntentDescription = IntentDescription("Saldoen nå og den laveste saldoen de neste 30 dagene (Planlegging).")
    static var openAppWhenRun: Bool = false
    /// Saldoen leses aldri opp fra en låst telefon.
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let s: Plat51PlanSnap = await Plat51PlanSnap.load()
        if !s.has { return .result(dialog: "Fant ingen saldo. Åpne Planlegging i appen og koble til en konto.") }
        var msg: String = "Saldoen er " + Plat51Net.kr(s.today) + "."
        if !s.lowestDate.isEmpty && s.lowest < s.today - 0.5 {
            msg += " Laveste de neste 30 dagene er " + Plat51Net.kr(s.lowest) + " " + Plat51Net.day(s.lowestDate) + "."
        }
        if !s.nextName.isEmpty {
            msg += " Neste trekk: " + s.nextName + " " + Plat51Net.kr(abs(s.nextAmount)) + " " + Plat51Net.day(s.nextDate) + "."
        }
        return .result(dialog: "\(msg)")
    }
}

/* ---------- Avganger ---------- */

enum Plat51Bus {
    static func load() async -> Ruter27Snapshot? {
        let r: Plat51Net.Reply = await Plat51Net.request("GET", "/api/widgets/departures", timeout: 8)
        if r.ok, let s = Ruter27Shared.parseWidget(r.data) {
            Ruter27Shared.saveCache(s)
            return s
        }
        return Ruter27Shared.cache()
    }

    /// «om 3 min» / «nå»
    static func when(_ d: Ruter27Dep, _ now: Date = Date()) -> String {
        let m: Int = d.minutes(at: now)
        return m <= 0 ? "nå" : "om \(m) min"
    }

    static func key(_ stop: String, _ d: Ruter27Dep) -> String {
        "bus:" + stop + ":" + d.line + ":" + String(Int(d.expected.timeIntervalSince1970))
    }
}

struct NextBus51Intent: AppIntent {
    static var title: LocalizedStringResource = "Når går bussen"
    static var description: IntentDescription = IntentDescription("De neste avgangene fra stoppene på Hjem.")
    static var openAppWhenRun: Bool = false

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let s = await Plat51Bus.load() else { return .result(dialog: "Fant ingen avganger. Legg til et stopp under Avganger i appen.") }
        let now: Date = Date()
        var parts: [String] = []
        for stop in s.stops.prefix(2) {
            let deps: [Ruter27Dep] = Array(stop.upcoming(at: now).prefix(3))
            if deps.isEmpty { continue }
            let t: String = deps.map { $0.line + " " + $0.dest + " " + Plat51Bus.when($0, now) }.joined(separator: ", ")
            parts.append("Fra " + stop.name + ": " + t + ".")
        }
        if parts.isEmpty { return .result(dialog: "Ingen avganger den nærmeste tiden.") }
        #if canImport(ActivityKit)
        await Plat51Activity.sweepBuses()
        #endif
        return .result(dialog: "\(parts.joined(separator: " "))")
    }
}

/// «Følg» på avgangs-widgeten: «Bussen kommer om 3 min» på låseskjermen og i Dynamic Island.
struct BusFollow51Intent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Følg avgangen"
    static var description: IntentDescription = IntentDescription("Viser nedtellingen til avgangen på låseskjermen.")

    @Parameter(title: "Stopp")
    var stop: String

    @Parameter(title: "Linje")
    var line: String

    @Parameter(title: "Mål")
    var dest: String

    @Parameter(title: "Avgang (Unix-sekunder)")
    var at: Double

    @Parameter(title: "Farge")
    var color: String

    init() {}

    init(stop: String, line: String, dest: String, at: Double, color: String) {
        self.stop = stop
        self.line = line
        self.dest = dest
        self.at = at
        self.color = color
    }

    func perform() async throws -> some IntentResult {
        #if canImport(ActivityKit)
        await Plat51Activity.sweepBuses()
        let key: String = "bus:" + stop + ":" + line + ":" + String(Int(at))
        // Bare én avgang følges om gangen.
        for a in Plat51Activity.all() where a.attributes.kind == "bus" && a.attributes.key != key {
            await a.end(nil, dismissalPolicy: .immediate)
        }
        let st: Plat51Attributes.ContentState = Plat51Attributes.ContentState(title: line + " " + dest, sub: stop, endAt: at, state: "active", value: line)
        await Plat51Activity.upsert(kind: "bus", key: key, color: color, st)
        #endif
        return .result()
    }
}

/// Avslutter fulgt avgang (knappen i Live Activity).
struct BusStop51Intent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Slutt å følge avgangen"
    static var description: IntentDescription = IntentDescription("Fjerner nedtellingen fra låseskjermen.")

    @Parameter(title: "Nøkkel")
    var key: String

    init() {}

    init(key: String) {
        self.key = key
    }

    func perform() async throws -> some IntentResult {
        #if canImport(ActivityKit)
        await Plat51Activity.end(key)
        #endif
        return .result()
    }
}
