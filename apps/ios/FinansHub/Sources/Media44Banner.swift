import SwiftUI
import UIKit

/* ---------------- Prompt 44: Media – banner, søk i biblioteket, last ned på nytt og slett fil ----------------
 Fasit: Media.dc.html (mobil) og claude-code-media-arr.md «Banner øverst i serie/film», «Søk i biblioteket»,
 «Plakater i riktig format» og «Last ned på nytt og slett».
 – Banner (22 pt hjørner): fanart (16:9, lett uskarp) med mørk gradient fra venstre (92 % → 55 %), plakat 2:3 (104 bred),
   SONARR · SERIE, tittel (Newsreader), ←/→ (forrige/neste i biblioteket), fakta, info-brikker (glass) og handling.
   Mangler fanart: plakaten forstørret og uskarp bak. Plakater beskjæres aldri (alltid 2:3).
 – Episode/film med fil: ⟳ Last ned på nytt (interaktivt søk) og Slett (spør først, slår av overvåking, Angre i 5 s).
   DELETE /api/media/episodes/:id/file · /api/media/movies/:id/file (SERVER44) → {message, undo:{method, path, body}}. */

enum Media44Lib {
    /// «9-1-1» = «911», «Café» = «cafe».
    static func norm(_ s: String) -> String {
        let f: String = s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "nb_NO"))
        var out: String = ""
        for u in f.unicodeScalars where CharacterSet.alphanumerics.contains(u) || u == " " { out.unicodeScalars.append(u) }
        return out
    }

    static func hit(_ t: Media43Title, _ q: String) -> Bool {
        let n: String = norm(q).trimmingCharacters(in: .whitespaces)
        if n.isEmpty { return true }
        let hay: String = norm(t.title) + " " + norm(t.network) + " " + (t.year > 0 ? String(t.year) : "")
        let compact: String = hay.replacingOccurrences(of: " ", with: "")
        return hay.contains(n) || compact.contains(n.replacingOccurrences(of: " ", with: ""))
    }

    static func placeholder(_ kind: String, _ n: Int) -> String {
        if n <= 0 { return kind == "series" ? "Søk i serier" : "Søk i filmer" }
        return kind == "series" ? "Søk i \(n) serier" : "Søk i \(n) filmer"
    }
}

/// «Ingen serier i biblioteket som heter «X».» + «Søk etter «X» for å legge til».
struct Media44LibNoHit: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    let kind: String
    let q: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text((kind == "series" ? "Ingen serier" : "Ingen filmer") + " i biblioteket som heter «\(q)».")
                .font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Button {
                Haptics.shared.tap()
                m.addPrefill = q
                m.adding = kind
            } label: {
                Text("Søk etter «\(q)» for å legge til").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 16).frame(minHeight: 44)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 8)
    }
}

/* ---------- Banner ---------- */

struct Media44Banner: View {
    @Environment(\.paper) private var p
    let t: Media43Title
    let column: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                Media43Poster(url: t.poster, title: t.title, width: column ? 84 : 104, height: column ? 126 : 156, radius: 12, big: true)
                    .shadow(color: Color.black.opacity(0.4), radius: 10, y: 6)
                Media44BannerHead(t: t, column: column)
            }
            Media44BannerChips(t: t)
            if !t.overview.isEmpty {
                Text(t.overview).font(PF.ui(14.5)).foregroundStyle(Color.white.opacity(0.92)).lineSpacing(2)
                    .lineLimit(6).fixedSize(horizontal: false, vertical: true)
            }
            Text(t.kind == "series" ? "Metadata fra TheTVDB" : "Metadata fra TMDb").font(PF.ui(10.5)).foregroundStyle(Color.white.opacity(0.6))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { Media44BannerBack(t: t) }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .environment(\.colorScheme, .dark)
    }
}

/// Fanart (lett uskarp) med mørk gradient fra venstre; uten fanart: plakaten forstørret og uskarp.
struct Media44BannerBack: View {
    let t: Media43Title

    var body: some View {
        let src: String = t.fanart.isEmpty ? t.poster : t.fanart
        ZStack {
            Color(hex: "#1b1a17")
            // Prompt 50: fanart/plakat via disk- og minnecachen (Media50Img.swift) – plakaten fra listen vises med en gang.
            if !src.isEmpty {
                Media50Remote(url: src, want: t.fanart.isEmpty ? 320 : 1280)
                .blur(radius: t.fanart.isEmpty ? 18 : 3)
                .opacity(t.fanart.isEmpty ? 0.7 : 1)
            }
            LinearGradient(colors: [Color.black.opacity(0.92), Color.black.opacity(0.55)], startPoint: .leading, endPoint: .trailing)
        }
        .clipped()
    }
}

