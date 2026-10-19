import SwiftUI
import UIKit

/* ---------------- Prompt 32: Kalender – bunnstripe, farger, søk med Glimt og «Beskriv med Glimt» ---------------- */
// Fasit: design/Kalender.dc.html → sr / srLocal() / srCloud() / srMark() (søk) og fmAi() (Ny hendelse).
// Spesifikasjon: claude-code-ios-bunnstripe.md, claude-code-kalender-fargekontrast.md, claude-code-kalender-maned-brikker.md,
// claude-code-kalender-sok-glimt.md og claude-code-kalender-ny-hendelse-glimt.md.
// API (SERVER32): GET /api/kalender/search?q=&ai=1 → {answer, events} · POST /api/kalender/describe {text} → utfylt hendelse.

enum Cal32b {
    static let purple: Color = Color(hex: "#7a5ad6")
    static let green: Color = Color(hex: "#2f7a4f")
    static let red: Color = Color(hex: "#b23a2a")

    /// Hjemindikatoren (safe area nederst) i nøkkelvinduet.
    @MainActor static var bottomInset: CGFloat {
        let scene: UIWindowScene? = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let w: UIWindow? = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
        return w?.safeAreaInsets.bottom ?? 0
    }

    /// Bunnpadding i scroll-innholdet: safe area + fanelinja (62) + luft, så siste time kan scrolles fram over linja.
    @MainActor static var scrollBottom: CGFloat { bottomInset + 96 }

    /// color-mix(in oklab, a pct, b) – tilnærmet i sRGB (godt nok for bakgrunner og tekst).
    static func mix(_ a: Color, _ pct: Double, over b: Color) -> Color {
        let ua: UIColor = UIColor(a)
        let ub: UIColor = UIColor(b)
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        ua.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        ub.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let t: CGFloat = CGFloat(pct)
        let r: CGFloat = r1 * t + r2 * (1 - t)
        let g: CGFloat = g1 * t + g2 * (1 - t)
        let bl: CGFloat = b1 * t + b2 * (1 - t)
        return Color(red: Double(r), green: Double(g), blue: Double(bl))
    }

    static func fold(_ s: String) -> String {
        s.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "nb_NO"))
    }
}

/* ---------- Søk: modell ---------- */

struct Cal32bAnswer: Equatable {
    var q: String
    var text: String = ""
    var events: [CalEvent26] = []
    var busy: Bool = true
}

struct Cal32bDayGroup: Identifiable {
    let id: String
    let title: String
    let rel: String
    let items: [CalEvent26]
}

@MainActor
@Observable
final class Cal32bSearch {
    static let shared = Cal32bSearch()

    var filter: String = "alle"
    var answer: Cal32bAnswer? = nil
    private var askTask: Task<Void, Never>? = nil

    static let filters: [(String, String)] = [("alle", "Alle"), ("timeplan", "Timeplan"), ("prover", "Prøver og frister"), ("skole", "Skole (iCal)"),
                                              ("privat", "Privat"), ("familie", "Familie"), ("bursdager", "Bursdager")]
    static let suggestions: [String] = ["Hva har jeg i morgen?", "Når er neste prøve?", "Er jeg ledig fredag ettermiddag?", "Hva skjer neste uke?"]

    private var events: [CalEvent26] { Cal26Model.shared.events }

    func passes(_ e: CalEvent26) -> Bool { filter == "alle" || e.group == filter }

    /// SNART: de neste fire hendelsene (etter filteret).
    func soon(_ now: Date) -> [CalEvent26] {
        let list: [CalEvent26] = events.filter { (e: CalEvent26) -> Bool in e.end >= now && passes(e) }
        return Array(list.sorted { (a: CalEvent26, b: CalEvent26) -> Bool in a.start < b.start }.prefix(4))
    }

