import SwiftUI
import UIKit

/* ---------------- Prompt 42: valgfri Hjem-knapp i fanelinja (Tilpass → Fanelinje → Hjem-knapp) ---------------- */
// Spesifikasjon: prompts/prompt-42-pakke/claude-code-navbar-hjem-knapp.md. Fasit: Mobil Papir App.dc.html (navHome(), nhVals(),
// nhHide(), nøkkel papir_navhome) og Navbar Hjem-knapp Forslag.dc.html.
// – std: «‹ Hjem» øverst som før. 1a: egen rund knapp til venstre. 1b: Hjem først i pillen med en tynn strek.
//   1c: hevet rød knapp i midten. 1d: modulvelger («kr Finans ▴») med rutenett (3 kolonner).
// – Med 1a/1b/1c fjernes Hjem-fanen fra lista, og knappen er markert når du står på Hjem. 1d viser velgeren også på Hjem.
// – Med 1a–1d skjules «‹ Hjem» øverst på modulens toppsider (der fanelinja vises). Undersider og sider uten fanelinje beholder pila.
// – Lagres lokalt (papir_navhome) og per bruker (layout.homeButton: standard | 1a | 1b | 1c | 1d), så valget synkes.
// – Bred visning (iPad) bruker sidelinja som før.

@MainActor
@Observable
final class NavHome42 {
    static let shared = NavHome42()
    static let key: String = "papir_navhome"
    static let ids: [String] = ["std", "1a", "1b", "1c", "1d"]
    static let options: [(String, String, String)] = [
        ("std", "Standard", "«‹ Hjem» øverst, som i dag"),
        ("1a", "Egen Hjem-knapp", "Rund knapp til venstre for fanelinja"),
        ("1b", "Hjem først i linjen", "Hjem-ikon som første plass, skilt med en strek"),
        ("1c", "Hjem i midten", "Hevet rød knapp midt i fanelinja"),
        ("1d", "Modulvelger", "«kr Finans ▴» åpner Hjem og alle moduler"),
    ]

    var value: String = {
        let v: String = UserDefaults.standard.string(forKey: "papir_navhome") ?? "std"
        return ["std", "1a", "1b", "1c", "1d"].contains(v) ? v : "std"
    }()
    /// Arket i Innstillinger → Tilpass → Fanelinje → Hjem-knapp.
    var picking: Bool = false
    /// 1d: rutenettet med modulene er åpent.
    var modPick: Bool = false

    static func name(_ id: String) -> String { options.first { $0.0 == id }?.1 ?? "Standard" }

    /// Hjem-fanen tas ut av lista (Hjem-knappen tar plassen).
    var dropsHomeTab: Bool { value == "1a" || value == "1b" || value == "1c" }

    func set(_ v: String, _ store: Store) {
        guard NavHome42.ids.contains(v), v != value else { return }
        Haptics.shared.select()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.24)) { value = v; modPick = false }
        UserDefaults.standard.set(v, forKey: NavHome42.key)
        store.savePaperLayout(["homeButton": v == "std" ? "standard" : v])
    }

    /// layout.homeButton fra serveren.
    func apply(_ o: [String: Any]) {
        guard let raw = JS.str(o, "homeButton") else { return }
        let v: String = raw == "standard" ? "std" : raw
        guard NavHome42.ids.contains(v), v != value else { return }
        value = v
        UserDefaults.standard.set(v, forKey: NavHome42.key)
    }
}

extension Store {
    /// Fanelinja vises (samme regel som i PaperShell): ikke i Nyheter, en rett, Ruter i fullskjerm, Chat/Kalender,
    /// Innstillinger, Gjøremål, Bibel og Bursdager.
    var nav42BarShown: Bool {
        // Prompt 50: Familie skjuler fanelinja på Kart, Personside og Sted (Family50Model.swift).
        !newsOpen && dishSel == nil && !ruter24Full && !full27 && !inSettings32b && !inTasks37 && !inBible39 && !inBirthdays41 && !fam50HideBar
    }

