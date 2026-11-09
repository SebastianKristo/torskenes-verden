import SwiftUI
import UIKit

/* ---------------- Prompt 76 (SKJIOS): tegningen av skapet og bildet med uthevingen lagt over ----------------
 – Tegning: mørk ramme og lyse skuffer med håndtak i skapets proporsjoner (Raaco 150-01: skuff ca. 61 × 46 mm foran).
   Rad 1 øverst og skuff 1 til venstre, med tall langs kanten. Valgt skuff i aksentfarge, puls i 2 s (bare scale/opacity).
 – Bilde: skapets bilde med rutenettet perspektivmappet fra de 4 hjørnene (Skj76Homography → ProjectionTransform).
   Trykk på bildet regnes tilbake gjennom homografien til rad og skuff. */

enum Skj76Look {
    static let frame: Color = Color(hex: "#1d1d1f")
    static let drawer: Color = Color(hex: "#e8ecee")
    static let drawerLine: Color = Color(hex: "#b9c1c6")
    static let handle: Color = Color(hex: "#8d979d")
    /// Bredde / høyde for én skuff (forsiden).
    static let aspect: CGFloat = 1.33
}

/// Rutenettet som tegning. `pick` gjør skuffene trykkbare; `mark` er skuffen som utheves.
struct Skj76Drawing: View {
    @Environment(\.paper) private var p
    let rows: Int
    let cols: Int
    let map: Skj76Map?
    let mark: Skj76Loc?
    let pulse: Int
    var pick: ((Int, Int) -> Void)? = nil

