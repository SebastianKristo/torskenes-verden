import SwiftUI
import UIKit
import AVFoundation
import AudioToolbox
import UserNotifications
import UniformTypeIdentifiers

/* ---------------- Prompt 16–17: appnavn, app-ikon, varsler, sanntid og innstillinger i Papir ---------------- */

/* ---------- Appnavn og app-ikon ---------- */

/// Navnet på appen (settings.app_name på serveren, vises på Hjem og i innloggingen) og valgt app-ikon (per enhet).
@MainActor
@Observable
final class AppMeta {
    static let shared = AppMeta()

    var name: String = UserDefaults.standard.string(forKey: "fh_app_name") ?? "Homelab" {
        didSet { UserDefaults.standard.set(name, forKey: "fh_app_name") }
    }
    var icon: String = UserDefaults.standard.string(forKey: "fh_app_icon") ?? "monogram" {
        didSet { UserDefaults.standard.set(icon, forKey: "fh_app_icon") }
    }

    /// (id, navn, forhåndsvisning i asset-katalogen, alternativt ikon i iOS).
    static let icons: [(String, String, String, String?)] = [
        // Prompt 39: «Papir-monogram» er nytt standardikon (AppIcon); «Huset med stativ» er alternativt.
        ("monogram", "Papir-monogram", "IconPreviewMonogram", nil),
        ("hus", "Huset med stativ", "IconPreviewHus", "AppIcon-Hus"),
        ("rom", "Fire rom", "IconPreviewRom", "AppIcon-Rom"),
        // Prompt 40: Økonomi-ikonet 3c (hvit lommebok med budsjettring på mørk blå #1B2A40).
        ("okonomi", "Økonomi · lommebok", "IconPreviewOkonomi", "AppIcon-Okonomi"),
    ]
    static let suggestions = ["Homelab", "Torskenes Verden"]

    var iconName: String { AppMeta.icons.first { $0.0 == icon }?.1 ?? "Papir-monogram" }

    func load(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/app", timeout: 10) else { return }
        let o = JS.obj(d)
        if let n = JS.str(o, "name"), !n.isEmpty, n != name { name = n }
    }

    func setName(_ n: String, _ store: Store) {
        let v = n.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { return }
        let old = name
        name = String(v.prefix(40))
        Haptics.shared.success()
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/app", json: ["name": self.name])
                store.flash("Appen heter nå «\(self.name)»")
            } catch let e as APIError {
                if e.status == 403 {
                    self.name = old
                    store.flash("Bare admin kan endre navnet på appen")
                } else {
                    store.flash("Navnet er lagret på denne enheten. Serveren svarte: \(e.message)")
                }
            } catch {
                store.flash(error.localizedDescription)
            }
        }
    }

    /// Bytter ikon på hjemskjermen (iOS viser selv en bekreftelse). Mørk og tonet variant følger med hvert ikon.
    func setIcon(_ id: String, _ store: Store) {
        guard let entry = AppMeta.icons.first(where: { $0.0 == id }) else { return }
        guard UIApplication.shared.supportsAlternateIcons else {
            store.flash("Denne enheten støtter ikke å bytte app-ikon")
            return
        }
        let target = entry.3
        UIApplication.shared.setAlternateIconName(target) { err in
            Task { @MainActor in
                if let err {
                    store.flash("Kunne ikke bytte ikon: \(err.localizedDescription)")
                } else {
                    AppMeta.shared.icon = id
                    Haptics.shared.success()
                }
            }
        }
        Task { _ = try? await store.api.callAt("/api", "PUT", "/app", json: ["icon": id]) }
        store.savePaperLayout(["appIcon": id])
    }
}

/* ---------- Varsler ---------- */

/// Innstillinger → Varsler: hovedbryter, stille timer, lyd, volum og grupper. Lagres i /api/me/notify.
@MainActor
@Observable
final class NotifyModel {
    static let shared = NotifyModel()

    var on = true
    var quietOn = false
    var quietFrom = "22:00"
    var quietTo = "07:00"
    var sound = "klokke"
    var volume: Double = 80
    var groups: [String: Bool] = ["pakker": true, "finans": true, "familie": true, "reise": true, "birthdays": true, "haptikk": true]
    var hasCustom = false
    /// Prompt 31: «AI-svar i bakgrunnen» (ai_bg_notify, på som standard).
    var aiBg = true
    /// Prompt 39: n_ai_in – prompt 45: brukes ikke lenger (ingen banner ved retur), leses bare så lagringen er uendret.
    var aiIn = true
    var authorized: UNAuthorizationStatus = .notDetermined
    var loaded = false
    private var player: AVAudioPlayer?

    static let sounds: [(String, String)] = [("klokke", "Klokke"), ("pling", "Pling"), ("papir", "Papir"), ("dobbel", "Dobbel"), ("dyp", "Dyp"), ("egen", "Egen lyd"), ("stille", "Stille")]
    static let groupNames: [(String, String, String)] = [
        ("pakker", "Pakker", "Ny sending, klar for henting, levert og forsinket"),
        ("finans", "Finans og hjem", "Kvitteringer, budsjett, abonnementer og boliger"),
        ("familie", "Familie", "Når noen kommer til eller forlater en sone"),
        ("reise", "Reise og vær", "Avganger og værvarsler"),
        ("birthdays", "Bursdager", "Påminnelse kl. 09:00 før bursdager"),
        ("haptikk", "Haptikk", "Vibrasjon sammen med varslene"),
    ]

    init() {
        let d = UserDefaults.standard
        if let o = d.dictionary(forKey: "fh_notify") { apply(o) }
    }

    func apply(_ o: [String: Any]) {
        if let v = JS.bool(o, "on") { on = v }
        if let v = JS.str(o, "quietFrom") { quietFrom = v }
        if let v = JS.str(o, "quietTo") { quietTo = v }
        if let v = JS.bool(o, "quietOn") { quietOn = v }
        if let v = JS.str(o, "sound") { sound = v }
        if let v = JS.num(o, "volume") { volume = v }
        if let g = JS.dict(o, "groups") { for (k, v) in g { if let b = v as? Bool { groups[k] = b } } }
        if let v = JS.bool(o, "customSound") { hasCustom = v }
        if let v = JS.bool(o, "ai_bg_notify") { aiBg = v }
        if let v = JS.bool(o, "n_ai_in") { aiIn = v }
    }

    private var body: [String: Any] {
        ["on": on, "quietOn": quietOn, "quietFrom": quietFrom, "quietTo": quietTo, "sound": sound, "volume": Int(volume), "groups": groups,
         "ai_bg_notify": aiBg, "n_ai_in": aiIn]
    }

    func load(_ store: Store) async {
        refreshAuth()
        if let d = try? await store.api.callAt("/api", "GET", "/me/notify", timeout: 10) {
            apply(JS.obj(d))
            UserDefaults.standard.set(body, forKey: "fh_notify")
        }
        loaded = true
        await ensureSound(store)
    }

    func save(_ store: Store) {
        UserDefaults.standard.set(body, forKey: "fh_notify")
        let b = body
        Task { _ = try? await store.api.callAt("/api", "PUT", "/me/notify", json: b) }
    }

