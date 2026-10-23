import SwiftUI
import UIKit

/* ---------------- Prompt 45: Hjem på iPad = 1c, nøyaktig som Fold (claude-code-ipad-brettoppsett.md) ----------------
 Fasit: Mobil Papir App.dc.html med `wide` (1c Android brettbar i FinansHub Mobil v2.dc.html) og skjermbildet
 uploads/Screenshot 2026-10-23 at 09.38.59.png.
 – Venstre: stort Glimt-kort (fyller høyden, 26 pt hjørner, scroller ikke): bakgrunnsbildet med mørk overgang nederst,
   «Homelab» + S-knapp, dato (kursiv), «God morgen, Sebastian», 7° + værlinje, Brief-kortet og søkefeltet (ekte tekstfelt,
   HomeSearch29) nederst. Mens tastaturet er oppe skjules hilsen og temperatur, og søkefeltet ligger over tastaturet.
 – Høyre: fanene Nå · I dag · Hjemme · Økonomi (piller, sveip mellom dem) og én kolonne med kort som scroller. Valgt fane
   huskes (papir_fold_tab, samme nøkkel som Android/PWA). Kortene i hver fane styres i wiggle-redigering (hold inne → − skjuler,
   + i sidelinja legger til et hvilket som helst Hjem-kort i fanen). Oppsettet lagres per fane (layout.pages["fold-…"]).
 – Ingen toppbilde og ingen fanelinje nederst; sidelinja (PaperRail) står til venstre. */

@MainActor
enum Home45 {
    static let key: String = "papir_fold_tab"
    static let tabs: [(String, String)] = [("na", "Nå"), ("idag", "I dag"), ("hjemme", "Hjemme"), ("okonomi", "Økonomi")]
    static let pages: Set<String> = ["fold-na", "fold-idag", "fold-hjemme", "fold-okonomi"]

    static func page(_ tab: String) -> String { "fold-" + tab }

    /// Alle kortene som kan ligge i en fane (også de som bare finnes med modulen: h13 Bibelvers, h14 Vel fremme), så et
    /// kort som dukker opp senere ikke havner synlig i alle fanene.
    static let allKeys: [String] = ["h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9", "h10", "h11", "h13", "h14", "h15", "h16"]

    /// Standardkort per fane (fasiten): Nå = Avganger, Gjøremål, Posisjon, Siste nytt (+ Vel fremme) · I dag = Kalender,
    /// Bursdager, Prøveperioder, Gjøremål, Bibelvers · Hjemme = Bolig, Pakker, Media, Snarveier, Posisjon · Økonomi = tallene
    /// (Finans, Mat, Domener), Prøveperioder, Pakker.
    static func defaults(_ tab: String) -> [String] {
        switch tab {
        case "idag": return ["h10", "h9", "h11", "h6", "h13"]
        case "hjemme": return ["h8", "h2", "h15", "h4", "h7"]
        case "okonomi": return ["h16", "h11", "h2"]
        default: return ["h14", "h3", "h6", "h7", "h5"]
        }
    }

    static func tabFromPage(_ page: String) -> String { String(page.dropFirst(5)) }

    /// Kortene som finnes i fanene: alle Hjem-kortene unntatt Brief (h12) og Søk (h1), som ligger i Glimt-kortet.
    static func usable(_ all: [String]) -> [String] { all.filter { $0 != "h12" && $0 != "h1" } }

    /// Standardoppsettet for en fane: standardkortene synlige, resten skjult (kan legges til med + i sidelinja).
    static func defaultLayout(_ tab: String, _ keys: [String]) -> PaperPageLayout {
        let def: [String] = defaults(tab).filter { keys.contains($0) }
        let rest: [String] = keys.filter { !def.contains($0) }
        return PaperPageLayout(order: def + rest, hidden: rest)
    }

    /// Første gang en fane vises: standardoppsettet lagres (lokalt og per bruker), så skjulte kort ikke dukker opp.
    static func ensure(_ tab: String, _ keys: [String], _ store: Store) {
        let pg: String = page(tab)
        if store.paperPages[pg] != nil || keys.isEmpty { return }
        let l: PaperPageLayout = defaultLayout(tab, keys)
        store.paperPages[pg] = l
        store.savePaperLayout(["pages": [pg: ["order": l.order, "hidden": l.hidden]]])
    }

