import SwiftUI
import UIKit
import os

/* ---------------- Prompt 37: flytting av kort i wiggle-modus uten krasj ---------------- */
// Fasit: prompts/prompt-37-pakke/claude-code-wiggle-krasj-ios.md (A) og edVals() i design/Mobil Papir App.dc.html.
//
// Den ekte årsaken til krasjen på Hjem: PaperEditableCard brukte `.draggable(key) { content() }`. Forhåndsvisningen
// (drag preview) bygges av UIKit i en egen vertskontroller UTEN miljøet fra appen, så kortene i forhåndsvisningen
// (HomeSearch29, RuterHomeCard27, Cal26HomeCard …) fant ikke `@Environment(Store.self)` – SwiftUI stopper da prosessen med
// «No Observable object of type Store found» i det øyeblikket man begynner å dra. Kortet ble i tillegg bygd to ganger
// (med `.task` og nettverkskall) og en `dropDestination` per kort skrev layout til disk og server for hvert slipp.
//
// Nå: egen gest (kort hold 0,18 s → dra) med @GestureState, ingen forhåndsvisning. Under dra oppdateres bare en levende
// rekkefølge i minnet. Bytte skjer bare når midten av kortet som dras er innenfor midtre 30 % av målkortet, og maks én gang
// per 140 ms. Én gjenbrukt UIImpactFeedbackGenerator (prepare() ved start, lett per bytte). Lagring (UserDefaults + server)
// én gang ved slipp. Scroll er av mens man drar; nær topp/bunn ruller listen ett kort om gangen (auto-scroll).

@MainActor
@Observable
final class Drag37 {
    static let shared = Drag37()

    /// Siden og kortet som dras nå (nil = ingen).
    var page: String? = nil
    var key: String? = nil
    /// Levende rekkefølge mens man drar (bare i minnet).
    var live: [String]? = nil
    /// Forskyvningen til kortet som dras, i forhold til plassen det har i listen nå.
    var offsetY: CGFloat = 0
    /// Økes når listen skal rulle (PaperPage lytter).
    var scrollTick: Int = 0
    @ObservationIgnored var scrollTarget: String = ""
    @ObservationIgnored var scrollTop: Bool = true

    /// Målte rammer per side og kort i stabelens koordinatrom (oppdateres uten å tegne på nytt).
    @ObservationIgnored var frames: [String: [String: CGRect]] = [:]
    /// Toppen av stabelen i scroll-flaten («ppage») og høyden på scroll-flaten, til auto-scroll.
    @ObservationIgnored var stackTop: [String: CGFloat] = [:]
    @ObservationIgnored var viewportH: CGFloat = 700

    @ObservationIgnored private var keys: [String] = []
    @ObservationIgnored private var startMid: CGFloat = 0
    @ObservationIgnored private var shift: CGFloat = 0
    @ObservationIgnored private var lastSwap: Date = .distantPast
    @ObservationIgnored private var lastScroll: Date = .distantPast
    @ObservationIgnored private var dirty: Bool = false
    @ObservationIgnored private var gen: UIImpactFeedbackGenerator? = nil
    /// Prompt 41: når stabelen sist flyttet seg i scroll-flaten (vanlig scroll), og toppen + tiden da fingeren kom ned.
    /// Den ekte årsaken til at sveip flyttet kort i wiggle-modus: LongPressGesture måler bevegelse i kortets eget
    /// koordinatrom. Når ScrollView ruller, følger kortet fingeren, så fingeren «står stille» i forhold til kortet og
    /// trykket ble godkjent etter 0,32 s midt i en vanlig scroll. Da ble kortet løftet, scroll slått av, og kortene gled
    /// oppå hverandre. Nå godkjennes løftet bare hvis stabelen ikke har flyttet seg siden fingeren kom ned.
    @ObservationIgnored var lastScrollAt: Date = .distantPast
    @ObservationIgnored private var downAt: Date = .distantPast
    @ObservationIgnored private var downTop: CGFloat = 0
    @ObservationIgnored private var downKey: String = ""
    /// Kortet der denne berøringen ble avvist (scroll) – resten av gesten ignoreres.
    @ObservationIgnored var rejected: String? = nil
    @ObservationIgnored private var rejectedAt: Date = .distantPast

