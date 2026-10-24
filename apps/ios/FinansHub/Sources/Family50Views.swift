import SwiftUI
import UIKit
import MapKit
import CoreLocation

/* ---------------- Prompt 50: Familie i nytt design – rotsiden, Folk, Kart og Personside (FAMIOS50) ----------------
   Fasit: design/Familie App.dc.html (v.folk, v.kart, v.person) og Familie Redesign.dc.html 2a.
   – Telefon: én side om gangen; Kart, Personside og Sted er fullskjerm uten fanelinje (Fam50Nav.hidesBar).
   – Fold/iPad (brettet modus): to kolonner – venstre = listen på aktiv fane, høyre = kart eller den åpne undersiden.
   – Scroll-lærdommen: ingen drag på kortene i ScrollView. Arket i Kart dras bare i håndtaket (utenfor scroll-flaten). */

/// Siden Familie: fullskjerm med egen fanelinje (Folk · Steder · Helse · Sjekk inn).
struct Family50Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide

    var body: some View {
        Group {
            if wide { Fam50Wide() } else { Fam50Phone() }
        }
        .background(p.bg.ignoresSafeArea())
        .overlay(alignment: .top) { Zone45Banner() }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: Zone45.shared.banner)
        .task { await refreshLoop() }
        .task { await Hjemlys40Model.shared.load(store) }
    }

    /// Henter alt med en gang, så personer og «I dag» hvert 30. sekund mens siden er åpen.
    private func refreshLoop() async {
        await FamilyModel.shared.load(store)
        await Fam50Model.shared.loadAll(store)
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            if Task.isCancelled { break }
            await FamilyModel.shared.load(store)
            await Fam50Model.shared.loadPeople(store)
            await Fam50Model.shared.loadToday(store)
        }
    }
}

/// Telefon: rotfanen eller undersiden øverst i stabelen.
struct Fam50Phone: View {
    @MainActor private var nav: Fam50Nav { Fam50Nav.shared }

    var body: some View {
        Group {
            if let r = nav.top { Fam50RouteView(route: r, embedded: false) } else { Fam50RootTab() }
        }
        .animation(.easeOut(duration: 0.2), value: nav.stack)
    }
}

/// Fanene: Folk (start), Steder, Helse og Sjekk inn.
struct Fam50RootTab: View {
    var body: some View {
        switch Fam50Nav.tabKey(FamilyModel.shared.tab) {
        case "steder": Fam50PlacesList()
        case "helse": Fam50HealthList()
        case "sjekk": Fam50CheckinTab()
        default: Fam50Folk()
        }
    }
}

struct Fam50RouteView: View {
    let route: Fam50Route
    let embedded: Bool

    var body: some View {
        switch route {
        case .kart: Fam50KartView(embedded: embedded)
        case .person(let id): Fam50PersonView(userId: id, embedded: embedded)
        case .sted(let id): Fam50PlaceEdit(placeId: id, newType: nil)
        case .nyttSted(let t): Fam50PlaceEdit(placeId: nil, newType: t)
        case .helsep(let id): Fam50HealthPerson(userId: id)
        case .sendt: Fam50Sent()
        case .vei: Fam50HomeTrip()
        }
    }
}

/// Fold/iPad: venstre = listen på aktiv fane, høyre = kart eller den åpne undersiden. Bruker hele bredden.
struct Fam50Wide: View {
    @MainActor private var nav: Fam50Nav { Fam50Nav.shared }

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let leftW: CGFloat = Swift.max(340, Swift.min(520, (g.size.width - 24) * 0.42))
            HStack(alignment: .top, spacing: 24) {
                Fam50RootTab()
                    .frame(width: leftW)
                right
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .padding(.vertical, 12)
            }
            .padding(.leading, 108 + 16)
            .padding(.trailing, 16)
        }
    }

    @ViewBuilder private var right: some View {
        if let r = nav.top, r != .kart {
            Fam50RouteView(route: r, embedded: true)
        } else {
            Fam50KartView(embedded: true)
        }
    }
}

/* ---------- Felles småbiter ---------- */

/// Etikett i versaler (Plex Mono 600, sperret).
struct Fam50Label: View {
    let text: String
    var color: Color
    var size: CGFloat = 10.5

    var body: some View {
        Text(text).font(PF.mono(size)).tracking(size * 0.12).foregroundStyle(color).lineLimit(1)
    }
}

