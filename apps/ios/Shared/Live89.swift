import Foundation
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 89 (IOS89): Live Activities etter Apple (HIG) – fem aktiviteter fra serveren ----------------
 Fasit: Live Activities.dc.html + claude-code-live-activities.md (pakke 59). API (SRV89, CONTRACT89):
 – GET  /api/live/aktiviteter → {aktiviteter:[Akt], oppdatert}. Akt = {id, type, tittel, undertittel, verdi, progress, segmenter,
   meta, start, slutt, status, handlinger:[{id, tittel}], url}. type: nedlasting | backup | spiller | avtale | pakke.
 – POST /api/live/handling {id, handling} → {ok, aktivitet?} (rute → {ok, url}). Ukjent id → 404.
 – GET/PUT /api/live/innstillinger {nedlasting, backup, spiller, avtale, pakke}.
 – POST /api/live/tokens {platform:"ios", kind:"pushtostart"|"liveactivity", token, aktivitetId?, type?}.
 Bygger videre på Plat51Attributes (én ActivityAttributes, kind = type, key = Akt.id). ContentState leser både egne nøkler og
 Akt-feltene, så serveren kan sende Akt direkte som «content-state» i APNs (attributes-type «Plat51Attributes»,
 attributes {type, id} eller {kind, key, color}).
 Appen starter/oppdaterer/avslutter ved polling når den er aktiv (Live89Host.swift, hvert 5. s mens nedlasting/backup går) og ved
 bakgrunnshenting (Notify31), og registrerer push-to-start- og aktivitets-tokens. Uten APNs-oppsett på serveren: bare polling.
 Knappene er App Intents (Live89ActionIntent, LiveActivityIntent) som kaller POST /api/live/handling uten å åpne appen.
 «Vis rute» åpner appen (homelab://live89/rute?id=…), som henter kart-lenken og åpner den – brukeren har trykket. */

/// En knapp i Live Activity ({id, tittel} fra API-et).
struct Live89Btn: Codable, Hashable {
    var id: String
    var title: String

    enum CodingKeys: String, CodingKey {
        case id, title, tittel
    }

    init(id: String, title: String) {
        self.id = id
        self.title = title
    }

    init(from decoder: Decoder) throws {
        let c: KeyedDecodingContainer<CodingKeys> = try decoder.container(keyedBy: CodingKeys.self)
        let i: String = (try? c.decode(String.self, forKey: .id)) ?? ""
        let t1: String? = try? c.decode(String.self, forKey: .title)
        let t2: String? = try? c.decode(String.self, forKey: .tittel)
        id = i
        title = t1 ?? t2 ?? Live89.actionTitle(i)
    }

    func encode(to encoder: Encoder) throws {
        var c: KeyedEncodingContainer<CodingKeys> = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
    }
}

/// Pakke: {antall, ferdig}.
struct Live89Seg: Decodable {
    var antall: Int
    var ferdig: Int
}

enum Live89 {
    /// Rekkefølgen i Innstillinger → Varsler → Live Activities.
    static let types: [String] = ["nedlasting", "backup", "spiller", "avtale", "pakke"]
    static let actionIds: [String] = ["pause", "fortsett", "stopp", "rute", "utsett"]

    static func isNew(_ kind: String) -> Bool { types.contains(kind) }

    /// Aksent på mørk bakgrunn (fasiten).
    static func accent(_ kind: String) -> String {
        switch kind {
        case "nedlasting": return "#5ac8fa"
        case "backup": return "#30d158"
        case "spiller": return "#ffb340"
        case "avtale": return "#ff6a4d"
        case "pakke": return "#bf8cff"
        default: return "#5ac8fa"
        }
    }

    /// Navnet i innstillingene og i tilgjengelighetsteksten.
    static func name(_ kind: String) -> String {
        switch kind {
        case "nedlasting": return "Nedlastinger"
        case "backup": return "Backup"
        case "spiller": return "Spilles nå"
        case "avtale": return "Neste avtale"
        case "pakke": return "Pakkesporing"
        default: return "Homelab"
        }
    }

    static func about(_ kind: String) -> String {
        switch kind {
        case "nedlasting": return "NRK, Sonarr, Radarr og qBittorrent – fremdrift, Pause og Fortsett"
        case "backup": return "Backup til NAS – fremdrift, Pause og Fortsett (bare admin)"
        case "spiller": return "Plex og Jellyfin – posisjon, Pause / Spill av og Stopp"
        case "avtale": return "Når neste avtale starter innen en time – Vis rute og Utsett 5 min"
        case "pakke": return "Ute for levering – stopp unna og levert"
        default: return ""
        }
    }

    static func symbol(_ kind: String, paused: Bool) -> String {
        switch kind {
        case "nedlasting": return "arrow.down.circle.fill"
        case "backup": return "externaldrive.fill"
        case "spiller": return paused ? "pause.fill" : "play.fill"
        case "avtale": return "calendar"
        case "pakke": return "shippingbox.fill"
        default: return "bolt.fill"
        }
    }

    static func actionTitle(_ id: String) -> String {
        switch id {
        case "pause": return "Pause"
        case "fortsett": return "Fortsett"
        case "stopp": return "Stopp"
        case "rute": return "Vis rute"
        case "utsett": return "Utsett 5 min"
        default: return id
        }
    }

    /// aktiv | pause | ferdig → active | paused | done.
    static func state(_ status: String) -> String {
        switch status {
        case "pause": return "paused"
        case "ferdig": return "done"
        case "", "aktiv": return "active"
        default: return status
        }
    }

    /// ISO-tid → Unix-sekunder (0 = ingen).
    static func unix(_ iso: String) -> Double {
        if iso.isEmpty { return 0 }
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d.timeIntervalSince1970 }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: iso) { return d.timeIntervalSince1970 }
        return 0
    }

    /// ^[a-z0-9:_-]{1,80}$
    static func validId(_ id: String) -> Bool {
        if id.isEmpty || id.count > 80 { return false }
        let ok: CharacterSet = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789:_-")
        return id.unicodeScalars.allSatisfy { (u: Unicode.Scalar) -> Bool in ok.contains(u) }
    }

    /* ---------- Bryterne (speil av /api/live/innstillinger, så polling og intentene vet) ---------- */

    static func on(_ type: String) -> Bool {
        (WidgetShared.defaults.object(forKey: "live89.on." + type) as? Bool) ?? true
    }

    static func setOn(_ type: String, _ v: Bool) {
        WidgetShared.defaults.set(v, forKey: "live89.on." + type)
    }

    /* ---------- Avslutning, relevans og lenker ---------- */

    /// Når en ferdig aktivitet forsvinner: +15 min, pakke +30 min etter «Levert», avtale ved starttid.
    static func dismissal(_ kind: String, endAt: Double) -> Date {
        let now: Date = Date()
        switch kind {
        case "pakke": return now.addingTimeInterval(30 * 60)
        case "avtale": return endAt > now.timeIntervalSince1970 ? Date(timeIntervalSince1970: endAt) : now
        default: return now.addingTimeInterval(15 * 60)
        }
    }

    static func relevance(_ kind: String) -> Double {
        switch kind {
        case "spiller": return 90
        case "avtale": return 80
        case "pakke": return 60
        case "nedlasting": return 50
        default: return 40
        }
    }

    /// Dyplenken fra serveren (bare appens egne skjema), ellers siden for typen.
    static func link(_ raw: String, kind: String) -> URL {
        let l: String = raw.lowercased()
        if l.hasPrefix("homelab://") || l.hasPrefix("finanshub://"), let u = URL(string: raw) { return u }
        let page: String
        switch kind {
        case "nedlasting": page = "media"
        case "backup": page = "backup"
        case "spiller": page = "media"
        case "avtale": page = "kalender"
        case "pakke": page = "tracking"
        default: page = "home"
        }
        return URL(string: "homelab://" + page) ?? URL(fileURLWithPath: "/")
    }

    /// «Vis rute»: appen åpnes og henter kart-lenken (POST /api/live/handling {handling:"rute"}).
    static func routeLink(_ id: String) -> URL {
        URL(string: "homelab://live89/rute?id=" + id) ?? URL(fileURLWithPath: "/")
    }
}

