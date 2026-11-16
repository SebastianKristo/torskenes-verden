import SwiftUI

/* ---------------- Papir (klassisk): den flytende fanelinja nederst ----------------
 Hentet tilbake fra PaperTabBar (Paper.swift før Fase 4, 641a80e) som et valg i Innstillinger → Utseende → Fanelinje
 (FanelinjeValg.swift). Utseendet er det samme som før: en pille som flyter over innholdet nederst, papirfarget i Papir og
 matt glass i Liquid Glass (glass50Bg), med den valgte fanen i en kontrastpille og stilen fra «Fanelinje-stil»
 (Tekst / Bare ikoner / Ikoner + navn på valgt, NavStyle.swift). Hold inne = «Rediger fanelinjen».
 Forskjellen fra før: fanene er de samme som i systemets fanelinje (ShellTabs.all/compact, Mer sist), og et trykk går
 gjennom ShellTabs.select, så stakken per fane, dyplenkene og tilbake-oppførselen er felles. Linja skifter ikke innhold per
 seksjon (Q33): Økonomi, Domener, Faste betalinger og Familie har seksjonsvelgeren (ShellSectionBar) over pillen.
 Tokens: fargene fra PaperPalette (DS-tokens), fonten Font.ds (Dynamic Type), avstand og skygge fra DS. */

/// Høyden pillen tar, målt i skallet (AppTabs), så sidene får like mye luft nederst (ShellPageView).
struct PapirFanelinjeHoydeKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = Swift.max(value, nextValue()) }
}

struct PapirFanelinje: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dynamicTypeSize) private var dts
    let tabs: [ShellTab]
    let current: String
    let velg: (String) -> Void

    var body: some View {
        // Med de største tekststørrelsene får hver fane bare ikonet (navnet vises i forstørret visning ved langt trykk).
        let style: String = dts.isAccessibilitySize ? "icons" : store.navStyle25
        let skygge: DS.Skygge = DS.Skygge.high
        HStack(spacing: 2) {
            ForEach(tabs) { (t: ShellTab) in
                fane(t, on: t.id == current, style: style)
            }
        }
        .padding(.horizontal, DS.Space.sm)
        .padding(.vertical, DS.Space.sm)
        .glass50Bg(p, p.nav, Capsule())
        .shadow(color: Color.black.opacity(skygge.alpha), radius: skygge.blur / 2, y: skygge.y)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.55).onEnded { (_: Bool) in rediger() })
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Fanelinje")
        .accessibilityAction(named: Text("Rediger fanelinjen")) { rediger() }
        .padding(.horizontal, DS.Space.md)
        .padding(.top, DS.Space.xs)
        .padding(.bottom, DS.Space.xs)
    }

    private func fane(_ t: ShellTab, on: Bool, style: String) -> some View {
        Button { trykk(t.id) } label: {
            PapirFaneEtikett(tab: t, on: on, style: style)
        }
        .buttonStyle(.plain)
        .layoutPriority(on && style != "icons" ? 1 : 0)
        .accessibilityLabel(t.title)
        .accessibilityValue(t.badge > 0 ? ShellTabs.badgeTekst(t.id, t.badge) : "")
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        .accessibilityShowsLargeContentViewer {
            Label(t.title, systemImage: t.symbol)
        }
    }

    private func trykk(_ id: String) {
        // Klikket som kommer når fingeren slippes etter hold inne, navigerer ikke (én gang), som før (Nav26).
        if Nav26.shared.consumeHold() { return }
        velg(id)
    }

    private func rediger() {
        Nav26.shared.markHold()
        Haptics.shared.tick()
        store.tabBarEditing = true
    }
}

/// Én fane i pillen: ikon og/eller navn etter stilen, valgt fane i kontrastpillen, merket på ikonet (eller etter navnet).
struct PapirFaneEtikett: View {
    @Environment(\.paper) private var p
    let tab: ShellTab
    let on: Bool
    let style: String

    var body: some View {
        let showIcon: Bool = style != "text" || on
        let showLabel: Bool = style == "text" || (style == "icons_active_label" && on)
        let expand: Bool = style == "icons" || !on
        let ikonStil: DS.Tekst = showLabel ? .callout : .headline
        HStack(spacing: 7) {
            if showIcon {
                Image(systemName: tab.symbol)
                    .font(Font.ds(ikonStil))
                    .overlay(alignment: .topTrailing) {
                        if tab.badge > 0 { PapirFaneMerke(antall: tab.badge).offset(x: 10, y: -8) }
                    }
                    .accessibilityHidden(true)
            }
            if showLabel {
                Text(tab.title)
                    .font(.ds(.footnote, custom: PF.uiName(.semibold)))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                if !showIcon && tab.badge > 0 { PapirFaneMerke(antall: tab.badge) }
            }
        }
        .foregroundStyle(on ? p.navActInk : p.navInk)
        .padding(.horizontal, expand ? 6 : 16)
        .frame(maxWidth: expand ? .infinity : nil)
        .frame(minWidth: 44, minHeight: 46)
        .background(on ? p.navAct : Color.clear, in: Capsule())
        .contentShape(Capsule())
    }
}

/// Merket (antall) på en fane: aksentfargen med tall på, høyst «99+».
struct PapirFaneMerke: View {
    @Environment(\.paper) private var p
    let antall: Int

    var body: some View {
        Text(antall > 99 ? "99+" : String(antall))
            .font(.ds(.caption, custom: PF.uiName(.bold)))
            .foregroundStyle(p.onLab)
            .padding(.horizontal, 5)
            .frame(minWidth: 16, minHeight: 16)
            .background(p.lab, in: Capsule())
            .fixedSize()
            .accessibilityHidden(true)
    }
}
