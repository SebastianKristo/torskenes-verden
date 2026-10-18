import SwiftUI
import UIKit

/* ---------------- Romslig JSON (Sporing, vær, abonnement, aksjer) ---------------- */

/// Leser felt fra JSONSerialization uten å feile på uventede typer: tall kan komme som tekst og omvendt.
enum JS {
    static func obj(_ d: Data) -> [String: Any] { ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:] }
    static func str(_ o: [String: Any]?, _ k: String) -> String? {
        switch o?[k] {
        case let s as String: return s.isEmpty ? nil : s
        case let n as NSNumber: return n.stringValue
        default: return nil
        }
    }
    static func num(_ o: [String: Any]?, _ k: String) -> Double? {
        switch o?[k] {
        case let n as NSNumber: return n.doubleValue
        case let s as String: return Double(s.replacingOccurrences(of: ",", with: ".").replacingOccurrences(of: " ", with: ""))
        default: return nil
        }
    }
    static func int(_ o: [String: Any]?, _ k: String) -> Int? { num(o, k).map { Int($0) } }
    static func bool(_ o: [String: Any]?, _ k: String) -> Bool? {
        switch o?[k] {
        case let b as Bool: return b
        case let n as NSNumber: return n.intValue != 0
        case let s as String: return ["1", "true", "on", "yes", "ja"].contains(s.lowercased())
        default: return nil
        }
    }
    static func dict(_ o: [String: Any]?, _ k: String) -> [String: Any]? { o?[k] as? [String: Any] }
    static func list(_ o: [String: Any]?, _ k: String) -> [[String: Any]] { (o?[k] as? [Any])?.compactMap { $0 as? [String: Any] } ?? [] }
    static func strings(_ o: [String: Any]?, _ k: String) -> [String] {
        (o?[k] as? [Any])?.compactMap { v -> String? in
            if let s = v as? String { return s }
            if let n = v as? NSNumber { return n.stringValue }
            if let d = v as? [String: Any] { return str(d, "text") ?? str(d, "name") ?? str(d, "label") }
            return nil
        } ?? []
    }
    /// Tidspunkt som millisekunder, sekunder eller ISO-tekst.
    static func date(_ v: Any?) -> Date? {
        if let n = v as? NSNumber {
            let x = n.doubleValue
            return x > 1e11 ? Date(timeIntervalSince1970: x / 1000) : x > 1e8 ? Date(timeIntervalSince1970: x) : nil
        }
        guard let s = v as? String, !s.isEmpty else { return nil }
        if let x = Double(s) { return date(NSNumber(value: x)) }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        if s.count >= 10 { return parseDay(s) }
        return nil
    }
    static func fmt(_ d: Date?, _ pattern: String) -> String {
        guard let d else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = pattern
        return f.string(from: d)
    }
}

/* ---------------- Sporing: modeller ---------------- */

struct TrackEvent: Hashable {
    var at: Date?
    var raw: String
    var status: String
    var location: String
    init(_ o: [String: Any]) {
        at = JS.date(o["ts"] ?? o["time"] ?? o["date"])
        raw = JS.str(o, "ts") ?? ""
        status = JS.str(o, "status") ?? JS.str(o, "text") ?? ""
        location = JS.str(o, "location") ?? ""
    }
    var when: String { at.map { JS.fmt($0, "dd.MM HH:mm") } ?? raw }
}