    func refreshAuth() {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            let st = s.authorizationStatus
            Task { @MainActor in NotifyModel.shared.authorized = st }
        }
    }

    func requestAuth() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            Task { @MainActor in NotifyModel.shared.refreshAuth() }
        }
    }

    /// Stille timer: true når klokka er innenfor intervallet (kan gå over midnatt).
    var inQuietHours: Bool {
        guard quietOn else { return false }
        let now = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let n = (now.hour ?? 0) * 60 + (now.minute ?? 0)
        let a = minutes(quietFrom), b = minutes(quietTo)
        if a == b { return false }
        return a < b ? (n >= a && n < b) : (n >= a || n < b)
    }

    private func minutes(_ s: String) -> Int {
        let p = s.split(separator: ":").compactMap { Int($0) }
        return (p.first ?? 0) * 60 + (p.count > 1 ? p[1] : 0)
    }

    /// Skal et varsel i gruppen vises?
    func allows(_ group: String?) -> Bool {
        guard on else { return false }
        if let group, groups[group] == false { return false }
        return true
    }

    /// Lyden til varslene: den valgte lyden ligger i Library/Sounds (lastet ned fra serveren), ellers standardlyden.
    var notificationSound: UNNotificationSound? {
        if sound == "stille" || inQuietHours { return nil }
        let file = NotifyModel.soundFile(sound)
        if FileManager.default.fileExists(atPath: NotifyModel.soundsDir.appendingPathComponent(file).path) {
            return UNNotificationSound(named: UNNotificationSoundName(file))
        }
        return .default
    }

    /* Lest direkte fra UserDefaults, så varsler fra bakgrunnen (sporing, familie) kan bruke valgene uten hovedtråden. */

    nonisolated static func stored() -> [String: Any] { UserDefaults.standard.dictionary(forKey: "fh_notify") ?? [:] }

    nonisolated static func allowed(_ group: String?) -> Bool {
        let o = stored()
        if (o["on"] as? Bool) == false { return false }
        if let group, let g = o["groups"] as? [String: Any], (g[group] as? Bool) == false { return false }
        return true
    }

    nonisolated static func currentSound() -> UNNotificationSound? {
        let o = stored()
        let id = (o["sound"] as? String) ?? "klokke"
        if id == "stille" { return nil }
        if (o["quietOn"] as? Bool) == true, let a = o["quietFrom"] as? String, let b = o["quietTo"] as? String, quiet(a, b) { return nil }
        let file = soundFile(id)
        if FileManager.default.fileExists(atPath: soundsDir.appendingPathComponent(file).path) { return UNNotificationSound(named: UNNotificationSoundName(file)) }
        return .default
    }

    nonisolated static func quiet(_ from: String, _ to: String) -> Bool {
        func mins(_ s: String) -> Int {
            let p = s.split(separator: ":").compactMap { Int($0) }
            return (p.first ?? 0) * 60 + (p.count > 1 ? p[1] : 0)
        }
        let c = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let n = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        let a = mins(from), b = mins(to)
        if a == b { return false }
        return a < b ? (n >= a && n < b) : (n >= a || n < b)
    }

    nonisolated static var soundsDir: URL {
        let lib = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Sounds", isDirectory: true)
        try? FileManager.default.createDirectory(at: lib, withIntermediateDirectories: true)
        return lib
    }
    nonisolated static func soundFile(_ id: String) -> String { id == "egen" ? "fh-egen.caf" : "fh-\(id).wav" }

    /// Laster ned den valgte lyden til Library/Sounds, så iOS kan spille den i varslene.
    func ensureSound(_ store: Store) async {
        guard sound != "stille" else { return }
        let url = NotifyModel.soundsDir.appendingPathComponent(NotifyModel.soundFile(sound))
        if FileManager.default.fileExists(atPath: url.path) && sound != "egen" { return }
        let path = sound == "egen" ? "/api/me/notify/sound" : "/assets/sounds/\(sound).wav"
        if let d = try? await store.api.bytes(path), d.count > 100 { try? d.write(to: url) }
    }

    func pick(_ id: String, _ store: Store) {
        sound = id
        save(store)
        Task {
            await ensureSound(store)
            self.preview()
        }
    }

    /// Spiller lyden i appen (med volum) og vibrerer.
    func preview() {
        guard sound != "stille" else { Haptics.shared.tick(); return }
        let url = NotifyModel.soundsDir.appendingPathComponent(NotifyModel.soundFile(sound))
        if let pl = try? AVAudioPlayer(contentsOf: url) {
            pl.volume = Float(volume / 100)
            pl.play()
            player = pl
        } else {
            AudioServicesPlaySystemSound(1007)
        }
        if groups["haptikk"] != false { Haptics.shared.success() }
    }

    /// «Test varsel»: lyd, vibrasjon og et ekte varsel om 2 sekunder.
    func test(_ store: Store) {
        requestAuth()
        preview()
        let c = UNMutableNotificationContent()
        c.title = AppMeta.shared.name
        c.body = "Slik ser varslene ut. Lyd: \(NotifyModel.sounds.first { $0.0 == sound }?.1 ?? sound)."
        c.sound = notificationSound
        let t = UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "fh-test-\(Date().timeIntervalSince1970)", content: c, trigger: t))
        store.flash("Test-varselet kommer om 2 sekunder")
    }

    /// Egen lyd: MP3, WAV eller M4A under 1 MB. Lagres på serveren og lastes ned hit.
    func uploadCustom(_ url: URL, _ store: Store) {
        let ok = url.startAccessingSecurityScopedResource()
        defer { if ok { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { store.flash("Kunne ikke lese lydfilen"); return }
        guard data.count < 1_000_000 else { store.flash("Lydfilen må være under 1 MB"); return }
        let ext = url.pathExtension.lowercased()
        let mime = ext == "mp3" ? "audio/mpeg" : ext == "m4a" ? "audio/mp4" : "audio/wav"
        // iOS spiller bare korte lyder i formatene aiff/wav/caf i varsler; vi lagrer filen lokalt med .caf-navn
        // hvis den er wav, ellers brukes den i appen (forhåndsvisning) og standardlyden i varselet.
        let local = NotifyModel.soundsDir.appendingPathComponent(NotifyModel.soundFile("egen"))
        try? data.write(to: local)
        Task {
            do {
                _ = try await store.api.upload("/me/notify/sound", parts: [API.Part(name: "file", filename: "egen.\(ext)", mime: mime, data: data)], prefix: "/api")
                self.hasCustom = true
                self.sound = "egen"
                self.save(store)
                self.preview()
                store.flash("Egen lyd er lagret")
            } catch {
                store.flash("Kunne ikke laste opp lyden: \(error.localizedDescription)")
            }
        }
    }

    func removeCustom(_ store: Store) {
        hasCustom = false
        if sound == "egen" { sound = "klokke" }
        try? FileManager.default.removeItem(at: NotifyModel.soundsDir.appendingPathComponent(NotifyModel.soundFile("egen")))
        save(store)
        Task { _ = try? await store.api.callAt("/api", "DELETE", "/me/notify/sound") }
    }
}

struct PaperNotifySettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var importing = false
    @MainActor private var n: NotifyModel { NotifyModel.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Varsler").padding(.leading, 4).padding(.top, 6)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    toggleRow("Varsler", "Hovedbryter for alle varsler fra appen", n.on) { n.on = $0; n.save(store) }
                    sep
                    // Prompt 31: Glimt-svar som varsel når appen er lukket (Assist31.swift / Notify31.swift).
                    if n.on {
                        toggleRow("AI-svar i bakgrunnen", "Får du svar mens du er ute av appen, kommer det som varsel fra Glimt", n.aiBg) { n.aiBg = $0; n.save(store) }
                        sep
                        // Prompt 45: «Vis svaret i appen også» (n_ai_in) er fjernet – svar mens appen er lukket kommer bare som varsel.
                        // Prompt 39: flyttet hit fra PROGRAMVARE (samme nøkkel, notify_updates / upd_note).
                        if Update28Model.isAdmin(store) {
                            toggleRow("Varsle om nye versjoner", "Nordlys OS · banner på Hjem og push", Update30Model.shared.notifyUpdates) { Update30Model.shared.setSetting("notify_updates", $0, store) }
                            sep
                        }
                    }
                    toggleRow("Stille timer", "\(n.quietFrom)–\(n.quietTo): ingen lyd", n.quietOn) { n.quietOn = $0; n.save(store) }
                    if n.quietOn { quietRow; sep }
                    if !n.quietOn { sep }
                    permissionRow
                    sep
                    Button { n.test(store) } label: {
                        HStack {
                            Text("Test varsel").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                            Spacer()
                            Text("Spill av ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            PLabel(text: "Varsellyd").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(NotifyModel.sounds.enumerated()), id: \.element.0) { i, s in
                        if i > 0 { sep }
                        soundRow(s.0, s.1)
                    }
                    sep
                    volumeRow
                }
            }
            PLabel(text: "Grupper").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(NotifyModel.groupNames.enumerated()), id: \.element.0) { i, g in
                        if i > 0 { sep }
                        toggleRow(g.1, g.2, n.groups[g.0] ?? true) { n.groups[g.0] = $0; n.save(store) }
                    }
                }
            }
            PaperLinkList(rows: [
                PaperLinkRow(name: "Pakkevarsler", sub: "Nytt sporingsnummer, ute for levering, klar for henting, levert og forsinket", icon: "shippingbox") { store.paperGo("innst-trk") },
                PaperLinkRow(name: "Haptikk", sub: "Styrke og når appen skal vibrere", icon: "hand.tap", colorOffset: 1) { store.paperGo("innst-haptikk") },
            ])
            Text("Varslene vises som lokale varsler når appen henter nye data. Ekte push fra serveren er ikke bygget ennå.")
                .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 10).fixedSize(horizontal: false, vertical: true)
        }
        .task { await n.load(store) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.mp3, .wav, .mpeg4Audio, .audio]) { r in
            if case .success(let url) = r { n.uploadCustom(url, store) }
        }
    }

    private var sep: some View { Rectangle().fill(p.line).frame(height: 1) }

    private func toggleRow(_ t: String, _ sub: String, _ on: Bool, _ set: @escaping (Bool) -> Void) -> some View {
        Toggle(isOn: Binding(get: { on }, set: { set($0); Haptics.shared.select() })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private var quietRow: some View {
        HStack(spacing: 10) {
            Text("Fra").font(PF.ui(13)).foregroundStyle(p.mut)
            timeField(n.quietFrom) { n.quietFrom = $0; n.save(store) }
            Text("til").font(PF.ui(13)).foregroundStyle(p.mut)
            timeField(n.quietTo) { n.quietTo = $0; n.save(store) }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.bottom, 10)
    }

    private func timeField(_ v: String, _ set: @escaping (String) -> Void) -> some View {
        let parts = v.split(separator: ":").compactMap { Int($0) }
        let date = Calendar.current.date(bySettingHour: parts.first ?? 22, minute: parts.count > 1 ? parts[1] : 0, second: 0, of: Date()) ?? Date()
        return DatePicker("", selection: Binding(get: { date }, set: { d in
            let c = Calendar.current.dateComponents([.hour, .minute], from: d)
            set(String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0))
        }), displayedComponents: .hourAndMinute)
        .labelsHidden()
    }

    private var permissionRow: some View {
        let st = n.authorized
        let text: String
        switch st {
        case .authorized, .provisional, .ephemeral: text = "Tillatt"
        case .denied: text = "Avslått · åpne Innstillinger"
        default: text = "Be om tillatelse ›"
        }
        return Button {
            if st == .denied, let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } else { n.requestAuth() }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tillatelse på enheten").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text("iOS-varsler (lokale varsler i appen)").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer()
                Text(text).font(PF.ui(13, .semibold)).foregroundStyle(st == .authorized ? p.pos : p.lab)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func soundRow(_ id: String, _ name: String) -> some View {
        let on = n.sound == id
        return Button {
            if id == "egen" && !n.hasCustom { importing = true } else { n.pick(id, store) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: id == "stille" ? "speaker.slash" : id == "egen" ? "music.note" : "speaker.wave.2")
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(on ? p.lab : p.mut).frame(width: 24)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    if id == "egen" {
                        Text(n.hasCustom ? "Lastet opp · trykk for å bruke" : "Last opp MP3, WAV eller M4A under 1 MB").font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                }
                Spacer()
                if id == "egen" && n.hasCustom {
                    Button { importing = true } label: { Text("Bytt").font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab) }.buttonStyle(.plain)
                    Button { n.removeCustom(store) } label: { Text("Fjern").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut) }.buttonStyle(.plain)
                }
                if on { Text("✓").font(PF.ui(14, .bold)).foregroundStyle(p.pos) }
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var volumeRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "speaker.fill").foregroundStyle(p.mut)
            Slider(value: Binding(get: { n.volume }, set: { n.volume = $0 }), in: 0...100, onEditingChanged: { editing in
                if !editing { n.save(store); n.preview() }
            })
            .tint(p.lab)
            Image(systemName: "speaker.wave.3.fill").foregroundStyle(p.mut)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }
}

