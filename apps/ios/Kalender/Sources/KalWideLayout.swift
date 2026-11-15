import SwiftUI
import UIKit

/* ---------------- Prompt 43: Kalender – oppsett for iPad (stor skjerm) i onboarding og Innstillinger ---------------- */
// Fasit: Kalender Oppsett Stor Skjerm.dc.html (1a iPad liggende) og Kalender App.dc.html → auVals() (st:'lay') og
// Innstillinger → Generelt → «Oppsett på iPad og Fold» (Telefon · Delt · Full skjerm, wideLay, standard full).
// • Steg 2 av 2 etter innlogging, bare når flaten er minst 600 pt bred. Vises én gang per enhet, og igjen etter Logg ut.
// • Valget lagres per enhet (UserDefaults kal_wide_layout: tlf | delt | full), ikke i profilen.
// • Full skjerm: sidepanel 22 %, måned i midten, dagen med tidslinje til høyre 28 %. Trykk på en dag i måneden oppdaterer
//   dagspanelet (ingen navigering). Uke/3 dager/Dag tar midten + høyre sammen.
// • Delt: sidepanel + valgt visning (prompt 42-layouten). Telefon: iPhone-layouten, sentrert, maks 700 pt.

@MainActor
@Observable
final class KalWide43 {
    static let shared: KalWide43 = KalWide43()

    static let key: String = "kal_wide_layout"
    static let doneKey: String = "kal43.layDone"

    /// tlf | delt | full
    var mode: String = KalWide43.normalized(UserDefaults.standard.string(forKey: KalWide43.key)) {
        didSet { UserDefaults.standard.set(mode, forKey: KalWide43.key) }
    }
    /// Steg 2 er vist (eller hoppet over) på denne enheten.
    var done: Bool = UserDefaults.standard.bool(forKey: KalWide43.doneKey) {
        didSet { UserDefaults.standard.set(done, forKey: KalWide43.doneKey) }
    }
    /// Valget på kortene før «Fortsett».
    var pick: String = KalWide43.normalized(UserDefaults.standard.string(forKey: KalWide43.key))

    nonisolated static func normalized(_ v: String?) -> String {
        switch v ?? "" {
        case "tlf", "telefon", "phone": return "tlf"
        case "delt", "split": return "delt"
        default: return "full"
        }
    }

    static let names: [String: String] = ["tlf": "Som på telefonen", "delt": "Delt", "full": "Full skjerm"]
    static let short: [String: String] = ["tlf": "Telefon", "delt": "Delt", "full": "Full skjerm"]

    func choose(_ m: String) {
        let v: String = KalWide43.normalized(m)
        if mode != v { mode = v }
        pick = v
        done = true
    }

    /// Ved Logg ut: steget vises igjen etter neste innlogging.
    func reset() {
        done = false
        pick = mode
    }
}

/* ---------- Miljø: full skjerm er aktiv (måneden bytter da bare dag i dagspanelet) ---------- */

private struct KalFull43Key: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    var kalFull43: Bool {
        get { self[KalFull43Key.self] }
        set { self[KalFull43Key.self] = newValue }
    }
}

/* ---------- Steg 2 av 2: «Hvordan vil du bruke skjermen?» ---------- */

struct KalLayoutStep43: View {
    @Environment(\.kal) private var t
    @MainActor private var w: KalWide43 { KalWide43.shared }