struct Shipment: Identifiable, Hashable {
    var id: String
    var trackingNo: String
    var carrier: String
    var carrierName: String
    var carrierIni: String
    var carrierColor: String
    var carrierFg: String
    var name: String
    var shop: String
    var source: String
    var sourceRef: String
    var direction: String
    var status: String
    var statusText: String
    var step: Int
    var steps: [String]
    var eta: String
    var pickupPoint: String
    var archived: Bool
    var url: String
    var events: [TrackEvent]
    /// Prompt 21: tittel fra serveren (varenavn eller butikk, aldri sporingsnummer), butikkens domene,
    /// logoen ({id|domain, carrierLogo}) og antall andre pakker. Tomme fra eldre servere.
    var title: String = ""
    var shopDomain: String = ""
    var logoId: String = ""
    var logoDomain: String = ""
    var carrierLogo: String = ""
    var moreCount: Int? = nil
    /// Prompt 22: siste hendelse fra fraktselskapets API, feil ved oppdatering, forventet levering, hentested
    /// og tidspunktene i tidslinjen. Tomme fra eldre servere.
    var lastText: String = ""
    var lastPlace: String = ""
    var lastAt: Date? = nil
    var errText: String = ""
    var errRetry: Date? = nil
    var estimated: String = ""
    var pickupName: String = ""
    var pickupDeadline: Date? = nil
    var stepTimes: [Date?] = []
    /// shop | carrier | letter (logo.kind) og om logoen er manuelt kontrollert.
    var logoKind: String = ""
    var logoManual: Bool = false

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        title = JS.str(o, "title") ?? ""
        shopDomain = JS.str(o, "shop_domain") ?? JS.str(o, "shopDomain") ?? ""
        let lg: [String: Any]? = JS.dict(o, "logo")
        logoId = JS.str(lg, "id") ?? ""
        logoDomain = JS.str(lg, "domain") ?? ""
        carrierLogo = JS.str(lg, "carrierLogo") ?? ""
        moreCount = JS.int(o, "moreCount")
        // Lokale variabler: «??» lager closures, og de kan ikke lese self før alle felt er satt.
        let no = JS.str(o, "trackingNo") ?? JS.str(o, "no") ?? ""
        let car = JS.str(o, "carrier") ?? "other"
        let def = Carrier.known.first { $0.id == car }
        let cname = JS.str(o, "carrierName") ?? def?.name ?? car.capitalized
        trackingNo = no
        carrier = car
        carrierName = cname
        carrierIni = JS.str(o, "carrierIni") ?? def?.ini ?? String(cname.prefix(2)).uppercased()
        carrierColor = JS.str(o, "carrierColor") ?? def?.color ?? "#3A4252"
        carrierFg = JS.str(o, "carrierFg") ?? def?.fg ?? "#FFFFFF"
        name = JS.str(o, "name") ?? "\(cname) · \(String(no.suffix(4)))"
        shop = JS.str(o, "shop") ?? ""
        source = JS.str(o, "source") ?? "manual"
        sourceRef = JS.str(o, "sourceNote") ?? JS.str(o, "sourceRef") ?? ""
        let stat = JS.str(o, "status") ?? "unknown"
        let dir = JS.str(o, "direction") ?? "in"
        direction = dir
        status = stat
        statusText = JS.str(o, "statusText") ?? Shipment.statusName[stat] ?? "Ukjent status"
        // Levert er alltid siste steg, selv om serveren bare har steget fra registreringen.
        let rawStep = JS.int(o, "step") ?? Shipment.stepOf(stat)
        step = stat == "delivered" ? 4 : Swift.max(0, Swift.min(4, rawStep))
        let st = JS.strings(o, "steps")
        steps = st.count == 5 ? st : (dir == "out" ? Shipment.stepsOut : Shipment.stepsIn)
        eta = JS.str(o, "eta") ?? ""
        pickupPoint = JS.str(o, "pickupPoint") ?? ""
        archived = JS.bool(o, "archived") ?? false
        url = JS.str(o, "url") ?? ""
        events = JS.list(o, "events").map(TrackEvent.init)
        logoKind = JS.str(lg, "kind") ?? ""
        logoManual = JS.bool(lg, "manual") ?? ((JS.str(lg, "kilde") ?? JS.str(lg, "source") ?? "") == "manuell")
        let le: [String: Any]? = JS.dict(o, "lastEvent")
        lastText = JS.str(le, "text") ?? JS.str(le, "status") ?? ""
        lastPlace = JS.str(le, "place") ?? JS.str(le, "location") ?? ""
        lastAt = JS.date(le?["time"] ?? le?["ts"])
        let ue: [String: Any]? = JS.dict(o, "updateError")
        errText = JS.str(ue, "text") ?? JS.str(o, "updateError") ?? ""
        errRetry = JS.date(ue?["retryAt"])
        estimated = JS.str(o, "estimatedDelivery") ?? ""
        let pk: [String: Any]? = JS.dict(o, "pickup")
        pickupName = JS.str(pk, "name") ?? ""
        pickupDeadline = JS.date(pk?["deadline"])
        if pickupPoint.isEmpty && !pickupName.isEmpty { pickupPoint = pickupName }
        let rawSteps: [[String: Any]] = JS.list(o, "steps")
        if !rawSteps.isEmpty {
            stepTimes = rawSteps.map { st -> Date? in JS.date(st["time"] ?? st["at"] ?? st["date"]) }
            // Siste steg som er gjort / aktivt gir faktisk status når serveren sender objekter.
            var lastDone: Int = -1
            for (i, st) in rawSteps.enumerated() where (JS.bool(st, "done") ?? false) || (JS.bool(st, "active") ?? false) { lastDone = i }
            if lastDone >= 0 && stat != "delivered" { step = Swift.max(0, Swift.min(4, lastDone)) }
        }
    }

    static let stepsIn = ["Registrert", "Hentet", "I transport", "Klar for henting", "Levert"]
    static let stepsOut = ["Registrert", "Levert inn", "I transport", "Ute for levering", "Levert"]
    static let statusName = ["registered": "Registrert", "picked_up": "Hentet", "in_transit": "I transport", "ready_for_pickup": "Klar for henting",
                             "out_for_delivery": "Ute for levering", "delivered": "Levert", "delayed": "Forsinket", "unknown": "Ukjent status"]
    static func stepOf(_ s: String) -> Int {
        switch s {
        case "picked_up": 1
        case "in_transit", "delayed": 2
        case "ready_for_pickup", "out_for_delivery": 3
        case "delivered": 4
        default: 0
        }
    }

    var done: Bool { status == "delivered" }
    var active: Bool { !archived && !done }
    var ready: Bool { status == "ready_for_pickup" && direction != "out" }
    var outgoing: Bool { direction == "out" }
    var color: Color { ready ? .accentLight : done ? .positive : status == "delayed" ? Color(hex: "#FF8A80") : .white }
    var sourceLabel: String { source == "finn" ? "Finn" : source == "email" ? "E-post" : "Manuell" }
    /// «Hent på Coop Extra Bislett», «Ventet 18.10» eller ETA-teksten fra transportøren.
    var etaText: String {
        if ready && !pickupPoint.isEmpty { return pickupPoint }
        if eta.isEmpty { return outgoing ? "Utgående" : "" }
        if eta.count >= 10, let d = parseDay(eta) { return (done ? "Levert " : "Ventet ") + JS.fmt(d, "dd.MM") }
        return eta
    }
}

