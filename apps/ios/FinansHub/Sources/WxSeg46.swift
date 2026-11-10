import SwiftUI
import UIKit

/* ---------------- Prompt 46 / 80: Vær – modusvelgeren (Temperatur / Nedbør / Vind) med glass-pille ----------------
 Prompt 80 (pakke 56, ios.md): bryteren øverst til høyre i Forhold-kortet reagerte ikke på iOS. Rotårsak: velgeren var bygd som en
 speilvendt, vannrett ScrollView med snapping over ikonene, og trykk ble lest med en samtidig SpatialTapGesture. Den indre
 ScrollView-en og den horisontale timelisten / sidens ScrollView kranglet om gesten, og trykket ble spist før det nådde fram.
 Nå (alle årsakene i ios.md):
 1) Én DragGesture(minimumDistance: 0) som .highPriorityGesture på bryteren, med .contentShape(Capsule()) – ingen ScrollView.
 2) < 5 pt flytting = trykk (ikonet velges ut fra x), ≥ 5 pt = dra. Ingen onTapGesture i tillegg.
 3) Glass-pillen, glansen og ikonene har .allowsHitTesting(false) – bare bryteren selv tar treff.
 4) Tittelen «Forhold ›» har egen trykkflate til venstre (Weather22Cards.swift); bryteren åpner aldri dagssiden.
 5) Treffområdet er minst 44 × 44 pt (sporet er 36 pt høyt, trykkflaten 44).
 6) Modus ligger i én @AppStorage("vaer_mode") i PaperWeatherView som både bryter og timerader leser.
 Mål: pille 44 × 30, radius 999, 2 pt mellom, 3 pt padding; spor rgba(0,0,0,.18); pille gradient 34 % → 16 % hvit med
 uskarphet (material) og glans inni toppkanten; x = 3 + indeks × 46. Glid 0,42 s med fjærkurve cubic-bezier(.34,1.32,.5,1).
 Dra: pillen følger fingeren, strekkes etter farten (maks scaleX 1,18 / scaleY 0,9), lett haptikk ved hvert nytt ikon, smetter på
 nærmeste ved slipp. Ikonet spretter (1,12 → 1) ved bytte. «Reduser bevegelse»: ingen strekk/sprett, kort glid (150 ms).
 (iOS 26-glassEffect brukes ikke – bygget skal gå med både Xcode 16 og 26.) */

struct WxSeg46Item: Hashable {
    let id: String
    let icon: String
    let label: String
}

struct WxSeg46: View {
    @Binding var mode: String
    let items: [WxSeg46Item]
    @Environment(\.accessibilityReduceMotion) private var reduce
    /// Pillens venstre kant mens man drar (nil = står på valgt ikon).
    @State private var dragX: CGFloat? = nil
    @State private var vx: CGFloat = 0
    @State private var hoverIdx: Int = -1
    @State private var popIdx: Int = -1
    @State private var pop: CGFloat = 1

    static let segW: CGFloat = 44
    static let segH: CGFloat = 30
    static let gap: CGFloat = 2
    static let pad: CGFloat = 3
    static let step: CGFloat = 46
    static let tapSlop: CGFloat = 5

    /// Pillens x for et ikon: 3 + indeks × 46.
    static func x(_ i: Int) -> CGFloat { pad + CGFloat(i) * step }

    private var count: Int { Swift.max(1, items.count) }
    private var trackW: CGFloat { Self.pad * 2 + Self.segW * CGFloat(count) + Self.gap * CGFloat(count - 1) }
    private var trackH: CGFloat { Self.segH + Self.pad * 2 }
    private var index: Int { items.firstIndex { $0.id == mode } ?? 0 }
    private var pillX: CGFloat { dragX ?? Self.x(index) }
    private var stretchX: CGFloat { reduce || dragX == nil ? 1 : 1 + Swift.min(0.18, abs(vx) / 2500) }
    private var stretchY: CGFloat { reduce || dragX == nil ? 1 : 1 - Swift.min(0.10, abs(vx) / 4000) }
    private var slide: Animation {
        reduce ? .easeOut(duration: 0.15) : .timingCurve(0.34, 1.32, 0.5, 1, duration: 0.42)
    }

