import SwiftUI

/* ---------------- Prompt 34: Kalender for Mac – søk med Glimt-svar (sr / ask() / srLocal() / srCloud() i Kalender.dc.html) ---------------- */
// Rettelsene fra claude-code-kalender-web-ai-sok.md gjelder også her:
// - Enter i feltet → ask() (onSubmit på selve feltet, ingen globale snarveier mens søket er åpent; Esc lukker).
// - Delord: «frisørtime» → «frisør» (MacAsk.terms/hit).
// - Ingen lokal forståelse → «Jeg er ikke sikker …» + de neste 5, og serveren spørres parallelt (12 s); svaret erstatter teksten.
// - Lokal tenketid 420 ms med Glimt-merket. Forrige svar blir stående mens man skriver (keep) og byttes først ved Enter.
// - Ingen blur og ingen periodisk omtegning: søkearket har egen tilstand (MacSearchModel), uavhengig av vinduet.

@MainActor
final class MacSearchModel: ObservableObject {
    @Published var query: String = ""
    @Published var cal: String? = nil
    /// Svaret som vises (blir stående mens man skriver).
    @Published var answerQ: String = ""
    @Published var answer: MacAnswer? = nil
    @Published var busy: Bool = false
    @Published var cloud: Bool = false
    private var seq: Int = 0

    func ask() {
        let q: String = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty { return }
        seq += 1
        let my: Int = seq
        busy = true
        cloud = false
        answerQ = q
        Task {
            try? await Task.sleep(nanoseconds: 420_000_000)
            if my != self.seq { return }
            let local: MacAnswer = MacAsk.ask(q)
            if local.created != nil {
                // «legg til tannlege fredag kl 9» i søket: legg inn med en gang (kan angres i toasten).
                if let p = local.created { await MacStore.shared.add(p, toastPrefix: "Glimt la til") }
            }
            self.answer = local
            self.busy = false
            if local.unknown { await self.askCloud(q, my) }
        }
    }

    private func askCloud(_ q: String, _ my: Int) async {
        cloud = true
        // 12 s tidsgrense: da vises feilen, og et senere svar ignoreres.
        let timer: Task<Void, Never> = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            if Task.isCancelled || my != self.seq || !self.cloud { return }
            self.cloud = false
            if var a = self.answer {
                a.error = "Glimt svarte ikke innen 12 sekunder."
                self.answer = a
            }
        }
        let r: MacGlimtServer.Reply = await MacGlimtServer.ask(q, onSteps: { (_: [String], _: Int) in })
        timer.cancel()
        if my != seq || !cloud { return }
        cloud = false
        if var a = r.answer {
            if a.cards.isEmpty { a.cards = answer?.cards ?? [] }
            answer = a
        } else if !r.error.isEmpty, var a = answer {
            a.error = r.error
            answer = a
        }
    }
}

