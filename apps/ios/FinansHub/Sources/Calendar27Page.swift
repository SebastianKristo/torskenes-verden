import SwiftUI
import UIKit

/* ---------------- Prompt 27: Kalender v2 – fullskjermsiden ---------------- */
// Fasit: design/Kalender.dc.html (variant «mobile»). Fullskjerm uten toppbilde og uten appens fanelinje:
// topp med ‹, måned + år (trykk = minikalender og kalenderfilter), søk og I dag (ikon med dato), NESTE/NÅ-stripe,
// Dag/3 dager/Uke (00–24), Måned (6 uker) eller Liste (45 dager), og egen fanelinje nederst med rund + til høyre.
// Sveip til venstre/høyre bytter periode. Widget-forhåndsvisningene fra prompt 26 er fjernet fra siden.

struct Cal27Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }

    var body: some View {
        TimelineView(.everyMinute) { ctx in
            Cal27Body(now: ctx.date)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task(id: store.account?.id ?? "") { await m.boot(store) }
        .sheet(item: Binding<CalEvent26?>(get: { m.sel }, set: { m.sel = $0 })) { e in
            Cal27Detail(e: e)
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .presentationBackground(p.bg)
        }
        .sheet(item: Binding<Cal27Form?>(get: { m.form }, set: { m.form = $0 })) { f in
            Cal27FormSheet(start: f)
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationBackground(p.bg)
        }
        .sheet(isPresented: Binding<Bool>(get: { m.searchOpen }, set: { m.searchOpen = $0 })) {
            Cal27SearchSheet()
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationBackground(p.bg)
        }
    }
}

struct Cal27Body: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    var body: some View {
        VStack(spacing: 0) {
            Cal27TopBar(now: now)
            if m.mini { Cal27Mini(now: now).transition(.opacity) }
            Cal27NextStrip(now: now)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .simultaneousGesture(DragGesture(minimumDistance: 30).onEnded { v in swipe(v) })
        }
        .overlay(alignment: .bottom) { Cal27BottomBar() }
        .overlay(alignment: .top) {
            if !m.toast.isEmpty {
                Text(m.toast).font(PF.ui(13, .semibold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(p.ink, in: Capsule())
                    .padding(.top, 58)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.18), value: m.mini)
        .animation(.easeOut(duration: 0.18), value: m.toast)
    }

    @ViewBuilder private var content: some View {
        if m.view == "maaned" {
            Cal27Month(now: now)
        } else if m.view == "liste" {
            Cal27List(now: now)
        } else {
            Cal27Grid(now: now)
        }
    }

    private func swipe(_ v: DragGesture.Value) {
        let dx: CGFloat = v.translation.width
        let dy: CGFloat = v.translation.height
        guard abs(dx) > 70, abs(dy) < 45 else { return }
        m.shift(dx < 0 ? 1 : -1)
    }
}

/* ---------- Toppen ---------- */

struct Cal27TopBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    var body: some View {
        let t: (String, String) = m.title
        HStack(spacing: 4) {
            Button { Nav27.back(store) } label: {
                Text("‹").font(PF.ui(28)).foregroundStyle(p.ink).frame(width: 40, height: 44)
            }
            .buttonStyle(.plain)
            .padding(.leading, -6)
            .accessibilityLabel("Tilbake")
            Button {
                m.miniOff = 0
                m.mini.toggle()
                Haptics.shared.select()
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(t.0).font(PF.serif(28, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.7)
                    Text(t.1).font(PF.ui(15)).foregroundStyle(p.mut)
                    Text(m.mini ? "▲" : "▼").font(PF.ui(11)).foregroundStyle(p.mut)
                }
                .padding(.horizontal, 6).frame(height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Velg dag og kalendere")
            Spacer(minLength: 4)
            Button { m.openSearch() } label: {
                Image(systemName: "magnifyingglass").font(.system(size: 19, weight: .semibold)).foregroundStyle(p.ink)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Søk i kalenderen")
            Button { m.goToday() } label: {
                ZStack {
                    Image(systemName: "calendar").font(.system(size: 22, weight: .regular)).foregroundStyle(p.ink)
                    Text("\(Cal26.cal.component(.day, from: now))").font(PF.ui(9.5, .heavy)).foregroundStyle(p.ink).offset(y: 3)
                }
                .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("I dag")
        }
        .padding(.leading, 12).padding(.trailing, 10).padding(.vertical, 6)
    }
}

/// Minikalender og kalenderfilter (trykk på måned + år).
struct Cal27Mini: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    var body: some View {
        let comps: DateComponents = Cal26.cal.dateComponents([.year, .month], from: m.curD)
        let first: Date = Cal26.cal.date(from: comps) ?? m.curD
        let base: Date = Cal26.cal.date(byAdding: .month, value: m.miniOff, to: first) ?? first
        let mb: Date = Cal26.day(Cal26.key(base))
        let st: Date = Cal26.add(mb, -((Cal26.jsDay(mb) + 6) % 7))
        let month: Int = Cal26.cal.component(.month, from: mb) - 1
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text(Cal26.cap(Cal26.monthsLong[month]) + " \(Cal26.cal.component(.year, from: mb))").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    .padding(.leading, 4)
                Spacer()
                arrow("‹", "Forrige måned") { m.miniOff -= 1 }
                arrow("›", "Neste måned") { m.miniOff += 1 }
            }
            HStack(spacing: 2) {
                ForEach(Cal26.weekShort, id: \.self) { h in
                    Text(String(h.prefix(1))).font(PF.mono(9.5)).foregroundStyle(p.mut).frame(maxWidth: .infinity).padding(.vertical, 2)
                }
            }
            VStack(spacing: 2) {
                ForEach(0..<6, id: \.self) { r in
                    HStack(spacing: 2) {
                        ForEach(0..<7, id: \.self) { c in
                            Cal27MiniCell(d: Cal26.add(st, r * 7 + c), month: month, now: now)
                        }
                    }
                }
            }
            Rectangle().fill(p.line).frame(height: 1).padding(.top, 2)
            Flow(spacing: 6) {
                ForEach(m.calendars) { c in Cal27CalChip(cal: c) }
            }
        }
        .padding(12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 12).padding(.bottom, 8)
    }

