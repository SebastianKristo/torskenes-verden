import SwiftUI
import UIKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 89 (IOS89): Live Activities i appen ----------------
 – live89Host() (App.swift): mens appen er aktiv og innlogget hentes GET /api/live/aktiviteter (Live89Sync.sync i Shared/Live89.swift)
   hvert 5. s når en nedlasting/backup går, ellers hvert 15./60. s. Bakgrunnshentingen (Notify31) gjør det samme én gang.
 – Push-tokens: push-to-start (iOS 17.2+) og hver aktivitets token sendes til POST /api/live/tokens. Krever «Push Notifications»
   (aps-environment) når appen signeres med egen Team ID; uten det startes aktivitetene uten push og oppdateres ved polling.
 – homelab://live89/rute?id=… («Vis rute» i Live Activity): POST /api/live/handling {handling:"rute"} → kart-lenken åpnes.
   Brukeren har selv trykket på knappen (prompt 86).
 – Innstillinger → Varsler → Live Activities: én bryter per aktivitet (GET/PUT /api/live/innstillinger). Backup bare for admin. */

/* ---------- Push-tokens ---------- */

#if canImport(ActivityKit)
@MainActor
enum Live89Tokens {
    static var watched: Set<String> = []
    static var observing: Bool = false

    /// Én gang: push-to-start-tokenet og nye aktiviteter (også de serveren starter med push).
    static func observe() {
        if observing { return }
        observing = true
        Task { @MainActor in
            for await a in Activity<Plat51Attributes>.activityUpdates where Live89.isNew(a.attributes.kind) {
                watch(a)
            }
        }
        if #available(iOS 17.2, *) {
            Task {
                for await d in Activity<Plat51Attributes>.pushToStartTokenUpdates {
                    await post(d, kind: "pushtostart", id: nil, type: nil)
                }
            }
        }
        watchAll()
    }

    static func watchAll() {
        for a in Live89Sync.live() { watch(a) }
    }

    static func watch(_ a: Activity<Plat51Attributes>) {
        if watched.contains(a.id) { return }
        watched.insert(a.id)
        let key: String = a.attributes.key
        let kind: String = a.attributes.kind
        Task {
            for await d in a.pushTokenUpdates {
                await post(d, kind: "liveactivity", id: key, type: kind)
            }
        }
    }

    nonisolated static func post(_ d: Data, kind: String, id: String?, type: String?) async {
        let hex: String = d.map { (b: UInt8) -> String in String(format: "%02x", b) }.joined()
        if hex.isEmpty { return }
        var body: [String: Any] = ["platform": "ios", "kind": kind, "token": hex]
        if let id { body["aktivitetId"] = id }
        if let type { body["type"] = type }
        _ = await Plat51Net.request("POST", "/api/live/tokens", body: body, timeout: 15)
    }
}
#endif

/* ---------- Polling og innstillinger ---------- */

@MainActor
@Observable
final class Live89Model {
    static let shared: Live89Model = Live89Model()

    /// Bryterne fra /api/live/innstillinger (nedlasting, backup, spiller, avtale, pakke).
    var settings: [String: Bool] = [:]
    var loaded: Bool = false
    /// Serveren har ikke /api/live ennå (404).
    var missing: Bool = false

    /// Løkken mens appen er aktiv (avbrytes når appen går i bakgrunnen eller kontoen byttes).
    func run(_ store: Store, active: Bool) async {
        guard active, store.loggedIn else { return }
        #if canImport(ActivityKit)
        Live89Tokens.observe()
        while !Task.isCancelled {
            let wait: TimeInterval = await Live89Sync.sync()
            Live89Tokens.watchAll()
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
        }
        #endif
    }

