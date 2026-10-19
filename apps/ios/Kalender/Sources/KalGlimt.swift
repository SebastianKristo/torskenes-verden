import SwiftUI

/* ---------------- Prompt 33: Glimt-panelet i Kalender (glSend() og glimt-arket i fasiten) ---------------- */
// Ark nederfra (82 %, glir opp på 0,34 s). Topp: orb, «Glimt», «KALENDER-ASSISTENT · LOKALT + GEMINI», Ferdig.
// Svar: tenker-fase med steg som hukes av, så strømmes teksten ord for ord med rød markør, så hendelseskort og ledige tider.

struct KalGlimtMsg: Identifiable, Equatable {
    let id: Int
    let user: Bool
    var text: String
    var steps: [String] = []
    var step: Int = 0
    var thinking: Bool = false
    var shown: Int = 0
    var cards: [KalEvent] = []
    var slots: [KalSlot] = []
    var undoId: String = ""
    var undone: Bool = false

    var words: [String] { text.split(separator: " ").map { (s: Substring) -> String in String(s) } }
    var done: Bool { !thinking && shown >= words.count }
}

@MainActor
@Observable
final class KalGlimtModel {
    static let shared: KalGlimtModel = KalGlimtModel()

    var msgs: [KalGlimtMsg] = []
    var input: String = ""
    @ObservationIgnored private var seq: Int = 0

    var thinking: Bool { msgs.contains { (m: KalGlimtMsg) -> Bool in m.thinking } }

    static let suggestions: [String] = ["Hva skjer i morgen?", "Når er neste frisørtime?", "Finn ledig tid fredag", "Oppsummer uka", "Neste frist?", "Neste bursdag?"]

    func send(_ raw: String) {
        let q: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty { return }
        KalHaptic.tap()
        KalStore.shared.glimtOpen = true
        input = ""
        seq += 1
        let uid: Int = seq
        seq += 1
        let aid: Int = seq
        msgs.append(KalGlimtMsg(id: uid, user: true, text: q))
        var a: KalGlimtMsg = KalGlimtMsg(id: aid, user: false, text: "")
        a.thinking = true
        msgs.append(a)
        Task { await self.run(q, aid) }
    }

    private func update(_ id: Int, _ f: (inout KalGlimtMsg) -> Void) {
        guard let i = msgs.firstIndex(where: { (m: KalGlimtMsg) -> Bool in m.id == id }) else { return }
        var m: KalGlimtMsg = msgs[i]
        f(&m)
        msgs[i] = m
    }

    private func pause(_ ms: UInt64) async {
        try? await Task.sleep(nanoseconds: ms * 1_000_000)
    }

    private func run(_ q: String, _ id: Int) async {
        let local: KalAnswer = KalAsk.ask(q)
        // Ukjent spørsmål, eller lang innlimt melding uten klokkeslett: serveren (Glimt-agenten med kalenderverktøy).
        let unsure: Bool = local.unknown || (q.count > 50 && local.created?.s == nil)
        var ans: KalAnswer = local
        var fromServer: Bool = false
        var undoId: String = ""
        if unsure {
            update(id) { (m: inout KalGlimtMsg) in m.steps = ["Spør Glimt", "Leser kalenderen", "Skriver svar"] }
            await pause(380)
            update(id) { (m: inout KalGlimtMsg) in m.step = 1 }
            KalGlimtServer.lastCreated = nil
            let srv: KalAnswer? = await KalGlimtServer.ask(q, onSteps: { (steps: [String], at: Int) in
                self.update(id) { (m: inout KalGlimtMsg) in
                    if !steps.isEmpty { m.steps = steps }
                    m.step = Swift.max(1, at)
                }
            })
            if let srv {
                ans = srv
                fromServer = true
            }
        }
        if fromServer {
            if let made = KalGlimtServer.lastCreated {
                undoId = made
                KalGlimtServer.lastCreated = nil
                await KalStore.shared.load(force: true)
            }
        } else if let p = ans.created {
            undoId = await KalStore.shared.add(p, toastPrefix: nil)
            if let e = KalStore.shared.event(undoId) { ans.cards = [e] }
        }
        let steps: [String] = ans.steps.isEmpty ? ["Tenker"] : ans.steps
        if fromServer {
            update(id) { (m: inout KalGlimtMsg) in
                m.steps = steps
                m.step = steps.count
            }
            await pause(260)
        } else {
            update(id) { (m: inout KalGlimtMsg) in
                m.steps = steps
                m.step = 0
            }
            // Stegene hukes av ett og ett (420 ms), så 260 ms før teksten.
            await pause(380)
            for i in 0..<steps.count {
                update(id) { (m: inout KalGlimtMsg) in m.step = i + 1 }
                await pause(i + 1 < steps.count ? 420 : 260)
            }
        }
        let text: String = ans.text
        let cards: [KalEvent] = ans.cards
        let slots: [KalSlot] = ans.slots
        let uid: String = undoId
        update(id) { (m: inout KalGlimtMsg) in
            m.thinking = false
            m.text = text
            m.cards = cards
            m.slots = slots
            m.undoId = uid
            m.shown = 0
        }
        let total: Int = text.split(separator: " ").count
        var n: Int = 0
        while n < total {
            n += 2
            let shown: Int = n
            update(id) { (m: inout KalGlimtMsg) in m.shown = shown }
            await pause(45)
        }
        KalHaptic.done()
    }

