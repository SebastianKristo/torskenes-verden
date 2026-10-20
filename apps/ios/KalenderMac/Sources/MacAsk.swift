import Foundation

/* ---------------- Prompt 34: Glimt på Mac – lokale svar (ask() i Kalender App.dc.html, srLocal() i Kalender.dc.html) ---------------- */
// Neste X, oppsummer dag/uke, ledig tid, bursdager, frister, vær og «legg til …». Ukjent → serveren (POST /api/assist source:'calendar').
// Søkeord som web-fiksen (claude-code-kalender-web-ai-sok.md): stoppord og suffikser (-timen/-time/-avtale/-en/-et/-er) fjernes,
// og delord matcher begge veier med minst 4 tegn felles prefiks («frisørtime» → «frisør» → «Nina frisør»).

struct MacSlot: Hashable {
    let day: String
    let s: Int
    let e: Int
}

struct MacAnswer {
    var steps: [String] = []
    var text: String = ""
    var cards: [KalEvent] = []
    var slots: [MacSlot] = []
    var created: KalParsed? = nil
    /// Prompt 37: stedet i teksten (lagres på hendelsen og vises med kart).
    var loc: String = ""
    var unknown: Bool = false
    /// Feilmelding fra serveren («Glimt fikk ikke svar fra …»).
    var error: String = ""
}

@MainActor
enum MacAsk {
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

    /// Prompt 35: felles parseDay() (normaliserer tegnsetting, så «hva skjer i morgen?» gir i morgen og ikke i dag).
    static func dayOf(_ ql: String) -> String? {
        KalDay35.parseDay(ql)
    }

    static func wxText(_ k: String) -> String {
        guard let w = MacStore.shared.wx[k] else { return "" }
        let t: String = (KalWx.text[w.kind] ?? "Skyet").lowercased()
        let tail: String = w.kind == "regn" ? ", så ta med paraply." : "."
        return " Været: " + t + ", " + String(w.lo) + "–" + String(w.hi) + " grader" + tail
    }

    static func ask(_ q: String) -> MacAnswer {
        let st: MacStore = MacStore.shared
        let tk: String = KalD.todayKey()
        let nm: Int = KalD.minutesNow()
        // Prompt 35: normalisert (små bokstaver, uten ? ! , ; « » og løse punktum/kolon).
        let ql: String = KalDay35.norm(q)
        let up: [KalEvent] = st.upcoming(limit: 300).filter { (e: KalEvent) -> Bool in !e.cont }

        if KalRx.test("ledig|fri tid|finn tid|når kan jeg|har jeg tid|opptatt", ql) { return free(ql, tk: tk, nm: nm) }
        // Prompt 42: abonnementer og trekk – hurtigvei uten LLM.
        if let ab = MacAbAsk42.answer(ql) { return ab }
        if ql.contains("bursdag") { return birthdays(up) }
        // Prompt 37: intensjon før tekstsøk – «Neste prøve på skolen» er en skoleprøve i Studie, aldri «Viaplay-prøven slutter».
        if let sa = KalSchool37.answer(ql, up: up, cal: { (id: String) -> KalCal? in st.cal(id) }, rel: { (k: String) -> String in rel(k) }, tk: tk) {
            var a: MacAnswer = MacAnswer(steps: sa.steps)
            a.text = sa.text
            a.cards = sa.cards
            return a
        }
        if KalRx.test("frist|eksamen|innlevering|oblig", ql) { return deadlines(up) }
        if KalRx.test("(oppsummer|hva skjer|hva har jeg|program|plan|hvordan ser|hva står|what's on|whats on|what is on|what do i have|agenda)", ql)
            || KalDay35.isDayQuestion(q) { return summary(ql, tk: tk) }
        if KalRx.test("vær|regn|paraply", ql) {
            let d: String = dayOf(ql) ?? tk
            let w: String = wxText(d).trimmingCharacters(in: .whitespaces)
            var a: MacAnswer = MacAnswer(steps: ["Henter værvarsel for Oslo"])
            a.text = w.isEmpty ? "Har ikke værvarsel for den dagen ennå." : w.replacingOccurrences(of: "Været:", with: KalD.cap(rel(d)) + ":")
            return a
        }
        if KalRx.test("neste|når er|når har|når skal|når må", ql) { return next(ql, up: up, tk: tk) }
        if KalQuick.isQuestion(q) { return unknown(up) }
        let p: KalParsed = KalQuick.parse(q, defaultRem: st.defRem)
        let hasDigit: Bool = q.rangeOfCharacter(from: .decimalDigits) != nil
        if p.s != nil || hasDigit {
            let calName: String = st.cal(p.cal)?.name ?? "Personlig"
            var a: MacAnswer = MacAnswer(steps: ["Leser teksten", "Finner dato og tid", "Legger inn i " + calName])
            let when: String = p.allDay ? "" : " kl. " + KalD.hm(p.s ?? 0)
            let tail: String = p.allDay ? "." : ", med varsel " + KalD.remLabel(p.rem) + "."
            a.text = "Jeg la til «" + p.title + "» " + rel(p.day) + when + " i " + calName + tail
            a.created = p
            a.loc = KalPlace37.extract(q)
            if !a.loc.isEmpty { a.text += " Sted: " + a.loc + "." }
            return a
        }
        return unknown(up)
    }

