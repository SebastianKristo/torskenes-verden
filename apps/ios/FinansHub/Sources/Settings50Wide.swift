import SwiftUI

/* ---------------- Prompt 50: Innstillinger i to kolonner på Fold og iPad ----------------
 claude-code-innstillinger-to-kolonner-fold-ipad.md. Fasit: Mobil Papir App.dc.html (side innst med wide).
 Når: samme regel som resten av brettoppsettet (Layout45: vindu ≥ 700 pt og ikke kompakt). Telefon er uendret.
 – Venstre kolonne (300 pt, egen scroll så den står i ro): søkefelt med ✦ AI, alle gruppene med liten tittel og prikket
   skille, rader med rundt farget ikon og navn (ingen undertekst). Statusverdi bare når den krever handling («Oppdater»).
   Valgt rad: kort-bakgrunn, fet tekst og myk skygge. Rader som åpner ark/fullskjerm gjør det som før.
 – Høyre kolonne: ingenting valgt → oppdateringskort og profilkort. Valgt side → stor tittel (Newsreader 32) og undersiden.
   Ingen «‹ Alle innstillinger»; nivå 2 (en integrasjon) har «‹ Integrasjoner». Søketreff vises over hele høyre kolonne.
 – Hele bredden, marg 28 pt (ikke 108 + 16 som på andre sider).
 Valgt side er selve ruten (store.paperTab = innst-…), så den overlever rotasjon og bretting: på telefon vises samme side
 som egen skjerm. Den lagres også per enhet (papir_set_sub). Tilbake-sveip og ‹ fungerer som før (Nav50Back.swift). */

/// Én radgruppe i Innstillinger (PaperSettings17.groups50).
struct Settings50Group: Identifiable {
    var id: String { "\(offset)|\(title)" }
    let title: String
    let offset: Int
    let rows: [PaperLinkRow]
}

@MainActor
@Observable
final class Settings50 {
    static let shared = Settings50()

    /// Hvilken side hver rad åpnet sist (radnavn → paperTab), så riktig rad er markert.
    var opened: [String: String] = [:]

    nonisolated static let subKey: String = "papir_set_sub"

    /// Raden er valgt når den åpnet siden som vises, eller når navnet er det samme som sidetittelen.
    func selected(_ row: PaperLinkRow, _ store: Store) -> Bool {
        let t: String = store.paperTab
        guard t != "innst" else { return false }
        if let o = opened[row.name] { return o == t }
        if let title = store.paper16Title, title == row.name { return true }
        return false
    }

    func tap(_ row: PaperLinkRow, _ store: Store) {
        Haptics.shared.select()
        row.act()
        let t: String = store.paperTab
        if t.hasPrefix("innst-") || t == "profil" { opened[row.name] = t }
    }

    /// Husk valgt underside per enhet.
    nonisolated static func remember(_ tab: String) {
        if tab.hasPrefix("innst-") { UserDefaults.standard.set(tab, forKey: subKey) }
    }
}

/// Hele siden på bred skjerm: toppbildet som på de andre sidene og to kolonner under.
struct Settings50Wide: View {
    @Environment(Store.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            PaperHero(home: false)
            HStack(alignment: .top, spacing: 28) {
                Settings50Sidebar().frame(width: 300)
                Settings50Detail()
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .padding(.horizontal, 28)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .ignoresSafeArea(edges: .top)
        .task {
            await NotifyModel.shared.load(store)
            if Update28Model.isAdmin(store) { await Update28Model.shared.load(store) }
            if Backup29Model.isAdmin(store) && !Backup29Model.shared.loaded { await Backup29Model.shared.load(store) }
            await Update30Model.shared.load(store)
        }
        .onChange(of: store.paperTab) { (_: String, v: String) in Settings50.remember(v) }
        .update30Sheet()
    }
}

/* ---------- Venstre kolonne ---------- */

struct Settings50Sidebar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 2) {
                Set24Search()
                ForEach(filtered) { (g: Settings50Group) in
                    Settings50GroupView(group: g, first: g.id == filtered.first?.id)
                }
                if Update28Model.isAdmin(store) && query.isEmpty { Settings50Software() }
            }
            .padding(.top, 14).padding(.bottom, 28)
        }
    }

    private var query: String { Set24Model.shared.query.trimmingCharacters(in: .whitespaces).lowercased() }

    /// Treff filtrerer listen direkte (navn og undertekst).
    private var filtered: [Settings50Group] {
        let all: [Settings50Group] = PaperSettings17.groups50(store, p)
        let q: String = query
        if q.isEmpty { return all }
        return all.compactMap { (g: Settings50Group) -> Settings50Group? in
            let rows: [PaperLinkRow] = g.rows.filter { (r: PaperLinkRow) -> Bool in
                r.name.lowercased().contains(q) || r.sub.lowercased().contains(q) || g.title.lowercased().contains(q)
            }
            return rows.isEmpty ? nil : Settings50Group(title: g.title, offset: g.offset, rows: rows)
        }
    }
}

