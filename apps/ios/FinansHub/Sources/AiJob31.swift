import SwiftUI
import UIKit

/* ---------------- Prompt 31: Glimt-toast og glassboble for AI-jobber ---------------- */
// Fasit: design/Mobil Papir App.dc.html → aiToastEl() + aiSpark(), prompts/prompt-31-pakke/claude-code-ai-boble.md.
// Lukket: mørk pille rgba(27,26,23,.92) + blur, Glimt-merket (24 pt, Tenker) + tekst + tre prikker + ▾.
// Trykk: pillen vokser til en glassboble (340 pt, radius 28, .ultraThinMaterial + matchedGeometryEffect, lett overshoot):
// merket (28) · tittel · «Glimt · lokal» · prosent, det brukeren skrev (kursiv), steg (✓ / pulserende ring / grå ring),
// feltene Hva/Når/Kalender/Varsel, Avbryt og Skjul. Trykk hvor som helst på boblen = skjul (jobben fortsetter).
// Live-data: realtime «calendar-quick» og «assist» med {jobId, state, steps[], fields[], progress, title, model, input}
// (SERVER31). Uten slike felt vises standardstegene, og fremdriften anslås ut fra tiden.

struct AiStep31: Equatable, Identifiable {
    let name: String
    /// done | active | pending
    var state: String
    var id: String { name }
}

struct AiField31: Equatable, Identifiable {
    let key: String
    let value: String
    var id: String { key }
}

struct AiJob31: Identifiable, Equatable {
    var id: String
    /// quick (rask time) | assist (søkefelt/Chat) | annet
    var kind: String
    var title: String
    var model: String = "Glimt · lokal"
    var input: String = ""
    var steps: [AiStep31] = []
    var fields: [AiField31] = []
    /// 0…100, -1 = anslås fra tiden.
    var progress: Int = -1
    var started: Date = Date()
    /// Siden som viser jobben selv (Hjem-søket, Chat): der vises ikke toasten.
    var page: String = ""

    /// «Legger til i kalenderen …»
    var toastText: String { title.hasSuffix("…") ? title : title + " …" }
}

@MainActor
@Observable
final class AiJobs31 {
    static let shared = AiJobs31()

    var jobs: [AiJob31] = []
    var open: Bool = false
    /// «✓ …» i 3 s etter en ferdig jobb.
    var doneText: String? = nil
    /// «Glimt svarte mens du var borte» + svaret (4 s).
    var away: (String, String)? = nil
    var awayTick: Int = 0

    @ObservationIgnored private var doneTask: Task<Void, Never>? = nil
    @ObservationIgnored private var awayTask: Task<Void, Never>? = nil

    nonisolated static let quickSteps: [String] = ["Leser teksten", "Finner dato og klokkeslett", "Sjekker kalenderen for kollisjoner", "Lagrer avtalen"]
    nonisolated static let assistSteps: [String] = ["Leser spørsmålet", "Velger verktøy", "Henter data", "Skriver svaret"]

    func begin(id: String, kind: String, title: String, input: String, steps: [String], page: String = "") {
        jobs.removeAll { $0.id == id }
        var j = AiJob31(id: id, kind: kind, title: title)
        j.input = input
        j.page = page
        j.steps = steps.enumerated().map { (pair: (offset: Int, element: String)) -> AiStep31 in
            AiStep31(name: pair.element, state: pair.offset == 0 ? "active" : "pending")
        }
        jobs.append(j)
    }

    func rename(_ old: String, to new: String) {
        guard let i = jobs.firstIndex(where: { $0.id == old }) else { return }
        jobs[i].id = new
    }

