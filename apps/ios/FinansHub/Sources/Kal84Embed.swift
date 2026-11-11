import SwiftUI
import UIKit
import Combine
import UserNotifications

/* ---------------- Prompt 84: «Kalender i appen» – hele Kalender-appen inni Homelab ---------------- */
// For sideloading (SideStore med gratis Apple-ID har plass til tre apper): Kalender-appens kode (Kalender/Sources og
// SharedKal/Core) er med i FinansHub-målet med flagget KAL_EMBED (project.yml). Innstillinger → «Kalender i appen»
// (kal84_embed, standard på). På: alt som i dag åpner Kalender-appen (KalLink33 – Hjem-kortet og -flisen, kalenderfanen,
// Mer → Kalender, Glimt, varsler, Chat-kort, briefen, finanshub://kalender fra widgetene) åpner i stedet den innebygde
// Kalenderen i fullskjerm, med «‹ Homelab» øverst. Av: som før (Kalender-appen hvis den er installert, ellers Homelabs side).
// Presentasjonen er en UIKit-fullskjerm (samme som SwiftUI fullScreenCover) fra øverste kontroller, så den virker også over
// andre fullskjermer (briefen, Vær …) – og «‹ Homelab» går tilbake dit man var.
// Innlogging: samme konto som Homelab. Kalender-økten ligger i App Group-en (kal.token, delt med den frittstående appen og
// widgetene); mangler den, logger Homelab inn med et ferskt enhets-token («Fortsett som», POST /api/auth/device-token →
// KalShared41 → device-exchange), ellers companion-tokenet (KalCompanion33 → kal.hl.*). Ingen egen innloggingsskjerm normalt.

enum Kal84 {
    /// @AppStorage-nøkkelen for bryteren i Innstillinger.
    static let key: String = "kal84_embed"

    /// «Kalender i appen» (standard på).
    static var on: Bool { (UserDefaults.standard.object(forKey: key) as? Bool) ?? true }
}

@MainActor
final class Kal84Host {
    static let shared: Kal84Host = Kal84Host()

    /// Homelab-kontoen (settes av kal84Host på roten i App.swift).
    weak var store: Store? = nil
    private weak var vc: UIViewController? = nil
    private var loginBusy: Bool = false

    var isOpen: Bool { vc != nil }

    /* ---------- Åpne og lukke ---------- */

    /// Åpner den innebygde Kalenderen (eller bare lenken når den allerede er åpen). url = kalender://… fra KalLink33.
    func show(_ url: URL?) {
        prepare()
        if vc != nil {
            if let url { KalLinks.handle(url, trusted: true) }
            return
        }
        if let url { KalLinks.handle(url, trusted: true) }
        present(0)
    }

    /// Lukker og går tilbake dit man var i Homelab.
    func close() {
        guard let h = vc else { return }
        vc = nil
        KalKeyboard37.dismiss()
        let s: KalStore = KalStore.shared
        s.stopPolling()
        s.saveSnapshot()
        KalSec51Model.shared.inactive()
        // Lukker fullskjermen og alt den selv har vist over seg (ark o.l.).
        if let p = h.presentingViewController { p.dismiss(animated: true, completion: nil) } else { h.dismiss(animated: true, completion: nil) }
    }

