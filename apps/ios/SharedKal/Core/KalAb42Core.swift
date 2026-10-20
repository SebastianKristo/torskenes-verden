import Foundation

/* ---------------- Prompt 42: Abonnementer – trekkdatoer som egen kalender (appen, widgetene og Mac) ---------------- */
// Fasit: Kalender App.dc.html → CALS {k:'ab', n:'Abonnementer', c:'#3d7f8a', tx:'#2a5c64', lt:'#8fcdd6', src:'Finans'} og AB i events().
// Kalenderen er virtuell på serveren (source 'finans' / 'builtin', badge INNEBYGD) og bygges fra Subscription OS.
// Hendelsene er heldags og kommer med kind:'trekk' | 'trial', subId, amount, currency, account, logo, interval … (alle valgfrie).
// Ikke redigerbare i Kalender: arket viser «Endres i Finans → Abonnementer» og «Åpne i Finans ›».

/// Feltene fra Finans på én trekk-hendelse. nil på alle andre hendelser (og i eldre buffere).
struct KalAb42Info: Hashable, Codable {
    var subId: String = ""
    /// Tjenesten uten beløp («Netflix»).
    var name: String = ""
    var amount: Double? = nil
    var currency: String = "NOK"
    /// «Trekkes fra Felles konto».
    var account: String = ""
    /// Logo-URL (absolutt eller /finans/api/logo/…).
    var logo: String = ""
    /// monthly | yearly | quarterly | weekly | …
    var interval: String = ""
    /// «Hver måned den 22.» (serverens tekst når den finnes).
    var intervalText: String = ""
    /// Neste trekk «YYYY-MM-DD».
    var next: String = ""
    /// Tjenestens oppsigelsesside (når den er kjent).
    var cancelUrl: String = ""
    /// «Sagt opp 20. okt» (siste hendelse etter oppsigelse).
    var cancelled: String = ""
    /// TREKK | PRØVE | ÅRLIG
    var badge: String = "TREKK"
    /// Beløpet varierer (strøm o.l.): «ca.» eller «varierer».
    var varies: Bool = false
    /// Sammendraget «3 trekk · 627 kr» i Måned (antall trekk), 0 ellers.
    var sum: Int = 0
}

enum KalAb42 {
    static let hex: String = "#3d7f8a"
    static let textHex: String = "#2a5c64"
    static let lightHex: String = "#8fcdd6"
    static let calIds: Set<String> = ["ab", "abonnementer", "subscriptions", "abo", "finans-ab"]

    /* ---------- Kalenderen ---------- */

    static func isAbCal(_ c: KalCal) -> Bool {
        if calIds.contains(c.id.lowercased()) { return true }
        let src: String = ((c.p39?.source.isEmpty == false ? c.p39?.source : c.source) ?? "").lowercased()
        if src == "finans" || src == "subscriptions" { return true }
        return c.name.lowercased() == "abonnementer" && (c.builtin ?? false)
    }

    /// Kalenderen når serveren sender trekk-hendelser, men ikke selve kalenderen (eldre /api/kalender/calendars).
    static func localCal(_ id: String) -> KalCal {
        var c: KalCal = KalCal(id: id, name: "Abonnementer", hex: hex, lightHex: lightHex, textHex: textHex)
        c.writable = false
        c.builtin = true
        c.source = "finans"
        var i: KalCalInfo39 = KalCalInfo39()
        i.source = "finans"
        i.badge = "INNEBYGD"
        i.sourceLabel = "Finans · trekkdatoer"
        i.notify = true
        c.p39 = i
        return c
    }

    /// Legger til Abonnementer i lista når hendelsene viser til en kalender som ikke finnes der.
    static func ensureCal(_ cals: inout [KalCal], events: [KalEvent]) {
        for e in events where e.ab42 != nil {
            if cals.contains(where: { (c: KalCal) -> Bool in c.id == e.cal }) { continue }
            if cals.contains(where: { (c: KalCal) -> Bool in isAbCal(c) }) { continue }
            cals.append(localCal(e.cal))
        }
    }

    /* ---------- Hendelsene ---------- */

    static func isSub(_ e: KalEvent) -> Bool { e.ab42 != nil }

