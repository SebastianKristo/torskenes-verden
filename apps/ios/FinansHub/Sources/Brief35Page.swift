import SwiftUI
import UIKit

/* ---------------- Prompt 35: Glimt-briefen med Glimt og venner, opplesning, nyheter med bilder og prøveperioder ----------------
   Fasit: design/Glimt Brief.dc.html (isPage) og prompts/prompt-35-pakke/claude-code-glimt-brief.md + claude-code-glimt-figurer.md.
   Bygger på prompt 34 (Brief34Model: lasting, steg og widget-cache; Brief34Weather / Brief34Calendar).
   Toppen: «GLIMT · KVELDSBRIEF», høyttaler (Les opp av/på), ⚙ (samme innstillinger som Innstillinger → Glimt) og Ferdig.
   Mens noen snakker: mørk pille «▮▮▮ Sky snakker · Nora · Stopp».
   Guide-runden: Glimt (verten, eller brukerens figur; Natt 21–06) åpner, Sky/Dråpe tar været, Ugle kalenderen, Gris prøveperiodene
   og Glimt nyhetene. Ved hvert bytte spretter den nye figuren inn (gbPop 0,45 s) og boblen viser hvem som snakker.
   Serveren kan sende guide[] (med textEn) og host; ellers bygges runden her etter samme mal som fasiten.
   Nyheter: toppsak med stort bilde (16:9) og ingress + 6 saker med miniatyr (76 × 56). Bildene hentes via /api/img (cache).
   Abonnementer: rosa kort når en prøve slutter innen 7 dager, med «✓ Jeg har avsluttet …» og «Åpne Abonnement ›». */

enum Brief35Guide {
    private static func cap(_ s: String) -> String {
        guard let f = s.first else { return s }
        return String(f).uppercased() + String(s.dropFirst())
    }

    private static func en(_ cond: String) -> String {
        let m: [String: String] = ["klart": "clear", "lettskyet": "partly cloudy", "skyet": "cloudy", "regn": "rain", "snø": "snow"]
        return m[cond.lowercased()] ?? cond
    }

    /// Runden fra serveren (guide[]), ellers lokal mal (G0 i fasiten).
    static func steps(_ b: Brief34, _ x: Brief35Extra, _ cfg: Glimt35Cfg) -> [Brief35Step] {
        let host: String = x.host.isEmpty || !Glimt35Char.valid(x.host) ? cfg.host : x.host
        if x.guide.count >= 2 {
            return x.guide.map { (s: Brief35Step) -> Brief35Step in
                var o: Brief35Step = s
                if o.char.isEmpty || !Glimt35Char.valid(o.char) || !cfg.friends { o.char = host }
                return o
            }
        }
        return local(b, x, cfg, host: host)
    }