struct Media44BannerHead: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Media43 { Media43.shared }
    let t: Media43Title
    let column: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 6) {
                Text(t.kind == "series" ? "SONARR · SERIE" : "RADARR · FILM").font(PF.mono(10)).tracking(1.2)
                    .foregroundStyle(Color(hex: "#f0a6b4"))
                Spacer(minLength: 4)
                arrows
            }
            Text(t.title).font(PF.serif(column ? 24 : 30, medium: true)).foregroundStyle(Color.white)
                .fixedSize(horizontal: false, vertical: true)
            Text(Media44Banner.facts(t)).font(PF.ui(12.5)).foregroundStyle(Color.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            if let s = Media44Banner.state(t) {
                Text(s).font(PF.ui(12.5, .bold)).foregroundStyle(Color(hex: t.missing > 0 ? "#e8b25a" : "#7fd6a0"))
            }
        }
    }

    private var arrows: some View {
        HStack(spacing: 4) {
            arrow("chevron.left", -1, "Forrige")
            arrow("chevron.right", 1, "Neste")
            // Høyre kolonne på stor skjerm: ✕ lukker.
            if column {
                Button { m.selected = nil } label: {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.white)
                        .frame(width: 32, height: 32).background(Color.white.opacity(0.16), in: Circle())
                        .frame(width: 40, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Lukk")
            }
        }
    }

    private func arrow(_ icon: String, _ dir: Int, _ label: String) -> some View {
        Button { step(dir) } label: {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.white)
                .frame(width: 32, height: 32)
                .background(Color.white.opacity(0.16), in: Circle())
                .frame(width: 40, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// Forrige/neste i biblioteket (samme rekkefølge som rutenettet).
    private func step(_ dir: Int) {
        let list: [Media43Title] = t.kind == "series" ? m.series : m.movies
        guard let i = list.firstIndex(where: { $0.id == t.id }), !list.isEmpty else { return }
        let j: Int = (i + dir + list.count) % list.count
        m.select(list[j], store)
    }
}

extension Media44Banner {
    /// «43 min · Drama, Thriller · 2018–»
    static func facts(_ t: Media43Title) -> String {
        var parts: [String] = []
        if t.runtime > 0 { parts.append("\(t.runtime) min") }
        if !t.genres.isEmpty { parts.append(t.genres.prefix(2).joined(separator: ", ")) }
        if t.year > 0 {
            if t.kind == "series" {
                parts.append(t.status == "ended" && t.endYear > 0 ? "\(t.year)–\(t.endYear)" : "\(t.year)–")
            } else {
                parts.append(String(t.year))
            }
        }
        if parts.isEmpty && !t.network.isEmpty { parts.append(t.network) }
        return parts.joined(separator: " · ")
    }

    /// «5 av 37 episoder · komplett» / «… · 3 mangler» / film: «Lastet ned · 1080p».
    static func state(_ t: Media43Title) -> String? {
        if t.kind == "series" {
            guard t.total > 0 else { return nil }
            return "\(t.have) av \(t.total) episoder · " + (t.missing > 0 ? "\(t.missing) mangler" : "komplett")
        }
        if t.hasFile { return "Lastet ned" + (t.fileQuality.isEmpty ? "" : " · " + t.fileQuality) }
        return nil
    }
}

/// Info-brikker (glass): MAPPE, STR., PROFIL, Overvåket, Fortsetter/Avsluttet, SPRÅK, KANAL.
struct Media44BannerChips: View {
    @MainActor private var m: Media43 { Media43.shared }
    let t: Media43Title

    var body: some View {
        let chips: [(String, String)] = items
        Media44Flow(spacing: 6) {
            ForEach(Array(chips.enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, String))) in
                Media44Glass(k: pair.element.0, v: pair.element.1)
            }
        }
    }

    private var items: [(String, String)] {
        var out: [(String, String)] = []
        if !t.path.isEmpty { out.append(("MAPPE", t.path)) }
        if t.fileSize > 0 { out.append(("STR.", Media43.size(t.fileSize))) }
        let profs: [Media43Option] = t.kind == "series" ? m.profilesTv : m.profilesMovie
        let prof: String = profs.first { $0.id == t.profileId }?.name ?? t.profile
        if !prof.isEmpty { out.append(("PROFIL", prof)) }
        out.append(("", t.monitored ? "Overvåket" : "Ikke overvåket"))
        if t.status == "continuing" { out.append(("", "Fortsetter")) } else if t.status == "ended" { out.append(("", "Avsluttet")) }
        if !t.language.isEmpty { out.append(("SPRÅK", t.language)) }
        if !t.network.isEmpty { out.append(("KANAL", t.network)) }
        return out
    }
}

