import SwiftUI

/* ---------------- Prompt 24: «Søk i innstillinger» og ✦ AI-søk (Mobil Papir App.dc.html → Innstillinger, ss) ----------------
   Søket indekserer alle innstillinger og undersider lokalt (også integrasjonene). Med ✦ AI sendes spørsmålet og listen
   til POST /api/settings/ai-search, som svarer med en setning og id-er. Uten AI-svar (eldre server, ingen nøkkel):
   ordlisten fra designet (SYN). */

struct Set24Item: Identifiable, Hashable {
    let id: String
    let title: String
    let sub: String
    let path: String
    /// innst-… (side), profile:…, integ:…, naming, icon, tabbar, news, imports, abo.
    let route: String
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
        "widget": ["Widgets"], "modul": ["Moduler"], "bruker": ["Kontoer og brukere"], "bilde": ["Unsplash/Pexels", "Utseende og fanelinje"],
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
        add("konto", "Kontoer og brukere", "Profil, brukere og flere kontoer", "Konto", "innst-konto")
        add("konto.bilde", "Profilbilde", "Vises i menyer og hilsener", "Kontoer og brukere", "innst-konto")
        add("sik", "Sikkerhet", "2FA, Face ID og pålitelige enheter", "Konto", "innst-sik")
        add("sik.2fa", "Totrinnsbekreftelse", "Autentiseringsapp", "Sikkerhet", "innst-sik")
        add("sik.face", "Face ID", "Lås opp appen", "Sikkerhet", "innst-sik")
        add("sik.okter", "Aktive økter", "Enheter som er logget inn", "Sikkerhet", "innst-sik")
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
        add("navstil", "Fanelinje-stil", "Tekst, bare ikoner eller ikoner + navn på valgt", AppMeta.shared.name, "innst")
        add("hl", "Moduler", "Sporing, Domener, Mat, Familie, Avganger og Vær", AppMeta.shared.name, "innst-hl")
        add("news", "Nyhetsleser", "Kilder, AI og ikoner på fanene", AppMeta.shared.name, "news")
        add("ut", "Utseende og fanelinje", "Tema (Papir lys / mørk), bakgrunn og fanelinje", "App", "innst-ut")
        add("varsler", "Varsler og haptikk", "Lyd, stille timer, grupper og Bursdager", "App", "innst-varsler")
        add("haptikk", "Haptikk", "Vibrasjon og styrke", "Varsler og haptikk", "innst-haptikk")
        add("trk", "Pakkevarsler", "Sporing og kvitteringer", "Varsler og haptikk", "innst-trk")
        add("kal", "Kalendere", "Google Kalender, Home Assistant, Skole-iCal og Canvas", "App", "innst-kal")
        add("integ", "Integrasjoner", "Home Assistant, Google, Entur, Bring og flere", "App", "innst-integ")
        add("helse", "Helse og posisjon", "Apple Health, posisjon og bakgrunn", "App", "innst-helse")
        add("fam", "Familie og helse", "Deling i Familie", "App", "innst-fam")
        add("avansert", "Avansert", "Skanning, widgets, server og data", "App", "innst-avansert")
        add("skann", "Skanning", "Kamera, beskjæring og AI", "Avansert", "innst-skann")
        add("widgets", "Widgets", "Hjemskjermen", "Avansert", "innst-widgets")
        add("server", "Server og synk", "Adresser og status", "Avansert", "innst-server")
        add("data", "Data og lagring", "Buffer og nedlastinger", "Avansert", "innst-data")
        add("backup", "Backup og data", "Eksport og gjenoppretting", "Avansert", "innst-backup")
        add("om", "Om appen", "Versjon og lisenser", "Avansert", "innst-om")
        if Update28Model.isAdmin(store) { add("oppdatering", "Oppdatering", "Versjon og oppdatering av serveren", "System", "innst-oppdatering") }
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
        } catch {
            // 404 (eldre server) eller ingen AI: ordlisten.
            answer = ""
            aiIds = []
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
            SearchField27(text: text, placeholder: m.ai ? "Spør, f.eks. «hvor bytter jeg ikon?»" : "Søk i innstillinger")
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
        // Prompt 25: «Ta meg dit →» når AI-et har funnet en innstilling (Settings25.swift).
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
        case "innst-ut": return "paintpalette"
        case "innst-helse", "innst-fam": return "heart.text.square"
        default: return "gearshape"
        }
    }
}
