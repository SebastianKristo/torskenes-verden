import SwiftUI
import UIKit
import MapKit
import CoreLocation

/* ---------------- Prompt 52 (IOS52A): Familie-krasjet – vakter og krasjgrense per kort ----------------
   Rotårsak og sjekkliste: docs/familie-krasj-52.md.
   – Fam52Geo: bare gyldige koordinater og områder går til MapKit (NaN, ±inf, utenfor ±90/±180 og 0,0 hoppes over;
     spennet klemmes), så kartet aldri får en ugyldig region (MKMapView kaster NSInvalidArgumentException).
   – Fam52Guard: krasjgrense per kort. SwiftUI kan ikke fange en felle (trap) i ett kort, så vakten husker hvilket kort
     som var i ferd med å tegnes (merket fjernes 2 s etter siste tegning). Krasjet appen mens kortet ble tegnet, viser kortet «Kunne ikke laste» neste gang
     (med «Prøv igjen»), og resten av Familie virker. Ellers vises kortet som vanlig. */

enum Fam52Geo {
    /// Gyldig punkt: endelig, innenfor jorda og ikke «null-øya» (0,0 = posisjon mangler).
    nonisolated static func valid(_ lat: Double?, _ lon: Double?) -> Bool {
        guard let lat, let lon, lat.isFinite, lon.isFinite else { return false }
        guard abs(lat) <= 90, abs(lon) <= 180 else { return false }
        if abs(lat) < 0.000001 && abs(lon) < 0.000001 { return false }
        return CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: lat, longitude: lon))
    }

    nonisolated static func valid(_ c: CLLocationCoordinate2D) -> Bool { valid(c.latitude, c.longitude) }

    /// Område MapKit godtar: gyldig senter og spenn (0 < spenn ≤ 170° / 350°). Ellers Oslo.
    nonisolated static func safe(_ r: MKCoordinateRegion) -> MKCoordinateRegion {
        let fallback: MKCoordinateRegion = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 59.915, longitude: 10.76),
                                                              span: MKCoordinateSpan(latitudeDelta: 0.11, longitudeDelta: 0.21))
        guard valid(r.center.latitude, r.center.longitude) else { return fallback }
        let la: Double = r.span.latitudeDelta, lo: Double = r.span.longitudeDelta
        guard la.isFinite, lo.isFinite else { return fallback }
        let span: MKCoordinateSpan = MKCoordinateSpan(latitudeDelta: Swift.min(170, Swift.max(0.0005, la)),
                                                      longitudeDelta: Swift.min(350, Swift.max(0.0005, lo)))
        // Senter + halvt spenn må ligge innenfor ±90 (ellers «Invalid Region»).
        let maxLat: Double = 90 - span.latitudeDelta / 2
        let lat: Double = Swift.min(maxLat, Swift.max(-maxLat, r.center.latitude))
        return MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: r.center.longitude), span: span)
    }

    /// Endelig punkt på skjermen (ellers nil).
    nonisolated static func finite(_ p: CGPoint) -> Bool { p.x.isFinite && p.y.isFinite }
}

/// Husker kort som var i ferd med å tegnes da appen sist stoppet (krasjet).
@MainActor
enum Fam52Crash {
    private static let key: String = "fam52_drawing"
    private static let trippedKey: String = "fam52_tripped"

    /// Lest én gang per kjøring: kort som var «under tegning» da forrige kjøring stoppet, blir «kunne ikke laste».
    private static var started: Bool = false

    private static func startOnce() {
        if started { return }
        started = true
        let d: UserDefaults = UserDefaults.standard
        let drawing: [String] = d.stringArray(forKey: key) ?? []
        if !drawing.isEmpty {
            let old: [String] = d.stringArray(forKey: trippedKey) ?? []
            d.set(Array(Set(old + drawing)).sorted(), forKey: trippedKey)
            Swift.print("Familie: kort som krasjet sist: " + drawing.joined(separator: ", "))
        }
        d.removeObject(forKey: key)
    }

    static func tripped(_ id: String) -> Bool {
        startOnce()
        return (UserDefaults.standard.stringArray(forKey: trippedKey) ?? []).contains(id)
    }

    static func begin(_ id: String) {
        startOnce()
        var a: [String] = UserDefaults.standard.stringArray(forKey: key) ?? []
        if !a.contains(id) { a.append(id) }
        UserDefaults.standard.set(a, forKey: key)
    }

    static func end(_ id: String) {
        var a: [String] = UserDefaults.standard.stringArray(forKey: key) ?? []
        a.removeAll { $0 == id }
        if a.isEmpty { UserDefaults.standard.removeObject(forKey: key) } else { UserDefaults.standard.set(a, forKey: key) }
    }

    /// Siste tegning per kort i denne kjøringen (i minnet) og om sluttmerket er planlagt.
    private static var last: [String: Date] = [:]
    private static var pending: Set<String> = []

    /// Kalles hver gang kortet tegnes (fra body, før innholdet bygges). Skriver merket bare én gang, og fjerner det når
    /// kortet har tegnet uten krasj i 2 s. Krasjer appen i mellomtiden, står merket igjen til neste oppstart.
    static func mark(_ id: String) {
        last[id] = Date()
        if pending.contains(id) { return }
        pending.insert(id)
        begin(id)
        Task { @MainActor in
            while true {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if Date().timeIntervalSince(Fam52Crash.last[id] ?? .distantPast) >= 1.9 { break }
            }
            Fam52Crash.pending.remove(id)
            Fam52Crash.end(id)
        }
    }

    static func retry(_ id: String) {
        var a: [String] = UserDefaults.standard.stringArray(forKey: trippedKey) ?? []
        a.removeAll { $0 == id }
        UserDefaults.standard.set(a, forKey: trippedKey)
    }
}

/// Krasjgrense rundt ett kort i Familie (kart, helse, Vel fremme, familiekalender).
struct Fam52Guard<C: View>: View {
    let id: String
    let title: String
    let height: CGFloat?
    let content: () -> C
    /// Avgjøres før første tegning (ellers ville kortet som krasjet, tegnes én gang til).
    @State private var off: Bool

    @MainActor init(id: String, title: String, height: CGFloat? = nil, @ViewBuilder content: @escaping () -> C) {
        self.id = id
        self.title = title
        self.height = height
        self.content = content
        _off = State(initialValue: Fam52Crash.tripped(id))
    }

    var body: some View {
        Group {
            if off {
                Fam52Failed(title: title, height: height) {
                    Fam52Crash.retry(id)
                    off = false
                }
            } else {
                // Merket settes før innholdet bygges, så også et krasj i første tegning fanges.
                let _: Void = Fam52Crash.mark(id)
                content()
            }
        }
    }
}

/// «Kunne ikke laste» i stedet for kortet.
struct Fam52Failed: View {
    @Environment(\.paper) private var p
    let title: String
    var height: CGFloat? = nil
    let retry: () -> Void

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 6) {
            Text("Kunne ikke laste " + title).font(PF.ui(14, .bold)).foregroundStyle(t.ink)
            Text("Kortet stoppet sist det ble vist. Resten av Familie virker som vanlig.").font(PF.ui(12.5)).foregroundStyle(t.mut)
                .fixedSize(horizontal: false, vertical: true)
            Button { Haptics.shared.tap(); retry() } label: {
                Text("Prøv igjen").font(PF.ui(13, .bold)).foregroundStyle(t.onPill).padding(.horizontal, 14).frame(height: 34)
                    .background(Capsule().fill(t.pill))
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: height, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.card))
        .accessibilityElement(children: .combine)
    }
}
