import SwiftUI
import UIKit

/* ---------------- Prompt 35: Innstillinger → GLIMT → Glimt (og ⚙ i briefen) ----------------
   Fasit: design/Glimt Brief.dc.html (mode="settings") og Mobil Papir App.dc.html → Innstillinger: gruppen GLIMT → «Glimt ›»
   (fullskjerm med Ferdig). prompts/prompt-35-pakke/claude-code-innst-glimt.md.
   1. GLIMT-FIGUR: alle 13 figurer, animerte. Valgt har rød ramme og er glad. Trykk velger og sier «Hei! Nå er jeg din Glimt.»
   2. Brytere: Glimt-brief · Les opp · Vis meg rundt automatisk · Venner av Glimt · Varsel når briefen er klar.
   3. BRIEFER GJENNOM DAGEN: Morgen, Dag, Kveld og Natt med klokkeslett og av/på.
   4. STEMMEMOTOR: OpenAI (anbefalt) · ElevenLabs · Azure nb-NO · Systemstemmen. Nøkler: bare admin, lagres på serveren.
   5. STEMME: Nora · Henrik · Lys med «▶ Hør», Tempo og Språk for opplesning.
   6. «Modeller, nøkler og forbruk ligger under AI ›». */

/// Figuren med animasjon. «Reduser bevegelse»: stillestående (ingen svev, hopp eller spinn).
struct Glimt35Live: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let id: String
    let size: CGFloat
    var mood: Glimt35Mood = .idle

    var body: some View {
        Group {
            if reduce {
                Glimt35Fig(id: id, size: size, mood: mood, still: true)
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                    Glimt35Fig(id: id, size: size, mood: mood, t: ctx.date.timeIntervalSinceReferenceDate)
                }
            }
        }
        .frame(width: size, height: size * Glimt35Fig.heightFactor(id), alignment: .topLeading)
    }
}

/// Fullskjermen fra Innstillinger (legges i PaperShell ved siden av brief34Host).
struct Glimt35Host: ViewModifier {
    let p: PaperPalette
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.showPage }, set: { (v: Bool) in m.showPage = v })) {
                Glimt35Page(close: { Haptic34.back(); m.showPage = false })
                    .environment(\.paper, p)
                    .edgeSwipeClose30 { m.showPage = false }
            }
    }
}

extension View {
    func glimt35Host(_ p: PaperPalette) -> some View { modifier(Glimt35Host(p: p)) }
}

/// Siden: tittel + Ferdig og innholdet.
struct Glimt35Page: View {
    @Environment(Store.self) private var store
    let close: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            Brief34C.paper.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("INNSTILLINGER · GLIMT").font(PF.mono(10.5)).tracking(1.4).foregroundStyle(Brief34C.red)
                            Text("Glimt").font(PF.serif(34, medium: true)).foregroundStyle(Brief34C.ink)
                        }
                        Spacer(minLength: 8)
                        Glimt35DoneButton(title: "Ferdig", act: close)
                    }
                    Text("Figur, brief, stemme og venner").font(PF.ui(13)).foregroundStyle(Brief34C.mut)
                    Glimt35SettingsContent()
                }
                .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 60)
            }
            Glimt35Flash()
        }
        .environment(\.colorScheme, .light)
        .task { await Glimt35Model.shared.load(store) }
    }
}

struct Glimt35DoneButton: View {
    let title: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(13.5, .bold)).foregroundStyle(Brief34C.paper)
                .padding(.horizontal, 18).frame(height: 36)
                .background(Brief34C.ink, in: Capsule())
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct Glimt35Flash: View {
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        VStack {
            Spacer(minLength: 0)
            if !m.flashText.isEmpty {
                Text(m.flashText).font(PF.ui(13, .bold)).foregroundStyle(Brief34C.paper)
                    .padding(.horizontal, 16).frame(height: 38)
                    .background(Brief34C.ink, in: Capsule())
                    .transition(.opacity.combined(with: .offset(y: 8)))
                    .padding(.bottom, 30)
            }
        }
        .animation(.easeOut(duration: 0.2), value: m.flashText)
        .allowsHitTesting(false)
    }
}

