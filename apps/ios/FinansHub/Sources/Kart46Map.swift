import SwiftUI
import UIKit
import MapKit

/* ---------------- Prompt 46: Kart – MKMapView med Kartverket gråtone (topograatone, WMTS webmercator) ----------------
 Dra for å flytte, knip for zoom (11–18). Holdeplasser (prikk per transportmiddel, navn fra zoom 16), mine soner (sirkel med
 radius, heltrukket kant og LIVE når sanntid er på), personer («Du» pulserer) og kjøretøy (linjenummer i modusfarge med
 retningspil, glir mellom posisjonene over pollintervallet; «Reduser bevegelse»: hopper direkte). */

final class Kart46Pin: NSObject, MKAnnotation {
    let key: String
    let kind: String
    @objc dynamic var coordinate: CLLocationCoordinate2D
    var title: String?
    var color: UIColor
    var label: String
    var bearing: Double?
    var live: Bool = false

    init(key: String, kind: String, coordinate: CLLocationCoordinate2D, title: String, color: UIColor, label: String, bearing: Double? = nil) {
        self.key = key
        self.kind = kind
        self.coordinate = coordinate
        self.title = title
        self.color = color
        self.label = label
        self.bearing = bearing
    }
}

final class Kart46ZoneCircle: MKCircle {
    var color: UIColor = .systemBlue
    var live: Bool = false
}

struct Kart46MapView: UIViewRepresentable {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Kart46 { Kart46.shared }

    func makeCoordinator() -> Kart46MapCoordinator { Kart46MapCoordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let v: MKMapView = MKMapView(frame: .zero)
        v.delegate = context.coordinator
        v.showsUserLocation = false
        v.pointOfInterestFilter = .excludingAll
        v.showsCompass = false
        v.isRotateEnabled = false
        v.isPitchEnabled = false
        let tiles: MKTileOverlay = MKTileOverlay(urlTemplate: Kart46.tileURL)
        tiles.canReplaceMapContent = true
        tiles.minimumZ = 3
        tiles.maximumZ = 18
        v.addOverlay(tiles, level: .aboveLabels)
        // Zoom 11–18 (avstand fra bakken).
        v.cameraZoomRange = MKMapView.CameraZoomRange(minCenterCoordinateDistance: 250, maxCenterCoordinateDistance: 60_000)
        let s: Double = Kart46.span(m.zoom)
        v.setRegion(MKCoordinateRegion(center: m.center, span: MKCoordinateSpan(latitudeDelta: s * 0.5, longitudeDelta: s)), animated: false)
        context.coordinator.store = store
        return v
    }

    func updateUIView(_ v: MKMapView, context: Context) {
        let c: Kart46MapCoordinator = context.coordinator
        c.store = store
        c.reduce = reduce
        if c.fly != m.fly, let to = m.flyTo {
            c.fly = m.fly
            let s: Double = Kart46.span(m.flyZoom)
            v.setRegion(MKCoordinateRegion(center: to, span: MKCoordinateSpan(latitudeDelta: s * 0.5, longitudeDelta: s)), animated: c.ready && !reduce)
        }
        c.sync(v, pins: pins, zones: m.showZones ? m.zones : [])
    }

    /// Alle punkter på kartet (holdeplasser, personer, kjøretøy og sonenavn).
    private var pins: [Kart46Pin] {
        var out: [Kart46Pin] = []
        for s in m.visibleStops {
            let mode: String = s.modes.first { m.md.contains($0) } ?? s.modes.first ?? "bus"
            out.append(Kart46Pin(key: "s:" + s.id, kind: "stop", coordinate: CLLocationCoordinate2D(latitude: s.lat, longitude: s.lon),
                                 title: s.name, color: UIColor(Kart46.color(mode)), label: m.zoom >= 16 ? s.name : ""))
        }
        if m.showZones {
            for z in m.zones {
                let p: Kart46Pin = Kart46Pin(key: "z:" + z.id, kind: "zone", coordinate: CLLocationCoordinate2D(latitude: z.lat, longitude: z.lon),
                                             title: z.name, color: UIColor(Color(hex: z.color)), label: z.name + (z.live ? " · LIVE" : ""))
                p.live = z.live
                out.append(p)
            }
        }
        if m.showPeople {
            for pe in m.people {
                out.append(Kart46Pin(key: "p:" + pe.id, kind: pe.me ? "me" : "person", coordinate: CLLocationCoordinate2D(latitude: pe.lat, longitude: pe.lon),
                                     title: pe.name, color: UIColor(Color(hex: pe.color)), label: String(pe.name.prefix(1)).uppercased()))
            }
        }
        for ve in m.visibleVehicles {
            out.append(Kart46Pin(key: "v:" + ve.id, kind: "vehicle", coordinate: CLLocationCoordinate2D(latitude: ve.lat, longitude: ve.lon),
                                 title: ve.line + (ve.destination.isEmpty ? "" : " " + ve.destination), color: UIColor(Kart46.color(ve.mode)),
                                 label: ve.line, bearing: ve.bearing))
        }
        return out
    }
}

