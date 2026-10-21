import SwiftUI
import AppKit

/* ---------------- Prompt 34: Kalender for Mac – vinduet (samme layout som web: Kalender.dc.html variant web, full) ---------------- */
// Verktøylinje (tittel, ‹ ›, visninger, søk, i dag, ✦ Skriv time, + Ny hendelse), «NESTE»-banner, sidemeny (252 pt) og visning.
// Ark og paneler ligger over vinduet med ensfarget demping rgba(20,18,14,.46) – ingen blur (flimret på web).

/// Velger tokens etter systemets utseende (NSApp.appearance settes fra Innstillinger → Utseende).
struct MacThemed<Content: View>: View {
    @Environment(\.colorScheme) private var cs
    let content: () -> Content

    var body: some View {
        content().environment(\.mk, cs == .dark ? MacTheme.darkTheme : MacTheme.light)
    }
}

struct MacMainWindow: View {
    @StateObject private var win: MacWin = MacWin()
    /// Prompt 38: web-kalenderen i dette vinduet (WKWebView mot <server>/kalender?app=mac).
    @StateObject private var web: MacWeb38Model = MacWeb38Model()
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        MacThemed { MacRoot(win: win, web: web) }
            .frame(minWidth: 980, minHeight: 640)
            .focusedSceneValue(\.macWin, MacWinFocus(win: win, modal: win.modal, web: web.active))
            .onAppear {
                MacApp.opener = openWindow
                if win.web38 !== web { win.web38 = web }
                if !MacWin.all.contains(where: { (x: MacWin) -> Bool in x === win }) { MacWin.all.append(win) }
                // Prompt 43: menylinja/varselet ba om noe (åpne en hendelse, Glimt) før vinduet fantes.
                if let p = MacApp.pending43 {
                    MacApp.pending43 = nil
                    let w: MacWin = win
                    DispatchQueue.main.async { p(w) }
                }
            }
            .onDisappear { win.forget() }
    }
}

