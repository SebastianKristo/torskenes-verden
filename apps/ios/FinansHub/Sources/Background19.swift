import Foundation
import SwiftUI
import UIKit

/* ---------------- Dynamiske bakgrunner (prompt 19) ---------------- */
// Fotovinduet henter bakgrunnen fra /api/background: Vær (MET), Planeter (NASA), Oslo (Unsplash/Pexels/egne bilder)
// eller eget bilde. Bildet caches på disk, «Kun på Wi-Fi» hindrer nedlasting av nye bilder på mobilnett,
// og regn/snø-partikler slås av ved Reduser bevegelse og Strømsparingsmodus.

/// Brukerens valg for bakgrunnen. Speiles til /api/me/layout (bgPlanet, bgRotate, bgBlur, bgDim, bgWifiOnly, bgAnimate).
struct BgPrefs: Codable, Equatable {
    var planet: String = "auto"
    var rotate: String = "daily"
    var blur: Double = 0
    var dim: Double = 0
    var wifiOnly: Bool = false
    var animate: Bool = true

    static func load() -> BgPrefs {
        guard let d = UserDefaults.standard.data(forKey: "fh_bg_prefs"), let p = try? JSONDecoder().decode(BgPrefs.self, from: d) else { return BgPrefs() }
        return p
    }

    func save() {
        if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: "fh_bg_prefs") }
    }

    static let planets: [(String, String)] = [("auto", "Bytt automatisk"), ("earth", "Jorda"), ("moon", "Månen"), ("jupiter", "Jupiter"), ("mars", "Mars"), ("saturn", "Saturn")]
}

/// Svaret fra /api/background.
struct BgInfo: Equatable {
    var type: String
    var imageUrl: String
    var fallbacks: [String]
    var creditText: String
    var creditUrl: String
    var themeHint: String
    var gradient: String
    var particles: String
    var weatherKind: String
    var isDay: Bool

    init(_ o: [String: Any]) {
        type = JS.str(o, "type") ?? ""
        imageUrl = JS.str(o, "image_url") ?? ""
        fallbacks = JS.strings(o, "fallbacks")
        let c = JS.dict(o, "credit")
        var text = JS.str(c, "text") ?? ""
        if text.isEmpty { text = JS.str(o, "credit") ?? "" }
        if text.isEmpty, let a = JS.str(c, "author") {
            let src = JS.str(c, "source") ?? ""
            text = src.isEmpty ? "Foto: \(a)" : "Foto: \(a) · \(src)"
        }
        creditText = text
        creditUrl = JS.str(c, "url") ?? ""
        themeHint = JS.str(o, "theme_hint") ?? "dark"
        gradient = JS.str(o, "gradient") ?? ""
        particles = JS.str(o, "particles") ?? ""
        let w = JS.dict(o, "weather")
        weatherKind = JS.str(w, "kind") ?? ""
        isDay = JS.bool(w, "isDay") ?? true
    }

    /// Alle bildeadressene i rekkefølge (uten SVG, som iOS ikke kan vise som bilde).
    var urls: [String] {
        var out: [String] = []
        for u in [imageUrl] + fallbacks where !u.isEmpty && !u.lowercased().hasSuffix(".svg") && !out.contains(u) { out.append(u) }
        return out
    }
}

extension Store {
    /* ---------- Hente bakgrunnen ---------- */

    /// Bildebredde i piksler for skjermen (serveren skalerer og komprimerer).
    static func bgPixelWidth() -> (w: Int, dpr: Int) {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let width: CGFloat = scene?.screen.bounds.width ?? 430
        let scale: CGFloat = scene?.screen.scale ?? 3
        return (w: Int(width), dpr: Int(scale))
    }

