import SwiftUI
import UIKit

/* ---------------- Prompt 34: Innstillinger-søket tar deg til riktig sted og markerer knappen ----------------
   Fasit: design/Innstillinger Web.dc.html → IDX (med mål-id), match() (poengsum), goK(k, h), hl, data-hl, hlRing / hlTip, og
   Mobil Papir App.dc.html → setSub. prompts/prompt-34-pakke/claude-code-innst-ai-sok-highlight.md.
   1. Spør («hvordan oppdaterer jeg») eller trykk ✦ AI. Glimt svarer kort i søkemenyen.
   2. Etter ca. 1,6 s går appen selv til siden («Vis meg nå ›» gjør det med en gang). Vanlig søk + Enter går rett dit.
   3. Målet scrolles til midten og får en rød ring som pulserer (3 pt #b23a2a + utvidende glød, 1,4 s × 4). For «Oppdater nå»
      vises også en mørk boble «✦ Trykk her for å oppdatere». Borte etter 6 s eller ved første trykk. Lett haptikk.
   Indeksen har mål-id (anchor) per handling: upd (Oppdater nå), chk (Se etter oppdatering), pw (Krev passord for å oppdatere) …
   AI-svaret fra serveren (POST /api/settings/ai-search) kan gi {anchor|target, page}; det valideres mot indeksen. */

@MainActor
@Observable
final class Set34Focus {
    static let shared = Set34Focus()

    /// Mål-id-en som markeres (upd, chk, pw …).
    var target: String? = nil
    var tip: String = ""
    var tick: Int = 0
    @ObservationIgnored private var clearTask: Task<Void, Never>? = nil

    static let tips: [String: String] = ["upd": "✦ Trykk her for å oppdatere"]

    func flash(_ anchor: String) {
        if anchor.isEmpty { return }
        clearTask?.cancel()
        clearTask = Task { @MainActor in
            // Litt tid til at siden åpnes og scrolles før ringen vises.
            try? await Task.sleep(nanoseconds: 450_000_000)
            if Task.isCancelled { return }
            self.target = anchor
            self.tip = Set34Focus.tips[anchor] ?? ""
            self.tick += 1
            Haptic34.light()
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: 0.4)) { self.clear() }
        }
    }

    func clear() {
        target = nil
        tip = ""
    }

    func tapped() {
        if target == nil { return }
        clearTask?.cancel()
        withAnimation(.easeOut(duration: 0.25)) { clear() }
    }

    nonisolated static func rowId(_ anchor: String) -> String { "hl34:" + anchor }

    /// «Vis meg nå» etter 1,6 s (AI-svaret i søkemenyen).
    @ObservationIgnored var autoGo: Task<Void, Never>? = nil
}

/// Rød pulserende ring rundt målet, og boblen over («✦ Trykk her for å oppdatere»).
struct Hl34: ViewModifier {
    let anchor: String
    var radius: CGFloat = 22
    @MainActor private var f: Set34Focus { Set34Focus.shared }

    func body(content: Content) -> some View {
        let on: Bool = f.target == anchor
        content
            .overlay {
                if on { Hl34Ring(radius: radius).allowsHitTesting(false) }
            }
            .overlay(alignment: .top) {
                if on && !f.tip.isEmpty { Hl34Tip(text: f.tip).allowsHitTesting(false).offset(y: -44) }
            }
            .simultaneousGesture(TapGesture().onEnded { f.tapped() })
            .id(Set34Focus.rowId(anchor))
    }
}

extension View {
    func hl34(_ anchor: String, radius: CGFloat = 22) -> some View { modifier(Hl34(anchor: anchor, radius: radius)) }
}

struct Hl34Ring: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let radius: CGFloat
    @State private var grow: Bool = false

    private static let red: Color = Color(hex: "#b23a2a")

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: radius + 3, style: .continuous)
                .strokeBorder(Hl34Ring.red.opacity(grow ? 0 : 0.45), lineWidth: grow ? 2 : 10)
                .padding(grow ? -14 : -3)
            RoundedRectangle(cornerRadius: radius + 3, style: .continuous)
                .strokeBorder(Hl34Ring.red, lineWidth: 3)
                .padding(-3)
        }
        .onAppear {
            if reduce { return }
            withAnimation(.easeOut(duration: 1.4).repeatCount(4, autoreverses: false)) { grow = true }
        }
    }
}

