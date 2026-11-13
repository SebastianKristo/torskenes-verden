import SwiftUI
import UIKit

/* ---------------- Prompt 88: Media → Musikk (yubal) – visning ----------------
 Fasit: design/Media Musikk.dc.html (pakke 58). Én kolonne: «Last ned musikk» → «Køen» → «Spillelister du følger».
 Ikke satt opp → tomtilstand med «Åpne Integrasjoner». Oppdateringen (2 s / 10 s) kjører i .task og stopper av seg selv når
 fanen ikke vises; i bakgrunnen hoppes den over. Farger: blå = henter/laster ned, lilla = importerer, grønn = ferdig,
 rød = feilet, dempet = venter/avbrutt. Modell: Musikk88Model.swift. */

enum Mu88Tint {
    static func job(_ s: String, _ p: PaperPalette) -> Color {
        switch s {
        case "fetching_info", "downloading": return Nrk87Tint.blue(p)
        case "importing": return Color(hex: p.dark ? "#b08fd0" : "#7a4fa0")
        case "completed": return p.pos
        case "failed": return p.lab
        default: return p.mut
        }
    }

    static func track(_ s: String, _ p: PaperPalette) -> Color {
        switch s {
        case "downloaded": return p.pos
        case "failed": return p.lab
        default: return p.mut
        }
    }
}

/// Omslag (kvadrat) via serverens bildeproxy, med fargeflate som reserve.
struct Mu88Cover: View {
    let url: String
    let title: String
    var size: CGFloat = 48
    var radius: CGFloat = 8

    var body: some View {
        let tint: Color = Media43Poster.tint(title)
        ZStack {
            LinearGradient(colors: [tint, tint.opacity(0.65)], startPoint: .top, endPoint: .bottom)
            Image(systemName: "music.note").font(.system(size: size * 0.32, weight: .semibold)).foregroundStyle(Color.white.opacity(0.6))
            if !url.isEmpty { Media50Remote(url: url, want: 320) }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .accessibilityHidden(true)
    }
}

struct Musikk88View: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Musikk88 { Musikk88.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !m.loaded {
                ProgressView().frame(maxWidth: .infinity).padding(30)
            } else if !m.configured {
                notSet
            } else if !m.err.isEmpty && m.jobs.isEmpty && m.subs.isEmpty {
                failed
            } else {
                Mu88Form()
                Mu88Queue()
                Mu88Subs()
            }
        }
        // Avbrytes når fanen byttes eller Media lukkes – ingen kall i bakgrunnen.
        .task { await m.run(store) }
    }

    private var notSet: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Musikk er ikke satt opp").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Text("Legg inn adressen til yubal under Integrasjoner. Da kan du laste ned album og spillelister fra YouTube Music til musikkbiblioteket.")
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
            Text("Fikk ikke kontakt med yubal").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            Text(m.err).font(PF.ui(13.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            Nrk87Small(text: "Prøv igjen", color: p.ink) {
                Haptics.shared.tap()
                Task { await m.load(store, full: true) }
            }
        }
        .modifier(Nrk87Card())
    }
}

/* ---------- Kort 1: Last ned musikk ---------- */

