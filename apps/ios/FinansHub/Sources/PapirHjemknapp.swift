import SwiftUI

/* ---------------- Papir (klassisk): Hjem-knappen i fanelinja (Tilpass → Fanelinje → Hjem-knapp) ----------------
 Hentet tilbake fra NavHome42.swift før Fase 4 (641a80e), da den gamle fanelinja ble erstattet og knappene slettet. Valget og
 logikken (NavHome42, nav42GoHome, nav42Open, nav42Module) lå igjen i NavHomeButton.swift; her er visningene, bygd på dagens
 tokens (PaperPalette, DS.Skygge), Font.ds og glass50Bg. Gjelder bare Papir-pillen (PapirFanelinje.swift):
 – std: ingen knapp («‹ Oversikt» øverst som før).
 – 1a: egen rund knapp til venstre for pillen.  1b: Hjem først i pillen, skilt med en strek.
 – 1c: hevet knapp i aksentfargen midt i pillen.  1d: modulvelger («kr Økonomi ▴») som åpner rutenettet over pillen.
 Med 1a–1c vises ikke Oversikt-fanen i pillen (knappen tar plassen); fanen står fortsatt i skallet, så stakken og
 dyplenkene er de samme. Hjem-knappen er markert når Oversikt vises. */

/// Modulene i 1d: navn og tegn (samme som MODN i fasiten), med navnene fra modullisten (Q1–Q12).
enum PapirModuler {
    static let all: [(String, String, String)] = [
        ("hjem", "Oversikt", "house.fill"), ("finans", "Økonomi", "kr"), ("mat", "Mat", "fork.knife"),
        ("sporing", "Sporing", "shippingbox"), ("domener", "Domener", "globe"), ("familie", "Familie", "person.2"),
        ("boliger", "Boliger", "building.2"), ("abo", "Faste betalinger", "repeat"), ("kalender", "Kalender", "calendar"),
        ("huske", "Gjøremål", "checklist"), ("chat", "Chat", "bubble.left"), ("mer", "Alle", "ellipsis"),
    ]

    static func cur(_ k: String) -> (String, String) {
        if let m = all.first(where: { (x: (String, String, String)) -> Bool in x.0 == k }) { return (m.1, m.2) }
        return ("Moduler", "ellipsis")
    }
}

/// Et tegn: SF Symbol, eller tekst («kr»).
struct PapirGlyf: View {
    let icon: String
    var stil: DS.Tekst = .headline

    var body: some View {
        if icon.count > 2 {
            Image(systemName: icon).font(Font.ds(stil))
        } else {
            Text(icon).font(Font.ds(stil, custom: PF.uiName(.bold))).lineLimit(1).fixedSize()
        }
    }
}

/// 1a: rund knapp (62 pt, samme bakgrunn som pillen) til venstre for pillen.
struct PapirHjemRund: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let home: Bool = store.paperIsHome25
        let skygge: DS.Skygge = DS.Skygge.high
        Button { store.nav42GoHome() } label: {
            Image(systemName: "house.fill").font(Font.ds(.title3))
                .foregroundStyle(home ? p.navActInk : p.navInk)
                .frame(minWidth: 62, minHeight: 62)
                .background(home ? p.navAct : Color.clear, in: Circle())
                .glass50Bg(p, p.nav, Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .shadow(color: Color.black.opacity(skygge.alpha), radius: skygge.blur / 2, y: skygge.y)
        .accessibilityLabel("Oversikt")
        .accessibilityAddTraits(home ? [.isButton, .isSelected] : .isButton)
    }
}

/// 1b: Hjem som første plass i pillen, med en tynn strek mot fanene.
struct PapirHjemForst: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let home: Bool = store.paperIsHome25
        HStack(spacing: 6) {
            Button { store.nav42GoHome() } label: {
                Image(systemName: "house.fill").font(Font.ds(.headline))
                    .foregroundStyle(home ? p.navActInk : p.navInk)
                    .frame(minWidth: 46, minHeight: 46)
                    .background(home ? p.navAct : Color.clear, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Oversikt")
            .accessibilityAddTraits(home ? [.isButton, .isSelected] : .isButton)
            Rectangle().fill(p.navInk.opacity(0.35)).frame(width: 1, height: 26)
                .accessibilityHidden(true)
        }
        .padding(.trailing, 2)
    }
}

