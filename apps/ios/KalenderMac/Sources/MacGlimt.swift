import SwiftUI
import AppKit

/* ---------------- Prompt 34: Glimt på Mac (⌘K) – samme panel og animasjoner som i iOS-appen ---------------- */
// Tenker-fase med steg som hukes av, så strømmes teksten ord for ord med rød markør, så hendelseskort og ledige tider.
// Ukjent spørsmål: lokal reserve med de neste hendelsene vises med en gang, og serveren (POST /api/assist {q, source:'calendar'})
// spørres parallelt; svaret erstatter reserven. Feil fra serveren vises som tekst (aldri evig «tenker»).
// Svar mens appen er skjult gir varsel.

struct MacGlimtMsg: Identifiable, Equatable {
    let id: Int
    let user: Bool
    var text: String
    var steps: [String] = []
    var step: Int = 0
    var thinking: Bool = false
    var shown: Int = 0
    var cards: [KalEvent] = []
    var slots: [MacSlot] = []
    var undoId: String = ""
    var undone: Bool = false
    var error: String = ""

    var words: [String] { text.split(separator: " ").map { (s: Substring) -> String in String(s) } }
    var done: Bool { !thinking && shown >= words.count }
}

@MainActor
final class MacGlimtModel: ObservableObject {
    static let shared: MacGlimtModel = MacGlimtModel()

    @Published var msgs: [MacGlimtMsg] = []
    @Published var input: String = ""
    private var seq: Int = 0

    var thinking: Bool { msgs.contains { (m: MacGlimtMsg) -> Bool in m.thinking } }

    static let suggestions: [String] = ["Hva skjer i morgen?", "Når er neste frisørtime?", "Finn ledig tid fredag", "Oppsummer uka", "Neste frist?", "Neste bursdag?"]

    func send(_ raw: String) {
        let q: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty { return }
        input = ""
        seq += 1
        let uid: Int = seq
        seq += 1
        let aid: Int = seq
        msgs.append(MacGlimtMsg(id: uid, user: true, text: q))
        var a: MacGlimtMsg = MacGlimtMsg(id: aid, user: false, text: "")
        a.thinking = true
        msgs.append(a)
        Task { await self.run(q, aid) }
    }

    private func update(_ id: Int, _ f: (inout MacGlimtMsg) -> Void) {
        guard let i = msgs.firstIndex(where: { (m: MacGlimtMsg) -> Bool in m.id == id }) else { return }
        var m: MacGlimtMsg = msgs[i]
        f(&m)
        msgs[i] = m
    }

    private func pause(_ ms: UInt64) async {
        try? await Task.sleep(nanoseconds: ms * 1_000_000)
    }

    private func run(_ q: String, _ id: Int) async {
        let local: MacAnswer = MacAsk.ask(q)
        let unsure: Bool = local.unknown || (q.count > 50 && local.created?.s == nil)
        var ans: MacAnswer = local
        var fromServer: Bool = false
        var undoId: String = ""
        if unsure {
            update(id) { (m: inout MacGlimtMsg) in m.steps = ["Spør Glimt", "Leser kalenderen", "Skriver svar"] }
            await pause(380)
            update(id) { (m: inout MacGlimtMsg) in m.step = 1 }
            let srv: MacGlimtServer.Reply = await MacGlimtServer.ask(q, onSteps: { (steps: [String], at: Int) in
                self.update(id) { (m: inout MacGlimtMsg) in
                    if !steps.isEmpty { m.steps = steps }
                    m.step = Swift.max(1, at)
                }
            })
            if let a = srv.answer {
                ans = a
                fromServer = true
                if let made = srv.created {
                    undoId = made
                    await MacStore.shared.load(force: true)
                }
            } else if !srv.error.isEmpty {
                // Vis feilen, men behold den lokale reserven (de neste hendelsene).
                ans.text = srv.error + (local.cards.isEmpty ? "" : " Her er det som skjer fremover:")
                ans.error = srv.error
            }
        } else if let p = ans.created {
            undoId = await MacStore.shared.add(p, toastPrefix: nil)
            if let e = MacStore.shared.event(undoId) { ans.cards = [e] }
        }
        await animateSteps(id, ans.steps, fromServer: fromServer || unsure)
        let text: String = ans.text
        let cards: [KalEvent] = ans.cards
        let slots: [MacSlot] = ans.slots
        let uid: String = undoId
        let err: String = ans.error
        update(id) { (m: inout MacGlimtMsg) in
            m.thinking = false
            m.text = text
            m.cards = cards
            m.slots = slots
            m.undoId = uid
            m.error = err
            m.shown = 0
        }
        let total: Int = text.split(separator: " ").count
        var n: Int = 0
        while n < total {
            n += 2
            let shown: Int = n
            update(id) { (m: inout MacGlimtMsg) in m.shown = shown }
            await pause(45)
        }
        if !NSApp.isActive { MacNotify.glimt(text) }
    }

