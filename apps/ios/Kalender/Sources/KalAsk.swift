import Foundation

/* ---------------- Prompt 33: Glimt i Kalender – lokale svar (ask() i fasiten) ---------------- */
// Neste X, oppsummer dag/uke, ledig tid (hull ≥ 45 min 08–21), bursdager, frister, vær og «legg til …».
// Er spørsmålet ukjent (eller en lang innlimt melding uten sikker tolking) går det til serveren: POST /api/assist {q, source:'calendar'}.

struct KalSlot: Hashable {
    let day: String
    let s: Int
    let e: Int
}

struct KalAnswer {
    var steps: [String] = []
    var text: String = ""
    var cards: [KalEvent] = []
    var slots: [KalSlot] = []
    /// Lagt til av Glimt (kan angres).
    var created: KalParsed? = nil
    /// Prompt 37: stedet i teksten («hos Nina frisør», «Hoffsveien 4») – lagres på hendelsen og vises med kart.
    var loc: String = ""
    /// true = ingen lokal regel passet (send til serveren).
    var unknown: Bool = false
}

@MainActor
enum KalAsk {
    static func rel(_ k: String) -> String {
        let tk: String = KalD.todayKey()
        if k == tk { return "i dag" }
        if k == KalD.addKey(tk, 1) { return "i morgen" }
        return KalD.fd(KalD.date(k))
    }

    static func joinAnd(_ list: [String]) -> String {
        if list.count <= 1 { return list.first ?? "" }
        let head: [String] = Array(list.dropLast())
        return head.joined(separator: ", ") + " og " + (list.last ?? "")
    }

    /// Dagen spørsmålet gjelder (i dag / i morgen / overmorgen / fredag / 25.10), eller nil.
    /// Prompt 35: felles parseDay() (normaliserer tegnsetting først, så «i morgen?» blir i morgen og ikke i dag).
    static func dayOf(_ ql: String) -> String? {
        KalDay35.parseDay(ql)
    }

    static func wxText(_ k: String) -> String {
        guard let w = KalStore.shared.wx[k] else { return "" }
        let t: String = (KalWx.text[w.kind] ?? "Skyet").lowercased()
        return " Været: " + t + ", " + String(w.lo) + "–" + String(w.hi) + " grader" + (w.kind == "regn" ? ", så ta med paraply." : ".")
    }