/// Felles innhold for siden og ⚙-arket i briefen.
struct Glimt35SettingsContent: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Glimt35Label(text: "GLIMT-FIGUR")
            Glimt35FigGrid()
            Text("Figuren er verten i briefen, på Hjem-kortet, i widgets og i Glimt-chat. Vennene (Sky, Dråpe, Ugle …) tar over når temaet passer, om det er slått på under.")
                .font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
            // Prompt 40: Julemodus rett under figurvalget og teksten om vennene, før Glimt-brief-bryteren (Glimt40Settings.swift).
            Glimt40JulCard()
            // Prompt 41: Høytider → 17. mai (Automatisk / Vis nå / Av).
            Mai17Settings41()
            Glimt35Toggles()
            Glimt35Label(text: "BRIEFER GJENNOM DAGEN").padding(.top, 4)
            Glimt35Briefs()
            // Prompt 38: kortene i briefen – av/på og rekkefølge (cards[{id, on}], Brief38.swift).
            Glimt35Label(text: "KORT I BRIEFEN").padding(.top, 4)
            Brief38CardsSettings()
            // Prompt 37: Bibelvers (på/av i morgen- og kveldsbrief, varsel) – bare for brukere med modulen.
            Bible37SettingsBlock().padding(.top, 4)
            // Prompt 47: KVITTERINGER → «Tolk kvitteringer på iPhone» (Foundation Models, bare iOS 26+, Receipt47Views.swift).
            Receipt47Settings()
            Glimt35Label(text: "STEMMEMOTOR").padding(.top, 4)
            Glimt35Engines()
            Glimt35Label(text: "STEMME").padding(.top, 4)
            Glimt35Voices()
            Glimt35AiLink()
        }
    }
}

struct Glimt35Label: View {
    let text: String

    var body: some View {
        Text(text).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(Brief34C.mut2)
    }
}

/* ---------- Figurvelgeren ---------- */

struct Glimt35FigGrid: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        let cols: [GridItem] = [GridItem(.adaptive(minimum: 96), spacing: 8)]
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: cols, spacing: 8) {
                ForEach(Glimt35Char.all) { (c: Glimt35Char) in
                    Glimt35FigCell(c: c, on: m.cfg.char == c.id) { m.choose(c.id, store) }
                }
            }
            if !m.greeted.isEmpty {
                Text(Glimt35Char.hello(m.greeted)).font(PF.ui(13, .bold)).foregroundStyle(Brief34C.paper)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(Brief34C.ink, in: Capsule())
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: m.greeted)
    }
}

struct Glimt35FigCell: View {
    let c: Glimt35Char
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            VStack(spacing: 6) {
                // Prompt 40: figurvelgeren viser figurene uten julepynt (noJul).
                Glimt35Live(id: c.id, size: 50, mood: on ? .glad : .idle)
                    .glimt40NoJul()
                    .frame(height: 62)
                Text(c.name).font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 12).padding(.bottom, 10).padding(.horizontal, 6)
            .background(on ? Brief34C.card : Brief34C.rgb(0xefe9dc, 0.6), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(on ? Brief34C.red : Color.clear, lineWidth: 2))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(c.full + (on ? ", valgt" : ""))
    }
}

/* ---------- Brytere ---------- */

struct Glimt35Toggles: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        let c: Glimt35Cfg = m.cfg
        VStack(spacing: 0) {
            row("brief", "Glimt-brief", "Lag briefer gjennom dagen", c.brief)
            // Prompt 39: Glimt (figuren) i briefen kan slås av. Venner av Glimt gråes ut når den er av.
            row("briefGlimt", "Glimt i briefen", "Vis Glimt-figuren og vennene i briefen, på Hjem-kortet og i widgets", c.briefGlimt)
            row("readAloud", "Les opp", "Glimt og vennene leser briefen høyt", c.readAloud)
            row("guide", "Vis meg rundt automatisk", "Starter guide-runden når briefen åpnes", c.guide)
            row("friends", "Venner av Glimt", "Sky, Dråpe og Ugle tar over når temaet passer", c.friends)
                .opacity(c.briefGlimt ? 1 : 0.45)
                .disabled(!c.briefGlimt)
            row("notify", "Varsel når briefen er klar", "Push til mobilen på klokkeslettet", c.notify)
        }
        .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
    }

    private func row(_ key: String, _ name: String, _ sub: String, _ on: Bool) -> some View {
        Glimt35ToggleRow(name: name, sub: sub, on: on) { m.setBool(key, !on, store) }
    }
}

