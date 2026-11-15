import SwiftUI

/* ---------------- Prompt 40: nytt Økonomi-ikon 3c ----------------
   prompts/prompt-40-pakke/claude-code-glimt-jul.md («Økonomi-ikon»), fasit design/Glimt Jul og Okonomi-ikon.dc.html → 3c:
   3a (hvit lommebok med budsjettringen som lås) i fargen fra 3b (mørk blå #1B2A40). viewBox 48:
   lommebok rect(7,14,32,23, rx 5) + klaff M12 14 L28 8 L31 14 (strek 3,2), lås: sirkel (34, 25,5) r 6,5 fylt #1b2a40 med hvit kant 2,5,
   og ringen i tre farger (gull #f2c14e, mint #7fd4c1, rosa #f6b7c8, r 4,5, strek 3).
   Brukes for Finans/Økonomi i Mer (og wiggle-lista), og som alternativt app-ikon «Økonomi» (AppIcon-Okonomi, Innstillinger → App-ikon). */

/// Selve symbolet (hvit strek) i en ramme på `size` (glyfen fyller 60 % som i fasiten).
struct Okonomi40Glyph: View {
    let size: CGFloat
    var color: Color = Color.white
    var lockFill: Color = Color(red: 0x1b / 255, green: 0x2a / 255, blue: 0x40 / 255)

    var body: some View {
        let vb: CGSize = CGSize(width: 48, height: 48)
        let k: CGFloat = size / 48
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 7, y: 14, width: 32, height: 23), rx: 5), stroke: color, lw: 3.2, k: k)
            G36Part(shape: G36Svg(d: "M12 14 L28 8 L31 14", vb: vb), stroke: color, lw: 3.2, k: k, cap: .round)
            Circle().fill(lockFill)
                .overlay(Circle().stroke(color, lineWidth: 2.5 * k))
                .frame(width: 13 * k, height: 13 * k)
                .offset(x: 27.5 * k, y: 19 * k)
            Okonomi40Ring(k: k)
                .frame(width: 9 * k, height: 9 * k)
                .offset(x: 29.5 * k, y: 21 * k)
        }
        .frame(width: size, height: size, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

/// Budsjettringen i låsen: tre buer (gull → mint → rosa), med klokka fra toppen.
struct Okonomi40Ring: View {
    let k: CGFloat

    var body: some View {
        // Vinklene fra stiene i fasiten: (34,21) topp, (38,3 26,8) ≈ 16,8°, (31 28,9) ≈ 131,4° (0° = kl. 3, med klokka).
        let a: CGFloat = (16.8 + 90) / 360
        let b: CGFloat = (131.4 + 90) / 360
        ZStack {
            Circle().trim(from: 0, to: a).stroke(Color(red: 0xf2 / 255, green: 0xc1 / 255, blue: 0x4e / 255), lineWidth: 3 * k)
            Circle().trim(from: a, to: b).stroke(Color(red: 0x7f / 255, green: 0xd4 / 255, blue: 0xc1 / 255), lineWidth: 3 * k)
            Circle().trim(from: b, to: 1).stroke(Color(red: 0xf6 / 255, green: 0xb7 / 255, blue: 0xc8 / 255), lineWidth: 3 * k)
        }
        .rotationEffect(.degrees(-90))
    }
}

/// Ikonet i en flis (#1B2A40, hjørner som i menyen: 12 pt på 40 pt).
struct Okonomi40Icon: View {
    var size: CGFloat = 40

    var body: some View {
        Okonomi40Glyph(size: size * 0.6)
            .frame(width: size, height: size)
            .background(Color(red: 0x1b / 255, green: 0x2a / 255, blue: 0x40 / 255),
                        in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
            .accessibilityHidden(true)
    }
}