/// Prikket skillelinje mellom gruppene.
struct Settings50Dots: Shape {
    func path(in r: CGRect) -> Path {
        var path: Path = Path()
        path.move(to: CGPoint(x: r.minX, y: r.midY))
        path.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        return path
    }
}

struct Settings50GroupView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let group: Settings50Group
    let first: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if !first {
                Settings50Dots().stroke(p.line, style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
                    .frame(height: 1)
                    .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 6)
            }
            Text(group.title.uppercased()).font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
                .padding(.horizontal, 12).padding(.top, first ? 8 : 2).padding(.bottom, 4)
            ForEach(group.rows) { (r: PaperLinkRow) in
                Settings50Row(name: r.name, icon: r.icon ?? "circle", tint: Settings50Row.tint(r),
                              on: Settings50.shared.selected(r, store)) {
                    Settings50.shared.tap(r, store)
                }
            }
        }
    }
}

/// Rad: rundt farget ikon (hvitt symbol) og navnet. Valgt = kort-bakgrunn, fet tekst og myk skygge.
struct Settings50Row: View {
    @Environment(\.paper) private var p
    let name: String
    let icon: String
    let tint: Color
    let on: Bool
    var value: String? = nil
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.white)
                    .frame(width: 32, height: 32)
                    .background(tint, in: Circle())
                Text(name).font(PF.ui(15, on ? .bold : .medium)).foregroundStyle(p.ink).lineLimit(1)
                Spacer(minLength: 4)
                if let value { Text(value).font(PF.ui(12, .bold)).foregroundStyle(p.lab).lineLimit(1) }
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .frame(minHeight: 50)
            .background(on ? p.card : Color.clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color.black.opacity(on ? 0.14 : 0), radius: 14, x: 0, y: 8)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// Samme ikonfarger som web (Settings30.swift); reserve er systemgrå.
    static func tint(_ r: PaperLinkRow) -> Color {
        r.tint30 ?? Set30Colors.tint(r.name) ?? Set30Colors.system
    }
}

/// PROGRAMVARE: Nordlys OS (System-siden) med «Oppdater» i rødt når en ny versjon venter.
struct Settings50Software: View {
    @Environment(\.paper) private var p
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        let canUpdate: Bool = u.phase == .avail || u.phase == .failed
        VStack(alignment: .leading, spacing: 2) {
            Settings50Dots().stroke(p.line, style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
                .frame(height: 1)
                .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 6)
            Text("PROGRAMVARE").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
                .padding(.horizontal, 12).padding(.top, 2).padding(.bottom, 4)
            Settings50Row(name: u.versionRow.0, icon: "arrow.down.circle", tint: Set30Colors.system, on: System31Model.shared.open,
                          value: canUpdate ? "Oppdater" : nil) {
                Haptics.shared.select()
                System31Model.shared.show()
            }
        }
    }
}

/* ---------- Høyre kolonne ---------- */

