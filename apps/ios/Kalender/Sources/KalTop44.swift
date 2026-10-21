import SwiftUI

/* ---------------- Prompt 44: iPad – toppfeltet krymper aldri tittelen, og nytt «I dag»-ikon ---------------- */
// Spesifikasjon: claude-code-kalender-ipad-topp-innlogging-hastighet.md (punkt 1) og claude-code-kalender-idag-ikon.md.
// Fasit: Kalender.dc.html (toppfeltet, knappen «I dag»).
// Årsak: tittelen delte plass med periodeknappene, «I dag», visningsvelgeren (6 valg), søk, Glimt og «+ Ny hendelse» og hadde
// minimumScaleFactor/flex-shrink – med sidepanelet åpent (~520 pt mindre) ble den «UKE… 19…». Nå krymper tittelen aldri
// (fixedSize, høyest prioritet), og plassen hentes fra knappene etter faktisk bredde i innholdsfeltet:
//   ≥ 1500 som før · < 1500 Glimt bare orb, «+ Ny» · < 1280 visningsvelgeren blir meny («Uke ▾») ·
//   < 1060 «+» rund (44) og «I dag» som kalender-ikon med dagens tall · < 900 tittelen på egen rad over verktøylinjen.

/// Tittelen i to linjer: «UKE 43» (mono, rød) over «19.–25. oktober» (Newsreader 28). Aldri avkortet.
struct KalTitle44: Equatable {
    let kicker: String
    let title: String

    @MainActor static func make(_ s: KalStore) -> KalTitle44 {
        let A: Date = KalD.date(s.anchor)
        switch s.view {
        case "mnd":
            return KalTitle44(kicker: KalD.months[KalD.month(A) - 1].uppercased(), title: String(KalD.year(A)))
        case "uke":
            let m0: Date = KalWeek35.start(A)
            return KalTitle44(kicker: "UKE " + String(KalWeek35.weekNo(m0)), title: range(m0, KalD.add(m0, 6)))
        case "3d":
            return KalTitle44(kicker: "UKE " + String(KalD.isoWeek(A)), title: range(A, KalD.add(A, 2)))
        case "dag":
            let t: String = String(KalD.dayOfMonth(A)) + ". " + KalD.months[KalD.month(A) - 1]
            return KalTitle44(kicker: KalD.weekdays[KalD.wd(A)].uppercased(), title: t)
        case "ar":
            return KalTitle44(kicker: "ÅR", title: String(KalD.year(A)))
        default:
            return KalTitle44(kicker: "NESTE 6 UKER", title: "Agenda")
        }
    }

    /// «19.–25. oktober» · «29. sep.–5. oktober».
    static func range(_ a: Date, _ b: Date) -> String {
        let mb: String = KalD.months[KalD.month(b) - 1]
        if KalD.month(a) == KalD.month(b) {
            return String(KalD.dayOfMonth(a)) + ".–" + String(KalD.dayOfMonth(b)) + ". " + mb
        }
        return String(KalD.dayOfMonth(a)) + ". " + KalD.monthsShort[KalD.month(a) - 1] + "–" + String(KalD.dayOfMonth(b)) + ". " + mb
    }
}

/// Bredde-trinnene (målt på innholdsfeltet, ikke enhetstypen – virker også i Split View og Stage Manager).
struct KalTier44: Equatable {
    let w: CGFloat
    var fullGlimt: Bool { w >= 1500 }
    var segmented: Bool { w >= 1280 }
    var wideNew: Bool { w >= 1060 }
    var todayPill: Bool { w >= 1060 }
    var titleRow: Bool { w < 900 }
}

struct KalTop44: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let inline: Bool
    let width: CGFloat

    var body: some View {
        let tier: KalTier44 = KalTier44(w: width)
        let h: KalTitle44 = KalTitle44.make(s)
        VStack(alignment: .leading, spacing: 4) {
            if tier.titleRow {
                KalTitleView44(h: h).padding(.leading, 56)
            }
            KalTopBar44(tier: tier, h: h, inline: inline)
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }
}

struct KalTitleView44: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let h: KalTitle44

    var body: some View {
        Button(action: { s.zoomOut() }) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(h.kicker).font(KalFont.mono(10.5)).tracking(1.3).foregroundStyle(t.acc).lineLimit(1)
                    if s.syncing44 { KalSyncing44() }
                }
                Text(h.title).font(KalFont.serif(28)).foregroundStyle(t.ink).lineLimit(1)
            }
            .fixedSize()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .layoutPriority(3)
        .accessibilityLabel(h.kicker + " " + h.title + ", zoom ut")
    }
}

/// «Oppdaterer …» ved tittelen mens den synker (aldri tom kalender eller spinner over rutenettet).
struct KalSyncing44: View {
    @Environment(\.kal) private var t

    var body: some View {
        Text("Oppdaterer …").font(KalFont.ui(10.5, .semibold)).foregroundStyle(t.mut).lineLimit(1).fixedSize()
            .transition(.opacity)
    }
}

struct KalTopBar44: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let tier: KalTier44
    let h: KalTitle44
    let inline: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            sideButton
            if !tier.titleRow { KalTitleView44(h: h) }
            KalTopNav44(tier: tier, nav: s.view != "liste")
            Spacer(minLength: 6)
            KalTopViews44(tier: tier)
            KalTopActions44(tier: tier)
        }
    }

    private var sideButton: some View {
        Button(action: { KalPad42Model.shared.toggleSide(inline: inline) }) {
            Image(systemName: "sidebar.left").font(.system(size: 18, weight: .semibold)).foregroundStyle(t.ink)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel("Sidepanel")
    }
}

