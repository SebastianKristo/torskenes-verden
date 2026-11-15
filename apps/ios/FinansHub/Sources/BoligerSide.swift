import SwiftUI
import UIKit

/* ---------------- Prompt 24: Boliger nøyaktig etter Boliger.dc.html (variant mobile, papir, hide-title) ----------------
   Likt i Standard og Finans + Boliger: bolig-piller (hold inne 0,5 s = «Rediger bolig»), fanevelger,
   bolig-kortet i boligens farge, fire handlinger, Til gjennomgang, Kategorier, Historikk og Siste utgifter. */

/// Arkene på Boliger-siden.
struct Bol24Sheet: Identifiable, Hashable {
    let id: String
}

enum Bol24Color {
    /// 70 % farge + 30 % svart (color-mix i designet).
    static func darker(_ hex: String) -> Color {
        let v: UInt64 = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x2f6b45
        let r: Double = Double((v >> 16) & 0xFF) / 255 * 0.7
        let g: Double = Double((v >> 8) & 0xFF) / 255 * 0.7
        let b: Double = Double(v & 0xFF) / 255 * 0.7
        return Color(red: r, green: g, blue: b)
    }

    static func gradient(_ hex: String) -> LinearGradient {
        LinearGradient(colors: [Color(hex: hex), darker(hex)], startPoint: UnitPoint(x: 0.25, y: 0), endPoint: UnitPoint(x: 0.75, y: 1))
    }
}

