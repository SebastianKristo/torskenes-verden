import SwiftUI

/* ---------------- Prompt 70 (GLIMTCAL70): kort C i Kalender-appen – samme kort som A, i Kalenders farger ----------------
 claude-code-glimt-kalender-ikke-spor.md. Glimt-panelet (KalGlimt.swift) får card {k:'cal70', …} eller created.card70 fra
 /api/assist (samme motor som Hjem). I stedet for «Hvilken kalender?»-tekst vises:
   «✓ LAGT INN», fargestrek + «Kino: Dune», «tor 17. des · 17:30–20:15 · Colosseum Kino · med pappa»,
   piller: kalender ▾ (folder ut lista i kortet, PATCH move.url {calendarId}) · Vis i uka · Angre (10 s).
 Spørsmål (bare når noe mangler) vises som knapper i panelet; svaret sendes til POST /api/glimt/agent med samme tekst og
 context.calendarId (kalendervalg) eller teksten med datoen («{dato}» → 17.12.2026). Ingen systemmeny, ingen ark. */

struct KalCal70Cal: Identifiable, Equatable {
    let id: String
    let name: String
    let color: String
    let sub: String
}

struct KalCal70Data: Equatable {
    var eventId: String = ""
    var title: String = ""
    var date: String = ""
    var line: String = ""
    var calId: String = ""
    var calName: String = ""
    var calColor: String = "#b23a2a"
    var calendars: [KalCal70Cal] = []
    var undoMethod: String = "POST"
    var undoURL: String = ""
    var moveURL: String = ""
    var ttl: Double = 10

    static func parse(_ o: [String: Any]?) -> KalCal70Data? {
        guard let o, let id = o["eventId"] as? String, !id.isEmpty else { return nil }
        var c: KalCal70Data = KalCal70Data()
        c.eventId = id
        c.title = (o["title"] as? String) ?? ""
        c.date = (o["date"] as? String) ?? ""
        c.line = KalCal70Data.lineOf(o)
        let cal: [String: Any] = (o["calendar"] as? [String: Any]) ?? [:]
        c.calId = (cal["id"] as? String) ?? ""
        c.calName = (cal["name"] as? String) ?? c.calId
        c.calColor = (cal["color"] as? String) ?? "#b23a2a"
        let who: String = ((o["with"] as? [String]) ?? []).first ?? ""
        c.calendars = ((o["calendars"] as? [[String: Any]]) ?? []).map { (x: [String: Any]) -> KalCal70Cal in
            KalCal70Cal(id: (x["id"] as? String) ?? "", name: (x["name"] as? String) ?? "", color: (x["color"] as? String) ?? "#7a7468", sub: KalCal70Data.subOf(x, who: who))
        }
        let undo: [String: Any] = (o["undo"] as? [String: Any]) ?? [:]
        c.undoMethod = (undo["method"] as? String) ?? "POST"
        c.undoURL = (undo["url"] as? String) ?? ""
        c.ttl = ((undo["ttlMs"] as? Double) ?? 10_000) / 1000
        c.moveURL = ((o["move"] as? [String: Any])?["url"] as? String) ?? ""
        return c
    }

    private static func subOf(_ x: [String: Any], who: String) -> String {
        if (x["suggested"] as? Bool) == true { return who.isEmpty ? "Foreslått" : "Foreslått · du nevnte " + who }
        if (x["default"] as? Bool) == true { return "Standardkalender" }
        return (x["source"] as? String) ?? ""
    }

