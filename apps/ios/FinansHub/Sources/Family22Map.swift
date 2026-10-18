import SwiftUI
import UIKit
import MapKit
import CoreLocation

/* ---------------- Prompt 24: kartet i Familie – Apple Maps (MapKit) på iPhone og iPad ----------------
   Flat standardstil uten POI-er. Soner er MapCircle, personer og soneikoner er Annotation.
   Alt over kartet (pins, sonesirkler, etiketter, zoomknapper, «Sanntid»-pillen) er likt Android. */

struct Fam22MapPin {
    let id: String
    let coord: CLLocationCoordinate2D
    let color: Color
    let ini: String
    let photo: UIImage?
    let selected: Bool
    let speed: Int
}

struct Fam22MapZone {
    let id: String
    let coord: CLLocationCoordinate2D
    let radius: Double
    let color: String
    let icon: String
    let name: String
    let draft: Bool
}

struct Fam22Trail {
    let id: String
    let color: String
    let coords: [CLLocationCoordinate2D]
}

/// Styrer kartet fra knappene (zoom, vis alle, vis sone, vis person) via kameraposisjonen.
@MainActor
@Observable
final class Fam22MapCtl {
    static let oslo: MKCoordinateRegion = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 59.915, longitude: 10.76),
                                                              latitudinalMeters: 12000, longitudinalMeters: 12000)
    var position: MapCameraPosition = MapCameraPosition.region(Fam22MapCtl.oslo)
    /// Siste synlige område (oppdateres når brukeren har flyttet kartet).
    var region: MKCoordinateRegion = Fam22MapCtl.oslo
    var fitted: Bool = false

    private func go(_ r: MKCoordinateRegion) {
        region = r
        withAnimation(.easeInOut(duration: 0.35)) { position = MapCameraPosition.region(r) }
    }

    func zoom(_ f: Double) {
        var r: MKCoordinateRegion = region
        r.span.latitudeDelta = Swift.min(120, Swift.max(0.0015, r.span.latitudeDelta * f))
        r.span.longitudeDelta = Swift.min(240, Swift.max(0.0015, r.span.longitudeDelta * f))
        go(r)
    }

    func focus(_ c: CLLocationCoordinate2D, meters: Double) {
        go(MKCoordinateRegion(center: c, latitudinalMeters: meters, longitudinalMeters: meters))
    }

    /// Person valgt: midtstill og zoom inn til minst ca. nivå 14.
    func focusPerson(_ c: CLLocationCoordinate2D) {
        if region.span.latitudeDelta > 0.02 {
            focus(c, meters: 1500)
        } else {
            go(MKCoordinateRegion(center: c, span: region.span))
        }
    }

    /// Sone: diameteren fyller ca. 70 % av høyden.
    func focusZone(_ c: CLLocationCoordinate2D, radius: Double) {
        focus(c, meters: Swift.max(300, radius * 2 / 0.7))
    }

    func fit(_ coords: [CLLocationCoordinate2D]) {
        if coords.isEmpty { go(Fam22MapCtl.oslo); return }
        if coords.count == 1 { focus(coords[0], meters: 1500); return }
        var minLa: Double = 90
        var maxLa: Double = -90
        var minLo: Double = 180
        var maxLo: Double = -180
        for c in coords {
            minLa = Swift.min(minLa, c.latitude)
            maxLa = Swift.max(maxLa, c.latitude)
            minLo = Swift.min(minLo, c.longitude)
            maxLo = Swift.max(maxLo, c.longitude)
        }
        let center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: (minLa + maxLa) / 2, longitude: (minLo + maxLo) / 2)
        let span: MKCoordinateSpan = MKCoordinateSpan(latitudeDelta: Swift.max(0.01, (maxLa - minLa) * 1.35),
                                                      longitudeDelta: Swift.max(0.01, (maxLo - minLo) * 1.35))
        go(MKCoordinateRegion(center: center, span: span))
    }
}