struct Hl34Tip: View {
    let text: String

    var body: some View {
        Text(text).font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#f3efe6"))
            .padding(.horizontal, 14).frame(height: 34)
            .background(Color(hex: "#1b1a17"), in: Capsule())
            .shadow(color: Color.black.opacity(0.25), radius: 12, y: 8)
            .fixedSize()
            .transition(.opacity)
    }
}

/* ---------- Indeks og søk ---------- */

extension Set24Model {
    /// Prompt 34: handlinger med mål-id (legges til i indeksen).
    static func items34(_ store: Store) -> [Set24Item] {
        var out: [Set24Item] = []
        if Update28Model.isAdmin(store) {
            out.append(Set24Item(id: "sys.upd", title: "Oppdater nå", sub: "Tar backup først · ca. 2 minutter", path: "System", route: "innst-oppdatering", anchor: "upd"))
            out.append(Set24Item(id: "sys.chk", title: "Se etter oppdatering", sub: "Versjon og sjekk mot GitHub", path: "System", route: "innst-oppdatering", anchor: "chk"))
            out.append(Set24Item(id: "sys.pw", title: "Krev passord for å oppdatere", sub: "Face ID eller passord før oppdateringen", path: "System", route: "innst-oppdatering", anchor: "pw"))
        }
        out.append(Set24Item(id: "ai.ctl", title: "AI og modeller", sub: "Modeller, nedlasting, jobber, tokens, nøkler og selvtest", path: "App", route: "aictl:ov", anchor: ""))
        out.append(Set24Item(id: "ai.mod", title: "Modeller", sub: "Last ned, last inn og slett Ollama-modeller", path: "AI og modeller", route: "aictl:mod", anchor: ""))
        out.append(Set24Item(id: "ai.rt", title: "Hvilken modell gjør hva", sub: "Ruting per oppgave, reserve og regler", path: "AI og modeller", route: "aictl:rt", anchor: ""))
        out.append(Set24Item(id: "ai.key", title: "API og nøkler", sub: "Ollama, Gemini, Groq, OpenRouter og Roboflow", path: "AI og modeller", route: "aictl:api", anchor: ""))
        out.append(Set24Item(id: "ai.use", title: "Tokenforbruk og budsjett", sub: "Tokens og sky-kostnad per dag", path: "AI og modeller", route: "aictl:use", anchor: ""))
        out.append(Set24Item(id: "ai.test", title: "Selvtest av AI", sub: "Sjekk at Glimt, AI-søk og chat svarer", path: "AI og modeller", route: "aictl:ov", anchor: ""))
        // Prompt 35: GLIMT → Glimt (søket kjenner glimt, brief, stemme og figur).
        out.append(Set24Item(id: "glimt.page", title: "Glimt", sub: "Figur, brief, stemme og venner", path: "Glimt", route: "glimt35", anchor: ""))
        out.append(Set24Item(id: "glimt.fig", title: "Glimt-figur", sub: "Velg figur: Glimt, Halo, Sky, Ugle, Gris …", path: "Glimt", route: "glimt35", anchor: ""))
        out.append(Set24Item(id: "glimt.brief", title: "Glimt-brief", sub: "Morgen-, dags-, kvelds- og nattbrief med klokkeslett", path: "Glimt", route: "glimt35", anchor: ""))
        out.append(Set24Item(id: "glimt.voice", title: "Stemme og opplesning", sub: "Les opp, stemmemotor, stemme, tempo og språk", path: "Glimt", route: "glimt35", anchor: ""))
        // Prompt 67: Innstillinger → Glimt og undersidene (Glimt67Pages.swift).
        out.append(Set24Item(id: "glimt.innst67", title: "Glimt-innstillinger", sub: "Send til Chat etter, Forstår samtaler, minne, lærer og faste oppgaver", path: "Glimt og AI", route: "innst-glimt", anchor: ""))
        out.append(Set24Item(id: "glimt.husker67", title: "Glimt husker", sub: "Minne, forslag, motstrid og ikke brukt på lenge", path: "Glimt", route: G67Nav.husker, anchor: ""))
        out.append(Set24Item(id: "glimt.ent67", title: "Entitetsregister", sub: "Personer, steder, butikker og abonnementer med aliaser", path: "Glimt", route: G67Nav.ent, anchor: ""))
        out.append(Set24Item(id: "glimt.laerer67", title: "Glimt lærer", sub: "Oppskrifter, hurtigvei og rettelser", path: "Glimt", route: G67Nav.laerer, anchor: ""))
        out.append(Set24Item(id: "glimt.faste67", title: "Faste oppgaver", sub: "Planlagte oppgaver, påminnelser og varsler · Lag fra tekst", path: "Glimt", route: G67Nav.faste, anchor: ""))
        out.append(Set24Item(id: "glimt.kvalitet67", title: "Kvalitet", sub: "Ukerapport og nattlig eval", path: "Glimt", route: G67Nav.kvalitet, anchor: ""))
        return out
    }

