import SwiftUI
import Foundation

/* ---------------- Prompt 40: Glimt i julemodus (1. desember – 13. januar), gjelder overalt ----------------
   prompts/prompt-40-pakke/claude-code-glimt-jul.md, fasit design/Glimt Jul og Okonomi-ikon.dc.html (1a/1b) og
   design/glimt-figurer.js → julOn() / dress().
   Faser (Europe/Oslo): Advent 1.–23. des (nisselue + grønt skjerf) · Jul 24.–30. des (lue, skjerf, gave) · Nyttår 31. des–1. jan
   (svart festhatt med gull + gnister) · Vinter 2.–13. jan (blå strikkelue + rødt skjerf).
   Figurbiblioteket legger SELV på antrekket (Glimt35Fig leser Glimt40JulLive), så alle steder som tegner Glimt (Hjem-briefen,
   brief-siden, chat, widgets, varsler, søk, oppstartssiden) får lue/skjerf uten egen kode. Unntak: `.glimt40NoJul()` (figurvelgeren,
   og figurer som allerede har drakt: Sherlock, snekker og prest).
   Valget (Auto/Av/På + fase) kommer fra /api/glimt/settings (jul, julPhase, snow, julSound) og ligger i App Group, så widgetene vet
   det. Endring → NotificationCenter (Glimt40Jul.changed) → alle åpne figurer tegnes på nytt, og appen kaller
   WidgetCenter.reloadAllTimelines(). Delt mellom appen og widgetene (Shared): bare SwiftUI/Foundation. */

enum Glimt40JulPhase: String, CaseIterable {
    case advent, jul, nyttar, vinter

    var label: String {
        switch self {
        case .advent: return "Advent"
        case .jul: return "Jul"
        case .nyttar: return "Nyttår"
        case .vinter: return "Vinter"
        }
    }

    /// Godtar både serverens nøkler (advent/jul/nyttar/vinter) og visningsnavnene (Advent/Nyttår …).
    static func from(_ s: String?) -> Glimt40JulPhase? {
        guard let s else { return nil }
        let k: String = s.lowercased().replacingOccurrences(of: "å", with: "a")
        return Glimt40JulPhase(rawValue: k)
    }
}

enum Glimt40Jul {
    static let modeKey: String = "w.glimt40.jul"
    static let phaseKey: String = "w.glimt40.julP"
    static let snowKey: String = "w.glimt40.snow"
    static let soundKey: String = "w.glimt40.julSound"
    /// Sendes når julemodus endres (appen og widget-utvidelsen i hver sin prosess).
    static let changed: Notification.Name = Notification.Name("no.kristo.finanshub.glimt40.jul")

    static var oslo: Calendar {
        var c: Calendar = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Oslo") ?? TimeZone.current
        return c
    }

    /// Automatisk fase etter dato (1. des – 13. jan).
    static func autoPhase(_ d: Date) -> Glimt40JulPhase? {
        let c: Calendar = oslo
        let mo: Int = c.component(.month, from: d)
        let dd: Int = c.component(.day, from: d)
        if mo == 12 {
            if dd <= 23 { return .advent }
            if dd <= 30 { return .jul }
            return .nyttar
        }
        if mo == 1 {
            if dd == 1 { return .nyttar }
            if dd <= 13 { return .vinter }
        }
        return nil
    }

    /// mode: auto | av | pa. manual = fasen når På er valgt.
    static func phase(mode: String, manual: String, date: Date = Date()) -> Glimt40JulPhase? {
        switch mode {
        case "av": return nil
        case "pa": return Glimt40JulPhase.from(manual) ?? .advent
        default: return autoPhase(date)
        }
    }

    static var mode: String { WidgetShared.defaults.string(forKey: modeKey) ?? "auto" }
    static var manualPhase: String { WidgetShared.defaults.string(forKey: phaseKey) ?? "advent" }
    static var snow: Bool { (WidgetShared.defaults.object(forKey: snowKey) as? Bool) ?? true }
    static var sound: String { WidgetShared.defaults.string(forKey: soundKey) ?? "av" }

    /// Fasen akkurat nå, fra valget i App Group.
    static func current(_ d: Date = Date()) -> Glimt40JulPhase? {
        phase(mode: mode, manual: manualPhase, date: d)
    }

