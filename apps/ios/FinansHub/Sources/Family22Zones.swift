import SwiftUI
import UIKit
import CoreLocation

/* ---------------- Prompt 22: Soner-fanen (kort, redigering i kortet, ikon, farge, radius, varsel) ---------------- */

extension FamilyModel {
    /// Endringer i en sone lagres med en gang (PATCH). Ikonet lagres også lokalt, i tilfelle serveren ikke har feltet ennå.
    func updateZone22(_ z: FamZone, _ store: Store) {
        if let i = zones.firstIndex(where: { $0.id == z.id }) { zones[i] = z }
        Fam22Local.setIcon(z.id, z.icon)
        let e: String = z.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? z.id
        let body: [String: Any] = ["name": z.name, "lat": z.lat, "lon": z.lon, "radius": z.radius, "color": z.color, "icon": z.icon, "shared": z.shared]
        zoneSave22[z.id]?.cancel()
        zoneSave22[z.id] = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            do {
                _ = try await store.api.callAt("/api", "PATCH", "/family/zones/\(e)", json: body)
            } catch {
                store.flash("Kunne ikke lagre sonen: \(error.localizedDescription)")
            }
        }
    }

    func createZone22(_ d: Fam22Draft, _ store: Store) {
        let name: String = d.name.trimmingCharacters(in: .whitespaces).isEmpty ? "Sone \(zones.count + 1)" : d.name.trimmingCharacters(in: .whitespaces)
        let icon: String = Fam22Icons.valid(d.icon) ?? Fam22Icons.defaultFor(name)
        let body: [String: Any] = ["name": name, "lat": d.lat, "lon": d.lon, "radius": d.radius, "color": d.color, "icon": icon, "shared": d.shared]
        draft22 = nil
        Task { @MainActor in
            do {
                let data: Data = try await store.api.callAt("/api", "POST", "/family/zones", json: body)
                let o: [String: Any] = JS.obj(data)
                let id: String? = JS.str(o, "id") ?? JS.str(JS.dict(o, "zone"), "id")
                if let id { Fam22Local.setIcon(id, icon) }
                store.flash("\(name) er lagret")
                await self.load(store)
            } catch {
                store.flash("Kunne ikke lagre sonen: \(error.localizedDescription)")
            }
        }
    }
}

/// Ikonrutenettet (13 ikoner). Valgt ikon: fylt i sonefargen med hvitt ikon.
struct Fam22IconGrid: View {
    @Environment(\.paper) private var p
    let selected: String
    let color: String
    let cell: CGFloat
    let glyph: CGFloat
    let pick: (String) -> Void

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        let cols: [GridItem] = [GridItem(.adaptive(minimum: cell), spacing: 6)]
        LazyVGrid(columns: cols, spacing: 6) {
            ForEach(Fam22Icons.keys, id: \.self) { k in
                cellView(t, k)
            }
        }
    }

    private func cellView(_ t: Fam22Tok, _ k: String) -> some View {
        let on: Bool = k == selected
        let c: Color = Color(hex: color)
        return Button { pick(k) } label: {
            Fam22Glyph(d: Fam22Icons.d(k), size: glyph, stroke: 1.9, color: on ? Color.white : t.ink)
                .frame(maxWidth: .infinity)
                .frame(height: cell)
                .background(RoundedRectangle(cornerRadius: 12).fill(on ? c : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(on ? c : t.line, lineWidth: 2))
                .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Fam22Icons.name(k))
    }
}

/// 10 farger + regnbuerunding (fri fargevelger) og hex-koden.
struct Fam22ColorRow: View {
    @Environment(\.paper) private var p
    let color: String
    let size: CGFloat
    let pick: (String) -> Void

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        let custom: Bool = !Fam22Icons.palette.contains(color.lowercased())
        Fam22Flow(spacing: 6) {
            ForEach(Fam22Icons.palette, id: \.self) { c in
                Button { pick(c) } label: { swatch(t, Color(hex: c), on: color.lowercased() == c) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Farge")
            }
            rainbow(t, on: custom)
            Text(color).font(PF.mono(12)).foregroundStyle(t.mut).fixedSize()
        }
    }