struct MacRoot: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var web: MacWeb38Model
    @ObservedObject var store: MacStore = MacStore.shared

    var body: some View {
        ZStack {
            t.bg
            if store.loggedIn {
                // Prompt 39: den innebygde kalenderen er standard; web-kalenderen (prompt 38) bare når valget er slått på.
                if store.useWeb38 && web.phase != .failed {
                    MacWeb38Host(model: web)
                } else {
                    main
                    overlays
                }
            } else {
                // Prompt 41: innlogging uten serveradresse (Fortsett som · Homelab-appen/web · passord).
                MacLogin41View()
            }
        }
        .background(MacWindowReader { (w: NSWindow) in attach(w) })
        .onChange(of: store.theme) { (_: String) in
            // Nytt tema: vindusbakgrunnen følger etter systemutseendet er byttet.
            DispatchQueue.main.async { if let w = win.window { attach(w) } }
        }
        .onOpenURL { (url: URL) in MacLinks.handle(url, win: win) }
        .animation(.easeOut(duration: 0.18), value: win.modal)
        .animation(.easeOut(duration: 0.2), value: store.toast)
    }

    /// Setter vindusegenskapene bare når de faktisk endres – hver endring av NSWindow utløser en ny SwiftUI-oppdatering.
    private func attach(_ w: NSWindow) {
        if win.window !== w { win.window = w }
        if w.title != "Kalender" { w.title = "Kalender" }
        if !w.titlebarAppearsTransparent { w.titlebarAppearsTransparent = true }
        if w.titleVisibility != .visible { w.titleVisibility = .visible }
        let bg: NSColor = NSColor(t.bar)
        if w.backgroundColor != bg { w.backgroundColor = bg }
        if w.isMovableByWindowBackground { w.isMovableByWindowBackground = false }
        if w.tabbingMode != .automatic { w.tabbingMode = .automatic }
    }

    private var main: some View {
        VStack(spacing: 0) {
            if store.useWeb38 && web.phase == .failed { MacWeb38Banner(model: web) }
            MacOffline43()
            MacToolbar(win: win)
            MacNextBanner(win: win)
            Rectangle().fill(t.line).frame(height: 1)
            HStack(spacing: 0) {
                if win.sidebar {
                    MacSidebar(win: win)
                        .frame(width: 252)
                        .transition(.move(edge: .leading).combined(with: .opacity))
                    Rectangle().fill(t.line).frame(width: 1)
                }
                // Prompt 35: zoom – den nye visningen vokser fra punktet man klikket/klypte. «Uken starter» bygger alt på nytt.
                ZStack {
                    content
                        .id(win.view + "|" + store.weekStart)
                        .transition(zoomTransition)
                }
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
            }
        }
        .overlay(alignment: .bottom) { toastView }
        .sheet(isPresented: $win.newCalOpen) { MacThemed { MacNewCalendarSheet(open: $win.newCalOpen) } }
        .sheet(isPresented: $win.addCalOpen) { MacThemed { MacAddCal35Sheet(open: $win.addCalOpen) } }
        .sheet(isPresented: $win.gmap39Open) { MacThemed { MacGoogleMap39Sheet(open: $win.gmap39Open) } }
    }

    private var zoomTransition: AnyTransition {
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { return AnyTransition.opacity }
        let from: CGFloat = win.zoomInward ? 0.55 : 1.6
        let ins: AnyTransition = AnyTransition.scale(scale: from, anchor: win.zoomOrigin).combined(with: .opacity)
        return AnyTransition.asymmetric(insertion: ins, removal: .opacity)
    }

    @ViewBuilder private var content: some View {
        switch win.view {
        case "ar": MacYearView(win: win)
        case "uke", "3d", "dag": MacGridView(win: win)
        case "liste": MacListView(win: win)
        default: MacMonthView(win: win)
        }
    }

    @ViewBuilder private var toastView: some View {
        if let toast = store.toast {
            MacToastView(toast: toast)
                .padding(.bottom, 18)
                .transition(.opacity.combined(with: .offset(y: 10)))
        }
    }

    @ViewBuilder private var overlays: some View {
        if win.searchOpen {
            MacDim { win.searchOpen = false }
            MacSearchView(win: win)
                .frame(maxHeight: .infinity, alignment: .top)
                .padding(.top, 70)
                .transition(.opacity.combined(with: .offset(y: -8)))
        }
        if win.glimtOpen {
            MacDim {
                MacGlimtModel.shared.finishAll()
                win.glimtOpen = false
            }
            MacGlimtPanel(win: win)
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
        }
        if win.quickOpen {
            MacDim { win.quickOpen = false }
            MacQuickSheet(win: win)
                .frame(maxHeight: .infinity, alignment: .top)
                .padding(.top, 90)
                .transition(.opacity)
        }
        if let e = win.detailEvent() {
            MacDim { win.detId = nil }
            MacDetailSheet(e: e, win: win)
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
        }
        if let f = win.newForm {
            MacDim { win.newForm = nil }
            MacNewSheet(form: f, win: win)
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
        }
        if win.gotoOpen {
            MacDim { win.gotoOpen = false }
            MacGotoSheet(win: win)
                .transition(.opacity)
        }
    }
}

/// Bakteppet: ensfarget demping med eget lag (ingen blur).
struct MacDim: View {
    @Environment(\.mk) private var t
    let close: () -> Void

    var body: some View {
        t.dim
            .contentShape(Rectangle())
            .onTapGesture { withAnimation(.easeOut(duration: 0.18)) { close() } }
            .drawingGroup()
            .transition(.opacity)
            .accessibilityLabel("Lukk")
    }
}

struct MacToastView: View {
    @Environment(\.mk) private var t
    let toast: MacToast