    static func ask(_ q: String) -> KalAnswer {
        let st: KalStore = KalStore.shared
        let tk: String = KalD.todayKey()
        let nm: Int = KalD.minutesNow()
        // Prompt 35: normalisert (små bokstaver, uten ? ! , ; « » og løse punktum/kolon).
        let ql: String = KalDay35.norm(q)
        let up: [KalEvent] = st.upcoming(limit: 300).filter { (e: KalEvent) -> Bool in !e.cont }

        if KalRx.test("ledig|fri tid|finn tid|når kan jeg|har jeg tid", ql) { return free(ql, tk: tk, nm: nm) }
        if ql.contains("bursdag") {
            let list: [KalEvent] = Array(up.filter { (e: KalEvent) -> Bool in e.kind == "bursdag" || e.cal == "b" }.prefix(3))
            var a: KalAnswer = KalAnswer(steps: ["Ser i Bursdager"])
            a.text = list.isEmpty ? "Ingen bursdager de neste ukene." : "De neste bursdagene: " + list.map { (e: KalEvent) -> String in e.title + " " + rel(e.day) }.joined(separator: ", ") + "."
            a.cards = list
            return a
        }
        // Prompt 37: intensjon før tekstsøk – «Neste prøve på skolen» er en skoleprøve i Studie, aldri «Viaplay-prøven slutter».
        if let sa = KalSchool37.answer(ql, up: up, cal: { (id: String) -> KalCal? in st.cal(id) }, rel: { (k: String) -> String in rel(k) }, tk: tk) {
            var a: KalAnswer = KalAnswer(steps: sa.steps)
            a.text = sa.text
            a.cards = sa.cards
            return a
        }
        if KalRx.test("frist|eksamen|innlevering|oblig", ql) {
            let list: [KalEvent] = Array(up.filter { (e: KalEvent) -> Bool in e.kind == "frist" && !KalSchool37.isTrialEvent(e) }.prefix(4))
            var a: KalAnswer = KalAnswer(steps: ["Ser i Studie", "Sorterer frister"])
            if let f = list.first {
                a.text = "Neste frist er " + KalStore.stripFrist(f.title) + " " + rel(f.day) + "."
                if list.count > 1 {
                    a.text += " Etter det: " + list.dropFirst().map { (e: KalEvent) -> String in KalStore.stripFrist(e.title) + " " + rel(e.day) }.joined(separator: ", ") + "."
                }
            } else {
                a.text = "Ingen frister fremover."
            }
            a.cards = list
            return a
        }
        if KalRx.test("(oppsummer|hva skjer|hva har jeg|program|plan|hvordan ser|hva står|what's on|whats on|what is on|what do i have|agenda)", ql)
            || KalDay35.isDayQuestion(q) { return summary(ql, tk: tk) }
        if KalRx.test("vær|regn|paraply", ql) {
            let d: String = dayOf(ql) ?? tk
            let w: String = wxText(d).trimmingCharacters(in: .whitespaces)
            var a: KalAnswer = KalAnswer(steps: ["Henter værvarsel for Oslo"])
            a.text = w.isEmpty ? "Har ikke værvarsel for den dagen ennå." : w.replacingOccurrences(of: "Været:", with: KalD.cap(rel(d)) + ":")
            return a
        }
        if KalRx.test("neste|når er|når har|når skal|når må", ql) { return next(ql, up: up, tk: tk) }
        // Opprett: «legg til tannlege fredag kl 9» eller en innlimt melding.
        let p: KalParsed = KalQuick.parse(q, defaultRem: st.defRem)
        let hasDigit: Bool = q.rangeOfCharacter(from: .decimalDigits) != nil
        if p.s != nil || hasDigit {
            var a: KalAnswer = KalAnswer(steps: ["Leser teksten", "Finner dato og tid", "Legger inn i " + (st.cal(p.cal)?.name ?? "Personlig")])
            let calName: String = st.cal(p.cal)?.name ?? "Personlig"
            a.text = "Jeg la til «" + p.title + "» " + rel(p.day) + (p.allDay ? "" : " kl. " + KalD.hm(p.s ?? 0)) + " i " + calName + (p.allDay ? "." : ", med varsel " + KalD.remLabel(p.rem) + ".")
            a.created = p
            a.loc = KalPlace37.extract(q)
            if !a.loc.isEmpty { a.text += " Sted: " + a.loc + "." }
            return a
        }
        var a: KalAnswer = KalAnswer(steps: ["Tenker"])
        a.text = "Jeg kan svare på ting som «Hva skjer i morgen?», «Når er neste frisørtime?» og «Finn ledig tid fredag», eller legge inn hendelser du skriver eller limer inn."
        a.unknown = true
        return a
    }

    static func free(_ ql: String, tk: String, nm: Int) -> KalAnswer {
        let d: String = dayOf(ql) ?? KalD.addKey(tk, 1)
        let ev: [KalEvent] = KalStore.shared.on(d).filter { (e: KalEvent) -> Bool in !e.allDay }
        var t0: Int = d == tk ? Swift.max(480, ((nm + 29) / 30) * 30) : 480
        var gaps: [(Int, Int)] = []
        for e in ev {
            if e.startMin - t0 >= 45 { gaps.append((t0, e.startMin)) }
            t0 = Swift.max(t0, e.endMin)
        }
        if 1260 - t0 >= 45 { gaps.append((t0, 1260)) }
        var a: KalAnswer = KalAnswer(steps: ["Leser " + rel(d) + " i kalenderen", "Finner hull på minst 45 min", "Foreslår tider"])
        if gaps.isEmpty {
            a.text = KalD.cap(rel(d)) + " er det fullt mellom 08 og 21."
        } else {
            let names: [String] = gaps.map { (g: (Int, Int)) -> String in KalD.hm(g.0) + "–" + KalD.hm(g.1) }
            a.text = KalD.cap(rel(d)) + " er du ledig " + joinAnd(names) + ". Trykk på en tid for å booke den."
        }
        a.slots = gaps.prefix(4).map { (g: (Int, Int)) -> KalSlot in KalSlot(day: d, s: g.0, e: Swift.min(g.1, g.0 + 60)) }
        return a
    }