    /// Treffene fra serveren/lokalt, gruppert per dag: kommende først, så tidligere.
    func groups(_ results: [CalEvent26], now: Date) -> [Cal32bDayGroup] {
        let tk: String = Cal26.key(now)
        let list: [CalEvent26] = results.filter { (e: CalEvent26) -> Bool in passes(e) }
        var keys: [String] = []
        var by: [String: [CalEvent26]] = [:]
        for e in list {
            if by[e.dayKey] == nil { keys.append(e.dayKey) }
            by[e.dayKey, default: []].append(e)
        }
        let up: [String] = keys.filter { $0 >= tk }.sorted()
        let past: [String] = keys.filter { $0 < tk }.sorted(by: >)
        var out: [Cal32bDayGroup] = []
        for k in up + past {
            let d: Date = Cal26.day(k)
            let n: Int = Cal26.daysUntil(k, from: now)
            out.append(Cal32bDayGroup(id: k, title: Cal26.cap(Cal26.dLong(d)), rel: Cal32bSearch.rel(n), items: by[k] ?? []))
        }
        return out
    }

    nonisolated static func rel(_ n: Int) -> String {
        if n == 0 { return "i dag" }
        if n == 1 { return "i morgen" }
        if n == -1 { return "i går" }
        if n > 1 { return "om \(n) dager" }
        return "\(-n) dager siden"
    }

    func countText(_ results: [CalEvent26]) -> String {
        let n: Int = results.filter { (e: CalEvent26) -> Bool in passes(e) }.count
        if filter == "alle" { return "\(n) treff" }
        let name: String = Cal32bSearch.filters.first(where: { $0.0 == filter })?.1 ?? filter
        return "\(n) treff i \(name)"
    }

    func clearAnswer() {
        askTask?.cancel()
        answer = nil
    }

    /// «✦ Spør» / Enter: lokalt først, ellers AI på serveren (de neste 14 dagene som grunnlag).
    func ask(_ q: String, _ store: Store) {
        let text: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return }
        askTask?.cancel()
        Haptics.shared.tap()
        if let local = Cal32bGlimt.local(text, events: events, now: Date()) {
            answer = Cal32bAnswer(q: text, text: local.0, events: Array(local.1.prefix(6)), busy: false)
            return
        }
        answer = Cal32bAnswer(q: text)
        askTask = Task { @MainActor in
            let qq: String = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
            var out: Cal32bAnswer = Cal32bAnswer(q: text, busy: false)
            do {
                let d: Data = try await store.api.callAt("/api", "GET", "/kalender/search?q=\(qq)&ai=1", timeout: 40)
                let o: [String: Any] = JS.obj(d)
                let ans: String = JS.str(o, "answer") ?? JS.str(o, "text") ?? JS.str(JS.dict(o, "ai"), "answer") ?? ""
                // Prompt 34: AI-feil fra serveren (aiError / error) vises i stedet for et tomt svar.
                let aiErr: String = JS.str(o, "aiError") ?? JS.str(o, "aiErrorText") ?? JS.str(JS.dict(o, "ai"), "error") ?? ""
                if ans.isEmpty && !aiErr.isEmpty {
                    out.text = Assist31.errorText34(aiErr, model: JS.str(JS.dict(o, "ai"), "model"))
                } else {
                    out.text = ans.isEmpty ? "Glimt fant ikke noe svar i kalenderen." : ans
                }
                out.events = Array(Cal26.parse(d).events.prefix(6))
            } catch let e as APIError {
                out.text = Assist31.errorText34(e.message, model: nil) + " Prøv igjen, eller søk med vanlige ord."
            } catch {
                out.text = "Glimt svarte ikke. Prøv igjen, eller søk med vanlige ord."
            }
            if Task.isCancelled { return }
            self.answer = out
            // Gikk brukeren ut av appen: svaret som varsel (claude-code-ai-bakgrunnsvarsel.md).
            if UIApplication.shared.applicationState != .active {
                Notify31.postAnswer(body: out.text, go: "kalender", chatId: "", id: "cal32-" + String(Int(Date().timeIntervalSince1970)))
            }
        }
    }
}