    private let opts: [(String, String, String)] = [
        ("tlf", "Som på telefonen", "Én visning om gangen og faner nederst. Stor tekst, enkelt."),
        ("delt", "Delt", "Sidepanel med minikalender, kalendere og i dag. Visningen til høyre."),
        ("full", "Full skjerm", "Sidepanel, måned i midten og dagen til høyre. Alt på én skjerm."),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("STEG 2 AV 2").font(KalFont.mono(11)).tracking(1.4).foregroundStyle(t.acc)
                VStack(spacing: 6) {
                    Text("Hvordan vil du bruke skjermen?").font(KalFont.serif(30)).foregroundStyle(t.ink).multilineTextAlignment(.center)
                    Text("Du kan bytte når som helst i Innstillinger").font(KalFont.ui(15)).foregroundStyle(t.mut).multilineTextAlignment(.center)
                }
                HStack(alignment: .top, spacing: 14) {
                    ForEach(0..<opts.count, id: \.self) { (i: Int) in
                        card(opts[i].0, opts[i].1, opts[i].2)
                    }
                }
                .frame(maxWidth: 960)
                VStack(spacing: 10) {
                    Button(action: {
                        KalHaptic.tap()
                        withAnimation(.easeOut(duration: 0.25)) { w.choose(w.pick) }
                    }) {
                        Text("Fortsett med " + (KalWide43.names[w.pick] ?? "Full skjerm"))
                            .font(KalFont.ui(16, .heavy)).foregroundStyle(t.bg)
                            .frame(maxWidth: .infinity).frame(height: 52)
                            .background(Capsule().fill(t.ink))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.highlight)
                    Button(action: {
                        KalHaptic.tap()
                        withAnimation(.easeOut(duration: 0.25)) { w.choose("full") }
                    }) {
                        Text("Hopp over · bruk Full skjerm").font(KalFont.ui(14, .bold)).foregroundStyle(t.mut)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    Text("Kan endres i Innstillinger → Generelt → Oppsett på iPad og Fold").font(KalFont.ui(12.5)).foregroundStyle(t.mut2)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: 360)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 40)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .background(t.bg.ignoresSafeArea())
    }

    private func card(_ id: String, _ name: String, _ sub: String) -> some View {
        let on: Bool = w.pick == id
        return Button(action: {
            KalHaptic.tap()
            withAnimation(.easeOut(duration: 0.15)) { w.pick = id }
        }) {
            VStack(alignment: .leading, spacing: 12) {
                KalLayoutPreview43(kind: id)
                    .frame(height: 150)
                HStack(spacing: 8) {
                    Text(name).font(KalFont.ui(16, .heavy)).foregroundStyle(t.ink)
                    if id == "full" {
                        Text("Anbefalt").font(KalFont.ui(11, .bold)).foregroundStyle(Color.white)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(Capsule().fill(t.red))
                    }
                    Spacer(minLength: 0)
                    Text(on ? "✓" : "").font(KalFont.ui(13, .heavy)).foregroundStyle(t.bg)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(on ? t.ink : Color.clear))
                        .overlay(Circle().strokeBorder(on ? Color.clear : t.line, lineWidth: 1.5))
                }
                Text(sub).font(KalFont.ui(13.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(on ? t.ink : t.line, lineWidth: 2))
            .shadow(color: Color.black.opacity(on ? 0.18 : 0), radius: 12, y: 10)
            .contentShape(RoundedRectangle(cornerRadius: 22))
        }
        .buttonStyle(.plain)
        .hoverEffect(.lift)
        .accessibilityLabel(name + (on ? ", valgt" : ""))
    }
}

/// Skjematisk forhåndsvisning på kortene (fasitens små skisser).
struct KalLayoutPreview43: View {
    @Environment(\.kal) private var t
    let kind: String

    private var paper: Color { Color(kalHex: "#fffdf8") }
    private var bar: Color { Color(kalHex: "#ece6da") }
    private var cell: Color { Color(kalHex: "#e6dfd1") }

