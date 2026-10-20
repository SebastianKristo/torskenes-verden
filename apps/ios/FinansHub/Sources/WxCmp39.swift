import SwiftUI
import UIKit

/* ---------------- Prompt 39: Yr mot Storm (2a) med wiggle-redigering som på Hjem ---------------- */
// Spesifikasjon: claude-code-vaer-yr-storm-2a-rediger.md (+ størrelsesfiksen i claude-code-vaer-glimt-ukas-vaer.md).
// Fasit: design/Yr mot Storm Design.dc.html → 2a «Duell på himmel»: himmelbakgrunn og glasskort fra 1b, duell-topp og
// midtstilte avvikssøyler fra 1a, enighet og Glimt-forklaring fra 1c. Data: WxCompare22 (Yr = MET, Storm = ECMWF).
//
// Kort: hero (Dagens duell) · agree (Enighet) · glimt (Glimt forklarer) · list (Dag for dag) · chart (Neste 24 timer, skjult)
// · rain (Nedbør per dag, skjult). Rekkefølge og skjulte lagres i vs_cmp_layout = {ord:[…], hid:{…}} (UserDefaults + /api/me/layout).
// Hold inne 0,48 s → redigering (vugging ±0,5°, − skjuler, «Ferdig» blir hvit). Hold 0,17 s og dra → flytt. Scroll virker hele tiden.
// Alle kort fyller full bredde (innpakningen strekker innholdet, ingen rad-retning som krymper kortene).

/// Én dag i sammenligningen (ferdig regnet ut).
struct WxCmp39Day: Identifiable, Hashable {
    var id: String
    var label: String
    var yH: Double
    var yL: Double
    var sH: Double
    var sL: Double
    var yP: Double
    var sP: Double

    var dT: Double { yH - sH }
    var rainDis: Bool { (yP > 0.5) != (sP > 0.5) }
    var ok: Bool { abs(dT) < 2 && !rainDis }

    var status: String {
        if ok { return "Enige" }
        if rainDis && abs(dT) >= 2 { return "Uenige om regn og temperatur" }
        if rainDis { return "Uenige om regn" }
        return "Uenige om temperatur"
    }
}

enum WxCmp39 {
    static let keys: [String] = ["hero", "agree", "glimt", "list", "chart", "rain"]
    static let defaultHidden: Set<String> = ["chart", "rain"]
    static let storeKey: String = "vs_cmp_layout"

    static func name(_ k: String) -> String {
        switch k {
        case "hero": return "Dagens duell"
        case "agree": return "Enighet"
        case "glimt": return "Glimt forklarer"
        case "list": return "Dag for dag"
        case "chart": return "Neste 24 timer"
        default: return "Nedbør per dag"
        }
    }

    static let yrC: Color = Color(hex: "#7fd6f5")
    static let yrT: Color = Color(hex: "#9fe3ff")
    static let stC: Color = Color(hex: "#ffb27a")
    static let stT: Color = Color(hex: "#ffc79e")

    static func deg(_ v: Double) -> String { String(Int(v.rounded())) + "°" }

    static func mm(_ v: Double) -> String {
        let r: Double = (v * 10).rounded() / 10
        let s: String = r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
        return s.replacingOccurrences(of: ".", with: ",")
    }

    /// «I dag», «Ons», «Tor» …
    static func label(_ iso: String, first: Bool) -> String {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: String(iso.prefix(10))) else { return first ? "I dag" : String(iso.suffix(2)) }
        if Calendar.current.isDateInToday(d) { return "I dag" }
        f.dateFormat = "EEE"
        let s: String = f.string(from: d).replacingOccurrences(of: ".", with: "")
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    static func days(_ c: WxCompare22) -> [WxCmp39Day] {
        var out: [WxCmp39Day] = []
        for (i, d) in c.days.prefix(7).enumerated() {
            let yH: Double = d.yr.max ?? d.pent.max ?? 0
            let sH: Double = d.pent.max ?? d.yr.max ?? 0
            out.append(WxCmp39Day(id: d.date, label: label(d.date, first: i == 0), yH: yH, yL: d.yr.min ?? yH, sH: sH, sL: d.pent.min ?? sH,
                                  yP: d.yr.precip ?? 0, sP: d.pent.precip ?? 0))
        }
        return out
    }

