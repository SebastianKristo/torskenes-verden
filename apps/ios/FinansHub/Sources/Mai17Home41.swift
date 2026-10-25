import SwiftUI
import UIKit

/* ---------------- Prompt 41: 17. mai – eget Hjem på dagen, bryter for vanlig Hjem, hurra og Høytider ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-17-mai.md. Fasit: 17 mai.dc.html og Mobil Papir App.dc.html (maiVals,
   Innstillinger → Tilpass → HØYTIDER).
   API (SERVER41): GET /api/glimt/mai17 → {active, dateLabel, greeting, city, program:[{time, title, kind, past, next}], brief, hurra:{count, text},
   design} · PUT /api/glimt/mai17/design {on} (gjelder bare i dag) · POST /api/glimt/mai17/hurra → {count, text, sent}.
   Innstillingen mai17 (auto | av | pa) ligger i /api/glimt/settings (Glimt35Cfg.mai17). Figurene får sløyfe og flagg 14.–17. mai
   (Glimt40Jul.swift, fase mai17). Uten server (404) vises Hjem-designet likevel på 17. mai med Oslo-programmet som reserve. */

struct Mai17Item41: Identifiable, Hashable {
    var id: String { time + title }
    var time: String
    var title: String
    var kind: String
    var past: Bool
    var next: Bool
}

@MainActor
@Observable
final class Mai17Model41 {
    static let shared = Mai17Model41()

    var active: Bool = false
    var design: Bool = true
    var dateLabel: String = ""
    var greeting: String = ""
    var program: [Mai17Item41] = []
    var hurraText: String = ""
    var confetti: Int = 0
    var loaded: Bool = false
    @ObservationIgnored private var loadedDay: String = ""

    /// 17. mai (eller «Vis nå») og ikke Av.
    var isOn: Bool {
        let mode: String = Glimt35Model.shared.cfg.mai17
        if mode == "av" { return false }
        if mode == "pa" { return true }
        return Glimt40Jul.isMay17() || active
    }

    var showDesign: Bool { isOn && design }

    func load(_ store: Store) async {
        guard isOn else { return }
        let day: String = JS.fmt(Date(), "yyyy-MM-dd")
        if loadedDay == day && loaded { return }
        loadedDay = day
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/glimt/mai17", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            active = JS.bool(o, "active") ?? Glimt40Jul.isMay17()
            design = JS.bool(o, "design") ?? true
            dateLabel = JS.str(o, "dateLabel") ?? ""
            greeting = JS.str(o, "greeting") ?? ""
            program = JS.list(o, "program").map { (x: [String: Any]) -> Mai17Item41 in
                Mai17Item41(time: JS.str(x, "time") ?? "", title: JS.str(x, "title") ?? "", kind: JS.str(x, "kind") ?? "city",
                            past: JS.bool(x, "past") ?? false, next: JS.bool(x, "next") ?? false)
            }
            hurraText = JS.str(JS.dict(o, "hurra"), "text") ?? ""
        } catch {
            local(store)
        }
        loaded = true
    }

    /// Reserve: Oslo-programmet og dagens tekster.
    private func local(_ store: Store) {
        active = Glimt40Jul.isMay17()
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "EEEE d. MMMM"
        let d: String = f.string(from: Date())
        dateLabel = d.prefix(1).uppercased() + String(d.dropFirst()) + " · Grunnlovsdagen"
        let first: String = String(store.displayName.split(separator: " ").first ?? "")
        greeting = "Gratulerer med dagen" + (first.isEmpty ? "!" : ", " + first + "!")
        let now: String = JS.fmt(Date(), "HH:mm")
        let raw: [(String, String)] = [("07:00", "Salutt fra Akershus festning"), ("10:00", "Barnetoget går fra Akershus festning"), ("13:00", "Folketoget")]
        var seenNext: Bool = false
        program = raw.map { (x: (String, String)) -> Mai17Item41 in
            let past: Bool = x.0 < now
            let nx: Bool = !past && !seenNext
            if nx { seenNext = true }
            return Mai17Item41(time: x.0, title: x.1, kind: "city", past: past, next: nx)
        }
    }

    func setDesign(_ on: Bool, _ store: Store) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.25)) { design = on }
        Task { _ = try? await store.api.callAt("/api", "PUT", "/glimt/mai17/design", json: ["on": on], timeout: 10) }
    }

    func hurra(_ store: Store) {
        Haptic30.double()
        confetti += 1
        Task { @MainActor in
            guard let d = try? await store.api.callAt("/api", "POST", "/glimt/mai17/hurra", json: [:], timeout: 12) else { return }
            self.hurraText = JS.str(JS.obj(d), "text") ?? self.hurraText
        }
    }
}

