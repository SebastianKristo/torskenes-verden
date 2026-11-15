import SwiftUI
import UIKit

/* ---------------- Prompt 24: «Søk i innstillinger» og ✦ AI-søk (Mobil Papir App.dc.html → Innstillinger, ss) ----------------
   Søket indekserer alle innstillinger og undersider lokalt (også integrasjonene). Med ✦ AI sendes spørsmålet og listen
   til POST /api/settings/ai-search, som svarer med en setning og id-er. Uten AI-svar (eldre server, ingen nøkkel):
   ordlisten fra designet (SYN). */

struct Set24Item: Identifiable, Hashable {
    let id: String
    let title: String
    let sub: String
    let path: String
    /// innst-… (side), profile:…, integ:…, naming, icon, tabbar, news, imports, abo, aictl:<fane> (prompt 34).
    let route: String
    /// Prompt 34: mål-id for kontrollen som markeres på siden (upd, chk, pw …). Tom = raden selv (Set25Focus).
    var anchor: String = ""
}

@MainActor
@Observable
final class Set24Model {
    static let shared = Set24Model()

    var query: String = ""
    var ai: Bool = false
    var answer: String = ""
    var aiIds: [String] = []
    var busy: Bool = false
    private var pending: Task<Void, Never>? = nil

    /// Ordlisten fra designet: vanlige ord → navnet på innstillingen eller gruppen.
    static let synonyms: [String: [String]] = [
        "ikon": ["App-ikon"], "logo": ["App-ikon"], "navn": ["Navn på appen"], "mørk": ["Utseende og fanelinje"], "lys": ["Utseende og fanelinje"],
        "tema": ["Utseende og fanelinje"], "farge": ["Utseende og fanelinje"], "passord": ["Sikkerhet"], "logg": ["Sikkerhet"], "face": ["Sikkerhet"],
        "varsel": ["Varsler og haptikk"], "lyd": ["Varsler og haptikk"], "vibr": ["Varsler og haptikk", "Haptikk"], "token": ["API-tokens"],
        "nøkkel": ["API-tokens", "Mybring", "PostNord", "ParcelsApp"], "pakk": ["Mybring", "PostNord", "ParcelsApp"], "post": ["Mybring", "PostNord"],
        "bring": ["Mybring"], "spor": ["Mybring", "ParcelsApp"], "buss": ["Entur"], "trikk": ["Entur"], "ruter": ["Entur"], "avgang": ["Entur"],
        "kalend": ["Google Kalender"], "bursdag": ["Google Kalender"], "google": ["Google Kalender"], "gemini": ["AI og tolkning", "AI"],
        "ai": ["AI og tolkning", "AI"], "aksje": ["Aksjer · Trading 212", "Trading 212"], "bank": ["Bankimport", "Bank"],
        "budsjett": ["Kategorier og budsjett"], "kategori": ["Kategorier og budsjett"], "regel": ["Regler"], "home": ["Home Assistant"],
        "ha": ["Home Assistant"], "domene": ["Cloudflare"], "cloudflare": ["Cloudflare"], "vær": ["MET"], "yr": ["MET"], "kart": ["Kart", "Helse og posisjon"],
        "posisjon": ["Helse og posisjon"], "helse": ["Helse og posisjon"], "skritt": ["Helse og posisjon"], "kvitter": ["IMAP", "Skanning"],
        "epost": ["IMAP"], "mail": ["IMAP"], "finn": ["Finn"], "profil": ["Standard", "Finans + Boliger", "Boliger-profil"], "fane": ["Fanelinje i Hjem", "Fanelinje og Mer i Finans"],
        "widget": ["Widgets"], "modul": ["Moduler"], "bruker": ["Brukere og familie", "Kontoer og brukere"],
        "familie": ["Brukere og familie", "Familie og helse"], "husstand": ["Brukere og familie"], "barn": ["Brukere og familie"], "rolle": ["Brukere og familie"], "bilde": ["Unsplash/Pexels", "Utseende og fanelinje"],
    ]