    static func changed(_ page: String, _ store: Store) -> Bool {
        let keys: [String] = (Edit28.shared.labels[page] ?? []).map { $0.0 }
        guard let l = store.paperPages[page], !keys.isEmpty else { return false }
        let d: PaperPageLayout = defaultLayout(tabFromPage(page), allKeys)
        let shown: [String] = l.order.filter { keys.contains($0) && !l.hidden.contains($0) }
        let dShown: [String] = d.order.filter { keys.contains($0) && !d.hidden.contains($0) }
        return shown != dShown
    }

    /// ↺ i sidelinja: fanene går tilbake til standard, de andre sidene til lagret standard (tomt oppsett).
    static func reset(_ page: String, _ store: Store) {
        var l: PaperPageLayout = PaperPageLayout()
        if pages.contains(page) { l = defaultLayout(tabFromPage(page), allKeys) }
        withAnimation(.easeOut(duration: 0.25)) { store.paperPages[page] = l }
        store.savePaperLayout(["pages": [page: ["order": l.order, "hidden": l.hidden]]])
    }
}

@MainActor
@Observable
final class Home45Tab {
    static let shared = Home45Tab()

    var tab: String = {
        let v: String = UserDefaults.standard.string(forKey: Home45.key) ?? "na"
        return Home45.tabs.contains { $0.0 == v } ? v : "na"
    }()

    func set(_ k: String) {
        guard k != tab, Home45.tabs.contains(where: { $0.0 == k }) else { return }
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { tab = k }
        UserDefaults.standard.set(k, forKey: Home45.key)
    }

    func step(_ d: Int) {
        let keys: [String] = Home45.tabs.map { $0.0 }
        let i: Int = keys.firstIndex(of: tab) ?? 0
        let j: Int = i + d
        if j >= 0 && j < keys.count { set(keys[j]) }
    }
}

/// Hele Hjem i brettet modus (sidelinja tegnes av PaperShell).
struct Home45Wide: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            HStack(alignment: .top, spacing: 16) {
                Home45Glimt()
                    .frame(width: Swift.max(300, (g.size.width - 16) / 2))
                    .frame(maxHeight: .infinity)
                Home45Right()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .padding(.leading, 108)
        .padding(.trailing, 16)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .background(p.bg.ignoresSafeArea())
        // Ingen av kolonnene flytter seg med tastaturet; bare søkefeltet i Glimt-kortet løftes (keyboardLift32b).
        .ignoresSafeArea(.keyboard)
        .onAppear { Kb32b.shared.start() }
    }
}

/* ---------- Venstre: Glimt-kortet ---------- */

struct Home45Glimt: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    private var typing: Bool { Kb32b.shared.frame.height > 120 }

    var body: some View {
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 26, style: .continuous)
        VStack(alignment: .leading, spacing: 12) {
            Home45Greeting(typing: typing)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .clipped()
            if !typing {
                Brief34HomeCard()
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            HomeSearch29()
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 16)
        // Søkefeltet (og Brief over det) ligger 12 pt over tastaturet, også i Split View / Stage Manager.
        .keyboardLift32b(gap: 12)
        .background { Home45Photo().clipShape(shape) }
        .clipShape(shape)
        .animation(.easeOut(duration: 0.22), value: typing)
    }
}

/// Bakgrunnsbildet fra «Bakgrunn på forsiden» med mørk overgang nederst (samme lag som toppbildet på telefon).
struct Home45Photo: View {
    @Environment(Store.self) private var store

    var body: some View {
        ZStack {
            if let img = store.photoImage, store.photo != "cur" {
                BgPhotoLayer(image: img)
                    .id(ObjectIdentifier(img))
                    .transition(.opacity)
            } else {
                LinearGradient(colors: colors, startPoint: UnitPoint(x: 0.42, y: 0), endPoint: UnitPoint(x: 0.58, y: 1))
            }
            LinearGradient(stops: [
                .init(color: Color.black.opacity(0.15), location: 0),
                .init(color: Color.clear, location: 0.3),
                .init(color: Color(hex: "#101c2c").opacity(0.88), location: 0.72),
                .init(color: Color(hex: "#101c2c").opacity(0.92), location: 1),
            ], startPoint: .top, endPoint: .bottom)
        }
    }