/* ---------- Glimt lokalt (raskt, uten nett) ---------- */

enum Cal32bGlimt {
    static func local(_ q: String, events: [CalEvent26], now: Date) -> (String, [CalEvent26])? {
        let t: String = Cal32b.fold(q)
        if t.contains("ledig") { return free(t, events: events, now: now) }
        if t.contains("prove") || t.contains("frist") || t.contains("eksamen") { return tests(events: events, now: now) }
        if let r = range(t, now: now) { return period(r.0, r.1, r.2, events: events, now: now) }
        if t.contains("neste") || t.hasPrefix("nar ") { return nextOf(t, events: events, now: now) }
        return nil
    }

    /// (fra, antall dager, navn) for «i dag», «i morgen», «fredag», «neste uke», «resten av uka».
    static func range(_ t: String, now: Date) -> (Date, Int, String)? {
        let d0: Date = Cal26.startOfDay(now)
        if t.contains("i overmorgen") { return (Cal26.add(d0, 2), 1, "I overmorgen") }
        if t.contains("i morgen") || t.contains("imorgen") { return (Cal26.add(d0, 1), 1, "I morgen") }
        if t.contains("i dag") || t.contains("idag") { return (d0, 1, "I dag") }
        if t.contains("neste uke") {
            let wd: Int = (Cal26.jsDay(d0) + 6) % 7
            return (Cal26.add(d0, 7 - wd), 7, "Neste uke")
        }
        if t.contains("resten av uka") || t.contains("resten av uken") || t.contains("denne uka") || t.contains("denne uken") {
            let wd: Int = (Cal26.jsDay(d0) + 6) % 7
            return (d0, 7 - wd, "Resten av uka")
        }
        if let w = weekday(t) {
            var diff: Int = (w - Cal26.jsDay(d0) + 7) % 7
            if diff == 0 && t.contains("neste") { diff = 7 }
            let d: Date = Cal26.add(d0, diff)
            return (d, 1, Cal26.cap(Cal26.dLong(d)))
        }
        return nil
    }

    static func weekday(_ t: String) -> Int? {
        let names: [String] = ["sondag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lordag"]
        for (i, n) in names.enumerated() where t.contains(n) { return i }
        return nil
    }

    static func on(_ d: Date, _ events: [CalEvent26]) -> [CalEvent26] {
        let k: String = Cal26.key(d)
        return events.filter { (e: CalEvent26) -> Bool in e.dayKey == k }.sorted { (a: CalEvent26, b: CalEvent26) -> Bool in a.start < b.start }
    }

    static func period(_ from: Date, _ n: Int, _ name: String, events: [CalEvent26], now: Date) -> (String, [CalEvent26]) {
        var all: [CalEvent26] = []
        for i in 0..<n { all.append(contentsOf: on(Cal26.add(from, i), events)) }
        if all.isEmpty { return (name + " har du ingenting i kalenderen.", []) }
        let lessons: Int = all.filter { (e: CalEvent26) -> Bool in e.type == "time" }.count
        let ting: String = all.count == 1 ? "1 ting" : "\(all.count) ting"
        var s: String = name + " har du " + ting
        if lessons > 0 && lessons < all.count { s += ", \(lessons) av dem i timeplanen" }
        if lessons == all.count && all.count > 1 { s += ", alle i timeplanen" }
        s += "."
        if let f = all.first {
            let at: String = f.startMin >= 0 ? " kl. " + f.startText : ""
            s += " Først ut: " + f.title + at + "."
        }
        return (s, all)
    }