    private func swatch(_ t: Fam22Tok, _ c: Color, on: Bool) -> some View {
        ZStack {
            Circle().fill(c)
            Circle().inset(by: 3).strokeBorder(t.card, lineWidth: 2)
            Circle().strokeBorder(on ? t.ink : Color.clear, lineWidth: 3)
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
    }

    private func rainbow(_ t: Fam22Tok, on: Bool) -> some View {
        let grad: AngularGradient = AngularGradient(colors: [Color(hex: "#ff4444"), Color(hex: "#ffdd00"), Color(hex: "#44cc44"), Color(hex: "#00ccff"), Color(hex: "#4444ff"), Color(hex: "#cc44ff"), Color(hex: "#ff4444")], center: .center, startAngle: .degrees(-90), endAngle: .degrees(270))
        let binding: Binding<Color> = Binding<Color>(get: { Color(hex: color) }, set: { pick(Fam22Fmt.hex($0)) })
        return ZStack {
            Circle().fill(grad)
            Circle().inset(by: 3).strokeBorder(t.card, lineWidth: 2)
            Circle().strokeBorder(on ? t.ink : Color.clear, lineWidth: 3)
            // Den usynlige systemvelgeren ligger over regnbuerundingen og åpner fri fargevalg.
            ColorPicker("Velg egen farge", selection: binding, supportsOpacity: false)
                .labelsHidden()
                .scaleEffect(size / 28)
                .opacity(0.02)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityLabel("Velg egen farge")
    }
}

/// Enkel flyt-layout (flex-wrap) for fargeraden og personchipsene.
struct Fam22Flow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW: CGFloat = proposal.width ?? 10_000
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let sz: CGSize = s.sizeThatFits(.unspecified)
            if x > 0 && x + sz.width > maxW { x = 0; y += rowH + spacing; rowH = 0 }
            x += sz.width + spacing
            rowH = Swift.max(rowH, sz.height)
            widest = Swift.max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX, y: CGFloat = bounds.minY, rowH: CGFloat = 0
        // Første pass: radhøyder, så elementene kan midtstilles vertikalt (align-items: center).
        var rows: [[Int]] = [[]]
        var heights: [CGFloat] = [0]
        for (i, s) in subviews.enumerated() {
            let sz: CGSize = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + sz.width > bounds.maxX {
                x = bounds.minX
                rows.append([])
                heights.append(0)
            }
            rows[rows.count - 1].append(i)
            heights[heights.count - 1] = Swift.max(heights[heights.count - 1], sz.height)
            x += sz.width + spacing
        }
        y = bounds.minY
        for (r, row) in rows.enumerated() {
            x = bounds.minX
            rowH = heights[r]
            for i in row {
                let sz: CGSize = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y + (rowH - sz.height) / 2), anchor: .topLeading, proposal: ProposedViewSize(sz))
                x += sz.width + spacing
            }
            y += rowH + spacing
        }
    }
}

/// Radius-linja: «Radius» til venstre, verdien i Plex Mono til høyre.
struct Fam22RadiusHead: View {
    @Environment(\.paper) private var p
    let radius: Double
    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        HStack {
            Text("Radius").font(PF.ui(13)).foregroundStyle(t.mut)
            Spacer()
            Text(Fam22Fmt.radius(radius)).font(PF.mono(13)).foregroundStyle(t.ink)
        }
    }
}

/// Bryteren for deling av sonen (prompt 21: av som standard), kompakt inne i kortet.
struct Fam22ZoneShare: View {
    @Environment(\.paper) private var p
    let on: Bool
    let toggle: () -> Void
    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        Button(action: toggle) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Del med familien").font(PF.ui(13, .bold)).foregroundStyle(t.ink)
                    Text(on ? "Familien ser sonen og kan få varsler" : "Bare du ser sonen").font(PF.ui(12)).foregroundStyle(t.mut)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                PaperSwitch(on: on)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(on ? "På" : "Av")
    }
}