    static let stop: Set<String> = ["hvor", "hvordan", "kan", "jeg", "du", "meg", "min", "mitt", "mine", "en", "et", "den", "det", "på", "i", "til",
                                    "for", "å", "og", "er", "med", "endre", "bytte", "bytter", "skru", "slå", "av", "finner", "finne", "legge", "sette", "hva", "vil"]

    /// Alle innstillinger med sti («Integrasjoner · Mybring»).
    func index(_ store: Store) -> [Set24Item] {
        var out: [Set24Item] = []
        func add(_ id: String, _ t: String, _ s: String, _ path: String, _ r: String) {
            out.append(Set24Item(id: id, title: t, sub: s, path: path, route: r))
        }
        for d in Prof24.shared.defs { add("profil." + d.key, d.name, d.sub, "Profil", "profile:" + d.key) }
        add("konto", "Kontoer og brukere", "Profil, server og flere kontoer", "Konto", "innst-konto")
        // Prompt 68: Brukere og familie (UsersSettings.swift) – brukere, Logg inn som, eier, figur per bruker, Familie og helse.
        add("brukere68", Users68.name, "Brukere, roller, Logg inn som, familie, husstand, barn, helse og posisjon", "Husstand", Users68.key)
        add("konto.bilde", "Profilbilde", "Vises i menyer og hilsener", "Kontoer og brukere", "innst-konto")
        add("sik", "Sikkerhet", "2FA, Face ID og pålitelige enheter", "Konto", "innst-sik")
        add("sik.2fa", "Totrinnsbekreftelse", "Autentiseringsapp", "Sikkerhet", "innst-sik")
        add("sik.face", "Face ID", "Lås opp appen", "Sikkerhet", "innst-sik")
        add("sik.okter", "Aktive økter", "Enheter som er logget inn", "Sikkerhet", "innst-sik")
        add("sik.nye51", "Nye enheter", "Godkjenn innlogging på en ny enhet", "Sikkerhet", "innst-sik") // prompt 51
        add("api", "API-tokens", "Snarveier og integrasjoner", "Konto", "innst-api")
        add("ai", "AI og tolkning", "Gemini · Groq · Roboflow · Ollama · tidsgrenser", "Finans", "innst-ai")
        add("kat", "Kategorier og budsjett", "Farger og budsjett per måned", "Finans", "innst-kat")
        add("regler", "Regler", "Tekst inneholder … → kategori", "Finans", "innst-regler")
        add("bank", "Bankimport", "DNB · CSV · ✦ AI", "Finans", "imports")
        add("aksjer", "Aksjer · Trading 212", "Nøkkel, miljø og synk", "Finans", "innst-aksjer")
        add("fin", "Fanelinje og Mer i Finans", "Fanene i Finans", "Finans", "innst-fin")
        add("abo", "Subscription OS", "Abonnementer og AI-sparing", "Finans", "abo")
        add("navn", "Navn på appen", AppMeta.shared.name, AppMeta.shared.name, "naming")
        add("ikon", "App-ikon", AppMeta.shared.iconName, AppMeta.shared.name, "icon")
        add("tabbar", "Fanelinje i Hjem", "Fjern, flytt, gi nytt navn og ikon", AppMeta.shared.name, "tabbar")
        add("navstil", "Fanelinje-stil", "Tekst, bare ikoner eller ikoner + navn på valgt", "Tilpass", "innst-tilpass")
        add("hl", "Moduler", "Sporing, Domener, Mat, Familie, Avganger og Vær", AppMeta.shared.name, "innst-hl")
        add("news", "Nyhetsleser", "Kilder, AI og ikoner på fanene", AppMeta.shared.name, "news")
        // Prompt 39: «tema», «farge», «ikon», «navn», «fanelinje», «bakgrunn», «tilpass» og «utseende» → Tilpass.
        add("ut", "Tilpass", "Utseende: navn, ikon, tema, farger, bakgrunn og fanelinje", AppMeta.shared.name, "innst-tilpass")
        add("appprofil", "Appprofil", "Profil og oppsett: Standard, Finans + Boliger, Boliger-profil", "App", "innst-appprofil")
        add("varsler", "Varsler og haptikk", "Lyd, stille timer, grupper og Bursdager", "App", "innst-varsler")
        add("haptikk", "Haptikk", "Vibrasjon og styrke", "Varsler og haptikk", "innst-haptikk")
        add("trk", "Pakkevarsler", "Sporing og kvitteringer", "Varsler og haptikk", "innst-trk")
        add("kal", "Kalendere", "Google Kalender, Home Assistant, Skole-iCal og Canvas", "App", "innst-kal")
        add("kal84", "Kalender i appen", "Hele Kalender-appen inni Homelab (sideloading)", "Innstillinger", "innst") // prompt 84
        add("integ", "Integrasjoner", "Home Assistant, Google, Entur, Bring og flere", "App", "innst-integ")
        add("helse", "Helse og posisjon", "Apple Health, posisjon og bakgrunn", Users68.name, "innst-helse")
        add("fam", "Familie og helse", "Deling i Familie", Users68.name, "innst-fam")
        add("helse.apple68", "Apple Health", "Koble til og velg hva som deles", Users68.name, "innst-helse")
        add("helse.ha68", "Home Assistant · Mobilapp", "Helse fra Mobilapp-integrasjonen", Users68.name, "innst-hahelse")
        add("avansert", "Avansert", "Skanning, widgets, server og data", "App", "innst-avansert")
        add("skann", "Skanning", "Kamera, beskjæring og AI", "Avansert", "innst-skann")
        add("widgets", "Widgets", "Hjemskjermen", "Avansert", "innst-widgets")
        add("server", "Server og synk", "Adresser og status", "Avansert", "innst-server")
        add("data", "Data og lagring", "Buffer og nedlastinger", "Avansert", "innst-data")
        add("backup", "Backup og data", "Eksport og gjenoppretting", "Avansert", "innst-backup")
        add("om", "Om appen", "Versjon og lisenser", "Avansert", "innst-om")
        // Prompt 32: «oppdatering», «versjon», «update» treffer Nordlys OS (innst-oppdatering sendes dit, PaperStore.paperGo).
        if Update28Model.isAdmin(store) { add("oppdatering", "Nordlys OS", "Oppdatering, versjon og update", "Programvare", "innst-oppdatering") }
        // Prompt 44: «logg», «docker», «feil» → Logger; Gjøremål-synk; Tidligere versjoner; Logg inn som / Overfør eier.
        if Update28Model.isAdmin(store) {
            add("logger44", "Logger", "Docker-logger, logg, feil og feilsøking", "Server", "logs44")
            add("versjoner44", "Tidligere versjoner", "Rull tilbake, installer en eldre versjon", "System", "innst-oppdatering")
            add("loggInnSom44", "Logg inn som", "Rediger oppsettet til et familiemedlem", Users68.name, Users68.key)
            add("figur68", "Standardfigur per bruker", "Brief og Glimt-figur per bruker", Users68.name, Users68.key)
        }
        add("huske44", "Gjøremål", "Synk med Home Assistant", "App", "innst-huske")
        add("eier44", "Overfør eierskap", "Eier av serveren", Users68.name, Users68.key)
        // Prompt 34: handlinger med mål-id (Oppdater nå, Se etter oppdatering, Krev passord) og AI-kontroll (SettingsSearch.swift).
        out += Set24Model.items34(store)
        let integ: [Int24Item] = Int24Model.shared.items
        if integ.isEmpty {
            for n in Int24Model.fallbackNames { add("integ." + n.lowercased(), n, "Status, felt og test", "Integrasjoner", "integ:" + n.lowercased()) }
        } else {
            for it in integ where !it.hidden {
                let fields: String = it.fields.map(\.label).joined(separator: ", ")
                add("integ." + it.id, it.name, fields.isEmpty ? it.group : fields, "Integrasjoner", "integ:" + it.id)
            }
        }
        return out
    }

