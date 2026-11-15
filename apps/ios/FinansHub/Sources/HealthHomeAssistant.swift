import SwiftUI
import UIKit

/* ---------------- Prompt 42: Innstillinger → Helse (Familie) og helsedata fra Home Assistant ---------------- */
// claude-code-familie-helsekilder-innstillinger.md: Apple Health / Health Connect flyttes fra Familie → Helse hit.
// claude-code-helse-fra-home-assistant.md: Home Assistant · Mobilapp – enhetene fra HA Companion (mobile_app), kobling til
// person, valg av sensorer og lagring. Serveren leser HA (eksisterende integrasjon) og lagrer dagsaggregater.
// API (tåler 404 fra eldre servere): GET /api/family/health/ha → {connected, error, devices:[{id, name, model, platform,
// entities, sensors:[{key, label, entity}], person, selected:[key], updated}], members:[{id, name}]}
// og PUT /api/family/health/ha/<deviceId> {person, sensors:[key]}.

enum Health42 {
    /// Radene i gruppen HELSE (FAMILIE) i Innstillinger.
    @MainActor static func rows(_ store: Store, _ p: PaperPalette) -> [PaperLinkRow] {
        let h: HealthSync = HealthSync.shared
        let apple: Bool = h.master && h.share.values.contains(true)
        let hc: Bool = FamilyModel.shared.members.contains { (mem: FamMember) -> Bool in mem.health != nil && Fam22HealthSrc.isAndroid(mem) }
        let ha: HaHealth42 = HaHealth42.shared
        return [
            PaperLinkRow(name: "Apple Health", sub: apple ? "Koblet til via appen · iPhone" : "Ikke koblet til · trykk for å koble",
                         value: apple ? "✓ Koblet" : "Koble til ›", valueColor: apple ? p.pos : p.lab, icon: "heart") { store.paperGo("innst-helse") },
            PaperLinkRow(name: "Health Connect", sub: hc ? "Koblet til via appen · Android" : "Styres i Homelab-appen på Android",
                         value: hc ? "✓ Koblet" : "", valueColor: p.pos, icon: "cross") {
                store.flash("Health Connect: endre tilgang i Innstillinger → Health Connect → Apper → Homelab (på Android)")
            },
            PaperLinkRow(name: "Home Assistant · Mobilapp", sub: ha.summary, value: "Velg ›", valueColor: p.lab, icon: "house.and.flag") { store.paperGo("innst-hahelse") },
            PaperLinkRow(name: "Hva deles med familien", sub: "Skritt, søvn, puls og aktivitet · velg per person", value: "Velg ›", valueColor: p.lab, icon: "person.2") { store.paperGo("innst-helse") },
        ]
    }
}

struct HaSensor42: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let label: String
}

struct HaDevice42: Identifiable, Hashable {
    let id: String
    let name: String
    let model: String
    let platform: String
    let entities: Int
    let sensors: [HaSensor42]
    var person: String
    var selected: [String]
    let updated: String

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? "Enhet"
        model = JS.str(o, "model") ?? ""
        platform = (JS.str(o, "platform") ?? "").lowercased()
        entities = JS.int(o, "entities") ?? 0
        sensors = JS.list(o, "sensors").map { (s: [String: Any]) -> HaSensor42 in
            HaSensor42(key: JS.str(s, "key") ?? "", label: JS.str(s, "label") ?? JS.str(s, "key") ?? "")
        }.filter { !$0.key.isEmpty }
        person = JS.str(o, "person") ?? ""
        selected = JS.strings(o, "selected")
        updated = JS.str(o, "updated") ?? ""
    }

    var isIOS: Bool { platform == "ios" || name.lowercased().contains("iphone") || name.lowercased().contains("ipad") }
}

@MainActor
@Observable
final class HaHealth42 {
    static let shared = HaHealth42()
    static let defaults: [String] = ["steps", "heart_rate", "resting_heart_rate", "sleep_duration", "active_calories_burned", "activity"]

    var devices: [HaDevice42] = []
    var members: [(String, String)] = []
    var loaded: Bool = false
    var supported: Bool = true
    var connected: Bool = true
    var error: String = ""
    var saving: String? = nil

    var summary: String {
        if !supported { return "Hent helsesensorer fra HA Companion" }
        if !loaded { return "Hent helsesensorer fra HA Companion" }
        if !connected { return error.isEmpty ? "Koble til Home Assistant på nytt" : error }
        return "Hent helsesensorer fra HA Companion · \(devices.count) enheter"
    }

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/family/health/ha", timeout: 20)
            let o: [String: Any] = JS.obj(d)
            supported = true
            connected = JS.bool(o, "connected") ?? true
            error = JS.str(o, "error") ?? ""
            devices = JS.list(o, "devices").map { HaDevice42($0) }
            members = JS.list(o, "members").compactMap { (m: [String: Any]) -> (String, String)? in
                guard let id = JS.str(m, "id") else { return nil }
                return (id, JS.str(m, "name") ?? id)
            }
            if members.isEmpty {
                members = FamilyModel.shared.members.map { (mem: FamMember) -> (String, String) in (mem.id, mem.name) }
            }
        } catch let e as APIError where e.status == 404 {
            supported = false
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    /// Forslag fra navnet: «Rune iPhone 13» → Rune.
    func suggest(_ dev: HaDevice42) -> String {
        let n: String = dev.name.lowercased()
        return members.first { (m: (String, String)) -> Bool in
            let first: String = String(m.1.split(separator: " ").first ?? "").lowercased()
            return !first.isEmpty && n.contains(first)
        }?.0 ?? ""
    }

    func save(_ dev: HaDevice42, _ store: Store) async {
        saving = dev.id
        let e: String = dev.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? dev.id
        do {
            _ = try await store.api.callAt("/api", "PUT", "/family/health/ha/\(e)", json: ["person": dev.person, "sensors": dev.selected])
            Haptics.shared.success()
            store.flash("Lagret · første synk henter 30 dager")
        } catch let x as APIError where x.status == 404 {
            store.flash("Serveren støtter ikke helse fra Home Assistant ennå. Oppdater Homelab.")
        } catch {
            store.flash("Kunne ikke lagre: \(error.localizedDescription)")
        }
        saving = nil
    }
}