    static func summary(_ ql: String, tk: String) -> KalAnswer {
        let st: KalStore = KalStore.shared
        if KalRx.test("uka|uke|denne uken|neste uke", ql) {
            let d0: String = ql.contains("neste uke") ? KalD.key(KalD.add(KalD.monday(KalD.today()), 7)) : tk
            var list: [KalEvent] = []
            var busyDay: String = d0
            var busyN: Int = -1
            for i in 0..<7 {
                let k: String = KalD.addKey(d0, i)
                let l: [KalEvent] = st.on(k).filter { (e: KalEvent) -> Bool in !e.cont }
                list.append(contentsOf: l)
                if st.on(k).count > busyN { busyN = st.on(k).count; busyDay = k }
            }
            var a: KalAnswer = KalAnswer(steps: ["Leser 7 dager", "Finner travleste dag", "Skriver oppsummering"])
            a.text = "Du har " + String(list.count) + " hendelser de neste 7 dagene. Travlest er " + rel(busyDay) + " med " + String(busyN) + "."
            if let f = list.first(where: { (e: KalEvent) -> Bool in e.kind == "frist" }) { a.text += " Husk fristen: " + KalStore.stripFrist(f.title) + "." }
            if let b = list.first(where: { (e: KalEvent) -> Bool in e.cal == "b" || e.kind == "bursdag" }) { a.text += " Bursdag: " + b.title + "." }
            a.cards = Array(list.filter { (e: KalEvent) -> Bool in !e.kind.isEmpty || e.cal == "b" || (e.rem ?? 0) >= 60 }.prefix(4))
            return a
        }
        let d: String = dayOf(ql) ?? tk
        let list: [KalEvent] = st.on(d)
        let timed: [KalEvent] = list.filter { (e: KalEvent) -> Bool in !e.allDay }
        var a: KalAnswer = KalAnswer(steps: ["Leser " + rel(d), "Sjekker været", "Skriver oppsummering"])
        if list.isEmpty {
            a.text = KalD.cap(rel(d)) + " er helt fri." + wxText(d)
        } else {
            a.text = KalD.cap(rel(d)) + " har du " + String(list.count) + (list.count == 1 ? " hendelse." : " hendelser.")
            if let f = timed.first {
                let lastEnd: Int = timed.map { (e: KalEvent) -> Int in e.endMin }.max() ?? f.endMin
                a.text += " Første er " + f.title + " kl. " + KalD.hm(f.startMin) + ", og dagen er ferdig " + KalD.hm(lastEnd) + "."
            }
            a.text += wxText(d)
        }
        a.cards = Array(list.prefix(5))
        return a
    }

    static func next(_ ql: String, up: [KalEvent], tk: String) -> KalAnswer {
        let st: KalStore = KalStore.shared
        // Prompt 37: stoppord inkluderer skole-ordene, ingen «-en/-et»-stripping, og alle søkeordene må treffe.
        let terms: [String] = KalSchool37.terms(ql)
        func hay(_ e: KalEvent, loc: Bool) -> String {
            let name: String = st.cal(e.cal)?.name ?? ""
            return (e.title + " " + (loc ? e.loc : "") + " " + name + " " + e.note).lowercased()
        }
        let school: Bool = KalSchool37.isSchoolQ(ql)
        let pool: [KalEvent] = up.filter { (e: KalEvent) -> Bool in
            if KalSchool37.isTrialEvent(e) && !KalSchool37.isTrialQ(ql) { return false }
            return !school || KalFag37.isStudy(e, st.cal(e.cal))
        }
        var m: KalEvent? = nil
        if terms.isEmpty {
            m = pool.first { (e: KalEvent) -> Bool in !e.allDay }
        } else {
            m = pool.first { (e: KalEvent) -> Bool in !e.allDay && KalSchool37.all(hay(e, loc: true), terms) }
            if m == nil { m = pool.first { (e: KalEvent) -> Bool in KalSchool37.all(hay(e, loc: true), terms) } }
        }
        let what: String = terms.joined(separator: " ")
        guard let e = m else {
            var a: KalAnswer = KalAnswer(steps: ["Søker etter «" + what + "»"])
            a.text = "Fant ingen kommende hendelse for «" + what + "»."
            a.unknown = true
            return a
        }
        let days: Int = KalD.daysBetween(tk, e.day)
        var a: KalAnswer = KalAnswer(steps: ["Søker etter «" + (what.isEmpty ? "neste" : what) + "»", "Fant " + e.title])
        var t: String = terms.isEmpty ? "Neste er " + e.title + " " : "Neste " + what + " er " + e.title + " "
        t += rel(e.day) + (e.allDay ? "" : " kl. " + KalD.hm(e.startMin)) + (e.loc.isEmpty ? "" : ", " + e.loc) + "."
        if days > 1 { t += " Det er om " + String(days) + " dager." }
        if let r = e.rem { t += " Du får varsel " + KalD.remLabel(r) + "." }
        a.text = t
        a.cards = [e]
        return a
    }
}
