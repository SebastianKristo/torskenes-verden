import SwiftUI
import UIKit

/* ---------------- Matplan på mobil: egen flate i «matapp»-utseendet ---------------- */

/// Fargene i Matplan, lys (standard) og mørk.
struct MatPalette {
    let dark: Bool
    let bg, text, sub, muted, card, accent, lime, cream, border, black, onBlack, tagBg, tagFg, row: Color
    let tiles: [Color]

    static let light = MatPalette(dark: false, bg: Color(hex: "#F1F2EC"), text: Color(hex: "#1E241C"), sub: Color(hex: "#5B6158"), muted: Color(hex: "#7A8077"),
                                  card: .white, accent: Color(hex: "#F2552C"), lime: Color(hex: "#E4F0A9"), cream: Color(hex: "#FBEACB"), border: Color(hex: "#D9DCD2"),
                                  black: Color(hex: "#1E1F1C"), onBlack: Color(hex: "#F1F2EC"), tagBg: Color(hex: "#F4DDA9"), tagFg: Color(hex: "#8A5A1E"), row: Color(hex: "#F6F7F2"),
                                  tiles: ["#E4F0A9", "#FBEACB", "#DCEBE6", "#F6D9CF", "#E8E2F4"].map { Color(hex: $0) })
    static let night = MatPalette(dark: true, bg: Color(hex: "#141612"), text: Color(hex: "#ECEFE6"), sub: Color(hex: "#AEB4A7"), muted: Color(hex: "#959B8E"),
                                  card: Color(hex: "#1E211B"), accent: Color(hex: "#FF7A55"), lime: Color(hex: "#3B4421"), cream: Color(hex: "#3D3323"), border: Color(hex: "#363A31"),
                                  black: Color(hex: "#ECEFE6"), onBlack: Color(hex: "#141612"), tagBg: Color(hex: "#2C2519"), tagFg: Color(hex: "#F0B470"), row: Color(hex: "#252821"),
                                  tiles: ["#3B4421", "#3D3323", "#24403A", "#4A2E26", "#36304A"].map { Color(hex: $0) })

    /// Appens eget tema: mørkt glass over bakgrunnen, med appens aksentfarge.
    @MainActor static var app: MatPalette {
        MatPalette(dark: true, bg: .clear, text: .white, sub: .white.opacity(0.7), muted: .white.opacity(0.55),
                   card: .white.opacity(0.08), accent: .accentLight, lime: Color.accent.opacity(0.22), cream: .white.opacity(0.10), border: .white.opacity(0.14),
                   black: .white, onBlack: .ink, tagBg: .white.opacity(0.12), tagFg: .accentLight, row: .white.opacity(0.06),
                   tiles: [Color.accent.opacity(0.22), .white.opacity(0.10), Color.positive.opacity(0.18), Color.accent.opacity(0.14), .white.opacity(0.14)])
    }

    /// Matplan følger appens tema (glass på iOS). Det egne lys/mørk-valget er fjernet.
    @MainActor static func current(_ store: Store) -> MatPalette { app }
}

private let shortDay = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"]
private let longDay = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"]
private let monthShort = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]

private func dayNum(_ iso: String) -> Int { Int(iso.suffix(2)) ?? 0 }
private func monthIdx(_ iso: String) -> Int { (Int(iso.dropFirst(5).prefix(2)) ?? 1) - 1 }

/// «Ingrid» → «Ingrids», «Hans» → «Hans'».
private func owner(_ n: String) -> String { n.hasSuffix("s") ? n + "'" : n + "s" }

