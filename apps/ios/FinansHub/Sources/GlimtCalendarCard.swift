import SwiftUI

/* ---------------- Prompt 70 (GLIMTCAL70): kort A – Glimt legger avtalen rett i kalenderen ----------------
 claude-code-glimt-kalender-ikke-spor.md. Serveren legger avtalen i standardkalenderen og sender kortdata i
 actions[].result.card70 (POST /api/glimt/agent og /stream) eller card {k:'cal70', …} (Chat / /api/assist):
   {eventId, title, day:{mon,n,wd}, line, withText, calendar:{id,name,color}, calendars:[…], reminder:{label},
    undo:{method,url,ttlMs}, move:{method,url}, open:{deepLink}}
 Kortet: «✓ LAGT I KALENDEREN», datoblokk, tittel, tid · sted, «Med pappa», kalender-pillen (fargeprikk + navn ▾) og varsel,
 «Åpne i Kalender» og «Angre» (10 s). B: pillen folder ut lista INNE i kortet (44 pt rader, ✓ på valgt, «Foreslått» øverst);
 valget flytter avtalen med en gang (PATCH move.url {calendarId}). Ingen systemmeny (confirmationDialog er fjernet fra
 GlimtAgent45Host), ingen ark.
 Spørsmål (bare når noe mangler): ett kort spørsmål med knapper i kortet. «Velg dato» viser en datovelger i kortet
 (item.text har «{dato}» som byttes med datoen, og sendes uten choice så serveren tolker den nye teksten). */

struct Cal70Cal: Identifiable, Equatable {
    let id: String
    let name: String
    let color: String
    let source: String
    let suggested: Bool
    let isDefault: Bool
}

struct Cal70Data: Equatable {
    var eventId: String = ""
    var title: String = ""
    var mon: String = ""
    var n: Int = 0
    var wd: String = ""
    var line: String = ""
    var timeText: String = ""
    var place: String = ""
    var withText: String = ""
    var who: String = ""
    var calId: String = ""
    var calName: String = ""
    var calColor: String = "#b23a2a"
    var calendars: [Cal70Cal] = []
    var reminder: String = "Varsel 1 t før"
    var undoMethod: String = "POST"
    var undoPath: String = ""
    var movePath: String = ""
    var deepLink: String = ""
    var ttl: Double = 10

    /// card70 fra serveren (eller card {k:'cal70', …}). nil når eventId mangler.
    static func parse(_ o: [String: Any]?) -> Cal70Data? {
        guard let o, let id = JS.str(o, "eventId"), !id.isEmpty else { return nil }
        var c: Cal70Data = Cal70Data()
        c.eventId = id
        c.title = JS.str(o, "title") ?? ""
        let day: [String: Any]? = JS.dict(o, "day")
        c.mon = JS.str(day, "mon") ?? ""
        c.n = JS.int(day, "n") ?? 0
        c.wd = JS.str(day, "wd") ?? ""
        c.line = JS.str(o, "line") ?? ""
        c.timeText = JS.str(o, "timeText") ?? ""
        c.place = JS.str(o, "place") ?? ""
        c.withText = JS.str(o, "withText") ?? ""
        c.who = JS.strings(o, "with").first ?? ""
        let cal: [String: Any]? = JS.dict(o, "calendar")
        c.calId = JS.str(cal, "id") ?? ""
        c.calName = JS.str(cal, "name") ?? c.calId
        c.calColor = JS.str(cal, "color") ?? "#b23a2a"
        c.calendars = JS.list(o, "calendars").map { (x: [String: Any]) -> Cal70Cal in
            Cal70Cal(id: JS.str(x, "id") ?? "", name: JS.str(x, "name") ?? "", color: JS.str(x, "color") ?? "#7a7468",
                     source: JS.str(x, "source") ?? "", suggested: JS.bool(x, "suggested") ?? false, isDefault: JS.bool(x, "default") ?? false)
        }
        c.reminder = JS.str(JS.dict(o, "reminder"), "label") ?? "Varsel 1 t før"
        let undo: [String: Any]? = JS.dict(o, "undo")
        c.undoMethod = JS.str(undo, "method") ?? "POST"
        c.undoPath = Cal70Data.apiPath(JS.str(undo, "url") ?? "")
        c.ttl = (JS.num(undo, "ttlMs") ?? 10_000) / 1000
        c.movePath = Cal70Data.apiPath(JS.str(JS.dict(o, "move"), "url") ?? "")
        c.deepLink = JS.str(JS.dict(o, "open"), "deepLink") ?? ""
        return c
    }

