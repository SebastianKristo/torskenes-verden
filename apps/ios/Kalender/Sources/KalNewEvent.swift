import SwiftUI

/* ---------------- Prompt 46: «+» gir aldri grå skjerm, startverdier og standardkalender (iPhone og iPad) ---------------- */
// Spesifikasjon: claude-code-kalender-ny-hendelse-graa-skjerm.md og claude-code-glimt-kalender-standardkalender.md.
// Grå skjerm = bakteppet (KalDim) ble lagt over alt, men arket kom aldri fram på skjermen – og ingenting lukket bakteppet igjen.
// Nå åpnes arket via en vakt: skjemaet ryddes først (slutt etter start, samme dag, kalender som finnes), og arket melder fra
// når innholdet faktisk er lagt ut (høyde og bredde > 80 pt). Gjør det ikke det innen 1,2 s, lukkes
// bakteppet, «Kunne ikke åpne ny hendelse» vises med «Prøv igjen», og hendelsen logges (cal.new46.fail) til serveren.

@MainActor
@Observable
final class KalNew46Guard {
    static let shared: KalNew46Guard = KalNew46Guard()
    /// Arket er synlig på skjermen.
    var shown: Bool = false
    /// «Kunne ikke åpne ny hendelse» (med skjemaet som prøves igjen).
    var failed: KalNewForm? = nil
    @ObservationIgnored private var seq: Int = 0
    @ObservationIgnored private var openedAt: Date = Date()

    func arm(_ f: KalNewForm) {
        seq += 1
        let g: Int = seq
        shown = false
        failed = nil
        openedAt = Date()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            self.check(g, f)
        }
    }

    /// Kalles fra arket når innholdet er lagt ut med en reell størrelse. (Posisjonen brukes ikke: under innglidningen
    /// ligger arket fortsatt nedenfor skjermen, og det skal ikke regnes som feil.)
    func seen(_ size: CGSize) {
        if shown { return }
        if size.height < 80 || size.width < 80 || !size.height.isFinite || !size.width.isFinite { return }
        shown = true
        let ms: Int = Int(Date().timeIntervalSince(openedAt) * 1000)
        if ms > 600 { KalLog44.send("cal.new46.slow", ["ms": String(ms)]) }
    }

    private func check(_ g: Int, _ f: KalNewForm) {
        if g != seq || shown { return }
        let s: KalStore = KalStore.shared
        guard s.newForm != nil else { return }
        KalLog44.send("cal.new46.fail", ["view": s.view, "anchor": s.anchor, "cals": String(s.cals.count), "serverCals": s.serverCals ? "1" : "0",
                                         "pad": KalPad42Model.isPad ? "1" : "0", "kb": String(Int(KalKb37.shared.height))])
        withAnimation(.easeOut(duration: 0.2)) {
            s.newForm = nil
            failed = f
        }
    }

    func retry() {
        guard let f = failed else { return }
        withAnimation(.easeOut(duration: 0.2)) { failed = nil }
        KalStore.shared.presentNew46(f)
    }

    func dismiss() {
        withAnimation(.easeOut(duration: 0.2)) { failed = nil }
    }
}

extension KalStore {
    /// Kalenderen nye hendelser havner i (Innstillinger → Standardkalender, ellers Google, ellers Personlig).
    var defCalId46: String { KalDef46.pick(cals, preferred: defCal46) }

    /// Innstillinger → Kalender → Standardkalender. Lagres i profilen (samme for web, Homelab og Glimt).
    func setDefCal46(_ id: String) {
        KalHaptic.tap()
        defCal46 = id
        savePrefs(["defaultCalendar": id])
    }

    /// Dagen «+» starter på: i dag i Måned/År/Liste, ellers i dag hvis den vises, ellers første synlige dag.
    func newDay46() -> String {
        let tk: String = KalD.todayKey()
        if view == "mnd" || view == "ar" || view == "liste" { return tk }
        let a: Date = KalD.date(KalD.valid(anchor) ? anchor : tk)
        let first: Date = view == "uke" ? KalWeek35.start(a) : a
        let n: Int = view == "uke" ? 7 : (view == "3d" ? 3 : 1)
        for i in 0..<n where KalD.key(KalD.add(first, i)) == tk { return tk }
        return KalD.key(first)
    }

    /// Neste hele time (14:20 → 15:00), maks 23:00.
    nonisolated static func nextHour46() -> Int {
        Swift.min(23 * 60, (KalD.minutesNow() / 60 + 1) * 60)
    }

    /// Rydder skjemaet og åpner arket via vakten.
    func presentNew46(_ f0: KalNewForm) {
        var f: KalNewForm = f0
        let day: String = KalD.key(f.day)
        var st: Int = KalD.minutes(f.start)
        var en: Int = KalD.minutes(f.end)
        if st < 0 || st > 23 * 60 + 45 { st = KalStore.nextHour46() }
        if en <= st { en = Swift.min(1439, st + defDur) }
        f.start = KalD.at(day, st)
        f.end = KalD.at(day, en)
        if f.cal.isEmpty || !cals.contains(where: { (c: KalCal) -> Bool in c.id == f.cal }) { f.cal = defCalId46 }
        KalNew46Guard.shared.arm(f)
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)) { newForm = f }
    }
}

/// Arket melder fra når innholdet ligger synlig på skjermen (vakten over).
struct KalNewSeen46: ViewModifier {
    func body(content: Content) -> some View {
        content.background {
            GeometryReader { (g: GeometryProxy) in
                Color.clear
                    .onAppear { report(g) }
                    .onChange(of: g.size) { (_: CGSize, _: CGSize) in report(g) }
            }
        }
    }

    @MainActor private func report(_ g: GeometryProxy) {
        KalNew46Guard.shared.seen(g.size)
    }
}

/// «Kunne ikke åpne ny hendelse» · Prøv igjen (i stedet for grå skjerm).
struct KalNewFail46: View {
    @Environment(\.kal) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Kunne ikke åpne ny hendelse").font(KalFont.ui(15, .bold)).foregroundStyle(t.ink)
            Text("Prøv igjen, eller skriv hendelsen i feltet nederst.").font(KalFont.ui(13)).foregroundStyle(t.mut)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                KalPill(title: "Prøv igjen") { KalNew46Guard.shared.retry() }
                KalPill(title: "Lukk", filled: false) { KalNew46Guard.shared.dismiss() }
            }
        }
        .padding(16)
        .frame(maxWidth: 420, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(t.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.18), radius: 20, y: 10)
        .padding(.horizontal, 16)
    }
}

/// KALENDER i Ny hendelse: lastetilstand før lista er hentet, og standardkalenderen merket.
struct KalNewCalsHint46: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        if s.loading && !s.serverCals {
            HStack(spacing: 6) {
                ProgressView().controlSize(.mini)
                Text("Henter kalendere …").font(KalFont.ui(12)).foregroundStyle(t.mut)
            }
        }
    }
}

/// Innstillinger → STANDARDKALENDER: skrivbare kalendere som valg (lagres i profilen).
struct KalDefCal46Row: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    private var list: [KalCal] { s.cals.filter { (c: KalCal) -> Bool in KalDef46.usable(c) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalFlow(spacing: 6) {
                ForEach(list) { (c: KalCal) in
                    KalChip(title: c.name, on: s.defCalId46 == c.id, dot: t.calColor(c)) { s.setDefCal46(c.id) }
                }
            }
            Text("Nye hendelser fra «+», rask time og Glimt havner her, med mindre du nevner en annen kalender.")
                .font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
    }
}
