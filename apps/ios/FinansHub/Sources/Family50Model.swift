import SwiftUI
import UIKit
import CoreLocation

/* ---------------- Prompt 50: Familie i nytt design – data og navigasjon (FAMIOS50) ----------------
   Spesifikasjon: prompt-50-pakke/claude-code-familie-nytt-design.md og claude-code-steder-flere-omrader-ruter.md.
   Fasit: design/Familie App.dc.html (klikkbar) og Familie Redesign.dc.html 2a. API: SERVER50-API.md, seksjon SRVFAM50.
     GET /api/family/people50 · /today50 · /places · /places/regions · /health50 · /checkin (+ POST-ene under).
   Fanene i fanelinja er de samme id-ene som før (kart · soner · helse · hjemlys, Nav32.swift), men heter nå
   Folk · Steder · Helse · Sjekk inn. Undersidene (Kart, Personside, Sted, Helse for personen, Sendt, På vei hjem)
   ligger i en stabel (Fam50Nav), så tilbake – knapp eller kantsveip – går dit du kom fra. Eldre server uten people50:
   den gamle Familie-siden vises (Family16.swift). */

/* ---------- Små typer ---------- */

/// Person som liten visning (avatar): {userId, name, initials, color, photoUrl, self}.
struct Fam50Mini: Hashable, Identifiable {
    var id: String { userId }
    var userId: String
    var name: String
    var initials: String
    var color: String
    var photoUrl: String
    var isSelf: Bool

    init(_ o: [String: Any]?) {
        userId = JS.str(o, "userId") ?? JS.str(o, "id") ?? ""
        name = JS.str(o, "name") ?? "Ukjent"
        let nm: String = JS.str(o, "name") ?? "Ukjent"
        initials = JS.str(o, "initials") ?? String(nm.prefix(2))
        color = JS.str(o, "color") ?? ""
        photoUrl = JS.str(o, "photoUrl") ?? ""
        isSelf = JS.bool(o, "self") ?? false
    }

    var first: String { name.split(separator: " ").first.map(String.init) ?? name }
    var hex: String { color.isEmpty ? FamPerson20Build.stableColor(userId) : color }
}

struct Fam50FromMe: Hashable {
    var meters: Double
    var text: String
    var dir: String
    var bearing: Double
    var label: String
}

/// GET /api/family/people50 → people[].
struct Fam50Person: Hashable, Identifiable {
    var id: String { mini.userId }
    var mini: Fam50Mini
    var sharing: String
    var status: String
    var place: String
    var sub: String
    var statusLine: String
    var zone: String
    var activity: String
    var speedKmh: Double?
    var battery: Double?
    var charging: Bool
    var lowBattery: Bool
    var lat: Double?
    var lon: Double?
    var acc: Double?
    var approx: Bool
    var updatedAt: Date?
    var device: String
    var fromMe: Fam50FromMe?
    var healthShared: Bool
    /// Nummeret personen har lagt inn i Vel fremme (bare for familien), til Ring og Melding.
    var phone: String

    init(_ o: [String: Any]) {
        mini = Fam50Mini(o)
        sharing = JS.str(o, "sharing") ?? "on"
        status = JS.str(o, "status") ?? "off"
        place = JS.str(o, "place") ?? ""
        sub = JS.str(o, "sub") ?? ""
        statusLine = JS.str(o, "statusLine") ?? ""
        zone = JS.str(o, "zone") ?? ""
        activity = JS.str(o, "activity") ?? ""
        speedKmh = JS.num(o, "speedKmh")
        battery = JS.num(o, "battery")
        charging = JS.bool(o, "charging") ?? false
        lowBattery = JS.bool(o, "lowBattery") ?? ((JS.num(o, "battery") ?? 100) < 25)
        lat = JS.num(o, "lat")
        lon = JS.num(o, "lon")
        acc = JS.num(o, "acc")
        approx = JS.bool(o, "approx") ?? false
        updatedAt = JS.date(o["updatedAt"])
        device = JS.str(o, "device") ?? ""
        healthShared = JS.bool(o, "healthShared") ?? false
        phone = JS.str(o, "phone") ?? ""
        if let f = JS.dict(o, "fromMe") {
            fromMe = Fam50FromMe(meters: JS.num(f, "m") ?? 0, text: JS.str(f, "text") ?? "", dir: JS.str(f, "dir") ?? "",
                                 bearing: JS.num(f, "bearing") ?? 0, label: JS.str(f, "label") ?? "")
        } else {
            fromMe = nil
        }
    }