struct Bol24Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var sheet: Bol24Sheet? = nil
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        VStack(spacing: 14) {
            if m.homes.isEmpty {
                emptyState
            } else {
                Bol24Pills(edit: { id in sheet = Bol24Sheet(id: "edit:\(id)") }, add: { sheet = Bol24Sheet(id: "new") })
                Bol24Tabs()
                if let h = m.home { tabContent(h) }
            }
        }
        .task { await m.load(store) }
        .sheet(item: $sheet) { s in
            sheetView(s)
                .environment(\.paper, p)
                .presentationDetents([.large])
                .sheetEdge30(p.bg)
        }
        .dismissHaptic30(sheet != nil)
    }

    @ViewBuilder private func tabContent(_ h: Bol24Home) -> some View {
        switch m.tab {
        case "ex":
            Bol24Expenses(home: h) { e in sheet = Bol24Sheet(id: "entry:\(e.id)") }
        case "acc":
            // Prompt 47: Tilgang er ikke lenger en fane – den åpnes fra «Rediger bolig» og har «‹ Oversikt» øverst.
            Bol47AccessPage(home: h)
        default:
            Bol24Overview(home: h, open: { e in sheet = Bol24Sheet(id: "entry:\(e.id)") }, add: { sheet = Bol24Sheet(id: "add") })
        }
    }

    @ViewBuilder private func sheetView(_ s: Bol24Sheet) -> some View {
        if s.id == "new" {
            Bol24NewHomeSheet { sheet = nil }
        } else if s.id == "add" {
            if let h = m.home { Bol24AddSheet(home: h) { sheet = nil } }
        } else if s.id.hasPrefix("edit:") {
            if let id = Int(s.id.dropFirst(5)), let h = m.homes.first(where: { $0.id == id }) {
                Bol24EditSheet(home: h, close: { sheet = nil }, access: {
                    sheet = nil
                    m.tab = "acc"
                })
            }
        } else if s.id.hasPrefix("entry:") {
            if let id = Int(s.id.dropFirst(6)), let h = m.home, let e = h.entries.first(where: { $0.id == id }) {
                Bol24EntrySheet(home: h, entry: e) { sheet = nil }
            }
        }
    }

    @ViewBuilder private var emptyState: some View {
        if !m.loaded {
            PCard {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Henter boligene …").font(PF.ui(13.5)).foregroundStyle(p.mut)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ingen boliger ennå").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                Text(m.error ?? "Lag en bolig, så kan du laste opp kvitteringer og følge utgiftene per måned.")
                    .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                Bol24Button(title: "+ Ny bolig", fg: p.bg, bg: p.ink, border: nil, height: 46) { sheet = Bol24Sheet(id: "new") }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

/// Full knapp i Papir-stil (ikke systemknapp).
struct Bol24Button: View {
    let title: String
    let fg: Color
    let bg: Color
    let border: Color?
    var height: CGFloat = 44
    var font: CGFloat = 14
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(PF.ui(font, .bold)).foregroundStyle(fg).lineLimit(1)
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .background(bg, in: Capsule())
                .overlay(Capsule().strokeBorder(border ?? Color.clear, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Bolig-pillene ---------- */

/// Høyde 52, radius 26. Valgt = ink med lys tekst, ellers card med line-kant. Siste pille: «+ Ny bolig» (stiplet).
struct Bol24Pills: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let edit: (Int) -> Void
    let add: () -> Void
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(m.homes) { h in pill(h) }
                Button(action: add) {
                    Text("+ Ny bolig").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                        .padding(.horizontal, 18)
                        .frame(height: 52)
                        .overlay(Capsule().strokeBorder(p.line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
        .padding(.horizontal, -16)
    }

    private func pill(_ h: Bol24Home) -> some View {
        let on: Bool = m.home?.id == h.id
        let fg: Color = on ? p.bg : p.ink
        let sub: String = bol24kr(h.spent(Bol24Model.thisMonth)) + " i " + Bol24Model.monthShort[Bol24Model.monthIndex(Bol24Model.thisMonth)].lowercased()
        return Button { m.select(h.id, store) } label: {
            HStack(spacing: 10) {
                Text(h.initial).font(PF.serif(17, medium: true)).foregroundStyle(Color.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color(hex: h.color)))
                VStack(alignment: .leading, spacing: 0) {
                    Text(h.name).font(PF.ui(14, .bold)).foregroundStyle(fg).lineLimit(1)
                    Text(sub).font(PF.ui(11.5)).foregroundStyle(fg.opacity(0.75)).lineLimit(1)
                }
                .fixedSize()
            }
            .padding(.leading, 8).padding(.trailing, 16)
            .frame(height: 52)
            .background(Capsule().fill(on ? p.ink : p.card))
            .overlay(Capsule().strokeBorder(on ? p.ink : p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in
            Haptics.shared.tick()
            m.select(h.id, store)
            edit(h.id)
        })
        .accessibilityHint("Hold inne for å redigere boligen")
    }
}

/* ---------- Fanevelgeren ---------- */

struct Bol24Tabs: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    private var tabs: [(String, String)] {
        let h: Bol24Home? = m.home
        let mine: [Bol24Entry] = h?.entries ?? []
        let hasReview: Bool = mine.contains { $0.review }
        let ex: String = hasReview ? "Utgifter · \(mine.count)" : "Utgifter"
        // Prompt 47: fanen «Tilgang» er fjernet på mobil (åpnes fra «Delt med N» i «Rediger bolig»).
        return [("ov", "Oversikt"), ("ex", ex)]
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(tabs, id: \.0) { t in
                let on: Bool = m.tab == t.0
                Button {
                    Haptics.shared.select()
                    m.tab = t.0
                } label: {
                    Text(t.1).font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(Capsule().fill(on ? p.ink : Color.clear))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Capsule().fill(p.card))
    }
}

/* ---------- Bolig-kortet ---------- */

/// Boligens farge som gradient (150°, farge → 70 % farge + svart). Navn Newsreader 30, «Brukt denne måneden» Newsreader 52.
struct Bol24HomeCard: View {
    let home: Bol24Home

    private var month: String { Bol24Model.thisMonth }
    private var spent: Double { home.spent(month) }
    private var prev: Double { home.spent(Bol24Model.monthKey(-1)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            amount
            budget
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(Color.white)
        .background(Bol24Color.gradient(home.color), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text(home.initial).font(PF.serif(22, medium: true))
                .frame(width: 46, height: 46)
                .background(Circle().fill(Color.white.opacity(0.18)))
            VStack(alignment: .leading, spacing: 1) {
                Text(home.name).font(PF.serif(30, medium: true)).lineLimit(1).minimumScaleFactor(0.6)
                if !home.address.isEmpty { Text(home.address).font(PF.ui(12.5)).opacity(0.85).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(Bol24Model.monthNames[Bol24Model.monthIndex(month)]).font(PF.ui(12, .bold))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.16)))
        }
    }

    private var deltaText: String {
        let prevName: String = Bol24Model.monthNames[Bol24Model.monthIndex(Bol24Model.monthKey(-1))].lowercased()
        guard prev > 0 else { return "Første måned" }
        let d: Double = (spent - prev) / prev * 100
        let arrow: String = d >= 0 ? "▲ " : "▼ "
        return arrow + "\(Int(abs(d).rounded())) % fra " + prevName
    }

    private var amount: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Brukt denne måneden").font(PF.ui(13)).opacity(0.85)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(bol24kr(spent)).font(PF.serif(52, medium: true)).lineLimit(1).minimumScaleFactor(0.5)
                Text(deltaText).font(PF.ui(13, .bold)).lineLimit(1).fixedSize()
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.16)))
            }
        }
    }

    @ViewBuilder private var budget: some View {
        if let b = home.budget, b > 0 {
            let pct: Double = Swift.min(1, spent / b)
            let over: Bool = spent > b
            VStack(spacing: 6) {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 5).fill(Color.white.opacity(0.2))
                        RoundedRectangle(cornerRadius: 5).fill(over ? Color(hex: "#ffb4a8") : Color.white)
                            .frame(width: g.size.width * CGFloat(pct))
                    }
                }
                .frame(height: 10)
                HStack {
                    Text("av " + bol24kr(b) + " i budsjett").font(PF.ui(12.5))
                    Spacer()
                    Text(over ? bol24kr(spent - b) + " over" : bol24kr(b - spent) + " igjen").font(PF.ui(12.5, .bold))
                }
                .opacity(0.9)
            }
        } else {
            Text("Ingen budsjett · hold inne på boligen for å sette det").font(PF.ui(12.5)).opacity(0.85)
        }
    }
}