struct Carrier: Identifiable, Hashable {
    var id: String
    var name: String
    var ini: String
    var color: String
    var fg: String
    var configured: Bool?
    /// Formatene fra designet (må verifiseres mot transportørene). «other» = reservetjenesten (17TRACK/AfterShip).
    static let known: [Carrier] = [
        Carrier(id: "posten", name: "Posten", ini: "P", color: "#E32D22", fg: "#FFFFFF"),
        Carrier(id: "bring", name: "Bring", ini: "B", color: "#7BC144", fg: "#0F2A05"),
        Carrier(id: "postnord", name: "PostNord", ini: "PN", color: "#00A0D6", fg: "#FFFFFF"),
        Carrier(id: "dhl", name: "DHL", ini: "DHL", color: "#FFCC00", fg: "#D40511"),
        Carrier(id: "ups", name: "UPS", ini: "UPS", color: "#351C15", fg: "#FFB500"),
        Carrier(id: "fedex", name: "FedEx", ini: "FX", color: "#4D148C", fg: "#FFFFFF"),
        Carrier(id: "gls", name: "GLS", ini: "GLS", color: "#172154", fg: "#FFD100"),
        Carrier(id: "schenker", name: "DB Schenker", ini: "DB", color: "#EC0016", fg: "#FFFFFF"),
        Carrier(id: "helthjem", name: "Helthjem", ini: "HH", color: "#2E2A6B", fg: "#FFFFFF"),
        Carrier(id: "budbee", name: "Budbee", ini: "BB", color: "#2BCE96", fg: "#05271B"),
        Carrier(id: "instabox", name: "Instabox", ini: "IB", color: "#FF4E00", fg: "#FFFFFF"),
        Carrier(id: "other", name: "Annen (17TRACK)", ini: "17", color: "#3A4252", fg: "#EEF0F4"),
    ]
    private static let patterns: [(String, [String])] = [
        ("posten", [#"^[A-Z]{2}\d{9}NO$"#, #"^(LP|LZ)\d{12,}$"#]),
        ("bring", [#"^70\d{15}$"#, #"^\d{17}$"#]),
        ("postnord", [#"^00370\d{15}$"#, #"^[A-Z]{2}\d{9}(SE|DK|FI)$"#, #"^\d{18,20}$"#]),
        ("dhl", [#"^JJD\d{10,}$"#, #"^(JVGL|GM)\w{8,}$"#, #"^\d{10}$"#]),
        ("ups", [#"^1Z[0-9A-Z]{16}$"#]),
        ("fedex", [#"^\d{12}$"#, #"^\d{15}$"#]),
        ("gls", [#"^\d{11}$"#]),
        ("schenker", [#"^\d{9}$"#]),
        ("helthjem", [#"^HH\d{8,}$"#]),
        ("budbee", [#"^BB[A-Z0-9]{8,}$"#]),
        ("instabox", [#"^IB[A-Z0-9]{8,}$"#]),
    ]
    /// Gjetter transportøren ut fra formatet. Serveren sjekker også (GET /api/tracking/detect).
    static func detect(_ raw: String) -> String {
        let no = raw.uppercased().filter { $0.isLetter || $0.isNumber }
        for (id, res) in patterns where res.contains(where: { no.range(of: $0, options: .regularExpression) != nil }) { return id }
        return "other"
    }
}

struct TrackSource: Hashable { var on: Bool; var lastCheck: Date? }
struct TrackNotice: Hashable { var id: String; var kind: String; var text: String }

struct TrackingData {
    var items: [Shipment] = []
    var finn = TrackSource(on: true, lastCheck: nil)
    var email = TrackSource(on: true, lastCheck: nil)
    /// Arkiver leverte pakker automatisk.
    var autoArchive = TrackSource(on: true, lastCheck: nil)
    var carriers: [Carrier] = []
    var prefs: [String: Bool] = ["found": true, "out": true, "pickup": true, "delivered": false, "delayed": true]
    var notices: [TrackNotice]? = nil
    var lastRun: Date?

    static func parse(_ d: Data) -> TrackingData { TrackingData(JS.obj(d)) }
    init() {}
    init(_ o: [String: Any]) {
        items = JS.list(o, "items").map(Shipment.init)
        let src = JS.dict(o, "sources")
        func source(_ k: String) -> TrackSource {
            if let b = JS.bool(src, k), !(src?[k] is [String: Any]) { return TrackSource(on: b, lastCheck: nil) }
            let s = JS.dict(src, k)
            return TrackSource(on: JS.bool(s, "on") ?? true, lastCheck: JS.date(s?["lastCheck"]))
        }
        finn = source("finn")
        email = source(src?["email"] != nil ? "email" : "mail")
        autoArchive = source("autoArchive")
        let list = JS.list(o, "carriers").map { c -> Carrier in
            let id = JS.str(c, "id") ?? "other"
            let def = Carrier.known.first { $0.id == id }
            return Carrier(id: id, name: JS.str(c, "name") ?? def?.name ?? id, ini: JS.str(c, "ini") ?? def?.ini ?? String(id.prefix(2)).uppercased(),
                           color: JS.str(c, "color") ?? def?.color ?? "#3A4252", fg: JS.str(c, "fg") ?? def?.fg ?? "#FFFFFF", configured: JS.bool(c, "configured"))
        }
        carriers = list.isEmpty ? Carrier.known : list
        if let p = JS.dict(o, "prefs") { for k in prefs.keys { if let v = JS.bool(p, k) { prefs[k] = v } } }
        if o["notices"] != nil {
            notices = JS.list(o, "notices").map { TrackNotice(id: JS.str($0, "id") ?? UUID().uuidString, kind: JS.str($0, "kind") ?? "", text: JS.str($0, "text") ?? "") }
        }
        lastRun = JS.date(o["lastRun"])
    }

    var lastCheck: Date? { [finn.lastCheck, email.lastCheck, lastRun].compactMap { $0 }.max() }
    var activeCount: Int { items.filter(\.active).count }
    var pickupCount: Int { items.filter { !$0.archived && $0.ready }.count }
    /// De viktigste: klar for henting først, så lengst kommet.
    func top(_ n: Int) -> [Shipment] {
        Array(items.filter(\.active).sorted { a, b in a.ready != b.ready ? a.ready : a.step > b.step }.prefix(n))
    }
}

/* ---------------- Sporing: data og varsler ---------------- */

extension Store {
    func loadTracking() async throws {
        let t = TrackingData.parse(try await api.callAt("/api", "GET", "/tracking"))
        tracking = t
        notifyTracking(t)
    }

    /// Henter status i bakgrunnen (forsiden, åpen app hvert 5. minutt). Feil vises ikke.
    func pollTracking() async {
        guard loggedIn, !locked, let d = try? await api.callAt("/api", "GET", "/tracking", timeout: 15) else { return }
        let t = TrackingData.parse(d)
        tracking = t
        homePackages = t.top(2)
        notifyTracking(t)
    }

    func addTracking(no: String, name: String, carrier: String?, out: Bool) {
        let n = no.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { flash("Skriv inn et sporingsnummer"); return }
        run {
            var body: [String: Any] = ["trackingNo": n, "direction": out ? "out" : "in"]
            let nm = name.trimmingCharacters(in: .whitespacesAndNewlines)
            if !nm.isEmpty { body["name"] = nm }
            if let carrier, carrier != "other" { body["carrier"] = carrier }
            let d = try await self.api.callAt("/api", "POST", "/tracking", json: body, timeout: 30)
            let o = JS.obj(d)
            if let item = JS.dict(o, "item") { self.trkSel = Shipment(item).id }
            try await self.loadTracking()
            self.trkFilter = out ? "out" : "active"
            self.flash(JS.str(o, "message") ?? "Sendingen spores")
        }
    }

    func archiveTracking(_ s: Shipment, _ on: Bool) {
        run {
            try await self.api.callAt("/api", "PATCH", "/tracking/\(s.id)", json: ["archived": on])
            if on { self.trkSel = nil }
            try await self.loadTracking()
            self.flash(on ? "\(s.name) er arkivert" : "\(s.name) er hentet tilbake")
        }
    }

    func deleteTracking(_ s: Shipment) {
        run {
            try await self.api.callAt("/api", "DELETE", "/tracking/\(s.id)")
            self.trkSel = nil
            try await self.loadTracking()
            self.flash("\(s.name) er slettet")
        }
    }

    /// «Sjekk nå»: leser e-post og Finn, og henter status hos transportørene.
    func checkTracking() {
        guard !trkChecking else { return }
        trkChecking = true
        run {
            defer { self.trkChecking = false }
            let d = try await self.api.callAt("/api", "POST", "/tracking/check", timeout: 60)
            let o = JS.obj(d)
            if o["items"] != nil { let t = TrackingData(o); self.tracking = t; self.notifyTracking(t) } else { try await self.loadTracking() }
            self.flash(JS.str(o, "message") ?? "Sporing er oppdatert")
        }
    }

    func setTrackingPref(_ k: String, _ on: Bool) {
        tracking?.prefs[k] = on
        run { try await self.api.callAt("/api", "PUT", "/tracking/prefs", json: [k: on]) }
    }

    /// k: finn | email | autoArchive
    func setTrackingSource(_ k: String, _ on: Bool) {
        if k == "finn" { tracking?.finn.on = on } else if k == "autoArchive" { tracking?.autoArchive.on = on } else { tracking?.email.on = on }
        run { try await self.api.callAt("/api", "PUT", "/tracking/sources", json: [k: on]) }
    }

    /// Lokale varsler for nye hendelser (serverens varselliste, ellers statusendringer til «Klar for henting» og «Levert»).
    /// Første gang huskes bare det som finnes, så det ikke kommer en bølge av gamle varsler.
    func notifyTracking(_ t: TrackingData) {
        let key = "fh_trk_seen_" + (account?.id ?? "")
        let first = UserDefaults.standard.object(forKey: key) == nil
        var seen = UserDefaults.standard.stringArray(forKey: key) ?? []
        var fresh: [(String, String, String)] = []
        if let notices = t.notices {
            for n in notices.reversed() where !seen.contains("n:" + n.id) {
                seen.append("n:" + n.id)
                let title = ["pickup": "Klar for henting", "delivered": "Levert", "out": "Ute for levering", "delayed": "Forsinket", "found": "Ny sending"][n.kind] ?? "Sporing"
                fresh.append((title, n.text, "trk-n-" + n.id))
            }
        }
        // Statusendringer (også når serveren ikke sender varsellisten).
        for s in t.items where !s.archived && (s.ready || s.done) {
            let k = "s:\(s.id):\(s.status)"
            guard !seen.contains(k) else { continue }
            seen.append(k)
            if t.notices != nil { continue }
            let want = s.ready ? (t.prefs["pickup"] ?? true) : (t.prefs["delivered"] ?? true)
            guard want else { continue }
            fresh.append(s.ready ? ("Klar for henting", "\(s.name)" + (s.pickupPoint.isEmpty ? "" : " hos \(s.pickupPoint)"), "trk-\(s.id)-pickup")
                                 : ("Levert", "\(s.name) er levert", "trk-\(s.id)-delivered"))
        }
        UserDefaults.standard.set(Array(seen.suffix(400)), forKey: key)
        guard !first, !fresh.isEmpty else { return }
        for f in fresh.suffix(3) { LocalNotify.post(f.0, f.1, id: f.2, group: "pakker") }
        Haptics.shared.package()
    }
}

/* ---------------- Sporing: visning ---------------- */

/// Domenet til transportørens logo (hentes via /finans/api/logo, samme som butikklogoene).
let carrierDomains: [String: String] = [
    "posten": "posten.no", "bring": "bring.no", "postnord": "postnord.no", "dhl": "dhl.com", "ups": "ups.com",
    "fedex": "fedex.com", "gls": "gls-group.com", "schenker": "dbschenker.com", "helthjem": "helthjem.no",
    "budbee": "budbee.com", "instabox": "instabox.io", "porterbuddy": "porterbuddy.com", "db": "dbschenker.com", "dbschenker": "dbschenker.com",
]

/// Transportørmerket: logoen når den finnes, ellers initialer på merkefargen.
struct CarrierBadge: View {
    @Environment(Store.self) private var store
    let ini: String
    let color: String
    let fg: String
    var size: CGFloat = 40
    var carrier: String? = nil
    @State private var img: UIImage? = nil
    var body: some View {
        Group {
            if let c = carrier, CarrierMark.known(c) {
                CarrierMark(carrier: c, size: size, radius: size * 0.28)
            } else if let img {
                Image(uiImage: img).resizable().scaledToFit().padding(size / 8)
                    .frame(width: size, height: size).background(.white, in: RoundedRectangle(cornerRadius: size * 0.28))
            } else {
                initials
            }
        }
        .task(id: carrier) {
            if let c = carrier, let d = carrierDomains[c] { img = await store.logo(d) }
        }
    }
    private var initials: some View {
        Text(ini).font(.system(size: size * (ini.count > 2 ? 0.28 : 0.36), weight: .heavy)).foregroundStyle(Color(hex: fg)).lineLimit(1).minimumScaleFactor(0.6)
            .frame(width: size, height: size).background(Color(hex: color), in: RoundedRectangle(cornerRadius: size * 0.28))
    }
}

/// Fremdrift i 5 steg.
struct StepBar: View {
    let step: Int
    var color: Color = .accent
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<5, id: \.self) { i in
                Capsule().fill(i <= step ? color : Color.skinFg.opacity(0.15)).frame(height: 5)
            }
        }
    }
}

private let trkFilters = [("active", "Aktive"), ("pickup", "Klar for henting"), ("out", "Utgående"), ("done", "Levert")]
private let trkPrefs: [(String, String, String?)] = [("found", "Nytt sporingsnummer funnet", "Fra e-post eller Finn"), ("out", "Ute for levering", nil), ("pickup", "Klar for henting", nil),
                        ("delivered", "Levert", nil), ("delayed", "Forsinket", "Av som standard")]

private func trkChip(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
    Button { Haptics.shared.select(); act() } label: {
        Text(t).font(.subheadline.weight(on ? .semibold : .regular)).lineLimit(1).padding(.horizontal, 14).frame(height: 36).foregroundStyle(on ? Color.ink : Color.skinFg).contentShape(Capsule())
    }
    .buttonStyle(.plain).glass(18, tint: on ? .accent : nil)
}

/// Sporing (Homelab-fane): legg til, kilder, filter, kort med tidslinje, varsler og transportører.
struct TrackingView: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var no = ""
    @State private var name = ""
    @State private var carrier: String?
    @State private var out = false
    @State private var confirmDelete: String?
    /// Rekkefølgen på kortene: langt trykk (500 ms) → redigeringsmodus der kortene vugger og får ▲/▼ (eller dras).
    /// Kortene er Legg til + kilder, Sendinger, Varsler og Transportører. Lagres per bruker (layout.trkOrder).
    @State private var arranging = false
    @State private var wiggle = false
    @State private var dropTarget: String?

    private static let allSections = Store.trkKeys
    private var order: [String] { Store.fullTrkOrder(store.trkOrder) }

    var body: some View {
        let t = store.tracking
        ScrollView {
            VStack(spacing: 12) {
                header(t)
                if let e = store.moduleError { Empty(text: e) }
                if arranging { arrangeBar }
                ForEach(order, id: \.self) { k in
                    arrangeable(k, t)
                }
                if t == nil && store.moduleError == nil { ProgressView().padding(30) }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .tracksScroll(store)
        .refreshable { await store.reloadModule() }
        .onAppear { LocalNotify.ask() }
    }

    private var arrangeBar: some View {
        HStack {
            Text("Flytt kortene med ▲/▼ eller dra dem").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.75))
            Spacer()
            Button { stopArranging() } label: {
                Text("Ferdig").fontWeight(.bold).foregroundStyle(Color.ink).padding(.horizontal, 16).frame(height: 36).contentShape(Capsule())
            }
            .buttonStyle(.plain).glass(18, tint: .accent)
        }
    }

    private func stopArranging() {
        Haptics.shared.tap()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { arranging = false; wiggle = false }
    }

    private func startArranging() {
        guard !arranging else { return }
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { arranging = true }
        withAnimation(.easeInOut(duration: 0.14).repeatForever(autoreverses: true)) { wiggle = true }
    }

    private func move(_ from: String, before to: String) {
        guard from != to else { return }
        var o = order
        o.removeAll { $0 == from }
        let i = o.firstIndex(of: to) ?? o.count
        o.insert(from, at: i)
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { store.setTrkOrder(o) }
    }

    @ViewBuilder private func section(_ k: String, _ t: TrackingData?) -> some View {
        switch k {
        case "add":
            VStack(spacing: 12) {
                addCard(t)
                if let t { sourcesCard(t) }
            }
        case "shipments": if let t { VStack(spacing: 12) { list(t) } }
        case "notify": if let t { prefsCard(t) }
        case "carriers": if let t { carriersCard(t) }
        default: EmptyView()
        }
    }

    @ViewBuilder private func arrangeable(_ k: String, _ t: TrackingData?) -> some View {
        if arranging {
            let odd = (TrackingView.allSections.firstIndex(of: k) ?? 0) % 2 == 1
            section(k, t)
                .allowsHitTesting(false)
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(dropTarget == k ? Color.accent : Color.skinFg.opacity(0.25), lineWidth: dropTarget == k ? 2 : 1))
                .overlay(alignment: .topTrailing) { arrows(k) }
                .rotationEffect(.degrees(wiggle ? (odd ? 0.7 : -0.7) : 0))
                .contentShape(RoundedRectangle(cornerRadius: 24))
                .draggable(k) { section(k, t).frame(width: 320).opacity(0.9) }
                .dropDestination(for: String.self) { items, _ in
                    if let from = items.first { move(from, before: k) }
                    dropTarget = nil
                    return true
                } isTargeted: { on in dropTarget = on ? k : (dropTarget == k ? nil : dropTarget) }
        } else {
            section(k, t)
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in startArranging() })
        }
    }

    /// ▲/▼ på kortet i redigeringsmodus.
    private func arrows(_ k: String) -> some View {
        let i = order.firstIndex(of: k) ?? 0
        return HStack(spacing: 6) {
            arrow("chevron.up", enabled: i > 0) { store.moveTrkCard(k, -1) }
            arrow("chevron.down", enabled: i < order.count - 1) { store.moveTrkCard(k, 1) }
        }
        .padding(10)
    }

    private func arrow(_ icon: String, enabled: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: icon).font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink)
                .frame(width: 34, height: 34).background(Color.skinFg.opacity(enabled ? 0.92 : 0.35), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(icon == "chevron.up" ? "Flytt opp" : "Flytt ned")
    }

    private func header(_ t: TrackingData?) -> some View {
        let sum = t.map { d in [d.activeCount > 0 ? "\(d.activeCount) på vei" : "Ingen på vei", d.pickupCount > 0 ? "\(d.pickupCount) klar for henting" : nil].compactMap { $0 }.joined(separator: " · ") } ?? "Pakker på vei"
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(store.hlName(.trk)).font(.system(size: 30, weight: .bold)).lineLimit(1)
                Text(sum).font(.subheadline).foregroundStyle(Color.skinFg.opacity(0.7)).lineLimit(1)
            }
            Spacer()
            Avatar()
        }
        .padding(.top, 6)
    }

    private func addCard(_ t: TrackingData?) -> some View {
        let clean = no.trimmingCharacters(in: .whitespacesAndNewlines)
        let guess = Carrier.detect(clean)
        let pick = carrier ?? guess
        let carriers = t?.carriers ?? Carrier.known
        let guessName = carriers.first { $0.id == guess }?.name ?? guess
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "shippingbox").foregroundStyle(Color.accentLight)
                TextField("Lim inn sporingsnummer", text: $no).textInputAutocapitalization(.characters).autocorrectionDisabled().submitLabel(.done)
                    .onChange(of: no) { _, _ in carrier = nil }
                if no.isEmpty {
                    Button { if let s = UIPasteboard.general.string { no = s.trimmingCharacters(in: .whitespacesAndNewlines) } } label: {
                        Text("Lim inn").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight).frame(height: 36)
                    }
                    .buttonStyle(.plain)
                } else {
                    Button { no = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.skinFg.opacity(0.5)).frame(width: 30, height: 30) }.buttonStyle(.plain).accessibilityLabel("Tøm feltet")
                }
            }
            .padding(.horizontal, 16).frame(height: 52).glass(26)
            if !clean.isEmpty {
                TextField("Navn (valgfritt), f.eks. Zalando · jakke", text: $name).padding(.horizontal, 16).frame(height: 46).glass(23)
                Text(guess == "other" ? "Ukjent format. Velg transportør, eller la reservetjenesten finne den." : "Gjenkjent: \(guessName). Trykk for å velge en annen.")
                    .font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(carriers) { c in
                            Button { Haptics.shared.select(); carrier = c.id } label: {
                                HStack(spacing: 6) {
                                    CarrierBadge(ini: c.ini, color: c.color, fg: c.fg, size: 22, carrier: c.id)
                                    Text(c.name).font(.footnote.weight(pick == c.id ? .semibold : .regular)).lineLimit(1)
                                }
                                .padding(.leading, 6).padding(.trailing, 12).frame(height: 34).foregroundStyle(pick == c.id ? Color.ink : Color.skinFg).contentShape(Capsule())
                            }
                            .buttonStyle(.plain).glass(17, tint: pick == c.id ? .accent : nil)
                        }
                    }
                }
                Picker("Retning", selection: $out) {
                    Text("Til meg").tag(false)
                    Text("Utgående").tag(true)
                }
                .pickerStyle(.segmented)
            }
            Button {
                Haptics.shared.tap()
                store.addTracking(no: clean, name: name, carrier: pick, out: out)
                no = ""; name = ""; carrier = nil; out = false
            } label: {
                Text("Spor").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 48).contentShape(Capsule())
            }
            .buttonStyle(.plain).glass(24, tint: .accent).disabled(clean.count < 6).opacity(clean.count < 6 ? 0.5 : 1)
        }
        .padding(16).glass(26)
    }

    private func sourcesCard(_ t: TrackingData) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Kilder").fontWeight(.semibold)
                    Text(t.lastCheck.map { "Sist sjekket " + JS.fmt($0, Calendar.current.isDateInToday($0) ? "HH:mm" : "dd.MM HH:mm") } ?? "Ikke sjekket ennå")
                        .font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                }
                Spacer()
                Button { Haptics.shared.tap(); store.checkTracking() } label: {
                    HStack(spacing: 6) {
                        if store.trkChecking { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.clockwise") }
                        Text(store.trkChecking ? "Sjekker …" : "Sjekk nå").fontWeight(.semibold)
                    }
                    .font(.footnote).padding(.horizontal, 14).frame(height: 36).contentShape(Capsule())
                }
                .buttonStyle(.plain).glass(18)
            }
            Toggle(isOn: Binding(get: { t.finn.on }, set: { store.setTrackingSource("finn", $0) })) {
                VStack(alignment: .leading, spacing: 1) { Text("Finn"); Text("Fiks ferdig-handler med sporingsnummer").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)) }
            }
            .padding(.top, 6)
            Toggle(isOn: Binding(get: { t.email.on }, set: { store.setTrackingSource("email", $0) })) {
                VStack(alignment: .leading, spacing: 1) { Text("E-post (Proton Mail)"); Text("Ordre- og fraktbekreftelser hvert 15. minutt").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)) }
            }
        }
        .tint(.accent)
        .padding(16).glass(24)
    }

    @ViewBuilder private func list(_ t: TrackingData) -> some View {
        let counts = ["active": t.activeCount, "pickup": t.pickupCount, "out": t.items.filter { $0.outgoing && $0.active }.count, "done": t.items.filter { $0.archived || $0.done }.count]
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(trkFilters, id: \.0) { k, label in
                    trkChip(counts[k, default: 0] > 0 ? "\(label) \(counts[k, default: 0])" : label, store.trkFilter == k) { store.trkFilter = k }
                }
            }
        }
        let shown = t.items.filter { s in
            switch store.trkFilter {
            case "pickup": return !s.archived && s.ready
            case "out": return s.outgoing && s.active
            case "done": return s.archived || s.done
            default: return s.active
            }
        }
        if shown.isEmpty { Empty(text: "Ingen sendinger her.") }
        ForEach(shown) { s in card(s) }
    }

    private func card(_ s: Shipment) -> some View {
        let open = store.trkSel == s.id
        return VStack(alignment: .leading, spacing: 12) {
            Button {
                Haptics.shared.select()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { store.trkSel = open ? nil : s.id }
            } label: {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        CarrierBadge(ini: s.carrierIni, color: s.carrierColor, fg: s.carrierFg, carrier: s.carrier)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).fontWeight(.semibold).lineLimit(1)
                            Text("\(s.carrierName) · \(s.trackingNo)").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(1)
                        }
                        Spacer(minLength: 6)
                        Pill(text: s.outgoing ? "Ut · \(s.sourceLabel)" : s.sourceLabel, color: Color.skinFg.opacity(0.8))
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(s.statusText).font(.subheadline.weight(.semibold)).foregroundStyle(s.color).lineLimit(1)
                        Spacer(minLength: 8)
                        Text(s.etaText).font(.caption).foregroundStyle(Color.skinFg.opacity(0.65)).lineLimit(1)
                    }
                    StepBar(step: s.step, color: s.done ? .positive : .accent)
                    HStack(spacing: 2) {
                        ForEach(Array(s.steps.enumerated()), id: \.offset) { i, l in
                            Text(l).font(.system(size: 9.5, weight: i == s.step ? .semibold : .regular)).foregroundStyle(Color.skinFg.opacity(i <= s.step ? 0.85 : 0.4))
                                .lineLimit(1).minimumScaleFactor(0.6).frame(maxWidth: .infinity)
                        }
                    }
                    if !open, let e = s.events.first {
                        Text([e.status, e.location, e.when].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(1)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open { detail(s) }
        }
        .padding(16).glass(24)
    }

    @ViewBuilder private func detail(_ s: Shipment) -> some View {
        Divider().overlay(Color.skinFg.opacity(0.12))
        if s.events.isEmpty {
            Text("Ingen hendelser ennå.").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6))
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(s.events.enumerated()), id: \.offset) { i, e in
                    HStack(alignment: .top, spacing: 12) {
                        VStack(spacing: 0) {
                            Circle().fill(i == 0 ? s.color : Color.skinFg.opacity(0.35)).frame(width: 10, height: 10).padding(.top, 4)
                            if i < s.events.count - 1 { Rectangle().fill(Color.skinFg.opacity(0.18)).frame(width: 2).frame(maxHeight: .infinity) }
                        }
                        .frame(width: 12)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.status).font(.subheadline.weight(i == 0 ? .semibold : .regular))
                            Text([e.when, e.location].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                        }
                        .padding(.bottom, 12)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        if !s.sourceRef.isEmpty { Text("✦ " + s.sourceRef).font(.caption).foregroundStyle(Color.accentLight) }
        Flow(spacing: 8) {
            if let u = URL(string: s.url), !s.url.isEmpty {
                trkAction("Åpne hos \(s.carrierName) ↗", primary: true) { openURL(u) }
            }
            trkAction(s.archived ? "Hent tilbake" : "Arkiver") { store.archiveTracking(s, !s.archived) }
            trkAction(confirmDelete == s.id ? "Bekreft sletting" : "Slett", danger: true) {
                if confirmDelete == s.id { confirmDelete = nil; store.deleteTracking(s) } else {
                    Haptics.shared.warning()
                    confirmDelete = s.id
                    Task { try? await Task.sleep(for: .seconds(4)); if confirmDelete == s.id { confirmDelete = nil } }
                }
            }
        }
    }

    private func trkAction(_ t: String, primary: Bool = false, danger: Bool = false, _ act: @escaping () -> Void) -> some View {
        Button { Haptics.shared.tap(); act() } label: {
            Text(t).font(.footnote.weight(.semibold)).foregroundStyle(primary ? Color.ink : danger ? Color(hex: "#FF8A80") : Color.skinFg).lineLimit(1)
                .padding(.horizontal, 14).frame(height: 36).contentShape(Capsule())
        }
        .buttonStyle(.plain).glass(18, tint: primary ? .accent : nil)
    }

    private func prefsCard(_ t: TrackingData) -> some View {
        @Bindable var h = Haptics.shared
        return VStack(alignment: .leading, spacing: 2) {
            HStack { Text("Varsler og haptikk").fontWeight(.semibold); Spacer(); Text("Varsel når appen henter status").font(.caption).foregroundStyle(Color.skinFg.opacity(0.55)) }
                .padding(.bottom, 6)
            ForEach(trkPrefs, id: \.0) { k, label, sub in
                Toggle(isOn: Binding(get: { t.prefs[k] ?? (k != "delayed") }, set: { store.setTrackingPref(k, $0) })) {
                    VStack(alignment: .leading, spacing: 1) { Text(label); if let sub { Text(sub).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)) } }
                }
                .padding(.vertical, 3)
            }
            Toggle(isOn: $h.packages) {
                VStack(alignment: .leading, spacing: 1) { Text("Haptikk ved pakkevarsler"); Text("Lagres på denne enheten").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)) }
            }
            .padding(.vertical, 3)
            Text("Ekte push fra serveren er ikke bygget ennå. Varslene kommer når appen er åpen eller henter status.").font(.caption).foregroundStyle(Color.skinFg.opacity(0.5)).padding(.top, 6)
        }
        .tint(.accent)
        .padding(16).glass(24)
    }

    private func carriersCard(_ t: TrackingData) -> some View {
        let list = t.carriers.filter { $0.id != "other" } + t.carriers.filter { $0.id == "other" }
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Transportører").fontWeight(.semibold)
                Text("Nøkler legges inn i Innstillinger → Integrasjoner → Sporing (web)").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
            }
            .padding(.bottom, 8)
            ForEach(Array(list.enumerated()), id: \.element.id) { i, c in
                if i > 0 { Divider().overlay(Color.skinFg.opacity(0.1)) }
                HStack(spacing: 12) {
                    CarrierBadge(ini: c.ini, color: c.color, fg: c.fg, size: 30, carrier: c.id)
                    Text(c.name).lineLimit(1)
                    Spacer()
                    if let ok = c.configured {
                        Text(ok ? "Nøkkel ✓" : "Mangler nøkkel").font(.caption.weight(.semibold)).foregroundStyle(ok ? Color.positive : Color.skinFg.opacity(0.5))
                    }
                }
                .padding(.vertical, 8)
            }
        }
        .padding(16).glass(24)
    }
}