    var coord: CLLocationCoordinate2D? {
        guard let lat, let lon else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    /// «82 %» med ⚡ ved lading, tom når batteri ikke deles.
    var batteryText: String {
        guard let b = battery else { return "" }
        return String(Int(b.rounded())) + " %" + (charging ? " ⚡" : "")
    }

    /// Tiden alene til kartlista: «08:05», «går», «i bil» (fra sub).
    var sinceShort: String {
        if sub.hasPrefix("siden ") { return String(sub.dropFirst(6)) }
        if !activity.isEmpty { return activity }
        return sub
    }
}

/// Område i et sted: {id, name, lat, lon, radius_m, label}.
struct Fam50Area: Hashable, Identifiable {
    var id: String
    var name: String
    var lat: Double
    var lon: Double
    var radius: Double

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? "Område"
        lat = JS.num(o, "lat") ?? 0
        lon = JS.num(o, "lon") ?? 0
        radius = JS.num(o, "radius_m") ?? JS.num(o, "radius") ?? 150
    }

    init(id: String, name: String, lat: Double, lon: Double, radius: Double) {
        self.id = id; self.name = name; self.lat = lat; self.lon = lon; self.radius = radius
    }

    var coord: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
    var radiusText: String { Fam22Fmt.radius(radius) }
}

/// GET /api/family/places → places[].
struct Fam50Place: Hashable, Identifiable {
    var id: String
    var name: String
    var type: String
    var color: String
    var icon: String
    var mine: Bool
    var shared: Bool
    var createdBy: String
    var areas: [Fam50Area]
    var areaText: String
    var here: [Fam50Mini]
    var hereText: String
    var notifyText: String
    var usedBy: [String]
    var usedByText: String
    var canEdit: Bool
    var canRemoveArea: Bool

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? "Sted"
        type = JS.str(o, "type") ?? "annet"
        color = JS.str(o, "color") ?? "#2b5d8a"
        if let ic = JS.str(o, "icon"), let icp = JS.str(o, "icp"), ic.hasPrefix("ify:") { Icons42.store(ic, icp) }
        let pname: String = name
        icon = Fam22Icons.valid(JS.str(o, "icon")) ?? Fam50Place.typeIcon(JS.str(o, "type") ?? "") ?? Fam22Icons.defaultFor(pname)
        mine = JS.bool(o, "mine") ?? true
        shared = JS.bool(o, "shared") ?? false
        createdBy = JS.str(o, "createdBy") ?? JS.str(o, "created_by") ?? ""
        var list: [Fam50Area] = JS.list(o, "areas").map { Fam50Area($0) }
        if list.isEmpty, let la = JS.num(o, "lat"), let lo = JS.num(o, "lon") {
            list = [Fam50Area(id: "0", name: pname, lat: la, lon: lo, radius: JS.num(o, "radius") ?? 150)]
        }
        areas = list
        areaText = JS.str(o, "areaText") ?? (list.count == 1 ? "1 område" : String(list.count) + " områder")
        here = JS.list(o, "here").map { Fam50Mini($0) }
        hereText = JS.str(o, "hereText") ?? "Ingen her nå"
        notifyText = JS.str(o, "notifyText") ?? ""
        usedBy = JS.strings(o, "usedBy")
        usedByText = JS.str(o, "usedByText") ?? ""
        let edit: Bool = JS.bool(o, "canEdit") ?? (JS.bool(o, "mine") ?? true)
        canEdit = edit
        canRemoveArea = JS.bool(o, "canRemoveArea") ?? (edit && list.count > 1)
    }

    nonisolated static func typeIcon(_ t: String) -> String? {
        switch t {
        case "hjem": return "home"
        case "skole": return "school"
        case "jobb": return "work"
        default: return nil
        }
    }

    nonisolated static func typeName(_ t: String) -> String {
        switch t {
        case "hjem": return "Hjem"
        case "skole": return "Skole"
        case "jobb": return "Jobb"
        default: return "Annet"
        }
    }

    /// «N her nå · 3 områder» (designet): områdetallet bare når stedet har mer enn ett område.
    var hereLine: String { areas.count > 1 ? hereText + " · " + areaText : hereText }
    var first: CLLocationCoordinate2D? { areas.first?.coord }
}

/// Rad i «I DAG» (today50) og «I DAG I FAMILIEN» (checkin.log).
struct Fam50Item: Hashable, Identifiable {
    var id: String
    var kind: String
    var avatar: Fam50Mini
    var title: String
    var sub: String
    var right: String
    var pending: Bool
    var alert: Bool
    var checkinId: String

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        kind = JS.str(o, "kind") ?? ""
        avatar = Fam50Mini(JS.dict(o, "avatar"))
        title = JS.str(o, "title") ?? ""
        sub = JS.str(o, "sub") ?? ""
        right = JS.str(o, "right") ?? JS.str(o, "time") ?? ""
        pending = JS.bool(o, "pending") ?? false
        alert = JS.bool(o, "alert") ?? false
        checkinId = JS.str(o, "checkinId") ?? ""
    }
}

