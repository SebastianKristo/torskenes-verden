import SwiftUI

/// Et land fra world-atlas (TopoJSON): ISO 3166-1 numerisk ID, navn og ringer i (lengdegrad, breddegrad).
struct MapCountry: Identifiable {
    let id: Int
    let name: String
    let rings: [[CGPoint]]

    /// TopoJSON → land. Buene er delta-kodet og kvantisert (transform.scale/translate); negativ bueindeks = baklengs.
    static func parse(_ data: Data) -> [MapCountry]? {
        guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let raw = o["arcs"] as? [[[Double]]],
              let objects = o["objects"] as? [String: Any],
              let countries = objects["countries"] as? [String: Any],
              let geoms = countries["geometries"] as? [[String: Any]] else { return nil }
        let tr = o["transform"] as? [String: Any]
        let scale = tr?["scale"] as? [Double] ?? [1, 1]
        let move = tr?["translate"] as? [Double] ?? [0, 0]
        let quantized = tr != nil && scale.count == 2 && move.count == 2
        let arcs: [[CGPoint]] = raw.map { arc in
            var x = 0.0, y = 0.0
            return arc.compactMap { p in
                guard p.count >= 2 else { return nil }
                if quantized { x += p[0]; y += p[1]; return CGPoint(x: x * scale[0] + move[0], y: y * scale[1] + move[1]) }
                return CGPoint(x: p[0], y: p[1])
            }
        }
        func ring(_ idx: [Int]) -> [CGPoint] {
            var out: [CGPoint] = []
            for (k, i) in idx.enumerated() {
                let j = i >= 0 ? i : ~i
                guard j < arcs.count else { continue }
                var pts = i >= 0 ? arcs[j] : Array(arcs[j].reversed())
                if k > 0, !pts.isEmpty { pts.removeFirst() }
                out += pts
            }
            return out
        }
        var list: [MapCountry] = []
        for g in geoms {
            let idAny = g["id"]
            let id = (idAny as? Int) ?? (idAny as? String).flatMap { Int($0) } ?? -1
            if id == 10 { continue } // Antarktis tar bare plass
            let name = (g["properties"] as? [String: Any])?["name"] as? String ?? ""
            var rings: [[CGPoint]] = []
            switch g["type"] as? String {
            case "Polygon": for r in (g["arcs"] as? [[Int]]) ?? [] { rings.append(ring(r)) }
            case "MultiPolygon": for poly in (g["arcs"] as? [[[Int]]]) ?? [] { for r in poly { rings.append(ring(r)) } }
            default: break
            }
            rings = rings.filter { $0.count > 2 }
            if !rings.isEmpty { list.append(MapCountry(id: id, name: name, rings: rings)) }
        }
        return list
    }
}

/// Verdenskart over besøk per land: logaritmisk skala fra mørk til lys rosa. Trykk på et land viser navn og antall besøk.
struct WorldMapView: View {
    let countries: [MapCountry]
    /// Besøk per land, nøkkel = ISO 3166-1 numerisk.
    let values: [Int: (name: String, visitors: Double)]
    var lo: UInt32 = 0x4A2433
    var hi: UInt32 = 0xFFB1C8
    var empty = Color(hex: "#2E2328")
    var stroke = Color(hex: "#120C0F")
    @State private var picked: Int?

    var body: some View {
        GeometryReader { g in
            let size = g.size
            let maxV = Swift.max(2, values.values.map(\.visitors).max() ?? 2)
            Canvas { ctx, sz in
                for c in countries {
                    let p = Self.path(c, sz)
                    ctx.fill(p, with: .color(fill(c.id, maxV)))
                    ctx.stroke(p, with: .color(picked == c.id ? Color.white : stroke), lineWidth: picked == c.id ? 1.2 : 0.4)
                }
            }
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { e in
                let hit = countries.last { Self.path($0, size).contains(e.location) }?.id
                withAnimation(.easeOut(duration: 0.15)) { picked = hit == picked ? nil : hit }
            })
            .overlay(alignment: .topLeading) {
                if let id = picked, let c = countries.first(where: { $0.id == id }) {
                    let v = values[id]
                    VStack(alignment: .leading, spacing: 2) {
                        Text(v?.name.isEmpty == false ? v!.name : c.name).font(.footnote.weight(.semibold))
                        Text(v.map { "\(count($0.visitors)) besøk" } ?? "Ingen besøk").font(.caption).foregroundStyle(.white.opacity(0.75))
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8).glass(14).padding(6)
                }
            }
            .accessibilityElement()
            .accessibilityLabel("Verdenskart med besøk per land")
            .accessibilityValue(values.values.sorted { $0.visitors > $1.visitors }.prefix(5).map { "\($0.name) \(count($0.visitors))" }.joined(separator: ", "))
        }
        .aspectRatio(2.4, contentMode: .fit)
    }

    private func fill(_ id: Int, _ maxV: Double) -> Color {
        guard let v = values[id]?.visitors, v > 0 else { return empty }
        let t = log(Swift.max(1, v)) / log(maxV)
        return Self.mix(lo, hi, Swift.min(1, Swift.max(0, t)))
    }

    static func mix(_ a: UInt32, _ b: UInt32, _ t: Double) -> Color {
        func ch(_ v: UInt32, _ s: UInt32) -> Double { Double((v >> s) & 0xFF) / 255 }
        return Color(red: ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t, green: ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t, blue: ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t)
    }

    /// Enkel plate carrée fra 84° N til 58° S. Ringer som krysser datolinjen (Russland, Fiji) rulles ut og klippes i kanten.
    static func path(_ c: MapCountry, _ sz: CGSize) -> Path {
        var p = Path()
        for r in c.rings {
            let wraps = r.contains { $0.x > 170 } && r.contains { $0.x < -170 }
            for (i, pt) in r.enumerated() {
                let lon = wraps && pt.x < 0 ? pt.x + 360 : pt.x
                let q = CGPoint(x: (lon + 180) / 360 * sz.width, y: (84 - pt.y) / 142 * sz.height)
                if i == 0 { p.move(to: q) } else { p.addLine(to: q) }
            }
            p.closeSubpath()
        }
        return p
    }
}

/// Kartkortet i Domener → Besøk: laster landene én gang.
struct VisitsMap: View {
    @Environment(Store.self) private var store
    let a: Analytics
    @State private var countries: [MapCountry] = []
    @State private var loaded = false
    private var vals: [Int: (name: String, visitors: Double)] {
        var out: [Int: (name: String, visitors: Double)] = [:]
        for c in a.countries ?? [] {
            if let n = c.iso3n.flatMap({ Int($0.value) }) { out[n] = (c.name ?? "", c.visitors ?? 0) }
        }
        return out
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("BESØK PER LAND").font(.footnote.weight(.semibold)).foregroundStyle(Color.domPink)
            if countries.isEmpty {
                Text(loaded ? "Kartet kunne ikke lastes." : "Laster kartet …").font(.footnote).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity, minHeight: 120)
            } else {
                WorldMapView(countries: countries, values: vals)
                HStack(spacing: 6) {
                    Text("Få").font(.caption2).foregroundStyle(.white.opacity(0.6))
                    LinearGradient(colors: [Color(hex: "#4a2433"), Color(hex: "#FFB1C8")], startPoint: .leading, endPoint: .trailing).frame(height: 6).clipShape(Capsule())
                    Text("Mange").font(.caption2).foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
        .task { if countries.isEmpty { countries = await store.worldMap(); loaded = true } }
    }
}
