import SwiftUI
import UIKit

/* ---------------- Prompt 67 (prompt 49 del 3 og del 1): Glimt forstår samtaler i appen (SERVER60-API.md, SERVER61-API.md) ----------------
 – conversationId: Chat sender chat-id-en (ny chat uten id: «c-<tilfeldig>», som beholdes for samtalen også når den får id).
   Glimt-søket på Hjem bruker en kortlevd id («home-<tilfeldig>») for alle spørsmål, ny id etter 30 min uten bruk eller når feltet tømmes.
 – choices: valgknapper («Mener du A eller B?»). Trykk sender {text: item.text, conversationId, choice: {setId, id}}.
 – Tommel opp/ned på Glimt-svar med traceId: POST /api/glimt/recipes/feedback {traceId, vote:'up'|'down'|null}.
 – Chat: Glimt-svaret strømmes (Stream67.swift) og lagres i samtalen med POST /api/glimt/agent/stream/save. */

struct Choice67Item: Identifiable, Hashable {
    let id: String
    let label: String
    let text: String
}

/// `choices` fra svaret (maks 5 valg).
struct Choices67: Hashable {
    let setId: String
    let question: String
    let items: [Choice67Item]
    let expiresAt: Date?

    static func parse(_ o: [String: Any]?) -> Choices67? {
        guard let o else { return nil }
        var items: [Choice67Item] = []
        for (i, x) in JS.list(o, "items").enumerated() {
            let label: String = JS.str(x, "label") ?? JS.str(x, "text") ?? ""
            if label.isEmpty { continue }
            items.append(Choice67Item(id: JS.str(x, "id") ?? String(i + 1), label: label, text: JS.str(x, "text") ?? label))
            if items.count >= 5 { break }
        }
        if items.isEmpty { return nil }
        return Choices67(setId: JS.str(o, "setId") ?? "", question: JS.str(o, "question") ?? "", items: items, expiresAt: JS.date(o["expiresAt"]))
    }

    /// {setId, id} når valget fortsatt gjelder; utløpt (eller uten setId) → nil, og bare teksten sendes.
    func pick(_ it: Choice67Item) -> [String: String]? {
        if setId.isEmpty { return nil }
        if let e = expiresAt, e < Date() { return nil }
        return ["setId": setId, "id": it.id]
    }
}

/* ---------- Samtale-id ---------- */

@MainActor
final class Convo67 {
    static let shared = Convo67()

    private var homeId: String? = nil
    private var homeAt: Date = .distantPast
    private var pending: String? = nil
    private var mapKey: String { AcctScope.key("fh_conv67") }

    nonisolated static func valid(_ s: String) -> Bool {
        s.range(of: "^[A-Za-z0-9_.:-]{1,80}$", options: .regularExpression) != nil
    }

    nonisolated static func rand(_ n: Int = 12) -> String {
        let chars: [Character] = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        return String((0..<n).map { (_: Int) -> Character in chars[Int.random(in: 0..<chars.count)] })
    }

    /// Glimt-søket på Hjem: samme id så lenge feltet brukes, ny etter 30 min uten bruk.
    func home() -> String {
        let now: Date = Date()
        if homeId == nil || now.timeIntervalSince(homeAt) > 30 * 60 { homeId = "home-" + Convo67.rand(12) }
        homeAt = now
        return homeId ?? "home-" + Convo67.rand(12)
    }

    /// Feltet er tømt med vilje: neste spørsmål starter en ny samtale.
    func resetHome() {
        homeId = nil
        homeAt = .distantPast
    }

    private func readMap() -> [String: String] {
        (UserDefaults.standard.dictionary(forKey: mapKey) as? [String: String]) ?? [:]
    }

    /// Chat: samtale-id for chat-id-en (nil = ny chat).
    func chat(_ cur: String?) -> String {
        guard let cur, !cur.isEmpty else {
            if pending == nil { pending = "c-" + Convo67.rand(12) }
            return pending ?? "c-" + Convo67.rand(12)
        }
        if let m = readMap()[cur] { return m }
        if Convo67.valid(cur) { return cur }
        let clean: String = String(cur.filter { $0.isASCII && ($0.isLetter || $0.isNumber || "_.:-".contains($0)) }.prefix(60))
        return "c-" + (clean.isEmpty ? Convo67.rand(12) : clean)
    }