/// «Ny sone»-kortet: navn, radius, ikon, farge, deling, Avbryt / Lagre sone. Kant 1,5 i `lab`.
struct Fam22DraftCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        if let d = m.draft22 {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ny sone").font(PF.serif(20, medium: true)).foregroundStyle(t.ink)
                nameField(t, d)
                Fam22RadiusHead(radius: d.radius)
                Slider(value: Binding<Double>(get: { m.draft22?.radius ?? 200 }, set: { m.draft22?.radius = $0 }), in: 50...2000, step: 25)
                    .tint(Fam22Tok.light.lab)
                Text("Ikon").font(PF.ui(13)).foregroundStyle(t.mut)
                Fam22IconGrid(selected: d.iconKey, color: d.color, cell: 40, glyph: 20) { k in m.draft22?.icon = k }
                Text("Farge").font(PF.ui(13)).foregroundStyle(t.mut)
                Fam22ColorRow(color: d.color, size: 32) { c in m.draft22?.color = c }
                Fam22ZoneShare(on: d.shared) { m.draft22?.shared.toggle() }
                HStack(spacing: 8) {
                    Fam22Pill(title: "Avbryt", height: 44, fg: t.ink, bg: Color.clear, border: t.line, full: true) { m.draft22 = nil }
                    Fam22Pill(title: "Lagre sone", height: 44, fg: t.bg, bg: t.ink, border: nil, full: true) {
                        if let cur = m.draft22 { m.createZone22(cur, store) }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(t.lab, lineWidth: 1.5))
        }
    }

    private func nameField(_ t: Fam22Tok, _ d: Fam22Draft) -> some View {
        TextField("Navn, f.eks. Trening", text: Binding<String>(get: { m.draft22?.name ?? "" }, set: { m.draft22?.name = $0 }))
            .font(PF.ui(15, .semibold)).foregroundStyle(t.ink)
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(RoundedRectangle(cornerRadius: 14).fill(t.bg))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line, lineWidth: 1))
    }
}