    private func animateSteps(_ id: Int, _ raw: [String], fromServer: Bool) async {
        let steps: [String] = raw.isEmpty ? ["Tenker"] : raw
        if fromServer {
            update(id) { (m: inout MacGlimtMsg) in
                m.steps = steps
                m.step = steps.count
            }
            await pause(260)
            return
        }
        update(id) { (m: inout MacGlimtMsg) in
            m.steps = steps
            m.step = 0
        }
        // 420 ms tenketid per steg (som web: lokalt svar innen ~0,5 s).
        await pause(300)
        for i in 0..<steps.count {
            update(id) { (m: inout MacGlimtMsg) in m.step = i + 1 }
            await pause(i + 1 < steps.count ? 320 : 200)
        }
    }

    func undo(_ m: MacGlimtMsg) {
        MacStore.shared.undo(m.undoId)
        update(m.id) { (x: inout MacGlimtMsg) in x.undone = true }
    }

    func finishAll() {
        for i in 0..<msgs.count {
            msgs[i].thinking = false
            msgs[i].shown = 9999
        }
    }
}

/// POST /api/assist {q, source:'calendar'} → {text, steps[], events[], slots[], created?}. 202 {jobId} → GET /api/assist/:id.
@MainActor
enum MacGlimtServer {
    struct Reply {
        var answer: MacAnswer? = nil
        var created: String? = nil
        var error: String = ""
    }

    static func ask(_ q: String, onSteps: @escaping ([String], Int) -> Void) async -> Reply {
        var reply: Reply = Reply()
        let d: Data
        do {
            d = try await KalNet.send("POST", "/api/assist", json: ["q": q, "source": "calendar"], timeout: 30)
        } catch let e as KalNetError {
            reply.error = "Glimt svarte ikke: " + e.message + "."
            return reply
        } catch {
            reply.error = "Glimt svarte ikke: " + error.localizedDescription
            return reply
        }
        var o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        if let r = parse(o) { return r }
        guard let job = (o["jobId"] as? String) ?? (o["id"] as? String) else {
            reply.error = "Glimt ga et svar appen ikke forstod."
            return reply
        }
        var rounds: Int = 0
        while rounds < 60 {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            rounds += 1
            guard let d2 = try? await KalNet.get("/api/assist/" + KalNet.enc(job)) else { continue }
            o = ((try? JSONSerialization.jsonObject(with: d2)) as? [String: Any]) ?? [:]
            let state: String = (o["state"] as? String) ?? ""
            if state == "failed" || state == "cancelled" {
                let msg: String = (o["error"] as? String) ?? (state == "cancelled" ? "Avbrutt." : "Ukjent feil.")
                reply.error = msg.hasPrefix("Glimt") ? msg : "Glimt fikk ikke svar: " + msg
                return reply
            }
            let st: ([String], Int) = steps(o)
            onSteps(st.0, st.1)
            if state == "done" || state.isEmpty, let r = parse(o) { return r }
        }
        reply.error = "Glimt brukte for lang tid (over ett minutt). Prøv igjen, eller sjekk AI-kontroll i Homelab."
        return reply
    }