/// 1c: hevet knapp (60 pt, 5 pt ring i bakgrunnsfargen) midt i pillen.
struct PapirHjemMidt: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let home: Bool = store.paperIsHome25
        Button { store.nav42GoHome() } label: {
            Image(systemName: "house.fill").font(Font.ds(.title3))
                .foregroundStyle(p.onLab)
                .frame(minWidth: 60, minHeight: 60)
                .background(p.lab, in: Circle())
                .overlay(Circle().stroke(home ? p.navAct : p.bg, lineWidth: 5))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .offset(y: -14)
        .padding(.horizontal, 2)
        .accessibilityLabel("Oversikt")
        .accessibilityAddTraits(home ? [.isButton, .isSelected] : .isButton)
    }
}

/// 1d: første plass viser modulen du er i («kr Økonomi ▴»). Trykk åpner rutenettet.
struct PapirModulvelger: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: NavHome42 { NavHome42.shared }

    var body: some View {
        let cur: (String, String) = PapirModuler.cur(store.nav42Module)
        let open: Bool = m.modPick
        Button {
            Haptics.shared.select()
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.22)) { m.modPick.toggle() }
        } label: {
            HStack(spacing: 5) {
                PapirGlyf(icon: cur.1, stil: .callout)
                Text(cur.0).font(Font.ds(.footnote, custom: PF.uiName(.bold))).lineLimit(1).minimumScaleFactor(0.75)
                Image(systemName: "chevron.up").font(Font.ds(.caption)).rotationEffect(.degrees(open ? 180 : 0))
            }
            .foregroundStyle(p.navActInk)
            .padding(.horizontal, 12)
            .frame(minHeight: 46)
            .background(p.navAct, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .layoutPriority(1)
        .accessibilityLabel("Modulvelger, " + cur.0)
        .accessibilityValue(open ? "Åpen" : "Lukket")
        .accessibilityHint("Åpner Oversikt og alle moduler")
    }
}

/// 1d: rutenettet (3 kolonner) over pillen. Trykk utenfor lukker.
struct PapirModulRutenett: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    /// Høyden pillen tar nederst (rutenettet står rett over den).
    let over: CGFloat

    var body: some View {
        let cur: String = store.nav42Module
        let skygge: DS.Skygge = DS.Skygge.high
        let cols: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: DS.Space.sm), count: 3)
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.001).ignoresSafeArea()
                .onTapGesture { withAnimation(.easeOut(duration: DS.Motion.fast)) { NavHome42.shared.modPick = false } }
                .accessibilityHidden(true)
            LazyVGrid(columns: cols, spacing: DS.Space.sm) {
                ForEach(PapirModuler.all, id: \.0) { (k: (String, String, String)) in cell(k.0, k.1, k.2, on: k.0 == cur) }
            }
            .padding(DS.Space.md)
            .glass50Bg(p, p.nav, RoundedRectangle(cornerRadius: 26, style: .continuous))
            .shadow(color: Color.black.opacity(skygge.alpha), radius: skygge.blur / 2, y: skygge.y)
            .padding(.horizontal, DS.Space.md)
            .padding(.bottom, over + DS.Space.sm)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Moduler")
            .accessibilityAction(.escape) { NavHome42.shared.modPick = false }
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func cell(_ k: String, _ n: String, _ icon: String, on: Bool) -> some View {
        let home: Bool = k == "hjem"
        let bg: Color = home ? p.lab : (on ? p.navAct : p.navInk.opacity(0.12))
        let fg: Color = home ? p.onLab : (on ? p.navActInk : p.navInk)
        return Button { store.nav42Open(k) } label: {
            VStack(spacing: 5) {
                PapirGlyf(icon: icon, stil: .headline)
                Text(n).font(Font.ds(.caption, custom: PF.uiName(.semibold))).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(fg)
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(bg, in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(n)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}