    var body: some View {
        HStack(spacing: 12) {
            Text(toast.text).font(MacFont.ui(13, .semibold)).foregroundColor(t.bg).lineLimit(1)
            if !toast.undoId.isEmpty {
                Button(action: {
                    MacStore.shared.undo(toast.undoId)
                    withAnimation(.easeOut(duration: 0.2)) { MacStore.shared.toast = nil }
                }) {
                    Text("Angre").font(MacFont.ui(12, .bold)).foregroundColor(t.ink)
                        .padding(.horizontal, 12).frame(height: 26)
                        .background(Capsule().fill(t.bg))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 16).padding(.trailing, 8)
        .frame(height: 40)
        .background(Capsule().fill(t.ink))
        .shadow(color: Color.black.opacity(0.25), radius: 14, y: 8)
    }
}

/* ---------- Verktøylinja ---------- */

struct MacToolbar: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    static let views: [MacViewTab] = [
        MacViewTab(id: "dag", name: "Dag", key: "⌘1"),
        MacViewTab(id: "3d", name: "3 dager", key: "⌘2"),
        MacViewTab(id: "uke", name: "Uke", key: "⌘3"),
        MacViewTab(id: "mnd", name: "Måned", key: "⌘4"),
        MacViewTab(id: "ar", name: "År", key: "⌘5"),
        MacViewTab(id: "liste", name: "Liste", key: "⌘6"),
    ]

    var body: some View {
        HStack(spacing: 8) {
            MacIconButton(symbol: "sidebar.left", label: "Vis/skjul sidemeny (⌥⌘S)", bordered: false) {
                withAnimation(.easeOut(duration: 0.2)) { win.sidebar.toggle() }
            }
            titleBlock
            Spacer(minLength: 8)
            if store.loading { ProgressView().controlSize(.small).padding(.trailing, 4) }
            MacIconButton(symbol: "chevron.left", label: "Forrige (⌘←)") { win.step(-1) }
            MacIconButton(symbol: "chevron.right", label: "Neste (⌘→)") { win.step(1) }
            tabs
            MacIconButton(symbol: "magnifyingglass", label: "Søk (⌘F)", bordered: false) { win.searchOpen = true }
            todayButton
            quickButton
            newButton
        }
        .padding(.horizontal, 14)
        .frame(height: 58)
    }

    private var titleBlock: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(win.title).font(MacFont.serif(28)).foregroundColor(t.ink).lineLimit(1)
            Text(win.subtitle).font(MacFont.mono(11)).tracking(1).foregroundColor(t.acc).lineLimit(1)
        }
        .contentShape(Rectangle())
        .onTapGesture { zoomOut() }
        .help("Zoom ut")
    }

    /// Prompt 35: Dag → 3 dager → Uke → Måned → År.
    private func zoomOut() {
        win.zoomOutStep(.center)
    }

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach(MacToolbar.views) { (v: MacViewTab) in
                MacTab(title: v.name, on: win.view == v.id) { win.go(view: v.id) }
                    .help(v.name + " (" + v.key + ")")
            }
        }
        .padding(3)
        .background(Capsule().fill(t.chip))
    }

    private var todayButton: some View {
        Button(action: { win.goToday() }) {
            ZStack {
                Image(systemName: "calendar").font(.system(size: 19, weight: .regular)).foregroundColor(t.ink)
                Text(String(KalD.dayOfMonth(Date()))).font(MacFont.ui(8.5, .heavy)).foregroundColor(t.ink).offset(y: 2.5)
            }
            .frame(width: 34, height: 34)
            .overlay(alignment: .topTrailing) {
                if !win.isToday { Circle().fill(t.red).frame(width: 7, height: 7).offset(x: -3, y: 4) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("I dag (⌘T)")
        .accessibilityLabel("I dag")
    }

    /// Prompt 43: Glimt-orben (samme som «GLIMT · DAGEN DIN», 20 pt, 8 pt luft) i stedet for «✦». Lys pille som før.
    /// Orben roterer sakte, raskere mens skrivefeltet er åpent (Glimt tolker).
    private var quickButton: some View {
        Button(action: { win.quickOpen = true }) {
            HStack(spacing: 8) {
                MacSpark(size: 20, fast: win.quickOpen)
                Text("Skriv time").font(MacFont.ui(13, .bold)).foregroundColor(t.ink)
            }
            .padding(.leading, 8).padding(.trailing, 14).frame(height: 40)
            .background(Capsule().fill(t.card))
            .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .help("Skriv en hendelse med vanlige ord – Glimt fyller ut")
    }

    private var newButton: some View {
        MacNewButton43 { win.openNew() }
            .help("Ny hendelse (⌘N)")
    }
}

/// Prompt 43: «+ Ny hendelse» i rødt (lab #b23a2a, mørkt tema #cf5540), hvit tekst, ingen kant, 40 pt høy, 16 pt sidepolstring.
/// Hover: 8 % mørkere.
struct MacNewButton43: View {
    @Environment(\.mk) private var t
    let action: () -> Void
    @State private var hover: Bool = false

    var body: some View {
        let base: Color = t.dark ? Color(kalHex: "#cf5540") : Color(kalHex: "#b23a2a")
        Button(action: action) {
            Text("+ Ny hendelse").font(MacFont.ui(13, .bold)).foregroundColor(Color.white)
                .padding(.horizontal, 16).frame(height: 40)
                .background(Capsule().fill(base))
                .overlay(Capsule().fill(Color.black.opacity(hover ? 0.08 : 0)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { (h: Bool) in hover = h }
    }
}

/// Prompt 43: uten kontakt med serveren – lagret kalender vises, ingen frysing.
struct MacOffline43: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared

    var body: some View {
        if store.offline43 {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash").font(.system(size: 12, weight: .semibold)).foregroundColor(t.mut)
                Text("Ikke tilkoblet " + store.host43 + " · viser lagret kalender").font(MacFont.ui(12.5, .semibold)).foregroundColor(t.ink2)
                Spacer()
                Button("Prøv igjen") { Task { await store.load(force: true) } }
                    .buttonStyle(.plain).font(MacFont.ui(12, .bold)).foregroundColor(t.acc)
            }
            .padding(.horizontal, 16).frame(height: 30)
            .background(t.chip)
        }
    }
}

struct MacViewTab: Identifiable {
    let id: String
    let name: String
    let key: String
}

struct MacTab: View {
    @Environment(\.mk) private var t
    let title: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(12.5, .bold))
                .foregroundColor(on ? t.bg : t.ink)
                .padding(.horizontal, 11)
                .frame(height: 28)
                .background(Capsule().fill(on ? t.ink : Color.clear))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- «NESTE» / «NÅ» ---------- */

struct MacNextBanner: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    var body: some View {
        if let e = store.nextTimed() {
            bannerFor(e)
        }
    }

    private func bannerFor(_ e: KalEvent) -> some View {
        let tk: String = KalD.todayKey()
        let nm: Int = KalD.minutesNow()
        let days: Int = KalD.daysBetween(tk, e.day)
        let startAbs: Int = days * 1440 + e.startMin
        let endAbs: Int = days * 1440 + e.endMin
        let now: Bool = startAbs <= nm && endAbs > nm
        let c: KalCal? = KalFag37.tint(store.cal(e.cal), e)
        let dayText: String = days == 0 ? "i dag" : (days == 1 ? "i morgen" : KalD.fd(KalD.date(e.day)))
        let tm: String = KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
        var big: String = KalD.cap(KalD.weekdaysShort[KalD.wd(KalD.date(e.day))])
        var small: String = KalD.hm(e.startMin)
        if now {
            big = MacNextBanner.dur(endAbs - nm)
            small = "igjen"
        } else if startAbs - nm < 1440 {
            big = MacNextBanner.dur(startAbs - nm)
            small = "til start"
        }
        let pct: Double = now ? Double(nm - startAbs) / Double(Swift.max(1, endAbs - startAbs)) : 0
        return Button(action: { win.anchor = e.day; win.openDetail(e) }) {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 3).fill(t.calColor(c)).frame(width: 5, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(now ? "NÅ" : "NESTE").font(MacFont.mono(10.5)).tracking(1.2).foregroundColor(t.acc)
                        Text(tm + " · " + dayText).font(MacFont.mono(10.5)).foregroundColor(t.mut)
                    }
                    HStack(spacing: 8) {
                        Text(e.title).font(MacFont.ui(15, .bold)).foregroundColor(t.ink).lineLimit(1)
                        if !e.loc.isEmpty { Text(e.loc).font(MacFont.ui(13)).foregroundColor(t.mut).lineLimit(1) }
                    }
                }
                Spacer(minLength: 10)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(big).font(MacFont.ui(15, .heavy)).foregroundColor(t.ink)
                    Text(small).font(MacFont.ui(11.5)).foregroundColor(t.mut)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
            .overlay(alignment: .bottomLeading) { progress(pct, now) }
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
    }

    @ViewBuilder private func progress(_ pct: Double, _ now: Bool) -> some View {
        if now {
            GeometryReader { (g: GeometryProxy) in
                Rectangle().fill(t.red).frame(width: g.size.width * CGFloat(pct), height: 3)
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
        }
    }

    static func dur(_ x: Int) -> String {
        if x < 60 { return String(x) + " min" }
        let h: Int = x / 60
        let m: Int = x % 60
        return m == 0 ? String(h) + " t" : String(h) + " t " + String(m) + " min"
    }
}
