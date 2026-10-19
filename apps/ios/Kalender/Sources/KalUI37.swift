import SwiftUI
import UIKit

/* ---------------- Prompt 37: Kalender på iPhone – kart, fagfarger og tastatur ---------------- */
// • KalKb37: tastaturhøyden (Ny hendelse går helt ned bak tastaturet med padding = tastatur + 16).
// • KalKeyboard37.dismiss(): lukker tastaturet før et hendelsesark åpnes (søk, liste, kort, Glimt-kort).
// • KalGlimtMap37: minikart (120 pt, radius 14) med adresse i glass-etikett under Glimt-kortet. Trykk → veibeskrivelse.
// • KalDetailMap37: kart (170 pt, radius 16), full adresse, «Åpne i Kart» og «Veibeskrivelse ›» i hendelsesarket.
// • KalFagPick37 / KalFagSettings37: «Farge for MEK1300» i arket og Innstillinger → Studie → Fag.

@MainActor
@Observable
final class KalKb37 {
    static let shared: KalKb37 = KalKb37()

    /// Høyden på tastaturet (0 når det er skjult).
    var height: CGFloat = 0
    private var installed: Bool = false

    func install() {
        if installed { return }
        installed = true
        let nc: NotificationCenter = NotificationCenter.default
        _ = nc.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { (n: Notification) in
            let r: CGRect = KalKb37.endFrame(n)
            Task { @MainActor in KalKb37.shared.update(r) }
        }
        _ = nc.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { (_: Notification) in
            Task { @MainActor in KalKb37.shared.height = 0 }
        }
    }

    nonisolated static func endFrame(_ n: Notification) -> CGRect {
        guard let v = n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue else { return CGRect.zero }
        return v.cgRectValue
    }

    /// Den delen av tastaturet som dekker skjermen (0 når det er skjult eller flytende).
    func update(_ r: CGRect) {
        let screenH: CGFloat = KalKeyboard37.screenHeight
        let h: CGFloat = Swift.max(0, screenH - r.minY)
        let v: CGFloat = h > 40 && r.height > 40 ? h : 0
        if abs(v - height) > 1 { height = v }
    }
}

enum KalKeyboard37 {
    /// blurKb() i fasiten.
    @MainActor static func dismiss() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// Vinduets bakgrunn i arkets farge mens Ny hendelse er åpen (nil = standard).
    @MainActor static func windowBg(_ c: UIColor?) {
        for scene in UIApplication.shared.connectedScenes {
            guard let ws = scene as? UIWindowScene else { continue }
            for w in ws.windows { w.backgroundColor = c }
        }
    }

    @MainActor static var screenHeight: CGFloat {
        let scenes: [UIWindowScene] = UIApplication.shared.connectedScenes.compactMap { (s: UIScene) -> UIWindowScene? in s as? UIWindowScene }
        if let sc = scenes.first { return sc.screen.bounds.height }
        return 844
    }

    /// Hjemstrek-området nederst (34 pt på iPhone med Face ID, 0 med hjemknapp).
    @MainActor static var safeBottom: CGFloat {
        let scenes: [UIWindowScene] = UIApplication.shared.connectedScenes.compactMap { (s: UIScene) -> UIWindowScene? in s as? UIWindowScene }
        for sc in scenes {
            for w in sc.windows where w.isKeyWindow { return w.safeAreaInsets.bottom }
        }
        return scenes.first?.windows.first?.safeAreaInsets.bottom ?? 0
    }
}

/* ---------- Kart ---------- */

/// Glimt la til hendelsen (eller den kom fra Glimt i Homelab).
enum KalGlimtEv37 {
    static func byGlimt(_ e: KalEvent) -> Bool { e.id.hasPrefix("u") || !e.src.isEmpty || e.lat != nil }
}

struct KalGlimtMap37: View {
    @Environment(\.kal) private var t
    @Environment(\.openURL) private var openURL
    @ObservedObject private var geo: KalGeo37 = KalGeo37.shared
    let e: KalEvent

    var body: some View {
        if KalGlimtEv37.byGlimt(e), let h = geo.hit(e), let la = h.la, let lo = h.lo {
            Button(action: {
                KalHaptic.tap()
                if let u = KalGeoCache37.directionsURL(h, apple: true) { openURL(u) }
            }) {
                ZStack(alignment: .bottomLeading) {
                    KalMap37View(la: la, lo: lo, height: 120, radius: 14)
                    Text(h.a ?? e.loc).font(KalFont.ui(12, .bold)).foregroundStyle(t.ink).lineLimit(1)
                        .padding(.horizontal, 10).frame(height: 26)
                        .background(Capsule().fill(t.glass))
                        .padding(8)
                }
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line2, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Veibeskrivelse til " + (h.a ?? e.loc))
        }
    }
}

struct KalDetailMap37: View {
    @Environment(\.kal) private var t
    @Environment(\.openURL) private var openURL
    @ObservedObject private var geo: KalGeo37 = KalGeo37.shared
    let e: KalEvent

