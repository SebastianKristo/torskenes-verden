import SwiftUI
import AppKit

/* ---------------- Prompt 34: Kalender for Mac – tilstanden i ett vindu ---------------- */
// Hvert vindu (⇧⌘N) har sin egen visning, dato, søk, Glimt-panel og ark. Menyene (Vis, Gå, Arkiv) virker på vinduet i fokus
// (focusedSceneObject), og tastatursnarveiene (D 3 W M L T, piler, N, /) går til nøkkelvinduet via MacKeys.

@MainActor
final class MacWin: ObservableObject {
    /// Alle åpne vinduer (svake referanser via window), så tastaturet og menylinja finner det i fokus.
    static var all: [MacWin] = []

    static var key: MacWin? {
        let kw: NSWindow? = NSApp.keyWindow
        if let w = all.first(where: { (x: MacWin) -> Bool in x.window != nil && x.window === kw }) { return w }
        return all.first { (x: MacWin) -> Bool in x.window?.isVisible ?? false }
    }

    weak var window: NSWindow? = nil

    /// dag | 3d | uke | mnd | ar | liste
    /// Prompt 35: Innstillinger → «Åpne i» (ellers siste brukte).
    @Published var view: String = UserDefaults.standard.string(forKey: "mac.openView") ?? UserDefaults.standard.string(forKey: "mac.view") ?? "mnd" {
        didSet { UserDefaults.standard.set(view, forKey: "mac.view") }
    }
    @Published var anchor: String = KalD.todayKey()
    @Published var sidebar: Bool = (UserDefaults.standard.object(forKey: "mac.side") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(sidebar, forKey: "mac.side") }
    }
    /// Minikalenderen i sidemenyen viser denne måneden.
    @Published var miniMonth: Date = KalD.firstOfMonth(Date())

    @Published var searchOpen: Bool = false
    @Published var glimtOpen: Bool = false
    @Published var detId: String? = nil
    /// Hendelse fra Glimt/lenke som ikke finnes i bufferen.
    @Published var linkEvent: KalEvent? = nil
    @Published var newForm: MacNewForm? = nil
    /// «✦ Skriv time»: Glimt-skrivefeltet.
    @Published var quickOpen: Bool = false
    @Published var gotoOpen: Bool = false
    /// Arkiv → Ny kalender … / «Administrer kalendere ›».
    @Published var newCalOpen: Bool = false
    /// Prompt 35: zoom mellom visningene – punktet den nye visningen vokser fra og retningen.
    @Published var zoomOrigin: UnitPoint = .center
    @Published var zoomInward: Bool = true
    /// Prompt 35: «+ Legg til kalender» (iCal / Home Assistant / Konto).
    @Published var addCalOpen: Bool = false

    init() {
        MacWin.all.append(self)
    }

    func forget() {
        MacWin.all.removeAll { (x: MacWin) -> Bool in x === self }
    }

    /// true når et ark eller panel er oppe (ingen tastatursnarveier da).
    var modal: Bool { searchOpen || glimtOpen || detId != nil || newForm != nil || quickOpen || gotoOpen }

    func closeAll() {
        searchOpen = false
        glimtOpen = false
        detId = nil
        linkEvent = nil
        newForm = nil
        quickOpen = false
        gotoOpen = false
    }

    /* ---------- Navigering ---------- */

    /// Prompt 35: fanene bruker samme zoom-animasjon (retning etter rekkefølgen År … Dag).
    func go(view v: String, day: String? = nil) {
        let order: [String] = MacZoom35.order
        let a: Int = order.firstIndex(of: view) ?? 0
        let b: Int = order.firstIndex(of: v) ?? 0
        zoomTo(v, day: day, origin: .center, inward: b >= a)
    }

    func step(_ dir: Int) {
        let A: Date = KalD.date(anchor)
        let n: Date
        switch view {
        case "mnd", "liste": n = KalD.addMonths(KalD.firstOfMonth(A), dir)
        case "ar": n = KalD.addMonths(KalD.firstOfMonth(A), dir * 12)
        case "uke": n = KalD.add(A, dir * 7)
        case "3d": n = KalD.add(A, dir * 3)
        default: n = KalD.add(A, dir)
        }
        withAnimation(.easeOut(duration: 0.18)) { anchor = KalD.key(n) }
        miniMonth = KalD.firstOfMonth(n)
        load()
    }

    func goToday() {
        withAnimation(.easeOut(duration: 0.18)) { anchor = KalD.todayKey() }
        miniMonth = KalD.firstOfMonth(Date())
    }

    func goTo(_ d: Date) {
        anchor = KalD.key(d)
        miniMonth = KalD.firstOfMonth(d)
        if view == "liste" || view == "ar" { view = "dag" }
        load()
    }

    var isToday: Bool {
        let tk: String = KalD.todayKey()
        let A: Date = KalD.date(anchor)
        switch view {
        case "mnd": return KalD.key(KalD.firstOfMonth(A)) == KalD.key(KalD.firstOfMonth(Date()))
        case "ar": return KalD.year(A) == KalD.year(Date())
        case "uke": return KalD.key(KalWeek35.start(A)) == KalD.key(KalWeek35.start(Date()))
        case "liste": return true
        default: return anchor == tk
        }
    }

    func load() {
        let a: String = anchor
        Task { await MacStore.shared.load(around: a) }
    }

    func openDetail(_ e: KalEvent) {
        if MacStore.shared.event(e.id) == nil { linkEvent = e }
        detId = e.id
    }

    func detailEvent() -> KalEvent? {
        guard let id = detId else { return nil }
        if let e = MacStore.shared.event(id) { return e }
        if let l = linkEvent, l.id == id { return l }
        return nil
    }

    func openNew(day: String? = nil, s: Int? = nil, e: Int? = nil) {
        let tk: String = KalD.todayKey()
        var base: String = (view == "mnd" || view == "ar" || view == "liste") ? tk : anchor
        if let day { base = day }
        newForm = MacStore.shared.makeForm(day: base, s: s, e: e)
    }

    func saveNew(_ f: MacNewForm) {
        newForm = nil
        if let day = MacStore.shared.saveNew(f) {
            anchor = day
            miniMonth = KalD.firstOfMonth(KalD.date(day))
        }
    }

    /// Tittelen i verktøylinja: «Oktober», «19.–25. okt», «Mandag 19. oktober».
    var title: String {
        let A: Date = KalD.date(anchor)
        switch view {
        case "ar": return String(KalD.year(A))
        case "mnd", "liste": return KalD.cap(KalD.months[KalD.month(A) - 1])
        case "uke":
            let m: Date = KalWeek35.start(A)
            return MacWin.range(m, KalD.add(m, 6))
        case "3d": return MacWin.range(A, KalD.add(A, 2))
        default: return KalD.cap(KalD.fd(A))
        }
    }

    var subtitle: String {
        let A: Date = KalD.date(anchor)
        if view == "ar" { return "" }
        if view == "uke" || view == "dag" || view == "3d" {
            let wk: Int = KalWeek35.weekNo(KalWeek35.start(A))
            return "UKE " + String(wk) + " · " + String(KalD.year(A))
        }
        return String(KalD.year(A))
    }

    static func range(_ a: Date, _ b: Date) -> String {
        let ma: Int = KalD.month(a)
        let mb: Int = KalD.month(b)
        let da: String = String(KalD.dayOfMonth(a))
        let db: String = String(KalD.dayOfMonth(b))
        if ma == mb { return da + ".–" + db + ". " + KalD.monthsShort[mb - 1] }
        return da + ". " + KalD.monthsShort[ma - 1] + " – " + db + ". " + KalD.monthsShort[mb - 1]
    }
}

