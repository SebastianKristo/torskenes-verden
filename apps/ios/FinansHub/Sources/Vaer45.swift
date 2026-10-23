import SwiftUI
import UIKit
import CoreLocation

/* ---------------- Prompt 45: Vær-popupen viser også været der enheten er (claude-code-vaer-min-posisjon-popup.md) ----------------
 Fasit: Vaer.dc.html.
 – Eget kort øverst med pil-ikon «MIN POSISJON», stedsnavn, temperatur, symbol og H/L. Posisjonen kommer fra denne enheten
   (posisjonstillatelse «Ved bruk»), aldri fra serveren eller en annen enhet. GET /api/weather/here?lat=&lon=&selLat=&selLon=
   (SERVER45) – posisjonen avrundes og lagres ikke på serveren.
 – Avslått posisjon: «Slå på posisjon for å se været der du er» + «Tillat».
 – Valgt sted = min posisjon (innen 2 km, sameAsSelected): bare ett kort (dette skjules).
 – Oppdateres når appen kommer i forgrunnen, maks hvert 10. minutt. Eldre server (404): kortet vises ikke. */

@MainActor
@Observable
final class Vaer45 {
    static let shared = Vaer45()

    var status: CLAuthorizationStatus = .notDetermined
    var place: String = ""
    var temp: Double? = nil
    var text: String = ""
    var code: Int = 2
    var isDay: Bool = true
    var hi: Double? = nil
    var lo: Double? = nil
    var same: Bool = false
    var missing: Bool = false
    var loading: Bool = false

    @ObservationIgnored private var lastAt: Date = .distantPast
    private let loc: Vaer45Locator = Vaer45Locator()

    var denied: Bool { status == .denied || status == .restricted }

    func refresh(_ store: Store, force: Bool = false) async {
        status = loc.status
        if missing || denied { return }
        if status == .notDetermined { return }
        if !force && Date().timeIntervalSince(lastAt) < 600 && temp != nil { return }
        guard let c = await loc.current() else { return }
        lastAt = Date()
        loading = true
        defer { loading = false }
        let sel: WxPlace? = store.weatherPlaceObj
        var q: String = String(format: "?lat=%.4f&lon=%.4f", c.latitude, c.longitude)
        if let la = sel?.lat, let lo = sel?.lon { q += String(format: "&selLat=%.4f&selLon=%.4f", la, lo) }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/weather/here" + q, timeout: 15)
            parse(JS.obj(d))
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {
            return
        }
    }

    private func parse(_ o: [String: Any]) {
        let p: [String: Any]? = JS.dict(o, "place")
        let n: [String: Any]? = JS.dict(o, "now")
        let t: [String: Any]? = JS.dict(o, "today")
        place = JS.str(p, "name") ?? "Her"
        temp = JS.num(n, "temp")
        text = JS.str(n, "text") ?? ""
        code = JS.int(n, "code") ?? 2
        isDay = JS.bool(n, "isDay") ?? true
        hi = JS.num(t, "hi")
        lo = JS.num(t, "lo")
        same = JS.bool(o, "sameAsSelected") ?? false
    }

    /// «Tillat»: spør første gang, ellers åpne Innstillinger (der tillatelsen endres).
    func allow(_ store: Store) {
        Haptics.shared.tap()
        if status == .notDetermined {
            loc.request { [weak self] in
                Task { @MainActor in
                    guard let self else { return }
                    self.status = self.loc.status
                    await self.refresh(store, force: true)
                }
            }
        } else if let u = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(u)
        }
    }
}

/// Én posisjon fra denne enheten (ingen kontinuerlig sporing). Lages på hovedtråden, så CoreLocation kaller delegaten der.
@MainActor
final class Vaer45Locator: NSObject, CLLocationManagerDelegate {
    private let manager: CLLocationManager = CLLocationManager()
    private var waiters: [CheckedContinuation<CLLocationCoordinate2D?, Never>] = []
    private var onAuth: (() -> Void)? = nil

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    var status: CLAuthorizationStatus { manager.authorizationStatus }