    /// Lagrer valget lokalt og varsler alle åpne figurer. Returnerer true når noe faktisk ble endret.
    @discardableResult
    static func save(mode m: String, phase p: String, snow s: Bool, sound so: String) -> Bool {
        let d: UserDefaults = WidgetShared.defaults
        let same: Bool = mode == m && manualPhase == p && snow == s && sound == so && d.object(forKey: modeKey) != nil
        if same { return false }
        d.set(m, forKey: modeKey)
        d.set(p, forKey: phaseKey)
        d.set(s, forKey: snowKey)
        d.set(so, forKey: soundKey)
        NotificationCenter.default.post(name: changed, object: nil)
        return true
    }

    /// Status under «Julemodus»: «På nå · slås av 13. januar» / «Slås på 1. desember» / «Av hele året» / «På · Advent».
    static func status(mode m: String, manual: String, date: Date = Date()) -> String {
        switch m {
        case "av": return "Av hele året"
        case "pa": return "På · " + (Glimt40JulPhase.from(manual) ?? .advent).label
        default:
            if let ph = autoPhase(date) { return "På nå · " + ph.label + " · slås av 13. januar" }
            return "Slås på 1. desember"
        }
    }

    /// Fast «tilfeldig» tall 0…1 (snøfnuggene i fasiten).
    static func rnd(_ i: Int) -> Double {
        Double((i * 9301 + 49297) % 233280) / 233280
    }

    /// Dager til julaften (24. des) fra i dag, nil etter julaften.
    static func daysToChristmas(_ d: Date = Date()) -> Int? {
        let c: Calendar = oslo
        let y: Int = c.component(.year, from: d)
        guard let eve = c.date(from: DateComponents(year: y, month: 12, day: 24)) else { return nil }
        let start: Date = c.startOfDay(for: d)
        let n: Int = c.dateComponents([.day], from: start, to: eve).day ?? 0
        return n >= 0 ? n : nil
    }
}

/// Holder figurene oppdatert når julemodus endres (appen) og leser valget på nytt hvert minutt (dato-skifte, widgets).
@MainActor
@Observable
final class Glimt40JulLive {
    static let shared = Glimt40JulLive()

    /// Økes ved hver endring; figurene leser den (Observation) og tegnes på nytt.
    var rev: Int = 0
    @ObservationIgnored private var cached: Glimt40JulPhase? = nil
    @ObservationIgnored private var at: Date = .distantPast
    @ObservationIgnored private var observer: NSObjectProtocol? = nil

    init() {
        observer = NotificationCenter.default.addObserver(forName: Glimt40Jul.changed, object: nil, queue: .main) { (_: Notification) in
            Task { @MainActor in Glimt40JulLive.shared.bump() }
        }
    }

    func bump() {
        at = .distantPast
        rev += 1
    }

    /// Fasen nå (bufret i 60 s).
    func phase() -> Glimt40JulPhase? {
        _ = rev
        let now: Date = Date()
        if now.timeIntervalSince(at) > 60 {
            cached = Glimt40Jul.current(now)
            at = now
        }
        return cached
    }
}

/* ---------- Unntak (figurvelgeren og figurer med egen drakt) ---------- */

struct Glimt40NoJulKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    var glimt40NoJul: Bool {
        get { self[Glimt40NoJulKey.self] }
        set { self[Glimt40NoJulKey.self] = newValue }
    }
}

extension View {
    /// Ingen julepynt på figurene inni (som `{noJul:true}` i glimt-figurer.js).
    func glimt40NoJul(_ on: Bool = true) -> some View { environment(\.glimt40NoJul, on) }
}

/* ---------- Antrekket (fra dress() i glimt-figurer.js) ---------- */

/// Legges over figuren (S × H, øverst til venstre). Leser fasen selv; ingenting tegnes utenfor julemodus eller med noJul.
struct Glimt40DressAuto: View {
    @Environment(\.glimt40NoJul) private var noJul
    let S: CGFloat
    let H: CGFloat
    var t: Double = 0
    var still: Bool = false

    var body: some View {
        if !noJul, let ph = Glimt40JulLive.shared.phase() {
            Glimt40Dress(S: S, H: H, phase: ph, t: t, still: still)
        }
    }
}

