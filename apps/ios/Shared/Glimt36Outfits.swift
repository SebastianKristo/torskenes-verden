import SwiftUI

/* ---------------- Prompt 36: drakter til Glimt – Sherlock Holmes og snekker ----------------
   Fasit: design/Mobil Papir App.dc.html → sherlock() (52 pt, shFlyM, shBob, shScan, shTalk) og carp() (28–36 pt, cpHam, cpBob,
   cpChip), samme i Innstillinger Web.dc.html. prompts/prompt-36-pakke/claude-code-system-oppdatering-nordlys.md.
   Draktene er overlegg på figuren (Glimt35Fig) tegnet fra SVG-stiene i fasiten (G36Svg leser M/L/H/V/Q/Z, store og små).
   Figuren selv tegnes av den som bruker draktene (t fra TimelineView), så draktene kan brukes på alle 13 figurene.
   Delt mellom appen og widgetene (Shared): bare SwiftUI. */

/* ---------- SVG-sti som Shape ---------- */

struct G36Svg: Shape {
    var d: String = ""
    /// viewBox (bredde, høyde).
    var vb: CGSize = CGSize(width: 100, height: 100)
    /// Rektangel i viewBox-koordinater i stedet for sti.
    var rect: CGRect? = nil
    var rx: CGFloat = 0
    /// SVG transform="rotate(deg cx cy)".
    var rot: Double = 0
    var rc: CGPoint = .zero

    func path(in r: CGRect) -> Path {
        var p: Path
        if let rect {
            p = rx > 0 ? Path(roundedRect: rect, cornerRadius: rx) : Path(rect)
        } else {
            p = G36Svg.parse(d)
        }
        if rot != 0 {
            let rad: CGFloat = CGFloat(rot * Double.pi / 180)
            let t: CGAffineTransform = CGAffineTransform(translationX: rc.x, y: rc.y).rotated(by: rad).translatedBy(x: -rc.x, y: -rc.y)
            p = p.applying(t)
        }
        let sx: CGFloat = r.width / Swift.max(1, vb.width)
        let sy: CGFloat = r.height / Swift.max(1, vb.height)
        let s: CGAffineTransform = CGAffineTransform(a: sx, b: 0, c: 0, d: sy, tx: r.minX, ty: r.minY)
        return p.applying(s)
    }