struct Fam50Day: Hashable, Identifiable {
    var id: String { date }
    var date: String
    var day: String
    var today: Bool
    var steps: Double?
    var goalReached: Bool

    init(_ o: [String: Any]) {
        date = JS.str(o, "date") ?? UUID().uuidString
        day = JS.str(o, "day") ?? ""
        today = JS.bool(o, "today") ?? false
        steps = JS.num(o, "steps")
        goalReached = JS.bool(o, "goalReached") ?? false
    }
}

/// GET /api/family/health50 → people[] (hp).
struct Fam50Health: Hashable, Identifiable {
    var id: String { mini.userId }
    var mini: Fam50Mini
    var shared: Bool
    var short: String
    var text: String
    var actionUrl: String
    var shareText: String
    var sourceText: String
    var device: String
    var steps: Double?
    var stepsText: String
    var goal: Double
    var goalText: String
    var goalReached: Bool
    var badge: String
    var sleepText: String
    var sleepRange: String
    var restingHr: Double?
    var hr: Double?
    var activeKcal: Double?
    var battery: Double?
    var charging: Bool
    var week: [Fam50Day]
    var weekText: String

    init(_ o: [String: Any]) {
        mini = Fam50Mini(o)
        shared = JS.bool(o, "shared") ?? false
        short = JS.str(o, "short") ?? "Ikke delt"
        text = JS.str(o, "text") ?? ""
        actionUrl = JS.str(JS.dict(o, "action"), "url") ?? ""
        shareText = JS.str(o, "shareText") ?? ""
        sourceText = JS.str(o, "sourceText") ?? "I dag"
        device = JS.str(o, "device") ?? ""
        let t: [String: Any]? = JS.dict(o, "today")
        steps = JS.num(t, "steps")
        stepsText = JS.str(t, "stepsText") ?? ""
        goal = JS.num(t, "goal") ?? 10000
        goalText = JS.str(t, "goalText") ?? ""
        goalReached = JS.bool(t, "goalReached") ?? false
        badge = JS.str(t, "badge") ?? ""
        sleepText = JS.str(t, "sleepText") ?? ""
        sleepRange = JS.str(t, "sleepRange") ?? ""
        restingHr = JS.num(t, "restingHr")
        hr = JS.num(t, "hr")
        activeKcal = JS.num(t, "activeKcal")
        battery = JS.num(t, "battery")
        charging = JS.bool(t, "charging") ?? false
        week = JS.list(o, "week").map { Fam50Day($0) }
        weekText = JS.str(o, "weekText") ?? ""
    }
}

struct Fam50Recipient: Hashable, Identifiable {
    var id: String { mini.userId }
    var mini: Fam50Mini
    var reply: String
    var replyText: String
    var seen: Bool
}

/// checkin = {id, kind, priority, from, mine, text, place, position, time, title, to, seenText, pending, reminder}.
struct Fam50Checkin: Hashable, Identifiable {
    var id: String
    var kind: String
    var high: Bool
    var from: Fam50Mini
    var mine: Bool
    var text: String
    var placeLabel: String
    var lat: Double?
    var lon: Double?
    var appleUrl: String
    var googleUrl: String
    var time: String
    var title: String
    var to: [Fam50Recipient]
    var seenText: String
    var pending: Bool
    var reminderText: String
    var reminderAt: Date?

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? ""
        kind = JS.str(o, "kind") ?? "checkin"
        high = (JS.str(o, "priority") ?? "") == "high"
        from = Fam50Mini(JS.dict(o, "from"))
        mine = JS.bool(o, "mine") ?? false
        text = JS.str(o, "text") ?? ""
        let pl: [String: Any]? = JS.dict(o, "place")
        placeLabel = JS.str(pl, "label") ?? JS.str(pl, "name") ?? ""
        let pos: [String: Any]? = JS.dict(o, "position")
        lat = JS.num(pos, "lat")
        lon = JS.num(pos, "lon")
        appleUrl = JS.str(pos, "appleUrl") ?? ""
        googleUrl = JS.str(pos, "googleUrl") ?? ""
        time = JS.str(o, "time") ?? ""
        title = JS.str(o, "title") ?? ""
        to = JS.list(o, "to").map { (t: [String: Any]) -> Fam50Recipient in
            Fam50Recipient(mini: Fam50Mini(t), reply: JS.str(t, "reply") ?? "", replyText: JS.str(t, "replyText") ?? "",
                           seen: JS.str(t, "seenAt") != nil)
        }
        seenText = JS.str(o, "seenText") ?? ""
        pending = JS.bool(o, "pending") ?? false
        let rem: [String: Any]? = JS.dict(o, "reminder")
        reminderText = (JS.bool(rem, "done") ?? false) ? "" : (JS.str(rem, "text") ?? "")
        reminderAt = JS.date(rem?["at"])
    }
}

