import SwiftUI
import UIKit
import CoreLocation
import MapKit
import UserNotifications
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 41: Hjemlys «Si fra» – Sjekket inn · Drar snart · Drar nå, og valg av personer ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-hjemlys.md («Si fra», «iPhone: start og velg personer», «Lagt inn i
   appen: Familie → Hjemlys»). Fasit: Familie.dc.html (fanen Hjemlys) og Hjemme trygt Varianter.dc.html → 3a–3c, 4a–4d.
   Flyten: start (fire valg) → people («Hvem får beskjed?») → ready (mål, rute, «Alt OK?», deling / sted, «drar om ca.») →
   aktiv tur (Hjemlys40Active) eller sent («Sendt»-kortet med beskjeden ordrett).
   API (SERVER41, klienten tåler 404):
     POST /api/hjemlys/notice {kind:'checkin'|'leaving_soon'|'leaving_now'|'arrived', place?, leaveInMin?:15|30|60, to:[userId],
          contacts?:[{name, phone}]} → {notice:{id, text, …}, links?:[{name, phone, url, sms}], live?}
       (reserve: POST /api/hjemlys/status {kind: checked_in|leaving_soon|leaving_now, place?, leave_at?, recipients[]})
     PATCH /api/hjemlys/notice/:id {plus:15} · POST /api/hjemlys/notice/:id/now  («+ 15 min» / «Drar nå» på Drar snart)
     POST /api/hjemlys/start {…, destination:{name, lat, lon, kind:'home'|'place'}, recipients:[userId], share:{pos, bat, with}}
     GET  /api/hjemlys/recipients → {household:[{userId, name, avatar}], last:{checkin:[id], …}} (du selv er aldri med)
   Personvern: bare beskjeden og stedet du valgte sendes, bare til personene du valgte. Ingen posisjon for Sjekket inn /
   Drar snart / Drar nå uten mål. Du selv er aldri i lista. Lagres lokalt i hjemlys_v1 (siste beskjed, siste valg per hendelse). */

struct Hjemlys41Person: Identifiable, Hashable {
    let id: String
    let name: String
    /// hus | venn | sms
    let group: String
    let sub: String
    let color: String
    var phone: String = ""
}

struct Hjemlys41Sent: Hashable {
    var kind: String
    var msg: String
    var to: String
    var at: Date
    var eta: Date?
    var activityId: String
    /// Serverens id for beskjeden (PATCH /notice/:id, /notice/:id/now).
    var noticeId: String = ""
}

@MainActor
@Observable
final class Hjemlys41 {
    static let shared = Hjemlys41()

    /// start | people | ready | sent
    var step: String = "start"
    /// hjem | inn | snart | naa
    var kind: String = "hjem"
    /// naa: hjem | annet | ingen
    var dest: String = "hjem"
    var place: String = ""
    /// Drar snart: 15 | 30 | 60 | 0 (ukjent)
    var soon: Int = 30
    var wait: Int = 15
    var sharePos: Bool = true
    var shareBat: Bool = true
    var shareWith: Bool = true
    var selected: Set<String> = []
    /// hus | siste | alle
    var filter: String = "hus"
    var query: String = ""
    var remember: Bool = true
    var friends: [Hjemlys41Person] = []
    /// Husstanden fra GET /api/hjemlys/recipients (brukes når Familie ikke er lastet) og siste valg per hendelse fra serveren.
    var serverHousehold: [Hjemlys41Person] = []
    @ObservationIgnored var serverLast: [String: [String]] = [:]
    var smsContacts: [Hjemlys41Person] = Hjemlys41.loadSms()
    var sent: Hjemlys41Sent? = nil
    var busy: Bool = false
    var err: String = ""
    var contactPicker: Bool = false
    @ObservationIgnored private var friendsLoaded: Bool = false

    static let kinds: [(String, String, String, String)] = [
        ("hjem", "⌂", "På vei hjem", "Tid, fremdrift og varsel hvis du er sen"),
        ("inn", "✓", "Sjekket inn", "Jeg er fremme"),
        ("snart", "◔", "Drar snart", "Om 15 min, 30 min eller 1 t"),
        ("naa", "→", "Drar nå", "Med eller uten mål"),
    ]

