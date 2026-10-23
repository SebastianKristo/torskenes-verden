import SwiftUI
import UIKit

/* ---------------- Prompt 43: Media – qBittorrent, Prowlarr og arkene ----------------
 Interaktivt søk (1a-stil), Legg til serie/film, Legg til magnet-lenke, ⋯ for en torrent (kø, tving start, filer),
 + Legg til indekser (Prowlarr) og ⚙ (tjenester, Spill av med, Vis i Kalender). Fasit: design/Media.dc.html. */

struct Media43Sheets: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Media43 { Media43.shared }

    func body(content: Content) -> some View {
        content
            .sheet(item: Binding<Media43SearchTarget?>(get: { m.searchFor }, set: { m.searchFor = $0 })) { (t: Media43SearchTarget) in
                Media43SearchSheet(target: t).sheet43(p, store)
            }
            .sheet(item: Binding<Media43Kind?>(get: { m.adding.map { Media43Kind(id: $0) } }, set: { m.adding = $0?.id })) { (k: Media43Kind) in
                Media43AddSheet(kind: k.id, prefill: m.addPrefill).sheet43(p, store)
            }
            .sheet(isPresented: Binding<Bool>(get: { m.magnetOpen }, set: { m.magnetOpen = $0 })) {
                Media43MagnetSheet(prefill: m.magnetPrefill).sheet43(p, store)
            }
            .sheet(item: Binding<Media43Torrent?>(get: { m.torrentMenu }, set: { m.torrentMenu = $0 })) { (t: Media43Torrent) in
                Media43TorrentSheet(t: t).sheet43(p, store)
            }
            .sheet(isPresented: Binding<Bool>(get: { m.indexerAddOpen }, set: { m.indexerAddOpen = $0 })) {
                Media43IndexerAddSheet().sheet43(p, store)
            }
            .sheet(isPresented: Binding<Bool>(get: { m.settingsOpen }, set: { m.settingsOpen = $0 })) {
                Media43SettingsSheet().sheet43(p, store)
            }
    }
}

struct Media43Kind: Identifiable, Hashable { let id: String }

extension View {
    func media43Sheets(_ p: PaperPalette) -> some View { modifier(Media43Sheets(p: p)) }

    /// Papir-ark: bakgrunn, miljø, medium/large. På iPad blir arket et sentrert vindu (systemet, maks ca. 560 pt).
    func sheet43(_ p: PaperPalette, _ store: Store) -> some View {
        self
            .environment(\.paper, p)
            .environment(store)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationBackground(p.bg)
    }
}

/// Felles topp i arkene: tittel og Ferdig.
struct Media43SheetHead: View {
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    let title: String
    var sub: String = ""

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                if !sub.isEmpty { Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut) }
            }
            Spacer(minLength: 8)
            Button { dismiss() } label: {
                Text("Ferdig").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).padding(.horizontal, 16).frame(height: 36)
                    .background(p.ink, in: Capsule()).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
        }
    }
}

/* ---------- qBittorrent ---------- */