    /// Vanlig søk (og AI uten svar fra serveren): treff i navn, sti og undertekst, med ordlisten i AI-modus.
    func localHits(_ store: Store) -> [Set24Item] {
        let q: String = query.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return [] }
        let words: [String] = q.split(whereSeparator: { !($0.isLetter || $0.isNumber) }).map(String.init).filter { $0.count > 1 && !Set24Model.stop.contains($0) }
        var scored: [(Set24Item, Int)] = []
        for it in index(store) {
            let txt: String = (it.path + " " + it.title + " " + it.sub).lowercased()
            var x: Int = 0
            if txt.contains(q) { x += 10 }
            for w in words where txt.contains(w) { x += 3 }
            if ai {
                for w in words {
                    for (k, names) in Set24Model.synonyms where w.hasPrefix(k) || (k.hasPrefix(w) && w.count > 2) {
                        if names.contains(it.title) { x += 6 }
                    }
                }
            }
            // Prompt 34: poengsum for handlingene med mål-id (helt ord 3, prefiks 2, tittel 1, ordlisten i AI-modus).
            if !it.anchor.isEmpty || it.route.hasPrefix("aictl:") { x += Set24Model.score34(it, words: words, ai: ai) }
            if x > 0 { scored.append((it, x)) }
        }
        scored.sort { $0.1 > $1.1 }
        return Array(scored.prefix(ai ? 6 : 12).map { $0.0 })
    }

    /// Treffene som vises: AI-id-ene i rekkefølge når de finnes, ellers lokalt søk.
    func hits(_ store: Store) -> [Set24Item] {
        if ai && !aiIds.isEmpty {
            let all: [Set24Item] = index(store)
            let out: [Set24Item] = aiIds.compactMap { (id: String) -> Set24Item? in all.first { $0.id == id } }
            if !out.isEmpty { return out }
        }
        return localHits(store)
    }

    func localAnswer(_ store: Store) -> String {
        guard ai else { return "" }
        if let h = localHits(store).first {
            let edit: Bool = ["naming", "icon"].contains(h.route)
            return "Du finner «\(h.title)» under Innstillinger → \(h.path)." + (edit ? " Trykk på raden for å endre." : "")
        }
        return "Fant ingen innstilling som passer. Prøv med andre ord, f.eks. «bytte ikon» eller «Bring-nøkkel»."
    }

    /// Ny tekst i feltet: AI-spørsmålet sendes etter en kort pause.
    func changed(_ store: Store) {
        pending?.cancel()
        aiIds = []
        answer = ""
        let q: String = query.trimmingCharacters(in: .whitespaces)
        guard ai, q.count >= 3 else { return }
        pending = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 700_000_000)
            if Task.isCancelled { return }
            await self.ask(q, store)
        }
    }

    func toggleAi(_ store: Store) {
        Haptics.shared.select()
        ai.toggle()
        changed(store)
    }

    private func ask(_ q: String, _ store: Store) async {
        busy = true
        let items: [[String: String]] = index(store).map { ["id": $0.id, "title": $0.title, "path": $0.path] }
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/settings/ai-search", json: ["q": q, "items": items], timeout: store.aiClientTimeout25)
            let o: [String: Any] = JS.obj(d)
            if q != query.trimmingCharacters(in: .whitespaces) { busy = false; return }
            answer = JS.str(o, "answer") ?? ""
            aiIds = JS.strings(o, "ids")
            // Prompt 34: {anchor|target} fra serveren – gyldig bare hvis den finnes i indeksen; den oppføringen kommer først.
            let anchor: String = JS.str(o, "anchor") ?? JS.str(JS.dict(o, "target"), "anchor") ?? JS.str(o, "targetId") ?? ""
            if !anchor.isEmpty, let hit = index(store).first(where: { $0.anchor == anchor || $0.id == anchor }) {
                aiIds = [hit.id] + aiIds.filter { $0 != hit.id }
            }
            scheduleAutoGo34(q, store)
        } catch {
            // 404 (eldre server) eller ingen AI: ordlisten.
            answer = ""
            aiIds = []
            scheduleAutoGo34(q, store)
        }
        busy = false
    }

    func open(_ it: Set24Item, _ store: Store) {
        Haptics.shared.tap()
        let r: String = it.route
        query = ""
        answer = ""
        aiIds = []
        if r.hasPrefix("profile:") { Prof24.shared.pick(String(r.dropFirst(8)), store); return }
        // Prompt 34: AI-kontroll og handlinger med mål-id (Oppdater nå …) markeres med rød ring.
        if open34(it, store) { return }
        if r.hasPrefix("integ:") {
            // Prompt 26: rett til siden for integrasjonen når den er kjent.
            if Int24Model.shared.open26(String(r.dropFirst(6)), store) { return }
            Int24Model.shared.focus = String(r.dropFirst(6))
            store.paperGo("innst-integ")
            Set25Focus.shared.flash(it.title)
            return
        }
        switch r {
        case "tabbar": store.tabBarEditing = true
        case "news": store.openNews()
        case "imports": store.paperOpen(.imports)
        case "abo": store.paperFinGo("abo")
        case "naming", "icon": break
        case "innst-kal": Int26Nav.openKal(from: nil, store)
        case "logs44": Logs44.shared.show()
        default: store.paperGo(r)
        }
        // Prompt 25: samme fremheving som «Ta meg dit →» (raden fremheves hvis den står på siden).
        Set25Focus.shared.flash(it.title)
    }
}