    var kindName: String { Hjemlys41.kinds.first(where: { $0.0 == kind })?.2 ?? "Vel fremme" }

    /// Tur med mål (fremdrift, «Alt OK?», forsinkelsesregler).
    var isTrip: Bool { kind == "hjem" || (kind == "naa" && dest != "ingen") }

    /* ---------- Personer ---------- */

    /// Husstanden fra Familie (uten deg selv), venner med Papir og kontakter du har lagt til (SMS-lenke).
    func people(_ store: Store) -> [Hjemlys41Person] {
        let fam: FamilyModel = FamilyModel.shared
        let me: [String] = [store.displayName, store.account?.name ?? "", store.account?.username ?? ""].filter { !$0.isEmpty }
        let meUser: String = (store.account?.username ?? "").lowercased()
        var out: [Hjemlys41Person] = []
        // Serverens husstand (GET /hjemlys/recipients) er fasit for hvem som kan få varsel; Familie er reserven.
        let famList: [FamMember] = serverHousehold.isEmpty ? fam.members : []
        for m in famList {
            if !fam.meId.isEmpty && m.id == fam.meId { continue }
            if !meUser.isEmpty && m.username.lowercased() == meUser { continue }
            if Hjemlys41Text.withoutMe([m.name], me: me).isEmpty { continue }
            let state: String = Hjemlys40Model.shared.household.first(where: { $0.id == m.id })?.line ?? ""
            out.append(Hjemlys41Person(id: m.id, name: m.name, group: "hus", sub: state.isEmpty || state == "ikke aktiv" ? "Husstanden" : state,
                                       color: m.color.isEmpty ? "#2b5d8a" : m.color))
        }
        for h in serverHousehold where !out.contains(where: { $0.id == h.id }) {
            var x: Hjemlys41Person = h
            let line: String = Hjemlys40Model.shared.household.first(where: { $0.id == h.id })?.line ?? ""
            if !line.isEmpty && line != "ikke aktiv" { x = Hjemlys41Person(id: h.id, name: h.name, group: h.group, sub: line, color: famColor(h.id) ?? h.color) }
            else if let c = famColor(h.id) { x = Hjemlys41Person(id: h.id, name: h.name, group: h.group, sub: h.sub, color: c) }
            out.append(x)
        }
        for f in friends where !out.contains(where: { $0.id == f.id }) { out.append(f) }
        out.append(contentsOf: smsContacts)
        return out
    }

    private func famColor(_ id: String) -> String? {
        guard let c = FamilyModel.shared.members.first(where: { $0.id == id })?.color, !c.isEmpty else { return nil }
        return c
    }