    /// «‹ Hjem» øverst skjules på modulens toppsider når en Hjem-knapp (1a–1d) er valgt og fanelinja vises.
    func nav42HideUp(wide: Bool) -> Bool {
        guard !wide, NavHome42.shared.value != "std", nav42BarShown else { return false }
        if paperInner || paperFin != nil || paperClassic != nil || paperTrackFull { return false }
        return prof24UpLabel == "Hjem"
    }

    /// Modulen du står i (1d): finans, mat, sporing, domener, familie, boliger, abo, kalender, huske, chat, hjem eller mer.
    var nav42Module: String {
        if paperTab == "boliger" { return "boliger" }
        if paperTab == "abo" { return "abo" }
        if paperInDomains { return "domener" }
        if paperInFinance { return "finans" }
        if paperClassic == nil && ["hjem", "mat", "sporing", "familie", "kalender", "huske", "chat"].contains(paperTab) { return paperTab }
        return "mer"
    }

    /// Hjem-knappen: rett til Hjem med lett haptikk (historikken nullstilles).
    func nav42GoHome() {
        NavHome42.shared.modPick = false
        if paperIsHome25 { return }
        paperGoHome25()
    }

    func nav42Open(_ k: String) {
        NavHome42.shared.modPick = false
        switch k {
        case "hjem": nav42GoHome()
        case "domener": paperOpenDomains(from: "hjem")
        case "boliger": paperFinGo("boliger")
        default: paperGo(k)
        }
    }
}

/// Modulene i 1d: navn og tegn (samme som MODN i fasiten).
enum NavMods42 {
    static let all: [(String, String, String)] = [
        ("hjem", "Hjem", "house.fill"), ("finans", "Finans", "kr"), ("mat", "Mat", "fork.knife"),
        ("sporing", "Sporing", "shippingbox"), ("domener", "Domener", "globe"), ("familie", "Familie", "person.2"),
        ("boliger", "Boliger", "building.2"), ("abo", "Abonnement", "repeat"), ("kalender", "Kalender", "calendar"),
        ("huske", "Huskeliste", "checklist"), ("chat", "Chat", "bubble.left"), ("mer", "Alle", "ellipsis"),
    ]

    static func cur(_ k: String) -> (String, String) {
        if let m = all.first(where: { $0.0 == k }) { return (m.1, m.2) }
        return ("Moduler", "ellipsis")
    }
}

/// Et tegn: SF Symbol, eller tekst («kr»).
struct NavGlyph42: View {
    let icon: String
    var size: CGFloat = 18

    var body: some View {
        if icon.contains(".") || ["house", "globe", "repeat", "calendar", "checklist", "ellipsis", "shippingbox"].contains(icon) {
            Image(systemName: icon).font(.system(size: size, weight: .semibold))
        } else {
            Text(icon).font(PF.ui(size - 2, .bold)).lineLimit(1).fixedSize()
        }
    }
}

/* ---------- Knappene i fanelinja ---------- */

/// 1a: rund knapp (62 pt, samme bakgrunn som fanelinja) til venstre for linja.
struct NavHomeRound42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let home: Bool = store.paperIsHome25
        Button { store.nav42GoHome() } label: {
            Image(systemName: "house.fill").font(.system(size: 21, weight: .semibold))
                .foregroundStyle(home ? p.navActInk : p.navInk)
                .frame(width: 62, height: 62)
                .background(home ? p.navAct : p.nav, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .shadow(color: .black.opacity(0.35), radius: 15, y: 10)
        .accessibilityLabel("Hjem")
        .accessibilityAddTraits(home ? .isSelected : [])
    }
}

/// 1b: Hjem som første plass i pillen, med en tynn strek mot fanene.
struct NavHomeFirst42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let home: Bool = store.paperIsHome25
        HStack(spacing: 6) {
            Button { store.nav42GoHome() } label: {
                Image(systemName: "house.fill").font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(home ? p.navActInk : p.navInk)
                    .frame(width: 46, height: 46)
                    .background(home ? p.navAct : Color.clear, in: Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Hjem")
            .accessibilityAddTraits(home ? .isSelected : [])
            Rectangle().fill(p.navInk.opacity(0.35)).frame(width: 1, height: 26)
        }
        .padding(.trailing, 2)
    }
}