/* ---------------- Prompt 24: toppbildet på Boliger og domene-pillen ---------------- */

/// Bakgrunnen til valgt bolig i toppbildet (Strømstad-bildet eller eget bilde). «Farge» gir vanlig toppbilde.
/// Bytter med krysstoning på 200 ms. Gradienten i PaperHero ligger over, som på de andre toppbildene.
struct Bol24HeroLayer: View {
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        ZStack {
            if let img = m.heroImage {
                Color.clear
                    .overlay { Image(uiImage: img).resizable().scaledToFill() }
                    .clipped()
                    .id(m.heroKey)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: 0.2), value: m.heroKey)
        .allowsHitTesting(false)
    }
}

/// Domene-sammendraget: besøk i dag, antall domener og status. Hentes høyst hvert 5. minutt.
@MainActor
@Observable
final class Dom24Summary {
    static let shared = Dom24Summary()
    var visits: Double? = nil
    var domains: Int = 0
    var status: String = "ok"
    var available: Bool = false
    private var last: Date = .distantPast

    /// «48 597» med mellomrom som tusenskille (besøk er ikke beløp og skjules aldri).
    nonisolated static func format(_ v: Double) -> String {
        dom24Number.string(from: NSNumber(value: v)) ?? String(Int(v))
    }

    func load(_ store: Store, force: Bool = false) async {
        if !force && Date().timeIntervalSince(last) < 300 { return }
        last = Date()
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/domains/summary", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            visits = JS.num(o, "visitsToday")
            domains = JS.int(o, "domains") ?? JS.list(o, "domains").count
            status = JS.str(o, "status") ?? "ok"
            available = true
        } catch {
            // 404 (eldre server) eller 403 (ikke admin): pillen vises ikke.
            available = false
        }
    }
}

