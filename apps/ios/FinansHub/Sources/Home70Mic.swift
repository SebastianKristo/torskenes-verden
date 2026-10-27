import SwiftUI
import UIKit

/* ---------------- Prompt 70 (IOSHOME70): mikrofonen i søkefeltet på Hjem – nytt ikon og opptakskort ----------------
 Spesifikasjon: prompt-51b-pakke/claude-code-mikrofon-sokefelt.md. Fasit: Homelab.dc.html (micVals(), søkefeltet på Hjem).
 Motoren er den samme som før (Voice56: serveren, ellers talegjenkjenningen på enheten via ChatVoice27). Brukerens valg:
 – Med serveren vises «Snakk nå …» mens man snakker og «Skriver ned …» etter ■. Teksten settes inn når svaret kommer.
 – Bare med motoren på enheten vises teksten live i kortet.
 – Bølgeformen følger lydnivået fra mikrofonen (Voice56.levels / ChatVoice27.levels) i begge tilfeller.
 Hvile: kapsel + bue + fot (strek 1,9 i 24-rutenett), farge = tekst, ingen bakgrunn. 36 pt rund flate (44 pt treff), --bg ved trykk.
 Opptak: søkefeltet blir et kort i samme farge (card, radius 26). Øverst teksten (17 pt) med blinkende markør. Nederst
 × (avbryt, forkast) · bølgeform i full bredde + tid · ■ (stopp, teksten i feltet) · ↑ (terrakotta, stopp og send). */

/// Mikrofonikonet fra fasiten (viewBox 24): rect x9 y3 6×11,5 rx3 · bue M5.5 11a6.5 6.5 0 0 0 13 0 · M12 17.5V21 · M9 21h6.
struct Home70MicGlyph: Shape {
    func path(in r: CGRect) -> Path {
        let s: CGFloat = Swift.min(r.width, r.height) / 24
        let ox: CGFloat = r.midX - 12 * s
        let oy: CGFloat = r.midY - 12 * s
        let k: CGFloat = 6.5 * 0.5523 * s
        var p: Path = Path()
        p.addRoundedRect(in: CGRect(x: ox + 9 * s, y: oy + 3 * s, width: 6 * s, height: 11.5 * s), cornerSize: CGSize(width: 3 * s, height: 3 * s))
        let l: CGPoint = CGPoint(x: ox + 5.5 * s, y: oy + 11 * s)
        let b: CGPoint = CGPoint(x: ox + 12 * s, y: oy + 17.5 * s)
        let rt: CGPoint = CGPoint(x: ox + 18.5 * s, y: oy + 11 * s)
        p.move(to: l)
        p.addCurve(to: b, control1: CGPoint(x: l.x, y: l.y + k), control2: CGPoint(x: b.x - k, y: b.y))
        p.addCurve(to: rt, control1: CGPoint(x: b.x + k, y: b.y), control2: CGPoint(x: rt.x, y: rt.y + k))
        p.move(to: b)
        p.addLine(to: CGPoint(x: b.x, y: oy + 21 * s))
        p.move(to: CGPoint(x: ox + 9 * s, y: oy + 21 * s))
        p.addLine(to: CGPoint(x: ox + 15 * s, y: oy + 21 * s))
        return p
    }
}

/// Lys bakgrunn (--bg) på den runde flaten mens knappen holdes nede.
struct Home70PressStyle: ButtonStyle {
    let bg: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Circle().fill(configuration.isPressed ? bg : Color.clear).frame(width: 36, height: 36))
    }
}

/// Mikrofonen i søkefeltet (hvile).
struct Home70MicButton: View {
    @Environment(\.paper) private var p
    let ink: Color
    let label: String
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            Home70MicGlyph()
                .stroke(ink, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                .frame(width: 20, height: 20)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(Home70PressStyle(bg: p.bg))
        .frame(width: 38, height: 44)
        .accessibilityLabel(label)
        .accessibilityHint("Trykk for å snakke inn søket")
    }
}

/* ---------- Opptakskortet ---------- */