    /// Jobben er ferdig (eller feilet/avbrutt). Med tekst vises «✓ …» i 3 s.
    func end(_ id: String, done: String? = nil) {
        jobs.removeAll { $0.id == id }
        if jobs.isEmpty { open = false }
        guard let done, !done.isEmpty else { return }
        doneText = done
        doneTask?.cancel()
        doneTask = Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if !Task.isCancelled { self.doneText = nil }
        }
    }

    /// Realtime-hendelse fra serveren (calendar-quick eller assist).
    func update(_ o: [String: Any], kind: String) {
        let id: String = JS.str(o, "jobId") ?? JS.str(o, "id") ?? ""
        if id.isEmpty { return }
        let state: String = JS.str(o, "state") ?? ""
        if state == "done" || state == "failed" || state == "cancelled" {
            // Ferdig: Quick29Model avslutter sine egne jobber (med banneret); andre (f.eks. fra Snarveier) fjernes her.
            if kind != "quick" || !Quick29Model.shared.pending.contains(id) { end(id) }
            return
        }
        var j: AiJob31
        // Prompt 36: Glimt-spørsmål fra søkefeltet vises bare i kortet under feltet. Realtime «assist» lager derfor aldri
        // en ny pille; den oppdaterer bare jobber som er startet med begin() (Chat og handlinger).
        if kind == "assist" && !jobs.contains(where: { $0.id == id }) { return }
        if let i = jobs.firstIndex(where: { $0.id == id }) {
            j = jobs[i]
        } else if kind == "quick", let tmp = jobs.firstIndex(where: { $0.id.hasPrefix("tmp-") && $0.kind == "quick" }) {
            j = jobs[tmp]
            j.id = id
            jobs.remove(at: tmp)
        } else {
            let steps: [String] = kind == "quick" ? AiJobs31.quickSteps : AiJobs31.assistSteps
            j = AiJob31(id: id, kind: kind, title: kind == "quick" ? "Legger til i kalenderen" : "Glimt tenker")
            j.steps = steps.map { AiStep31(name: $0, state: "pending") }
        }
        if let t = JS.str(o, "title") { j.title = t }
        if let m = JS.str(o, "model") { j.model = m }
        if let inp = JS.str(o, "input") { j.input = inp }
        if let v = JS.num(o, "progress") ?? JS.num(o, "pct") {
            // 0…1 (andel) eller 0…100 (prosent).
            let pc: Double = v > 0 && v < 1 ? v * 100 : v
            j.progress = Swift.max(0, Swift.min(100, Int(pc.rounded())))
        }
        let st: [AiStep31] = AiJobs31.steps(o["steps"])
        if !st.isEmpty { j.steps = st }
        let f: [AiField31] = AiJobs31.fields(o["fields"])
        if !f.isEmpty { j.fields = f }
        if let i = jobs.firstIndex(where: { $0.id == id }) { jobs[i] = j } else { jobs.append(j) }
    }

    /// steps: [{name|label|t, state}] eller ["tekst", …].
    nonisolated static func steps(_ any: Any?) -> [AiStep31] {
        guard let arr = any as? [Any] else { return [] }
        var out: [AiStep31] = []
        for x in arr {
            if let s = x as? String {
                out.append(AiStep31(name: s, state: "pending"))
            } else if let o = x as? [String: Any] {
                let n: String = JS.str(o, "name") ?? JS.str(o, "label") ?? JS.str(o, "t") ?? JS.str(o, "title") ?? ""
                if n.isEmpty { continue }
                var s: String = JS.str(o, "state") ?? JS.str(o, "status") ?? "pending"
                if s == "running" || s == "current" { s = "active" }
                out.append(AiStep31(name: n, state: s))
            }
        }
        return out
    }

    /// fields: [["Hva","Nina frisør"], …] eller [{k|key|label, v|value}] eller {Hva: …}.
    nonisolated static func fields(_ any: Any?) -> [AiField31] {
        var out: [AiField31] = []
        if let arr = any as? [Any] {
            for x in arr {
                if let pair = x as? [Any], pair.count >= 2, let k = pair[0] as? String {
                    out.append(AiField31(key: k, value: "\(pair[1])"))
                } else if let o = x as? [String: Any] {
                    let k: String = JS.str(o, "k") ?? JS.str(o, "key") ?? JS.str(o, "label") ?? ""
                    let v: String = JS.str(o, "v") ?? JS.str(o, "value") ?? ""
                    if !k.isEmpty { out.append(AiField31(key: k, value: v)) }
                }
            }
        } else if let o = any as? [String: Any] {
            for (k, v) in o.sorted(by: { $0.key < $1.key }) { out.append(AiField31(key: k, value: "\(v)")) }
        }
        return out
    }

    /// Jobben toasten viser (den nyeste som ikke vises på siden brukeren står på).
    func current(_ page: String) -> AiJob31? {
        jobs.last(where: { $0.page.isEmpty || $0.page != page })
    }

    /// Fremdrift: serverens tall, ellers anslag (≈ 4 s for en rask time), maks 92 %.
    nonisolated static func progress(_ j: AiJob31, now: Date) -> Int {
        if j.progress >= 0 { return j.progress }
        let el: Double = now.timeIntervalSince(j.started)
        let est: Double = j.kind == "quick" ? 4.0 : 6.0
        return Swift.min(92, Int((el / est) * 100))
    }

    /// Stegene med status: serverens, ellers etter anslått fremdrift.
    nonisolated static func liveSteps(_ j: AiJob31, now: Date) -> [AiStep31] {
        if j.steps.contains(where: { $0.state == "done" || $0.state == "active" }) && j.progress >= 0 { return j.steps }
        let n: Int = j.steps.count
        if n == 0 { return [] }
        let pr: Double = Double(progress(j, now: now)) / 100
        let cur: Int = Swift.min(n - 1, Int(pr * Double(n)))
        return j.steps.enumerated().map { (pair: (offset: Int, element: AiStep31)) -> AiStep31 in
            let s: String = pair.offset < cur ? "done" : (pair.offset == cur ? "active" : "pending")
            return AiStep31(name: pair.element.name, state: s)
        }
    }

    func toggle() {
        Haptics.shared.select()
        withAnimation(.spring(response: 0.32, dampingFraction: 0.72)) { open.toggle() }
    }

    func hide() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { open = false }
    }

    /// Avbryt: stopper jobben på serveren. «Avbrutt · ingenting ble lagt til».
    func cancel(_ j: AiJob31, _ store: Store) {
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) { open = false }
        if j.kind == "quick" {
            Quick29Model.shared.cancel31(j.id, store)
        } else if j.kind == "assist" {
            Assist31.shared.cancel(j.id, store)
        }
        end(j.id)
        store.flash("Avbrutt · ingenting ble lagt til")
    }

    /// «Glimt svarte mens du var borte» (4 s).
    func showAway(_ title: String, _ body: String) {
        away = (title, body)
        awayTick += 1
        awayTask?.cancel()
        awayTask = Task {
            try? await Task.sleep(nanoseconds: 4_200_000_000)
            if !Task.isCancelled { self.away = nil; self.awayTick += 1 }
        }
    }

    func closeAway() {
        away = nil
        awayTick += 1
    }
}