/// Øverst på Hjem: pillen «17. mai-design» (alltid på dagen) og festkortet, programmet og hurra-knappen når designet er på.
struct Mai17Home41: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Mai17Model41 { Mai17Model41.shared }

    var body: some View {
        Group {
            if m.isOn {
                VStack(spacing: 10) {
                    if m.design { hero } else { HStack { Spacer(); pill } }
                    if m.design && !m.program.isEmpty { programCard }
                    if m.design { hurraButton }
                }
            }
        }
        .task { await m.load(store) }
        .overlay { Mai17Confetti41(tick: m.confetti) }
    }

    private var pill: some View {
        Button { m.setDesign(!m.design, store) } label: {
            HStack(spacing: 8) {
                Text(m.design ? "17. mai-design" : "17. mai").font(PF.ui(12.5, .bold)).foregroundStyle(m.design ? Color.white : p.ink)
                Capsule().fill(m.design ? Color(hex: "#3fbf7a") : p.line).frame(width: 34, height: 20)
                    .overlay(alignment: m.design ? .trailing : .leading) { Circle().fill(Color.white).frame(width: 16, height: 16).padding(2) }
            }
            .padding(.horizontal, 12).frame(height: 32)
            .background(m.design ? Color.black.opacity(0.22) : p.card, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("17. mai-design")
        .accessibilityValue(m.design ? "På" : "Av")
    }

    private var hero: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(colors: [Color(hex: "#BA0C2F"), Color(hex: "#8f0a24")], startPoint: .top, endPoint: .bottom)
            Mai17Bunting41().frame(height: 26).padding(.top, 6)
            VStack(alignment: .leading, spacing: 6) {
                HStack { Spacer(); pill }
                Spacer(minLength: 0)
                Text(m.dateLabel).font(PF.italic(15)).foregroundStyle(Color.white.opacity(0.92))
                Text(m.greeting).font(PF.serif(30, medium: true)).foregroundStyle(Color.white).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 18).padding(.top, 36).padding(.bottom, 18)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                Glimt35Fig(id: Glimt35Model.shared.cfg.host, size: 58, t: ctx.date.timeIntervalSinceReferenceDate)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            .padding(.trailing, 28).padding(.bottom, 22)
        }
        .frame(minHeight: 210)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.3), radius: 10, y: 8)
    }

    private var programCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "Program i dag")
            ForEach(m.program) { (x: Mai17Item41) in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(x.time).font(PF.mono(13)).foregroundStyle(x.next ? Color(hex: "#BA0C2F") : (x.past ? p.mut : p.ink)).frame(width: 46, alignment: .leading)
                    Text(x.title).font(PF.ui(14.5, x.next ? .bold : .medium)).foregroundStyle(x.past ? p.mut : p.ink)
                    Spacer(minLength: 0)
                    if x.kind == "calendar" { Image(systemName: "calendar").font(.dyn51(size: 12)).foregroundStyle(p.mut) }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var hurraButton: some View {
        Button { m.hurra(store) } label: {
            HStack(spacing: 10) {
                Mai17Flag41().frame(width: 26, height: 19)
                Text("Hipp hipp hurra!").font(PF.ui(16, .bold)).foregroundStyle(Color.white)
                if !m.hurraText.isEmpty { Text(m.hurraText).font(PF.ui(12.5)).foregroundStyle(Color.white.opacity(0.8)) }
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color(hex: "#BA0C2F"), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Sender «Hipp hipp hurra» til familien")
    }
}

/// Norsk flagg (22:16, kors 4/2).
struct Mai17Flag41: View {
    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let k: CGFloat = g.size.width / 22
            ZStack(alignment: .topLeading) {
                Rectangle().fill(Color(hex: "#BA0C2F"))
                Rectangle().fill(Color.white).frame(width: 4 * k).offset(x: 6 * k)
                Rectangle().fill(Color.white).frame(height: 4 * k).offset(y: 6 * k)
                Rectangle().fill(Color(hex: "#00205B")).frame(width: 2 * k).offset(x: 7 * k)
                Rectangle().fill(Color(hex: "#00205B")).frame(height: 2 * k).offset(y: 7 * k)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 2))
    }
}