/* ---------- Sanntid (WebSocket /api/ws) ---------- */

/// Én felles WebSocket mot serveren. Meldingene {type:'tasks'|'family'|'tracking'} gjør at listene hentes på nytt.
@MainActor
final class Realtime: NSObject {
    static let shared = Realtime()
    private var task: URLSessionWebSocketTask?
    private weak var store: Store?
    private var key = ""
    private var retry: Double = 2

    func connect(_ store: Store) {
        self.store = store
        guard let token = store.account?.token, !store.api.base.isEmpty else { return }
        let base = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let ws = base.replacingOccurrences(of: "https://", with: "wss://").replacingOccurrences(of: "http://", with: "ws://")
        let enc = token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? token
        guard let url = URL(string: ws + "/api/ws?token=" + enc) else { return }
        if key == url.absoluteString, task != nil { return }
        disconnect()
        key = url.absoluteString
        let t = URLSession.shared.webSocketTask(with: url)
        task = t
        t.resume()
        receive(t)
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        key = ""
    }

    private func receive(_ t: URLSessionWebSocketTask) {
        t.receive { result in
            Task { @MainActor in
                guard t === Realtime.shared.task else { return }
                switch result {
                case .success(let msg):
                    Realtime.shared.retry = 2
                    var data: Data?
                    switch msg {
                    case .string(let s): data = s.data(using: .utf8)
                    case .data(let d): data = d
                    @unknown default: data = nil
                    }
                    if let data { Realtime.shared.handle(JS.obj(data)) }
                    Realtime.shared.receive(t)
                case .failure:
                    Realtime.shared.reconnectLater()
                }
            }
        }
    }

    private func reconnectLater() {
        task = nil
        let k = key
        key = ""
        let wait = retry
        retry = Swift.min(60, retry * 2)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(wait))
            guard Realtime.shared.task == nil, !k.isEmpty, let s = Realtime.shared.store, s.loggedIn else { return }
            Realtime.shared.connect(s)
        }
    }

    private func handle(_ o: [String: Any]) {
        guard let store else { return }
        switch JS.str(o, "type") ?? "" {
        case "tasks": Task { await TasksModel.shared.load(store) }
        // Prompt 40: Hjemlys (husstanden, sen/hjemme) og Glimt-innstillinger (julemodus fra en annen enhet).
        case "hjemlys": Task { await Hjemlys40Model.shared.load(store) }
        case "glimt:settings", "glimt-settings": Task { await Glimt35Model.shared.load(store) }
        case "family":
            if JS.str(o, "kind") == "ping" {
                // Noen i familien ber telefonen spille lyd («Finn telefonen»).
                NotifyModel.shared.preview()
                LocalNotify.post("Familie", "\(JS.str(o, "fromName") ?? "Noen") vil finne telefonen din", id: "ping-\(Date().timeIntervalSince1970)", group: nil)
                return
            }
            // Prompt 50: steder endret (geofence-regioner, Steder, Ruter-skolen) og innsjekker (Family50Notify.swift).
            if Fam50Notify.realtime(o, store) { return }
            Task { await FamilyModel.shared.load(store); await FamilyModel.shared.pollEvents(store.api) }
        case "tracking": Task { try? await store.loadTracking() }
        // Prompt 29: rask time ferdig eller feilet (Quick29Model.swift).
        case "calendar-quick":
            // Prompt 31: steg, felt og fremdrift til glassboblen (AiJob31.swift).
            AiJobs31.shared.update(JS.dict(o, "data") ?? o, kind: "quick")
            Quick29Model.shared.poke(store)
        // Prompt 31: Glimt-svar (POST /api/assist som serverjobb, Assist31.swift).
        case "assist": Assist31.shared.realtime(JS.dict(o, "data") ?? o, store)
        // Prompt 36: felles matplan endret av noen i husstanden (Mat36.swift).
        case "meal:changed", "meal": Mat36.changed(JS.dict(o, "data") ?? o, store)
        default:
            // Prompt 39: fremdrift for «✦ På nytt» på kvitteringer ({jobId, step, pct, msg}), samme kanal som køen (Receipt39.swift).
            let d39: [String: Any] = JS.dict(o, "data") ?? o
            if JS.str(d39, "step") != nil { Rean39Model.shared.realtime(d39, store) }
        }
    }
}