/// Hvit pilleknapp øverst («‹ Hjem», «‹ Familie», «Posisjon ›»).
struct Fam50TopPill: View {
    @Environment(\.paper) private var p
    let title: String
    var height: CGFloat = 36
    var shadow: Bool = false
    let action: () -> Void

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        Button(action: action) {
            Text(title).font(PF.ui(height >= 40 ? 14 : 13, .bold)).foregroundStyle(t.ink).lineLimit(1)
                .padding(.horizontal, height >= 40 ? 16 : 14)
                .frame(height: height)
                .background(Capsule().fill(t.card))
                .shadow(color: Color.black.opacity(shadow ? 0.18 : 0), radius: 8, y: 6)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Overskrift på fanene: Newsreader 38 og en linje under.
struct Fam50Title: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(PF.serif(38, medium: true)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.7)
            if !sub.isEmpty {
                Text(sub).font(PF.ui(13.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
    }
}

/// Søyler (7 dager): i dag i personens farge, resten lys. Valgfri stiplet mållinje.
struct Fam50Bars: View {
    let values: [Double?]
    let color: Color
    let height: CGFloat
    var gap: CGFloat = 8
    var radius: CGFloat = 5
    var goal: Double? = nil
    var goalLabel: String = ""
    var faint: Color = Color.gray

    private var top: Double {
        let mx: Double = values.compactMap { $0 }.max() ?? 0
        return Swift.max(1, mx * 1.08, (goal ?? 0) * 1.25)
    }

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .bottomLeading) {
                HStack(alignment: .bottom, spacing: gap) {
                    ForEach(Array(values.enumerated()), id: \.offset) { i, v in
                        bar(i, v, g.size.height)
                    }
                }
                if let goal, goal > 0 { goalLine(goal, g.size.height) }
            }
        }
        .frame(height: height)
    }

    private func bar(_ i: Int, _ v: Double?, _ h: CGFloat) -> some View {
        let last: Bool = i == values.count - 1
        let frac: CGFloat = CGFloat((v ?? 0) / top)
        let reached: Bool = goal.map { (v ?? 0) >= $0 } ?? false
        let fill: Color = last ? color : color.opacity(reached ? 0.45 : 0.26)
        return RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill)
            .frame(maxWidth: .infinity)
            .frame(height: Swift.max(h * 0.07, h * frac))
    }

    private func goalLine(_ goal: Double, _ h: CGFloat) -> some View {
        let y: CGFloat = h * CGFloat(goal / top)
        return ZStack(alignment: .topTrailing) {
            Fam50HLine().stroke(faint, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])).frame(height: 1.5)
            if !goalLabel.isEmpty {
                Text(goalLabel).font(PF.mono(10)).foregroundStyle(faint).offset(y: -14)
            }
        }
        .padding(.bottom, y)
        .allowsHitTesting(false)
    }
}

/// Vannrett strek (stiplet mållinje).
struct Fam50HLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

/// Batteripille: grønn, rød bakgrunn under 25 %, ⚡ ved lading.
struct Fam50Battery: View {
    @Environment(\.paper) private var p
    let person: Fam50Person

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        let low: Bool = person.lowBattery
        if !person.batteryText.isEmpty {
            Text(person.batteryText).font(PF.ui(12, .bold)).foregroundStyle(low ? t.lab : t.ok).lineLimit(1).fixedSize()
                .padding(.horizontal, 8).frame(height: 24)
                .background(Capsule().fill(low ? t.badBg : t.okBg))
                .accessibilityLabel("Batteri " + person.batteryText)
        }
    }
}

enum Fam50Geo {
    /// Område som viser alle punktene (som Fam22MapCtl.fit), Oslo når det ikke finnes noen.
    static func region(_ coords: [CLLocationCoordinate2D], minMeters: Double = 1500) -> MKCoordinateRegion {
        if coords.isEmpty { return Fam22MapCtl.oslo }
        if coords.count == 1 { return MKCoordinateRegion(center: coords[0], latitudinalMeters: minMeters, longitudinalMeters: minMeters) }
        var minLa: Double = 90, maxLa: Double = -90, minLo: Double = 180, maxLo: Double = -180
        for c in coords {
            minLa = Swift.min(minLa, c.latitude); maxLa = Swift.max(maxLa, c.latitude)
            minLo = Swift.min(minLo, c.longitude); maxLo = Swift.max(maxLo, c.longitude)
        }
        let center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: (minLa + maxLa) / 2, longitude: (minLo + maxLo) / 2)
        let span: MKCoordinateSpan = MKCoordinateSpan(latitudeDelta: Swift.max(0.008, (maxLa - minLa) * 1.45), longitudeDelta: Swift.max(0.008, (maxLo - minLo) * 1.45))
        return MKCoordinateRegion(center: center, span: span)
    }

    /// Pil etter retningen på skjermen (0° = opp).
    static func arrow(dx: CGFloat, dy: CGFloat) -> String {
        let a: Double = (atan2(Double(dx), Double(-dy)) * 180 / Double.pi + 360).truncatingRemainder(dividingBy: 360)
        let arrows: [String] = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"]
        return arrows[Int((a / 45).rounded()) % 8]
    }
}

