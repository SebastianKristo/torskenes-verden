import SwiftUI
import UIKit

/* ---------------- Prompt 52: Vær – glass-pille med dra for tekstbrytere ----------------
 Fasit: Vaer.dc.html – «Faktisk / Føles som»-bryteren og lagvelgeren i værkartet (Nedbør, Temperatur, Vind, Skyer) har samme
 glass-pille som temp/regn/vind-bryteren (WxSeg46.swift): lys glassgradient med uskarphet, glir mykt til valgt knapp med lett fjær,
 kan dras med fingeren (strekkes etter farten, tilpasser bredden til knappen under, tikk per valg) og smetter på plass når du slipper.
 – Scroll-lærdommen: ingen egne dra-gester. Som WxSeg46: en speilvendt vannrett ScrollView med snapping (viewAligned) over velgeren,
   og pillen tegnes etter scroll-forskyvningen. Cellene i ScrollView-en har samme bredder som knappene, så snappingen treffer hver knapp.
 – Trykk leses med SpatialTapGesture (samtidig, avbrytes av sveip – ingen klikk etter et drag).
 – «Reduser bevegelse»: ingen strekk, kort glid (150 ms). */

private struct WxGlass52OffKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct WxGlass52Item: Hashable {
    let id: String
    let label: String
}

struct WxGlass52: View {
    @Binding var value: String
    let items: [WxGlass52Item]
    var fontSize: CGFloat = 13.5
    var height: CGFloat = 34
    /// Fast bredde per knapp (nil = etter teksten).
    var equalWidth: CGFloat? = nil
    var padH: CGFloat = 14
    var track: Color = Color.black.opacity(0.22)
    var a11y: String = "Velg"

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var pos: Int? = 0
    @State private var off: CGFloat = 0
    @State private var lastIdx: Int = 0
    @State private var speed: CGFloat = 0
    @State private var lastOff: CGFloat = 0
    @State private var lastAt: Date = .distantPast
    @State private var settle: Task<Void, Never>? = nil
    @State private var ready: Bool = false

    private let space: String = "wxglass52"

    private var widths: [CGFloat] {
        items.map { (it: WxGlass52Item) -> CGFloat in
            if let w = equalWidth { return w }
            let f: UIFont = UIFont.systemFont(ofSize: fontSize, weight: .semibold)
            let tw: CGFloat = (it.label as NSString).size(withAttributes: [.font: f]).width
            return ceil(tw) + padH * 2
        }
    }

    private var starts: [CGFloat] {
        var out: [CGFloat] = []
        var x: CGFloat = 0
        for w in widths { out.append(x); x += w }
        return out
    }

    private var total: CGFloat { widths.reduce(0, +) }
    private var count: Int { Swift.max(1, items.count) }
    private var index: Int { items.firstIndex { $0.id == value } ?? 0 }
    private var maxOff: CGFloat { starts.last ?? 0 }

    /// Knappen pillen står nærmest.
    private var hover: Int {
        var best: Int = 0
        var d: CGFloat = .greatestFiniteMagnitude
        for (i, s) in starts.enumerated() where abs(s - off) < d { d = abs(s - off); best = i }
        return best
    }

    /// Bredden mellom to knapper mens pillen er på vei.
    private var dropW: CGFloat {
        let ws: [CGFloat] = widths
        let ss: [CGFloat] = starts
        guard !ws.isEmpty else { return 0 }
        var i: Int = 0
        while i + 1 < ss.count && ss[i + 1] <= off { i += 1 }
        if i + 1 >= ws.count { return ws[ws.count - 1] }
        let t: CGFloat = Swift.min(1, Swift.max(0, (off - ss[i]) / Swift.max(1, ws[i])))
        return ws[i] + (ws[i + 1] - ws[i]) * t
    }

    private var stretch: CGFloat { reduce ? 1 : 1 + Swift.min(0.22, speed / 3000) }
    private var squash: CGFloat { reduce ? 1 : 1 - Swift.min(0.14, speed / 4400) }