/// Mørk glass-pille i toppbildet til høyre for «Boliger»: globus, «48 597», «besøk i dag · 5 domener» og statusprikk.
struct Dom24Pill: View {
    @Environment(Store.self) private var store
    @MainActor private var s: Dom24Summary { Dom24Summary.shared }

    var body: some View {
        Group {
            if s.available {
                Button {
                    Haptics.shared.tap()
                    store.paperOpenDomains(from: "boliger")
                } label: {
                    pill
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Åpne Domener")
            }
        }
        .task {
            await s.load(store)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 300_000_000_000)
                if Task.isCancelled { break }
                await s.load(store, force: true)
            }
        }
    }

    private var dot: Color {
        switch s.status {
        case "error": return Color(hex: "#e5533d")
        case "warn": return Color(hex: "#e0b33a")
        default: return Color(hex: "#5fd38a")
        }
    }

    private var pill: some View {
        HStack(spacing: 8) {
            Image(systemName: "globe").font(.dyn51(size: 14, weight: .semibold))
            VStack(alignment: .leading, spacing: 0) {
                Text(s.visits.map { Dom24Summary.format($0) } ?? "–").font(PF.mono(14)).lineLimit(1)
                Text("besøk i dag · \(s.domains) " + (s.domains == 1 ? "domene" : "domener")).font(PF.ui(10.5, .semibold)).opacity(0.85).lineLimit(1)
            }
            Circle().fill(dot).frame(width: 8, height: 8)
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background(Capsule().fill(DS.fixed(.textPrimary, stil: .papir, dark: false).opacity(0.55)))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
        .fixedSize()
    }
}

/* ---------------- Prompt 24: Boliger → Utgifter og Tilgang (som i Boliger.dc.html) ---------------- */

struct Bol24Expenses: View {
    @Environment(\.paper) private var p
    let home: Bol24Home
    let open: (Bol24Entry) -> Void
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    private var queryBinding: Binding<String> {
        Binding<String>(get: { m.query }, set: { v in m.query = v })
    }

    private var hits: [Bol24Entry] {
        let q: String = m.query.trimmingCharacters(in: .whitespaces).lowercased()
        return home.entries.filter { (e: Bol24Entry) -> Bool in
            if m.filter != "Alle" && e.category != m.filter { return false }
            if q.isEmpty { return true }
            let txt: String = (e.description + " " + e.category + " " + e.aiShort + " " + e.paidBy).lowercased()
            return txt.contains(q)
        }
    }

    private var catNames: [String] {
        var out: [String] = ["Alle"]
        for c in home.cats where !out.contains(c.name) { out.append(c.name) }
        for e in home.entries where !out.contains(e.category) { out.append(e.category) }
        return out
    }