/// ‹ › og I dag (pille, eller kalender-ikon med dagens tall når det er trangt).
struct KalTopNav44: View {
    @MainActor private var s: KalStore { KalStore.shared }
    let tier: KalTier44
    let nav: Bool

    var body: some View {
        HStack(spacing: 4) {
            if nav {
                KalRoundIcon(name: "chevron.left", label: "Forrige") { s.step(-1) }.hoverEffect(.highlight)
                KalRoundIcon(name: "chevron.right", label: "Neste") { s.step(1) }.hoverEffect(.highlight)
            }
            if tier.todayPill {
                KalTodayPill35 { s.goToday() }.hoverEffect(.highlight)
            } else {
                KalTodayButton44 { s.goToday() }
            }
        }
        .fixedSize()
        .layoutPriority(2)
    }
}

/// Visningsvelgeren: segmenter når det er plass, ellers meny-knapp med valgt visning («Uke ▾»).
struct KalTopViews44: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let tier: KalTier44

    private var current: String {
        KalViewPicker.views.first { (v: KalViewOpt) -> Bool in v.id == s.view }?.name ?? "Mnd"
    }

    var body: some View {
        if tier.segmented {
            KalViewPicker().frame(width: 380).layoutPriority(1)
        } else {
            menu
        }
    }

    private var menu: some View {
        Menu {
            ForEach(KalViewPicker.views) { (v: KalViewOpt) in
                Button(v.name) { s.go(view: v.id) }
            }
        } label: {
            Text(current + " ▾").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink)
                .padding(.horizontal, 14).frame(height: 38)
                .background(Capsule().fill(t.chip))
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .fixedSize()
        .accessibilityLabel("Visning: " + current)
    }
}

/// Søk, Glimt (pille eller bare orb) og Ny hendelse («+ Ny hendelse» · «+ Ny» · rund «+»).
struct KalTopActions44: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let tier: KalTier44

    var body: some View {
        HStack(spacing: 6) {
            KalRoundIcon(name: "magnifyingglass", label: "Søk") { KalPad42Keys.openSearch() }.hoverEffect(.highlight)
            glimt
            KalTopNew44(tier: tier)
        }
        .fixedSize()
        .layoutPriority(2)
    }

    private var glimt: some View {
        Button(action: {
            KalHaptic.tap()
            s.glimtOpen = true
        }) {
            KalGlimtLabel44(full: tier.fullGlimt)
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel("Glimt")
    }
}

struct KalGlimtLabel44: View {
    @Environment(\.kal) private var t
    let full: Bool

    var body: some View {
        if full {
            HStack(spacing: 6) {
                KalSpark(size: 16)
                Text("Glimt").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink)
            }
            .padding(.horizontal, 14).frame(height: 38)
            .background(Capsule().fill(t.card))
            .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Capsule())
        } else {
            KalSpark(size: 20)
                .frame(width: 44, height: 44)
                .background(Circle().fill(t.card))
                .overlay(Circle().strokeBorder(t.line, lineWidth: 1))
                .contentShape(Circle())
        }
    }
}

struct KalTopNew44: View {
    @MainActor private var s: KalStore { KalStore.shared }
    let tier: KalTier44

    var body: some View {
        Button(action: { s.openNew() }) {
            label
                .foregroundStyle(Color.white)
                .background(Capsule().fill(Color(kalHex: "#b23a2a")))
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .hoverEffect(.lift)
        .accessibilityLabel("Ny hendelse")
    }

    @ViewBuilder private var label: some View {
        if !tier.wideNew {
            Image(systemName: "plus").font(.system(size: 17, weight: .heavy)).frame(width: 44, height: 44)
        } else if tier.fullGlimt {
            Text("+ Ny hendelse").font(KalFont.ui(13.5, .bold)).padding(.horizontal, 16).frame(height: 38)
        } else {
            Text("+ Ny").font(KalFont.ui(13.5, .bold)).padding(.horizontal, 16).frame(height: 38)
        }
    }
}

/* ---------- «I dag»-ikonet ---------- */

/// 24 × 24: avrundet ramme (6 pt hjørner, 1,8 pt strek i tekstfarge), rød topp-stripe 6 pt (#b23a2a), dagens tall midtstilt
/// i feltet under (Manrope 800, 10,5 pt). Ingen ringer eller streker som krysser tallet. Tallet følger dagen (også midnatt).
struct KalTodayIcon44: View {
    @Environment(\.kal) private var t
    var size: CGFloat = 24

    var body: some View {
        TimelineView(.everyMinute) { (_: TimelineViewDefaultContext) in
            face(String(KalD.dayOfMonth(Date())))
        }
    }

    private func face(_ n: String) -> some View {
        let k: CGFloat = size / 24
        return VStack(spacing: 0) {
            Rectangle().fill(Color(kalHex: "#b23a2a")).frame(height: 6 * k)
            Text(n).font(KalFont.ui(10.5 * k, .heavy)).tracking(-0.2).foregroundStyle(t.ink)
                .lineLimit(1).minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.bottom, 1 * k)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 6 * k, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 6 * k, style: .continuous).strokeBorder(t.ink, lineWidth: 1.8 * k))
        .accessibilityHidden(true)
    }
}

/// Rund knapp (44) med ikonet.
struct KalTodayButton44: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            KalTodayIcon44()
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel("I dag")
    }
}
