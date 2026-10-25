import SwiftUI
import HealthKit
import CoreLocation
import UIKit

/* ---------------- Prompt 20: Apple Health, «Helse og posisjon» og bakgrunnssynk ---------------- */

/// HKObserverQuery + enableBackgroundDelivery(.hourly) for skritt og puls. iOS vekker appen når det kommer nye
/// målinger, og sammendraget sendes (høyst hvert 10. minutt). Startes i App.init og når tilgangen er gitt.
final class HealthObserver20 {
    static let shared = HealthObserver20()

    private let hk = HKHealthStore()
    private var queries: [HKObserverQuery] = []
    private let lock = NSLock()

    /// Bare når dialogen er vist og hovedbryteren er på.
    func start() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let ud = UserDefaults.standard
        let master: Bool = (ud.object(forKey: AcctScope.key("fh_health_master")) as? Bool) ?? false
        guard master, ud.bool(forKey: "fh_health_asked") else { return }
        lock.lock()
        defer { lock.unlock() }
        guard queries.isEmpty else { return }
        let ids: [HKQuantityTypeIdentifier] = [.stepCount, .heartRate]
        for id in ids {
            guard let type = HKObjectType.quantityType(forIdentifier: id) else { continue }
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, done, error in
                if error != nil {
                    done()
                    return
                }
                Task { @MainActor in
                    if let api = HealthSync.backgroundAPI() { await HealthSync.shared.syncIfDue(api) }
                    done()
                }
            }
            hk.execute(query)
            queries.append(query)
            hk.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    func stop() {
        lock.lock()
        let list: [HKObserverQuery] = queries
        queries = []
        lock.unlock()
        for q in list { hk.stop(q) }
        hk.disableAllBackgroundDelivery { _, _ in }
    }
}

/// En bryter per datatype. Nøklene er de samme som shareHealth på serveren.
struct HealthGroup20: Identifiable {
    let id: String
    let name: String
    let icon: String
    let keys: [String]

    static let all: [HealthGroup20] = [
        HealthGroup20(id: "skritt", name: "Skritt", icon: "figure.walk", keys: ["steps"]),
        HealthGroup20(id: "puls", name: "Puls og hvilepuls", icon: "heart", keys: ["hr", "restingHr"]),
        HealthGroup20(id: "sovn", name: "Søvn", icon: "bed.double", keys: ["sleep"]),
        HealthGroup20(id: "akt", name: "Aktivitet og trening", icon: "flame", keys: ["activeKcal"]),
        HealthGroup20(id: "uke", name: "Siste 7 dager", icon: "calendar", keys: ["week"]),
    ]
}

/// Rad med ikon, tittel, undertekst og Papir-bryter.
struct HealthToggleRow20: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let icon: String
    let on: Bool
    var enabled: Bool = true
    let act: () -> Void

    var body: some View {
        Button {
            if enabled { act() }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.dyn51(size: 15, weight: .semibold)).foregroundStyle(p.lab)
                    .frame(width: 34, height: 34)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    if !sub.isEmpty {
                        Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 6)
                PaperSwitch(on: on)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .opacity(enabled ? 1 : 0.45)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityValue(on ? "På" : "Av")
    }
}

/// Rad som åpner noe («Be om tilgang ›», «Åpne iOS-innstillinger»).
struct HealthLinkRow20: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let icon: String
    var value: String = "›"
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.dyn51(size: 15, weight: .semibold)).foregroundStyle(p.lab)
                    .frame(width: 34, height: 34)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    if !sub.isEmpty {
                        Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 6)
                Text(value).font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Tynn skillelinje mellom radene i et kort.
struct HealthDivider20: View {
    @Environment(\.paper) private var p
    var body: some View { Rectangle().fill(p.line).frame(height: 1) }
}

/// Åpner appens side i iOS-innstillingene (Helse-appen kan ikke dyplenkes).
enum HealthLinks20 {
    static let howTo: String = "Helse → Profil → Apper → FinansHub"

    @MainActor static func openSettings() {
        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
    }
}

