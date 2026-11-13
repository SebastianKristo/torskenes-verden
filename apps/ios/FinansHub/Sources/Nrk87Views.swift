import SwiftUI
import UIKit

/* ---------------- Prompt 87: Media → NRK (visning) ----------------
 Prompt 88: kort 1 er nå «NRK» med søk og serieside (Nrk88Views.swift); lenkeskjemaet under ligger under «Har du en lenke?».
 Fasit: design/Media NRK.dc.html. Én kolonne på telefon: Last ned → Køen → Serier du følger → Bibliotek (med detalj).
 På stor skjerm: «Last ned fra NRK» og «Serier du følger» til venstre, «Køen» til høyre, Bibliotek i full bredde under.
 Farger: blå = laster ned, grønn (pos) = ferdig / VPN ok, rød (lab) = feil / VPN stoppet, dempet = i kø / avbrutt.
 Oppdateringen (2 s / 10 s) kjører i .task og stopper av seg selv når fanen ikke vises. Modell: Nrk87Model.swift. */

enum Nrk87Tint {
    static func blue(_ p: PaperPalette) -> Color { Color(hex: p.dark ? "#7fb0dc" : "#2b5d8a") }

    static func job(_ status: String, _ p: PaperPalette) -> Color {
        switch status {
        case "kjorer": return blue(p)
        case "ferdig": return p.pos
        case "feil": return p.lab
        default: return p.mut
        }
    }

    static func ep(_ status: String, _ p: PaperPalette) -> Color {
        switch status {
        case "lastet": return p.pos
        case "laster": return blue(p)
        default: return p.mut
        }
    }
}

/// Kortet rundt hver del (som m70-card på web).
struct Nrk87Card: ViewModifier {
    @Environment(\.paper) private var p

    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Liten statusbrikke: «LASTER NED», «VENTER», «MANGLER» …
struct Nrk87Chip: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text).font(PF.mono(10)).tracking(0.8).foregroundStyle(color).lineLimit(1)
            .padding(.horizontal, 8).frame(height: 22)
            .background(color.opacity(0.13), in: Capsule())
    }
}

/// Liten knapp med kant (Avbryt, Prøv igjen, Sjekk nå …). Trykkflate 44 pt.
struct Nrk87Small: View {
    @Environment(\.paper) private var p
    let text: String
    let color: Color
    var filled: Bool = false
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(text).font(PF.ui(12.5, .bold)).foregroundStyle(filled ? p.bg : color).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 32)
                .background(filled ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(filled ? p.ink : p.line, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct Nrk87View: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }
    let wide: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !m.loaded {
                ProgressView().frame(maxWidth: .infinity).padding(30)
            } else if !m.configured {
                notSet
            } else if !m.err.isEmpty && m.jobs.isEmpty && m.follows.isEmpty {
                failed
            } else {
                cards
            }
        }
        // Avbrytes når fanen byttes eller Media lukkes – ingen kall i bakgrunnen.
        .task { await m.run(store) }
    }

    @ViewBuilder private var cards: some View {
        if wide {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 12) {
                    Nrk88Top()
                    Nrk87Follows()
                }
                Nrk87Queue()
            }
        } else {
            Nrk88Top()
            Nrk87Queue()
            Nrk87Follows()
        }
        Nrk87Library()
    }

    private var notSet: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("NRK-nedlasteren er ikke satt opp").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Text("Legg inn adressen og tokenet til nrk-dl under Integrasjoner. Tjenesten kjører bak en egen VPN-tunnel til Norge.")
                .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Button {
                Haptics.shared.tap()
                Media43.shared.open = false
                store.paperGo("innst-integ")
            } label: {
                Text("Åpne Integrasjoner").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 18).frame(minHeight: 44).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .modifier(Nrk87Card())
    }

    private var failed: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Fikk ikke kontakt med NRK-nedlasteren").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            Text(m.err).font(PF.ui(13.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            Nrk87Small(text: "Prøv igjen", color: p.ink) {
                Haptics.shared.tap()
                Task { await m.load(store, full: true) }
            }
        }
        .modifier(Nrk87Card())
    }
}