    /// Bakgrunnshenting (Notify31): én runde.
    nonisolated static func background() async {
        #if canImport(ActivityKit)
        _ = await Live89Sync.sync()
        await MainActor.run { Live89Tokens.watchAll() }
        #endif
    }

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/live/innstillinger", timeout: 10)
            let o: [String: Any] = JS.obj(d)
            var s: [String: Bool] = [:]
            for t in Live89.types {
                let v: Bool = JS.bool(o, t) ?? (t != "backup" || Update28Model.isAdmin(store))
                s[t] = v
                Live89.setOn(t, v)
            }
            settings = s
            missing = false
        } catch let e as APIError {
            missing = e.status == 404
        } catch {}
        loaded = true
    }

    func set(_ type: String, _ on: Bool, _ store: Store) {
        settings[type] = on
        Live89.setOn(type, on)
        var body: [String: Any] = [:]
        for t in Live89.types { body[t] = settings[t] ?? Live89.on(t) }
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "PUT", "/live/innstillinger", json: body, timeout: 10)
            } catch {
                store.flash("Fikk ikke lagret Live Activities-valget på serveren")
            }
            #if canImport(ActivityKit)
            if !on { await Live89Sync.endAll(type) } else { _ = await Live89Sync.sync() }
            #endif
        }
    }

    func value(_ type: String) -> Bool { settings[type] ?? Live89.on(type) }

    var systemEnabled: Bool {
        #if canImport(ActivityKit)
        return ActivityAuthorizationInfo().areActivitiesEnabled
        #else
        return false
        #endif
    }
}

/* ---------- «Vis rute» ---------- */

enum Live89Link {
    /// homelab://live89/rute?id=<aktivitet>
    @MainActor static func handle(_ u: URL, _ store: Store) -> Bool {
        let scheme: String = (u.scheme ?? "").lowercased()
        guard scheme == "homelab" || scheme == "finanshub", (u.host ?? "") == "live89" else { return false }
        let items: [URLQueryItem] = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let id: String = items.first(where: { (i: URLQueryItem) -> Bool in i.name == "id" })?.value ?? ""
        guard u.path == "/rute", Live89.validId(id) else { return true }
        #if canImport(ActivityKit)
        Task { @MainActor in
            let raw: String = await Live89Sync.act(id, "rute") ?? ""
            if let url = safe(raw) {
                _ = await UIApplication.shared.open(url)
            } else {
                store.flash("Fant ingen rute for avtalen")
            }
        }
        #endif
        return true
    }

    /// Bare kart-lenker over https (eller Apple Kart / Google Maps-appene).
    static func safe(_ raw: String) -> URL? {
        guard let u = URL(string: raw) else { return nil }
        let s: String = (u.scheme ?? "").lowercased()
        if s == "https" || s == "maps" || s == "comgooglemaps" { return u }
        return nil
    }
}

/* ---------- Roten ---------- */

struct Live89Host: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase

    func body(content: Content) -> some View {
        content.task(id: key) {
            await Live89Model.shared.run(store, active: phase == .active)
        }
    }

    private var key: String { (store.account?.id ?? "-") + (phase == .active ? ":aktiv" : ":bak") }
}

extension View {
    /// Prompt 89: Live Activities (polling, push-tokens). Legges på roten i App.swift.
    func live89Host() -> some View { modifier(Live89Host()) }
}

/* ---------- Innstillinger → Varsler → Live Activities ---------- */

struct Live89Settings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Live89Model { Live89Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Live Activities").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(rows, id: \.self) { (t: String) in
                        if t != rows.first { Rectangle().fill(p.line).frame(height: 1) }
                        row(t)
                    }
                }
            }
            Text(note).font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 6)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await m.load(store) }
    }

    private var rows: [String] {
        Live89.types.filter { (t: String) -> Bool in t != "backup" || Update28Model.isAdmin(store) }
    }

    private var note: String {
        if m.missing { return "Serveren støtter ikke Live Activities ennå. Oppdater Homelab-serveren." }
        if !m.systemEnabled { return "Live Activities er slått av for Homelab i iOS-innstillingene (Innstillinger → Homelab)." }
        return "Vises på låseskjermen, i Dynamic Island og i StandBy. Knappene virker uten å åpne appen."
    }

    private func row(_ t: String) -> some View {
        Toggle(isOn: Binding(get: { m.value(t) }, set: { (v: Bool) in m.set(t, v, store); Haptics.shared.select() })) {
            HStack(spacing: 12) {
                Image(systemName: Live89.symbol(t, paused: false))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hex: Live89.accent(t)))
                    .frame(width: 32, height: 32)
                    .background(Color(hex: Live89.accent(t)).opacity(0.18), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(Live89.name(t)).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(Live89.about(t)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }
}