    static func local(_ b: Brief34, _ x: Brief35Extra, _ cfg: Glimt35Cfg, host: String) -> [Brief35Step] {
        let wet: Bool = b.wet35
        let wch: String = wet ? "drape" : "sky"
        let wn: String = wet ? "Dråpe" : "Sky"
        let soon: String = b.rainSoon35
        let cond: String = b.cond.isEmpty ? "været" : b.cond
        let temp: String = b.temp.isEmpty ? "" : ", " + b.temp + " nå"
        var out: [Brief35Step] = []
        out.append(Brief35Step(target: "", char: host, text: "Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din? Vennene mine hjelper til.",
                               textEn: "Hi! I'm Glimt. Shall I show you your day? My friends will help.", action: "Vis meg"))
        let wTail: String = wet ? " Jeg drypper litt, så ta med paraply!" : " Søylene viser nedbøren time for time."
        let wTailEn: String = wet ? " I'm dripping a bit, so bring an umbrella!" : " The bars show rain hour by hour."
        let soonDigits: String = soon.filter { (ch: Character) -> Bool in ch.isNumber }
        let rLater: String = "rain from about " + soonDigits + ":00"
        let rNow: String = soon == "regn nå" ? "raining now" : rLater
        let rEn: String = soon.hasPrefix("opphold") ? "dry for the next 12 hours" : rNow
        let tEn: String = b.temp.isEmpty ? "" : ", " + b.temp + " right now"
        let wHead: String = "Hei, det er " + wn + "! " + cap(cond)
        let wText: String = wHead + temp + " og " + soon + "." + wTail
        let wHeadEn: String = "Hi, it's " + (wet ? "Drop" : "Sky") + "! " + cap(en(cond))
        let wTextEn: String = wHeadEn + tEn + ", and " + rEn + "." + wTailEn
        out.append(Brief35Step(target: "vaer", char: wch, text: wText, textEn: wTextEn, action: "Takk, " + wn))
        if !wet && !b.sunset.isEmpty {
            out.append(Brief35Step(target: "vaer", char: "sky", text: "Sky her igjen: sola går ned " + b.sunset + ". Nå tar Glimt over!",
                                   textEn: "Sky again: the sun sets at " + b.sunset + ". Back to Glimt!", action: "Neste"))
        }
        let kal: String
        let kalEn: String
        if let e = b.next {
            let tomorrow: Bool = e.day == "i morgen"
            kal = "Uhu, Ugle her med kalenderen. " + e.title + " " + (tomorrow ? "i morgen" : "i dag") + " kl. " + e.time + ". Trykk på en avtale for å åpne Kalender."
            kalEn = "Hoo, Owl here with your calendar. " + e.title + " " + (tomorrow ? "tomorrow" : "today") + " at " + e.time + ". Tap an event to open Calendar."
        } else {
            kal = "Uhu, Ugle her med kalenderen. Kalenderen din er helt fri."
            kalEn = "Hoo, Owl here with your calendar. Your calendar is completely free."
        }
        out.append(Brief35Step(target: "kal", char: "ugle", text: kal, textEn: kalEn, action: "Neste"))
        if let t = x.trials.first, t.daysLeft <= 7 {
            let when: String = t.daysLeft <= 0 ? "i dag" : (t.daysLeft == 1 ? "i morgen" : "om " + String(t.daysLeft) + " dager")
            let whenEn: String = t.daysLeft <= 0 ? "today" : (t.daysLeft == 1 ? "tomorrow" : "in " + String(t.daysLeft) + " days")
            let txt: String = "Nøff! Gris her. Prøveperioden på " + t.service + " slutter " + when + ". Husk å avslutte den før " + t.endsLabel + ", ellers koster den " + t.priceNumber + " kroner i måneden."
            let txtEn: String = "Oink! Piggy here. Your " + t.service + " trial ends " + whenEn + ". Remember to cancel it, or it will cost " + t.priceNumber + " kroner a month."
            out.append(Brief35Step(target: "abo", char: "gris", text: txt, textEn: txtEn, action: "Takk, Gris"))
        }
        out.append(Brief35Step(target: "nyh", char: host, text: "Glimt igjen! Her er de viktigste nyhetene. Trykk for å lese hele.",
                               textEn: "Glimt again! Here are the top stories. Tap to read more.", action: "Neste"))
        out.append(Brief35Step(target: "", char: host, text: "Det var alt for nå. Trykk på meg når du vil ha en ny runde.",
                               textEn: "That's all for now. Tap me whenever you want another round.", action: "Takk, Glimt"))
        if cfg.friends { return out }
        return out.map { (s: Brief35Step) -> Brief35Step in withoutFriends(s, host: host) }
    }

    /// «Venner av Glimt» av: bare verten snakker, og tekstene skrives om uten vennene.
    static func withoutFriends(_ s: Brief35Step, host: String) -> Brief35Step {
        var o: Brief35Step = s
        o.char = host
        let pre: [(String, String)] = [("Hei, det er Sky! ", "Været: "), ("Hei, det er Dråpe! ", "Været: "), ("Sky her igjen: ", ""),
                                       ("Uhu, Ugle her med kalenderen. ", "I kalenderen: "), ("Nøff! Gris her. ", ""), ("Glimt igjen! ", ""),
                                       ("Hi, it's Sky! ", "The weather: "), ("Hi, it's Drop! ", "The weather: "), ("Sky again: ", ""),
                                       ("Hoo, Owl here with your calendar. ", "Your calendar: "), ("Oink! Piggy here. ", ""), ("Glimt again! ", "")]
        for (a, b) in pre {
            o.text = o.text.replacingOccurrences(of: a, with: b)
            o.textEn = o.textEn.replacingOccurrences(of: a, with: b)
        }
        let tails: [String] = [" Nå tar Glimt over!", " Nå gir vi ordet tilbake til Glimt!", " Back to Glimt!", " Jeg drypper litt, så ta med paraply!"]
        for t in tails {
            o.text = o.text.replacingOccurrences(of: t, with: t.contains("paraply") ? " Ta med paraply!" : "")
            o.textEn = o.textEn.replacingOccurrences(of: t, with: "")
        }
        if o.action.hasPrefix("Takk, ") && o.action != "Takk, Glimt" { o.action = "Neste" }
        return o
    }
}

