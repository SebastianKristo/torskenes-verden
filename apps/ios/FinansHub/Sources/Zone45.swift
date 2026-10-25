import SwiftUI
import UIKit
import UserNotifications
import Intents

/* ---------------- Prompt 45: sonevarsler – soneikon i varselet + av/på per person (claude-code-sonevarsler-ikon-bryter.md) ----------------
 Fasit: Sone Varsler.dc.html (1a iPhone, 1c innstillinger) og Familie.dc.html → Soner.
 – Familie → Soner, øverst: kortet «Posisjonsvarsler» med hovedbryter + bryter per person. Hovedbryter av → ingen varsler,
   personbryterne grå. Person av → ingen varsler om den personen i noen sone. «Vis eksempel på varsel» viser banneret i appen og
   legger et ekte eksempelvarsel på hjemskjermen etter 5 s (så det kan ses på iOS-hjemskjermen).
 – Innstillinger → Moduler → Sonevarsler: samme hovedbryter og personer + bryter per sone (med soneikon og farge).
 – Varselet: tittel = sonenavn, tekst = «Ingrid forlot Hjem», og sonens ikon i sonens farge der FinansHub-logoen står:
   Communication Notification (INSendMessageIntent med INImage av soneikonet, 40 × 40 pt, radius 11) – iOS viser da soneikonet
   stort og app-ikonet som lite merke. Krever capability «Communication Notifications»
   (com.apple.developer.usernotifications.communication) i signeringen; uten den feiler `updating(from:)`, og ikonet legges
   ved som bilde i varselet i stedet.
 – Lagres per bruker (mottakeren) på serveren: GET/PUT /api/family/zone-alerts (SERVER45). Eldre server (404): lokalt per konto. */

struct Zone45Person: Identifiable, Hashable {
    var id: String
    var name: String
    var initials: String
    var color: String
    var on: Bool
}

struct Zone45Zone: Identifiable, Hashable {
    var id: String
    var name: String
    var icon: String
    var color: String
    var on: Bool
}

@MainActor
@Observable
final class Zone45 {
    static let shared = Zone45()

    var on: Bool = true
    var people: [String: Bool] = [:]
    var zones: [String: Bool] = [:]
    var loaded: Bool = false
    var server: Bool = true
    var banner: Bool = false

    @ObservationIgnored private var bannerTask: Task<Void, Never>? = nil
    private static var key: String { AcctScope.key("papir_zone45") }

    init() { readLocal() }

    private func readLocal() {
        guard let d = UserDefaults.standard.dictionary(forKey: Zone45.key) else { return }
        on = (d["on"] as? Bool) ?? true
        people = (d["people"] as? [String: Bool]) ?? [:]
        zones = (d["zones"] as? [String: Bool]) ?? [:]
    }

    private func writeLocal() {
        UserDefaults.standard.set(["on": on, "people": people, "zones": zones], forKey: Zone45.key)
    }

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/family/zone-alerts", timeout: 12)
            apply(JS.obj(d))
            server = true
        } catch let e as APIError where e.status == 404 {
            server = false
            readLocal()
        } catch {
            readLocal()
        }
        loaded = true
    }

    private func apply(_ o: [String: Any]) {
        if let v = JS.bool(o, "on") { on = v }
        var p: [String: Bool] = [:]
        for x in JS.list(o, "people") { if let id = JS.str(x, "id") { p[id] = JS.bool(x, "on") ?? true } }
        var z: [String: Bool] = [:]
        for x in JS.list(o, "zones") { if let id = JS.str(x, "id") { z[id] = JS.bool(x, "on") ?? true } }
        people = p
        zones = z
        writeLocal()
    }

    func personOn(_ id: String) -> Bool { people[id] ?? true }
    func zoneOn(_ id: String) -> Bool { zones[id] ?? true }

    /// Brukes når et varsel skal vises (i tillegg til serverens filter og z.nt per sone).
    func allows(person: String, zone: String) -> Bool {
        on && (person.isEmpty || personOn(person)) && (zone.isEmpty || zoneOn(zone))
    }

    func setOn(_ v: Bool, _ store: Store) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { on = v }
        save(["on": v], store)
    }

    func setPerson(_ id: String, _ v: Bool, _ store: Store) {
        Haptics.shared.select()
        people[id] = v
        save(["people": [id: v]], store)
    }

    func setZone(_ id: String, _ v: Bool, _ store: Store) {
        Haptics.shared.select()
        zones[id] = v
        save(["zones": [id: v]], store)
    }

    private func save(_ body: [String: Any], _ store: Store) {
        writeLocal()
        let a: API = store.api
        Task { _ = try? await a.callAt("/api", "PUT", "/family/zone-alerts", json: body, timeout: 12) }
    }

    /// «Vis eksempel på varsel»: banneret i appen (4 s) og et ekte varsel på hjemskjermen etter 5 s.
    func sample(_ store: Store) {
        Haptics.shared.tap()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { banner = true }
        bannerTask?.cancel()
        bannerTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if !Task.isCancelled { withAnimation(.easeOut(duration: 0.25)) { self.banner = false } }
        }
        let s: (String, String, String, String) = Zone45.sampleParts()
        Zone45Notify.post(id: "zone-sample-\(Int(Date().timeIntervalSince1970))", zoneId: "", title: s.0, body: s.1, icon: s.2, color: s.3, delay: 5)
        store.flash("Gå til hjemskjermen – eksempelvarselet kommer om 5 sekunder")
    }

    /// Eksempelet: første sone og første person i familien (ellers «Hjem» og «Ingrid»).
    static func sampleParts() -> (String, String, String, String) {
        let m: FamilyModel = FamilyModel.shared
        let z: FamZone? = m.zones.first
        let who: String = m.members.first(where: { $0.id != m.meId })?.first ?? "Ingrid"
        let zn: String = z?.name ?? "Hjem"
        return (zn, who + " forlot " + zn, z?.icon ?? "home", z?.color ?? "#2f6b4a")
    }
}