    static func tokens(_ d: String) -> [String] {
        var out: [String] = []
        var cur: String = ""
        for ch in d {
            if ch.isLetter {
                if !cur.isEmpty { out.append(cur); cur = "" }
                out.append(String(ch))
            } else if ch == "-" {
                if !cur.isEmpty { out.append(cur); cur = "" }
                cur.append(ch)
            } else if ch == " " || ch == "," || ch == "\n" {
                if !cur.isEmpty { out.append(cur); cur = "" }
            } else {
                cur.append(ch)
            }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    static func parse(_ d: String) -> Path {
        var path: Path = Path()
        let tk: [String] = tokens(d)
        var i: Int = 0
        var cmd: String = "M"
        var cur: CGPoint = .zero
        var start: CGPoint = .zero
        func num() -> CGFloat {
            if i < tk.count, let v = Double(tk[i]) { i += 1; return CGFloat(v) }
            i += 1
            return 0
        }
        while i < tk.count {
            let t: String = tk[i]
            if let c = t.first, c.isLetter {
                cmd = t
                i += 1
                if cmd == "Z" || cmd == "z" {
                    path.closeSubpath()
                    cur = start
                    continue
                }
            }
            if i >= tk.count { break }
            let rel: Bool = cmd == cmd.lowercased()
            let base: CGPoint = rel ? cur : .zero
            switch cmd.uppercased() {
            case "M":
                let x: CGFloat = num()
                let y: CGFloat = num()
                cur = CGPoint(x: base.x + x, y: base.y + y)
                start = cur
                path.move(to: cur)
                cmd = rel ? "l" : "L"
            case "L":
                let x: CGFloat = num()
                let y: CGFloat = num()
                cur = CGPoint(x: base.x + x, y: base.y + y)
                path.addLine(to: cur)
            case "H":
                let x: CGFloat = num()
                cur = CGPoint(x: rel ? cur.x + x : x, y: cur.y)
                path.addLine(to: cur)
            case "V":
                let y: CGFloat = num()
                cur = CGPoint(x: cur.x, y: rel ? cur.y + y : y)
                path.addLine(to: cur)
            case "Q":
                let cx: CGFloat = num()
                let cy: CGFloat = num()
                let x: CGFloat = num()
                let y: CGFloat = num()
                let ctrl: CGPoint = CGPoint(x: base.x + cx, y: base.y + cy)
                cur = CGPoint(x: base.x + x, y: base.y + y)
                path.addQuadCurve(to: cur, control: ctrl)
            default:
                i += 1
            }
        }
        return path
    }
}

/// En SVG-del: fyll og/eller strek (strekbredde i viewBox-enheter, k = punkter per enhet).
struct G36Part: View {
    let shape: G36Svg
    var fill: Color? = nil
    var stroke: Color? = nil
    var lw: CGFloat = 0
    let k: CGFloat
    var cap: CGLineCap = .butt

    var body: some View {
        ZStack {
            if let fill { shape.fill(fill) }
            if let stroke, lw > 0 {
                shape.stroke(stroke, style: StrokeStyle(lineWidth: lw * k, lineCap: cap, lineJoin: .round))
            }
        }
    }
}

/// Rutete tweed (SVG-mønsteret shChkM: 8×8, lys stripe loddrett og mørk stripe vannrett).
struct G36Check: View {
    let cell: CGFloat

    var body: some View {
        Canvas { (ctx: inout GraphicsContext, size: CGSize) in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(G35.c(0x8a6a45)))
            let c: CGFloat = Swift.max(2, cell)
            var x: CGFloat = 0
            while x < size.width {
                ctx.fill(Path(CGRect(x: x, y: 0, width: c / 2, height: size.height)), with: .color(G35.c(0xa5825a, 0.8)))
                x += c
            }
            var y: CGFloat = 0
            while y < size.height {
                ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: c / 2)), with: .color(G35.c(0x6f5333, 0.55)))
                y += c
            }
        }
    }
}

/// Tweed-del: rutete fyll klippet til stien + mørk kant.
struct G36Tweed: View {
    let shape: G36Svg
    let lw: CGFloat
    let k: CGFloat

    var body: some View {
        ZStack {
            G36Check(cell: 8 * k).clipShape(shape)
            shape.stroke(G35.c(0x4e3920), style: StrokeStyle(lineWidth: lw * k, lineJoin: .round))
        }
    }
}

/* ---------- Keyframes ---------- */

enum G36Anim {
    /// Lineær interpolasjon med myk overgang (ease-in-out) mellom keyframes (p 0…1).
    static func kf(_ p: Double, _ keys: [(Double, Double)]) -> Double {
        guard let first = keys.first else { return 0 }
        if p <= first.0 { return first.1 }
        var i: Int = 0
        while i < keys.count - 1 {
            let a: (Double, Double) = keys[i]
            let b: (Double, Double) = keys[i + 1]
            if p <= b.0 {
                let span: Double = Swift.max(0.0001, b.0 - a.0)
                let u0: Double = (p - a.0) / span
                let u: Double = u0 * u0 * (3 - 2 * u0)
                return a.1 + (b.1 - a.1) * u
            }
            i += 1
        }
        return keys[keys.count - 1].1
    }

    /// Fase 0…1 i en løkke.
    static func loop(_ t: Double, _ period: Double, _ delay: Double = 0) -> Double {
        let x: Double = (t - delay) / period
        return x - floor(x)
    }
}

/* ---------- Sherlock Holmes ---------- */