/* ---------- Knappene (App Intents – virker uten å åpne appen) ---------- */

struct Live89ActionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Live Activity-handling"
    static var description: IntentDescription = IntentDescription("Pause, fortsett, stopp eller utsett en Live Activity fra Homelab.")
    static var isDiscoverable: Bool = false

    @Parameter(title: "Aktivitet")
    var id: String

    @Parameter(title: "Handling")
    var handling: String

    init() {}

    init(id: String, handling: String) {
        self.id = id
        self.handling = handling
    }

    func perform() async throws -> some IntentResult {
        #if canImport(ActivityKit)
        _ = await Live89Sync.act(id, handling)
        #endif
        return .result()
    }
}

/* ---------- Start, oppdatering og avslutning ---------- */

#if canImport(ActivityKit)
enum Live89Sync {
    typealias State = Plat51Attributes.ContentState

    /// Serveren har /api/live (da tar Live89 over pakker og nedlastinger fra Plat51).
    static var serverHasLive: Bool {
        get { WidgetShared.defaults.bool(forKey: "live89.server") }
        set { WidgetShared.defaults.set(newValue, forKey: "live89.server") }
    }

    /// Bare aktiviteter som fortsatt vises (ikke avsluttede).
    static func find(_ key: String) -> Activity<Plat51Attributes>? {
        Plat51Activity.all().first { (a: Activity<Plat51Attributes>) -> Bool in
            a.attributes.key == key && (a.activityState == .active || a.activityState == .stale)
        }
    }