    var body: some View {
        HStack(spacing: 6) {
            switch kind {
            case "tlf":
                Spacer(minLength: 0)
                VStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(kalHex: "#1b1a17")).frame(width: 40, height: 8)
                    month(cols: 7, rows: 5)
                    RoundedRectangle(cornerRadius: 4).fill(bar).frame(height: 14)
                }
                .padding(6)
                .frame(width: 92)
                .background(RoundedRectangle(cornerRadius: 10).fill(paper))
                Spacer(minLength: 0)
            case "delt":
                side.frame(width: 44)
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(kalHex: "#1b1a17")).frame(width: 46, height: 7).frame(maxWidth: .infinity, alignment: .leading)
                    month(cols: 7, rows: 5)
                }
                .padding(6)
                .background(RoundedRectangle(cornerRadius: 10).fill(paper))
            default:
                side.frame(width: 36)
                month(cols: 7, rows: 5)
                    .padding(5)
                    .background(RoundedRectangle(cornerRadius: 10).fill(paper))
                VStack(alignment: .leading, spacing: 4) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(kalHex: "#b23a2a")).frame(width: 30, height: 7)
                    ForEach(0..<4, id: \.self) { (i: Int) in
                        RoundedRectangle(cornerRadius: 3).fill(i == 1 ? Color(kalHex: "#2b5d8a").opacity(0.6) : cell).frame(height: i == 1 ? 18 : 8)
                    }
                    Spacer(minLength: 0)
                }
                .padding(5)
                .frame(width: 44)
                .background(RoundedRectangle(cornerRadius: 10).fill(paper))
            }
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 14).fill(t.chip))
    }

    private var side: some View {
        VStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 4).fill(bar).frame(height: 26)
            ForEach(0..<3, id: \.self) { (_: Int) in RoundedRectangle(cornerRadius: 2).fill(cell).frame(height: 5) }
            Spacer(minLength: 0)
        }
        .padding(5)
        .background(RoundedRectangle(cornerRadius: 10).fill(paper))
    }

    private func month(cols: Int, rows: Int) -> some View {
        VStack(spacing: 2) {
            ForEach(0..<rows, id: \.self) { (r: Int) in
                HStack(spacing: 2) {
                    ForEach(0..<cols, id: \.self) { (c: Int) in
                        let i: Int = r * cols + c
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(i == 16 ? Color(kalHex: "#b23a2a") : ([3, 9, 20, 24].contains(i) ? Color(kalHex: "#2b5d8a") : cell))
                    }
                }
            }
        }
    }
}

/* ---------- Full skjerm: dagen med tidslinje (høyre panel, 28 %) ---------- */

struct KalDayPane43: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    private let hourH: CGFloat = 48

    // Delt opp i små delvisninger: én stor body var for tung for typesjekkeren i Xcode 16.
    private var key: String { s.anchor }
    private var day: Date { KalD.date(key) }
    private var list: [KalEvent] { s.on(key).uniqueIds() }
    private var allDay: [KalEvent] { list.filter { (e: KalEvent) -> Bool in e.allDay } }
    private var timed: [KalEvent] { list.filter { (e: KalEvent) -> Bool in !e.allDay } }
    private var firstHour: Int {
        let hours: [Int] = timed.map { (e: KalEvent) -> Int in e.startMin / 60 }
        let earliest: Int = hours.min() ?? 7
        return Swift.max(0, Swift.min(earliest, 7))
    }
    private var isToday: Bool { key == KalD.todayKey() }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            ForEach(allDay) { (e: KalEvent) in KalDayAllDay43(e: e) }
            if list.isEmpty {
                Text("Ingen hendelser").font(KalFont.ui(13)).foregroundStyle(t.mut)
            }
            ScrollView { timeline }
                .scrollIndicators(.hidden)
            newButton
        }
        .padding(14)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(t.bg)
    }

    private var header: some View {
        let kicker: String = isToday ? "I DAG" : "UKE " + String(KalWeek35.weekNo(KalWeek35.start(day)))
        let title: String = KalD.cap(KalD.fd(day))
        return VStack(alignment: .leading, spacing: 2) {
            Text(kicker).font(KalFont.mono(10.5)).tracking(1.3).foregroundStyle(t.acc)
            Text(title).font(KalFont.serif(24)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }

    private var timeline: some View {
        let first: Int = firstHour
        return ZStack(alignment: .topLeading) {
            KalDayHours43(first: first, hourH: hourH)
            ForEach(timed) { (e: KalEvent) in KalDayBlock43(e: e, first: first, hourH: hourH) }
        }
    }

    private var newButton: some View {
        let label: String = "+ Ny hendelse " + (isToday ? "i dag" : KalD.dl(day).lowercased())
        let k: String = key
        return Button(action: { s.openNew(day: k) }) {
            Text(label)
                .font(KalFont.ui(13.5, .bold)).foregroundStyle(Color.white)
                .frame(maxWidth: .infinity).frame(height: 40)
                .background(Capsule().fill(t.red))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
    }
}

/// Heldagshendelse i dagspanelet.
struct KalDayAllDay43: View {
    @Environment(\.kal) private var t
    let e: KalEvent

    var body: some View {
        let cal: KalCal? = KalStore.shared.cal(e.cal)
        return Button(action: { KalStore.shared.openDetail(e) }) {
            Text(e.title).font(KalFont.ui(12.5, .bold)).foregroundStyle(t.calText(cal)).lineLimit(1)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 6).fill(t.calColor(cal).opacity(0.16)))
        }
        .buttonStyle(.plain)
    }
}