/// Forslag til «Hvor» (kalender, sted eller adresse).
struct Fam50Suggest: Hashable, Identifiable {
    var id: String { source + title + detail }
    var source: String
    var title: String
    var detail: String
    var label: String
    var lat: Double?
    var lon: Double?
    var acc: Double?

    init(_ o: [String: Any]) {
        source = JS.str(o, "source") ?? "address"
        title = JS.str(o, "title") ?? ""
        detail = JS.str(o, "detail") ?? ""
        label = JS.str(o, "label") ?? ""
        lat = JS.num(o, "lat")
        lon = JS.num(o, "lon")
        acc = JS.num(o, "acc")
    }

    init(custom: String) {
        source = "custom"; title = custom; detail = ""; label = custom; lat = nil; lon = nil; acc = nil
    }

    /// «Fra kalenderen · Nordstrand · ± 12 m» under tittelen.
    var line: String {
        var parts: [String] = []
        if source == "calendar" { parts.append("Fra kalenderen") }
        if source == "place" { parts.append("Du er her nå") }
        if source == "custom" { parts.append("Valgt selv") }
        if !detail.isEmpty && detail != title { parts.append(detail) }
        if let a = acc { parts.append("± " + String(Int(a.rounded())) + " m") }
        return parts.joined(separator: " · ")
    }
}

struct Fam50Quick: Hashable, Identifiable {
    var id: String
    var text: String
    var high: Bool
}

/* ---------- Navigasjon (stabel med undersider) ---------- */

enum Fam50Route: Hashable {
    case kart
    case person(String)
    case sted(String)
    case nyttSted(String)
    case helsep(String)
    case sendt
    case vei
}

@MainActor
@Observable
final class Fam50Nav {
    static let shared = Fam50Nav()

    var stack: [Fam50Route] = []

    var top: Fam50Route? { stack.last }

    /// Til rute-nøkkelen (Nav23Route.swift): bare stabelen, så fanebytte på roten ikke lager historikk.
    var key: String {
        stack.map { (r: Fam50Route) -> String in
            switch r {
            case .kart: return "k"
            case .person(let id): return "p" + id
            case .sted(let id): return "s" + id
            case .nyttSted(let t): return "n" + t
            case .helsep(let id): return "h" + id
            case .sendt: return "c"
            case .vei: return "v"
            }
        }.joined(separator: ">")
    }
    var canBack: Bool { !stack.isEmpty }

    /// Kart, Personside og Sted er fullskjerm i designet (ingen fanelinje).
    var hidesBar: Bool {
        guard let t = top else { return false }
        switch t {
        case .kart, .person, .sted, .nyttSted: return true
        default: return false
        }
    }

    func push(_ r: Fam50Route) {
        Haptics.shared.select()
        if stack.last == r { return }
        stack.append(r)
    }

    func back() {
        guard !stack.isEmpty else { return }
        Haptic34.back()
        stack.removeLast()
    }

    func reset() { stack = [] }

    /// Vel fremme (Hjemlys) heter nå «På vei hjem» og ligger under Sjekk inn: åpnes som underside.
    func openVelFremme() {
        guard Fam50Model.shared.supported else { return }
        if stack.last == .vei { return }
        stack = [.vei]
    }

    /// Fanen i designet (folk · steder · helse · sjekk) ↔ id-en i fanelinja (kart · soner · helse · hjemlys).
    nonisolated static func tabKey(_ barId: String) -> String {
        switch barId {
        case "soner": return "steder"
        case "helse": return "helse"
        case "hjemlys": return "sjekk"
        default: return "folk"
        }
    }

    /// Fra Ruter › Min reise: Familie på Steder-fanen med Skole valgt (eller nytt sted med type skole).
    func openPlaces(_ store: Store, place: String?, newType: String?) {
        store.paperGo("familie")
        FamilyModel.shared.tab = "soner"
        stack = []
        if let place, !place.isEmpty {
            stack = [.sted(place)]
        } else if let newType {
            stack = [.nyttSted(newType)]
        }
    }
}

extension Store {
    /// Familie i nytt design: fullskjerm med egen fanelinje (Familie App.dc.html). Eldre server: den gamle siden.
    var fam50Full: Bool {
        paperTab == "familie" && paperClassic == nil && paperFin == nil && !newsOpen && dishSel == nil && Fam50Model.shared.supported
    }

    /// Fanelinja skjules på Kart, Personside og Sted.
    var fam50HideBar: Bool { fam50Full && !Layout45.shared.wide && Fam50Nav.shared.hidesBar }
}

