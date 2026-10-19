import SwiftUI
import UIKit

/* ---------------- Prompt 38: Now Brief – tittel på linje med Ferdig, og nye kort ----------------
   prompts/prompt-38-pakke/claude-code-glimt-brief.md (2026-10-20), fasit Glimt Brief.dc.html → bx (pk, fam, sk, bd, nl).
   Topplinje: lyd- (🔇) og innstillingsknappen (⚙) er fjernet; tittelen («Morgenbrief») og Ferdig står på samme linje.
   Nye kort (etter Abonnementer, før Nyheter), fra /api/brief:
   - packages {count, items[{carrier, logo, name, status, due, dueRed}]} – bare egne pakker, trykk åpner Sporing.
   - family {items[{name, avatar, color, state, place, since}]} – bare de som deler posisjon.
   - school {items[{title, kind, date, daysLeft, color, red}]} – neste 7 dager (Studie/Jobb), trykk åpner Kalender.
   - birthdays {items[{name, age, date, daysLeft}]} + «+ Gave til … i Gjøremål» (POST /api/brief/gift {name, date}).
   - aurora {kp, cloud, best, text, show} – bare kveld/natt og Kp ≥ 3.
   Av/på og rekkefølge: GET /api/glimt/settings → cards[{id, on}] (Innstillinger → Glimt → Brief). */

struct Brief38Pkg: Identifiable, Hashable {
    let id: Int
    let carrier: String
    let name: String
    let status: String
    let due: String
    let dueRed: Bool
}

struct Brief38Fam: Identifiable, Hashable {
    let id: Int
    let name: String
    let color: String
    let state: String
    let place: String
    let since: String
}

struct Brief38School: Identifiable, Hashable {
    let id: Int
    let title: String
    let kind: String
    let date: String
    let daysLeft: Int
    let color: String
    let red: Bool
}

struct Brief38Bday: Identifiable, Hashable {
    let id: Int
    let name: String
    let age: Int
    let date: String
    let daysLeft: Int
    var text: String = ""
    var color: String = "#e8794a"
}

struct Brief38Aurora: Hashable {
    var kp: Double = 0
    var cloud: Int = -1
    var best: String = ""
    var text: String = ""
    var show: Bool = false
}

@MainActor
@Observable
final class Brief38Cards {
    static let shared = Brief38Cards()

    var packages: [Brief38Pkg] = []
    var pkgCount: Int = 0
    var family: [Brief38Fam] = []
    var school: [Brief38School] = []
    var birthdays: [Brief38Bday] = []
    var aurora: Brief38Aurora = Brief38Aurora()
    /// Rekkefølge og av/på (id → på). Standard: alle på i rekkefølgen fra fasiten.
    /// Alle kortene i brukerens rekkefølge (serverens id-er: weather, calendar, …, packages, family, school, birthdays, aurora, news, bible).
    var allOrder: [String] = Brief38Cards.serverDefault
    var off: Set<String> = []
    var giftDone: Set<String> = []
    var pkgLabel: String = ""
    var famLabel: String = ""
    var auroraLabel: String = ""

    /// De fem nye kortene (SERVER38: cards38.js CARD_IDS).
    static let mine: [String] = ["packages", "family", "school", "birthdays", "aurora"]
    static let serverDefault: [String] = ["weather", "calendar", "todos", "dinner", "trials", "packages", "family", "school", "birthdays", "aurora", "news", "bible"]

    /// De nye kortene i brukerens rekkefølge.
    var order: [String] { allOrder.filter { (id: String) -> Bool in Brief38Cards.mine.contains(id) } }

    /// Kortnavn (også de korte fra fasiten: pk, fam, sk, bd, nl) → serverens id-er.
    static func norm(_ id: String) -> String {
        switch id.lowercased() {
        case "pk", "pak", "packages", "pakker", "tracking": return "packages"
        case "fam", "family", "familie": return "family"
        case "sk", "sko", "school", "skole", "skole-jobb", "work": return "school"
        case "bd", "bur", "birthdays", "bursdager": return "birthdays"
        case "nl", "nor", "aurora", "nordlys": return "aurora"
        default: return id.lowercased()
        }
    }

    private func takeCards(_ list: [[String: Any]]) {
        if list.isEmpty { return }
        var ord: [String] = []
        var offs: Set<String> = []
        for c in list {
            guard let raw = JS.str(c, "id") else { continue }
            let id: String = Brief38Cards.norm(raw)
            if !ord.contains(id) { ord.append(id) }
            if JS.bool(c, "on") == false { offs.insert(id) }
        }
        for id in Brief38Cards.mine where !ord.contains(id) { ord.append(id) }
        allOrder = ord
        off = offs
    }

