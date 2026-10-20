import SwiftUI
import UIKit

/* ---------------- Prompt 42: Kalender på iPad (én universal-app) ---------------- */
// Fasit: Kalender iPad.dc.html. Bred layout (horizontal size class regular, ≥ 600 pt: fullskjerm, Split View 1/2 og 2/3) = Kalender.dc.html
// variant web full (samme som Mac/web): toppfelt med tittel, ‹ ›, I dag, År · Mnd · Uke · 3 d · Dag · Liste og søk, «NESTE»-linje og
// sidepanel (minimåned, Mine kalendere med av/på og farge, Glimt · dagen din, Glimt-feltet). Liggende: sidepanelet vises og kan skjules;
// stående: skjult og glir inn over innholdet. Standardvisning Uke i liggende, Måned i stående. Compact (Split View 1/3, Slide Over) =
// iPhone-layouten. Byttet skjer live; valgt dato, visning og åpne ark beholdes (de ligger i KalStore).
// Hendelser åpnes som ark i midten (formSheet-stil), tastatursnarveiene er de samme som Mac/web (vises i ⌘-oversikten).

private struct KalPad42Key: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    /// true = bred iPad-layout (arkene legges i midten, ikke nederfra).
    var kalPad42: Bool {
        get { self[KalPad42Key.self] }
        set { self[KalPad42Key.self] = newValue }
    }
}

@MainActor
@Observable
final class KalPad42Model {
    static let shared: KalPad42Model = KalPad42Model()

    /// Sidepanelet i liggende (huskes). Stående: overlay som må åpnes.
    var sideOpen: Bool = (UserDefaults.standard.object(forKey: "kal.pad42.side") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(sideOpen, forKey: "kal.pad42.side") }
    }
    var overlayOpen: Bool = false
    /// Måneden i minikalenderen (første dag).
    var mini: Date = KalD.firstOfMonth(KalD.today())
    @ObservationIgnored var defaulted: Bool = false

    static var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    func toggleSide(inline: Bool) {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) {
            if inline { sideOpen.toggle() } else { overlayOpen.toggle() }
        }
    }

    /// Første gang den brede layouten vises: Uke i liggende, Måned i stående (når «Åpne i» ikke er valgt i Innstillinger).
    func applyDefaultView(landscape: Bool) {
        if defaulted { return }
        defaulted = true
        // Bare første gang på iPad – etterpå gjelder siste brukte visning (som på iPhone).
        if UserDefaults.standard.bool(forKey: "kal.pad42.def") { return }
        UserDefaults.standard.set(true, forKey: "kal.pad42.def")
        if UserDefaults.standard.string(forKey: "kal.openView") != nil { return }
        let s: KalStore = KalStore.shared
        let want: String = landscape ? "uke" : "mnd"
        if s.view != want { s.view = want }
    }
}

/* ---------- Bred layout ---------- */

struct KalPad42Main<Stage: View>: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @MainActor private var m: KalPad42Model { KalPad42Model.shared }
    @ViewBuilder let stage: () -> Stage

    var body: some View {
        GeometryReader { (geo: GeometryProxy) in
            let landscape: Bool = geo.size.width > geo.size.height
            let canInline: Bool = landscape && geo.size.width >= 900
            let inline: Bool = canInline && m.sideOpen
            HStack(spacing: 0) {
                if inline {
                    KalPad42Sidebar(overlay: false)
                        .frame(width: 272)
                        .transition(.move(edge: .leading).combined(with: .opacity))
                    Rectangle().fill(t.line).frame(width: 1)
                }
                VStack(spacing: 0) {
                    KalPad42Toolbar(inline: canInline, width: geo.size.width - (inline ? 273 : 0))
                        .fixedSize(horizontal: false, vertical: true)
                        .layoutPriority(2)
                    KalPad42Next()
                    Rectangle().fill(t.line).frame(height: 1)
                    stage()
                        .frame(minHeight: 0, maxHeight: .infinity)
                        .layoutPriority(0)
                    // Uten sidepanel: Glimt-feltet og rød + nederst (som på iPhone), over hjemstreken.
                    if !inline {
                        KalComposer()
                            .frame(maxWidth: 760)
                            .frame(maxWidth: .infinity)
                            .fixedSize(horizontal: false, vertical: true)
                            .layoutPriority(2)
                    }
                }
                .frame(minWidth: 0, maxWidth: .infinity)
            }
            .overlay(alignment: .leading) {
                if !inline && m.overlayOpen {
                    ZStack(alignment: .leading) {
                        KalDim { withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { m.overlayOpen = false } }
                        KalPad42Sidebar(overlay: true)
                            .frame(width: 300)
                            .frame(maxHeight: .infinity)
                            .background(t.card)
                            .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: 24, topTrailingRadius: 24))
                            .shadow(color: Color.black.opacity(0.18), radius: 20, x: 12)
                            .transition(.move(edge: .leading))
                    }
                }
            }
            .onAppear { m.applyDefaultView(landscape: landscape) }
            .onChange(of: canInline) { (_: Bool, v: Bool) in if v { m.overlayOpen = false } }
            .onChange(of: s.anchor) { (_: String, v: String) in m.mini = KalD.firstOfMonth(KalD.date(v)) }
        }
    }
}