extension Quick29Model {
    /// Prompt 31: Avbryt i glassboblen (POST /api/kalender/quick/:id/cancel).
    func cancel31(_ id: String, _ store: Store) {
        pending.removeAll { $0 == id }
        if id.hasPrefix("tmp-") { return }
        let a: API = store.api
        Task { _ = try? await a.callAt("/api", "POST", "/kalender/quick/" + Cal27Model.enc(id) + "/cancel", json: [:], timeout: 10) }
    }
}

/* ---------- Visningen øverst ---------- */

/// Toasten, boblen, «✓ …» og «Glimt svarte mens du var borte». Ligger i Quick29Overlay (PaperShell, over hele appen).
struct Glimt31Overlay: View {
    @Environment(Store.self) private var store
    @MainActor private var m: AiJobs31 { AiJobs31.shared }
    @Namespace private var ns

    var body: some View {
        VStack(spacing: 8) {
            if let a = m.away {
                Glimt31AwayBanner(title: a.0, text: a.1)
                    .transition(.move(edge: .top).combined(with: .opacity))
            } else if let j = m.current(store.paperTab) {
                if m.open {
                    Glimt31Bubble(job: j, ns: ns)
                        .transition(.scale(scale: 0.6, anchor: .top).combined(with: .opacity))
                } else {
                    Glimt31Toast(text: j.toastText, state: .thinking, chevron: true, ns: ns) { m.toggle() }
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            } else if let d = m.doneText {
                Glimt31Toast(text: d, state: .done, chevron: false, ns: ns) { m.doneText = nil }
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.72), value: m.open)
        .animation(.easeOut(duration: 0.28), value: m.jobs.map { $0.id })
        .animation(.easeOut(duration: 0.2), value: m.doneText)
        .animation(.easeOut(duration: 0.25), value: m.awayTick)
    }
}

/// Den mørke pillen: merket + tekst + prikker + ▾.
struct Glimt31Toast: View {
    let text: String
    let state: Glimt31State
    let chevron: Bool
    let ns: Namespace.ID
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 10) {
                Glimt31Mark(size: 24, state: state, dark: true)
                Text(text).font(PF.ui(14, .semibold)).foregroundStyle(Color(hex: "#f3efe6")).lineLimit(1)
                if state != .done { Glimt31Dots() }
                if chevron {
                    Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(hex: "#f3efe6").opacity(0.6))
                }
            }
            .padding(.leading, 10).padding(.trailing, 18).padding(.vertical, 9)
            .background {
                Capsule().fill(Color(hex: "#1b1a17").opacity(0.92))
                    .background(.ultraThinMaterial, in: Capsule())
                    .matchedGeometryEffect(id: "glimt31-bg", in: ns)
            }
            .overlay(Capsule().stroke(Color.white.opacity(0.06), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.5), radius: 15, y: 12)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .accessibilityLabel(text)
        .accessibilityHint(chevron ? "Se hva Glimt gjør" : "")
    }
}