/// Innstillinger → Helse (Familie) → Home Assistant · Mobilapp.
struct HaHealthPage42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: HaHealth42 { HaHealth42.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Alle i familien har allerede Home Assistant-appen. Da kan Homelab lese helsesensorene derfra, uten at alle må installere Homelab-appen. Hver person godkjenner delingen første gang.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
            if !m.loaded {
                Text("Henter enhetene fra Home Assistant …").font(PF.ui(13)).foregroundStyle(p.mut).padding(.horizontal, 4)
            } else if !m.supported {
                note("Serveren støtter ikke helse fra Home Assistant ennå. Oppdater Homelab.")
            } else if !m.connected {
                note(m.error.isEmpty ? "Koble til Home Assistant på nytt under Innstillinger → Integrasjoner." : m.error)
                Button { store.paperGo("innst-integ") } label: {
                    Text("Åpne Integrasjoner ›").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab)
                }
                .buttonStyle(.plain).padding(.horizontal, 4)
            } else if m.devices.isEmpty {
                note("Fant ingen enheter fra Mobilapp-integrasjonen i Home Assistant.")
            } else {
                PLabel(text: "\(m.devices.count) enheter").padding(.leading, 4).padding(.top, 4)
                ForEach(m.devices) { (d: HaDevice42) in HaDeviceCard42(dev: d) }
            }
        }
        .task { await m.load(store) }
    }

    private func note(_ s: String) -> some View {
        Text(s).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Én HA-enhet: navn, modell, entiteter og helsesensorer, person og sensorvalg.
struct HaDeviceCard42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: HaHealth42 { HaHealth42.shared }
    let dev: HaDevice42
    @State private var person: String = ""
    @State private var picked: Set<String> = []
    @State private var ready: Bool = false

    var body: some View {
        let none: Bool = dev.sensors.isEmpty
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(dev.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(meta).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
                }
                Spacer(minLength: 6)
            }
            if none {
                Text("Ingen helsesensorer").font(PF.ui(12.5)).foregroundStyle(p.mut)
            } else {
                if dev.isIOS {
                    Text("Begrenset på iPhone: bare skritt, etasjer og aktivitet fra HA. Puls og søvn krever Homelab-appen (Apple Health).")
                        .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                Menu {
                    Button("Ingen") { person = "" }
                    ForEach(m.members, id: \.0) { (x: (String, String)) in Button(x.1) { person = x.0 } }
                } label: {
                    HStack {
                        Text("Person").font(PF.ui(13)).foregroundStyle(p.mut)
                        Spacer()
                        Text(personName).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                        Text("▾").font(PF.ui(11)).foregroundStyle(p.mut)
                    }
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                Fam22Flow(spacing: 6) {
                    ForEach(dev.sensors) { (s: HaSensor42) in chip(s) }
                }
                Button {
                    var d: HaDevice42 = dev
                    d.person = person
                    d.selected = dev.sensors.map(\.key).filter { picked.contains($0) }
                    Task { await m.save(d, store) }
                } label: {
                    Text(m.saving == dev.id ? "Lagrer …" : "Lagre").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(m.saving != nil)
            }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .opacity(none ? 0.6 : 1)
        .onAppear {
            if ready { return }
            ready = true
            person = dev.person.isEmpty ? m.suggest(dev) : dev.person
            let keys: [String] = dev.sensors.map(\.key)
            picked = Set(dev.selected.isEmpty ? keys.filter { HaHealth42.defaults.contains($0) } : dev.selected)
        }
    }

    private var meta: String {
        var parts: [String] = []
        if !dev.model.isEmpty { parts.append(dev.model) }
        if dev.entities > 0 { parts.append("\(dev.entities) entiteter") }
        parts.append(dev.sensors.isEmpty ? "ingen helsesensorer" : "\(dev.sensors.count) helsesensorer")
        if !dev.updated.isEmpty { parts.append(dev.updated) }
        return parts.joined(separator: " · ")
    }

    private var personName: String {
        if person.isEmpty { return "Velg" }
        return m.members.first { $0.0 == person }?.1 ?? person
    }

    private func chip(_ s: HaSensor42) -> some View {
        let on: Bool = picked.contains(s.key)
        return Button {
            Haptics.shared.select()
            if on { picked.remove(s.key) } else { picked.insert(s.key) }
        } label: {
            Text((on ? "✓ " : "") + s.label).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
