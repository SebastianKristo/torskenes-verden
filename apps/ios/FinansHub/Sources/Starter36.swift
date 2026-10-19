import SwiftUI
import UIKit

/* ---------------- Prompt 36: «Starter opp»-skjerm med Glimt mens serveren starter på nytt ----------------
   Fasit: design/Nordlys Starter.dc.html og prompts/prompt-36-pakke/claude-code-nordlys-oppstartsside.md.
   Vises i fullskjerm over appen når oppdateringen restarter tjenestene (Update30Model.reconnecting) eller når
   GET /api/health svarer {ready:false} (serveren starter). Poller /api/health hvert 1,5 s:
   {ready, version, steps:[{id:'db'|'migrate'|'api'|'ai'|'integrations', label, status:'wait'|'run'|'ok', ms}]}.
   Ingen svar = første steg er aktivt. Når ready: «Klar» i 0,8 s, så hentes /api/system/version på nytt og skjermen lukkes.
   Glimt sover (z z z) mens databasen og migrasjonene kjører, er våken mens API og AI starter og snakker når alt er klart.
   Etter 40 s: «Last inn på nytt nå». Etter 3 min: «Det tar lengre tid enn vanlig» + «Vis logg».
   «Reduser bevegelse»: ingen bane-prikker eller sveving. */

@MainActor
@Observable
final class Starter36Model {
    static let shared = Starter36Model()

    struct Step: Identifiable, Equatable {
        let id: String
        let label: String
        var status: String
        var ms: Int
    }

    var active: Bool = false
    var ready: Bool = false
    var version: String = ""
    var steps: [Step] = Starter36Model.defaults()
    var startedAt: Date = Date()
    @ObservationIgnored private var poll: Task<Void, Never>? = nil

    static func defaults() -> [Step] {
        [
            Step(id: "db", label: "Starter databasen", status: "run", ms: 0),
            Step(id: "migrate", label: "Kjører migrasjoner", status: "wait", ms: 0),
            Step(id: "api", label: "Starter web og API", status: "wait", ms: 0),
            Step(id: "ai", label: "Vekker Glimt og AI-modellene", status: "wait", ms: 0),
            Step(id: "integrations", label: "Kobler til integrasjoner", status: "wait", ms: 0),
        ]
    }

    func begin(_ store: Store) {
        if active { return }
        startedAt = Date()
        ready = false
        steps = Starter36Model.defaults()
        let u: Update30Model = Update30Model.shared
        version = u.latest.isEmpty ? u.current : u.latest
        withAnimation(.easeOut(duration: 0.3)) { active = true }
        startPolling(store)
    }

    /// Sjekker én gang (når appen kommer i forgrunnen): starter serveren, vises skjermen.
    func probe(_ store: Store) async {
        if active || !store.loggedIn { return }
        let api: API = store.api
        guard let d = try? await api.callAt("/api", "GET", "/health", timeout: 4) else { return }
        let o: [String: Any] = JS.obj(d)
        if JS.bool(o, "ready") == false {
            begin(store)
            apply(o)
        }
    }

    func pokeNow(_ store: Store) {
        Haptics.shared.tap()
        startPolling(store)
    }

    private func startPolling(_ store: Store) {
        poll?.cancel()
        let api: API = store.api
        poll = Task { @MainActor in
            while !Task.isCancelled {
                let done: Bool = await Starter36Model.shared.tick(api, store)
                if done { return }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }

    private func tick(_ api: API, _ store: Store) async -> Bool {
        do {
            let d: Data = try await api.callAt("/api", "GET", "/health", timeout: 3)
            let o: [String: Any] = JS.obj(d)
            apply(o)
            // Eldre server uten «ready»: 200 betyr at den kjører.
            let isReady: Bool = JS.bool(o, "ready") ?? true
            if isReady {
                finish(store)
                return true
            }
        } catch let e as APIError where e.status == 404 {
            // Ingen /api/health: serveren svarer, altså oppe.
            finish(store)
            return true
        } catch {
            // Ingen svar: første steg er aktivt.
            if steps.allSatisfy({ $0.status != "ok" }) {
                steps = Starter36Model.defaults()
            }
        }
        if Date().timeIntervalSince(startedAt) > 900 {
            withAnimation(.easeOut(duration: 0.3)) { active = false }
            return true
        }
        return false
    }

    private func apply(_ o: [String: Any]) {
        if let v = JS.str(o, "version"), !v.isEmpty { version = v }
        let list: [[String: Any]] = JS.list(o, "steps")
        if list.isEmpty { return }
        var next: [Step] = Starter36Model.defaults()
        for i in next.indices {
            if let m = list.first(where: { JS.str($0, "id") == next[i].id }) {
                next[i].status = JS.str(m, "status") ?? "wait"
                next[i].ms = JS.int(m, "ms") ?? 0
            } else {
                next[i].status = "wait"
            }
        }
        steps = next
    }

    private func finish(_ store: Store) {
        steps = steps.map { (s: Step) -> Step in Step(id: s.id, label: s.label, status: "ok", ms: s.ms) }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { ready = true }
        Haptic30.double()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 800_000_000)
            await Update30Model.shared.load(store, force: true)
            withAnimation(.easeOut(duration: 0.35)) { Starter36Model.shared.active = false }
        }
    }