    private func arrow(_ t: String, _ label: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(17)).foregroundStyle(p.ink).frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct Cal27MiniCell: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let d: Date
    let month: Int
    let now: Date

    var body: some View {
        let k: String = Cal26.key(d)
        let isT: Bool = k == Cal26.key(now)
        let inM: Bool = Cal26.cal.component(.month, from: d) - 1 == month
        let inSel: Bool = selected(k)
        let others: [CalEvent26] = m.on(k).filter { $0.type != "time" }
        let dot: Color = others.first.map { (e: CalEvent26) -> Color in isT ? Color.white : Color(hex: m.hex(e)) } ?? Color.clear
        Button { m.pickMini(k) } label: {
            VStack(spacing: 1) {
                Text("\(Cal26.cal.component(.day, from: d))").font(PF.ui(12.5, .semibold)).foregroundStyle(isT ? Color.white : p.ink)
                Circle().fill(dot).frame(width: 4, height: 4)
            }
            .frame(maxWidth: .infinity).frame(height: 34)
            .background(isT ? p.lab : (inSel ? p.ink.opacity(0.1) : Color.clear), in: Capsule())
            .opacity(inM ? 1 : 0.35)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func selected(_ k: String) -> Bool {
        if !m.isGrid { return k == Cal26.key(m.curD) }
        let s: Date = m.gridStart
        for i in 0..<m.days where Cal26.key(Cal26.add(s, i)) == k { return true }
        return false
    }
}

/// Av/på for én kalender.
struct Cal27CalChip: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let cal: Cal27Calendar

    var body: some View {
        let off: Bool = m.isHidden(cal.id)
        Button { m.toggleCal(cal.id) } label: {
            HStack(spacing: 6) {
                Circle().fill(off ? Color.clear : Color(hex: cal.color)).frame(width: 9, height: 9)
                    .overlay(Circle().stroke(Color(hex: cal.color), lineWidth: 1.5))
                Text(cal.name).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
            }
            .padding(.horizontal, 10).frame(height: 32)
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            .opacity(off ? 0.45 : 1)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(cal.name + (off ? ", skjult" : ", vises"))
    }
}

/// NESTE / NÅ: neste hendelse med klokkeslett (time først) med «om 58 min» eller «25 min igjen».
struct Cal27NextStrip: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    var body: some View {
        let n: Cal27Model.Next = m.next(now)
        Button { if let e = n.event { m.open(e) } } label: {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(Color(hex: n.hex)).frame(width: 4, height: 32)
                if !n.kicker.isEmpty {
                    Text(n.kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(Color(hex: "#ff9c8c"))
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(n.title).font(PF.ui(14.5, .bold)).foregroundStyle(p.bg).lineLimit(1)
                    Text(n.sub).font(PF.ui(12)).foregroundStyle(p.bg.opacity(0.75)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !n.when.isEmpty {
                    Text(n.when).font(PF.serif(18, medium: true)).foregroundStyle(p.bg).lineLimit(1).fixedSize()
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 6)
            .frame(minHeight: 46)
            .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12).padding(.bottom, 8)
    }
}

/* ---------- Fanelinjen nederst ---------- */

struct Cal27BottomBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 2) {
                ForEach(Cal27Model.views, id: \.0) { v in tab(v.0, v.1, v.2) }
            }
            .padding(.horizontal, 6)
            .frame(height: 62)
            .background(p.ink, in: Capsule())
            .shadow(color: .black.opacity(0.35), radius: 15, y: 10)
            Button { m.newEvent() } label: {
                Image(systemName: "plus").font(.system(size: 22, weight: .bold)).foregroundStyle(Color.white)
                    .frame(width: 62, height: 62)
                    .background(p.lab, in: Circle())
                    .shadow(color: .black.opacity(0.35), radius: 15, y: 10)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ny hendelse")
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }

    private func tab(_ id: String, _ name: String, _ icon: String) -> some View {
        let on: Bool = m.view == id
        return Button { m.setView(id, store) } label: {
            VStack(spacing: 2) {
                Image(systemName: icon).font(.system(size: 16, weight: .semibold))
                Text(name).font(PF.ui(10.5, .bold)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(on ? p.ink : p.bg.opacity(0.72))
            .frame(maxWidth: .infinity).frame(height: 50)
            .background(on ? p.bg : Color.clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
