import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): tema per bruker (synket mellom enheter) og automatisk tema ----------------
 Server: GET/PUT /api/me/theme51 ($S/SERVER51-API.md, WEBX51 §3). mode light|dark|system|auto, auto.by sun|time.
 Lokalt følger appen det vanlige valget (store.paperMode): light → «lys», dark → «mork», system → «auto».
 Automatisk lagres som «auto51-l» / «auto51-d» (lys/mørk akkurat nå), så PaperPalette.of tegner riktig og alle sider tegnes på nytt
 når det bytter. Byttet regnes ut lokalt hvert minutt (klokkeslett, eller soloppgang/solnedgang fra serveren for posisjonen i Familie,
 ellers Oslo) og hentes på nytt ved neste bytte, når appen kommer i forgrunnen og etter 6 timer. «Siste skriving vinner»: updatedAt sendes med,
 og 409 betyr at en annen enhet var senere – da tas serverens valg. Liquid Glass (prompt 50) er et lokalt valg og overstyres ikke. */

@MainActor
@Observable
final class Theme51 {
    static let shared = Theme51()
    nonisolated static let autoPrefix: String = "auto51"

    var sheet: Bool = false
    var mode: String = "system"
    var by: String = "sun"
    var lightAt: String = "07:00"
    var darkAt: String = "21:00"
    var placeName: String = ""
    var placeSource: String = ""
    var effective: String = ""
    var nextAt: Date? = nil
    var nextMode: String = ""
    var sunrise: Date? = nil
    var sunset: Date? = nil
    var polar: String = ""
    var updatedAt: Double = 0
    var available: Bool = true
    var saving: Bool = false
    @ObservationIgnored private var fetchedAt: Date? = nil
    @ObservationIgnored private var scope: String = ""

    /// Lokal verdi for automatisk tema akkurat nå.
    nonisolated static func autoValue(dark: Bool) -> String { autoPrefix + (dark ? "-d" : "-l") }