/* ---------- «Har du en lenke?» (lenkeskjemaet fra prompt 87, inni kort 1 «NRK») ----------
 Kvalitet, komprimering og VPN-merket står øverst i kortet (Nrk88Top) og gjelder også her. */

struct Nrk87Form: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }

    var body: some View {
        let bad: Bool = !m.formErr.isEmpty
        let ok: Bool = Nrk87.valid(Nrk87.link(in: m.url))
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                TextField("https://tv.nrk.no/serie/…", text: Binding<String>(get: { m.url }, set: { (v: String) in m.url = v; m.formErr = "" }))
                    .font(PF.ui(14.5)).foregroundStyle(p.ink)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit { m.add(store) }
                    .padding(.horizontal, 14).frame(minHeight: 46)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(bad ? p.lab : p.line, lineWidth: bad ? 1.5 : 1))
                    .accessibilityLabel("Lenke fra NRK")
                // «Lim inn» fyller bare ut feltet. Ingenting lastes ned før «Last ned».
                Button { m.paste() } label: {
                    Text("Lim inn").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 14).frame(height: 46)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Button { m.add(store) } label: {
                Text(m.busy ? "Legger til …" : "Last ned").font(PF.ui(14.5, .bold)).foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(p.ink.opacity(ok ? 1 : 0.4), in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(m.busy)
            if bad {
                Text(m.formErr).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
            pick("TYPE", Nrk87.types, m.type) { (v: String) in m.type = v }
            Toggle(isOn: Binding<Bool>(get: { m.follow }, set: { (v: Bool) in m.follow = v })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Følg serien").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    Text("Laster ned nye episoder automatisk").font(PF.ui(12)).foregroundStyle(p.mut)
                }
            }
            .tint(p.pos)
            folders
        }
    }

    private func pick(_ label: String, _ list: [(String, String)], _ cur: String, _ set: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(list, id: \.0) { (o: (String, String)) in
                        Media43Chip(text: o.1, on: cur == o.0) {
                            Haptics.shared.select()
                            set(o.0)
                        }
                    }
                }
            }
        }
    }

    private var folders: some View {
        let f: [String] = m.folders.count == 3 ? m.folders : ["tv", "movies", "podcast"]
        let lines: [String] = [
            f[0] + "/Serie/Season 01/Serie - S01E02 - Tittel.mkv",
            f[1] + "/Tittel/Tittel.mkv",
            f[2] + "/Serie/2026-11-13 - Tittel.m4a",
        ]
        return VStack(alignment: .leading, spacing: 3) {
            ForEach(lines, id: \.self) { (l: String) in
                Text(l).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/* ---------- Kort 2: Køen ---------- */

struct Nrk87Queue: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Køen").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                Spacer(minLength: 4)
                if m.hasDone { Nrk87Small(text: "Fjern ferdige", color: p.ink) { m.clean(store) } }
            }
            if !m.err.isEmpty {
                Text(m.err).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
            if m.vpnStopped {
                Text("Venter på VPN: tunnelen er ikke i Norge. Køen står stille.")
                    .font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.lab.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if m.jobs.isEmpty {
                Text("Ingenting i køen. Lim inn en lenke fra tv.nrk.no eller radio.nrk.no.")
                    .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.vertical, 8)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(m.jobs.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Nrk87Job)) in
                    if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Nrk87JobRow(j: pair.element)
                }
            }
        }
        .modifier(Nrk87Card())
    }
}

