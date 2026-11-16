import SwiftUI

/* ---------------- Q26: det Homelabs gamle «Ny hendelse» hadde – nå i den delte Kalenderen ---------------- */
// • GJENTA (Ingen · Hver dag · Hver uke · Hver måned) og Merknad. Sendes som repeat og note (POST/PATCH /api/kalender/events).
// • «✦ Beskriv med Glimt»: skriv hendelsen med egne ord, serveren fyller ut skjemaet (POST /api/kalender/describe {text, today}
//   → {ok, event:{title, allDay, date, start, end, location, calendar, repeat, reminder, note}, note, error?}). Ingenting lagres
//   før brukeren trykker Legg til.
// • Utfylt skjema fra en lenke (kalender://ny?title=…&date=…&s=…&e=…&loc=…&note=…&err=…): Homelab åpner det når en rask time
//   ikke kunne tolkes («Fant ikke dato. Velg dato og lagre.»).

struct KalNewMore: View {
    @Environment(\.kal) private var t
    @Binding var f: KalNewForm

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "GJENTA")
            KalFlow(spacing: 6) {
                ForEach(KalSchool.repeats, id: \.0) { (r: (String, String)) in
                    KalChip(title: r.1, on: f.repeatRule == r.0) { f.repeatRule = r.0 }
                }
            }
            TextField("Merknad", text: $f.note, axis: .vertical)
                .lineLimit(2...5)
                .font(KalFont.ui(15)).foregroundStyle(t.ink)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(t.chip))
                .accessibilityLabel("Merknad")
        }
    }
}

/// «✦ Beskriv med Glimt»: et felt og en knapp øverst i Ny hendelse.
struct KalDescribeBox: View {
    @Environment(\.kal) private var t
    @Binding var f: KalNewForm
    @State private var text: String = ""
    @State private var busy: Bool = false
    @State private var msg: String = ""
    @State private var bad: Bool = false

    private var ready: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 && !busy }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "✦ BESKRIV MED GLIMT", color: t.acc)
            HStack(spacing: 8) {
                TextField("F.eks. tannlege fredag 14.30 hos Tannhuset", text: $text, axis: .vertical)
                    .lineLimit(1...3)
                    .font(KalFont.ui(14.5)).foregroundStyle(t.ink)
                    .submitLabel(.go)
                    .onSubmit { run() }
                KalPill(title: busy ? "Fyller ut …" : "Fyll ut", enabled: ready) { run() }
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(t.chip))
            if !msg.isEmpty {
                Text(msg).font(KalFont.ui(12.5, .semibold)).foregroundStyle(bad ? t.acc : t.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func run() {
        let q: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.count < 3 || busy { return }
        busy = true
        msg = ""
        Task { @MainActor in
            let r: KalDescribed = await KalDescribe.ask(q)
            busy = false
            bad = !r.error.isEmpty && !r.filled
            msg = r.error.isEmpty ? r.note : (r.note.isEmpty ? r.error : r.note + ". " + r.error)
            if r.filled {
                var nf: KalNewForm = f
                KalDescribe.fill(&nf, r)
                f = nf
                KalHaptic.done()
            }
        }
    }
}

/// Svaret fra POST /api/kalender/describe.
struct KalDescribed {
    var filled: Bool = false
    var title: String = ""
    var date: String = ""
    var allDay: Bool = false
    var start: Int? = nil
    var end: Int? = nil
    var location: String = ""
    var calendar: String = ""
    var repeatRule: String = "none"
    var reminder: String = ""
    var note: String = ""
    var text: String = ""
    var error: String = ""
}

@MainActor
enum KalDescribe {
    static func ask(_ text: String) async -> KalDescribed {
        var r: KalDescribed = KalDescribed()
        do {
            let d: Data = try await KalNet.send("POST", "/api/kalender/describe", json: ["text": text, "today": KalD.todayKey()], timeout: 30)
            let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
            let ev: [String: Any] = (o["event"] as? [String: Any]) ?? [:]
            r.title = KalParse.str(ev, "title")
            r.date = KalParse.str(ev, "date")
            r.allDay = KalParse.bool(ev, "allDay") ?? false
            r.start = KalLinks.minutes(KalParse.str(ev, "start"))
            r.end = KalLinks.minutes(KalParse.str(ev, "end"))
            r.location = KalParse.str(ev, "location")
            r.calendar = KalParse.str(ev, "calendar")
            r.repeatRule = KalSchool.repeatOf(KalParse.str(ev, "repeat"))
            r.reminder = KalParse.str(ev, "reminder")
            r.text = KalParse.str(ev, "note")
            r.note = KalParse.str(o, "note")
            r.error = KalParse.str(o, "error")
            r.filled = !r.title.isEmpty || KalD.valid(r.date)
        } catch let e as KalNetError {
            r.error = e.status == 404 ? "Serveren kan ikke fylle ut ennå. Oppdater homelab-serveren." : e.message
        } catch {
            r.error = error.localizedDescription
        }
        return r
    }

    /// Fyller skjemaet med det Glimt fant (bare feltene som ble funnet).
    static func fill(_ f: inout KalNewForm, _ r: KalDescribed) {
        if !r.title.isEmpty { f.title = r.title }
        if !r.location.isEmpty {
            f.loc = r.location
            f.lat = nil
            f.lon = nil
        }
        let day: String = KalD.valid(r.date) ? r.date : KalD.key(f.day)
        if KalD.valid(r.date) { f.day = KalD.date(r.date) }
        if let st = r.start {
            f.allDay = false
            f.start = KalD.at(day, st)
            f.end = KalD.at(day, Swift.min(1439, r.end ?? st + 60))
        } else if r.allDay {
            f.allDay = true
        } else {
            f.start = KalD.at(day, KalD.minutes(f.start))
            f.end = KalD.at(day, KalD.minutes(f.end))
        }
        if r.repeatRule != "none" { f.repeatRule = r.repeatRule }
        if let m = remMinutes(r.reminder) { f.rem = m < 0 ? nil : m }
        if !r.text.isEmpty && f.note.isEmpty { f.note = r.text }
        if r.calendar == "familie" {
            let s: KalStore = KalStore.shared
            if let c = s.cals.first(where: { (c: KalCal) -> Bool in c.writable && (c.id == "familie" || c.name.lowercased() == "familie") }) { f.cal = c.id }
        }
        f.error = ""
    }

    /// none → −1 (ingen), 15m/1h/day → minutter, ukjent → nil (behold valget).
    static func remMinutes(_ v: String) -> Int? {
        switch v {
        case "none": return -1
        case "15m": return 15
        case "1h": return 60
        case "day": return 1440
        default: return nil
        }
    }
}

extension KalStore {
    /// kalender://ny?title=…&date=…&s=…&e=…&loc=…&note=…&err=… → Ny hendelse, utfylt (ingenting lagres før Legg til).
    func openPrefilled(title: String, date: String?, start: Int?, end: Int?, loc: String, note: String, error: String) {
        let day: String = (date.map { (d: String) -> Bool in KalD.valid(d) } ?? false) ? (date ?? KalD.todayKey()) : KalD.todayKey()
        let st: Int = start ?? 9 * 60
        let en: Int = Swift.min(1439, Swift.max(st + 15, end ?? st + 60))
        var f: KalNewForm = KalNewForm()
        f.title = title
        f.day = KalD.date(day)
        f.allDay = false
        f.start = KalD.at(day, st)
        f.end = KalD.at(day, en)
        f.loc = loc
        f.note = note
        f.error = error
        f.cal = defCalId46
        f.rem = 60
        anchor = day
        presentNew46(f)
    }
}