    static func worst(_ ds: [WxCmp39Day]) -> WxCmp39Day? {
        ds.max { (a: WxCmp39Day, b: WxCmp39Day) -> Bool in
            (abs(a.dT) + abs(a.yP - a.sP)) < (abs(b.dT) + abs(b.yP - b.sP))
        }
    }

    /// Glimt forklarer (lokal tekst etter fasiten).
    static func glimt(_ ds: [WxCmp39Day]) -> String {
        guard let w = worst(ds) else { return "Glimt venter på tall fra Yr og Storm." }
        let n: Int = ds.filter { $0.ok }.count
        if n == ds.count { return "Yr og Storm er enige hele uka. Du kan stole ganske trygt på varselet." }
        let day: String = w.label.lowercased()
        if w.rainDis {
            let wetter: String = w.yP > w.sP ? "Yr" : "Storm"
            let drier: String = w.yP > w.sP ? "Storm" : "Yr"
            let wetMm: Double = Swift.max(w.yP, w.sP)
            let wetDeg: Double = w.yP > w.sP ? w.yH : w.sH
            let dryDeg: Double = w.yP > w.sP ? w.sH : w.yH
            return "Størst uenighet er \(day). \(wetter) venter regn (\(mm(wetMm)) mm) og \(deg(wetDeg)), \(drier) venter nesten opphold og \(deg(dryDeg)). Ta med paraply for sikkerhets skyld."
        }
        let warmer: String = w.dT > 0 ? "Yr" : "Storm"
        return "Størst uenighet er \(day): \(warmer) er \(Int(abs(w.dT).rounded()))° varmere (Yr \(deg(w.yH)), Storm \(deg(w.sH))). Ellers er de enige om \(n) av \(ds.count) dager."
    }
}

/// Rekkefølge og skjulte kort (vs_cmp_layout), lagret lokalt og på kontoen.
@MainActor
@Observable
final class WxCmp39Layout {
    static let shared = WxCmp39Layout()

    var ord: [String] = WxCmp39.keys
    var hid: Set<String> = WxCmp39.defaultHidden
    var editing: Bool = false
    /// Kortet som dras og forskyvningen.
    var dragKey: String? = nil
    var dragOff: CGFloat = 0
    @ObservationIgnored var heights: [String: CGFloat] = [:]
    @ObservationIgnored private var base: CGFloat = 0
    @ObservationIgnored private var loadedRemote: Bool = false

    static let gap: CGFloat = 12

    init() {
        if let o = UserDefaults.standard.dictionary(forKey: AcctScope.key(WxCmp39.storeKey)) { apply(o) }
    }

    var visible: [String] { ord.filter { !hid.contains($0) } }
    var hiddenList: [String] { ord.filter { hid.contains($0) } }

    func apply(_ o: [String: Any]) {
        let raw: [String] = (o["ord"] as? [Any])?.compactMap { $0 as? String } ?? []
        var next: [String] = raw.filter { WxCmp39.keys.contains($0) }
        for k in WxCmp39.keys where !next.contains(k) { next.append(k) }
        ord = next
        var h: Set<String> = []
        if let d = o["hid"] as? [String: Any] {
            for (k, v) in d {
                if let b = v as? Bool, b { h.insert(k) } else if let n = v as? NSNumber, n.boolValue { h.insert(k) }
            }
        } else if let a = o["hid"] as? [Any] {
            for x in a { if let s = x as? String { h.insert(s) } }
        }
        hid = h
    }

    var json: [String: Any] {
        var h: [String: Any] = [:]
        for k in hid { h[k] = true }
        return ["ord": ord, "hid": h]
    }