/// Selve antrekket for en fase. Tilbehøret skaleres med figuren og virker med alle humør.
struct Glimt40Dress: View {
    let S: CGFloat
    let H: CGFloat
    let phase: Glimt40JulPhase
    var t: Double = 0
    var still: Bool = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            if phase != .nyttar {
                Glimt40Scarf(S: S, color: phase == .vinter ? G35.c(0xb23a2a) : G35.c(0x2f7a4f))
                    .offset(x: S * 0.5 - S * 0.525, y: H + S * 0.2 - S * 0.5)
            }
            switch phase {
            case .advent, .jul:
                Glimt40Hat(S: S).offset(x: S * 0.5 - S * 0.42, y: -S * 0.44)
            case .vinter:
                Glimt40Beanie(S: S).offset(x: S * 0.5 - S * 0.45, y: -S * 0.36)
            case .nyttar:
                Glimt40Party(S: S, t: t, still: still).offset(x: S * 0.5 - S * 0.22, y: -S * 0.48)
            }
            if phase == .jul {
                Glimt40Gift(S: S).offset(x: S + S * 0.2 - S * 0.34, y: H + S * 0.16 - S * 0.3)
            }
        }
        .frame(width: S, height: H, alignment: .topLeading)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Skjerf med hvite striper og en flik (viewBox 105×50). Bredde S·1,05, høyde S·0,5.
struct Glimt40Scarf: View {
    let S: CGFloat
    let color: Color

    var body: some View {
        let w: CGFloat = S * 1.05
        let k: CGFloat = w / 105
        let vb: CGSize = CGSize(width: 105, height: 50)
        let cream: Color = G35.c(0xf6f1e7)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M8 10 Q52 26 97 10 L95 24 Q52 40 10 24 Z", vb: vb), fill: color, k: k)
            G36Part(shape: G36Svg(d: "M22 16 l4 12 M40 20 l3 13 M58 20 l-1 13 M76 17 l-3 12", vb: vb), stroke: cream, lw: 3, k: k)
            G36Part(shape: G36Svg(d: "M70 22 L80 48 L68 50 L62 26 Z", vb: vb), fill: color, k: k)
            G36Part(shape: G36Svg(d: "M66 36 h10 M64 44 h10", vb: vb), stroke: cream, lw: 2.5, k: k)
        }
        .frame(width: w, height: S * 0.5, alignment: .topLeading)
    }
}

/// Rød nisselue med hvit dusk og kant (viewBox 95×70), rotert −14°. Bredde S·0,95, høyde S·0,7.
struct Glimt40Hat: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 0.95
        let k: CGFloat = w / 95
        let vb: CGSize = CGSize(width: 95, height: 70)
        let cream: Color = G35.c(0xfbf7ee)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M14 56 Q40 4 74 8 Q86 10 88 20 Q70 18 66 56 Z", vb: vb), fill: G35.c(0xc8302a), k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 81, y: 14, width: 16, height: 16), rx: 8), fill: cream, k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 6, y: 50, width: 70, height: 15), rx: 7.5), fill: cream, k: k)
        }
        .frame(width: w, height: S * 0.7, alignment: .topLeading)
        .rotationEffect(.degrees(-14))
        .shadow(color: Color.black.opacity(0.25), radius: 1, y: 1)
    }
}

/// Blå strikkelue med vrangbord og dusk (viewBox 90×60). Bredde S·0,9, høyde S·0,6.
struct Glimt40Beanie: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 0.9
        let k: CGFloat = w / 90
        let vb: CGSize = CGSize(width: 90, height: 60)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M10 50 Q10 10 45 10 Q80 10 80 50 Z", vb: vb), fill: G35.c(0x3b6fb0), k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 6, y: 42, width: 78, height: 14), rx: 6), fill: G35.c(0x2b5d8a), k: k)
            G36Part(shape: G36Svg(d: "M16 44 v10 M26 44 v10 M36 44 v10 M46 44 v10 M56 44 v10 M66 44 v10 M76 44 v10", vb: vb),
                    stroke: G35.c(0x4f84c4), lw: 2.5, k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 37, y: 0, width: 16, height: 16), rx: 8), fill: G35.c(0xfbf7ee), k: k)
        }
        .frame(width: w, height: S * 0.6, alignment: .topLeading)
        .shadow(color: Color.black.opacity(0.25), radius: 1, y: 1)
    }
}