/* ---------- Innstillinger (Papir): gruppert som i designet ---------- */

struct PaperSettings17: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var naming = false
    @State private var picking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Prompt 24: «Søk i innstillinger» og ✦ AI øverst. Med et søk vises treffene i stedet for gruppene.
            Set24Search()
            if Set24Model.shared.query.trimmingCharacters(in: .whitespaces).isEmpty {
                mainGroups
            } else {
                Set24Results()
            }
        }
        .sheet(isPresented: $naming) {
            AppName24Sheet { naming = false }.environment(\.paper, p).presentationDetents([.medium, .large]).sheetEdge30(p.bg)
        }
        .sheet(isPresented: $picking) {
            AppIconSheet { picking = false }.environment(\.paper, p).presentationDetents([.medium, .large]).sheetEdge30(p.bg)
        }
        .task {
            await NotifyModel.shared.load(store)
            if Update28Model.isAdmin(store) { await Update28Model.shared.load(store) }
            if Backup29Model.isAdmin(store) && !Backup29Model.shared.loaded { await Backup29Model.shared.load(store) }
            await Update30Model.shared.load(store)
        }
        .update30Sheet()
    }

    @ViewBuilder private var mainGroups: some View {
            // Prompt 30: oppdateringsbanneret øverst i Innstillinger (kan ikke skjules her).
            Update30Banner(home: false).padding(.top, 8)
            profileCard
            // Prompt 50: gruppene ligger i PaperSettings17.groups50, så venstre kolonne på Fold/iPad (Settings50Wide.swift)
            // viser nøyaktig de samme radene.
            ForEach(PaperSettings17.groups50(store, p)) { (g: Settings50Group) in
                group(g.title, g.offset, g.rows)
            }
            if Update28Model.isAdmin(store) {
                // Prompt 30: PROGRAMVARE (Oppdater ›, automatiske oppdateringer, varsle om nye versjoner). Update30.swift.
                Update30Software()
                AppUpd32Row(label: false) // prompt 32: appens versjon og «Last ned IPA» (AppUpdate32.swift)
                // Prompt 32: raden «Oppdatering» under SYSTEM er fjernet. PROGRAMVARE → Nordlys OS er eneste sted å oppdatere
                // (claude-code-fjern-oppdatering-rad.md); SYSTEM-gruppen ble tom og vises ikke.
            } else {
                AppUpd32Row(label: true)
            }
            // Prompt 38: «Logg ut» (og Lås skjermen) står nå under ØKT nederst på Konto-siden (Konto38.swift).
            Text("\(AppMeta.shared.name) · versjon \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–")")
                .font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).frame(maxWidth: .infinity).padding(.top, 14)
    }

    /// Alle radgruppene i Innstillinger (tittel, fargeforskyvning, rader). Brukes av telefonlisten og venstre kolonne på Fold/iPad.
    @MainActor static func groups50(_ store: Store, _ p: PaperPalette) -> [Settings50Group] {
        // Prompt 67 (prompt 50b/66, settings65.js MENU65): gruppert som på web – Generelt · Brukere og familie · Glimt og AI ·
        // Tilkoblinger · Moduler · Server. Ingen side er fjernet, bare flyttet; Finans-radene ligger under Moduler → Finans.
        var out: [Settings50Group] = []
        out.append(Settings50Group(title: "Generelt", offset: 0, rows: generalRows67(store)))
        // Prompt 42: Apple Health, Health Connect, Home Assistant · Mobilapp og hva som deles (Health42.swift).
        var family: [PaperLinkRow] = [
            PaperLinkRow(name: "Familie og helse", sub: "Deling av posisjon, personvern og Apple Helse", icon: "person.2") { store.paperGo("innst-fam") },
        ]
        family.append(contentsOf: Health42.rows(store, p))
        family.append(PaperLinkRow(name: "Helse og posisjon", sub: HealthSync.shared.master ? "Apple Health er på · posisjon og bakgrunn" : "Apple Health er av · posisjon og bakgrunn", icon: "heart.text.square") { store.paperGo("innst-helse") })
        out.append(Settings50Group(title: "Brukere og familie", offset: 4, rows: family))
        out.append(Settings50Group(title: "Glimt og AI", offset: 5, rows: [
            // Prompt 67: Glimt-siden (figur/brief/stemme, Glimt husker, Entitetsregister, Glimt lærer, Faste oppgaver, Kvalitet).
            PaperLinkRow(name: "Glimt", sub: "Figur, brief, stemme · Glimt husker, lærer, faste oppgaver og kvalitet", icon: "sparkle", tint30: Color(hex: "#b23a2a")) { store.paperGo("innst-glimt") },
            // Prompt 34: AI-kontroll i fullskjerm.
            PaperLinkRow(name: "AI", sub: "Modeller, jobber, forbruk og nøkler", icon: "cpu") { AiCtl34.shared.show("ov") },
        ]))
        out.append(Settings50Group(title: "Tilkoblinger", offset: 2, rows: [
            PaperLinkRow(name: "Integrasjoner", sub: "Home Assistant, Media, Entur, Bring og 17 til", icon: "point.3.connected.trianglepath.dotted") { store.paperGo("innst-integ") },
            PaperLinkRow(name: "Kalendere", sub: "Google Kalender · Home Assistant · Skole-iCal", icon: "calendar") { Int26Nav.openKal(from: nil, store) },
            // Prompt 44/45: Gjøremål (synk med Home Assistant) – på web under «Kalender og gjøremål».
            PaperLinkRow(name: "Gjøremål", sub: "Synk med Home Assistant · på/av", icon: "checklist") { store.paperGo("innst-huske") },
        ]))
        // Prompt 45: én rad per modul (Settings45.swift). Gjøremål står under Tilkoblinger.
        var modules: [PaperLinkRow] = [
            PaperLinkRow(name: "Moduler", sub: "Sporing, Domener, Mat, Familie, Avganger og Vær", icon: "square.grid.2x2") { store.paperGo("innst-hl") },
            PaperLinkRow(name: "Finans", sub: "AI og tolkning, kategorier, regler, bank, aksjer og abonnementer", icon: "creditcard") { store.paperGo("innst-finans67") },
        ]
        modules.append(contentsOf: Settings45.rows(store).filter { (r: PaperLinkRow) -> Bool in r.name != "Gjøremål" })
        modules.append(PaperLinkRow(name: "Nyhetsleser", sub: "Kilder og AI", icon: "newspaper") { store.openNews() })
        out.append(Settings50Group(title: "Moduler", offset: 3, rows: modules))
        // Prompt 28/29/44: Backup og Logger (bare admin). PROGRAMVARE (Nordlys OS) følger rett under.
        if Update28Model.isAdmin(store) || Backup29Model.isAdmin(store) {
            var server: [PaperLinkRow] = []
            if Backup29Model.isAdmin(store) {
                server.append(PaperLinkRow(name: "Backup", sub: Backup29Model.shared.summary, icon: "externaldrive.badge.timemachine") { store.paperGo("innst-sysbackup") })
            }
            if Update28Model.isAdmin(store) {
                server.append(PaperLinkRow(name: "Logger", sub: "Docker-logger, feil og feilsøking", icon: "doc.text.magnifyingglass") { Logs44.shared.show() })
            }
            out.append(Settings50Group(title: "Server", offset: 6, rows: server))
        }
        return out
    }

    /// Prompt 67: GENERELT – Konto, Utseende, Varsler og App (som web).
    @MainActor private static func generalRows67(_ store: Store) -> [PaperLinkRow] {
        [
            PaperLinkRow(name: "Konto", sub: "Profil, server, brukere og flere kontoer", icon: "person.crop.circle") { store.paperGo("innst-konto") },
            PaperLinkRow(name: "Sikkerhet", sub: store.lockEnabled ? "Lås med Face ID er på" : "2FA, Face ID og pålitelige enheter", icon: "lock") { store.paperGo("innst-sik") },
            PaperLinkRow(name: "API-tokens", sub: "Snarveier og integrasjoner", icon: "key") { store.loadTokens(); store.paperGo("innst-api") },
            // Prompt 46: skann QR-koden som Kalender (Mac/iOS/Android) eller Finans viser, og godkjenn med Face ID (QrLogin38.swift).
            PaperLinkRow(name: "Logg inn på annen enhet", sub: "Skann QR-koden på den andre enheten", icon: "qrcode.viewfinder") { Qr38Model.shared.show() },
            // Prompt 39: navn, ikon, tema, farger, bakgrunn og fanelinje ligger samlet i «Tilpass» (Settings39.swift).
            PaperLinkRow(name: "Utseende", sub: "Navn, ikon, tema, farger, bakgrunn og fanelinje", icon: "paintpalette") { store.paperGo("innst-tilpass") },
            PaperLinkRow(name: "Varsler og haptikk", sub: NotifyModel.shared.on ? "På · \(NotifyModel.sounds.first { $0.0 == NotifyModel.shared.sound }?.1 ?? "")" : "Av", icon: "bell") { store.paperGo("innst-varsler") },
            // Prompt 39: egen underside for profilene (Standard / Finans + Boliger / Boliger-profil).
            PaperLinkRow(name: "Appprofil", sub: store.appProfileName39, icon: "person.2") { store.paperGo("innst-appprofil") },
            // Prompt 43: Widgets-galleriet (Widgets43.swift).
            PaperLinkRow(name: "Widgets", sub: "Media, Avganger, Kalender og 3 til", icon: "square.grid.2x2") { Widgets43.shared.open = true },
            PaperLinkRow(name: "Avansert", sub: "Skanning, widgets, server og data", icon: "gearshape.2") { store.paperGo("innst-avansert") },
        ]
    }

    /// Prompt 67: Moduler → Finans (radene som før lå i gruppen FINANS).
    @MainActor static func financeRows67(_ store: Store) -> [PaperLinkRow] {
        [
            // Prompt 34: AI i Finans er AI-kontroll med scope finans (AI-valg, Tilkoblinger, Jobber, Forbruk).
            PaperLinkRow(name: "AI og tolkning", sub: "Modeller per oppgave, tilkoblinger, jobber og forbruk", icon: "sparkles") { AiCtl34.shared.show("rt", scope: "finans") },
            PaperLinkRow(name: "Kategorier og budsjett", sub: "\(store.boot?.categories.count ?? 0) kategorier", icon: "tag") { store.paperGo("innst-kat") },
            PaperLinkRow(name: "Regler", sub: "Auto-kategorisering", icon: "list.bullet.rectangle") { store.paperGo("innst-regler") },
            PaperLinkRow(name: "Bankimport", sub: "DNB · CSV · ✦ AI", icon: "building.columns") { store.paperOpen(.imports) },
            PaperLinkRow(name: "Aksjer · Trading 212", sub: "Nøkkel, miljø og synk", icon: "chart.line.uptrend.xyaxis") { store.paperGo("innst-aksjer") },
            PaperLinkRow(name: "Fanelinje og Mer i Finans", sub: "\(store.finNav.count) faner", icon: "dock.rectangle") { store.paperGo("innst-fin") },
            PaperLinkRow(name: "Subscription OS", sub: "Abonnementer og AI-sparing", icon: "repeat") { store.paperFinGo("abo") },
        ]
    }

    private var themeSub: String {
        let m = store.paperModeName50 // prompt 50: også «Liquid Glass»
        return "\(m) · bakgrunn · fanelinje"
    }

    private var boligerProfile: Bool { UserDefaults.standard.bool(forKey: "fh_bol_profile") }

    /// «Boliger-profil»: Finans og Domener i hovedlinjen, Boliger først i Finans. Av igjen gir vanlig oppsett.
    private func toggleBoligerProfile() {
        let on = !boligerProfile
        UserDefaults.standard.set(on, forKey: "fh_bol_profile")
        if on {
            let items = ["finans", "domener"].compactMap { id in PaperTabItem.all.first { $0.id == id } }
            store.setTabBar(items)
            store.setFinNav(["boliger", "kvitteringer", "oversikt", "sok"])
            store.flash("Boliger-profil på")
        } else {
            store.resetTabBar()
            store.setFinNav(["oversikt", "liste", "finn", "sok"])
            store.flash("Vanlig oppsett er tilbake")
        }
    }

    private var profileCard: some View {
        Button { store.paperGo("innst-konto") } label: {
            HStack(spacing: 14) {
                Avatar46(size: 54, gap: p.card, shadow: false) // prompt 46: Glimt-ringen også i Innstillinger-toppen
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.displayName.isEmpty ? "Konto" : store.displayName).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text(accountSub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                    Text(serverHost).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer()
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.top, 8)
    }

    private var accountSub: String {
        let u = store.account?.username ?? ""
        let r = (store.me?.role ?? store.account?.role ?? "") == "admin" ? "Admin" : "Bruker"
        // Prompt 30: ikke @brukernavn her (vises bare i Konto → Profil). Hele kortet åpner Konto.
        _ = u
        return "\(r) · Se konto ›"
    }

    private var serverHost: String {
        URL(string: store.api.base)?.host ?? store.api.base
    }

    private func group(_ t: String, _ offset: Int, _ rows: [PaperLinkRow]) -> some View {
        let shifted = rows.map { r -> PaperLinkRow in
            var x = r
            x.colorOffset = offset
            // Prompt 30: samme ikonfarger som web (Settings30.swift).
            if x.tint30 == nil { x.tint30 = Set30Colors.tint(r.name) }
            return x
        }
        return VStack(alignment: .leading, spacing: 0) {
            PLabel(text: t).padding(.top, 12).padding(.leading, 4)
            PaperLinkList(rows: shifted)
        }
    }
}

