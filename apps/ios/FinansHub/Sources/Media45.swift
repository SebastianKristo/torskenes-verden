import SwiftUI
import UIKit

/* ---------------- Prompt 45: Media – tilbakeknapp, farger, avspillingsstatistikk og «Slett uovervåkede» ----------------
 – claude-code-media-tilbakeknapp.md: systemets runde 40 pt tilbakeknapp med ‹ (Back45) i stedet for «‹ Tilbake»-tekst.
 – claude-code-media-mer-farger.md: hver tjeneste har sin farge (ikon, aktiv fane, prikker): Sonarr #35c5f4, Radarr #ffc230,
   qBittorrent #3d7dd6, Prowlarr #e66001, Plex #e5a00d, Jellyfin #aa5cc3. Statuspiller: Lastes ned blå, Venter gul, Ferdig grønn,
   Mangler rød, Uovervåket grå. Papir-bakgrunnen beholdes, farge brukes som aksent.
 – claude-code-avspilling-statistikk-mobil.md: Media → Avspilling → Statistikk i én kolonne med periode 7 d · 30 d · År · Alt,
   totalt, mest sette serier/filmer, per bruker, per enhet og historikk (GET /api/playback/summary, SERVER45). 404 → den gamle
   statistikken (GET /api/playback/stats).
 – claude-code-media-slett-uovervakede-episoder.md: ⋯ → «Slett uovervåkede» (serie/sesong) og «Rydd uovervåkede» (alle) →
   bekreftelsesark «Slette 12 episodefiler (8,4 GB) som ikke er overvåket?» med avkryssing per fil → «Slett filer» med Angre
   (GET /api/media/unmonitored, POST …/delete {confirm:true}, DELETE …/pending/:id). Bare admin.
 – claude-code-innstillinger-samlet.md: Media-innstillingene ligger i Innstillinger → Media; ⋯ → «Innstillinger for Media»
   åpner den siden direkte (ikke eget ark). */

enum Media45 {
    static func color(_ service: String) -> Color {
        switch service {
        case "sonarr": return Color(hex: "#35c5f4")
        case "radarr": return Color(hex: "#ffc230")
        case "qbit", "qbittorrent": return Color(hex: "#3d7dd6")
        case "prowlarr": return Color(hex: "#e66001")
        case "plex": return Color(hex: "#e5a00d")
        case "jellyfin": return Color(hex: "#aa5cc3")
        case "avspilling": return Color(hex: "#e5a00d")
        case "kommer": return Color(hex: "#b23a2a")
        default: return Color(hex: "#6b665c")
        }
    }

    /// Tekst på farget fane: mørk på gul/lys blå, hvit ellers.
    static func onColor(_ service: String) -> Color {
        switch service {
        case "sonarr", "radarr", "plex", "avspilling": return Color(hex: "#1b1a17")
        default: return Color.white
        }
    }

    /// Statusfarger (blå / gul / grønn / rød / grå).
    nonisolated static func status(_ s: String) -> Color? {
        switch s {
        case "downloading": return Color(hex: "#3d7dd6")
        case "queued", "waiting", "paused", "pending", "delay": return Color(hex: "#c48a1a")
        case "downloaded", "hasfile", "ok", "completed": return Color(hex: "#2f7a4f")
        case "missing", "failed", "warning": return Color(hex: "#b23a2a")
        case "unmonitored": return Color(hex: "#8f897c")
        default: return nil
        }
    }
}

/// Systemets tilbakeknapp: rund 40 pt med ‹, kort med tynn kant og liten skygge (samme som Kalender, Gjøremål og Innstillinger).
struct Back45: View {
    @Environment(\.paper) private var p
    var label: String = "Tilbake"
    let action: () -> Void

    var body: some View {
        Button {
            Haptic34.back()
            action()
        } label: {
            Image(systemName: "chevron.left").font(.system(size: 16, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 40, height: 40)
                .background(p.card, in: Circle())
                .overlay(Circle().stroke(p.line, lineWidth: 1))
                .shadow(color: Color.black.opacity(0.1), radius: 6, y: 3)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(Press45Style())
        .accessibilityLabel(label)
    }
}

/* ---------- ⋯-menyen i Media ---------- */

struct Media45Menu: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }

    var body: some View {
        Menu {
            if Update28Model.isAdmin(store) {
                Button { Media45Clean.shared.open(service: "sonarr", seriesId: nil, season: nil, store) } label: {
                    Label("Rydd uovervåkede episoder", systemImage: "trash")
                }
                Button { Media45Clean.shared.open(service: "radarr", seriesId: nil, season: nil, store) } label: {
                    Label("Rydd uovervåkede filmer", systemImage: "trash")
                }
            }
            Button {
                Haptics.shared.tap()
                m.open = false
                store.paperGo("innst-media")
            } label: {
                Label("Innstillinger for Media", systemImage: "gearshape")
            }
        } label: {
            Image(systemName: "ellipsis").font(.system(size: 16, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 44, height: 44).background(p.card, in: Circle())
        }
        .accessibilityLabel("Mer for Media")
    }
}

/* ---------- Slett uovervåkede ---------- */

struct Media45File: Identifiable, Hashable {
    var id: String
    var title: String
    var code: String
    var sizeText: String
    var size: Double
}

@MainActor
@Observable
final class Media45Clean {
    static let shared = Media45Clean()

    var sheet: Bool = false
    var service: String = "sonarr"
    var seriesId: Int? = nil
    var season: Int? = nil
    var items: [Media45File] = []
    var picked: Set<String> = []
    var text: String = ""
    var loading: Bool = false
    var error: String = ""
    var pendingId: String = ""
    var undoPath: String = ""

    func open(service: String, seriesId: Int?, season: Int?, _ store: Store) {
        Haptics.shared.tap()
        self.service = service
        self.seriesId = seriesId
        self.season = season
        items = []
        picked = []
        text = ""
        error = ""
        sheet = true
        Task { await load(store) }
    }

    private var query: String {
        var q: String = "?service=" + service
        if let s = seriesId { q += "&seriesId=\(s)" }
        if let s = season { q += "&season=\(s)" }
        let site: String = Media44.shared.site
        if !site.isEmpty { q += "&server=" + (site.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? site) }
        return q
    }

    func load(_ store: Store) async {
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/media/unmonitored" + query, timeout: 30)
            let o: [String: Any] = JS.obj(d)
            items = JS.list(o, "items").map { (x: [String: Any]) -> Media45File in
                let fid: String = JS.str(x, "fileId") ?? JS.int(x, "fileId").map { String($0) } ?? UUID().uuidString
                return Media45File(id: fid, title: JS.str(x, "series") ?? JS.str(x, "title") ?? "",
                                   code: JS.str(x, "code") ?? JS.str(x, "title") ?? "", sizeText: JS.str(x, "sizeText") ?? "",
                                   size: JS.num(x, "size") ?? 0)
            }
            picked = Set(items.map(\.id))
            text = JS.str(o, "text") ?? ""
        } catch let e as APIError where e.status == 404 {
            error = "Serveren kan ikke slette uovervåkede filer ennå (oppdater Homelab)."
        } catch {
            self.error = Media44.errorText(error)
        }
    }

    var summary: String {
        let n: Int = picked.count
        if n == 0 { return "Ingen filer valgt" }
        let bytes: Double = items.filter { picked.contains($0.id) }.reduce(0) { $0 + $1.size }
        let gb: String = String(format: "%.1f", bytes / 1_073_741_824).replacingOccurrences(of: ".", with: ",")
        let what: String = service == "radarr" ? (n == 1 ? "filmfil" : "filmfiler") : (n == 1 ? "episodefil" : "episodefiler")
        return "Slette \(n) \(what)" + (bytes > 0 ? " (\(gb) GB)" : "") + " som ikke er overvåket?"
    }

    func toggle(_ id: String) {
        Haptics.shared.select()
        if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
    }

    /// Slett filer: venter 8 s på serveren (Angre), og bare filer som fortsatt er uovervåket slettes.
    func delete(_ store: Store) async {
        let ids: [String] = Array(picked)
        guard !ids.isEmpty else { return }
        Haptic30.double()
        loading = true
        defer { loading = false }
        let fids: [Any] = ids.map { (x: String) -> Any in
            if let n = Int(x) { return n }
            return x
        }
        let body: [String: Any] = ["service": service, "fileIds": fids, "confirm": true, "delaySec": 8]
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/media/unmonitored/delete", json: body, timeout: 30)
            let o: [String: Any] = JS.obj(d)
            pendingId = JS.str(o, "pendingId") ?? ""
            undoPath = JS.str(JS.dict(o, "undo"), "path") ?? (pendingId.isEmpty ? "" : "/api/media/unmonitored/pending/" + pendingId)
            sheet = false
            Media43.shared.toast = JS.str(o, "message") ?? "Sletter \(ids.count) filer …"
            if !undoPath.isEmpty { Media45Undo.shared.show(Media43.shared.toast, path: undoPath) }
        } catch {
            self.error = Media44.errorText(error)
        }
    }
}

/// «Sletter 12 filer … · Angre» (8 s).
@MainActor
@Observable
final class Media45Undo {
    static let shared = Media45Undo()
    var text: String = ""
    var path: String = ""
    @ObservationIgnored private var task: Task<Void, Never>? = nil