/// Flaggrekke (vimpler rød/hvit/blå som vaier).
struct Mai17Bunting41: View {
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            let t: Double = ctx.date.timeIntervalSinceReferenceDate
            Canvas { (gc: inout GraphicsContext, size: CGSize) in
                let cols: [Color] = [Color(hex: "#BA0C2F"), Color.white, Color(hex: "#00205B")]
                let n: Int = Int(size.width / 22) + 1
                var line: Path = Path()
                line.move(to: CGPoint(x: 0, y: 2))
                line.addLine(to: CGPoint(x: size.width, y: 2))
                gc.stroke(line, with: .color(Color.white.opacity(0.6)), lineWidth: 1)
                for i in 0..<n {
                    let x: CGFloat = CGFloat(i) * 22
                    let sway: CGFloat = reduce ? 0 : CGFloat(sin(t * 2 + Double(i) * 0.7)) * 2
                    var tri: Path = Path()
                    tri.move(to: CGPoint(x: x + 2, y: 2))
                    tri.addLine(to: CGPoint(x: x + 18, y: 2))
                    tri.addLine(to: CGPoint(x: x + 10 + sway, y: size.height - 2))
                    tri.closeSubpath()
                    gc.fill(tri, with: .color(cols[i % 3]))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Konfetti i flaggfargene over hele skjermen i 2,5 s etter «Hipp hipp hurra!».
struct Mai17Confetti41: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let tick: Int
    @State private var start: Date? = nil

    var body: some View {
        Group {
            if let s = start, !reduce {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                    let t: Double = ctx.date.timeIntervalSince(s)
                    Canvas { (gc: inout GraphicsContext, size: CGSize) in
                        let cols: [Color] = [Color(hex: "#BA0C2F"), Color.white, Color(hex: "#00205B")]
                        for i in 0..<60 {
                            let r1: Double = Glimt40Jul.rnd(i * 5 + 1)
                            let r2: Double = Glimt40Jul.rnd(i * 5 + 2)
                            let x: Double = r1 * Double(size.width) + sin(t * 3 + Double(i)) * 10
                            let y: Double = -20 + t * (160 + r2 * 220) - r2 * 60
                            var c: GraphicsContext = gc
                            c.translateBy(x: x, y: y)
                            c.rotate(by: .radians(t * 4 + Double(i)))
                            c.fill(Path(CGRect(x: -4, y: -2.5, width: 8, height: 5)), with: .color(cols[i % 3].opacity(Swift.max(0, 1 - t / 2.5))))
                        }
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .onChange(of: tick) { _, _ in
            start = Date()
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_600_000_000)
                start = nil
            }
        }
    }
}

/// Innstillinger → Glimt / Tilpass → HØYTIDER: «17. mai-design» Automatisk 17. mai / Vis nå / Av.
struct Mai17Settings41: View {
    @Environment(Store.self) private var store
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        let cur: String = g.cfg.mai17
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Mai17Flag41().frame(width: 30, height: 22)
                    .frame(width: 32, height: 32)
                VStack(alignment: .leading, spacing: 1) {
                    Text("17. mai").font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink)
                    Text(cur == "av" ? "Vanlig Hjem og figurer uten flagg" : (cur == "pa" ? "Vises nå (forhåndsvisning)" : "Glimt med flagg 14.–17. mai · eget Hjem på dagen"))
                        .font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(spacing: 2) {
                ForEach([("auto", "Automatisk"), ("pa", "Vis nå"), ("av", "Av")], id: \.0) { (o: (String, String)) in
                    let on: Bool = o.0 == cur
                    Button { g.change(["mai17": o.0], store) { (c: inout Glimt35Cfg) in c.mai17 = o.0 } } label: {
                        Text(o.1).font(PF.ui(13, .bold)).foregroundStyle(on ? Brief34C.paper : Brief34C.ink)
                            .frame(maxWidth: .infinity).frame(height: 34)
                            .background(on ? Brief34C.ink : Color.clear, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3)
            .background(Brief34C.rgb(0xf1ece2), in: Capsule())
        }
        .padding(14)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