    /// Kalles fra KalParse.event: fyller ab42 når hendelsen kommer fra Abonnementer.
    static func decorate(_ ev: inout KalEvent, _ o: [String: Any]) {
        var src: [String: Any] = o
        for k in ["sub", "subscription", "finans", "meta"] {
            if let n = o[k] as? [String: Any] { for (a, b) in n where src[a] == nil { src[a] = b } }
        }
        let kind: String = KalParse.str(o, "kind").lowercased()
        let source: String = KalParse.str(o, "source").lowercased()
        let cal: String = (KalParse.str(o, "appCalendar").isEmpty ? KalParse.str(o, "calendar") : KalParse.str(o, "appCalendar")).lowercased()
        let subId: String = KalParse.str(src, "subId").isEmpty ? KalParse.str(src, "subscriptionId") : KalParse.str(src, "subId")
        let fromAb: Bool = calIds.contains(cal) || calIds.contains(ev.cal.lowercased()) || source == "finans" || source == "subscriptions"
        let isTrekk: Bool = kind == "trekk" || kind == "charge" || kind == "renewal" || kind == "fornyelse"
        if !(isTrekk || fromAb || (kind == "trial" && !subId.isEmpty)) { return }
        var x: KalAb42Info = KalAb42Info()
        x.subId = subId
        x.name = KalParse.str(src, "name").isEmpty ? KalParse.str(src, "subName") : KalParse.str(src, "name")
        if x.name.isEmpty { x.name = baseName(ev.title) }
        x.amount = KalParse.dbl(src, "amount") ?? KalParse.dbl(src, "price")
        let cur: String = KalParse.str(src, "currency")
        if !cur.isEmpty { x.currency = cur.uppercased() }
        x.account = KalParse.str(src, "account")
        x.logo = KalParse.str(src, "logo").isEmpty ? KalParse.str(src, "logoUrl") : KalParse.str(src, "logo")
        x.interval = (KalParse.str(src, "interval").isEmpty ? KalParse.str(src, "cycle") : KalParse.str(src, "interval")).lowercased()
        x.intervalText = KalParse.str(src, "intervalText").isEmpty ? KalParse.str(src, "intervalLabel") : KalParse.str(src, "intervalText")
        x.next = String((KalParse.str(src, "nextCharge").isEmpty ? KalParse.str(src, "next") : KalParse.str(src, "nextCharge")).prefix(10))
        x.cancelUrl = KalParse.str(src, "cancelUrl").isEmpty ? KalParse.str(src, "cancelURL") : KalParse.str(src, "cancelUrl")
        if let b = src["cancelled"] as? String { x.cancelled = b }
        if x.cancelled.isEmpty { x.cancelled = KalParse.str(src, "cancelledText") }
        x.varies = (KalParse.bool(src, "varies") ?? false) || (KalParse.bool(src, "variable") ?? false) || ev.title.contains("varierer") || ev.title.contains("ca.")
        let badge: String = KalParse.str(src, "badge").uppercased()
        if kind == "trial" || badge == "PRØVE" {
            x.badge = "PRØVE"
            ev.kind = "trial"
        } else {
            x.badge = (badge == "ÅRLIG" || ["yearly", "annual", "year", "arlig", "årlig"].contains(x.interval) || kind == "renewal" || kind == "fornyelse") ? "ÅRLIG" : "TREKK"
            ev.kind = "trekk"
        }
        ev.editable = false
        ev.ab42 = x
    }

    /// «Netflix · 149 kr» → «Netflix». «Viaplay: prøveperioden slutter · …» → «Viaplay».
    static func baseName(_ title: String) -> String {
        var t: String = title
        if let r = t.range(of: " · ") { t = String(t[..<r.lowerBound]) }
        if let r = t.range(of: ": prøveperioden") { t = String(t[..<r.lowerBound]) }
        if t.hasSuffix(" fornyes") { t = String(t.dropLast(8)) }
        return t.trimmingCharacters(in: .whitespaces)
    }

    /// Navnet i chips (Måned) og widgets.
    static func short(_ e: KalEvent) -> String {
        guard let x = e.ab42 else { return e.title }
        if x.sum > 0 { return e.title }
        return x.name.isEmpty ? baseName(e.title) : x.name
    }

    /* ---------- Beløp ---------- */

    /// 1486 → «1 486», 149.5 → «149,50» (mellomrom som tusenskille, som i fasiten).
    static func num(_ v: Double) -> String {
        let neg: Bool = v < 0
        let a: Double = abs(v)
        let whole: Int = Int(a.rounded(.down))
        let cents: Int = Int(((a - Double(whole)) * 100).rounded())
        var digits: String = String(cents == 100 ? whole + 1 : whole)
        var out: String = ""
        while digits.count > 3 {
            out = "\u{00A0}" + String(digits.suffix(3)) + out
            digits = String(digits.dropLast(3))
        }
        out = digits + out
        if cents > 0 && cents < 100 { out += "," + (cents < 10 ? "0" : "") + String(cents) }
        return (neg ? "−" : "") + out
    }