    func save(_ store: Store) {
        let j: [String: Any] = json
        UserDefaults.standard.set(j, forKey: AcctScope.key(WxCmp39.storeKey))
        store.savePaperLayout([WxCmp39.storeKey: j])
    }

    /// Henter valget fra kontoen (én gang per oppstart).
    func loadRemote(_ store: Store) async {
        if loadedRemote { return }
        loadedRemote = true
        guard let d = try? await store.api.callAt("/api", "GET", "/me/layout", timeout: 10) else { return }
        let o: [String: Any] = JS.obj(d)
        if let v = JS.dict(o, WxCmp39.storeKey) {
            apply(v)
            UserDefaults.standard.set(json, forKey: AcctScope.key(WxCmp39.storeKey))
        }
    }

    func enter() {
        if editing { return }
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) { editing = true }
    }

    func done(_ store: Store) {
        withAnimation(.easeOut(duration: 0.2)) { editing = false }
        dragKey = nil
        save(store)
    }

    func hide(_ k: String, _ store: Store) {
        Haptic30.soft()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { hid.insert(k) }
        save(store)
    }

    /// Legges inn sist blant de synlige.
    func show(_ k: String, _ store: Store) {
        Haptic30.soft()
        var next: [String] = ord.filter { $0 != k }
        let vis: [String] = next.filter { !hid.contains($0) }
        if let last = vis.last, let i = next.firstIndex(of: last) { next.insert(k, at: i + 1) } else { next.insert(k, at: 0) }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            ord = next
            hid.remove(k)
        }
        save(store)
    }

    func lift(_ k: String) {
        if dragKey == k { return }
        Haptics.shared.tap()
        base = 0
        dragOff = 0
        dragKey = k
    }

    /// Når midten av kortet passerer nabokortets midte, bytter de plass (de andre glir med animasjon).
    func move(_ k: String, _ ty: CGFloat) {
        guard dragKey == k else { return }
        var off: CGFloat = ty - base
        let vis: [String] = visible
        guard let i = vis.firstIndex(of: k) else { return }
        if off > 0, i + 1 < vis.count {
            let n: String = vis[i + 1]
            let h: CGFloat = heights[n] ?? 120
            if off > h / 2 + 6 {
                swap(k, n)
                base += h + WxCmp39Layout.gap
                off -= h + WxCmp39Layout.gap
            }
        } else if off < 0, i > 0 {
            let pv: String = vis[i - 1]
            let h: CGFloat = heights[pv] ?? 120
            if -off > h / 2 + 6 {
                swap(k, pv)
                base -= h + WxCmp39Layout.gap
                off += h + WxCmp39Layout.gap
            }
        }
        var tr: Transaction = Transaction()
        tr.disablesAnimations = true
        withTransaction(tr) { dragOff = off }
    }

    private func swap(_ a: String, _ b: String) {
        guard let i = ord.firstIndex(of: a), let j = ord.firstIndex(of: b) else { return }
        Haptic30.soft()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.26)) { ord.swapAt(i, j) }
    }

    func drop(_ store: Store) {
        guard dragKey != nil else { return }
        withAnimation(.timingCurve(0.2, 0.9, 0.3, 1.15, duration: 0.24)) {
            dragOff = 0
            dragKey = nil
        }
        save(store)
    }
}

struct WxCmp39HeightKey: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue()) { (_: CGFloat, b: CGFloat) -> CGFloat in b }
    }
}

