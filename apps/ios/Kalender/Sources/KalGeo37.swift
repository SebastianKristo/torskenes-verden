import Foundation
import MapKit
import SwiftUI

/* ---------------- Prompt 37: adresse og kart (iPhone og Mac – filen ligger også i KalenderMac-targeten) ---------------- */
// Fasit: Kalender App.dc.html → geoFor(), mapOf(), detaljarket (dt.map) og Glimt-kortene (c.hasMap).
// Rekkefølge: serverens koordinater (address + map {lat, lon}) → cachen → Apple MapKit-søk (nær Oslo) → Nominatim.
// Treff lagres permanent; bomtreff {fail} prøves igjen etter 1 t. Uten treff: bare tekst, intet kart.

@MainActor
final class KalGeo37: ObservableObject {
    static let shared: KalGeo37 = KalGeo37()

    /// Økes når et oppslag er ferdig (visningene tegnes på nytt).
    @Published var rev: Int = 0
    private var inFlight: Set<String> = []

    /// Stedet som slås opp for hendelsen (full adresse når serveren har den).
    static func place(_ e: KalEvent) -> String {
        let a: String = (e.address ?? "").trimmingCharacters(in: .whitespaces)
        return a.isEmpty ? e.loc.trimmingCharacters(in: .whitespaces) : a
    }

    /// Treff for hendelsen, eller nil (ukjent slås opp i bakgrunnen).
    func hit(_ e: KalEvent) -> KalGeoHit37? {
        if let la = e.lat, let lo = e.lon {
            let label: String = (e.address ?? "").isEmpty ? e.loc : (e.address ?? e.loc)
            return KalGeoHit37(la: la, lo: lo, a: label, fail: nil)
        }
        let p: String = KalGeo37.place(e)
        if p.count < 3 { return nil }
        return hit(p)
    }

    func hit(_ loc: String) -> KalGeoHit37? {
        let r: (hit: KalGeoHit37?, retry: Bool) = KalGeoCache37.lookup(loc)
        if let h = r.hit { return h }
        if r.retry { request(loc) }
        return nil
    }

    func request(_ loc: String) {
        let k: String = KalGeoCache37.norm(loc)
        if k.isEmpty || inFlight.contains(k) { return }
        inFlight.insert(k)
        Task { @MainActor in
            let h: KalGeoHit37 = await KalGeo37.resolve(loc)
            KalGeoCache37.store(loc, h)
            self.inFlight.remove(k)
            self.rev += 1
        }
    }

    /// Slår opp stedet (forsøkene i rekkefølge). Bom → {fail: nå}.
    static func resolve(_ loc: String) async -> KalGeoHit37 {
        let tries: [String] = KalGeoCache37.tries(loc)
        for q in tries {
            if let h = await apple(q, original: loc) { return h }
        }
        for q in tries {
            if let h = await nominatim(q, original: loc) { return h }
        }
        return KalGeoHit37(la: nil, lo: nil, a: nil, fail: Date().timeIntervalSince1970)
    }

    private static let oslo: CLLocation = CLLocation(latitude: 59.9139, longitude: 10.7522)

    /// Apple MapKit-søk rundt Oslo (steder og adresser). Treff lenger unna enn 150 km regnes som bom.
    static func apple(_ q: String, original: String) async -> KalGeoHit37? {
        let r: MKLocalSearch.Request = MKLocalSearch.Request()
        r.naturalLanguageQuery = q
        r.region = MKCoordinateRegion(center: oslo.coordinate, latitudinalMeters: 60_000, longitudinalMeters: 60_000)
        r.resultTypes = [.address, .pointOfInterest]
        let search: MKLocalSearch = MKLocalSearch(request: r)
        guard let resp = try? await search.start() else { return nil }
        for item in resp.mapItems {
            let pm: MKPlacemark = item.placemark
            let c: CLLocationCoordinate2D = pm.coordinate
            let d: CLLocationDistance = CLLocation(latitude: c.latitude, longitude: c.longitude).distance(from: oslo)
            if d > 150_000 { continue }
            let area: String? = pm.subLocality ?? pm.locality
            let label: String = KalGeoCache37.label(road: pm.thoroughfare, number: pm.subThoroughfare, area: area, name: item.name, fallback: original)
            return KalGeoHit37(la: round5(c.latitude), lo: round5(c.longitude), a: label, fail: nil)
        }
        return nil
    }