    /// «tor 17. des · 17:30–20:15 · Colosseum Kino · med pappa»
    private static func lineOf(_ o: [String: Any]) -> String {
        let day: [String: Any] = (o["day"] as? [String: Any]) ?? [:]
        let n: Int = (day["n"] as? Int) ?? Int((day["n"] as? Double) ?? 0)
        let d: String = ((day["wd"] as? String) ?? "") + " " + String(n) + ". " + ((day["mon"] as? String) ?? "").lowercased()
        var parts: [String] = [d, (o["timeText"] as? String) ?? ""]
        if let p = o["place"] as? String, !p.isEmpty { parts.append(p) }
        if let w = o["withText"] as? String, !w.isEmpty { parts.append(w.lowercased()) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// Spørsmål med knapper (svaret går til POST /api/glimt/agent).
struct KalCal70Opt: Identifiable, Equatable {
    let id: String
    let label: String
    let text: String
    let cancel: Bool
}

struct KalCal70Ask: Equatable {
    var question: String = ""
    var field: String = ""
    var text: String = ""
    var options: [KalCal70Opt] = []

    static func parse(_ q: [String: Any]?) -> KalCal70Ask? {
        guard let q else { return nil }
        var a: KalCal70Ask = KalCal70Ask()
        a.question = (q["question"] as? String) ?? ""
        a.field = (q["field"] as? String) ?? ""
        a.text = (q["text"] as? String) ?? ""
        a.options = ((q["options"] as? [[String: Any]]) ?? []).compactMap { (x: [String: Any]) -> KalCal70Opt? in
            let label: String = (x["label"] as? String) ?? ""
            if label.isEmpty { return nil }
            return KalCal70Opt(id: (x["id"] as? String) ?? label, label: label, text: (x["text"] as? String) ?? "", cancel: (x["cancel"] as? Bool) == true)
        }
        return a.options.isEmpty ? nil : a
    }
}

/// Fanger kortet/spørsmålet fra /api/assist-svaret (KalGlimtServer.answer) til KalGlimtModel.run setter dem på meldingen.
@MainActor
enum KalCal70 {
    static var card: String = ""
    static var ask: String = ""

    static func capture(_ raw: [String: Any]) {
        let o: [String: Any] = (raw["answer"] as? [String: Any]) ?? (raw["result"] as? [String: Any]) ?? raw
        var c: [String: Any]? = nil
        if let k = o["card"] as? [String: Any], (k["k"] as? String) == "cal70" { c = k }
        if c == nil, let cr = o["created"] as? [String: Any], let k = cr["card70"] as? [String: Any] { c = k }
        card = c.flatMap { KalCal70.json($0) } ?? ""
        let agent: [String: Any] = (o["agent"] as? [String: Any]) ?? [:]
        ask = (agent["ask"] as? [String: Any]).flatMap { KalCal70.json($0) } ?? ""
    }

    static func take() -> (String, String) {
        let r: (String, String) = (card, ask)
        card = ""
        ask = ""
        return r
    }

    static func json(_ o: [String: Any]) -> String? {
        guard let d = try? JSONSerialization.data(withJSONObject: o) else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func obj(_ s: String) -> [String: Any]? {
        if s.isEmpty { return nil }
        return (try? JSONSerialization.jsonObject(with: Data(s.utf8))) as? [String: Any]
    }

    /// Svar på spørsmålet: POST /api/glimt/agent {text, module:'calendar', context} → ny melding i panelet med kortet.
    static func answer(_ text: String, context: [String: Any]) {
        let g: KalGlimtModel = KalGlimtModel.shared
        let nextId: Int = (g.msgs.map { $0.id }.max() ?? 0) + 1
        g.msgs.append(KalGlimtMsg(id: nextId, user: true, text: text))
        var a: KalGlimtMsg = KalGlimtMsg(id: nextId + 1, user: false, text: "")
        a.thinking = true
        a.steps = ["Leser teksten", "Lagrer i kalenderen"]
        g.msgs.append(a)
        var body: [String: Any] = ["text": text, "module": "calendar", "requestId": "kc70" + UUID().uuidString.replacingOccurrences(of: "-", with: "")]
        if !context.isEmpty { body["context"] = context }
        Task { @MainActor in
            var reply: String = ""
            var c70: String = ""
            var ask70: String = ""
            do {
                let d: Data = try await KalNet.send("POST", "/api/glimt/agent", json: body, timeout: 30)
                let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
                reply = ((o["reply"] as? String) ?? "").replacingOccurrences(of: "**", with: "")
                for x in (o["actions"] as? [[String: Any]]) ?? [] {
                    if let k = (x["result"] as? [String: Any])?["card70"] as? [String: Any] { c70 = KalCal70.json(k) ?? "" }
                }
                if let q = o["ask"] as? [String: Any] { ask70 = KalCal70.json(q) ?? "" }
                if !c70.isEmpty { await KalStore.shared.load(force: true) }
            } catch {
                reply = "Glimt fikk ikke svart: " + error.localizedDescription
            }
            guard let i = g.msgs.firstIndex(where: { $0.id == nextId + 1 }) else { return }
            var m: KalGlimtMsg = g.msgs[i]
            m.thinking = false
            m.text = reply
            m.shown = 9999
            m.c70 = c70
            m.ask70 = ask70
            g.msgs[i] = m
            KalHaptic.done()
        }
    }
}

/// Kort C (Kalenders farger).
struct KalCal70Card: View {
    @Environment(\.kal) private var t
    @State private var c: KalCal70Data
    @State private var open: Bool = false
    @State private var busy: Bool = false
    @State private var undone: Bool = false
    @State private var note: String = ""
    @State private var err: String = ""
    @State private var until: Date

    init(card: KalCal70Data) {
        _c = State(initialValue: card)
        _until = State(initialValue: Date().addingTimeInterval(card.ttl))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if undone {
                Text("↶ ANGRET").font(KalFont.mono(10.5)).tracking(1.2).foregroundStyle(t.mut)
                Text("«" + c.title + "» er fjernet fra kalenderen.").font(KalFont.ui(13.5, .medium)).foregroundStyle(t.mut)
            } else {
                head
                event
                pills
                if open { list.transition(.opacity.combined(with: .move(edge: .top))) }
                if !err.isEmpty { Text(err).font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.red) }
                else if !note.isEmpty { Text(note).font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.green) }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.bg, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .animation(.easeOut(duration: 0.18), value: open)
        .accessibilityElement(children: .contain)
    }

    private var head: some View {
        HStack(spacing: 8) {
            Text("✓").font(KalFont.ui(11, .bold)).foregroundStyle(Color.white)
                .frame(width: 18, height: 18).background(t.green, in: Circle())
            Text("LAGT INN").font(KalFont.mono(10.5)).tracking(1.2).foregroundStyle(t.green)
        }
        .accessibilityElement(children: .combine)
    }

    private var event: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(Color(kalHex: c.calColor)).frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(c.title).font(KalFont.serif(19)).foregroundStyle(t.ink)
                Text(c.line).font(KalFont.ui(12.5, .medium)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }

    private func pill<L: View>(_ label: L) -> some View {
        label.font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.ink)
            .padding(.horizontal, 12).frame(height: 34)
            .background(t.card, in: Capsule())
            .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
            .contentShape(Capsule())
    }

    private var pills: some View {
        HStack(spacing: 6) {
            Button { KalHaptic.tap(); err = ""; open.toggle() } label: {
                pill(HStack(spacing: 7) {
                    Circle().fill(Color(kalHex: c.calColor)).frame(width: 9, height: 9)
                    Text(c.calName).lineLimit(1)
                    Text("▾").opacity(0.7).rotationEffect(.degrees(open ? 180 : 0))
                })
            }
            .buttonStyle(.plain).disabled(busy)
            .accessibilityLabel("Kalender: " + c.calName + ". Bytt kalender")
            Button { showWeek() } label: { pill(Text("Vis i uka")) }.buttonStyle(.plain)
            TimelineView(.periodic(from: .now, by: 1)) { (ctx: TimelineViewDefaultContext) in
                if until.timeIntervalSince(ctx.date) > 0 {
                    Button { Task { await undo() } } label: { pill(Text("Angre")) }.buttonStyle(.plain).disabled(busy)
                }
            }
            .fixedSize()
        }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("LEGG I").font(KalFont.mono(10)).tracking(1.2).foregroundStyle(t.mut).padding(.top, 2)
            ForEach(c.calendars) { (x: KalCal70Cal) in row(x) }
        }
    }

    private func row(_ x: KalCal70Cal) -> some View {
        let on: Bool = x.id == c.calId
        return Button { pick(x) } label: {
            HStack(spacing: 12) {
                Circle().fill(Color(kalHex: x.color)).frame(width: 11, height: 11)
                VStack(alignment: .leading, spacing: 1) {
                    Text(x.name).font(KalFont.ui(14, .semibold)).foregroundStyle(t.ink)
                    if !x.sub.isEmpty { Text(x.sub).font(KalFont.ui(11.5, .medium)).foregroundStyle(t.mut) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(on ? "✓" : "").font(KalFont.ui(14, .bold)).foregroundStyle(t.green)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(on ? t.card : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func showWeek() {
        KalHaptic.tap()
        KalStore.shared.glimtOpen = false
        KalStore.shared.go(view: "uke", day: c.date)
    }

    private func pick(_ x: KalCal70Cal) {
        if x.id == c.calId { open = false; return }
        KalHaptic.tap()
        busy = true
        err = ""
        let url: String = c.moveURL
        Task { @MainActor in
            do {
                let d: Data = try await KalNet.send("PATCH", url, json: ["calendarId": x.id], timeout: 20)
                let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
                if let n = KalCal70Data.parse(o["card70"] as? [String: Any]) { c = n }
                note = "Flyttet til " + c.calName
                open = false
                await KalStore.shared.load(force: true)
            } catch {
                err = error.localizedDescription
            }
            busy = false
        }
    }

    private func undo() async {
        KalHaptic.tap()
        busy = true
        err = ""
        do {
            _ = try await KalNet.send(c.undoMethod, c.undoURL, json: [:], timeout: 20)
            undone = true
            await KalStore.shared.load(force: true)
        } catch {
            err = error.localizedDescription
        }
        busy = false
    }
}

/// Spørsmålet med knapper i panelet. «Velg dato» viser en datovelger i panelet.
struct KalCal70AskView: View {
    @Environment(\.kal) private var t
    let ask: KalCal70Ask
    @State private var dateFor: String = ""
    @State private var day: Date = Date()
    @State private var gone: Bool = false

    var body: some View {
        if !gone {
            VStack(alignment: .leading, spacing: 6) {
                KalFlow(spacing: 6) {
                    ForEach(ask.options) { (o: KalCal70Opt) in
                        Button { tap(o) } label: {
                            Text(o.label).font(KalFont.ui(13, .semibold)).foregroundStyle(t.ink)
                                .padding(.horizontal, 13).frame(minHeight: 36)
                                .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                if !dateFor.isEmpty { dateRow }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(ask.question)
        }
    }

    private var dateRow: some View {
        HStack(spacing: 8) {
            DatePicker("Dato", selection: $day, in: Date()..., displayedComponents: .date)
                .labelsHidden().datePickerStyle(.compact)
                .environment(\.locale, Locale(identifier: "nb_NO"))
            Button {
                let f: DateFormatter = DateFormatter()
                f.dateFormat = "dd.MM.yyyy"
                send(dateFor.replacingOccurrences(of: "{dato}", with: f.string(from: day)), [:])
            } label: {
                Text("Legg inn").font(KalFont.ui(13, .bold)).foregroundStyle(t.bg)
                    .padding(.horizontal, 14).frame(height: 36)
                    .background(t.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private func tap(_ o: KalCal70Opt) {
        KalHaptic.tap()
        if o.cancel { gone = true; return }
        if o.text.contains("{dato}") { dateFor = o.text; return }
        if ask.field == "calendar" && !ask.text.isEmpty { send(ask.text, ["calendarId": o.id]); return }
        send(o.text.isEmpty ? o.label : o.text, [:])
    }

    private func send(_ text: String, _ ctx: [String: Any]) {
        gone = true
        KalCal70.answer(text, context: ctx)
    }
}