    var body: some View {
        ZStack(alignment: .leading) {
            drop
            labels
            scroller
        }
        .frame(width: total, height: height)
        .contentShape(Capsule())
        .simultaneousGesture(SpatialTapGesture().onEnded { (v: SpatialTapGesture.Value) in tap(v.location.x) })
        .padding(3)
        .background(track, in: Capsule())
        .onAppear { sync(animated: false) }
        .onChange(of: value) { (_: String, _: String) in if hover != index { sync(animated: true) } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11y)
        .accessibilityValue(items.indices.contains(index) ? items[index].label : "")
        .accessibilityAdjustableAction { (d: AccessibilityAdjustmentDirection) in
            let j: Int = d == .increment ? Swift.min(count - 1, index + 1) : Swift.max(0, index - 1)
            if items.indices.contains(j) { value = items[j].id }
        }
    }

    private var drop: some View {
        let base: CGFloat = dropW
        let w: CGFloat = base * stretch
        let h: CGFloat = height * squash
        return Capsule()
            .fill(LinearGradient(colors: [Color.white.opacity(0.36), Color.white.opacity(0.16)], startPoint: .top, endPoint: .bottom))
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(alignment: .top) {
                Capsule().fill(LinearGradient(colors: [Color.white.opacity(0.45), Color.white.opacity(0)], startPoint: .top, endPoint: .center))
                    .padding(.horizontal, 8).padding(.top, 1.5).frame(height: h * 0.5)
            }
            .overlay(Capsule().stroke(Color.white.opacity(0.42), lineWidth: 0.8))
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(0.22), radius: 6, y: 2)
            .frame(width: w, height: h)
            .offset(x: off - (w - base) / 2)
            .allowsHitTesting(false)
    }

    private var labels: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { (pair: (offset: Int, element: WxGlass52Item)) in
                Text(pair.element.label).font(.system(size: fontSize, weight: .semibold)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(width: widths.indices.contains(pair.offset) ? widths[pair.offset] : 0, height: height)
            }
        }
        .allowsHitTesting(false)
    }

    private var scroller: some View {
        let ws: [CGFloat] = widths
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(Array(ws.enumerated()), id: \.offset) { (pair: (offset: Int, element: CGFloat)) in
                    Color.clear.frame(width: pair.element, height: height).id(pair.offset)
                }
                Color.clear.frame(width: Swift.max(0, total - (ws.last ?? 0)), height: height)
            }
            .scrollTargetLayout()
            .background(GeometryReader { (g: GeometryProxy) in
                Color.clear.preference(key: WxGlass52OffKey.self, value: -g.frame(in: .named(space)).minX)
            })
        }
        .coordinateSpace(name: space)
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $pos)
        .scrollIndicators(.hidden)
        .frame(width: total, height: height)
        .scaleEffect(x: -1, y: 1)
        .onPreferenceChange(WxGlass52OffKey.self) { (v: CGFloat) in moved(v) }
        .onChange(of: pos) { (_: Int?, v: Int?) in
            guard ready, let v, items.indices.contains(v), items[v].id != value else { return }
            value = items[v].id
        }
    }

    private func moved(_ v0: CGFloat) {
        let v: CGFloat = Swift.min(maxOff, Swift.max(0, v0))
        let now: Date = Date()
        let dt: Double = Swift.max(0.008, now.timeIntervalSince(lastAt))
        speed = abs(v - lastOff) / CGFloat(dt)
        lastOff = v
        lastAt = now
        off = v
        let i: Int = hover
        if i != lastIdx {
            lastIdx = i
            if ready { Haptics.shared.tick() }
        }
        settle?.cancel()
        settle = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 120_000_000)
            if !Task.isCancelled { withAnimation(.easeOut(duration: 0.18)) { speed = 0 } }
        }
    }

    private func tap(_ x: CGFloat) {
        var i: Int = 0
        for (k, s) in starts.enumerated() where x >= s { i = k }
        guard items.indices.contains(i) else { return }
        Haptics.shared.select()
        value = items[i].id
        sync(animated: true)
    }

    private func sync(animated: Bool) {
        let i: Int = index
        if animated {
            withAnimation(reduce ? .easeOut(duration: 0.15) : .spring(response: 0.38, dampingFraction: 0.72)) { pos = i }
        } else {
            pos = i
            off = starts.indices.contains(i) ? starts[i] : 0
            lastOff = off
            lastIdx = i
        }
        if !ready {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 250_000_000)
                ready = true
            }
        }
    }
}