    /// Chatten har fått id: knytt den til samtale-id-en som ble brukt.
    func bind(_ cur: String?, _ conv: String) {
        guard let cur, !cur.isEmpty else { return }
        if pending == conv { pending = nil }
        if cur == conv { return }
        var m: [String: String] = readMap()
        m[cur] = conv
        if m.count > 200 { m = Dictionary(uniqueKeysWithValues: m.map { ($0.key, $0.value) }.suffix(200)) }
        UserDefaults.standard.set(m, forKey: mapKey)
    }

    /// Ny chat: neste melding får en ny samtale-id.
    func newChat() { pending = nil }

    /// conversationId / conversationKind / choice i body-en (bare gyldige verdier).
    static func add(_ b: inout [String: Any], conv: String, kind: String, choice: [String: String]?) {
        guard valid(conv) else { return }
        b["conversationId"] = conv
        b["conversationKind"] = kind
        if let choice, let s = choice["setId"], let i = choice["id"], !s.isEmpty { b["choice"] = ["setId": s, "id": i] }
    }
}

/* ---------- Tommel opp/ned ---------- */

@MainActor
@Observable
final class Thumbs67 {
    static let shared = Thumbs67()

    var votes: [String: String] = [:]
    var notes: [String: String] = [:]
    @ObservationIgnored private var loaded: String = ""
    private var key: String { AcctScope.key("fh_th67") }

    init() {
        loaded = key
        votes = (UserDefaults.standard.dictionary(forKey: key) as? [String: String]) ?? [:]
    }

    /// Stemmen på svaret (endrer ingen tilstand, så den kan leses mens visningen tegnes).
    func vote(_ id: String) -> String? {
        if loaded != key { return (UserDefaults.standard.dictionary(forKey: key) as? [String: String])?[id] }
        return votes[id]
    }

    private func reloadIfNeeded() {
        if loaded == key { return }
        loaded = key
        votes = (UserDefaults.standard.dictionary(forKey: key) as? [String: String]) ?? [:]
        notes = [:]
    }

    private func save() {
        var v: [String: String] = votes
        if v.count > 200 { v = Dictionary(uniqueKeysWithValues: v.map { ($0.key, $0.value) }.suffix(200)) }
        UserDefaults.standard.set(v, forKey: key)
    }

    /// Trykk på samme tommel igjen angrer stemmen (vote null).
    func tap(_ id: String, _ v: String, _ store: Store) {
        reloadIfNeeded()
        let prev: String? = votes[id]
        let next: String? = prev == v ? nil : v
        let vote: Any = next.map { (x: String) -> Any in x } ?? NSNull()
        votes[id] = next
        save()
        Haptics.shared.select()
        let api: API = store.api
        Task {
            do {
                let d: Data = try await api.callAt("/api", "POST", "/glimt/recipes/feedback", json: ["traceId": id, "vote": vote], timeout: 15)
                let st: String = JS.str(JS.dict(JS.obj(d), "recipe"), "status") ?? ""
                self.notes[id] = next == "up" ? (st == "active" ? "Takk! Glimt bruker dette igjen" : "Takk!") : next == "down" ? "Takk – Glimt lærer av det" : ""
            } catch {
                self.votes[id] = prev
                self.save()
                let e: APIError? = error as? APIError
                self.notes[id] = e?.status == 404 ? "Svaret er for gammelt til å stemme på" : "Kunne ikke lagre: " + error.localizedDescription
            }
        }
    }
}

struct Thumbs67View: View {
    @Environment(Store.self) private var store
    @MainActor private var t: Thumbs67 { Thumbs67.shared }
    let traceId: String
    let ink: Color
    let mut: Color
    var font: Font = PF.ui(12, .semibold)