struct Mu88Form: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Musikk88 { Musikk88.shared }

    var body: some View {
        let bad: Bool = !m.ferr.isEmpty
        let ok: Bool = Musikk88.valid(Musikk88.link(in: m.url))
        VStack(alignment: .leading, spacing: 12) {
            Text("Last ned musikk").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 8) {
                TextField("Album, spilleliste eller sang fra music.youtube.com", text: Binding<String>(get: { m.url }, set: { (v: String) in m.edited(v) }))
                    .font(PF.ui(14.5)).foregroundStyle(p.ink)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit { m.preview(store) }
                    .padding(.horizontal, 14).frame(minHeight: 46)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(bad ? p.lab : p.line, lineWidth: bad ? 1.5 : 1))
                    .accessibilityLabel("Lenke fra YouTube Music")
                // «Lim inn» fyller bare ut feltet. Ingenting lastes ned før «Last ned».
                Button { m.paste() } label: {
                    Text("Lim inn").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 14).frame(height: 46)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Button { m.preview(store) } label: {
                Text(m.previewing ? "Henter …" : "Forhåndsvis").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .overlay(Capsule().stroke(ok ? p.ink : p.line, lineWidth: 1))
                    .contentShape(Capsule())
                    .opacity(ok ? 1 : 0.5)
            }
            .buttonStyle(.plain)
            .disabled(m.previewing)
            if bad {
                Text(m.ferr).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
            if let pv = m.pv { preview(pv) }
        }
        .modifier(Nrk87Card())
    }

    private func preview(_ x: Mu88Info) -> some View {
        let many: Bool = x.kind != "track"
        let list: Bool = x.kind == "playlist"
        let meta: String = Musikk88.meta(x)
        let src: String = Musikk88.source(x)
        let go: String = m.starting ? "Legger til …" : (list && m.follow ? "Følg og last ned" : "Last ned")
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Mu88Cover(url: x.image, title: x.title, size: 96, radius: 10)
                VStack(alignment: .leading, spacing: 4) {
                    Text(Musikk88.kindText(x.kind)).font(PF.mono(10)).tracking(1.0).foregroundStyle(p.mut)
                    Text(x.title).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    if !meta.isEmpty { Text(meta).font(PF.ui(13)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
                    if !src.isEmpty { Text(src).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut) }
                }
                .accessibilityElement(children: .combine)
            }
            if many { amount }
            if list { followToggle }
            Button { m.start(store) } label: {
                Text(go).font(PF.ui(14.5, .bold)).foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(m.starting)
            Text("Lagres som " + m.format + " i musikkbiblioteket (Navidrome)")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// «Alle spor» / «Bare de første N» (max_items 1–10000).
    private var amount: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Media43Chip(text: "Alle spor", on: m.typ == "alle") { Haptics.shared.select(); m.typ = "alle" }
                Media43Chip(text: "Bare de første", on: m.typ == "max") { Haptics.shared.select(); m.typ = "max" }
            }
            if m.typ == "max" {
                Stepper(value: Binding<Int>(get: { m.maxN }, set: { (v: Int) in m.setMax(v) }), in: 1...10000, step: 10) {
                    HStack(spacing: 6) {
                        TextField("50", value: Binding<Int>(get: { m.maxN }, set: { (v: Int) in m.setMax(v) }), format: .number)
                            .font(PF.mono(14, bold: false)).foregroundStyle(p.ink)
                            .keyboardType(.numberPad)
                            .frame(width: 72).padding(.horizontal, 10).frame(minHeight: 44)
                            .background(p.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .accessibilityLabel("Antall spor")
                        Text("spor").font(PF.ui(13)).foregroundStyle(p.mut)
                    }
                }
                .accessibilityElement(children: .contain)
            }
        }
    }

    private var followToggle: some View {
        Toggle(isOn: Binding<Bool>(get: { m.follow }, set: { (v: Bool) in m.follow = v })) {
            Text("Følg spillelisten (nye sanger lastes ned automatisk)").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tint(p.pos)
        .frame(minHeight: 44)
    }
}

/* ---------- Kort 2: Køen ---------- */

struct Mu88Queue: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Musikk88 { Musikk88.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Køen").font(PF.serif(22, medium: true)).foregroundStyle(p.ink).accessibilityAddTraits(.isHeader)
                Spacer(minLength: 4)
                if m.hasDone { Nrk87Small(text: "Fjern ferdige", color: p.ink) { m.clean(store) } }
            }
            if !m.err.isEmpty {
                Text(m.err).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
            if !m.aerr.isEmpty {
                Text(m.aerr).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
            if m.jobs.isEmpty {
                Text("Ingenting i køen.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.vertical, 8)
            }
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(m.jobs.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Mu88Job)) in
                    if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Mu88JobRow(j: pair.element)
                }
            }
        }
        .modifier(Nrk87Card())
    }
}

struct Mu88JobRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Musikk88 { Musikk88.shared }
    let j: Mu88Job

    var body: some View {
        let c: Color = Mu88Tint.job(j.status, p)
        let parts: [String] = [j.info?.title ?? "", j.info?.artist ?? ""].filter { !$0.isEmpty }
        let title: String = parts.isEmpty ? (j.url.isEmpty ? "Ukjent" : j.url) : parts.joined(separator: " – ")
        let bar: Bool = !j.done && j.status != "pending"
        HStack(alignment: .top, spacing: 12) {
            Mu88Cover(url: j.info?.image ?? "", title: title, size: 48)
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top, spacing: 8) {
                    Text(title).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(2)
                    Spacer(minLength: 4)
                    Nrk87Chip(text: Musikk88.statusText(j.status), color: c)
                }
                if bar {
                    GeometryReader { (g: GeometryProxy) in
                        ZStack(alignment: .leading) {
                            Capsule().fill(p.line)
                            Capsule().fill(c).frame(width: g.size.width * CGFloat(j.progress / 100))
                        }
                    }
                    .frame(height: 4)
                    .accessibilityElement()
                    .accessibilityLabel("Fremdrift")
                    .accessibilityValue("\(Int(j.progress.rounded())) prosent")
                }
                HStack(spacing: 8) {
                    Text(Musikk88.jobLine(j)).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).lineLimit(2)
                    Spacer(minLength: 4)
                    Text(j.auto ? "Automatisk" : "Manuell").font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut)
                }
                HStack(spacing: 8) {
                    if j.done {
                        Nrk87Small(text: "Fjern", color: p.mut) { m.act(j, "fjern", store) }
                    } else {
                        Nrk87Small(text: "Avbryt", color: p.lab) { m.act(j, "avbryt", store) }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.vertical, 10)
    }
}

