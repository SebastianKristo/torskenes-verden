import SwiftUI
import UIKit
import WidgetKit

/* ---------------- Prompt 34: Glimt-brief i appen – data og guide-runden ----------------
   Fasit: design/Glimt Brief.dc.html (page/card) og Mobil Papir App.dc.html (Hjem-kort øverst og brief-side i fullskjerm).
   prompts/prompt-34-pakke/claude-code-glimt-brief.md.
   GET /api/brief?kind=morning|day|evening (SERVER34, laget av Glimt og bufret til neste vindu). Svaret legges i App Group
   (w.brief34) og widgetene lastes på nytt. Uten endepunkt (eldre server): en enkel brief fra det appen allerede har
   (været fra /api/mobile, kalenderen og Siste nytt), så kortet og widgetene aldri er tomme.
   Guide-runden: Hei → Vær → Kalender → Nyheter → «Det var alt for nå». Starter automatisk første gang (kan slås av),
   trykk på figuren starter eller avslutter, lett haptikk ved hvert steg. «Reduser bevegelse» gir ingen svev eller spinn. */

@MainActor
@Observable
final class Brief34Model {
    static let shared = Brief34Model()

    var open: Bool = false
    var brief: Brief34? = Brief34.cached
    var loading: Bool = false
    var error: String = ""
    /// 0 = av, 1…5 = steg i guide-runden.
    var step: Int = 0
    @ObservationIgnored private var loadedAt: Date? = nil

