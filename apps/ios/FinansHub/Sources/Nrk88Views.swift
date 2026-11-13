import SwiftUI
import UIKit

/* ---------------- Prompt 88: Media → NRK – søk og serieside (visning) ----------------
 Fasit: design/Media NRK.dc.html (pakke 58), én kolonne på telefon:
   Kort «NRK»: tittel + VPN-merke, søkefelt, KVALITET og «Komprimer (H.265, ca. halv størrelse)», så enten treffene
   (16:9-bilde, merke Serie/Film/Radio/Episode) eller seriesiden, og «Har du en lenke?» (lenkefeltet fra prompt 87).
   Seriesiden: bilde, tittel, beskrivelse, sesongvelger (tomme dempet), episoder med avkrysning (dato · varighet),
   bunnlinje med «Velg alle tilgjengelige (N)», «Følg serien», «Last ned N episoder» og hjelpeteksten.
 Ingenting legges i køen uten trykk. Modell: Nrk88Model.swift. */

/// Bilde fra serverens bildeproxy, med fargeflate og tittel som reserve (16:9, 2:3 eller kvadrat – rammen settes utenfor).
struct Nrk88Image: View {
    let url: String
    let title: String
    var font: CGFloat = 13
    var bottom: Bool = false

    var body: some View {
        let tint: Color = Media43Poster.tint(title)
        ZStack(alignment: bottom ? .bottomLeading : .center) {
            LinearGradient(colors: [tint, tint.opacity(0.65)], startPoint: .top, endPoint: .bottom)
            Text(title).font(PF.serif(font, medium: true)).foregroundStyle(Color.white.opacity(0.9))
                .multilineTextAlignment(bottom ? .leading : .center).lineLimit(3).padding(6)
            if !url.isEmpty { Media50Remote(url: url, want: 320) }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

/// VPN-merket: grønt «VPN · NO · ip», rødt «VPN nede – stoppet».
struct Nrk88Vpn: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }

    var body: some View {
        if m.hasVpn {
            let c: Color = m.vpnOk ? p.pos : p.lab
            let parts: [String] = ["VPN", m.vpnLand.isEmpty ? "NO" : m.vpnLand, m.vpnIp].filter { !$0.isEmpty }
            let t: String = m.vpnOk ? parts.joined(separator: " · ") : "VPN nede – stoppet"
            HStack(spacing: 6) {
                Circle().fill(c).frame(width: 7, height: 7)
                Text(t).font(PF.mono(10, bold: false)).foregroundStyle(c).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.horizontal, 9).frame(height: 26)
            .background(c.opacity(0.10), in: Capsule())
            .overlay(Capsule().stroke(c.opacity(0.35), lineWidth: 1))
            .accessibilityElement(children: .combine)
            .accessibilityLabel(m.vpnOk ? "VPN er i Norge" : "VPN nede, køen står stille")
        }
    }
}

/* ---------- Kort 1: NRK ---------- */

struct Nrk88Top: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }
    @MainActor private var s: Nrk88 { Nrk88.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                Text("NRK").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 4)
                Nrk88Vpn()
            }
            searchField
            pick
            if m.hasKomp { compress }
            if s.ser != nil && s.from == "sok" {
                Nrk88SeriesPage(back: "‹ Søk")
            } else {
                results
                link
            }
        }
        .modifier(Nrk87Card())
    }

    private var searchOff: Bool { s.searchOff || m.libState == "gammel" }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
                .accessibilityHidden(true)
            TextField("Søk i NRK TV og NRK Radio", text: Binding<String>(get: { s.q }, set: { (v: String) in s.typed(v, store) }))
                .font(PF.ui(14.5)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .submitLabel(.search)
                .onSubmit { Task { await s.search(store) } }
                .disabled(searchOff)
                .accessibilityLabel("Søk i NRK")
            if !s.q.isEmpty {
                Button { s.clear() } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 17)).foregroundStyle(p.mut)
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Tøm søk")
            }
        }
        .padding(.leading, 14).frame(minHeight: 46)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
        .opacity(searchOff ? 0.5 : 1)
    }

    private var pick: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("KVALITET").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Nrk87.quals, id: \.0) { (o: (String, String)) in
                        Media43Chip(text: o.1, on: m.qual == o.0) {
                            Haptics.shared.select()
                            m.qual = o.0
                        }
                    }
                }
            }
        }
    }

    private var compress: some View {
        var sub: String = m.kompStd ? "På som standard på serveren" : "Av som standard på serveren"
        if !m.kompCrf.isEmpty { sub += " · crf " + m.kompCrf }
        if !m.kompPreset.isEmpty { sub += " · " + m.kompPreset }
        let on: Bool = m.komp
        return Button {
            Haptics.shared.select()
            m.setKomp(!on)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Nrk88Box(on: on, done: false)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Komprimer (H.265, ca. halv størrelse)").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                        .multilineTextAlignment(.leading)
                    Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    @ViewBuilder private var results: some View {
        let sum: String = summary
        Text(sum).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        if !s.searchErr.isEmpty {
            Text(s.searchErr).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
        }
        if !s.hitErr.isEmpty {
            Text(s.hitErr).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
        }
        if !s.hits.isEmpty {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(s.hits) { (h: Nrk88Hit) in
                    Nrk88HitRow(h: h)
                }
            }
        }
        if !s.sokQ.isEmpty && !s.searching && s.searchErr.isEmpty && s.hits.isEmpty && !searchOff {
            Text("Ingen treff på «" + s.sokQ + "».").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.vertical, 4)
        }
    }

    private var summary: String {
        if searchOff { return "Søket krever en nyere versjon av nrk-dl. Bruk lenkefeltet under." }
        if s.searching && s.hits.isEmpty { return "Søker …" }
        if !s.sokQ.isEmpty { return s.hits.count == 1 ? "1 treff" : "\(s.hits.count) treff" }
        return "Søk etter serier, filmer og podkaster."
    }

    /// «Har du en lenke?»: lenkefeltet fra prompt 87 som sekundært valg. Delingsmottaket åpner det.
    @ViewBuilder private var link: some View {
        let open: Bool = s.linkOpen || searchOff
        Button {
            Haptics.shared.select()
            s.linkOpen.toggle()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: open ? "chevron.down" : "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(p.mut)
                    .accessibilityHidden(true)
                Text("Har du en lenke?").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(searchOff)
        .accessibilityValue(open ? "Åpen" : "Lukket")
        if open { Nrk87Form() }
    }
}