    var body: some View {
        let list: [Bol24Entry] = hits
        let sum: Double = list.filter { !$0.pending }.reduce(0) { $0 + $1.amount }
        VStack(spacing: 12) {
            search
            chips
            HStack {
                Text("\(list.count) utgifter").font(PF.ui(13)).foregroundStyle(p.mut)
                Spacer()
                Text(bol24kr(sum)).font(PF.mono(13)).foregroundStyle(p.ink)
            }
            .padding(.horizontal, 4)
            VStack(spacing: 0) {
                if list.isEmpty {
                    Text("Ingen utgifter passer søket.").font(PF.ui(13.5)).foregroundStyle(p.mut)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 16)
                }
                ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Bol24EntryRow(entry: e, full: true) { open(e) }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    private var search: some View {
        // Prompt 27: ✕ til venstre (SearchField27).
        SearchField27(text: queryBinding, placeholder: "Søk i utgifter og kvitteringer", iconSize: 15)
        .padding(.horizontal, 16)
        .frame(height: 46)
        .background(Capsule().fill(p.card))
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(catNames, id: \.self) { n in
                    let on: Bool = m.filter == n
                    Button {
                        Haptics.shared.select()
                        m.filter = n
                    } label: {
                        Text(n).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                            .padding(.horizontal, 14)
                            .frame(height: 34)
                            .background(Capsule().fill(on ? p.ink : p.card))
                            .overlay(Capsule().strokeBorder(on ? p.ink : p.line, lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.horizontal, -16)
    }
}

/* ---------- Tilgang ---------- */

struct Bol24Access: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    @State private var who: String = ""
    @State private var role: String = "editor"
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    private static let roles: [(String, String)] = [("owner", "Eier"), ("editor", "Kan laste opp"), ("viewer", "Kan se")]

    var body: some View {
        VStack(spacing: 14) {
            members
            // Prompt 30: «Del boligen» med rutenett av brukere i Homelab (uten brukernavn) og e-post som reserve (BoligerDeling.swift).
            if home.isOwner { Bol30ShareCard(home: home) }
            toggles
        }
    }

    private var members: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Hvem har tilgang").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                Spacer()
            }
            .padding(.top, 12).padding(.bottom, 4)
            ForEach(Array(home.members.enumerated()), id: \.element.id) { i, u in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                memberRow(u, i)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 4)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func memberRow(_ u: Bol24Member, _ i: Int) -> some View {
        HStack(spacing: 12) {
            Text(String(u.name.prefix(2)).uppercased()).font(PF.ui(13, .heavy)).foregroundStyle(Color.white)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Color(hex: Bol24Pal.colors[(i + 1) % Bol24Pal.colors.count])))
            VStack(alignment: .leading, spacing: 1) {
                Text(u.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Text(u.roleDesc + (u.you ? " · deg" : "")).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { nextRole(u) } label: {
                Text(u.roleName + " ▾").font(PF.ui(12, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(Capsule().fill(p.bg))
                    .overlay(Capsule().strokeBorder(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(!home.isOwner)
            if home.isOwner && !u.you {
                Button {
                    let hid: Int = home.id
                    Task { await m.removeMember(hid, u, store) }
                } label: {
                    Text("−").font(.dyn51(size: 18)).foregroundStyle(p.lab).frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Fjern \(u.name)")
            }
        }
        .padding(.vertical, 12)
    }

    private func nextRole(_ u: Bol24Member) {
        if u.you { store.flash("Du er \(u.roleName.lowercased()) av boligen"); return }
        let order: [String] = ["owner", "editor", "viewer"]
        let i: Int = order.firstIndex(of: u.role) ?? 1
        let next: String = order[(i + 1) % order.count]
        Haptics.shared.select()
        let hid: Int = home.id
        Task { await m.setRole(hid, u.id, next, store) }
    }

    private var invite: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Inviter").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            TextField("Brukernavn eller navn", text: $who)
                .font(PF.ui(15, .medium)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 14).frame(height: 46)
                .background(RoundedRectangle(cornerRadius: 14).fill(p.bg))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, lineWidth: 1))
            HStack(spacing: 6) {
                ForEach(Bol24Access.roles, id: \.0) { r in
                    Bol24Button(title: r.1, fg: role == r.0 ? p.bg : p.ink, bg: role == r.0 ? p.ink : Color.clear, border: role == r.0 ? p.ink : p.line, height: 36, font: 12) { role = r.0 }
                }
            }
            Text(roleHelp).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Bol24Button(title: "Send invitasjon", fg: p.bg, bg: p.ink, border: nil, height: 46, font: 14.5) { send() }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var roleHelp: String {
        switch role {
        case "owner": return "Full tilgang, kan invitere og slette."
        case "viewer": return "Ser oversikt og kvitteringer."
        default: return "Legger til kvitteringer og utgifter."
        }
    }

    private func send() {
        let v: String = who.trimmingCharacters(in: .whitespaces)
        guard !v.isEmpty else { return }
        who = ""
        let hid: Int = home.id
        let r: String = role
        Task { await m.invite(hid, v, role: r, store) }
    }

    private var toggles: some View {
        VStack(spacing: 0) {
            toggle("AI-kategorisering", "Kvitteringer over 90 % sikkerhet godkjennes automatisk", home.autoCat, first: true) {
                let hid: Int = home.id
                let v: Bool = !home.autoCat
                Task { _ = await m.patch(hid, ["autoCat": v], store) }
            }
            toggle("Varsle ved nye utgifter", "Push når noen laster opp en kvittering", home.notify, first: false) {
                let hid: Int = home.id
                let v: Bool = !home.notify
                Task { _ = await m.patch(hid, ["notify": v], store) }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 4)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .disabled(!home.isOwner)
    }

    private func toggle(_ n: String, _ s: String, _ on: Bool, first: Bool, _ act: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            if !first { Rectangle().fill(p.line).frame(height: 1) }
            Button(action: act) {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(n).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                        Text(s).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Bol24Switch(on: on)
                }
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Bryter 44 × 26 i Papir-stil (ikke systemets Toggle).
struct Bol24Switch: View {
    @Environment(\.paper) private var p
    let on: Bool

    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule().fill(on ? p.pos : p.line)
            Circle().fill(Color.white).frame(width: 20, height: 20).padding(3)
        }
        .frame(width: 44, height: 26)
    }
}

// ---------------- Prompt 47: Boliger (mobil) uten «Fra e-post» og uten fanen «Tilgang» ----------------
// Spesifikasjon: prompts/prompt-47-pakke/claude-code-boliger-mobil-uten-epost-tilgang.md. Fasit: design/Boliger.dc.html.
// – Handlingene er tre like fliser: Skann, Last opp, Ny utgift (e-postimport finnes fortsatt på web).
// – Fanene er bare «Oversikt» og «Utgifter · N». Tilgang åpnes fra raden «Delt med N» i «Rediger bolig»
//   (arket lukkes og Tilgang-siden vises med «‹ Oversikt» øverst).
// – Raden «Delt med N» er fjernet fra Oversikt.

/// Raden «Delt med N» i «Rediger bolig» (avatarer + «Tilgang · hvem som kan se og laste opp ›»).
struct Bol47SharedRow: View {
    @Environment(\.paper) private var p
    let home: Bol24Home
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                avatars
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text("Tilgang · hvem som kan se og laste opp").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                .padding(.leading, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(PF.ui(17)).imageScale(.small).foregroundStyle(p.mut).accessibilityHidden(true)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(p.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner Tilgang")
    }

    private var title: String {
        let n: Int = home.members.count
        return "Delt med \(n) " + (n == 1 ? "person" : "personer")
    }

    private var avatars: some View {
        let mem: [Bol24Member] = home.members
        return HStack(spacing: -8) {
            ForEach(Array(mem.prefix(4).enumerated()), id: \.offset) { (i: Int, u: Bol24Member) in
                Text(String(u.name.prefix(2)).uppercased()).font(PF.ui(12, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color(hex: Bol24Pal.colors[(i + 1) % Bol24Pal.colors.count])))
                    .overlay(Circle().strokeBorder(p.card, lineWidth: 2))
            }
        }
    }
}

/// Tilgang-siden med «‹ Oversikt» øverst (ikke lenger en egen fane).
struct Bol47AccessPage: View {
    @Environment(\.paper) private var p
    let home: Bol24Home
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                Haptics.shared.select()
                m.tab = "ov"
            } label: {
                Label("Oversikt", systemImage: "chevron.left").labelStyle(.titleAndIcon).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 16).frame(height: 40)
                    .background(Capsule().fill(p.card))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Bol24Access(home: home)
        }
    }
}

/// Tallformat for Dom24Summary.format. Lages én gang (formatering er trådsikker så lenge formatteren ikke endres),
/// utenfor aktøren så nonisolated-funksjonen kan bruke den.
private let dom24Number: NumberFormatter = {
    let f: NumberFormatter = NumberFormatter()
    f.locale = Locale(identifier: "nb_NO")
    f.numberStyle = .decimal
    f.maximumFractionDigits = 0
    return f
}()