struct Media43Qbit: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    @State private var filter: String = "Alle"
    @State private var deleting: Media43Torrent? = nil

    var body: some View {
        let list: [Media43Torrent] = m.torrents.filter { match($0, filter) }
        VStack(alignment: .leading, spacing: 12) {
            summary
            Button { Haptics.shared.tap(); m.magnetPrefill = ""; m.magnetOpen = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "link").font(.system(size: 13, weight: .bold))
                    Text("Legg til magnet-lenke").font(PF.ui(14, .bold))
                }
                .foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 46)
                .background(p.card, in: Capsule())
                .overlay(Capsule().strokeBorder(p.ink.opacity(0.4), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
            }
            .buttonStyle(.plain)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(["Alle", "Aktive", "Pauset", "Ferdige", "Står fast"], id: \.self) { (f: String) in
                        Media43Chip(text: f, on: filter == f, count: m.torrents.filter { match($0, f) }.count) { Haptics.shared.select(); filter = f }
                    }
                }
            }
            if m.torrents.isEmpty && !m.loading {
                Text(m.missingServer ? "qBittorrent er ikke satt opp på serveren ennå." : "Ingenting i qBittorrent.").font(PF.ui(14)).foregroundStyle(p.mut).padding(.vertical, 12)
            }
            ForEach(list) { (t: Media43Torrent) in card(t) }
            disk
        }
        .confirmationDialog("Slett \(deleting?.name ?? "")?", isPresented: Binding<Bool>(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Slett, behold filene", role: .destructive) { if let d = deleting { m.deleteTorrent(d, files: false, store) }; deleting = nil }
            Button("Slett med filene", role: .destructive) { if let d = deleting { m.deleteTorrent(d, files: true, store) }; deleting = nil }
            Button("Avbryt", role: .cancel) { deleting = nil }
        }
    }

    private func match(_ t: Media43Torrent, _ f: String) -> Bool {
        switch f {
        case "Aktive": return t.active
        case "Pauset": return t.paused && !t.done
        case "Ferdige": return t.done
        case "Står fast": return t.stalled
        default: return true
        }
    }

    private var summary: some View {
        let active: Int = m.torrents.filter(\.active).count
        let queued: Int = m.torrents.filter { $0.state.lowercased().contains("queued") }.count
        let anyRunning: Bool = m.torrents.contains { !$0.paused && !$0.done }
        let cream: Color = Color(hex: "#f3efe6")
        return VStack(alignment: .leading, spacing: 10) {
            Text("QBITTORRENT · LASTES NED").font(PF.mono(10)).tracking(1.2).foregroundStyle(Color(hex: "#e8a593"))
            Text("↓ " + Media43.speed(m.dlSpeed)).font(PF.serif(32, medium: true)).foregroundStyle(cream)
            Text("\(active) aktive · ↑ \(Media43.speed(m.upSpeed))" + (queued > 0 ? " · \(queued) i køen" : "")).font(PF.ui(12.5)).foregroundStyle(cream.opacity(0.75))
            HStack(spacing: 8) {
                Button { m.all(anyRunning, store) } label: {
                    Text(anyRunning ? "Pause alt" : "Fortsett alt").font(PF.ui(13.5, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
                        .frame(maxWidth: .infinity, minHeight: 44).background(cream, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { m.toggleAlt(store) } label: {
                    VStack(spacing: 0) {
                        Text("Alt-hastighet").font(PF.ui(13, .bold))
                        if m.altSpeed && m.altLimit > 0 { Text("grense " + Media43.speed(m.altLimit)).font(PF.ui(10.5)) }
                    }
                    .foregroundStyle(m.altSpeed ? Color(hex: "#1b1a17") : cream)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(m.altSpeed ? Color(hex: "#e8a593") : Color.white.opacity(0.1), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(m.altSpeed ? .isSelected : [])
            }
        }
        .padding(16)
        .background(Color(hex: "#1b1a17"), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func card(_ t: Media43Torrent) -> some View {
        let c: Color = t.stalled ? Color(hex: p.dark ? "#c48a1a" : "#a0671a") : (t.done ? Color(hex: "#2f6b4a") : p.lab)
        let state: String = t.stalled ? "Står fast" : t.done ? "Ferdig" : t.paused ? "Pauset" : (t.progress == 0 && t.size == 0 ? "Henter metadata …" : "↓ " + Media43.speed(t.dl))
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Media43Poster(url: t.poster, title: t.name, width: 40, height: 60, radius: 8)
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(2)
                    Text([t.sub, Media43.size(t.size)].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("\(Int((t.progress * 100).rounded())) %").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            }
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(c).frame(width: g.size.width * CGFloat(Swift.min(1, Swift.max(0, t.progress))))
                }
            }
            .frame(height: 4)
            HStack(spacing: 6) {
                Text([state, Media43.eta(t.eta)].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12, .semibold)).foregroundStyle(c).lineLimit(1)
                Spacer(minLength: 4)
                round(t.paused ? "play.fill" : "pause.fill", t.paused ? "Fortsett" : "Pause") { m.torrent(t, t.paused ? "resume" : "pause", store) }
                round("ellipsis", "Flere valg") { Haptics.shared.tap(); m.torrentMenu = t }
                round("trash", "Slett") { Haptics.shared.tap(); deleting = t }
            }
        }
        .padding(12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func round(_ icon: String, _ label: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(p.ink)
                .frame(width: 44, height: 44).background(p.bg, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    @ViewBuilder private var disk: some View {
        let roots: [Media43Option] = m.rootsTv + m.rootsMovie.filter { r in !m.rootsTv.contains(where: { $0.name == r.name }) }
        if !roots.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("DISKPLASS").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
                ForEach(roots) { (r: Media43Option) in
                    HStack {
                        Text(r.name).font(PF.mono(11.5, bold: false)).foregroundStyle(p.ink).lineLimit(1)
                        Spacer()
                        Text(Media43.size(r.free) + " ledig").font(PF.ui(12.5, .semibold))
                            .foregroundStyle(r.free > 0 && r.free < 1e12 ? p.lab : p.mut)
                    }
                }
                if roots.contains(where: { $0.free > 0 && $0.free < 1e12 }) {
                    Text("Under 1 TB ledig – rydd opp eller utvid disken.").font(PF.ui(12)).foregroundStyle(p.lab)
                }
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

/// ⋯ for en torrent: Pause/Fortsett, Tving start, kø, Sjekk på nytt og Filer (velg bort enkeltfiler).
struct Media43TorrentSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    let t: Media43Torrent
    @State private var files: [Media43File] = []
    @State private var loaded: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Media43SheetHead(title: t.name, sub: Media43.size(t.size))
                VStack(spacing: 0) {
                    row(t.paused ? "Fortsett" : "Pause", t.paused ? "play.fill" : "pause.fill") { m.torrent(t, t.paused ? "resume" : "pause", store) }
                    row("Tving start", "bolt.fill") { m.torrent(t, "forceStart", store) }
                    row("Opp i køen", "arrow.up") { m.torrent(t, "priority", store, extra: ["dir": "increase"]) }
                    row("Ned i køen", "arrow.down") { m.torrent(t, "priority", store, extra: ["dir": "decrease"]) }
                    row("Øverst i køen", "arrow.up.to.line") { m.torrent(t, "priority", store, extra: ["dir": "top"]) }
                    row("Nederst i køen", "arrow.down.to.line") { m.torrent(t, "priority", store, extra: ["dir": "bottom"]) }
                    row("Sjekk filene på nytt", "checkmark.shield") { m.torrent(t, "recheck", store) }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Text("FILER").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab).padding(.top, 4)
                if !loaded { ProgressView().frame(maxWidth: .infinity) }
                if loaded && files.isEmpty { Text("Ingen filer ennå (henter metadata).").font(PF.ui(13)).foregroundStyle(p.mut) }
                VStack(spacing: 0) {
                    ForEach(files) { (f: Media43File) in
                        Toggle(isOn: Binding<Bool>(get: { f.priority > 0 }, set: { (on: Bool) in
                            if let i = files.firstIndex(where: { $0.id == f.id }) { files[i].priority = on ? 1 : 0 }
                            m.setFile(t, f, on: on, store)
                        })) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(f.name).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                                Text(Media43.size(f.size) + " · \(Int(f.progress * 100)) %").font(PF.ui(11.5)).foregroundStyle(p.mut)
                            }
                        }
                        .tint(p.lab)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding(20)
        }
        .task {
            files = await m.files(t, store)
            loaded = true
        }
    }

    private func row(_ title: String, _ icon: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(p.ink).frame(width: 24)
                Text(title).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Spacer()
            }
            .padding(.horizontal, 14).frame(minHeight: 48).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Legg til magnet-lenke: lim inn, sjekk hash/navn/trackere, kategori og brytere.
struct Media43MagnetSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var m: Media43 { Media43.shared }
    let prefill: String
    @State private var link: String = ""
    @State private var category: String = ""
    @State private var paused: Bool = false
    @State private var sequential: Bool = false
    @State private var firstLast: Bool = false
    @State private var busy: Bool = false
    @State private var err: String = ""

    struct Parsed { var ok: Bool; var name: String; var hash: String; var trackers: Int; var error: String }

    static func parse(_ s0: String) -> Parsed {
        let s: String = s0.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return Parsed(ok: false, name: "", hash: "", trackers: 0, error: "") }
        if s.lowercased().hasPrefix("http://") || s.lowercased().hasPrefix("https://") {
            let n: String = URL(string: s)?.lastPathComponent ?? "fil.torrent"
            return Parsed(ok: s.lowercased().hasSuffix(".torrent") || s.contains("torrent"), name: n, hash: "", trackers: 0,
                          error: s.lowercased().contains("torrent") ? "" : "Lenken peker ikke på en .torrent-fil")
        }
        guard s.lowercased().hasPrefix("magnet:?") else { return Parsed(ok: false, name: "", hash: "", trackers: 0, error: "Lim inn en magnet:-lenke eller en https://…/fil.torrent") }
        let items: [URLQueryItem] = URLComponents(string: s)?.queryItems ?? []
        let xt: String = items.first(where: { $0.name == "xt" })?.value ?? ""
        guard xt.lowercased().hasPrefix("urn:btih:"), xt.count > 9 else {
            return Parsed(ok: false, name: "", hash: "", trackers: 0, error: "Magnet-lenken mangler xt=urn:btih:…")
        }
        let hash: String = String(xt.dropFirst(9)).lowercased()
        let valid: Bool = (hash.count == 40 && hash.allSatisfy(\.isHexDigit)) || hash.count == 32
        let name: String = items.first(where: { $0.name == "dn" })?.value ?? "Uten navn"
        let tr: Int = items.filter { $0.name == "tr" }.count
        return Parsed(ok: valid, name: name, hash: hash, trackers: tr, error: valid ? "" : "Hashen i magnet-lenken er ugyldig")
    }

    var body: some View {
        let ps: Parsed = Media43MagnetSheet.parse(link)
        let dup: Bool = !ps.hash.isEmpty && m.torrents.contains { $0.hash.lowercased() == ps.hash }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Media43SheetHead(title: "Legg til magnet-lenke", sub: "magnet:?xt=urn:btih:… eller https://…/fil.torrent")
                HStack(spacing: 8) {
                    TextField("magnet:?xt=urn:btih:…", text: $link, axis: .vertical)
                        .font(PF.mono(12, bold: false)).foregroundStyle(p.ink).lineLimit(1...4)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(12).background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    Button {
                        Haptics.shared.tap()
                        if let s = UIPasteboard.general.string { link = s }
                    } label: {
                        Text("Lim inn").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 14).frame(height: 44)
                            .background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                if ps.ok && !dup {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ps.name).font(PF.ui(14, .bold)).foregroundStyle(Color(hex: "#2f6b4a")).lineLimit(2)
                        if !ps.hash.isEmpty { Text(String(ps.hash.prefix(12)) + "… · \(ps.trackers) trackere").font(PF.mono(11, bold: false)).foregroundStyle(p.mut) }
                    }
                } else if dup {
                    Text("Ligger allerede i qBittorrent").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                } else if !ps.error.isEmpty {
                    Text(ps.error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                }
                Text("KATEGORI").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
                HStack(spacing: 6) {
                    Media43Chip(text: "Ingen", on: category.isEmpty) { category = "" }
                    Media43Chip(text: "tv-sonarr", on: category == "tv-sonarr") { category = "tv-sonarr" }
                    Media43Chip(text: "radarr", on: category == "radarr") { category = "radarr" }
                }
                Text(category == "tv-sonarr" ? "Lagres i /data/downloads/tv" : category == "radarr" ? "Lagres i /data/downloads/film" : "Lagres i /data/downloads")
                    .font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
                VStack(spacing: 0) {
                    toggle("Start pauset", $paused)
                    toggle("Sekvensiell nedlasting", $sequential)
                    toggle("Første og siste del først", $firstLast)
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                if !err.isEmpty { Text(err).font(PF.ui(13)).foregroundStyle(p.lab) }
                Button { add(ps) } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(p.bg) }
                        Text(busy ? "Legger til …" : "Legg til i qBittorrent").font(PF.ui(15, .bold))
                    }
                    .foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 50)
                    .background(ps.ok && !dup ? p.ink : p.mut, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!ps.ok || dup || busy)
            }
            .padding(20)
        }
        .onAppear { if link.isEmpty { link = prefill } }
    }

    private func toggle(_ t: String, _ b: Binding<Bool>) -> some View {
        Toggle(t, isOn: b).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).tint(p.lab).padding(.horizontal, 14).frame(minHeight: 48)
    }

    private func add(_ ps: Parsed) {
        Haptics.shared.tap()
        busy = true
        err = ""
        var body: [String: Any] = ["url": link.trimmingCharacters(in: .whitespacesAndNewlines), "paused": paused, "sequential": sequential, "firstLast": firstLast]
        if !category.isEmpty { body["category"] = category }
        Task { @MainActor in
            defer { busy = false }
            do {
                _ = try await m.fetch(store, ["/media/torrents/magnet", "/media/qbit/torrents/magnet"], method: "POST", json: body)
                Haptics.shared.success()
                m.flash("Lagt til: " + ps.name)
                await m.loadTorrents(store)
                dismiss()
            } catch { err = m.errorText(error) }
        }
    }
}