struct Settings50Detail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        ScrollViewReader { (proxy: ScrollViewProxy) in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    content
                }
                .padding(.top, 14).padding(.bottom, 28)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Ny side åpner alltid helt øverst.
            .id(store.paperTab)
            // Prompt 25: «Ta meg dit →» fra søket scroller til raden.
            .task(id: "\(store.paperTab)#\(Set25Focus.shared.tick)") {
                guard let t = Set25Focus.shared.target else { return }
                try? await Task.sleep(nanoseconds: 350_000_000)
                if Task.isCancelled { return }
                withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(Set25Focus.rowId(t), anchor: .center) }
            }
        }
    }

    @ViewBuilder private var content: some View {
        if !Set24Model.shared.query.trimmingCharacters(in: .whitespaces).isEmpty {
            Set24Results()
        } else if store.paperTab == "innst" {
            Settings50Overview()
        } else {
            Settings50PageHead()
            Settings50Page()
        }
    }
}

/// Ingenting valgt: oppdateringskortet (hvis ny versjon), profilkortet og appens versjon.
struct Settings50Overview: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Update30Banner(home: false)
            Settings50Profile()
            AppUpd32Row(label: !Update28Model.isAdmin(store))
            Text("\(AppMeta.shared.name) · versjon \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–")")
                .font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).frame(maxWidth: .infinity).padding(.top, 14)
        }
    }
}

/// Profilkortet (som øverst i Innstillinger på telefon). Trykk åpner Konto.
struct Settings50Profile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { store.paperGo("innst-konto") } label: {
            HStack(spacing: 14) {
                Avatar46(size: 58, gap: p.card, shadow: false)
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.displayName.isEmpty ? "Konto" : store.displayName).font(PF.serif(21, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text(role + " · Se konto ›").font(PF.ui(13)).foregroundStyle(p.mut).lineLimit(1)
                    Text(URL(string: store.api.base)?.host ?? store.api.base).font(PF.mono(12, bold: false)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer()
                Text("›").font(PF.ui(18)).foregroundStyle(p.mut)
            }
            .padding(16)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color.black.opacity(0.12), radius: 15, x: 0, y: 10)
        }
        .buttonStyle(.plain)
    }

    private var role: String {
        (store.me?.role ?? store.account?.role ?? "") == "admin" ? "Admin" : "Bruker"
    }
}

/// Tittel (Newsreader 32) og «‹ Integrasjoner» på sider i nivå 2.
struct Settings50PageHead: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let t = store.nav26BackTarget(), let label = store.nav26UpLabel {
                Button {
                    Haptic34.back()
                    store.paperGo(t)
                } label: {
                    Text("‹ " + label).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        .padding(.leading, 8).padding(.trailing, 12).frame(height: 32)
                        .background(p.card, in: Capsule())
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Text(store.paper16Title ?? "Innstillinger").font(PF.serif(32, medium: true)).foregroundStyle(p.ink)
                .lineLimit(2).minimumScaleFactor(0.7)
        }
        .padding(.leading, 2)
    }
}

/// Undersiden – samme sider som på telefon (PaperPage.page).
struct Settings50Page: View {
    @Environment(Store.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch store.paperTab {
            case "profil": PaperProfile()
            case "innst-ut", "innst-tilpass": Tilpass39Page()
            case "innst-appprofil": AppProfile39Page()
            case "innst-fam": FamilySettingsView()
            case "innst-helse": HealthPosSettings20()
            case "innst-hahelse": HaHealthPage42()
            case let t where t.hasPrefix("innst-"): PaperSettingsSub(key: String(t.dropFirst(6)))
            default: EmptyView()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension Store {
    /// På Fold/iPad er venstre kolonne navigasjonen i Innstillinger: ingen «‹ Alle innstillinger» i toppbildet på undersidene
    /// (nivå 2 har «‹ Integrasjoner» i høyre kolonne). «‹ Mer» på oversikten står som før.
    func settings50HideUp(wide: Bool) -> Bool {
        wide && inSettings32b && paperTab != "innst"
    }
}
