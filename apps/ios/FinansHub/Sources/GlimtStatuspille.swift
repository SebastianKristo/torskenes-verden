import SwiftUI

/* ---------------- Prompt 57: Glimt-statuspillen øverst (claude-code-glimt-statuspille.md) ----------------
 Før lå «Glimt kontrollerer kvitteringen …» nederst og kolliderte med Skann-knappen, med en generisk spinner.
 Nå: én pille for all Glimt-status om kvitteringer (lesing på iPhonen, Glimt-kontrollen, skann og import), lagt som
 overlay øverst i skallet (PaperShell, via receipt48Host), så den overlever navigasjon og aldri deler plass med Skann-knappen
 eller fanelinjen.
 - Plassering: sentrert, safe area øverst + 8 pt. Bredde etter teksten, høyst skjermbredde − 32 pt, én linje med «…».
 - Venstre: Glimt-logoen (Orb43: regnbueringen med rød stjerne), 22 pt. Ringen roterer (1,6 s per runde) mens Glimt
   jobber og stopper når den er ferdig eller feilet. «Reduser bevegelse»: ingen rotasjon, ringen pulserer (opasitet 0,6–1).
 - Ferdig: «Kvittering lagret ✓» i 1,5 s, så skjules den. Feil: «Glimt fikk ikke lest kvitteringen», står til den trykkes
   eller sveipes bort.
 - Inn: glir ned + fade (0,25 s, spring). Ut: glir opp. Trykk åpner Kvitteringer. Sveip opp skjuler den (jobben fortsetter). */

enum GlimtStatusFase: Equatable {
    case jobber
    case ferdig
    case feilet
}

@MainActor
@Observable
final class GlimtStatus {
    static let shared: GlimtStatus = GlimtStatus()

    static let ferdigTekst: String = "Kvittering lagret ✓"
    static let feilTekst: String = "Glimt fikk ikke lest kvitteringen"

    /// Teksten i pillen. nil = skjult.
    private(set) var tekst: String? = nil
    private(set) var fase: GlimtStatusFase = .jobber
    /// Sveipet bort mens Glimt jobber: skjult til neste kvittering (jobben fortsetter).
    private(set) var bortsveipet: Bool = false
    private var teller: Int = 0

    var synlig: Bool { tekst != nil && !bortsveipet }

    /// Glimt (eller iPhonen) jobber. En ny jobb viser pillen igjen selv om den forrige ble sveipet bort.
    func jobber(_ t: String) {
        if tekst == nil || fase != .jobber { bortsveipet = false }
        teller += 1
        fase = .jobber
        tekst = t
    }

    /// Jobben stoppet uten eget resultat (f.eks. lagt i køen): pillen skjules. Ferdig- og feilteksten står.
    func stoppet() {
        if fase == .jobber { tekst = nil }
    }

    /// Ferdig: «Kvittering lagret ✓» i 1,5 s.
    func ferdig(_ t: String = GlimtStatus.ferdigTekst) {
        teller += 1
        let n: Int = teller
        fase = .ferdig
        tekst = t
        bortsveipet = false
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if self.teller == n { self.tekst = nil; self.fase = .jobber }
        }
    }

    /// Feil: står til den trykkes eller sveipes bort.
    func feilet(_ t: String = GlimtStatus.feilTekst) {
        teller += 1
        fase = .feilet
        tekst = t
        bortsveipet = false
    }

    /// Sveip opp. Mens Glimt jobber skjules den bare (jobben fortsetter); ellers forsvinner den.
    func sveip() {
        if fase == .jobber { bortsveipet = true } else { tekst = nil; fase = .jobber }
    }
}

/// Pillen øverst i skallet.
struct GlimtStatuspille: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @MainActor private var s: GlimtStatus { GlimtStatus.shared }

    /// Samme mørke pille som før (blekket i lys Papir) med hvit tekst, i begge moduser.
    private var flate: Color { DS.fixed(.textPrimary, stil: .papir, dark: false) }
    private var blekk: Color { DS.fixed(.onAccent, stil: .papir, dark: false) }

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            VStack(spacing: 0) {
                if s.synlig, let t = s.tekst {
                    pille(t, maks: Swift.max(120, g.size.width - 32))
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .frame(width: g.size.width)
            .padding(.top, 8)
        }
        .animation(.spring(duration: 0.25), value: s.synlig)
        .animation(.spring(duration: 0.25), value: s.tekst)
    }

    private func pille(_ t: String, maks: CGFloat) -> some View {
        HStack(spacing: 8) {
            GlimtStatusLogo(jobber: s.fase == .jobber, reduceMotion: reduceMotion)
            Text(t)
                .font(PF.ui(13, .bold))
                .foregroundStyle(blekk)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.leading, 9).padding(.trailing, 16)
        .frame(height: 40)
        .background(flate, in: Capsule())
        .frame(maxWidth: maks)
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Capsule())
        .onTapGesture { trykk() }
        .gesture(DragGesture(minimumDistance: 8).onEnded { (v: DragGesture.Value) in
            if v.translation.height < -12 { Haptics.shared.tap(); s.sveip() }
        })
        .accessibilityElement(children: .combine)
        .accessibilityLabel(t)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Åpner Kvitteringer")
        .accessibilityAction(named: Text("Skjul")) { s.sveip() }
    }

    /// Trykk åpner Kvitteringer, der kvitteringen Glimt kontrollerer ligger. Feil- og ferdigteksten lukkes samtidig.
    private func trykk() {
        Haptics.shared.tap()
        if s.fase != .jobber { s.sveip() }
        store.paperGo("kvitt")
    }
}

/// Glimt-logoen (22 pt): ringen roterer mens Glimt jobber, står stille ellers. «Reduser bevegelse»: puls i stedet.
struct GlimtStatusLogo: View {
    let jobber: Bool
    let reduceMotion: Bool
    @State private var puls: Bool = false

    var body: some View {
        Orb43(size: 22, busy: true, still: !jobber)
            .opacity(reduceMotion && jobber ? (puls ? 1 : 0.6) : 1)
            .onAppear { startPuls() }
            .onChange(of: jobber) { (_: Bool, _: Bool) in startPuls() }
    }

    private func startPuls() {
        guard reduceMotion && jobber else { puls = false; return }
        withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { puls = true }
    }
}
