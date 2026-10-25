import SwiftUI
import UIKit
import CoreLocation

/* ---------------- Prompt 46: Vær – «Min posisjon» øverst i Steder og været der man er ----------------
 Spesifikasjon: claude-code-vaer-min-posisjon.md. Fasit: Vaer.dc.html (locate(), place(), pl.me, raden under «MINE STEDER»).

 Rotårsak: Vær leste aldri appens posisjon. Valgt sted (`fh_wx_place`) hadde «oslo» som standard, så alle som aldri valgte sted
 fikk Oslo. Prompt 45 la bare til et eget kort i popupen (Vaer45HereCard) – selve Vær-siden, Hjem og Glimt brukte fortsatt Oslo.
 Nå:
 – Ny verdi `__gps` (Min posisjon) er standard for nye brukere og når ingenting er valgt. Migrering én gang: har brukeren aldri valgt
   sted selv (nøkkelen mangler, eller er «oslo» uten at et valg er registrert), settes `__gps`.
 – Store.weatherPlaceObj gir et WxPlace med koordinatene herfra, så /api/weather/full?lat=&lon=&name= (og alt som bygger på den:
   Hjem, uka, Glimt-kortet) bruker der telefonen er.
 – Posisjon: siste kjente fra appens posisjonstjeneste (≤ 10 min, CLLocationManager.location deles i appen med Familie/Vel fremme),
   ellers én ny (≈ 1 km nøyaktighet). Ny henting når appen kommer i forgrunnen; været lastes på nytt når man har flyttet seg > 2 km.
 – Stedsnavn: GET /api/weather/here (SERVER45, place.name) → CLGeocoder (by/tettsted/bydel) → «Min posisjon».
 – Feil: «Finner posisjonen …», «Gi appen tilgang til posisjon» (trykk → systeminnstillinger), «Fant ikke posisjonen».
   Da brukes siste kjente posisjon (lagret), ellers første lagrede sted – men valget «Min posisjon» beholdes. */

@MainActor
@Observable
final class Vaer46 {
    static let shared = Vaer46()
    nonisolated static let gpsId: String = "__gps"

    /// idle | finding | denied | failed | ok
    var state: String = "idle"
    var name: String = UserDefaults.standard.string(forKey: "vaer46_name") ?? ""
    var lat: Double? = UserDefaults.standard.object(forKey: "vaer46_lat") as? Double
    var lon: Double? = UserDefaults.standard.object(forKey: "vaer46_lon") as? Double
    @ObservationIgnored private var lastAt: Date = .distantPast
    @ObservationIgnored private let loc: Vaer45Locator = Vaer45Locator()
    @ObservationIgnored private var busy: Bool = false

    /// Stedet Min posisjon gir til resten av Vær (nil = ingen posisjon ennå).
    var place: WxPlace? {
        guard let lat, let lon else { return nil }
        return WxPlace(id: Vaer46.gpsId, name: name.isEmpty ? "Min posisjon" : name, lat: lat, lon: lon, region: "Min posisjon")
    }

    /// «Min posisjon · følger telefonen» / feiltilstandene.
    var subtitle: String {
        switch state {
        case "finding": return "Finner posisjonen …"
        case "denied": return "Gi appen tilgang til posisjon"
        case "failed": return lat == nil ? "Fant ikke posisjonen" : "Fant ikke posisjonen · viser siste kjente"
        default: return "Min posisjon · følger telefonen"
        }
    }

    var title: String { name.isEmpty ? "Min posisjon" : name }

    /// Engangs-migrering: `__gps` når brukeren aldri har valgt sted selv.
    static func migrate(_ store: Store) {
        let k: String = "vaer46_mig_v1"
        let d: UserDefaults = UserDefaults.standard
        if d.bool(forKey: k) { return }
        d.set(true, forKey: k)
        let saved: String? = d.string(forKey: "fh_wx_place")
        if saved == nil || (saved == "oslo" && !d.bool(forKey: "vaer46_user_pick")) {
            store.weatherPlace = Vaer46.gpsId
        }
    }

