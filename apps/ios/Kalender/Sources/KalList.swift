import SwiftUI

/* ---------------- Prompt 33: Kalender – Liste (agenda, neste 6 uker) og Søk ---------------- */
// Øverst «Glimt · dagen din». Dagshode som blir stående (I dag / I morgen / ukedag + dato + vær), ukeskille «UKE 43».
// Rader med tid, fargestripe, tittel, sted · kalender og merker FRIST / BURSDAG / FORTS.
// Søk: fullskjerm med felt og Avbryt, kalenderfiltre som chips, treff gruppert per dag (kommende først, så tidligere).

struct KalAgendaDay: Identifiable {
    let key: String
    let index: Int
    let weekLabel: String?
    var id: String { key }
}

struct KalListView: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    private var days: [KalAgendaDay] {
        var out: [KalAgendaDay] = []
        var lastWeek: Int = -1
        let tk: String = KalD.todayKey()
        for i in 0..<42 {
            let k: String = KalD.addKey(tk, i)
            if s.on(k).isEmpty && i > 0 { continue }
            let w: Int = KalD.isoWeek(KalD.date(k))
            let label: String? = (w != lastWeek && i > 0) ? "UKE " + String(w) : nil
            out.append(KalAgendaDay(key: k, index: i, weekLabel: label))
            lastWeek = w
        }
        return out
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                KalDayCard()
                    .padding(.top, 2)
                    .padding(.bottom, 6)
                ForEach(days) { (d: KalAgendaDay) in
                    Section {
                        KalAgendaRows(key: d.key)
                    } header: {
                        KalAgendaHeader(day: d)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 12)
        }
        .scrollIndicators(.hidden)
    }
}

/// «Glimt · dagen din».
struct KalDayCard: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            s.glimtOpen = true
        }) {
            HStack(alignment: .top, spacing: 10) {
                KalSpark(size: 26)
                VStack(alignment: .leading, spacing: 3) {
                    Text("GLIMT · DAGEN DIN").font(KalFont.mono(10)).tracking(1.4).foregroundStyle(t.acc)
                    Text(s.daySummary).font(KalFont.ui(13.5)).foregroundStyle(t.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                    Text("Spør Glimt ›").font(KalFont.ui(12, .bold)).foregroundStyle(t.acc)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(t.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Glimt, dagen din. " + s.daySummary)
    }
}

struct KalAgendaHeader: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let day: KalAgendaDay

    var body: some View {
        let d: Date = KalD.date(day.key)
        let title: String = day.index == 0 ? "I dag" : (day.index == 1 ? "I morgen" : KalD.cap(KalD.weekdays[KalD.wd(d)]))
        let sub: String = String(KalD.dayOfMonth(d)) + ". " + KalD.months[KalD.month(d) - 1]
        let wx: KalWxDay? = s.weather(day.key)
        VStack(alignment: .leading, spacing: 0) {
            if let w = day.weekLabel {
                Text(w).font(KalFont.mono(10)).tracking(1.4).foregroundStyle(t.mut2)
                    .padding(.top, 14).padding(.bottom, 2).padding(.horizontal, 2)
            }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(title).font(KalFont.serif(20)).foregroundStyle(day.index == 0 ? t.red : t.ink)
                Text(sub).font(KalFont.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                Spacer(minLength: 4)
                if let wx {
                    HStack(spacing: 4) {
                        Image(systemName: KalWx.symbol(wx.kind)).font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(KalWx.color(wx.kind, mut: t.mut))
                        Text(String(wx.hi) + "° / " + String(wx.lo) + "°").font(KalFont.mono(11)).foregroundStyle(t.mut)
                    }
                }
            }
            .padding(.top, 10).padding(.bottom, 6).padding(.horizontal, 2)
            .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
        }
        .background(t.bg)
    }
}

struct KalAgendaRows: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let key: String

    var body: some View {
        let list: [KalEvent] = s.on(key)
        VStack(spacing: 0) {
            if list.isEmpty {
                Text("Ingenting planlagt").font(KalFont.ui(13)).foregroundStyle(t.mut2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 10).padding(.horizontal, 2)
            }
            ForEach(list, id: \.self) { (e: KalEvent) in
                KalEventRow(e: e, twoLineTime: true)
            }
        }
    }
}

/// Rad i Liste og Søk.
struct KalEventRow: View {
    @Environment(\.kal) private var t
    let e: KalEvent
    var twoLineTime: Bool = true

    var body: some View {
        let s: KalStore = KalStore.shared
        let c: KalCal? = s.cal(e.cal)
        let sub: String = [e.loc, c?.name ?? ""].filter { (x: String) -> Bool in !x.isEmpty }.joined(separator: " · ")
        let tag: String = e.kind == "frist" ? "FRIST" : (e.kind == "bursdag" ? "BURSDAG" : (e.cont ? "FORTS." : ""))
        Button(action: { s.openDetail(e) }) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.allDay ? "Hele" : KalD.hm(e.startMin)).font(KalFont.mono(11.5)).foregroundStyle(t.ink)
                    if twoLineTime {
                        Text(e.allDay ? "dagen" : KalD.hm(e.endMin)).font(KalFont.mono(11.5)).foregroundStyle(t.mut2)
                    }
                }
                .frame(width: 46, alignment: .leading)
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(e.title).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                        if !tag.isEmpty {
                            Text(tag).font(KalFont.mono(9.5)).tracking(0.6)
                                .foregroundStyle(t.calText(c))
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .background(Capsule().fill(t.calTint(c, 0.13)))
                        }
                    }
                    Text(sub).font(KalFont.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 9).padding(.horizontal, 2)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(e.title + ", " + (e.allDay ? "hele dagen" : KalD.hm(e.startMin)))
    }
}