/// En underside i Innstillinger (Papir). De som finnes i den klassiske appen tegnes med Papir-fargene.
struct PaperSettingsSub: View {
    @Environment(Store.self) private var store
    let key: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            switch key {
            case "konto":
                // Prompt 41: SERVER (lokal, ekstern, bytt automatisk) øverst i Konto (Server41.swift).
                // Prompt 47: med status, Test og «Tilbakestill til standard» (Server47.swift).
                Server47Group()
                SettingsSubpage(page: "accounts")
                // Prompt 44: FAMILIE · LOGG INN SOM og SERVER · EIER (Konto44.swift).
                Konto44Sections()
            case "sik": SettingsSubpage(page: "security")
            case "api": SettingsSubpage(page: "tokens")
            case "ai": PaperAiSettings()
            case "integ": PaperIntegrations24()
            // Prompt 26: Kalendere og én side per integrasjon (Integrations26.swift).
            case "kal": PaperCalendars26()
            case let k where k.hasPrefix("int:"): Int26Detail(id: String(k.dropFirst(4)))
            case "kat": SettingsSubpage(page: "cats")
            case "regler": SettingsSubpage(page: "rules")
            case "aksjer": SettingsSubpage(page: "stocks")
            case "fin": PaperFinNavSettings()
            case "hl": PaperModulesSettings()
            case "varsler": PaperNotifySettings()
            case "haptikk": SettingsSubpage(page: "haptics")
            case "trk": SettingsSubpage(page: "notify")
            case "avansert": PaperAdvancedSettings()
            case "skann": SettingsSubpage(page: "scan")
            case "widgets": SettingsSubpage(page: "widgets")
            case "server": SettingsSubpage(page: "server")
            case "data": SettingsSubpage(page: "data")
            case "backup": SettingsSubpage(page: "backup")
            case "om": SettingsSubpage(page: "about")
            case "oppdatering": Update28Page()
            case "sysbackup": Backup29Page()
            // Prompt 44: Innstillinger → Gjøremål (synk med Home Assistant).
            case "huske": Tasks44SyncPage()
            // Prompt 45: Media, Ruter og Sonevarsler (Settings45.swift).
            case "media": Media43SettingsContent(inSheet: false)
            case "ruter": Ruter45SettingsPage()
            case "sone": Zone45SettingsPage()
            // Prompt 46: Innstillinger → Nyheter (kilder, kategorier, For deg, Glimt-sammendrag) – flyttet fra Nyheter-siden.
            case "nyheter": News46SettingsPage()
            // Prompt 67: Innstillinger → Glimt og undersidene (Glimt67Pages.swift, Glimt67Tasks.swift), og Moduler → Finans.
            case "glimt": G67GlimtPage()
            case "glimt:husker": G67HuskerPage()
            case "glimt:ent": G67EntPage()
            case "glimt:laerer": G67LearnPage()
            case "glimt:faste": G67SchedPage()
            case "glimt:kvalitet": G67QualityPage()
            case "finans67": PaperLinkList(rows: PaperSettings17.financeRows67(store))
            default: SettingsSubpage(page: key)
            }
        }
        .server41Host(p41)
    }

    @Environment(\.paper) private var p41

    static let titles: [String: (String, String)] = [
        "konto": ("Kontoer og brukere", "Profil, brukere og kontoer"),
        "sik": ("Sikkerhet", "2FA, Face ID og enheter"),
        "api": ("API-tokens", "Snarveier og integrasjoner"),
        "ai": ("AI og tolkning", "Motorer, roller og sikkerhet"),
        "integ": ("Integrasjoner", "Status, felt og test for alle oppsett"),
        "kat": ("Kategorier og budsjett", "Farger og budsjett per måned"),
        "regler": ("Regler", "Tekst inneholder … → kategori"),
        "aksjer": ("Aksjer · Trading 212", "Nøkkel, miljø og synk"),
        "fin": ("Fanelinje og Mer", "Finans"),
        "hl": ("Moduler", "Sporing, Domener, Mat og mer"),
        "varsler": ("Varsler og haptikk", "Lyd, stille timer og grupper"),
        "haptikk": ("Haptikk", "Vibrasjon og styrke"),
        "trk": ("Pakkevarsler", "Sporing og kvitteringer"),
        "avansert": ("Avansert", "Skanning, widgets, server og data"),
        "skann": ("Skanning", "Kamera og AI"),
        "widgets": ("Widgets", "Hjemskjermen"),
        "server": ("Server og synk", "Adresser og status"),
        "data": ("Data og lagring", "Buffer og nedlastinger"),
        "backup": ("Backup og data", "Eksport og gjenoppretting"),
        "om": ("Om appen", "Versjon og lisenser"),
        "oppdatering": ("Oppdatering", "Versjon og oppdatering av serveren"),
        "sysbackup": ("Backup", "Hele systemet · automatisk og gjenoppretting"),
        "huske": ("Gjøremål", "Synk med Home Assistant"),
        "media": ("Media", "Tjenester, avspilling og kalender"),
        "ruter": ("Ruter", "Min reise og anbefalte reiser"),
        "sone": ("Sonevarsler", "Familie · hvem og hvilke soner"),
        "nyheter": ("Nyheter", "Kilder, kategorier, For deg og Glimt"),
    ]
}