    /// En Homelab-lenke (finanshub://, homelab://, papir://) mens Kalender er åpen – f.eks. «Bursdager ›» eller «Kontoer og synk»
    /// i Kalender: lukk først, så vises siden i Homelab. finanshub://kalender… blir i Kalender. false = ikke åpen.
    func closeFirst(_ url: URL, _ then: @escaping @MainActor () -> Void) -> Bool {
        if vc == nil { return false }
        let host: String = (url.host ?? "").lowercased()
        if url.scheme == "finanshub" && (host == "kalender" || host == "calendar") && Kal84.on { return false }
        close()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            then()
        }
        return true
    }

    /// Før visning: varsler, enhetsnøkkel og automatisk innlogging med Homelab-kontoen.
    private func prepare() {
        let e: KalEmbed84 = KalEmbed84.shared
        if e.login == nil { e.login = { Kal84Host.shared.login(force: true) } }
        e.notify = !KalLink33.installed
        if !e.notify { Kal84Host.clearReminders() }
        // Prompt 51: enhetsnøkkel på innlogging/token-kall og flagg (som KalApp.init).
        KalSec51.enabled = true
        if let st = store, st.loggedIn { UserDefaults.standard.set(false, forKey: "kal.noAuto") }
        login(force: false)
    }

    private func present(_ attempt: Int) {
        Task { @MainActor in
            // Vent til en annen fullskjerm som er på vei ut (briefen lukkes før kalenderen åpnes) er borte.
            try? await Task.sleep(nanoseconds: attempt == 0 ? 80_000_000 : 200_000_000)
            if self.vc != nil { return }
            let top: (UIViewController?, Bool) = Kal84Host.top()
            guard let from = top.0 else { return }
            if top.1 {
                if attempt < 12 { self.present(attempt + 1) }
                return
            }
            let h: UIHostingController<Kal84Root> = UIHostingController(rootView: Kal84Root())
            h.modalPresentationStyle = .fullScreen
            self.vc = h
            KalEmbed84.shared.host = h
            from.present(h, animated: true, completion: nil)
        }
    }

    /// Øverste kontroller i nøkkelvinduet, og om en presentasjon er på vei inn eller ut.
    static func top() -> (UIViewController?, Bool) {
        let scenes: [UIWindowScene] = UIApplication.shared.connectedScenes.compactMap { (s: UIScene) -> UIWindowScene? in s as? UIWindowScene }
        let scene: UIWindowScene? = scenes.first(where: { (s: UIWindowScene) -> Bool in s.activationState == .foregroundActive }) ?? scenes.first
        let wins: [UIWindow] = scene?.windows ?? []
        let win: UIWindow? = wins.first(where: { (w: UIWindow) -> Bool in w.isKeyWindow }) ?? wins.first
        var vc: UIViewController? = win?.rootViewController
        var moving: Bool = false
        while let p = vc?.presentedViewController {
            if p.isBeingDismissed {
                moving = true
                break
            }
            if p.isBeingPresented { moving = true }
            vc = p
        }
        return (vc, moving)
    }

    /* ---------- Aktiv / bakgrunn (som scenePhase i KalApp) ---------- */

    func active() {
        if vc == nil { return }
        let s: KalStore = KalStore.shared
        KalLogin41Model.shared.returned44()
        s.bootstrap()
        login(force: false)
        s.startPolling()
        Task { await s.load(force: true) }
        if s.loggedIn { Task { await KalLogin41Model.syncServers() } }
        KalSec51Model.shared.active()
    }

    func background() {
        if vc == nil { return }
        let s: KalStore = KalStore.shared
        KalSec51Model.shared.inactive()
        s.stopPolling()
        s.saveSnapshot()
    }

    func appeared() {
        let s: KalStore = KalStore.shared
        KalThemed.apply(s.theme)
        // Temaet på nytt når fullskjermen står i vinduet («System» leser telefonens stil fra skjermen).
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 400_000_000)
            KalThemed.apply(KalStore.shared.theme)
        }
        s.startPolling()
        if s.loggedIn { Task { await KalLogin41Model.syncServers() } }
    }

    /* ---------- Innlogging med Homelab-kontoen ---------- */

    /// Kalender-økten fra App Group-en (kal.token) eller Homelabs companion-token (kal.hl.*); ellers et ferskt enhets-token
    /// fra Homelab som byttes mot Kalenders eget («Fortsett som», uten trykk). force = knappen «Logg inn med Homelab-appen».
    func login(force: Bool) {
        let s: KalStore = KalStore.shared
        // Prompt 85: et companion-token (kal.hl.*) laget for en annen Homelab-konto fjernes før bootstrap() kan ta det i bruk.
        if let a = store?.account, KalGroup.homelabToken != nil, KalGroup.homelabFor != KalGroup.fingerprint(a.token) { KalCompanion33.clear() }
        s.bootstrap()
        dropForeign85(s)
        if s.loggedIn { return }
        if !force && UserDefaults.standard.bool(forKey: "kal.noAuto") { return }
        guard let st = store, st.loggedIn, !loginBusy else { return }
        loginBusy = true
        Task { @MainActor in
            defer { self.loginBusy = false }
            if await Kal84Host.shareDevice(st) {
                KalLogin41Model.shared.quick()
                return
            }
            await KalCompanion33.ensure84(st)
            if KalStore.shared.adoptHomelab() { return }
            if force { KalLogin41Model.shared.quick() }
        }
    }

    /* ---------- Prompt 85: Kalender-økten følger Homelab-kontoen ---------- */

    /// Hvilken Homelab-konto den innebygde Kalender-økten ble laget for (brukernavn + server).
    static let acctDef85: String = "kal84.acct"

    static func acctKey85(_ a: LoginAccount) -> String {
        a.username.trimmingCharacters(in: .whitespaces).lowercased() + "|" + API.normalize(a.server).lowercased()
    }

    /// Hører økten til en annen konto? saved = kontoen økten ble laget for (tom = ukjent, f.eks. fra før oppdateringen):
    /// da sammenlignes navnet på økten med navnene på Homelab-kontoen.
    nonisolated static func foreign85(saved: String, key: String, kalUser: String, names: [String]) -> Bool {
        if !saved.isEmpty { return saved != key }
        let u: String = kalUser.trimmingCharacters(in: .whitespaces).lowercased()
        if u.isEmpty { return false }
        let known: [String] = names.map { (n: String) -> String in n.trimmingCharacters(in: .whitespaces).lowercased() }
        return !known.contains(u)
    }

    /// Før: økten (kal.token) ble liggende når Homelab byttet konto eller logget inn som en annen, og den innebygde Kalenderen
    /// viste (og skrev til) den forrige brukerens kalender. Nå glemmes en økt som hører til en annen konto, og Homelab logger
    /// inn med kontoen som er i bruk.
    private func dropForeign85(_ s: KalStore) {
        guard let st = store, st.loggedIn, let a = st.account else { return }
        let d: UserDefaults = UserDefaults.standard
        let key: String = Kal84Host.acctKey85(a)
        if s.loggedIn {
            let saved: String = d.string(forKey: Kal84Host.acctDef85) ?? ""
            let names: [String] = [a.username, a.name, a.label, st.displayName]
            if Kal84Host.foreign85(saved: saved, key: key, kalUser: KalGroup.user, names: names) {
                s.dropSession85()
                d.set(false, forKey: "kal.noAuto")
            }
        }
        if d.string(forKey: Kal84Host.acctDef85) != key { d.set(key, forKey: Kal84Host.acctDef85) }
    }

    /// Samme som AppAuth41.shareDevice, men nå (ikke høyst hvert 2. min) og med svar: kortlivet enhets-token i KalShared41.
    static func shareDevice(_ st: Store) async -> Bool {
        guard let a = st.account else { return false }
        var bases: [String] = []
        for b in [st.base, a.server, a.external, a.local] where !b.isEmpty && !bases.contains(b) { bases.append(b) }
        let name: String = st.displayName.isEmpty ? a.label : st.displayName
        guard let d = try? await st.api.callAt("/api", "POST", "/auth/device-token", json: ["app": "kalender"], timeout: 12) else { return false }
        let o: [String: Any] = JS.obj(d)
        guard let tok = JS.str(o, "device_token"), !tok.isEmpty else { return false }
        let exp: Double = JS.date(o["expiresAt"])?.timeIntervalSince1970 ?? (Date().timeIntervalSince1970 + (JS.num(o, "expiresIn") ?? 900))
        KalShared41.save(KalDevice41(token: tok, user: a.username, name: name, bases: bases, exp: exp))
        return true
    }

    /// Den frittstående Kalender-appen er installert og planlegger påminnelsene: fjern de innebygde (kal33-…) fra Homelab.
    static func clearReminders() {
        let center: UNUserNotificationCenter = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { (reqs: [UNNotificationRequest]) in
            let ids: [String] = reqs.map { (r: UNNotificationRequest) -> String in r.identifier }.filter { (id: String) -> Bool in id.hasPrefix(KalNotify.prefix) }
            if !ids.isEmpty { center.removePendingNotificationRequests(withIdentifiers: ids) }
        }
    }
}

