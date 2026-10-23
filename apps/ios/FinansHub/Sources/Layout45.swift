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

/// Samme mål og hjørneradius som den aktive fanen (full bredde, 60 høy, radius 20), ikon over «Hjem», lab-rød med hvit tekst.
/// Inn: vokser (0,6 → 1) med lett fjæring. Ut: krymper (→ 0,55) og tones ut. «Reduser bevegelse»: bare uttoning.
struct RailHome45: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        Button { Layout45.shared.goHome(store, reduce: reduce) } label: { label }
            .buttonStyle(Press45Style())
            .accessibilityLabel("Til Hjem")
    }

    private var label: some View {
        VStack(spacing: 3) {
            Image(systemName: "house.fill").font(.system(size: 18, weight: .semibold))
            Text("Hjem").font(PF.ui(12.5, .semibold)).lineLimit(1)
        }
        .foregroundStyle(p.onLab)
        .frame(maxWidth: .infinity)
        .frame(height: 60)
        .background(p.lab, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: Color.black.opacity(0.35), radius: 8, y: 6)
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

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

/// Skann-ikonet: fire hjørner + strek i midten (samme som den flytende skann-knappen på telefon).
struct ScanGlyph45: View {
    var size: CGFloat = 22
    var color: Color = .white

    var body: some View {
        ZStack {
            Image(systemName: "viewfinder").font(.system(size: size, weight: .semibold))
            RoundedRectangle(cornerRadius: 1, style: .continuous).frame(width: size * 0.56, height: 2)
        }
        .foregroundStyle(color)
        .frame(width: size + 4, height: size + 4)
    }
}

/// 46 pt rund knapp i aksentfargen med skann-ikonet. Trykk = valg (kamera), hold = last opp direkte (valgarket). Haptikk.
/// Ligger i sidelinja (ikke i en ScrollView), så hold-gesten tar ikke scroll fra noen.
struct RailScan45: View {
    @Environment(\.paper) private var p
    let label: String
    let tap: () -> Void
    let hold: () -> Void
    @State private var pressed: Bool = false

    var body: some View {
        ScanGlyph45(size: 22, color: p.onLab)
            .frame(width: 46, height: 46)
            .background(p.lab, in: Circle())
            .shadow(color: Color.black.opacity(0.35), radius: 8, y: 5)
            .scaleEffect(pressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.15), value: pressed)
            .contentShape(Circle())
            .onTapGesture { tap() }
            .onLongPressGesture(minimumDuration: 0.45, perform: { hold() }, onPressingChanged: { (v: Bool) in pressed = v })
            .accessibilityLabel(label)
            .accessibilityHint("Trykk for valg, hold inne for å laste opp")
            .accessibilityAddTraits(.isButton)
            .padding(.top, 8)
    }
}

/* ---------- Sidelinja: knappene for wiggle-redigering (claude-code-fold-wiggle-knapper-navbar.md) ---------- */

/// Under redigering i brettet modus ligger + Legg til widget (glass, merke med antall skjulte), ↺ Tilbakestill (bare når
/// oppsettet er endret) og ✓ Ferdig (aksent) nederst i sidelinja, stablet, 46 pt runde. Spretter inn (scale + fade, 320 ms).
struct RailEdit45: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let page: String

    /// Sidene med wiggle-verktøylinje (Hjem-fanene, Mat, Finans, Sporing, Finans → Mer). Kalender og Mer har egne knapper.
    static func handles(_ page: String) -> Bool { Edit28.pages.contains(page) || Home45.pages.contains(page) }

    var body: some View {
        VStack(spacing: 10) {
            if page != "sporing" { addButton }
            if changed { resetButton }
            doneButton
        }
        .padding(.top, 8)
        .transition(.scale(scale: 0.6).combined(with: .opacity).animation(.timingCurve(0.2, 0.9, 0.25, 1.15, duration: 0.32)))
    }

    private var hidden: Int {
        if page == "fmer" { return FinHidden30.shared.hidden.count }
        let keys: [String] = (Edit28.shared.labels[page] ?? []).map { $0.0 }
        if keys.isEmpty { return store.paperPages[page]?.hidden.count ?? 0 }
        return store.pageCards(page, keys).hidden.count
    }

    private var changed: Bool {
        if page == "fmer" { return false }
        if Home45.pages.contains(page) { return Home45.changed(page, store) }
        guard let l = store.paperPages[page] else { return false }
        return !l.order.isEmpty || !l.hidden.isEmpty
    }

    private var addButton: some View {
        let n: Int = hidden
        return Button {
            Haptics.shared.tap()
            if page == "fmer" {
                withAnimation(.easeOut(duration: 0.2)) { FinHidden30.shared.showHidden.toggle() }
            } else {
                Edit28.shared.addOpen = true
            }
        } label: {
            Image(systemName: "plus").font(.system(size: 18, weight: .bold)).foregroundStyle(Color.white)
                .frame(width: 46, height: 46)
                .background(Color.white.opacity(0.14), in: Circle())
                .overlay(alignment: .topTrailing) { badge(n) }
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(n > 0 ? "Legg til widget, \(n) skjult" : "Legg til widget")
    }

    @ViewBuilder private func badge(_ n: Int) -> some View {
        if n > 0 {
            Text("\(n)").font(PF.ui(10.5, .heavy)).foregroundStyle(p.onLab)
                .frame(minWidth: 18, minHeight: 18)
                .background(p.lab, in: Capsule())
                .offset(x: 4, y: -4)
        }
    }

    private var resetButton: some View {
        Button {
            Haptics.shared.select()
            Home45.reset(page, store)
        } label: {
            Image(systemName: "arrow.counterclockwise").font(.system(size: 17, weight: .bold)).foregroundStyle(Color.white)
                .frame(width: 46, height: 46)
                .background(Color.white.opacity(0.14), in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Tilbakestill")
        .transition(.scale(scale: 0.6).combined(with: .opacity))
    }

    private var doneButton: some View {
        Button {
            if page == "fmer" { FinHidden30.shared.showHidden = false }
            store.exitPaperEdit()
        } label: {
            Image(systemName: "checkmark").font(.system(size: 18, weight: .heavy)).foregroundStyle(p.onLab)
                .frame(width: 46, height: 46)
                .background(p.lab, in: Circle())
                .shadow(color: Color.black.opacity(0.35), radius: 8, y: 5)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ferdig")
    }
}
