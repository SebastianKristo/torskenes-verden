import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Papir, prompt 16: ikonfarger, profil, utseende og titler ----------------
 Fase 4: fanelinja (PaperTabItem, brukerens faner) er flyttet til ShellTabs.swift. Døde typer fjernet: GoogleArc20 og
 PaperTabBarEditor (erstattet av HomeTabEditor32b). */

/// Fargetemaene for ikonene i Innstillinger. «Standard» er dagens farger.
enum PaperIconTheme {
    static let themes: [(String, String, [String])] = [
        ("standard", "Standard", ["#b23a2a", "#2f7a4f", "#2f5d8a", "#c27a1a", "#6b4fa0", "#1f7a7a"]),
        ("varm", "Varm", ["#c8553d", "#e0913a", "#b8762f", "#d06a5a", "#a8452f", "#e0b33a"]),
        ("kjolig", "Kjølig", ["#2f5d8a", "#3f8fb0", "#4a6fa5", "#2f7a7a", "#5b6fb0", "#3a8a8a"]),
        ("mono", "Blekk", ["#1b1a17", "#4a463d", "#6b665c", "#1b1a17", "#4a463d", "#6b665c"]),
        ("fargerik", "Fargerik", ["#e05a7a", "#3fbf8a", "#4a8fe0", "#e0b33a", "#9a7be0", "#e8833a"]),
    ]

    static func colors(_ theme: String) -> [Color] {
        let list = themes.first { $0.0 == theme }?.2 ?? themes[0].2
        return list.map { Color(hex: $0) }
    }

    static func color(_ theme: String, _ i: Int) -> Color {
        let c = colors(theme)
        return c[((i % c.count) + c.count) % c.count]
    }
}

/// Google-logoen i søkefeltet (den firefargede «G»-en).
/// Prompt 22: de offisielle banene fra google-g.svg (48 × 48, #EA4335 / #4285F4 / #FBBC05 / #34A853), se DesignGlyphs.swift.
struct GoogleG: View {
    var size: CGFloat = 18
    var body: some View {
        ZStack {
            GoogleG22Part(part: 0).fill(Color(hex: "#EA4335"))
            GoogleG22Part(part: 1).fill(Color(hex: "#4285F4"))
            GoogleG22Part(part: 2).fill(Color(hex: "#FBBC05"))
            GoogleG22Part(part: 3).fill(Color(hex: "#34A853"))
        }
        .frame(width: size, height: size)
        .padding(2)
        .accessibilityElement()
        .accessibilityLabel("Google")
    }
}

extension Store {
    /* ---------- Titler for de nye sidene ---------- */

    var paper16Title: String? {
        switch paperTab {
        case "aksjer": return "Aksjer"
        case "boliger": return folder?.name ?? "Boliger"
        case "familie": return "Familie"
        case "avg": return "Avganger"
        case "profil": return "Profil"
        case "innst-ut", "innst-tilpass": return "Tilpass"
        case "innst-appprofil": return "Appprofil"
        case "innst-tab": return "Fanelinje"
        case "innst-fam": return "Familie og helse"
        case "innst-helse": return "Helse og posisjon"
        case "innst-hahelse": return "Home Assistant"
        // Prompt 37: modulen heter Gjøremål (intern nøkkel er fortsatt «huske»).
        case "huske": return "Gjøremål"
        case "bibel": return "Bibel"
        case "kalender": return "Kalender"
        default:
            if paperTab.hasPrefix("innst-") { return PaperSettingsSub.title26(String(paperTab.dropFirst(6)))?.0 }
            return nil
        }
    }

    var paper16Kicker: String? {
        switch paperTab {
        case "aksjer": return "Trading 212" + (stocksX?.mock == true ? " · demodata" : "")
        case "boliger": return folder.map { $0.address ?? "Bolig" } ?? Bol24Model.shared.kicker
        case "familie": return "Posisjon, soner og helse"
        case "avg": return "Ruter · sanntid fra Entur"
        case "profil": return "@" + (account?.username ?? "")
        case "innst-ut", "innst-tilpass": return "Navn, ikon, tema, farger og fanelinje"
        case "innst-appprofil": return "Faner, sider og startside"
        case "innst-tab": return "Faner, navn og ikoner"
        case "innst-fam": return "Deling, personvern og Apple Helse"
        case "innst-helse": return "Apple Health, datatyper og posisjon"
        case "innst-hahelse": return "Helse fra Mobilapp-integrasjonen"
        case "huske": return "To-do for hele familien"
        case "bibel": return "Dagens vers, rekke og leseplan"
        case "kalender": return Cal26Model.shared.kicker
        default:
            if paperTab.hasPrefix("innst-") { return PaperSettingsSub.title26(String(paperTab.dropFirst(6)))?.1 }
            return nil
        }
    }

