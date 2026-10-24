import SwiftUI
import UIKit
import LocalAuthentication

/* ---------------- Prompt 31: System-siden «Nordlys OS» (Programvareoppdatering) ---------------- */
// Fasit: design/Mobil Papir App.dc.html → side «nordlys» (isNord, upVals) og prompts/prompt-31-pakke/
// claude-code-system-oppdatering-nordlys.md. Åpnes fra PROGRAMVARE-raden i Innstillinger og ved trykk på oppdateringskortet.
// Ren visning: papirfarget topp (ingen bakgrunnsbilde), ingen fanelinje og ingen skann-knapp (fullskjerm), hero-kortet med
// nordlys-gradient er det eneste fargede. «Oppdater nå» ligger fast nederst med fade bak; innholdet har 120 pt bunnluft.
// Kantsveip fra venstre lukker siden.
//
// «Krev Face ID eller passord» = require_password på serveren (samme bryter som «Krev passord for å oppdatere» på web).
// Valget (dokumentert): av som standard → ett trykk. På → Face ID/Touch ID lokalt; har brukeren valgt «Bruk Face ID neste
// gang» i passordarket, ligger passordet i nøkkelringen (bare denne enheten, etter første opplåsing) og sendes til
// POST /api/auth/reauth {password} → kortlivet reauthToken (5 min) → POST /start {reauthToken}. Ellers (eller hvis Face ID
// feiler / passordet er endret) åpnes passordarket. Passordet sendes aldri uten at Face ID er godkjent først.

@MainActor
@Observable
final class System31Model {
    static let shared = System31Model()

    var open: Bool = false

    func show() {
        Haptics.shared.tap()
        open = true
    }

    func close() {
        Haptic34.back()
        open = false
    }
}

enum System31Auth {
    /// «Face ID», «Touch ID» eller tom (ingen biometri).
    static var biometryName: String {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else { return "" }
        switch ctx.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return ""
        }
    }

    @MainActor static func key(_ store: Store) -> String { "upd31_pw_" + (store.account?.id ?? "") }

    @MainActor static func savePassword(_ pw: String, _ store: Store) {
        Keychain.set(key(store), pw)
    }

    @MainActor static func forget(_ store: Store) {
        Keychain.set(key(store), nil)
    }

    /// Face ID → lagret passord → reauth-token → start. Faller tilbake til passordarket.
    @MainActor static func run(_ action: String, _ store: Store) async {
        let m: Update30Model = Update30Model.shared
        let saved: String? = Keychain.get(key(store))
        if let pw = saved, !pw.isEmpty, !biometryName.isEmpty {
            let ok: Bool = await evaluate("Bekreft oppdateringen av Nordlys OS")
            if ok {
                if let tok = await reauth(pw, store) {
                    Haptics.shared.success()
                    let started: Bool = await m.start(action, body: ["reauthToken": tok], store)
                    if started { return }
                } else {
                    // Passordet er endret: glem det og spør på nytt.
                    forget(store)
                }
            }
        }
        m.rememberPassword = !biometryName.isEmpty && saved == nil
        m.ask(action)
    }

    static func evaluate(_ reason: String) async -> Bool {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Bruk passord"
        return await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { (ok: Bool, _: Error?) in
                c.resume(returning: ok)
            }
        }
    }

    /// POST /api/auth/reauth {password} → reauthToken (eller token).
    @MainActor static func reauth(_ pw: String, _ store: Store) async -> String? {
        guard let d = try? await store.api.callAt("/api", "POST", "/auth/reauth", json: ["password": pw], timeout: 20) else { return nil }
        let o: [String: Any] = JS.obj(d)
        return JS.str(o, "reauthToken") ?? JS.str(o, "token")
    }
}

/* ---------- Visningen ---------- */

/// Legges i PaperShell: fullskjerm for System-siden + oppsett av varsel-trykk (Notify31) og prøve-varsler.
struct System31Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: System31Model { System31Model.shared }

    func body(content: Content) -> some View {
        content
            // Prompt 36: «Starter opp»-skjermen mens serveren starter på nytt (Starter36.swift).
            .overlay { Starter36Overlay().environment(\.paper, p) }
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in m.open = v })) {
                System31Page()
                    .environment(\.paper, p)
                    .edgeSwipeClose30 { m.close() }
            }
            .task(id: store.account?.id ?? "") {
                Notify31.store = store
                guard store.loggedIn else { return }
                await Notify31.fetchPending(store.api, post: false)
                await Trial31Model.shared.load(store.api)
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { (_: Notification) in
                guard store.loggedIn else { return }
                Task { await Notify31.fetchPending(store.api, post: false) }
            }
    }
}