/// Deerstalker-lue: brem foran og bak, øreklaffer og sløyfe på toppen (viewBox 100×60). Bredde S·1,05, høyde S·0,62.
struct G36SherlockHat: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 1.05
        let k: CGFloat = w / 100
        let vb: CGSize = CGSize(width: 100, height: 60)
        ZStack(alignment: .topLeading) {
            G36Tweed(shape: G36Svg(d: "M6 44 Q2 52 14 50 L30 44 Z", vb: vb), lw: 1.5, k: k)
            G36Tweed(shape: G36Svg(d: "M94 44 Q98 52 86 50 L70 44 Z", vb: vb), lw: 1.5, k: k)
            G36Tweed(shape: G36Svg(d: "M14 46 Q14 10 50 8 Q86 10 86 46 Z", vb: vb), lw: 1.6, k: k)
            G36Part(shape: G36Svg(d: "M50 8 L50 46", vb: vb), stroke: G35.c(0x4e3920, 0.5), lw: 1, k: k)
            G36Tweed(shape: G36Svg(d: "M22 40 Q12 52 20 58 Q26 52 28 42 Z", vb: vb), lw: 1.3, k: k)
            G36Tweed(shape: G36Svg(d: "M78 40 Q88 52 80 58 Q74 52 72 42 Z", vb: vb), lw: 1.3, k: k)
            G36Part(shape: G36Svg(d: "M43 6 Q50 0 57 6 Q50 9 43 6 Z", vb: vb), fill: G35.c(0x6f5333), stroke: G35.c(0x4e3920), lw: 1.2, k: k)
        }
        .frame(width: w, height: S * 0.62)
        .shadow(color: Color.black.opacity(0.35), radius: 1.5, y: 2)
    }
}

/// Rutete Inverness-kappe over skuldrene (viewBox 120×50). Bredde S·1,2, høyde S·0,5.
struct G36SherlockCape: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 1.2
        let k: CGFloat = w / 120
        G36Tweed(shape: G36Svg(d: "M14 4 Q60 22 106 4 L114 40 Q60 52 6 40 Z", vb: CGSize(width: 120, height: 50)), lw: 1.6, k: k)
            .opacity(0.96)
            .frame(width: w, height: S * 0.5)
    }
}

/// Forstørrelsesglass: treskaft, messingring og lyseblått glass med glans (viewBox 50×50). Størrelse S·0,7.
struct G36Glass: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 0.7
        let k: CGFloat = w / 50
        let vb: CGSize = CGSize(width: 50, height: 50)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M6 44 L20 30", vb: vb), stroke: G35.c(0x5b3d1e), lw: 6, k: k, cap: .round)
            Circle().fill(Color(red: 190 / 255, green: 230 / 255, blue: 1).opacity(0.35))
                .overlay(Circle().stroke(G35.c(0xc8a24a), lineWidth: 4 * k))
                .frame(width: 30 * k, height: 30 * k)
                .offset(x: 15 * k, y: 5 * k)
            G36Part(shape: G36Svg(d: "M22 13 Q26 9 31 9", vb: vb), stroke: Color.white.opacity(0.85), lw: 2.4, k: k, cap: .round)
        }
        .frame(width: w, height: w, alignment: .topLeading)
        .shadow(color: Color.black.opacity(0.4), radius: 2, y: 2)
    }
}

/// Figuren i Sherlock-drakt. body = figuren (S × S·1,1). t = sekunder, still = «Reduser bevegelse»/widget.
/// Kappe bak figuren, lue på hodet og glasset i høyre hånd som sveiper (shScan 1,1 s, −24° ↔ 18°).
struct G36Sherlock<Fig: View>: View {
    let S: CGFloat
    let t: Double
    var still: Bool = false
    @ViewBuilder let body0: () -> Fig