    static func steps(_ o: [String: Any]) -> ([String], Int) {
        let raw: [Any] = (o["steps"] as? [Any]) ?? []
        var names: [String] = []
        var done: Int = 0
        for s in raw {
            if let t = s as? String {
                names.append(t)
                continue
            }
            guard let d = s as? [String: Any] else { continue }
            let label: String = (d["label"] as? String) ?? (d["n"] as? String) ?? ""
            if label.isEmpty { continue }
            names.append(label)
            if (d["state"] as? String) == "done" { done += 1 }
        }
        return (names, done)
    }

    static func parse(_ raw: [String: Any]) -> Reply? {
        let o: [String: Any] = (raw["answer"] as? [String: Any]) ?? (raw["result"] as? [String: Any]) ?? raw
        guard let text = (o["text"] as? String) ?? (raw["answer"] as? String) else { return nil }
        var a: MacAnswer = MacAnswer()
        a.text = text.replacingOccurrences(of: "**", with: "")
        a.steps = steps(o).0
        if a.steps.isEmpty { a.steps = steps(raw).0 }
        let ids: Set<String> = Set(MacStore.shared.cals.map { (c: KalCal) -> String in c.id })
        for e in (o["events"] as? [Any]) ?? [] {
            if let d = e as? [String: Any], let ev = KalParse.event(d, calIds: ids) { a.cards.append(ev) }
        }
        for s in (o["slots"] as? [Any]) ?? [] {
            guard let d = s as? [String: Any] else { continue }
            let day: String = (d["date"] as? String) ?? (d["day"] as? String) ?? ""
            let st: Int? = KalParse.hmMin(d["start"] ?? d["s"])
            let en: Int? = KalParse.hmMin(d["end"] ?? d["e"])
            let dk: String = String(day.prefix(10))
            if KalD.valid(dk), let st { a.slots.append(MacSlot(day: dk, s: st, e: en ?? st + 60)) }
        }
        var reply: Reply = Reply()
        if let c = o["created"] as? [String: Any] {
            let inner: [String: Any] = (c["event"] as? [String: Any]) ?? c
            if let ev = KalParse.event(inner, calIds: ids) {
                reply.created = ev.id
                if a.cards.isEmpty { a.cards = [ev] }
            } else if let id = inner["id"] as? String {
                reply.created = id
            }
        }
        reply.answer = a
        return reply
    }
}

/* ---------- Panelet (⌘K) ---------- */

