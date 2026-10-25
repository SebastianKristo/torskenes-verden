import SwiftUI
import UIKit
import MapKit
import CoreLocation
import WidgetKit

/* ---------------- Prompt 40 (tillegg): Hjemlys-flyten – alle tre (1a + 1b + 1c) som deler av samme funksjon ----------------
   Fasit: design/Hjemme trygt Varianter.dc.html. CONTRACT40 «Tillegg».
   – 1a «Rolig og papir» (dagtid): startside med MapKit-kart og rute fra posisjonen til hjemmeadressen, «Fra Majorstuen · 2,2 km»,
     reisemåter (Trikk 19 + gå / Gå / Sykkel) med ankomsttid, mottakere og «Start · hjemme ca. 23.36». Aktiv økt: stor tid,
     fremdrift, Følger med / Deler nå (Ingenting) / Hvis du er sen, «+ 10 min», «Jeg er hjemme» og «Avslutt».
     Mottakers visning når noen er sen: «Sebastian er ikke hjemme ennå» med siste posisjon, rute, batteri/dekning, sist opplåst,
     var med (kalender), «Ring Sebastian» / «Åpne kart».
   – 1b «Glimt foreslår»: varselet «Kino er ferdig. Skal jeg si fra …?» med «Ja, start» / «Ikke nå», og Glimt-samtalen + logg
     (Hjemlys40Glimt.swift).
   – 1c «Nattmodus med nedtelling» (etter kl. 21 eller i mørkt tema): mørk startside (reisemåter, ventetid, hva som deles, Start),
     stor nedtellingsring «8:12» og rød alarmskjerm hos mottaker «Sebastian er 15 min forsinket» med Ring / Åpne kart / Ring 112.
   – Felles: Hjem-kortet (h14) og Hjem-widgeten «Start for meg» (FinansHubWidgets/HjemlysWidget40.swift).
   API: GET /api/hjemlys/route?mode= → {from:{name, km}, to?:{name, lat, lon}, options:[{mode, label, legs, eta, minutes}], geometry?}.
   Uten rute-API (404/nett): MKDirections lokalt fra posisjonen til Familie-sonen «Hjem». */

/* ---------- Delingsdata (bare når personen er sen og du er mottaker) ---------- */

struct Hjemlys40Share: Hashable {
    var lat: Double? = nil
    var lon: Double? = nil
    var posAt: Date? = nil
    var route: [CLLocationCoordinate2D] = []
    var routeStart: Date? = nil
    var routeEnd: Date? = nil
    var battery: Int? = nil
    var signal: String = ""
    var unlockedAt: Date? = nil
    var withPeople: [String] = []
    var withEvent: String = ""

    init(_ o: [String: Any]) {
        if let p = o["pos"] as? [String: Any] {
            lat = JS.num(p, "lat")
            lon = JS.num(p, "lon")
            posAt = Hjemlys40Session.date(p["at"])
        }
        let raw: [Any] = (o["route"] as? [Any]) ?? []
        for r in raw {
            guard let a = r as? [Any], a.count >= 2, let la = (a[0] as? NSNumber)?.doubleValue, let lo = (a[1] as? NSNumber)?.doubleValue else { continue }
            route.append(CLLocationCoordinate2D(latitude: la, longitude: lo))
            if a.count >= 3 {
                let t: Date? = Hjemlys40Session.date(a[2])
                if routeStart == nil { routeStart = t }
                routeEnd = t
            }
        }
        if let b = o["battery"] as? NSNumber { battery = Int((b.doubleValue <= 1 ? b.doubleValue * 100 : b.doubleValue).rounded()) }
        signal = JS.str(o, "signal") ?? ""
        unlockedAt = Hjemlys40Session.date(o["unlockedAt"])
        if let w = o["with"] as? [String: Any] {
            withEvent = JS.str(w, "event") ?? JS.str(JS.dict(w, "event"), "title") ?? ""
            let ppl: [Any] = (w["people"] as? [Any]) ?? []
            withPeople = ppl.compactMap { (x: Any) -> String? in (x as? String) ?? JS.str(x as? [String: Any], "name") }
        }
    }

    static func == (a: Hjemlys40Share, b: Hjemlys40Share) -> Bool {
        a.lat == b.lat && a.lon == b.lon && a.posAt == b.posAt && a.route.count == b.route.count && a.battery == b.battery && a.signal == b.signal
    }

    func hash(into h: inout Hasher) {
        h.combine(lat)
        h.combine(lon)
        h.combine(route.count)
        h.combine(battery)
    }

    var coord: CLLocationCoordinate2D? {
        guard let lat, let lon else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }
}