/// Søkefeltet (høyde 46, card, skygge) og «✦ AI»-knappen ved siden av.
struct Set24Search: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Set24Model { Set24Model.shared }

    private var text: Binding<String> {
        Binding<String>(get: { m.query }, set: { v in m.query = v })
    }

    var body: some View {
        HStack(spacing: 8) {
            // Prompt 27: ✕ til venstre (SearchField27), høyre-× er fjernet.
            // Prompt 34: Enter går rett til beste treff og markerer det (SettingsSearch.swift).
            SearchField27(text: text, placeholder: m.ai ? "Spør, f.eks. «hvor bytter jeg ikon?»" : "Søk i innstillinger", onSubmit: { m.submit34(store) })
            .padding(.horizontal, 16)
            .frame(height: 46)
            .background(Capsule().fill(p.card))
            .shadow(color: Color.black.opacity(0.12), radius: 12, x: 0, y: 8)
            Button { m.toggleAi(store) } label: {
                Text("✦ AI").font(PF.ui(13.5, .bold)).foregroundStyle(m.ai ? Color.white : p.ink)
                    .padding(.horizontal, 16)
                    .frame(height: 46)
                    .background(Capsule().fill(m.ai ? p.lab : p.card))
                    .shadow(color: Color.black.opacity(0.12), radius: 12, x: 0, y: 8)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(m.ai ? "AI-søk er på" : "Slå på AI-søk")
        }
        .padding(.bottom, 6)
        .onChange(of: m.query) { _, _ in m.changed(store) }
    }
}