    func show(_ t: String, path p: String) {
        text = t
        path = p
        task?.cancel()
        task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if !Task.isCancelled { self.text = "" }
        }
    }

    func undo(_ store: Store) {
        let p: String = path.hasPrefix("/api") ? String(path.dropFirst(4)) : path
        text = ""
        Haptics.shared.tap()
        Task {
            _ = try? await store.api.callAt("/api", "DELETE", p, timeout: 15)
            Media43.shared.toast = "Angret · ingen filer slettet"
        }
    }
}

struct Media45UndoBar: View {
    @Environment(Store.self) private var store
    @MainActor private var u: Media45Undo { Media45Undo.shared }

    var body: some View {
        if !u.text.isEmpty {
            HStack(spacing: 10) {
                Text(u.text).font(PF.ui(13.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea")).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button { u.undo(store) } label: {
                    Text("Angre").font(PF.ui(13.5, .heavy)).foregroundStyle(Color(hex: "#ffb38a"))
                        .padding(.horizontal, 12).frame(minHeight: 36).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6)
            .background(Color(hex: "#1b1a17").opacity(0.94), in: Capsule())
            .padding(.horizontal, 16).padding(.bottom, 24)
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
}

/// Bekreftelsesarket med liste og avkryssing per fil.
struct Media45CleanSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var c: Media45Clean { Media45Clean.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Circle().fill(Media45.color(c.service)).frame(width: 10, height: 10)
                Text(c.service == "radarr" ? "Uovervåkede filmer" : "Uovervåkede episoder").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer(minLength: 4)
                SheetButton30(kind: .secondary, title: "Avbryt") { c.sheet = false }
            }
            if !c.error.isEmpty { Text(c.error).font(PF.ui(13.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
            if c.loading && c.items.isEmpty { Text("Finner filer som ikke er overvåket …").font(PF.ui(13.5)).foregroundStyle(p.mut) }
            if !c.loading && c.items.isEmpty && c.error.isEmpty {
                Text("Ingen uovervåkede filer. Alt som ligger på disken er overvåket.").font(PF.ui(13.5)).foregroundStyle(p.mut)
            }
            if !c.items.isEmpty { list }
            Spacer(minLength: 0)
            if !c.items.isEmpty { confirm }
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 16)
        .background(p.bg.ignoresSafeArea())
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Array(c.items.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Media45File)) in
                    Media45FileRow(f: pair.element, on: c.picked.contains(pair.element.id), first: pair.offset == 0) { c.toggle(pair.element.id) }
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .scrollIndicators(.hidden)
    }

    private var confirm: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(c.summary).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text("Filene slettes fra disken. Du kan angre de første 8 sekundene.").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Button { Task { await c.delete(store) } } label: {
                Text("Slett filer").font(PF.ui(15, .bold)).foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(c.picked.isEmpty ? p.mut : p.lab, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(c.picked.isEmpty || c.loading)
        }
    }
}

struct Media45FileRow: View {
    @Environment(\.paper) private var p
    let f: Media45File
    let on: Bool
    let first: Bool
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.square.fill" : "square").font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(on ? p.lab : p.mut)
                VStack(alignment: .leading, spacing: 1) {
                    Text(f.code.isEmpty ? f.title : f.code).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    if !f.title.isEmpty && !f.code.isEmpty { Text(f.title).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1) }
                }
                Spacer(minLength: 4)
                Text(f.sizeText).font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(minHeight: 52)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Arket og angre-linja på Media-siden.
struct Media45Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) { Media45UndoBar() }
            .animation(.easeOut(duration: 0.2), value: Media45Undo.shared.text)
            .sheet(isPresented: Binding<Bool>(get: { Media45Clean.shared.sheet }, set: { Media45Clean.shared.sheet = $0 })) {
                Media45CleanSheet().sheet43(p, store)
            }
    }
}

extension View {
    func media45Host(_ p: PaperPalette) -> some View { modifier(Media45Host(p: p)) }
}

/* ---------- Avspilling → Statistikk på mobil ---------- */

@MainActor
@Observable
final class Play45 {
    static let shared = Play45()
    static let ranges: [(String, String)] = [("7d", "7 d"), ("30d", "30 d"), ("year", "År"), ("all", "Alt")]

    var range: String = "30d"
    var available: Bool = true
    var loading: Bool = false
    var kpis: [Play44Stat] = []
    var perDay: [(String, Double)] = []
    var topShows: [Play44Stat] = []
    var topMovies: [Play44Stat] = []
    var perUser: [Play44Stat] = []
    var perDevice: [Play44Stat] = []
    var history: [Play44Row] = []