/// Første bokstav i varen, uten mengde («400 g kyllingfilet» → K).
private func ingInitial(_ s: String) -> String {
    let stripped = s.replacingOccurrences(of: #"^[0-9\s.,½¼¾/]+(g|kg|dl|l|ss|ts|stk|pose|boks|fedd)?\s+"#, with: "", options: [.regularExpression, .caseInsensitive])
    return initial(stripped.isEmpty ? s : stripped)
}

struct MatSurface: View {
    @Environment(Store.self) private var store
    var body: some View {
        let p = MatPalette.current(store)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header(p)
                if let e = store.moduleError { Text(e).font(.footnote).foregroundStyle(p.accent) }
                if let w = store.week, !w.days.isEmpty {
                    content(w, p)
                } else if store.moduleError == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(.horizontal, 18).padding(.top, 6).padding(.bottom, 40)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .tint(p.text)
        .refreshable { try? await store.loadWeek() }
    }

    /* ---------- Topp ---------- */

    private func header(_ p: MatPalette) -> some View {
        let first = store.displayName.split(separator: " ").first.map(String.init) ?? ""
        return HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(first.isEmpty ? "Hei" : "Hei, \(first)").font(.subheadline).foregroundStyle(p.sub)
                Text("Middag denne uka").font(.system(size: 30, weight: .bold)).foregroundStyle(p.text).lineLimit(1).minimumScaleFactor(0.7)
            }
            Spacer()
            Button { store.planWeek() } label: {
                Text("✦").font(.system(size: 18, weight: .bold)).foregroundStyle(p.onBlack).frame(width: 44, height: 44).background(p.black, in: Circle())
            }
            .buttonStyle(GlassPress()).accessibilityLabel("Ny ukeplan")
            if store.topRowTitle == nil { Avatar() }
        }
    }

    /* ---------- Innhold ---------- */

    @ViewBuilder private func content(_ w: Week, _ p: MatPalette) -> some View {
        let todayIso = isoDay(Date())
        let ti = w.days.firstIndex { $0.today == true || $0.date == todayIso } ?? 0
        let sel = min(max(0, store.matDay ?? ti), w.days.count - 1)
        let d = w.days[sel]
        let dish = (w.dishes ?? []).first { $0.id == d.dishId } ?? (w.dishes ?? []).first { $0.name == d.name }
        let ing = (d.ingredients?.isEmpty == false ? d.ingredients : dish?.ing) ?? []
        let steps = dish?.steps ?? []
        let today = w.days[ti]

        Text(weekLabel(w)).font(.caption.weight(.semibold)).tracking(0.8).foregroundStyle(p.muted)
        HStack(spacing: 10) {
            mini("I dag", today.name ?? "Ingen rett", "\(longDay[ti % 7].prefix(3)) \(dayNum(today.date)). \(monthShort[monthIdx(today.date) % 12])", p.lime, p)
            mini("Kokk i dag", today.cook ?? "–", nil, p.cream, p)
            mini("Faste dager", "\(w.days.filter { $0.fixed == true }.count)", nil, p.card, p)
        }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(w.days.enumerated()), id: \.offset) { i, day in
                    let on = i == sel
                    Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { store.matDay = i } } label: {
                        Text("\(shortDay[i % 7]) \(dayNum(day.date))").font(.subheadline.weight(.semibold))
                            .foregroundStyle(on ? p.onBlack : p.text).padding(.horizontal, 16).frame(height: 40)
                            .background(on ? p.black : Color.clear, in: Capsule())
                            .overlay(Capsule().stroke(on ? p.black : p.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
        dayCard(d, sel: sel, isToday: sel == ti, ing: ing.count, steps: steps.count, p)
        section("Ingredienser", ing.count == 1 ? "1 ingrediens" : "\(ing.count) ingredienser", p) {
            if ing.isEmpty { Text("Ingen ingredienser lagt inn for denne retten.").font(.subheadline).foregroundStyle(p.muted) }
            ForEach(Array(ing.enumerated()), id: \.offset) { i, n in
                HStack(spacing: 12) {
                    Text(ingInitial(n)).font(.system(size: 15, weight: .bold)).foregroundStyle(p.text).frame(width: 36, height: 36).background(p.tiles[i % p.tiles.count], in: RoundedRectangle(cornerRadius: 10))
                    Text(n).foregroundStyle(p.text)
                    Spacer()
                }
                .padding(8).background(p.row, in: RoundedRectangle(cornerRadius: 16))
            }
            if !ing.isEmpty {
                let have = Set((w.shopping ?? []).map { $0.text.lowercased() })
                let all = ing.allSatisfy { have.contains($0.lowercased()) }
                pill(all ? "✓ I listen" : "Legg i handlelisten", p) { store.addToShop(ing) }
            }
        }
        if !steps.isEmpty {
            section("Slik gjør du", "\(steps.count) steg", p) {
                ForEach(Array(steps.enumerated()), id: \.offset) { i, t in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(i + 1)").font(.system(size: 14, weight: .bold)).foregroundStyle(p.onBlack).frame(width: 28, height: 28).background(p.black, in: Circle())
                        Text(t).foregroundStyle(p.text).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        let shop = w.shopping ?? []
        section("Handleliste", "\(shop.filter { !$0.done }.count) igjen", p) {
            if shop.isEmpty { Text("Handlelisten er tom.").font(.subheadline).foregroundStyle(p.muted) }
            ForEach(shop) { it in
                Button { store.toggleShop(it.id) } label: {
                    HStack(spacing: 12) {
                        Text(it.done ? "✓" : "").font(.system(size: 13, weight: .bold)).foregroundStyle(p.text).frame(width: 24, height: 24)
                            .background(it.done ? p.lime : Color.clear, in: RoundedRectangle(cornerRadius: 7))
                            .overlay(RoundedRectangle(cornerRadius: 7).stroke(it.done ? Color(hex: p.dark ? "#6A7A35" : "#C9DB7A") : Color(hex: p.dark ? "#4A4F44" : "#C9CDC1"), lineWidth: 1.5))
                        Text(it.text).strikethrough(it.done).foregroundStyle(it.done ? p.muted : p.text)
                        Spacer()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(it.done ? .isSelected : [])
            }
        }
        pill("Se hele uka og alle retter", p) { store.matFull = true }
    }

    private func weekLabel(_ w: Week) -> String {
        guard let s = w.start ?? w.days.first?.date else { return "" }
        let e = w.end ?? w.days.last?.date ?? s
        let n = w.week.map { "UKE \($0) · " } ?? ""
        return n + "\(dayNum(s)).–\(dayNum(e)). \(monthShort[monthIdx(e) % 12].uppercased())"
    }

    private func mini(_ title: String, _ value: String, _ sub: String?, _ bg: Color, _ p: MatPalette) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(p.sub)
            Text(value).font(.system(size: 16, weight: .bold)).foregroundStyle(p.text).lineLimit(2).minimumScaleFactor(0.8)
            if let sub { Text(sub).font(.caption2).foregroundStyle(p.muted).lineLimit(1) }
            Spacer(minLength: 0)
        }
        .padding(14).frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
        .background(bg, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(bg == p.card ? p.border : .clear, lineWidth: 1))
    }

    private func dayCard(_ d: MealDay, sel: Int, isToday: Bool, ing: Int, steps: Int, _ p: MatPalette) -> some View {
        let tag: String? = d.tag == "best" ? d.bestCook.map { "★ \(owner($0)) beste" } : d.tag == "hellofresh" || d.source == "hellofresh" ? "HelloFresh" : nil
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text((longDay[sel % 7] + (isToday ? " · i dag" : "")).uppercased()).font(.caption.weight(.bold)).tracking(0.8).foregroundStyle(p.sub)
                Spacer()
                Button { store.planDay(d.date) } label: {
                    Text("✦").font(.system(size: 16, weight: .bold)).foregroundStyle(p.onBlack).frame(width: 38, height: 38).background(p.black, in: Circle())
                }
                .buttonStyle(GlassPress()).accessibilityLabel("Foreslå en annen rett")
            }
            Text(d.name ?? "Ingen rett ennå").font(.system(size: 28, weight: .bold)).foregroundStyle(d.name == nil ? p.muted : p.text).fixedSize(horizontal: false, vertical: true)
            if let tag {
                Text(tag).font(.footnote.weight(.semibold)).foregroundStyle(p.tagFg).padding(.horizontal, 10).padding(.vertical, 5).background(p.tagBg, in: Capsule())
            }
            Text("\(ing) ingredienser · \(steps) steg · \(d.cook ?? "ingen kokk")").font(.subheadline).foregroundStyle(p.sub)
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.cream, in: RoundedRectangle(cornerRadius: 30))
    }

    private func section<C: View>(_ title: String, _ sub: String, _ p: MatPalette, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.system(size: 20, weight: .bold)).foregroundStyle(p.text)
                Spacer()
                Text(sub).font(.footnote).foregroundStyle(p.muted)
            }
            content()
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 28))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(p.dark ? Color.clear : p.border.opacity(0.6), lineWidth: 1))
    }

    private func pill(_ title: String, _ p: MatPalette, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(title).fontWeight(.semibold).foregroundStyle(p.onBlack).frame(maxWidth: .infinity, minHeight: 50).background(p.black, in: Capsule())
        }
        .buttonStyle(GlassPress())
    }
}