    func request(_ done: @escaping () -> Void) {
        onAuth = done
        manager.requestWhenInUseAuthorization()
    }

    func current() async -> CLLocationCoordinate2D? {
        if let l = manager.location, Date().timeIntervalSince(l.timestamp) < 600 { return l.coordinate }
        return await withCheckedContinuation { (c: CheckedContinuation<CLLocationCoordinate2D?, Never>) in
            waiters.append(c)
            if waiters.count == 1 { manager.requestLocation() }
        }
    }

    private func finish(_ c: CLLocationCoordinate2D?) {
        let w = waiters
        waiters = []
        for x in w { x.resume(returning: c) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let c: CLLocationCoordinate2D? = locations.last?.coordinate
        MainActor.assumeIsolated { self.finish(c) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated { self.finish(nil) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let st: CLAuthorizationStatus = manager.authorizationStatus
        MainActor.assumeIsolated {
            if st != .notDetermined, let f = self.onAuth {
                self.onAuth = nil
                f()
            }
        }
    }
}

/// Kortet øverst i Vær-popupen.
struct Vaer45HereCard: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @MainActor private var v: Vaer45 { Vaer45.shared }

    var body: some View {
        Group {
            if v.missing || v.same {
                EmptyView()
            } else if v.denied || v.status == .notDetermined {
                ask
            } else if v.temp != nil {
                card
            }
        }
        .task { await v.refresh(store) }
        .onChange(of: phase) { (_: ScenePhase, ph: ScenePhase) in
            if ph == .active { Task { await v.refresh(store) } }
        }
    }

    private var label: some View {
        HStack(spacing: 5) {
            Image(systemName: "location.fill").font(.system(size: 10, weight: .bold))
            Text("MIN POSISJON").font(.system(size: 11, weight: .bold, design: .monospaced)).tracking(1.2)
        }
        .opacity(0.85)
    }

    private var card: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                label
                Text(v.place).font(.system(size: 19, weight: .semibold)).lineLimit(1)
                Text(hl).font(.system(size: 13)).opacity(0.8).lineLimit(1)
            }
            Spacer(minLength: 6)
            Image(systemName: Vaer45.symbol(v.code, day: v.isDay)).symbolRenderingMode(.multicolor).font(.system(size: 30))
            Text("\(Int((v.temp ?? 0).rounded()))°").font(.system(size: 40, weight: .light))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Min posisjon, \(v.place), \(Int((v.temp ?? 0).rounded())) grader")
    }

    private var hl: String {
        var parts: [String] = []
        if !v.text.isEmpty { parts.append(v.text) }
        if let h = v.hi, let l = v.lo { parts.append("H \(Int(h.rounded()))° · L \(Int(l.rounded()))°") }
        return parts.joined(separator: " · ")
    }

    private var ask: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                label
                Text("Slå på posisjon for å se været der du er").font(.system(size: 14.5, weight: .semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            Button { v.allow(store) } label: {
                Text("Tillat").font(.system(size: 14, weight: .bold)).foregroundStyle(Color(hex: "#1b1a17"))
                    .padding(.horizontal, 16).frame(height: 36)
                    .background(Color.white, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

extension Vaer45 {
    /// MET-/WMO-lignende kode → SF Symbol (bare til det lille symbolet i kortet).
    nonisolated static func symbol(_ code: Int, day: Bool) -> String {
        switch code {
        case 0, 1: return day ? "sun.max.fill" : "moon.stars.fill"
        case 2: return day ? "cloud.sun.fill" : "cloud.moon.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51...67, 80...82: return "cloud.rain.fill"
        case 71...77, 85, 86: return "cloud.snow.fill"
        case 95...99: return "cloud.bolt.rain.fill"
        default: return "cloud.fill"
        }
    }
}