    /// card70 i agentsvaret: calendar.create som er utført.
    static func of(_ o: [String: Any]) -> Cal70Data? {
        for a in JS.list(o, "actions") {
            if JS.str(a, "tool") != "calendar.create" || JS.str(a, "status") != "done" { continue }
            if let c = Cal70Data.parse(JS.dict(JS.dict(a, "result"), "card70")) { return c }
        }
        return nil
    }

    /// card70 som kort-ordbok for Chat ({k:'cal70', …}), eller nil.
    static func chatCard(_ a0: [String: Any]?) -> [String: Any]? {
        guard JS.str(a0, "tool") == "calendar.create", JS.str(a0, "status") == "done" else { return nil }
        guard var c = JS.dict(JS.dict(a0, "result"), "card70"), JS.str(c, "eventId") != nil else { return nil }
        c["k"] = "cal70"
        return c
    }

    /// «/api/glimt/agent/…» → «/glimt/agent/…» (store.api.callAt legger på /api).
    static func apiPath(_ u: String) -> String {
        if u.hasPrefix("/api/") { return String(u.dropFirst(4)) }
        return u
    }

    func sub(_ x: Cal70Cal) -> String {
        if x.suggested { return who.isEmpty ? "Foreslått" : "Foreslått · du nevnte " + who }
        if x.isDefault { return "Standardkalender" }
        return x.source
    }
}

/// Spørsmål med knapper i kortet (når serveren ikke sendte choices, f.eks. med samtaler av).
struct Cal70Opt: Identifiable, Equatable {
    let id: String
    let label: String
    let text: String
    let cancel: Bool
    var pick: Bool { text.contains("{dato}") }
}

struct Cal70Ask: Equatable {
    var question: String = ""
    var field: String = ""
    var text: String = ""
    var options: [Cal70Opt] = []

    static func parse(_ q: [String: Any]?) -> Cal70Ask? {
        guard let q else { return nil }
        var a: Cal70Ask = Cal70Ask()
        a.question = JS.str(q, "question") ?? ""
        a.field = JS.str(q, "field") ?? ""
        a.text = JS.str(q, "text") ?? ""
        a.options = JS.list(q, "options").compactMap { (x: [String: Any]) -> Cal70Opt? in
            let label: String = JS.str(x, "label") ?? ""
            if label.isEmpty { return nil }
            return Cal70Opt(id: JS.str(x, "id") ?? label, label: label, text: JS.str(x, "text") ?? "", cancel: JS.bool(x, "cancel") ?? false)
        }
        return a.options.isEmpty ? nil : a
    }
}

/// Hjem-svaret: kortet og spørsmålet som hører til svarteksten som vises nå.
@MainActor
@Observable
final class Cal70Model {
    static let shared = Cal70Model()

    var card: Cal70Data? = nil
    var ask: Cal70Ask? = nil
    var forText: String = ""

    /// Fra GlimtAgent45.show: kortet (utført calendar.create) og et strukturert spørsmål.
    func take(_ o: [String: Any], _ text: String) {
        forText = text
        card = Cal70Data.of(o)
        ask = JS.dict(o, "choices") == nil ? Cal70Ask.parse(JS.dict(o, "ask")) : nil
    }

    func showsCard(_ text: String) -> Bool { card != nil && forText == text }
    func showsAsk(_ text: String) -> Bool { ask != nil && forText == text }

    /// «{dato}» → «17.12.2026».
    static func fill(_ text: String, _ d: Date) -> String {
        text.replacingOccurrences(of: "{dato}", with: JS.fmt(d, "dd.MM.yyyy"))
    }
}

