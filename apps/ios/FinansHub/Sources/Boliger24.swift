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