/// Siden (fullskjerm eller panel). Tittelraden og kildeteksten er faste.
struct WxCmp39Page: View {
    @Environment(Store.self) private var store
    let w: WeatherFull
    var topPad: CGFloat = 48
    let close: () -> Void
    @MainActor private var L: WxCmp39Layout { WxCmp39Layout.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: WxCmp39Layout.gap) {
                header
                if L.editing {
                    Text("Dra kortene for å flytte · − for å skjule").font(.system(size: 12.5)).opacity(0.8)
                        .frame(maxWidth: .infinity).transition(.opacity)
                }
                if let c = w.compare {
                    let ds: [WxCmp39Day] = WxCmp39.days(c)
                    ForEach(L.visible, id: \.self) { (k: String) in
                        WxCmp39Slot(k: k, index: L.visible.firstIndex(of: k) ?? 0) { card(k, c, ds) }
                    }
                    if L.editing && !L.hiddenList.isEmpty { WxCmp39AddBox() }
                } else {
                    Text(w.compareState == 2 ? "Storm svarte ikke. Prøv igjen senere." : "Henter Storm-data …")
                        .font(.system(size: 13)).opacity(0.75)
                }
                Text("Yr: MET Norway. Storm: ECMWF via Open-Meteo (Storm har ikke åpent API).")
                    .font(.system(size: 11.5)).opacity(0.55).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
            }
            .padding(.horizontal, 16).padding(.top, topPad).padding(.bottom, 30)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
            .onPreferenceChange(WxCmp39HeightKey.self) { (v: [String: CGFloat]) in
                for (k, h) in v { WxCmp39Layout.shared.heights[k] = h }
            }
        }
        .scrollDisabled(L.dragKey != nil)
        .foregroundStyle(.white)
        .background(LinearGradient(stops: [.init(color: Color(hex: "#3a5a80"), location: 0), .init(color: Color(hex: "#22395a"), location: 0.45),
                                           .init(color: Color(hex: "#16243a"), location: 1)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .task { await WxCmp39Layout.shared.loadRemote(store) }
        .onDisappear { if WxCmp39Layout.shared.editing { WxCmp39Layout.shared.done(store) } }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Yr mot Storm").font(.system(size: 28, weight: .bold))
                Text(w.placeName).font(.system(size: 13.5)).opacity(0.75)
            }
            Spacer(minLength: 6)
            Button {
                if L.editing { L.done(store) } else { close() }
            } label: {
                Text("Ferdig").font(.system(size: 14, weight: .bold))
                    .foregroundStyle(L.editing ? Color(hex: "#22395a") : Color.white)
                    .padding(.horizontal, 15).frame(height: 34)
                    .background(L.editing ? Color.white : Color.white.opacity(0.2), in: Capsule())
            }
            .buttonStyle(.plain)
            .animation(.easeOut(duration: 0.2), value: L.editing)
        }
        .padding(.horizontal, 4).padding(.bottom, 4)
    }

    @ViewBuilder private func card(_ k: String, _ c: WxCompare22, _ ds: [WxCmp39Day]) -> some View {
        switch k {
        case "hero": WxCmp39Hero(days: ds)
        case "agree": WxCmp39Agree(days: ds)
        case "glimt": WxCmp39Glimt(text: WxCmp39.glimt(ds))
        case "list": WxCmp39List(days: ds)
        case "chart": WxCmp39Chart(hours: Array(c.hours.prefix(24)))
        default: WxCmp39Rain(days: ds)
        }
    }
}