/* ---------- Varselet med soneikonet ---------- */

enum Zone45Notify {
    /// Soneikonet hvitt på sonefargen, 40 × 40 pt med radius 11 (rendret @3x som PNG).
    @MainActor static func iconPNG(icon: String, color: String) -> Data? {
        let v = ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color(hex: color))
            Fam22Glyph(d: Fam22Icons.d(icon), size: 24, stroke: 2.2, color: Color.white)
        }
        .frame(width: 40, height: 40)
        let r: ImageRenderer = ImageRenderer(content: v)
        r.scale = 3
        return r.uiImage?.pngData()
    }

    /// Legger varselet. Communication Notification når appen har rettigheten, ellers vedlegg med ikonet.
    @MainActor static func post(id: String, zoneId: String, title: String, body: String, icon: String, color: String, delay: TimeInterval = 0) {
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = NotifyModel.currentSound()
        c.threadIdentifier = zoneId.isEmpty ? "sonevarsler" : "sone-" + zoneId
        c.userInfo = ["go": "familie", "kind": "zone", "zoneId": zoneId]
        let png: Data? = iconPNG(icon: icon, color: color)
        var out: UNNotificationContent = c
        if let png, let comm = communication(c, title: title, body: body, png: png, zoneId: zoneId) {
            out = comm
        } else if let png, let att = attachment(png, id: id) {
            c.attachments = [att]
        }
        let trigger: UNNotificationTrigger? = delay > 0 ? UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false) : nil
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: out, trigger: trigger)) { (_: Error?) in }
    }

    /// INSendMessageIntent med soneikonet som avsender- og gruppebilde. nil når rettigheten mangler.
    @MainActor private static func communication(_ c: UNMutableNotificationContent, title: String, body: String, png: Data, zoneId: String) -> UNNotificationContent? {
        let img: INImage = INImage(imageData: png)
        let handle: INPersonHandle = INPersonHandle(value: "sone-" + (zoneId.isEmpty ? "eksempel" : zoneId), type: .unknown)
        let sender: INPerson = INPerson(personHandle: handle, nameComponents: nil, displayName: title, image: img,
                                        contactIdentifier: nil, customIdentifier: "sone-" + zoneId)
        let intent: INSendMessageIntent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText, content: body,
                                                              speakableGroupName: nil, conversationIdentifier: "sone-" + zoneId,
                                                              serviceName: nil, sender: sender, attachments: nil)
        let interaction: INInteraction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)
        return try? c.updating(from: intent)
    }

    private static func attachment(_ png: Data, id: String) -> UNNotificationAttachment? {
        let url: URL = FileManager.default.temporaryDirectory.appendingPathComponent(id + ".png")
        do {
            try png.write(to: url)
            return try UNNotificationAttachment(identifier: "icon", url: url, options: nil)
        } catch {
            return nil
        }
    }
}

/* ---------- Familie → Soner: «Posisjonsvarsler» ---------- */

struct Zone45Card: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var z: Zone45 { Zone45.shared }
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(alignment: .leading, spacing: 12) {
            Zone45Master()
            ForEach(others) { (mem: FamMember) in Zone45PersonRow(mem: mem) }
            Button { z.sample(store) } label: {
                Text("Vis eksempel på varsel").font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                    .frame(minHeight: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
        .task { if !z.loaded { await z.load(store) } }
    }

    private var others: [FamMember] { m.members.filter { $0.id != m.meId } }
}

struct Zone45Master: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var z: Zone45 { Zone45.shared }

    var body: some View {
        Toggle(isOn: Binding<Bool>(get: { z.on }, set: { z.setOn($0, store) })) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Posisjonsvarsler").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                Text("Varsle når noen kommer eller går").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
        }
        .tint(p.lab)
    }
}