    /* ---------- Visning ---------- */

    var pct: Int {
        if ready { return 100 }
        var v: Double = 0
        for s in steps {
            if s.status == "ok" { v += 1 } else if s.status == "run" { v += 0.5 }
        }
        return Int((v / Double(Swift.max(1, steps.count)) * 100).rounded())
    }

    /// Søvn mens databasen og migrasjonene kjører, våken under API og AI, snakker når klar.
    var mood: Glimt35Mood {
        if ready { return .talk }
        let early: Bool = steps.prefix(2).contains { $0.status != "ok" }
        return early ? .sover : .idle
    }

    var line: String {
        if ready { return "Alt kjører! Laster inn Homelab …" }
        if steps.prefix(2).contains(where: { $0.status != "ok" }) { return "Serveren starter på nytt etter oppdateringen. Glimt sover litt …" }
        if steps.count > 3 && steps[3].status != "ok" {
            return steps[2].status == "ok" ? "Nesten klar. Glimt varmer opp modellene." : "Glimt våkner og sjekker at alt er på plass."
        }
        return "Nesten klar. Glimt varmer opp modellene."
    }

    /// «4.29.0» → «4.29».
    var short: String {
        let ps: [Substring] = version.split(separator: ".")
        if ps.count >= 2 { return String(ps[0]) + "." + String(ps[1]) }
        return version
    }
}

/// Legges øverst i PaperShell (System31Host) og på System-siden. Tar hele skjermen og skjuler fanelinjen.
struct Starter36Overlay: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Starter36Model { Starter36Model.shared }
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        ZStack {
            if m.active {
                Starter36Screen()
                    .transition(.opacity)
                    .zIndex(10)
            }
        }
        .onChange(of: u.reconnecting) { (_: Bool, v: Bool) in
            if v { m.begin(store) }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { (_: Notification) in
            Task { await m.probe(store) }
        }
    }
}

struct Starter36Screen: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Starter36Model { Starter36Model.shared }

    var body: some View {
        ZStack {
            Starter36Back(reduce: reduce)
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 18) {
                    Spacer(minLength: 30)
                    Starter36Ring(reduce: reduce)
                    Starter36Titles()
                    Starter36Steps()
                    Starter36Foot()
                    Spacer(minLength: 20)
                }
                .frame(maxWidth: 440)
                .padding(.horizontal, 20)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        }
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(m.ready ? "Klar" : "Starter opp")
    }
}

/// Nordlys-gradienten med sakte bevegelse (14 s) og blur.
struct Starter36Back: View {
    let reduce: Bool
    @State private var drift: Bool = false

    var body: some View {
        System31Aurora()
            .scaleEffect(drift ? 1.18 : 1.05)
            .offset(x: drift ? -18 : 18, y: drift ? 12 : -12)
            .blur(radius: 18)
            .background(Color(hex: "#101a2e"))
            .ignoresSafeArea()
            .onAppear {
                if reduce { return }
                withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) { drift = true }
            }
    }
}

/// Glimt (128) i fremdriftsringen (Ø 208, strek 5, grønn → fersken → oransje) med tre lysende prikker i bane (9 s) og %-pille.
struct Starter36Ring: View {
    @MainActor private var m: Starter36Model { Starter36Model.shared }
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    let reduce: Bool

    private static let grad: AngularGradient = AngularGradient(
        colors: [Color(hex: "#3fbf9a"), Color(hex: "#ffd9c2"), Color(hex: "#ff8a5c"), Color(hex: "#3fbf9a")],
        center: .center, startAngle: .degrees(-90), endAngle: .degrees(270))

    var body: some View {
        VStack(spacing: -14) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.14), lineWidth: 5)
                Circle()
                    .trim(from: 0, to: CGFloat(m.pct) / 100)
                    .stroke(Starter36Ring.grad, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeOut(duration: 0.5), value: m.pct)
                if !reduce { Starter36Orbit() }
                Glimt35Live(id: g.cfg.host, size: 128, mood: m.mood)
                    .offset(y: -6)
            }
            .frame(width: 208, height: 208)
            Text(m.ready ? "✓" : "\(m.pct) %").font(PF.mono(12)).foregroundStyle(Color(hex: "#1b1a17"))
                .padding(.horizontal, 12).frame(height: 26)
                .background(Color.white.opacity(0.92), in: Capsule())
        }
    }
}