/* ---------- Data ---------- */

@MainActor
@Observable
final class Fam50Model {
    static let shared = Fam50Model()

    /// false når serveren mangler /api/family/people50 (404) – da vises den gamle Familie-siden.
    var supported: Bool = UserDefaults.standard.object(forKey: "fam50_supported") as? Bool ?? true {
        didSet { UserDefaults.standard.set(supported, forKey: "fam50_supported") }
    }
    var loaded: Bool = false
    var error: String? = nil

    var title: String = "Familie"
    var subtitle: String = ""
    var people: [Fam50Person] = []
    var today: [Fam50Item] = []

    var places: [Fam50Place] = []
    var radiusMin: Double = 25
    var radiusMax: Double = 1000
    var maxAreas: Int = 20
    var placesVersion: Double = 0

    var healthSummary: String = ""
    var health: [Fam50Health] = []

    var suggestion: Fam50Suggest? = nil
    var suggestions: [Fam50Suggest] = []
    var quick: [Fam50Quick] = Fam50Model.defaultQuick
    var recipients: [Fam50Mini] = []
    var latest: Fam50Checkin? = nil
    var requests: [Fam50Checkin] = []
    var log: [Fam50Item] = []
    var lastSent: Fam50Checkin? = nil

    private var loadingAll: Bool = false
    private var refreshTask: Task<Void, Never>? = nil

    nonisolated static let defaultQuick: [Fam50Quick] = [
        Fam50Quick(id: "party", text: "Er på bursdag, alt bra", high: false), Fam50Quick(id: "arrived", text: "Er framme", high: false),
        Fam50Quick(id: "late", text: "Blir sent", high: false), Fam50Quick(id: "pickup", text: "Hent meg", high: true),
    ]

