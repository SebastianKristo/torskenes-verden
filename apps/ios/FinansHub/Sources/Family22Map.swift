import SwiftUI
import UIKit
import MapKit
import CoreLocation

/* ---------------- Prompt 22: kartet i Familie (Kartverket topo via /tiles, MKMapView) ---------------- */

/// Kartverket topo via serverens kartproxy. Innloggingen sendes som Bearer-header.
final class Fam22TileOverlay: MKTileOverlay {
    var base: String = ""
    var token: String? = nil

    override func url(forTilePath path: MKTileOverlayPath) -> URL {
        let b: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(b)/tiles/topo/\(path.z)/\(path.x)/\(path.y).png") ?? URL(fileURLWithPath: "/")
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, Error?) -> Void) {
        var r: URLRequest = URLRequest(url: url(forTilePath: path))
        r.timeoutInterval = 20
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        URLSession.shared.dataTask(with: r) { data, res, err in
            let code: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
            if code == 200, let data { result(data, nil) } else { result(nil, err ?? URLError(.badServerResponse)) }
        }.resume()
    }
}

/// Markør på kartet: personpin, soneikon eller sonenavn. Bildet tegnes på forhånd.
final class Fam22Ann: NSObject, MKAnnotation {
    let coordinate: CLLocationCoordinate2D
    let kind: String
    let refId: String
    let image: UIImage?
    let offset: CGPoint
    let front: Bool

    init(coordinate: CLLocationCoordinate2D, kind: String, refId: String, image: UIImage?, offset: CGPoint, front: Bool) {
        self.coordinate = coordinate
        self.kind = kind
        self.refId = refId
        self.image = image
        self.offset = offset
        self.front = front
        super.init()
    }
}

struct Fam22MapPin {
    let id: String
    let coord: CLLocationCoordinate2D
    let color: Color
    let ini: String
    let photo: UIImage?
    let selected: Bool
    let speed: Int

    var key: String { "\(id)|\(coord.latitude)|\(coord.longitude)|\(selected)|\(speed)|\(photo != nil)|\(ini)" }
}

struct Fam22MapZone {
    let id: String
    let coord: CLLocationCoordinate2D
    let radius: Double
    let color: String
    let icon: String
    let name: String
    let draft: Bool

    var key: String { "\(id)|\(coord.latitude)|\(coord.longitude)|\(radius)|\(color)|\(icon)|\(name)|\(draft)" }
}

struct Fam22Trail {
    let id: String
    let color: String
    let coords: [CLLocationCoordinate2D]

    var key: String {
        let last: CLLocationCoordinate2D? = coords.last
        return "\(id)|\(color)|\(coords.count)|\(last?.latitude ?? 0)|\(last?.longitude ?? 0)"
    }
}

/// Styrer kartet fra knappene (zoom, vis alle, vis sone, vis person).
final class Fam22MapCtl {
    weak var map: MKMapView?
    var fitted: Bool = false

    func zoom(_ f: Double) {
        guard let m = map else { return }
        var r: MKCoordinateRegion = m.region
        r.span.latitudeDelta = Swift.min(120, Swift.max(0.0015, r.span.latitudeDelta * f))
        r.span.longitudeDelta = Swift.min(240, Swift.max(0.0015, r.span.longitudeDelta * f))
        m.setRegion(r, animated: true)
    }

    func focus(_ c: CLLocationCoordinate2D, meters: Double) {
        guard let m = map else { return }
        m.setRegion(MKCoordinateRegion(center: c, latitudinalMeters: meters, longitudinalMeters: meters), animated: true)
    }

    /// Person valgt: midtstill og zoom inn til minst ca. nivå 14.
    func focusPerson(_ c: CLLocationCoordinate2D) {
        guard let m = map else { return }
        if m.region.span.latitudeDelta > 0.02 { focus(c, meters: 1500) } else { m.setCenter(c, animated: true) }
    }

    /// Sone: diameteren fyller ca. 70 % av høyden.
    func focusZone(_ c: CLLocationCoordinate2D, radius: Double) {
        focus(c, meters: Swift.max(300, radius * 2 / 0.7))
    }