    var body: some View {
        let v: String? = t.vote(traceId)
        HStack(spacing: 2) {
            thumb("up", on: v == "up", label: "Riktig svar – Glimt lærer av det")
            thumb("down", on: v == "down", label: "Feil svar")
            if let n = t.notes[traceId], !n.isEmpty {
                Text(n).font(font).foregroundStyle(mut).lineLimit(2).padding(.leading, 4)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Var svaret riktig?")
    }

    private func thumb(_ k: String, on: Bool, label: String) -> some View {
        let icon: String = k == "up" ? "hand.thumbsup" : "hand.thumbsdown"
        return Button { t.tap(traceId, k, store) } label: {
            Image(systemName: on ? icon + ".fill" : icon).font(.system(size: 14, weight: .semibold))
                .foregroundStyle(on ? ink : mut)
                .frame(width: 34, height: 34)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/* ---------- Valgknapper ---------- */

struct Choices67View: View {
    let ch: Choices67
    let ink: Color
    let line: Color
    let font: Font
    let pick: (Choice67Item) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(ch.items) { (it: Choice67Item) in
                Button { pick(it) } label: {
                    Text(it.label).font(font).foregroundStyle(ink).lineLimit(2).multilineTextAlignment(.leading)
                        .padding(.horizontal, 13).padding(.vertical, 7)
                        .frame(minHeight: 36)
                        .overlay(Capsule().stroke(line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(ch.question.isEmpty ? "Velg" : ch.question)
    }
}

/* ---------- Glimt-søket på Hjem (i svarboblen, Assist31.swift) ---------- */

/// Mens svaret strømmer: ordene så langt, statuslinja («Sjekker kalenderen …») og Stopp.
struct Glimt67HomeLive: View {
    @MainActor private var g: GlimtAgent45 { GlimtAgent45.shared }
    private let light: Color = Color(hex: "#f6f2ea")

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !g.live67.isEmpty {
                Assist31BoldText(text: g.live67, size: 17, color: light, bold: Color.white)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                Glimt31Mark(size: 20, state: g.live67.isEmpty ? .thinking : .answering, dark: true)
                Text(statusText).font(PF.ui(14, .medium)).foregroundStyle(light.opacity(0.72)).lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.updatesFrequently)
                Button { g.stop67() } label: {
                    Text("Stopp").font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
                        .padding(.horizontal, 14).frame(height: 32)
                        .background(Color.white.opacity(0.14), in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Stopp svaret")
            }
            .frame(minHeight: 28)
        }
    }

    @MainActor private var statusText: String {
        if !g.status67.isEmpty { return g.status67 }
        if !g.live67.isEmpty { return "Skriver svaret …" }
        return "Tenker på «" + Assist31.shared.homeQ + "» …"
    }
}

/// Under svaret: «Stoppet» / cache-merknad, valgknapper og tommel opp/ned (bare for svaret de hører til).
struct Glimt67HomeExtras: View {
    @Environment(Store.self) private var store
    @MainActor private var g: GlimtAgent45 { GlimtAgent45.shared }
    let a: Assist31Answer
    private let light: Color = Color(hex: "#f6f2ea")

    var body: some View {
        if !g.answer67.isEmpty && g.answer67 == a.text {
            VStack(alignment: .leading, spacing: 8) {
                if g.stopped67 {
                    Text("Stoppet").font(PF.ui(12, .semibold)).foregroundStyle(light.opacity(0.55))
                } else if !g.note67.isEmpty {
                    Text(g.note67).font(PF.ui(12, .semibold)).foregroundStyle(light.opacity(0.55))
                }
                if let ch = g.choices67 {
                    // Prompt 70: «Velg dato» viser datovelgeren i kortet (Cal70Card.swift).
                    Cal70Choices(ch: ch, ink: Color.white, line: Color.white.opacity(0.3), font: PF.ui(13, .semibold), pick: { (it: Choice67Item) in
                        g.pick67(it, store)
                    }, date: { (t: String) in
                        g.choices67 = nil
                        Task { _ = await g.home(t, store) }
                    })
                }
                if !g.traceId67.isEmpty && !g.stopped67 {
                    Thumbs67View(traceId: g.traceId67, ink: Color.white, mut: light.opacity(0.6)).padding(.leading, -8)
                }
            }
        }
    }
}

/* ---------- Chat ---------- */

/// Glimt-svaret fra done (samme felt som POST /api/glimt/agent) i formen Chat bruker (som fromAgent59 på web).
struct Glimt67Answer {
    var text: String = ""
    var tool: String = ""
    var intent: String = ""
    var card: [String: Any]? = nil
    var cardJSON: String = ""
    var ms: Double = 0
    var cached: Bool = false
    var note: String = ""
    var plain: Bool = false
    var traceId: String = ""
    var choices: Choices67? = nil
    var confirm: String = ""
    var confirmText: String = ""
    var actions: [[String: Any]] = []

    static let src: [String: String] = ["calendar": "Kalender", "tasks": "Huskeliste", "finance": "Finans", "weather": "Vær",
                                        "ruter": "Avganger", "family": "Familie", "media": "Media", "study": "Studie"]

    @MainActor
    static func from(_ o: [String: Any]) -> Glimt67Answer {
        var a = Glimt67Answer()
        a.choices = Choices67.parse(JS.dict(o, "choices"))
        a.traceId = JS.str(o, "traceId") ?? ""
        a.cached = JS.bool(o, "cached") ?? false
        a.note = Glimt67Answer.cacheNote(o)
        a.actions = JS.list(o, "actions")
        a.ms = JS.num(o, "ms") ?? 0
        if let c = JS.dict(o, "confirm"), let tok = JS.str(c, "token") {
            a.confirm = tok
            a.confirmText = JS.str(c, "summary") ?? ""
        }
        let results: [[String: Any]] = JS.list(o, "results")
        let reply: String = JS.str(o, "reply") ?? JS.str(o, "text") ?? ""
        // Gamle svar (vær, avganger, pakker …) kommer med sitt eget kort i legacyAnswer.
        if let L = JS.dict(o, "legacyAnswer"), let la = Assist31Answer.from(L) {
            a.text = reply.isEmpty ? la.text : reply
            a.tool = Chat31.toolName(la)
            a.intent = la.intent.isEmpty ? (JS.str(o, "intent") ?? "agent") : la.intent
            a.cardJSON = la.cardJSON
            if a.ms == 0 { a.ms = la.ms }
            return a
        }
        let intent: String = JS.str(o, "intent") ?? ""
        let nav: Bool = JS.str(JS.dict(o, "nav"), "web") != nil
        if a.actions.isEmpty && results.isEmpty && JS.dict(o, "ask") == nil && a.confirm.isEmpty && a.choices == nil && !nav
            && ["chat", "ask", ""].contains(intent) {
            a.plain = true
            a.text = reply
            return a
        }
        let tool0: String = JS.str(a.actions.first, "tool") ?? ""
        a.intent = tool0.isEmpty ? (intent.isEmpty ? "agent" : intent) : tool0
        a.tool = Glimt67Answer.src[JS.str(o, "module") ?? ""] ?? Glimt31.name
        a.card = JS.dict(o, "ask") != nil && results.allSatisfy({ JS.str($0, "kind") != "event" }) ? nil : Glimt67Answer.card(tool0, a.actions.first, results) // prompt 70: «Hvilken dag?» uten dagens kalender
        if let c = a.card, let d = try? JSONSerialization.data(withJSONObject: c) { a.cardJSON = String(data: d, encoding: .utf8) ?? "" }
        // Med kort: bare svaret (treffene står i kortet). Ellers svaret + treffene som en kort liste.
        a.text = a.card != nil ? reply : GlimtAgent45.answerText(o)
        if a.text.isEmpty { a.text = "Ferdig." }
        return a
    }

    /// Kalender- eller gjøremålskort fra treffene (samme form som kortene fra /api/assist, Chat31Cards.swift).
    static func card(_ tool: String, _ a0: [String: Any]?, _ results: [[String: Any]]) -> [String: Any]? {
        if let c70 = Cal70Data.chatCard(a0) { return c70 } // prompt 70: kort A (Cal70Card.swift)
        let evs: [[String: Any]] = results.filter { JS.str($0, "kind") == "event" }
        if !evs.isEmpty || tool.hasPrefix("calendar.") {
            let today: String = JS.fmt(Date(), "yyyy-MM-dd")
            let d: String = String((JS.str(JS.dict(a0, "result"), "from") ?? JS.str(evs.first, "date") ?? today).prefix(10))
            let items: [[String: Any]] = evs.prefix(8).map { (e: [String: Any]) -> [String: Any] in
                var x: [String: Any] = ["title": JS.str(e, "title") ?? "", "time": (JS.bool(e, "allDay") ?? false) ? "Hele" : (JS.str(e, "time") ?? "")]
                if let v = JS.str(e, "id") { x["id"] = v }
                if let v = JS.str(e, "color") { x["color"] = v }
                if let v = JS.str(e, "place") { x["place"] = v }
                if let v = JS.str(e, "date") { x["date"] = v }
                return x
            }
            var c: [String: Any] = ["k": "calendar", "date": d, "items": items,
                                    "sub": "\(evs.count) " + (evs.count == 1 ? "hendelse" : "hendelser")]
            if let t = Glimt67Answer.dayTitle(d) { c["t"] = t }
            return c
        }
        if tool.hasPrefix("tasks.") {
            let ts: [[String: Any]] = results.filter { JS.str($0, "kind") == "task" }
            let items: [[String: Any]] = ts.map { (x: [String: Any]) -> [String: Any] in
                var y: [String: Any] = ["title": JS.str(x, "title") ?? "", "done": JS.bool(x, "done") ?? false]
                if let v = JS.str(x, "id") { y["id"] = v }
                if let v = JS.str(x, "date") { y["due"] = v }
                return y
            }
            return ["k": "tasks", "count": ts.count, "items": items]
        }
        return nil
    }

    /// «Fredag 30. oktober».
    static func dayTitle(_ d: String) -> String? {
        let p = DateFormatter()
        p.locale = Locale(identifier: "en_US_POSIX")
        p.timeZone = TimeZone(identifier: "UTC")
        p.dateFormat = "yyyy-MM-dd"
        guard let x = p.date(from: d) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEEE d. MMMM"
        let s: String = f.string(from: x)
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    /// «Ferskt svar fra cachen (3 min gammelt)» når svaret kom fra svar-cachen.
    static func cacheNote(_ o: [String: Any]) -> String {
        guard JS.bool(o, "cached") == true else { return "" }
        let m: Int = Int(((JS.num(JS.dict(o, "cache"), "ageMs") ?? 0) / 60000).rounded())
        return m < 1 ? "Ferskt svar fra cachen (under ett minutt gammelt)" : "Ferskt svar fra cachen (\(m) min gammelt)"
    }
}

extension ChatStore27 {
    /// Forrige melding er et Glimt-svar (ikke stoppet), og teksten er en kort oppfølger («og i Bergen?», «den første»).
    func follows67(_ q: String) -> Bool {
        if q.count > 80 || q.contains("\n") { return false }
        let prev: [ChatMsg27] = msgs.last?.role == "user" ? Array(msgs.dropLast()) : msgs
        guard let last = prev.last, last.role == "assistant", last.glimt67, !last.stopped67 else { return false }
        return true
    }

    /// Glimt i Chat via strømmen (POST /api/glimt/agent/stream). true = håndtert her. Brukermeldingen er alt lagt til.
    func toolRun67(_ q: String, _ store: Store, choice: [String: String]? = nil, force: Bool = false) -> Bool {
        if !attach.isEmpty || !Stream67Gate.on || !GlimtAgent45.shared.available { return false }
        if !force && !Chat31.isTool(q) && !follows67(q) { return false }
        busy = true
        pendingTool31 = true
        streamText = ""
        status67 = ""
        streamTool = []
        scrollTick += 1
        let conv: String = Convo67.shared.chat(curId)
        let rid: String = Stream67.rid()
        var body: [String: Any] = ["text": String(q.prefix(1000)), "module": "chat", "requestId": rid]
        Convo67.add(&body, conv: conv, kind: "chat", choice: choice)
        rid67 = rid
        api67 = store.api
        let api: API = store.api
        let data: Data = Stream67.data(body)
        let t0: Date = Date()
        task67 = Task {
            do {
                let r: Stream67Done? = try await Stream67.run(api, body: data, onStatus: { (s: String) in
                    if ChatStore27.shared.rid67 == rid { ChatStore27.shared.status67 = s }
                }, onToken: { (t: String) in
                    if ChatStore27.shared.rid67 == rid { ChatStore27.shared.streamText = t }
                })
                guard self.rid67 == rid else { return }
                guard let r else {
                    // Eldre server: /api/assist som før (eller språkmodellen).
                    Stream67Gate.off()
                    self.end67()
                    if !self.toolRun31(q, store) { self.runAfterTool31(store) }
                    return
                }
                await self.done67(q, JS.obj(r.data), conv: conv, rid: rid, ms: Date().timeIntervalSince(t0) * 1000, store)
            } catch {
                guard self.rid67 == rid else { return }
                let e: Stream67Error = (error as? Stream67Error) ?? Stream67Error(message: error.localizedDescription, status: 0)
                self.fail67(q, e, store)
            }
        }
        return true
    }

    /// Valgknapp i Chat: valget vises som brukerens melding og sendes til Glimt med choice.
    func pick67(_ ch: Choices67, _ it: Choice67Item, _ store: Store) {
        if busy { return }
        Haptics.shared.select()
        if let i = msgs.lastIndex(where: { $0.choices67 == ch }) { msgs[i].choices67 = nil }
        msgs.append(ChatMsg27(role: "user", content: it.text))
        if !toolRun67(it.text, store, choice: ch.pick(it), force: true) { runAfterTool31(store) }
    }

    /// Bekreftelse i Chat (sletting o.l.): POST /api/glimt/agent/confirm {token}.
    func confirm67(_ m: ChatMsg27, yes: Bool, _ store: Store) {
        guard let i = msgs.firstIndex(where: { $0.id == m.id }) else { return }
        let token: String = msgs[i].confirm67
        msgs[i].confirm67 = ""
        if !yes {
            var a = ChatMsg27(role: "assistant", content: "Avbrutt · ingenting ble endret.")
            a.model = Glimt31.name
            msgs.append(a)
            scrollTick += 1
            return
        }
        Haptics.shared.tap()
        let api: API = store.api
        Task {
            var a = ChatMsg27(role: "assistant", content: "")
            a.model = Glimt31.name
            a.glimt67 = true
            do {
                let d: Data = try await api.callAt("/api", "POST", "/glimt/agent/confirm", json: ["token": token], timeout: 30)
                let o: [String: Any] = JS.obj(d)
                a.content = GlimtAgent45.answerText(o)
                a.traceId67 = JS.str(o, "traceId") ?? ""
                GlimtAgent45.shared.refresh(JS.list(o, "actions"), store)
            } catch {
                a.content = "Ble ikke utført: " + error.localizedDescription
            }
            self.msgs.append(a)
            self.scrollTick += 1
        }
    }

    func stop67() {
        guard let t = task67 else { return }
        t.cancel()
        let rid: String = rid67
        if let api = api67 { Task { await Stream67.stop(api, requestId: rid) } }
    }

    /// Ny chat mens Glimt svarer: svaret som er på vei, legges ikke i den nye samtalen.
    func drop67() {
        guard let t = task67 else { return }
        t.cancel()
        end67()
    }

    private func end67() {
        busy = false
        pendingTool31 = false
        streamText = ""
        status67 = ""
        task67 = nil
        rid67 = ""
    }

    private func fail67(_ q: String, _ e: Stream67Error, _ store: Store) {
        end67()
        if e.stopped || e.status == 429 {
            if e.stopped && !e.partial.isEmpty {
                // Stopp: det som er skrevet blir stående, merket «Stoppet».
                var a = ChatMsg27(role: "assistant", content: e.partial)
                a.model = Glimt31.name
                a.glimt67 = true
                a.stopped67 = true
                a.stats = "Stoppet · Verktøy"
                msgs.append(a)
            } else {
                if let last = msgs.last, last.role == "user", last.content == q { msgs.removeLast() }
                if input.isEmpty { input = q }
                if e.status == 429 { flash(e.message) }
            }
            scrollTick += 1
            return
        }
        // Feil i Glimt-motoren: til språkmodellen som før (ingen ny kjøring som kan gjenta en handling).
        runAfterTool31(store)
    }

    private func done67(_ q: String, _ o: [String: Any], conv: String, rid: String, ms: Double, _ store: Store) async {
        let a: Glimt67Answer = Glimt67Answer.from(o)
        if a.plain || a.text.isEmpty {
            end67()
            runAfterTool31(store)
            return
        }
        // Lagre svaret i samtalen på serveren, så det også vises på web. Feil her stopper ikke svaret.
        if a.intent != "chat" && a.intent != "llm" {
            var b: [String: Any] = ["q": q, "text": a.text, "ms": Int(a.ms > 0 ? a.ms : ms), "intent": String(a.intent.prefix(40))]
            if let id = curId, !id.isEmpty { b["chatId"] = id }
            if !a.tool.isEmpty { b["tool"] = a.tool }
            if let c = Chat31.card(a.cardJSON) { b["card"] = c }
            if let d = try? await store.api.callAt("/api", "POST", "/glimt/agent/stream/save", json: b, timeout: 15),
               let id = JS.str(JS.obj(d), "chatId"), curId == nil, rid67 == rid {
                curId = id
            }
        }
        guard rid67 == rid else { return }
        Convo67.shared.bind(curId, conv)
        var m = ChatMsg27(role: "assistant", content: a.text)
        m.model = Glimt31.name
        if !a.tool.isEmpty { m.used = [a.tool] }
        m.card31 = a.cardJSON
        m.glimt67 = true
        m.traceId67 = a.traceId
        m.choices67 = a.choices
        m.confirm67 = a.confirm
        let sec: String = String(format: "%.1f", Swift.max(0.1, (a.ms > 0 ? a.ms : ms) / 1000)).replacingOccurrences(of: ".", with: ",")
        m.stats = "Verktøy · " + sec + " s" + (a.cached ? " · Fra cachen" : "")
        end67()
        msgs.append(m)
        scrollTick += 1
        Haptics.shared.select()
        GlimtAgent45.shared.refresh(a.actions, store)
        Task { await self.loadChats(store) }
    }
}

/// Statuslinja i Chat mens Glimt jobber: «● Sjekker kalenderen …».
struct Chat67StatusLine: View {
    let text: String
    let c: ChatPal27

    var body: some View {
        HStack(spacing: 8) {
            // Prompt 71: bare prikkens opasitet pulserer (Anim71.swift). Før startet withAnimation(repeatForever) i onAppear,
            // og da kunne linjas første plassering i lista også bli animert for alltid.
            Circle().fill(c.mut).frame(width: 7, height: 7)
                .pulse71(from: 0.25, to: 1, half: 0.55, still: 0.7)
            Text(text).font(c.ui(13)).foregroundStyle(c.mut).lineLimit(1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// Under et Glimt-svar i Chat: valgknapper og Bekreft/Avbryt (bare på siste svar).
struct Chat67Extras: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let m: ChatMsg27
    let last: Bool
    let c: ChatPal27

    var body: some View {
        if last && !s.busy {
            if let ch = m.choices67 {
                Cal70Choices(ch: ch, ink: c.ink, line: c.line, font: c.ui(13.5, .semibold), pick: { (it: Choice67Item) in
                    s.pick67(ch, it, store)
                }, date: { (t: String) in
                    s.pick67(ch, Choice67Item(id: "", label: t, text: t), store) // prompt 70: valgt dato som ny tekst
                })
            }
            if !m.confirm67.isEmpty {
                HStack(spacing: 8) {
                    button("Bekreft", strong: true) { s.confirm67(m, yes: true, store) }
                    button("Avbryt", strong: false) { s.confirm67(m, yes: false, store) }
                }
            }
        }
    }

    private func button(_ t: String, strong: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(c.ui(13.5, .bold)).foregroundStyle(strong ? c.bg : c.ink)
                .padding(.horizontal, 16).frame(height: 36)
                .background(strong ? c.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(strong ? c.ink : c.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
