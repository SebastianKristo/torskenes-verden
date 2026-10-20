import SwiftUI
import CoreLocation
import UIKit

/* ---------------- Prompt 20: «POSISJON · FAMILIE»-kortet på Hjem ---------------- */

/// Én rute på kortet. Fra GET /api/family/positions, eller bygget fra GET /api/family på eldre servere.
struct FamPerson20: Identifiable, Hashable {
    let id: String
    let name: String
    let color: String
    let photo: String
    let line2: String
    let initials: String
    /// fresh (< 15 min), stale eller off (deling av eller ukjent posisjon).
    let status: String
    let isSelf: Bool
}

/// Hjelpere for tekst, farge og initialer, så kortet ser likt ut uansett kilde.
enum FamPerson20Build {
    static let palette: [String] = ["#b23a2a", "#2f5d8a", "#2f7a4f", "#c27a1a", "#6b4fa0", "#1f7a7a", "#a8452f", "#4a6fa5"]

    /// Stabil farge fra id-en (hashValue endres mellom oppstarter, så den brukes ikke).
    static func stableColor(_ key: String) -> String {
        var h: Int = 0
        for u in key.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0x7fffffff }
        return palette[h % palette.count]
    }

    static func firstName(_ name: String) -> String {
        let parts: [Substring] = name.split(separator: " ")
        if let f = parts.first { return String(f) }
        return name
    }

    /// To bokstaver: «Du», «In», «På».
    static func initials(_ name: String, isSelf: Bool) -> String {
        if isSelf { return "Du" }
        let first: String = firstName(name)
        let head: String = String(first.prefix(1)).uppercased()
        let tail: String = String(first.dropFirst().prefix(1)).lowercased()
        let out: String = head + tail
        return out.isEmpty ? "?" : out
    }

    static func activityName(_ a: String) -> String? {
        switch a.lowercased() {
        case "går", "walking": return "Går"
        case "løper", "running": return "Løper"
        case "sykler", "cycling": return "Sykler"
        case "i bil", "driving", "automotive": return "I bil"
        default: return nil
        }
    }

    static func seen(_ d: Date) -> String {
        let pattern: String = Calendar.current.isDateInToday(d) ? "HH:mm" : "dd.MM HH:mm"
        return "Sist sett " + JS.fmt(d, pattern)
    }

    /// Linje 2: sone, «Går · Bislett», strøk/by, «Sist sett 14:32» eller «Deler ikke posisjon». Aldri «Ukjent sted».
    static func line2(zone: String, activity: String, place: String, updated: Date?, status: String) -> String {
        if status != "off" {
            if !zone.isEmpty { return zone }
            if let a = activityName(activity) { return place.isEmpty ? a : a + " · " + place }
            if !place.isEmpty { return place }
        }
        if let d = updated { return seen(d) }
        return "Deler ikke posisjon"
    }

    static func status(_ ts: Date?) -> String {
        guard let ts else { return "stale" }
        return Date().timeIntervalSince(ts) < 15 * 60 ? "fresh" : "stale"
    }

    /// Fra /api/family/positions. Tåler engelske feltnavn også.
    static func fromServer(_ o: [String: Any]) -> FamPerson20 {
        let isSelf: Bool = JS.bool(o, "self") ?? false
        let id: String = JS.str(o, "id") ?? JS.str(o, "userId") ?? UUID().uuidString
        let rawName: String = JS.str(o, "navn") ?? JS.str(o, "name") ?? "Ukjent"
        let name: String = isSelf ? "Du" : firstName(rawName)
        let color: String = JS.str(o, "farge") ?? JS.str(o, "color") ?? stableColor(id)
        let photo: String = JS.str(o, "bilde") ?? JS.str(o, "avatarUrl") ?? ""
        let updated: Date? = JS.date(o["oppdatert"]) ?? JS.date(o["updated"])
        let st: String = JS.str(o, "status") ?? (updated == nil ? "off" : status(updated))
        let given: String = JS.str(o, "linje2") ?? ""
        let line: String
        if !given.isEmpty && given != "Ukjent sted" {
            line = given
        } else {
            line = line2(zone: JS.str(o, "sone") ?? "", activity: JS.str(o, "aktivitet") ?? "", place: JS.str(o, "sted") ?? "", updated: updated, status: st)
        }
        let ini: String = JS.str(o, "initialer") ?? initials(rawName, isSelf: isSelf)
        return FamPerson20(id: id, name: name, color: color, photo: photo, line2: line, initials: ini, status: st, isSelf: isSelf)
    }

    /// Reserve for eldre servere: bygges fra Familie-modellen. «Du» først og bare én gang.
    @MainActor static func fromFamily(_ m: FamilyModel) -> [FamPerson20] {
        var seenIds: Set<String> = []
        var me: FamPerson20? = nil
        var others: [FamPerson20] = []
        for mem in m.members {
            if seenIds.contains(mem.id) { continue }
            seenIds.insert(mem.id)
            let isSelf: Bool = !m.meId.isEmpty && mem.id == m.meId
            let person: FamPerson20 = fromMember(mem, isSelf: isSelf, zones: m.zones)
            if isSelf { me = person } else { others.append(person) }
        }
        let first: FamPerson20 = me ?? selfPlaceholder(m)
        return [first] + others
    }

    @MainActor private static func fromMember(_ mem: FamMember, isSelf: Bool, zones: [FamZone]) -> FamPerson20 {
        let pos: FamPos? = mem.last
        let sharingOn: Bool = mem.sharing == "on"
        let st: String = (sharingOn && pos != nil) ? status(pos?.ts) : "off"
        var zone: String = ""
        if let pos, st != "off" {
            let hit: FamZone? = zones.first { famDistance($0.coord, pos.coord) <= $0.radius }
            zone = hit?.name ?? ""
        }
        var line: String = line2(zone: zone, activity: pos?.activity ?? "", place: pos?.place ?? "", updated: pos?.ts, status: st)
        if mem.sharing == "paused" { line = "Pauset" }
        let color: String = mem.color.isEmpty ? stableColor(mem.id) : mem.color
        return FamPerson20(id: mem.id, name: isSelf ? "Du" : mem.first, color: color, photo: mem.avatarUrl, line2: line,
                           initials: initials(mem.name, isSelf: isSelf), status: st, isSelf: isSelf)
    }

    /// Serveren listet ikke deg selv: vis «Du» likevel, med egen delestatus.
    @MainActor private static func selfPlaceholder(_ m: FamilyModel) -> FamPerson20 {
        let on: Bool = m.sharing == "on"
        let line: String
        if let d = FamilyLocation.shared.lastFix, on {
            line = seen(d)
        } else {
            line = on ? "Henter posisjon …" : "Deler ikke posisjon"
        }
        let id: String = m.meId.isEmpty ? "meg" : m.meId
        return FamPerson20(id: id, name: "Du", color: stableColor(id), photo: "", line2: line, initials: "Du", status: "off", isSelf: true)
    }
}