    static let spacing: CGFloat = 10
    static let swapEvery: TimeInterval = 0.14
    static let band: CGFloat = 0.15
    /// Prompt 41: autoscroll når kortet er innen 80 pt fra topp/bunn.
    static let edge: CGFloat = 80
    /// Logg for wiggle-flytting (Konsoll: kategori «wiggle»), så en eventuell ny feil kan spores.
    static let log: Logger = Logger(subsystem: "no.kristo.finanshub", category: "wiggle")

    static func space(_ page: String) -> String { "drag37-" + page }

    var active: Bool { key != nil }

    func isDragging(_ page: String, _ key: String) -> Bool {
        self.key == key && self.page == page
    }

    /// Lagrer rammen til et kort (kalles fra GeometryReader, tegner ikke på nytt).
    func setFrame(_ page: String, _ key: String, _ r: CGRect) {
        var m: [String: CGRect] = frames[page] ?? [:]
        m[key] = r
        frames[page] = m
    }

    private func begin(_ page: String, _ key: String, _ visible: [String], _ keys: [String]) {
        self.page = page
        self.key = key
        self.keys = keys
        live = visible
        offsetY = 0
        shift = 0
        dirty = false
        lastSwap = .distantPast
        startMid = frames[page]?[key]?.midY ?? 0
        let g: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .light)
        g.prepare()
        gen = g
        if Haptics.shared.on { g.impactOccurred(intensity: 0.7) }
        Drag37.log.debug("løft \(key, privacy: .public) på \(page, privacy: .public)")
    }

    /// Prompt 41: fingeren kom ned på et kort (første fase av gesten).
    func touchDown(_ page: String, _ key: String) {
        if self.key != nil { return }
        downAt = Date()
        downTop = stackTop[page] ?? 0
        downKey = key
        rejected = nil
    }

    /// Prompt 41: stabelen flyttet seg (scroll). Kalles fra Drag37StackTop når ingen kort dras.
    func scrolled(_ page: String, _ y: CGFloat) {
        let old: CGFloat = stackTop[page] ?? y
        stackTop[page] = y
        if key == nil && abs(old - y) > 0.5 { lastScrollAt = Date() }
    }

    /// Prompt 41: true når berøringen var et ekte hold (siden har stått stille siden fingeren kom ned).
    private func mayLift(_ page: String, _ key: String) -> Bool {
        if rejected == key {
            // En avbrutt gest (scroll tok over) melder ikke alltid slutt: glem avvisningen etter 1,5 s.
            if Date().timeIntervalSince(rejectedAt) < 1.5 { return false }
            rejected = nil
        }
        let top: CGFloat = stackTop[page] ?? 0
        let still: Bool
        if downKey == key {
            still = abs(top - downTop) < 3 && lastScrollAt < downAt.addingTimeInterval(0.05)
        } else {
            // Reserve hvis første fase ikke ble meldt: ingen scroll de siste 0,4 s (et hold er minst 0,3 s stille).
            still = Date().timeIntervalSince(lastScrollAt) > 0.4
        }
        if !still {
            rejected = key
            rejectedAt = Date()
            Drag37.log.debug("avvist løft av \(key, privacy: .public): siden scroller")
        }
        return still
    }

    /// Det lange trykket er gjenkjent: kortet løftes.
    func lift(_ page: String, _ key: String, _ visible: [String], _ keys: [String]) {
        if self.key == nil && mayLift(page, key) { begin(page, key, visible, keys) }
    }

    /// Et nytt punkt fra gesten. `location` og `dy` er i stabelens koordinatrom.
    func move(_ page: String, _ key: String, _ visible: [String], _ keys: [String], _ location: CGPoint, _ dy: CGFloat) {
        if self.key == nil {
            guard mayLift(page, key) else { return }
            begin(page, key, visible, keys)
        }
        guard self.key == key, self.page == page else { return }
        offsetY = dy - shift
        swapIfNeeded(page, key, dy)
        autoScroll(page, key, location)
    }

    private func swapIfNeeded(_ page: String, _ key: String, _ dy: CGFloat) {
        let now: Date = Date()
        if now.timeIntervalSince(lastSwap) < Drag37.swapEvery { return }
        guard var order = live, let i = order.firstIndex(of: key) else { return }
        let fr: [String: CGRect] = frames[page] ?? [:]
        let center: CGFloat = startMid + dy
        var target: String? = nil
        for k in order where k != key {
            guard let f = fr[k], f.height > 1 else { continue }
            if abs(center - f.midY) <= f.height * Drag37.band { target = k; break }
        }
        guard let to = target, let j = order.firstIndex(of: to) else { return }
        // Kortene vi passerer (mellom gammel og ny plass) bestemmer hvor langt plassen flytter seg.
        let lo: Int = Swift.min(i, j)
        let hi: Int = Swift.max(i, j)
        var passed: CGFloat = 0
        for idx in lo...hi where order[idx] != key {
            let h: CGFloat = fr[order[idx]]?.height ?? 0
            passed += h + Drag37.spacing
        }
        order.remove(at: i)
        let ins: Int = Swift.min(j, order.count)
        order.insert(key, at: ins)
        if order == live { return }
        lastSwap = now
        dirty = true
        shift += j > i ? passed : -passed
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) { live = order }
        offsetY = dy - shift
        if Haptics.shared.on { gen?.impactOccurred(intensity: 0.45) }
        gen?.prepare()
    }

    private func autoScroll(_ page: String, _ key: String, _ location: CGPoint) {
        let now: Date = Date()
        if now.timeIntervalSince(lastScroll) < 0.4 { return }
        guard let order = live, let i = order.firstIndex(of: key) else { return }
        let y: CGFloat = (stackTop[page] ?? 0) + location.y
        // Toppen er dekket av ＋ / ✓ (64 pt), bunnen av fanelinjen.
        let topZone: CGFloat = Wiggle30.clipEdit + Drag37.edge
        let bottomZone: CGFloat = viewportH - 110 - Drag37.edge
        if y < topZone && i > 0 {
            lastScroll = now
            scrollTarget = order[i - 1]
            scrollTop = true
            scrollTick += 1
        } else if y > bottomZone && i < order.count - 1 {
            lastScroll = now
            scrollTarget = order[i + 1]
            scrollTop = false
            scrollTick += 1
        }
    }

    /// Slipp (eller avbrutt gest): lagre én gang hvis rekkefølgen er endret.
    func end(_ store: Store) {
        rejected = nil
        downKey = ""
        guard key != nil else { return }
        let pg: String = page ?? ""
        let order: [String] = live ?? []
        let changed: Bool = dirty
        let ks: [String] = keys
        Drag37.log.debug("slipp på \(pg, privacy: .public), endret: \(changed, privacy: .public)")
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            if changed { store.commitPaperOrder37(pg, order, ks) }
            key = nil
            page = nil
            live = nil
            offsetY = 0
        }
        dirty = false
        shift = 0
        gen = nil
    }
}