/// Svaret fra ✦ AI og treffene, med stien til hver innstilling.
struct Set24Results: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var naming: Bool = false
    @State private var picking: Bool = false
    @MainActor private var m: Set24Model { Set24Model.shared }

    var body: some View {
        let hits: [Set24Item] = m.hits(store)
        let ans: String = m.ai ? (m.answer.isEmpty ? (m.busy ? "Tenker …" : m.localAnswer(store)) : m.answer) : ""
        // Prompt 25: «Ta meg dit →» når AI-et har funnet en innstilling (SettingsSearch.swift).
        let goIt: Set24Item? = (m.ai && !m.busy) ? hits.first : nil
        VStack(alignment: .leading, spacing: 6) {
            if !ans.isEmpty { answerCard(ans, goIt) }
            if hits.isEmpty {
                if !m.ai {
                    Text("Ingen treff. Slå på ✦ AI for å spørre med vanlige ord.").font(PF.ui(13)).foregroundStyle(p.mut).padding(.horizontal, 4)
                }
            } else {
                PLabel(text: (m.ai ? "✦ AI-forslag · " : "Treff · ") + "\(hits.count)").padding(.leading, 4).padding(.top, 8)
                PaperLinkList(rows: hits.map { (it: Set24Item) -> PaperLinkRow in
                    PaperLinkRow(name: it.title, sub: it.path + (it.sub.isEmpty ? "" : " · " + it.sub), icon: Set24Results.icon(it)) { tap(it) }
                })
            }
        }
        .sheet(isPresented: $naming) {
            AppName24Sheet { naming = false }.environment(\.paper, p).presentationDetents([.medium, .large]).sheetEdge30(p.bg)
        }
        .sheet(isPresented: $picking) {
            AppIconSheet { picking = false }.environment(\.paper, p).presentationDetents([.medium, .large]).sheetEdge30(p.bg)
        }
    }

    private func tap(_ it: Set24Item) {
        if it.route == "naming" { naming = true; return }
        if it.route == "icon" { picking = true; return }
        m.open(it, store)
    }

    private func answerCard(_ s: String, _ goIt: Set24Item?) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("✦").font(PF.ui(14, .heavy)).foregroundStyle(p.lab)
            VStack(alignment: .leading, spacing: 10) {
                Text(s).font(PF.ui(13.5)).foregroundStyle(p.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                if let goIt { Set25GoButton { m.goThere(goIt, store) } }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(p.line, lineWidth: 1))
    }

    static func icon(_ it: Set24Item) -> String {
        if it.route.hasPrefix("integ:") { return "point.3.connected.trianglepath.dotted" }
        if it.route.hasPrefix("profile:") { return "person.2" }
        switch it.route {
        case "naming": return "character.cursor.ibeam"
        case "icon": return "app.badge"
        case "news": return "newspaper"
        case "innst-ai": return "sparkles"
        case "innst-sik": return "lock"
        case "innst-varsler", "innst-haptikk", "innst-trk": return "bell"
        case "innst-ut", "innst-tilpass": return "paintpalette"
        case "innst-appprofil": return "person.2"
        case "innst-helse", "innst-fam", "innst-hahelse": return "heart.text.square"
        case "innst-brukere": return "person.2"
        default: return "gearshape"
        }
    }
}