    /// Ingen lokal forståelse: de neste 5 hendelsene, og serveren spørres parallelt.
    static func unknown(_ up: [KalEvent]) -> MacAnswer {
        var a: MacAnswer = MacAnswer(steps: ["Tenker"])
        let five: [KalEvent] = Array(up.prefix(5))
        a.text = five.isEmpty
            ? "Jeg er ikke sikker på hva du mener, og kalenderen er tom fremover."
            : "Jeg er ikke sikker på hva du mener, men her er det som skjer fremover …"
        a.cards = five
        a.unknown = true
        return a
    }

    static func birthdays(_ up: [KalEvent]) -> MacAnswer {
        let list: [KalEvent] = Array(up.filter { (e: KalEvent) -> Bool in e.kind == "bursdag" || e.cal == "b" }.prefix(3))
        var a: MacAnswer = MacAnswer(steps: ["Ser i Bursdager"])
        if list.isEmpty {
            a.text = "Ingen bursdager de neste ukene."
        } else {
            let names: [String] = list.map { (e: KalEvent) -> String in e.title + " " + rel(e.day) }
            a.text = "De neste bursdagene: " + names.joined(separator: ", ") + "."
        }
        a.cards = list
        return a
    }

    static func deadlines(_ up: [KalEvent]) -> MacAnswer {
        let list: [KalEvent] = Array(up.filter { (e: KalEvent) -> Bool in e.kind == "frist" && !KalSchool37.isTrialEvent(e) }.prefix(4))
        var a: MacAnswer = MacAnswer(steps: ["Ser i Studie", "Sorterer frister"])
        if let f = list.first {
            a.text = "Neste frist er " + MacStore.stripFrist(f.title) + " " + rel(f.day) + "."
            if list.count > 1 {
                let rest: [String] = list.dropFirst().map { (e: KalEvent) -> String in MacStore.stripFrist(e.title) + " " + rel(e.day) }
                a.text += " Etter det: " + rest.joined(separator: ", ") + "."
            }
        } else {
            a.text = "Ingen frister fremover."
        }
        a.cards = list
        return a
    }

