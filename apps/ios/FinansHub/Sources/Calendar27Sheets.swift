import SwiftUI
import UIKit

/* ---------------- Prompt 27: Kalender v2 – detaljer, ny/rediger og søk ---------------- */
// Fasit: arkene i design/Kalender.dc.html. Detaljer: sted, lærer, kalender, fag, merknad og gjentakelse, VARSEL
// (lokale påminnelser som før), Vis rom på kart, Kopier til Privat, og Rediger/Slett for egne Google-hendelser.
// Ny/rediger: tittel, hele dagen, dato, fra/til (native velgere), sted, kalender (Privat/Familie), gjenta, varsel og merknad.

struct Cal27SheetHead: View {
    @Environment(\.paper) private var p
    let title: String
    let close: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(title).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            Spacer(minLength: 4)
            Cal27CloseButton(close: close)
        }
    }
}

struct Cal27CloseButton: View {
    @Environment(\.paper) private var p
    let close: () -> Void

    var body: some View {
        Button(action: close) {
            Text("✕").font(PF.ui(14)).foregroundStyle(p.ink).frame(width: 40, height: 40)
                .background(p.card, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lukk")
    }
}

/// Valgbrikke (KALENDER, GJENTA, VARSEL).
struct Cal27Choice: View {
    @Environment(\.paper) private var p
    let name: String
    let on: Bool
    var dot: String? = nil
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 7) {
                if let d = dot { Circle().fill(Color(hex: d)).frame(width: 9, height: 9) }
                Text(name).font(PF.ui(13.5, .semibold)).foregroundStyle(on ? p.bg : p.ink)
            }
            .padding(.horizontal, 14).frame(height: 38)
            .background(on ? p.ink : Color.clear, in: Capsule())
            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Detaljer ---------- */

struct Cal27Detail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @MainActor private var base: Cal26Model { Cal26Model.shared }
    let e: CalEvent26

    var body: some View {
        let c: Color = Color(hex: m.hex(e))
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                        Text(e.title).font(PF.serif(26, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                        Text(when).font(PF.ui(14)).foregroundStyle(p.mut)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 18)
                    .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 3).fill(c).frame(width: 6) }
                    Cal27CloseButton { m.sel = nil }
                }
                if !rows.isEmpty { rowsCard }
                Text("VARSEL").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Flow(spacing: 6) {
                    ForEach(Cal27Model.reminders, id: \.0) { r in
                        Cal27Choice(name: r.1, on: base.reminder(e) == r.0) { base.setReminder(e, r.0) }
                    }
                }
                if !src.isEmpty { Text(src).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
                actions
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 22)
        }
        .scrollIndicators(.hidden)
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private var rowsCard: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                HStack(alignment: .top, spacing: 12) {
                    Text(r.0).font(PF.ui(14)).foregroundStyle(p.mut)
                    Spacer(minLength: 8)
                    Text(r.1).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).multilineTextAlignment(.trailing)
                }
                .padding(.vertical, 11)
            }
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder private var actions: some View {
        VStack(spacing: 8) {
            if e.editable {
                HStack(spacing: 8) {
                    bigButton("Rediger", bg: p.ink, fg: p.bg) { editLater() }
                    bigButton(m.delArm ? "Trykk igjen" : "Slett", bg: Color(hex: "#b23a2a"), fg: Color.white) { m.delete(e, store) }
                }
            }
            HStack(spacing: 8) {
                if let u = mapURL {
                    Link(destination: u) {
                        Text(e.mazemap.isEmpty ? "Vis rom på kart ↗" : "Åpne kart ↗").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                }
                if !e.editable || e.group != "privat" {
                    Button { m.copyToPrivate(e, store) } label: {
                        Text("Kopier til Privat").font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(1)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func bigButton(_ t: String, bg: Color, fg: Color, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(14, .bold)).foregroundStyle(fg).frame(maxWidth: .infinity).frame(height: 46)
                .background(bg, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Detaljarket lukkes før skjemaet åpnes (to ark samtidig gir feil i SwiftUI).
    private func editLater() {
        let ev: CalEvent26 = e
        m.sel = nil
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            Cal27Model.shared.edit(ev)
        }
    }

    private var kicker: String {
        let n: String = m.calendar(e.group).name.uppercased()
        if e.type == "prove" { return n + " · PRØVE" }
        if e.type == "innl" { return n + " · INNLEVERING" }
        return n
    }

    private var when: String { Cal26.cap(Cal26.dLong(Cal26.day(e.dayKey))) + " · " + e.timeText }

    private var rows: [(String, String)] {
        var out: [(String, String)] = []
        if !e.room.isEmpty { out.append(("Sted", e.room)) }
        if !e.teacher.isEmpty { out.append(("Lærer", e.teacher)) }
        out.append(("Kalender", m.calendar(e.group).name))
        if e.type != "time" && !e.subject.isEmpty { out.append(("Fag", e.subject)) }
        if !e.note.isEmpty { out.append(("Merknad", e.note)) }
        let r: String = e.recurrence.uppercased()
        if r.contains("DAILY") { out.append(("Gjentas", "Hver dag")) }
        else if r.contains("WEEKLY") { out.append(("Gjentas", "Hver uke")) }
        else if r.contains("MONTHLY") { out.append(("Gjentas", "Hver måned")) }
        return out
    }

    private var src: String {
        if e.editable { return "Lagret i Google Kalender (" + m.calendar(e.group).name + ")." }
        let s: String = m.calendar(e.group).source
        return s.isEmpty ? "" : "Fra " + s + ". Endres i kilden."
    }

    private var mapURL: URL? {
        if !e.mazemap.isEmpty { return URL(string: e.mazemap) }
        if e.room.isEmpty { return nil }
        var hit: Bool = e.room.range(of: "^[A-C]-", options: .regularExpression) != nil
        for w in ["Aula", "Hall", "Gym", "Bibl"] where e.room.contains(w) { hit = true }
        return hit ? URL(string: "https://use.mazemap.com/") : nil
    }
}

/* ---------- Ny / rediger ---------- */

struct Cal27FormSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @State private var f: Cal27Form
    @FocusState private var titleFocus: Bool

    init(start: Cal27Form) {
        _f = State(initialValue: start)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Cal27SheetHead(title: f.eventId == nil ? "Ny hendelse" : "Rediger hendelse") { m.form = nil }
                TextField("", text: $f.title, prompt: Text("Tittel").foregroundColor(p.mut))
                    .font(PF.ui(17, .semibold)).foregroundStyle(p.ink)
                    .focused($titleFocus)
                    .padding(.horizontal, 16).frame(height: 52)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
                timeCard
                TextField("", text: $f.location, prompt: Text("Sted").foregroundColor(p.mut))
                    .font(PF.ui(15, .medium)).foregroundStyle(p.ink)
                    .padding(.horizontal, 16).frame(height: 48)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
                VStack(alignment: .leading, spacing: 12) {
                label("KALENDER")
                Flow(spacing: 6) {
                    ForEach(m.calendars.filter { $0.id == "privat" || $0.id == "familie" }) { c in
                        Cal27Choice(name: c.name, on: f.calendar == c.id, dot: c.color) { f.calendar = c.id }
                    }
                }
                label("GJENTA")
                Flow(spacing: 6) {
                    ForEach(Cal27Model.repeats, id: \.0) { r in
                        Cal27Choice(name: r.1, on: f.repeatRule == r.0) { f.repeatRule = r.0 }
                    }
                }
                label("VARSEL")
                Flow(spacing: 6) {
                    ForEach(Cal27Model.reminders, id: \.0) { r in
                        Cal27Choice(name: r.1, on: f.reminder == r.0) { f.reminder = r.0 }
                    }
                }
                }
                TextField("", text: $f.note, prompt: Text("Merknad").foregroundColor(p.mut), axis: .vertical)
                    .lineLimit(2...5)
                    .font(PF.ui(15)).foregroundStyle(p.ink)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
                VStack(alignment: .leading, spacing: 12) {
                let err: String = m.form?.error ?? ""
                if !err.isEmpty {
                    Text(err).font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#b23a2a")).fixedSize(horizontal: false, vertical: true)
                }
                if m.reconnect {
                    Button {
                        m.form = nil
                        Int26Nav.openKal(from: "kalender", store)
                    } label: {
                        Text("Koble til Google på nytt ›").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                Button { submit() } label: {
                    Text(m.saving ? "Lagrer …" : "Lagre").font(PF.ui(15, .bold)).foregroundStyle(p.bg)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(m.saving)
                }
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 22)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear { if f.eventId == nil { titleFocus = true } }
        .onChange(of: f.start) { old, new in keepDuration(old, new) }
    }

    private var timeCard: some View {
        VStack(spacing: 0) {
            Toggle(isOn: $f.allDay) {
                Text("Hele dagen").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
            }
            .tint(p.ink)
            .frame(minHeight: 50)
            Rectangle().fill(p.line).frame(height: 1)
            DatePicker(selection: $f.date, displayedComponents: [.date]) {
                Text("Dato").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
            }
            .environment(\.locale, Locale(identifier: "nb_NO"))
            .frame(minHeight: 50)
            if !f.allDay {
                Rectangle().fill(p.line).frame(height: 1)
                DatePicker(selection: $f.start, displayedComponents: [.hourAndMinute]) {
                    Text("Fra").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                }
                .environment(\.locale, Locale(identifier: "nb_NO"))
                .frame(minHeight: 50)
                Rectangle().fill(p.line).frame(height: 1)
                DatePicker(selection: $f.end, displayedComponents: [.hourAndMinute]) {
                    Text("Til").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                }
                .environment(\.locale, Locale(identifier: "nb_NO"))
                .frame(minHeight: 50)
            }
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func label(_ t: String) -> some View {
        Text(t).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
    }

    /// Flyttes starttiden, flyttes slutten like mye (som i fasiten).
    private func keepDuration(_ old: Date, _ new: Date) {
        let d: TimeInterval = f.end.timeIntervalSince(old)
        if d > 0 { f.end = new.addingTimeInterval(d) }
    }

    private func submit() {
        var ff: Cal27Form = f
        ff.error = ""
        m.form = ff
        m.save(store)
    }
}

/* ---------- Søk ---------- */

struct Cal27SearchSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    @FocusState private var focus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                SearchField27(text: Binding<String>(get: { m.query }, set: { (v: String) in m.query = v; m.search(store) }),
                              placeholder: "Søk i tittel, sted og lærer", focus: $focus, onClear: { m.clearSearch() })
                    .padding(.horizontal, 14).frame(height: 48)
                    .background(p.card, in: Capsule())
                Cal27CloseButton { m.searchOpen = false }
            }
            let q: String = m.query.trimmingCharacters(in: .whitespaces)
            if q.count >= 2 {
                Text(m.searching ? "Søker …" : "\(m.results.count) treff").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
            }
            ScrollView {
                VStack(spacing: 0) {
                    if q.count >= 2 && !m.searching && m.results.isEmpty {
                        Text("Ingen hendelser passer «\(q)».").font(PF.ui(14)).foregroundStyle(p.mut)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
                    }
                    ForEach(Array(m.results.enumerated()), id: \.element.id) { i, e in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        row(e)
                    }
                }
                .padding(.horizontal, m.results.isEmpty ? 0 : 14)
                .background(m.results.isEmpty ? Color.clear : p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .padding(.horizontal, 16).padding(.top, 18)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear { focus = true }
    }

    private func row(_ e: CalEvent26) -> some View {
        Button { m.pickResult(e) } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2).fill(Color(hex: m.hex(e))).frame(width: 4, height: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(Cal26.cap(Cal26.dLong(Cal26.day(e.dayKey))) + " · " + e.timeText + (e.room.isEmpty ? "" : " · " + e.room))
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