enum Cal70Mode { case home, chat, kal }

/// Kort A (Hjem og Chat: mørkt) / C (Kalender-farger).
struct Cal70CardView: View {
    @Environment(Store.self) private var store
    let mode: Cal70Mode
    @State private var c: Cal70Data
    @State private var open: Bool = false
    @State private var busy: Bool = false
    @State private var undone: Bool = false
    @State private var note: String = ""
    @State private var err: String = ""
    @State private var until: Date

    init(card: Cal70Data, mode: Cal70Mode) {
        self.mode = mode
        _c = State(initialValue: card)
        _until = State(initialValue: Date().addingTimeInterval(card.ttl))
    }

    private var dark: Bool { mode != .kal }
    private var ink: Color { dark ? Color(hex: "#f6f2ea") : Color(hex: "#1b1a17") }
    private var mut: Color { dark ? Color(hex: "#f6f2ea").opacity(0.8) : Color(hex: "#6b6558") }
    private var green: Color { dark ? Color(hex: "#8fd1a6") : Color(hex: "#2f7a4f") }
    private var pillBg: Color { dark ? Color.white.opacity(0.12) : Color(hex: "#fffdf8") }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if undone {
                Text("↶ ANGRET").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(mut)
                Text("«" + c.title + "» er fjernet fra kalenderen.").font(PF.ui(14, .medium)).foregroundStyle(mut)
            } else {
                head
                if mode == .kal { eventKal } else { eventHome }
                pills
                if open { list.transition(.opacity.combined(with: .move(edge: .top))) }
                if !err.isEmpty { Text(err).font(PF.ui(12.5, .semibold)).foregroundStyle(Color(hex: dark ? "#ffc2b6" : "#b23a2a")) }
                else if !note.isEmpty { Text(note).font(PF.ui(12.5, .semibold)).foregroundStyle(green) }
                if mode != .kal { buttons }
            }
        }
        .padding(mode == .home ? 0 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { background }
        .animation(.easeOut(duration: 0.18), value: open)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private var background: some View {
        if mode == .chat {
            RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color(hex: "#161412").opacity(0.92))
        } else if mode == .kal {
            RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color(hex: "#f3efe6"))
        }
    }

    private var head: some View {
        HStack(spacing: 8) {
            Text("✓").font(PF.ui(11, .bold)).foregroundStyle(Color.white)
                .frame(width: 18, height: 18).background(Color(hex: "#2f7a4f"), in: Circle())
            Text(mode == .kal ? "LAGT INN" : "LAGT I KALENDEREN").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(green)
        }
        .accessibilityElement(children: .combine)
    }

    private var dateBlock: some View {
        VStack(spacing: 2) {
            Text(c.mon).font(PF.ui(10, .bold)).foregroundStyle(Color(hex: "#b23a2a"))
            Text(String(c.n)).font(PF.serif(26, medium: true)).foregroundStyle(Color(hex: "#1b1a17"))
            Text(c.wd).font(PF.ui(10, .semibold)).foregroundStyle(Color(hex: "#6b6558"))
        }
        .frame(width: 52).padding(.vertical, 8)
        .background(Color(hex: "#fffdf8"), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var eventHome: some View {
        HStack(alignment: .center, spacing: 12) {
            dateBlock
            VStack(alignment: .leading, spacing: 3) {
                Text(c.title).font(PF.serif(21, medium: true)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
                Text(c.line).font(PF.ui(13, .medium)).foregroundStyle(mut)
                if !c.withText.isEmpty { Text(c.withText).font(PF.ui(13, .medium)).foregroundStyle(mut) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    private var kalLine: String {
        var parts: [String] = [c.wd + " " + String(c.n) + ". " + c.mon.lowercased(), c.timeText]
        if !c.place.isEmpty { parts.append(c.place) }
        if !c.withText.isEmpty { parts.append(c.withText.lowercased()) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var eventKal: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: c.calColor)).frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(c.title).font(PF.serif(19, medium: true)).foregroundStyle(ink)
                Text(kalLine).font(PF.ui(12.5, .medium)).foregroundStyle(mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }

    private func pill<L: View>(_ label: L) -> some View {
        label.font(PF.ui(12.5, .semibold)).foregroundStyle(ink)
            .padding(.horizontal, 12).frame(height: 34)
            .background(pillBg, in: Capsule())
            .overlay { if !dark { Capsule().stroke(Color(hex: "#d8d1c2"), lineWidth: 1) } }
    }

    private var calPill: some View {
        Button {
            Haptics.shared.select()
            err = ""
            open.toggle()
        } label: {
            pill(HStack(spacing: 7) {
                Circle().fill(Color(hex: c.calColor)).frame(width: 9, height: 9)
                Text(c.calName).lineLimit(1)
                Text("▾").opacity(0.7).rotationEffect(.degrees(open ? 180 : 0))
            })
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel("Kalender: " + c.calName + ". Bytt kalender")
    }

    private var pills: some View {
        HStack(spacing: 6) {
            calPill
            if mode == .kal {
                Button { openInCalendar() } label: { pill(Text("Vis i uka")).contentShape(Capsule()) }.buttonStyle(.plain)
                undoButtonKal
            } else {
                pill(Text(c.reminder))
            }
        }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("LEGG I").font(PF.mono(10)).tracking(1.2).foregroundStyle(mut.opacity(0.75)).padding(.top, 2)
            ForEach(c.calendars) { (x: Cal70Cal) in
                row(x)
            }
        }
    }

    private func row(_ x: Cal70Cal) -> some View {
        let on: Bool = x.id == c.calId
        let sub: String = c.sub(x)
        return Button { pick(x) } label: {
            HStack(spacing: 12) {
                Circle().fill(Color(hex: x.color)).frame(width: 11, height: 11)
                VStack(alignment: .leading, spacing: 1) {
                    Text(x.name).font(PF.ui(14, .semibold)).foregroundStyle(ink)
                    if !sub.isEmpty { Text(sub).font(PF.ui(11.5, .medium)).foregroundStyle(mut.opacity(0.75)) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(on ? "✓" : "").font(PF.ui(14, .bold)).foregroundStyle(green)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(on ? pillBg : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var buttons: some View {
        HStack(spacing: 8) {
            Button { openInCalendar() } label: {
                Text("Åpne i Kalender").font(PF.ui(13.5, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
                    .frame(maxWidth: .infinity).frame(height: 40)
                    .background(Color(hex: "#f6f2ea"), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            undoButton
        }
    }

    @ViewBuilder private var undoButton: some View {
        TimelineView(.periodic(from: .now, by: 1)) { (ctx: TimelineViewDefaultContext) in
            let left: Int = Int(ceil(until.timeIntervalSince(ctx.date)))
            if left > 0 {
                Button { Task { await undo() } } label: {
                    HStack(spacing: 6) {
                        Text("Angre").font(PF.ui(13.5, .bold))
                        Text(String(left)).font(PF.mono(11, bold: false)).opacity(0.65)
                    }
                    .foregroundStyle(ink).padding(.horizontal, 16).frame(height: 40)
                    .background(Color.white.opacity(0.12), in: Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .accessibilityLabel("Angre, " + String(left) + " sekunder igjen")
            }
        }
        .fixedSize()
    }

    @ViewBuilder private var undoButtonKal: some View {
        TimelineView(.periodic(from: .now, by: 1)) { (ctx: TimelineViewDefaultContext) in
            if until.timeIntervalSince(ctx.date) > 0 {
                Button { Task { await undo() } } label: { pill(Text("Angre")).contentShape(Capsule()) }
                    .buttonStyle(.plain).disabled(busy)
            }
        }
        .fixedSize()
    }

    private func openInCalendar() {
        Haptics.shared.tap()
        if let u = URL(string: c.deepLink), !c.deepLink.isEmpty { store.openDeepLink(u) }
    }

    private func pick(_ x: Cal70Cal) {
        if x.id == c.calId { open = false; return }
        Haptics.shared.select()
        busy = true
        err = ""
        let path: String = c.movePath
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "PATCH", path, json: ["calendarId": x.id], timeout: 20)
                if let n = Cal70Data.parse(JS.dict(JS.obj(d), "card70")) { c = n }
                note = "Flyttet til " + c.calName
                open = false
                await Cal26Model.shared.load(store, force: true)
            } catch {
                err = error.localizedDescription
            }
            busy = false
        }
    }

    private func undo() async {
        Haptics.shared.tap()
        busy = true
        err = ""
        do {
            _ = try await store.api.callAt("/api", c.undoMethod, c.undoPath, json: [:], timeout: 20)
            undone = true
            await Cal26Model.shared.load(store, force: true)
        } catch {
            err = error.localizedDescription
        }
        busy = false
    }
}

/// Valgknappene (choices) med «Velg dato»: datovelgeren vises i kortet; datoen sendes som ny tekst (uten choice).
struct Cal70Choices: View {
    let ch: Choices67
    let ink: Color
    let line: Color
    let font: Font
    let pick: (Choice67Item) -> Void
    let date: (String) -> Void
    @State private var dateFor: String = ""
    @State private var day: Date = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Choices67View(ch: ch, ink: ink, line: line, font: font) { (it: Choice67Item) in
                if it.text.contains("{dato}") { dateFor = it.text } else { pick(it) }
            }
            if !dateFor.isEmpty {
                Cal70DateRow(day: $day, ink: ink, line: line, font: font) { date(Cal70Model.fill(dateFor, day)) }
            }
        }
    }
}

/// Spørsmålet med knapper i kortet når serveren ikke sendte choices (fallback, aldri systemmeny).
struct Cal70AskView: View {
    let ask: Cal70Ask
    let ink: Color
    let line: Color
    let font: Font
    let send: (String, [String: Any]) -> Void
    let cancel: () -> Void
    @State private var dateFor: String = ""
    @State private var day: Date = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(ask.options) { (o: Cal70Opt) in
                Button { tap(o) } label: {
                    Text(o.label).font(font).foregroundStyle(ink).lineLimit(2)
                        .padding(.horizontal, 13).padding(.vertical, 7).frame(minHeight: 36)
                        .overlay(Capsule().stroke(line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            if !dateFor.isEmpty {
                Cal70DateRow(day: $day, ink: ink, line: line, font: font) { send(Cal70Model.fill(dateFor, day), [:]) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(ask.question)
    }

    private func tap(_ o: Cal70Opt) {
        Haptics.shared.select()
        if o.cancel { cancel(); return }
        if o.pick { dateFor = o.text; return }
        if ask.field == "calendar" && !ask.text.isEmpty { send(ask.text, ["calendarId": o.id]); return }
        send(o.text.isEmpty ? o.label : o.text, [:])
    }
}

struct Cal70DateRow: View {
    @Binding var day: Date
    let ink: Color
    let line: Color
    let font: Font
    let done: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            DatePicker("Dato", selection: $day, in: Date()..., displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .environment(\.locale, Locale(identifier: "nb_NO"))
            Button { done() } label: {
                Text("Legg inn").font(font).foregroundStyle(ink)
                    .padding(.horizontal, 14).frame(height: 36)
                    .overlay(Capsule().stroke(line, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Spørsmålet i Hjem-boblen (mørk): knappene sender svaret til Glimt (samme melding + context.calendarId for kalendervalg).
struct Assist31Cal70Ask: View {
    @Environment(Store.self) private var store
    let ask: Cal70Ask

    var body: some View {
        Cal70AskView(ask: ask, ink: Color.white, line: Color.white.opacity(0.3), font: PF.ui(13, .semibold), send: { (t: String, ctx: [String: Any]) in
            Cal70Model.shared.ask = nil
            GlimtAgent45.shared.ask = nil
            Task { _ = await GlimtAgent45.shared.home(t, store, context: ctx) }
        }, cancel: {
            Cal70Model.shared.ask = nil
            GlimtAgent45.shared.ask = nil
            var ans: Assist31Answer = Assist31Answer()
            ans.text = "Greit, jeg lot det være."
            ans.source = "glimt"
            Assist31.shared.showLocal36(Assist31.shared.homeQ, ans)
        })
    }
}