    /// Nærmeste ikon for en pilleposisjon.
    private func nearest(_ px: CGFloat) -> Int {
        let i: Int = Int(((px - Self.pad) / Self.step).rounded())
        return Swift.min(count - 1, Swift.max(0, i))
    }

    /// Ikonet under et trykk (x i bryterens koordinater).
    private func hit(_ x: CGFloat) -> Int {
        let i: Int = Int(floor((x - Self.pad + Self.gap / 2) / Self.step))
        return Swift.min(count - 1, Swift.max(0, i))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Capsule().fill(Color.black.opacity(0.18))
                .frame(width: trackW, height: trackH)
                .allowsHitTesting(false)
            pill
            icons
        }
        .frame(width: trackW, height: trackH)
        .frame(width: Swift.max(44, trackW), height: 44)
        .contentShape(Capsule())
        .highPriorityGesture(drag)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Visning")
        .accessibilityValue(items.indices.contains(index) ? items[index].label : "")
        .accessibilityAddTraits(.isButton)
        .accessibilityAdjustableAction { (d: AccessibilityAdjustmentDirection) in
            let j: Int = d == .increment ? Swift.min(count - 1, index + 1) : Swift.max(0, index - 1)
            select(j)
        }
    }

    /* ---------- Glass-pillen ---------- */

    private var pill: some View {
        Capsule()
            .fill(LinearGradient(colors: [Color.white.opacity(0.34), Color.white.opacity(0.16)], startPoint: .top, endPoint: .bottom))
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(alignment: .top) {
                Capsule().fill(LinearGradient(colors: [Color.white.opacity(0.45), Color.white.opacity(0)], startPoint: .top, endPoint: .bottom))
                    .padding(.horizontal, 6).padding(.top, 1.5).frame(height: Self.segH * 0.5)
                    .allowsHitTesting(false)
            }
            .overlay(Capsule().stroke(Color.white.opacity(0.42), lineWidth: 0.8))
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(0.22), radius: 6, y: 2)
            .frame(width: Self.segW, height: Self.segH)
            .scaleEffect(x: stretchX, y: stretchY)
            .offset(x: pillX, y: Self.pad)
            .animation(dragX == nil ? slide : nil, value: index)
            .allowsHitTesting(false)
    }

    private var icons: some View {
        HStack(spacing: Self.gap) {
            ForEach(Array(items.enumerated()), id: \.offset) { (pair: (offset: Int, element: WxSeg46Item)) in
                Glyph22Icon(name: pair.element.icon, size: 18, color: .white, stroke: 1.9)
                    .scaleEffect(pair.offset == popIdx ? pop : 1)
                    .frame(width: Self.segW, height: Self.segH)
            }
        }
        .padding(Self.pad)
        .allowsHitTesting(false)
    }

    /* ---------- Én gest: trykk (< 5 pt) eller dra (≥ 5 pt) ---------- */

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { (v: DragGesture.Value) in
                if dragX == nil && abs(v.translation.width) < Self.tapSlop && abs(v.translation.height) < Self.tapSlop { return }
                let lo: CGFloat = Self.x(0)
                let hi: CGFloat = Self.x(count - 1)
                let px: CGFloat = Swift.min(hi, Swift.max(lo, v.location.x - Self.segW / 2))
                if dragX == nil { hoverIdx = index }
                dragX = px
                vx = v.velocity.width
                let i: Int = nearest(px)
                if i != hoverIdx {
                    hoverIdx = i
                    if Haptics.shared.on { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
                    bounce(i)
                }
            }
            .onEnded { (v: DragGesture.Value) in
                if let px = dragX {
                    select(nearest(px))
                } else {
                    Haptics.shared.select()
                    select(hit(v.location.x))
                }
            }
    }

    private func select(_ i: Int) {
        guard items.indices.contains(i) else { return }
        let changed: Bool = items[i].id != mode
        withAnimation(slide) {
            mode = items[i].id
            dragX = nil
            vx = 0
        }
        hoverIdx = -1
        if changed { bounce(i) }
    }

    private func bounce(_ i: Int) {
        guard !reduce else { return }
        popIdx = i
        withAnimation(.easeOut(duration: 0.1)) { pop = 1.12 }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 100_000_000)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.55)) { pop = 1 }
        }
    }
}