/// Timelinjene (fra første time til 24).
struct KalDayHours43: View {
    @Environment(\.kal) private var t
    let first: Int
    let hourH: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            ForEach(first..<24, id: \.self) { (h: Int) in
                HStack(alignment: .top, spacing: 6) {
                    Text(KalD.pad(h)).font(KalFont.mono(10)).foregroundStyle(t.mut2).frame(width: 22, alignment: .trailing)
                    Rectangle().fill(t.line2).frame(height: 1).padding(.top, 6)
                }
                .frame(height: hourH, alignment: .top)
            }
        }
    }
}

/// Én hendelse på tidslinjen.
struct KalDayBlock43: View {
    @Environment(\.kal) private var t
    let e: KalEvent
    let first: Int
    let hourH: CGFloat

    private var top: CGFloat {
        let startOff: Int = e.startMin - first * 60
        return CGFloat(startOff) / 60 * hourH + 6
    }
    private var height: CGFloat {
        let durMin: Int = Swift.max(15, e.endMin - e.startMin)
        let rawH: CGFloat = CGFloat(durMin) / 60 * hourH - 2
        return Swift.max(22, rawH)
    }
    private var timeText: String {
        let span: String = KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
        return e.loc.isEmpty ? span : span + " · " + e.loc
    }

    var body: some View {
        let c: KalCal? = KalFag37.tint(KalStore.shared.cal(e.cal), e)
        let fill: Color = t.calColor(c)
        return Button(action: { KalStore.shared.openDetail(e) }) {
            VStack(alignment: .leading, spacing: 1) {
                Text(e.title).font(KalFont.ui(12.5, .bold)).lineLimit(2)
                Text(timeText).font(KalFont.ui(11)).lineLimit(1).opacity(0.8)
            }
            .foregroundStyle(t.calText(c))
            .padding(.horizontal, 7).padding(.vertical, 4)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 8).fill(fill.opacity(0.16)))
            .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 2).fill(fill).frame(width: 3) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(height: height)
        .padding(.leading, 30)
        .offset(y: top)
    }
}

/* ---------- Innstillinger → Generelt → Oppsett på iPad og Fold + Programvareoppdatering (iOS) ---------- */

struct KalWideSettings43: View {
    @MainActor private var w: KalWide43 { KalWide43.shared }

    var body: some View {
        KalSegRow35(title: "Oppsett på iPad og Fold", sub: "Når skjermen er bred",
                    options: [KalSegOpt35(id: "tlf", name: "Telefon"), KalSegOpt35(id: "delt", name: "Delt"), KalSegOpt35(id: "full", name: "Full skjerm")],
                    selected: w.mode) { (v: String) in
            withAnimation(.easeOut(duration: 0.25)) { w.choose(v) }
        }
    }
}

/// iPhone og iPad kan ikke oppdatere seg selv: «Kalender 1.0 (14) · via TestFlight» + Åpne TestFlight.
struct KalUpdateInfo43: View {
    @Environment(\.kal) private var t
    @State private var open: Bool = false

    static var versionText: String {
        let v: String = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
        let b: String = (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? ""
        return "Kalender " + v + (b.isEmpty ? "" : " (" + b + ")")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            KalLinkRow35(title: "Programvareoppdatering", sub: KalUpdateInfo43.versionText + " · via TestFlight") {
                withAnimation(.easeOut(duration: 0.2)) { open.toggle() }
            }
            if open {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Oppdateres gjennom TestFlight").font(KalFont.ui(15, .bold)).foregroundStyle(t.ink)
                    Text("På iPhone og iPad kan ikke apper oppdatere seg selv. Ny versjon kommer i TestFlight (eller som ny IPA), og du får varsel når den er klar.")
                        .font(KalFont.ui(14)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                    Button(action: {
                        if let u = URL(string: "itms-beta://") { UIApplication.shared.open(u) }
                    }) {
                        Text("Åpne TestFlight").font(KalFont.ui(14, .heavy)).foregroundStyle(t.bg)
                            .padding(.horizontal, 18).frame(height: 44)
                            .background(Capsule().fill(t.ink))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(t.line, lineWidth: 1))
                .padding(.vertical, 8)
                .transition(.opacity)
            }
        }
    }
}