/// Innpakning rundt hvert kort: full bredde, vugging, −, hold for å redigere og dra for å flytte.
struct WxCmp39Slot<C: View>: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    let k: String
    let index: Int
    @ViewBuilder let content: () -> C
    @MainActor private var L: WxCmp39Layout { WxCmp39Layout.shared }
    @State private var wig: Bool = false

    var body: some View {
        let editing: Bool = L.editing
        let dragging: Bool = L.dragKey == k
        let sign: Double = index % 2 == 0 ? 1 : -1
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .allowsHitTesting(!editing)
        .background(GeometryReader { (g: GeometryProxy) in
            Color.clear.preference(key: WxCmp39HeightKey.self, value: [k: g.size.height])
        })
        .overlay {
            if editing {
                Color.white.opacity(0.001)
                    .contentShape(Rectangle())
                    .simultaneousGesture(reorder)
            }
        }
        .overlay(alignment: .topLeading) {
            if editing {
                Button { L.hide(k, store) } label: {
                    Text("−").font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 26, height: 26)
                        .background(Color(hex: "#0f1b2b"), in: Circle())
                        .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
                }
                .buttonStyle(.plain)
                .offset(x: -7, y: -7)
                .accessibilityLabel("Skjul " + WxCmp39.name(k))
            }
        }
        .rotationEffect(.degrees(editing && !dragging && !reduce ? (wig ? 0.5 : -0.5) * sign : 0))
        .scaleEffect(dragging ? 1.03 : 1)
        .shadow(color: .black.opacity(dragging ? 0.45 : 0), radius: dragging ? 18 : 0, y: dragging ? 12 : 0)
        .offset(y: dragging ? L.dragOff : 0)
        .transaction { (t: inout Transaction) in if dragging { t.animation = nil } }
        .zIndex(dragging ? 10 : 0)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.48, maximumDistance: 8).onEnded { _ in
            if !L.editing { L.enter() }
        })
        .onChange(of: editing) { (_: Bool, on: Bool) in startWiggle(on) }
        .onChange(of: dragging) { (_: Bool, d: Bool) in if !d && L.editing { startWiggle(true) } }
        .onAppear { startWiggle(editing) }
    }

    private var reorder: some Gesture {
        LongPressGesture(minimumDuration: 0.17, maximumDistance: 8)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
            .onChanged { (v: SequenceGesture<LongPressGesture, DragGesture>.Value) in
                guard case .second(true, let dv) = v else { return }
                if WxCmp39Layout.shared.dragKey != k { WxCmp39Layout.shared.lift(k) }
                if let d = dv { WxCmp39Layout.shared.move(k, d.translation.height) }
            }
            .onEnded { (_: SequenceGesture<LongPressGesture, DragGesture>.Value) in WxCmp39Layout.shared.drop(store) }
    }

    private func startWiggle(_ on: Bool) {
        if on && !reduce {
            wig = false
            withAnimation(.easeInOut(duration: 0.3).repeatForever(autoreverses: true)) { wig = true }
        } else {
            withAnimation(.easeOut(duration: 0.15)) { wig = false }
        }
    }
}

/// Stiplet boks nederst med skjulte kort og grønn «+».
struct WxCmp39AddBox: View {
    @Environment(Store.self) private var store
    @MainActor private var L: WxCmp39Layout { WxCmp39Layout.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("LEGG TIL KORT").font(.system(size: 11, weight: .bold)).tracking(1.1).opacity(0.7)
            ForEach(L.hiddenList, id: \.self) { (k: String) in
                Button { L.show(k, store) } label: {
                    HStack(spacing: 10) {
                        Text("+").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color(hex: "#0f1b2b"))
                            .frame(width: 26, height: 26).background(Color(hex: "#6fdc8c"), in: Circle())
                        Text(WxCmp39.name(k)).font(.system(size: 15, weight: .semibold))
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.3), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5])))
        .transition(.opacity)
    }
}

/* ---------- Kortene ---------- */

extension View {
    /// Glasskort på himmelen (1b): hvit 10 %, blur og tynn kant.
    func wxGlass39(_ r: CGFloat = 22) -> some View {
        self
            .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: r, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }
}

/// Dagens duell: YR | +1° | STORM med store tall.
struct WxCmp39Hero: View {
    let days: [WxCmp39Day]

