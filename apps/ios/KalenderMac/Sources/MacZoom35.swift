import SwiftUI
import AppKit

/* ---------------- Prompt 35: Kalender for Mac – zoom mellom visningene ---------------- */
// Kjeden År → Måned → Uke → 3 dager → Dag (og tilbake). Klikk på en måned i År → Måned, på en dag i Måned → Uke,
// på et kolonnehode i Uke → 3 dager, i 3 dager → Dag. Klikk på tittelen zoomer ut. ctrl + hjul eller pinch på styreflaten
// zoomer inn/ut fra punktet under pekeren. Den nye visningen vokser fra punktet (scale .55 → 1 inn, 1.6 → 1 ut, 0,38 s).

@MainActor
enum MacZoom35 {
    static let order: [String] = ["ar", "mnd", "uke", "3d", "dag", "liste"]
    static let outOf: [String: String] = ["dag": "3d", "3d": "uke", "uke": "mnd", "mnd": "ar", "ar": "ar", "liste": "mnd"]

    private static var monitor: Any? = nil
    private static var acc: CGFloat = 0
    private static var lastEvent: Date = .distantPast
    private static var lastFire: Date = .distantPast

    static func install() {
        if monitor != nil { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .magnify]) { (ev: NSEvent) -> NSEvent? in
            MacZoom35.handle(ev) ? nil : ev
        }
    }

    static func handle(_ ev: NSEvent) -> Bool {
        var delta: CGFloat = 0
        if ev.type == .magnify {
            delta = ev.magnification
        } else if ev.type == .scrollWheel && ev.modifierFlags.contains(.control) {
            let f: CGFloat = ev.hasPreciseScrollingDeltas ? 0.006 : 0.08
            delta = ev.scrollingDeltaY * f
        } else {
            return false
        }
        guard let nsw = ev.window, let w = MacWin.all.first(where: { (x: MacWin) -> Bool in x.window === nsw }) else { return false }
        // Prompt 38: web-kalenderen zoomer selv (klyp / ctrl + hjul).
        if w.webOn { return false }
        if w.modal { return false }
        let now: Date = Date()
        if now.timeIntervalSince(lastEvent) > 0.6 { acc = 0 }
        lastEvent = now
        acc += delta
        let ended: Bool = ev.type == .magnify && (ev.phase == .ended || ev.phase == .cancelled)
        if now.timeIntervalSince(lastFire) < 0.45 {
            if ended { acc = 0 }
            return true
        }
        let p: UnitPoint = unitPoint(ev, nsw, sidebar: w.sidebar)
        if acc > 0.22 {
            acc = 0
            lastFire = now
            w.zoomInAt(p)
        } else if acc < -0.18 {
            acc = 0
            lastFire = now
            w.zoomOutStep(p)
        }
        if ended { acc = 0 }
        return true
    }

    /// Pekerens plass i visningsområdet (til høyre for sidemenyen, under verktøylinja), 0…1.
    private static func unitPoint(_ ev: NSEvent, _ w: NSWindow, sidebar: Bool) -> UnitPoint {
        let size: CGSize = w.contentView?.bounds.size ?? w.frame.size
        let left: CGFloat = sidebar ? 253 : 0
        let top: CGFloat = 96
        let loc: CGPoint = ev.locationInWindow
        let wW: CGFloat = Swift.max(1, size.width - left)
        let wH: CGFloat = Swift.max(1, size.height - top)
        let x: CGFloat = (loc.x - left) / wW
        let y: CGFloat = (size.height - top - loc.y) / wH
        return UnitPoint(x: clamp(x), y: clamp(y))
    }

    static func clamp(_ v: CGFloat) -> CGFloat { Swift.max(0, Swift.min(0.999, v)) }
}

extension MacWin {
    func zoomTo(_ v: String, day: String?, origin: UnitPoint, inward: Bool) {
        let same: Bool = v == view && (day == nil || day == anchor)
        if same { return }
        zoomOrigin = origin
        zoomInward = inward
        let reduce: Bool = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let anim: Animation = reduce ? Animation.easeOut(duration: 0.18) : Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.38)
        withAnimation(anim) {
            view = v
            if let day { anchor = day } else if v == "liste" { anchor = KalD.todayKey() }
        }
        miniMonth = KalD.firstOfMonth(KalD.date(anchor))
        NSHapticFeedbackManager.defaultPerformer.perform(.levelChange, performanceTime: .now)
        load()
    }

    /// Klyp sammen / klikk på tittelen: Dag → 3 dager → Uke → Måned → År.
    func zoomOutStep(_ origin: UnitPoint) {
        let to: String = MacZoom35.outOf[view] ?? "mnd"
        if to == view { return }
        zoomTo(to, day: view == "liste" ? KalD.todayKey() : nil, origin: origin, inward: false)
    }

    func zoomInAt(_ p: UnitPoint) {
        let A: Date = KalD.date(anchor)
        let x: CGFloat = MacZoom35.clamp(p.x)
        let y: CGFloat = MacZoom35.clamp(p.y)
        switch view {
        case "ar":
            let m: Int = Swift.min(12, Int(y * 3) * 4 + Int(x * 4) + 1)
            if let d = KalQuick.makeDate(KalD.year(A), m, 1) { zoomTo("mnd", day: KalD.key(d), origin: p, inward: true) }
        case "mnd":
            let start: Date = KalWeek35.start(KalD.firstOfMonth(A))
            let row: Int = Swift.min(5, Int(y * 6))
            let col: Int = Swift.min(6, Int(x * 7))
            zoomTo("uke", day: KalD.key(KalD.add(start, row * 7 + col)), origin: p, inward: true)
        case "uke":
            let col: Int = Swift.min(6, Int(x * 7))
            zoomTo("3d", day: KalD.key(KalD.add(KalWeek35.start(A), col)), origin: p, inward: true)
        case "3d":
            let col: Int = Swift.min(2, Int(x * 3))
            zoomTo("dag", day: KalD.key(KalD.add(A, col)), origin: p, inward: true)
        default:
            break
        }
    }
}