    /// Ledige tidsrom 08–20 (ettermiddag 12–20, formiddag 08–12), minst 30 min.
    static func free(_ t: String, events: [CalEvent26], now: Date) -> (String, [CalEvent26]) {
        let r: (Date, Int, String) = range(t, now: now) ?? (Cal26.startOfDay(now), 1, "I dag")
        let d: Date = r.0
        var lo: Int = 8 * 60
        var hi: Int = 20 * 60
        if t.contains("ettermiddag") { lo = 12 * 60 }
        if t.contains("formiddag") { hi = 12 * 60 }
        if t.contains("kveld") { lo = 16 * 60; hi = 22 * 60 }
        let busy: [CalEvent26] = on(d, events).filter { (e: CalEvent26) -> Bool in !e.allDay && e.startMin >= 0 }
        var slots: [(Int, Int)] = []
        var cur: Int = lo
        for e in busy {
            let s: Int = Swift.max(lo, e.startMin)
            if s - cur >= 30 { slots.append((cur, s)) }
            cur = Swift.max(cur, Swift.min(hi, e.endMin))
            if cur >= hi { break }
        }
        if hi - cur >= 30 { slots.append((cur, hi)) }
        let day: String = Cal26.cap(Cal26.dLong(d))
        if slots.isEmpty { return (day + " er du ikke ledig i det tidsrommet.", busy) }
        let txt: String = slots.map { (s: (Int, Int)) -> String in Cal26.hm(s.0) + "–" + Cal26.hm(s.1) }.joined(separator: ", ")
        return (day + " er du ledig " + txt + ".", busy)
    }

    static func tests(events: [CalEvent26], now: Date) -> (String, [CalEvent26]) {
        let list: [CalEvent26] = events.filter { (e: CalEvent26) -> Bool in e.isTest && e.end >= now }
            .sorted { (a: CalEvent26, b: CalEvent26) -> Bool in a.start < b.start }
        guard let f = list.first else { return ("Du har ingen prøver eller frister i kalenderen.", []) }
        let n: Int = Cal26.daysUntil(f.dayKey, from: now)
        let at: String = f.type == "innl" ? " (frist " + f.endText + ")" : (f.startMin >= 0 ? " kl. " + f.startText : "")
        var s: String = "Neste er " + f.title + " " + Cal26.dLong(Cal26.day(f.dayKey)) + at + " (" + Cal32bSearch.rel(n) + ")."
        if list.count > 1 { s += " Etter den har du \(list.count - 1) til." }
        return (s, list)
    }

    /// «når er neste fysioterapi» → første kommende hendelse med ordet i tittel/sted/fag.
    static func nextOf(_ t: String, events: [CalEvent26], now: Date) -> (String, [CalEvent26])? {
        let stop: Set<String> = ["nar", "er", "neste", "min", "mitt", "mine", "har", "jeg", "en", "et", "time", "timen", "hos", "til", "?"]
        let words: [String] = t.replacingOccurrences(of: "?", with: " ").split(separator: " ").map(String.init).filter { !stop.contains($0) && $0.count > 2 }
        guard let w = words.first else { return nil }
        let hit: [CalEvent26] = events.filter { (e: CalEvent26) -> Bool in
            e.end >= now && Cal32b.fold(e.title + " " + e.room + " " + e.subject + " " + e.note).contains(w)
        }.sorted { (a: CalEvent26, b: CalEvent26) -> Bool in a.start < b.start }
        guard let f = hit.first else { return nil }
        let n: Int = Cal26.daysUntil(f.dayKey, from: now)
        let at: String = f.startMin >= 0 ? " kl. " + f.startText : ""
        return (f.title + " er " + Cal26.dLong(Cal26.day(f.dayKey)) + at + " (" + Cal32bSearch.rel(n) + ").", hit)
    }
}

/* ---------- Søk: arket ---------- */

