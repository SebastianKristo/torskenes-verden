import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Papir, prompt 16: fanelinje, ikonfarger, profil og innstillinger ---------------- */

/// En fane i hovedfanelinjen (layout.tabBar.items). Mer står alltid sist og er ikke med her.
struct PaperTabItem: Codable, Hashable, Identifiable {
    var id: String
    var label: String
    var icon: String

    /// Alle fanene som kan ligge i linjen.
    static let all: [PaperTabItem] = [
        PaperTabItem(id: "hjem", label: "Hjem", icon: "house"),
        PaperTabItem(id: "finans", label: "Finans", icon: "creditcard"),
        PaperTabItem(id: "mat", label: "Mat", icon: "fork.knife"),
        PaperTabItem(id: "auto4", label: "Domener/Sporing", icon: "square.grid.2x2"),
        PaperTabItem(id: "domener", label: "Domener", icon: "globe"),
        PaperTabItem(id: "sporing", label: "Sporing", icon: "shippingbox"),
        PaperTabItem(id: "familie", label: "Familie", icon: "person.2"),
        PaperTabItem(id: "avg", label: "Avganger", icon: "tram"),
        PaperTabItem(id: "vaer", label: "Vær", icon: "cloud.sun"),
        PaperTabItem(id: "nyheter", label: "Nyheter", icon: "newspaper"),
        PaperTabItem(id: "aksjer", label: "Aksjer", icon: "chart.line.uptrend.xyaxis"),
        PaperTabItem(id: "boliger", label: "Boliger", icon: "building.2"),
        PaperTabItem(id: "abo", label: "Abonnementer", icon: "repeat"),
        PaperTabItem(id: "fsok", label: "Søk", icon: "magnifyingglass"),
        // Prompt 27: Chat som valgbar fane (Chat27Page.swift).
        PaperTabItem(id: "chat", label: "Chat", icon: "bubble.left.and.bubble.right"),
        // Prompt 40: alt fra Mer kan legges i fanelinja (claude-code-fanelinje-alle-sider.md), samme ikon som i Mer.
        PaperTabItem(id: "huske", label: "Gjøremål", icon: "checklist"),
        PaperTabItem(id: "kalender", label: "Kalender", icon: "calendar"),
        PaperTabItem(id: "bursdag", label: "Bursdager", icon: "gift"),
        PaperTabItem(id: "brief", label: "Now Brief", icon: "sparkles"),
        PaperTabItem(id: "rss", label: "Nyhetsleser", icon: "dot.radiowaves.up.forward"),
        PaperTabItem(id: "bibel", label: "Bibel", icon: "book"),
        PaperTabItem(id: "nordlys", label: "Nordlys", icon: "sparkle"),
        PaperTabItem(id: "innst", label: "Innstillinger", icon: "gearshape"),
    ]

    /// Prompt 40: det som kan velges under «Legg til» (Bibel bare for brukere med modulen).
    @MainActor static var selectable: [PaperTabItem] {
        all.filter { (t: PaperTabItem) -> Bool in t.id != "bibel" || Bible37Model.shared.enabled }
    }

    /// Fane-id-ene på serveren (layout.tabBar) er litt annerledes enn i appen.
    static func serverId(_ id: String) -> String {
        switch id {
        case "fsok": return "sok"
        case "avg": return "avganger"
        case "abo": return "abonnementer"
        case "auto4": return "domener"
        default: return id
        }
    }
    static func appId(_ id: String, label: String) -> String? {
        switch id {
        case "sok": return "fsok"
        case "avganger": return "avg"
        case "abonnementer": return "abo"
        case "domener": return label == "Domener/Sporing" ? "auto4" : "domener"
        case "mer", "media": return nil
        default: return all.contains { $0.id == id } ? id : nil
        }
    }
    static let defaultIds = ["hjem", "finans", "mat", "auto4", "fsok"]
    static var defaults: [PaperTabItem] { defaultIds.compactMap { id in all.first { $0.id == id } } }
    static let icons = ["house", "creditcard", "fork.knife", "globe", "shippingbox", "person.2", "tram", "cloud.sun", "newspaper",
                        "magnifyingglass", "square.grid.2x2", "star", "heart", "bolt", "leaf", "map", "chart.bar", "bag", "cart", "calendar", "bubble.left.and.bubble.right"]

