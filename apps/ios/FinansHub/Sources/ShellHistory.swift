import SwiftUI
import UIKit

/* ---------------- Skjermbilder og scrollposisjon per side (navigasjonsskallet) ----------------
 Prompt 23, fase 4. Sidene er tilstandsstyrte (paperTab, module, paperFin …), så siden bak i NavigationStack finnes ikke som
 visning. Et skjermbilde (snapshotView, uten ny tegning) tas når brukeren berører skjermen (ShellTouchCapture i AppShell.swift),
 og legges i historikken når ruten skifter. AppShell viser bildet som siden bak under systemets sveip tilbake. Scrollposisjonen
 lagres sammen med bildet og settes tilbake når brukeren går tilbake. Før lå det eget kantsveip her (EdgeSwipeBack); det er
 erstattet av systemets sveip i NavigationStack. */

/* ---------------- Historikk: bilder og scrollposisjon per rute ---------------- */

@MainActor
final class ShellHistory {
    static let shared = ShellHistory()

    struct Entry {
        let key: String
        let snap: UIView?
        let offset: CGPoint?
    }

    private(set) var stack: [Entry] = []
    private var pending: Entry? = nil
    weak var window: UIWindow?
    var currentKey: String = ""
    var swiping: Bool = false

    /// Bildet av siden som ligger under den som vises nå.
    var previousSnapshot: UIView? { stack.last?.snap }

    /// Bildet av en side i historikken (siden bak i NavigationStack), eller nil.
    func snapshot(for key: String) -> UIView? {
        if key.isEmpty { return nil }
        return stack.last(where: { (e: Entry) -> Bool in e.key == key })?.snap
    }

    static func lightTick() {
        guard Haptics.shared.on, Haptics.shared.taps else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private var presenting: Bool { window?.rootViewController?.presentedViewController != nil }

    /// Kalles når en finger treffer skjermen: bildet og scrollposisjonen av siden slik den ser ut nå.
    func capture(key: String) {
        guard !swiping, !presenting, let w = window else { return }
        let snap: UIView? = w.snapshotView(afterScreenUpdates: false)
        let off: CGPoint? = ShellHistory.mainScroll(in: w)?.contentOffset
        pending = Entry(key: key, snap: snap, offset: off)
    }

    /// Ruten skiftet. Finnes den nye ruten i historikken, gikk brukeren tilbake: posisjonen settes tilbake og alt over
    /// den glemmes. Ellers legges forrige side i historikken. Rotsider tømmer historikken.
    func didChange(from old: String, to new: String, root: Bool) {
        currentKey = new
        if let i = stack.lastIndex(where: { $0.key == new }) {
            let e: Entry = stack[i]
            stack.removeSubrange(i...)
            pending = nil
            if let off = e.offset { restore(off) }
            if root { stack.removeAll() }
            return
        }
        if root {
            stack.removeAll()
            pending = nil
            settle(new)
            return
        }
        let prev: Entry
        if let p = pending, p.key == old { prev = p } else { prev = Entry(key: old, snap: nil, offset: nil) }
        stack.append(prev)
        if stack.count > 10 { stack.removeFirst(stack.count - 10) }
        pending = nil
        settle(new)
    }

    /// Navigasjon uten berøring (dyplenker, varsler): bildet tas når den nye siden har lagt seg.
    func settle(_ key: String) {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            guard self.currentKey == key, self.pending?.key != key else { return }
            self.capture(key: key)
        }
    }

    /// Setter scrollposisjonen tilbake på hovedlisten. Prøves noen ganger, fordi lister med lat innlasting
    /// kan være kortere første gang de tegnes.
    private func restore(_ off: CGPoint) {
        Task { @MainActor in
            let waits: [Int] = [20, 110, 300]
            for ms in waits {
                try? await Task.sleep(for: .milliseconds(ms))
                guard let w = self.window, let sv = ShellHistory.mainScroll(in: w) else { continue }
                if sv.isDragging || sv.isTracking || sv.isDecelerating { return }
                let top: CGFloat = -sv.adjustedContentInset.top
                let maxY: CGFloat = Swift.max(top, sv.contentSize.height - sv.bounds.height + sv.adjustedContentInset.bottom)
                let y: CGFloat = Swift.min(Swift.max(off.y, top), maxY)
                if abs(sv.contentOffset.y - y) > 0.5 { sv.setContentOffset(CGPoint(x: sv.contentOffset.x, y: y), animated: false) }
            }
        }
    }

    /// Den største synlige listen som kan scrolles loddrett (ikke karuseller og tekstfelt).
    static func mainScroll(in w: UIWindow) -> UIScrollView? {
        var best: UIScrollView? = nil
        var area: CGFloat = 0
        var queue: [UIView] = [w]
        while !queue.isEmpty {
            let v: UIView = queue.removeLast()
            if v.isHidden || v.alpha < 0.01 { continue }
            if let s = v as? UIScrollView, !(v is UITextView), s.contentSize.height > s.bounds.height + 1 {
                let a: CGFloat = s.bounds.width * s.bounds.height
                let fr: CGRect = s.convert(s.bounds, to: w)
                if a > area && fr.intersects(w.bounds) {
                    best = s
                    area = a
                }
            }
            queue.append(contentsOf: v.subviews)
        }
        return best
    }
}

/// Viser et øyeblikksbilde (UIView fra snapshotView) i SwiftUI.
struct ShellSnapshotHost: UIViewRepresentable {
    let view: UIView

    func makeUIView(context: Context) -> UIView {
        let c = UIView()
        c.isUserInteractionEnabled = false
        c.clipsToBounds = true
        mount(c)
        return c
    }

    func updateUIView(_ c: UIView, context: Context) { mount(c) }

    private func mount(_ c: UIView) {
        if view.superview === c { return }
        for s in c.subviews { s.removeFromSuperview() }
        view.frame.origin = .zero
        c.addSubview(view)
    }
}