    nonisolated static func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? s }

    func resetForAccount() {
        people = []; today = []; places = []; health = []; log = []; requests = []; latest = nil; lastSent = nil
        suggestion = nil; suggestions = []; recipients = []; loaded = false; error = nil
        Fam50Nav.shared.reset()
    }

    func person(_ id: String) -> Fam50Person? { people.first { $0.id == id } }
    func place(_ id: String) -> Fam50Place? { places.first { $0.id == id } }
    func healthOf(_ id: String) -> Fam50Health? { health.first { $0.id == id } }
    var me: Fam50Person? { people.first { $0.mini.isSelf } }

    /// Navn til et avatar-sted uten egen visning (f.eks. sanntidssvar).
    func name(_ userId: String) -> String {
        if let p = person(userId) { return p.mini.first }
        if let r = recipients.first(where: { $0.userId == userId }) { return r.first }
        return "Noen"
    }

    /* ---------- Henting ---------- */

    private func get(_ store: Store, _ path: String) async throws -> [String: Any] {
        let d: Data = try await store.api.callAt("/api", "GET", path, timeout: 20)
        return JS.obj(d)
    }

    func loadAll(_ store: Store) async {
        if loadingAll { return }
        loadingAll = true
        defer { loadingAll = false }
        await loadPeople(store)
        guard supported else { return }
        async let a: Void = loadToday(store)
        async let b: Void = loadPlaces(store)
        async let c: Void = loadHealth(store)
        async let d: Void = loadCheckin(store)
        _ = await (a, b, c, d)
        loaded = true
    }

    /// Sanntid og varsler: samlet henting (maks én gang per 1,5 s).
    func refreshSoon(_ store: Store, places: Bool = false, checkin: Bool = false) {
        refreshTask?.cancel()
        refreshTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if Task.isCancelled { return }
            await self.loadPeople(store)
            await self.loadToday(store)
            if places { await self.loadPlaces(store) }
            if checkin { await self.loadCheckin(store) }
        }
    }

    func loadPeople(_ store: Store) async {
        do {
            let o: [String: Any] = try await get(store, "/family/people50")
            title = JS.str(o, "title") ?? "Familie"
            subtitle = JS.str(o, "subtitle") ?? ""
            people = JS.list(o, "people").map { Fam50Person($0) }
            supported = true
            error = nil
            let minis: [Fam50Mini] = people.map { $0.mini }
            Task { @MainActor in for x in minis { await Fam50Avatar.ensure(x, store) } }
        } catch let e as APIError {
            if e.status == 404 { supported = false } else { error = e.message }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadToday(_ store: Store) async {
        guard let o = try? await get(store, "/family/today50") else { return }
        today = JS.list(o, "items").map { Fam50Item($0) }
    }

    func loadPlaces(_ store: Store) async {
        guard let o = try? await get(store, "/family/places") else { return }
        places = JS.list(o, "places").map { Fam50Place($0) }
        if let r = JS.dict(o, "radius") {
            radiusMin = JS.num(r, "min") ?? 25
            radiusMax = JS.num(r, "max") ?? 1000
        }
        maxAreas = JS.int(o, "maxAreas") ?? 20
        placesVersion = JS.num(o, "version") ?? placesVersion
    }

    func loadHealth(_ store: Store) async {
        guard let o = try? await get(store, "/family/health50") else { return }
        healthSummary = JS.str(o, "summary") ?? ""
        health = JS.list(o, "people").map { Fam50Health($0) }
    }

    func loadCheckin(_ store: Store) async {
        var q: String = ""
        if let l = Fam50Locator.shared.last, Date().timeIntervalSince(l.timestamp) < 15 * 60 {
            q = String(format: "?lat=%.6f&lon=%.6f&acc=%.0f", l.coordinate.latitude, l.coordinate.longitude, Swift.max(0, l.horizontalAccuracy))
        }
        guard let o = try? await get(store, "/family/checkin" + q) else { return }
        applyCheckin(o)
    }

    private func applyCheckin(_ o: [String: Any]) {
        let s: [Fam50Suggest] = JS.list(o, "suggestions").map { Fam50Suggest($0) }
        suggestions = s
        if suggestion == nil || suggestion?.source != "custom" {
            suggestion = JS.dict(o, "suggestion").map { Fam50Suggest($0) } ?? s.first
        }
        let qk: [Fam50Quick] = JS.list(o, "quick").map { (x: [String: Any]) -> Fam50Quick in
            Fam50Quick(id: JS.str(x, "id") ?? "ok", text: JS.str(x, "text") ?? "", high: (JS.str(x, "priority") ?? "") == "high")
        }
        if !qk.isEmpty { quick = qk }
        recipients = JS.list(o, "people").map { Fam50Mini($0) }
        latest = JS.dict(o, "latest").map { Fam50Checkin($0) }
        // 6b-kortet følger med («Sendt til Ingrid» → «Sett av Ingrid»).
        if let l = latest, let s0 = lastSent, l.id == s0.id { lastSent = l }
        requests = JS.list(o, "requests").map { Fam50Checkin($0) }
        log = JS.list(JS.dict(o, "log"), "items").map { Fam50Item($0) }
    }

    /// Fersk posisjon (bare til selve innsjekken), så nytt forslag.
    func refreshSuggestion(_ store: Store) async {
        _ = await Fam50Locator.shared.fix()
        await loadCheckin(store)
    }

    /* ---------- Steder ---------- */

    private func send(_ store: Store, _ method: String, _ path: String, _ body: [String: Any]?) async -> [String: Any]? {
        do {
            let d: Data = try await store.api.callAt("/api", method, path, json: body, timeout: 20)
            return JS.obj(d)
        } catch let e as APIError {
            store.flash(e.message)
            return nil
        } catch {
            store.flash(error.localizedDescription)
            return nil
        }
    }

    private func replace(_ o: [String: Any]?) {
        guard let o, JS.str(o, "id") != nil else { return }
        let p: Fam50Place = Fam50Place(o)
        if let i = places.firstIndex(where: { $0.id == p.id }) { places[i] = p } else { places.append(p) }
    }

    /// Nytt sted med ett område → id-en (nil ved feil).
    func createPlace(_ store: Store, name: String, type: String, color: String, area: Fam50Area) async -> String? {
        let body: [String: Any] = ["name": name, "type": type, "color": color, "shared": true,
                                   "areas": [["name": area.name, "lat": area.lat, "lon": area.lon, "radius_m": Int(area.radius.rounded())]]]
        guard let o = await send(store, "POST", "/family/places", body) else { return nil }
        replace(o)
        Haptics.shared.success()
        store.flash("«" + name + "» er lagt til")
        Task { await FamilyModel.shared.load(store) }
        return JS.str(o, "id")
    }

    func patchPlace(_ store: Store, _ id: String, _ body: [String: Any]) async {
        guard let o = await send(store, "PATCH", "/family/places/" + Fam50Model.enc(id), body) else { return }
        replace(o)
    }

    func deletePlace(_ store: Store, _ id: String) async {
        guard await send(store, "DELETE", "/family/places/" + Fam50Model.enc(id), nil) != nil else { return }
        places.removeAll { $0.id == id }
        Haptics.shared.warning()
        Task { await FamilyModel.shared.load(store) }
    }

    func addArea(_ store: Store, _ placeId: String, _ a: Fam50Area) async {
        let body: [String: Any] = ["name": a.name, "lat": a.lat, "lon": a.lon, "radius_m": Int(a.radius.rounded())]
        guard let o = await send(store, "POST", "/family/places/" + Fam50Model.enc(placeId) + "/areas", body) else { return }
        replace(JS.dict(o, "place"))
        Haptics.shared.success()
    }

    func patchArea(_ store: Store, _ placeId: String, _ areaId: String, _ body: [String: Any]) async {
        let path: String = "/family/places/" + Fam50Model.enc(placeId) + "/areas/" + Fam50Model.enc(areaId)
        guard let o = await send(store, "PATCH", path, body) else { return }
        replace(JS.dict(o, "place"))
    }

    func deleteArea(_ store: Store, _ placeId: String, _ areaId: String) async {
        let path: String = "/family/places/" + Fam50Model.enc(placeId) + "/areas/" + Fam50Model.enc(areaId)
        guard let o = await send(store, "DELETE", path, nil) else { return }
        replace(JS.dict(o, "place"))
        Haptics.shared.warning()
    }

    /* ---------- Helse ---------- */

    func requestHealth(_ store: Store, _ userId: String) async {
        guard let o = await send(store, "POST", "/family/health50/" + Fam50Model.enc(userId) + "/request", [:]) else { return }
        store.flash(JS.str(o, "text") ?? "Forespørselen er sendt")
    }

    /* ---------- Sjekk inn ---------- */

    private func posBody(_ b: inout [String: Any]) {
        guard let l = Fam50Locator.shared.last, Date().timeIntervalSince(l.timestamp) < 15 * 60 else { return }
        b["lat"] = l.coordinate.latitude
        b["lon"] = l.coordinate.longitude
        b["acc"] = Swift.max(0, l.horizontalAccuracy)
    }

    /// POST /api/family/checkin. Posisjonen sendes bare med i selve innsjekken.
    func checkIn(_ store: Store, to: [String], quick: String?, text: String?, place: Fam50Suggest?, remindAt: Date?, requestId: String?) async -> Bool {
        _ = await Fam50Locator.shared.fix()
        var b: [String: Any] = ["to": to]
        if let quick { b["quick"] = quick }
        if let text, !text.isEmpty { b["text"] = text }
        if let place, !place.title.isEmpty {
            var pl: [String: Any] = ["name": place.title]
            if !place.detail.isEmpty { pl["detail"] = place.detail }
            b["place"] = pl
            if place.source == "calendar" { b["eventTitle"] = place.title }
        }
        if let remindAt { b["remindAt"] = ISO8601DateFormatter().string(from: remindAt) }
        if let requestId { b["requestId"] = requestId }
        posBody(&b)
        guard let o = await send(store, "POST", "/family/checkin", b) else { return false }
        lastSent = JS.dict(o, "checkin").map { Fam50Checkin($0) }
        Haptics.shared.success()
        await loadCheckin(store)
        return true
    }

    func askCheckIn(_ store: Store, to: [String]) async {
        guard let o = await send(store, "POST", "/family/checkin/request", ["to": to]) else { return }
        Haptics.shared.success()
        let r: Fam50Checkin? = JS.dict(o, "request").map { Fam50Checkin($0) }
        store.flash(r?.title.isEmpty == false ? (r?.title ?? "") : "Forespørselen er sendt")
        await loadCheckin(store)
    }

    /// «Hent meg» på kortet etter innsjekk (6b).
    func pickup(_ store: Store, _ c: Fam50Checkin) async {
        _ = await Fam50Locator.shared.fix()
        var b: [String: Any] = [:]
        posBody(&b)
        guard let o = await send(store, "POST", "/family/checkin/" + Fam50Model.enc(c.id) + "/pickup", b) else { return }
        Haptics.shared.success()
        lastSent = JS.dict(o, "checkin").map { Fam50Checkin($0) } ?? lastSent
        store.flash("«Hent meg» er sendt")
        await loadCheckin(store)
    }

    /// Svar med ett trykk (👍 / Ring / Hent). Kalles også fra varselhandlingene.
    func reply(_ store: Store, _ id: String, _ reply: String) async -> [String: Any]? {
        var b: [String: Any] = ["reply": reply]
        if reply == "ok" { posBody(&b) }
        let o: [String: Any]? = await send(store, "POST", "/family/checkin/" + Fam50Model.enc(id) + "/reply", b)
        if o != nil { Haptics.shared.success(); await loadCheckin(store) }
        return o
    }

    func seen(_ store: Store, _ id: String) {
        Task { _ = try? await store.api.callAt("/api", "POST", "/family/checkin/" + Fam50Model.enc(id) + "/seen", json: [:], timeout: 10) }
    }

    func clearReminder(_ store: Store, _ id: String) async {
        guard let o = await send(store, "DELETE", "/family/checkin/" + Fam50Model.enc(id) + "/reminder", nil) else { return }
        lastSent = JS.dict(o, "checkin").map { Fam50Checkin($0) } ?? lastSent
    }
}

/* ---------- Posisjon til Sjekk inn (én måling, ingen kontinuerlig deling) ---------- */

final class Fam50Locator: NSObject, CLLocationManagerDelegate {
    static let shared = Fam50Locator()

    private let manager: CLLocationManager = CLLocationManager()
    private var waiters: [CheckedContinuation<CLLocation?, Never>] = []
    private(set) var last: CLLocation? = nil

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// Ny posisjon (maks 6 s). Ingen tilgang: siste kjente eller nil.
    @MainActor func fix() async -> CLLocation? {
        if let l = last, Date().timeIntervalSince(l.timestamp) < 60 { return l }
        let st: CLAuthorizationStatus = manager.authorizationStatus
        if st == .notDetermined { manager.requestWhenInUseAuthorization() }
        guard st == .authorizedAlways || st == .authorizedWhenInUse else { return last }
        return await withCheckedContinuation { (c: CheckedContinuation<CLLocation?, Never>) in
            waiters.append(c)
            manager.requestLocation()
            DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.finish(self?.last) }
        }
    }

    private func finish(_ l: CLLocation?) {
        let w: [CheckedContinuation<CLLocation?, Never>] = waiters
        waiters = []
        for c in w { c.resume(returning: l) }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last, l.horizontalAccuracy >= 0 else { return }
        last = l
        DispatchQueue.main.async { [weak self] in self?.finish(l) }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in self?.finish(self?.last) }
    }
}

