import SwiftUI
import UIKit

/* ---------------- Prompt 46: Vær – modusvelgeren (Temperatur / Nedbør / Vind) med Liquid Glass og sveip ----------------
 Spesifikasjon: claude-code-vaer-modusvelger-liquid-glass.md. Fasit: Vaer.dc.html → seg og modes (ved «Forhold ›»).
 – Én glassdråpe bak ikonene som glir mellom valgene. Trykk: fjær (response 0,38, damping 0,72).
 – Sveip: dråpen følger fingeren 1:1, strekkes i bredden og klemmes i høyden etter fart, ikonet under forstørres 12 %, haptisk
   tikk ved hvert nytt valg, og den smetter til nærmeste når man slipper. Ingen klikk etter et drag.
 – Scroll-lærdommen (kontrakten): ingen egne dra-gester. Sveipet er en vannrett ScrollView med snapping (viewAligned, én celle per
   valg) over velgeren; dråpen tegnes etter scroll-forskyvningen. ScrollView-en er speilvendt (scaleEffect x −1), så fingeren mot høyre
   gir dråpen mot høyre. Trykk leses med SpatialTapGesture (samtidig, avbrytes av sveip – derfor ingen klikk etter drag).
 – Utseende: spor rgba(0,0,0,.18), 3 pt marg; dråpe med lys gradient (34 % → 16 % hvit), .ultraThinMaterial (uskarphet + metning),
   høylys øverst, tynn lys kant og myk skygge. (iOS 26-glassEffect brukes ikke – bygget skjer med Xcode 16.)
 – «Reduser bevegelse»: ingen strekk/forstørring, kort glid (150 ms). */

private struct WxSeg46OffKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct WxSeg46Item: Hashable {
    let id: String
    let icon: String
    let label: String
}

struct WxSeg46: View {
    @Binding var mode: String
    let items: [WxSeg46Item]
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var pos: Int? = 0
    @State private var off: CGFloat = 0
    @State private var lastIdx: Int = 0
    @State private var speed: CGFloat = 0
    @State private var lastOff: CGFloat = 0
    @State private var lastAt: Date = .distantPast
    @State private var settle: Task<Void, Never>? = nil
    @State private var ready: Bool = false

    private let segW: CGFloat = 44
    private let segH: CGFloat = 30
    private let space: String = "wxseg46"

    private var count: Int { Swift.max(1, items.count) }
    private var width: CGFloat { segW * CGFloat(count) }
    private var index: Int { items.firstIndex { $0.id == mode } ?? 0 }
    private var hover: Int { Swift.min(count - 1, Swift.max(0, Int((off / segW).rounded()))) }
    private var moving: Bool { speed > 40 && !reduce }
    private var stretch: CGFloat { reduce ? 1 : 1 + Swift.min(0.28, speed / 2600) }
    private var squash: CGFloat { reduce ? 1 : 1 - Swift.min(0.16, speed / 4200) }

    var body: some View {
        ZStack(alignment: .leading) {
            drop
            icons
            scroller
        }
        .frame(width: width, height: segH)
        .contentShape(Capsule())
        .simultaneousGesture(SpatialTapGesture().onEnded { (v: SpatialTapGesture.Value) in tap(v.location.x) })
        .padding(3)
        .background(Color.black.opacity(0.18), in: Capsule())
        .onAppear { sync(animated: false) }
        .onChange(of: mode) { (_: String, _: String) in if hover != index { sync(animated: true) } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Visning")
        .accessibilityValue(items.indices.contains(index) ? items[index].label : "")
        .accessibilityAdjustableAction { (d: AccessibilityAdjustmentDirection) in
            let j: Int = d == .increment ? Swift.min(count - 1, index + 1) : Swift.max(0, index - 1)
            if items.indices.contains(j) { mode = items[j].id }
        }
    }

    /* ---------- Dråpen ---------- */

    private var drop: some View {
        let w: CGFloat = segW * stretch
        let h: CGFloat = segH * squash
        return Capsule()
            .fill(LinearGradient(colors: [Color.white.opacity(0.34), Color.white.opacity(0.16)], startPoint: .top, endPoint: .bottom))
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(alignment: .top) {
                Capsule().fill(LinearGradient(colors: [Color.white.opacity(0.45), Color.white.opacity(0)], startPoint: .top, endPoint: .center))
                    .padding(.horizontal, 6).padding(.top, 1.5).frame(height: h * 0.5)
            }
            .overlay(Capsule().stroke(Color.white.opacity(0.42), lineWidth: 0.8))
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(0.22), radius: 6, y: 2)
            .frame(width: w, height: h)
            .offset(x: off - (w - segW) / 2)
            .allowsHitTesting(false)
    }

    private var icons: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { (pair: (offset: Int, element: WxSeg46Item)) in
                Glyph22Icon(name: pair.element.icon, size: 18, color: .white, stroke: 1.9)
                    .scaleEffect(moving && pair.offset == hover ? 1.12 : 1)
                    .animation(.easeOut(duration: 0.12), value: moving && pair.offset == hover)
                    .frame(width: segW, height: segH)
            }
        }
        .allowsHitTesting(false)
    }

    /* ---------- Sveipet (ScrollView med snapping, ingen egne dra-gester) ---------- */

    private var scroller: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(0..<count, id: \.self) { (i: Int) in
                    Color.clear.frame(width: segW, height: segH).id(i)
                }
                Color.clear.frame(width: segW * CGFloat(count - 1), height: segH)
            }
            .scrollTargetLayout()
            .background(GeometryReader { (g: GeometryProxy) in
                Color.clear.preference(key: WxSeg46OffKey.self, value: -g.frame(in: .named(space)).minX)
            })
        }
        .coordinateSpace(name: space)
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $pos)
        .scrollIndicators(.hidden)
        .frame(width: width, height: segH)
        .scaleEffect(x: -1, y: 1)
        .onPreferenceChange(WxSeg46OffKey.self) { (v: CGFloat) in moved(v) }
        .onChange(of: pos) { (_: Int?, v: Int?) in
            guard ready, let v, items.indices.contains(v), items[v].id != mode else { return }
            mode = items[v].id
        }
    }

    private func moved(_ v0: CGFloat) {
        let v: CGFloat = Swift.min(segW * CGFloat(count - 1), Swift.max(0, v0))
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
        let i: Int = Swift.min(count - 1, Swift.max(0, Int(x / segW)))
        guard items.indices.contains(i) else { return }
        Haptics.shared.select()
        mode = items[i].id
        sync(animated: true)
    }

    private func sync(animated: Bool) {
        let i: Int = index
        if animated {
            withAnimation(reduce ? .easeOut(duration: 0.15) : .spring(response: 0.38, dampingFraction: 0.72)) { pos = i }
        } else {
            pos = i
            off = segW * CGFloat(i)
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