    var body: some View {
        let t: WxCmp39Day? = days.first
        HStack(spacing: 0) {
            side("YR", t.map { WxCmp39.deg($0.yH) } ?? "–", t.map { WxCmp39.mm($0.yP) + " mm · min " + WxCmp39.deg($0.yL) } ?? "", yr: true)
            ZStack {
                Rectangle().fill(Color.white.opacity(0.16)).frame(width: 1).padding(.vertical, 14)
                Text(diffText(t)).font(.system(size: 12, weight: .heavy)).lineLimit(1).fixedSize()
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(Color(hex: "#2c4869"), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
            }
            .frame(width: 1)
            .zIndex(1)
            side("STORM", t.map { WxCmp39.deg($0.sH) } ?? "–", t.map { WxCmp39.mm($0.sP) + " mm · min " + WxCmp39.deg($0.sL) } ?? "", yr: false)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .wxGlass39(26)
    }

    private func diffText(_ t: WxCmp39Day?) -> String {
        guard let t else { return "–" }
        let d: Int = Int((t.sH - t.yH).rounded())
        return (d > 0 ? "+" : "") + String(d) + "°"
    }

    private func side(_ name: String, _ big: String, _ sub: String, yr: Bool) -> some View {
        VStack(alignment: yr ? .leading : .trailing, spacing: 6) {
            HStack(spacing: 7) {
                if !yr { Text(name).font(.system(size: 12, weight: .heavy)).tracking(1.2).foregroundStyle(WxCmp39.stT) }
                WxLogo30(asset: yr ? "YrLogo" : "StormLogo", size: 20)
                if yr { Text(name).font(.system(size: 12, weight: .heavy)).tracking(1.2).foregroundStyle(WxCmp39.yrT) }
            }
            Text(big).font(.system(size: 56, weight: .light)).lineLimit(1).minimumScaleFactor(0.6)
            Text(sub).font(.system(size: 13)).opacity(0.8).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: yr ? .leading : .trailing)
        .background(LinearGradient(colors: [(yr ? WxCmp39.yrC : WxCmp39.stC).opacity(0.18), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.75)))
    }
}

/// Enighet: «5 av 7» + prikker per dag.
struct WxCmp39Agree: View {
    let days: [WxCmp39Day]

    var body: some View {
        let n: Int = days.filter { $0.ok }.count
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(n) av \(days.count)").font(.system(size: 34, weight: .light))
                Text("dager der de er enige").font(.system(size: 14)).opacity(0.85)
            }
            HStack(spacing: 6) {
                ForEach(days) { (d: WxCmp39Day) in
                    VStack(spacing: 6) {
                        Text(d.ok ? "✓" : "≠").font(.system(size: 12, weight: .heavy))
                            .foregroundStyle(d.ok ? Color(hex: "#22395a") : Color(hex: "#ffb3a6"))
                            .frame(width: 26, height: 26)
                            .background(d.ok ? Color.white : Color.clear, in: Circle())
                            .overlay(Circle().stroke(d.ok ? Color.white : Color(hex: "#ffb3a6"), lineWidth: 1.5))
                        Text(d.label == "I dag" ? "I D" : String(d.label.prefix(1)).uppercased())
                            .font(.system(size: 10.5, weight: .bold)).opacity(0.7)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .wxGlass39()
    }
}

/// Glimt forklarer: regnbuering med ✦ + teksten.
struct WxCmp39Glimt: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle().fill(AngularGradient(colors: [Color(hex: "#b23a2a"), Color(hex: "#e8794a"), Color(hex: "#f2c14e"), Color(hex: "#3fbf9a"),
                                                       Color(hex: "#4f8fd6"), Color(hex: "#7a5ad6"), Color(hex: "#b23a2a")], center: .center))
                Circle().fill(Color(hex: "#fffdf8")).frame(width: 15, height: 15)
                Text("✦").font(.system(size: 10)).foregroundStyle(Color(hex: "#e0553d"))
            }
            .frame(width: 22, height: 22)
            Text(text).font(.system(size: 14)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .wxGlass39()
    }
}

/// Dag for dag: Temp / Nedbør, midtstilte avvikssøyler og rader som kan åpnes.
struct WxCmp39List: View {
    let days: [WxCmp39Day]
    @State private var tab: String = "t"
    @State private var open: String = ""

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 0) {
                tabButton("t", "Temp")
                tabButton("p", "Nedbør")
            }
            .padding(3)
            .wxGlass39(14)
            VStack(spacing: 0) {
                WxCmp39ListHead()
                ForEach(days) { (d: WxCmp39Day) in
                    WxCmp39Row(d: d, tab: tab, open: open == d.id) {
                        Haptics.shared.select()
                        withAnimation(.easeOut(duration: 0.22)) { open = open == d.id ? "" : d.id }
                    }
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 4)
            .wxGlass39()
        }
        .frame(maxWidth: .infinity)
    }