/// Svart festhatt med gullstriper, gullkule og to gnister som blinker (viewBox 60×62), rotert 12°. Bredde S·0,6, høyde S·0,62.
struct Glimt40Party: View {
    let S: CGFloat
    var t: Double = 0
    var still: Bool = false

    var body: some View {
        let w: CGFloat = S * 0.6
        let k: CGFloat = w / 60
        let vb: CGSize = CGSize(width: 60, height: 62)
        let gold: Color = G35.c(0xf2c14e)
        let tw: Double = still ? 1 : G36Anim.kf(G36Anim.loop(t, 1.6), [(0, 0.25), (0.5, 1), (1, 0.25)])
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M8 56 L30 4 L52 56 Z", vb: vb), fill: G35.c(0x1b1a17), k: k)
            G36Part(shape: G36Svg(d: "M14 42 L46 42 M19 30 L41 30 M24 18 L36 18", vb: vb), stroke: gold, lw: 3, k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 25, y: -1, width: 10, height: 10), rx: 5), fill: gold, k: k)
            if !still {
                G36Part(shape: G36Svg(d: "M-6 10 l3 -6 l3 6 l-6 -3 h6 Z M60 18 l3 -6 l3 6 l-6 -3 h6 Z", vb: vb), fill: gold, k: k)
                    .opacity(tw)
            }
        }
        .frame(width: w, height: S * 0.62, alignment: .topLeading)
        .rotationEffect(.degrees(12))
        .shadow(color: Color.black.opacity(0.25), radius: 1, y: 1)
    }
}

/// Liten gave med gullbånd, rotert 8° (S·0,34 × S·0,3).
struct Glimt40Gift: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 0.34
        let h: CGFloat = S * 0.3
        let gold: Color = G35.c(0xf2c14e)
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 4, style: .continuous).fill(G35.c(0xb23a2a))
            RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(G35.c(0x8a2a1d), lineWidth: 2)
            Rectangle().fill(gold).frame(width: w * 0.12, height: h).offset(x: w * 0.44)
            Rectangle().fill(gold).frame(width: w, height: h * 0.14).offset(y: h * 0.4)
        }
        .frame(width: w, height: h, alignment: .topLeading)
        .rotationEffect(.degrees(8))
    }
}

/* ---------- Snø (Vær-popupen og briefen, når «Snø i Vær og brief» er på) ---------- */

/// Rolig snøfall (jSnow i fasiten). Brukes bare når julemodus er på og snø er slått på; ingen snø med «Reduser bevegelse».
struct Glimt40Snow: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    var count: Int = 16
    var color: Color = Color.white

    var body: some View {
        let n: Int = count
        let col: Color = color
        if !reduce && Glimt40Jul.snow && Glimt40JulLive.shared.phase() != nil {
            TimelineView(.animation(minimumInterval: 1.0 / 20.0)) { (ctx: TimelineViewDefaultContext) in
                Canvas { (g: inout GraphicsContext, size: CGSize) in
                    let t: Double = ctx.date.timeIntervalSinceReferenceDate
                    var i: Int = 0
                    while i < n {
                        let r1: Double = Glimt40Jul.rnd(i + 1)
                        let r3: Double = Glimt40Jul.rnd(i + 3)
                        let r5: Double = Glimt40Jul.rnd(i + 5)
                        let r7: Double = Glimt40Jul.rnd(i + 7)
                        let r11: Double = Glimt40Jul.rnd(i + 11)
                        let period: Double = 6 + r5 * 6
                        let p: Double = G36Anim.loop(t + r11 * 10, period)
                        let d: CGFloat = CGFloat(3 + r7 * 4)
                        let x: CGFloat = CGFloat(r1) * size.width
                        let y: CGFloat = -10 + CGFloat(p) * (size.height + 20)
                        g.fill(Path(ellipseIn: CGRect(x: x, y: y, width: d, height: d)), with: .color(col.opacity(0.4 + r3 * 0.5)))
                        i += 1
                    }
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}