    static func loadLocal() -> [PaperTabItem] {
        guard let d = UserDefaults.standard.data(forKey: "fh_tabbar"), let v = try? JSONDecoder().decode([PaperTabItem].self, from: d) else { return [] }
        return v
    }
    static func saveLocal(_ v: [PaperTabItem]) {
        if let d = try? JSONEncoder().encode(v) { UserDefaults.standard.set(d, forKey: "fh_tabbar") }
    }
}

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

/// Et ikon i fanelinja: SF Symbol-navn (ASCII) eller et tegn som «◎».
struct PaperTabIcon: View {
    let icon: String
    var size: CGFloat = 16
    /// Prompt 24 (claude-code-familie-design.md, «Fanelinje – ikon ved siden av tekst»): ikonboks 18 × 18,
    /// glyf 16 pt, sentrert mot teksten og flyttet 1,5 pt ned. Tegn-ikoner (◎ ◌ ♡ ⋯) i Newsreader 500.
    var body: some View {
        let box: CGFloat = 18
        if PaperTabIcon.isSymbol(icon) {
            Image(systemName: icon).font(.system(size: size - 2, weight: .semibold))
                .frame(width: box, height: box)
                .offset(y: 1.5)
        } else {
            Text(icon).font(PF.serif(size, medium: true)).lineLimit(1).fixedSize()
                .frame(width: box, height: box)
                .offset(y: 1.5)
        }
    }
    static func isSymbol(_ s: String) -> Bool { s.count > 2 && s.unicodeScalars.allSatisfy { $0.isASCII } }
}

/// Google-logoen i søkefeltet (den firefargede «G»-en).
/// Prompt 22: de offisielle banene fra google-g.svg (48 × 48, #EA4335 / #4285F4 / #FBBC05 / #34A853), se Glyphs22.swift.
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

/// Én bue av G-en. trim starter kl. 3 og går med klokka.
struct GoogleArc20: View {
    let from: CGFloat
    let to: CGFloat
    let color: Color
    let width: CGFloat
    var body: some View {
        Circle()
            .trim(from: from, to: to)
            .stroke(color, style: StrokeStyle(lineWidth: width, lineCap: .butt))
            .padding(width / 2)
    }
}

extension Store {
    /* ---------- Oppsett fra serveren ---------- */

    /// tabBar og iconTheme fra /api/me/layout.
    func applyPaper16(_ o: [String: Any]) {
        if let tb = o["tabBar"] as? [String: Any] {
            let items = JS.list(tb, "items").compactMap { d -> PaperTabItem? in
                guard let sid = JS.str(d, "id"), let id = PaperTabItem.appId(sid, label: JS.str(d, "label") ?? ""),
                      let base = PaperTabItem.all.first(where: { $0.id == id }) else { return nil }
                let icon = JS.str(d, "icon") ?? base.icon
                return PaperTabItem(id: id, label: JS.str(d, "label") ?? base.label, icon: PaperTabIcon.isSymbol(icon) ? icon : base.icon)
            }
            if !items.isEmpty && items != tabBarItems { tabBarItems = Array(items.prefix(5)) }
        }
        if let v = JS.str(o, "iconTheme"), PaperIconTheme.themes.contains(where: { $0.0 == v }), v != iconTheme { iconTheme = v }
        // Prompt 25: fanelinje-stil (NavStyle25.swift).
        if let v = JS.str(o, "navStyle"), NavStyle25.ids.contains(v), v != navStyle25 { navStyle25 = v }
    }

    /// Fanene i hovedlinjen (uten Mer), i brukerens rekkefølge.
    var mainTabItems: [PaperTabItem] { tabBarItems.isEmpty ? PaperTabItem.defaults : tabBarItems }