struct Media44Glass: View {
    let k: String
    let v: String

    var body: some View {
        HStack(spacing: 5) {
            if !k.isEmpty { Text(k).font(PF.mono(9.5)).tracking(0.8).foregroundStyle(Color.white.opacity(0.65)) }
            Text(v).font(PF.ui(12, .semibold)).foregroundStyle(Color.white).lineLimit(1)
        }
        .padding(.horizontal, 10).frame(height: 28)
        .background(Color.white.opacity(0.14), in: Capsule())
        .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 1))
    }
}

/// Enkel flyt-layout (brikkene brytes over flere linjer).
struct Media44Flow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW: CGFloat = proposal.width ?? 340
        var x: CGFloat = 0
        var y: CGFloat = 0
        var row: CGFloat = 0
        for v in subviews {
            let s: CGSize = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > maxW { x = 0; y += row + spacing; row = 0 }
            x += s.width + spacing
            row = Swift.max(row, s.height)
        }
        return CGSize(width: maxW, height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var row: CGFloat = 0
        for v in subviews {
            let s: CGSize = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: Swift.min(s.width, bounds.width), height: s.height))
            x += s.width + spacing
            row = Swift.max(row, s.height)
        }
    }
}

/* ---------- Last ned på nytt og slett ---------- */

@MainActor
@Observable
final class Media44Files {
    static let shared = Media44Files()

    var undoText: String = ""
    @ObservationIgnored var undoAction: (() -> Void)? = nil
    @ObservationIgnored private var undoTask: Task<Void, Never>? = nil

    func showUndo(_ text: String, _ act: @escaping () -> Void) {
        undoText = text
        undoAction = act
        undoTask?.cancel()
        undoTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled { withAnimation(.easeOut(duration: 0.2)) { self.undoText = "" }; self.undoAction = nil }
        }
    }

    func undo() {
        Haptics.shared.tap()
        undoAction?()
        undoAction = nil
        undoText = ""
    }

    /// Slett episodefil (admin): ny rute, ellers Sonarr-proxyen + overvåking av.
    func deleteEpisode(_ e: Media43Episode, _ store: Store) {
        Haptics.shared.warning()
        let m: Media43 = Media43.shared
        Task { @MainActor in
            do {
                let d: Data = try await m.fetch(store, ["/media/episodes/\(e.id)/file", "/media/sonarr/episodefile/\(e.fileId)"], method: "DELETE")
                let o: [String: Any] = JS.obj(d)
                if let i = m.episodes.firstIndex(where: { $0.id == e.id }) { m.episodes[i].hasFile = false; m.episodes[i].monitored = false }
                if JS.dict(o, "undo") == nil {
                    _ = try? await m.fetch(store, ["/media/episode/monitor", "/media/sonarr/episode/monitor"], method: "PUT", json: ["episodeIds": [e.id], "monitored": false])
                }
                let msg: String = JS.str(o, "message") ?? String(format: "Slettet E%02d · overvåking er av", e.number)
                self.showUndo(msg) { self.restore(e, JS.dict(o, "undo"), store) }
            } catch { m.flash(m.errorText(error)) }
        }
    }

    func deleteMovie(_ t: Media43Title, _ store: Store) {
        Haptics.shared.warning()
        let m: Media43 = Media43.shared
        Task { @MainActor in
            do {
                let d: Data = try await m.fetch(store, ["/media/movies/\(t.id)/file", "/media/radarr/moviefile/\(t.fileId)"], method: "DELETE")
                let o: [String: Any] = JS.obj(d)
                if JS.dict(o, "undo") == nil { _ = try? await m.fetch(store, ["/media/movies/\(t.id)", "/media/radarr/movie/\(t.id)"], method: "PUT", json: ["monitored": false]) }
                await m.loadMovies(store)
                if let n = m.movies.first(where: { $0.id == t.id }), m.selected?.id == t.id { m.selected = n }
                self.showUndo(JS.str(o, "message") ?? "Slettet filen · overvåking er av") { self.restoreMovie(t, JS.dict(o, "undo"), store) }
            } catch { m.flash(m.errorText(error)) }
        }
    }

    private func restore(_ e: Media43Episode, _ undo: [String: Any]?, _ store: Store) {
        let m: Media43 = Media43.shared
        if let i = m.episodes.firstIndex(where: { $0.id == e.id }) { m.episodes[i].monitored = true }
        Task { @MainActor in
            if await self.runUndo(undo, store) { return }
            _ = try? await m.fetch(store, ["/media/episode/monitor", "/media/sonarr/episode/monitor"], method: "PUT", json: ["episodeIds": [e.id], "monitored": true])
        }
    }

    private func restoreMovie(_ t: Media43Title, _ undo: [String: Any]?, _ store: Store) {
        let m: Media43 = Media43.shared
        Task { @MainActor in
            if !(await self.runUndo(undo, store)) {
                _ = try? await m.fetch(store, ["/media/movies/\(t.id)", "/media/radarr/movie/\(t.id)"], method: "PUT", json: ["monitored": true])
            }
            await m.loadMovies(store)
        }
    }

    /// Angre fra serveren: {method, path:"/api/…", body}.
    private func runUndo(_ u: [String: Any]?, _ store: Store) async -> Bool {
        guard let u, var path = JS.str(u, "path") else { return false }
        if path.hasPrefix("/api/") { path = String(path.dropFirst(4)) }
        let body: [String: Any]? = JS.dict(u, "body")
        do {
            _ = try await Media46.shared.call(store, JS.str(u, "method") ?? "PUT", Media44.shared.withSite(path), json: body, timeout: 20)
            return true
        } catch { return false }
    }
}