/* ---------- Siden ---------- */

struct Brief35Page: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    @MainActor private var v: Glimt35Voice { Glimt35Voice.shared }
    @State private var cfgOpen: Bool = false

    var body: some View {
        let b: Brief34 = m.brief ?? Brief34()
        let steps: [Brief35Step] = Brief35Guide.steps(b, g.extra, g.cfg)
        let idx: Int = Swift.min(Swift.max(0, m.step - 1), steps.count - 1)
        let target: String = m.step > 0 ? steps[idx].target : ""
        GeometryReader { (geo: GeometryProxy) in
        ZStack(alignment: .bottomTrailing) {
            LinearGradient(stops: [.init(color: Brief34C.rgb(0xe6ecef), location: 0), .init(color: Brief34C.paper, location: 0.46)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            // Prompt 40: snøfall i julemodus når det snør eller er minus (blåhvite fnugg mot den lyse bakgrunnen).
            if Glimt40Weather.briefSnowy(b) {
                Glimt40Snow(count: 14, color: Brief34C.rgb(0x9fb6cc)).ignoresSafeArea()
            }
            ScrollViewReader { (proxy: ScrollViewProxy) in
                ScrollView(.vertical, showsIndicators: false) {
                    // Prompt 36: fast bredde – innholdet er låst til skjermbredden, så siden aldri kan dras sideveis.
                    Brief35Content(b: b, target: target, openCfg: { cfgOpen = true })
                        .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 190)
                        .frame(width: geo.size.width)
                        .clipped()
                }
                .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
                .frame(width: geo.size.width)
                .refreshable {
                    await m.load(store, force: true)
                    g.refreshExtra()
                }
                .onChange(of: target) { (_: String, t: String) in
                    if t.isEmpty { return }
                    withAnimation(.easeInOut(duration: 0.4)) { proxy.scrollTo("gb35-" + t, anchor: UnitPoint(x: 0.5, y: 0.16)) }
                }
            }
            // Figuren og boblen ligger i et eget lag utenfor scroll-innholdet, med fast bredde.
            // Prompt 39: «Glimt i briefen» av → ingen figur, ingen snakkebobler og ingen guide-runde.
            if g.cfg.briefGlimt {
                Brief35GuideView(steps: steps, idx: idx, target: target)
                    .padding(.horizontal, 16).padding(.bottom, 20)
                    .frame(width: geo.size.width, alignment: .bottomTrailing)
            }
            // Prompt 38: korte beskjeder (f.eks. «Kjøp gave til … ligger i Gjøremål»).
            Glimt35Flash().frame(width: geo.size.width).padding(.bottom, 120)
        }
        .frame(width: geo.size.width, height: geo.size.height)
        }
        .environment(\.colorScheme, .light)
        .sheet(isPresented: $cfgOpen) {
            Glimt35SettingsSheet(close: { cfgOpen = false })
                .presentationDetents([.large])
        }
        // Prompt 37: Vær som fullskjerm over briefen (rot-dekket i PaperShell er av mens briefen er åpen).
        .fullScreenCover(isPresented: Binding<Bool>(get: { store.weatherOpen && m.open }, set: { (v: Bool) in if !v { store.weatherOpen = false } })) {
            PaperWeatherView().edgeSwipeClose30 { store.weatherOpen = false }
        }
        .onChange(of: m.step) { (_: Int, s: Int) in
            if s <= 0 { v.stop(); return }
            let i: Int = Swift.min(s - 1, steps.count - 1)
            let st: Brief35Step = steps[i]
            let text: String = g.cfg.lang == "en" && !st.textEn.isEmpty ? st.textEn : st.text
            v.say(text, char: st.char, store)
        }
        .onChange(of: phase) { (_: ScenePhase, p: ScenePhase) in
            if p != .active { v.stop() }
        }
        .onDisappear { v.stop() }
        .task {
            g.refreshExtra()
            await m.load(store)
            g.refreshExtra()
            await g.load(store)
            await m.autoStart()
        }
    }
}