struct Nrk87JobRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    @MainActor private var m: Nrk87 { Nrk87.shared }
    let j: Nrk87Job

    var body: some View {
        let waiting: Bool = m.vpnStopped && j.active
        let c: Color = Nrk87Tint.job(j.status, p)
        let msg: String = waiting ? (j.msg.hasPrefix("Venter på VPN") ? j.msg : "Venter på VPN …") : j.msg
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 8) {
                title
                Spacer(minLength: 4)
                Nrk87Chip(text: waiting ? "VENTER" : Nrk87.jobStatusText(j.status), color: c)
            }
            if !msg.isEmpty {
                Text(msg).font(PF.ui(13)).foregroundStyle(j.status == "feil" ? p.lab : p.mut).fixedSize(horizontal: false, vertical: true)
            }
            if j.status == "kjorer" { progress(c) }
            if j.status == "ferdig" && j.saved > 0 {
                Text(Nrk87.savedText(j.saved)).font(PF.ui(12.5, .semibold)).foregroundStyle(p.pos)
            }
            if !j.files.isEmpty { files }
            actions
        }
        .padding(.vertical, 10)
    }

    /// Tittelen åpner NRK i nettleseren (bare ekte NRK-lenker).
    @ViewBuilder private var title: some View {
        let t: Text = Text(j.title).font(PF.ui(14.5, .bold)).foregroundColor(p.ink)
        if Nrk87.valid(j.url), let u = URL(string: j.url) {
            Button { openURL(u) } label: { t.lineLimit(2).multilineTextAlignment(.leading) }
                .buttonStyle(.plain)
                .accessibilityHint("Åpner NRK")
        } else {
            t.lineLimit(2)
        }
    }

    private func progress(_ c: Color) -> some View {
        let pct: Double = Swift.min(100, Swift.max(0, j.pct ?? 0))
        var parts: [String] = ["\(Int(pct.rounded())) %"]
        if j.compressing {
            parts.append(m.kompCrf.isEmpty ? "H.265" : "H.265 · crf " + m.kompCrf)
        } else if j.speed > 0 {
            parts.append(Media43.speed(j.speed))
        }
        let eta: String = Nrk87.left(j.eta)
        if !eta.isEmpty { parts.append(eta) }
        if j.av > 0 { parts.append("\(j.nr) av \(j.av)") }
        let line: String = parts.joined(separator: "  ·  ")
        return VStack(alignment: .leading, spacing: 5) {
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(c).frame(width: g.size.width * CGFloat(pct / 100))
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
            Text(line).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).lineLimit(2)
        }
    }

    private var files: some View {
        let open: Bool = m.filesOpen.contains(j.id)
        return VStack(alignment: .leading, spacing: 4) {
            Button {
                Haptics.shared.select()
                if open { m.filesOpen.remove(j.id) } else { m.filesOpen.insert(j.id) }
            } label: {
                Text((open ? "Skjul" : "Vis") + " lagrede filer (\(j.files.count))").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                    .underline()
                    .frame(minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                ForEach(Array(j.files.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                    Text(pair.element).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// kjører / kø → Avbryt · feil / avbrutt → Prøv igjen + Fjern · ferdig serie / radio → Se etter nye + Fjern · ferdig film → Fjern.
    private var actions: some View {
        let retry: Bool = j.status == "feil" || j.status == "avbrutt"
        let done: Bool = j.status == "ferdig"
        return HStack(spacing: 8) {
            if j.active { Nrk87Small(text: "Avbryt", color: p.lab) { m.act(j, "avbryt", store) } }
            if retry { Nrk87Small(text: "Prøv igjen", color: p.ink) { m.act(j, "igjen", store) } }
            if done && j.type != "film" { Nrk87Small(text: "Se etter nye", color: p.ink) { m.act(j, "igjen", store) } }
            if retry || done { Nrk87Small(text: "Fjern", color: p.mut) { m.act(j, "fjern", store) } }
            Spacer(minLength: 0)
        }
    }
}

/* ---------- Kort 3: Serier du følger ---------- */

struct Nrk87Follows: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Serier du følger").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            if m.follows.isEmpty {
                Text("Du følger ingen serier. Åpne en serie og trykk «Følg serien».")
                    .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.vertical, 8)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(m.follows.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Nrk87Follow)) in
                    if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    row(pair.element)
                }
            }
        }
        .modifier(Nrk87Card())
    }

    /// Prompt 88: plakat 48×72 (radio/podkast 72×72) til venstre, reserveflate med tittelen nederst. Knappene under.
    private func row(_ f: Nrk87Follow) -> some View {
        let busy: Bool = m.checking.contains(f.id)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 12) {
                Nrk88Image(url: f.image, title: f.title, font: 12, bottom: true)
                    .frame(width: f.radio ? 72 : 48, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(f.title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(2)
                    Text(Nrk87.followSub(f)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                Nrk87Small(text: busy ? "Sjekker …" : "Sjekk nå", color: p.ink) { m.check(f, store) }
                Nrk87Small(text: "Slutt å følge", color: p.lab) { m.unfollow(f, store) }
                Spacer(minLength: 0)
            }
        }
        .padding(.vertical, 10)
    }
}