struct Glimt35ToggleRow: View {
    let name: String
    let sub: String
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink)
                    Text(sub).font(PF.ui(12)).foregroundStyle(Brief34C.mut)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Glimt35Switch(on: on)
            }
            .padding(.vertical, 12)
            .overlay(alignment: .bottom) { Rectangle().fill(Brief34C.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(on ? "På" : "Av")
    }
}

/// Bryteren fra fasiten (44 × 26, grønn #2f7a4f når på).
struct Glimt35Switch: View {
    let on: Bool

    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule().fill(on ? Brief34C.rgb(0x2f7a4f) : Brief34C.rgb(0xddd5c5))
            Circle().fill(Color.white).frame(width: 20, height: 20)
                .shadow(color: Color.black.opacity(0.2), radius: 1.5, y: 1)
                .padding(3)
        }
        .frame(width: 44, height: 26)
        .animation(.easeOut(duration: 0.2), value: on)
    }
}

/* ---------- Briefer gjennom dagen ---------- */

struct Glimt35Briefs: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    static let rows: [(String, String, String)] = [
        ("morning", "Morgenbrief", "Vær, dagen og første avtale"),
        ("day", "Dagsbrief", "Resten av dagen og nyheter"),
        ("evening", "Kveldsbrief", "I morgen, vær og det du ikke rakk"),
        ("night", "Nattbrief", "Kort oppsummering før du legger deg"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Glimt35Briefs.rows, id: \.0) { (r: (String, String, String)) in
                Glimt35SlotRow(key: r.0, name: r.1, sub: r.2, slot: m.cfg.slot(r.0), dim: !m.cfg.brief)
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
    }
}

struct Glimt35SlotRow: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }
    let key: String
    let name: String
    let sub: String
    let slot: Glimt35Slot
    let dim: Bool

    var body: some View {
        HStack(spacing: 12) {
            Button { m.setSlot(key, Glimt35Slot(on: !slot.on, at: slot.at), store) } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink)
                    Text(sub).font(PF.ui(12)).foregroundStyle(Brief34C.mut)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            DatePicker("", selection: timeBinding, displayedComponents: .hourAndMinute)
                .labelsHidden()
                .datePickerStyle(.compact)
                .environment(\.locale, Locale(identifier: "nb_NO"))
            Button { m.setSlot(key, Glimt35Slot(on: !slot.on, at: slot.at), store) } label: {
                Glimt35Switch(on: slot.on)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(name)
            .accessibilityValue(slot.on ? "På" : "Av")
        }
        .padding(.vertical, 10)
        .opacity(dim ? 0.45 : 1)
        .overlay(alignment: .bottom) { Rectangle().fill(Brief34C.line).frame(height: 1) }
    }

    private var timeBinding: Binding<Date> {
        Binding<Date>(get: { Glimt35SlotRow.date(slot.at) }, set: { (d: Date) in
            let hm: String = JS.fmt(d, "HH:mm")
            if hm != slot.at { m.setSlot(key, Glimt35Slot(on: slot.on, at: hm), store) }
        })
    }

    static func date(_ hm: String) -> Date {
        let p: [Int] = hm.split(separator: ":").compactMap { Int($0) }
        let h: Int = p.count > 0 ? p[0] : 7
        let mi: Int = p.count > 1 ? p[1] : 0
        return Calendar.current.date(bySettingHour: h, minute: mi, second: 0, of: Date()) ?? Date()
    }
}

/* ---------- Stemmemotor ---------- */

struct Glimt35EngInfo {
    let id: String
    let name: String
    let sub: String
    let tag: String
    let tagBg: UInt32
    let tagFg: UInt32
    let keyLabel: String
    let placeholder: String
    let link: String