/// Runde knapper på en episode med fil: ⟳ Last ned på nytt og Slett (rød).
struct Media44EpisodeFileActions: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    let t: Media43Title
    let e: Media43Episode
    let profile: String
    @State private var ask: Bool = false

    var body: some View {
        HStack(spacing: 2) {
            Media44RoundIcon(icon: "arrow.clockwise", color: p.ink, label: "Last ned på nytt") { redownload() }
            if Media44Files.isAdmin(store) {
                Media44RoundIcon(icon: "trash", color: p.lab, label: "Slett episodefilen") { ask = true }
            }
        }
        .confirmationDialog(String(format: "Slette filen for E%02d?", e.number), isPresented: $ask, titleVisibility: .visible) {
            Button("Slett filen", role: .destructive) { Media44Files.shared.deleteEpisode(e, store) }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Overvåking slås av, så den ikke lastes ned igjen med en gang.")
        }
    }

    private func redownload() {
        Haptics.shared.tap()
        m.searchFor = Media43SearchTarget(kind: "episode", title: t.title, sub: String(format: "Last ned på nytt · S%02dE%02d · ", e.season, e.number) + e.title,
                                          poster: t.poster, profile: profile, episodeId: e.id, seriesId: t.id, season: e.season)
    }
}

/// Film med fil: «⟳ Last ned på nytt» og «Slett fil».
struct Media44MovieFileActions: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    let t: Media43Title
    let profile: String
    @State private var ask: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            pill("⟳ Last ned på nytt", p.ink) {
                Haptics.shared.tap()
                m.searchFor = Media43SearchTarget(kind: "movie", title: t.title, sub: "Last ned på nytt", poster: t.poster, profile: profile, movieId: t.id)
            }
            if Media44Files.isAdmin(store) { pill("Slett fil", p.lab) { ask = true } }
        }
        .confirmationDialog("Slette filen for \(t.title)?", isPresented: $ask, titleVisibility: .visible) {
            Button("Slett filen", role: .destructive) { Media44Files.shared.deleteMovie(t, store) }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Overvåking slås av, så den ikke lastes ned igjen med en gang.")
        }
    }

    private func pill(_ title: String, _ c: Color, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(title).font(PF.ui(13.5, .bold)).foregroundStyle(c)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(p.card, in: Capsule())
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct Media44RoundIcon: View {
    @Environment(\.paper) private var p
    let icon: String
    let color: Color
    let label: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(color)
                .frame(width: 32, height: 32)
                .overlay(Circle().stroke(p.line, lineWidth: 1))
                .frame(width: 40, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// «Slettet E09 · overvåking er av · Angre» nederst i Media (5 s).
struct Media44UndoBar: View {
    @Environment(\.paper) private var p
    @MainActor private var f: Media44Files { Media44Files.shared }

    var body: some View {
        if !f.undoText.isEmpty {
            HStack(spacing: 12) {
                Text(f.undoText).font(PF.ui(13, .semibold)).foregroundStyle(p.bg).lineLimit(2)
                Button { f.undo() } label: {
                    Text("Angre").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#f0a6b4")).frame(minHeight: 36)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(p.ink, in: Capsule())
            .padding(.bottom, 70)
            .transition(.opacity)
        }
    }
}

extension Media44Files {
    static func isAdmin(_ store: Store) -> Bool { (store.me?.role ?? store.account?.role ?? "") == "admin" }
}