struct Starter36Orbit: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
            let a: Double = G36Anim.loop(ctx.date.timeIntervalSinceReferenceDate, 9) * 360
            ZStack {
                ForEach(0..<3, id: \.self) { (i: Int) in
                    Circle().fill(Color.white)
                        .frame(width: 6, height: 6)
                        .shadow(color: Color.white.opacity(0.9), radius: 4)
                        .offset(y: -104)
                        .rotationEffect(.degrees(a + Double(i) * 120))
                }
            }
        }
        .allowsHitTesting(false)
    }
}

struct Starter36Titles: View {
    @MainActor private var m: Starter36Model { Starter36Model.shared }

    var body: some View {
        VStack(spacing: 8) {
            Text(m.ready ? "KLAR" : "STARTER OPP").font(PF.mono(11.5)).tracking(1.6).foregroundStyle(Color.white.opacity(0.75))
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("Nordlys").font(PF.ui(34, .heavy)).foregroundStyle(Color.white)
                Text("OS ").font(PF.ui(34, .medium)).foregroundStyle(Color.white.opacity(0.75))
                Text(m.short).font(PF.ui(34, .heavy))
                    .foregroundStyle(LinearGradient(colors: [Color.white, Color(hex: "#ffd9c2"), Color(hex: "#ff8a5c")],
                                                    startPoint: .top, endPoint: .bottom))
            }
            .lineLimit(1).minimumScaleFactor(0.6)
            Text(m.line).font(PF.ui(15, .medium)).foregroundStyle(Color.white.opacity(0.88))
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .animation(.easeOut(duration: 0.25), value: m.line)
        }
    }
}

struct Starter36Steps: View {
    @MainActor private var m: Starter36Model { Starter36Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(m.steps) { (s: Starter36Model.Step) in
                Starter36StepRow(step: s)
            }
        }
        .padding(.vertical, 6).padding(.horizontal, 14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.18), lineWidth: 1))
    }
}

struct Starter36StepRow: View {
    let step: Starter36Model.Step

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                if step.status == "ok" {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color(hex: "#3fbf9a"))
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                } else if step.status == "run" {
                    ProgressView().controlSize(.small).tint(Color.white)
                } else {
                    Circle().fill(Color.white.opacity(0.3)).frame(width: 7, height: 7)
                }
            }
            .frame(width: 22, height: 22)
            Text(step.label).font(PF.ui(14, step.status == "run" ? .bold : .medium))
                .foregroundStyle(Color.white.opacity(step.status == "wait" ? 0.55 : 0.95))
                .frame(maxWidth: .infinity, alignment: .leading)
            if step.status == "ok" && step.ms > 0 {
                Text(Starter36StepRow.sec(step.ms)).font(PF.mono(11.5)).foregroundStyle(Color.white.opacity(0.6))
            }
        }
        .frame(minHeight: 40)
        .animation(.spring(response: 0.35, dampingFraction: 0.6), value: step.status)
    }

    static func sec(_ ms: Int) -> String {
        let s: Double = Double(ms) / 1000
        return String(format: "%.1f s", s).replacingOccurrences(of: ".", with: ",")
    }
}

/// «Siden lastes inn automatisk når serveren svarer · 23 s», etter 40 s «Last inn på nytt nå», etter 3 min lengre tid + logg.
struct Starter36Foot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Starter36Model { Starter36Model.shared }

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { (ctx: TimelineViewDefaultContext) in
            let s: Int = Swift.max(0, Int(ctx.date.timeIntervalSince(m.startedAt)))
            VStack(spacing: 10) {
                Text("Appen lastes inn automatisk når serveren svarer · \(s) s").font(PF.ui(12.5)).foregroundStyle(Color.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                if s >= 180 {
                    Text("Det tar lengre tid enn vanlig").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#ffd9c2"))
                    Button { store.openURL(URL(string: store.api.base)) } label: {
                        Text("Vis logg").font(PF.ui(13, .bold)).foregroundStyle(Color.white).underline()
                            .frame(minHeight: 36).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                if s >= 40 && !m.ready {
                    Button { m.pokeNow(store) } label: {
                        Text("Last inn på nytt nå").font(PF.ui(13.5, .bold)).foregroundStyle(Color.white)
                            .padding(.horizontal, 16).frame(height: 38)
                            .background(Color.white.opacity(0.14), in: Capsule())
                            .overlay(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