    private func tabButton(_ k: String, _ t: String) -> some View {
        Button {
            Haptics.shared.select()
            withAnimation(.easeOut(duration: 0.2)) { tab = k }
        } label: {
            Text(t).font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(tab == k ? Color.white : Color.white.opacity(0.7))
                .frame(maxWidth: .infinity).frame(height: 34)
                .background(tab == k ? Color.white.opacity(0.22) : Color.clear, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Overskriften: YR · ← Yr  Storm → · STORM (full bredde, ingenting presses sammen).
struct WxCmp39ListHead: View {
    var body: some View {
        HStack(spacing: 8) {
            Color.clear.frame(width: 44, height: 1)
            Text("YR").foregroundStyle(WxCmp39.yrT).frame(width: 50, alignment: .trailing)
            HStack(spacing: 4) {
                Text("← Yr")
                Spacer(minLength: 4)
                Text("Storm →")
            }
            .frame(maxWidth: .infinity)
            Text("STORM").foregroundStyle(WxCmp39.stT).frame(width: 50, alignment: .leading)
            Color.clear.frame(width: 12, height: 1)
        }
        .font(.system(size: 10.5, weight: .heavy)).tracking(1)
        .lineLimit(1)
        .opacity(0.7)
        .padding(.top, 10).padding(.bottom, 6)
    }
}

struct WxCmp39Row: View {
    let d: WxCmp39Day
    let tab: String
    let open: Bool
    let tap: () -> Void

    var body: some View {
        let yr: String = tab == "t" ? WxCmp39.deg(d.yH) : WxCmp39.mm(d.yP)
        let st: String = tab == "t" ? WxCmp39.deg(d.sH) : WxCmp39.mm(d.sP)
        let df: Double = tab == "t" ? d.dT : d.yP - d.sP
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)
            Button(action: tap) {
                HStack(spacing: 8) {
                    Text(d.label).font(.system(size: 15, weight: .semibold)).frame(width: 44, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
                    Text(yr).font(.system(size: 15, weight: .semibold)).monospacedDigit().frame(width: 50, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.7)
                    WxCmp39Bar(df: df, unit: tab == "t" ? "°" : " mm").frame(maxWidth: .infinity)
                    Text(st).font(.system(size: 15, weight: .semibold)).monospacedDigit().frame(width: 50, alignment: .leading).lineLimit(1).minimumScaleFactor(0.7)
                    Text("›").font(.system(size: 14)).opacity(0.6).rotationEffect(.degrees(open ? 90 : 0)).frame(width: 12)
                }
                .frame(minHeight: 56)
                .padding(.top, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open { details.transition(.opacity) }
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(d.status).font(.system(size: 12.5, weight: .bold)).foregroundStyle(d.ok ? Color(hex: "#8ff0b0") : Color(hex: "#ffb3a6"))
            HStack(spacing: 8) {
                box("YR", WxCmp39.deg(d.yH) + " / " + WxCmp39.deg(d.yL), WxCmp39.mm(d.yP) + " mm", WxCmp39.yrT, WxCmp39.yrC)
                box("STORM", WxCmp39.deg(d.sH) + " / " + WxCmp39.deg(d.sL), WxCmp39.mm(d.sP) + " mm", WxCmp39.stT, WxCmp39.stC)
            }
        }
        .padding(.top, 2).padding(.bottom, 14)
    }

    private func box(_ name: String, _ t: String, _ x: String, _ fg: Color, _ bg: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.system(size: 10.5, weight: .heavy)).tracking(1).foregroundStyle(fg)
            Text(t).font(.system(size: 20, weight: .medium))
            Text(x).font(.system(size: 12.5)).opacity(0.8)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bg.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Midtstilt avvikssøyle: Yr høyere → mot venstre (blå), Storm høyere → mot høyre (oransje).
struct WxCmp39Bar: View {
    let df: Double
    let unit: String

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let W: CGFloat = g.size.width
            let frac: CGFloat = CGFloat(Swift.min(1, abs(df) / 4)) * 0.5
            let w: CGFloat = Swift.max(abs(df) > 0.04 ? 0.015 : 0, frac) * W
            let yrSide: Bool = df > 0
            ZStack(alignment: .topLeading) {
                Capsule().fill(Color.black.opacity(0.2)).frame(width: W, height: 2).offset(y: 10)
                Rectangle().fill(Color.white.opacity(0.3)).frame(width: 1, height: 14).offset(x: W / 2, y: 4)
                Capsule().fill(yrSide ? WxCmp39.yrC : WxCmp39.stC).frame(width: w, height: 10)
                    .offset(x: yrSide ? W / 2 - w : W / 2, y: 6)
                if abs(df) > 0.04 {
                    Text(label).font(.system(size: 10.5, weight: .heavy)).foregroundStyle(yrSide ? WxCmp39.yrT : WxCmp39.stT)
                        .lineLimit(1).fixedSize()
                        .frame(width: W, alignment: .center)
                        .offset(y: -12)
                }
            }
            .animation(.timingCurve(0.3, 0.8, 0.3, 1, duration: 0.35), value: df)
        }
        .frame(height: 22)
    }

    private var label: String {
        let a: Double = abs(df)
        let v: String = unit == "°" ? String(Int(a.rounded())) : WxCmp39.mm(a)
        return (df > 0 ? "+" : "−") + v + unit
    }
}

/// Neste 24 timer (gjenbruker grafen fra Vær).
struct WxCmp39Chart: View {
    let hours: [WxCompare22.Hour]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("NESTE 24 TIMER").font(.system(size: 11, weight: .bold)).tracking(1.1).opacity(0.65)
                Spacer(minLength: 6)
                HStack(spacing: 12) {
                    legend(WxCmp39.yrC, "Yr")
                    legend(WxCmp39.stC, "Storm")
                }
                .font(.system(size: 12, weight: .bold))
            }
            if hours.isEmpty {
                Text("Ingen timedata ennå.").font(.system(size: 13)).opacity(0.7)
            } else {
                WxCompareChart22(hours: hours)
            }
        }
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .wxGlass39()
    }

    private func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 5) {
            Capsule().fill(c).frame(width: 12, height: 3)
            Text(t)
        }
    }
}

