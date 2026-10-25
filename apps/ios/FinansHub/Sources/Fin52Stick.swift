import SwiftUI
import UIKit

/* ---------------- Prompt 52 (IOS52A): Finans → Liste – avrundet månedslinje når den er festet ----------------
   Spesifikasjon: prompt-52-pakke/claude-code-finans-liste-maanedslinje-avrundet.md. Fasit: Homelab.dc.html (stickInit, data-fstick).
   – I flyt: som før (mono-etikett, netto, 2 pt strek under).
   – Festet: radius 16, kortfarge 88 % + .ultraThinMaterial, 1 pt kontur i linjefarge, myk skygge (0 10 24 −14 rgba(27,26,23,.45)),
     ingen strek, luft 10/14, 6 pt bredere enn lista på hver side, 10 pt fra toppen. Overgang 0,22 s.
   – Festet = toppen av månedens innhold har scrollet opp under overskriften (målt i det globale koordinatsystemet). Ingen gester. */

/// Én måned i lista: seksjon med festet overskrift som vet når den er festet.
struct Fin52MonthSection<C: View>: View {
    let title: String
    let net: Double
    @ViewBuilder let content: () -> C
    @State private var headBottom: CGFloat = 0
    @State private var contentTop: CGFloat = 0

    private var pinned: Bool { headBottom > 0 && contentTop < headBottom - 2 }

    var body: some View {
        Section {
            content()
                .background(GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { contentTop = g.frame(in: .global).minY }
                        .onChange(of: g.frame(in: .global).minY) { (_: CGFloat, y: CGFloat) in contentTop = y }
                })
        } header: {
            Fin43MonthHead(title: title, net: net, pinned: pinned)
                .background(GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { headBottom = g.frame(in: .global).maxY }
                        .onChange(of: g.frame(in: .global).maxY) { (_: CGFloat, y: CGFloat) in headBottom = y }
                })
        }
    }
}

/// Bakgrunnen til den festede pillen.
struct Fin52StickBg: View {
    @Environment(\.paper) private var p

    var body: some View {
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 16, style: .continuous)
        ZStack {
            shape.fill(.ultraThinMaterial)
            shape.fill(p.card.opacity(0.88))
        }
        .overlay(shape.stroke(p.line, lineWidth: 1))
        .shadow(color: Color(red: 27 / 255, green: 26 / 255, blue: 23 / 255).opacity(0.28), radius: 12, x: 0, y: 10) // spredning −14 finnes ikke i SwiftUI: lavere opasitet
        .transition(.opacity)
    }
}