/* ---------- Tokens (designet: Papir lys / mørk) ---------- */

struct Fam50Tok {
    let bg: Color
    let card: Color
    let ink: Color
    let soft: Color
    let mut: Color
    let faint: Color
    let line: Color
    let dash: Color
    let lab: Color
    let ok: Color
    let okBg: Color
    let badBg: Color
    let chip: Color
    let dark: Bool

    static func of(_ p: PaperPalette) -> Fam50Tok {
        if p.dark {
            return Fam50Tok(bg: p.bg, card: p.card, ink: p.ink, soft: p.ink.opacity(0.78), mut: p.mut, faint: p.mut.opacity(0.8), line: p.line.opacity(0.7),
                            dash: p.line, lab: p.lab, ok: Color(hex: "#8fd3a5"), okBg: Color(hex: "#8fd3a5").opacity(0.16),
                            badBg: Color(hex: "#f08a76").opacity(0.18), chip: p.bg, dark: true)
        }
        return Fam50Tok(bg: p.bg, card: p.card, ink: p.ink, soft: Color(hex: "#4a463f"), mut: Color(hex: "#6b665c"), faint: Color(hex: "#8a857a"),
                        line: Color(hex: "#ece6da"), dash: Color(hex: "#c9c1b0"), lab: p.lab, ok: Color(hex: "#2f7d4f"), okBg: Color(hex: "#e3efe6"),
                        badBg: Color(hex: "#f6e0dc"), chip: p.bg, dark: false)
    }