struct PaperAdvancedSettings: View {
    @Environment(Store.self) private var store
    var body: some View {
        PaperLinkList(rows: [
            PaperLinkRow(name: "Skanning", sub: "Kamera, beskjæring og AI", icon: "doc.viewfinder") { store.paperGo("innst-skann") },
            PaperLinkRow(name: "Widgets", sub: "Hjemskjermen og App Group", icon: "square.grid.2x2") { store.paperGo("innst-widgets") },
            PaperLinkRow(name: "Server og synk", sub: "Lokal og ekstern adresse", icon: "server.rack") { store.paperGo("innst-server") },
            PaperLinkRow(name: "Data og lagring", sub: "Buffer og nedlastinger", icon: "internaldrive") { store.paperGo("innst-data") },
            PaperLinkRow(name: "Backup og data", sub: "Eksport og gjenoppretting", icon: "externaldrive") { store.paperGo("innst-backup") },
            PaperLinkRow(name: "Om appen", sub: "Versjon, personvern og lisenser", icon: "info.circle") { store.paperGo("innst-om") },
        ])
    }
}

/// «Fanelinje og Mer i Finans»: opptil 4 faner, resten ligger i Mer.
struct PaperFinNavSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let nav = store.finNav
        var rows: [PaperLinkRow] = Store.finNavAll.map { f in
            let i = nav.firstIndex(of: f.id)
            let sub = i.map { "I fanelinjen, plass \($0 + 1)" + ($0 > 0 ? " · trykk for å flytte til venstre" : "") } ?? "Ligger i Mer"
            let value = i.map { $0 > 0 ? "◂ Fane \($0 + 1)" : "Fane 1" } ?? "+ Legg til"
            return PaperLinkRow(name: f.name, sub: sub, value: value, valueColor: i == nil ? p.lab : p.pos) { toggle(f.id) }
        }
        let last = nav.last.flatMap { id in Store.finNavAll.first { $0.id == id }?.name } ?? "–"
        // Prompt 26: samme editor som når du holder inne på fanelinjen i Finans.
        rows.insert(PaperLinkRow(name: "Rediger fanelinjen", sub: "Navn, ikon, rekkefølge og stil · eller hold inne på fanelinjen", value: "Rediger ›", valueColor: p.lab) {
            FinNav26.shared.editing = true
        }, at: 0)
        rows.append(PaperLinkRow(name: "Fjern fra fanelinjen", sub: "Flytter siste fane til Mer", value: nav.count > 1 ? "Fjern \(last)" : "–", valueColor: p.lab) {
            if nav.count > 1 { store.setFinNav(Array(nav.dropLast())) }
        })
        rows.append(PaperLinkRow(name: "Tilbakestill", sub: "Oversikt, Liste, Finn, Søk", value: "Nullstill") { store.setFinNav(["oversikt", "liste", "finn", "sok"]) })
        return VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Finans · fanelinje").padding(.leading, 4).padding(.top, 6)
            PaperLinkList(rows: rows)
        }
    }

    private func toggle(_ id: String) {
        var nav = store.finNav
        if let i = nav.firstIndex(of: id) {
            guard i > 0 else { return }
            nav.swapAt(i - 1, i)
            store.setFinNav(nav)
        } else {
            guard nav.count < 4 else { store.flash("Maks 4 faner. Fjern en først."); return }
            nav.append(id)
            store.setFinNav(nav)
        }
    }
}