    func fit(_ coords: [CLLocationCoordinate2D]) {
        guard map != nil else { return }
        if coords.isEmpty {
            focus(CLLocationCoordinate2D(latitude: 59.915, longitude: 10.76), meters: 12000)
            return
        }
        if coords.count == 1 { focus(coords[0], meters: 1500); return }
        var minLa: Double = 90, maxLa: Double = -90, minLo: Double = 180, maxLo: Double = -180
        for c in coords {
            minLa = Swift.min(minLa, c.latitude); maxLa = Swift.max(maxLa, c.latitude)
            minLo = Swift.min(minLo, c.longitude); maxLo = Swift.max(maxLo, c.longitude)
        }
        let center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: (minLa + maxLa) / 2, longitude: (minLo + maxLo) / 2)
        let span: MKCoordinateSpan = MKCoordinateSpan(latitudeDelta: Swift.max(0.01, (maxLa - minLa) * 1.35), longitudeDelta: Swift.max(0.01, (maxLo - minLo) * 1.35))
        map?.setRegion(MKCoordinateRegion(center: center, span: span), animated: true)
    }
}

/// MKMapView med Kartverket-fliser (canReplaceMapContent), soner, spor og personpins.
struct Fam22MapView: UIViewRepresentable {
    let base: String
    let token: String?
    let zones: [Fam22MapZone]
    let pins: [Fam22MapPin]
    let trails: [Fam22Trail]
    let placing: Bool
    let ctl: Fam22MapCtl
    let onPin: (String) -> Void
    let onPlace: (CLLocationCoordinate2D) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let m: MKMapView = MKMapView(frame: .zero)
        m.delegate = context.coordinator
        m.showsCompass = false
        m.showsScale = false
        m.isPitchEnabled = false
        m.isRotateEnabled = false
        m.showsUserLocation = false
        m.pointOfInterestFilter = .excludingAll
        m.backgroundColor = UIColor(red: 0xe9 / 255.0, green: 0xe5 / 255.0, blue: 0xdc / 255.0, alpha: 1)
        // Apples juridiske merke flyttes over «Sanntid»-pillen.
        m.layoutMargins = UIEdgeInsets(top: 0, left: 6, bottom: 40, right: 0)
        let tiles: Fam22TileOverlay = Fam22TileOverlay(urlTemplate: nil)
        tiles.base = base
        tiles.token = token
        tiles.canReplaceMapContent = true
        tiles.minimumZ = 3
        tiles.maximumZ = 18
        m.addOverlay(tiles, level: .aboveLabels)
        m.setRegion(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 59.915, longitude: 10.76), latitudinalMeters: 12000, longitudinalMeters: 12000), animated: false)
        let tap: UITapGestureRecognizer = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        tap.delegate = context.coordinator
        m.addGestureRecognizer(tap)
        context.coordinator.map = m
        ctl.map = m
        return m
    }

    func updateUIView(_ m: MKMapView, context: Context) {
        let co: Coordinator = context.coordinator
        co.placing = placing
        co.onPin = onPin
        co.onPlace = onPlace
        ctl.map = m
        let sig: String = zones.map(\.key).joined(separator: ";") + "#" + pins.map(\.key).joined(separator: ";") + "#" + trails.map(\.key).joined(separator: ";")
        if sig == co.sig { return }
        co.sig = sig
        rebuild(m)
    }

    @MainActor private func rebuild(_ m: MKMapView) {
        let old: [MKOverlay] = m.overlays.filter { !($0 is MKTileOverlay) }
        m.removeOverlays(old)
        m.removeAnnotations(m.annotations)
        for z in zones {
            let c: MKCircle = MKCircle(center: z.coord, radius: z.radius)
            c.title = z.color
            c.subtitle = z.draft ? "draft" : ""
            m.addOverlay(c, level: .aboveLabels)
        }
        for t in trails where t.coords.count > 1 {
            let line: MKPolyline = MKPolyline(coordinates: t.coords, count: t.coords.count)
            line.title = t.color
            m.addOverlay(line, level: .aboveLabels)
        }
        var anns: [Fam22Ann] = []
        for z in zones {
            let icon: UIImage? = Fam22MapArt.render(Fam22ZoneIconArt(color: Color(hex: z.color), icon: z.icon))
            anns.append(Fam22Ann(coordinate: z.coord, kind: "zone", refId: z.id, image: icon, offset: .zero, front: false))
            let south: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: z.coord.latitude - z.radius / 111_320.0, longitude: z.coord.longitude)
            let label: UIImage? = Fam22MapArt.render(Fam22ZoneLabelArt(name: z.name.isEmpty ? "Ny sone" : z.name))
            anns.append(Fam22Ann(coordinate: south, kind: "label", refId: z.id, image: label, offset: CGPoint(x: 0, y: 12), front: false))
        }
        for p in pins {
            let s: CGFloat = p.selected ? 50 : 40
            let img: UIImage? = Fam22MapArt.render(Fam22PinArt(pin: p))
            anns.append(Fam22Ann(coordinate: p.coord, kind: "pin", refId: p.id, image: img, offset: CGPoint(x: 0, y: -(s + 7) / 2), front: p.selected))
        }
        m.addAnnotations(anns)
    }

    final class Coordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {
        weak var map: MKMapView?
        var sig: String = ""
        var placing: Bool = false
        var onPin: (String) -> Void = { _ in }
        var onPlace: (CLLocationCoordinate2D) -> Void = { _ in }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let t = overlay as? MKTileOverlay { return MKTileOverlayRenderer(tileOverlay: t) }
            if let c = overlay as? MKCircle {
                let r: MKCircleRenderer = MKCircleRenderer(circle: c)
                let col: UIColor = UIColor(Color(hex: c.title ?? "#b23a2a"))
                r.fillColor = col.withAlphaComponent(34.0 / 255.0)
                r.strokeColor = col
                r.lineWidth = 2
                if c.subtitle == "draft" { r.lineDashPattern = [6, 5] }
                return r
            }
            if let l = overlay as? MKPolyline {
                let r: MKPolylineRenderer = MKPolylineRenderer(polyline: l)
                r.strokeColor = UIColor(Color(hex: l.title ?? "#1b1a17")).withAlphaComponent(0.55)
                r.lineWidth = 3
                r.lineCap = .round
                r.lineJoin = .round
                return r
            }
            return MKOverlayRenderer(overlay: overlay)
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let a = annotation as? Fam22Ann else { return nil }
            let v: MKAnnotationView = mapView.dequeueReusableAnnotationView(withIdentifier: "fam22") ?? MKAnnotationView(annotation: a, reuseIdentifier: "fam22")
            v.annotation = a
            v.image = a.image
            v.centerOffset = a.offset
            v.canShowCallout = false
            v.isEnabled = a.kind == "pin"
            v.displayPriority = .required
            v.zPriority = a.front ? .max : (a.kind == "pin" ? .defaultSelected : .defaultUnselected)
            return v
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let a = view.annotation as? Fam22Ann else { return }
            mapView.deselectAnnotation(a, animated: false)
            if a.kind == "pin" && !placing { onPin(a.refId) }
        }

        @objc func tapped(_ g: UITapGestureRecognizer) {
            guard placing, let m = map else { return }
            let pt: CGPoint = g.location(in: m)
            let c: CLLocationCoordinate2D = m.convert(pt, toCoordinateFrom: m)
            onPlace(c)
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { true }
    }
}