    /// Ledig tid: hull ≥ 45 min mellom 08 og 21 (ettermiddag 12–20, formiddag 08–12).
    static func free(_ ql: String, tk: String, nm: Int) -> MacAnswer {
        let d: String = dayOf(ql) ?? KalD.addKey(tk, 1)
        let pm: Bool = KalRx.test("ettermiddag|kveld", ql)
        let am: Bool = KalRx.test("formiddag", ql)
        let lo: Int = pm ? 720 : 480
        let hi: Int = am ? 720 : (pm ? 1200 : 1260)
        let ev: [KalEvent] = MacStore.shared.on(d).filter { (e: KalEvent) -> Bool in !e.allDay }
        var t0: Int = d == tk ? Swift.max(lo, ((nm + 29) / 30) * 30) : lo
        var gaps: [(Int, Int)] = []
        for e in ev {
            let s: Int = Swift.min(e.startMin, hi)
            if s - t0 >= 45 { gaps.append((t0, s)) }
            t0 = Swift.max(t0, e.endMin)
        }
        if hi - t0 >= 45 { gaps.append((t0, hi)) }
        let dayName: String = KalD.cap(rel(d))
        var a: MacAnswer = MacAnswer(steps: ["Leser " + rel(d) + " i kalenderen", "Finner hull på minst 45 min", "Foreslår tider"])
        if gaps.isEmpty {
            a.text = dayName + " er det fullt mellom " + KalD.hm(lo) + " og " + KalD.hm(hi) + "."
        } else {
            let names: [String] = gaps.map { (g: (Int, Int)) -> String in KalD.hm(g.0) + "–" + KalD.hm(g.1) }
            a.text = dayName + " er du ledig " + joinAnd(names) + ". Klikk på en tid for å booke den."
        }
        a.slots = gaps.prefix(4).map { (g: (Int, Int)) -> MacSlot in MacSlot(day: d, s: g.0, e: Swift.min(g.1, g.0 + 60)) }
        return a
    }

    static func summary(_ ql: String, tk: String) -> MacAnswer {
        let st: MacStore = MacStore.shared
        if KalRx.test("uka|uke|denne uken|neste uke", ql) { return week(ql, tk: tk) }
        let d: String = dayOf(ql) ?? tk
        let list: [KalEvent] = st.on(d)
        let timed: [KalEvent] = list.filter { (e: KalEvent) -> Bool in !e.allDay }
        var a: MacAnswer = MacAnswer(steps: ["Leser " + rel(d), "Sjekker været", "Skriver oppsummering"])
        if list.isEmpty {
            a.text = KalD.cap(rel(d)) + " er helt fri." + wxText(d)
        } else {
            let noun: String = list.count == 1 ? " hendelse." : " hendelser."
            a.text = KalD.cap(rel(d)) + " har du " + String(list.count) + noun
            if let f = timed.first {
                let lastEnd: Int = timed.map { (e: KalEvent) -> Int in e.endMin }.max() ?? f.endMin
                a.text += " Første er " + f.title + " kl. " + KalD.hm(f.startMin) + ", og dagen er ferdig " + KalD.hm(lastEnd) + "."
            }
            a.text += wxText(d)
        }
        a.cards = Array(list.prefix(5))
        return a
    }

    static func week(_ ql: String, tk: String) -> MacAnswer {
        let st: MacStore = MacStore.shared
        let d0: String = ql.contains("neste uke") ? KalD.key(KalD.add(KalD.monday(KalD.today()), 7)) : tk
        var list: [KalEvent] = []
        var busyDay: String = d0
        var busyN: Int = -1
        for i in 0..<7 {
            let k: String = KalD.addKey(d0, i)
            let l: [KalEvent] = st.on(k).filter { (e: KalEvent) -> Bool in !e.cont }
            list.append(contentsOf: l)
            if l.count > busyN {
                busyN = l.count
                busyDay = k
            }
        }
        var a: MacAnswer = MacAnswer(steps: ["Leser 7 dager", "Finner travleste dag", "Skriver oppsummering"])
        a.text = "Du har " + String(list.count) + " hendelser de neste 7 dagene. Travlest er " + rel(busyDay) + " med " + String(busyN) + "."
        if let f = list.first(where: { (e: KalEvent) -> Bool in e.kind == "frist" }) { a.text += " Husk fristen: " + MacStore.stripFrist(f.title) + "." }
        if let b = list.first(where: { (e: KalEvent) -> Bool in e.cal == "b" || e.kind == "bursdag" }) { a.text += " Bursdag: " + b.title + "." }
        a.cards = Array(list.filter { (e: KalEvent) -> Bool in !e.kind.isEmpty || e.cal == "b" || (e.rem ?? 0) >= 60 }.prefix(4))
        return a
    }

