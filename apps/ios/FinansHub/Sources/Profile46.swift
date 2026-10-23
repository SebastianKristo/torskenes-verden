import SwiftUI
import UIKit

/* ---------------- Prompt 46: profilbildet med Glimt-ring, og ingen firkant rundt det på iPad ----------------
 Spesifikasjon: claude-code-profilbilde-glimt-ring.md og claude-code-profilbilde-firkant-artefakt-ipad-fold.md.
 Fasit: Mobil Papir App.dc.html → profilknappen øverst til høyre på Hjem (goSet).
 – Ring: conic-gradient(from 200deg, #b23a2a, #e8794a, #f2c14e, #3fbf9a, #4f8fd6, #7a5ad6, #b23a2a), 2,5 pt, 1,5 pt mellomrom i
   bakgrunnsfargen, så bildet klippet til sirkel. Uten bilde: initialen på papirbakgrunn inne i samme ring.
 – Firkanten på iPad: skyggen lå på hele hilsen-blokken (VStack med tekst + avatar, Home45Wide) og bildet ble skalert uten egen
   ramme før klipping. Nå: alle lag klippes til Circle(), skyggen ligger på en Circle-form (y 2, radius 8, 25 % svart), ingen
   material/blur bak, og hilsenens skygge gjelder bare teksten.
 – Ringen roterer sakte (12 s) mens Glimt jobber (busy). «Reduser bevegelse»: statisk. */

struct Avatar46: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    var size: CGFloat = 40
    /// Mellomrommet mellom ringen og bildet (bakgrunnsfargen der avataren står).
    var gap: Color = Color(hex: "#f3efe6")
    var busy: Bool = false
    var shadow: Bool = true
    @State private var turn: Double = 0

    nonisolated static let ringColors: [Color] = [Color(hex: "#b23a2a"), Color(hex: "#e8794a"), Color(hex: "#f2c14e"), Color(hex: "#3fbf9a"),
                                                  Color(hex: "#4f8fd6"), Color(hex: "#7a5ad6"), Color(hex: "#b23a2a")]

    /// CSS «from 200deg» (0° = opp) → SwiftUI (0° = høyre): 200 − 90 = 110°.
    nonisolated static var ring: AngularGradient {
        AngularGradient(gradient: Gradient(colors: ringColors), center: .center, startAngle: .degrees(110), endAngle: .degrees(470))
    }

    private var inner: CGFloat { Swift.max(8, size - 8) }

    var body: some View {
        ZStack {
            Circle().fill(Avatar46.ring)
                .rotationEffect(.degrees(turn))
                .shadow(color: Color.black.opacity(shadow ? 0.25 : 0), radius: 8, y: 2)
            Circle().fill(gap).frame(width: size - 5, height: size - 5)
            face.frame(width: inner, height: inner).clipShape(Circle())
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .onAppear { spin(busy) }
        .onChange(of: busy) { (_: Bool, v: Bool) in spin(v) }
        .accessibilityHidden(true)
    }

    @ViewBuilder private var face: some View {
        if let a = store.avatar {
            Image(uiImage: a).resizable().scaledToFill().frame(width: inner, height: inner).clipShape(Circle())
        } else {
            ZStack {
                Circle().fill(Color(hex: "#f3efe6"))
                Text(Avatar46.initial(store.displayName)).font(PF.ui(inner * 0.4, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
            }
        }
    }

    private func spin(_ on: Bool) {
        if on && !reduce {
            withAnimation(.linear(duration: 12).repeatForever(autoreverses: false)) { turn = 360 }
        } else {
            withAnimation(.easeOut(duration: 0.3)) { turn = 0 }
        }
    }

    nonisolated static func initial(_ name: String) -> String {
        let s: String = name.trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? "•" : String(s.prefix(1)).uppercased()
    }
}