/* ---------- 1 · Folk ---------- */

struct Fam50Folk: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    @MainActor private var m: Fam50Model { Fam50Model.shared }
    @State private var plusMenu: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topRow.padding(.horizontal, 16).padding(.top, 10)
                Fam50Title(title: m.title, sub: m.subtitle.isEmpty ? "Henter …" : m.subtitle).padding(.top, 6).padding(.bottom, 14)
                if let e = m.error { Fam50Note(text: e).padding(.horizontal, 14).padding(.bottom, 10) }
                if FamilyModel.shared.sharing != "on" { Fam50SharingOff().padding(.horizontal, 14).padding(.bottom, 10) }
                // Vel fremme («På vei hjem») pågår: liten statuslinje som før (Family42.swift).
                if Hjemlys41PosRow.any(Hjemlys40Model.shared) { VelFremmeStatus42().padding(.horizontal, 14).padding(.bottom, 10) }
                Fam50PeopleGrid().padding(.horizontal, 14)
                if !wide {
                    Fam50MapStrip().padding(.horizontal, 14).padding(.top, 12)
                }
                Fam50TodayList(items: m.today, title: "I DAG").padding(.top, 14)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await m.loadAll(store) }
        .confirmationDialog("Legg til", isPresented: $plusMenu, titleVisibility: .hidden) {
            Button("Nytt sted") { FamilyModel.shared.tab = "soner"; Fam50Nav.shared.stack = [.nyttSted("annet")] }
            Button("Deling og familie") { store.paperGo("innst-fam") }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private var topRow: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        return HStack {
            if !store.nav42HideUp(wide: wide) {
                Fam50TopPill(title: "‹ " + store.prof24UpLabel) { store.paperUp() }
            }
            Spacer()
            Button { Haptics.shared.tap(); plusMenu = true } label: {
                Text("+").font(PF.ui(22, .medium)).foregroundStyle(t.onPill).frame(width: 40, height: 40).background(Circle().fill(t.pill))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Nytt sted eller deling")
        }
        .frame(height: 40)
    }
}

/// Liten feil- eller infoboks.
struct Fam50Note: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        Text(text).font(PF.ui(13)).foregroundStyle(t.soft).fixedSize(horizontal: false, vertical: true)
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(t.card))
    }
}

/// «Du deler ikke posisjonen din · Slå på ›» (samme bryter som Innstillinger → Familie).
struct Fam50SharingOff: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        Button { FamilyModel.shared.setSharing("on", store) } label: {
            HStack(spacing: 10) {
                Text("Du deler ikke posisjonen din med familien").font(PF.ui(13)).foregroundStyle(t.soft)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Slå på ›").font(PF.ui(13, .bold)).foregroundStyle(t.lab)
            }
            .padding(.horizontal, 14).frame(minHeight: 48)
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(t.dash, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// 2 × 2 rutenett med ett kort per person.
struct Fam50PeopleGrid: View {
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
        LazyVGrid(columns: cols, spacing: 10) {
            ForEach(m.people) { (person: Fam50Person) in
                Fam50PersonCard(person: person)
            }
        }
    }
}

struct Fam50PersonCard: View {
    @Environment(\.paper) private var p
    let person: Fam50Person

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        Button { Fam50Nav.shared.push(.person(person.id)) } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Fam50Avatar(mini: person.mini, size: 38)
                    Spacer(minLength: 4)
                    Fam50Battery(person: person)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(person.mini.isSelf ? person.mini.first + " (deg)" : person.mini.first).font(PF.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(person.place.isEmpty ? "–" : person.place).font(PF.serif(23, medium: true)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.75)
                    Text(person.sub.isEmpty ? " " : person.sub).font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(person.lowBattery ? t.lab : Color.clear, lineWidth: 2))
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Åpner personsiden")
    }
}