/* ---------- Toppfeltet ---------- */

struct KalPad42Toolbar: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    /// Sidepanelet kan ligge fast (liggende og bredt nok); ellers åpner knappen det over innholdet.
    let inline: Bool
    let width: CGFloat

    var body: some View {
        let h: KalHead = KalHeadText.make(s)
        let compact: Bool = width < 860
        HStack(alignment: .center, spacing: 8) {
            Button(action: { KalPad42Model.shared.toggleSide(inline: inline) }) {
                Image(systemName: "sidebar.left").font(.system(size: 18, weight: .semibold)).foregroundStyle(t.ink)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .hoverEffect(.highlight)
            .accessibilityLabel("Sidepanel")
            Button(action: { s.zoomOut() }) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(h.kicker).font(KalFont.mono(10.5)).tracking(1.3).foregroundStyle(t.acc).lineLimit(1)
                    Text(h.title).font(KalFont.serif(compact ? 26 : 30)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(minWidth: 0, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .layoutPriority(0)
            .accessibilityLabel(h.title + ", zoom ut")
            HStack(spacing: 4) {
                if h.nav {
                    KalRoundIcon(name: "chevron.left", label: "Forrige") { s.step(-1) }.hoverEffect(.highlight)
                    KalRoundIcon(name: "chevron.right", label: "Neste") { s.step(1) }.hoverEffect(.highlight)
                }
                KalTodayPill35 { s.goToday() }.hoverEffect(.highlight)
            }
            .fixedSize()
            .layoutPriority(2)
            Spacer(minLength: 6)
            KalViewPicker()
                .frame(width: compact ? 300 : 380)
                .layoutPriority(1)
            HStack(spacing: 6) {
                KalRoundIcon(name: "magnifyingglass", label: "Søk") { KalPad42Keys.openSearch() }.hoverEffect(.highlight)
                if !compact {
                    Button(action: {
                        KalHaptic.tap()
                        s.glimtOpen = true
                    }) {
                        HStack(spacing: 6) {
                            KalSpark(size: 16)
                            Text("Glimt").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink)
                        }
                        .padding(.horizontal, 14).frame(height: 38)
                        .background(Capsule().fill(t.card))
                        .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                        .frame(minHeight: 44)
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.highlight)
                    .accessibilityLabel("Glimt")
                }
                Button(action: { s.openNew() }) {
                    Group {
                        if compact {
                            Image(systemName: "plus").font(.system(size: 16, weight: .heavy)).frame(width: 38, height: 38)
                        } else {
                            Text("+ Ny hendelse").font(KalFont.ui(13.5, .bold)).padding(.horizontal, 16).frame(height: 38)
                        }
                    }
                    .foregroundStyle(Color.white)
                    .background(Capsule().fill(t.red))
                    .frame(minHeight: 44)
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .hoverEffect(.lift)
                .accessibilityLabel("Ny hendelse")
            }
            .fixedSize()
            .layoutPriority(2)
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }
}

/// «NESTE · 14:30 · i dag  Nina frisør · Grünerløkka» (som på web/Mac).
struct KalPad42Next: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        if let n = s.upcoming(limit: 12).first(where: { (e: KalEvent) -> Bool in !e.allDay }) {
            let c: KalCal? = KalFag37.tint(s.cal(n.cal), n)
            Button(action: { s.openDetail(n) }) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4, height: 22)
                    Text("NESTE").font(KalFont.mono(10)).tracking(1.2).foregroundStyle(t.acc)
                    Text(KalD.hm(n.startMin) + " · " + KalAsk.rel(n.day)).font(KalFont.mono(11.5)).foregroundStyle(t.mut)
                    Text(n.title).font(KalFont.serif(17)).foregroundStyle(t.ink).lineLimit(1)
                    if !n.loc.isEmpty { Text(n.loc).font(KalFont.ui(12.5)).foregroundStyle(t.mut).lineLimit(1) }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .frame(height: 36)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .hoverEffect(.highlight)
            .accessibilityLabel("Neste: " + n.title + " " + KalD.hm(n.startMin))
        }
    }
}