    private var colors: [Color] {
        if let c = store.photoWindow?.colors, c.count >= 2, store.photo != "cur" { return c }
        return [Color(hex: "#4a5a6a"), Color(hex: "#2a3440"), Color(hex: "#1d242c")]
    }
}

/// «Homelab» + profilbildet, dato, hilsen og temperatur. Mens man skriver vises bare toppraden.
struct Home45Greeting: View {
    @Environment(Store.self) private var store
    let typing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            topRow
            if !typing {
                Text(longDate().capitalized(with: Locale(identifier: "nb_NO")))
                    .font(PF.italic(17)).foregroundStyle(Color.white.opacity(0.92)).lineLimit(1)
                greeting
                Home45Temp()
            }
        }
        .shadow(color: Color.black.opacity(0.4), radius: 8, y: 1)
    }

    private var topRow: some View {
        HStack(spacing: 8) {
            Text(AppMeta.shared.name).font(PF.serif(24, medium: true)).foregroundStyle(Color.white).lineLimit(1)
            Spacer(minLength: 8)
            Button { store.paperGo("innst") } label: { avatar }
                .buttonStyle(.plain)
                .accessibilityLabel("Innstillinger")
        }
    }

    private var avatar: some View {
        ZStack {
            Circle().fill(Color(hex: "#f3efe6"))
            if let a = store.avatar {
                Image(uiImage: a).resizable().scaledToFill().clipShape(Circle())
            } else {
                Text(String(store.displayName.prefix(1)).uppercased()).font(PF.ui(15, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
            }
        }
        .frame(width: 44, height: 44)
    }

    private var greeting: some View {
        let first: String = store.displayName.split(separator: " ").first.map(String.init) ?? ""
        let text: String = first.isEmpty ? greetingWord() : greetingWord() + ",\n" + first
        return Text(text)
            .font(PF.serif(46, medium: true)).foregroundStyle(Color.white)
            .lineLimit(2).minimumScaleFactor(0.5)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// «7°» + «Lett regn · 08:42 ›». Trykk åpner Vær.
struct Home45Temp: View {
    @Environment(Store.self) private var store

    var body: some View {
        if let t = temp {
            Button {
                Haptics.shared.tap()
                store.openWeather()
            } label: {
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text("\(Int(t.rounded()))°").font(PF.serif(72)).foregroundStyle(Color.white).lineLimit(1)
                    Text(line).font(PF.ui(14)).foregroundStyle(Color.white.opacity(0.92)).lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Været \(Int(t.rounded())) grader")
            .accessibilityHint("Åpner Vær")
        }
    }

    private var temp: Double? { store.homeWeather?.temp ?? store.mobileHome?.weather?.temp }

    private var line: String {
        let f: DateFormatter = DateFormatter()
        f.dateFormat = "HH:mm"
        let w: String = store.homeWeather?.text ?? store.mobileHome?.weather?.text ?? ""
        return (w.isEmpty ? "" : w + " · ") + f.string(from: Date()) + " ›"
    }
}

/* ---------- Høyre: fanene og kortene ---------- */

struct Home45Right: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var t: Home45Tab { Home45Tab.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Home45Pills()
            ScrollView {
                PaperHome(page45: Home45.page(t.tab))
                    .padding(.bottom, 24)
                    .padding(.top, 2)
            }
            .scrollIndicators(.hidden)
            .id("home45-" + t.tab)
            .refreshable {
                await store.loadHome()
                await store.loadPhotoWindow()
            }
        }
        // Høyre kolonne flytter seg ikke og endrer ikke størrelse når tastaturet kommer opp.
        .ignoresSafeArea(.keyboard)
        .edit28Layer(p)
    }
}

/// Fanene som piller (38 høy, Manrope 700 14): valgt = blekk, ellers kort med strek.
struct Home45Pills: View {
    @Environment(\.paper) private var p
    @MainActor private var t: Home45Tab { Home45Tab.shared }

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Home45.tabs, id: \.0) { (it: (String, String)) in pill(it.0, it.1) }
            }
        }
        .scrollIndicators(.hidden)
        .frame(height: 42)
    }

    private func pill(_ k: String, _ n: String) -> some View {
        let on: Bool = t.tab == k
        return Button { t.set(k) } label: {
            Text(n).font(PF.ui(14, .bold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                .padding(.horizontal, 18).frame(height: 40)
                .background(on ? p.ink : p.card, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}
