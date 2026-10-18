import SwiftUI
import UIKit

/* ---------------- Prompt 24: Familie – én person = én oppføring (flere enheter) ---------------- */

/// Én enhet personen er logget inn på (fra `devices` i /api/family).
struct FamDevice: Identifiable, Hashable {
    var id: String
    var name: String
    var platform: String
    var battery: Double?
    var lastSeen: Date?
    var accuracy: Double?
    var isSource: Bool

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? JS.str(o, "deviceId") ?? UUID().uuidString
        name = JS.str(o, "name") ?? JS.str(o, "device") ?? "Enhet"
        platform = JS.str(o, "platform") ?? ""
        battery = JS.num(o, "battery")
        lastSeen = JS.date(o["lastSeen"]) ?? JS.date(o["ts"])
        accuracy = JS.num(o, "accuracy") ?? JS.num(o, "acc")
        isSource = JS.bool(o, "isSource") ?? false
    }

    init(id: String, name: String, battery: Double?, lastSeen: Date?, accuracy: Double?, isSource: Bool) {
        self.id = id
        self.name = name
        self.platform = ""
        self.battery = battery
        self.lastSeen = lastSeen
        self.accuracy = accuracy
        self.isSource = isSource
    }
}

/// Fast id for denne installasjonen (sendes som deviceId med posisjonen).
enum Fam24Device {
    static var installId: String {
        let k: String = "fh_device_id24"
        if let v = UserDefaults.standard.string(forKey: k), !v.isEmpty { return v }
        let v: String = "ios-" + UUID().uuidString.lowercased()
        UserDefaults.standard.set(v, forKey: k)
        return v
    }
}

enum Fam24Group {
    /// Grupper på person (user_id). Nye servere sender allerede én post per person; eldre kan sende én per enhet.
    static func merge(_ list: [FamMember]) -> [FamMember] {
        var order: [String] = []
        var groups: [String: [FamMember]] = [:]
        for mem in list {
            if groups[mem.id] == nil { order.append(mem.id); groups[mem.id] = [] }
            groups[mem.id]?.append(mem)
        }
        var out: [FamMember] = []
        for id in order {
            let g: [FamMember] = groups[id] ?? []
            if g.count == 1 { out.append(g[0]); continue }
            if let one = combine(g) { out.append(one) }
        }
        return out
    }

    /// Posisjon fra enheten med lavest nøyaktighet de siste 5 minuttene, ellers den nyeste.
    private static func combine(_ g: [FamMember]) -> FamMember? {
        guard var best = g.first else { return nil }
        let now: Date = Date()
        let recent: [FamMember] = g.filter { (m: FamMember) -> Bool in
            guard let ts = m.last?.ts else { return false }
            return now.timeIntervalSince(ts) < 5 * 60
        }
        if !recent.isEmpty {
            best = recent.min { (a: FamMember, b: FamMember) -> Bool in (a.last?.acc ?? 9999) < (b.last?.acc ?? 9999) } ?? best
        } else {
            best = g.max { (a: FamMember, b: FamMember) -> Bool in
                (a.last?.ts ?? Date.distantPast) < (b.last?.ts ?? Date.distantPast)
            } ?? best
        }
        var devs: [FamDevice] = []
        for (i, m) in g.enumerated() {
            if !m.devices.isEmpty {
                for d in m.devices where !devs.contains(where: { $0.id == d.id }) { devs.append(d) }
                continue
            }
            let name: String = (m.last?.device ?? "").isEmpty ? "Enhet \(i + 1)" : (m.last?.device ?? "")
            let isSrc: Bool = m.last?.ts == best.last?.ts && m.last?.lat == best.last?.lat
            devs.append(FamDevice(id: "dev\(i)-" + name, name: name, battery: m.last?.battery, lastSeen: m.last?.ts, accuracy: m.last?.acc, isSource: isSrc))
        }
        best.devices = devs
        best.deviceCount = Swift.max(best.deviceCount, devs.count)
        if best.sourceDevice.isEmpty { best.sourceDevice = devs.first(where: { $0.isSource })?.id ?? "" }
        if best.health == nil { best.health = g.first(where: { $0.health != nil })?.health }
        return best
    }

    /// « · 2 enheter» når personen har flere enheter.
    static func suffix(_ mem: FamMember) -> String {
        let n: Int = Swift.max(mem.deviceCount, mem.devices.count)
        return n > 1 ? " · \(n) enheter" : ""
    }
}

extension FamilyModel {
    /// Velg hvilken enhet som brukes som kilde (nil = automatisk). PUT /api/family/me/source.
    func setSource24(_ deviceId: String?, _ store: Store) {
        Haptics.shared.select()
        let body: [String: Any] = ["deviceId": deviceId.map { $0 as Any } ?? NSNull()]
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "PUT", "/family/me/source", json: body)
                store.flash(deviceId == nil ? "Kilde: automatisk" : "Kilde er valgt")
                await self.load(store)
            } catch let e as APIError where e.status == 404 {
                store.flash("Serveren støtter ikke valg av kilde ennå")
            } catch {
                store.flash("Kunne ikke velge kilde: \(error.localizedDescription)")
            }
        }
    }
}

/// ENHETER i personkortet: «iPhone 15 Pro · 82 % · nå». Trykk velger kilde (bare for deg selv), «Automatisk» som standard.
struct Fam24Devices: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let mem: FamMember
    let isMe: Bool
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(alignment: .leading, spacing: 6) {
            Fam22Label(text: "Enheter · \(mem.devices.count)")
            VStack(spacing: 0) {
                if isMe { autoRow(t) }
                ForEach(Array(mem.devices.enumerated()), id: \.element.id) { i, d in
                    if i > 0 || isMe { Rectangle().fill(t.line).frame(height: 1) }
                    deviceRow(t, d)
                }
            }
            .padding(.horizontal, 12)
            .background(RoundedRectangle(cornerRadius: 14).fill(t.bg))
        }
    }

    private func autoRow(_ t: Fam22Tok) -> some View {
        Button { m.setSource24(nil, store) } label: {
            HStack(spacing: 10) {
                Text("Automatisk").font(PF.ui(13.5, .bold)).foregroundStyle(t.ink)
                Text("nyeste og mest nøyaktige").font(PF.ui(12)).foregroundStyle(t.mut).lineLimit(1)
                Spacer(minLength: 0)
                check(t, on: !mem.sourceManual)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func deviceRow(_ t: Fam22Tok, _ d: FamDevice) -> some View {
        let on: Bool = d.isSource || (!mem.sourceDevice.isEmpty && mem.sourceDevice == d.id)
        let bat: String = d.battery.map { "\(Int($0.rounded())) %" } ?? "–"
        let when: String = Fam22Fmt.ago(d.lastSeen).lowercased()
        return Button { if isMe { m.setSource24(d.id, store) } } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.name).font(PF.ui(13.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(bat + " · " + when).font(PF.ui(12)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer(minLength: 0)
                if on {
                    Text("KILDE").font(PF.mono(9.5)).tracking(1.1).foregroundStyle(t.pos)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .overlay(Capsule().strokeBorder(t.pos, lineWidth: 1))
                }
                if isMe { check(t, on: mem.sourceManual && on) }
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func check(_ t: Fam22Tok, on: Bool) -> some View {
        ZStack {
            Circle().strokeBorder(on ? t.ink : t.line, lineWidth: 1.5)
            if on { Circle().fill(t.ink).padding(4) }
        }
        .frame(width: 20, height: 20)
    }
}