    static func money(_ v: Double, _ currency: String = "NOK") -> String {
        let c: String = currency.uppercased()
        if c == "NOK" || c.isEmpty || c == "KR" { return num(v) + " kr" }
        return num(v) + " " + c
    }

    /// Beløpet på raden: «149 kr», «ca. 1 486 kr» eller «varierer».
    static func amountText(_ e: KalEvent) -> String {
        guard let x = e.ab42 else { return "" }
        guard let a = x.amount else { return x.varies ? "varierer" : "" }
        return (x.varies ? "ca. " : "") + money(a, x.currency)
    }

    /// «Hver måned den 22.» (serverens tekst først).
    static func intervalText(_ e: KalEvent) -> String {
        guard let x = e.ab42 else { return "" }
        if !x.intervalText.isEmpty { return x.intervalText }
        let d: Int = KalD.dayOfMonth(KalD.date(e.day))
        switch x.interval {
        case "yearly", "annual", "year", "arlig", "årlig":
            return "Hvert år " + String(d) + ". " + KalD.months[KalD.month(KalD.date(e.day)) - 1]
        case "quarterly", "kvartal": return "Hvert kvartal den " + String(d) + "."
        case "weekly", "ukentlig": return "Hver uke på " + KalD.weekdays[KalD.wd(KalD.date(e.day))]
        case "": return e.kind == "trial" ? "Prøveperiode" : "Hver måned den " + String(d) + "."
        default: return "Hver måned den " + String(d) + "."
        }
    }

    /* ---------- Måned: mange trekk samme dag ---------- */

    /// Tre eller flere trekk samme dag blir én chip «3 trekk · 627 kr» (prøveperioder vises for seg).
    static func collapse(_ list: [KalEvent], min: Int = 3) -> [KalEvent] {
        let subs: [KalEvent] = list.filter { (e: KalEvent) -> Bool in e.ab42 != nil && e.kind != "trial" && !e.cont }
        if subs.count < min { return list }
        let total: Double = subs.reduce(0) { (a: Double, e: KalEvent) -> Double in a + (e.ab42?.amount ?? 0) }
        var sum: KalEvent = KalEvent(id: "ab42-sum-" + subs[0].day, title: String(subs.count) + " trekk · " + money(total), cal: subs[0].cal, day: subs[0].day, s: nil, e: nil)
        sum.kind = "trekk"
        var info: KalAb42Info = KalAb42Info()
        info.sum = subs.count
        info.amount = total
        info.name = sum.title
        sum.ab42 = info
        var out: [KalEvent] = []
        var placed: Bool = false
        let ids: Set<String> = Set(subs.map { (e: KalEvent) -> String in e.id })
        for e in list {
            if ids.contains(e.id) {
                if !placed { out.append(sum); placed = true }
                continue
            }
            out.append(e)
        }
        return out
    }

    /* ---------- Glimt ---------- */

    /// «… og 3 trekk på til sammen 627 kr.» – trekk i perioden (også når kalenderen er skjult).
    static func total(_ events: [KalEvent], from: String, to: String) -> (Int, Double) {
        var n: Int = 0
        var sum: Double = 0
        for e in events where e.ab42 != nil && e.kind != "trial" && !e.cont && e.day >= from && e.day <= to {
            n += 1
            sum += e.ab42?.amount ?? 0
        }
        return (n, sum)
    }

    static func weekLine(_ events: [KalEvent], from: String, to: String) -> String {
        let r: (Int, Double) = total(events, from: from, to: to)
        if r.0 == 0 { return "" }
        if r.0 == 1 { return " Ett trekk denne uka: " + money(r.1) + "." }
        return " Denne uka: " + String(r.0) + " trekk på til sammen " + money(r.1) + "."
    }

    static func isQuestion(_ ql: String) -> Bool {
        ql.range(of: "(trekk|trekkes|abonnement|abonnementer|\\babo\\b|fornyes|prøveperiode)", options: .regularExpression) != nil
    }