/// Kartstripe (120 pt) med alle personene og «Åpne kart». Ikke interaktiv (scroll-flaten beholder sveipet).
struct Fam50MapStrip: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        let ps: [Fam50Person] = m.people.filter { $0.coord != nil }
        let key: String = ps.map { $0.id + String(format: "%.3f%.3f", $0.lat ?? 0, $0.lon ?? 0) }.joined()
        ZStack(alignment: .bottomTrailing) {
            Map(initialPosition: MapCameraPosition.region(Fam50Geo.region(ps.compactMap { $0.coord })), interactionModes: []) {
                ForEach(ps) { (x: Fam50Person) in
                    Annotation("", coordinate: x.coord ?? CLLocationCoordinate2D(), anchor: .center) {
                        Fam50Avatar(mini: x.mini, size: 26, ring: 2)
                    }
                }
            }
            .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll, showsTraffic: false))
            .environment(\.colorScheme, p.dark ? ColorScheme.dark : ColorScheme.light)
            .id(key)
            .allowsHitTesting(false)
            Button { Fam50Nav.shared.push(.kart) } label: {
                Text("Åpne kart").font(PF.ui(13, .bold)).foregroundStyle(t.onPill).padding(.horizontal, 14).frame(height: 36)
                    .background(Capsule().fill(t.pill))
            }
            .buttonStyle(.plain)
            .padding(10)
        }
        .frame(height: 120)
        .background(Color(hex: "#e8e4da"))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// «I DAG» (stedshendelser og innsjekker) – profilbilde 28 pt foran teksten.
struct Fam50TodayList: View {
    @Environment(\.paper) private var p
    let items: [Fam50Item]
    let title: String
    var empty: String = "Ingen hendelser i dag ennå"

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 6) {
            Fam50Label(text: title, color: title == "I DAG" ? t.lab : t.mut, size: title == "I DAG" ? 11 : 10.5).padding(.horizontal, 20)
            VStack(spacing: 0) {
                if items.isEmpty {
                    Text(empty).font(PF.ui(13.5)).foregroundStyle(t.mut).padding(14).frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(items.prefix(30).enumerated()), id: \.element.id) { i, it in
                    Fam50ItemRow(item: it, first: i == 0)
                }
            }
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.horizontal, 14)
        }
    }
}

struct Fam50ItemRow: View {
    @Environment(\.paper) private var p
    let item: Fam50Item
    let first: Bool

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        HStack(spacing: 10) {
            Fam50Avatar(mini: item.avatar, size: 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title).font(PF.ui(item.sub.isEmpty ? 14 : 13.5, .semibold)).foregroundStyle(t.ink).lineLimit(2)
                if !item.sub.isEmpty { Text(item.sub).font(PF.ui(12)).foregroundStyle(t.mut).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(item.right).font(PF.ui(12.5, item.pending ? .bold : .regular)).foregroundStyle(item.pending || item.alert ? t.lab : t.mut).lineLimit(1)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .overlay(alignment: .top) { if !first { Rectangle().fill(t.line).frame(height: 1) } }
        .accessibilityElement(children: .combine)
    }
}

/* ---------- Kart (felles for Kart og Personside) ---------- */

/// Personer som nåler (profilbilde), valgfritt steder som sirkler og nøyaktighetssirkel rundt én person.
struct Fam50Map: View {
    @Environment(\.paper) private var p
    let people: [Fam50Person]
    let ctl: Fam22MapCtl
    var accFor: String? = nil
    var bottomPad: CGFloat = 0
    var pinSize: CGFloat = 38
    var onPin: (String) -> Void = { _ in }
    var onCamera: (MKCoordinateRegion) -> Void = { _ in }

    private var pos: Binding<MapCameraPosition> {
        Binding<MapCameraPosition>(get: { ctl.position }, set: { v in ctl.position = v })
    }