    var body: some View {
        if let h = geo.hit(e), let la = h.la, let lo = h.lo {
            VStack(alignment: .leading, spacing: 8) {
                Button(action: { open(h, apple: true) }) {
                    KalMap37View(la: la, lo: lo, height: 170, radius: 16)
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Kart")
                Text(h.a ?? e.loc).font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    mapButton("Åpne i Kart", dark: false) { open(h, apple: true) }
                    mapButton("Veibeskrivelse ›", dark: true) {
                        if let u = KalGeoCache37.directionsURL(h, apple: true) { openURL(u) }
                    }
                }
            }
            .padding(.top, 10).padding(.bottom, 12)
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
        }
    }

    private func open(_ h: KalGeoHit37, apple: Bool) {
        KalHaptic.tap()
        if let u = KalGeoCache37.appleURL(KalGeo37.place(e), h) { openURL(u) }
    }

    private func mapButton(_ title: String, dark: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(KalFont.ui(13, .bold)).foregroundStyle(dark ? t.bg : t.ink)
                .frame(maxWidth: .infinity).frame(height: 38)
                .background(Capsule().fill(dark ? t.ink : t.chip))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityLabel(title)
    }
}

/* ---------- Fagfarger ---------- */

/// «Farge for MEK1300» i hendelsesarket (bare Studie-hendelser med fag).
struct KalFagPick37: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let e: KalEvent
    @State private var open: Bool = false

    var body: some View {
        let k: String = KalFag37.key(e.title)
        if !k.isEmpty && KalFag37.isStudy(e, s.cal(e.cal)) {
            VStack(alignment: .leading, spacing: 8) {
                Button(action: {
                    KalHaptic.tap()
                    open.toggle()
                }) {
                    HStack(spacing: 8) {
                        Circle().fill(Color(kalHex: KalFag37.hex(k))).frame(width: 12, height: 12)
                        Text("Farge for " + KalFag37.label(k)).font(KalFont.ui(14, .bold)).foregroundStyle(t.ink)
                        Spacer()
                        Text(open ? "Lukk" : "Endre").font(KalFont.ui(13, .bold)).foregroundStyle(t.mut)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if open {
                    KalFagSwatches37(key: k)
                }
            }
        }
    }
}

/// Fagpaletten (8) + kalenderfargene (12). «Standard» går tilbake til fast fagfarge.
struct KalFagSwatches37: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let key: String

    var body: some View {
        let cur: String = KalFag37.hex(key)
        VStack(alignment: .leading, spacing: 8) {
            KalSwatches35(selected: cur, size: 24) { (h: String) in
                KalHaptic.tap()
                KalFag37.set(key, h)
                s.rebuild()
            }
            if KalFag37.own(key) != nil {
                Button(action: {
                    KalHaptic.tap()
                    KalFag37.set(key, nil)
                    s.rebuild()
                }) {
                    Text("Standard fagfarge").font(KalFont.ui(12.5, .bold)).foregroundStyle(t.mut)
                        .padding(.horizontal, 12).frame(height: 30)
                        .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Innstillinger → Studie → Fag: alle fag med fargeprikk. Trykk gir fargevelger.
struct KalFagSettings37: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var picking: String = ""

    var body: some View {
        let rows: [KalFagRow37] = KalFag37.rows(s.all, cal: { (id: String) -> KalCal? in s.cal(id) })
        VStack(alignment: .leading, spacing: 0) {
            if rows.isEmpty {
                Text("Ingen fag i Studie-kalenderen ennå.").font(KalFont.ui(13)).foregroundStyle(t.mut).padding(.vertical, 12)
            }
            ForEach(rows) { (r: KalFagRow37) in
                row(r)
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private func row(_ r: KalFagRow37) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: {
                KalHaptic.tap()
                picking = picking == r.key ? "" : r.key
            }) {
                HStack(spacing: 12) {
                    Circle().fill(Color(kalHex: r.hex)).frame(width: 14, height: 14).frame(width: 26)
                    Text(r.label).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Spacer()
                    Text(r.own ? "Eget valg" : "Fast").font(KalFont.ui(12)).foregroundStyle(t.mut)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Farge for " + r.label)
            if picking == r.key {
                KalFagSwatches37(key: r.key).padding(.leading, 38).padding(.bottom, 10)
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}