/// Vinduet i fokus for menyene (Commands). Ikke @FocusedObject: da bygges alle menyene (og scene-lista) på nytt ved hver
/// @Published-endring i vinduet (hover, zoom, minikalender …), som på macOS 26/27 kan gå i løkke med AppKit-vinduskontrolleren.
/// Her endres verdien bare når fokusvinduet eller «ark/panel oppe» endres.
struct MacWinFocus: Equatable {
    let win: MacWin
    let modal: Bool

    static func == (a: MacWinFocus, b: MacWinFocus) -> Bool { a.win === b.win && a.modal == b.modal }
}

struct MacWinFocusKey: FocusedValueKey {
    typealias Value = MacWinFocus
}

extension FocusedValues {
    var macWin: MacWinFocus? {
        get { self[MacWinFocusKey.self] }
        set { self[MacWinFocusKey.self] = newValue }
    }
}

/// Henter NSWindow-en til et SwiftUI-vindu (for MacWin.window og vindusutseendet).
struct MacWindowReader: NSViewRepresentable {
    let onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let v: NSView = NSView()
        DispatchQueue.main.async {
            if let w = v.window { onWindow(w) }
        }
        return v
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        // Bare når vinduet er et annet enn sist (ellers ny oppdatering for hver tegning).
        guard let w = nsView.window, context.coordinator.last !== w else { return }
        context.coordinator.last = w
        DispatchQueue.main.async { onWindow(w) }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        weak var last: NSWindow? = nil
    }
}