    /// Henter bakgrunnen fra /api/background. Gir false når serveren ikke har tjenesten (eldre server).
    func loadBackground(_ kind: String) async -> Bool {
        let size: (w: Int, dpr: Int) = Store.bgPixelWidth()
        var q = "/background?type=\(kind)&w=\(size.w)&dpr=\(size.dpr)"
        if kind == "planets" { q += "&planet=\(bgPrefs.planet)&rotate=\(bgPrefs.rotate)" }
        guard let d = try? await api.callAt("/api", "GET", q) else { return false }
        let o = JS.obj(d)
        guard JS.str(o, "type") != nil else { return false }
        let info = BgInfo(o)
        bgInfo = info
        // Gradient og værsymbol brukes fortsatt av reserven og «Vær nå»-teksten.
        let w = JS.dict(o, "weather")
        photoWindow = PhotoWindow(["kind": kind, "url": info.imageUrl, "credit": info.creditText, "gradient": info.gradient, "symbol": JS.str(w, "symbol") ?? ""], kind: kind)
        let urls = info.urls
        if urls.isEmpty { photoImage = nil; return true }
        // Samme bilde som sist: bruk cachen uten å laste ned på nytt.
        let lastKey = "fh_bg_url_\(kind)"
        if let cached = Store.cachedBg(kind), UserDefaults.standard.string(forKey: lastKey) == urls[0] {
            photoImage = cached
            return true
        }
        // «Kun på Wi-Fi»: ingen nye bilder på mobilnett. Det forrige bildet (eller gradienten) vises.
        if bgPrefs.wifiOnly && !onWifi {
            if photoImage == nil { photoImage = Store.cachedBg(kind) }
            return true
        }
        for u in urls {
            if let img = await loadBg(u) {
                photoImage = img
                Store.storeBg(kind, img)
                UserDefaults.standard.set(urls[0], forKey: lastKey)
                return true
            }
        }
        print("[Papir] Fikk ikke lastet bakgrunnsbildet (\(kind)): \(urls.joined(separator: ", "))")
        if photoImage == nil { photoFailed = true }
        return true
    }

    /// Prompt 21: ekte foto i Ruter-visningen (/api/background?type=ruter). Hentes én gang per oppstart;
    /// uten svar (eldre server) vises den rolige røde gradienten.
    func loadRuterBackground() async {
        if ruterBgTried { return }
        ruterBgTried = true
        let size: (w: Int, dpr: Int) = Store.bgPixelWidth()
        guard let d = try? await api.callAt("/api", "GET", "/background?type=ruter&w=\(size.w)&dpr=\(size.dpr)") else { return }
        let info: BgInfo = BgInfo(JS.obj(d))
        let urls: [String] = info.urls
        guard let first = urls.first else { return }
        if UserDefaults.standard.string(forKey: "fh_bg_url_ruter") == first, ruterImage != nil { return }
        if bgPrefs.wifiOnly && !onWifi { return }
        for u in urls {
            if let img = await loadBg(u) {
                ruterImage = img
                Store.storeBg("ruter", img)
                UserDefaults.standard.set(first, forKey: "fh_bg_url_ruter")
                return
            }
        }
    }

    /// Forhåndsvisning av hver type i Innstillinger → Bakgrunn (/api/background/previews).
    func loadBgPreviews() async {
        guard let d = try? await api.callAt("/api", "GET", "/background/previews") else { return }
        let o = JS.obj(d)
        for kind in ["weather", "planets", "oslo", "custom"] {
            guard let p = JS.dict(o, kind) else { continue }
            let info = BgInfo(p)
            guard let u = info.urls.first else { continue }
            if let cached = Store.cachedBg("prev-\(kind)"), UserDefaults.standard.string(forKey: "fh_bg_prev_\(kind)") == u {
                bgPreviews[kind] = cached
                continue
            }
            if bgPrefs.wifiOnly && !onWifi { continue }
            if let img = await loadBg(u) {
                let small = img.scaled(max: 400)
                bgPreviews[kind] = small
                Store.storeBg("prev-\(kind)", small)
                UserDefaults.standard.set(u, forKey: "fh_bg_prev_\(kind)")
            }
        }
    }

    /* ---------- Innstillingene ---------- */

    /// bg*-feltene fra /api/me/layout.
    func applyPaper19(_ o: [String: Any]) {
        var p = bgPrefs
        if let v = JS.str(o, "bgPlanet"), BgPrefs.planets.contains(where: { $0.0 == v }) { p.planet = v }
        if let v = JS.str(o, "bgRotate"), ["daily", "hourly"].contains(v) { p.rotate = v }
        if let v = JS.num(o, "bgBlur") { p.blur = min(20, max(0, v)) }
        if let v = JS.num(o, "bgDim") { p.dim = min(60, max(0, v)) }
        if let v = JS.bool(o, "bgWifiOnly") { p.wifiOnly = v }
        if let v = JS.bool(o, "bgAnimate") { p.animate = v }
        if p != bgPrefs { bgPrefs = p }
    }