struct Home70RecCard: View {
    @Environment(\.paper) private var p
    /// Teksten så langt (bare med motoren på enheten).
    let text: String
    /// Serveren skriver ned (etter ■).
    let busy: Bool
    /// Motoren på enheten (ellers serveren).
    let device: Bool
    let cancel: () -> Void
    let stop: () -> Void
    let send: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Home70RecText(text: text, busy: busy)
            controls
        }
        .padding(.leading, 18).padding(.trailing, 10).padding(.top, 16).padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 15, y: 10)
        .accessibilityElement(children: .contain)
    }

    private var controls: some View {
        HStack(spacing: 8) {
            round("xmark", label: "Avbryt", fill: p.bg, fg: p.ink, act: cancel)
            Home70Wave(device: device)
                .frame(maxWidth: .infinity)
            stopButton
            round("arrow.up", label: "Send", fill: Color(hex: "#C8633F"), fg: Color.white, act: send)
        }
    }

    private var stopButton: some View {
        Button(action: stop) {
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(p.ink)
                .frame(width: 13, height: 13)
                .frame(width: 40, height: 40)
                .background(p.bg, in: Circle())
                .opacity(busy ? 0.45 : 1)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel("Stopp opptak")
    }

    private func round(_ icon: String, label: String, fill: Color, fg: Color, act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: icon).font(.dyn51(size: 15, weight: .bold)).foregroundStyle(fg)
                .frame(width: 40, height: 40)
                .background(fill, in: Circle())
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Teksten øverst: det som er sagt (live på enheten), ellers «Snakk nå …» / «Skriver ned …» dempet, med blinkende markør.
struct Home70RecText: View {
    @Environment(\.paper) private var p
    let text: String
    let busy: Bool

    var body: some View {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        HStack(alignment: .center, spacing: 3) {
            Text(t.isEmpty ? placeholder : t)
                .font(PF.ui(17, .medium))
                .foregroundStyle(t.isEmpty ? p.mut : p.ink)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            if busy {
                ProgressView().controlSize(.small).tint(p.mut)
            } else {
                // Prompt 71: markøren blinker i sin egen lille tilstand (bare opasiteten animeres, Anim71.swift), så teksten
                // som strømmer inn ved siden av ikke arver den evige animasjonen.
                Rectangle().fill(p.ink).frame(width: 2, height: 20)
                    .pulse71(from: 1, to: 0.1, half: 0.5)
            }
        }
        .padding(.trailing, 8)
        .frame(minHeight: 24, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(t.isEmpty ? placeholder : t)
    }

    private var placeholder: String { busy ? "Skriver ned …" : "Snakk nå …" }
}

/// Bølgeformen: én høy strek (start) og streker/prikker som ruller mot venstre etter lydnivået, og tiden.
/// Prompt 71: lydnivået hentes fortsatt 11 ganger/s (som før), men bølgen tegnes av TimelineView(.animation) + Canvas i
/// denne lille visningen og glir jevnt mellom prøvene (i stedet for å hoppe 5,5 pt hver 90 ms). Prøvene ligger i en liten
/// referanse (Home70WaveBuf), ikke i @State, så ingenting annet tegnes på nytt. Med «Reduser bevegelse» hopper den som før.
struct Home70Wave: View {
    @Environment(\.paper) private var p
    @Environment(\.accessibilityReduceMotion) private var reduce
    let device: Bool

    @State private var buf: Home70WaveBuf = Home70WaveBuf()

    nonisolated static let step: CGFloat = 5.5
    nonisolated static let maxSamples: Int = 160

    var body: some View {
        let slow: Bool = reduce || !running
        TimelineView(.animation(minimumInterval: slow ? Home70WaveBuf.every : nil)) { (ctx: TimelineViewDefaultContext) in
            Home70WaveFrame(snap: buf.pull(ctx.date.timeIntervalSinceReferenceDate, device: device, smooth: !reduce), ink: p.ink, mut: p.mut)
        }
        .onAppear { buf.reset() }
    }

    private var running: Bool { device ? ChatVoice27.shared.recording : Voice56.shared.phase == "rec" }

    /// Nivået (0,15–1 fra motoren) → 0–1.
    nonisolated static func norm(_ v: CGFloat) -> CGFloat {
        Swift.max(0, Swift.min(1, (v - 0.15) / 0.85))
    }

    /// Nyeste til høyre. Strekhøyde 3–22 pt; stille = prikk (3 pt, dempet).
    /// `shift` (0–1): hvor langt bølgen har glidd mot neste prøve (Prompt 71).
    nonisolated static func draw(_ ctx: inout GraphicsContext, _ size: CGSize, _ samples: [CGFloat], _ ink: Color, shift: CGFloat = 0) {
        let mid: CGFloat = size.height / 2
        let n: Int = samples.count
        let dx: CGFloat = shift * step
        for (i, v) in samples.enumerated() {
            let x: CGFloat = size.width - CGFloat(n - i) * step - dx
            if x < 0 { continue }
            let quiet: Bool = v < 0.06
            let h: CGFloat = quiet ? 3 : 3 + 19 * v
            let w: CGFloat = h > 8 ? 3 : 2.5
            let r: CGRect = CGRect(x: x, y: mid - h / 2, width: w, height: h)
            ctx.fill(Path(roundedRect: r, cornerRadius: w / 2), with: .color(ink.opacity(h > 8 ? 1 : 0.55)))
        }
        // Startstreken (høy) foran det første utslaget, ruller ut til venstre når bølgen fyller bredden.
        let sx: CGFloat = size.width - CGFloat(n + 1) * step + 2 - dx
        if sx >= 0 {
            let r: CGRect = CGRect(x: sx - 2, y: 0, width: 2.5, height: 24)
            ctx.fill(Path(roundedRect: r, cornerRadius: 1.25), with: .color(ink))
        }
    }
}

/// Ett bilde av bølgen: prøvene, hvor langt den har glidd, og tiden.
struct Home70WaveSnap {
    let samples: [CGFloat]
    let shift: CGFloat
    let secs: Int
}

/// Prompt 71: tegner ett bilde (Canvas + tid). Ingen tilstand.
struct Home70WaveFrame: View {
    let snap: Home70WaveSnap
    let ink: Color
    let mut: Color

    var body: some View {
        let s: [CGFloat] = snap.samples
        let f: CGFloat = snap.shift
        let c: Color = ink
        HStack(spacing: 10) {
            Canvas { (ctx: inout GraphicsContext, size: CGSize) in
                Home70Wave.draw(&ctx, size, s, c, shift: f)
            }
            .frame(height: 24)
            .frame(maxWidth: .infinity)
            .drawingGroup()
            .accessibilityHidden(true)
            Text(clock).font(PF.mono(12)).foregroundStyle(mut).monospacedDigit()
                .frame(minWidth: 30, alignment: .leading)
                .accessibilityLabel("Opptak " + clock)
        }
    }

    private var clock: String {
        let m: Int = snap.secs / 60
        let sec: Int = snap.secs % 60
        return String(m) + ":" + (sec < 10 ? "0" : "") + String(sec)
    }
}

/// Prompt 71: prøvene (ikke @State). `pull` kalles for hvert bilde og tar inn en ny prøve hver 90 ms mens det tas opp.
final class Home70WaveBuf {
    static let every: Double = 0.09
    private var samples: [CGFloat] = []
    private var t0: Double = Date.timeIntervalSinceReferenceDate
    private var last: Double = 0

    @MainActor func reset() {
        samples = []
        t0 = Date.timeIntervalSinceReferenceDate
        last = 0
    }

    @MainActor func pull(_ t: Double, device: Bool, smooth: Bool) -> Home70WaveSnap {
        let secs: Int = Swift.max(0, Int(t - t0))
        let running: Bool = device ? ChatVoice27.shared.recording : Voice56.shared.phase == "rec"
        if !running {
            last = 0
            return Home70WaveSnap(samples: samples, shift: 0, secs: secs)
        }
        if last == 0 { last = t }
        // Etter en pause (appen i bakgrunnen o.l.) tas bare én prøve, ikke mange på en gang.
        if t - last > 1 { last = t - Home70WaveBuf.every }
        while t - last >= Home70WaveBuf.every {
            last += Home70WaveBuf.every
            add(device)
        }
        let f: Double = smooth ? Swift.min(1, Swift.max(0, (t - last) / Home70WaveBuf.every)) : 0
        return Home70WaveSnap(samples: samples, shift: CGFloat(f), secs: secs)
    }

    @MainActor private func add(_ device: Bool) {
        let lv: [CGFloat] = device ? ChatVoice27.shared.levels : Voice56.shared.levels
        samples.append(Home70Wave.norm(lv.last ?? 0.15))
        if samples.count > Home70Wave.maxSamples { samples.removeFirst(samples.count - Home70Wave.maxSamples) }
    }
}
