import SwiftUI
import UIKit
import MapKit
import CoreLocation

/* ---------------- Prompt 50: Steder med flere områder og Ruter › Min reise (FAMIOS50) ----------------
   Fasit: Familie App.dc.html (v.steder, v.sted) og Familie Redesign.dc.html 2a (4 · Steder, 4b · Sted med flere områder);
   Mobil Papir App.dc.html (Ruter › Min reise: «SKOLE · FRA FAMILIE › STEDER», bare visning med «Endre i Steder ›»).
   API: /api/family/places (+ /areas), /api/ruter/school50. Det siste området kan ikke fjernes (409 last_area). */

/* ---------- 4 · Steder ---------- */

struct Fam50PlacesList: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Fam50Model { Fam50Model.shared }
    @State private var notifyFor: Fam50PlaceRef? = nil

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Fam50Title(title: "Steder", sub: "Få beskjed når noen kommer eller drar").padding(.top, 50).padding(.bottom, 16)
                VStack(spacing: 10) {
                    ForEach(m.places) { (pl: Fam50Place) in
                        Fam50PlaceCard(place: pl, editNotify: { notifyFor = Fam50PlaceRef(id: pl.id) })
                    }
                    Button { Fam50Nav.shared.push(.nyttSted("annet")) } label: {
                        Text("+ Nytt sted").font(PF.ui(14, .bold)).foregroundStyle(t.ink).frame(maxWidth: .infinity).frame(height: 52)
                            .overlay(Capsule().strokeBorder(t.dash, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    // Prompt 45: hovedbryter og bryter per person for posisjonsvarsler (Zone45.swift) – samme funksjon som før.
                    Zone45Card().padding(.top, 6)
                }
                .padding(.horizontal, 14)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await m.loadPlaces(store) }
        .task { if m.places.isEmpty { await m.loadPlaces(store) } }
        .sheet(item: $notifyFor) { (r: Fam50PlaceRef) in
            Fam50NotifySheet(placeId: r.id) { notifyFor = nil }
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .sheetEdge30(p.bg)
        }
    }
}

struct Fam50PlaceRef: Identifiable {
    let id: String
}

/// Kort per sted: farget ikon, navn, «N her nå · 3 områder», avatarer, områdebrikker og bjellelinja med «Endre».
struct Fam50PlaceCard: View {
    @Environment(\.paper) private var p
    let place: Fam50Place
    let editNotify: () -> Void

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 9) {
            head(t)
            if place.areas.count > 1 { chips(t) }
            bell(t)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.card))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .onTapGesture { Fam50Nav.shared.push(.sted(place.id)) }
        .accessibilityAddTraits(.isButton)
    }

    private func head(_ t: Fam50Tok) -> some View {
        HStack(spacing: 12) {
            Fam50PlaceIcon(place: place, size: 44)
            VStack(alignment: .leading, spacing: 1) {
                Text(place.name).font(PF.ui(16, .bold)).foregroundStyle(t.ink).lineLimit(1)
                Text(place.hereLine).font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: -8) {
                ForEach(place.here.prefix(4)) { (w: Fam50Mini) in
                    Fam50Avatar(mini: w, size: 30, ring: 2, ringColor: t.card)
                }
            }
        }
    }

    private func chips(_ t: Fam50Tok) -> some View {
        Flow(spacing: 6) {
            ForEach(place.areas) { (a: Fam50Area) in
                HStack(spacing: 5) {
                    Text(a.name).font(PF.ui(12, .semibold)).foregroundStyle(t.ink)
                    Text(a.radiusText).font(PF.ui(12, .semibold)).foregroundStyle(t.faint)
                }
                .padding(.horizontal, 10).frame(height: 28)
                .background(Capsule().fill(t.chip))
            }
        }
    }

    private func bell(_ t: Fam50Tok) -> some View {
        HStack(spacing: 8) {
            Fam22Glyph(d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0", size: 15, stroke: 2, color: t.soft)
            Text(place.notifyText.isEmpty ? "Ingen varsler" : place.notifyText).font(PF.ui(13)).foregroundStyle(t.soft).lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: editNotify) {
                Text("Endre").font(PF.ui(13, .bold)).foregroundStyle(t.lab).frame(minHeight: 30).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Endre varsler for " + place.name)
        }
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(t.line).frame(height: 1) }
    }
}