    static func live() -> [Activity<Plat51Attributes>] {
        Plat51Activity.all().filter { (a: Activity<Plat51Attributes>) -> Bool in
            Live89.isNew(a.attributes.kind) && (a.activityState == .active || a.activityState == .stale)
        }
    }

    /// Akt (JSON-objekt) → ContentState via den tolerante dekoderen.
    static func state(_ o: [String: Any]) -> State? {
        guard let d = try? JSONSerialization.data(withJSONObject: o) else { return nil }
        return try? JSONDecoder().decode(State.self, from: d)
    }

    static func content(_ st: State, kind: String) -> ActivityContent<State> {
        let now: Date = Date()
        var stale: Date = now.addingTimeInterval(10 * 60)
        if kind == "avtale" && st.endAt > now.timeIntervalSince1970 { stale = st.endDate }
        if kind == "spiller" && st.endAt > now.timeIntervalSince1970 { stale = st.endDate.addingTimeInterval(60) }
        if kind == "pakke" { stale = now.addingTimeInterval(2 * 3600) }
        return ActivityContent(state: st, staleDate: stale, relevanceScore: Live89.relevance(kind))
    }

    /// Henter aktivitetene og starter/oppdaterer/avslutter. Returnerer sekunder til neste henting.
    static func sync() async -> TimeInterval {
        let r: Plat51Net.Reply = await Plat51Net.request("GET", "/api/live/aktiviteter", timeout: 10)
        if r.status == 404 {
            serverHasLive = false
            return 300
        }
        guard r.ok else { return 60 }
        serverHasLive = true
        let list: [[String: Any]] = Plat51Net.list(Plat51Net.obj(r.data), "aktiviteter")
        var seen: Set<String> = []
        var fast: Bool = false
        var busy: Bool = false
        for o in list.prefix(8) {
            let id: String = Plat51Net.str(o, "id") ?? ""
            let type: String = Plat51Net.str(o, "type") ?? ""
            if !Live89.validId(id) || !Live89.isNew(type) || !Live89.on(type) { continue }
            guard let st = state(o) else { continue }
            seen.insert(id)
            await apply(kind: type, key: id, st)
            if st.state == "active" {
                busy = true
                if type == "nedlasting" || type == "backup" { fast = true }
            }
        }
        for a in live() where !seen.contains(a.attributes.key) {
            await end(a.attributes.key, a.content.state, vanished: true)
        }
        if fast { return 5 }
        return busy ? 15 : 60
    }

    static func apply(kind: String, key: String, _ st: State) async {
        if st.state == "done" {
            if find(key) == nil { return }
            await end(key, st, vanished: false)
            return
        }
        await upsert(kind: kind, key: key, st)
    }