    var body: some View {
        VStack(spacing: 0) {
            header
            ForEach(1...Swift.max(1, rows), id: \.self) { (r: Int) in
                row(r)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        HStack(spacing: 3) {
            Color.clear.frame(width: 18, height: 14)
            HStack(spacing: 3) {
                ForEach(1...Swift.max(1, cols), id: \.self) { (c: Int) in
                    Text("\(c)").font(PF.mono(9.5)).foregroundStyle(markCol == c ? p.lab : p.mut).frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 7)
        }
        .padding(.bottom, 3)
    }

    private var markCol: Int { mark?.col ?? -1 }
    private var markRow: Int { mark?.row ?? -1 }

    private func row(_ r: Int) -> some View {
        let top: CGFloat = r == 1 ? 7 : 1.5
        let bottom: CGFloat = r == rows ? 7 : 1.5
        let shape: UnevenRoundedRectangle = UnevenRoundedRectangle(topLeadingRadius: r == 1 ? 8 : 0, bottomLeadingRadius: r == rows ? 8 : 0,
                                                                    bottomTrailingRadius: r == rows ? 8 : 0, topTrailingRadius: r == 1 ? 8 : 0)
        return HStack(spacing: 3) {
            Text("\(r)").font(PF.mono(9.5)).foregroundStyle(markRow == r ? p.lab : p.mut).frame(width: 18)
            HStack(spacing: 3) {
                ForEach(1...Swift.max(1, cols), id: \.self) { (c: Int) in
                    cell(r, c)
                }
            }
            .padding(.horizontal, 7).padding(.top, top).padding(.bottom, bottom)
            .background(Skj76Look.frame, in: shape)
        }
    }

    private func cell(_ r: Int, _ c: Int) -> some View {
        let d: Skj76Drawer = map?.drawer(r, c) ?? Skj76Drawer(row: r, col: c)
        let on: Bool = markRow == r && markCol == c
        return Skj76Cell(d: d, on: on, pulse: pulse)
            .contentShape(Rectangle())
            .onTapGesture { pick?(r, c) }
            .accessibilityLabel("Rad \(r) · Skuff \(c)" + (d.count > 0 ? ", \(d.count) deler" : ", tom"))
            .accessibilityAddTraits(pick == nil ? [] : .isButton)
    }
}

/// Én skuff: lys front, skillevegger, håndtak og antall deler.
struct Skj76Cell: View {
    @Environment(\.paper) private var p
    let d: Skj76Drawer
    let on: Bool
    let pulse: Int
    @State private var ring: Bool = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(on ? p.lab : fill)
            RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(on ? p.lab : Skj76Look.drawerLine, lineWidth: 0.8)
            walls
            VStack(spacing: 1) {
                Text(d.label.isEmpty ? (d.count > 0 ? "\(d.count)" : "") : d.label)
                    .font(PF.mono(8)).foregroundStyle(on ? Color.white : Color(hex: "#3a4246")).lineLimit(1).minimumScaleFactor(0.5)
                Capsule().fill(on ? Color.white.opacity(0.85) : Skj76Look.handle).frame(width: 14, height: 3)
            }
            .padding(.horizontal, 2)
            if on {
                RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(p.lab, lineWidth: 2)
                    .scaleEffect(ring ? 1.35 : 1)
                    .opacity(ring ? 0 : 0.9)
            }
        }
        .aspectRatio(Skj76Look.aspect, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .onAppear { start() }
        .onChange(of: pulse) { (_: Int, _: Int) in start() }
    }

    private var fill: Color {
        if !d.color.isEmpty { return Color(hex: d.color).opacity(0.45) }
        return d.count > 0 ? Skj76Look.drawer : Skj76Look.drawer.opacity(0.78)
    }

    private var walls: some View {
        HStack(spacing: 0) {
            ForEach(0..<Swift.max(1, d.comps), id: \.self) { (i: Int) in
                if i > 0 { Rectangle().fill(Skj76Look.drawerLine).frame(width: 0.8) }
                Color.clear
            }
        }
        .padding(.vertical, 3)
    }

    /// Puls i 2 s: 4 × 0,5 s, bare scale og opacity.
    private func start() {
        guard on else { return }
        ring = false
        withAnimation(.easeOut(duration: 0.5).repeatCount(4, autoreverses: false)) { ring = true }
    }
}

/// Bildet av skapet med rutenettet lagt over (perspektiv fra hjørnene). Trykk velger skuff.
struct Skj76PhotoView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let cab: Skj76Cabinet
    let mark: Skj76Loc?
    let pulse: Int
    var pick: ((Int, Int) -> Void)? = nil
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            if let img {
                photo(img)
            } else {
                RoundedRectangle(cornerRadius: 12).fill(p.line.opacity(0.4)).frame(height: 220)
                ProgressView()
            }
        }
        .task(id: cab.photoUrl) {
            if cab.photoUrl.isEmpty { img = nil; return }
            img = await Skj76Images.shared.load(cab.photoUrl, store)
        }
    }

    private func photo(_ img: UIImage) -> some View {
        let ratio: CGFloat = img.size.height > 0 ? img.size.width / img.size.height : 1
        return GeometryReader { (g: GeometryProxy) in
            let s: CGSize = g.size
            ZStack(alignment: .topLeading) {
                Image(uiImage: img).resizable().frame(width: s.width, height: s.height)
                Skj76GridOverlay(rows: cab.rows, cols: cab.cols, mark: mark, pulse: pulse)
                    .frame(width: s.width, height: s.height)
                    .projectionEffect(projection(s))
                    .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { (pt: CGPoint) in tapped(pt, s) }
        }
        .aspectRatio(ratio, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func homography(_ s: CGSize) -> Skj76Homography? {
        let q: [CGPoint] = cab.corners.map { CGPoint(x: $0.x * s.width, y: $0.y * s.height) }
        return Skj76Homography.square(to: q)
    }

    private func projection(_ s: CGSize) -> ProjectionTransform {
        guard let h = homography(s), s.width > 0, s.height > 0 else { return ProjectionTransform() }
        return h.projection(s.width, s.height)
    }

    private func tapped(_ pt: CGPoint, _ s: CGSize) {
        guard let pick, let h = homography(s), let uv = h.invert(pt) else { return }
        guard uv.x >= 0, uv.x < 1, uv.y >= 0, uv.y < 1 else { return }
        let r: Int = Int(uv.y * CGFloat(cab.rows)) + 1
        let c: Int = Int(uv.x * CGFloat(cab.cols)) + 1
        pick(r, c)
    }
}

/// Rutenettet som legges over bildet (tegnes i w × h og mappes med projectionEffect).
struct Skj76GridOverlay: View {
    @Environment(\.paper) private var p
    let rows: Int
    let cols: Int
    let mark: Skj76Loc?
    let pulse: Int
    @State private var ring: Bool = false

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let cw: CGFloat = g.size.width / CGFloat(Swift.max(1, cols))
            let rh: CGFloat = g.size.height / CGFloat(Swift.max(1, rows))
            ZStack(alignment: .topLeading) {
                lines(g.size, cw, rh)
                if let m = mark, m.row >= 1, m.row <= rows, m.col >= 1, m.col <= cols {
                    let rect: CGRect = CGRect(x: CGFloat(m.col - 1) * cw, y: CGFloat(m.row - 1) * rh, width: cw, height: rh)
                    Rectangle().fill(p.lab.opacity(0.55)).frame(width: rect.width, height: rect.height).offset(x: rect.minX, y: rect.minY)
                    Rectangle().stroke(p.lab, lineWidth: 3).frame(width: rect.width, height: rect.height)
                        .scaleEffect(ring ? 1.3 : 1).opacity(ring ? 0 : 1)
                        .offset(x: rect.minX, y: rect.minY)
                }
            }
        }
        .onAppear { start() }
        .onChange(of: pulse) { (_: Int, _: Int) in start() }
    }

    private func lines(_ s: CGSize, _ cw: CGFloat, _ rh: CGFloat) -> some View {
        Path { (path: inout Path) in
            for c in 0...Swift.max(1, cols) {
                path.move(to: CGPoint(x: CGFloat(c) * cw, y: 0))
                path.addLine(to: CGPoint(x: CGFloat(c) * cw, y: s.height))
            }
            for r in 0...Swift.max(1, rows) {
                path.move(to: CGPoint(x: 0, y: CGFloat(r) * rh))
                path.addLine(to: CGPoint(x: s.width, y: CGFloat(r) * rh))
            }
        }
        .stroke(Color.white.opacity(0.75), lineWidth: 1)
    }

    private func start() {
        ring = false
        withAnimation(.easeOut(duration: 0.5).repeatCount(4, autoreverses: false)) { ring = true }
    }
}