extension View {
    func system31Host(_ p: PaperPalette) -> some View { modifier(System31Host(p: p)) }
}

struct System31Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            System31Top()
            ScrollViewReader { (proxy: ScrollViewProxy) in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    System31Hero()
                    System31VersionCard()
                    Text("Oppdateringen gjøres av updater-containeren på serveren. .env, data/ og proton/ røres ikke.")
                        .font(PF.ui(12)).foregroundStyle(p.mut).lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)
                    // Prompt 44: TIDLIGERE VERSJONER med Installer (rull tilbake), rett under «Krev …» og over NYTT I (Versions44.swift).
                    Versions44Section()
                    System31Notes()
                    // Prompt 36: endringshistorikken vises når serveren ikke har versjonslista fra updateren (eldre server).
                    if Versions44.shared.loaded && !Versions44.shared.available { System36History() }
                    // Prompt 32: versjonsinfo og handlinger fra den gamle «Oppdatering»-siden (Settings32.swift).
                    System32bInstalled()
                }
                .padding(.horizontal, 16).padding(.top, 4)
                .padding(.bottom, 120)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            // Prompt 34: målet fra søket i Innstillinger midt i innholdet.
            .onChange(of: Set34Focus.shared.tick) { (_: Int, _: Int) in
                guard let a = Set34Focus.shared.target, a != "upd" else { return }
                withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(Set34Focus.rowId(a), anchor: .center) }
            }
            }
        }
        .background(p.bg.ignoresSafeArea())
        .overlay(alignment: .bottom) { System31BigButton() }
        .overlay { Starter36Overlay() }
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task { await u.load(store, force: true) }
        .update30Sheet()
    }
}

/// «‹ Tilbake», «PROGRAMVAREOPPDATERING» og «System» på papirbakgrunn (ingen negativ marg: heroen dekker ikke tittelen).
struct System31Top: View {
    @Environment(\.paper) private var p
    @MainActor private var m: System31Model { System31Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { m.close() } label: {
                Text("‹ Tilbake").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                    .padding(.leading, 10).padding(.trailing, 14).frame(height: 34)
                    .background(p.card, in: Capsule())
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 0) {
                Text("PROGRAMVAREOPPDATERING").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Text("System").font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
            }
            .padding(.leading, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 12)
    }
}

/// Hero-kortet: nordlys på natthimmel, «4.22», status, NordlysOS og fremdrift under oppdatering.
struct System31Hero: View {
    @Environment(Store.self) private var store
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 10) {
                System31BigNumber(text: System31Hero.big(u))
                Spacer(minLength: 4)
                System31CheckPill()
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 4) {
                Text(System31Hero.state(u)).font(PF.ui(16, .medium)).foregroundStyle(Color.white.opacity(0.88))
                System31Wordmark()
                Text("Homelab · " + System31Hero.host(store)).font(PF.ui(12.5, .semibold)).foregroundStyle(Color.white.opacity(0.75))
                    .lineLimit(1)
                if u.phase == .run { System31HeroProgress().padding(.top, 10) }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, minHeight: 300, alignment: .topLeading)
        .background { System31Aurora() }
        // Prompt 36: Sherlock-Glimt flyr inn ved «Se etter» (System36.swift).
        .overlay { System36SherlockLayer() }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .shadow(color: Color(hex: "#101a2e").opacity(0.55), radius: 20, y: 14)
        .environment(\.colorScheme, .dark)
    }

    /// «4.22» (major.minor av nyeste eller installerte).
    static func big(_ u: Update30Model) -> String {
        let v: String = u.latest.isEmpty ? u.current : u.latest
        let parts: [Substring] = v.split(separator: ".")
        if parts.count >= 2 { return String(parts[0]) + "." + String(parts[1]) }
        return v.isEmpty ? "–" : v
    }

    static func state(_ u: Update30Model) -> String {
        if u.checking || System36Model.shared.searching { return "Ser etter oppdatering …" }
        switch u.phase {
        case .run: return "Oppdaterer …"
        case .done: return "Oppdatert"
        case .avail: return "Oppdatering tilgjengelig"
        case .failed: return "Oppdateringen feilet"
        case .idle: return "Du har siste versjon"
        }
    }

    @MainActor static func host(_ store: Store) -> String {
        // Prompt 47: domenet vises, aldri den interne IP-en.
        let b: String = store.api.base
        let h: String = URL(string: b)?.host ?? ""
        return h.isEmpty || API.isLocal(h) ? Server47.displayHost(store) : h
    }
}

struct System31BigNumber: View {
    let text: String

    var body: some View {
        Text(text)
            .font(PF.ui(104, .heavy))
            .tracking(-4)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .foregroundStyle(LinearGradient(colors: [Color.white, Color(hex: "#ffd9c2"), Color(hex: "#ff8a5c")],
                                            startPoint: .top, endPoint: .bottom))
            .padding(.top, -10)
    }
}