/* ---------- Fullskjermen: «‹ Homelab» + hele Kalender-appen ---------- */

struct Kal84Root: View {
    @Environment(\.colorScheme) private var cs

    private var t: KalTheme { cs == .dark ? KalTheme.darkTheme : KalTheme.light }

    var body: some View {
        VStack(spacing: 0) {
            Kal84Bar(t: t) { Kal84Host.shared.close() }
            KalAppRoot()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(t.bg.ignoresSafeArea())
        .onAppear { Kal84Host.shared.appeared() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { (_: Notification) in
            Kal84Host.shared.active()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { (_: Notification) in
            Kal84Host.shared.background()
        }
    }
}

/// Topplinjen over Kalender (ikke over innholdet): «‹ Homelab» i Kalenders rødfarge og skrift.
struct Kal84Bar: View {
    let t: KalTheme
    let close: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(action: {
                KalHaptic.tap()
                close()
            }) {
                Text("‹ Homelab")
                    .font(KalFont.ui(15, .semibold))
                    .foregroundStyle(t.acc)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Tilbake til Homelab")
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity)
        .background(t.bg.ignoresSafeArea(edges: .top))
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}

/* ---------- Innstillinger → «Kalender i appen» ---------- */

struct Kal84Settings: View {
    @Environment(\.paper) private var p
    @AppStorage("kal84_embed") private var embed: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Kalender").padding(.top, 12).padding(.leading, 4)
            PCard(padding: 0) {
                Toggle(isOn: Binding<Bool>(get: { embed }, set: { (v: Bool) in
                    embed = v
                    Haptics.shared.select()
                })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Kalender i appen").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                        Text(Kal84Settings.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .tint(p.pos)
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
        }
    }

    static let sub: String = "Bruk hele Kalender-appen inni Homelab. Nyttig når du sideloader og bare har plass til én app."
}

extension View {
    /// Prompt 84: gir den innebygde Kalenderen Homelab-kontoen, og lukker den når Homelab logger ut.
    func kal84Host(_ store: Store) -> some View {
        onAppear { Kal84Host.shared.store = store }
            .onChange(of: store.loggedIn) { (_: Bool, v: Bool) in
                if !v { Kal84Host.shared.close() }
            }
    }
}