struct Cal32bSearchSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @MainActor private var s: Cal32bSearch { Cal32bSearch.shared }
    @FocusState private var focus: Bool

    var body: some View {
        let q: String = m.query.trimmingCharacters(in: .whitespaces)
        VStack(alignment: .leading, spacing: 12) {
            Cal32bSearchField(focus: $focus)
            Cal32bFilterChips()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let a = s.answer { Cal32bAnswerCard(a: a) }
                    if q.count >= 2 {
                        Cal32bResults(q: q)
                    } else if s.answer == nil {
                        Cal32bEmptyState()
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .padding(.horizontal, 16).padding(.top, 18)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear {
            focus = true
            s.clearAnswer()
        }
    }
}

struct Cal32bSearchField: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @MainActor private var s: Cal32bSearch { Cal32bSearch.shared }
    var focus: FocusState<Bool>.Binding

    var body: some View {
        let has: Bool = !m.query.trimmingCharacters(in: .whitespaces).isEmpty
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
                TextField("", text: Binding<String>(get: { m.query }, set: { (v: String) in
                    m.query = v
                    s.clearAnswer()
                    m.search(store)
                }), prompt: Text("Søk, eller spør Glimt …").foregroundColor(p.mut))
                    .font(PF.ui(16)).foregroundStyle(p.ink)
                    .focused(focus)
                    .submitLabel(.search)
                    .onSubmit { s.ask(m.query, store) }
                if has {
                    Button { m.clearSearch(); s.clearAnswer() } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(p.mut)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Tøm")
                }
                Button { s.ask(m.query, store) } label: {
                    Text("✦ Spør").font(PF.ui(13, .bold)).foregroundStyle(has ? p.bg : p.mut)
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(has ? p.ink : p.line.opacity(0.5), in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!has)
            }
            .padding(.leading, 14).padding(.trailing, 8).frame(height: 50)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            Cal27CloseButton { m.searchOpen = false }
        }
    }
}