/// Glassboblen med det Glimt jobber med.
struct Glimt31Bubble: View {
    @Environment(Store.self) private var store
    let job: AiJob31
    let ns: Namespace.ID
    @MainActor private var m: AiJobs31 { AiJobs31.shared }

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 0.25)) { (ctx: TimelineViewDefaultContext) in
            content(ctx.date)
        }
        .frame(maxWidth: 340)
        .padding(.horizontal, 16)
        .onAppear { Haptics.shared.select() }
    }

    private func content(_ now: Date) -> some View {
        let pct: Int = AiJobs31.progress(job, now: now)
        let steps: [AiStep31] = AiJobs31.liveSteps(job, now: now)
        return VStack(alignment: .leading, spacing: 12) {
            Glimt31BubbleHead(job: job, pct: pct)
            if !job.input.isEmpty {
                Text("«" + job.input + "»").font(PF.ui(13).italic()).foregroundStyle(Color(hex: "#3d3a33"))
                    .lineLimit(3)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(hex: "#1b1a17").opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 7) {
                ForEach(steps) { (s: AiStep31) in Glimt31StepRow(step: s) }
            }
            if !job.fields.isEmpty { Glimt31Fields(fields: job.fields) }
            Glimt31BubbleButtons(job: job)
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 16)
        .background {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color(hex: "#faf8f3").opacity(0.72))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .matchedGeometryEffect(id: "glimt31-bg", in: ns)
        }
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color.white.opacity(0.6), lineWidth: 1))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color(hex: "#1b1a17").opacity(0.08), lineWidth: 0.5))
        .shadow(color: Color.black.opacity(0.35), radius: 30, y: 20)
        .environment(\.colorScheme, .light)
        .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .onTapGesture { m.hide() }
    }
}

struct Glimt31BubbleHead: View {
    let job: AiJob31
    let pct: Int