/// 1c: hevet rød knapp (60 pt, 5 pt ring i bakgrunnsfargen) midt i linja.
struct NavHomeMid42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let home: Bool = store.paperIsHome25
        Button { store.nav42GoHome() } label: {
            Image(systemName: "house.fill").font(.system(size: 22, weight: .semibold))
                .foregroundStyle(p.onLab)
                .frame(width: 60, height: 60)
                .background(p.lab, in: Circle())
                .overlay(Circle().stroke(home ? p.navAct : p.bg, lineWidth: 5))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .offset(y: -14)
        .padding(.horizontal, 2)
        .accessibilityLabel("Hjem")
        .accessibilityAddTraits(home ? .isSelected : [])
    }
}

/// 1d: første plass viser modulen du er i («kr Finans ▴»). Trykk åpner rutenettet.
struct NavModSlot42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: NavHome42 { NavHome42.shared }

    var body: some View {
        let cur: (String, String) = NavMods42.cur(store.nav42Module)
        Button {
            Haptics.shared.select()
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.22)) { m.modPick.toggle() }
        } label: {
            HStack(spacing: 5) {
                NavGlyph42(icon: cur.1, size: 15)
                Text(cur.0).font(PF.ui(12.5, .bold)).lineLimit(1).minimumScaleFactor(0.75)
                Text("▴").font(PF.ui(10, .bold)).rotationEffect(.degrees(m.modPick ? 180 : 0))
            }
            .foregroundStyle(p.navActInk)
            .padding(.horizontal, 12)
            .frame(height: 46)
            .background(p.navAct, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .layoutPriority(1)
        .accessibilityLabel("Modulvelger · \(cur.0)")
        .accessibilityHint("Åpner Hjem og alle moduler")
    }
}