/// Skapet med bryter «Tegning / Bilde» (bilde bare når skapet har bilde med hjørner).
struct Skj76CabinetView: View {
    @Environment(\.paper) private var p
    let cab: Skj76Cabinet
    let map: Skj76Map?
    let mark: Skj76Loc?
    let pulse: Int
    @Binding var photoMode: Bool
    var pick: ((Int, Int) -> Void)? = nil

    var body: some View {
        let canPhoto: Bool = !cab.photoUrl.isEmpty && cab.corners.count == 4
        VStack(alignment: .leading, spacing: 10) {
            if canPhoto {
                Picker("Visning", selection: $photoMode) {
                    Text("Tegning").tag(false)
                    Text("Bilde").tag(true)
                }
                .pickerStyle(.segmented)
            }
            if canPhoto && photoMode {
                Skj76PhotoView(cab: cab, mark: mark, pulse: pulse, pick: pick)
            } else {
                Skj76Drawing(rows: map?.rows ?? cab.rows, cols: map?.cols ?? cab.cols, map: map, mark: mark, pulse: pulse, pick: pick)
                    .frame(maxWidth: CGFloat(cab.cols) * 78 + 40)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}

/* ---------- Bilder med app-token (filene serveres bare til eieren) ---------- */

@MainActor
final class Skj76Images {
    static let shared = Skj76Images()
    private var cache: [String: UIImage] = [:]

    func load(_ path: String, _ store: Store) async -> UIImage? {
        if path.isEmpty { return nil }
        if let i = cache[path] { return i }
        guard let img = await store.image(path) else { return nil }
        if cache.count > 200 { cache.removeAll() }
        cache[path] = img
        return img
    }

    func forget(_ path: String) { cache[path] = nil }
}

struct Skj76Thumb: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let path: String
    var size: CGFloat = 52
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(p.line.opacity(0.35))
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Image(systemName: "shippingbox").font(.system(size: size * 0.38)).foregroundStyle(p.mut)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .task(id: path) { img = await Skj76Images.shared.load(path, store) }
    }
}