    func undo(_ m: KalGlimtMsg) {
        KalStore.shared.undo(m.undoId)
        update(m.id) { (x: inout KalGlimtMsg) in x.undone = true }
    }

    /// Lukker panelet: animasjonene stopper og svarene vises ferdig.
    func finishAll() {
        for i in 0..<msgs.count {
            msgs[i].thinking = false
            msgs[i].shown = 9999
        }
    }
}

/// POST /api/assist {q, source:'calendar'} → {text, steps[], events[], slots[], created?}. 202 {jobId} → GET /api/assist/:id.
@MainActor
enum KalGlimtServer {
    static var lastCreated: String? = nil

    static func ask(_ q: String, onSteps: @escaping ([String], Int) -> Void) async -> KalAnswer? {
        guard let d = try? await KalNet.send("POST", "/api/assist", json: ["q": q, "source": "calendar"], timeout: 30) else { return nil }
        var o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        if let a = answer(o) { return a }
        guard let job = (o["jobId"] as? String) ?? (o["id"] as? String) else { return nil }
        var rounds: Int = 0
        while rounds < 90 {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            rounds += 1
            guard let d2 = try? await KalNet.get("/api/assist/" + KalNet.enc(job)) else { continue }
            o = ((try? JSONSerialization.jsonObject(with: d2)) as? [String: Any]) ?? [:]
            let state: String = (o["state"] as? String) ?? ""
            if state == "failed" || state == "cancelled" { return nil }
            let st: ([String], Int) = steps(o)
            onSteps(st.0, st.1)
            if state == "done" || state.isEmpty, let a = answer(o) { return a }
        }
        return nil
    }

    static func steps(_ o: [String: Any]) -> ([String], Int) {
        let raw: [Any] = (o["steps"] as? [Any]) ?? []
        var names: [String] = []
        var done: Int = 0
        for s in raw {
            if let t = s as? String { names.append(t); continue }
            if let d = s as? [String: Any] {
                let label: String = (d["label"] as? String) ?? (d["n"] as? String) ?? ""
                if label.isEmpty { continue }
                names.append(label)
                if (d["state"] as? String) == "done" { done += 1 }
            }
        }
        return (names, done)
    }

    static func answer(_ raw: [String: Any]) -> KalAnswer? {
        let o: [String: Any] = (raw["answer"] as? [String: Any]) ?? (raw["result"] as? [String: Any]) ?? raw
        guard let text = (o["text"] as? String) ?? (raw["answer"] as? String) else { return nil }
        var a: KalAnswer = KalAnswer()
        a.text = text.replacingOccurrences(of: "**", with: "")
        a.steps = steps(o).0
        if a.steps.isEmpty { a.steps = steps(raw).0 }
        let ids: Set<String> = Set(KalStore.shared.cals.map { (c: KalCal) -> String in c.id })
        for e in (o["events"] as? [Any]) ?? [] {
            if let d = e as? [String: Any], let ev = KalParse.event(d, calIds: ids) { a.cards.append(ev) }
        }
        for s in (o["slots"] as? [Any]) ?? [] {
            guard let d = s as? [String: Any] else { continue }
            let day: String = (d["date"] as? String) ?? (d["day"] as? String) ?? (d["d"] as? String) ?? ""
            let st: Int? = KalParse.hmMin(d["start"] ?? d["s"])
            let en: Int? = KalParse.hmMin(d["end"] ?? d["e"])
            if KalD.valid(String(day.prefix(10))), let st {
                a.slots.append(KalSlot(day: String(day.prefix(10)), s: st, e: en ?? st + 60))
            }
        }
        if let c = o["created"] as? [String: Any] {
            if let ev = KalParse.event(c, calIds: ids) {
                lastCreated = ev.id
                if a.cards.isEmpty { a.cards = [ev] }
            } else if let id = c["id"] as? String {
                lastCreated = id
            }
        } else if let id = o["created"] as? String {
            lastCreated = id
        }
        return a
    }
}