    func visible(_ store: Store) -> [Hjemlys41Person] {
        let all: [Hjemlys41Person] = people(store)
        let local: [String] = Hjemlys41.lastUsed(kind)
        let last: [String] = local.isEmpty ? (serverLast[Hjemlys41.apiKind(kind)] ?? []) : local
        let base: [Hjemlys41Person]
        switch filter {
        case "alle": base = all
        case "siste": base = all.filter { last.contains($0.id) }
        default: base = all.filter { $0.group == "hus" }
        }
        let q: String = query.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return base }
        return all.filter { $0.name.lowercased().contains(q) }
    }

    func chosen(_ store: Store) -> [Hjemlys41Person] { people(store).filter { selected.contains($0.id) } }

    /// «Ingrid og Pål» / «Ingrid, Pål og 1 til».
    func chosenText(_ store: Store) -> String {
        let n: [String] = chosen(store).map { String($0.name.split(separator: " ").first ?? Substring($0.name)) }
        return n.isEmpty ? "" : Hjemlys41Text.list(n)
    }

    func toggle(_ id: String) {
        Haptics.shared.select()
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    func loadFriends(_ store: Store) async {
        if friendsLoaded { return }
        friendsLoaded = true
        guard let d = try? await store.api.callAt("/api", "GET", "/hjemlys/recipients", timeout: 10) else { return }
        let o: [String: Any] = JS.obj(d)
        serverHousehold = JS.list(o, "household").compactMap { (x: [String: Any]) -> Hjemlys41Person? in
            guard let id = JS.str(x, "userId") ?? JS.str(x, "id"), let n = JS.str(x, "name") else { return nil }
            return Hjemlys41Person(id: id, name: n, group: "hus", sub: "Husstanden", color: JS.str(x, "color") ?? "#2b5d8a")
        }
        friends = JS.list(o, "friends").compactMap { (x: [String: Any]) -> Hjemlys41Person? in
            guard let id = JS.str(x, "id") ?? JS.str(x, "userId"), let n = JS.str(x, "name") else { return nil }
            return Hjemlys41Person(id: id, name: n, group: "venn", sub: "Får varsel i appen", color: JS.str(x, "color") ?? "#7a5ad6")
        }
        var last: [String: [String]] = [:]
        if let l = JS.dict(o, "last") {
            for (k, v) in l { last[k] = ((v as? [Any]) ?? []).compactMap { (x: Any) -> String? in (x as? String) ?? (x as? NSNumber)?.stringValue } }
        }
        serverLast = last
        if selected.isEmpty && step == "people" {
            selected = Set(people(store).filter { $0.group == "hus" }.map(\.id))
        }
    }

    /// Kontakt fra Kontakter (velgeren krever ingen tillatelse). Får SMS med lenke til en enkel statusside (24 t).
    func addContact(name: String, phone: String) {
        let clean: String = phone.filter { $0.isNumber || $0 == "+" }
        guard !clean.isEmpty else { return }
        let id: String = "sms:" + clean
        if !smsContacts.contains(where: { $0.id == id }) {
            smsContacts.append(Hjemlys41Person(id: id, name: name.isEmpty ? clean : name, group: "sms", sub: "Får SMS med lenke", color: "#6b665c", phone: clean))
            Hjemlys41.saveSms(smsContacts)
        }
        selected.insert(id)
    }

    /* ---------- Flyt ---------- */

    func begin(_ k: String, _ store: Store) {
        Haptics.shared.tap()
        kind = k
        err = ""
        query = ""
        filter = "hus"
        dest = "hjem"
        // Forslag fra kalenderen der du er (Sjekket inn / Drar snart). Drar nå: tomt felt, forslaget vises som knapp.
        place = (k == "inn" || k == "snart") ? Hjemlys41.calendarPlace() : ""
        let remembered: [String] = remember ? Hjemlys41.lastUsed(k) : []
        if !remembered.isEmpty {
            selected = Set(remembered)
        } else {
            selected = Set(people(store).filter { $0.group == "hus" }.map(\.id))
        }
        withAnimation(.easeOut(duration: 0.2)) { step = "people" }
        Task { await loadFriends(store) }
        if isTrip { Task { await Hjemlys40Route.shared.load(store) } }
    }

    func back() {
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) { step = step == "ready" ? "people" : "start" }
    }

    func next() {
        guard !selected.isEmpty else { return }
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) { step = "ready" }
    }

    func done() {
        withAnimation(.easeOut(duration: 0.2)) {
            step = "start"
            sent = nil
        }
        Hjemlys41.saveSent(nil)
    }

    /// «Start · fremme ca. 23:38» (tur) eller «Sjekk inn» / «Si fra» / «Send «drar nå»».
    func go(_ store: Store) {
        if remember { Hjemlys41.saveLast(kind, Array(selected)) }
        if isTrip { startTrip(store) } else { sendNotice(store) }
    }

    private func startTrip(_ store: Store) {
        let ids: [String] = chosen(store).filter { $0.group != "sms" }.map(\.id)
        let names: [String] = chosen(store).map(\.name)
        let r: Hjemlys40Route = Hjemlys40Route.shared
        let o: Hjemlys40Option? = r.selected
        var homeDest: [String: Any] = ["name": r.toName.isEmpty ? "Hjem" : r.toName, "kind": "home"]
        if let h = r.home { homeDest["lat"] = h.latitude; homeDest["lon"] = h.longitude }
        let firstEta: Date = o?.eta ?? Date().addingTimeInterval(30 * 60)
        let homeDestination: [String: Any] = homeDest
        let other: Bool = kind == "naa" && dest == "annet"
        let placeName: String = place.trimmingCharacters(in: .whitespaces)
        let leg: String = (o?.legs.isEmpty ?? true) ? (o?.label ?? "") : (o?.legs.joined(separator: " · ") ?? "")
        let w: Int = wait
        let share: [String: Any] = ["pos": sharePos, "bat": shareBat, "with": shareWith]
        let sms: [[String: String]] = chosen(store).filter { $0.group == "sms" }.map { ["name": $0.name, "phone": $0.phone] }
        busy = true
        Task { @MainActor in
            var destination: [String: Any] = homeDestination
            var eta: Date = firstEta
            if other {
                destination = ["name": placeName.isEmpty ? "Annet sted" : placeName, "kind": "place"]
                if !placeName.isEmpty, let c = await Hjemlys41.geocode(placeName) {
                    destination["lat"] = c.latitude
                    destination["lon"] = c.longitude
                    if let e = await Hjemlys41.eta(to: c) { eta = e }
                }
            }
            var extra: [String: Any] = ["destination": destination, "recipients": ids, "recipientNames": names, "share": share]
                if !sms.isEmpty { extra["contacts"] = sms }
            self.busy = false
            Hjemlys40Model.shared.start(store, eta: eta, waitMin: w, mode: other ? "walk" : (o?.serverMode ?? "walk"), leg: other ? "" : leg, extra: extra)
            withAnimation(.easeOut(duration: 0.2)) { self.step = "start" }
        }
    }

    private func sendNotice(_ store: Store) {
        let who: [Hjemlys41Person] = chosen(store)
        let ids: [String] = who.filter { $0.group != "sms" }.map(\.id)
        let sms: [[String: String]] = who.filter { $0.group == "sms" }.map { ["name": $0.name, "phone": $0.phone] }
        let names: String = chosenText(store)
        let me: String = String(store.displayName.split(separator: " ").first ?? "Jeg")
        let pl: String = place.trimmingCharacters(in: .whitespaces)
        let k: String = kind
        let soonMin: Int = soon
        let leaveAt: Date? = k == "snart" && soonMin > 0 ? Date().addingTimeInterval(Double(soonMin) * 60) : nil
        let msg: String
        let apiKind: String
        switch k {
        case "inn":
            msg = me + " sjekket inn" + (pl.isEmpty ? "" : " · " + pl)
            apiKind = "checkin"
        case "snart":
            msg = me + " drar om ca. " + (soonMin == 60 ? "1 time" : soonMin == 0 ? "litt" : "\(soonMin) min") + (pl.isEmpty ? "" : " fra " + pl)
            apiKind = "leaving_soon"
        default:
            msg = me + " drar nå" + (pl.isEmpty ? "" : " fra " + pl)
            apiKind = "leaving_now"
        }
        var body: [String: Any] = ["kind": apiKind, "to": ids, "remember": remember]
        if !pl.isEmpty { body["place"] = pl }
        if k == "snart" && soonMin > 0 { body["leaveInMin"] = soonMin }
        if !sms.isEmpty { body["contacts"] = sms }
        busy = true
        err = ""
        Task {
            defer { self.busy = false }
            let res: [String: Any]? = await Hjemlys41.post(store, body, legacyKind: apiKind == "checkin" ? "checked_in" : apiKind, leaveAt: leaveAt)
            guard let res else {
                self.err = "Fikk ikke sendt beskjeden. Prøv igjen."
                Haptics.shared.warning()
                return
            }
            Haptic30.double()
            let notice: [String: Any] = JS.dict(res, "notice") ?? [:]
            let nid: String = JS.str(notice, "id") ?? ""
            let serverText: String = JS.str(notice, "text") ?? ""
            var laId: String = ""
            if k == "inn" || k == "snart" {
                laId = await Hjemlys41.startActivity(kind: k == "inn" ? "checkin" : "soon", eta: leaveAt, place: pl, names: who.map(\.name), to: ids,
                                                     name: store.displayName, noticeId: nid)
            }
            if k == "snart", let e = leaveAt { Hjemlys41.scheduleAsk(e, id: laId) }
            var s: Hjemlys41Sent = Hjemlys41Sent(kind: k, msg: serverText.isEmpty ? msg : serverText, to: names, at: Date(), eta: leaveAt, activityId: laId)
            s.noticeId = nid
            // Kontakter uten Papir: SMS med lenke til statussiden (åpnes i Meldinger, brukeren sender selv).
            if let first = JS.list(res, "links").first, let sms = JS.str(first, "sms"), let u = URL(string: sms) {
                UIApplication.shared.open(u, options: [:], completionHandler: nil)
            }
            withAnimation(.easeOut(duration: 0.2)) {
                self.sent = s
                self.step = "sent"
            }
            Hjemlys41.saveSent(s)
            store.flash("Sendt til " + names)
        }
    }

    /// «+ 15 min» på Sendt-kortet (Drar snart).
    func plus15(_ store: Store) {
        guard var s = sent, s.kind == "snart" else { return }
        Haptics.shared.tap()
        let e: Date = Swift.max(s.eta ?? Date(), Date()).addingTimeInterval(15 * 60)
        s.eta = e
        let mins: Int = Swift.max(1, Int((e.timeIntervalSinceNow / 60).rounded()))
        if let r = s.msg.range(of: "drar om ca. ") {
            let head: String = String(s.msg[..<r.upperBound])
            let tail: String = s.msg[r.upperBound...].range(of: " fra ").map { String(s.msg[$0.lowerBound...]) } ?? ""
            s.msg = head + "\(mins) min" + tail
        }
        sent = s
        Hjemlys41.saveSent(s)
        let ids: [String] = chosen(store).filter { $0.group != "sms" }.map(\.id)
        let laId: String = s.activityId
        let nid: String = s.noticeId
        Task {
            if !nid.isEmpty {
                _ = try? await store.api.callAt("/api", "PATCH", "/hjemlys/notice/" + Hjemlys40Model.enc(nid), json: ["plus": 15], timeout: 12)
            } else {
                _ = await Hjemlys41.post(store, ["kind": "leaving_soon", "leave_at": ISO8601DateFormatter().string(from: e), "to": ids], legacyKind: "leaving_soon", leaveAt: e)
            }
            #if canImport(ActivityKit)
            if !laId.isEmpty { await Hjemlys40Activity.update(laId) { (st: inout Hjemlys40Attributes.ContentState) in st.eta = e.timeIntervalSince1970 } }
            #endif
            Hjemlys41.scheduleAsk(e, id: laId)
        }
    }

    /// «Drar nå» fra Sendt-kortet: rett til «Klar» med Hjem som mål.
    func leaveNow(_ store: Store) {
        Haptics.shared.tap()
        let laId: String = sent?.activityId ?? ""
        Task {
            #if canImport(ActivityKit)
            if !laId.isEmpty { await Hjemlys40Activity.end(laId, home: false) }
            #endif
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["hjemlys41-ask"])
        sent = nil
        Hjemlys41.saveSent(nil)
        kind = "naa"
        dest = "hjem"
        Task { await Hjemlys40Route.shared.load(store) }
        withAnimation(.easeOut(duration: 0.2)) { step = "ready" }
    }

    /// Henter siste «Sendt» etter omstart (forsvinner etter 2 t).
    func restore() {
        if sent == nil, let s = Hjemlys41.loadSent(), Date().timeIntervalSince(s.at) < 2 * 3600 {
            sent = s
            step = "sent"
        }
    }

    /* ---------- Nett ---------- */

    /// Svaret fra serveren ({notice, links?, live?}), nil = feil.
    static func post(_ store: Store, _ body: [String: Any], legacyKind: String, leaveAt: Date?) async -> [String: Any]? {
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/hjemlys/notice", json: body, timeout: 15)
            return JS.obj(d)
        } catch let e as APIError {
            if e.status != 404 && e.status != 405 { return nil }
        } catch {
            return nil
        }
        var legacy: [String: Any] = ["kind": legacyKind, "recipients": (body["to"] as? [String]) ?? []]
        if let p = body["place"] { legacy["place"] = p }
        if let e = leaveAt { legacy["leave_at"] = ISO8601DateFormatter().string(from: e) }
        guard let d = try? await store.api.callAt("/api", "POST", "/hjemlys/status", json: legacy, timeout: 15) else { return nil }
        return JS.obj(d)
    }

    /// hjem | inn | snart | naa → serverens navn (checkin | leaving_soon | leaving_now).
    nonisolated static func apiKind(_ k: String) -> String {
        switch k {
        case "inn": return "checkin"
        case "snart": return "leaving_soon"
        default: return "leaving_now"
        }
    }

    nonisolated static func geocode(_ s: String) async -> CLLocationCoordinate2D? {
        guard let pm = try? await CLGeocoder().geocodeAddressString(s + ", Norge").first else { return nil }
        return pm.location?.coordinate
    }

    @MainActor static func eta(to c: CLLocationCoordinate2D) async -> Date? {
        guard let from = Hjemlys40Route.shared.here ?? CLLocationManager().location?.coordinate else { return nil }
        let r: MKDirections.Request = MKDirections.Request()
        r.source = MKMapItem(placemark: MKPlacemark(coordinate: from))
        r.destination = MKMapItem(placemark: MKPlacemark(coordinate: c))
        r.transportType = .transit
        if let e = try? await MKDirections(request: r).calculateETA() { return e.expectedArrivalDate }
        r.transportType = .walking
        return try? await MKDirections(request: r).calculateETA().expectedArrivalDate
    }

    /* ---------- Live Activity for Sjekket inn / Drar snart ---------- */

    static func startActivity(kind: String, eta: Date?, place: String, names: [String], to: [String], name: String, noticeId: String = "") async -> String {
        #if canImport(ActivityKit)
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return "" }
        // Med serverens id virker «+ 15 min» / «Drar nå» i Live Activity mot /notice/:id (Hjemlys41Shared.swift).
        let id: String = noticeId.isEmpty ? "notice-" + UUID().uuidString.prefix(8).lowercased() : noticeId
        let rec: String = Hjemlys41Text.following(names)
        let attr: Hjemlys40Attributes = Hjemlys40Attributes(sessionId: id, name: name, recipients: rec, to: to)
        let now: Double = Date().timeIntervalSince1970
        let st: Hjemlys40Attributes.ContentState = Hjemlys40Attributes.ContentState(
            eta: eta?.timeIntervalSince1970 ?? now + 30 * 60, progress: 0, leg: "", state: "onTheWay", lateMinutes: 0,
            homeAt: kind == "checkin" ? now : 0, from: "", kind: kind, dest: place.isEmpty ? "Hjem" : place)
        let stale: Date = kind == "checkin" ? Date().addingTimeInterval(15 * 60) : (eta ?? Date()).addingTimeInterval(30 * 60)
        let content: ActivityContent<Hjemlys40Attributes.ContentState> = ActivityContent(state: st, staleDate: stale, relevanceScore: 40)
        guard let a = try? Activity<Hjemlys40Attributes>.request(attributes: attr, content: content, pushType: nil) else { return "" }
        if kind == "checkin" {
            // «Inne · 19:42» forsvinner etter 15 min.
            Task {
                try? await Task.sleep(nanoseconds: 15 * 60 * 1_000_000_000)
                await a.end(content, dismissalPolicy: .immediate)
            }
        }
        return id
        #else
        return ""
        #endif
    }

    /* ---------- «Drar du nå?» ved tiden (lokalt varsel, ingen alarm) ---------- */

    nonisolated static let askCategory: String = "hjemlys41.ask"
    nonisolated static let actNow: String = "hjemlys41.now"
    nonisolated static let actPlus: String = "hjemlys41.plus15"

    nonisolated static func makeCategory() -> UNNotificationCategory {
        let yes: UNNotificationAction = UNNotificationAction(identifier: actNow, title: "Ja", options: [])
        let plus: UNNotificationAction = UNNotificationAction(identifier: actPlus, title: "+ 15 min", options: [])
        return UNNotificationCategory(identifier: askCategory, actions: [yes, plus], intentIdentifiers: [], options: [])
    }

    static func scheduleAsk(_ at: Date, id: String) {
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = "Vel fremme"
        c.body = "Drar du nå?"
        c.categoryIdentifier = askCategory
        c.userInfo = ["laId": id]
        c.threadIdentifier = "hjemlys"
        let secs: TimeInterval = Swift.max(5, at.timeIntervalSinceNow)
        let t: UNTimeIntervalNotificationTrigger = UNTimeIntervalNotificationTrigger(timeInterval: secs, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "hjemlys41-ask", content: c, trigger: t))
    }

    /// Svar på «Drar du nå?»: Ja = «drar nå» til de samme, + 15 min = ny tid. Ingen svar = ingenting skjer.
    nonisolated static func handle(_ response: UNNotificationResponse) -> Bool {
        guard response.notification.request.content.categoryIdentifier == askCategory else { return false }
        let action: String = response.actionIdentifier
        Task { @MainActor in
            guard let store = Notify31.store else { return }
            let h: Hjemlys41 = Hjemlys41.shared
            h.restore()
            if action == actPlus {
                h.plus15(store)
            } else if action == actNow {
                let laId: String = h.sent?.activityId ?? ""
                let nid: String = h.sent?.noticeId ?? ""
                let ids: [String] = h.chosen(store).filter { $0.group != "sms" }.map(\.id)
                if !nid.isEmpty {
                    _ = try? await store.api.callAt("/api", "POST", "/hjemlys/notice/" + Hjemlys40Model.enc(nid) + "/now", json: [:], timeout: 12)
                } else {
                    _ = await Hjemlys41.post(store, ["kind": "leaving_now", "to": ids], legacyKind: "leaving_now", leaveAt: nil)
                }
                #if canImport(ActivityKit)
                if !laId.isEmpty { await Hjemlys40Activity.end(laId, home: false) }
                #endif
                h.done()
                store.flash("Sendt: drar nå")
            } else {
                store.paperGo("familie")
                FamilyModel.shared.tab = "hjemlys"
            }
        }
        return true
    }

    /* ---------- Lokal lagring (hjemlys_v1) ---------- */

    nonisolated static func lastUsed(_ kind: String) -> [String] {
        UserDefaults.standard.stringArray(forKey: "hjemlys_v1.last." + kind) ?? []
    }

    nonisolated static func saveLast(_ kind: String, _ ids: [String]) {
        UserDefaults.standard.set(ids, forKey: "hjemlys_v1.last." + kind)
    }

    nonisolated static func loadSms() -> [Hjemlys41Person] {
        let raw: [[String: String]] = (UserDefaults.standard.array(forKey: "hjemlys_v1.sms") as? [[String: String]]) ?? []
        return raw.compactMap { (x: [String: String]) -> Hjemlys41Person? in
            guard let ph = x["phone"], !ph.isEmpty else { return nil }
            return Hjemlys41Person(id: "sms:" + ph, name: x["name"] ?? ph, group: "sms", sub: "Får SMS med lenke", color: "#6b665c", phone: ph)
        }
    }

    nonisolated static func saveSms(_ list: [Hjemlys41Person]) {
        UserDefaults.standard.set(list.map { ["name": $0.name, "phone": $0.phone] }, forKey: "hjemlys_v1.sms")
    }

    nonisolated static func saveSent(_ s: Hjemlys41Sent?) {
        guard let s else { UserDefaults.standard.removeObject(forKey: "hjemlys_v1.sent"); return }
        var o: [String: Any] = ["kind": s.kind, "msg": s.msg, "to": s.to, "at": s.at.timeIntervalSince1970, "la": s.activityId, "nid": s.noticeId]
        if let e = s.eta { o["eta"] = e.timeIntervalSince1970 }
        UserDefaults.standard.set(o, forKey: "hjemlys_v1.sent")
    }

    nonisolated static func loadSent() -> Hjemlys41Sent? {
        guard let o = UserDefaults.standard.dictionary(forKey: "hjemlys_v1.sent") else { return nil }
        let at: Double = (o["at"] as? Double) ?? 0
        let eta: Double = (o["eta"] as? Double) ?? 0
        var s: Hjemlys41Sent = Hjemlys41Sent(kind: (o["kind"] as? String) ?? "", msg: (o["msg"] as? String) ?? "", to: (o["to"] as? String) ?? "",
                                             at: Date(timeIntervalSince1970: at), eta: eta > 0 ? Date(timeIntervalSince1970: eta) : nil, activityId: (o["la"] as? String) ?? "")
        s.noticeId = (o["nid"] as? String) ?? ""
        return s
    }

    /// Forslag fra kalenderen: hendelsen som pågår (eller starter innen 1 t), «Bursdag hos Mari · Thorvald Meyers gate».
    static func calendarPlace() -> String {
        let now: Date = Date()
        let evs: [CalEvent26] = Cal26Model.shared.events.filter { !$0.allDay && $0.start <= now.addingTimeInterval(3600) && $0.end >= now }
        guard let e = evs.sorted(by: { $0.start < $1.start }).first else { return "" }
        return e.room.isEmpty ? e.title : e.title + " · " + e.room
    }
}