/* ---------- Bibliotek ---------- */

/// Plakat 2:3: NRK-bildet via serverens proxy, med fargeflate og tittel som reserve.
struct Nrk87Poster: View {
    let it: Nrk87Item
    var radius: CGFloat = 12
    var font: CGFloat = 16

    var body: some View {
        let tint: Color = Media43Poster.tint(it.title)
        Color.clear
            .aspectRatio(2.0 / 3.0, contentMode: .fit)
            .overlay {
                ZStack {
                    LinearGradient(colors: [tint, tint.opacity(0.65)], startPoint: .top, endPoint: .bottom)
                    Text(it.title).font(PF.serif(font, medium: true)).foregroundStyle(Color.white.opacity(0.9))
                        .multilineTextAlignment(.center).lineLimit(4).padding(8)
                    if !it.image.isEmpty { Media50Remote(url: it.image, want: 320) }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .accessibilityHidden(true)
    }
}

struct Nrk87Library: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if m.libState == "gammel" {
                Text("Bibliotek").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                Text("Biblioteket krever en nyere versjon av nrk-dl.")
                    .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            } else if Nrk88.shared.ser != nil && Nrk88.shared.from == "lib" {
                // Prompt 88: en serie i Bibliotek åpner den nye seriesiden (her, så du slipper å rulle til toppen).
                Nrk88SeriesPage(back: "‹ Bibliotek")
            } else if let s = m.sel {
                Nrk87Detail(it: s)
            } else {
                list
            }
        }
        .modifier(Nrk87Card())
    }

    @ViewBuilder private var list: some View {
        let items: [Nrk87Item] = m.lib.filter { m.filter == "alle" || $0.type == m.filter }
        let sum: String = Nrk87.summary(m.lib)
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("Bibliotek").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Spacer(minLength: 4)
            if !sum.isEmpty { Text(sum).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.8) }
        }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Nrk87.filters, id: \.0) { (o: (String, String)) in
                    Media43Chip(text: o.1, on: m.filter == o.0) {
                        Haptics.shared.select()
                        m.filter = o.0
                    }
                }
            }
        }
        if !m.libErr.isEmpty {
            Text(m.libErr).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
        }
        if m.libState.isEmpty {
            ProgressView().frame(maxWidth: .infinity).padding(20)
        } else if items.isEmpty && m.libErr.isEmpty {
            Text(m.lib.isEmpty ? "Ingenting er lastet ned ennå." : "Ingenting her.")
                .font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.vertical, 8)
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12, alignment: .top)], alignment: .leading, spacing: 14) {
            ForEach(items) { (it: Nrk87Item) in
                Button { openItem(it) } label: { tile(it) }
                    .buttonStyle(.plain)
            }
        }
    }

    /// Prompt 88: serier fra tv.nrk.no åpner seriesiden (sesonger + avkrysning); film og radio den gamle detaljen.
    private func openItem(_ it: Nrk87Item) {
        if it.type == "tv", let sid = Nrk88.sid(it.url) {
            m.sel = nil
            Nrk88.shared.open(sid, title: it.title, from: "lib", store)
        } else {
            m.open(it, store)
        }
    }

    private func tile(_ it: Nrk87Item) -> some View {
        let n: Int = it.total
        let h: Int = it.have
        let done: Bool = h >= n
        let badge: String = it.type == "film" ? "FILM" : (it.type == "radio" ? "RADIO" : "\(it.seasons.count) S")
        let sub: String = it.type == "film" ? Nrk87Library.filmText(it.single) : "\(h) av \(n) episoder"
        let frac: CGFloat = CGFloat(h) / CGFloat(Swift.max(1, n))
        return VStack(alignment: .leading, spacing: 5) {
            Nrk87Poster(it: it)
                .overlay(alignment: .topTrailing) {
                    Text(badge).font(PF.mono(9.5)).tracking(0.6).foregroundStyle(Color.white)
                        .padding(.horizontal, 6).frame(height: 20)
                        .background(Color.black.opacity(0.55), in: Capsule())
                        .padding(6)
                }
            Text(it.title).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
            Text(sub).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(done ? p.pos : Nrk87Tint.blue(p)).frame(width: g.size.width * Swift.min(1, frac))
                }
            }
            .frame(height: 3)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(it.title + ", " + sub)
        .accessibilityAddTraits(.isButton)
    }

    nonisolated static func filmText(_ s: String) -> String {
        switch s {
        case "lastet": return "Lastet ned"
        case "laster": return "Laster ned"
        case "ko": return "I kø"
        default: return "Mangler"
        }
    }
}