/// Moduler: Hjem-oppsettet, fanen Domener/Sporing og innstillingene for hver modul.
struct PaperModulesSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Fanelinje").padding(.leading, 4).padding(.top, 6)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Skanneknapp", sub: store.fabMode == "float" ? "Flyter over linjen, søk ligger i linjen" : "Ligger i linjen som +",
                             value: store.fabMode == "float" ? "Flytende ›" : "I linjen ›", icon: "doc.viewfinder") { store.setFabMode(store.fabMode == "float" ? "inline" : "float") },
                PaperLinkRow(name: "Fjerde fane", sub: fourthSub, value: fourthName + " ›", icon: "square.grid.2x2") { cycleFourth() },
            ])
            PLabel(text: "Moduler").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Gjøremål", sub: "To-do for hele familien", value: "Åpne ›", icon: "checklist") { store.paperGo("huske") },
                PaperLinkRow(name: "Familie og helse", sub: "Deling av posisjon, personvern og Apple Helse", icon: "person.2") { store.paperGo("innst-fam") },
                PaperLinkRow(name: "Værsteder", sub: "Legg til, fjern og søk etter steder", value: "Åpne ›", icon: "cloud.sun") { store.openWeather() },
                PaperLinkRow(name: "Avganger", sub: "Stopp fra Ruter og Entur", value: "Åpne ›", icon: "tram") { store.paperGo("avg") },
                PaperLinkRow(name: "Sporing", sub: "Kilder, transportører og pakkevarsler", value: "Åpne ›", icon: "shippingbox") { store.paperGo("sporing") },
                PaperLinkRow(name: "Domener", sub: "Cloudflare-statistikk", value: "Åpne ›", icon: "globe") { store.paperOpenDomains(from: "mer") },
            ])
        }
    }

    private var fourthName: String {
        switch store.fourthTab {
        case "domener": return "Domener"
        case "sporing": return "Sporing"
        default: return "Automatisk"
        }
    }

    private var fourthSub: String {
        switch store.fourthTab {
        case "domener": return "Alltid Domener"
        case "sporing": return "Alltid Sporing"
        default: return "Domener, eller Sporing når pakker er på vei"
        }
    }

    private func cycleFourth() {
        let order = ["auto", "domener", "sporing"]
        let i = order.firstIndex(of: store.fourthTab) ?? 0
        store.setFourthTab(order[(i + 1) % order.count])
    }
}

/* ---------- AI og tolkning ---------- */

/// Fire motorer (Ollama, Gemini, Groq, Roboflow), «Hvem gjør hva» per oppgave, lokal OCR-reserve og test.
@MainActor
@Observable
final class AiSettingsModel {
    static let shared = AiSettingsModel()
    var health: [String: Any] = [:]
    var settings: [String: Any] = [:]
    var testing: String?
    var results: [String: String] = [:]
    var log: [[String: Any]] = []
    /// ISO2: canEditServer fra bootstrap. nil = eldre server (Store.canEditServer avgjør da).
    var canEdit: Bool? = nil

    static let engines: [(String, String, String)] = [("gemini", "Gemini", "Bare «Finn logo» (butikknavn)"), ("groq", "Groq", "AI-søk og kategorier (raskt)"),
                                                     ("roboflow", "Roboflow", "Strekkoder og pakkelapper"), ("ollama", "Ollama", "Lokalt · reserve")]
    static let tasks: [(String, String, String)] = [("receipts", "Les kvitteringer", "ollama"), ("search", "AI-søk og sammendrag", "groq"),
                                                   ("categorize", "Kategorisering", "groq"), ("barcode", "Strekkoder", "roboflow")]

    func load(_ store: Store) async {
        if let d = try? await store.api.call("GET", "/health/ai") { health = JS.obj(d) }
        if let d = try? await store.api.call("GET", "/bootstrap") {
            let o: [String: Any] = JS.obj(d)
            if let s = JS.dict(o, "settings") { settings = s }
            canEdit = JS.bool(o, "canEditServer")
        }
        if let d = try? await store.api.call("GET", "/ai/log?limit=20") {
            let o = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "items")
            log = o.compactMap { $0 as? [String: Any] }
        }
    }

    func status(_ engine: String) -> (String, Bool) {
        let o = JS.dict(health, engine)
        if JS.bool(o, "ok") == true { return ("Tilkoblet", true) }
        if JS.bool(o, "configured") == false { return (engine == "ollama" ? "Ikke satt opp" : "Mangler nøkkel", false) }
        if let e = JS.str(o, "error") ?? JS.str(o, "message") { return (e, false) }
        return (o == nil ? "Ukjent" : "Svarer ikke", false)
    }

    func model(_ engine: String) -> String {
        switch engine {
        case "gemini": return JS.str(JS.dict(health, "gemini"), "resolved") ?? JS.str(settings, "geminiModel") ?? "gemini"
        case "groq": return JS.str(settings, "groqModel") ?? "llama-3.3-70b-versatile"
        case "roboflow": return JS.str(settings, "roboflowWorkflow") ?? "sebastians-workspace-y3jnc"
        default: return JS.str(settings, "ollamaModel") ?? "qwen2.5vl"
        }
    }

    func engineFor(_ task: String, default d: String) -> String {
        // Prompt 52: kvitteringer leses bare lokalt – lagret «gemini»/«groq» vises (og lagres) som Ollama.
        if task == "receipts" { return "ollama" }
        return JS.str(JS.dict(settings, "aiTasks"), task) ?? d
    }

    func setTask(_ task: String, _ engine: String, _ store: Store) {
        var t = JS.dict(settings, "aiTasks") ?? [:]
        t[task] = engine
        settings["aiTasks"] = t
        store.save("aiTasks", t)
        Haptics.shared.select()
    }

    func flag(_ key: String, default d: Bool) -> Bool { JS.bool(settings, key) ?? d }

    func setFlag(_ key: String, _ v: Bool, _ store: Store) {
        settings[key] = v
        store.save(key, v)
    }

    func test(_ engine: String, _ store: Store) {
        testing = engine
        Task {
            let path = engine == "roboflow" ? "/ai/roboflow/test" : "/ai/test"
            let body: [String: Any]? = engine == "roboflow" ? nil : ["provider": engine]
            do {
                let d = try await store.api.call("POST", path, json: body)
                let o = JS.obj(d)
                let ok = JS.bool(o, "ok") ?? false
                let ms = JS.num(o, "ms").map { " · \(Int($0)) ms" } ?? ""
                self.results[engine] = (ok ? "✓ " : "✕ ") + (JS.str(o, "message") ?? JS.str(o, "model") ?? (ok ? "Virker" : "Feilet")) + ms
            } catch {
                self.results[engine] = "✕ " + error.localizedDescription
            }
            self.testing = nil
            await self.load(store)
        }
    }
}