/* ---------- Panelet ---------- */

struct KalGlimtPanel: View {
    @Environment(\.kal) private var t
    @MainActor private var g: KalGlimtModel { KalGlimtModel.shared }
    @MainActor private var s: KalStore { KalStore.shared }
    @FocusState private var focused: Bool

    var body: some View {
        GeometryReader { (geo: GeometryProxy) in
            VStack(spacing: 0) {
                KalGrabber().padding(.top, 10)
                header
                Rectangle().fill(t.line2).frame(height: 1)
                messages
                footer
            }
            .frame(width: geo.size.width, height: geo.size.height * 0.82)
            .background(t.card)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
            .shadow(color: Color.black.opacity(0.15), radius: 20, y: -10)
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            KalOrb(size: 42, thinking: g.thinking)
            VStack(alignment: .leading, spacing: 1) {
                Text("Glimt").font(KalFont.serif(24)).foregroundStyle(t.ink)
                Text(g.thinking ? "TENKER …" : "KALENDER-ASSISTENT · LOKALT + GEMINI").font(KalFont.mono(10)).tracking(1.1).foregroundStyle(t.mut2).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            KalPill(title: "Ferdig") { close() }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 12)
    }

    private func close() {
        g.finishAll()
        withAnimation(.easeOut(duration: 0.25)) { s.glimtOpen = false }
    }

    private var messages: some View {
        ScrollViewReader { (proxy: ScrollViewProxy) in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if g.msgs.isEmpty { empty }
                    ForEach(g.msgs) { (m: KalGlimtMsg) in
                        KalGlimtRow(m: m).id(m.id)
                    }
                    Color.clear.frame(height: 4).id("bunn")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .scrollIndicators(.hidden)
            .onChange(of: scrollKey) { (_: String, _: String) in
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bunn", anchor: .bottom) }
            }
        }
    }

    private var scrollKey: String {
        g.msgs.map { (m: KalGlimtMsg) -> String in String(m.id) + "-" + String(m.step) + "-" + String(m.shown) }.joined(separator: ",")
    }

    private var empty: some View {
        VStack(spacing: 14) {
            KalOrb(size: 92, thinking: false).padding(.top, 30)
            Text("Hva lurer du på?").font(KalFont.serif(26)).foregroundStyle(t.ink)
            Text("Spør om kalenderen din, finn ledig tid, eller lim inn en melding, så legger jeg den inn.")
                .font(KalFont.ui(13.5)).foregroundStyle(t.mut).multilineTextAlignment(.center).frame(maxWidth: 280)
            KalFlow(spacing: 6) {
                ForEach(KalGlimtModel.suggestions, id: \.self) { (n: String) in
                    KalSuggestion(title: n, bg: t.bg) { g.send(n) }
                }
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if !g.msgs.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(KalGlimtModel.suggestions, id: \.self) { (n: String) in
                            KalSuggestion(title: n, bg: t.bg, height: 30) { g.send(n) }
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
            HStack(spacing: 8) {
                KalSpark(size: 20, fast: g.thinking)
                TextField("Spør Glimt …", text: Binding(get: { g.input }, set: { (v: String) in g.input = v }))
                    .font(KalFont.ui(16, .medium))
                    .foregroundStyle(t.ink)
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit { g.send(g.input) }
                Button(action: { g.send(g.input) }) {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold))
                        .foregroundStyle(t.bg)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(g.input.trimmingCharacters(in: .whitespaces).isEmpty ? t.mut2 : t.ink))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Send")
            }
            .padding(.leading, 14)
            .padding(.trailing, 6)
            .frame(height: 50)
            .background(RoundedRectangle(cornerRadius: 25).fill(t.bg))
            .overlay(RoundedRectangle(cornerRadius: 25).strokeBorder(t.line, lineWidth: 1))
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}

struct KalSuggestion: View {
    @Environment(\.kal) private var t
    let title: String
    let bg: Color
    var height: CGFloat = 34
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(KalFont.ui(12.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                .padding(.horizontal, 13)
                .frame(height: height)
                .background(Capsule().fill(bg))
                .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

/// Én melding i panelet.
struct KalGlimtRow: View {
    @Environment(\.kal) private var t
    let m: KalGlimtMsg

    var body: some View {
        Group {
            if m.user {
                HStack {
                    Spacer(minLength: 40)
                    Text(m.text).font(KalFont.ui(14.5)).foregroundStyle(t.bg)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 4, topTrailingRadius: 18).fill(t.ink))
                }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    KalSpark(size: 22, fast: !m.done)
                    VStack(alignment: .leading, spacing: 8) {
                        if m.thinking { thinkingView } else { answer }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .transition(.opacity.combined(with: .offset(y: 8)))
    }

    private var thinkingView: some View {
        VStack(alignment: .leading, spacing: 7) {
            KalShimmer(text: "Glimt tenker")
            ForEach(Array(m.steps.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                KalStepRow(name: pair.element, done: pair.offset < m.step, active: pair.offset == m.step)
            }
        }
        .padding(.top, 2)
    }

    @ViewBuilder private var answer: some View {
        let shownText: String = m.words.prefix(m.shown).joined(separator: " ")
        HStack(alignment: .lastTextBaseline, spacing: 2) {
            Text(shownText).font(KalFont.ui(14.5)).foregroundStyle(t.ink).lineSpacing(3)
            if !m.done { KalCaret() }
        }
        if m.done {
            ForEach(m.cards) { (e: KalEvent) in KalGlimtCard(e: e) }
            if !m.slots.isEmpty {
                KalFlow(spacing: 6) {
                    ForEach(m.slots, id: \.self) { (sl: KalSlot) in KalSlotChip(slot: sl) }
                }
            }
            if !m.undoId.isEmpty && !m.undone {
                Button(action: { KalGlimtModel.shared.undo(m) }) {
                    Text("Angre").font(KalFont.ui(12, .bold)).foregroundStyle(t.ink)
                        .padding(.horizontal, 12).frame(height: 30)
                        .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
            }
        }
    }
}

struct KalStepRow: View {
    @Environment(\.kal) private var t
    let name: String
    let done: Bool
    let active: Bool

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                if done {
                    Circle().fill(t.green)
                    Text("✓").font(.system(size: 8, weight: .heavy)).foregroundStyle(Color.white)
                } else if active {
                    Circle().strokeBorder(Color(kalHex: "#b23a2a"), lineWidth: 2)
                } else {
                    Circle().strokeBorder(t.line, lineWidth: 1.5)
                }
            }
            .frame(width: 14, height: 14)
            Text(name).font(KalFont.ui(12.5, active ? .bold : .medium)).foregroundStyle(done || active ? t.ink : t.mut2)
        }
    }
}

/// Hendelseskort i et svar (åpner arket).
struct KalGlimtCard: View {
    @Environment(\.kal) private var t
    let e: KalEvent

    var body: some View {
        let s: KalStore = KalStore.shared
        let c: KalCal? = s.cal(e.cal)
        let sub: String = (e.day == KalD.todayKey() ? "I dag" : KalD.dl(KalD.date(e.day))) + " · " + (e.loc.isEmpty ? (c?.name ?? "") : e.loc)
        Button(action: {
            if s.event(e.id) == nil { s.linkEvent = e }
            s.openDetail(e)
        }) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4)
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.title).font(KalFont.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(e.allDay ? "Hele dagen" : KalD.hm(e.startMin)).font(KalFont.mono(11.5)).foregroundStyle(t.ink)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 14).fill(t.bg))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line2, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Grønn +chip med ledig tid → «Ny hendelse» ferdig utfylt.
struct KalSlotChip: View {
    let slot: KalSlot

    var body: some View {
        Button(action: {
            KalStore.shared.openNew(day: slot.day, s: slot.s, e: slot.e)
        }) {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 11, weight: .heavy))
                Text(KalD.hm(slot.s) + "–" + KalD.hm(slot.e)).font(KalFont.mono(12.5))
            }
            .foregroundStyle(Color(kalHex: "#235c3b"))
            .padding(.horizontal, 13).frame(height: 34)
            .overlay(Capsule().strokeBorder(Color(kalHex: "#2f7a4f"), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ny hendelse " + KalD.hm(slot.s))
    }
}

/// Enkel flyt-layout (chips som brytes over flere linjer).
struct KalFlow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW: CGFloat = proposal.width ?? 320
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