    /* ---------- Boliger ---------- */

    func loadBoligerList() async {
        if let d = try? await api.call("GET", "/folders"), let list: [Folder] = try? decodeList(d) { folders = list }
    }
}

/* ---------- Innstillinger: undersider i Papir ---------- */

/// Profil: profilbilde, navn, @brukernavn og rolle (trykk på profilbildet øverst).
struct PaperProfile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var pick: PhotosPickerItem?

    var body: some View {
        VStack(spacing: 10) {
            PCard {
                VStack(spacing: 12) {
                    ZStack {
                        Circle().fill(p.popSel)
                        if let a = store.avatar {
                            Image(uiImage: a).resizable().scaledToFill().clipShape(Circle())
                        } else {
                            Text(String(store.displayName.prefix(1)).uppercased()).font(PF.serif(40, medium: true)).foregroundStyle(p.ink)
                        }
                    }
                    .frame(width: 96, height: 96)
                    Text(store.displayName.isEmpty ? "Konto" : store.displayName).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                    Text(handle).font(PF.mono(12, bold: false)).foregroundStyle(p.mut)
                    PhotosPicker(selection: $pick, matching: .images) {
                        Text("Bytt profilbilde").font(PF.ui(13.5, .semibold)).foregroundStyle(p.onLab).padding(.horizontal, 16).frame(height: 38)
                            .background(p.lab, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity)
            }
            PaperLinkList(rows: [
                PaperLinkRow(name: "Brukernavn", sub: "Vises som @\(store.account?.username ?? "") i Finans", value: "", icon: "at") {},
                PaperLinkRow(name: "Rolle", sub: role, value: "", icon: "person.badge.shield.checkmark") {},
                PaperLinkRow(name: "Server", sub: store.account?.server ?? "", value: "", icon: "server.rack") {},
                PaperLinkRow(name: "Kontoer og brukere", sub: "Legg til eller bytt konto", icon: "person.2") { store.paperGo("innst-konto") },
                PaperLinkRow(name: "Logg ut", sub: "Du må logge inn igjen med 2FA", value: "Logg ut", valueColor: p.lab, icon: "rectangle.portrait.and.arrow.right") { store.logout() },
            ])
        }
        .onChange(of: pick) { _, v in
            guard let v else { return }
            Task {
                if let d = try? await v.loadTransferable(type: Data.self), let img = UIImage(data: d) { store.uploadAvatar(img) }
                pick = nil
            }
        }
    }

    private var handle: String {
        let u = store.account?.username ?? ""
        return u.isEmpty ? "" : "@\(u)"
    }

    private var role: String {
        (store.me?.role ?? store.account?.role ?? "") == "admin" ? "Administrator" : "Bruker"
    }
}

/// Utseende: tema, bakgrunn på Hjem (flyttet hit fra «Oslo ▾») og fargetema for ikonene.
struct PaperLookSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var pick: PhotosPickerItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Tema").padding(.leading, 4).padding(.top, 6)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Papir · lys", sub: "Lyst papir og svart fanelinje", value: store.paperMode == "lys" ? "✓" : "", valueColor: p.pos, icon: "sun.max") { store.setPaperMode("lys") },
                PaperLinkRow(name: "Papir · mørk", sub: "Kveldspapir og lys fanelinje", value: store.paperMode == "mork" ? "✓" : "", valueColor: p.pos, icon: "moon") { store.setPaperMode("mork") },
                PaperLinkRow(name: "Følg systemet", sub: "Lys om dagen, mørk i mørk modus", value: store.paperMode == "auto" ? "✓" : "", valueColor: p.pos, icon: "circle.lefthalf.filled") { store.setPaperMode("auto") },
                // Prompt 51 (IOSFEAT51): automatisk etter solnedgang eller klokkeslett, synket mellom enheter (ThemeSync.swift).
                PaperLinkRow(name: "Automatisk", sub: "Etter solnedgang eller klokkeslett", value: store.paperMode.hasPrefix(Theme51.autoPrefix) ? "✓" : "›", valueColor: p.pos, icon: "sunset") { Theme51.shared.sheet = true },
                // Prompt 50: Liquid Glass (GlassTheme.swift) – slår også på flisene på Hjem.
                PaperLinkRow(name: "Liquid Glass", sub: "Mørkt glass, fargeskyer og fliser på Hjem", value: store.glass50 ? "✓" : "", valueColor: p.pos, icon: "drop") { store.setGlass50() },
            ])
            // Prompt 50: «Hjem som fliser» (papir_home_tiles, HomeTiles.swift).
            Home50TilesToggle().padding(.top, 8)
            PLabel(text: "Bakgrunn på Hjem").padding(.leading, 4).padding(.top, 14)
            bgGrid
            BgTuning()
            PLabel(text: "Ikonfarger").padding(.leading, 4).padding(.top, 14)
            VStack(spacing: 0) {
                ForEach(Array(PaperIconTheme.themes.enumerated()), id: \.element.0) { i, t in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Button { store.setIconTheme(t.0) } label: {
                        HStack(spacing: 12) {
                            HStack(spacing: 4) {
                                ForEach(Array(t.2.prefix(5).enumerated()), id: \.offset) { _, c in
                                    RoundedRectangle(cornerRadius: 5, style: .continuous).fill(Color(hex: c)).frame(width: 18, height: 18)
                                }
                            }
                            Text(t.1).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                            Spacer()
                            if store.iconTheme == t.0 { Image(systemName: "checkmark").accessibilityLabel("Valgt").font(PF.ui(14, .bold)).foregroundStyle(p.pos) }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.top, 8)
            // Prompt 32: FANELINJE og FANELINJE · ANDRE SIDER (NavTabEditor.swift).
            Nav32bSettingsGroup()
        }
        .onChange(of: pick) { _, v in
            guard let v else { return }
            Task {
                if let d = try? await v.loadTransferable(type: Data.self), let img = UIImage(data: d) { store.uploadPhoto(img) }
                pick = nil
            }
        }
        .task { await store.loadBgPreviews() }
    }

    private var bgGrid: some View {
        let kinds: [(String, String, String)] = [("cur", "Ingen bilde", "Mørk gradient"), ("oslo", "Oslo", "Oslo fra lufta · skifter gjennom dagen"),
                                                  ("weather", "Vær nå", "Følger været der du er"), ("planets", "Planeter", "Jorda, Månen, Jupiter, Mars, Saturn")]
        return VStack(spacing: 8) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(kinds, id: \.0) { k in bgTile(k.0, k.1, k.2) }
            }
            PhotosPicker(selection: $pick, matching: .images) {
                HStack {
                    Image(systemName: "photo.badge.plus")
                    Text(store.photo == "custom" ? "Bytt eget bilde" : "+ Eget bilde")
                    Spacer()
                    if store.photo == "custom" { Text("✓ Valgt").foregroundStyle(p.pos) }
                }
                .font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(height: 46)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            if store.photoFailed {
                Button { store.retryPhoto() } label: {
                    Text("Fikk ikke lastet bildet · trykk for å prøve igjen").font(PF.ui(12.5)).foregroundStyle(p.lab)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 8)
    }

    private func bgTile(_ kind: String, _ name: String, _ sub: String) -> some View {
        let on = store.photo == kind
        return Button { store.setPhoto(kind) } label: {
            VStack(alignment: .leading, spacing: 6) {
                ZStack {
                    LinearGradient(colors: bgColors(kind), startPoint: .topLeading, endPoint: .bottomTrailing)
                    if on, kind != "cur", let img = store.photoImage {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else if kind != "cur", let img = store.bgPreviews[kind] ?? Store.cachedBg(kind) ?? Store.cachedBg("prev-" + kind) {
                        Image(uiImage: img).resizable().scaledToFill()
                    }
                }
                .frame(height: 74)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(name).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                        Text(sub).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if on { Image(systemName: "checkmark").accessibilityLabel("Valgt").font(PF.ui(14, .bold)).foregroundStyle(p.pos) }
                }
            }
            .padding(8)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? p.ink : Color.clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
    }

    private func bgColors(_ kind: String) -> [Color] {
        switch kind {
        case "oslo": return [Color(hex: "#f2b36b"), Color(hex: "#d7766a"), Color(hex: "#4a3a5e")]
        case "weather": return [Color(hex: "#3d7cc9"), Color(hex: "#7fb2e5"), Color(hex: "#f4d9a6")]
        case "planets": return [Color(hex: "#05060d"), Color(hex: "#141a33")]
        default: return [Color(hex: "#1d2a44"), Color(hex: "#3a3f6b"), Color(hex: "#c9826b")]
        }
    }
}

/* ---------- Sporing: standardikoner for transportørene ---------- */

/// Innebygde merker for de vanligste transportørene (DHL, Posten, PostNord, Helthjem, Bring), tegnet lokalt så de
/// alltid vises, også uten nett. Andre transportører får initialer på merkefargen.
struct CarrierMark: View {
    let carrier: String
    var size: CGFloat = 42
    var radius: CGFloat = 12

    static func known(_ c: String) -> Bool { logo(c) != nil || ["dhl", "posten", "postnord", "helthjem", "bring"].contains(Carrier42.id(c)) }

    var body: some View {
        // Prompt 42: «PostNord AB», «POSTNORD», «postnord_no» … → postnord (CarrierLogos.swift).
        let c = Carrier42.id(carrier)
        ZStack {
            if let img = CarrierMark.logo(c) {
                // Logoen fra serveren (public/carriers/*.svg), lagt inn i appen som bilde.
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(bg(c))
                mark(c)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .accessibilityLabel(name(c))
    }

    /// Ekte logo i asset-katalogen (Carrier-<id>), ellers nil og bokstav-merket brukes.
    static func logo(_ c: String) -> UIImage? {
        let id: String
        switch Carrier42.id(c) {
        case "17track", "track17", "parcelsapp", "": id = "other"
        case let x: id = x
        }
        return UIImage(named: "Carrier-" + id)
    }

    @ViewBuilder private func mark(_ c: String) -> some View {
        switch c {
        case "dhl":
            Text("DHL").font(.system(size: size * 0.34, weight: .black)).italic().foregroundStyle(Color(hex: "#D40511"))
                .lineLimit(1).minimumScaleFactor(0.5).padding(.horizontal, size * 0.06)
        case "posten":
            VStack(spacing: size * 0.02) {
                PostHorn().stroke(Color.white, style: StrokeStyle(lineWidth: size * 0.06, lineCap: .round, lineJoin: .round))
                    .frame(width: size * 0.52, height: size * 0.34)
                Text("posten").font(.system(size: size * 0.16, weight: .heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.5)
            }
        case "postnord":
            Text("postnord").font(.system(size: size * 0.2, weight: .heavy)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.4).padding(.horizontal, size * 0.08)
        case "helthjem":
            HStack(spacing: size * 0.03) {
                Text("helthjem").font(.system(size: size * 0.17, weight: .heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.4)
                Circle().fill(Color(hex: "#FF8A3D")).frame(width: size * 0.1, height: size * 0.1)
            }
            .padding(.horizontal, size * 0.08)
        case "bring":
            Text("bring").font(.system(size: size * 0.26, weight: .heavy)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.5)
        default:
            Text(Carrier42.initials(carrier)).font(.system(size: size * 0.36, weight: .heavy)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
    }

    private func bg(_ c: String) -> Color {
        switch c {
        case "dhl": return Color(hex: "#FFCC00")
        case "posten": return Color(hex: "#E32D22")
        case "postnord": return Color(hex: "#00A0D6")
        case "helthjem": return Color(hex: "#2E2A6B")
        case "bring": return Color(hex: "#7BC144")
        default: return Color(hex: "#3A4252")
        }
    }

    private func name(_ c: String) -> String {
        switch c {
        case "dhl": return "DHL"
        case "posten": return "Posten"
        case "postnord": return "PostNord"
        case "helthjem": return "Helthjem"
        case "bring": return "Bring"
        default: return carrier
        }
    }
}

/// Et forenklet posthorn (Postens merke).
struct PostHorn: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        let w = r.width, h = r.height
        // Munnstykket til venstre, buen over, og klokka til høyre.
        p.move(to: CGPoint(x: r.minX, y: r.minY + h * 0.55))
        p.addLine(to: CGPoint(x: r.minX + w * 0.18, y: r.minY + h * 0.55))
        p.addCurve(to: CGPoint(x: r.minX + w * 0.78, y: r.minY + h * 0.55),
                   control1: CGPoint(x: r.minX + w * 0.25, y: r.minY - h * 0.15),
                   control2: CGPoint(x: r.minX + w * 0.72, y: r.minY - h * 0.15))
        p.addLine(to: CGPoint(x: r.minX + w * 0.18, y: r.minY + h * 0.55))
        p.move(to: CGPoint(x: r.minX + w * 0.78, y: r.minY + h * 0.55))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY + h * 0.2))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}