struct Brief35Content: View {
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    let b: Brief34
    let target: String
    let openCfg: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Prompt 38: 🔇 og ⚙ er fjernet; tittelen og Ferdig står på samme linje (Brief38.swift).
            Brief38TitleRow(kick: b.kick)
            Brief35SpeakingPill()
            VStack(alignment: .leading, spacing: 8) {
                Text(b.summary.isEmpty ? (m.loading ? "Glimt lager briefen din …" : "Ingen brief ennå. Dra ned for å prøve igjen.") : b.summary)
                    .font(PF.serif(17)).foregroundStyle(Brief34C.rgb(0x3d3a33)).lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                if !m.error.isEmpty {
                    Text(m.error).font(PF.ui(12.5, .semibold)).foregroundStyle(Brief34C.red)
                }
            }
            // Prompt 40: julemodus – nedtelling til julaften og «Dagens luke» (Glimt40Settings.swift).
            Brief40JulCard()
            // Prompt 36: ringen følger kortets hjørner nøyaktig (Brief36Ring) og settes på selve kortet.
            // Prompt 37: hele Vær-kortet åpner Vær over briefen (Brief37.swift); ✕ går tilbake hit.
            Brief37WeatherButton(b: b).brief36Ring(target == "vaer").id("gb35-vaer")
            // Prompt 37: dagens bibelvers etter Vær (morgen og kveld), eller nederst når det er lest/sveipet bort på Hjem.
            if Bible37Model.shared.briefPlace == "top" { Bible37BriefCard() }
            Brief34Calendar(b: b).brief36Ring(target == "kal").id("gb35-kal")
            // Prompt 37: Gjøremål i dag (forfalt + i dag) med avkrysning (Brief37.swift).
            Brief37TodosCard()
            // Prompt 52: kortene for brukeren som er logget inn (Dagens fokus, Min reise, Huskeliste, Regninger, Klær,
            // Nytt i kveld, Homelab, Domener, Aksjer – filtrert på tilgang av serveren), Brief52.swift.
            Brief52Stack()
            if !g.extra.trials.isEmpty {
                Brief35TrialsCard(trials: g.extra.trials).brief36Ring(target == "abo").id("gb35-abo")
            }
            // Prompt 38: Pakker, Familie, Skole og jobb, Bursdager og Nordlys i natt (Brief38.swift).
            Brief38CardsStack()
            Brief35NewsCard(b: b, extra: g.extra).brief36Ring(target == "nyh").id("gb35-nyh")
            if Bible37Model.shared.briefPlace == "bottom" { Bible37BriefCard() }
            Text(footer).font(PF.ui(12)).foregroundStyle(Brief34C.rgb(0x8a8478))
                .frame(maxWidth: .infinity).multilineTextAlignment(.center)
        }
    }

    private var footer: String {
        if !b.footer.isEmpty { return b.footer }
        let made: String = b.madeAt.isEmpty ? "Laget av Glimt" : "Laget av Glimt " + b.madeAt
        let src: String = b.sources.isEmpty ? "Vær: MET / Open-Meteo · Nyheter: NRK, VG, E24" : b.sources
        return made + " · " + src
    }
}

/// «GLIMT · KVELDSBRIEF», høyttaler, ⚙ og Ferdig.
struct Brief35Top: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    let kick: String
    let openCfg: () -> Void

    var body: some View {
        let on: Bool = g.cfg.readAloud
        HStack(spacing: 6) {
            // Prompt 37: etiketten «GLIMT · KVELDSBRIEF» er fjernet (dobbelt med tittelen). Knappene står høyrejustert.
            Spacer(minLength: 8)
            Button { g.setBool("readAloud", !on, store) } label: {
                Image(systemName: on ? "speaker.wave.2.fill" : "speaker.slash")
                    .font(.dyn51(size: 15, weight: .semibold))
                    .foregroundStyle(on ? Brief34C.paper : Brief34C.ink)
                    .frame(width: 36, height: 36)
                    .background(on ? Brief34C.ink : Brief34C.card, in: Circle())
                    .overlay(Circle().strokeBorder(Brief34C.rgb(0xddd5c5), lineWidth: 1))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(on ? "Slå av opplesning" : "Slå på opplesning")
            Button { Haptic34.light(); openCfg() } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.dyn51(size: 14, weight: .semibold))
                    .foregroundStyle(Brief34C.ink)
                    .frame(width: 36, height: 36)
                    .background(Brief34C.card, in: Circle())
                    .overlay(Circle().strokeBorder(Brief34C.rgb(0xddd5c5), lineWidth: 1))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Brief-innstillinger")
            Glimt35DoneButton(title: "Ferdig") {
                Glimt35Voice.shared.stop()
                m.close()
            }
        }
    }
}