struct MacSearchView: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @StateObject private var m: MacSearchModel = MacSearchModel()
    @ObservedObject var store: MacStore = MacStore.shared
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            field
            filters
            Rectangle().fill(t.line2).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if m.answer != nil || m.busy { MacSearchAnswer(m: m, win: win) }
                    if m.query.trimmingCharacters(in: .whitespaces).isEmpty && m.cal == nil {
                        suggestions
                    } else {
                        results
                    }
                }
                .padding(14)
            }
            .frame(maxHeight: 520)
        }
        .frame(width: 660)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.bg))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(t.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.25), radius: 30, y: 14)
        .onAppear { focused = true }
        .onExitCommand { win.searchOpen = false }
    }

    private var field: some View {
        HStack(spacing: 8) {
            HStack(spacing: 10) {
                MacSearchMark(busy: m.busy || m.cloud)
                TextField("Søk, eller spør: «når er neste frisørtime?»", text: $m.query)
                    .textFieldStyle(.plain)
                    .font(MacFont.ui(15, .medium))
                    .foregroundColor(t.ink)
                    .focused($focused)
                    .onSubmit { m.ask() }
                Button(action: { m.ask() }) {
                    Text("✦ Spør").font(MacFont.ui(12.5, .bold)).foregroundColor(t.bg)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(Capsule().fill(t.ink))
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 12).padding(.trailing, 6)
            .frame(height: 46)
            .background(Capsule().fill(t.card))
            .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
            MacPill(title: "Avbryt", filled: false) { win.searchOpen = false }
                .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                MacChip(title: "Alle", on: m.cal == nil) { m.cal = nil }
                ForEach(store.cals.uniqueIds()) { (c: KalCal) in
                    MacChip(title: c.name, on: m.cal == c.id, dot: t.calColor(c)) { m.cal = m.cal == c.id ? nil : c.id }
                }
            }
            .padding(.horizontal, 14)
        }
        .padding(.bottom, 10)
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 8) {
            MacLabel(text: "SPØR GLIMT")
            MacFlow(spacing: 6) {
                ForEach(["Når er neste frisørtime?", "Er jeg ledig fredag ettermiddag?", "Hva skjer i morgen?", "Neste frist?"], id: \.self) { (s: String) in
                    MacSuggestion(title: s) {
                        m.query = s
                        m.ask()
                    }
                }
            }
            MacLabel(text: "SNART").padding(.top, 6)
            VStack(spacing: 2) {
                ForEach(store.upcoming(limit: 6).uniqueIds()) { (e: KalEvent) in
                    MacSearchRow(e: e) { open(e) }
                }
            }
        }
    }

    private var results: some View {
        let list: [KalEvent] = MacAsk.search(m.query, cal: m.cal)
        let tk: String = KalD.todayKey()
        let coming: [KalEvent] = list.filter { (e: KalEvent) -> Bool in e.day >= tk }
        let past: [KalEvent] = list.filter { (e: KalEvent) -> Bool in e.day < tk }.reversed()
        let ordered: [KalEvent] = Array((coming + past).uniqueIds().prefix(80))
        let days: [String] = MacSearchView.uniqueDays(ordered)
        return VStack(alignment: .leading, spacing: 10) {
            Text(list.isEmpty ? "Ingen treff. Trykk Enter for å spørre Glimt." : String(list.count) + " treff")
                .font(MacFont.ui(12.5)).foregroundColor(t.mut)
            ForEach(days, id: \.self) { (k: String) in
                VStack(alignment: .leading, spacing: 2) {
                    Text(KalD.cap(MacAsk.rel(k))).font(MacFont.ui(12.5, .heavy)).foregroundColor(k == tk ? t.acc : t.ink)
                    ForEach(ordered.filter { (e: KalEvent) -> Bool in e.day == k }) { (e: KalEvent) in
                        MacSearchRow(e: e) { open(e) }
                    }
                }
            }
        }
    }

    static func uniqueDays(_ list: [KalEvent]) -> [String] {
        var out: [String] = []
        for e in list where !out.contains(e.day) { out.append(e.day) }
        return out
    }

    private func open(_ e: KalEvent) {
        win.searchOpen = false
        win.anchor = e.day
        win.miniMonth = KalD.firstOfMonth(KalD.date(e.day))
        win.openDetail(e)
    }
}

/// Glimt-merket (cachet: ett element for «tenker» og ett for «ferdig», så animasjonen ikke starter på nytt for hver tast).
struct MacSearchMark: View, Equatable {
    let busy: Bool

    var body: some View {
        MacSpark(size: 24, fast: busy)
    }

    static func == (a: MacSearchMark, b: MacSearchMark) -> Bool { a.busy == b.busy }
}

struct MacSearchAnswer: View {
    @Environment(\.mk) private var t
    @ObservedObject var m: MacSearchModel
    @ObservedObject var win: MacWin

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                MacSearchMark(busy: m.busy || m.cloud).equatable()
                MacLabel(text: m.busy ? "GLIMT TENKER …" : (m.cloud ? "GLIMT · SPØR SERVEREN …" : "GLIMT"), color: t.acc)
                Spacer()
                Text("«" + m.answerQ + "»").font(MacFont.ui(11.5)).foregroundColor(t.mut).lineLimit(1)
            }
            if let a = m.answer {
                Text(a.text).font(MacFont.ui(14)).foregroundColor(t.ink).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                if !a.error.isEmpty {
                    Text(a.error).font(MacFont.ui(12.5, .semibold)).foregroundColor(t.acc)
                }
                ForEach(a.cards.uniqueIds()) { (e: KalEvent) in MacGlimtCard(e: e, win: win) }
                if !a.slots.isEmpty {
                    MacFlow(spacing: 6) {
                        ForEach(a.slots, id: \.self) { (sl: MacSlot) in MacSlotChip(slot: sl, win: win) }
                    }
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color(kalHex: "#7a5ad6", opacity: 0.22), lineWidth: 1))
    }
}

struct MacSearchRow: View {
    @Environment(\.mk) private var t
    let e: KalEvent
    let action: () -> Void
    @State private var hover: Bool = false

    var body: some View {
        let c: KalCal? = KalFag37.tint(MacStore.shared.cal(e.cal), e)
        let when: String = e.allDay ? "Hele dagen" : KalD.hm(e.startMin)
        let sub: String = KalD.dl(KalD.date(e.day)) + (e.loc.isEmpty ? "" : " · " + e.loc)
        Button(action: action) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4, height: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(MacFont.ui(13.5, .bold)).foregroundColor(t.ink).lineLimit(1)
                    Text(sub).font(MacFont.ui(11.5)).foregroundColor(t.mut).lineLimit(1)
                }
                Spacer()
                Text(when).font(MacFont.mono(11)).foregroundColor(t.mut)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 10).fill(hover ? t.card : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { (h: Bool) in hover = h }
    }
}