    /// Nominatim (OpenStreetMap) som reserve, Norge, norsk.
    static func nominatim(_ q: String, original: String) async -> KalGeoHit37? {
        let enc: String = q.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? q
        guard let url = URL(string: "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=no&accept-language=nb&q=" + enc) else { return nil }
        var req: URLRequest = URLRequest(url: url)
        req.timeoutInterval = 12
        req.setValue("Kalender/4 (Homelab; kristo.no)", forHTTPHeaderField: "User-Agent")
        guard let pair = try? await URLSession.shared.data(for: req) else { return nil }
        guard let arr = (try? JSONSerialization.jsonObject(with: pair.0)) as? [[String: Any]], let x = arr.first else { return nil }
        let la: Double? = Double((x["lat"] as? String) ?? "")
        let lo: Double? = Double((x["lon"] as? String) ?? "")
        guard let la, let lo else { return nil }
        let ad: [String: Any] = (x["address"] as? [String: Any]) ?? [:]
        let keys: [String] = ["suburb", "neighbourhood", "quarter", "city_district", "city", "town", "village"]
        var area: String? = nil
        for k in keys {
            if let v = ad[k] as? String, !v.isEmpty {
                area = v
                break
            }
        }
        let road: String? = (ad["road"] as? String) ?? (ad["pedestrian"] as? String)
        let label: String = KalGeoCache37.label(road: road, number: ad["house_number"] as? String, area: area, name: x["name"] as? String, fallback: original)
        return KalGeoHit37(la: round5(la), lo: round5(lo), a: label, fail: nil)
    }

    private static func round5(_ v: Double) -> Double { (v * 100_000).rounded() / 100_000 }
}

/* ---------- Kartet (ikke interaktivt; trykk håndteres av den som viser det) ---------- */

struct KalMap37View: View {
    let la: Double
    let lo: Double
    let height: CGFloat
    let radius: CGFloat

    var body: some View {
        core
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .allowsHitTesting(false)
            .id(String(la) + "," + String(lo))
            .accessibilityHidden(true)
    }

    @ViewBuilder private var core: some View {
        #if os(macOS)
        if #available(macOS 14.0, *) {
            KalMap37Modern(la: la, lo: lo)
        } else {
            KalMap37Legacy(la: la, lo: lo)
        }
        #else
        KalMap37Modern(la: la, lo: lo)
        #endif
    }
}

@available(iOS 17.0, macOS 14.0, *)
struct KalMap37Modern: View {
    let la: Double
    let lo: Double

    var body: some View {
        let c: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: la, longitude: lo)
        let cam: MapCamera = MapCamera(centerCoordinate: c, distance: 900)
        Map(initialPosition: MapCameraPosition.camera(cam), interactionModes: []) {
            Marker("", coordinate: c).tint(Color(kalHex: "#b23a2a"))
        }
    }
}

#if os(macOS)
/// macOS 13: MKMapView (SwiftUI-kartet med Marker krever macOS 14).
struct KalMap37Legacy: NSViewRepresentable {
    let la: Double
    let lo: Double

    func makeNSView(context: Context) -> MKMapView {
        let m: MKMapView = MKMapView()
        m.isZoomEnabled = false
        m.isScrollEnabled = false
        m.isRotateEnabled = false
        m.isPitchEnabled = false
        return m
    }

    func updateNSView(_ m: MKMapView, context: Context) {
        let c: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: la, longitude: lo)
        m.setRegion(MKCoordinateRegion(center: c, latitudinalMeters: 700, longitudinalMeters: 700), animated: false)
        m.removeAnnotations(m.annotations)
        let p: MKPointAnnotation = MKPointAnnotation()
        p.coordinate = c
        m.addAnnotation(p)
    }
}
#endif