/// «Pakker» i karusellen på Homelab-hjem: de 2 viktigste. Trykk åpner Sporing.
struct PackagesCard: View {
    @Environment(Store.self) private var store
    var body: some View {
        let items = store.homePackages ?? store.tracking?.top(2) ?? []
        Button { Haptics.shared.tap(); store.goHl(.trk) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: "shippingbox.fill").foregroundStyle(Color.accentLight)
                    Text("Pakker").font(.headline)
                    if let n = store.tracking?.activeCount, n > 0 { Text("\(n)").font(.caption.weight(.bold)).foregroundStyle(Color.ink).padding(.horizontal, 7).padding(.vertical, 2).background(Color.accent, in: Capsule()) }
                    Spacer()
                }
                if items.isEmpty {
                    Spacer(minLength: 0)
                    Text("Ingen pakker på vei.").font(.subheadline).foregroundStyle(Color.skinFg.opacity(0.65)).frame(maxWidth: .infinity)
                    Spacer(minLength: 0)
                } else {
                    ForEach(items.prefix(2)) { s in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 10) {
                                CarrierBadge(ini: s.carrierIni, color: s.carrierColor, fg: s.carrierFg, size: 34, carrier: s.carrier)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(s.name).fontWeight(.semibold).lineLimit(1)
                                    Text(s.statusText + (s.etaText.isEmpty ? "" : " · \(s.etaText)")).font(.caption).foregroundStyle(s.ready ? Color.accentLight : Color.skinFg.opacity(0.65)).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                            StepBar(step: s.step, color: s.done ? .positive : .accent)
                        }
                        .padding(10).background(Color.skinFg.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
                    }
                    Spacer(minLength: 0)
                }
                HStack { Spacer(); Text("Åpne sporing ›").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight) }
            }
            .foregroundStyle(Color.skinFg)
            .padding(18).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).glass(28)
            .contentShape(RoundedRectangle(cornerRadius: 28))
        }
        .buttonStyle(.plain)
    }
}