    var body: some View {
        let h: CGFloat = S * 1.1
        let sp: Double = still ? 0.5 : G36Anim.loop(t, 1.1)
        let scan: Double = G36Anim.kf(sp, [(0, -24), (0.5, 18), (1, -24)])
        let lift: CGFloat = CGFloat(G36Anim.kf(sp, [(0, 0), (0.5, 1), (1, 0)]))
        ZStack(alignment: .topLeading) {
            G36SherlockCape(S: S).offset(x: S * 0.5 - S * 0.6, y: h + S * 0.12 - S * 0.5)
            // Prompt 40: egen drakt, så ingen julepynt oppå.
            // Prompt 44: drakten bærer figuren, så lue, glass og kappe følger bevegelsen (Glimt44Carry.swift).
            body0().frame(width: S, height: h, alignment: .topLeading).glimt40NoJul().glimt44Carried()
            G36SherlockHat(S: S).offset(x: S * 0.5 - S * 0.525, y: -S * 0.36)
            G36Glass(S: S)
                .rotationEffect(.degrees(scan), anchor: UnitPoint(x: 0.15, y: 0.85))
                .offset(x: S + S * 0.62 - S * 0.7 - 4 * lift, y: S * 0.28 - 6 * lift)
        }
        .frame(width: S, height: h, alignment: .topLeading)
        // Prompt 44: svevet (gfBob 2,6 s) ligger på hele drakten, ikke bare på figuren.
        .modifier(G35Wrap(S: S, hf: 1.1, mood: .idle, a: G35T(t: t, still: still)))
    }
}

/* ---------- Snekker ---------- */

/// Gul vernehjelm med kam, brem og glans (viewBox 100×52). Bredde S·0,95, høyde S·0,5.
struct G36Helmet: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 0.95
        let k: CGFloat = w / 100
        let vb: CGSize = CGSize(width: 100, height: 52)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M14 40 Q14 6 50 4 Q86 6 86 40 Z", vb: vb), fill: G35.c(0xf2c14e), stroke: G35.c(0xb8860b), lw: 2, k: k)
            G36Part(shape: G36Svg(d: "M50 4 L50 40", vb: vb), stroke: G35.c(0xd9a520), lw: 6, k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 2, y: 38, width: 96, height: 9), rx: 4.5), fill: G35.c(0xe0ad2c), stroke: G35.c(0xb8860b), lw: 2, k: k)
            G36Part(shape: G36Svg(d: "M26 16 Q34 10 42 9", vb: vb), stroke: Color.white.opacity(0.7), lw: 3, k: k, cap: .round)
        }
        .frame(width: w, height: S * 0.5)
        .shadow(color: Color.black.opacity(0.3), radius: 1, y: 2)
    }
}

/// Verktøybelte med messingspenne, lommer, skrutrekker og rød blyant (viewBox 100×34). Bredde S·1,02, høyde S·0,34.
struct G36Belt: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 1.02
        let k: CGFloat = w / 100
        let vb: CGSize = CGSize(width: 100, height: 34)
        let edge: Color = G35.c(0x5b3a1a)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 20, y: 0, width: 3, height: 12)), fill: G35.c(0x6b6b6b), k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 76, y: -6, width: 4, height: 16), rx: 1), fill: G35.c(0xb23a2a), k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 4, y: 2, width: 92, height: 9), rx: 4), fill: G35.c(0x8a5a2b), stroke: edge, lw: 1.5, k: k)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 44, y: 1, width: 12, height: 11), rx: 2), stroke: G35.c(0xc8a24a), lw: 2, k: k)
            G36Part(shape: G36Svg(d: "M12 10 h20 v16 q-10 6 -20 0 z", vb: vb), fill: G35.c(0xa06a33), stroke: edge, lw: 1.5, k: k)
            G36Part(shape: G36Svg(d: "M68 10 h18 v13 q-9 5 -18 0 z", vb: vb), fill: G35.c(0xa06a33), stroke: edge, lw: 1.5, k: k)
        }
        .frame(width: w, height: S * 0.34)
    }
}

