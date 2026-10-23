import SwiftUI
import UIKit

/* ---------------- Prompt 43: Media (2a) – siden, fanene, Kommer snart, Sonarr/Radarr og serie-/filmsiden ----------------
 Fasit: design/Media.dc.html (mobil) og claude-code-media-arr.md. Mer → Media åpner fullskjerm med «‹ Tilbake».
 Pille-faner (1b): Kommer snart · Sonarr · Radarr · qBittorrent · Prowlarr. Følger Papir-temaet (ink/bg/card/line/lab/mut),
 bare statusfargene er egne (grønn #2f6b4a, gul #a0671a/#c48a1a, rød lab). Stor skjerm (≥ 600, 1b): plakatvegg med
 6 kolonner og valgt serie/film i høyre kolonne (360). */

/// Fullskjermen legges i PaperShell (Paper.swift).
struct Media43Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Media43 { Media43.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if !v { m.open = false } })) {
                Media43Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { m.open = false }
            }
    }
}

extension View {
    func media43Host(_ p: PaperPalette) -> some View { modifier(Media43Host(p: p)) }
}

/// Plakat fra Sonarr/Radarr (cachet av URLCache), med fargefelt og forbokstav når den mangler.
struct Media43Poster: View {
    let url: String
    let title: String
    var width: CGFloat = 52
    var height: CGFloat = 78
    var radius: CGFloat = 10

    var body: some View {
        ZStack {
            LinearGradient(colors: [Media43Poster.tint(title), Media43Poster.tint(title).opacity(0.65)], startPoint: .top, endPoint: .bottom)
            Text(String(title.prefix(1)).uppercased()).font(PF.serif(width * 0.4, medium: true)).foregroundStyle(Color.white.opacity(0.85))
            // Prompt 46: plakater fra Homelab (/api/media/cover?…) trenger token – egen laster (Media46.swift). Feil = bare forbokstaven.
            if !url.isEmpty { Media46PosterImage(url: url) }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .accessibilityHidden(true)
    }

    static func tint(_ s: String) -> Color {
        let pal: [String] = ["#2b5d8a", "#7a3b2e", "#2f6b4a", "#6b4a8f", "#8a6a2b", "#3b4f6b", "#8f3b5a"]
        var h: Int = 0
        for u in s.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0x7fffffff }
        return Color(hex: pal[h % pal.count])
    }
}

/// Statusbrikke: Lastet ned · Lastes ned NN % · Mangler · Står fast · Pauset · Venter · Ikke overvåket.
struct Media43Status: View {
    @Environment(\.paper) private var p
    let status: String
    var progress: Double = 0

    var body: some View {
        let c: Color = Media43.statusColor(status, p)
        HStack(spacing: 5) {
            Circle().fill(c).frame(width: 7, height: 7)
            Text(Media43.statusText(status, progress)).font(PF.ui(11.5, .semibold)).foregroundStyle(c).lineLimit(1)
        }
    }
}