/// 1d: rutenettet (3 kolonner) over fanelinja. Trykk utenfor lukker.
struct NavModGrid42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let cur: String = store.nav42Module
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.001).ignoresSafeArea()
                .onTapGesture { withAnimation(.easeOut(duration: 0.18)) { NavHome42.shared.modPick = false } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(NavMods42.all, id: \.0) { k in cell(k.0, k.1, k.2, on: k.0 == cur) }
            }
            .padding(12)
            .background(p.nav, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .shadow(color: .black.opacity(0.35), radius: 18, y: 10)
            .padding(.horizontal, 12)
            .padding(.bottom, 74)
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func cell(_ k: String, _ n: String, _ icon: String, on: Bool) -> some View {
        let home: Bool = k == "hjem"
        let bg: Color = home ? p.lab : (on ? p.navAct : Color.white.opacity(0.08))
        let fg: Color = home ? p.onLab : (on ? p.navActInk : p.navInk)
        return Button { store.nav42Open(k) } label: {
            VStack(spacing: 5) {
                NavGlyph42(icon: icon, size: 18)
                Text(n).font(PF.ui(11.5, .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(fg)
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(n)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/* ---------- Forhåndsvisning og valg ---------- */

/// Liten forhåndsvisning av fanelinja for hvert valg (bare ikoner, ingen tekst som renner ut).
struct NavHomeMini42: View {
    @Environment(\.paper) private var p
    let kind: String

    var body: some View {
        ZStack(alignment: .bottom) {
            LinearGradient(colors: [Color(hex: "#4a5a6a"), Color(hex: "#2a3440")], startPoint: .top, endPoint: .bottom)
            if kind == "std" {
                Text("‹ ⌂").font(PF.ui(9, .bold)).foregroundStyle(.white)
                    .padding(.horizontal, 6).frame(height: 15)
                    .background(Color(hex: "#1b1a17").opacity(0.55), in: Capsule())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(6)
            }
            HStack(spacing: 5) {
                if kind == "1a" {
                    Image(systemName: "house.fill").font(.system(size: 8, weight: .bold)).foregroundStyle(p.navInk)
                        .frame(width: 22, height: 22).background(p.nav, in: Circle())
                }
                bar
            }
            .padding(.horizontal, 8).padding(.bottom, 7)
        }
        .frame(height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var bar: some View {
        let icons: [String] = kind == "std" || kind == "1d" ? ["house.fill", "creditcard", "fork.knife", "ellipsis"] : ["creditcard", "fork.knife", "shippingbox", "ellipsis"]
        return HStack(spacing: 3) {
            if kind == "1b" {
                Image(systemName: "house.fill").font(.system(size: 7, weight: .bold)).foregroundStyle(p.navActInk)
                    .frame(width: 16, height: 16).background(p.navAct, in: Circle())
                Rectangle().fill(p.navInk.opacity(0.4)).frame(width: 1, height: 10)
            }
            if kind == "1d" {
                Text("kr ▴").font(PF.ui(7.5, .bold)).foregroundStyle(p.navActInk)
                    .padding(.horizontal, 5).frame(height: 16).background(p.navAct, in: Capsule()).fixedSize()
            }
            ForEach(Array(icons.enumerated()), id: \.offset) { i, ic in
                if kind == "1c" && i == icons.count / 2 {
                    Image(systemName: "house.fill").font(.system(size: 8, weight: .bold)).foregroundStyle(p.onLab)
                        .frame(width: 20, height: 20).background(p.lab, in: Circle())
                        .overlay(Circle().stroke(Color(hex: "#2a3440"), lineWidth: 2))
                        .offset(y: -5)
                }
                Image(systemName: ic).font(.system(size: 7, weight: .semibold)).foregroundStyle(i == 0 && kind != "1d" ? p.navActInk : p.navInk)
                    .frame(width: 16, height: 16)
                    .background(i == 0 && kind != "1d" ? p.navAct : Color.clear, in: Circle())
            }
        }
        .padding(.horizontal, 5)
        .frame(height: 24)
        .frame(maxWidth: .infinity)
        .background(p.nav, in: Capsule())
    }
}

/// Et valg som kort: forhåndsvisning, navn og forklaring. Valgt har mørk kant og ✓.
struct NavHomeCard42: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let id: String
    let name: String
    let sub: String

    var body: some View {
        let on: Bool = NavHome42.shared.value == id
        Button { NavHome42.shared.set(id, store) } label: {
            VStack(alignment: .leading, spacing: 7) {
                NavHomeMini42(kind: id)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(name).font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 2)
                    if on { Text("✓").font(PF.ui(13, .bold)).foregroundStyle(p.ink) }
                }
                Text(sub).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? p.ink : p.line, lineWidth: on ? 2 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name + ". " + sub)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// HJEM-KNAPP · FORHÅNDSVISNING i «Rediger fanelinjen»: kortene i 2 kolonner.
struct NavHomePicker42: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PLabel(text: "Hjem-knapp · forhåndsvisning")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(NavHome42.options, id: \.0) { o in NavHomeCard42(id: o.0, name: o.1, sub: o.2) }
            }
        }
    }
}

/// Arket fra Innstillinger → Tilpass → Fanelinje → Hjem-knapp. Endringen skjer med en gang, Ferdig lukker.
struct NavHomeSheet42: View {
    @Environment(\.paper) private var p

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(spacing: 10) {
                    Capsule().fill(p.line).frame(width: 40, height: 5).frame(maxWidth: .infinity)
                    HStack(alignment: .bottom, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("FANELINJE").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                            Text("Hjem-knapp").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                        }
                        Spacer(minLength: 8)
                        SheetButton30(kind: .primary, title: "Ferdig") { NavHome42.shared.picking = false }
                    }
                }
                Text("Velg hvordan du kommer hjem fra modulene. Med en Hjem-knapp i fanelinja forsvinner «‹ Hjem» øverst på modulens sider.")
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                ForEach(NavHome42.options, id: \.0) { o in NavHomeCard42(id: o.0, name: o.1, sub: o.2) }
            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 24)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }
}