extension Store {
    /// Lagrer rekkefølgen etter dra én gang (UserDefaults via didSet + /api/me/layout).
    func commitPaperOrder37(_ page: String, _ visible: [String], _ keys: [String]) {
        guard !page.isEmpty else { return }
        let cur = pageCards(page, keys)
        var next: [String] = visible.filter { keys.contains($0) && !cur.hidden.contains($0) }
        for k in cur.visible where !next.contains(k) { next.append(k) }
        guard next != cur.visible else { return }
        paperPages[page] = PaperPageLayout(order: next + cur.hidden, hidden: cur.hidden)
        if let l = paperPages[page] {
            savePaperLayout(["pages": [page: ["order": l.order, "hidden": l.hidden]]])
        }
    }
}

/// Måler høyden på scroll-flaten (legges på ScrollView i PaperPage).
struct Drag37Viewport: View {
    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let h: CGFloat = g.size.height
            Color.clear
                .onAppear { Drag37.shared.viewportH = h }
                .onChange(of: h) { _, nh in Drag37.shared.viewportH = nh }
        }
    }
}

// ---- Tidligere Home21.swift ----

/* ---------------- Hjem-widgets: hold inne og dra (prompt 21) ---------------- */

extension Store {
    /// Rett etter et langt trykk (0,8 s) åpnes ingen sider, så klikket når fingeren slippes ikke avbryter redigeringen.
    var paperTapBlocked: Bool { Date().timeIntervalSince(paperEditAt) < 0.8 }

    /// Kortet `src` er sluppet på `target`: flytt det dit (fremover havner det etter målet, bakover foran).
    func dropPaperCard(_ page: String, _ src: String, on target: String, _ keys: [String]) {
        let cur = pageCards(page, keys)
        let next: [String] = FinTileOrder20.moved(cur.visible, src, before: target)
        guard next != cur.visible else { return }
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            paperPages[page] = PaperPageLayout(order: next + cur.hidden, hidden: cur.hidden)
        }
        if let l = paperPages[page] {
            savePaperLayout(["pages": [page: ["order": l.order, "hidden": l.hidden]]])
        }
    }
}