/// **Nordlys**OS
struct System31Wordmark: View {
    var body: some View {
        let a: Text = Text("Nordlys").font(PF.ui(36, .heavy)).foregroundColor(Color.white)
        let b: Text = Text("OS").font(PF.ui(36, .medium)).foregroundColor(Color.white.opacity(0.75))
        return (a + b).tracking(-0.7)
    }
}

/// Glass-pille «Se etter».
struct System31CheckPill: View {
    @Environment(Store.self) private var store
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        Button { System36Model.shared.sherlock(store) } label: {
            Text(u.checking || System36Model.shared.searching ? "Ser etter …" : "Se etter").font(PF.ui(12, .bold)).foregroundStyle(Color.white)
                .padding(.horizontal, 12).frame(height: 32)
                .background(.ultraThinMaterial, in: Capsule())
                .background(Color.white.opacity(0.12), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(u.phase == .run)
    }
}

/// Bakgrunnen: natt-gradient + fiolett, grønt og varmt rødt lys + to tynne buer.
struct System31Aurora: View {
    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let w: CGFloat = g.size.width
            let h: CGFloat = g.size.height
            ZStack {
                LinearGradient(colors: [Color(hex: "#101a2e"), Color(hex: "#1b2340")], startPoint: .topLeading, endPoint: .bottomTrailing)
                RadialGradient(colors: [Color(hex: "#9a6ad9").opacity(0.95), Color.clear], center: UnitPoint(x: 0.9, y: 0),
                               startRadius: 0, endRadius: w * 0.75)
                RadialGradient(colors: [Color(hex: "#2fc39a").opacity(0.9), Color.clear], center: UnitPoint(x: 0, y: 1),
                               startRadius: 0, endRadius: w * 0.7)
                RadialGradient(colors: [Color(hex: "#d9573a").opacity(0.85), Color.clear], center: UnitPoint(x: 1, y: 1),
                               startRadius: 0, endRadius: w * 0.5)
                Ellipse().stroke(Color.white.opacity(0.18), lineWidth: 1.5)
                    .frame(width: w * 1.1, height: h * 1.2)
                    .rotationEffect(.degrees(-18))
                    .offset(x: w * 0.35, y: -h * 0.3)
                Ellipse().stroke(Color.white.opacity(0.12), lineWidth: 1)
                    .frame(width: w * 1.4, height: h * 1.5)
                    .rotationEffect(.degrees(-12))
                    .offset(x: w * 0.45, y: -h * 0.2)
            }
        }
        .allowsHitTesting(false)
    }
}

/// Hvit fremdriftslinje, steget og prosent i heroen.
struct System31HeroProgress: View {
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Prompt 36: snekker-Glimt hamrer på enden av fyllet (System36.swift).
            Carp36Track(pct: u.pct, S: 34, track: Color.white.opacity(0.22), fill: Color.white)
            HStack {
                Text(u.stepText).font(PF.ui(12, .semibold)).foregroundStyle(Color.white.opacity(0.85)).lineLimit(1)
                Spacer(minLength: 6)
                Text("\(u.pct) %").font(PF.mono(12)).foregroundStyle(Color.white.opacity(0.85))
            }
        }
    }
}

/// Programvareversjon (mono) + «Du har 4.21.0» / «Installert», og bryteren «Krev Face ID eller passord».
struct System31VersionCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Set36Chip(symbol: "info.circle", tint: Set30Colors.system).padding(.trailing, 4) // prompt 36
                VStack(alignment: .leading, spacing: 2) {
                    Text("Programvareversjon").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(verLine).font(PF.mono(12.5, bold: false)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(installed ? "Installert" : "Du har " + u.current).font(PF.ui(12.5, .bold))
                    .foregroundStyle(installed ? Color(hex: "#2f7d4f") : p.mut).lineLimit(1).fixedSize()
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            Rectangle().fill(p.line).frame(height: 1)
            Toggle(isOn: Binding<Bool>(get: { u.requirePassword }, set: { (v: Bool) in toggle(v) })) {
                HStack(spacing: 14) {
                Set36Chip(symbol: "lock", tint: Set30Colors.system) // prompt 36
                VStack(alignment: .leading, spacing: 2) {
                    Text("Krev Face ID eller passord").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(u.requirePassword ? "Face ID eller passord før oppdateringen starter" : "Av · oppdater med ett trykk")
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                }
            }
            .tint(Color(hex: "#2f7d4f"))
            .padding(.horizontal, 16).padding(.vertical, 12)
            .hl34("pw", radius: 14)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: Color.black.opacity(0.12), radius: 15, y: 10)
    }

    private var installed: Bool { u.phase == .done || u.phase == .idle || u.current.isEmpty }

    /// «4.22.0 · 5ea8cb0 · 48 MB»
    private var verLine: String {
        let v: String = u.latest.isEmpty ? u.current : u.latest
        var parts: [String] = [v.isEmpty ? "–" : v]
        if !u.sha.isEmpty { parts.append(u.sha) }
        if u.sizeBytes > 0 && !installed { parts.append(System31VersionCard.mb(u.sizeBytes)) }
        return parts.joined(separator: " · ")
    }

    static func mb(_ b: Int) -> String {
        let m: Double = Double(b) / 1_048_576
        return m >= 10 ? "\(Int(m.rounded())) MB" : String(format: "%.1f MB", m).replacingOccurrences(of: ".", with: ",")
    }

    /// Av → på krever Face ID først (så ingen andre kan slå av beskyttelsen … eller på); lagres for alle enheter.
    private func toggle(_ v: Bool) {
        if !v && !System31Auth.biometryName.isEmpty {
            Task {
                let ok: Bool = await System31Auth.evaluate("Slå av kravet om Face ID eller passord")
                if ok { u.setSetting("require_password", false, store) }
            }
            return
        }
        u.setSetting("require_password", v, store)
    }
}