    var autoTour: Bool {
        get { UserDefaults.standard.object(forKey: "brief34_autotour") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "brief34_autotour") }
    }

    func show() {
        Haptic34.light()
        step = 0
        open = true
    }

    func close() {
        Haptic34.back()
        step = 0
        open = false
    }

    /// Henter briefen (høyst hvert 10. minutt uten force).
    func load(_ store: Store, force: Bool = false) async {
        if !force, let at = loadedAt, Date().timeIntervalSince(at) < 600, brief != nil { return }
        loading = true
        defer { loading = false }
        let kind: String = Brief34.kindFor()
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/brief?kind=" + kind, timeout: 25)
            // Prompt 38: de nye kortene (pakker, familie, skole, bursdager, nordlys) – Brief38.swift.
            Brief38Cards.shared.parse(d)
            if let b = Brief34.parse(d) {
                brief = b
                error = ""
                loadedAt = Date()
                Brief34.store(d)
                WidgetCenter.shared.reloadTimelines(ofKind: Brief34.widgetKind)
                return
            }
        } catch let e as APIError {
            error = e.status == 404 ? "" : e.message
        } catch {
            self.error = error.localizedDescription
        }
        // Eldre server: en enkel brief fra appens egne data.
        if let b = fallback(store) {
            brief = b
            loadedAt = Date()
            if let d = Brief34Model.encode(b) {
                Brief34.store(d)
                WidgetCenter.shared.reloadTimelines(ofKind: Brief34.widgetKind)
            }
        }
    }

    private func fallback(_ store: Store) -> Brief34? {
        var b: Brief34 = Brief34()
        b.kind = Brief34.kindFor()
        if let w = store.mobileHome?.weather {
            if let t = w.temp { b.temp = String(Int(t.rounded())) + "°" }
            if let x = w.max { b.hi = String(Int(x.rounded())) + "°" }
            if let x = w.min { b.lo = String(Int(x.rounded())) + "°" }
            b.cond = (w.text ?? "").lowercased()
            b.place = w.place ?? "Oslo"
            b.icon = Brief34.icon(b.cond, code: nil)
        }
        b.events = Brief34Model.nextEvents(Cal26Model.shared.events)
        b.news = store.homeNews.prefix(3).map { (n: NewsItem) -> Brief34News in
            Brief34News(source: n.feed, title: n.title, url: n.url, time: JS.fmt(n.published, "HH:mm"))
        }
        b.generatedAt = Date()
        b.summary = Brief34Model.summary(b, name: store.displayName)
        if b.temp.isEmpty && b.events.isEmpty && b.news.isEmpty { return nil }
        return b
    }

    /// De 3 neste i dag og i morgen (ikke heldags).
    static func nextEvents(_ all: [CalEvent26]) -> [Brief34Event] {
        let now: Date = Date()
        let cal: Calendar = Calendar.current
        let end: Date = cal.startOfDay(for: now).addingTimeInterval(2 * 86_400)
        let list: [CalEvent26] = all.filter { !$0.allDay && $0.end > now && $0.start < end }.sorted { $0.start < $1.start }
        return list.prefix(3).map { (e: CalEvent26) -> Brief34Event in
            Brief34Event(id: e.id, title: e.title, time: JS.fmt(e.start, "HH:mm"), day: cal.isDateInToday(e.start) ? "i dag" : "i morgen",
                         place: e.room, color: e.hex(), date: e.dayKey)
        }
    }

    /// «God kveld, Sebastian. Lettskyet og 8° i Oslo. Neste er Tannlege kl. 15:15.»
    static func summary(_ b: Brief34, name: String) -> String {
        let first: String = name.split(separator: " ").first.map(String.init) ?? ""
        var parts: [String] = []
        switch b.kind {
        case "morning": parts.append("God morgen" + (first.isEmpty ? "." : ", " + first + "."))
        case "evening": parts.append("God kveld" + (first.isEmpty ? "." : ", " + first + "."))
        default: break
        }
        if !b.temp.isEmpty {
            let c: String = b.cond.isEmpty ? "" : Brief34Model.cap(b.cond) + " og "
            parts.append(c + b.temp + " i " + b.place + ".")
        }
        if let e = b.events.first {
            let lead: String = e.day == "i morgen" ? "I morgen starter du med " : "Neste er "
            parts.append(lead + e.title + " kl. " + e.time + ".")
        } else {
            parts.append("Kalenderen er fri.")
        }
        return parts.joined(separator: " ")
    }

    static func cap(_ s: String) -> String {
        guard let f = s.first else { return s }
        return String(f).uppercased() + String(s.dropFirst())
    }

    /// Samme form som /api/brief, så widgetene leser den på samme måte.
    static func encode(_ b: Brief34) -> Data? {
        let w: [String: Any] = ["now": b.temp, "hi": b.hi, "lo": b.lo, "cond": b.cond, "place": b.place, "icon": b.icon, "rain12h": b.rain,
                                "vsYesterday": b.vsYesterday, "sunset": b.sunset]
        let ev: [[String: Any]] = b.events.map { ["id": $0.id, "title": $0.title, "time": $0.time, "day": $0.day, "place": $0.place, "color": $0.color, "date": $0.date] }
        let nw: [[String: Any]] = b.news.map { ["source": $0.source, "title": $0.title, "url": $0.url, "time": $0.time] }
        let o: [String: Any] = ["kind": b.kind, "summary": b.summary, "weather": w, "events": ev, "news": nw,
                                "generatedAt": ISO8601DateFormatter().string(from: b.generatedAt ?? Date())]
        return try? JSONSerialization.data(withJSONObject: o)
    }

    /* ---------- Guide-runden ---------- */

    /// (mål-kort, tekst, knapp)
    func guide(_ b: Brief34) -> [(String, String, String)] {
        let wx: String = b.cond.isEmpty ? b.temp : Brief34Model.cap(b.cond) + ", " + b.temp
        let rainy: Bool = b.rain.contains { $0 >= 0.2 }
        let rainPart: String = rainy ? ", og det kommer regn." : "."
        let vaerText: String = "Først været. " + wx + " nå" + rainPart + " Søylene viser nedbøren time for time."
        let kal: String
        if let e = b.next {
            let parts: [String] = ["I kalenderen:", e.title, e.day, "kl.", e.time + ".", "Trykk på en avtale for å åpne Kalender."]
            kal = parts.filter { !$0.isEmpty }.joined(separator: " ")
        } else {
            kal = "Kalenderen din er fri."
        }
        return [
            ("", "Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din?", "Vis meg"),
            ("vaer", vaerText, "Neste"),
            ("kal", kal, "Neste"),
            ("nyh", "Og " + String(b.news.count) + " saker fra nyhetene. Trykk for å lese hele.", "Neste"),
            ("", "Det var alt for nå. Trykk på meg når du vil ha en ny runde.", "Takk, Glimt"),
        ]
    }

    func next(_ count: Int) {
        Haptic34.light()
        if step >= count { step = 0; return }
        step += 1
        if step > count { step = 0 }
    }

    func skip() {
        Haptic34.light()
        step = 0
    }

    func tapFigure() {
        Haptic34.light()
        step = step > 0 ? 0 : 1
    }

    /// Første gang briefen åpnes (og automatisk runde er på): runden starter etter 0,9 s.
    func autoStart() async {
        let key: String = "brief34_tour_seen"
        guard autoTour, Glimt35Model.shared.cfg.briefGlimt, !UserDefaults.standard.bool(forKey: key) else { return }
        try? await Task.sleep(nanoseconds: 900_000_000)
        if Task.isCancelled || !open { return }
        UserDefaults.standard.set(true, forKey: key)
        if step == 0 { step = 1 }
    }
}