/* ---------- Data ---------- */

@MainActor
@Observable
final class PositionsModel20 {
    static let shared = PositionsModel20()

    var people: [FamPerson20] = []
    var loaded = false
    /// Eldre server uten /api/family/positions (404): bruk /api/family.
    private var legacy = false
    private var lastLoad: Date = .distantPast

    func load(_ store: Store, force: Bool = false) async {
        if !force && loaded && Date().timeIntervalSince(lastLoad) < 30 { return }
        lastLoad = Date()
        if !legacy {
            do {
                let d: Data = try await store.api.callAt("/api", "GET", "/family/positions", timeout: 20)
                people = PositionsModel20.parse(d)
                loaded = true
                return
            } catch let e as APIError where e.status == 404 || e.status == 405 {
                legacy = true
            } catch {
                if loaded { return }
            }
        }
        let fm: FamilyModel = FamilyModel.shared
        if !fm.loaded || force || legacy { await fm.load(store) }
        people = FamPerson20Build.fromFamily(fm)
        loaded = true
    }

    /// Liste direkte, eller {items|positions|people: [...]}. Deg selv først og bare én gang.
    static func parse(_ d: Data) -> [FamPerson20] {
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var rows: [[String: Any]] = []
        if let list = any as? [Any] {
            rows = list.compactMap { $0 as? [String: Any] }
        } else if let o = any as? [String: Any] {
            rows = JS.list(o, "items")
            if rows.isEmpty { rows = JS.list(o, "positions") }
            if rows.isEmpty { rows = JS.list(o, "people") }
        }
        var seenIds: Set<String> = []
        var me: [FamPerson20] = []
        var others: [FamPerson20] = []
        for r in rows {
            let person: FamPerson20 = FamPerson20Build.fromServer(r)
            if seenIds.contains(person.id) { continue }
            seenIds.insert(person.id)
            if person.isSelf {
                if me.isEmpty { me.append(person) }
            } else {
                others.append(person)
            }
        }
        return me + others
    }
}