    /// Kalles fra Feat51Host3 (.task per konto): henter temaet og holder automatisk tema oppdatert hvert minutt.
    func boot(_ store: Store) async {
        guard store.loggedIn, let acc = store.account else { return }
        if scope != acc.id { scope = acc.id; fetchedAt = nil; updatedAt = 0 }
        await fetch(store)
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 60_000_000_000)
            if Task.isCancelled { return }
            await tick(store)
        }
    }

    func wake(_ store: Store) async {
        guard store.loggedIn else { return }
        if let f = fetchedAt, Date().timeIntervalSince(f) < 300 { await tick(store); return }
        await fetch(store)
    }

    private func tick(_ store: Store) async {
        guard mode == "auto" else { return }
        let stale: Bool = fetchedAt.map { Date().timeIntervalSince($0) > 6 * 3600 } ?? true
        if stale || (nextAt.map { $0 <= Date() } ?? false) { await fetch(store); return }
        applyLocal(store)
    }

    func fetch(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/me/theme51", timeout: 15)
            available = true
            fetchedAt = Date()
            let o: [String: Any] = JS.obj(d)
            let serverAt: Double = JS.num(o, "updatedAt") ?? 0
            // Aldri satt på serveren: send det appen bruker i dag, så valget ikke byttes ut med serverens standard.
            if serverAt <= 0 {
                await push(store.paperMode, store)
                return
            }
            take(o)
            applyLocal(store)
        } catch let e as APIError where e.status == 404 {
            available = false
        } catch {}
    }

    private func take(_ o: [String: Any]) {
        mode = JS.str(o, "mode") ?? "system"
        let a: [String: Any]? = JS.dict(o, "auto")
        by = JS.str(a, "by") ?? "sun"
        lightAt = JS.str(a, "lightAt") ?? "07:00"
        darkAt = JS.str(a, "darkAt") ?? "21:00"
        let pl: [String: Any]? = JS.dict(a, "place")
        placeName = JS.str(pl, "name") ?? ""
        placeSource = JS.str(pl, "source") ?? ""
        effective = JS.str(o, "effective") ?? ""
        let n: [String: Any]? = JS.dict(o, "next")
        nextAt = JS.date(n?["at"])
        nextMode = JS.str(n, "mode") ?? ""
        let s: [String: Any]? = JS.dict(o, "sun")
        sunrise = JS.date(s?["sunrise"])
        sunset = JS.date(s?["sunset"])
        polar = JS.str(s, "polar") ?? ""
        updatedAt = JS.num(o, "updatedAt") ?? updatedAt
    }

    /// Mørkt akkurat nå for automatisk tema (lokalt, uten nett).
    var autoDark: Bool {
        let now: String = JS.fmt(Date(), "HH:mm")
        if by == "time" {
            if lightAt < darkAt { return now >= darkAt || now < lightAt }
            return now >= darkAt && now < lightAt
        }
        if polar == "midnattssol" { return false }
        if polar == "mørketid" { return true }
        if let up = sunrise, let down = sunset {
            let u: String = JS.fmt(up, "HH:mm")
            let d: String = JS.fmt(down, "HH:mm")
            return now < u || now >= d
        }
        if effective == "dark" { return true }
        if effective == "light" { return false }
        let h: Int = Calendar.current.component(.hour, from: Date())
        return h < 7 || h >= 20
    }

    /// Setter appens tema etter serverens valg (uten å skrive tilbake).
    func applyLocal(_ store: Store) {
        if store.paperMode == Glass50.mode { return }
        let v: String
        switch mode {
        case "light": v = "lys"
        case "dark": v = "mork"
        case "auto": v = Theme51.autoValue(dark: autoDark)
        default: v = "auto"
        }
        if store.paperMode != v { store.paperMode = v }
    }

    /// Brukeren valgte tema i appen (setPaperMode i PaperStore.swift): send det til serveren.
    func push(_ local: String, _ store: Store) async {
        guard available, local != Glass50.mode else { return }
        var b: [String: Any] = [:]
        if local.hasPrefix(Theme51.autoPrefix) {
            b["mode"] = "auto"
        } else {
            b["mode"] = local == "lys" ? "light" : (local == "mork" ? "dark" : "system")
        }
        await put(b, store)
    }

    func setAuto(_ store: Store, by: String? = nil, lightAt: String? = nil, darkAt: String? = nil) async {
        var a: [String: Any] = ["by": by ?? self.by]
        a["lightAt"] = lightAt ?? self.lightAt
        a["darkAt"] = darkAt ?? self.darkAt
        mode = "auto"
        if let by { self.by = by }
        if let lightAt { self.lightAt = lightAt }
        if let darkAt { self.darkAt = darkAt }
        applyLocal(store)
        await put(["mode": "auto", "auto": a], store)
    }

    func choose(_ m: String, _ store: Store) async {
        Haptics.shared.select()
        if m == "auto" { await setAuto(store); return }
        mode = m
        applyLocal(store)
        await put(["mode": m], store)
    }

    private func put(_ body: [String: Any], _ store: Store) async {
        var b: [String: Any] = body
        let now: Double = (Date().timeIntervalSince1970 * 1000).rounded()
        b["updatedAt"] = now
        saving = true
        defer { saving = false }
        do {
            let d: Data = try await store.api.callAt("/api", "PUT", "/me/theme51", json: b, timeout: 15)
            fetchedAt = Date()
            take(JS.obj(d))
            applyLocal(store)
        } catch let e as APIError where e.status == 409 {
            // En annen enhet endret temaet senere – serverens valg vinner.
            await fetch(store)
        } catch let e as APIError where e.status == 404 {
            available = false
        } catch {}
    }

    /* ---------- Tekster ---------- */

    var nowText: String {
        guard mode == "auto" else { return "" }
        var s: String = "Nå: " + (autoDark ? "mørk" : "lys")
        if let n = nextAt {
            let to: String = nextMode == "dark" ? "mørk" : "lys"
            let at: String = More44Rows.when(n).lowercased()
            s += " · bytter til " + to + " " + at
        }
        return s
    }

    var sunText: String {
        if polar == "midnattssol" { return "Midnattssol – lyst hele døgnet" }
        if polar == "mørketid" { return "Mørketid – mørkt hele døgnet" }
        guard let u = sunrise, let d = sunset else { return "" }
        let place: String = placeName.isEmpty ? "" : " i " + placeName
        let src: String = placeSource == "family" ? " (din posisjon i Familie)" : (placeSource == "default" ? " (standard)" : "")
        return "Soloppgang " + JS.fmt(u, "HH:mm") + " · solnedgang " + JS.fmt(d, "HH:mm") + place + src
    }
}