    var body: some View {
        HStack(spacing: 10) {
            Glimt31Mark(size: 28, state: .thinking)
            VStack(alignment: .leading, spacing: 0) {
                Text(job.title.replacingOccurrences(of: " …", with: "")).font(PF.ui(15, .bold)).foregroundStyle(Color(hex: "#1b1a17")).lineLimit(1)
                Text(job.model).font(PF.ui(12)).foregroundStyle(Color(hex: "#6b6558")).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(pct) %").font(PF.mono(12)).foregroundStyle(Color(hex: "#6b6558"))
        }
    }
}

struct Glimt31StepRow: View {
    let step: AiStep31
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        let done: Bool = step.state == "done"
        let act: Bool = step.state == "active"
        let ink: Color = done || act ? Color(hex: "#1b1a17") : Color(hex: "#a39c8e")
        HStack(spacing: 10) {
            ZStack {
                if done {
                    Circle().fill(Color(hex: "#2f7d4f"))
                    Image(systemName: "checkmark").font(.system(size: 8.5, weight: .heavy)).foregroundStyle(Color.white)
                } else if act {
                    Glimt31PulseRing()
                } else {
                    Circle().strokeBorder(Color(hex: "#c9c1b1"), lineWidth: 1.5)
                }
            }
            .frame(width: 18, height: 18)
            Text(step.name + (act ? " …" : "")).font(PF.ui(13.5, act ? .bold : .medium)).foregroundStyle(ink).lineLimit(1)
        }
    }
}

/// Rød ring som pulserer (steget som pågår).
struct Glimt31PulseRing: View {
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            let w: Double = Glimt31.wave(ctx.date.timeIntervalSinceReferenceDate, 1.2)
            Circle().strokeBorder(Color(hex: "#b23a2a"), lineWidth: 2)
                .scaleEffect(reduce ? 1 : 0.85 + 0.2 * w)
                .opacity(0.75 + 0.25 * w)
        }
    }
}

struct Glimt31Fields: View {
    let fields: [AiField31]

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
            ForEach(fields) { (f: AiField31) in
                GridRow {
                    Text(f.key).font(PF.ui(12)).foregroundStyle(Color(hex: "#8f897c"))
                    Text(f.value).font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#1b1a17")).lineLimit(1).truncationMode(.tail)
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct Glimt31BubbleButtons: View {
    @Environment(Store.self) private var store
    let job: AiJob31
    @MainActor private var m: AiJobs31 { AiJobs31.shared }

    var body: some View {
        HStack(spacing: 8) {
            Button { m.cancel(job, store) } label: {
                Text("Avbryt").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
                    .frame(maxWidth: .infinity, minHeight: 38)
                    .background(Color(hex: "#1b1a17").opacity(0.08), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Button { m.hide() } label: {
                Text("Skjul").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#f3efe6"))
                    .frame(maxWidth: .infinity, minHeight: 38)
                    .background(Color(hex: "#1b1a17"), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

/// «Glimt svarte mens du var borte» + svaret. Trykk åpner der spørsmålet ble stilt.
struct Glimt31AwayBanner: View {
    @Environment(Store.self) private var store
    let title: String
    let text: String

    var body: some View {
        Button {
            AiJobs31.shared.closeAway()
            Assist31.shared.openAway(store)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Glimt31Mark(size: 24, state: .done, dark: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#f3efe6")).lineLimit(1)
                    Text(text).font(PF.ui(13)).foregroundStyle(Color(hex: "#f3efe6").opacity(0.85)).lineLimit(3)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(Color(hex: "#1b1a17").opacity(0.94), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: Color.black.opacity(0.45), radius: 15, y: 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 440)
        .padding(.horizontal, 12)
        .gesture(DragGesture(minimumDistance: 12).onEnded { (v: DragGesture.Value) in
            if v.translation.height < -10 { AiJobs31.shared.closeAway() }
        })
    }
}