/* ---------- Sidepanelet ---------- */

struct KalPad42Sidebar: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let overlay: Bool
    @State private var picking: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if overlay {
                        HStack {
                            Text("Kalendere").font(KalFont.serif(24)).foregroundStyle(t.ink)
                            Spacer()
                            KalPill(title: "Ferdig") {
                                withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { KalPad42Model.shared.overlayOpen = false }
                            }
                        }
                    }
                    KalPad42Mini()
                    calendars
                    dayCard
                    settingsRow
                    Text("Hurtigtaster: ← → bla · T i dag · D dag · 3 tre dager · W uke · M måned · Y år · L liste · ⌘N ny · ⌘F søk · ⌘K Glimt")
                        .font(KalFont.ui(11)).foregroundStyle(t.mut2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 14)
                .padding(.top, overlay ? 14 : 8)
                .padding(.bottom, 14)
            }
            .scrollIndicators(.hidden)
            // Glimt-feltet nederst i sidepanelet (bare når panelet ligger fast; over innholdet har innholdet sitt eget felt).
            if !overlay { KalComposer() }
        }
        .background(overlay ? t.card : t.bg)
        .animation(.easeOut(duration: 0.2), value: picking)
    }

    private var calendars: some View {
        VStack(alignment: .leading, spacing: 4) {
            KalLabel(text: "MINE KALENDERE")
            VStack(spacing: 0) {
                ForEach(s.cals.filter { (c: KalCal) -> Bool in c.inMenu }) { (c: KalCal) in
                    KalCalRow35(c: c, editing: false, picking: picking == c.id) {
                        KalHaptic.tap()
                        picking = picking == c.id ? nil : c.id
                    }
                    .hoverEffect(.highlight)
                    .contextMenu {
                        Button(action: { s.setCal(c.id, on: !c.on) }) { Label(c.on ? "Skjul hendelsene" : "Vis hendelsene", systemImage: c.on ? "eye.slash" : "eye") }
                        Button(action: { picking = c.id }) { Label("Farge …", systemImage: "paintpalette") }
                        Button(action: { s.setHidMenu(c.id, true) }) { Label("Skjul fra menyen", systemImage: "minus.circle") }
                        Button(action: {
                            s.openCals39()
                            s.editCal39(c.id)
                        }) { Label("Rediger …", systemImage: "pencil") }
                    }
                }
            }
            .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
            HStack(spacing: 14) {
                Button(action: { s.openCals39() }) {
                    Text("Administrer kalendere ›").font(KalFont.ui(13, .bold)).foregroundStyle(t.acc).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)
                Button(action: { s.openAdd39() }) {
                    Text("+ Legg til").font(KalFont.ui(13, .bold)).foregroundStyle(t.ink).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)
                .accessibilityLabel("Legg til kalender")
            }
        }
    }

    private var dayCard: some View {
        Button(action: {
            KalHaptic.tap()
            s.glimtOpen = true
        }) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    KalSpark(size: 16)
                    KalLabel(text: "GLIMT · DAGEN DIN", color: t.acc)
                }
                Text(s.daySummary).font(KalFont.ui(12.5)).foregroundStyle(t.ink2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(overlay ? t.bg : t.card))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel("Glimt, dagen din. " + s.daySummary)
    }

    private var settingsRow: some View {
        Button(action: {
            KalHaptic.tap()
            KalPad42Model.shared.overlayOpen = false
            s.settingsOpen = true
        }) {
            HStack(spacing: 10) {
                Image(systemName: "gearshape").font(.system(size: 15, weight: .semibold)).foregroundStyle(t.ink)
                    .frame(width: 30, height: 30)
                    .background(RoundedRectangle(cornerRadius: 9).fill(t.chip))
                Text("Innstillinger").font(KalFont.ui(14, .bold)).foregroundStyle(t.ink)
                Spacer()
                Text("›").font(KalFont.ui(15, .bold)).foregroundStyle(t.mut)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel("Innstillinger")
    }
}

/// Minimåned med ukenummer (trykk = uka), i dag i rød sirkel, valgt dag med ring og prikk for dager med hendelser.
struct KalPad42Mini: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @MainActor private var m: KalPad42Model { KalPad42Model.shared }

    var body: some View {
        let first: Date = KalD.firstOfMonth(m.mini)
        let start: Date = KalWeek35.start(first)
        let rows: Int = KalWeek35.rows(first)
        VStack(spacing: 2) {
            HStack(spacing: 2) {
                Text(KalD.cap(KalD.months[KalD.month(first) - 1]) + " " + String(KalD.year(first)))
                    .font(KalFont.ui(14, .bold)).foregroundStyle(t.ink)
                Spacer()
                miniNav("chevron.left", "Forrige måned", -1)
                miniNav("chevron.right", "Neste måned", 1)
            }
            HStack(spacing: 0) {
                if s.showWeeks { Text("U").font(KalFont.monoHeavy(9.5)).foregroundStyle(t.ink).frame(width: 24) }
                ForEach(0..<7, id: \.self) { (i: Int) in
                    Text(KalWeek35.letters[i]).font(KalFont.ui(10, .bold))
                        .foregroundStyle(KalWeek35.isSunday(i) ? t.sunday : t.mut)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 18)
            ForEach(0..<rows, id: \.self) { (r: Int) in
                let w: Date = KalD.add(start, r * 7)
                HStack(spacing: 0) {
                    if s.showWeeks {
                        Button(action: { s.go(view: "uke", day: KalD.key(w)) }) {
                            Text(String(KalWeek35.weekNo(w))).font(KalFont.monoHeavy(10.5)).foregroundStyle(t.ink).frame(width: 24, height: 30)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Uke " + String(KalWeek35.weekNo(w)))
                    }
                    ForEach(0..<7, id: \.self) { (i: Int) in
                        KalPad42MiniDay(day: KalD.add(w, i), month: KalD.month(first))
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func miniNav(_ icon: String, _ label: String, _ n: Int) -> some View {
        Button(action: {
            KalHaptic.tap()
            m.mini = KalD.addMonths(KalD.firstOfMonth(m.mini), n)
        }) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(t.ink).frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel(label)
    }
}

struct KalPad42MiniDay: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let day: Date
    let month: Int

    var body: some View {
        let k: String = KalD.key(day)
        let today: Bool = k == KalD.todayKey()
        let inMonth: Bool = KalD.month(day) == month
        let sel: Bool = k == s.anchor && !today
        let has: Bool = !s.on(k).isEmpty
        Button(action: {
            KalHaptic.tap()
            withAnimation(.easeOut(duration: 0.2)) { s.anchor = k }
            if s.view == "ar" || s.view == "liste" { s.go(view: "dag", day: k) }
            Task { await s.load() }
        }) {
            VStack(spacing: 1) {
                Text(String(KalD.dayOfMonth(day)))
                    .font(KalFont.ui(11.5, today ? .heavy : .semibold))
                    .foregroundStyle(today ? Color.white : (!inMonth ? t.mut2.opacity(0.6) : (KalD.wd(day) == 0 ? t.sunday : t.ink)))
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(today ? t.red : Color.clear))
                    .overlay(Circle().strokeBorder(sel ? t.ink : Color.clear, lineWidth: 1.2))
                Circle().fill(has && inMonth ? t.mut2 : Color.clear).frame(width: 3, height: 3)
            }
            .frame(height: 30)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .dropDestination(for: String.self) { (items: [String], _: CGPoint) -> Bool in KalPad42Drop.drop(items, day: k) }
        .accessibilityLabel(KalD.fd(day))
    }
}

/* ---------- Tastatur (Magic Keyboard / Smart Keyboard) ---------- */

/// Samme hurtigtaster som Mac/web. Knappene er usynlige, men ligger i hierarkiet, så de vises i ⌘-oversikten
/// (discoverability-tittel = knappens tekst). Bokstav- og piltastene er av mens man skriver eller har et ark åpent.
struct KalPad42Keys: View {
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        let busy: Bool = KalPad42Keys.busy
        let open: Bool = KalPad42Keys.anyOpen
        ZStack {
            Group {
                key("Forrige periode", .leftArrow, []) { s.step(-1) }.disabled(busy || s.view == "liste")
                key("Neste periode", .rightArrow, []) { s.step(1) }.disabled(busy || s.view == "liste")
                key("I dag", "t", []) { s.goToday() }.disabled(busy)
                key("Dag", "d", []) { s.go(view: "dag") }.disabled(busy)
                key("Tre dager", "3", []) { s.go(view: "3d") }.disabled(busy)
                key("Uke", "w", []) { s.go(view: "uke") }.disabled(busy)
                key("Måned", "m", []) { s.go(view: "mnd") }.disabled(busy)
            }
            Group {
                key("År", "y", []) { s.go(view: "ar") }.disabled(busy)
                key("Liste", "l", []) { s.go(view: "liste") }.disabled(busy)
                key("Ny hendelse", "n", .command) {
                    KalPad42Keys.closeAll()
                    s.openNew()
                }
                key("Søk", "f", .command) { KalPad42Keys.openSearch() }
                key("Glimt", "k", .command) {
                    KalPad42Keys.closeAll()
                    s.glimtOpen = true
                }
                key("Lukk", .escape, []) { KalPad42Keys.closeTop() }.disabled(!open && !KalPad42Model.shared.overlayOpen)
            }
        }
        .frame(width: 0, height: 0)
        .opacity(0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func key(_ title: String, _ k: KeyEquivalent, _ mods: EventModifiers, _ action: @escaping () -> Void) -> some View {
        Button(title, action: action).keyboardShortcut(k, modifiers: mods)
    }

    /// Et tekstfelt har fokus eller et ark/panel ligger over visningen.
    @MainActor static var busy: Bool { KalComposerModel.shared.focused || anyOpen }

    @MainActor static var anyOpen: Bool {
        let s: KalStore = KalStore.shared
        return s.searchOpen || s.newForm != nil || s.glimtOpen || s.settingsOpen || s.cals39Open || s.cal39Edit != nil
            || s.cal39AddOpen || s.gmap39Open || s.detId != nil || s.drawerOpen
    }

    @MainActor static func openSearch() {
        let s: KalStore = KalStore.shared
        closeAll()
        s.query = ""
        s.searchCal = nil
        withAnimation(.easeOut(duration: 0.2)) { s.searchOpen = true }
    }

    /// Esc lukker det øverste arket.
    @MainActor static func closeTop() {
        let s: KalStore = KalStore.shared
        withAnimation(.easeOut(duration: 0.22)) {
            if s.gmap39Open { s.gmap39Open = false }
            else if s.cal39AddOpen { s.cal39AddOpen = false }
            else if s.cal39Edit != nil { s.cal39Edit = nil }
            else if s.cals39Open { s.closeCals39() }
            else if s.settingsOpen { s.settingsOpen = false }
            else if s.drawerOpen { s.drawerOpen = false }
            else if s.newForm != nil { s.newForm = nil }
            else if s.detId != nil { s.detId = nil }
            else if s.glimtOpen { KalGlimtModel.shared.finishAll(); s.glimtOpen = false }
            else if s.searchOpen { s.searchOpen = false }
            else if KalPad42Model.shared.overlayOpen { KalPad42Model.shared.overlayOpen = false }
        }
    }

    @MainActor static func closeAll() {
        let s: KalStore = KalStore.shared
        s.detId = nil
        s.searchOpen = false
        s.drawerOpen = false
        KalPad42Model.shared.overlayOpen = false
    }
}

/* ---------- Dra og slipp mellom apper ---------- */

enum KalPad42Drop {
    /// Tekst, e-post eller SMS sluppet på en dag: kort tekst tolkes lokalt og legges på dagen, lang tekst går til Glimt.
    @MainActor static func drop(_ items: [String], day: String) -> Bool {
        let text: String = items.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return false }
        let s: KalStore = KalStore.shared
        KalHaptic.done()
        if !text.contains("\n") && text.count <= 90 && !KalQuick.isQuestion(text) {
            var p: KalParsed = KalQuick.parse(text, defaultRem: s.defRem)
            p.day = day
            withAnimation(.easeOut(duration: 0.2)) { s.anchor = day }
            Task { await s.add(p, toastPrefix: "Glimt la til") }
            return true
        }
        let when: String = KalD.fd(KalD.date(day)) + " (" + day + ")"
        KalGlimtModel.shared.send("Lag en hendelse av teksten under. Den ble sluppet på " + when + ", så bruk den dagen hvis teksten ikke sier noe annet.\n\n" + text)
        return true
    }
}