/// «▮▮▮ Sky snakker · Nora · Stopp» mens noen leser opp.
struct Brief35SpeakingPill: View {
    @MainActor private var v: Glimt35Voice { Glimt35Voice.shared }
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        if let who = v.speaking {
            let c: Glimt35Char = Glimt35Char.get(who)
            let name: String = String(c.who.prefix(1)) + c.who.dropFirst().lowercased()
            let voice: String = v.engineUsed == "system" ? "Telefonens stemme" : Glimt35Voice.voiceName(g.cfg.voice)
            HStack(spacing: 8) {
                Brief35Bars()
                Text(name + " snakker · " + voice).font(PF.ui(12, .bold)).foregroundStyle(Brief34C.paper).lineLimit(1)
                Button { Haptic34.light(); v.stop() } label: {
                    Text("Stopp").font(PF.ui(12, .bold)).foregroundStyle(Brief34C.rgb(0xc9c1b1)).padding(.leading, 4).frame(height: 30)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12).frame(height: 30)
            .background(Brief34C.ink, in: Capsule())
            .transition(.opacity.combined(with: .offset(y: 6)))
        }
    }
}

/// Fire lydstolper (gfTalk med ulik takt).
struct Brief35Bars: View {
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            let t: Double = ctx.date.timeIntervalSinceReferenceDate
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(0..<4, id: \.self) { (i: Int) in
                    Brief35Bar(t: t, period: [0.42, 0.3, 0.5, 0.36][i])
                }
            }
            .frame(height: 14)
        }
    }
}

struct Brief35Bar: View {
    let t: Double
    let period: Double

    var body: some View {
        let k: Double = (1 - cos(t / period * 2 * Double.pi)) / 2
        RoundedRectangle(cornerRadius: 1.5).fill(Brief34C.star)
            .frame(width: 3, height: 14)
            .scaleEffect(x: 1, y: CGFloat(0.4 + 0.6 * k), anchor: .bottom)
    }
}

/* ---------- Guide: figuren og boblen ---------- */

struct Brief35GuideView: View {
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    @MainActor private var v: Glimt35Voice { Glimt35Voice.shared }
    let steps: [Brief35Step]
    let idx: Int
    let target: String

    var body: some View {
        let showBubble: Bool = m.step > 0
        let st: Brief35Step = steps[idx]
        let ch: String = showBubble ? st.char : (g.extra.host.isEmpty ? g.cfg.host : g.extra.host)
        let mood: Glimt35Mood = moodFor(showBubble)
        HStack(alignment: .bottom, spacing: 10) {
            Spacer(minLength: 0)
            if showBubble {
                Brief35Bubble(step: st, en: g.cfg.lang == "en", canSkip: idx > 0 && idx < steps.count - 1, count: steps.count)
                    .id("b" + String(idx))
                    .transition(.opacity.combined(with: .offset(y: 8)))
            }
            Button { m.tapFigure() } label: {
                ZStack(alignment: .bottomTrailing) {
                    Glimt35Live(id: ch, size: 76, mood: mood)
                        .rotationEffect(.degrees(target.isEmpty ? 0 : -8), anchor: .bottom)
                        .id(ch)
                        .transition(.asymmetric(insertion: .scale(scale: 0.4, anchor: .bottom).combined(with: .opacity),
                                                removal: .scale(scale: 0.6, anchor: .bottom).combined(with: .opacity)))
                }
                .frame(width: 84, height: 92, alignment: .bottomTrailing)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showBubble ? "Avslutt runden med Glimt" : "Start en runde med Glimt")
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.62), value: ch)
        .animation(.easeOut(duration: 0.28), value: m.step)
    }

    /// Snakker mens boblen vises (eller lyden går), sover 23–06, glad på siste steg.
    private func moodFor(_ bubble: Bool) -> Glimt35Mood {
        if bubble {
            if idx == steps.count - 1 && v.speaking == nil { return .glad }
            return .talk
        }
        if Glimt35Char.sleeping() { return .sover }
        return .idle
    }
}