/// Nedbør per dag: to søyler per dag.
struct WxCmp39Rain: View {
    let days: [WxCmp39Day]

    var body: some View {
        let pMax: Double = Swift.max(0.5, days.map { Swift.max($0.yP, $0.sP) }.max() ?? 0)
        VStack(alignment: .leading, spacing: 10) {
            Text("NEDBØR · MM PER DAG").font(.system(size: 11, weight: .bold)).tracking(1.1).opacity(0.65)
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(days) { (d: WxCmp39Day) in
                    VStack(spacing: 5) {
                        HStack(alignment: .bottom, spacing: 3) {
                            UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 2, bottomTrailingRadius: 2, topTrailingRadius: 4)
                                .fill(WxCmp39.yrC).frame(width: 9, height: CGFloat(Swift.max(2, d.yP / pMax * 64)))
                            UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 2, bottomTrailingRadius: 2, topTrailingRadius: 4)
                                .fill(WxCmp39.stC).frame(width: 9, height: CGFloat(Swift.max(2, d.sP / pMax * 64)))
                        }
                        .frame(height: 64, alignment: .bottom)
                        Text(d.label == "I dag" ? "I d" : String(d.label.prefix(2))).font(.system(size: 11, weight: .bold)).opacity(0.7)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 92, alignment: .bottom)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .wxGlass39()
    }
}