    /// Henter posisjonen (og navnet). Laster været på nytt når Min posisjon er valgt og man har flyttet seg > 2 km.
    func refresh(_ store: Store, force: Bool = false) async {
        if busy { return }
        let st: CLAuthorizationStatus = loc.status
        if st == .denied || st == .restricted { state = "denied"; return }
        if st == .notDetermined {
            state = "finding"
            loc.request { [weak self] in
                Task { @MainActor in await self?.refresh(store, force: true) }
            }
            return
        }
        if !force && Date().timeIntervalSince(lastAt) < 600 && lat != nil { return }
        busy = true
        defer { busy = false }
        if lat == nil { state = "finding" }
        guard let c = await loc.current() else {
            state = "failed"
            return
        }
        lastAt = Date()
        let moved: Bool = Vaer46.km(lat, lon, c.latitude, c.longitude) > 2
        let first: Bool = lat == nil
        lat = c.latitude
        lon = c.longitude
        UserDefaults.standard.set(c.latitude, forKey: "vaer46_lat")
        UserDefaults.standard.set(c.longitude, forKey: "vaer46_lon")
        state = "ok"
        if first || moved || name.isEmpty { await lookupName(store, c) }
        if store.weatherPlace == Vaer46.gpsId && (first || moved) {
            await store.loadWeatherFull(force: true)
        }
    }

    private func lookupName(_ store: Store, _ c: CLLocationCoordinate2D) async {
        let q: String = String(format: "?lat=%.4f&lon=%.4f", c.latitude, c.longitude)
        if let d = try? await store.api.callAt("/api", "GET", "/weather/here" + q, timeout: 12),
           let n = JS.str(JS.dict(JS.obj(d), "place"), "name"), !n.isEmpty, n != "Her" {
            setName(n)
            return
        }
        let geo: CLGeocoder = CLGeocoder()
        let pm: [CLPlacemark]? = try? await geo.reverseGeocodeLocation(CLLocation(latitude: c.latitude, longitude: c.longitude), preferredLocale: Locale(identifier: "nb_NO"))
        if let p = pm?.first, let n = p.locality ?? p.subLocality ?? p.subAdministrativeArea, !n.isEmpty { setName(n) }
    }

    private func setName(_ n: String) {
        name = n
        UserDefaults.standard.set(n, forKey: "vaer46_name")
    }

    /// Trykk på raden når tilgang mangler → systeminnstillingene.
    func openSettings() {
        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
    }

    nonisolated static func km(_ a: Double?, _ b: Double?, _ c: Double, _ d: Double) -> Double {
        guard let a, let b else { return .infinity }
        let r: Double = 6371
        let dLat: Double = (c - a) * .pi / 180
        let dLon: Double = (d - b) * .pi / 180
        let x: Double = sin(dLat / 2) * sin(dLat / 2) + cos(a * .pi / 180) * cos(c * .pi / 180) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * atan2(sqrt(x), sqrt(1 - x))
    }
}

/// Raden øverst i Steder: blå posisjonsikon-sirkel, stedsnavn og «Min posisjon · følger telefonen», hake når valgt.
/// Kan ikke slettes, flyttes eller sveipes (ligger i egen seksjon over de lagrede stedene).
struct Vaer46PlaceRow: View {
    @Environment(Store.self) private var store
    @MainActor private var v: Vaer46 { Vaer46.shared }
    let pick: () -> Void

    var body: some View {
        let on: Bool = store.weatherPlace == Vaer46.gpsId
        Button {
            if v.state == "denied" { v.openSettings(); return }
            Haptics.shared.select()
            pick()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "location.fill").font(.dyn51(size: 14, weight: .bold)).foregroundStyle(Color.white)
                    .frame(width: 34, height: 34)
                    .background(Color(hex: "#2f7cf6"), in: Circle())
                VStack(alignment: .leading, spacing: 1) {
                    Text(v.title).font(.dyn51(size: 16, weight: .semibold)).lineLimit(1)
                    Text(v.subtitle).font(.dyn51(size: 12.5)).foregroundStyle(Color(hex: "#c4cbd4")).lineLimit(1)
                }
                Spacer(minLength: 6)
                if on { Image(systemName: "checkmark").font(.dyn51(size: 14, weight: .bold)).foregroundStyle(Color(hex: "#8fb8ff")) }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(on ? Color(hex: "#2f3a4c") : Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityAddTraits(on ? .isSelected : [])
        .task { await v.refresh(store) }
    }
}

/// Holder Min posisjon fersk: ved oppstart og når appen kommer i forgrunnen. Legges på Vær-siden og Hjem.
struct Vaer46Keeper: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase

    func body(content: Content) -> some View {
        content
            .task {
                Vaer46.migrate(store)
                if store.weatherPlace == Vaer46.gpsId {
                    await Vaer46.shared.refresh(store)
                    await store.loadWeatherFull()
                }
            }
            .onChange(of: phase) { (_: ScenePhase, ph: ScenePhase) in
                if ph == .active && store.weatherPlace == Vaer46.gpsId { Task { await Vaer46.shared.refresh(store, force: true) } }
            }
    }
}

extension View {
    func vaer46Keeper() -> some View { modifier(Vaer46Keeper()) }
}