/// Innstillinger → Utseende → «Automatisk» og «Bytt tema» fra søket.
struct Theme51Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var t: Theme51 { Theme51.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PLabel(text: "Utseende")
                Text("Tema").font(PF.serif(28, medium: true)).foregroundStyle(p.ink)
                F51Note(text: "Valget følger kontoen din og synkes til de andre enhetene dine.")
                VStack(spacing: 0) {
                    row("light", "Lys", "Lyst papir hele tiden", "sun.max")
                    row("dark", "Mørk", "Kveldspapir hele tiden", "moon")
                    row("system", "Følg systemet", "Lys eller mørk som iOS", "circle.lefthalf.filled")
                    row("auto", "Automatisk", "Etter solnedgang eller klokkeslett", "sunset")
                }
                .glass50Card(p, radius: 20)
                if t.mode == "auto" { Theme51Auto() }
                if !t.available { F51Note(text: "Serveren kan ikke lagre tema ennå (oppdater Homelab). Valget gjelder bare denne enheten.") }
            }
            .padding(22)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task { await t.fetch(store) }
    }

    private func row(_ k: String, _ name: String, _ sub: String, _ icon: String) -> some View {
        let on: Bool = t.mode == k && store.paperMode != Glass50.mode
        return Button { Task { await t.choose(k, store) } } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(p.ink).frame(width: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer()
                if on { Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(p.pos) }
            }
            .padding(.horizontal, 14).frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }
}

struct Theme51Auto: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var t: Theme51 { Theme51.shared }

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                Picker("Bytt etter", selection: Binding<String>(get: { t.by }, set: { (v: String) in Task { await t.setAuto(store, by: v) } })) {
                    Text("Solen").tag("sun")
                    Text("Klokkeslett").tag("time")
                }
                .pickerStyle(.segmented)
                if t.by == "time" {
                    DatePicker("Lyst fra", selection: time(\.lightAt, light: true), displayedComponents: .hourAndMinute)
                    DatePicker("Mørkt fra", selection: time(\.darkAt, light: false), displayedComponents: .hourAndMinute)
                } else if !t.sunText.isEmpty {
                    F51Note(text: t.sunText)
                }
                if !t.nowText.isEmpty { F51Note(text: t.nowText) }
            }
            .font(PF.ui(14))
            .environment(\.locale, Locale(identifier: "nb_NO"))
        }
    }

    private func time(_ k: ReferenceWritableKeyPath<Theme51, String>, light: Bool) -> Binding<Date> {
        Binding<Date>(get: {
            let s: String = Theme51.shared[keyPath: k]
            let parts: [Int] = s.split(separator: ":").compactMap { Int($0) }
            let h: Int = parts.first ?? (light ? 7 : 21)
            let m: Int = parts.count > 1 ? parts[1] : 0
            return Calendar.current.date(bySettingHour: h, minute: m, second: 0, of: Date()) ?? Date()
        }, set: { (d: Date) in
            let v: String = JS.fmt(d, "HH:mm")
            Task { @MainActor in
                if light { await Theme51.shared.setAuto(store, lightAt: v) } else { await Theme51.shared.setAuto(store, darkAt: v) }
            }
        })
    }
}