/// Nattmodus (1c): etter kl. 21 (til 06) eller i mørkt tema.
enum Hjemlys40Night {
    static func on(_ p: PaperPalette, _ d: Date = Date()) -> Bool {
        let h: Int = Calendar.current.component(.hour, from: d)
        return p.dark || h >= 21 || h < 6
    }

    static let bg: Color = Color(hex: "#0d0f14")
    static let card: Color = Color(hex: "#1a1d24")
    static let ink: Color = Color(hex: "#f3efe6")
    static let mut: Color = Color(hex: "#9aa0ab")
}

/* ---------- Rute og reisemåter ---------- */

struct Hjemlys40Option: Hashable, Identifiable {
    var id: String { mode }
    /// kollektiv | gå | sykkel | taxi
    var mode: String
    var label: String
    var legs: [String]
    var eta: Date
    var minutes: Int

    /// Serverens mode for /start.
    var serverMode: String {
        switch mode {
        case "kollektiv": return "transit"
        case "sykkel": return "bike"
        case "taxi", "bil": return "car"
        default: return "walk"
        }
    }

    var short: String {
        switch mode {
        case "kollektiv": return legs.first(where: { $0.lowercased().contains("buss") }) != nil ? "Buss" : "Trikk"
        case "sykkel": return "Sykkel"
        case "taxi", "bil": return "Taxi"
        default: return "Gå"
        }
    }
}

@MainActor
@Observable
final class Hjemlys40Route {
    static let shared = Hjemlys40Route()

    var fromName: String = ""
    var km: Double = 0
    var toName: String = "Hjem"
    var home: CLLocationCoordinate2D? = nil
    var here: CLLocationCoordinate2D? = nil
    var options: [Hjemlys40Option] = []
    var geometry: [CLLocationCoordinate2D] = []
    var picked: String = "kollektiv"
    var busy: Bool = false
    var err: String = ""

    var selected: Hjemlys40Option? { options.first { $0.mode == picked } ?? options.first }

    func load(_ store: Store) async {
        busy = true
        err = ""
        defer { busy = false }
        here = CLLocationManager().location?.coordinate
        homeFromFamily()
        if let d = try? await store.api.callAt("/api", "GET", "/hjemlys/route?mode=all", timeout: 20) {
            let o: [String: Any] = JS.obj(d)
            parse(o)
            if !options.isEmpty { return }
        }
        await local()
    }

    private func homeFromFamily() {
        let zones: [FamZone] = FamilyModel.shared.zones
        if let z = zones.first(where: { $0.icon == "home" || $0.name.lowercased().hasPrefix("hjem") }) {
            home = z.coord
            toName = z.name
        }
    }

    private func parse(_ o: [String: Any]) {
        if let f = JS.dict(o, "from") {
            fromName = JS.str(f, "name") ?? ""
            km = JS.num(f, "km") ?? 0
        }
        if let t = JS.dict(o, "to") {
            toName = JS.str(t, "name") ?? JS.str(t, "address") ?? toName
            if let la = JS.num(t, "lat"), let lo = JS.num(t, "lon") { home = CLLocationCoordinate2D(latitude: la, longitude: lo) }
        }
        options = JS.list(o, "options").compactMap { (x: [String: Any]) -> Hjemlys40Option? in
            let mins: Int = JS.int(x, "minutes") ?? 0
            let eta: Date = Hjemlys40Session.date(x["eta"]) ?? Date().addingTimeInterval(Double(mins) * 60)
            let legs: [String] = ((x["legs"] as? [Any]) ?? []).compactMap { (l: Any) -> String? in
                (l as? String) ?? JS.str(l as? [String: Any], "label") ?? JS.str(l as? [String: Any], "line")
            }
            let mode: String = JS.str(x, "mode") ?? "gå"
            return Hjemlys40Option(mode: mode, label: JS.str(x, "label") ?? mode.capitalized, legs: legs, eta: eta, minutes: mins)
        }
        geometry = Hjemlys40Route.coords(o["geometry"])
        if let first = options.first, !options.contains(where: { $0.mode == picked }) { picked = first.mode }
    }

    /// [[lat, lon]] eller GeoJSON {coordinates:[[lon, lat]]}.
    nonisolated static func coords(_ v: Any?) -> [CLLocationCoordinate2D] {
        if let g = v as? [String: Any], let c = g["coordinates"] as? [Any] {
            return c.compactMap { (x: Any) -> CLLocationCoordinate2D? in
                guard let a = x as? [Any], a.count >= 2, let lo = (a[0] as? NSNumber)?.doubleValue, let la = (a[1] as? NSNumber)?.doubleValue else { return nil }
                return CLLocationCoordinate2D(latitude: la, longitude: lo)
            }
        }
        let arr: [Any] = (v as? [Any]) ?? []
        return arr.compactMap { (x: Any) -> CLLocationCoordinate2D? in
            guard let a = x as? [Any], a.count >= 2, let la = (a[0] as? NSNumber)?.doubleValue, let lo = (a[1] as? NSNumber)?.doubleValue else { return nil }
            return CLLocationCoordinate2D(latitude: la, longitude: lo)
        }
    }

