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

    static let spacing: CGFloat = 10
    static let swapEvery: TimeInterval = 0.14
    static let band: CGFloat = 0.15
    static let edge: CGFloat = 40
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

    /// Det lange trykket er gjenkjent: kortet løftes.
    func lift(_ page: String, _ key: String, _ visible: [String], _ keys: [String]) {
        if self.key == nil { begin(page, key, visible, keys) }
    }

    /// Et nytt punkt fra gesten. `location` og `dy` er i stabelens koordinatrom.
    func move(_ page: String, _ key: String, _ visible: [String], _ keys: [String], _ location: CGPoint, _ dy: CGFloat) {
        if self.key == nil { begin(page, key, visible, keys) }
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

/// Usynlig lag over et kort i redigeringsmodus: fanger trykk (ingen lenker åpnes) og flytter kortet.
struct Drag37Shield: View {
    @Environment(Store.self) private var store
    let page: String
    let key: String
    let visible: [String]
    let keys: [String]
    @GestureState private var pressing: Bool = false

    var body: some View {
        Color.white.opacity(0.001)
            .contentShape(Rectangle())
            // Prompt 39: samtidig gest, så vanlig sveip opp/ned scroller siden også i redigering. Kortet løftes først etter
            // 0,17 s hold uten å flytte fingeren mer enn 8 pt (da har scrollen ikke startet, og scrollDisabled stanser den).
            .simultaneousGesture(reorder)
            .onChange(of: pressing) { _, on in
                // Avbrutt gest (ark, varsel, app i bakgrunnen): onEnded kommer ikke, men GestureState nullstilles.
                if !on && Drag37.shared.isDragging(page, key) { Drag37.shared.end(store) }
            }
            .accessibilityHidden(true)
    }

    private var reorder: some Gesture {
        LongPressGesture(minimumDuration: 0.17, maximumDistance: 8)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(Drag37.space(page))))
            .updating($pressing) { (v: SequenceGesture<LongPressGesture, DragGesture>.Value, st: inout Bool, _: inout Transaction) in
                if case .second(true, _) = v { st = true }
            }
            .onChanged { (v: SequenceGesture<LongPressGesture, DragGesture>.Value) in changed(v) }
            .onEnded { (_: SequenceGesture<LongPressGesture, DragGesture>.Value) in Drag37.shared.end(store) }
    }

    private func changed(_ v: SequenceGesture<LongPressGesture, DragGesture>.Value) {
        guard case .second(true, let dv) = v else { return }
        // Holdt lenge nok: løft kortet med en gang (scroll slås av før fingeren beveger seg).
        guard let d = dv else {
            Drag37.shared.lift(page, key, visible, keys)
            return
        }
        let dy: CGFloat = d.translation.height
        Drag37.shared.move(page, key, visible, keys, d.location, dy)
    }
}

/// Måler rammen til et kort i stabelens koordinatrom.
struct Drag37Frame: View {
    let page: String
    let key: String

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let r: CGRect = g.frame(in: .named(Drag37.space(page)))
            Color.clear
                .onAppear { Drag37.shared.setFrame(page, key, r) }
                .onChange(of: r) { _, nr in Drag37.shared.setFrame(page, key, nr) }
        }
    }
}

/// Måler toppen av stabelen i scroll-flaten (til auto-scroll).
struct Drag37StackTop: View {
    let page: String

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let y: CGFloat = g.frame(in: .named("ppage")).minY
            Color.clear
                .onAppear { Drag37.shared.stackTop[page] = y }
                .onChange(of: y) { _, ny in Drag37.shared.stackTop[page] = ny }
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