struct Brief35Bubble: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    let step: Brief35Step
    let en: Bool
    let canSkip: Bool
    let count: Int

    var body: some View {
        let c: Glimt35Char = Glimt35Char.get(step.char)
        let text: String = en && !step.textEn.isEmpty ? step.textEn : step.text
        let label: String = step.action.isEmpty ? "Neste" : step.action
        VStack(alignment: .leading, spacing: 8) {
            Text(c.who).font(PF.mono(10)).tracking(1.4).foregroundStyle(Brief34C.rgb(c.nameColor))
            Text(text).font(PF.ui(14)).foregroundStyle(Brief34C.paper).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Spacer(minLength: 0)
                if canSkip {
                    Button {
                        Glimt35Voice.shared.stop()
                        m.skip()
                    } label: {
                        Text("Hopp over").font(PF.ui(12, .bold)).foregroundStyle(Brief34C.rgb(0xc9c1b1)).padding(.horizontal, 12).frame(height: 30)
                    }
                    .buttonStyle(.plain)
                }
                Button { m.next(count) } label: {
                    Text(label).font(PF.ui(12, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                        .padding(.horizontal, 14).frame(height: 30)
                        .background(Brief34C.paper, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: 280, alignment: .leading)
        .background(Brief34C.ink, in: UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 4, topTrailingRadius: 18))
        .shadow(color: Color.black.opacity(0.25), radius: 15, y: 14)
    }
}

/* ---------- Abonnementer (prøveperioder) ---------- */

struct Brief35TrialsCard: View {
    @Environment(Store.self) private var store
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    let trials: [Brief35Trial]

    var body: some View {
        let first: Brief35Trial? = trials.first
        let head: String = (first?.daysLeft ?? 99) <= 2 ? "AVSLUTT SNART" : "PRØVEPERIODER"
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Abonnementer").font(PF.serif(22, medium: true)).foregroundStyle(Brief34C.ink)
                Spacer()
                Text(head).font(PF.mono(11)).foregroundStyle(Brief34C.red)
            }
            ForEach(trials.prefix(3)) { (t: Brief35Trial) in
                Brief35TrialRow(t: t)
            }
            HStack(spacing: 6) {
                if let f = first {
                    Button { g.trialDone(f, store) } label: {
                        Text("✓ Jeg har avsluttet " + f.service).font(PF.ui(13, .bold)).foregroundStyle(Brief34C.paper).lineLimit(1)
                            .padding(.horizontal, 14).frame(height: 36)
                            .background(Brief34C.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    Haptic34.light()
                    Brief34Model.shared.close()
                    store.paperFinGo("abo")
                } label: {
                    Text("Åpne Abonnement ›").font(PF.ui(13, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                        .padding(.horizontal, 14).frame(height: 36)
                        .overlay(Capsule().strokeBorder(Brief34C.rgb(0xe6c9cf), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(Brief34C.rgb(0xfbe9ec), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct Brief35TrialRow: View {
    let t: Brief35Trial

    var body: some View {
        let col: Color = Brief34C.rgb(t.colorHex)
        let frac: Double = Swift.min(1, Swift.max(0.06, t.progress))
        HStack(spacing: 12) {
            Brief35Logo(url: t.logoURL, name: t.service)
            VStack(alignment: .leading, spacing: 1) {
                Text(t.service).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                Text(t.sub).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).lineLimit(2)
                GeometryReader { (geo: GeometryProxy) in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Brief34C.rgb(0xf1e3e6))
                        Capsule().fill(col).frame(width: geo.size.width * CGFloat(frac))
                    }
                }
                .frame(height: 4)
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 0) {
                Text(String(Swift.max(0, t.daysLeft))).font(PF.serif(26, medium: true)).foregroundStyle(col)
                Text(t.unit).font(PF.ui(11)).foregroundStyle(Brief34C.mut)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct Brief35Logo: View {
    let url: URL?
    let name: String

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color.white)
            Text(String(name.prefix(1)).uppercased()).font(PF.ui(16, .heavy)).foregroundStyle(Brief34C.mut)
            if let url {
                AsyncImage(url: url) { (img: Image) in
                    img.resizable().scaledToFit()
                } placeholder: {
                    Color.clear
                }
                .frame(width: 25, height: 25)
                .background(Color.white)
            }
        }
        .frame(width: 40, height: 40)
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Brief34C.rgb(0xecdfe2), lineWidth: 1))
    }
}

/* ---------- Nyheter med bilder ---------- */

struct Brief35NewsCard: View {
    @Environment(Store.self) private var store
    let b: Brief34
    let extra: Brief35Extra

    var body: some View {
        let list: [Brief35News] = items
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Nyheter").font(PF.serif(22, medium: true)).foregroundStyle(Brief34C.ink)
                Spacer(minLength: 6)
                // Prompt 40: lukker briefen og åpner Nyhetsleseren rett på Glimt-siden (News40Glimt.swift).
                Button { News40Model.shared.openFromBrief(store) } label: {
                    Text("✦ Glimt-sammendrag ›").font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.red)
                        .frame(height: 30).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if list.isEmpty {
                Text("Ingen nyheter fra Nyhetsleser ennå.").font(PF.ui(13)).foregroundStyle(Brief34C.mut).padding(.vertical, 6)
            }
            if let top = list.first {
                Button { store.openLink(top.url) } label: { Brief35TopStory(n: top) }
                    .buttonStyle(.plain)
            }
            ForEach(Array(list.dropFirst().prefix(6))) { (n: Brief35News) in
                Button { store.openLink(n.url) } label: { Brief35NewsRow(n: n) }
                    .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var items: [Brief35News] {
        if !extra.news.isEmpty { return extra.news }
        return b.news.map { (n: Brief34News) -> Brief35News in
            Brief35News(source: n.source, title: n.title, url: n.url, time: n.time, image: "", lead: "")
        }
    }
}

struct Brief35TopStory: View {
    let n: Brief35News

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Color.clear
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay { Brief35Img(src: n.image) }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            HStack(spacing: 8) {
                Text(n.source).font(PF.mono(11)).foregroundStyle(Brief34C.red)
                Text(n.time).font(PF.mono(11)).foregroundStyle(Brief34C.mut2)
            }
            Text(n.title).font(PF.serif(20, medium: true)).foregroundStyle(Brief34C.ink)
                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            if !n.lead.isEmpty {
                Text(n.lead).font(PF.ui(13)).foregroundStyle(Brief34C.mut).lineSpacing(2)
                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

struct Brief35NewsRow: View {
    let n: Brief35News

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Brief35Img(src: n.image)
                .frame(width: 76, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(n.source).font(PF.mono(11)).foregroundStyle(Brief34C.red)
                    Text(n.time).font(PF.mono(11)).foregroundStyle(Brief34C.mut2)
                }
                Text(n.title).font(PF.serif(15.5, medium: true)).foregroundStyle(Brief34C.ink).lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
        .contentShape(Rectangle())
    }
}

/// Nyhetsbilde: serverens proxy (/api/img?u=…, bufret), ellers rett fra kilden. Grå flate til bildet er lastet.
@MainActor
final class Brief35ImgCache {
    static let shared = Brief35ImgCache()
    var mem: [String: UIImage] = [:]
}

struct Brief35Img: View {
    @Environment(Store.self) private var store
    let src: String
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            Brief34C.line
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
            }
        }
        .clipped()
        .task(id: src) { img = await load() }
    }

    private func load() async -> UIImage? {
        if src.isEmpty { return nil }
        if let c = Brief35ImgCache.shared.mem[src] { return c }
        var data: Data? = nil
        if src.hasPrefix("/") {
            data = try? await store.api.bytes(src)
        } else if src.hasPrefix("http") {
            var allowed: CharacterSet = CharacterSet.alphanumerics
            allowed.insert(charactersIn: "-._~")
            let enc: String = src.addingPercentEncoding(withAllowedCharacters: allowed) ?? src
            data = try? await store.api.bytes("/api/img?u=" + enc)
            if data.flatMap({ UIImage(data: $0) }) == nil, let u = URL(string: src) {
                data = try? await URLSession.shared.data(from: u).0
            }
        }
        guard let d = data, let im = UIImage(data: d) else { return nil }
        Brief35ImgCache.shared.mem[src] = im
        return im
    }
}