    static let all: [Glimt35EngInfo] = [
        Glimt35EngInfo(id: "openai", name: "OpenAI · gpt-4o-mini-tts", sub: "Nesten menneskelig. Følger instruks om tone og følelse.", tag: "ANBEFALT",
                       tagBg: 0xe3efe6, tagFg: 0x2f7a4f, keyLabel: "OpenAI API-nøkkel", placeholder: "sk-…", link: "https://platform.openai.com/api-keys"),
        Glimt35EngInfo(id: "elevenlabs", name: "ElevenLabs · Multilingual v2", sub: "Mest naturlig og uttrykksfull. Kan klone en egen stemme.", tag: "BEST",
                       tagBg: 0xfbeee8, tagFg: 0xb23a2a, keyLabel: "ElevenLabs API-nøkkel", placeholder: "xi-…", link: "https://elevenlabs.io/app/settings/api-keys"),
        Glimt35EngInfo(id: "azure", name: "Azure · nb-NO Neural (Pernille, Finn, Iselin)", sub: "Ekte norske stemmer med riktig tonelag.", tag: "NORSK",
                       tagBg: 0xe6eef4, tagFg: 0x2b5d8a, keyLabel: "Azure Speech-nøkkel", placeholder: "nøkkel", link: "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices"),
        Glimt35EngInfo(id: "browser", name: "Systemstemmen", sub: "Robotaktig. Bare for testing uten nøkkel.", tag: "",
                       tagBg: 0, tagFg: 0, keyLabel: "", placeholder: "", link: ""),
    ]
}

struct Glimt35Engines: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        let cur: String = m.cfg.engine
        let admin: Bool = Update28Model.isAdmin(store)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Glimt35EngInfo.all, id: \.id) { (e: Glimt35EngInfo) in
                Glimt35EngineRow(e: e, on: cur == e.id, status: status(e.id)) { m.setTts("engine", e.id, store) }
            }
            if let info = Glimt35EngInfo.all.first(where: { $0.id == cur }), !info.keyLabel.isEmpty {
                if admin {
                    Glimt35KeyField(e: info)
                } else {
                    Text("Bare administrator kan legge inn nøkler. Du ser statusen.").font(PF.ui(12.5)).foregroundStyle(Brief34C.mut)
                }
            }
            Text(note(cur)).font(PF.ui(12)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func status(_ id: String) -> String {
        guard let e = m.cfg.engines.first(where: { $0.id == id || ($0.id == "eleven" && id == "elevenlabs") }) else { return "" }
        if id == "browser" { return "" }
        if e.ready { return e.tail.isEmpty ? "Klar" : "Klar · nøkkel ••••" + e.tail }
        return e.keySet ? "Nøkkel satt, svarer ikke" : "Mangler nøkkel"
    }

    private func note(_ id: String) -> String {
        if id == "browser" { return "Telefonens innebygde stemme. Bare for testing." }
        return "Nøkkelen ligger kryptert på serveren (AI-kontroll → API og nøkler), og lyden caches i 30 dager. Mangler motoren nøkkel, brukes telefonens stemme."
    }
}