    /// Reserve: MKDirections (gå, kollektiv-ETA og bil/taxi) fra posisjonen til Hjem-sonen.
    private func local() async {
        guard let from = here, let to = home else {
            err = home == nil ? "Legg inn Hjem som sone i Familie for å få rute." : "Fant ikke posisjonen din."
            if options.isEmpty { options = Hjemlys40Route.fallback() }
            return
        }
        let a: CLLocation = CLLocation(latitude: from.latitude, longitude: from.longitude)
        km = (a.distance(from: CLLocation(latitude: to.latitude, longitude: to.longitude)) / 100).rounded() / 10
        if let pm = try? await CLGeocoder().reverseGeocodeLocation(a).first { fromName = pm.subLocality ?? pm.thoroughfare ?? pm.locality ?? "" }
        var out: [Hjemlys40Option] = []
        let types: [(MKDirectionsTransportType, String, String)] = [(.transit, "kollektiv", "Kollektiv + gå"), (.walking, "gå", "Gå"), (.automobile, "taxi", "Taxi")]
        for (t, mode, label) in types {
            let r: MKDirections.Request = MKDirections.Request()
            r.source = MKMapItem(placemark: MKPlacemark(coordinate: from))
            r.destination = MKMapItem(placemark: MKPlacemark(coordinate: to))
            r.transportType = t
            if let eta = try? await MKDirections(request: r).calculateETA() {
                let mins: Int = Int((eta.expectedTravelTime / 60).rounded(.up))
                out.append(Hjemlys40Option(mode: mode, label: label, legs: [], eta: eta.expectedArrivalDate, minutes: mins))
            }
            if t == .walking, let route = try? await MKDirections(request: r).calculate().routes.first {
                let n: Int = route.polyline.pointCount
                var pts: [CLLocationCoordinate2D] = Array(repeating: CLLocationCoordinate2D(latitude: 0, longitude: 0), count: n)
                route.polyline.getCoordinates(&pts, range: NSRange(location: 0, length: n))
                geometry = pts
            }
        }
        if let walk = out.first(where: { $0.mode == "gå" }) {
            let bike: Int = Swift.max(1, walk.minutes * 3 / 10)
            out.append(Hjemlys40Option(mode: "sykkel", label: "Sykkel", legs: [], eta: Date().addingTimeInterval(Double(bike) * 60), minutes: bike))
        }
        options = out.isEmpty ? Hjemlys40Route.fallback() : out
        if !options.contains(where: { $0.mode == picked }), let f = options.first { picked = f.mode }
    }

    nonisolated static func fallback() -> [Hjemlys40Option] {
        [Hjemlys40Option(mode: "gå", label: "Gå", legs: [], eta: Date().addingTimeInterval(30 * 60), minutes: 30)]
    }
}

/* ---------- Startsiden (1a dag / 1c natt) ---------- */