struct PaperAiSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiSettingsModel { AiSettingsModel.shared }
    /// ISO2: AI-motorer, modeller, OCR, sikkerhetsgrense og tidsgrenser er serveroppsett (bare admin endrer).
    private var canEdit: Bool { m.canEdit ?? store.canEditServer }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !canEdit {
                Text(ServerLock26.note + ". Du ser oppsettet, men kan ikke endre det.").font(PF.ui(13)).foregroundStyle(p.mut)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            PLabel(text: "Motorer").padding(.leading, 4).padding(.top, 6)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(AiSettingsModel.engines.enumerated()), id: \.element.0) { i, e in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        engineRow(e.0, e.1, e.2)
                    }
                }
            }
            // Prompt 27: PERSONVERN OG LOGOER (3 brytere) og AI-logg (Privacy27.swift).
            Privacy27Section()
            // Prompt 27: CHAT (Chat27Settings.swift).
            Chat27SettingsGroup()
            // Prompt 56: TALE TIL TEKST – Serveren (anbefalt) / På enheten (Voice56.swift).
            Voice56SettingsGroup()
            // Prompt 67: «Send til Chat etter» (prompt 32) og GLIMT HUSKER (prompt 33) ligger nå på Innstillinger → Glimt (som web).
            PLabel(text: "Glimt").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Glimt husker og «Send til Chat etter»", sub: "Flyttet til Innstillinger → Glimt", value: "Glimt ›", valueColor: p.lab, icon: "sparkle") { store.paperGo("innst-glimt") },
            ])
            // Prompt 23: tidsgrense per motor, nye forsøk og hva som skjer ved tidsavbrudd (AiTimeouts23.swift).
            AiTimeouts23(locked: !canEdit)
            PLabel(text: "Hvem gjør hva").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(AiSettingsModel.tasks.enumerated()), id: \.element.0) { i, t in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        taskRow(t.0, t.1, t.2)
                    }
                }
            }
            .disabled(!canEdit)
            Text("Feiler motoren, prøves neste automatisk. Hvert kall logges.").font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 6)
            PLabel(text: "Lokal OCR-reserve").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    flagRow("Lokal OCR-reserve", "Tesseract leser kvitteringen offline hvis AI feiler", "ocrFallback", true).disabled(!canEdit)
                    Rectangle().fill(p.line).frame(height: 1)
                    flagRow("Bruk ved lav AI-sikkerhet", "Sammenlign med lokal OCR under grensen", "ocrLowConf", false).disabled(!canEdit)
                    Rectangle().fill(p.line).frame(height: 1)
                    flagRow("Kategoriser automatisk", "AI foreslår kategori for nye transaksjoner", "autoCat", true)
                }
            }
            PLabel(text: "Minste sikkerhet").padding(.leading, 4).padding(.top, 14)
            confRow.disabled(!canEdit)
            if !m.log.isEmpty {
                PLabel(text: "Siste kall").padding(.leading, 4).padding(.top, 14)
                PCard(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(m.log.prefix(12).enumerated()), id: \.offset) { i, l in
                            if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                            logRow(l)
                        }
                    }
                }
            }
            Text(canEdit ? "Nøkler for Gemini, Groq og Roboflow legges inn i FinansHub i nettleseren (Innstillinger → AI-motor). De lagres kryptert på serveren." : "AI-motorer og nøkler settes opp av administrator.")
                .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 10).fixedSize(horizontal: false, vertical: true)
        }
        .task { await m.load(store) }
    }

    private func engineRow(_ id: String, _ name: String, _ sub: String) -> some View {
        let st = m.status(id)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                Circle().fill(st.1 ? p.pos : p.mut.opacity(0.5)).frame(width: 9, height: 9)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text("\(m.model(id)) · \(sub)").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Button { m.test(id, store) } label: {
                    Text(m.testing == id ? "Tester …" : "Test").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 12).frame(height: 30).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(m.testing != nil)
                .opacity(canEdit ? 1 : 0)
                .disabled(!canEdit)
            }
            Text(m.results[id] ?? st.0).font(PF.ui(12)).foregroundStyle(st.1 ? p.pos : p.lab).lineLimit(2)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    private func taskRow(_ task: String, _ name: String, _ def: String) -> some View {
        let cur = m.engineFor(task, default: def)
        let curName = AiSettingsModel.engines.first { $0.0 == cur }?.1 ?? cur
        // Prompt 52: «Les kvitteringer» kan bare være lokal (Ollama). Ingen sky-motor i menyen.
        let choices: [(String, String, String)] = task == "receipts" ? AiSettingsModel.engines.filter { $0.0 == "ollama" } : AiSettingsModel.engines
        return Menu {
            ForEach(choices, id: \.0) { e in
                Button { m.setTask(task, e.0, store) } label: { Text(e.1 + (e.0 == cur ? " ✓" : "")) }
            }
        } label: {
            HStack {
                Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer()
                Text(curName + " ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
            }
            .padding(.horizontal, 14).padding(.vertical, 13)
            .contentShape(Rectangle())
        }
    }

    private func flagRow(_ t: String, _ sub: String, _ key: String, _ def: Bool) -> some View {
        Toggle(isOn: Binding(get: { m.flag(key, default: def) }, set: { m.setFlag(key, $0, store) })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private var confRow: some View {
        let cur = Int(JS.num(m.settings, "minConf") ?? 85)
        return HStack(spacing: 6) {
            ForEach([70, 80, 85, 90, 95], id: \.self) { v in
                Button {
                    m.settings["minConf"] = v
                    store.save("minConf", v)
                    Haptics.shared.select()
                } label: {
                    Text("\(v) %").font(PF.ui(13, .semibold)).foregroundStyle(cur == v ? p.bg : p.ink)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(cur == v ? p.ink : p.card, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 8)
    }

    private func logRow(_ l: [String: Any]) -> some View {
        let ok = (JS.str(l, "status") ?? "ok") == "ok"
        let when = JS.date(l["ts"]).map { JS.fmt($0, "dd.MM HH:mm") } ?? ""
        return HStack(spacing: 8) {
            Circle().fill(ok ? p.pos : p.lab).frame(width: 7, height: 7)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(JS.str(l, "task") ?? "–") · \(JS.str(l, "engine") ?? "")").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Text((JS.str(l, "model") ?? "") + (JS.str(l, "error").map { " · " + $0 } ?? "")).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(JS.num(l, "ms").map { "\(Int($0)) ms" } ?? "").font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
                Text(when).font(PF.ui(11)).foregroundStyle(p.mut)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }
}

/* ---------- Navn på appen og app-ikon ---------- */

struct AppNameSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let close: () -> Void
    @State private var name = AppMeta.shared.name

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Navn på appen").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            Text("Vises på Hjem, i innloggingen, i varsler og i nettleserfanen.").font(PF.ui(13)).foregroundStyle(p.mut)
            TextField("Navn", text: $name)
                .font(PF.serif(20))
                .padding(.vertical, 8)
                .overlay(alignment: .bottom) { Rectangle().fill(p.lab).frame(height: 2) }
                .textInputAutocapitalization(.words)
            HStack(spacing: 8) {
                ForEach(AppMeta.suggestions, id: \.self) { s in
                    Button { name = s } label: {
                        Text(s).font(PF.ui(13, .semibold)).foregroundStyle(name == s ? p.bg : p.ink).padding(.horizontal, 14).frame(height: 34)
                            .background(name == s ? p.ink : p.card, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer()
            HStack(spacing: 10) {
                PLineButton(title: "Avbryt", height: 48, full: true) { close() }
                PInkButton(title: "Lagre", height: 48, full: true) {
                    AppMeta.shared.setName(name, store)
                    close()
                }
            }
        }
        .padding(20)
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }
}

struct AppIconSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let close: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("App-ikon").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Text("Hvert ikon har lys, mørk og tonet variant, som iOS bytter mellom selv.").font(PF.ui(13)).foregroundStyle(p.mut)
                ForEach(AppMeta.icons, id: \.0) { ic in
                    Button { AppMeta.shared.setIcon(ic.0, store) } label: {
                        HStack(spacing: 14) {
                            Image(ic.2).resizable().scaledToFit().frame(width: 64, height: 64)
                                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                                .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ic.1).font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink)
                                Text(ic.0 == "monogram" ? "Standard" : "Alternativt ikon").font(PF.ui(12.5)).foregroundStyle(p.mut)
                            }
                            Spacer()
                            if AppMeta.shared.icon == ic.0 { Text("✓").font(PF.ui(16, .bold)).foregroundStyle(p.pos) }
                        }
                        .padding(12)
                        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AppMeta.shared.icon == ic.0 ? p.ink : Color.clear, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                }
                PLineButton(title: "Ferdig", height: 46, full: true) { close() }.padding(.top, 6)
            }
            .padding(20)
        }
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }
}