/* ---------- Tegningene på kartet (rendres til bilder for MKAnnotationView) ---------- */

enum Fam22MapArt {
    @MainActor static func render<V: View>(_ v: V) -> UIImage? {
        let r: ImageRenderer<V> = ImageRenderer(content: v)
        r.scale = UIScreen.main.scale
        return r.uiImage
    }
}

struct Fam22Tail: Shape {
    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

/// Personpin: 40 pt (50 valgt), 3 pt hvit kant, skygge 0 6 16 / 30 %, fart-badge og hvit spiss.
struct Fam22PinArt: View {
    let pin: Fam22MapPin

    var body: some View {
        let s: CGFloat = pin.selected ? 50 : 40
        VStack(spacing: 0) {
            ZStack {
                Circle().fill(pin.color)
                if let img = pin.photo {
                    Image(uiImage: img).resizable().scaledToFill().frame(width: s, height: s).clipShape(Circle())
                } else {
                    Text(pin.ini).font(PF.ui(13, .heavy)).foregroundStyle(Color.white).lineLimit(1)
                }
                Circle().strokeBorder(Color.white, lineWidth: 3)
            }
            .frame(width: s, height: s)
            .shadow(color: Color.black.opacity(0.3), radius: 8, x: 0, y: 6)
            .overlay(alignment: .bottomTrailing) {
                if pin.speed > 0 { badge.offset(x: 4, y: 4) }
            }
            Fam22Tail().fill(Color.white).frame(width: 12, height: 8).padding(.top, -1)
        }
        .padding(20)
    }

    private var badge: some View {
        Text("\(pin.speed)").font(PF.ui(9.5, .bold)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
            .padding(.horizontal, 4)
            .frame(minWidth: 18, minHeight: 18, maxHeight: 18)
            .background(Capsule().fill(Fam22Tok.black))
            .overlay(Capsule().strokeBorder(Color.white, lineWidth: 2))
    }
}

/// Soneikon i sentrum: 28 pt sirkel i sonefarge, hvit 2 pt kant og skygge, hvitt ikon 15 pt (strek 2,2).
struct Fam22ZoneIconArt: View {
    let color: Color
    let icon: String