struct Glimt35EngineRow: View {
    let e: Glimt35EngInfo
    let on: Bool
    let status: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(e.name).font(PF.ui(14, .bold)).foregroundStyle(Brief34C.ink).lineLimit(2)
                    if !e.tag.isEmpty {
                        Text(e.tag).font(PF.mono(10)).foregroundStyle(Brief34C.rgb(e.tagFg))
                            .padding(.horizontal, 7).padding(.vertical, 1)
                            .background(Brief34C.rgb(e.tagBg), in: Capsule())
                    }
                }
                Text(e.sub).font(PF.ui(12)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
                if !status.isEmpty {
                    Text(status).font(PF.ui(11.5, .bold)).foregroundStyle(status.hasPrefix("Klar") ? Brief34C.rgb(0x2f7a4f) : Brief34C.rgb(0xa8661a))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(on ? Brief34C.ink : Brief34C.line, lineWidth: 1.5))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct Glimt35KeyField: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }
    let e: Glimt35EngInfo
    @State private var key: String = ""
    @State private var region: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(e.keyLabel).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut)
                Spacer()
                if let u = URL(string: e.link) {
                    Link(destination: u) { Text("Hent nøkkel ↗").font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.red) }
                }
            }
            HStack(spacing: 8) {
                SecureField(e.placeholder, text: $key)
                    .font(PF.mono(13.5, bold: false))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12).frame(height: 44)
                    .background(Brief34C.rgb(0xf7f3ea), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Brief34C.rgb(0xddd5c5), lineWidth: 1))
                Button {
                    m.saveKey(e.id, key, region: region, store)
                    key = ""
                } label: {
                    Text("Lagre").font(PF.ui(13, .bold)).foregroundStyle(Brief34C.paper)
                        .padding(.horizontal, 14).frame(height: 44)
                        .background(Brief34C.ink, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(key.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if e.id == "azure" {
                TextField("Region (f.eks. norwayeast)", text: $region)
                    .font(PF.mono(13.5, bold: false))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(Brief34C.rgb(0xf7f3ea), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }
}

/* ---------- Stemme, tempo og språk ---------- */

struct Glimt35Voices: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        let c: Glimt35Cfg = m.cfg
        VStack(alignment: .leading, spacing: 10) {
            VStack(spacing: 6) {
                ForEach(Glimt35Voice.voices, id: \.0) { (v: (String, String, String, Double, Double)) in
                    Glimt35VoiceRow(id: v.0, name: v.1, sub: v.2, on: c.voice == v.0)
                }
            }
            Glimt35Segment(title: "Tempo", value: rateName(c.rate), options: [("calm", "Rolig"), ("normal", "Normal"), ("fast", "Rask")], selected: c.rate) { (k: String) in
                m.setTts("rate", k, store)
            }
            Glimt35Segment(title: "Språk for opplesning", value: c.lang == "en" ? "English" : "Norsk", options: [("no", "Norsk"), ("en", "English")], selected: c.lang) { (k: String) in
                m.setTts("lang", k, store)
            }
        }
    }

    private func rateName(_ r: String) -> String {
        switch r {
        case "calm": return "×0,85"
        case "fast": return "×1,15"
        default: return "×1"
        }
    }
}

struct Glimt35VoiceRow: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }
    let id: String
    let name: String
    let sub: String
    let on: Bool

    var body: some View {
        HStack(spacing: 12) {
            Button { m.setTts("voice", id, store) } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(14, .bold)).foregroundStyle(Brief34C.ink)
                    Text(sub).font(PF.ui(12)).foregroundStyle(Brief34C.mut)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button {
                if !on { m.setTts("voice", id, store) }
                let text: String = m.cfg.lang == "en" ? "Hi, I'm Glimt. This is how I sound." : "Hei, jeg er Glimt. Slik høres jeg ut."
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 60_000_000)
                    Glimt35Voice.shared.say(text, char: "glimt", store, force: true)
                }
            } label: {
                Text("▶ Hør").font(PF.ui(12, .bold)).foregroundStyle(Brief34C.ink)
                    .padding(.horizontal, 12).frame(height: 30)
                    .background(Brief34C.rgb(0xefe9dc), in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(on ? Brief34C.ink : Brief34C.line, lineWidth: 1.5))
    }
}

struct Glimt35Segment: View {
    let title: String
    let value: String
    let options: [(String, String)]
    let selected: String
    let pick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title).font(PF.ui(13, .bold)).foregroundStyle(Brief34C.ink)
                Spacer()
                Text(value).font(PF.mono(12)).foregroundStyle(Brief34C.ink)
            }
            HStack(spacing: 2) {
                ForEach(options, id: \.0) { (o: (String, String)) in
                    let on: Bool = o.0 == selected
                    Button { pick(o.0) } label: {
                        Text(o.1).font(PF.ui(12, .bold)).foregroundStyle(on ? Brief34C.ink : Brief34C.mut)
                            .frame(maxWidth: .infinity).frame(height: 30)
                            .background(on ? Brief34C.card : Color.clear, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3)
            .background(Brief34C.rgb(0xefe9dc), in: Capsule())
        }
    }
}

struct Glimt35AiLink: View {
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        Button {
            Haptic34.light()
            m.showPage = false
            Brief34Model.shared.open = false
            AiCtl34.shared.show("api")
        } label: {
            Text("Modeller, nøkler og forbruk ligger under AI ›").font(PF.ui(13.5, .bold)).foregroundStyle(Brief34C.red)
                .frame(maxWidth: .infinity).frame(height: 44)
                .overlay(Capsule().strokeBorder(Brief34C.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
    }
}

/// ⚙ i briefen: samme innhold som et ark.
struct Glimt35SettingsSheet: View {
    let close: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            Brief34C.paper.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Brief-innstillinger").font(PF.serif(26, medium: true)).foregroundStyle(Brief34C.ink)
                        Spacer(minLength: 8)
                        Glimt35DoneButton(title: "Ferdig", act: close)
                    }
                    Glimt35SettingsContent()
                }
                .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 50)
            }
            Glimt35Flash()
        }
        .environment(\.colorScheme, .light)
    }
}