/// Hammer (viewBox 50×50, hele hammeren rotert −35° rundt (11, 45)). Størrelse S·0,7.
struct G36Hammer: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 0.7
        let k: CGFloat = w / 50
        let vb: CGSize = CGSize(width: 50, height: 50)
        let c: CGPoint = CGPoint(x: 11, y: 45)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 8, y: 14, width: 7, height: 34), rx: 3, rot: -35, rc: c),
                    fill: G35.c(0xa06a33), stroke: G35.c(0x5b3a1a), lw: 1.4, k: k)
            G36Part(shape: G36Svg(d: "M14 4 h22 v10 h-22 z", vb: vb, rot: -35, rc: c), fill: G35.c(0x9aa3ad), stroke: G35.c(0x4c535b), lw: 1.6, k: k)
            G36Part(shape: G36Svg(d: "M36 4 q8 4 4 10 h-4 z", vb: vb, rot: -35, rc: c), fill: G35.c(0x7d858e), k: k)
        }
        .frame(width: w, height: w, alignment: .topLeading)
        .shadow(color: Color.black.opacity(0.35), radius: 1, y: 2)
    }
}

/// Figuren som snekker: hjelm, belte og hammer som slår (cpHam 0,62 s: −55° → 18°), dukker ved slaget (cpBob) og
/// tre små spon som spruter ut fra treffpunktet (cpChip). still = står stille med hammeren løftet.
struct G36Carpenter<Fig: View>: View {
    let S: CGFloat
    let t: Double
    var still: Bool = false
    @ViewBuilder let body0: () -> Fig

    var body: some View {
        let h: CGFloat = S * 1.1
        let p: Double = still ? 0 : G36Anim.loop(t, 0.62)
        let ham: Double = G36Anim.kf(p, [(0, -55), (0.55, -55), (0.82, 18), (1, -55)])
        let bob: Double = G36Anim.kf(p, [(0, 0), (0.7, 0), (0.82, 1), (1, 0)])
        ZStack(alignment: .topLeading) {
            // Prompt 44: drakten bærer figuren, så lue, glass og kappe følger bevegelsen (Glimt44Carry.swift).
            body0().frame(width: S, height: h, alignment: .topLeading).glimt40NoJul().glimt44Carried()
            G36Belt(S: S).offset(x: S * 0.5 - S * 0.51, y: h - S * 0.1 - S * 0.34)
            G36Helmet(S: S).offset(x: S * 0.5 - S * 0.475, y: -S * 0.24)
            G36Hammer(S: S)
                .rotationEffect(.degrees(ham), anchor: UnitPoint(x: 0.2, y: 0.9))
                .offset(x: S + S * 0.5 - S * 0.7, y: S * 0.1)
            if !still {
                ForEach(0..<3, id: \.self) { (i: Int) in
                    G36Chip(i: i, S: S, h: h, t: t)
                }
            }
        }
        .frame(width: S, height: h, alignment: .topLeading)
        .scaleEffect(x: 1, y: CGFloat(1 - 0.03 * bob), anchor: .bottom)
        .offset(y: CGFloat(1.5 * bob))
    }
}

/// Ett spon (4 × 3) som spruter ut og roterer (cpChip, 0,62 s, forsinkelse i · 0,05 s).
struct G36Chip: View {
    let i: Int
    let S: CGFloat
    let h: CGFloat
    let t: Double

    var body: some View {
        let p: Double = G36Anim.loop(t, 0.62, Double(i) * 0.05)
        let u: Double = p < 0.82 ? 0 : (p - 0.82) / 0.18
        let op: Double = p < 0.78 ? 0 : (p < 0.82 ? (p - 0.78) / 0.04 : 1 - u)
        let cx: CGFloat = CGFloat(8 + i * 7)
        let cy: CGFloat = CGFloat(-10 - i * 5)
        RoundedRectangle(cornerRadius: 1)
            .fill(i == 1 ? G35.c(0xf2c14e) : G35.c(0xc8925a))
            .frame(width: 4, height: 3)
            .rotationEffect(.degrees(160 * u))
            .offset(x: S + S * (0.55 + CGFloat(i) * 0.05) - 4 + cx * CGFloat(u), y: h + 2 - 3 + cy * CGFloat(u))
            .opacity(op)
    }
}
