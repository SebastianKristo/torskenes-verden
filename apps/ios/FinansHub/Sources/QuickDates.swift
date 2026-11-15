import Foundation

/* ---------------- Dato og tid i Glimt-søket og «Legg til i kalenderen» ----------------
 Fase 4 (D2, Q17): dato og klokkeslett tolkes av serverens felles datotolker (POST /api/dates/parse, server/dates/parse.js),
 samme regler som web, Android og Glimt. Før hadde appen en egen tolker (prompt 44, Time44Parse.swift) som kunne gi en annen dato
 enn serveren («mandag» på en mandag, «neste fredag»). Serveren eier datoen; appen rydder bare tittelen (innledningsord som
 «time hos» fjernes) og bruker serverens forhåndsvisning (/api/kalender/quick/parse) for resten. Uten svar: ingen lokal gjetning. */

enum QuickDates {
    /// Innledningsord som fjernes fra tittelen («time hos frisør Nina» → «Frisør Nina»).
    static let intro: Set<String> = ["time", "timen", "avtale", "avtalen", "book", "booke", "ny", "nytt", "legg", "til", "sett", "opp", "påminnelse"]

    /// POST /api/dates/parse. nil når serveren ikke svarer (eller er for gammel).
    @MainActor static func parse(_ text: String, _ store: Store, timeout: TimeInterval = 4) async -> DatesParseDTO? {
        let api: API = store.api
        let body: DatesParseRequest = DatesParseRequest(text: text, now: nil)
        return try? await api.fetch(DatesParseDTO.self, "POST", "/api/dates/parse", body: body, timeout: timeout)
    }

    /// Resten av teksten (uten dato og tid) som tittel: innledningsord fjernes, stor forbokstav. → (tittel, hadde innledningsord)
    static func title(_ rest: String) -> (String, Bool) {
        var words: [String] = rest.split(whereSeparator: { (c: Character) -> Bool in c == " " || c == "\n" || c == "\t" }).map(String.init)
        var hasIntro: Bool = false
        while let w = words.first {
            let l: String = w.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ".,;:–-"))
            if intro.contains(l) {
                hasIntro = true
                words.removeFirst()
                continue
            }
            if l == "hos" && hasIntro {
                words.removeFirst()
                continue
            }
            break
        }
        return (cleanTitle(words.joined(separator: " ")), hasIntro)
    }

    /// Fjern tegn i start og slutt (. , ; : –) og gi stor forbokstav.
    static func cleanTitle(_ s: String) -> String {
        let t: String = s.trimmingCharacters(in: CharacterSet(charactersIn: " .,;:–-").union(.whitespacesAndNewlines))
        guard let f = t.first else { return "" }
        return String(f).uppercased() + t.dropFirst()
    }

    /// Serverens tolkning som forhåndsvisning (samme form som /api/kalender/quick/parse gir). nil uten dato.
    static func preview(_ d: DatesParseDTO?) -> Quick29Preview? {
        guard let d, let date = d.date else { return nil }
        let t: (String, Bool) = title(d.rest)
        var v: Quick29Preview = Quick29Preview()
        v.ok = true
        v.title = t.0.isEmpty ? "Avtale" : t.0
        v.date = date
        v.start = d.time ?? ""
        v.end = d.end ?? ""
        v.isAppointment = t.1 || (!v.start.isEmpty && !t.0.isEmpty)
        v.why = "server"
        return v
    }

    /// Forhåndsvisningen fra /api/kalender/quick/parse med dato og tid fra den felles datotolkeren, og tittelen når
    /// forhåndsvisningen ga tom tittel eller «Avtale» (feilen fra prompt 44). Uten forhåndsvisning: datotolkerens.
    static func merge(_ server: Quick29Preview?, _ dates: DatesParseDTO?) -> Quick29Preview? {
        let local: Quick29Preview? = preview(dates)
        guard var s = server, s.ok else { return local }
        guard let l = local else { return s }
        let weak: Bool = s.title.isEmpty || s.title.lowercased() == "avtale" || s.title.lowercased() == "time"
        if weak { s.title = l.title }
        if !l.start.isEmpty {
            s.start = l.start
            // Slutt bare når teksten hadde et tidsrom; ellers forhåndsvisningens (varighet per type).
            if !l.end.isEmpty { s.end = l.end }
        }
        if !l.date.isEmpty { s.date = l.date }
        if l.isAppointment { s.isAppointment = true }
        return s
    }
}