// ---- Tidligere Settings25.swift ----

/* ---------------- Prompt 25: «Ta meg dit →» etter ✦ AI-søk i Innstillinger ----------------
   Fasit: design/Mobil Papir App.dc.html → Innstillinger → ✦ AI-søk (goSet). Knappen lukker søket, åpner riktig
   underside (eller blir på Innstillinger for rader der), scroller til raden (ScrollViewReader.scrollTo, .center)
   og fremhever den i ~3 s: lys rød bakgrunn og rød strek til venstre som toner ut. Et vanlig søketreff fremhever
   raden på samme måte. */

@MainActor
@Observable
final class Set25Focus {
    static let shared = Set25Focus()

    /// Navnet på raden som fremheves (tittelen i PaperLinkList, navnet på integrasjonen).
    var target: String? = nil
    /// Øker for hvert hopp, så siden scroller på nytt også når raden er den samme.
    var tick: Int = 0
    @ObservationIgnored private var clearTask: Task<Void, Never>? = nil

    func flash(_ name: String) {
        target = name
        tick += 1
        clearTask?.cancel()
        clearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_200_000_000)
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: 0.6)) { self.target = nil }
        }
    }

    nonisolated static func rowId(_ name: String) -> String { "set25:" + name }
}

/// Fremheving av én rad: lys rød bakgrunn og rød strek til venstre. Raden får id-en ScrollViewReader scroller til.
struct Set25Row<C: View>: View {
    @Environment(\.paper) private var p
    let name: String
    let content: C
    /// false: raden har allerede en egen id (f.eks. integrasjonene, som scroller selv).
    var withId: Bool = true
    @MainActor private var f: Set25Focus { Set25Focus.shared }

    var body: some View {
        if withId {
            styled.id(Set25Focus.rowId(name))
        } else {
            styled
        }
    }