/* ---------- Søk ---------- */

struct KalSearchGroup: Identifiable {
    let key: String
    let title: String
    let today: Bool
    var events: [KalEvent]
    var id: String { key }
}

struct KalSearchView: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @FocusState private var focus: Bool

    private var groups: [KalSearchGroup] {
        let q: String = s.query.lowercased().trimmingCharacters(in: .whitespaces)
        let sf: String? = s.searchCal
        if q.isEmpty && sf == nil { return [] }
        let tk: String = KalD.todayKey()
        var list: [KalEvent] = s.all.filter { (e: KalEvent) -> Bool in
            if let sf, e.cal != sf { return false }
            if q.isEmpty { return true }
            let name: String = s.cal(e.cal)?.name ?? ""
            return (e.title + " " + e.loc + " " + name).lowercased().contains(q)
        }
        list.sort { (a: KalEvent, b: KalEvent) -> Bool in a.day != b.day ? a.day < b.day : (a.s ?? -1) < (b.s ?? -1) }
        let future: [KalEvent] = list.filter { (e: KalEvent) -> Bool in e.day >= tk }
        let past: [KalEvent] = list.filter { (e: KalEvent) -> Bool in e.day < tk }.reversed()
        let ordered: [KalEvent] = Array((future + past).prefix(60))
        var out: [KalSearchGroup] = []
        let yearNow: Int = KalD.year(Date())
        for e in ordered {
            if let last = out.last, last.key == e.day {
                out[out.count - 1].events.append(e)
                continue
            }
            let d: Date = KalD.date(e.day)
            var label: String = KalD.cap(KalD.fd(d))
            if KalD.year(d) != yearNow { label += " " + String(KalD.year(d)) }
            let prefix: String = e.day == tk ? "I DAG · " : (e.day < tk ? "TIDLIGERE · " : "")
            out.append(KalSearchGroup(key: e.day, title: (prefix + label).uppercased(), today: e.day == tk, events: [e]))
        }
        return out
    }

    var body: some View {
        let g: [KalSearchGroup] = groups
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(t.mut)
                    TextField("Søk i hendelser", text: Binding(get: { s.query }, set: { (v: String) in s.query = v }))
                        .font(KalFont.ui(16, .medium)).foregroundStyle(t.ink)
                        .focused($focus)
                        .submitLabel(.search)
                }
                .padding(.horizontal, 14)
                .frame(height: 44)
                .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(t.line, lineWidth: 1))
                KalPill(title: "Avbryt", height: 40) {
                    withAnimation(.easeOut(duration: 0.2)) { s.searchOpen = false }
                }
            }
            .padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 10)
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach(s.cals) { (c: KalCal) in
                        KalChip(title: c.name, on: s.searchCal == c.id, dot: t.calColor(c)) {
                            s.searchCal = s.searchCal == c.id ? nil : c.id
                        }
                    }
                }
                .padding(.horizontal, 14)
            }
            .scrollIndicators(.hidden)
            .padding(.bottom, 10)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(g) { (grp: KalSearchGroup) in
                        Text(grp.title).font(KalFont.mono(10.5)).tracking(1.2).foregroundStyle(grp.today ? t.red : t.mut)
                            .padding(.top, 12).padding(.bottom, 4).padding(.horizontal, 2)
                        ForEach(grp.events, id: \.self) { (e: KalEvent) in
                            KalEventRow(e: e, twoLineTime: false)
                        }
                    }
                    if g.isEmpty && (!s.query.isEmpty || s.searchCal != nil) {
                        Text("Ingen treff. Prøv et navn, et sted eller en kalender.").font(KalFont.ui(14)).foregroundStyle(t.mut)
                            .padding(.vertical, 24).padding(.horizontal, 2)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(t.bg)
        .onAppear {
            Task {
                try? await Task.sleep(nanoseconds: 60_000_000)
                focus = true
            }
        }
    }
}