/* ---------- Kort 3: Spillelister du følger ---------- */

struct Mu88Subs: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Musikk88 { Musikk88.shared }

    var body: some View {
        let plan: String = m.plan
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Spillelister du følger").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                Spacer(minLength: 4)
                if !m.subs.isEmpty {
                    Nrk87Small(text: m.syncing == "alle" ? "Synker …" : "Synk alle", color: p.ink) { m.sync(nil, store) }
                        .disabled(!m.syncing.isEmpty)
                }
            }
            if !plan.isEmpty {
                Text(plan).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            if m.subs.isEmpty {
                Text("Du følger ingen spillelister.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.vertical, 8)
            }
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(m.subs.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Mu88Sub)) in
                    if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Mu88SubRow(s: pair.element)
                }
            }
        }
        .modifier(Nrk87Card())
    }
}

struct Mu88SubRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Musikk88 { Musikk88.shared }
    let s: Mu88Sub

    var body: some View {
        let open: Bool = m.open == s.id
        VStack(alignment: .leading, spacing: 6) {
            // Trykk på raden åpner sangene (én liste om gangen).
            Button { m.expand(s, store) } label: {
                HStack(alignment: .center, spacing: 12) {
                    Mu88Cover(url: s.image, title: s.name, size: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(s.name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(2).multilineTextAlignment(.leading)
                        Text(m.subLine(s)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: open ? "chevron.down" : "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(p.mut)
                        .accessibilityHidden(true)
                }
                .frame(minHeight: 56)
                .contentShape(Rectangle())
                .opacity(s.enabled ? 1 : 0.6)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint(open ? "Skjuler sangene" : "Viser sangene")
            HStack(spacing: 8) {
                Toggle(isOn: Binding<Bool>(get: { s.enabled }, set: { (_: Bool) in m.toggle(s, store) })) {
                    Text("Automatisk").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
                }
                .labelsHidden()
                .tint(p.pos)
                .disabled(m.toggling == s.id)
                .frame(minHeight: 44)
                .accessibilityLabel(s.enabled ? "Automatisk synk er på" : "Automatisk synk er av")
                Nrk87Small(text: m.syncing == s.id ? "Synker …" : "Synk nå", color: p.ink) { m.sync(s, store) }
                    .disabled(!m.syncing.isEmpty)
                Nrk87Small(text: "Slutt å følge", color: p.lab) { m.unfollow(s, store) }
                Spacer(minLength: 0)
            }
            if open { Mu88TrackList(id: s.id) }
        }
        .padding(.vertical, 10)
    }
}

/// Sangene i en spilleliste: oppsummering + liste, eller «Sanglista er ikke tilgjengelig fra yubal».
struct Mu88TrackList: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Musikk88 { Musikk88.shared }
    let id: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let t = m.tracks[id] {
                Text(Musikk88.trackSummary(t)).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                if t.tracks.isEmpty {
                    Text(t.message.isEmpty ? "Sanglista er ikke tilgjengelig fra yubal" : t.message)
                        .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(t.tracks) { (x: Mu88Track) in
                            row(x)
                        }
                    }
                }
            } else if let e = m.tracksErr[id] {
                Text(e).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                Nrk87Small(text: "Prøv igjen", color: p.ink) { Task { await m.loadTracks(id, store) } }
            } else {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Henter sangene …").font(PF.ui(13)).foregroundStyle(p.mut)
                }
            }
        }
        .padding(12)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func row(_ x: Mu88Track) -> some View {
        let st: String = Musikk88.trackText(x.status)
        let dur: String = Musikk88.mmss(x.duration)
        return HStack(alignment: .center, spacing: 8) {
            Text("\(x.id + 1)").font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).frame(width: 26, alignment: .trailing)
            VStack(alignment: .leading, spacing: 1) {
                Text(x.title).font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1)
                if !x.artist.isEmpty { Text(x.artist).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1) }
            }
            Spacer(minLength: 4)
            if !dur.isEmpty { Text(dur).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut) }
            if !st.isEmpty { Nrk87Chip(text: st, color: Mu88Tint.track(x.status, p)) }
        }
        .frame(minHeight: 40)
        .accessibilityElement(children: .combine)
    }
}