    func setTabBar(_ items: [PaperTabItem]) {
        let v = Array(items.prefix(5))
        tabBarItems = v
        savePaperLayout(["tabBar": ["items": Store.tabBarBody(v)]])
        Haptics.shared.success()
    }

    func resetTabBar() {
        tabBarItems = []
        savePaperLayout(["tabBar": ["items": Store.tabBarBody(PaperTabItem.defaults)]])
        Haptics.shared.select()
    }

    /// Fanene slik serveren vil ha dem (Mer sist, maks 6).
    nonisolated static func tabBarBody(_ v: [PaperTabItem]) -> [[String: String]] {
        var out = v.prefix(5).map { ["id": PaperTabItem.serverId($0.id), "label": $0.label, "icon": $0.icon] }
        out.append(["id": "mer", "label": "Mer", "icon": "ellipsis"])
        return out
    }

    func setIconTheme(_ v: String) {
        iconTheme = v
        savePaperLayout(["iconTheme": v])
        Haptics.shared.select()
    }

    /// Fanene i hovedlinjen slik de vises nå: Hjem bare på startsiden, Domener/Sporing etter «Automatisk»,
    /// Søk bare med den flytende skanneknappen, og Mer alltid sist.
    func mainTabs(floating: Bool, onHome: Bool) -> [(String, String, String)] {
        var out: [(String, String, String)] = []
        for it in mainTabItems {
            var id = it.id
            var label = it.label
            switch it.id {
            case "hjem": if !onHome { continue }
            case "fsok": if !floating { continue }
            case "auto4":
                id = paperTab4
                if label == "Domener/Sporing" { label = id == "sporing" ? "Sporing" : "Domener" }
            default: break
            }
            if out.contains(where: { $0.0 == id }) { continue }
            out.append((id, label, it.icon))
        }
        out.append(("mer", "Mer", "ellipsis"))
        return out
    }