/// Innstillinger → App → «Helse og posisjon».
struct HealthPosSettings20: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.scenePhase) private var phase
    @MainActor private var h: HealthSync { HealthSync.shared }
    @MainActor private var m: FamilyModel { FamilyModel.shared }
    @State private var tick: Int = 0
    @State private var battery: Bool = (UserDefaults.standard.object(forKey: AcctScope.key("fh_share_battery")) as? Bool) ?? true

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Apple Health").padding(.leading, 4).padding(.top, 6)
            masterCard
            PLabel(text: "Datatyper").padding(.leading, 4).padding(.top, 14)
            typesCard
            PLabel(text: "Posisjon").padding(.leading, 4).padding(.top, 14)
            HealthLocationCard20(tick: tick)
            PLabel(text: "Tilgang i iOS").padding(.leading, 4).padding(.top, 14)
            iosCard
        }
        .onAppear { tick += 1 }
        .onChange(of: phase) { _, v in if v == .active { tick += 1 } }
    }

    private var masterCard: some View {
        VStack(spacing: 0) {
            if !h.available {
                Text("Apple Health finnes ikke på denne enheten (iPad eller simulator).").font(PF.ui(13)).foregroundStyle(p.mut)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14)
            } else {
                HealthToggleRow20(title: "Del helsedata", sub: h.statusText, icon: "heart.text.square", on: h.master) {
                    h.setMaster(!h.master, store)
                }
                HealthDivider20()
                HealthLinkRow20(title: "Be om tilgang", sub: h.asked ? "Spurt før · trykk for å spørre igjen" : "Ikke spurt ennå", icon: "checkmark.shield") {
                    Haptics.shared.tap()
                    Task {
                        await h.requestAll()
                        await h.syncNow(store.api)
                    }
                }
                if let why = HealthDiag25.problem(lastError: h.lastError) {
                    HealthDivider20()
                    HealthDiagRow25(text: why)
                }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 8)
    }

    private var typesCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(HealthGroup20.all.enumerated()), id: \.element.id) { i, g in
                if i > 0 { HealthDivider20() }
                typeRow(g)
            }
            HealthDivider20()
            HealthToggleRow20(title: "Batteri og bevegelse", sub: "Batterinivå og om du går, sykler eller kjører", icon: "battery.75percent", on: battery) {
                battery.toggle()
                UserDefaults.standard.set(battery, forKey: AcctScope.key("fh_share_battery"))
                Haptics.shared.select()
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 8)
    }

    private func typeRow(_ g: HealthGroup20) -> some View {
        let on: Bool = g.keys.contains { (h.share[$0] ?? false) == true }
        return HealthToggleRow20(title: g.name, sub: "", icon: g.icon, on: on && h.master, enabled: h.master && h.available) {
            h.setShareGroup(g.keys, !on, store)
        }
    }

    private var iosCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HealthLinkRow20(title: "Åpne iOS-innstillinger", sub: HealthLinks20.howTo, icon: "gearshape") {
                HealthLinks20.openSettings()
            }
            HealthDivider20()
            Text("iOS forteller ikke appen om lesetilgang er gitt. Viser Familie «Ingen data», sjekk tilgangen under \(HealthLinks20.howTo).")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                .padding(14)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 8)
    }
}

/// Posisjonsvalgene: Del med familien, Presis posisjon og Også i bakgrunnen.
struct HealthLocationCard20: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamilyModel { FamilyModel.shared }
    /// Endres når skjermen vises igjen, så tilgangsstatusen leses på nytt.
    let tick: Int

    var body: some View {
        let status: CLAuthorizationStatus = FamilyLocation.shared.status
        let always: Bool = status == .authorizedAlways
        let sharing: Bool = m.sharing == "on"
        VStack(spacing: 0) {
            HealthToggleRow20(title: "Del med familien", sub: sharing ? "Familien ser hvor du er" : "Familien ser ikke hvor du er", icon: "location", on: sharing) {
                m.setSharing(sharing ? "off" : "on", store)
            }
            HealthDivider20()
            HealthToggleRow20(title: "Presis posisjon", sub: "Av = omtrentlig (ca. 1 km)", icon: "scope", on: m.precision == "exact", enabled: sharing) {
                m.setPrecision(m.precision == "exact" ? "approx" : "exact", store)
            }
            HealthDivider20()
            HealthToggleRow20(title: "Også i bakgrunnen", sub: backgroundText(status), icon: "location.circle", on: always, enabled: sharing) {
                toggleBackground(status)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 8)
        .id(tick)
    }

    private func backgroundText(_ s: CLAuthorizationStatus) -> String {
        switch s {
        case .authorizedAlways: return "Posisjonen oppdateres også når appen er lukket"
        case .authorizedWhenInUse: return "Bare når appen er åpen"
        case .denied, .restricted: return "Avslått · slå på i iOS-innstillingene"
        default: return "Ikke spurt ennå"
        }
    }

    /// iOS lar ikke appen trekke tilbake «Alltid», så av (og avslått) åpner innstillingene.
    private func toggleBackground(_ s: CLAuthorizationStatus) {
        Haptics.shared.select()
        switch s {
        case .notDetermined: FamilyLocation.shared.start(store, precise: m.precision == "exact")
        case .authorizedWhenInUse: FamilyLocation.shared.requestAlways()
        default: HealthLinks20.openSettings()
        }
    }
}

/// Familie → Helse: forespørselen er vist, men det finnes ingen egne data. Viser fremgangsmåten.
struct HealthNoData20: View {
    @Environment(\.paper) private var p

    @MainActor static func shouldShow(_ m: FamilyModel) -> Bool {
        let h: HealthSync = HealthSync.shared
        guard h.asked, h.master, m.loaded else { return false }
        let mine: FamMember? = m.member(m.meId)
        return mine?.health == nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ingen data").font(PF.serif(19, medium: true)).foregroundStyle(p.ink)
            Text("Appen har spurt om tilgang til Apple Health, men fant ingen helsedata å vise. Sjekk at FinansHub har lesetilgang: \(HealthLinks20.howTo), og slå på typene du vil dele.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            PLineButton(title: "Åpne iOS-innstillinger", height: 38, full: true) { HealthLinks20.openSettings() }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