struct Hjemlys40StartPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    @MainActor private var r: Hjemlys40Route { Hjemlys40Route.shared }
    @State private var wait: Int = 15
    @State private var custom: Bool = false
    @State private var customEta: Date = Hjemlys40Time.rounded(Date().addingTimeInterval(30 * 60))

    var body: some View {
        let night: Bool = Hjemlys40Night.on(p)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                top(night)
                if night { Hjemlys40NightStart(wait: $wait) } else { Hjemlys40DayStart() }
                if !night { waitPicker }
                timeOverride(night)
                if !m.err.isEmpty { Text(m.err).font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#e0342a")) }
                startButton(night)
            }
            .padding(20)
        }
        .background((night ? Hjemlys40Night.bg : p.bg).ignoresSafeArea())
        .environment(\.colorScheme, night ? .dark : .light)
        .task { await r.load(store) }
    }

    private func top(_ night: Bool) -> some View {
        HStack {
            Button("Avbryt") { m.startOpen = false }.font(PF.ui(15, .semibold)).foregroundStyle(night ? Hjemlys40Night.mut : p.mut)
            Spacer()
            Text("Vel fremme").font(PF.ui(16, .bold)).foregroundStyle(night ? Hjemlys40Night.ink : p.ink)
            Spacer()
            Color.clear.frame(width: 52, height: 1)
        }
    }

    private var waitPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("VENT FØR FAMILIEN VARSLES").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
            Picker("Ventetid", selection: $wait) {
                Text("5 min").tag(5)
                Text("15 min").tag(15)
                Text("30 min").tag(30)
            }
            .pickerStyle(.segmented)
        }
    }

    private func timeOverride(_ night: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: $custom) {
                Text("Annen tid").font(PF.ui(14, .semibold)).foregroundStyle(night ? Hjemlys40Night.ink : p.ink)
            }
            if custom {
                DatePicker("Hjemme", selection: $customEta, in: Date()..., displayedComponents: [.hourAndMinute])
                    .font(PF.ui(15))
            }
        }
    }

    private var eta: Date { custom ? customEta : (r.selected?.eta ?? Date().addingTimeInterval(30 * 60)) }

    private func startButton(_ night: Bool) -> some View {
        Button {
            let o: Hjemlys40Option? = r.selected
            let leg: String = (o?.legs.isEmpty ?? true) ? (o?.label ?? "") : (o?.legs.joined(separator: " + ") ?? "")
            m.start(store, eta: eta, waitMin: wait, mode: o?.serverMode ?? "walk", leg: leg)
        } label: {
            HStack(spacing: 8) {
                if m.busy { ProgressView() }
                Text("Start · hjemme ca. " + Hjemlys40Look.clock(eta)).font(PF.ui(16, .bold))
            }
            .foregroundStyle(night ? Color(hex: "#0d1a12") : p.bg)
            .frame(maxWidth: .infinity).frame(height: night ? 60 : 52)
            .background(night ? Hjemlys40Look.green : p.ink, in: RoundedRectangle(cornerRadius: night ? 30 : 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(m.busy)
    }
}

/// 1a: kart med rute, «Fra … · 2,1 km», reisemåter og mottakere.
struct Hjemlys40DayStart: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    @MainActor private var r: Hjemlys40Route { Hjemlys40Route.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Hjemlys40Map(route: r.geometry, home: r.home, here: r.here)
                .frame(height: 170)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("SI FRA NÅR JEG ER HJEMME").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Text(r.toName).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                if !r.fromName.isEmpty || r.km > 0 {
                    Text(fromLine).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
            }
            if r.busy && r.options.isEmpty { ProgressView().frame(maxWidth: .infinity) }
            VStack(spacing: 0) {
                ForEach(Array(r.options.enumerated()), id: \.element.id) { i, o in
                    Button { Haptic30.light(); r.picked = o.mode } label: {
                        HStack(spacing: 10) {
                            Text(o.legs.isEmpty ? o.label : o.legs.joined(separator: " + ")).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text("ca. " + Hjemlys40Look.clock(o.eta)).font(PF.ui(13)).foregroundStyle(p.mut)
                            Text(r.picked == o.mode ? "✓" : "").font(PF.ui(14, .bold)).foregroundStyle(p.lab).frame(width: 16)
                        }
                        .padding(.horizontal, 14).frame(minHeight: 46)
                        .overlay(alignment: .top) { if i > 0 { Rectangle().fill(p.line).frame(height: 1) } }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if !r.err.isEmpty { Text(r.err).font(PF.ui(12.5)).foregroundStyle(p.mut) }
            HStack(spacing: 10) {
                Text("Får beskjed").font(PF.ui(13)).foregroundStyle(p.mut)
                Spacer()
                Text(names.isEmpty ? "Alle i husstanden" : names).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(2)
            }
        }
    }

    private var fromLine: String {
        let km: String = String(format: "%.1f", r.km).replacingOccurrences(of: ".", with: ",") + " km"
        return r.fromName.isEmpty ? km : "Fra " + r.fromName + " · " + km
    }

    private var names: String {
        Hjemlys40Model.names(FamilyModel.shared.members.filter { $0.id != FamilyModel.shared.meId }.map(\.name))
    }
}

/// 1c: mørk startside – reisemåter som store knapper, ventetid og hva som deles.
struct Hjemlys40NightStart: View {
    @MainActor private var r: Hjemlys40Route { Hjemlys40Route.shared }
    @Binding var wait: Int

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        VStack(alignment: .leading, spacing: 16) {
            Text("Hjem: " + r.toName + (r.km > 0 ? " · " + String(format: "%.1f", r.km).replacingOccurrences(of: ".", with: ",") + " km" : ""))
                .font(PF.ui(14)).foregroundStyle(Hjemlys40Night.mut)
            LazyVGrid(columns: cols, spacing: 8) {
                ForEach(r.options) { (o: Hjemlys40Option) in
                    let on: Bool = r.picked == o.mode
                    Button { Haptic30.light(); r.picked = o.mode } label: {
                        VStack(spacing: 2) {
                            Text(o.short).font(PF.ui(15, .bold))
                            Text(Hjemlys40Look.clock(o.eta)).font(PF.mono(13))
                        }
                        .foregroundStyle(on ? Color(hex: "#0d1a12") : Hjemlys40Night.ink)
                        .frame(maxWidth: .infinity).frame(height: 64)
                        .background(on ? Hjemlys40Look.green : Hjemlys40Night.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("VENTER LITT FØR VARSEL").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(Hjemlys40Night.mut)
                HStack(spacing: 8) {
                    ForEach([5, 15, 30], id: \.self) { (n: Int) in
                        Button { wait = n } label: {
                            Text("\(n) min").font(PF.ui(14, .bold))
                                .foregroundStyle(wait == n ? Color(hex: "#0d1a12") : Hjemlys40Night.ink)
                                .frame(maxWidth: .infinity).frame(height: 48)
                                .background(wait == n ? Hjemlys40Night.ink : Hjemlys40Night.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("DELES HVIS DU ER SEN").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(Hjemlys40Night.mut)
                ForEach(["Posisjon", "Rute", "Batteri og dekning", "Siste opplåsing", "Hvem du var med"], id: \.self) { (t: String) in
                    Text("✓ " + t).font(PF.ui(14)).foregroundStyle(Hjemlys40Night.ink)
                }
                Text("Ingenting deles før du eventuelt er sen.").font(PF.ui(12)).foregroundStyle(Hjemlys40Night.mut)
            }
        }
    }
}

/// MapKit-kartet med ruten (stiplet rød), Hjem og deg.
struct Hjemlys40Map: View {
    let route: [CLLocationCoordinate2D]
    let home: CLLocationCoordinate2D?
    let here: CLLocationCoordinate2D?

    var body: some View {
        Map(initialPosition: MapCameraPosition.automatic) {
            if route.count > 1 {
                MapPolyline(coordinates: route).stroke(Color(hex: "#b23a2a"), lineWidth: 4)
            }
            if let h = home {
                Marker("Hjem", systemImage: "house.fill", coordinate: h).tint(Color(hex: "#b23a2a"))
            }
            if let me = here {
                Marker("Her", systemImage: "location.fill", coordinate: me).tint(Color(hex: "#2b5d8a"))
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .id(route.count + (home == nil ? 0 : 1) + (here == nil ? 0 : 2))
    }
}

/* ---------- Aktiv økt (1a dag / 1c natt) ---------- */

struct Hjemlys40Active: View {
    @Environment(\.paper) private var p
    let s: Hjemlys40Session

    var body: some View {
        if Hjemlys40Night.on(p) && s.state != "home" {
            Hjemlys40NightActive(s: s)
        } else {
            Hjemlys40DayActive(s: s)
        }
    }
}

struct Hjemlys40DayActive: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    let s: Hjemlys40Session

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(color)
            Text(big).font(PF.serif(36, medium: true)).foregroundStyle(p.ink)
            if s.state != "home" {
                GeometryReader { (g: GeometryProxy) in
                    ZStack(alignment: .leading) {
                        Capsule().fill(p.line)
                        Capsule().fill(color).frame(width: Swift.max(6, g.size.width * CGFloat(s.progressNow)))
                    }
                }
                .frame(height: 6)
                VStack(spacing: 0) {
                    row("Følger med", Hjemlys40Model.names(s.recipients.isEmpty ? m.household.map(\.name) : s.recipients), first: true)
                    row("Deler nå", s.state == "late" ? "Posisjon, rute, batteri og dekning" : "Ingenting")
                    row("Hvis du er sen", "Etter \(s.waitMin) min får de siste posisjon, rute og batteri")
                }
                .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            } else {
                Text("Familien har fått beskjed. Deling er stoppet.").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            Hjemlys40Buttons40(s: s, night: false)
        }
    }

    private var color: Color {
        switch s.state {
        case "late": return Hjemlys40Look.red
        case "home": return Color(hex: "#a8661a")
        default: return Color(hex: "#2f7a4f")
        }
    }

    private var kicker: String {
        switch s.state {
        case "late": return "\(s.lateMinutes) MIN OVER · FAMILIEN HAR FÅTT BESKJED"
        case "home": return "HJEMME"
        default: return "PÅ VEI HJEM" + (s.leg.isEmpty ? "" : " · " + s.leg.uppercased())
        }
    }

    private var big: String {
        switch s.state {
        case "home": return Hjemlys40Look.clock(s.homeAt ?? Date()) + " ✓"
        default: return "ca. " + Hjemlys40Look.clock(s.eta)
        }
    }

    private func row(_ k: String, _ v: String, first: Bool = false) -> some View {
        HStack(alignment: .top) {
            Text(k).font(PF.ui(12.5)).foregroundStyle(p.mut).frame(width: 110, alignment: .leading)
            Text(v).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
    }
}

/// 1c: stor nedtellingsring «8:12 til 23:38».
struct Hjemlys40NightActive: View {
    let s: Hjemlys40Session

    var body: some View {
        VStack(spacing: 14) {
            Text(s.state == "late" ? "\(s.lateMinutes) MIN OVER" : "PÅ VEI HJEM").font(PF.mono(11)).tracking(1.3)
                .foregroundStyle(s.state == "late" ? Hjemlys40Look.red : Hjemlys40Look.green)
            Hjemlys40Ring(s: s).frame(width: 200, height: 200)
            if !s.leg.isEmpty { Text(s.leg).font(PF.ui(13)).foregroundStyle(Hjemlys40Night.mut) }
            Text(Hjemlys40Model.shared.recipientsText).font(PF.ui(13)).foregroundStyle(Hjemlys40Night.mut)
            Hjemlys40Buttons40(s: s, night: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(Hjemlys40Night.bg, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .environment(\.colorScheme, .dark)
    }
}

struct Hjemlys40Ring: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let s: Hjemlys40Session

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { (ctx: TimelineViewDefaultContext) in
            let left: Double = s.eta.timeIntervalSince(ctx.date)
            let total: Double = Swift.max(60, s.eta.timeIntervalSince(s.startedAt))
            let frac: Double = Swift.min(1, Swift.max(0, left / total))
            let late: Bool = left < 0 || s.state == "late"
            ZStack {
                Circle().stroke(Hjemlys40Night.card, lineWidth: 14)
                Circle().trim(from: 0, to: CGFloat(late ? 1 : frac))
                    .stroke(late ? Hjemlys40Look.red : Hjemlys40Look.green, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 2) {
                    Text(Hjemlys40Ring.mmss(abs(left))).font(.dyn51(size: 46, weight: .light)).monospacedDigit().foregroundStyle(Hjemlys40Night.ink)
                    Text(late ? "over tiden" : "til " + Hjemlys40Look.clock(s.eta)).font(PF.ui(13)).foregroundStyle(Hjemlys40Night.mut)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    nonisolated static func mmss(_ t: Double) -> String {
        let n: Int = Int(t)
        let h: Int = n / 3600
        let m: Int = (n % 3600) / 60
        let sec: Int = n % 60
        if h > 0 { return "\(h):" + String(format: "%02d:%02d", m, sec) }
        return "\(m):" + String(format: "%02d", sec)
    }
}

/// «+ 10 min» / «Jeg er hjemme» (eller «Alt OK» / «+ 15 min»), «Samtale med Glimt» og «Avslutt».
struct Hjemlys40Buttons40: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    let s: Hjemlys40Session
    let night: Bool

    var body: some View {
        VStack(spacing: 8) {
            if s.state == "late" {
                HStack(spacing: 8) {
                    big("Alt OK", primary: true) { m.ok(store) }
                    big("+ 15 min", primary: false) { m.plus(store, 15) }
                }
            } else if s.state == "onTheWay" {
                HStack(spacing: 8) {
                    big("+ 10 min", primary: false) { m.plus(store, 10) }
                    big("Jeg er hjemme", primary: true) { m.home(store) }
                }
            }
            if s.active {
                HStack(spacing: 14) {
                    Button { Hjemlys40Glimt.shared.open(s, store) } label: {
                        Text("✦ Samtale med Glimt").font(PF.ui(13, .semibold)).foregroundStyle(night ? Hjemlys40Night.ink : p.lab).frame(height: 34)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    Button { m.end(store) } label: {
                        Text("Avslutt").font(PF.ui(13, .semibold)).foregroundStyle(night ? Hjemlys40Night.mut : p.mut).frame(height: 34)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func big(_ t: String, primary: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(night ? 16 : 14, .bold))
                .foregroundStyle(primary ? (night ? Color(hex: "#0d1a12") : p.bg) : (night ? Hjemlys40Night.ink : p.ink))
                .frame(maxWidth: .infinity).frame(height: night ? 56 : 42)
                .background(primary ? (night ? Hjemlys40Look.green : p.ink) : (night ? Hjemlys40Night.card : p.bg), in: Capsule())
                .overlay(Capsule().strokeBorder(primary || night ? Color.clear : p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Mottakerens visning når noen er sen (1a: papir, 1c: rød alarmskjerm) ---------- */

struct Hjemlys40Alert: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    let h: Hjemlys40Member
    @State private var place: String = ""

    var body: some View {
        let night: Bool = Hjemlys40Night.on(p)
        let ink: Color = night ? Color.white : p.ink
        let mut: Color = night ? Color.white.opacity(0.75) : p.mut
        let sh: Hjemlys40Share? = h.share
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Spacer()
                    Button { m.alertMember = nil } label: {
                        Text("Lukk").font(PF.ui(15, .semibold)).foregroundStyle(mut).frame(height: 40)
                    }
                    .buttonStyle(.plain)
                }
                if night {
                    Text("KRITISK · BRYTER IKKE FORSTYRR").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(Color.white.opacity(0.8))
                }
                Text(night ? first + " er \(h.lateMinutes) min forsinket" : first + " er ikke hjemme ennå")
                    .font(PF.serif(32, medium: true)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
                Text("Ventet hjemme " + (h.eta.map { Hjemlys40Look.clock($0) } ?? "–") + ". Svarte ikke på «Alt OK?».")
                    .font(PF.ui(14)).foregroundStyle(mut).fixedSize(horizontal: false, vertical: true)
                if let c = sh?.coord, !night {
                    Hjemlys40Map(route: sh?.route ?? [], home: nil, here: c)
                        .frame(height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                VStack(spacing: 0) {
                    info("Siste posisjon", (place.isEmpty ? coordText(sh) : place) + (sh?.posAt.map { " · " + Hjemlys40Look.clock($0) } ?? ""), ink, mut, first: true)
                    info("Batteri · dekning", batteryText(sh), ink, mut)
                    info("Sist låst opp", sh?.unlockedAt.map { Hjemlys40Look.clock($0) } ?? "–", ink, mut)
                    info("Var med", withText(sh), ink, mut)
                    info("Ruten", routeText(sh), ink, mut)
                }
                .background(night ? Color.black.opacity(0.25) : p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                Hjemlys40AlertButtons(h: h, night: night)
            }
            .padding(20)
        }
        .background(background(night).ignoresSafeArea())
        .environment(\.colorScheme, night ? .dark : .light)
        .task { await geocode() }
    }

    private var first: String { String(h.name.split(separator: " ").first ?? Substring(h.name)) }

    @ViewBuilder private func background(_ night: Bool) -> some View {
        if night {
            LinearGradient(colors: [Color(hex: "#7a1410"), Color(hex: "#2a0f0d")], startPoint: .top, endPoint: .bottom)
        } else {
            p.bg
        }
    }

    private func info(_ k: String, _ v: String, _ ink: Color, _ mut: Color, first: Bool = false) -> some View {
        HStack(alignment: .top) {
            Text(k).font(PF.ui(12.5)).foregroundStyle(mut).frame(width: 120, alignment: .leading)
            Text(v).font(PF.ui(13.5, .semibold)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .overlay(alignment: .top) { if !first { Rectangle().fill(mut.opacity(0.25)).frame(height: 1) } }
    }

    private func coordText(_ s: Hjemlys40Share?) -> String {
        guard let la = s?.lat, let lo = s?.lon else { return "ukjent" }
        return String(format: "%.4f, %.4f", la, lo)
    }

    private func batteryText(_ s: Hjemlys40Share?) -> String {
        let b: String = s?.battery.map { "\($0) %" } ?? "–"
        let sig: String = s?.signal ?? ""
        return sig.isEmpty ? b : b + " · " + sig
    }

    private func withText(_ s: Hjemlys40Share?) -> String {
        guard let s else { return "–" }
        let ppl: String = s.withPeople.joined(separator: ", ")
        if ppl.isEmpty && s.withEvent.isEmpty { return "–" }
        if s.withEvent.isEmpty { return ppl }
        return ppl.isEmpty ? s.withEvent : ppl + " · " + s.withEvent
    }

    private func routeText(_ s: Hjemlys40Share?) -> String {
        guard let s, !s.route.isEmpty else { return "–" }
        let a: String = s.routeStart.map { Hjemlys40Look.clock($0) } ?? ""
        let b: String = s.routeEnd.map { Hjemlys40Look.clock($0) } ?? ""
        return "\(s.route.count) punkter" + (a.isEmpty ? "" : " · " + a + " → " + b + " (siste)")
    }

    private func geocode() async {
        guard let c = h.share?.coord else { return }
        if let pm = try? await CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: c.latitude, longitude: c.longitude)).first {
            let street: String = [pm.thoroughfare, pm.subThoroughfare].compactMap { $0 }.joined(separator: " ")
            place = street.isEmpty ? (pm.name ?? "") : street
        }
    }
}

struct Hjemlys40AlertButtons: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.paper) private var p
    let h: Hjemlys40Member
    let night: Bool

    var body: some View {
        VStack(spacing: 8) {
            pill("Ring " + String(h.name.split(separator: " ").first ?? Substring(h.name)), primary: true) {
                if let u = URL(string: "tel:" + h.phone.filter({ $0.isNumber || $0 == "+" })), !h.phone.isEmpty { openURL(u) }
            }
            .opacity(h.phone.isEmpty ? 0.5 : 1)
            pill("Åpne kart", primary: false) {
                guard let c = h.share?.coord else { return }
                let q: String = h.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
                if let u = URL(string: "maps://?ll=\(c.latitude),\(c.longitude)&q=" + q) { openURL(u) }
            }
            if night {
                pill("Ring 112", primary: false) { if let u = URL(string: "tel:112") { openURL(u) } }
            }
        }
    }

    private func pill(_ t: String, primary: Bool, _ act: @escaping () -> Void) -> some View {
        Button { Haptic30.light(); act() } label: {
            Text(t).font(PF.ui(16, .bold))
                .foregroundStyle(primary ? (night ? Color(hex: "#2a0f0d") : p.bg) : (night ? Color.white : p.ink))
                .frame(maxWidth: .infinity).frame(height: 54)
                .background(primary ? (night ? Color.white : p.ink) : (night ? Color.white.opacity(0.14) : p.card), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Vert (legges i PaperShell): start, mottakerskjerm og Glimt-samtalen virker fra alle sider ---------- */

struct Hjemlys40Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    @MainActor private var g: Hjemlys40Glimt { Hjemlys40Glimt.shared }

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: Binding<Bool>(get: { m.startOpen }, set: { (v: Bool) in m.startOpen = v })) {
                Hjemlys40StartPage().environment(\.paper, p).environment(store).presentationDetents([.large])
            }
            .fullScreenCover(item: Binding<Hjemlys40Member?>(get: { m.alertMember }, set: { (v: Hjemlys40Member?) in m.alertMember = v })) { (h: Hjemlys40Member) in
                Hjemlys40Alert(h: h).environment(\.paper, p).environment(store)
            }
            .sheet(isPresented: Binding<Bool>(get: { g.chatOpen }, set: { (v: Bool) in g.chatOpen = v })) {
                Hjemlys40ChatSheet().environment(\.paper, p).environment(store).presentationDetents([.large])
            }
            .task { Hjemlys40Glimt.consumeAccept(store) }
    }
}

extension View {
    func hjemlys40Host(_ p: PaperPalette) -> some View { modifier(Hjemlys40Host(p: p)) }
}

/* ---------- Hjem-kortet (h14) ---------- */

struct Hjemlys40HomeCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Hjemlys40Dot(size: 16, state: m.mine?.state ?? "onTheWay")
                Text("VEL FREMME").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                Spacer()
                Button { store.paperGo("familie") } label: {
                    Text("Familie ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
                }
                .buttonStyle(.plain)
            }
            if let s = m.mine, s.active {
                Text(s.state == "late" ? "\(s.lateMinutes) min over" : "På vei hjem · " + Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(s.eta.timeIntervalSince1970)))
                    .font(PF.serif(22, medium: true)).foregroundStyle(s.state == "late" ? Hjemlys40Look.red : p.ink)
                Hjemlys40Buttons40(s: s, night: false)
            } else if m.suggest {
                Hjemlys40Suggest()
            } else {
                Button { Haptic30.light(); store.paperGo("familie"); FamilyModel.shared.tab = "hjemlys"; Fam50Nav.shared.openVelFremme() } label: {
                    Text("Start Vel fremme").font(PF.ui(14.5, .bold)).foregroundStyle(p.bg)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(p.ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            ForEach(m.household.filter { $0.active || $0.state == "home" }) { (h: Hjemlys40Member) in
                Hjemlys40MemberRow(h: h)
                    .contentShape(Rectangle())
                    .onTapGesture { if h.state == "late" { m.alertMember = h } }
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .task { await m.load(store) }
    }
}

/* ---------- Widgeten: appen skriver det widgeten viser ---------- */

enum Hjemlys40Widget {
    static let kind: String = "no.kristo.finanshub.hjemlys40"

    @MainActor static func save(mine: Hjemlys40Session?, household: [Hjemlys40Member]) {
        var c: Hjemlys40Cache = Hjemlys40Cache()
        c.at = Date().timeIntervalSince1970
        if let s = mine {
            c.mineId = s.id
            c.mineState = s.state
            c.mineEta = s.eta.timeIntervalSince1970
            c.mineStart = s.startedAt.timeIntervalSince1970
        }
        c.household = household.map { (h: Hjemlys40Member) -> Hjemlys40CacheMember in
            Hjemlys40CacheMember(name: h.name, state: h.state, eta: h.eta?.timeIntervalSince1970 ?? 0)
        }
        c.recipients = Hjemlys40Model.shared.recipientsText
        let old: Hjemlys40Cache = Hjemlys40Cache.cached
        Hjemlys40Cache.write(c)
        if old.mineState != c.mineState || old.household.map(\.state) != c.household.map(\.state) {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
    }
}