/* ---------- Interaktivt søk ---------- */

struct Media43SearchSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }
    let target: Media43SearchTarget
    /// Prompt 44: søket kjører som jobb på serveren med status per indekser (Media44Search.swift).
    @State private var job: Media44Job = Media44Job()
    private var rows: [Media43Release] { job.rows }
    private var loading: Bool { job.running }
    private var err: String { job.allFailed ? "" : job.error }
    private var meta: String { job.meta }
    @State private var filter: String = "Alle"
    @State private var sent: Set<String> = []

    var body: some View {
        let list: [Media43Release] = filtered
        let top: Int = rows.map(\.seeders).max() ?? 0
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Media43Poster(url: target.poster, title: target.title, width: 52, height: 78)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("INTERAKTIVT SØK").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
                        Text(target.title).font(PF.serif(21, medium: true)).foregroundStyle(p.ink).lineLimit(2)
                        if !target.sub.isEmpty { Text(target.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1) }
                        if !target.profile.isEmpty { Text("Profil " + target.profile).font(PF.ui(12)).foregroundStyle(p.mut) }
                    }
                    Spacer(minLength: 0)
                }
                if !meta.isEmpty { Text(meta).font(PF.mono(11, bold: false)).foregroundStyle(p.mut) }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(["Alle", "1080p", "2160p", "Norsk tekst", "Flest seedere"], id: \.self) { (f: String) in
                            Media43Chip(text: f, on: filter == f) { Haptics.shared.select(); filter = f }
                        }
                    }
                }
                // Prompt 44: status per indekser, Avbryt, «Hentet for … · Søk igjen» og feilkort bare når alle feilet.
                Media44SearchStatus(job: job, empty: list.isEmpty, again: again, cancel: { job.cancel(store) },
                                    prowlarr: { m.searchFor = nil; m.tab = "prowlarr" })
                VStack(spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Media43Release)) in
                        if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        row(pair.element, top)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding(20)
        }
        .task { await load() }
    }

    private var filtered: [Media43Release] {
        var l: [Media43Release] = rows
        switch filter {
        case "1080p": l = l.filter { $0.quality.contains("1080") || $0.title.contains("1080") }
        case "2160p": l = l.filter { $0.quality.contains("2160") || $0.title.contains("2160") || $0.quality.lowercased().contains("4k") }
        case "Norsk tekst": l = l.filter { $0.languages.lowercased().contains("nor") || $0.title.lowercased().contains("nordic") || $0.title.lowercased().contains(".no.") }
        case "Flest seedere": return l.sorted { $0.seeders > $1.seeders }
        default: break
        }
        // Standard: beste treff for profilen øverst, så seedere.
        return l.sorted { (a: Media43Release, b: Media43Release) -> Bool in
            if a.best != b.best { return a.best }
            if a.rejected.isEmpty != b.rejected.isEmpty { return a.rejected.isEmpty }
            return a.seeders > b.seeders
        }
    }

    /// Seedere/peers: grønn ≥ 50 % av det høyeste i treffene, rød < 10 % (og alltid ved 0), ellers vanlig tekst.
    private func seedColor(_ s: Int, _ top: Int) -> Color {
        if s <= 0 { return p.lab }
        guard top > 0 else { return p.ink }
        let f: Double = Double(s) / Double(top)
        if f >= 0.5 { return Color(hex: "#2f6b4a") }
        if f < 0.1 { return p.lab }
        return p.ink
    }

    private func row(_ r: Media43Release, _ top: Int) -> some View {
        let done: Bool = sent.contains(r.guid)
        return VStack(alignment: .leading, spacing: 5) {
            if r.best { Text("Best treff for profilen").font(PF.ui(11, .bold)).foregroundStyle(Color(hex: "#2f6b4a")) }
            Text(shortTitle(r.title)).font(PF.mono(11.5, bold: false)).foregroundStyle(p.ink).lineLimit(2)
            HStack(spacing: 8) {
                if !r.quality.isEmpty {
                    Text(r.quality).font(PF.ui(11, .bold)).foregroundStyle(p.bg).padding(.horizontal, 7).frame(height: 20).background(p.ink, in: Capsule())
                }
                Text(Media43.size(r.size)).font(PF.ui(12, .semibold)).foregroundStyle(p.ink)
                Text("▲ \(r.seeders)/\(r.peers)").font(PF.ui(12, .bold)).foregroundStyle(seedColor(r.seeders, top))
                Text(r.indexer).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                Spacer(minLength: 4)
                Button { download(r) } label: {
                    Image(systemName: done ? "checkmark" : "arrow.down").font(.system(size: 14, weight: .bold))
                        .foregroundStyle(done ? Color.white : p.bg)
                        .frame(width: 44, height: 44)
                        .background(done ? Color(hex: "#2f6b4a") : p.ink, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(done || r.partial)
                .opacity(r.partial ? 0.4 : 1)
                .accessibilityLabel(done ? "Sendt" : (r.partial ? "Venter på at søket blir ferdig" : "Last ned"))
            }
            if !r.languages.isEmpty || !r.age.isEmpty {
                Text([r.languages, r.age].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            if !r.rejected.isEmpty { Text(r.rejected.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.lab).lineLimit(2) }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    /// Utgivelsesnavn uten serienavnet først.
    private func shortTitle(_ s: String) -> String {
        let key: String = target.title.replacingOccurrences(of: " ", with: ".")
        if s.lowercased().hasPrefix(key.lowercased() + ".") { return String(s.dropFirst(key.count + 1)) }
        return s
    }

    private func load(force: Bool = false) async {
        await job.run(target, store, force: force)
    }

    private func again() { Task { await load(force: true) } }

    private func download(_ r: Media43Release) {
        Haptics.shared.tap()
        let svc: String = target.kind == "movie" ? "radarr" : "sonarr"
        Task { @MainActor in
            do {
                _ = try await m.fetch(store, ["/media/release?service=\(svc)", "/media/\(svc)/release"], method: "POST", json: ["guid": r.guid, "indexerId": r.indexerId])
                Haptics.shared.success()
                sent.insert(r.guid)
                m.flash("Sendt til qBittorrent: " + [r.quality, Media43.size(r.size)].filter { !$0.isEmpty }.joined(separator: " · "))
            } catch { m.flash(m.errorText(error)) }
        }
    }
}

/* ---------- Legg til serie / film ---------- */

struct Media43AddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var m: Media43 { Media43.shared }
    let kind: String
    let prefill: String
    @State private var q: String = ""
    @State private var hits: [Media43Title] = []
    @State private var searching: Bool = false
    @State private var pick: Media43Title? = nil
    @State private var profile: Int = 0
    @State private var monitor: String = "all"
    @State private var seriesType: String = "standard"
    @State private var avail: String = "released"
    @State private var root: String = ""
    @State private var searchNow: Bool = true
    @State private var busy: Bool = false
    @State private var err: String = ""
    @State private var searchTask: Task<Void, Never>? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Media43SheetHead(title: kind == "series" ? "Legg til serie" : "Legg til film", sub: kind == "series" ? "Søk i Sonarr" : "Søk i Radarr")
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").font(.system(size: 13)).foregroundStyle(p.mut)
                    TextField(kind == "series" ? "Severance, The Bear …" : "Dune, Oppenheimer …", text: $q).font(PF.ui(15)).foregroundStyle(p.ink)
                        .submitLabel(.search).onSubmit { search() }
                    if searching { ProgressView() }
                }
                .padding(.horizontal, 14).frame(height: 46).background(p.card, in: Capsule())
                .onChange(of: q) { (_: String, _: String) in debounce() }
                if let t = pick { options(t) } else { results }
                if !err.isEmpty { Text(err).font(PF.ui(13)).foregroundStyle(p.lab) }
            }
            .padding(20)
        }
        .task {
            await m.loadOptions(store)
            let profs: [Media43Option] = kind == "series" ? m.profilesTv : m.profilesMovie
            let roots: [Media43Option] = kind == "series" ? m.rootsTv : m.rootsMovie
            profile = Media43AddSheet.profileFor(prefill, profs) ?? profs.first(where: { $0.name == (kind == "series" ? "HD-1080p" : "Ultra-HD") })?.id ?? profs.first?.id ?? 0
            root = roots.first?.name ?? (kind == "series" ? "/data/media/tv" : "/data/media/film")
            if q.isEmpty && !prefill.isEmpty {
                q = Media43AddSheet.stripQuality(prefill)
                search()
            }
        }
    }

    /// «4K/UHD/2160p» → Ultra-HD, «1080p/HD» → HD-1080p, «720p» → HD-720p.
    static func profileFor(_ s: String, _ profs: [Media43Option]) -> Int? {
        let l: String = s.lowercased()
        let name: String? = (l.contains("4k") || l.contains("uhd") || l.contains("2160")) ? "ultra" : l.contains("1080") || l.contains(" hd") ? "1080" : l.contains("720") ? "720" : nil
        guard let name else { return nil }
        return profs.first(where: { $0.name.lowercased().contains(name) })?.id
    }

    static func stripQuality(_ s: String) -> String {
        var t: String = s
        for k in [" i 4K", " i 4k", " 4K", " i UHD", " i 1080p", " i 720p", " i HD", " 2160p", " 1080p", " 720p"] { t = t.replacingOccurrences(of: k, with: "") }
        return t.trimmingCharacters(in: .whitespaces)
    }

    private var results: some View {
        VStack(spacing: 8) {
            ForEach(hits) { (t: Media43Title) in
                Button {
                    if t.exists, let lib = (kind == "series" ? m.series : m.movies).first(where: { $0.title == t.title || ($0.tvdbId > 0 && $0.tvdbId == t.tvdbId) || ($0.tmdbId > 0 && $0.tmdbId == t.tmdbId) }) {
                        dismiss()
                        m.select(lib, store)
                        return
                    }
                    Haptics.shared.select()
                    pick = t
                } label: {
                    HStack(spacing: 12) {
                        Media43Poster(url: t.poster, title: t.title, width: 44, height: 66, radius: 8)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                            Text([t.year > 0 ? String(t.year) : "", t.network].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12)).foregroundStyle(p.mut)
                            if !t.overview.isEmpty { Text(t.overview).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(2) }
                        }
                        Spacer(minLength: 4)
                        if t.exists { Text("Finnes").font(PF.ui(11.5, .bold)).foregroundStyle(p.mut).padding(.horizontal, 8).frame(height: 24).background(p.line, in: Capsule()) }
                    }
                    .padding(10).background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous)).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func options(_ t: Media43Title) -> some View {
        let profs: [Media43Option] = kind == "series" ? m.profilesTv : m.profilesMovie
        let roots: [Media43Option] = kind == "series" ? m.rootsTv : m.rootsMovie
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Media43Poster(url: t.poster, title: t.title, width: 52, height: 78)
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.title).font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                    if t.year > 0 { Text(String(t.year)).font(PF.ui(12)).foregroundStyle(p.mut) }
                    Button { pick = nil } label: { Text("Velg en annen").font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab).frame(minHeight: 32) }.buttonStyle(.plain)
                }
            }
            label("KVALITETSPROFIL")
            flow(profs.map { ($0.id, $0.name) }, profile) { profile = $0 }
            if kind == "series" {
                label("OVERVÅKING")
                flowS(Media43Detail.monitors, monitor) { monitor = $0 }
                label("SERIETYPE")
                flowS(Media43Detail.types, seriesType) { seriesType = $0 }
            } else {
                label("LAST NED NÅR DEN ER")
                flowS(Media43Detail.avail, avail) { avail = $0 }
            }
            label("ROTMAPPE")
            flowS(roots.isEmpty ? [(root, root)] : roots.map { ($0.name, $0.name + ($0.free > 0 ? " · " + Media43.size($0.free) + " ledig" : "")) }, root) { root = $0 }
            Toggle(kind == "series" ? "Søk etter manglende med en gang" : "Søk etter filmen med en gang", isOn: $searchNow)
                .font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).tint(p.lab)
            Button { add(t) } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().tint(p.bg) }
                    Text(busy ? "Legger til …" : "Legg til " + t.title).font(PF.ui(15, .bold)).lineLimit(1)
                }
                .foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 50).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
        }
    }

    private func label(_ t: String) -> some View {
        Text(t).font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab).padding(.top, 2)
    }

    private func flow(_ items: [(Int, String)], _ sel: Int, _ pick: @escaping (Int) -> Void) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items, id: \.0) { (o: (Int, String)) in Media43Chip(text: o.1, on: sel == o.0) { Haptics.shared.select(); pick(o.0) } }
            }
        }
    }

    private func flowS(_ items: [(String, String)], _ sel: String, _ pick: @escaping (String) -> Void) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items, id: \.0) { (o: (String, String)) in Media43Chip(text: o.1, on: sel == o.0) { Haptics.shared.select(); pick(o.0) } }
            }
        }
    }

    private func debounce() {
        searchTask?.cancel()
        let t: String = q
        searchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            if Task.isCancelled || t != q || t.count < 2 { return }
            search()
        }
    }

    private func search() {
        let term: String = q.trimmingCharacters(in: .whitespaces)
        guard term.count >= 2 else { return }
        searching = true
        err = ""
        let enc: String = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term
        let paths: [String] = kind == "series" ? ["/media/sonarr/series/lookup?term=" + enc, "/media/series/lookup?term=" + enc]
                                               : ["/media/radarr/movie/lookup?term=" + enc, "/media/movies/lookup?term=" + enc]
        Task { @MainActor in
            defer { searching = false }
            do {
                let d: Data = try await m.fetch(store, paths, timeout: 30)
                if term != q.trimmingCharacters(in: .whitespaces) { return }
                hits = Media43.rows(d, ["series", "movies"]).prefix(20).map { Media43.title($0, kind: kind) }
                if hits.isEmpty { err = "Fant ingen treff på «\(term)»." }
            } catch { err = m.errorText(error) }
        }
    }

    private func add(_ t: Media43Title) {
        Haptics.shared.tap()
        busy = true
        err = ""
        var body: [String: Any] = ["title": t.title, "qualityProfileId": profile, "rootFolderPath": root, "search": searchNow, "monitored": true]
        if t.year > 0 { body["year"] = t.year }
        if kind == "series" {
            body["tvdbId"] = t.tvdbId
            body["monitor"] = monitor
            body["seriesType"] = seriesType
        } else {
            body["tmdbId"] = t.tmdbId
            body["minimumAvailability"] = avail
        }
        let paths: [String] = kind == "series" ? ["/media/sonarr/series", "/media/series"] : ["/media/radarr/movie", "/media/movies"]
        Task { @MainActor in
            defer { busy = false }
            do {
                _ = try await m.fetch(store, paths, method: "POST", json: body, timeout: 30)
                Haptics.shared.success()
                m.flash(t.title + " er lagt til")
                if kind == "series" { await m.loadSeries(store) } else { await m.loadMovies(store) }
                await m.loadUpcoming(store)
                dismiss()
            } catch { err = m.errorText(error) }
        }
    }
}