struct Zone45PersonRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var z: Zone45 { Zone45.shared }
    let mem: FamMember

    var body: some View {
        HStack(spacing: 12) {
            Text(Fam22Fmt.ini(mem)).font(PF.ui(12, .heavy)).foregroundStyle(Color.white)
                .frame(width: 32, height: 32)
                .background(Color(hex: Fam22Fmt.color(mem)), in: Circle())
            Text(mem.first).font(PF.ui(14.5, .semibold)).foregroundStyle(z.on ? p.ink : p.mut)
            Spacer(minLength: 6)
            Toggle("", isOn: Binding<Bool>(get: { z.personOn(mem.id) }, set: { z.setPerson(mem.id, $0, store) }))
                .labelsHidden()
                .tint(p.lab)
                .disabled(!z.on)
        }
        .opacity(z.on ? 1 : 0.5)
        .accessibilityLabel("Varsler om " + mem.first)
    }
}

struct Zone45ZoneRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var z: Zone45 { Zone45.shared }
    let zone: FamZone

    var body: some View {
        HStack(spacing: 12) {
            Fam22Glyph(d: Fam22Icons.d(zone.icon), size: 18, stroke: 2, color: Color.white)
                .frame(width: 32, height: 32)
                .background(Color(hex: zone.color), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            Text(zone.name).font(PF.ui(14.5, .semibold)).foregroundStyle(z.on ? p.ink : p.mut)
            Spacer(minLength: 6)
            Toggle("", isOn: Binding<Bool>(get: { z.zoneOn(zone.id) }, set: { z.setZone(zone.id, $0, store) }))
                .labelsHidden()
                .tint(p.lab)
                .disabled(!z.on)
        }
        .opacity(z.on ? 1 : 0.5)
    }
}

/// Banneret i appen (som iOS-varselet): soneikon i sonefarge, lite app-merke, tittel = sone, tekst = hendelse.
struct Zone45Banner: View {
    @MainActor private var z: Zone45 { Zone45.shared }

    var body: some View {
        if z.banner {
            let s: (String, String, String, String) = Zone45.sampleParts()
            HStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    Fam22Glyph(d: Fam22Icons.d(s.2), size: 22, stroke: 2.2, color: Color.white)
                        .frame(width: 40, height: 40)
                        .background(Color(hex: s.3), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    Okonomi40Icon(size: 16).offset(x: 4, y: 4)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.0).font(.dyn51(size: 15, weight: .semibold)).foregroundStyle(Color.primary).lineLimit(1)
                    Text(s.1).font(.dyn51(size: 15)).foregroundStyle(Color.primary).lineLimit(2)
                }
                Spacer(minLength: 4)
                Text("nå").font(.dyn51(size: 13)).foregroundStyle(Color.secondary)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color.black.opacity(0.18), radius: 16, y: 8)
            .padding(.horizontal, 10)
            .frame(maxWidth: 480)
            .transition(.move(edge: .top).combined(with: .opacity))
            .onTapGesture { withAnimation(.easeOut(duration: 0.2)) { z.banner = false } }
        }
    }
}

/// Innstillinger → Moduler → Sonevarsler.
struct Zone45SettingsPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var z: Zone45 { Zone45.shared }
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PCard { Zone45Master() }
            if !others.isEmpty {
                PLabel(text: "Personer").padding(.leading, 4).padding(.top, 6)
                PCard { VStack(spacing: 12) { ForEach(others) { (mem: FamMember) in Zone45PersonRow(mem: mem) } } }
            }
            if !m.zones.isEmpty {
                PLabel(text: "Soner").padding(.leading, 4).padding(.top, 6)
                PCard { VStack(spacing: 12) { ForEach(m.zones) { (zn: FamZone) in Zone45ZoneRow(zone: zn) } } }
            }
            Button { z.sample(store) } label: {
                Text("Vis eksempel på varsel").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab)
                    .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text("Varselet viser sonens ikon i sonens farge. Valgene gjelder bare varslene du får, og ingen posisjonsdata deles i tillegg.")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
        .overlay(alignment: .top) { Zone45Banner() }
        .task {
            if m.members.isEmpty { await m.load(store) }
            await z.load(store)
        }
    }

    private var others: [FamMember] { m.members.filter { $0.id != m.meId } }
}