    func load(_ store: Store) async {
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/playback/summary?range=" + range, timeout: 20)
            parse(JS.obj(d))
            available = true
        } catch let e as APIError where e.status == 404 {
            available = false
        } catch {
            available = true
        }
    }

    private func parse(_ o: [String: Any]) {
        let t: [String: Any]? = JS.dict(o, "total")
        kpis = [
            Play44Stat(name: "Avspillinger", value: JS.int(t, "plays").map { String($0) } ?? "0"),
            Play44Stat(name: "Timer", value: JS.str(t, "hoursText") ?? JS.num(t, "hours").map { String(Int($0.rounded())) } ?? "0"),
            Play44Stat(name: "Brukere", value: JS.int(t, "users").map { String($0) } ?? "0"),
            Play44Stat(name: "Titler", value: JS.int(t, "titles").map { String($0) } ?? "0"),
        ]
        perDay = JS.list(o, "perDay").map { (x: [String: Any]) -> (String, Double) in
            let date: String = JS.str(x, "date") ?? ""
            return (date.count >= 10 ? String(date.dropFirst(8)) : date, Double(JS.int(x, "count") ?? 0))
        }
        topShows = plays(JS.list(o, "topShows"), "title")
        topMovies = plays(JS.list(o, "topMovies"), "title")
        perUser = JS.list(o, "perUser").map { (x: [String: Any]) -> Play44Stat in
            Play44Stat(name: JS.str(x, "name") ?? "", value: "\(JS.int(x, "plays") ?? 0) · " + (JS.str(x, "hoursText") ?? ""))
        }
        perDevice = JS.list(o, "perDevice").map { (x: [String: Any]) -> Play44Stat in
            let pct: Int = Int((JS.num(x, "pct") ?? 0).rounded())
            return Play44Stat(name: JS.str(x, "name") ?? "", value: "\(JS.int(x, "plays") ?? 0) · \(pct) %")
        }
        history = JS.list(o, "history").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Play44Row in
            let x: [String: Any] = pair.element
            return Play44Row(id: JS.str(x, "id") ?? "h\(pair.offset)", when: JS.str(x, "whenText") ?? "", title: JS.str(x, "title") ?? "",
                             sub: JS.str(x, "subtitle") ?? "", user: JS.str(x, "user") ?? "", device: JS.str(x, "device") ?? "",
                             percent: (JS.num(x, "percent") ?? 0) > 1 ? (JS.num(x, "percent") ?? 0) / 100 : (JS.num(x, "percent") ?? 0))
        }
    }

    private func plays(_ list: [[String: Any]], _ key: String) -> [Play44Stat] {
        var out: [Play44Stat] = []
        var seen: Set<String> = []
        for x in list {
            let n: String = JS.str(x, key) ?? ""
            if n.isEmpty || seen.contains(n) { continue }
            seen.insert(n)
            out.append(Play44Stat(name: n, value: "\(JS.int(x, "plays") ?? 0)"))
        }
        return out
    }
}

/// Statistikk-fanen: ny mobilside når serveren har /playback/summary, ellers den gamle.
struct Playback45Stats: View {
    @Environment(Store.self) private var store
    @MainActor private var s: Play45 { Play45.shared }

    var body: some View {
        Group {
            if s.available { Playback45Summary() } else { Playback44Stats() }
        }
        .task(id: s.range) { await s.load(store) }
    }
}

struct Playback45Summary: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Play45 { Play45.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ranges
            Playback44Kpis(items: s.kpis)
            Playback44Chart(days: s.perDay)
            Playback44List(title: "MEST SETTE SERIER", items: s.topShows)
            Playback44List(title: "MEST SETTE FILMER", items: s.topMovies)
            Playback44List(title: "PER BRUKER", items: s.perUser)
            Playback44List(title: "PER ENHET", items: s.perDevice)
            history
        }
    }

    private var ranges: some View {
        HStack(spacing: 0) {
            ForEach(Play45.ranges, id: \.0) { (r: (String, String)) in seg(r.0, r.1) }
        }
        .padding(3)
        .background(p.line.opacity(0.5), in: Capsule())
    }

    private func seg(_ k: String, _ n: String) -> some View {
        let on: Bool = s.range == k
        return Button {
            Haptics.shared.select()
            s.range = k
        } label: {
            Text(n).font(PF.ui(13, .bold)).foregroundStyle(on ? Color(hex: "#1b1a17") : p.ink)
                .frame(maxWidth: .infinity).frame(height: 32)
                .background(on ? Media45.color("plex") : Color.clear, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }

    @ViewBuilder private var history: some View {
        if !s.history.isEmpty {
            Text("HISTORIKK").font(PF.mono(10)).tracking(1.1).foregroundStyle(p.mut).padding(.top, 4)
            ForEach(s.history) { (r: Play44Row) in Playback44HistoryRow(r: r) }
        }
    }
}