/// Farget ikon (avrundet kvadrat) for et sted.
struct Fam50PlaceIcon: View {
    let place: Fam50Place
    let size: CGFloat

    var body: some View {
        Fam22Glyph(d: Fam22Icons.d(place.icon), size: size * 0.5, stroke: 2, color: Color.white)
            .frame(width: size, height: size)
            .background(RoundedRectangle(cornerRadius: size * 0.32, style: .continuous).fill(Color(hex: place.color)))
    }
}

/// Hvem varsles når noen kommer til / drar fra stedet (samme lagring som før: PUT /api/family/zones/:id/notify).
struct Fam50NotifySheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let placeId: String
    let close: () -> Void
    @MainActor private var fm: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        let name: String = Fam50Model.shared.place(placeId)?.name ?? "stedet"
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Fam50Label(text: "VARSLER · " + name.uppercased(), color: t.lab)
                    Text("Hvem vil du høre om?").font(PF.serif(26, medium: true)).foregroundStyle(t.ink)
                }
                Spacer()
                SheetButton30(kind: .primary, title: "Ferdig") { finish() }
            }
            if let z = fm.zone(placeId) {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(fm.members) { (mem: FamMember) in row(z, mem, t) }
                    }
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
                }
            } else {
                Fam50Note(text: "Fant ikke stedet. Prøv igjen om litt.")
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .task { if fm.zone(placeId) == nil { await fm.load(store) } }
    }

    private func row(_ z: FamZone, _ mem: FamMember, _ t: Fam50Tok) -> some View {
        let cur: [Bool] = fm.zone(z.id)?.notify[mem.id] ?? [false, false]
        let enter: Bool = cur.first ?? false
        let leave: Bool = cur.count > 1 ? cur[1] : false
        return HStack(spacing: 10) {
            Fam22Avatar(mem: mem, size: 32, font: 12)
            Text(mem.id == fm.meId ? "Deg" : mem.first).font(PF.ui(14.5, .semibold)).foregroundStyle(t.ink).frame(maxWidth: .infinity, alignment: .leading)
            chip("Kommer", enter, t) { fm.setNotify(z, userId: mem.id, enter: !enter, leave: leave, store) }
            chip("Drar", leave, t) { fm.setNotify(z, userId: mem.id, enter: enter, leave: !leave, store) }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }

    private func chip(_ n: String, _ on: Bool, _ t: Fam50Tok, _ f: @escaping () -> Void) -> some View {
        Button { Haptics.shared.select(); f() } label: {
            Text(n).font(PF.ui(12.5, .bold)).foregroundStyle(on ? t.onPill : t.ink).padding(.horizontal, 12).frame(height: 32)
                .background(Capsule().fill(on ? t.pill : Color.clear))
                .overlay(Capsule().stroke(on ? Color.clear : t.dash, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func finish() {
        close()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            await Fam50Model.shared.loadPlaces(store)
        }
    }
}

/* ---------- 4b · Sted med flere områder (og nytt sted) ---------- */

struct Fam50PlaceEdit: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let placeId: String?
    let newType: String?

    @State private var ctl: Fam22MapCtl = Fam22MapCtl()
    @State private var draftName: String = ""
    @State private var draftType: String = "annet"
    @State private var draftAreas: [Fam50Area] = []
    @State private var adding: Bool = false
    @State private var pending: CLLocationCoordinate2D? = nil
    @State private var areaName: String = ""
    @State private var renaming: Fam50Area? = nil
    @State private var renameText: String = ""
    @State private var naming: Bool = false
    @State private var nameText: String = ""
    @State private var confirmDelete: Bool = false
    @State private var saving: Bool = false
    @State private var started: Bool = false
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    private var place: Fam50Place? { placeId.flatMap { m.place($0) } }
    private var isNew: Bool { placeId == nil }
    private var areas: [Fam50Area] { place?.areas ?? draftAreas }
    private var canEdit: Bool { place?.canEdit ?? true }
    private var name: String { place?.name ?? (draftName.isEmpty ? "Nytt sted" : draftName) }
    private var type: String { place?.type ?? draftType }
    private var color: String { place?.color ?? Fam50PlaceEdit.colorFor(draftType) }

    nonisolated static func colorFor(_ t: String) -> String {
        switch t {
        case "hjem": return "#b23a2a"
        case "skole": return "#a8661a"
        case "jobb": return "#2b5d8a"
        default: return "#2f6b45"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            mapHeader
            ScrollView {
                details.padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
        }
        .background(Fam50Tok.of(p).bg.ignoresSafeArea())
        .task { await start() }
        .alert("Nytt område", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
            TextField("Navn", text: $areaName)
            Button("Legg til") { addPending() }
            Button("Avbryt", role: .cancel) { pending = nil }
        } message: { Text("Gi området et navn, f.eks. Idrettshallen.") }
        .alert("Gi nytt navn", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Navn", text: $renameText)
            Button("Lagre") { saveRename() }
            Button("Avbryt", role: .cancel) { renaming = nil }
        }
        .alert("Navn på stedet", isPresented: $naming) {
            TextField("Navn", text: $nameText)
            Button("Lagre") { saveName() }
            Button("Avbryt", role: .cancel) {}
        }
        .confirmationDialog("Slette «" + name + "»?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Slett stedet", role: .destructive) { deletePlace() }
            Button("Avbryt", role: .cancel) {}
        } message: { Text("Alle områdene og varslene for stedet fjernes.") }
    }

    /* ---------- Kartet (300 pt) med alle områdene som sirkler ---------- */

    private var mapHeader: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        return ZStack(alignment: .top) {
            Fam50AreaMap(areas: areas, color: color, pending: pending, adding: adding, ctl: ctl) { c in
                guard adding else { return }
                Haptics.shared.tap()
                areaName = areas.isEmpty ? (isNew ? name : "Område") : "Område " + String(areas.count + 1)
                pending = c
            }
            .ignoresSafeArea(edges: .top)
            HStack {
                Fam50TopPill(title: "‹ Steder", height: 38, shadow: true) { Fam50Nav.shared.back() }
                Spacer()
                if canEdit {
                    Button { save() } label: {
                        Text(saving ? "Lagrer …" : "Lagre").font(PF.ui(13, .bold)).foregroundStyle(t.onPill).padding(.horizontal, 14).frame(height: 38)
                            .background(Capsule().fill(t.pill))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
            }
            .padding(.horizontal, 14).padding(.top, 8)
            if adding {
                Text("Trykk på kartet der området skal være").font(PF.ui(12.5, .bold)).foregroundStyle(t.onPill)
                    .padding(.horizontal, 12).frame(height: 32).background(Capsule().fill(t.pill))
                    .frame(maxHeight: .infinity, alignment: .bottom).padding(.bottom, 12)
                    .allowsHitTesting(false)
            }
        }
        .frame(height: 300)
        .zIndex(1)
    }

    /* ---------- Navn, områder, type og hvem som bruker stedet ---------- */

    private var details: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        return VStack(alignment: .leading, spacing: 0) {
            titleBlock(t).padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 10)
            if !areas.isEmpty { areaRows(t).padding(.horizontal, 14) }
            if canEdit { addButton(t).padding(.horizontal, 14).padding(.top, 8) }
            Fam50Label(text: "TYPE", color: t.mut).padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 6)
            typeChips(t).padding(.horizontal, 14)
            usedBox(t).padding(.horizontal, 14).padding(.top, 10)
            if !canEdit { ownerNote(t).padding(.horizontal, 14).padding(.top, 10) }
            if canEdit && !isNew { deleteButton(t).padding(.horizontal, 14).padding(.top, 14) }
        }
    }

    private func titleBlock(_ t: Fam50Tok) -> some View {
        let n: Int = areas.count
        let sub: String = n == 0
            ? "Legg til minst ett område på kartet."
            : (n == 1 ? "Ett område. " : "Ett sted med " + String(n) + " områder. ") + "Er du i " + (n == 1 ? "det" : "ett av dem") + ", er du på " + name + "."
        return VStack(alignment: .leading, spacing: 4) {
            Button { if canEdit { nameText = place?.name ?? draftName; naming = true } } label: {
                Text(name).font(PF.serif(32, medium: true)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.6)
            }
            .buttonStyle(.plain)
            .accessibilityHint(canEdit ? "Trykk for å gi stedet nytt navn" : "")
            Text(sub).font(PF.ui(13)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func areaRows(_ t: Fam50Tok) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(areas.enumerated()), id: \.element.id) { i, a in
                areaRow(a, first: i == 0, t)
            }
        }
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func areaRow(_ a: Fam50Area, first: Bool, _ t: Fam50Tok) -> some View {
        let c: Color = Color(hex: color)
        return HStack(spacing: 10) {
            Circle().fill(c.opacity(0.25)).overlay(Circle().stroke(c, lineWidth: 2)).frame(width: 10, height: 10)
            Button { if canEdit { renameText = a.name; renaming = a } else { ctl.focusZone(a.coord, radius: a.radius) } } label: {
                Text(a.name).font(PF.ui(14.5, .bold)).foregroundStyle(t.ink).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            radiusMenu(a, t)
            if canEdit {
                Button { removeArea(a) } label: {
                    Text("✕").font(PF.ui(13, .bold)).foregroundStyle(areas.count > 1 ? t.faint : t.faint.opacity(0.4)).frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Fjern " + a.name)
            }
        }
        .padding(.leading, 14).padding(.trailing, 8).padding(.vertical, 4).frame(minHeight: 50)
        .overlay(alignment: .top) { if !first { Rectangle().fill(t.line).frame(height: 1) } }
    }

    private var radii: [Double] {
        [25, 50, 80, 100, 150, 200, 300, 500, 750, 1000].filter { $0 >= m.radiusMin && $0 <= m.radiusMax }
    }

    private func radiusPill(_ a: Fam50Area, _ t: Fam50Tok) -> some View {
        Text(a.radiusText).font(PF.ui(12.5, .bold)).foregroundStyle(t.ink).padding(.horizontal, 10).frame(height: 30)
            .background(Capsule().fill(t.chip))
    }

    @ViewBuilder private func radiusMenu(_ a: Fam50Area, _ t: Fam50Tok) -> some View {
        if canEdit {
            Menu {
                ForEach(radii, id: \.self) { (r: Double) in
                    Button(Fam22Fmt.radius(r)) { setRadius(a, r) }
                }
            } label: { radiusPill(a, t) }
            .accessibilityLabel("Radius " + a.radiusText + ", trykk for å endre")
        } else {
            radiusPill(a, t)
        }
    }

    private func addButton(_ t: Fam50Tok) -> some View {
        Button {
            Haptics.shared.tap()
            adding.toggle()
            if adding, areas.isEmpty { Task { await centerOnMe() } }
        } label: {
            Text(adding ? "Avbryt plassering" : "+ Legg til område på kartet").font(PF.ui(13.5, .bold)).foregroundStyle(t.ink)
                .frame(maxWidth: .infinity).frame(height: 44)
                .overlay(Capsule().strokeBorder(t.dash, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(areas.count >= m.maxAreas && !adding)
    }

    private func typeChips(_ t: Fam50Tok) -> some View {
        HStack(spacing: 6) {
            ForEach(["hjem", "skole", "jobb", "annet"], id: \.self) { (k: String) in
                let on: Bool = type == k
                Button { setType(k) } label: {
                    Text(Fam50Place.typeName(k)).font(PF.ui(12.5, .bold)).foregroundStyle(on ? t.onPill : t.ink)
                        .frame(maxWidth: .infinity).frame(height: 36)
                        .background(Capsule().fill(on ? t.pill : t.card))
                }
                .buttonStyle(.plain)
                .disabled(!canEdit)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }

    private func usedBox(_ t: Fam50Tok) -> some View {
        let used: String = usedText
        return Text(used).font(PF.ui(12.5)).foregroundStyle(t.soft).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(t.dash.opacity(0.8), lineWidth: 1))
    }

    /// «Brukes av Ruter (Min reise starter når du forlater Skole) og varsler for Pål.»
    private var usedText: String {
        guard let pl = place else {
            return type == "skole" ? "Et sted med type Skole brukes av Ruter (Min reise starter når du forlater skolen)." : "Ingen bruker stedet ennå."
        }
        var parts: [String] = []
        if pl.usedBy.contains("ruter") { parts.append("Ruter (Min reise starter når du forlater " + pl.name + ")") }
        if !pl.notifyText.isEmpty { parts.append("varsler (" + pl.notifyText.replacingOccurrences(of: "Varsler når ", with: "når ") + ")") }
        if parts.isEmpty { return pl.usedByText.isEmpty ? "Brukes ikke av Ruter eller varsler." : pl.usedByText + "." }
        return "Brukes av " + parts.joined(separator: " og ") + "."
    }

    private func ownerNote(_ t: Fam50Tok) -> some View {
        Text("Stedet er delt med deg. Bare den som lagde det kan endre områdene.").font(PF.ui(12.5)).foregroundStyle(t.mut)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func deleteButton(_ t: Fam50Tok) -> some View {
        Button { confirmDelete = true } label: {
            Text("Slett stedet").font(PF.ui(13.5, .bold)).foregroundStyle(t.lab).frame(maxWidth: .infinity).frame(height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /* ---------- Handlinger ---------- */

    private func start() async {
        if started { return }
        started = true
        if isNew {
            let tp: String = newType ?? "annet"
            draftType = tp
            draftName = tp == "annet" ? "" : Fam50Place.typeName(tp)
            await centerOnMe()
            adding = true
        } else {
            if place == nil { await m.loadPlaces(store) }
            fitAreas()
        }
    }

    private func fitAreas() {
        let cs: [CLLocationCoordinate2D] = areas.map { $0.coord }
        guard !cs.isEmpty else { return }
        if cs.count == 1, let a = areas.first { ctl.focusZone(a.coord, radius: a.radius); return }
        ctl.fit(cs)
    }

    private func centerOnMe() async {
        if let c = m.me?.coord { ctl.focus(c, meters: 900); return }
        if let l = await Fam50Locator.shared.fix() { ctl.focus(l.coordinate, meters: 900) }
    }

    private func addPending() {
        guard let c = pending else { return }
        let nm: String = areaName.trimmingCharacters(in: .whitespaces).isEmpty ? "Område" : areaName.trimmingCharacters(in: .whitespaces)
        let a: Fam50Area = Fam50Area(id: "draft-" + UUID().uuidString, name: nm, lat: c.latitude, lon: c.longitude, radius: 150)
        pending = nil
        adding = false
        if let id = placeId {
            Task { await m.addArea(store, id, a) }
        } else {
            draftAreas.append(a)
            if draftName.isEmpty { draftName = nm }
        }
    }

    private func setRadius(_ a: Fam50Area, _ r: Double) {
        Haptics.shared.select()
        if let id = placeId {
            Task { await m.patchArea(store, id, a.id, ["radius_m": Int(r)]) }
        } else if let i = draftAreas.firstIndex(where: { $0.id == a.id }) {
            draftAreas[i].radius = r
        }
    }

    private func removeArea(_ a: Fam50Area) {
        if areas.count <= 1 {
            Haptics.shared.warning()
            store.flash("Det siste området kan ikke fjernes. Slett heller stedet.")
            return
        }
        if let id = placeId {
            Task { await m.deleteArea(store, id, a.id) }
        } else {
            draftAreas.removeAll { $0.id == a.id }
        }
    }

    private func saveRename() {
        guard let a = renaming else { return }
        let n: String = renameText.trimmingCharacters(in: .whitespaces)
        renaming = nil
        guard !n.isEmpty else { return }
        if let id = placeId {
            Task { await m.patchArea(store, id, a.id, ["name": n]) }
        } else if let i = draftAreas.firstIndex(where: { $0.id == a.id }) {
            draftAreas[i].name = n
        }
    }

    private func saveName() {
        let n: String = nameText.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        if let id = placeId { Task { await m.patchPlace(store, id, ["name": n]) } } else { draftName = n }
    }

    private func setType(_ k: String) {
        Haptics.shared.select()
        if let id = placeId {
            Task { await m.patchPlace(store, id, ["type": k]) }
        } else {
            let wasDefault: Bool = draftName.isEmpty || ["Hjem", "Skole", "Jobb"].contains(draftName)
            draftType = k
            if wasDefault && k != "annet" { draftName = Fam50Place.typeName(k) }
        }
    }

    /// Lagre: et eksisterende sted er allerede lagret (hver endring går til serveren) – tilbake. Nytt sted: POST.
    private func save() {
        guard isNew else { Haptics.shared.success(); Fam50Nav.shared.back(); return }
        let n: String = draftName.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { nameText = ""; naming = true; return }
        guard let first = draftAreas.first else {
            adding = true
            store.flash("Trykk på kartet for å legge til det første området")
            return
        }
        saving = true
        let rest: [Fam50Area] = Array(draftAreas.dropFirst())
        let tp: String = draftType
        Task { @MainActor in
            defer { saving = false }
            guard let id = await m.createPlace(store, name: n, type: tp, color: Fam50PlaceEdit.colorFor(tp), area: first) else { return }
            for a in rest { await m.addArea(store, id, a) }
            var s: [Fam50Route] = Fam50Nav.shared.stack
            if !s.isEmpty { s.removeLast() }
            Fam50Nav.shared.stack = s
        }
    }

    private func deletePlace() {
        guard let id = placeId else { return }
        Task { @MainActor in
            await m.deletePlace(store, id)
            Fam50Nav.shared.back()
        }
    }
}

/// Kartet i 4b: områdene som sirkler med navnelapp; i plasseringsmodus legger et trykk et nytt område.
struct Fam50AreaMap: View {
    @Environment(\.paper) private var p
    let areas: [Fam50Area]
    let color: String
    let pending: CLLocationCoordinate2D?
    let adding: Bool
    let ctl: Fam22MapCtl
    let onTap: (CLLocationCoordinate2D) -> Void

    private var pos: Binding<MapCameraPosition> {
        Binding<MapCameraPosition>(get: { ctl.position }, set: { v in ctl.position = v })
    }

    var body: some View {
        MapReader { (proxy: MapProxy) in
            map.gesture(SpatialTapGesture(count: 1, coordinateSpace: .local).onEnded { (v: SpatialTapGesture.Value) in
                if let c = proxy.convert(v.location, from: .local) { onTap(c) }
            }, including: adding ? GestureMask.all : GestureMask.subviews)
        }
    }

    private var map: some View {
        let c: Color = Color(hex: color)
        // Prompt 52: områder uten gyldig posisjon tegnes ikke (Family52Guard.swift).
        let areas: [Fam50Area] = self.areas.filter { Fam52Geo.valid($0.lat, $0.lon) && $0.radius.isFinite && $0.radius > 0 }
        return Map(position: pos, interactionModes: [.pan, .zoom]) {
            ForEach(areas) { (a: Fam50Area) in
                MapCircle(center: a.coord, radius: a.radius)
                    .foregroundStyle(c.opacity(0.2))
                    .stroke(c, style: StrokeStyle(lineWidth: 2))
            }
            ForEach(areas) { (a: Fam50Area) in
                Annotation("", coordinate: a.coord, anchor: .center) {
                    Text(a.name).font(PF.ui(11.5, .bold)).foregroundStyle(Color(hex: "#1b1a17")).padding(.horizontal, 8).frame(height: 24)
                        .background(Capsule().fill(Color.white)).shadow(color: Color.black.opacity(0.2), radius: 3, y: 2)
                        .allowsHitTesting(false)
                }
            }
            if let pc = pending {
                MapCircle(center: pc, radius: 150)
                    .foregroundStyle(c.opacity(0.12))
                    .stroke(c, style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
            }
        }
        .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll, showsTraffic: false))
        .environment(\.colorScheme, p.dark ? ColorScheme.dark : ColorScheme.light)
        .onMapCameraChange(frequency: .onEnd) { (ctx: MapCameraUpdateContext) in ctl.region = ctx.region }
    }
}

/* ---------- Ruter › Min reise: «SKOLE · FRA FAMILIE › STEDER» (bare visning) ---------- */

@MainActor
@Observable
final class Fam50School {
    static let shared = Fam50School()

    /// false når serveren mangler /api/ruter/school50 – da vises de gamle skolesonene (MinReise41Views.swift).
    var supported: Bool = true
    var loaded: Bool = false
    var title: String = "SKOLE · FRA FAMILIE › STEDER"
    var placeName: String = ""
    var placeId: String = ""
    var color: String = "#a8661a"
    var areas: [Fam50Area] = []
    var editLabel: String = "Endre i Steder ›"
    var emptyText: String = ""
    var emptyAction: String = "Legg til i Steder ›"
    var emptyType: String = "skole"

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/ruter/school50", timeout: 12)
            let o: [String: Any] = JS.obj(d)
            supported = true
            title = JS.str(o, "title") ?? "SKOLE · FRA FAMILIE › STEDER"
            let pl: [String: Any]? = JS.dict(o, "place")
            placeName = JS.str(pl, "name") ?? ""
            placeId = JS.str(pl, "id") ?? ""
            color = JS.str(pl, "color") ?? "#a8661a"
            areas = JS.list(o, "areas").map { Fam50Area($0) }
            editLabel = JS.str(JS.dict(o, "edit"), "label") ?? "Endre i Steder ›"
            let em: [String: Any]? = JS.dict(o, "empty")
            emptyText = JS.str(em, "text") ?? ""
            emptyAction = JS.str(em, "action") ?? "Legg til i Steder ›"
            emptyType = JS.str(em, "newType") ?? "skole"
            loaded = true
        } catch let e as APIError {
            if e.status == 404 { supported = false }
        } catch {}
    }
}

struct Fam50SchoolSection: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Fam50School { Fam50School.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: s.title)
            if s.loaded && s.placeId.isEmpty {
                empty
            } else {
                Flow(spacing: 6) {
                    ForEach(s.areas) { (a: Fam50Area) in
                        HStack(spacing: 6) {
                            Text(a.name).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                            Text(a.radiusText).font(PF.ui(11.5)).foregroundStyle(p.mut)
                        }
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(p.bg, in: Capsule())
                    }
                    Button { Fam50Nav.shared.openPlaces(store, place: s.placeId, newType: nil) } label: {
                        Text(s.editLabel).font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 34)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                Text("Alle områdene i stedet " + (s.placeName.isEmpty ? "Skole" : s.placeName) + " teller som skolen.")
                    .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 2)
            }
        }
        .task { await s.load(store) }
    }

    private var empty: some View {
        HStack(spacing: 8) {
            Text(s.emptyText.isEmpty ? "Ingen skole valgt" : s.emptyText).font(PF.ui(13)).foregroundStyle(p.mut)
            Button { Fam50Nav.shared.openPlaces(store, place: nil, newType: s.emptyType) } label: {
                Text(s.emptyAction).font(PF.ui(12.5, .bold)).foregroundStyle(p.lab).padding(.horizontal, 12).frame(height: 34)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}