@MainActor
final class Kart46MapCoordinator: NSObject, MKMapViewDelegate {
    var store: Store? = nil
    var fly: Int = 0
    var ready: Bool = false
    var reduce: Bool = false
    private var pins: [String: Kart46Pin] = [:]
    private var circles: [String: Kart46ZoneCircle] = [:]

    func sync(_ v: MKMapView, pins next: [Kart46Pin], zones: [Kart46Zone]) {
        var seen: Set<String> = []
        for p in next {
            seen.insert(p.key)
            if let cur = pins[p.key] {
                let moved: Bool = abs(cur.coordinate.latitude - p.coordinate.latitude) > 0.000001 || abs(cur.coordinate.longitude - p.coordinate.longitude) > 0.000001
                let changed: Bool = cur.label != p.label || cur.bearing != p.bearing || cur.live != p.live
                if moved {
                    if p.kind == "vehicle" && !reduce {
                        UIView.animate(withDuration: 9.5, delay: 0, options: [.curveLinear, .allowUserInteraction]) { cur.coordinate = p.coordinate }
                    } else {
                        cur.coordinate = p.coordinate
                    }
                }
                if changed {
                    cur.label = p.label
                    cur.bearing = p.bearing
                    cur.live = p.live
                    if let view = v.view(for: cur) { view.image = Kart46MapCoordinator.image(cur) }
                }
            } else {
                pins[p.key] = p
                v.addAnnotation(p)
            }
        }
        let gone: [Kart46Pin] = pins.filter { !seen.contains($0.key) }.map { $0.value }
        if !gone.isEmpty {
            v.removeAnnotations(gone)
            for g in gone { pins.removeValue(forKey: g.key) }
        }
        // Soner som sirkler (heltrukket kant når sanntid er på).
        var zs: Set<String> = []
        for z in zones {
            let key: String = z.id + "|" + String(z.live) + "|" + String(Int(z.radius))
            zs.insert(key)
            if circles[key] == nil {
                let c: Kart46ZoneCircle = Kart46ZoneCircle(center: CLLocationCoordinate2D(latitude: z.lat, longitude: z.lon), radius: z.radius)
                c.color = UIColor(Color(hex: z.color))
                c.live = z.live
                circles[key] = c
                v.addOverlay(c, level: .aboveLabels)
            }
        }
        for (k, c) in circles where !zs.contains(k) {
            v.removeOverlay(c)
            circles.removeValue(forKey: k)
        }
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        if let t = overlay as? MKTileOverlay { return MKTileOverlayRenderer(tileOverlay: t) }
        if let c = overlay as? Kart46ZoneCircle {
            let r: MKCircleRenderer = MKCircleRenderer(circle: c)
            r.fillColor = c.color.withAlphaComponent(0.12)
            r.strokeColor = c.color
            r.lineWidth = 2
            if !c.live { r.lineDashPattern = [6, 5] }
            return r
        }
        return MKOverlayRenderer(overlay: overlay)
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let p = annotation as? Kart46Pin else { return nil }
        let id: String = "k46-" + p.kind
        let v: MKAnnotationView = mapView.dequeueReusableAnnotationView(withIdentifier: id) ?? MKAnnotationView(annotation: p, reuseIdentifier: id)
        v.annotation = p
        v.image = Kart46MapCoordinator.image(p)
        v.canShowCallout = false
        v.displayPriority = p.kind == "stop" ? .defaultLow : .required
        v.zPriority = p.kind == "vehicle" ? .max : (p.kind == "zone" ? .min : .defaultUnselected)
        if p.kind == "me" { Kart46MapCoordinator.pulse(v) } else { v.layer.removeAnimation(forKey: "k46pulse") }
        return v
    }

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        guard let p = view.annotation as? Kart46Pin, let store else { return }
        mapView.deselectAnnotation(p, animated: false)
        let m: Kart46 = Kart46.shared
        if p.kind == "stop", let s = m.stops.first(where: { "s:" + $0.id == p.key }) { m.select(s, store) }
    }

    func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        ready = true
        guard let store else { return }
        Kart46.shared.regionChanged(mapView.region, store)
    }

    /* ---------- Tegning av merkene ---------- */

    static func image(_ p: Kart46Pin) -> UIImage {
        switch p.kind {
        case "vehicle": return vehicle(p.label, p.color, p.bearing)
        case "zone": return tag(p.label, p.color, live: p.live)
        case "me", "person": return person(p.label, p.color, me: p.kind == "me")
        default: return stop(p.color, p.label)
        }
    }

    private static func stop(_ c: UIColor, _ name: String) -> UIImage {
        let font: UIFont = UIFont.systemFont(ofSize: 11, weight: .semibold)
        let tw: CGFloat = name.isEmpty ? 0 : (name as NSString).size(withAttributes: [.font: font]).width + 8
        let size: CGSize = CGSize(width: 14 + tw, height: 14)
        return UIGraphicsImageRenderer(size: size).image { (ctx: UIGraphicsImageRendererContext) in
            let r: CGRect = CGRect(x: 1, y: 1, width: 12, height: 12)
            UIColor.white.setFill()
            ctx.cgContext.fillEllipse(in: r.insetBy(dx: -1, dy: -1))
            c.setFill()
            ctx.cgContext.fillEllipse(in: r.insetBy(dx: 1.5, dy: 1.5))
            if !name.isEmpty {
                let a: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor(white: 0.12, alpha: 1), .strokeColor: UIColor.white, .strokeWidth: -3]
                (name as NSString).draw(at: CGPoint(x: 18, y: -0.5), withAttributes: a)
            }
        }
    }

    private static func vehicle(_ line: String, _ c: UIColor, _ bearing: Double?) -> UIImage {
        let font: UIFont = UIFont.systemFont(ofSize: 11.5, weight: .heavy)
        let tw: CGFloat = Swift.max(18, (line as NSString).size(withAttributes: [.font: font]).width + 10)
        let size: CGSize = CGSize(width: tw + 16, height: 38)
        return UIGraphicsImageRenderer(size: size).image { (ctx: UIGraphicsImageRendererContext) in
            let box: CGRect = CGRect(x: 8, y: 10, width: tw, height: 18)
            if let b = bearing {
                let cx: CGFloat = size.width / 2, cy: CGFloat = size.height / 2
                let rad: CGFloat = CGFloat((b - 90) * .pi / 180)
                let tip: CGPoint = CGPoint(x: cx + cos(rad) * 18, y: cy + sin(rad) * 18)
                let l: CGPoint = CGPoint(x: cx + cos(rad + 0.5) * 11, y: cy + sin(rad + 0.5) * 11)
                let r: CGPoint = CGPoint(x: cx + cos(rad - 0.5) * 11, y: cy + sin(rad - 0.5) * 11)
                let path: UIBezierPath = UIBezierPath()
                path.move(to: tip); path.addLine(to: l); path.addLine(to: r); path.close()
                c.setFill()
                path.fill()
            }
            let pill: UIBezierPath = UIBezierPath(roundedRect: box, cornerRadius: 9)
            c.setFill()
            pill.fill()
            UIColor.white.setStroke()
            pill.lineWidth = 1.5
            pill.stroke()
            let a: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
            let ts: CGSize = (line as NSString).size(withAttributes: a)
            (line as NSString).draw(at: CGPoint(x: box.midX - ts.width / 2, y: box.midY - ts.height / 2), withAttributes: a)
            _ = ctx
        }
    }

    private static func person(_ initial: String, _ c: UIColor, me: Bool) -> UIImage {
        let size: CGSize = CGSize(width: 34, height: 34)
        return UIGraphicsImageRenderer(size: size).image { (ctx: UIGraphicsImageRendererContext) in
            let r: CGRect = CGRect(x: 3, y: 3, width: 28, height: 28)
            UIColor.white.setFill()
            ctx.cgContext.fillEllipse(in: r.insetBy(dx: -2, dy: -2))
            c.setFill()
            ctx.cgContext.fillEllipse(in: r)
            let text: String = me ? "Du" : initial
            let font: UIFont = UIFont.systemFont(ofSize: me ? 10.5 : 13, weight: .bold)
            let a: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
            let ts: CGSize = (text as NSString).size(withAttributes: a)
            (text as NSString).draw(at: CGPoint(x: r.midX - ts.width / 2, y: r.midY - ts.height / 2), withAttributes: a)
        }
    }

    private static func tag(_ text: String, _ c: UIColor, live: Bool) -> UIImage {
        let font: UIFont = UIFont.systemFont(ofSize: 11, weight: .bold)
        let a: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
        let ts: CGSize = (text as NSString).size(withAttributes: a)
        let size: CGSize = CGSize(width: ts.width + 16, height: 22)
        return UIGraphicsImageRenderer(size: size).image { (_: UIGraphicsImageRendererContext) in
            let p: UIBezierPath = UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 11)
            c.withAlphaComponent(live ? 1 : 0.85).setFill()
            p.fill()
            (text as NSString).draw(at: CGPoint(x: 8, y: (size.height - ts.height) / 2), withAttributes: a)
        }
    }

    private static func pulse(_ v: MKAnnotationView) {
        if UIAccessibility.isReduceMotionEnabled { return }
        if v.layer.animation(forKey: "k46pulse") != nil { return }
        let a: CABasicAnimation = CABasicAnimation(keyPath: "transform.scale")
        a.fromValue = 1
        a.toValue = 1.12
        a.duration = 1.1
        a.autoreverses = true
        a.repeatCount = .infinity
        v.layer.add(a, forKey: "k46pulse")
    }
}