    /// Ekstra ord for de nye handlingene (AI-modus).
    static let synonyms34: [String: [String]] = [
        "oppdater": ["Oppdater nå", "Se etter oppdatering"], "update": ["Oppdater nå"], "nordlys": ["Oppdater nå"],
        "versjon": ["Se etter oppdatering"], "krev": ["Krev passord for å oppdatere"],
        "modell": ["Modeller", "AI og modeller"], "ollama": ["Modeller", "API og nøkler"], "laste": ["Modeller"],
        "token": ["Tokenforbruk og budsjett"], "budsjett": ["Tokenforbruk og budsjett"], "nøkkel": ["API og nøkler"],
        "glimt": ["Selvtest av AI", "AI og modeller"], "selvtest": ["Selvtest av AI"], "virker": ["Selvtest av AI"],
    ]

    /// Poengsum (helt ord i tittelen = 3, prefiks = 2, treff i tittelen = 1) for de nye oppføringene.
    static func score34(_ it: Set24Item, words: [String], ai: Bool) -> Int {
        let title: String = it.title.lowercased()
        let tw: [String] = title.split(whereSeparator: { !($0.isLetter || $0.isNumber) }).map(String.init)
        var x: Int = 0
        for w in words {
            if tw.contains(w) { x += 3 } else if tw.contains(where: { (t: String) -> Bool in t.count > 3 && (t.hasPrefix(w) || w.hasPrefix(t)) }) { x += 2 }
            if title.contains(w) { x += 1 }
            if ai {
                for (k, names) in Set24Model.synonyms34 where w.hasPrefix(k) || (k.hasPrefix(w) && w.count > 2) {
                    if names.contains(it.title) { x += 6 }
                }
            }
        }
        return x
    }

    /// Etter AI-svaret: gå selv til beste treff etter ca. 1,6 s (hvis spørsmålet ikke er endret i mellomtiden).
    func scheduleAutoGo34(_ q: String, _ store: Store) {
        let f: Set34Focus = Set34Focus.shared
        f.autoGo?.cancel()
        f.autoGo = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            if Task.isCancelled { return }
            guard self.ai, self.query.trimmingCharacters(in: .whitespaces) == q else { return }
            guard let first = self.hits(store).first, !["naming", "icon"].contains(first.route) else { return }
            self.goThere(first, store)
        }
    }

    /// Enter i søkefeltet: rett til beste treff (vanlig søk), med markering.
    func submit34(_ store: Store) {
        let q: String = query.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return }
        if ai { changed(store); return }
        guard let first = hits(store).first, !["naming", "icon"].contains(first.route) else { return }
        Set34Focus.shared.autoGo?.cancel()
        goThere(first, store)
    }

    /// Åpner siden for en oppføring med mål-id og markerer kontrollen. false = ikke en prompt 34-rute.
    func open34(_ it: Set24Item, _ store: Store) -> Bool {
        if it.route == "glimt35" {
            Glimt35Model.shared.showPage = true
            return true
        }
        if it.route.hasPrefix("aictl:") {
            AiCtl34.shared.show(String(it.route.dropFirst(6)))
            return true
        }
        if it.anchor.isEmpty { return false }
        store.paperGo(it.route)
        Set34Focus.shared.flash(it.anchor)
        return true
    }
}