/* ---------- Prowlarr ---------- */

struct Media43Prowlarr: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }

    var body: some View {
        let ok: Int = m.indexers.filter(\.ok).count
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("PROWLARR").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
                Text(m.indexers.isEmpty ? "Ingen indeksere ennå" : "\(ok) av \(m.indexers.count) indeksere svarer").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                Text("\(m.indexers.reduce(0) { $0 + $1.queries }) søk · \(m.indexers.reduce(0) { $0 + $1.grabs }) hentet i dag").font(PF.ui(12.5)).foregroundStyle(p.mut)
                HStack(spacing: 8) {
                    Button { m.testAll(store) } label: {
                        Text("Test alle").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 44).background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    Button { Haptics.shared.tap(); m.indexerAddOpen = true } label: {
                        Text("+ Legg til indekser").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            VStack(spacing: 0) {
                ForEach(Array(m.indexers.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Media43Indexer)) in
                    if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    row(pair.element)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            HStack(spacing: 8) {
                Button { m.command("ApplicationIndexerSync", [:], service: "prowlarr", store, toast: "Synker til Sonarr og Radarr") } label: {
                    Text("Synk nå til Sonarr og Radarr").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 44)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func row(_ ix: Media43Indexer) -> some View {
        let testing: Bool = m.testing.contains(ix.id)
        return HStack(spacing: 10) {
            Circle().fill(ix.ok ? Color(hex: "#2f6b4a") : p.lab).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(ix.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(1)
                if !ix.error.isEmpty {
                    Text(ix.error).font(PF.ui(12)).foregroundStyle(p.lab).lineLimit(2)
                } else {
                    Text("\(ix.ms) ms · \(ix.queries) søk · \(ix.grabs) hentet i dag").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            Button { m.test(ix, store) } label: {
                Text(testing ? "Tester …" : "Test").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 32)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .disabled(testing)
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
    }
}

/// + Legg til indekser: steg 1 velg fra skjemaet (søk og filter), steg 2 innlogging, prioritet og synk. «Test og lagre».
struct Media43IndexerAddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var m: Media43 { Media43.shared }
    @State private var schema: [Media43Schema] = []
    @State private var loading: Bool = true
    @State private var q: String = ""
    @State private var filter: String = "Alle"
    @State private var pick: Media43Schema? = nil
    @State private var user: String = ""
    @State private var pass: String = ""
    @State private var apiKey: String = ""
    @State private var cookie: String = ""
    @State private var prio: Int = 25
    @State private var sonarr: Bool = true
    @State private var radarr: Bool = true
    @State private var busy: Bool = false
    @State private var err: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Media43SheetHead(title: pick == nil ? "Legg til indekser" : (pick?.name ?? ""), sub: pick == nil ? "Steg 1 av 2 · velg indekser" : "Steg 2 av 2 · innlogging og synk")
                if let s = pick { step2(s) } else { step1 }
                if !err.isEmpty { Text(err).font(PF.ui(13, .semibold)).foregroundStyle(p.lab) }
            }
            .padding(20)
        }
        .task { await load() }
    }

    private var step1: some View {
        let list: [Media43Schema] = schema.filter { (s: Media43Schema) -> Bool in
            let fOk: Bool
            switch filter {
            case "Offentlig": fOk = s.privacy.lowercased() == "public"
            case "Privat": fOk = s.privacy.lowercased() == "private"
            case "Semi-privat": fOk = s.privacy.lowercased().contains("semi")
            case "Usenet": fOk = s.protocolName.lowercased() == "usenet"
            default: fOk = true
            }
            return fOk && (q.isEmpty || s.name.localizedCaseInsensitiveContains(q))
        }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").font(.system(size: 13)).foregroundStyle(p.mut)
                TextField("Søk i \(schema.count) indeksere", text: $q).font(PF.ui(15)).foregroundStyle(p.ink)
            }
            .padding(.horizontal, 14).frame(height: 46).background(p.card, in: Capsule())
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(["Alle", "Offentlig", "Privat", "Semi-privat", "Usenet"], id: \.self) { (f: String) in
                        Media43Chip(text: f, on: filter == f) { Haptics.shared.select(); filter = f }
                    }
                }
            }
            if loading { ProgressView().frame(maxWidth: .infinity).padding(20) }
            LazyVStack(spacing: 0) {
                ForEach(list.prefix(150)) { (s: Media43Schema) in
                    Button {
                        guard !s.added else { return }
                        Haptics.shared.select()
                        pick = s
                    } label: {
                        HStack(spacing: 10) {
                            Text(typeName(s)).font(PF.ui(10.5, .bold)).foregroundStyle(.white).padding(.horizontal, 7).frame(height: 20)
                                .background(typeColor(s), in: Capsule())
                            VStack(alignment: .leading, spacing: 1) {
                                Text(s.name).font(PF.ui(14, .semibold)).foregroundStyle(s.added ? p.mut : p.ink).lineLimit(1)
                                Text([s.categories, s.language, s.protocolName.lowercased() == "usenet" ? "Usenet" : "Torrent"].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                            }
                            Spacer(minLength: 4)
                            if s.added { Text("Lagt til").font(PF.ui(11.5, .bold)).foregroundStyle(p.mut) }
                        }
                        .padding(.horizontal, 14).frame(minHeight: 52).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Rectangle().fill(p.line).frame(height: 1)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func typeName(_ s: Media43Schema) -> String {
        if s.protocolName.lowercased() == "usenet" { return "Usenet" }
        switch s.privacy.lowercased() {
        case "private": return "Privat"
        case "semiprivate", "semi-private": return "Semi"
        default: return "Offentlig"
        }
    }

    private func typeColor(_ s: Media43Schema) -> Color {
        if s.protocolName.lowercased() == "usenet" { return Color(hex: "#6b4a8f") }
        switch s.privacy.lowercased() {
        case "private": return p.lab
        case "semiprivate", "semi-private": return Color(hex: "#a0671a")
        default: return Color(hex: "#2f6b4a")
        }
    }

    private func step2(_ s: Media43Schema) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if s.fields.isEmpty || s.privacy.lowercased() == "public" && s.fields.allSatisfy({ $0 == "baseUrl" }) {
                Text("Ingen innlogging trengs.").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            if s.fields.contains("username") { field("Brukernavn", $user, secure: false) }
            if s.fields.contains("password") { field("Passord", $pass, secure: true) }
            if s.fields.contains("apiKey") {
                field("API-nøkkel", $apiKey, secure: true)
                Text("Finnes under Profil/Innstillinger → API på nettstedet til indekseren.").font(PF.ui(11.5)).foregroundStyle(p.mut)
            }
            if s.fields.contains("cookie") {
                field("Cookie", $cookie, secure: true)
                Text("Logg inn i nettleseren, åpne utviklerverktøy → Lagring → Informasjonskapsler, og kopier verdien.").font(PF.ui(11.5)).foregroundStyle(p.mut)
            }
            Text("PRIORITET").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
            HStack(spacing: 6) {
                ForEach([1, 10, 25, 40, 50], id: \.self) { (v: Int) in Media43Chip(text: "\(v)", on: prio == v) { prio = v } }
            }
            VStack(spacing: 0) {
                Toggle("Sonarr (serier)", isOn: $sonarr).padding(.horizontal, 14).frame(minHeight: 48)
                Toggle("Radarr (filmer)", isOn: $radarr).padding(.horizontal, 14).frame(minHeight: 48)
            }
            .font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).tint(p.lab)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text("Passord og nøkler lagres bare i Prowlarr (via serveren), aldri i appen.").font(PF.ui(11.5)).foregroundStyle(p.mut)
            HStack(spacing: 8) {
                Button { pick = nil; err = "" } label: {
                    Text("Tilbake").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 50).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                Button { save(s) } label: {
                    Text(busy ? "Tester …" : "Test og lagre").font(PF.ui(15, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 50).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
        }
    }

    private func field(_ title: String, _ b: Binding<String>, secure: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            Group {
                if secure { SecureField(title, text: b) } else { TextField(title, text: b) }
            }
            .font(PF.ui(15)).foregroundStyle(p.ink).textInputAutocapitalization(.never).autocorrectionDisabled()
            .padding(.horizontal, 14).frame(height: 46).background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await m.fetch(store, ["/media/indexers/schema", "/media/prowlarr/indexers/schema"], timeout: 40)
            let have: Set<String> = Set(m.indexers.map { $0.name.lowercased() })
            schema = Media43.rows(d, ["schema", "indexers"]).map { (r: [String: Any]) -> Media43Schema in
                var s: Media43Schema = Media43Schema()
                s.name = JS.str(r, "name") ?? JS.str(r, "definitionName") ?? ""
                s.implementation = JS.str(r, "implementation") ?? JS.str(r, "definitionName") ?? s.name
                s.privacy = JS.str(r, "privacy") ?? "public"
                s.protocolName = JS.str(r, "protocol") ?? "torrent"
                s.language = JS.str(r, "language") ?? ""
                let cats: [String] = JS.strings(r, "categories")
                s.categories = cats.prefix(3).joined(separator: ", ")
                var f: [String] = JS.strings(r, "needs")
                if f.isEmpty {
                    for x in JS.list(r, "fields") {
                        let n: String = (JS.str(x, "name") ?? "").lowercased()
                        if n.contains("username") { f.append("username") }
                        else if n.contains("password") { f.append("password") }
                        else if n.contains("apikey") { f.append("apiKey") }
                        else if n.contains("cookie") { f.append("cookie") }
                    }
                }
                s.fields = f
                s.added = (JS.bool(r, "added") ?? false) || have.contains(s.name.lowercased())
                return s
            }
            .sorted { $0.name.lowercased() < $1.name.lowercased() }
        } catch { err = m.errorText(error) }
    }

    private func save(_ s: Media43Schema) {
        Haptics.shared.tap()
        busy = true
        err = ""
        var apps: [String] = []
        if sonarr { apps.append("sonarr") }
        if radarr { apps.append("radarr") }
        var body: [String: Any] = ["name": s.name, "implementation": s.implementation, "priority": prio, "apps": apps]
        var fields: [String: Any] = [:]
        if !user.isEmpty { fields["username"] = user }
        if !pass.isEmpty { fields["password"] = pass }
        if !apiKey.isEmpty { fields["apiKey"] = apiKey }
        if !cookie.isEmpty { fields["cookie"] = cookie }
        body["fields"] = fields
        Task { @MainActor in
            defer { busy = false }
            do {
                let d: Data = try await m.fetch(store, ["/media/indexers", "/media/prowlarr/indexers"], method: "POST", json: body, timeout: 60)
                let o: [String: Any] = JS.obj(d)
                Haptics.shared.success()
                let ms: Int = JS.int(o, "ms") ?? 0
                m.flash(s.name + " lagt til" + (ms > 0 ? " · svarte på \(ms) ms" : "") + (apps.isEmpty ? "" : " · synket til " + apps.map { $0 == "sonarr" ? "Sonarr" : "Radarr" }.joined(separator: " og ")))
                await m.loadIndexers(store)
                dismiss()
            } catch {
                pass = ""
                err = m.errorText(error)
            }
        }
    }
}

/* ---------- ⚙ Innstillinger i Media ---------- */

struct Media43SettingsSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Media43 { Media43.shared }

    var body: some View {
        ScrollView {
            Media43SettingsContent(inSheet: true).padding(20)
        }
        .task { await m.loadStatus(store) }
    }
}

/// Prompt 45: innholdet brukes både i arket og i Innstillinger → Media (claude-code-innstillinger-samlet.md).
struct Media43SettingsContent: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var m: Media43 { Media43.shared }
    @AppStorage("media43_calendar") private var inCalendar: Bool = true
    var inSheet: Bool = false

    var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                if inSheet { Media43SheetHead(title: "Media", sub: "Tjenester, avspilling og kalender") }
                Text("TJENESTER").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
                VStack(spacing: 0) {
                    if m.services.isEmpty { Text("Ingen status fra serveren ennå.").font(PF.ui(13)).foregroundStyle(p.mut).padding(14) }
                    ForEach(m.services) { (s: Media43Service) in
                        HStack(spacing: 10) {
                            Circle().fill(!s.configured ? p.mut : s.ok ? Color(hex: "#2f6b4a") : p.lab).frame(width: 9, height: 9)
                            Text(s.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                            Spacer()
                            Text(!s.configured ? "Ikke satt opp" : s.ok ? ("v" + s.version + (s.ms > 0 ? " · \(s.ms) ms" : "")) : "Svarer ikke")
                                .font(PF.ui(12)).foregroundStyle(s.ok ? p.mut : p.lab)
                        }
                        .padding(.horizontal, 14).frame(minHeight: 48)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                Button {
                    if inSheet { dismiss() }
                    m.open = false
                    store.paperGo("innst-integ")
                } label: {
                    Text("Innstillinger → Integrasjoner → Media ›").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 44)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                Text("API-nøklene ligger bare på serveren. Appen snakker med Homelab, som videresender til tjenestene.")
                    .font(PF.ui(12)).foregroundStyle(p.mut)
                Text("SPILL AV MED").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
                HStack(spacing: 6) {
                    Media43Chip(text: "Jellyfin", on: m.player == "jellyfin") { m.player = "jellyfin" }
                    Media43Chip(text: "Plex", on: m.player == "plex") { m.player = "plex" }
                }
                Toggle("Vis i Kalender-appen", isOn: Binding<Bool>(get: { inCalendar }, set: { (v: Bool) in
                    inCalendar = v
                    Task { _ = try? await store.api.callAt("/api", "PUT", "/kalender/calendars/media", json: ["enabled": v]) }
                }))
                .font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).tint(p.lab)
                .padding(.horizontal, 14).frame(minHeight: 48)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text("Varsler når en nedlasting er ferdig, feiler eller står fast sendes fra serveren (Glimt-brief og push).")
                    .font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .task { if !inSheet { await m.loadStatus(store) } }
    }
}