    @MainActor private var styled: some View {
        let on: Bool = f.target == name
        return content
            .background(on ? p.lab.opacity(0.12) : Color.clear)
            .overlay(alignment: .leading) {
                Rectangle().fill(p.lab).frame(width: 3).opacity(on ? 1 : 0)
            }
            // Prompt 34: samme pulserende røde ring som på web (SettingsSearch.swift).
            .overlay { if on { Hl34Ring(radius: 8).padding(3).allowsHitTesting(false) } }
            .animation(.easeOut(duration: 0.6), value: on)
    }
}

extension View {
    func set25Highlight(_ name: String, id: Bool = true) -> some View { Set25Row(name: name, content: self, withId: id) }
}

extension Set24Model {
    /// «Ta meg dit →»: rader på en underside åpner undersiden, rader på Innstillinger blir der. Raden fremheves.
    func goThere(_ it: Set24Item, _ store: Store) {
        Haptics.shared.tap()
        let all: [Set24Item] = index(store)
        let parent: Set24Item? = all.first { (x: Set24Item) -> Bool in x.id != it.id && x.title == it.path && x.route.hasPrefix("innst-") }
        query = ""
        answer = ""
        aiIds = []
        if ai { ai = false }
        if it.route.hasPrefix("integ:") {
            Int24Model.shared.focus = String(it.route.dropFirst(6))
        }
        // Prompt 34: mål-id (Oppdater nå …) eller AI-kontroll: egen side og rød ring (SettingsSearch.swift).
        if open34(it, store) { return }
        if let parent {
            store.paperGo(parent.route)
        } else if store.paperTab != "innst" {
            store.paperGo("innst")
        }
        Set25Focus.shared.flash(it.title)
    }
}

/// Den svarte pilleknappen under AI-svaret.
struct Set25GoButton: View {
    @Environment(\.paper) private var p
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text("Vis meg nå ›").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                .padding(.horizontal, 16).frame(height: 38)
                .background(p.ink, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

// ---- Tidligere Settings34.swift ----

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
        // Prompt 67: Innstillinger → Glimt og undersidene (GlimtSettingsPages.swift).
        out.append(Set24Item(id: "glimt.innst67", title: "Glimt-innstillinger", sub: "Send til Chat etter, Forstår samtaler, minne, lærer og faste oppgaver", path: "Glimt og AI", route: "innst-glimt", anchor: ""))
        out.append(Set24Item(id: "glimt.husker67", title: "Glimt husker", sub: "Minne, forslag, motstrid og ikke brukt på lenge", path: "Glimt", route: G67Nav.husker, anchor: ""))
        out.append(Set24Item(id: "glimt.ent67", title: "Entitetsregister", sub: "Personer, steder, butikker og abonnementer med aliaser", path: "Glimt", route: G67Nav.ent, anchor: ""))
        out.append(Set24Item(id: "glimt.laerer67", title: "Glimt lærer", sub: "Oppskrifter, hurtigvei og rettelser", path: "Glimt", route: G67Nav.laerer, anchor: ""))
        out.append(Set24Item(id: "glimt.faste67", title: "Faste oppgaver", sub: "Planlagte oppgaver, påminnelser og varsler · Lag fra tekst", path: "Glimt", route: G67Nav.faste, anchor: ""))
        out.append(Set24Item(id: "glimt.kvalitet67", title: "Kvalitet", sub: "Ukerapport og nattlig eval", path: "Glimt", route: G67Nav.kvalitet, anchor: ""))
        // Prompt 68: «Innstillinger for nattlig eval» på Kvalitet (bare admin).
        if Update28Model.isAdmin(store) {
            out.append(Set24Item(id: "glimt.eval68", title: "Innstillinger for nattlig eval", sub: "Nattlig eval, ukerapport for alle, kjøringer per case, tidsgrense, gi plass etter og lagre rapporter",
                                 path: "Kvalitet", route: G67Nav.kvalitet, anchor: ""))
        }
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