    var body: some View {
        Map(position: pos, interactionModes: [.pan, .zoom]) {
            if let id = accFor, let x = people.first(where: { $0.id == id }), let c = x.coord {
                MapCircle(center: c, radius: Swift.max(15, x.acc ?? 30))
                    .foregroundStyle(Color(hex: "#2b5d8a").opacity(0.16))
                    .stroke(Color(hex: "#2b5d8a").opacity(0.5), style: StrokeStyle(lineWidth: 1.5))
            }
            ForEach(people.filter { $0.coord != nil }) { (x: Fam50Person) in
                Annotation("", coordinate: x.coord ?? CLLocationCoordinate2D(), anchor: .center) {
                    Button { onPin(x.id) } label: {
                        Fam50Avatar(mini: x.mini, size: x.id == accFor ? 44 : pinSize, ring: 3)
                            .shadow(color: Color.black.opacity(0.3), radius: 5, y: 4)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(x.mini.name)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll, showsTraffic: false))
        .safeAreaPadding(.bottom, bottomPad)
        .environment(\.colorScheme, p.dark ? ColorScheme.dark : ColorScheme.light)
        .onMapCameraChange(frequency: .continuous) { (ctx: MapCameraUpdateContext) in
            ctl.region = ctx.region
            onCamera(ctx.region)
        }
    }
}

/// Merkelapp i kanten for personer utenfor utsnittet: «Kari · 7,4 km sør ↓». Trykk sentrerer på personen.
struct Fam50EdgeLabels: View {
    @Environment(\.paper) private var p
    let people: [Fam50Person]
    let region: MKCoordinateRegion
    let size: CGSize
    let top: CGFloat
    let bottom: CGFloat
    let focus: (CLLocationCoordinate2D) -> Void

    private struct Tag: Identifiable {
        let id: String
        let person: Fam50Person
        let point: CGPoint
        let text: String
    }

    /// Punktet på skjermen fra området (Mercator er nær lineær i små utsnitt).
    private func screen(_ c: CLLocationCoordinate2D) -> CGPoint {
        let w: Double = Double(size.width), h: Double = Double(size.height)
        let x: Double = (c.longitude - (region.center.longitude - region.span.longitudeDelta / 2)) / Swift.max(0.000001, region.span.longitudeDelta) * w
        let y: Double = ((region.center.latitude + region.span.latitudeDelta / 2) - c.latitude) / Swift.max(0.000001, region.span.latitudeDelta) * h
        return CGPoint(x: x, y: y)
    }

    private var tags: [Tag] {
        let box: CGRect = CGRect(x: 0, y: top, width: size.width, height: Swift.max(40, size.height - top - bottom))
        let inner: CGRect = box.insetBy(dx: Swift.min(90, box.width * 0.3), dy: 22)
        let mid: CGPoint = CGPoint(x: inner.midX, y: inner.midY)
        var out: [Tag] = []
        for x in people where !x.mini.isSelf {
            guard let c = x.coord else { continue }
            let pt: CGPoint = screen(c)
            if box.insetBy(dx: 12, dy: 12).contains(pt) { continue }
            let dx: CGFloat = pt.x - mid.x, dy: CGFloat = pt.y - mid.y
            let sx: CGFloat = abs(dx) > 0.01 ? (inner.width / 2) / abs(dx) : CGFloat.greatestFiniteMagnitude
            let sy: CGFloat = abs(dy) > 0.01 ? (inner.height / 2) / abs(dy) : CGFloat.greatestFiniteMagnitude
            let s: CGFloat = Swift.min(sx, sy, 1)
            let at: CGPoint = CGPoint(x: mid.x + dx * s, y: mid.y + dy * s)
            let label: String = x.fromMe?.label.isEmpty == false ? (x.fromMe?.label ?? x.mini.first) : x.mini.first
            out.append(Tag(id: x.id, person: x, point: at, text: label + " " + Fam50Geo.arrow(dx: dx, dy: dy)))
        }
        return out
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(tags) { (tg: Tag) in
                tag(tg).position(tg.point)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func tag(_ tg: Tag) -> some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        return Button { if let c = tg.person.coord { focus(c) } } label: {
            HStack(spacing: 6) {
                Fam50Avatar(mini: tg.person.mini, size: 24)
                Text(tg.text).font(PF.ui(12.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
            }
            .padding(.leading, 4).padding(.trailing, 12).frame(height: 32)
            .background(Capsule().fill(t.card))
            .shadow(color: Color.black.opacity(0.2), radius: 5, y: 4)
            .fixedSize()
        }
        .buttonStyle(.plain)
    }
}

/* ---------- 2 · Kart ---------- */

struct Fam50KartView: View {
    @Environment(\.paper) private var p
    let embedded: Bool
    @State private var ctl: Fam22MapCtl = Fam22MapCtl()
    @State private var region: MKCoordinateRegion = Fam22MapCtl.oslo
    @State private var sheetH: CGFloat = 430
    @State private var dragStart: CGFloat? = nil
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let maxH: CGFloat = Swift.min(430, g.size.height * 0.62)
            let h: CGFloat = embedded ? 0 : Swift.min(sheetH, maxH)
            ZStack(alignment: .top) {
                Fam50Map(people: m.people, ctl: ctl, bottomPad: h, onPin: { id in Fam50Nav.shared.push(.person(id)) }, onCamera: { r in region = r })
                    .overlay {
                        // Samme ramme som kartet (hele skjermen), så punktene regnes riktig fra utsnittet.
                        GeometryReader { (mg: GeometryProxy) in
                            Fam50EdgeLabels(people: m.people, region: region, size: mg.size, top: mg.safeAreaInsets.top + (embedded ? 60 : 56),
                                            bottom: (embedded ? 0 : h + 20) + mg.safeAreaInsets.bottom + 12) { c in ctl.focusPerson(c) }
                        }
                    }
                    .ignoresSafeArea()
                topBar.padding(.horizontal, 14).padding(.top, embedded ? 14 : 8)
                if !embedded {
                    panel(h, maxH).frame(maxHeight: .infinity, alignment: .bottom).ignoresSafeArea(edges: .bottom)
                }
            }
        }
        .onAppear { fitAll() }
        .onChange(of: m.people.count) { (old: Int, _: Int) in if old == 0 { fitAll() } }
    }

    private func fitAll() {
        let cs: [CLLocationCoordinate2D] = m.people.compactMap { $0.coord }
        ctl.fit(cs)
        region = ctl.region
    }

    private var topBar: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        return HStack {
            if !embedded {
                Fam50TopPill(title: "‹ Familie", height: 40, shadow: true) { Fam50Nav.shared.back() }
            }
            Spacer()
            Button { findMe() } label: {
                Fam22Glyph(d: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3", size: 18, stroke: 2.2, color: t.ink)
                    .frame(width: 40, height: 40).background(Circle().fill(t.card))
                    .shadow(color: Color.black.opacity(0.18), radius: 8, y: 6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Finn meg")
        }
    }

    private func findMe() {
        Haptics.shared.tap()
        if let c = m.me?.coord { ctl.focus(c, meters: 1200); return }
        Task { @MainActor in
            if let l = await Fam50Locator.shared.fix() { ctl.focus(l.coordinate, meters: 1200) } else { fitAll() }
        }
    }

    private func panel(_ h: CGFloat, _ maxH: CGFloat) -> some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        return VStack(spacing: 0) {
            // Bare håndtaket og overskriften kan dras (ikke lista), så scroll og kantsveip virker som før.
            VStack(spacing: 10) {
                Capsule().fill(t.dash).frame(width: 40, height: 5).padding(.top, 8)
                Text(String(m.people.count) + (m.people.count == 1 ? " person" : " personer")).font(PF.serif(24, medium: true)).foregroundStyle(t.ink)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 4).onChanged { v in
                let s: CGFloat = dragStart ?? h
                if dragStart == nil { dragStart = h }
                sheetH = Swift.min(maxH, Swift.max(150, s - v.translation.height))
            }.onEnded { v in
                let target: CGFloat = (dragStart ?? h) - v.predictedEndTranslation.height
                dragStart = nil
                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { sheetH = target < (maxH + 150) / 2 ? 150 : maxH }
            })
            ScrollView {
                Fam50KartList().padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .frame(height: h + 20)
        .frame(maxWidth: .infinity)
        .background(UnevenRoundedRectangle(topLeadingRadius: 30, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 30, style: .continuous).fill(t.bg))
        .shadow(color: Color.black.opacity(0.18), radius: 15, y: -10)
    }
}

/// Radene i kartarket: avatar, navn, «sted · tid», batteri og avstand fra deg.
struct Fam50KartList: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(spacing: 0) {
            ForEach(Array(m.people.enumerated()), id: \.element.id) { i, x in
                row(x, first: i == 0, t)
            }
        }
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.card))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func row(_ x: Fam50Person, first: Bool, _ t: Fam50Tok) -> some View {
        let line: String = [x.place, x.sinceShort].filter { !$0.isEmpty }.joined(separator: " · ")
        let dist: String = x.mini.isSelf ? "Her" : (x.fromMe?.text ?? "")
        return Button { Fam50Nav.shared.push(.person(x.id)) } label: {
            HStack(spacing: 12) {
                Fam50Avatar(mini: x.mini, size: 42)
                VStack(alignment: .leading, spacing: 1) {
                    Text(x.mini.name).font(PF.ui(15.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(line).font(PF.ui(13)).foregroundStyle(t.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(x.batteryText).font(PF.ui(13, .bold)).foregroundStyle(x.lowBattery ? t.lab : t.ok)
                    Text(dist).font(PF.ui(12)).foregroundStyle(t.mut)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 8).frame(minHeight: 68)
            .overlay(alignment: .top) { if !first { Rectangle().fill(t.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- 3 · Personside ---------- */

struct Fam50PersonView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let userId: String
    let embedded: Bool
    @State private var ctl: Fam22MapCtl = Fam22MapCtl()
    @State private var directions: Bool = false
    @State private var askPhone: String? = nil
    @State private var phoneText: String = ""
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    private var person: Fam50Person? { m.person(userId) }

    /// «‹ Folk», «‹ Kart» eller «‹ Helse» – dit du kom fra.
    private var backLabel: String {
        let s: [Fam50Route] = Fam50Nav.shared.stack
        if s.count >= 2 {
            switch s[s.count - 2] {
            case .kart: return "Kart"
            case .helsep: return "Helse"
            default: break
            }
        }
        switch Fam50Nav.tabKey(FamilyModel.shared.tab) {
        case "helse": return "Helse"
        case "steder": return "Steder"
        case "sjekk": return "Sjekk inn"
        default: return "Folk"
        }
    }

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let h: CGFloat = Swift.min(480, g.size.height * 0.64)
            ZStack(alignment: .top) {
                Fam50Map(people: m.people, ctl: ctl, accFor: userId, bottomPad: h, pinSize: 34, onPin: { id in if id != userId { Fam50Nav.shared.push(.person(id)) } })
                    .ignoresSafeArea()
                HStack {
                    Fam50TopPill(title: "‹ " + backLabel, height: 40, shadow: true) { Fam50Nav.shared.back() }
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.top, embedded ? 14 : 8)
                panel(h).frame(maxHeight: .infinity, alignment: .bottom).ignoresSafeArea(edges: .bottom)
            }
        }
        .onAppear { center() }
        .onChange(of: userId) { _, _ in center() }
        .onChange(of: person?.coord == nil) { _, _ in center() }
        .confirmationDialog("Veibeskrivelse", isPresented: $directions, titleVisibility: .visible) {
            Button("Apple Kart") { openMaps(google: false) }
            Button("Google Maps") { openMaps(google: true) }
            Button("Avbryt", role: .cancel) {}
        }
        .alert("Telefonnummer", isPresented: Binding(get: { askPhone != nil }, set: { if !$0 { askPhone = nil } })) {
            TextField("Nummer", text: $phoneText).keyboardType(.phonePad)
            Button("Lagre") { savePhone() }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Nummeret til " + (person?.mini.first ?? "personen") + " lagres bare på denne enheten.")
        }
    }

    private func center() {
        if let c = person?.coord { ctl.focus(c, meters: 900) }
    }

    private func panel(_ h: CGFloat) -> some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        return VStack(spacing: 0) {
            Capsule().fill(t.dash).frame(width: 40, height: 5).padding(.top, 8).padding(.bottom, 4)
            ScrollView {
                if let x = person {
                    Fam50PersonSheet(person: x, health: m.healthOf(x.id), call: { contact(x, sms: false) }, message: { contact(x, sms: true) },
                                     directions: { directions = true })
                        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 40)
                } else {
                    Fam50Note(text: "Fant ikke personen.").padding(14)
                }
            }
            .scrollIndicators(.hidden)
        }
        .frame(height: h + 20)
        .frame(maxWidth: .infinity)
        .background(UnevenRoundedRectangle(topLeadingRadius: 30, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 30, style: .continuous).fill(t.bg))
        .shadow(color: Color.black.opacity(0.18), radius: 15, y: -10)
    }

    private func contact(_ x: Fam50Person, sms: Bool) {
        Haptics.shared.tap()
        let saved: String = Fam50Tel.get(x.id)
        let num: String = x.phone.isEmpty ? saved : x.phone
        if num.isEmpty {
            phoneText = ""
            askPhone = sms ? "sms" : "tel"
            return
        }
        Fam50Tel.open(num, sms: sms)
    }

    private func savePhone() {
        let n: String = phoneText.filter { $0.isNumber || $0 == "+" }
        guard !n.isEmpty else { return }
        Fam50Tel.set(userId, n)
        Fam50Tel.open(n, sms: askPhone == "sms")
        askPhone = nil
    }

    private func openMaps(google: Bool) {
        guard let c = person?.coord else { store.flash("Posisjonen er ikke delt"); return }
        let s: String = google
            ? String(format: "https://www.google.com/maps/dir/?api=1&destination=%.6f,%.6f", c.latitude, c.longitude)
            : String(format: "https://maps.apple.com/?daddr=%.6f,%.6f", c.latitude, c.longitude)
        if let u = URL(string: s) { UIApplication.shared.open(u) }
    }
}

/// Telefonnumre til Ring og Melding (serveren har ingen numre): lagres per konto på enheten.
enum Fam50Tel {
    static func get(_ userId: String) -> String { UserDefaults.standard.string(forKey: AcctScope.key("fam50_phone_" + userId)) ?? "" }
    static func set(_ userId: String, _ n: String) { UserDefaults.standard.set(n, forKey: AcctScope.key("fam50_phone_" + userId)) }
    @MainActor static func open(_ n: String, sms: Bool) {
        if let u = URL(string: (sms ? "sms:" : "tel:") + n) { UIApplication.shared.open(u) }
    }
}

/// Innholdet i personarket: navn, status, Ring · Melding · Veibeskrivelse, 2 × 2 og skritt siste 7 dager.
struct Fam50PersonSheet: View {
    @Environment(\.paper) private var p
    let person: Fam50Person
    let health: Fam50Health?
    let call: () -> Void
    let message: () -> Void
    let directions: () -> Void

    private var shared: Bool { health?.shared ?? false }

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Fam50Avatar(mini: person.mini, size: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Text(person.mini.name).font(PF.serif(28, medium: true)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.7)
                    Text(person.statusLine.isEmpty ? person.place : person.statusLine).font(PF.ui(13.5)).foregroundStyle(t.soft).lineLimit(2)
                }
            }
            .padding(.horizontal, 4)
            actions(t)
            stats(t)
            weekCard(t)
        }
    }

    private func actions(_ t: Fam50Tok) -> some View {
        HStack(spacing: 8) {
            action("Ring", "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2", t, call)
            action("Melding", "M4 5h16v11H8l-4 4z", t, message)
            action("Veibeskrivelse", "M3 11l18-8-8 18-2-8z", t, directions)
        }
    }

    private func action(_ n: String, _ d: String, _ t: Fam50Tok, _ f: @escaping () -> Void) -> some View {
        Button(action: f) {
            VStack(spacing: 3) {
                Fam22Glyph(d: d, size: 18, stroke: 2, color: t.ink)
                Text(n).font(PF.ui(12.5, .bold)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity).frame(height: 56)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(t.card))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func stats(_ t: Fam50Tok) -> some View {
        let h: Fam50Health? = health
        let acc: String = person.acc.map { String(Int($0.rounded())) + " m" } ?? "—"
        let steps: String = shared && !(h?.stepsText ?? "").isEmpty ? (h?.stepsText ?? "") : "—"
        let stepsSub: String = !shared ? "Ikke delt" : ((h?.goalReached ?? false) ? "Målet nådd" : "av " + (h?.goalText ?? ""))
        let sleep: String = shared && !(h?.sleepText ?? "").isEmpty ? (h?.sleepText ?? "") : "—"
        let sleepSub: String = !shared ? "Ikke delt" : (h?.restingHr.map { "Hvilepuls " + String(Int($0)) } ?? "")
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            Fam50Stat(k: "BATTERI", v: person.battery.map { String(Int($0.rounded())) + " %" } ?? "—", s: person.battery == nil ? "Ikke delt" : (person.charging ? "Lader" : "Lader ikke"))
            Fam50Stat(k: "NØYAKTIGHET", v: acc, s: person.device.isEmpty ? (person.approx ? "Omtrentlig" : "") : person.device)
            Fam50Stat(k: "SKRITT I DAG", v: steps, s: stepsSub)
            Fam50Stat(k: "SØVN", v: sleep, s: sleepSub)
        }
    }

    @ViewBuilder private func weekCard(_ t: Fam50Tok) -> some View {
        if shared, let h = health, !h.week.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Fam50Label(text: "SKRITT · SISTE 7 DAGER", color: t.mut)
                Fam50Bars(values: h.week.map { $0.steps }, color: Color(hex: person.mini.hex), height: 44, gap: 8, radius: 5)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(t.card))
        } else if !shared {
            Text(health?.text.isEmpty == false ? (health?.text ?? "") : person.mini.first + " deler ikke helse med deg")
                .font(PF.ui(13)).foregroundStyle(t.soft)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(t.dash, lineWidth: 1))
        }
    }
}

/// Lite kort i 2 × 2: etikett, verdi og en linje under.
struct Fam50Stat: View {
    @Environment(\.paper) private var p
    let k: String
    let v: String
    let s: String

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 2) {
            Fam50Label(text: k, color: t.mut, size: 10)
            Text(v).font(PF.ui(20, .bold)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(s.isEmpty ? " " : s).font(PF.ui(12)).foregroundStyle(t.mut).lineLimit(1)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(t.card))
        .accessibilityElement(children: .combine)
    }
}