    /// Et trykk på en fane i hovedlinjen: noen faner er egne skjermer (Vær, Nyheter).
    func paperMainTab(_ id: String) {
        switch id {
        case "vaer": openWeather()
        case "nyheter": openNews()
        // Prompt 40: ark/overlegg åpnes som ark, resten navigeres til.
        case "rss": openNews()
        case "brief": Brief34Model.shared.show()
        case "nordlys": System31Model.shared.show()
        case "chat": openChat()
        case "aksjer", "boliger": paperFinGo(id)
        case "domener": paperOpenDomains(from: "hjem")
        default: paperGo(id)
        }
    }

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

/* ---------- Fanelinje: redigering ---------- */

/// Rediger fanelinja: fjern og legg til faner, endre navn og bytt ikon. Mer står alltid sist.
struct PaperTabBarEditor: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var items: [PaperTabItem] = []
    @State private var iconFor: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Hold inne på fanelinja for å komme hit. Du kan ha opptil 5 faner pluss Mer, som alltid står sist.")
                        .font(PF.ui(13)).foregroundStyle(p.mut)
                    PLabel(text: "I fanelinja")
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { i, it in
                            if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                            row(i, it)
                        }
                        Rectangle().fill(p.line).frame(height: 1)
                        HStack(spacing: 12) {
                            iconBox("ellipsis", locked: true)
                            Text("Mer").font(PF.ui(15, .semibold)).foregroundStyle(p.mut)
                            Spacer()
                            Text("Alltid sist").font(PF.ui(12)).foregroundStyle(p.mut)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                    }
                    .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    // Prompt 25: STIL med stor forhåndsvisning av din egen fanelinje (NavStyle25.swift).
                    NavStylePicker25(items: items).padding(.top, 6)
                    let unused = PaperTabItem.selectable.filter { a in !items.contains { $0.id == a.id } }
                    if !unused.isEmpty {
                        PLabel(text: "Legg til")
                        VStack(spacing: 0) {
                            ForEach(Array(unused.enumerated()), id: \.element.id) { i, it in
                                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                                Button { add(it) } label: {
                                    HStack(spacing: 12) {
                                        iconBox(it.icon, locked: false)
                                        Text(it.label).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                                        Spacer()
                                        Text(items.count >= 5 ? "Fullt" : "+ Legg til").font(PF.ui(13, .semibold)).foregroundStyle(items.count >= 5 ? p.mut : p.lab)
                                    }
                                    .padding(.horizontal, 14).padding(.vertical, 10)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }
                    PLineButton(title: "Tilbakestill til standard", height: 44, full: true) { items = PaperTabItem.defaults }
                }
                .padding(16)
            }
            .background(p.bg.ignoresSafeArea())
            .navigationTitle("Fanelinje")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ferdig") {
                        if items.map(\.id) == PaperTabItem.defaultIds && items == PaperTabItem.defaults { store.resetTabBar() } else { store.setTabBar(items) }
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .onAppear { items = store.mainTabItems }
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private func row(_ i: Int, _ it: PaperTabItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Button { iconFor = iconFor == it.id ? nil : it.id } label: { iconBox(it.icon, locked: false) }
                    .buttonStyle(.plain).accessibilityLabel("Bytt ikon")
                TextField("Navn", text: labelBinding(i))
                    .font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    .submitLabel(.done)
                Button { move(i, -1) } label: { arrow("▲", i > 0) }.buttonStyle(.plain).disabled(i == 0)
                Button { move(i, 1) } label: { arrow("▼", i < items.count - 1) }.buttonStyle(.plain).disabled(i == items.count - 1)
                Button { remove(i) } label: { arrow("−", items.count > 1) }.buttonStyle(.plain).disabled(items.count <= 1)
            }
            if iconFor == it.id { iconGrid(i) }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func iconGrid(_ i: Int) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
            ForEach(PaperTabItem.icons, id: \.self) { name in
                let on = items.indices.contains(i) && items[i].icon == name
                Button {
                    if items.indices.contains(i) { items[i].icon = name }
                    Haptics.shared.select()
                } label: {
                    Image(systemName: name).font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(on ? p.onLab : p.ink)
                        .frame(width: 38, height: 38)
                        .background(on ? p.lab : p.popSel, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func labelBinding(_ i: Int) -> Binding<String> {
        Binding(get: { items.indices.contains(i) ? items[i].label : "" },
                set: { v in if items.indices.contains(i) { items[i].label = String(v.prefix(14)) } })
    }

    private func iconBox(_ name: String, locked: Bool) -> some View {
        Image(systemName: name).font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 32, height: 32)
            .background(locked ? p.mut : p.ink, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private func arrow(_ t: String, _ on: Bool) -> some View {
        Text(t).font(PF.ui(13, .bold)).foregroundStyle(on ? p.ink : p.line)
            .frame(width: 30, height: 30)
            .background(p.popSel.opacity(on ? 1 : 0.4), in: Circle())
    }

    private func move(_ i: Int, _ d: Int) {
        let j = i + d
        guard items.indices.contains(i), items.indices.contains(j) else { return }
        withAnimation(.easeOut(duration: 0.2)) { items.swapAt(i, j) }
        Haptics.shared.tick()
    }

    private func remove(_ i: Int) {
        guard items.count > 1, items.indices.contains(i) else { return }
        _ = withAnimation(.easeOut(duration: 0.2)) { items.remove(at: i) }
        Haptics.shared.tick()
    }

    private func add(_ it: PaperTabItem) {
        guard items.count < 5 else { store.flash("Fanelinja har plass til 5 faner pluss Mer. Fjern en først."); return }
        withAnimation(.easeOut(duration: 0.2)) { items.append(it) }
        Haptics.shared.tick()
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
            ])
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
                            if store.iconTheme == t.0 { Text("✓").font(PF.ui(14, .bold)).foregroundStyle(p.pos) }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.top, 8)
            // Prompt 32: FANELINJE og FANELINJE · ANDRE SIDER (Nav32.swift).
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
                    if on { Text("✓").font(PF.ui(14, .bold)).foregroundStyle(p.pos) }
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
        // Prompt 42: «PostNord AB», «POSTNORD», «postnord_no» … → postnord (Carrier42.swift).
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
