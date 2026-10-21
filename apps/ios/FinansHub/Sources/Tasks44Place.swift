import SwiftUI
import MapKit
import CoreLocation

/* ---------------- Prompt 44: Gjøremål – STED med forslag og kart ----------------
 Fasit: Huskeliste.dc.html (STED-kortet nederst) og claude-code-gjoremal-infoside.md «Frist / Når virker + sted med kart».
 Kartnål + «Legg til sted eller adresse». Forslag mens man skriver: GET /api/geo/address?q= (Kartverket, deretter OSM, med
 cache på serveren) → [{label, street, postcode, city, lat, lon}]. Eldre server (404): Apple Maps-søk på telefonen.
 Trykk lagrer pl + geo. Kart (MapKit, 210 pt) med nål, og knappene «Åpne i Kart» og «Google Maps».
 Har oppgaven et sted uten koordinater («Toten»), slås det opp automatisk første gang («Finner stedet på kartet …»). */

struct Geo44Hit: Identifiable, Hashable {
    var id: String { label + "\(lat),\(lon)" }
    var label: String
    var sub: String = ""
    var lat: Double
    var lon: Double
}

@MainActor
enum Geo44 {
    /// Adresseforslag (server først, så Apple Maps på telefonen).
    static func search(_ q: String, _ store: Store) async -> [Geo44Hit] {
        let t: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count < 3 { return [] }
        let enc: String = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
        if let d = try? await store.api.callAt("/api", "GET", "/geo/address?q=" + enc, timeout: 8) {
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            if rows.isEmpty { rows = JS.list(any as? [String: Any], "results") + JS.list(any as? [String: Any], "items") }
            let hits: [Geo44Hit] = rows.compactMap { Geo44.hit($0) }
            if !hits.isEmpty { return hits }
        }
        return await local(t)
    }

    nonisolated static func hit(_ r: [String: Any]) -> Geo44Hit? {
        guard let la = JS.num(r, "lat"), let lo = JS.num(r, "lon") ?? JS.num(r, "lng") else { return nil }
        let city: String = [JS.str(r, "postcode") ?? "", JS.str(r, "city") ?? ""].filter { !$0.isEmpty }.joined(separator: " ")
        let label: String = JS.str(r, "label") ?? JS.str(r, "street") ?? city
        return Geo44Hit(label: label, sub: label.contains(city) ? "" : city, lat: la, lon: lo)
    }

    static func local(_ q: String) async -> [Geo44Hit] {
        let req: MKLocalSearch.Request = MKLocalSearch.Request()
        req.naturalLanguageQuery = q
        req.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 61.5, longitude: 10.5),
                                        span: MKCoordinateSpan(latitudeDelta: 14, longitudeDelta: 14))
        guard let res = try? await MKLocalSearch(request: req).start() else { return [] }
        return res.mapItems.prefix(6).map { (it: MKMapItem) -> Geo44Hit in
            let pm: MKPlacemark = it.placemark
            let street: String = [pm.thoroughfare ?? "", pm.subThoroughfare ?? ""].filter { !$0.isEmpty }.joined(separator: " ")
            let city: String = [pm.postalCode ?? "", pm.locality ?? ""].filter { !$0.isEmpty }.joined(separator: " ")
            let name: String = it.name ?? street
            return Geo44Hit(label: name, sub: [street == name ? "" : street, city].filter { !$0.isEmpty }.joined(separator: ", "),
                            lat: pm.coordinate.latitude, lon: pm.coordinate.longitude)
        }
    }
}

struct Tasks44PlaceCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let t: TaskItem17
    let save: (String, [Double]) -> Void
    @State private var q: String = ""
    @State private var hits: [Geo44Hit] = []
    @State private var finding: Bool = false
    @State private var searchTask: Task<Void, Never>? = nil
    @FocusState private var focus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("STED").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
            field
            if focus && !hits.isEmpty { Tasks44PlaceHits(hits: hits) { pick($0) } }
            if finding { Text("Finner stedet på kartet …").font(PF.ui(12.5)).foregroundStyle(p.mut) }
            if t.geo44.count == 2 { Tasks44PlaceMap(name: t.place, lat: t.geo44[0], lon: t.geo44[1]) }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .onAppear { q = t.place }
        .task(id: t.id) { await autoLocate() }
    }

    private var field: some View {
        HStack(spacing: 10) {
            Image(systemName: "mappin.and.ellipse").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color(hex: "#b23a2a"))
            TextField("Legg til sted eller adresse", text: $q)
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .focused($focus)
                .submitLabel(.search)
                .onChange(of: q) { (_: String, v: String) in changed(v) }
                .onSubmit { if let h = hits.first { pick(h) } else { save(q, []) } }
            if !q.isEmpty {
                Button { q = ""; hits = []; save("", []) } label: {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut)
                        .frame(width: 36, height: 36).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Fjern stedet")
            }
        }
    }

    private func changed(_ v: String) {
        searchTask?.cancel()
        if !focus { return }
        searchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            if Task.isCancelled { return }
            let r: [Geo44Hit] = await Geo44.search(v, store)
            if !Task.isCancelled { hits = r }
        }
    }

    private func pick(_ h: Geo44Hit) {
        Haptics.shared.select()
        q = h.label
        hits = []
        focus = false
        save(h.label, [h.lat, h.lon])
    }

    /// Sted uten koordinater: slå opp én gang og lagre.
    private func autoLocate() async {
        guard !t.place.isEmpty, t.geo44.count != 2 else { return }
        finding = true
        let r: [Geo44Hit] = await Geo44.search(t.place, store)
        finding = false
        if let h = r.first { save(t.place, [h.lat, h.lon]) }
    }
}

struct Tasks44PlaceHits: View {
    @Environment(\.paper) private var p
    let hits: [Geo44Hit]
    let pick: (Geo44Hit) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(hits) { (h: Geo44Hit) in
                Button { pick(h) } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(h.label).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        if !h.sub.isEmpty { Text(h.sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1) }
                    }
                    .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Kartet (210 pt) med nål og «Åpne i Kart» / «Google Maps».
struct Tasks44PlaceMap: View {
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    let name: String
    let lat: Double
    let lon: Double

    var body: some View {
        let c: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        VStack(spacing: 8) {
            Map(initialPosition: .region(MKCoordinateRegion(center: c, latitudinalMeters: 900, longitudinalMeters: 900))) {
                Marker(name.isEmpty ? "Sted" : name, coordinate: c).tint(Color(hex: "#b23a2a"))
            }
            .id("\(lat),\(lon)")
            .frame(height: 210)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            HStack(spacing: 8) {
                link("Åpne i Kart", Tasks44PlaceMap.apple(name, lat, lon))
                link("Google Maps", Tasks44PlaceMap.google(lat, lon))
            }
        }
    }

    private func link(_ title: String, _ u: URL?) -> some View {
        Button { if let u { openURL(u) } } label: {
            Text(title).font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(p.bg, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    static func apple(_ name: String, _ lat: Double, _ lon: Double) -> URL? {
        let q: String = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://maps.apple.com/?ll=\(lat),\(lon)&q=\(q)")
    }

    static func google(_ lat: Double, _ lon: Double) -> URL? {
        URL(string: "https://www.google.com/maps/search/?api=1&query=\(lat),\(lon)")
    }
}