    func parse(_ d: Data) {
        let o: [String: Any] = JS.obj(d)
        let root: [String: Any] = JS.dict(o, "brief") ?? o
        takeCards(JS.list(root, "cards"))
        let pk: [String: Any]? = JS.dict(root, "packages")
        pkgLabel = JS.str(pk, "label") ?? ""
        famLabel = JS.str(JS.dict(root, "family"), "label") ?? ""
        auroraLabel = JS.str(JS.dict(root, "aurora"), "label") ?? ""
        packages = JS.list(pk, "items").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Brief38Pkg in
            let x: [String: Any] = pair.element
            return Brief38Pkg(id: pair.offset, carrier: JS.str(x, "carrier") ?? JS.str(x, "logo") ?? "", name: JS.str(x, "name") ?? "Pakke",
                              status: JS.str(x, "status") ?? "", due: JS.str(x, "due") ?? "", dueRed: JS.bool(x, "dueRed") ?? false)
        }
        pkgCount = JS.int(pk, "count") ?? packages.count
        family = JS.list(JS.dict(root, "family"), "items").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Brief38Fam in
            let x: [String: Any] = pair.element
            return Brief38Fam(id: pair.offset, name: JS.str(x, "name") ?? "", color: JS.str(x, "color") ?? "#2b5d8a", state: JS.str(x, "state") ?? "",
                              place: JS.str(x, "place") ?? "", since: JS.str(x, "since") ?? "")
        }
        school = JS.list(JS.dict(root, "school"), "items").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Brief38School in
            let x: [String: Any] = pair.element
            let left: Int = JS.int(x, "daysLeft") ?? 0
            return Brief38School(id: pair.offset, title: JS.str(x, "title") ?? "", kind: JS.str(x, "kind") ?? "", date: JS.str(x, "dateLabel") ?? JS.str(x, "date") ?? "",
                                 daysLeft: left, color: JS.str(x, "color") ?? "#2b5d8a", red: JS.bool(x, "red") ?? (left <= 4))
        }
        birthdays = JS.list(JS.dict(root, "birthdays"), "items").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Brief38Bday in
            let x: [String: Any] = pair.element
            return Brief38Bday(id: pair.offset, name: JS.str(x, "name") ?? "", age: JS.int(x, "age") ?? 0, date: JS.str(x, "date") ?? "",
                               daysLeft: JS.int(x, "daysLeft") ?? 0, text: JS.str(x, "text") ?? "", color: JS.str(x, "color") ?? "#e8794a")
        }
        if let a = JS.dict(root, "aurora") {
            aurora = Brief38Aurora(kp: JS.num(a, "kp") ?? 0, cloud: JS.int(a, "cloud") ?? -1, best: JS.str(a, "best") ?? "",
                                   text: JS.str(a, "text") ?? "", show: JS.bool(a, "show") ?? ((JS.num(a, "kp") ?? 0) >= 3))
        } else {
            aurora = Brief38Aurora()
        }
    }

    /// cards[{id, on}] fra /api/glimt/settings.
    func loadSettings(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/glimt/settings", timeout: 10) else { return }
        let o: [String: Any] = JS.obj(d)
        let root: [String: Any] = JS.dict(o, "settings") ?? o
        takeCards(JS.list(root, "cards"))
    }

    func toggle(_ id: String, _ store: Store) {
        Haptic34.light()
        if off.contains(id) { off.remove(id) } else { off.insert(id) }
        save(store)
    }

    /// Flytter kortet forbi naboen blant de nye kortene (plassene i hele listen beholdes).
    func move(_ id: String, up: Bool, _ store: Store) {
        let mineOrder: [String] = order
        guard let i = mineOrder.firstIndex(of: id) else { return }
        let j: Int = up ? i - 1 : i + 1
        if j < 0 || j >= mineOrder.count { return }
        guard let a = allOrder.firstIndex(of: id), let b = allOrder.firstIndex(of: mineOrder[j]) else { return }
        Haptic34.light()
        allOrder.swapAt(a, b)
        save(store)
    }

    private func save(_ store: Store) {
        let cards: [[String: Any]] = allOrder.map { (id: String) -> [String: Any] in ["id": id, "on": !off.contains(id)] }
        Task { _ = try? await store.api.callAt("/api", "PUT", "/glimt/settings", json: ["cards": cards], timeout: 10) }
    }

    func gift(_ b: Brief38Bday, _ store: Store) {
        Haptic34.light()
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "POST", "/brief/gift", json: ["name": b.name, "date": b.date], timeout: 10)
                self.giftDone.insert(b.name)
                Haptics.shared.success()
                Glimt35Model.shared.flash("«Kjøp gave til " + b.name + "» ligger i Gjøremål")
            } catch let e as APIError {
                Glimt35Model.shared.flash(e.status == 404 ? "Serveren kan ikke legge til gaver ennå" : e.message)
            } catch {
                Glimt35Model.shared.flash(error.localizedDescription)
            }
        }
    }

    static let names: [String: String] = ["packages": "Pakker", "family": "Familie", "school": "Skole og jobb", "birthdays": "Bursdager", "aurora": "Nordlys i natt"]
}