struct Cal32bFilterChips: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @MainActor private var s: Cal32bSearch { Cal32bSearch.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Cal32bSearch.filters, id: \.0) { (f: (String, String)) in chip(f.0, f.1) }
            }
        }
    }

    private func chip(_ id: String, _ name: String) -> some View {
        let on: Bool = s.filter == id
        let dot: String = id == "alle" ? "" : m.calendar(id).color
        return Button {
            s.filter = id
            Haptics.shared.select()
        } label: {
            HStack(spacing: 6) {
                if !dot.isEmpty { Circle().fill(Color(hex: dot)).frame(width: 7, height: 7) }
                Text(name).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
            }
            .padding(.horizontal, 12).frame(height: 32)
            .background(on ? p.ink : p.card, in: Capsule())
            .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct Cal32bEmptyState: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @MainActor private var s: Cal32bSearch { Cal32bSearch.shared }

    var body: some View {
        let soon: [CalEvent26] = s.soon(Date())
        VStack(alignment: .leading, spacing: 10) {
            Text("SPØR GLIMT").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(Cal32b.purple)
            VStack(spacing: 0) {
                ForEach(Array(Cal32bSearch.suggestions.enumerated()), id: \.offset) { i, t in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Button {
                        m.query = t
                        s.ask(t, store)
                    } label: {
                        HStack(spacing: 10) {
                            Text("✦").font(PF.ui(14, .bold)).foregroundStyle(Cal32b.purple)
                            Text(t).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 12).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if !soon.isEmpty {
                Text("SNART").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab).padding(.top, 6)
                VStack(spacing: 0) {
                    ForEach(Array(soon.enumerated()), id: \.element.id) { i, e in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        Cal32bEventRow(e: e, q: "", showDay: true)
                    }
                }
                .padding(.horizontal, 14)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }
}

struct Cal32bResults: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @MainActor private var s: Cal32bSearch { Cal32bSearch.shared }
    let q: String

    var body: some View {
        let groups: [Cal32bDayGroup] = s.groups(m.results, now: Date())
        VStack(alignment: .leading, spacing: 10) {
            Text(m.searching ? "Søker …" : s.countText(m.results)).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
            if !m.searching && groups.isEmpty {
                Text("Ingen hendelser passer «\(q)». Trykk ✦ Spør for å spørre Glimt.").font(PF.ui(14)).foregroundStyle(p.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(groups) { (g: Cal32bDayGroup) in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(g.title).font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                        Text(g.rel).font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                    VStack(spacing: 0) {
                        ForEach(Array(g.items.enumerated()), id: \.element.id) { i, e in
                            if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                            Cal32bEventRow(e: e, q: q, showDay: false)
                        }
                    }
                    .padding(.horizontal, 14)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
        }
    }
}

/// Rad: fargestripe · tid (mono) · tittel med markert treff · sted/notat uten URL.
struct Cal32bEventRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let e: CalEvent26
    let q: String
    let showDay: Bool

    var body: some View {
        let time: String = e.startMin >= 0 && !e.allDay ? e.startText : "hele"
        let sub: String = Cal32bEventRow.place(e)
        let day: String = showDay ? String(Cal26.weekdays[Cal26.jsDay(Cal26.day(e.dayKey))].prefix(3)) + " " + Cal26.dShort(Cal26.day(e.dayKey)) : ""
        Button { m.pickResult(e) } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2).fill(Color(hex: m.hex(e))).frame(width: 4, height: 36)
                VStack(alignment: .leading, spacing: 1) {
                    if !day.isEmpty { Text(day).font(PF.mono(10.5)).foregroundStyle(p.mut) }
                    Text(time).font(PF.mono(11.5)).foregroundStyle(p.mut)
                }
                .frame(width: showDay ? 62 : 40, alignment: .leading)
                VStack(alignment: .leading, spacing: 1) {
                    Text(Cal32bEventRow.marked(e.title, q, p)).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    if !sub.isEmpty { Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1) }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    static func place(_ e: CalEvent26) -> String {
        let raw: String = e.room.isEmpty ? e.note : e.room
        let parts: [String] = raw.split(separator: " ").map(String.init).filter { !$0.hasPrefix("http://") && !$0.hasPrefix("https://") }
        return parts.joined(separator: " ").trimmingCharacters(in: .whitespaces)
    }

    /// Gul markering av treffet (srMark).
    static func marked(_ title: String, _ q: String, _ p: PaperPalette) -> AttributedString {
        var a: AttributedString = AttributedString(title)
        let needle: String = q.trimmingCharacters(in: .whitespaces)
        if needle.count < 2 { return a }
        if let r = a.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) {
            a[r].backgroundColor = Color(hex: "#f5d76e").opacity(0.75)
        }
        return a
    }
}

/// Svarkort: Glimt-merket · GLIMT · «spørsmålet» · svar · opptil 6 hendelser.
struct Cal32bAnswerCard: View {
    @Environment(\.paper) private var p
    let a: Cal32bAnswer

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Glimt31Mark(size: 26, state: a.busy ? .thinking : .done)
                Text("GLIMT").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(Cal32b.purple)
                Text("«" + a.q + "»").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            Text(a.busy ? "Tenker …" : a.text).font(PF.ui(16)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            if !a.events.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(a.events.enumerated()), id: \.element.id) { i, e in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        Cal32bEventRow(e: e, q: "", showDay: true)
                    }
                }
            }
        }
        .padding(14)
        .background(Cal32b.purple.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Cal32b.purple.opacity(0.24), lineWidth: 1))
    }
}

/* ---------- «✦ Beskriv med Glimt» i Ny hendelse ---------- */