    /// Mørk pille (hovedknapper, aktiv brikke) og teksten på den.
    var pill: Color { dark ? ink : Color(hex: "#1b1a17") }
    var onPill: Color { dark ? bg : Color.white }
}

/* ---------- Avatar (profilbilde, ellers initialer i personens farge) ---------- */

struct Fam50Avatar: View {
    @Environment(Store.self) private var store
    let mini: Fam50Mini
    let size: CGFloat
    var ring: CGFloat = 0
    var ringColor: Color = Color.white

    var body: some View {
        let img: UIImage? = Fam22Photos.shared.image(mini.userId)
        ZStack {
            Circle().fill(Color(hex: mini.hex))
            if let img {
                Image(uiImage: img).resizable().scaledToFill().frame(width: size, height: size).clipShape(Circle())
            } else {
                Text(mini.initials).font(PF.ui(Swift.max(9, size * 0.36), .bold)).foregroundStyle(Color.white).lineLimit(1).minimumScaleFactor(0.6)
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(ringColor, lineWidth: ring))
        .task(id: mini.userId + mini.photoUrl) { await Fam50Avatar.ensure(mini, store) }
        .accessibilityHidden(true)
    }

    /// Henter bildet via Fam22Photos (samme hurtigbuffer som resten av Familie).
    @MainActor static func ensure(_ m: Fam50Mini, _ store: Store) async {
        if m.userId.isEmpty || Fam22Photos.shared.image(m.userId) != nil { return }
        var o: [String: Any] = ["userId": m.userId, "name": m.name]
        if !m.photoUrl.isEmpty { o["photoUrl"] = m.photoUrl }
        await Fam22Photos.shared.ensure(FamMember(o), store)
    }
}
