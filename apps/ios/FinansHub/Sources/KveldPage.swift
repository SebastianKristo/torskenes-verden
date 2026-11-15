import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): Media – «I kveld», Fortsett, Undertekster og Lagring (visning) ---------------- */

struct Kveld51Page: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Kveld51 { Kveld51.shared }

    var body: some View {
        F51Scaffold(kicker: "Media · i kveld", title: title, sub: "Fra eget bibliotek og egen historikk – ingenting sendes ut av huset.",
                    tabs: m.tabs, tab: m.tab, pick: { (t: String) in m.pick(t, store) }, toast: m.toast,
                    close: { m.open = false }, refresh: { await m.loadTab(store, force: true) }) {
            Kveld51Body()
        }
        .task { await m.boot(store) }
    }

    private var title: String {
        switch m.tab {
        case "fortsett": return "Fortsett"
        case "subs": return "Undertekster"
        case "lagring": return "Lagring"
        default: return "Hva skal vi se?"
        }
    }
}

struct Kveld51Body: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Kveld51 { Kveld51.shared }

    var body: some View {
        if !m.statusError.isEmpty {
            F51Error(text: m.statusError) { Task { m.statusLoaded = false; await m.boot(store) } }
        } else if let e = m.errors[m.tab] {
            F51Error(text: e) { Task { await m.loadTab(store, force: true) } }
        } else {
            switch m.tab {
            case "fortsett": Kveld51Audio()
            case "subs": Kveld51Subs()
            case "lagring": Kveld51Storage()
            default: Kveld51Tonight()
            }
        }
    }
}

/// Rund knapp i Media-toppen: lukker Media og åpner «I kveld».
struct Kveld51MediaButton: View {
    @Environment(\.paper) private var p

    var body: some View {
        Button {
            Haptics.shared.tap()
            Media43.shared.open = false
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 450_000_000)
                Kveld51.shared.show()
            }
        } label: {
            Image(systemName: "tv").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.ink).round50()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hva skal vi se i kveld?")
    }
}

/* ---------- I kveld ---------- */

struct Kveld51Tonight: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kveld51 { Kveld51.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PCard {
                VStack(alignment: .leading, spacing: 10) {
                    if !m.members.isEmpty { whoRow }
                    filters
                    F51Note(text: m.whoNote + (m.phrasedBy.isEmpty ? "" : " · formulert av " + m.phrasedBy))
                    F51Btn(title: "Formuler med lokal modell", icon: "sparkles", busy: m.phrasing) { Task { await m.phrase(store) } }
                }
            }
            if !m.tonightLoaded {
                F51Loading()
            } else if m.items.isEmpty {
                PCard { F51Note(text: m.empty) }
            } else {
                F51Grid {
                    ForEach(m.items) { (x: Kv51Item) in Kveld51Card(x: x) }
                }
            }
        }
    }

    private var whoRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Hvem ser på").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(m.members) { (x: Fc51Person) in
                        let on: Bool = m.who.contains(x.userId)
                        Button { Haptics.shared.select(); m.toggleWho(x.userId, store) } label: {
                            HStack(spacing: 5) {
                                Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.system(size: 13, weight: .semibold))
                                Text(x.me ? "Meg" : x.name).font(PF.ui(13, .bold))
                            }
                            .foregroundStyle(on ? p.bg : p.ink)
                            .padding(.horizontal, 12).frame(minHeight: 34)
                            .background(on ? p.ink : Color.clear, in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1))
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? [.isSelected] : [])
                    }
                }
            }
        }
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Kveld51Menu(label: lengthLabel, options: [("", "Uansett"), ("60", "Under 1 time"), ("90", "Under 1,5 time"), ("120", "Under 2 timer"), ("150", "Under 2,5 timer")]) { (v: String) in
                    m.minutes = Int(v); m.refilter(store)
                }
                Kveld51Menu(label: m.genre.isEmpty ? "Alle sjangre" : m.genre, options: [("", "Alle sjangre")] + m.genres.map { ($0, $0) }) { (v: String) in
                    m.genre = v; m.refilter(store)
                }
                Kveld51Menu(label: kindLabel, options: [("any", "Film og serie"), ("movie", "Film"), ("series", "Serie")]) { (v: String) in
                    m.kind = v; m.refilter(store)
                }
            }
        }
    }

    private var lengthLabel: String {
        guard let mn = m.minutes else { return "Lengde: uansett" }
        return mn == 60 ? "Under 1 time" : (mn == 90 ? "Under 1,5 time" : (mn == 120 ? "Under 2 timer" : "Under 2,5 timer"))
    }

    private var kindLabel: String { m.kind == "movie" ? "Film" : (m.kind == "series" ? "Serie" : "Film og serie") }
}

