import SwiftUI
import UIKit

/* ---------------- Prompt 45: felles LayoutMode for iPad (claude-code-ipad-brettoppsett.md) ----------------
 Hvorfor brukeren ikke så det nye iPad-designet (skjermbilde uploads/Screenshot 2026-10-23 at 09.38.59.png):
 – Appen kjører riktig som iPad-app (TARGETED_DEVICE_FAMILY "1,2", alle fire retninger, ingen UIRequiresFullScreen), og
   PaperShell tegnet allerede sidelinja på bred skjerm.
 – Men 1c-oppsettet (stort Glimt-kort til venstre + fanene Nå · I dag · Hjemme · Økonomi til høyre) var bare bygget for
   Android/Fold (Fold41.kt) og PWA-en. På iOS var Hjem på iPad fortsatt telefonsiden: toppbildet (230 pt) og én spalte på
   maks 960 pt midt på skjermen. Ingen sjekk koblet iPad til 1c («iPad: ikke valgt ennå»).
 – Bred/smal ble i tillegg avgjort med `bredde ≥ 600` rett i PaperShell, mens enkelte sider sjekket horizontalSizeClass selv.
 Nå: én kilde (LayoutMode45) – bred når vinduet er ≥ 700 pt og ikke har kompakt størrelsesklasse. Vurderes på nytt ved
 rotasjon, Split View, Slide Over og Stage Manager (GeometryReader i PaperShell). Hjem, Gjøremål, Familie og sidelinja leser
 den (miljøverdien paperWide og Layout45.shared.wide for kode utenfor visningene). */

enum LayoutMode45: String {
    case compact
    case wide
}

private struct LayoutMode45Key: EnvironmentKey { static let defaultValue: LayoutMode45 = .compact }

extension EnvironmentValues {
    var layoutMode45: LayoutMode45 {
        get { self[LayoutMode45Key.self] }
        set { self[LayoutMode45Key.self] = newValue }
    }
}

@MainActor
@Observable
final class Layout45 {
    static let shared = Layout45()

    /// Speiler miljøverdien for kode utenfor visningene (Wiggle30.topPad, Edit28Pills).
    var wide: Bool = false
    /// Hjem-knappen i sidelinja er på vei ut (animasjonen kjører før sidebyttet).
    var homeLeaving: Bool = false

    /// Regelen for brettoppsett: tilgjengelig vindusbredde ≥ 700 pt, og ikke kompakt størrelsesklasse (Split View ⅓, Slide Over).
    nonisolated static func mode(width: CGFloat, hsc: UserInterfaceSizeClass?) -> LayoutMode45 {
        if hsc == .compact { return .compact }
        return width >= 700 ? .wide : .compact
    }

    func set(_ v: Bool) {
        if wide != v { wide = v }
    }

    /// Den røde Hjem-knappen: krymper og tones ut (200 ms), og sidebyttet starter etter ca. 190 ms, så tegningen av Hjem
    /// ikke hakker animasjonen. Doble trykk ignoreres mens animasjonen pågår.
    func goHome(_ store: Store, reduce: Bool) {
        if homeLeaving { return }
        Haptics.shared.tap()
        withAnimation(reduce ? .easeOut(duration: 0.18) : .timingCurve(0.4, 0, 0.2, 1, duration: 0.2)) { homeLeaving = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 190_000_000)
            store.paperGoHome25()
            try? await Task.sleep(nanoseconds: 120_000_000)
            self.homeLeaving = false
        }
    }

    /// Sider der skann-knappen ikke hører hjemme (claude-code-fold-skann-i-navbar.md): Kart (Familie), Aksjer, Mer, Bibelvers,
    /// Nordlys (System), Innstillinger.
    static func scanHidden(_ store: Store) -> Bool {
        let t: String = store.paperTab
        if t == "familie" || t == "aksjer" || t == "mer" || t == "bibel" || t == "innst" || t == "profil" { return true }
        if t.hasPrefix("innst-") { return true }
        if store.inSettings32b || store.nav23NoScan { return true }
        return false
    }
}

/* ---------- Sidelinja: rød Hjem-knapp i fane-form ---------- */

/// Trykkeffekt som fanene (skala 0,96).
struct Press45Style: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension AnyTransition {
    /// Hjem-knappen: inn 320 ms med fjæring, ut 200 ms (scale + opacity). Høyden kollapser fordi knappen tas ut av VStack-en.
    static func railHome45(reduce: Bool) -> AnyTransition {
        if reduce { return .opacity }
        let ins: AnyTransition = AnyTransition.scale(scale: 0.6, anchor: .top).combined(with: .opacity)
            .animation(.timingCurve(0.2, 0.9, 0.25, 1.15, duration: 0.32))
        let rem: AnyTransition = AnyTransition.scale(scale: 0.55, anchor: .top).combined(with: .opacity)
            .animation(.timingCurve(0.4, 0, 0.2, 1, duration: 0.2))
        return .asymmetric(insertion: ins, removal: rem)
    }
}

/* ---------- Sidelinja: skann-knappen med skann-ikon ---------- */

/* ---------- Sidelinja: knappene for wiggle-redigering (claude-code-fold-wiggle-knapper-navbar.md) ---------- */