    /* ---------- Søkeord ---------- */

    /// Prompt 37: felles søkeord (KalSchool37) – skole-ordene er stoppord, ingen «-en/-et»-stripping («skolen» ble «skol»).
    static func terms(_ q: String) -> [String] {
        KalSchool37.terms(q)
    }

    /// Delord begge veier med minst 4 tegn felles begynnelse.
    static func hit(_ hay: String, _ w: String) -> Bool {
        KalSchool37.hit(hay, w)
    }

    static func hay(_ e: KalEvent, loc: Bool) -> String {
        let name: String = MacStore.shared.cal(e.cal)?.name ?? ""
        let place: String = loc ? e.loc : ""
        return (e.title + " " + place + " " + name + " " + e.note).lowercased()
    }

    static func next(_ ql: String, up all: [KalEvent], tk: String) -> MacAnswer {
        let kw: [String] = terms(ql)
        // Prompt 37: skole-ord avgrenser til Studie; prøveperioder er med bare når man spør om dem. Alle søkeordene må treffe.
        let school: Bool = KalSchool37.isSchoolQ(ql)
        let trialQ: Bool = KalSchool37.isTrialQ(ql)
        let up: [KalEvent] = all.filter { (e: KalEvent) -> Bool in
            if KalSchool37.isTrialEvent(e) && !trialQ { return false }
            return !school || KalFag37.isStudy(e, MacStore.shared.cal(e.cal))
        }
        var m: KalEvent? = nil
        if kw.isEmpty {
            m = up.first { (e: KalEvent) -> Bool in !e.allDay }
        } else {
            m = up.first { (e: KalEvent) -> Bool in
                let h: String = hay(e, loc: true)
                return kw.allSatisfy { (w: String) -> Bool in hit(h, w) }
            }

        }
        let what: String = kw.joined(separator: " ")
        guard let e = m else {
            var a: MacAnswer = MacAnswer(steps: ["Søker etter «" + what + "»"])
            a.text = "Fant ingen kommende «" + what + "» de neste fire månedene."
            a.unknown = true
            return a
        }
        let days: Int = KalD.daysBetween(tk, e.day)
        let label: String = what.isEmpty ? "neste" : what
        var a: MacAnswer = MacAnswer(steps: ["Søker etter «" + label + "»", "Fant " + e.title])
        var t: String = kw.isEmpty ? "Neste er " + e.title + " " : "Neste " + what + " er " + e.title + " "
        t += rel(e.day)
        if !e.allDay { t += " kl. " + KalD.hm(e.startMin) }
        if !e.loc.isEmpty { t += ", " + e.loc }
        t += "."
        if days > 1 { t += " Det er om " + String(days) + " dager." }
        if let r = e.rem { t += " Du får varsel " + KalD.remLabel(r) + "." }
        a.text = t
        a.cards = [e]
        return a
    }

    /// Tekstsøk i søkearket: treff på tittel, sted, kalender og notat (delord som over).
    static func search(_ q: String, cal: String?) -> [KalEvent] {
        let st: MacStore = MacStore.shared
        let raw: String = q.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var kw: [String] = terms(raw)
        if kw.isEmpty && !raw.isEmpty { kw = [raw] }
        let from: String = KalD.addKey(KalD.todayKey(), -60)
        let list: [KalEvent] = st.all.filter { (e: KalEvent) -> Bool in
            if e.day < from { return false }
            if let cal, e.cal != cal { return false }
            if kw.isEmpty { return cal != nil }
            let h: String = hay(e, loc: true)
            return kw.allSatisfy { (w: String) -> Bool in hit(h, w) }
        }
        return list.sorted { (a: KalEvent, b: KalEvent) -> Bool in
            if a.day != b.day { return a.day < b.day }
            return (a.s ?? -1) < (b.s ?? -1)
        }
    }
}