struct Cal32bDescribeBox: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Binding var form: Cal27Form
    @State private var text: String = ""
    @State private var busy: Bool = false
    @State private var done: String = ""
    @State private var err: String = ""

    var body: some View {
        let has: Bool = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("✦ BESKRIV MED GLIMT").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(Cal32b.purple)
                Spacer(minLength: 4)
                if !done.isEmpty { Text("✓ " + done).font(PF.ui(11.5, .semibold)).foregroundStyle(Cal32b.green).lineLimit(1) }
            }
            TextField("", text: $text, prompt: Text("F.eks. «Tannlege hos Dr. Berg tirsdag 10.30, Bogstadveien 12, minn meg dagen før» eller lim inn en melding").foregroundColor(p.mut), axis: .vertical)
                .lineLimit(2...5)
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .submitLabel(.done)
                .onSubmit { fill() }
            HStack(spacing: 8) {
                if !err.isEmpty { Text(err).font(PF.ui(12, .semibold)).foregroundStyle(Cal32b.red).fixedSize(horizontal: false, vertical: true) }
                Spacer(minLength: 0)
                Button { fill() } label: {
                    HStack(spacing: 6) {
                        Glimt31Mark(size: 22, state: busy ? .thinking : .ready, dark: has)
                        Text(busy ? "Fyller ut …" : "Fyll ut").font(PF.ui(13.5, .bold)).foregroundStyle(has ? p.bg : Cal32b.purple)
                    }
                    .padding(.leading, 6).padding(.trailing, 14).frame(height: 36)
                    .background(has ? p.ink : Cal32b.purple.opacity(0.14), in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!has || busy)
            }
        }
        .padding(14)
        .background(Cal32b.purple.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Cal32b.purple.opacity(0.24), lineWidth: 1))
    }

    private func fill() {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || busy { return }
        busy = true
        err = ""
        done = ""
        Task { @MainActor in
            let r: Cal32bFill = await Cal32bFill.fetch(t, store)
            busy = false
            apply(r, t)
        }
    }

    private func apply(_ r: Cal32bFill, _ raw: String) {
        var parts: [String] = []
        if !r.title.isEmpty { form.title = r.title; parts.append("tittel") }
        if r.date.count >= 10 {
            let day: Date = Cal26.day(String(r.date.prefix(10)))
            let d0: Date = Cal26.startOfDay(day)
            form.date = day
            if r.allDay || r.start.isEmpty {
                form.allDay = r.allDay
            } else {
                let s: Int = Quick29Model.minutes(r.start) ?? 9 * 60
                let e: Int = Quick29Model.minutes(r.end) ?? Swift.min(s + 60, 23 * 60 + 55)
                form.allDay = false
                form.start = d0.addingTimeInterval(TimeInterval(s * 60))
                form.end = d0.addingTimeInterval(TimeInterval(Swift.max(e, s + 15) * 60))
                parts.append("tid")
            }
            parts.insert("dato", at: Swift.min(1, parts.count))
        }
        if !r.place.isEmpty { form.location = r.place; parts.append("sted") }
        let local: Cal32bFill = Cal32bFill.localExtras(raw)
        let rep: String = r.repeatRule.isEmpty ? local.repeatRule : r.repeatRule
        if !rep.isEmpty { form.repeatRule = rep; parts.append("gjenta") }
        let rem: String = r.reminder.isEmpty ? local.reminder : r.reminder
        if !rem.isEmpty { form.reminder = rem; parts.append("varsel") }
        let cal: String = r.calendar.isEmpty ? local.calendar : r.calendar
        if cal == "familie" || cal == "privat" { form.calendar = cal }
        if raw.count > 60 && form.note.isEmpty { form.note = raw }
        if r.date.count < 10 {
            err = "Fant ikke dato. Velg dato under."
        }
        if !parts.isEmpty {
            done = "Fylte ut " + Cal32bDescribeBox.list(parts)
            Haptics.shared.success()
        } else if err.isEmpty {
            err = "Glimt fant ikke noe å fylle ut."
        }
    }

    static func list(_ parts: [String]) -> String {
        if parts.count <= 1 { return parts.first ?? "" }
        return parts.dropLast().joined(separator: ", ") + " og " + (parts.last ?? "")
    }
}