    /// Lokale svar uten LLM: «Hva trekkes denne uka?», «Når trekkes Netflix?», «Hvor mye går ut i abonnementer i november?».
    /// nil = ikke et abonnement-spørsmål. events = alle hendelser (også skjulte kalendere).
    static func answer(_ ql: String, events: [KalEvent], today: String) -> (steps: [String], text: String, cards: [KalEvent])? {
        if !isQuestion(ql) { return nil }
        let subs: [KalEvent] = events.filter { (e: KalEvent) -> Bool in e.ab42 != nil && !e.cont && e.day >= today }
            .sorted { (a: KalEvent, b: KalEvent) -> Bool in a.day < b.day }
        let steps: [String] = ["Ser i Abonnementer", "Regner sammen trekk"]
        if subs.isEmpty {
            return (steps, "Jeg finner ingen kommende trekk i Abonnementer. Er kalenderen slått på i Finans?", [])
        }
        // «Når trekkes Netflix?»
        if ql.contains("når") {
            for e in subs {
                let n: String = short(e).lowercased()
                if n.count >= 3 && ql.contains(n.components(separatedBy: " ").first ?? n) {
                    let amt: String = amountText(e)
                    let d: String = KalD.fd(KalD.date(e.day))
                    return (["Ser i Abonnementer"], short(e) + " trekkes " + d + (amt.isEmpty ? "" : " (" + amt + ")") + ".", [e])
                }
            }
        }
        // «… i november?»
        for (i, m) in KalD.months.enumerated() where ql.contains(m) {
            let yNow: Int = KalD.year(KalD.date(today))
            let mNow: Int = KalD.month(KalD.date(today))
            let y: Int = i + 1 < mNow ? yNow + 1 : yNow
            let from: String = String(format: "%04d-%02d-01", y, i + 1)
            let to: String = String(format: "%04d-%02d-31", y, i + 1)
            let list: [KalEvent] = events.filter { (e: KalEvent) -> Bool in e.ab42 != nil && e.kind != "trial" && !e.cont && e.day >= from && e.day <= to }
            let r: (Int, Double) = total(events, from: from, to: to)
            let text: String = r.0 == 0 ? "Ingen trekk i " + m + "." : "I " + m + " går det ut " + money(r.1) + " i abonnementer (" + String(r.0) + " trekk)."
            return (steps, text, Array(list.prefix(6)))
        }
        // «denne uka» / «neste uke» / ellers de neste 30 dagene.
        var to: String = KalD.addKey(today, 30)
        var label: String = "de neste 30 dagene"
        if ql.contains("uka") || ql.contains("uken") || ql.contains("denne uke") {
            to = KalD.addKey(KalD.key(KalWeek35.start(KalD.date(today))), 6)
            label = "denne uka"
        }
        if ql.contains("i dag") { to = today; label = "i dag" }
        if ql.contains("i morgen") { to = KalD.addKey(today, 1); label = "i dag og i morgen" }
        let list: [KalEvent] = subs.filter { (e: KalEvent) -> Bool in e.day <= to }
        let r: (Int, Double) = total(list, from: today, to: to)
        let trials: [KalEvent] = list.filter { (e: KalEvent) -> Bool in e.kind == "trial" }
        var text: String
        if r.0 == 0 {
            text = "Ingen trekk " + label + "."
            if let n = subs.first(where: { (e: KalEvent) -> Bool in e.kind != "trial" }) {
                text += " Neste er " + short(n) + " " + KalD.fd(KalD.date(n.day)) + "."
            }
        } else {
            let names: [String] = list.filter { (e: KalEvent) -> Bool in e.kind != "trial" }.prefix(4).map { (e: KalEvent) -> String in short(e) }
            text = (r.0 == 1 ? "Ett trekk " : String(r.0) + " trekk ") + label + " på til sammen " + money(r.1) + ": " + names.joined(separator: ", ") + (r.0 > 4 ? " …" : "") + "."
        }
        if let t = trials.first { text += " Prøveperioden for " + short(t) + " slutter " + KalD.fd(KalD.date(t.day)) + "." }
        return (steps, text, Array(list.prefix(6)))
    }

    /* ---------- Lenker ---------- */

    /// finanshub://abonnement/{subId} (Finans → Abonnementer i Homelab-appen).
    static func finansURL(_ e: KalEvent) -> URL? {
        let id: String = e.ab42?.subId ?? ""
        return URL(string: "finanshub://abonnement" + (id.isEmpty ? "" : "/" + KalNet.enc(id)))
    }

    /// Reserve: Subscription OS på web (<server>/finans/#/sub).
    static func webURL() -> URL? {
        guard let b = KalNet.session().0.first else { return nil }
        return URL(string: b.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/finans/#/sub")
    }

    /// Logo: absolutt URL (lastes uten token) eller sti på serveren (lastes med token via KalNet).
    static func logoPath(_ e: KalEvent) -> String {
        let l: String = e.ab42?.logo ?? ""
        if l.hasPrefix("http://") || l.hasPrefix("https://") || l.hasPrefix("/") || l.hasPrefix("data:") { return l }
        return ""
    }

    static func initial(_ e: KalEvent) -> String {
        String(short(e).prefix(1)).uppercased()
    }
}