/// Én sone: ikon i fylt sirkel 42, navn og «radius · hvem er der nå», ✎ og −. Redigering inne i kortet, varsel per person.
struct Fam22ZoneCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let zone: FamZone
    let show: () -> Void
    @State private var name: String = ""
    @State private var radius: Double = 150
    @State private var armed: Date?
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    private var editing: Bool { m.editZone22 == zone.id }
    private var mine: Bool { m.zoneIsMine(zone) }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(alignment: .leading, spacing: 10) {
            head(t)
            if editing && mine { editor(t) }
            chips(t)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
        .onAppear { name = zone.name; radius = zone.radius }
        .onChange(of: zone.radius) { _, v in radius = v }
    }

    private func head(_ t: Fam22Tok) -> some View {
        HStack(spacing: 12) {
            Button(action: show) {
                Fam22Glyph(d: Fam22Icons.d(zone.icon), size: 21, stroke: 2, color: Color.white)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(Color(hex: zone.color)))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Vis på kartet")
            VStack(alignment: .leading, spacing: 0) {
                Text(zone.name).font(PF.ui(15, .bold)).foregroundStyle(t.ink).lineLimit(1)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if mine {
                Button { toggleEdit() } label: {
                    Text("✎").font(.system(size: 14)).foregroundStyle(t.ink)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(editing ? t.bg : Color.clear))
                        .overlay(Circle().strokeBorder(t.line, lineWidth: 1))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Rediger sone")
                Button { remove() } label: {
                    Text("−").font(.system(size: 20)).foregroundStyle(t.lab)
                        .frame(width: 34, height: 34)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Slett sone")
            }
        }
    }

    private var sub: String {
        let here: [String] = m.members.filter { mem in
            guard Fam22Where.shareOk(mem), let pos = mem.last else { return false }
            return Fam22Fmt.hav(pos.coord, zone.coord) <= zone.radius
        }.map { $0.id == m.meId ? "deg" : FamPerson20Build.firstName($0.name) }
        let who: String = here.isEmpty ? "ingen der nå" : here.joined(separator: ", ")
        var s: String = Fam22Fmt.radius(zone.radius) + " radius · " + who
        if !mine { s += " · delt med deg" } else if zone.shared { s += " · delt" }
        return s
    }

    private func editor(_ t: Fam22Tok) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Navn", text: $name)
                .font(PF.ui(14, .semibold)).foregroundStyle(t.ink)
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background(RoundedRectangle(cornerRadius: 12).fill(t.bg))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
                .submitLabel(.done)
                .onSubmit { saveName() }
            Fam22IconGrid(selected: zone.icon, color: zone.color, cell: 38, glyph: 19) { k in
                var z: FamZone = zone
                z.icon = k
                m.updateZone22(z, store)
            }
            Fam22ColorRow(color: zone.color, size: 30) { c in
                var z: FamZone = zone
                z.color = c
                m.updateZone22(z, store)
            }
            Fam22RadiusHead(radius: radius)
            Slider(value: $radius, in: 50...2000, step: 25, onEditingChanged: { (on: Bool) in
                if !on {
                    var z: FamZone = zone
                    z.radius = radius
                    m.updateZone22(z, store)
                }
            })
            .tint(Color(hex: zone.color))
            Fam22ZoneShare(on: zone.shared) {
                var z: FamZone = zone
                z.shared.toggle()
                m.updateZone22(z, store)
            }
        }
        .padding(.top, 10).padding(.bottom, 4)
        .overlay(alignment: .top) { Rectangle().fill(t.line).frame(height: 1) }
    }

    /// Personchips (alle unntatt deg): trykk slår varsel av eller på (kommer og går).
    private func chips(_ t: Fam22Tok) -> some View {
        let others: [FamMember] = m.members.filter { $0.id != m.meId }
        return Fam22Flow(spacing: 6) {
            ForEach(others) { mem in chip(t, mem) }
        }
    }

    private func chip(_ t: Fam22Tok, _ mem: FamMember) -> some View {
        let cur: [Bool] = m.zone(zone.id)?.notify[mem.id] ?? []
        let on: Bool = cur.contains(true)
        let first: String = FamPerson20Build.firstName(mem.name)
        return Button {
            m.setNotify(zone, userId: mem.id, enter: !on, leave: !on, store)
        } label: {
            HStack(spacing: 6) {
                Text(Fam22Fmt.ini(mem)).font(PF.ui(10, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(Color(hex: Fam22Fmt.color(mem))))
                Text(on ? first + " · varsel på" : first).font(PF.ui(12, .semibold)).foregroundStyle(t.ink).lineLimit(1)
            }
            .padding(.leading, 4).padding(.trailing, 10)
            .frame(height: 32)
            .background(Capsule().fill(on ? t.bg : Color.clear))
            .overlay(Capsule().strokeBorder(on ? t.ink : t.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func toggleEdit() {
        Haptics.shared.select()
        if editing {
            saveName()
            m.editZone22 = nil
        } else {
            name = zone.name
            radius = zone.radius
            m.editZone22 = zone.id
        }
    }

    private func saveName() {
        let n: String = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty, n != zone.name else { return }
        var z: FamZone = zone
        z.name = n
        m.updateZone22(z, store)
    }

    /// Trykk to ganger innen 2,5 s for å slette.
    private func remove() {
        if let a = armed, Date().timeIntervalSince(a) < 2.5 {
            armed = nil
            m.deleteZone(zone, store)
            return
        }
        armed = Date()
        store.flash("Trykk igjen for å slette \(zone.name)")
    }
}

/// Hele Soner-fanen under kartet.
struct Fam22ZonesTab: View {
    @Environment(\.paper) private var p
    let show: (FamZone) -> Void
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(spacing: 14) {
            Fam22DraftCard()
            if m.zones.isEmpty && m.draft22 == nil {
                Text("Ingen soner ennå. Trykk «+ Ny sone på kartet» og så på kartet der sonen skal være.")
                    .font(PF.ui(13.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
            }
            ForEach(m.zones) { z in
                Fam22ZoneCard(zone: z) { show(z) }
            }
            Text("Trykk på en person i en sone for å slå varsel av eller på når de kommer og går.")
                .font(PF.ui(12)).foregroundStyle(t.mut).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