/// «Dette er Nordlys 4.22. Lys i mørket, kjørt hjemme.» + NYTT I + punktliste fra CHANGELOG (uten tomme punkter).
struct System31Notes: View {
    @Environment(\.paper) private var p
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Dette er Nordlys " + System31Hero.big(u) + ". " + u.tagline).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
            if u.notes.isEmpty {
                Text("Ingen endringsliste for denne versjonen.").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            ForEach(Array(u.notes.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("•").foregroundStyle(p.lab)
                    Text(pair.element).foregroundStyle(p.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                }
                .font(PF.ui(14))
            }
        }
        .padding(.horizontal, 4).padding(.top, 4)
    }

    /// «NYTT I 4.22.0 · 19.10.2026»
    private var kicker: String {
        let v: String = u.latest.isEmpty ? u.current : u.latest
        var s: String = "NYTT I " + v
        let d: String = String(u.publishedAt.prefix(10))
        let ps: [String] = d.split(separator: "-").map { String($0) }
        if ps.count == 3 { s += " · " + ps[2] + "." + ps[1] + "." + ps[0] }
        return s
    }
}

/// Stor blå knapp fast nederst (utenfor scroll-innholdet), med fade fra bakgrunnen bak.
struct System31BigButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        VStack(spacing: 6) {
            Button { tap() } label: {
                Text(title).font(PF.ui(16, .heavy)).foregroundStyle(Color.white)
                    .frame(maxWidth: 520, minHeight: 54)
                    .background(color, in: Capsule())
                    .shadow(color: Color(hex: "#2b5d8a").opacity(0.45), radius: 15, y: 12)
                    .opacity(u.phase == .run || u.busy ? 0.75 : 1)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(u.phase == .run || u.busy)
            // Prompt 34: «Oppdater nå» markeres fra søket i Innstillinger (rød ring + «✦ Trykk her for å oppdatere»).
            .hl34("upd", radius: 27)
            Text(sub).font(PF.ui(12)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 14)
        .frame(maxWidth: .infinity)
        .background(
            LinearGradient(stops: [.init(color: p.bg.opacity(0), location: 0), .init(color: p.bg, location: 0.38)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private var title: String {
        switch u.phase {
        case .run: return "Oppdaterer … \(u.pct) %"
        case .done: return "Ferdig"
        case .avail: return u.busy ? "Starter …" : "Oppdater nå"
        case .failed: return "Prøv igjen"
        case .idle: return "Du har siste versjon"
        }
    }

    private var sub: String {
        switch u.phase {
        case .run: return "Du kan bruke appen mens den oppdateres."
        case .done: return "Endringene er aktive i appen og på web."
        case .avail, .failed: return "Tar backup først · ca. 2 minutter"
        case .idle:
            if let at = u.checkedAt, Date().timeIntervalSince(at) > 120 {
                return "Sist sjekket kl. " + Cal26.hm(Cal26.minutes(at))
            }
            return "Sist sjekket nå"
        }
    }

    private var color: Color {
        switch u.phase {
        case .done: return Color(hex: "#2f7d4f")
        case .idle: return Color(hex: "#b0a998")
        default: return Color(hex: "#2b5d8a")
        }
    }

    private func tap() {
        switch u.phase {
        case .avail, .failed: u.begin("update", store)
        case .done: u.acknowledge()
        case .idle: u.check(store)
        case .run: break
        }
    }
}