struct MacGlimtPanel: View {
    @Environment(\.mk) private var t
    @ObservedObject var g: MacGlimtModel = MacGlimtModel.shared
    @ObservedObject var win: MacWin
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(t.line2).frame(height: 1)
            messages
            footer
        }
        .frame(width: 560, height: 620)
        .background(t.card)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(t.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.28), radius: 30, y: 16)
        .onAppear { focused = true }
    }

    private var header: some View {
        HStack(spacing: 12) {
            MacOrb(size: 40, thinking: g.thinking)
            VStack(alignment: .leading, spacing: 1) {
                Text("Glimt").font(MacFont.serif(24)).foregroundColor(t.ink)
                Text(g.thinking ? "TENKER …" : "KALENDER-ASSISTENT · LOKALT + GEMINI")
                    .font(MacFont.mono(10)).tracking(1.1).foregroundColor(t.mut2).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            MacPill(title: "Ferdig") { close() }
                .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    private func close() {
        g.finishAll()
        withAnimation(.easeOut(duration: 0.2)) { win.glimtOpen = false }
    }

    private var messages: some View {
        ScrollViewReader { (proxy: ScrollViewProxy) in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if g.msgs.isEmpty { empty }
                    ForEach(g.msgs) { (m: MacGlimtMsg) in
                        MacGlimtRow(m: m, win: win).id(m.id)
                    }
                    Color.clear.frame(height: 4).id("bunn")
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
            }
            .onChange(of: scrollKey) { (_: String) in
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bunn", anchor: .bottom) }
            }
        }
    }

    private var scrollKey: String {
        let parts: [String] = g.msgs.map { (m: MacGlimtMsg) -> String in String(m.id) + "-" + String(m.step) + "-" + String(m.shown) }
        return parts.joined(separator: ",")
    }

    private var empty: some View {
        VStack(spacing: 14) {
            MacOrb(size: 88, thinking: false).padding(.top, 24)
            Text("Hva lurer du på?").font(MacFont.serif(26)).foregroundColor(t.ink)
            Text("Spør om kalenderen din, finn ledig tid, eller lim inn en melding, så legger jeg den inn.")
                .font(MacFont.ui(13.5)).foregroundColor(t.mut).multilineTextAlignment(.center).frame(maxWidth: 320)
            MacFlow(spacing: 6) {
                ForEach(MacGlimtModel.suggestions, id: \.self) { (n: String) in
                    MacSuggestion(title: n) { g.send(n) }
                }
            }
            .frame(maxWidth: 440)
        }
        .frame(maxWidth: .infinity)
    }

    private var footer: some View {
        HStack(spacing: 8) {
            MacSpark(size: 20, fast: g.thinking || !g.input.isEmpty)
            TextField("Spør Glimt …", text: $g.input)
                .textFieldStyle(.plain)
                .font(MacFont.ui(15, .medium))
                .foregroundColor(t.ink)
                .focused($focused)
                .onSubmit { g.send(g.input) }
            Button(action: { g.send(g.input) }) {
                Image(systemName: "arrow.up").font(.system(size: 14, weight: .bold))
                    .foregroundColor(t.bg)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(sendFill))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Send")
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .frame(height: 46)
        .background(RoundedRectangle(cornerRadius: 23).fill(t.bg))
        .overlay(RoundedRectangle(cornerRadius: 23).strokeBorder(t.line, lineWidth: 1))
        .padding(12)
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private var sendFill: Color {
        g.input.trimmingCharacters(in: .whitespaces).isEmpty ? t.mut2 : t.ink
    }
}

struct MacSuggestion: View {
    @Environment(\.mk) private var t
    let title: String
    var height: CGFloat = 30
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(12.5, .bold)).foregroundColor(t.ink).lineLimit(1)
                .padding(.horizontal, 12)
                .frame(height: height)
                .background(Capsule().fill(t.bg))
                .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct MacGlimtRow: View {
    @Environment(\.mk) private var t
    let m: MacGlimtMsg
    @ObservedObject var win: MacWin

    var body: some View {
        if m.user {
            HStack {
                Spacer(minLength: 60)
                Text(m.text).font(MacFont.ui(14)).foregroundColor(t.bg)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(t.ink))
            }
        } else {
            HStack(alignment: .top, spacing: 10) {
                MacSpark(size: 22, fast: !m.done)
                VStack(alignment: .leading, spacing: 8) {
                    if m.thinking { thinkingView } else { answer }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var thinkingView: some View {
        VStack(alignment: .leading, spacing: 7) {
            MacShimmer(text: "Glimt tenker")
            ForEach(Array(m.steps.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                MacStepRow(name: pair.element, done: pair.offset < m.step, active: pair.offset == m.step)
            }
        }
        .padding(.top, 2)
    }

    @ViewBuilder private var answer: some View {
        let shownText: String = m.words.prefix(m.shown).joined(separator: " ")
        HStack(alignment: .lastTextBaseline, spacing: 2) {
            Text(shownText)
                .font(MacFont.ui(14))
                .foregroundColor(m.error.isEmpty ? t.ink : t.acc)
                .lineSpacing(3)
                .textSelection(.enabled)
            if !m.done { MacCaret() }
        }
        if m.done { extras }
    }

    @ViewBuilder private var extras: some View {
        ForEach(m.cards.uniqueIds()) { (e: KalEvent) in MacGlimtCard(e: e, win: win) }
        if !m.slots.isEmpty {
            MacFlow(spacing: 6) {
                ForEach(m.slots, id: \.self) { (sl: MacSlot) in MacSlotChip(slot: sl, win: win) }
            }
        }
        if !m.undoId.isEmpty && !m.undone {
            Button(action: { MacGlimtModel.shared.undo(m) }) {
                Text("Angre").font(MacFont.ui(12, .bold)).foregroundColor(t.ink)
                    .padding(.horizontal, 12).frame(height: 28)
                    .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}

struct MacStepRow: View {
    @Environment(\.mk) private var t
    let name: String
    let done: Bool
    let active: Bool

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                if done {
                    Circle().fill(t.green)
                    Text("✓").font(.system(size: 8, weight: .heavy)).foregroundColor(Color.white)
                } else if active {
                    Circle().strokeBorder(t.red, lineWidth: 2)
                } else {
                    Circle().strokeBorder(t.line, lineWidth: 1.5)
                }
            }
            .frame(width: 14, height: 14)
            Text(name).font(MacFont.ui(12.5, active ? .bold : .medium)).foregroundColor(done || active ? t.ink : t.mut2)
        }
    }
}

/// Hendelseskort i et svar (åpner arket).
struct MacGlimtCard: View {
    @Environment(\.mk) private var t
    let e: KalEvent
    @ObservedObject var win: MacWin

    var body: some View {
        let c: KalCal? = MacStore.shared.cal(e.cal)
        let dayText: String = e.day == KalD.todayKey() ? "I dag" : KalD.dl(KalD.date(e.day))
        let place: String = e.loc.isEmpty ? (c?.name ?? "") : e.loc
        let sub: String = dayText + " · " + place
        Button(action: {
            win.glimtOpen = false
            win.searchOpen = false
            win.anchor = e.day
            win.openDetail(e)
        }) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4)
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.title).font(MacFont.ui(13.5, .bold)).foregroundColor(t.ink).lineLimit(1)
                    Text(sub).font(MacFont.ui(12)).foregroundColor(t.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(e.allDay ? "Hele dagen" : KalD.hm(e.startMin)).font(MacFont.mono(11.5)).foregroundColor(t.ink)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 12).fill(t.bg))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line2, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Grønn +chip med ledig tid → «Ny hendelse» ferdig utfylt.
struct MacSlotChip: View {
    let slot: MacSlot
    @ObservedObject var win: MacWin

    var body: some View {
        Button(action: {
            win.glimtOpen = false
            win.searchOpen = false
            win.openNew(day: slot.day, s: slot.s, e: slot.e)
        }) {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 11, weight: .heavy))
                Text(KalD.hm(slot.s) + "–" + KalD.hm(slot.e)).font(MacFont.mono(12.5))
            }
            .foregroundColor(Color(kalHex: "#2f7a4f"))
            .padding(.horizontal, 12).frame(height: 30)
            .overlay(Capsule().strokeBorder(Color(kalHex: "#2f7a4f"), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ny hendelse " + KalD.hm(slot.s))
    }
}

/// Flyt-layout (chips som brytes over flere linjer). Layout finnes fra macOS 13.
struct MacFlow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW: CGFloat = proposal.width ?? 400
        var x: CGFloat = 0
        var y: CGFloat = 0
        var row: CGFloat = 0
        var widest: CGFloat = 0
        for v in subviews {
            let sz: CGSize = v.sizeThatFits(.unspecified)
            if x > 0 && x + sz.width > maxW {
                y += row + spacing
                x = 0
                row = 0
            }
            x += sz.width + spacing
            row = Swift.max(row, sz.height)
            widest = Swift.max(widest, x - spacing)
        }
        return CGSize(width: Swift.min(maxW, widest), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var row: CGFloat = 0
        for v in subviews {
            let sz: CGSize = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + sz.width > bounds.maxX {
                y += row + spacing
                x = bounds.minX
                row = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing
            row = Swift.max(row, sz.height)
        }
    }
}
