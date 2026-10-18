import SwiftUI
import UIKit
import PhotosUI
import CoreLocation

/* ---------------- Prompt 22: Kart-fanen (personkort, Familien, Hendelser, Min deling) ---------------- */

enum Fam22Where {
    /// «I Hjem», aktivitet eller sted, pluss « · 38 km/t» når personen beveger seg.
    @MainActor static func text(_ mem: FamMember, _ m: FamilyModel) -> String {
        guard let pos = mem.last else { return "Ingen posisjon ennå" }
        let zone: FamZone? = m.zones.first { Fam22Fmt.hav($0.coord, pos.coord) <= $0.radius }
        let act: String = Fam22Fmt.activity(pos)
        var out: String
        if let zone {
            out = "I " + zone.name
        } else if act != "Står stille" {
            out = act
        } else {
            out = pos.place.isEmpty ? "Ukjent sted" : pos.place
        }
        let k: Int = Fam22Fmt.kmh(pos)
        if k > 0 { out += " · \(k) km/t" }
        return out
    }

    static func shareOk(_ mem: FamMember) -> Bool { mem.sharing == "on" && mem.last != nil }
}

/// Personkortet: avatar 48 (trykk = bytt bilde, ✎), navn Newsreader 22, sted og oppdatert, ×, seks sensorruter og knapper.
struct Fam22PersonCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let mem: FamMember
    let close: () -> Void
    @State private var pick: PhotosPickerItem?
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(alignment: .leading, spacing: 12) {
            header(t)
            sensors(t)
            if mem.devices.count > 1 || (isMe && !mem.devices.isEmpty) { Fam24Devices(mem: mem, isMe: isMe) }
            actions(t)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
        .onChange(of: pick) { _, item in
            guard let item else { return }
            let id: String = mem.id
            Task { @MainActor in
                if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                    Fam22Photos.shared.set(id, img, store)
                }
                pick = nil
            }
        }
    }

    private var isMe: Bool { mem.id == m.meId }

    private func header(_ t: Fam22Tok) -> some View {
        HStack(spacing: 12) {
            PhotosPicker(selection: $pick, matching: .images) {
                Fam22Avatar(mem: mem, size: 48, font: 16)
                    .overlay(alignment: .bottomTrailing) {
                        Text("✎").font(.system(size: 11)).foregroundStyle(t.bg)
                            .frame(width: 20, height: 20)
                            .background(Circle().fill(t.ink))
                            .overlay(Circle().strokeBorder(t.card, lineWidth: 2))
                            .offset(x: 3, y: 3)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Bytt profilbilde")
            .contextMenu {
                Button("Bruk kontobildet") { Fam22Photos.shared.clear(mem, store) }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(isMe ? "Deg" : mem.name).font(PF.serif(22, medium: true)).foregroundStyle(t.ink).lineLimit(1)
                Text(whereLine).font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: close) {
                Text("×").font(PF.ui(16)).foregroundStyle(t.ink)
                    .frame(width: 36, height: 36)
                    .overlay(Circle().strokeBorder(t.line, lineWidth: 1))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
    }

    private var whereLine: String {
        if !Fam22Where.shareOk(mem) { return mem.sharing == "paused" ? "Deling er satt på pause" : "Deler ikke posisjon" }
        return Fam22Where.text(mem, m) + Fam24Group.suffix(mem) + " · oppdatert " + Fam22Fmt.ago(mem.last?.ts).lowercased()
    }

    private func sensors(_ t: Fam22Tok) -> some View {
        let pos: FamPos? = mem.last
        let bat: Double? = pos?.battery
        let batText: String = bat.map { "\(Int($0.rounded())) %" + ((pos?.charging ?? false) ? " ⚡" : "") } ?? "–"
        let low: Bool = (bat ?? 100) < 20
        let acc: String = pos?.acc.map { "± \(Int($0.rounded())) m" } ?? "–"
        let coord: String = pos.map { String(format: "%.4f, %.4f", $0.lat, $0.lon) } ?? "–"
        let dev: String = (pos?.device ?? "").isEmpty ? "–" : (pos?.device ?? "")
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            tile(t, "Batteri", batText, low ? t.lab : t.ink)
            tile(t, "Aktivitet", Fam22Fmt.activity(pos), t.ink)
            tile(t, "Fart", "\(Fam22Fmt.kmh(pos)) km/t", t.ink)
            tile(t, "Nøyaktighet", acc, t.ink)
            tile(t, "Enhet", dev, t.ink)
            tile(t, "Koordinater", coord, t.ink)
        }
    }

    private func tile(_ t: Fam22Tok, _ l: String, _ v: String, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(l).font(PF.ui(11)).foregroundStyle(t.mut).lineLimit(1)
            Text(v).font(PF.mono(14)).foregroundStyle(c).lineLimit(1).truncationMode(.tail)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(t.bg))
    }

    private func actions(_ t: Fam22Tok) -> some View {
        HStack(spacing: 8) {
            Fam22Pill(title: "Veibeskrivelse", height: 42, fg: t.bg, bg: t.ink, border: nil, font: 13.5, full: true) {
                guard let pos = mem.last, let u = URL(string: "http://maps.apple.com/?daddr=\(pos.lat),\(pos.lon)&dirflg=d") else { return }
                UIApplication.shared.open(u)
            }
            Fam22Pill(title: isMe ? "Del min posisjon" : "Spill av lyd", height: 42, fg: t.ink, bg: Color.clear, border: t.line, font: 13.5, full: true) {
                if isMe {
                    if let pos = mem.last { UIPasteboard.general.string = "https://maps.apple.com/?ll=\(pos.lat),\(pos.lon)" }
                    store.flash("Lenke kopiert")
                } else {
                    m.ping(mem)
                }
            }
        }
    }
}

/// FAMILIEN: avatar 42 med statusprikk, navn Manrope 700 15, sted 12,5 `mut`, batteri og oppdatert til høyre.
struct Fam22PeopleList: View {
    @Environment(\.paper) private var p
    let members: [FamMember]
    let meId: String
    let tap: (FamMember) -> Void
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(spacing: 0) {
            ForEach(Array(members.enumerated()), id: \.element.id) { i, mem in
                if i > 0 { Rectangle().fill(t.line).frame(height: 1) }
                row(t, mem)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
    }

    private func row(_ t: Fam22Tok, _ mem: FamMember) -> some View {
        let ok: Bool = Fam22Where.shareOk(mem)
        let fresh: Bool = mem.last?.ts.map { Date().timeIntervalSince($0) < 15 * 60 } ?? false
        let dot: Color = !ok ? Fam22Tok.off : (fresh ? Fam22Tok.fresh : Fam22Tok.stale)
        let bat: Double? = mem.last?.battery
        let batText: String = bat.map { "\(Int($0.rounded())) %" + ((mem.last?.charging ?? false) ? " ⚡" : "") } ?? "–"
        let low: Bool = (bat ?? 100) < 20
        let place: String = (ok ? Fam22Where.text(mem, m) : (mem.sharing == "paused" ? "Deling er satt på pause" : "Deler ikke posisjon")) + Fam24Group.suffix(mem)
        return Button { if ok { tap(mem) } } label: {
            HStack(spacing: 12) {
                Fam22Avatar(mem: mem, size: 42, font: 14)
                    .overlay(alignment: .bottomTrailing) {
                        Circle().fill(dot).frame(width: 12, height: 12)
                            .overlay(Circle().strokeBorder(t.card, lineWidth: 2))
                            .offset(x: 1, y: 1)
                    }
                VStack(alignment: .leading, spacing: 0) {
                    Text(mem.id == meId ? mem.name + " (deg)" : mem.name).font(PF.ui(15, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(place).font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1).truncationMode(.tail)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(batText).font(PF.mono(12.5)).foregroundStyle(low ? t.lab : t.ink).lineLimit(1)
                    Text(ok ? Fam22Fmt.ago(mem.last?.ts) : "–").font(PF.ui(11.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                .fixedSize()
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// HENDELSER: prikk i personfarge, tekst 13,5 og klokkeslett (Plex Mono 500 12).
struct Fam22Events: View {
    @Environment(\.paper) private var p
    let events: [FamEvent]
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(spacing: 6) {
            Fam22Label(text: "Hendelser")
            VStack(spacing: 0) {
                ForEach(Array(events.prefix(6).enumerated()), id: \.element.id) { i, ev in
                    if i > 0 { Rectangle().fill(t.line).frame(height: 1) }
                    row(t, ev)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
        }
    }

    private func row(_ t: Fam22Tok, _ ev: FamEvent) -> some View {
        let c: String = m.member(ev.userId).map { Fam22Fmt.color($0) } ?? "#7a7468"
        return HStack(spacing: 10) {
            Circle().fill(Color(hex: c)).frame(width: 8, height: 8)
            Text(m.eventText(ev)).font(PF.ui(13.5)).foregroundStyle(t.ink).frame(maxWidth: .infinity, alignment: .leading)
            Text(ev.ts.map { JS.fmt($0, "HH:mm") } ?? "").font(PF.mono(12, bold: false)).foregroundStyle(t.mut)
        }
        .padding(.vertical, 10)
    }
}

/// «Min deling»: Del min posisjon, Presisjon og Sensorer fra mobilen. Deling er av som standard (prompt 21).
struct Fam22MyShare: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(alignment: .leading, spacing: 10) {
            Text("Min deling").font(PF.serif(20, medium: true)).foregroundStyle(t.ink)
            VStack(spacing: 0) {
                row(t, "Del min posisjon", shareSub, shareValue, m.sharing == "on" ? t.pos : t.lab, first: true) {
                    m.setSharing(m.sharing == "on" ? "off" : "on", store)
                }
                row(t, "Presisjon", m.precision == "approx" ? "Omtrentlig, rundt 1 km" : "Nøyaktig punkt", (m.precision == "approx" ? "Omtrentlig" : "Nøyaktig") + " ›", t.mut, first: false) {
                    m.setPrecision(m.precision == "approx" ? "exact" : "approx", store)
                }
                row(t, "Sensorer fra mobilen", "Batteri, aktivitet og fart", gpsOn ? "GPS på" : "Be om tilgang ›", gpsOn ? t.pos : t.lab, first: false) { askGps() }
            }
            Text("Deling er av som standard. Hver person kan pause eller slå av når som helst, og de andre ser det.")
                .font(PF.ui(12)).foregroundStyle(t.mut).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
    }

    private var shareSub: String {
        switch m.sharing {
        case "on": return "Familien ser hvor du er"
        case "paused": return "Pauset · de andre ser at du har pauset"
        default: return "Av · familien ser ikke hvor du er"
        }
    }

    private var shareValue: String {
        switch m.sharing {
        case "on": return "På"
        case "paused": return "Pauset"
        default: return "Av"
        }
    }

    private var gpsOn: Bool {
        let st: CLAuthorizationStatus = FamilyLocation.shared.status
        return st == .authorizedAlways || st == .authorizedWhenInUse
    }

    private func askGps() {
        let st: CLAuthorizationStatus = FamilyLocation.shared.status
        if st == .denied || st == .restricted {
            if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
        } else if st == .notDetermined {
            FamilyLocation.shared.start(store, precise: m.precision == "exact")
        } else {
            store.flash("GPS er på")
        }
    }

    private func row(_ t: Fam22Tok, _ n: String, _ s: String, _ v: String, _ vc: Color, first: Bool, _ act: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            if !first { Rectangle().fill(t.line).frame(height: 1) }
            Button(action: act) {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(n).font(PF.ui(14, .bold)).foregroundStyle(t.ink)
                        Text(s).font(PF.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(v).font(PF.ui(13, .bold)).foregroundStyle(vc).lineLimit(1).fixedSize()
                }
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}