    func setBgPlanet(_ v: String) {
        bgPrefs.planet = v
        savePaperLayout(["bgPlanet": v])
        Haptics.shared.select()
        Task { await self.loadPhotoWindow() }
    }

    func setBgRotate(_ v: String) {
        bgPrefs.rotate = v
        savePaperLayout(["bgRotate": v])
        Haptics.shared.select()
        Task { await self.loadPhotoWindow() }
    }

    func setBgBlur(_ v: Double) {
        bgPrefs.blur = v
        savePaperLayout(["bgBlur": Int(v.rounded())])
    }

    func setBgDim(_ v: Double) {
        bgPrefs.dim = v
        savePaperLayout(["bgDim": Int(v.rounded())])
    }

    func setBgWifiOnly(_ v: Bool) {
        bgPrefs.wifiOnly = v
        savePaperLayout(["bgWifiOnly": v])
    }

    func setBgAnimate(_ v: Bool) {
        bgPrefs.animate = v
        savePaperLayout(["bgAnimate": v])
    }

    /// Tekstfargen i fotovinduet: mørk på lyse bilder uten mørklegging, ellers hvit.
    var heroInk: Color {
        if photo != "cur", photoImage != nil, bgInfo?.themeHint == "light", bgPrefs.dim < 25 { return Color(hex: "#1b1a17") }
        return .white
    }
}

/* ---------------- Visning ---------------- */

/// Bildet i fotovinduet med uskarphet, mørklegging, dempet Papir-uttrykk og papirtekstur.
struct BgPhotoLayer: View {
    @Environment(Store.self) private var store
    let image: UIImage

    var body: some View {
        ZStack {
            Color.clear.overlay {
                Image(uiImage: image).resizable().scaledToFill()
                    .saturation(0.75)
                    .blur(radius: CGFloat(store.bgPrefs.blur), opaque: true)
            }
            .clipped()
            Color.black.opacity(store.bgPrefs.dim / 100)
            PaperGrain().opacity(0.10).blendMode(.multiply)
            if let kind = particleKind { BgParticles(kind: kind) }
        }
    }

    private var particleKind: String? {
        guard store.bgPrefs.animate else { return nil }
        let k = store.bgInfo?.particles ?? ""
        return k == "rain" || k == "snow" ? k : nil
    }
}

/// Svak papirtekstur: små korn tegnet én gang (ingen animasjon).
struct PaperGrain: View {
    var body: some View {
        Canvas { ctx, size in
            var rng = SeededRandom(seed: 7)
            let count = Int(size.width * size.height / 90)
            for _ in 0..<count {
                let x = CGFloat(rng.next()) * size.width
                let y = CGFloat(rng.next()) * size.height
                let a = 0.25 + rng.next() * 0.5
                ctx.fill(Path(CGRect(x: x, y: y, width: 1, height: 1)), with: .color(Color(hex: "#6b5a3e").opacity(a)))
            }
        }
        .allowsHitTesting(false)
    }
}

/// Enkel deterministisk tallgenerator, så teksturen og partiklene ser like ut hver gang.
struct SeededRandom {
    var state: UInt64
    init(seed: UInt64) { state = seed &* 6364136223846793005 &+ 1442695040888963407 }
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double((state >> 33) & 0xFFFFFF) / Double(0xFFFFFF)
    }
}

/// Diskret regn eller snø. Slås av ved Reduser bevegelse og Strømsparingsmodus.
struct BgParticles: View {
    let kind: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled

    var body: some View {
        Group {
            if reduceMotion || lowPower {
                Color.clear
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                    Canvas { ctx, size in
                        draw(ctx, size, tl.date.timeIntervalSinceReferenceDate)
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)) { _ in
            lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        }
    }

    private func draw(_ ctx: GraphicsContext, _ size: CGSize, _ t: Double) {
        var rng = SeededRandom(seed: kind == "snow" ? 11 : 3)
        let snow = kind == "snow"
        let count = snow ? 60 : 90
        let speed: Double = snow ? 28 : 260
        for _ in 0..<count {
            let x0 = rng.next() * Double(size.width)
            let y0 = rng.next() * Double(size.height)
            let v = speed * (0.6 + rng.next() * 0.8)
            let h = Double(size.height) + 20
            let y = (y0 + t * v).truncatingRemainder(dividingBy: h) - 10
            if snow {
                let x = x0 + sin(t * 0.8 + x0) * 8
                let r = 1.2 + rng.next() * 1.8
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: r, height: r)), with: .color(.white.opacity(0.7)))
            } else {
                var line = Path()
                line.move(to: CGPoint(x: x0, y: y))
                line.addLine(to: CGPoint(x: x0 - 2, y: y + 12))
                ctx.stroke(line, with: .color(.white.opacity(0.35)), lineWidth: 1)
            }
        }
    }
}

/// Liten kreditering nederst i fotovinduet (f.eks. «Foto: Ola Nordmann · Unsplash» eller «NASA»).
struct BgCredit: View {
    @Environment(Store.self) private var store

    var body: some View {
        if let c = store.bgInfo?.creditText, !c.isEmpty, store.photoImage != nil, store.photo != "cur" {
            Button {
                if let u = URL(string: store.bgInfo?.creditUrl ?? ""), u.scheme?.hasPrefix("http") == true { UIApplication.shared.open(u) }
            } label: {
                Text(c).font(PF.ui(9.5)).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
                    .shadow(color: .black.opacity(0.5), radius: 3)
            }
            .buttonStyle(.plain)
        }
    }
}

/// Innstillinger → Utseende → Bakgrunn: planet, bytte, uskarphet, mørklegging, Wi-Fi og animasjon.
struct BgTuning: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if store.photo == "planets" { planetRow }
            sliderRow("Uskarphet", value: blurBinding, range: 0...20, unit: " px") { store.setBgBlur(store.bgPrefs.blur) }
            sliderRow("Mørklegging", value: dimBinding, range: 0...60, unit: " %") { store.setBgDim(store.bgPrefs.dim) }
            Toggle(isOn: wifiBinding) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Kun på Wi-Fi").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Text("Nye bilder lastes ikke ned på mobilnett").font(PF.ui(12)).foregroundStyle(p.mut)
                }
            }
            Toggle(isOn: animateBinding) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Animasjon").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Text("Regn og snø når det er vær for det").font(PF.ui(12)).foregroundStyle(p.mut)
                }
            }
            if let c = store.bgInfo?.creditText, !c.isEmpty {
                Text(c).font(PF.ui(12)).foregroundStyle(p.mut)
            }
        }
        .tint(p.pos)
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.top, 8)
    }

    private var planetRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Planet").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(BgPrefs.planets, id: \.0) { pl in chip(pl.1, on: store.bgPrefs.planet == pl.0) { store.setBgPlanet(pl.0) } }
                }
            }
            if store.bgPrefs.planet == "auto" {
                HStack(spacing: 6) {
                    chip("Hver dag", on: store.bgPrefs.rotate == "daily") { store.setBgRotate("daily") }
                    chip("Hver time", on: store.bgPrefs.rotate == "hourly") { store.setBgRotate("hourly") }
                }
            }
        }
    }

    private func chip(_ t: String, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : p.line.opacity(0.6), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func sliderRow(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String, commit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(title).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Spacer()
                Text("\(Int(value.wrappedValue.rounded()))\(unit)").font(PF.mono(12.5)).foregroundStyle(p.mut)
            }
            Slider(value: value, in: range, step: 1) { editing in
                if !editing { commit() }
            }
        }
    }

    private var blurBinding: Binding<Double> {
        Binding(get: { store.bgPrefs.blur }, set: { store.bgPrefs.blur = $0 })
    }
    private var dimBinding: Binding<Double> {
        Binding(get: { store.bgPrefs.dim }, set: { store.bgPrefs.dim = $0 })
    }
    private var wifiBinding: Binding<Bool> {
        Binding(get: { store.bgPrefs.wifiOnly }, set: { store.setBgWifiOnly($0) })
    }
    private var animateBinding: Binding<Bool> {
        Binding(get: { store.bgPrefs.animate }, set: { store.setBgAnimate($0) })
    }
}