    var body: some View {
        ZStack {
            Circle().fill(color)
            Circle().strokeBorder(Color.white, lineWidth: 2)
            Fam22Glyph(d: Fam22Icons.d(icon), size: 15, stroke: 2.2, color: Color.white)
        }
        .frame(width: 28, height: 28)
        .shadow(color: Color.black.opacity(0.25), radius: 4, x: 0, y: 3)
        .padding(10)
    }
}

/// Sonenavnet under sirkelen: hvit 88 %, radius 8, Manrope 700 11.
struct Fam22ZoneLabelArt: View {
    let name: String

    var body: some View {
        Text(name).font(PF.ui(11, .bold)).foregroundStyle(Fam22Tok.black).lineLimit(1).fixedSize()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.88)))
    }
}

/* ---------- Verktøyraden og kortet med kartet ---------- */

/// «+ Ny sone på kartet» (ink, 42) til venstre, «Vis alle» og ↻ (42) til høyre.
struct Fam22Toolbar: View {
    @Environment(\.paper) private var p
    let placing: Bool
    let place: () -> Void
    let fit: () -> Void
    let refresh: () -> Void

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        HStack(spacing: 8) {
            Fam22Pill(title: placing ? "Avbryt plassering" : "+ Ny sone på kartet", height: 42, fg: t.bg, bg: t.ink, border: nil, action: place)
            Spacer(minLength: 0)
            Fam22Pill(title: "Vis alle", height: 42, fg: t.ink, bg: t.card, border: t.line, action: fit)
            Button(action: refresh) {
                Fam22Glyph(d: Fam22Icons.refresh, size: 18, stroke: 2.2, color: t.ink)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(t.card))
                    .overlay(Circle().strokeBorder(t.line, lineWidth: 1))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Oppdater")
        }
    }
}

/// Kartet: 420 høyt, radius 24, zoomknapper nede til høyre, «Sanntid»-pille nede til venstre og «© Kartverket».
struct Fam22MapCard: View {
    @Environment(Store.self) private var store
    let zones: [Fam22MapZone]
    let pins: [Fam22MapPin]
    let trails: [Fam22Trail]
    let placing: Bool
    let liveOn: Bool
    let liveText: String
    let ctl: Fam22MapCtl
    let fit: () -> Void
    let onPin: (String) -> Void
    let onPlace: (CLLocationCoordinate2D) -> Void

    var body: some View {
        ZStack {
            Fam22MapView(base: store.api.base, token: store.api.token, zones: zones, pins: pins, trails: trails, placing: placing, ctl: ctl, onPin: onPin, onPlace: onPlace)
            if placing { banner }
            zoomButtons
            livePill
            Text("© Kartverket").font(.system(size: 9)).foregroundStyle(Color(hex: "#555555"))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .padding(.trailing, 56).padding(.bottom, 4)
                .allowsHitTesting(false)
        }
        .frame(height: 420)
        .background(Color(hex: "#e9e5dc"))
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private var banner: some View {
        Text("Trykk på kartet der sonen skal være").font(PF.ui(13, .semibold)).foregroundStyle(Color.white)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 14).fill(Fam22Tok.black))
            .padding(.horizontal, 12).padding(.top, 12)
            .frame(maxHeight: .infinity, alignment: .top)
            .allowsHitTesting(false)
    }

    private var zoomButtons: some View {
        VStack(spacing: 6) {
            zoomButton("+", 20, "Zoom inn") { ctl.zoom(0.5) }
            zoomButton("−", 20, "Zoom ut") { ctl.zoom(2) }
            zoomButton("◎", 15, "Vis alle") { fit() }
        }
        .padding(.trailing, 10).padding(.bottom, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
    }

    private func zoomButton(_ s: String, _ size: CGFloat, _ label: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(s).font(.system(size: size)).foregroundStyle(Fam22Tok.black)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.95)))
                .shadow(color: Color.black.opacity(0.18), radius: 6, x: 0, y: 4)
                .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var livePill: some View {
        HStack(spacing: 6) {
            Circle().fill(liveOn ? Fam22Tok.fresh : Fam22Tok.stale).frame(width: 8, height: 8)
            Text(liveText).font(PF.ui(11, .semibold)).foregroundStyle(Fam22Tok.black).lineLimit(1)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.92)))
        .padding(.leading, 10).padding(.bottom, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        .allowsHitTesting(false)
    }
}