/// Avkrysningsboks (22 pt) – valgt, eller grønn hake for «lastet ned».
struct Nrk88Box: View {
    @Environment(\.paper) private var p
    let on: Bool
    let done: Bool

    var body: some View {
        let fill: Color = on ? p.ink : (done ? p.pos.opacity(0.18) : Color.clear)
        let edge: Color = on ? p.ink : (done ? p.pos : p.line)
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(fill)
            RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(edge, lineWidth: 1.5)
            if on || done {
                Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(on ? p.bg : p.pos)
            }
        }
        .frame(width: 22, height: 22)
        .accessibilityHidden(true)
    }
}

/// Ett søketreff: 16:9-bilde med merke, tittel og beskrivelse. Serie → seriesiden; ellers «Last ned» (krever trykk).
struct Nrk88HitRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Nrk88 { Nrk88.shared }
    let h: Nrk88Hit

    private var badge: String {
        switch h.art {
        case "serie": return "SERIE"
        case "film": return "FILM"
        case "radio": return "RADIO"
        default: return "EPISODE"
        }
    }

    var body: some View {
        if h.art == "serie", let sid = Nrk88.sid(h.url) {
            Button { s.open(sid, title: h.title, from: "sok", store) } label: { content(nil) }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Serie, " + h.title)
                .accessibilityHint("Åpner serien")
                .accessibilityAddTraits(.isButton)
        } else {
            content(h.art == "serie" ? "Bare serier fra tv.nrk.no kan åpnes" : nil)
        }
    }

    private func content(_ note: String?) -> some View {
        let inQueue: Bool = h.art != "serie" && s.queued(h.url)
        return HStack(alignment: .top, spacing: 12) {
            Nrk88Image(url: h.image, title: h.title, font: 12)
                .frame(width: 128, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(alignment: .topLeading) {
                    Text(badge).font(PF.mono(9)).tracking(0.6).foregroundStyle(Color.white)
                        .padding(.horizontal, 6).frame(height: 18)
                        .background(Color.black.opacity(0.55), in: Capsule())
                        .padding(5)
                }
                .opacity(h.available ? 1 : 0.55)
            VStack(alignment: .leading, spacing: 4) {
                Text(h.title).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(2)
                if !h.desc.isEmpty {
                    Text(h.desc).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
                }
                if let note { Text(note).font(PF.ui(11.5)).foregroundStyle(p.mut) }
                action(inQueue)
            }
            Spacer(minLength: 0)
            if h.art == "serie" && note == nil {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(p.mut)
                    .frame(minHeight: 72).accessibilityHidden(true)
            }
        }
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    @ViewBuilder private func action(_ inQueue: Bool) -> some View {
        if h.art != "serie" {
            if inQueue {
                Nrk87Chip(text: "I KØ", color: p.pos)
            } else if !h.available {
                Nrk87Chip(text: "IKKE TILGJENGELIG", color: p.mut)
            } else {
                Nrk87Small(text: s.hitBusy == h.id ? "Legger til …" : "Last ned", color: p.ink) { s.download(h, store) }
                    .disabled(!s.hitBusy.isEmpty)
                    .accessibilityLabel("Last ned " + h.title)
            }
        }
    }
}

/* ---------- Seriesiden ---------- */

struct Nrk88SeriesPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Nrk87 { Nrk87.shared }
    @MainActor private var s: Nrk88 { Nrk88.shared }
    let back: String

    var body: some View {
        let sid: String = s.ser ?? ""
        VStack(alignment: .leading, spacing: 12) {
            if let x = s.series[sid] {
                page(x)
            } else {
                hero(s.serTitle.isEmpty ? sid : s.serTitle, "", "", "")
                if let e = s.serErr[sid] {
                    Text(e).font(PF.ui(13.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                    Nrk87Small(text: "Prøv igjen", color: p.ink) { Task { await s.loadSeries(sid, store) } }
                } else {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Henter serien fra NRK …").font(PF.ui(13.5)).foregroundStyle(p.mut)
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        // En jobb ble ferdig: sesongen hentes på nytt i det stille (lastetNed / iKo).
        .onChange(of: m.jobs.filter { $0.active }.count) { (old: Int, now: Int) in
            if now < old { Task { await s.refreshQuiet(store) } }
        }
    }

    private func hero(_ title: String, _ kat: String, _ desc: String, _ image: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { s.close() } label: {
                Text(back).font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                    .frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Color.clear
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .overlay { Nrk88Image(url: image, title: title, font: 18) }
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            if !kat.isEmpty { Text(kat).font(PF.mono(10)).tracking(1.0).foregroundStyle(p.mut) }
            Text(title).font(PF.serif(24, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if !desc.isEmpty {
                Text(desc).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private func page(_ x: Nrk88Series) -> some View {
        let z: Nrk88SeasonRef? = s.season(x)
        let n: Int = x.seasons.filter { $0.available }.count
        let katParts: [String] = [x.kat.uppercased(), n == 0 ? "" : (n == 1 ? "1 SESONG" : "\(n) SESONGER")]
        hero(x.title, katParts.filter { !$0.isEmpty }.joined(separator: " · "), x.desc, x.image)
        if !x.seasons.isEmpty { seasons(x, z) }
        if let z {
            episodes(x, z)
        } else {
            Text("Ingen episoder tilgjengelig hos NRK akkurat nå.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.vertical, 6)
        }
        bar(x, z)
    }

    /// Sesongvelger: sesonger uten episoder er dempet og kan ikke velges.
    private func seasons(_ x: Nrk88Series, _ z: Nrk88SeasonRef?) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(x.seasons) { (o: Nrk88SeasonRef) in
                    let hint: String = o.available ? "" : "Ingen episoder tilgjengelig"
                    Media43Chip(text: Nrk88.seasonName(o), on: o.name == z?.name) { s.choose(o, store) }
                        .opacity(o.available ? 1 : 0.4)
                        .disabled(!o.available)
                        .accessibilityHint(Text(hint))
                }
            }
        }
        .accessibilityLabel("Sesong")
    }

    @ViewBuilder private func episodes(_ x: Nrk88Series, _ z: Nrk88SeasonRef) -> some View {
        let k: String = x.sid + "/" + z.name
        if let err = s.epsErr[k] {
            Text(err).font(PF.ui(13.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            Nrk87Small(text: "Prøv igjen", color: p.ink) { Task { await s.loadSeason(x.sid, z.name, store) } }
        } else if let list = s.eps[k] {
            if list.isEmpty {
                Text("Ingen episoder i denne sesongen.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.vertical, 6)
            }
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(list) { (e: Nrk88Ep) in
                    Nrk88EpRow(e: e, seriesTitle: x.title)
                }
            }
        } else {
            HStack(spacing: 8) {
                ProgressView()
                Text("Henter episodene …").font(PF.ui(13.5)).foregroundStyle(p.mut)
            }
            .padding(.vertical, 6)
        }
    }

    /// Bunnlinja: velg alle, følg serien, last ned de valgte – og hjelpeteksten om hva «Følg serien» gjør.
    private func bar(_ x: Nrk88Series, _ z: Nrk88SeasonRef?) -> some View {
        let key: String = x.sid + "/" + (z?.name ?? "")
        let list: [Nrk88Ep] = z == nil ? [] : (s.eps[key] ?? [])
        let ok: [Nrk88Ep] = list.filter { s.canPick($0) }
        let chosen: Int = ok.filter { s.pick.contains($0.id) }.count
        let all: Bool = !ok.isEmpty && chosen == ok.count
        let followed: Bool = s.follow(x.sid) != nil
        let getText: String = s.busy ? "Legger i køen …" : (chosen == 1 ? "Last ned 1 episode" : "Last ned \(chosen) episoder")
        return VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(p.line).frame(height: 1)
            Nrk87Small(text: all ? "Fjern valg" : "Velg alle tilgjengelige (\(ok.count))", color: p.ink) { s.pickAll(list) }
                .disabled(ok.isEmpty)
                .opacity(ok.isEmpty ? 0.45 : 1)
            HStack(spacing: 8) {
                Nrk87Small(text: s.fbusy ? "…" : (followed ? "✓ Følger serien" : "Følg serien"), color: followed ? p.pos : p.ink) { s.toggleFollow(store) }
                    .disabled(s.fbusy)
                    .accessibilityLabel(followed ? "Følger serien. Trykk for å slutte å følge" : "Følg serien")
                Nrk87Small(text: getText, color: p.ink, filled: true) { s.downloadPicked(store) }
                    .disabled(chosen == 0 || s.busy)
                    .opacity(chosen == 0 ? 0.45 : 1)
                Spacer(minLength: 0)
            }
            if !s.serr.isEmpty {
                Text(s.serr).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
            Text(Nrk88.help).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Én episode: avkrysning, bilde, tittel, «dato · varighet» og merke (label / Lastet ned / I kø).
struct Nrk88EpRow: View {
    @Environment(\.paper) private var p
    @MainActor private var s: Nrk88 { Nrk88.shared }
    let e: Nrk88Ep
    let seriesTitle: String

    var body: some View {
        let ok: Bool = s.canPick(e)
        let on: Bool = ok && s.pick.contains(e.id)
        let queued: Bool = s.isQueued(e)
        let badge: String = !e.can ? (e.label.isEmpty ? "Ikke tilgjengelig" : e.label) : (e.done ? "Lastet ned" : (queued ? "I kø" : ""))
        let badgeColor: Color = !e.can ? p.mut : (e.done ? p.pos : Nrk87Tint.blue(p))
        let sub: String = [e.date, e.dur].filter { !$0.isEmpty }.joined(separator: " · ")
        let traits: AccessibilityTraits = on ? [.isButton, .isSelected] : [.isButton]
        let hint: String = ok ? "Velg eller fjern episoden" : "Kan ikke velges"
        Button { s.toggle(e) } label: {
            HStack(alignment: .center, spacing: 10) {
                Nrk88Box(on: on, done: e.done)
                Nrk88Image(url: e.image, title: seriesTitle, font: 9)
                    .frame(width: 64, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.title).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).lineLimit(2).multilineTextAlignment(.leading)
                    if !sub.isEmpty { Text(sub).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1) }
                    if !badge.isEmpty { Nrk87Chip(text: badge.uppercased(), color: badgeColor) }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 6)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
            .opacity(ok || e.done ? 1 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!ok)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(e.title + (sub.isEmpty ? "" : ", " + sub) + (badge.isEmpty ? "" : ", " + badge))
        .accessibilityAddTraits(traits)
        .accessibilityHint(Text(hint))
    }
}