/* ---------- Kortet ---------- */

/// «POSISJON · FAMILIE» / «kart ›», to kolonner med fargede avatarer og statusprikk. Hele kortet åpner Familie → Kart.
struct PaperFamilyCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: PositionsModel20 { PositionsModel20.shared }

    var body: some View {
        Button { store.paperGo("familie") } label: { content }
            .buttonStyle(.plain)
            .task {
                await m.load(store)
                // Prompt 41: Hjemlys-raden i kortet.
                if !Hjemlys40Model.shared.loaded { await Hjemlys40Model.shared.load(store) }
            }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            // Prompt 41: aktiv Hjemlys øverst i kortet (Hjemlys41Views.swift).
            if Hjemlys41PosRow.any(Hjemlys40Model.shared) { Hjemlys41PosRow() }
            if m.people.isEmpty {
                Text(m.loaded ? "Ingen i familien ennå." : "Henter familien …").font(PF.ui(14)).foregroundStyle(p.mut)
            } else {
                PosGrid20(people: m.people)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(Rectangle())
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            PLabel(text: Hjemlys41PosRow.any(Hjemlys40Model.shared) ? "Posisjon · Familie · Hjemlys" : "Posisjon · Familie")
            Spacer()
            Text("kart ›").font(PF.ui(12)).foregroundStyle(p.mut)
        }
    }
}

/// Maks 4 ruter. Flere enn 4: tre personer og «+N».
struct PosGrid20: View {
    let people: [FamPerson20]

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(minimum: 0), spacing: 12), GridItem(.flexible(minimum: 0), spacing: 12)]
        let many: Bool = people.count > 4
        let shown: [FamPerson20] = many ? Array(people.prefix(3)) : people
        let extra: Int = many ? people.count - 3 : 0
        LazyVGrid(columns: cols, alignment: .leading, spacing: 10) {
            ForEach(shown) { person in PosCell20(person: person) }
            if extra > 0 { PosMoreCell20(count: extra) }
        }
    }
}

struct PosCell20: View {
    @Environment(\.paper) private var p
    let person: FamPerson20

    var body: some View {
        HStack(spacing: 10) {
            PosAvatar20(person: person)
            VStack(alignment: .leading, spacing: 1) {
                Text(person.name).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Text(person.line2).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1).truncationMode(.tail)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct PosMoreCell20: View {
    @Environment(\.paper) private var p
    let count: Int

    var body: some View {
        HStack(spacing: 10) {
            Text("+\(count)").font(PF.ui(12, .heavy)).foregroundStyle(p.ink)
                .frame(width: 34, height: 34)
                .background(p.bg, in: Circle())
            Text("Flere i Familie").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 34×34 avatar i personens farge (eller profilbilde) med statusprikk nede til høyre.
struct PosAvatar20: View {
    @Environment(\.paper) private var p
    let person: FamPerson20

    private var dot: Color {
        switch person.status {
        case "fresh": return Color(hex: "#2f7a4f")
        case "stale": return Color(hex: "#d9a400")
        default: return Color(hex: "#8a8578")
        }
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            PosAvatarFace20(person: person)
                .frame(width: 34, height: 34)
                .clipShape(Circle())
            ZStack {
                Circle().fill(p.card).frame(width: 14, height: 14)
                Circle().fill(dot).frame(width: 10, height: 10)
            }
            .offset(x: 2, y: 2)
        }
        .frame(width: 34, height: 34)
    }
}

struct PosAvatarFace20: View {
    @Environment(Store.self) private var store
    let person: FamPerson20
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            Circle().fill(Color(hex: person.color))
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Text(person.initials).font(PF.ui(12, .heavy)).foregroundStyle(.white)
            }
        }
        .task(id: person.photo) { await load() }
    }

    private func load() async {
        let path: String = person.photo
        guard !path.isEmpty else { img = nil; return }
        let full: String = path.hasPrefix("/") || path.hasPrefix("http") ? path : "/" + path
        img = await store.image(full)
    }
}