/* ---------- Topplinje: tittel + Ferdig ---------- */

struct Brief38TitleRow: View {
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    let kick: String

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(kick).font(PF.serif(40, medium: true)).foregroundStyle(Brief34C.ink)
                .lineLimit(1).minimumScaleFactor(0.6)
            Spacer(minLength: 8)
            Glimt35DoneButton(title: "Ferdig") {
                Glimt35Voice.shared.stop()
                m.close()
            }
        }
    }
}

/* ---------- Kortene ---------- */

/// De nye kortene i rekkefølgen fra Innstillinger → Glimt → Brief.
struct Brief38CardsStack: View {
    @Environment(Store.self) private var store
    @MainActor private var c: Brief38Cards { Brief38Cards.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(c.order, id: \.self) { (id: String) in
                if !c.off.contains(id) { card(id) }
            }
        }
        .task { await c.loadSettings(store) }
    }

    @ViewBuilder private func card(_ id: String) -> some View {
        switch id {
        case "packages": if !c.packages.isEmpty { Brief38PkgCard() }
        case "family": if !c.family.isEmpty { Brief38FamCard() }
        case "school": if !c.school.isEmpty { Brief38SchoolCard() }
        case "birthdays": if !c.birthdays.isEmpty { Brief38BdayCard() }
        case "aurora": if c.aurora.show && Brief38AuroraCard.evening { Brief38AuroraCard() }
        default: EmptyView()
        }
    }
}

struct Brief38Head: View {
    let title: String
    let kick: String
    var kickColor: Color = Brief34C.red
    var fg: Color = Brief34C.ink

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title).font(PF.serif(26, medium: true)).foregroundStyle(fg)
            Spacer(minLength: 6)
            Text(kick).font(PF.mono(11)).tracking(1.1).foregroundStyle(kickColor)
        }
    }
}

struct Brief38Line: View {
    var body: some View { Rectangle().fill(Brief34C.line).frame(height: 1) }
}

