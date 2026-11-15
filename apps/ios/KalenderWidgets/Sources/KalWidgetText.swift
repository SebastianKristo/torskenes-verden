import Foundation

/* ---------------- Prompt 70 (KAL70): tekstene i widgetene (fasit Kalender Widgets.dc.html) ---------------- */
// dl: «I dag» · «I morgen» · «Tir 28.»     span: «15:15–16:00» · «Hele dagen» · «Frist 23:59»
// wl: span i dag, ellers «I morgen · 19:00–20:30»     inline (låseskjerm): «15:15 Tannlege»

extension KalWData {
    static func isFrist70(_ e: KalEvent) -> Bool {
        e.kind.lowercased() == "frist"
    }

    static func dl70(_ day: String, now: Date) -> String {
        let tk: String = KalD.key(now)
        if day == tk { return "I dag" }
        if day == KalD.addKey(tk, 1) { return "I morgen" }
        let d: Date = KalD.date(day)
        let wd: String = KalD.cap(KalD.weekdaysShort[KalD.wd(d)])
        return wd + " " + String(KalD.dayOfMonth(d)) + "."
    }

    static func span70(_ e: KalEvent) -> String {
        if isFrist70(e) {
            guard let s = e.s else { return "Frist" }
            return "Frist " + KalD.hm(s)
        }
        if e.allDay { return "Hele dagen" }
        return KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
    }

    static func wl70(_ e: KalEvent, now: Date) -> String {
        let span: String = span70(e)
        if e.day == KalD.key(now) { return span }
        return dl70(e.day, now: now) + " · " + span
    }

    /// Kort tid foran tittelen: «15:15», «Hele» eller «Frist».
    static func hm70(_ e: KalEvent) -> String {
        if isFrist70(e) && e.s == nil { return "Frist" }
        if e.allDay { return "Hele" }
        return KalD.hm(e.startMin)
    }

    static func inline70(_ e: KalEvent, now: Date) -> String {
        let pre: String = e.day == KalD.key(now) ? "" : dl70(e.day, now: now) + " "
        return pre + hm70(e) + " " + e.title
    }

    /// Tom dag: «I morgen · Fotballtrening 19:00».
    static func nextDayText70(_ e: KalEvent, now: Date) -> String {
        dl70(e.day, now: now) + " · " + e.title + " " + hm70(e)
    }

    static func hex70(_ s: KalSnapshot, _ e: KalEvent) -> String {
        evCal(s, e)?.hex ?? "#b23a2a"
    }

    static func title70(_ s: KalSnapshot, _ e: KalEvent) -> String {
        KalBd41.listTitle(e, calName: cal(s, e.cal)?.name ?? "")
    }

    /// Sted, ellers kalendernavnet.
    static func place70(_ s: KalSnapshot, _ e: KalEvent) -> String {
        if !e.loc.isEmpty { return e.loc }
        return cal(s, e.cal)?.name ?? ""
    }

    /// Kommende hendelser i dag (etter Innstillinger → Widgets).
    static func today70(_ s: KalSnapshot, now: Date) -> [KalEvent] {
        let tk: String = KalD.key(now)
        return upcoming(s, now: now).filter { (e: KalEvent) -> Bool in e.day == tk }
    }

    /// «UKE 44» etter «Uken starter».
    static func weekText70(_ d: Date) -> String {
        "UKE " + String(KalWeek35.weekNo(KalWeek35.start(d)))
    }

    /// Fargen på prikken under en dag i månedsrutenettet (første synlige hendelse), nil = ingen.
    static func dotHex70(_ s: KalSnapshot, _ key: String) -> String? {
        let off: Set<String> = KalWPrefs70.off
        let first: KalEvent? = s.events.first { (e: KalEvent) -> Bool in
            e.day == key && !off.contains(e.cal) && (cal(s, e.cal)?.shown ?? true)
        }
        guard let f = first else { return nil }
        return hex70(s, f)
    }
}