struct Kveld51Menu: View {
    @Environment(\.paper) private var p
    let label: String
    let options: [(String, String)]
    let pick: (String) -> Void

    var body: some View {
        Menu {
            ForEach(options, id: \.0) { (o: (String, String)) in
                Button(o.1) { pick(o.0) }
            }
        } label: {
            Text(label + " ▾").font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(minHeight: 34)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .frame(minHeight: 44)
        }
    }
}

struct Kveld51Card: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kveld51 { Kveld51.shared }
    let x: Kv51Item

    var body: some View {
        PCard(padding: 12) {
            HStack(alignment: .top, spacing: 12) {
                PaperServerImage(path: x.poster.isEmpty ? nil : x.poster, tint: Media43Poster.tint(x.title), initials: String(x.title.prefix(2)).uppercased())
                    .frame(width: 70, height: 104)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(x.title + (x.year > 0 ? " (\(x.year))" : "")).font(PF.ui(15, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    Text(meta).font(PF.ui(12)).foregroundStyle(p.mut)
                    Text(x.text).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 6) {
                        F51Btn(title: "Åpne", kind: .ink) { m.openInMedia(x, store) }
                        if x.kind == "movie" { F51Btn(title: "Undertekster") { Task { await m.checkSubs(x, store) } } }
                    }
                    if let s = m.subsCheck[x.id] { subs(s) }
                }
            }
        }
    }

    private var meta: String {
        var a: [String] = [x.kind == "movie" ? "Film" : "Serie"]
        if !x.runtimeText.isEmpty { a.append(x.runtimeText) }
        if !x.next.isEmpty { a.append("neste " + x.next) }
        return a.joined(separator: " · ")
    }

    private func subs(_ s: String) -> some View {
        let hent: Bool = s.hasSuffix("|hent")
        let t: String = hent ? String(s.dropLast(5)) : s
        return VStack(alignment: .leading, spacing: 4) {
            F51Note(text: t)
            if hent { F51Btn(title: "Hent undertekster", icon: "captions.bubble") { Task { await m.searchSubs(kind: "movie", id: x.arrId, store) } } }
        }
    }
}

/* ---------- Fortsett (lydbøker og podkaster) ---------- */

struct Kveld51Audio: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kveld51 { Kveld51.shared }
    @State private var user: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !m.audioLoaded {
                F51Loading()
            } else if m.audio.isEmpty {
                PCard { F51Note(text: m.audioText.isEmpty ? "Ingenting påbegynt" : m.audioText) }
            } else {
                F51Grid {
                    ForEach(m.audio) { (a: Kv51Audio) in Kveld51AudioRow(a: a) }
                }
            }
            if m.audioConfigured {
                PCard {
                    VStack(alignment: .leading, spacing: 8) {
                        F51Field(label: "Min bruker i Audiobookshelf", text: $user, placeholder: "brukernavn")
                        F51Btn(title: "Lagre") { Task { await m.saveAbsUser(user, store) } }
                    }
                }
            }
        }
        .onAppear { user = m.absUser }
        .onChange(of: m.absUser) { (_: String, v: String) in user = v }
    }
}

struct Kveld51AudioRow: View {
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    let a: Kv51Audio

    var body: some View {
        PCard(padding: 12) {
            HStack(alignment: .top, spacing: 12) {
                PaperServerImage(path: a.coverUrl.isEmpty ? nil : a.coverUrl, tint: Media43Poster.tint(a.title), initials: String(a.title.prefix(2)).uppercased())
                    .frame(width: 60, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(a.title + (a.episodeTitle.isEmpty ? "" : " · " + a.episodeTitle)).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(meta).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    F51Bar(pct: Swift.max(2, a.progress), color: p.lab)
                    if let u = URL(string: a.openUrl), u.scheme == "https" || u.scheme == "http" {
                        F51Btn(title: "Fortsett i Audiobookshelf", icon: "play.fill") { openURL(u) }
                    }
                }
            }
        }
    }

    private var meta: String {
        var s: [String] = [a.kind == "podcast" ? "Podkast" : "Lydbok"]
        if !a.author.isEmpty { s.append(a.author) }
        if !a.progressText.isEmpty { s.append(a.progressText) }
        if !a.remainingText.isEmpty { s.append(a.remainingText) }
        return s.joined(separator: " · ")
    }
}

/* ---------- Undertekster ---------- */