/// Resultatet av «Fyll ut»: serveren (/kalender/describe), ellers rask time-parseren (/kalender/quick/parse).
struct Cal32bFill {
    var title: String = ""
    var date: String = ""
    var start: String = ""
    var end: String = ""
    var allDay: Bool = false
    var place: String = ""
    var repeatRule: String = ""
    var reminder: String = ""
    var calendar: String = ""

    @MainActor static func fetch(_ text: String, _ store: Store) async -> Cal32bFill {
        if let d = try? await store.api.callAt("/api", "POST", "/kalender/describe", json: ["text": text], timeout: 30) {
            let root: [String: Any] = JS.obj(d)
            let o: [String: Any] = JS.dict(root, "event") ?? JS.dict(root, "result") ?? root
            var f = Cal32bFill()
            f.title = JS.str(o, "title") ?? JS.str(o, "t") ?? ""
            f.date = JS.str(o, "date") ?? JS.str(o, "k") ?? ""
            f.start = JS.str(o, "start") ?? JS.str(o, "s") ?? ""
            f.end = JS.str(o, "end") ?? JS.str(o, "e") ?? ""
            f.allDay = JS.bool(o, "allDay") ?? JS.bool(o, "all") ?? false
            f.place = JS.str(o, "location") ?? JS.str(o, "place") ?? JS.str(o, "sted") ?? ""
            f.repeatRule = Cal32bFill.normRepeat(JS.str(o, "repeat") ?? JS.str(o, "r") ?? "")
            f.reminder = Cal32bFill.normReminder(JS.str(o, "reminder") ?? JS.str(o, "alert") ?? "")
            f.calendar = JS.str(o, "calendar") ?? ""
            if f.date.contains("T") && f.start.isEmpty {
                let p: [Substring] = f.date.split(separator: "T")
                if p.count == 2 { f.start = String(p[1].prefix(5)) }
            }
            if !f.title.isEmpty || !f.date.isEmpty { return f }
        }
        var f = Cal32bFill()
        if let v = await Quick29Model.shared.parse(text, store) {
            f.title = v.title
            f.date = v.date
            f.start = v.start
            f.end = v.end
            f.place = v.place
            f.allDay = v.start.isEmpty && !v.date.isEmpty
        }
        return f
    }

    static func normRepeat(_ v: String) -> String {
        let t: String = v.lowercased()
        if ["daily", "weekly", "monthly", "none"].contains(t) { return t == "none" ? "" : t }
        return ""
    }

    static func normReminder(_ v: String) -> String {
        let t: String = v.lowercased()
        if ["none", "15m", "1h", "day"].contains(t) { return t }
        return ""
    }

    /// Gjenta, varsel og kalender lokalt fra teksten (samme ord som fasiten).
    static func localExtras(_ raw: String) -> Cal32bFill {
        let t: String = Cal32b.fold(raw)
        var f = Cal32bFill()
        if t.contains("hver dag") || t.contains("daglig") { f.repeatRule = "daily" }
        else if t.contains("hver uke") || t.contains("ukentlig") || t.contains("hver mandag") || t.contains("hver tirsdag") || t.contains("hver onsdag")
                    || t.contains("hver torsdag") || t.contains("hver fredag") || t.contains("hver lordag") || t.contains("hver sondag") { f.repeatRule = "weekly" }
        else if t.contains("hver maned") || t.contains("manedlig") { f.repeatRule = "monthly" }
        if t.contains("ingen varsel") { f.reminder = "none" }
        else if t.contains("dagen for") { f.reminder = "day" }
        else if t.contains("1 time for") || t.contains("en time for") { f.reminder = "1h" }
        else if t.contains("15 min") || t.contains("10 min") { f.reminder = "15m" }
        if t.contains("familie") || t.contains("barna") || t.contains("mamma") || t.contains("pappa") { f.calendar = "familie" } else { f.calendar = "privat" }
        return f
    }
}