/// Én rad i episodelista (eller filmen).
struct Nrk87EpRow: View {
    @Environment(\.paper) private var p
    let code: String
    let title: String
    let sub: String
    let status: String
    let can: Bool
    let get: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(code).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).frame(width: 52, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).lineLimit(2)
                if !sub.isEmpty { Text(sub).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1) }
            }
            Spacer(minLength: 4)
            if can {
                Nrk87Small(text: "Last ned", color: p.ink, act: get)
            } else {
                Nrk87Chip(text: Nrk87.epStatusText(status), color: Nrk87Tint.ep(status, p))
            }
        }
        .frame(minHeight: 48)
    }
}

struct Nrk87Detail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    @MainActor private var m: Nrk87 { Nrk87.shared }
    let it: Nrk87Item

    var body: some View {
        let film: Bool = it.type == "film" || it.seasons.isEmpty
        let si: Int = m.seasonIndex(it)
        let eps: [Nrk87Ep] = film ? [] : it.seasons[si].eps
        let missing: [Nrk87Ep] = eps.filter { $0.status == "mangler" }
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Nrk87Poster(it: it, radius: 10, font: 13).frame(width: 96)
                VStack(alignment: .leading, spacing: 5) {
                    Button {
                        Haptics.shared.tap()
                        m.sel = nil
                        m.libErr = ""
                    } label: {
                        Text("‹ Bibliotek").font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                            .frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Text(it.title).font(PF.serif(22, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    if !it.meta.isEmpty { Text(it.meta).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
                    if !it.desc.isEmpty { Text(it.desc).font(PF.ui(13)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
                }
            }
            if !m.libErr.isEmpty {
                Text(m.libErr).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Nrk87Small(text: allLabel(film, missing.count), color: p.ink, filled: true) {
                    m.queue(it, eps: film ? [] : missing, whole: true, store)
                }
                if Nrk87.valid(it.url), let u = URL(string: it.url) {
                    Nrk87Small(text: "Åpne på NRK", color: p.ink) { openURL(u) }
                }
                Spacer(minLength: 0)
            }
            if !film && it.seasons.count > 1 { seasons(si) }
            VStack(alignment: .leading, spacing: 0) {
                if film {
                    Nrk87EpRow(code: "FILM", title: it.title, sub: it.meta.components(separatedBy: " · ").last ?? "", status: it.single,
                               can: it.single == "mangler" && Nrk87.valid(it.url)) {
                        m.queue(it, eps: [], whole: true, store)
                    }
                } else {
                    if eps.isEmpty {
                        Text("Ingen episoder i denne sesongen.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.vertical, 8)
                    }
                    ForEach(Array(eps.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Nrk87Ep)) in
                        if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        row(pair.element, it.seasons[si].nr)
                    }
                }
            }
        }
    }

    private func row(_ e: Nrk87Ep, _ season: Int) -> some View {
        Nrk87EpRow(code: Nrk87.epCode(it.type, season, e.nr), title: e.title, sub: e.dur, status: e.status,
                   can: e.status == "mangler" && Nrk87.valid(e.url)) {
            m.queue(it, eps: [e], whole: false, store)
        }
    }

    private func allLabel(_ film: Bool, _ missing: Int) -> String {
        if film { return it.single == "mangler" ? "Last ned" : "Last ned på nytt" }
        return missing > 0 ? "Last ned \(missing) som mangler" : "Se etter nye"
    }

    /// Sesong-piller (for podkast: år).
    private func seasons(_ si: Int) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(it.seasons.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Nrk87Season)) in
                    Media43Chip(text: it.type == "radio" ? "\(pair.element.nr)" : "Sesong \(pair.element.nr)", on: pair.offset == si) {
                        Haptics.shared.select()
                        m.selSeason[it.id] = pair.offset
                    }
                }
            }
        }
    }
}