struct Kveld51Subs: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kveld51 { Kveld51.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Norske undertekster").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                    F51Note(text: m.subsLoaded ? m.subsText : "Laster …")
                    if !m.whisperText.isEmpty { F51Note(text: m.whisperText) }
                }
            }
            if m.subsLoaded && m.wanted.isEmpty && m.subsConfigured {
                PCard { F51Note(text: "Alt har norske undertekster.") }
            }
            if !m.wanted.isEmpty {
                PLabel(text: "Mangler norsk", color: p.mut)
                F51Grid {
                    ForEach(m.wanted) { (w: Kv51Sub) in
                        PCard {
                            VStack(alignment: .leading, spacing: 6) {
                                F51Line(title: w.title, sub: w.statusText)
                                F51Btn(title: "Hent undertekster", icon: "captions.bubble") { Task { await m.searchSubs(kind: w.kind, id: w.itemId, store) } }
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ---------- Lagring (admin) ---------- */

struct Kveld51Storage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kveld51 { Kveld51.shared }
    @State private var confirm: Kv51Rec? = nil
    @State private var trashAsk: Bool = false
    @State private var typed: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let d = m.lastDeletion, d.canUndo { undoBanner(d) }
            if let s = m.storage {
                F51Grid {
                    recCard(s)
                    Kveld51Disks(s: s)
                    trashCard(s)
                }
                if !s.errors.isEmpty { PCard { F51Note(text: s.errors.joined(separator: "\n"), red: true) } }
            } else {
                F51Loading()
            }
        }
        .confirmationDialog(confirm.map { "Slette «\($0.title)»?" } ?? "", isPresented: Binding<Bool>(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            Button("Slett (kan angres i 24 timer)", role: .destructive) {
                if let r = confirm { Task { await m.delete(r, store) } }
                confirm = nil
            }
            Button("Avbryt", role: .cancel) { confirm = nil }
        } message: {
            Text("Den slutter å overvåkes nå og kan angres i 24 timer.")
        }
        .alert("Tømme papirkurven?", isPresented: $trashAsk) {
            TextField("SLETT", text: $typed).textInputAutocapitalization(.characters)
            Button("Tøm for godt", role: .destructive) {
                if typed == "SLETT" { Task { await m.emptyTrash(store) } } else { m.flash("Skriv SLETT for å tømme") }
                typed = ""
            }
            Button("Avbryt", role: .cancel) { typed = "" }
        } message: {
            Text("Dette sletter filene i papirkurven for godt (bare de som er eldre enn 24 timer). Skriv SLETT for å fortsette.")
        }
    }

    private func undoBanner(_ d: Kv51Del) -> some View {
        HStack(spacing: 10) {
            Text("«\(d.title)» slettes").font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg).lineLimit(2)
            Spacer(minLength: 6)
            Button { Task { await m.undo(d.id, store) } } label: {
                Text("Angre").font(PF.ui(13.5, .heavy)).foregroundStyle(p.bg).padding(.horizontal, 12).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func recCard(_ s: Kv51Storage) -> some View {
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Sett og stort").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                if !s.recommendText.isEmpty { F51Note(text: s.recommendText) }
                ForEach(s.recs) { (r: Kv51Rec) in
                    HStack(alignment: .center, spacing: 8) {
                        F51Line(title: r.title, sub: r.reason, value: r.sizeText)
                        F51Btn(title: "Slett …", kind: .red) { confirm = r }
                    }
                }
                if !s.deletions.isEmpty {
                    PLabel(text: "Venter på sletting", color: p.mut).padding(.top, 6)
                    ForEach(s.deletions) { (d: Kv51Del) in
                        HStack(spacing: 8) {
                            F51Line(title: d.title, sub: d.sizeText + " · " + d.statusText)
                            if d.canUndo { F51Btn(title: "Angre", kind: .ink) { Task { await m.undo(d.id, store) } } }
                        }
                    }
                }
            }
        }
    }

    private func trashCard(_ s: Kv51Storage) -> some View {
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Papirkurv").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                F51Note(text: s.trashText)
                if s.trashConfigured { F51Btn(title: "Tøm papirkurven …", kind: .red) { trashAsk = true } }
            }
        }
    }
}

struct Kveld51Disks: View {
    @Environment(\.paper) private var p
    let s: Kv51Storage

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Disker").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                if s.disks.isEmpty { F51Note(text: "Ingen diskinfo (koble til Sonarr/Radarr)") }
                ForEach(s.disks) { (d: Kv51Disk) in
                    VStack(alignment: .leading, spacing: 4) {
                        F51Line(title: d.label, sub: d.freeText + " ledig av " + d.totalText)
                        F51Bar(pct: d.usedPct, color: d.warn ? p.lab : p.ink)
                    }
                }
                ForEach(Array(s.services.enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, String))) in
                    F51Line(title: pair.element.0, sub: pair.element.1)
                }
            }
        }
    }
}