struct Brief38PkgCard: View {
    @Environment(Store.self) private var store
    @MainActor private var c: Brief38Cards { Brief38Cards.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Brief38Head(title: "Pakker", kick: c.pkgLabel.isEmpty ? String(c.pkgCount) + " PÅ VEI" : c.pkgLabel)
            ForEach(c.packages.prefix(4)) { (x: Brief38Pkg) in
                Button {
                    Haptic34.light()
                    Brief34Model.shared.close()
                    store.paperGo("sporing")
                } label: { row(x) }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func row(_ x: Brief38Pkg) -> some View {
        VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                Brief38CarrierLogo(carrier: x.carrier)
                VStack(alignment: .leading, spacing: 2) {
                    Text(x.name).font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    Text(x.status).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                if !x.due.isEmpty {
                    Text(x.due).font(PF.mono(12)).foregroundStyle(x.dueRed ? Brief34C.red : Brief34C.mut).lineLimit(1)
                }
            }
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
    }
}

/// Transportørlogo fra Assets (Carrier-<navn>), ellers første bokstav på farget brikke.
struct Brief38CarrierLogo: View {
    let carrier: String

    var body: some View {
        let key: String = carrier.lowercased().replacingOccurrences(of: " ", with: "")
        if let img = UIImage(named: "Carrier-" + key) {
            Image(uiImage: img).resizable().scaledToFill()
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        } else {
            Text(String(carrier.prefix(1)).uppercased()).font(PF.ui(12, .heavy)).foregroundStyle(Color.white)
                .frame(width: 36, height: 36)
                .background(Brief34C.rgb(0x2b5d8a), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
    }
}

struct Brief38FamCard: View {
    @Environment(Store.self) private var store
    @MainActor private var c: Brief38Cards { Brief38Cards.shared }

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 14, alignment: .leading), GridItem(.flexible(), spacing: 14, alignment: .leading)]
        Button {
            Haptic34.light()
            Brief34Model.shared.close()
            store.paperGo("familie")
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                Brief38Head(title: "Familie", kick: kick)
                LazyVGrid(columns: cols, alignment: .leading, spacing: 10) {
                    ForEach(c.family.prefix(6)) { (x: Brief38Fam) in cell(x) }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(Press37Style())
    }

    private var kick: String {
        if !c.famLabel.isEmpty { return c.famLabel }
        let home: Int = c.family.filter { (x: Brief38Fam) -> Bool in x.state.lowercased().hasPrefix("hjemme") }.count
        return home > 0 ? String(home) + " HJEMME" : String(c.family.count) + " DELER"
    }

    private func cell(_ x: Brief38Fam) -> some View {
        let s: String = x.state.lowercased()
        let dot: Color = s.hasPrefix("hjemme") ? Brief34C.rgb(0x2f7a4f) : (s.contains("vei") ? Brief34C.rgb(0xe8794a) : Brief34C.rgb(0x2b5d8a))
        let sub: String = [x.state, x.place.isEmpty ? x.since : x.place].filter { (t: String) -> Bool in !t.isEmpty }.joined(separator: " · ")
        return HStack(spacing: 10) {
            Text(String(x.name.prefix(1)).uppercased()).font(PF.ui(13, .heavy)).foregroundStyle(Color.white)
                .frame(width: 36, height: 36)
                .background(Color(hex: x.color), in: Circle())
                .overlay(alignment: .bottomTrailing) {
                    Circle().fill(dot).frame(width: 11, height: 11)
                        .overlay(Circle().strokeBorder(Brief34C.card, lineWidth: 2))
                        .offset(x: 1, y: 1)
                }
            VStack(alignment: .leading, spacing: 1) {
                Text(x.name).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                Text(sub).font(PF.ui(12)).foregroundStyle(Brief34C.mut).lineLimit(1)
            }
        }
    }
}

struct Brief38SchoolCard: View {
    @Environment(Store.self) private var store
    @MainActor private var c: Brief38Cards { Brief38Cards.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Brief38Head(title: "Skole og jobb", kick: "NESTE 7 DAGER")
            ForEach(c.school.prefix(5)) { (x: Brief38School) in
                Button {
                    Haptic34.light()
                    Brief34Model.shared.close()
                    store.paperGo("kalender")
                } label: { row(x) }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func row(_ x: Brief38School) -> some View {
        let kind: String = x.kind == "prove" ? "Prøve" : (x.kind == "frist" ? "Frist" : (x.kind.isEmpty ? "" : x.kind.capitalized))
        let sub: String = [kind, x.date].filter { (t: String) -> Bool in !t.isEmpty }.joined(separator: " · ")
        return VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 3).fill(Color(hex: x.color)).frame(width: 6).padding(.vertical, 8)
                VStack(alignment: .leading, spacing: 2) {
                    Text(x.title).font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(x.daysLeft <= 0 ? "I dag" : String(x.daysLeft)).font(PF.serif(18, medium: true))
                        .foregroundStyle(x.red ? Brief34C.red : Brief34C.ink)
                    if x.daysLeft > 0 { Text(x.daysLeft == 1 ? "dag" : "dager").font(PF.ui(11)).foregroundStyle(Brief34C.mut) }
                }
            }
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
    }
}

struct Brief38BdayCard: View {
    @Environment(Store.self) private var store
    @MainActor private var c: Brief38Cards { Brief38Cards.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Brief38Head(title: "Bursdager", kick: "NESTE 30 DAGER")
            ForEach(c.birthdays.prefix(4)) { (x: Brief38Bday) in
                Button {
                    Haptic34.light()
                    Brief34Model.shared.close()
                    store.paperGo("bursdag")
                } label: { row(x) }
                .buttonStyle(.plain)
            }
            if let f = c.birthdays.first {
                let done: Bool = c.giftDone.contains(f.name)
                Button { if !done { c.gift(f, store) } } label: {
                    Text(done ? "✓ Gave til " + f.name + " ligger i Gjøremål" : "+ Gave til " + f.name + " i Gjøremål")
                        .font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                        .padding(.horizontal, 13).frame(height: 32)
                        .overlay(Capsule().strokeBorder(Brief34C.rgb(0xddd5c5), lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func row(_ x: Brief38Bday) -> some View {
        let sub: String = !x.text.isEmpty ? x.text : (x.age > 0 ? "Fyller " + String(x.age) : "Bursdag") + (x.date.isEmpty ? "" : " · " + x.date)
        return VStack(spacing: 0) {
            Brief38Line()
            HStack(spacing: 12) {
                Text(String(x.name.prefix(1)).uppercased()).font(PF.ui(13, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 36, height: 36)
                    .background(Color(hex: x.color), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(x.name).font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(x.daysLeft <= 0 ? "I dag" : String(x.daysLeft)).font(PF.serif(18, medium: true))
                        .foregroundStyle(x.daysLeft <= 2 ? Brief34C.red : Brief34C.ink)
                    if x.daysLeft > 0 { Text(x.daysLeft == 1 ? "dag" : "dager").font(PF.ui(11)).foregroundStyle(Brief34C.mut) }
                }
            }
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
    }
}

struct Brief38AuroraCard: View {
    @MainActor private var c: Brief38Cards { Brief38Cards.shared }

    /// Bare i kvelds- og nattbriefen (17–06).
    static var evening: Bool {
        let h: Int = Calendar.current.component(.hour, from: Date())
        return h >= 17 || h < 6
    }

    var body: some View {
        let a: Brief38Aurora = c.aurora
        VStack(alignment: .leading, spacing: 10) {
            Brief38Head(title: "Nordlys i natt", kick: c.auroraLabel.isEmpty ? "KP " + Brief38AuroraCard.kpText(a.kp) : c.auroraLabel, kickColor: Brief34C.rgb(0xbff5df), fg: Color.white)
            if !a.text.isEmpty {
                Text(a.text).font(PF.ui(14.5)).foregroundStyle(Color.white.opacity(0.9)).lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                tile("KP-INDEKS", Brief38AuroraCard.kpText(a.kp))
                tile("SKYDEKKE", a.cloud >= 0 ? String(a.cloud) + " %" : "–")
                tile("BESTE TID", a.best.isEmpty ? "–" : a.best)
            }
            Text("NOAA SWPC · MET").font(PF.mono(9.5, bold: false)).foregroundStyle(Color.white.opacity(0.55))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { Brief38AuroraBack().clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous)) }
    }

    static func kpText(_ v: Double) -> String {
        if v == v.rounded() { return String(Int(v)) }
        return String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
    }

    private func tile(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k).font(PF.mono(9.5)).tracking(1).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1)
            Text(v).font(PF.serif(20, medium: true)).foregroundStyle(Color.white).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Nordlys-gradienten fra fasiten (lilla oppe til høyre, grønn nede til venstre, mørk blå bunn). Ingen blur.
struct Brief38AuroraBack: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Brief34C.rgb(0x0f1a2e), Brief34C.rgb(0x1b2340)], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [Brief34C.rgb(0x9a6ad9, 0.9), Color.clear], center: UnitPoint(x: 0.85, y: 0), startRadius: 0, endRadius: 260)
            RadialGradient(colors: [Brief34C.rgb(0x2fc39a, 0.85), Color.clear], center: UnitPoint(x: 0.1, y: 1), startRadius: 0, endRadius: 240)
        }
    }
}

/* ---------- Innstillinger → Glimt: kortene i briefen ---------- */

struct Brief38CardsSettings: View {
    @Environment(Store.self) private var store
    @MainActor private var c: Brief38Cards { Brief38Cards.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(c.order.enumerated()), id: \.element) { (pair: (offset: Int, element: String)) in
                row(pair.element, first: pair.offset == 0, last: pair.offset == c.order.count - 1)
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
        .task { await c.loadSettings(store) }
    }

    private func row(_ id: String, first: Bool, last: Bool) -> some View {
        let on: Bool = !c.off.contains(id)
        return HStack(spacing: 8) {
            Text(Brief38Cards.names[id] ?? id).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button { c.move(id, up: true, store) } label: {
                Image(systemName: "chevron.up").font(.system(size: 12, weight: .bold)).foregroundStyle(first ? Brief34C.mut2 : Brief34C.ink)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain).disabled(first)
            .accessibilityLabel("Flytt opp")
            Button { c.move(id, up: false, store) } label: {
                Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(last ? Brief34C.mut2 : Brief34C.ink)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain).disabled(last)
            .accessibilityLabel("Flytt ned")
            Button { c.toggle(id, store) } label: { Glimt35Switch(on: on) }
                .buttonStyle(.plain)
                .accessibilityValue(on ? "På" : "Av")
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Brief34C.line).frame(height: 1) }
    }
}