/// Pille-chip (32–36 pt): valgt = ink med bg-tekst.
struct Media43Chip: View {
    @Environment(\.paper) private var p
    let text: String
    let on: Bool
    var count: Int? = nil
    /// Prompt 45: tjenestens farge (Sonarr, Radarr, qBittorrent …) på aktiv fane og som prikk (Media45.swift).
    var tint: String? = nil
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 5) {
                if let tint, !on { Circle().fill(Media45.color(tint)).frame(width: 7, height: 7) }
                Text(text).font(PF.ui(13, .semibold)).lineLimit(1)
                if let count { Text("\(count)").font(PF.mono(11, bold: false)).opacity(0.7) }
            }
            .foregroundStyle(fg)
            .padding(.horizontal, 13).frame(height: 34)
            .background(bg, in: Capsule())
            .overlay(Capsule().stroke(on ? bg : p.line, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var bg: Color {
        if !on { return p.card }
        if let tint { return Media45.color(tint) }
        return p.ink
    }

    private var fg: Color {
        if !on { return p.ink }
        if let tint { return Media45.onColor(tint) }
        return p.bg
    }
}

struct Media43Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    @State private var glimtQ: String = ""
    @FocusState private var glimtFocus: Bool

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let wide: Bool = g.size.width >= 600 && g.size.width >= g.size.height * 0.9
            VStack(alignment: .leading, spacing: 0) {
                header
                tabs
                if m.glimtOpen { glimtPanel.padding(.horizontal, 16).padding(.bottom, 8) }
                HStack(alignment: .top, spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            if !m.error.isEmpty && !m.loading {
                                // Prompt 46: trykk → «Vis detaljer» (siste kall med statuskode, token, rute og tid).
                                Button { Haptics.shared.tap(); Media46.shared.detailsOpen = true } label: { notice(m.error + "\nVis detaljer ›") }
                                    .buttonStyle(.plain)
                            }
                            tabBody(wide)
                        }
                        .padding(.horizontal, wide ? 24 : 16).padding(.top, 6).padding(.bottom, 40)
                    }
                    .refreshable { await m.loadAll(store) }
                    if wide, let s = m.selected {
                        Rectangle().fill(p.line).frame(width: 1)
                        ScrollView { Media43Detail(t: s, column: true).padding(16) }
                            .frame(width: 360)
                            .background(p.dark ? p.card.opacity(0.6) : Color(hex: "#efe9de"))
                    }
                }
            }
            .background(p.bg.ignoresSafeArea())
            .overlay(alignment: .bottom) { toast }
            // Prompt 44: «Slettet … · Angre» (5 s) etter Slett fil.
            .overlay(alignment: .bottom) { Media44UndoBar() }
            // Ark: på stor skjerm vises serie/film i høyre kolonne, ellers som ark.
            .sheet(item: Binding<Media43Title?>(get: { wide ? nil : m.selected }, set: { (v: Media43Title?) in if v == nil { m.selected = nil } })) { (t: Media43Title) in
                ScrollView { Media43Detail(t: t, column: false).padding(16) }
                    .background(p.bg)
                    .environment(\.paper, p).environment(store)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .media43Sheets(p)
            // Prompt 45: «Slett uovervåkede» (ark + Angre), Media45.swift.
            .media45Host(p)
            .sheet(isPresented: Binding<Bool>(get: { Media44.shared.pickerOpen }, set: { Media44.shared.pickerOpen = $0 })) {
                Media44SiteSheet(tab: m.tab).sheet43(p, store)
            }
            .sheet(isPresented: Binding<Bool>(get: { Media46.shared.detailsOpen }, set: { Media46.shared.detailsOpen = $0 })) {
                Media46Details().sheet43(p, store)
            }
        }
        .task {
            await m.loadAll(store)
            m.startPolling(store)
        }
        .onChange(of: m.tab) { (_: String, _: String) in
            m.error = ""
            Task { await m.loadTab(store) }
        }
        .onDisappear { m.stopPolling() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                // Prompt 45: systemets runde tilbakeknapp (Media45.swift).
                Back45 { m.open = false }
                Spacer(minLength: 8)
                Button {
                    Haptics.shared.tap()
                    withAnimation(.easeOut(duration: 0.2)) { m.glimtOpen.toggle() }
                    if m.glimtOpen { glimtFocus = true }
                } label: {
                    Orb43(size: 24, busy: m.glimtBusy).padding(10).background(p.card, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Glimt i Media")
                // Prompt 45: innstillingene ligger i Innstillinger → Media; ⋯ har snarveien og «Rydd uovervåkede».
                Media45Menu()
            }
            Text("Media").font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
        }
        .padding(.horizontal, 16).padding(.top, 8)
    }

    private var tabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Media43.tabs, id: \.0) { (t: (String, String)) in
                    Media43Chip(text: t.1, on: m.tab == t.0, count: count(t.0), tint: t.0) {
                        Haptics.shared.select()
                        m.tab = t.0
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 6)
    }

    private func count(_ tab: String) -> Int? {
        switch tab {
        case "qbit": let n: Int = m.torrents.filter(\.active).count; return n > 0 ? n : nil
        default: return nil
        }
    }

    @ViewBuilder private func tabBody(_ wide: Bool) -> some View {
        // Prompt 44: felles servervalg øverst i Sonarr/Radarr/qBittorrent/Prowlarr (skjult i Kommer snart og Avspilling).
        Media44SiteRow(tab: m.tab)
        switch m.tab {
        case "avspilling": Playback44View()
        case "sonarr": Media43Library(kind: "series", wide: wide)
        case "radarr": Media43Library(kind: "movie", wide: wide)
        case "qbit": Media43Qbit()
        case "prowlarr": Media43Prowlarr()
        default: Media43Upcoming(wide: wide)
        }
    }

    private func notice(_ t: String) -> some View {
        Text(t).font(PF.ui(13.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder private var toast: some View {
        if !m.toast.isEmpty {
            Text(m.toast).font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(p.ink, in: Capsule())
                .padding(.bottom, 24)
                .transition(.opacity)
        }
    }

    /// Glimt: «legg til Severance i 4K», «finn en episode av The Rookie under 500 MB», «pause alt», «hva lastes ned».
    private var glimtPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField("Spør Glimt, f.eks. «legg til Severance i 4K»", text: $glimtQ)
                    .font(PF.ui(15)).foregroundStyle(p.ink)
                    .focused($glimtFocus)
                    .submitLabel(.search)
                    .onSubmit { m.ask(glimtQ, store) }
                    .padding(.leading, 14)
                Glimt43Pill(on: true, height: 36, busy: m.glimtBusy) { m.ask(glimtQ, store) }
                    .padding(.trailing, 5)
            }
            .frame(height: 46)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            ForEach(m.glimtSteps) { (s: Media43Step) in
                Text("✓ " + s.text + (s.ms > 0 ? " · \(Media43Page.ms(s.ms))" : "")).font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
            }
            if m.glimtBusy {
                HStack(spacing: 8) { ProgressView(); Text("Glimt jobber …").font(PF.ui(13)).foregroundStyle(p.mut) }
            }
            if !m.glimtText.isEmpty {
                Text(LocalizedStringKey(m.glimtText)).font(PF.ui(14.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(m.glimtResults) { (r: Media43Result) in
                HStack(spacing: 10) {
                    if !r.title.isEmpty { Media43Poster(url: r.poster, title: r.title, width: 36, height: 54, radius: 7) }
                    VStack(alignment: .leading, spacing: 2) {
                        if !r.title.isEmpty { Text(r.title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(2) }
                        if !r.sub.isEmpty { Text(r.sub).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).lineLimit(2) }
                        if !r.size.isEmpty { Text(r.size).font(PF.ui(12, .semibold)).foregroundStyle(Color(hex: "#2f6b4a")) }
                    }
                    Spacer(minLength: 4)
                    ForEach(r.actions) { (a: Media43Action) in
                        Button { m.run(a, store) } label: {
                            Text(a.label).font(PF.ui(12.5, .bold)).foregroundStyle(p.bg)
                                .padding(.horizontal, 12).frame(height: 34).background(p.ink, in: Capsule())
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(10)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .transition(.opacity)
    }

    static func ms(_ v: Int) -> String {
        v >= 1000 ? String(format: "%.1f s", Double(v) / 1000).replacingOccurrences(of: ".", with: ",") : "\(v) ms"
    }
}

/* ---------- Kommer snart ---------- */

struct Media43Upcoming: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    let wide: Bool

    var body: some View {
        let days: [(String, [Media43Item])] = groups
        VStack(alignment: .leading, spacing: 14) {
            downloadingStrip
            if days.isEmpty && !m.loading {
                Text(m.missingServer ? "Media er ikke satt opp på serveren ennå." : "Ingenting kommer de neste 7 dagene.")
                    .font(PF.ui(14)).foregroundStyle(p.mut).padding(.vertical, 20)
            }
            if m.loading && days.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(30) }
            ForEach(days, id: \.0) { (d: (String, [Media43Item])) in
                VStack(alignment: .leading, spacing: 8) {
                    VStack(spacing: 6) {
                        HStack {
                            Text(d.0.uppercased()).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(d.0 == "I dag" ? p.lab : p.ink)
                            Spacer()
                            Text("\(d.1.count)").font(PF.ui(12)).foregroundStyle(p.mut)
                        }
                        Rectangle().fill(p.ink).frame(height: 2)
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: wide ? 2 : 1), spacing: 8) {
                        ForEach(d.1) { (it: Media43Item) in row(it) }
                    }
                }
            }
        }
    }

    private var groups: [(String, [Media43Item])] {
        var order: [String] = []
        var map: [String: [Media43Item]] = [:]
        let cal: Calendar = Calendar.current
        for it in m.upcoming {
            let k: String
            if let d = it.date {
                if cal.isDateInToday(d) { k = "I dag" } else if cal.isDateInTomorrow(d) { k = "I morgen" } else { k = JS.fmt(d, "EEEE d. MMM").capitalized(with: Locale(identifier: "nb_NO")) }
            } else { k = "Uten dato" }
            if map[k] == nil { order.append(k); map[k] = [] }
            map[k]?.append(it)
        }
        return order.map { ($0, map[$0] ?? []) }
    }

    @ViewBuilder private var downloadingStrip: some View {
        let act: [Media43Torrent] = m.torrents.filter { !$0.done }
        if !act.isEmpty {
            Button { Haptics.shared.tap(); m.tab = "qbit" } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("LASTES NED · \(act.count)").font(PF.mono(10)).tracking(1.2).foregroundStyle(Color(hex: "#e8a593"))
                        Text(Media43.speed(m.dlSpeed)).font(PF.serif(20, medium: true)).foregroundStyle(Color(hex: "#f3efe6"))
                    }
                    Spacer()
                    Text("Lastes ned ›").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#f3efe6"))
                }
                .padding(14)
                .background(Color(hex: "#1b1a17"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private func row(_ it: Media43Item) -> some View {
        Button {
            if it.kind == "movie", let t = m.movies.first(where: { $0.id == it.movieId }) { m.select(t, store); return }
            if let t = m.series.first(where: { $0.id == it.seriesId }) { m.select(t, store); return }
            if it.seriesId > 0 { m.select(Media43Title(id: it.seriesId, kind: "series", title: it.title, poster: it.poster), store) }
            else if it.movieId > 0 { m.select(Media43Title(id: it.movieId, kind: "movie", title: it.title, poster: it.poster), store) }
        } label: {
            HStack(spacing: 12) {
                Media43Poster(url: it.poster, title: it.title)
                VStack(alignment: .leading, spacing: 3) {
                    Text(it.title).font(PF.ui(15, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(it.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                    HStack(spacing: 8) {
                        Media43Status(status: it.status, progress: it.progress)
                        if let d = it.date { Text(JS.fmt(d, "HH:mm")).font(PF.mono(11, bold: false)).foregroundStyle(p.mut) }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Sonarr / Radarr: bibliotek ---------- */

struct Media43Library: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    let kind: String
    let wide: Bool
    @State private var filter: String = "Alle"
    @State private var q: String = ""

    var body: some View {
        let all: [Media43Title] = kind == "series" ? m.series : m.movies
        // Prompt 44: søk på tittel, kanal/nettverk og år, uten forskjell på store bokstaver, aksenter og tegn («9-1-1» = «911»).
        let list: [Media43Title] = all.filter { match($0) && Media44Lib.hit($0, q) }
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").font(.system(size: 13)).foregroundStyle(p.mut)
                    TextField(Media44Lib.placeholder(kind, all.count), text: $q).font(PF.ui(14.5)).foregroundStyle(p.ink)
                        .autocorrectionDisabled()
                    if !q.isEmpty {
                        Button { q = "" } label: {
                            Image(systemName: "xmark.circle.fill").font(.system(size: 15)).foregroundStyle(p.mut).frame(width: 30, height: 30)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Tøm søket")
                    }
                }
                .padding(.horizontal, 14).frame(height: 44)
                .background(p.card, in: Capsule())
                Button {
                    Haptics.shared.tap()
                    m.addPrefill = ""
                    m.adding = kind
                } label: {
                    Text(kind == "series" ? "+ Legg til serie" : "+ Legg til film").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 14).frame(height: 44).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(filters, id: \.self) { (f: String) in
                        Media43Chip(text: f, on: filter == f, count: all.filter { match($0, f) }.count) { Haptics.shared.select(); filter = f }
                    }
                }
            }
            if all.isEmpty && m.loading { ProgressView().frame(maxWidth: .infinity).padding(30) }
            if all.isEmpty && !m.loading {
                Text(m.missingServer ? "Media er ikke satt opp på serveren ennå." : (kind == "series" ? "Ingen serier ennå." : "Ingen filmer ennå."))
                    .font(PF.ui(14)).foregroundStyle(p.mut).padding(.vertical, 16)
            }
            if !q.isEmpty && list.isEmpty && !all.isEmpty { Media44LibNoHit(kind: kind, q: q) }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: wide ? (m.selected == nil ? 6 : 4) : 3), spacing: 12) {
                ForEach(list) { (t: Media43Title) in
                    Button { m.select(t, store) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            GeometryReader { (g: GeometryProxy) in
                                Media43Poster(url: t.poster, title: t.title, width: g.size.width, height: g.size.width * 1.5, radius: 12)
                            }
                            .aspectRatio(2.0 / 3.0, contentMode: .fit)
                            .overlay(alignment: .topTrailing) {
                                if t.missing > 0 && kind == "series" {
                                    Text("\(t.missing)").font(PF.ui(10.5, .bold)).foregroundStyle(.white)
                                        .padding(.horizontal, 6).frame(height: 18).background(Color(hex: "#a0671a"), in: Capsule()).padding(5)
                                }
                            }
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(m.selected?.id == t.id ? p.lab : Color.clear, lineWidth: 2))
                            Text(t.title).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                            Text(sub(t)).font(PF.ui(11)).foregroundStyle(p.mut).lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var filters: [String] {
        kind == "series" ? ["Alle", "Mangler", "Fortsetter", "Avsluttet"] : ["Alle", "Lastet ned", "Mangler", "Kommer"]
    }

    private func match(_ t: Media43Title) -> Bool { match(t, filter) }

    private func match(_ t: Media43Title, _ f: String) -> Bool {
        switch f {
        case "Mangler": return kind == "series" ? t.missing > 0 : !t.hasFile && t.status != "announced"
        case "Fortsetter": return t.status == "continuing"
        case "Avsluttet": return t.status == "ended"
        case "Lastet ned": return t.hasFile
        case "Kommer": return !t.hasFile && (t.status == "announced" || t.status == "incinemas" || t.status == "tba")
        default: return true
        }
    }

    private func sub(_ t: Media43Title) -> String {
        if kind == "series" { return t.total > 0 ? "\(t.have) av \(t.total)" : (t.year > 0 ? String(t.year) : "") }
        return t.hasFile ? (t.fileQuality.isEmpty ? "Lastet ned" : t.fileQuality) : (t.year > 0 ? String(t.year) : "Mangler")
    }
}

/* ---------- Serie- og filmsiden ---------- */

struct Media43Detail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    @MainActor private var m: Media43 { Media43.shared }
    let t: Media43Title
    let column: Bool
    @State private var openSeason: Int? = nil
    @State private var confirmDelete: Bool = false

    static let monitors: [(String, String)] = [("all", "Alle episoder"), ("future", "Fremtidige"), ("missing", "Manglende"), ("existing", "Eksisterende"),
                                               ("firstSeason", "Første sesong"), ("lastSeason", "Siste sesong"), ("pilot", "Bare pilot"), ("none", "Ingen")]
    static let types: [(String, String)] = [("standard", "Standard"), ("daily", "Daglig"), ("anime", "Anime")]
    static let avail: [(String, String)] = [("announced", "Annonsert"), ("inCinemas", "På kino"), ("released", "Utgitt digitalt")]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Prompt 44: banner med fanart, plakat 2:3, ←/→, fakta, info-brikker og handling (Media44Banner.swift).
            Media44Banner(t: t, column: column)
            chips
            buttons
            if t.kind == "movie" { fileBox }
            // Prompt 44: ⟳ Last ned på nytt (interaktivt søk) og Slett fil for film med fil.
            if t.kind == "movie" && t.hasFile { Media44MovieFileActions(t: t, profile: profiles.first(where: { $0.id == t.profileId })?.name ?? "") }
            if t.kind == "series" { seasons }
            // Prompt 45: slett episodefiler som ikke er overvåket (bare admin), Media45.swift.
            if t.kind == "series" && Update28Model.isAdmin(store) {
                Button { Media45Clean.shared.open(service: "sonarr", seriesId: t.id, season: nil, store) } label: {
                    Text("Slett uovervåkede episoder …").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            Button(role: .destructive) { confirmDelete = true } label: {
                Text(t.kind == "series" ? "Slett serien" : "Slett filmen").font(PF.ui(13.5, .semibold)).foregroundStyle(p.lab)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
            .confirmationDialog("Slett \(t.title)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Slett, behold filene", role: .destructive) { m.delete(t, files: false, store) }
                Button("Slett med filene", role: .destructive) { m.delete(t, files: true, store) }
                Button("Avbryt", role: .cancel) {}
            }
        }
        .task(id: t.id) { await m.loadOptions(store) }
    }

    private var statusName: String {
        switch t.status {
        case "continuing": return "Fortsetter"
        case "ended": return "Avsluttet"
        case "announced": return "Annonsert"
        case "incinemas": return "På kino"
        case "released": return "Utgitt"
        default: return ""
        }
    }

    private var profiles: [Media43Option] { t.kind == "series" ? m.profilesTv : m.profilesMovie }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Menu {
                    ForEach(profiles) { (o: Media43Option) in
                        Button(o.name) { m.update(t, ["qualityProfileId": o.id], store) }
                    }
                } label: { chip("Profil", profiles.first(where: { $0.id == t.profileId })?.name ?? (t.profile.isEmpty ? "–" : t.profile)) }
                if t.kind == "series" {
                    Menu {
                        ForEach(Media43Detail.monitors, id: \.0) { (o: (String, String)) in
                            Button(o.1) { m.update(t, ["monitor": o.0], store) }
                        }
                    } label: { chip("Overvåking", Media43Detail.monitors.first(where: { $0.0 == t.monitor })?.1 ?? "Alle episoder") }
                    Menu {
                        ForEach(Media43Detail.types, id: \.0) { (o: (String, String)) in
                            Button(o.1) { m.update(t, ["seriesType": o.0], store) }
                        }
                    } label: { chip("Serietype", Media43Detail.types.first(where: { $0.0 == t.seriesType })?.1 ?? "Standard") }
                } else {
                    Menu {
                        ForEach(Media43Detail.avail, id: \.0) { (o: (String, String)) in
                            Button(o.1) { m.update(t, ["minimumAvailability": o.0], store) }
                        }
                    } label: { chip("Last ned når den er", Media43Detail.avail.first(where: { $0.0.lowercased() == t.minimumAvailability.lowercased() })?.1 ?? "Utgitt digitalt") }
                    Menu {
                        Button("Ja") { m.update(t, ["monitored": true], store) }
                        Button("Nei") { m.update(t, ["monitored": false], store) }
                    } label: { chip("Overvåket", t.monitored ? "Ja" : "Nei") }
                }
            }
        }
    }

    private func chip(_ k: String, _ v: String) -> some View {
        HStack(spacing: 4) {
            Text(k).font(PF.ui(12)).foregroundStyle(p.mut)
            Text(v).font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
            Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 12).frame(height: 36)
        .background(p.card, in: Capsule())
        .overlay(Capsule().stroke(p.line, lineWidth: 1))
        .frame(minHeight: 44)
    }

    private var buttons: some View {
        VStack(spacing: 8) {
            if t.kind == "series" {
                if t.missing > 0 {
                    wideButton("Søk alle manglende (\(t.missing))", primary: true) {
                        m.command("SeriesSearch", ["seriesId": t.id], service: "sonarr", store, toast: "Søker etter \(t.missing) manglende")
                    }
                }
            } else {
                HStack(spacing: 8) {
                    wideButton("🔍 Automatisk søk", primary: !t.hasFile) {
                        m.command("MoviesSearch", ["movieIds": [t.id]], service: "radarr", store, toast: "Søker etter \(t.title)")
                    }
                    wideButton("Interaktivt søk", primary: false) {
                        m.searchFor = Media43SearchTarget(kind: "movie", title: t.title, sub: t.year > 0 ? String(t.year) : "", poster: t.poster,
                                                          profile: profiles.first(where: { $0.id == t.profileId })?.name ?? "", movieId: t.id)
                    }
                }
            }
            if !t.playUrl.isEmpty, let u = URL(string: t.playUrl) {
                wideButton("▶ Spill av i " + (m.player == "plex" ? "Plex" : "Jellyfin"), primary: false) { openURL(u) }
            }
        }
    }

    private func wideButton(_ title: String, primary: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(title).font(PF.ui(14, .bold)).foregroundStyle(primary ? p.bg : p.ink).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(primary ? p.ink : p.card, in: Capsule())
                .overlay(Capsule().stroke(primary ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var fileBox: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("FIL").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
            if t.hasFile {
                Text([t.fileQuality, Media43.size(t.fileSize)].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
            } else {
                Text("Ingen fil ennå").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            if !t.path.isEmpty { Text(t.path).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).lineLimit(2) }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var seasons: some View {
        let nums: [Int] = Array(Set(m.episodes.map(\.season))).sorted(by: >)
        let first: Int = nums.first ?? 0
        return VStack(alignment: .leading, spacing: 10) {
            if m.episodes.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(20) }
            ForEach(nums, id: \.self) { (s: Int) in
                let eps: [Media43Episode] = m.episodes.filter { $0.season == s }.sorted { $0.number > $1.number }
                let open: Bool = (openSeason ?? first) == s
                let allMon: Bool = eps.allSatisfy(\.monitored)
                let miss: Int = eps.filter { !$0.hasFile && ($0.air ?? .distantFuture) < Date() }.count
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 10) {
                        Button { m.setSeasonMonitored(s, !allMon, store) } label: {
                            Image(systemName: allMon ? "bookmark.fill" : "bookmark").font(.system(size: 15)).foregroundStyle(allMon ? p.ink : p.mut)
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(allMon ? "Slutt å overvåke sesong \(s)" : "Overvåk sesong \(s)")
                        Button { withAnimation(.easeOut(duration: 0.2)) { openSeason = open ? -1 : s } } label: {
                            HStack {
                                Text(s == 0 ? "Spesialer" : "Sesong \(s)").font(PF.serif(19, medium: true)).foregroundStyle(p.ink)
                                Text("\(eps.filter(\.hasFile).count)/\(eps.count)").font(PF.ui(12)).foregroundStyle(p.mut)
                                Spacer()
                                Image(systemName: open ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(p.mut)
                            }
                            .frame(minHeight: 44).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if miss > 0 {
                            Button { m.command("SeasonSearch", ["seriesId": t.id, "seasonNumber": s], service: "sonarr", store, toast: "Søker etter sesong \(s)") } label: {
                                Text("Søk sesong").font(PF.ui(12, .bold)).foregroundStyle(p.ink).padding(.horizontal, 10).frame(height: 30)
                                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).frame(minHeight: 44)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if open {
                        ForEach(eps) { (e: Media43Episode) in episodeRow(e) }
                    }
                }
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    private func episodeRow(_ e: Media43Episode) -> some View {
        let aired: Bool = (e.air ?? .distantFuture) < Date()
        let status: String = e.hasFile ? "downloaded" : (aired ? (e.monitored ? "missing" : "unmonitored") : "queued")
        let needs: Bool = !e.hasFile && aired
        return VStack(alignment: .leading, spacing: 4) {
            Rectangle().fill(p.line).frame(height: 1)
            HStack(spacing: 8) {
                Button { m.setEpisodeMonitored(e, !e.monitored, store) } label: {
                    Image(systemName: e.monitored ? "bookmark.fill" : "bookmark").font(.system(size: 13)).foregroundStyle(e.monitored ? p.ink : p.mut)
                        .frame(width: 36, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(e.monitored ? "Overvåkes" : "Overvåkes ikke")
                Text(String(format: "E%02d", e.number)).font(PF.mono(11)).foregroundStyle(p.mut)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title.isEmpty ? "Episode \(e.number)" : e.title).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    HStack(spacing: 6) {
                        if let a = e.air { Text(JS.fmt(a, "d. MMM yyyy")).font(PF.ui(11.5)).foregroundStyle(p.mut) }
                        if needs { Media43Status(status: status) }
                    }
                }
                Spacer(minLength: 4)
                if !needs && !e.hasFile { Media43Status(status: status) }
                // Prompt 44: episode med fil – ⟳ Last ned på nytt og Slett (Media44Banner.swift).
                if e.hasFile { Media44EpisodeFileActions(t: t, e: e, profile: profiles.first(where: { $0.id == t.profileId })?.name ?? "") }
            }
            if needs {
                HStack(spacing: 8) {
                    Button { m.command("EpisodeSearch", ["episodeIds": [e.id]], service: "sonarr", store, toast: "Søker etter E\(e.number)") } label: {
                        Text("🔍 Automatisk søk").font(PF.ui(12, .bold)).foregroundStyle(p.bg).padding(.horizontal, 12).frame(height: 32)
                            .background(p.ink, in: Capsule()).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    Button {
                        m.searchFor = Media43SearchTarget(kind: "episode", title: t.title, sub: String(format: "S%02dE%02d · ", e.season, e.number) + e.title,
                                                          poster: t.poster, profile: profiles.first(where: { $0.id == t.profileId })?.name ?? "",
                                                          episodeId: e.id, seriesId: t.id, season: e.season)
                    } label: {
                        Text("Interaktivt søk").font(PF.ui(12, .bold)).foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 32)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1)).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.leading, 44)
            }
        }
    }
}