    /// Starter (med push-token når appen har «Push Notifications», ellers uten) eller oppdaterer ved endring.
    static func upsert(kind: String, key: String, _ st: State) async {
        if let a = find(key) {
            if a.content.state != st { await a.update(content(st, kind: kind)) }
            return
        }
        guard Plat51Activity.enabled, Live89.on(kind) else { return }
        let attr: Plat51Attributes = Plat51Attributes(kind: kind, key: key, color: Live89.accent(kind))
        var made: Activity<Plat51Attributes>? = nil
        do {
            made = try Activity<Plat51Attributes>.request(attributes: attr, content: content(st, kind: kind), pushType: .token)
        } catch {
            made = try? Activity<Plat51Attributes>.request(attributes: attr, content: content(st, kind: kind), pushType: nil)
        }
        // Push-tokenet registreres av appen (Live89Tokens i Live89Host.swift) etter hver henting.
        _ = made
    }

    /// Avslutter: ferdig → +15 min (pakke +30 min, avtale ved starttid). Borte fra serveren (avtale utsatt/skjult,
    /// avspilling stoppet) → med en gang.
    static func end(_ key: String, _ st: State, vanished: Bool) async {
        guard let a = find(key) else { return }
        let kind: String = a.attributes.kind
        var fin: State = st
        fin.state = "done"
        fin.actions = []
        let quick: Bool = vanished && (kind == "avtale" || kind == "spiller")
        let when: Date = quick ? Date() : Live89.dismissal(kind, endAt: fin.endAt)
        let policy: ActivityUIDismissalPolicy = when.timeIntervalSinceNow > 1 ? .after(when) : .immediate
        await a.end(content(fin, kind: kind), dismissalPolicy: policy)
    }

    /// Brukeren slo av en type: aktivitetene av den typen fjernes.
    static func endAll(_ kind: String) async {
        for a in live() where a.attributes.kind == kind {
            await a.end(nil, dismissalPolicy: .immediate)
        }
    }

    /* ---------- Knappene ---------- */

    /// POST /api/live/handling. Oppdaterer aktiviteten med svaret (eller lokalt). Returnerer url (rute).
    static func act(_ id: String, _ handling: String) async -> String? {
        if !Live89.validId(id) || !Live89.actionIds.contains(handling) { return nil }
        let r: Plat51Net.Reply = await Plat51Net.request("POST", "/api/live/handling", body: ["id": id, "handling": handling], timeout: 12)
        if r.status == 404 {
            if let a = find(id) { await a.end(nil, dismissalPolicy: .immediate) }
            return nil
        }
        guard r.ok else { return nil }
        let o: [String: Any] = Plat51Net.obj(r.data)
        if let akt = o["aktivitet"] as? [String: Any], let st = state(akt) {
            let kind: String = Plat51Net.str(akt, "type") ?? (find(id)?.attributes.kind ?? "")
            if Live89.isNew(kind) { await apply(kind: kind, key: id, st) }
        } else {
            await local(id, handling)
        }
        return Plat51Net.str(o, "url")
    }

    /// Uten aktivitet i svaret: samme endring lokalt (Pause ↔ Fortsett, Stopp, Utsett 5 min).
    static func local(_ id: String, _ handling: String) async {
        guard let a = find(id) else { return }
        let kind: String = a.attributes.kind
        var st: State = a.content.state
        switch handling {
        case "stopp":
            await a.end(nil, dismissalPolicy: .immediate)
            return
        case "pause":
            st.state = "paused"
            st.actions = swap(st.actions, "pause", Live89Btn(id: "fortsett", title: kind == "spiller" ? "Spill av" : "Fortsett"))
        case "fortsett":
            st.state = "active"
            st.actions = swap(st.actions, "fortsett", Live89Btn(id: "pause", title: "Pause"))
        case "utsett":
            if st.endAt > 0 { st.endAt += 300 }
        default:
            return
        }
        await a.update(content(st, kind: kind))
    }

    static func swap(_ list: [Live89Btn], _ from: String, _ to: Live89Btn) -> [Live89Btn] {
        list.map { (b: Live89Btn) -> Live89Btn in b.id == from ? to : b }
    }
}
#endif