/// SwiftUI Map (iOS 17): flat standardstil uten POI-er, soner som MapCircle, spor som MapPolyline og personer som Annotation.
struct Fam22MapView: View {
    @Environment(\.paper) private var p
    let zones: [Fam22MapZone]
    let pins: [Fam22MapPin]
    let trails: [Fam22Trail]
    let placing: Bool
    let ctl: Fam22MapCtl
    let onPin: (String) -> Void
    let onPlace: (CLLocationCoordinate2D) -> Void

    private var pos: Binding<MapCameraPosition> {
        Binding<MapCameraPosition>(get: { ctl.position }, set: { v in ctl.position = v })
    }

    /// Valgt person tegnes sist, så den ligger øverst.
    private var orderedPins: [Fam22MapPin] {
        pins.filter { !$0.selected } + pins.filter { $0.selected }
    }

    private var liveTrails: [Fam22Trail] { trails.filter { $0.coords.count > 1 } }

    var body: some View {
        MapReader { proxy in
            // Trykk i kartet plasserer ny sone. Ellers er gesten av, så pinnene får trykket.
            map.gesture(placeTap(proxy), including: placing ? GestureMask.all : GestureMask.subviews)
        }
    }

    private func placeTap(_ proxy: MapProxy) -> some Gesture {
        SpatialTapGesture(count: 1, coordinateSpace: .local).onEnded { (v: SpatialTapGesture.Value) in
            if let c = proxy.convert(v.location, from: .local) { onPlace(c) }
        }
    }

    private var map: some View {
        Map(position: pos, interactionModes: [.pan, .zoom]) {
            ForEach(zones, id: \.id) { z in
                MapCircle(center: z.coord, radius: z.radius)
                    .foregroundStyle(Color(hex: z.color).opacity(0.13))
                    .stroke(Color(hex: z.color), style: StrokeStyle(lineWidth: 2, dash: z.draft ? [6, 5] : []))
            }
            ForEach(liveTrails, id: \.id) { t in
                MapPolyline(coordinates: t.coords)
                    .stroke(Color(hex: t.color).opacity(0.55), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            }
            ForEach(zones, id: \.id) { z in
                Annotation("", coordinate: z.coord, anchor: .center) {
                    Fam22ZoneIconArt(color: Color(hex: z.color), icon: z.icon).allowsHitTesting(false)
                }
            }
            ForEach(zones, id: \.id) { z in
                Annotation("", coordinate: Fam22MapView.south(z), anchor: .top) {
                    Fam22ZoneLabelArt(name: z.name.isEmpty ? "Ny sone" : z.name).padding(.top, 4).allowsHitTesting(false)
                }
            }
            ForEach(orderedPins, id: \.id) { pin in
                Annotation("", coordinate: pin.coord, anchor: .bottom) {
                    Fam22PinButton(pin: pin, placing: placing, onPin: onPin)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll, showsTraffic: false))
        .safeAreaPadding(.bottom, 40)
        .environment(\.colorScheme, p.dark ? ColorScheme.dark : ColorScheme.light)
        .onMapCameraChange(frequency: .onEnd) { ctx in
            ctl.region = ctx.region
        }
    }

    static func south(_ z: Fam22MapZone) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: z.coord.latitude - z.radius / 111_320.0, longitude: z.coord.longitude)
    }
}

/// Personpin som knapp (ikke under plassering av ny sone).
struct Fam22PinButton: View {
    let pin: Fam22MapPin
    let placing: Bool
    let onPin: (String) -> Void

    var body: some View {
        Button {
            if !placing { onPin(pin.id) }
        } label: {
            Fam22PinArt(pin: pin)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(pin.ini)
    }
}

/* ---------- Tegningene på kartet ---------- */

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

/// Kartet: 420 høyt, radius 24, zoomknapper nede til høyre og «Sanntid»-pille nede til venstre (Apples merke ligger over pillen).
struct Fam22MapCard: View {
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
            Fam22MapView(zones: zones, pins: pins, trails: trails, placing: placing, ctl: ctl, onPin: onPin, onPlace: onPlace)
            if placing { banner }
            zoomButtons
            livePill
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
