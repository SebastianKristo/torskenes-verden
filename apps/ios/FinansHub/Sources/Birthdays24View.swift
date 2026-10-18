import SwiftUI
import UIKit

/* ---------------- Prompt 24: Bursdager-siden (Mer → Bursdager) ---------------- */
// Fasit: design/Bursdager.dc.html, variant «mobile» med tittelen i toppbildet (hideTitle).
// Rekkefølge: Neste bursdag (rødt kort), søk og «+ Legg til», skjema, liste per måned, Kalendere (Google og HA).

struct BirthdaysPage24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: BirthdayModel24 { BirthdayModel24.shared }
    @State private var q: String = ""
    @State private var adding: Bool = false
    @State private var editId: String? = nil
    @State private var form: BirthdayForm24 = BirthdayForm24()
    @State private var sel: String? = nil
    @State private var delArm: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let h = m.items.first { BirthdayHero24(items: m.items, first: h) { sel = h.id } }
            searchRow
            if adding {
                BirthdayFormCard24(form: $form, editing: editId != nil, close: { closeForm() }, save: { saveForm() })
                    .transition(.opacity)
            }
            if let e = m.error { BdNote24(text: e, color: p.lab) }
            if m.offline { BdNote24(text: "Bursdager finnes ikke på serveren ennå. De lagres bare på denne telefonen til homelab er oppdatert.", color: p.mut) }
            if filtered.isEmpty && m.loaded {
                Text(q.isEmpty ? "Ingen bursdager ennå. Trykk «+ Legg til»." : "Ingen treff.").font(PF.ui(14)).foregroundStyle(p.mut)
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            if !m.loaded && m.items.isEmpty {
                HStack(spacing: 8) { ProgressView(); Text("Henter bursdager …").font(PF.ui(13)).foregroundStyle(p.mut) }.padding(.horizontal, 4)
            }
            ForEach(groups, id: \.title) { g in group(g) }
            BirthdayCalendars24()
        }
        .padding(.top, 2)
        .animation(.easeOut(duration: 0.2), value: adding)
        .animation(.easeOut(duration: 0.2), value: sel)
        .task {
            await m.load(store)
            await m.loadGoogleCalendars(store)
            await m.loadHaCalendars(store)
        }
    }

    private var filtered: [Birthday24] {
        let t: String = q.trimmingCharacters(in: .whitespaces).lowercased()
        if t.isEmpty { return m.items }
        return m.items.filter { $0.name.lowercased().contains(t) }
    }

    private struct Group24 {
        let title: String
        let items: [Birthday24]
    }

    /// «NESTE 30 DAGER», deretter én gruppe per måned i rullerende rekkefølge (med år når det er neste år).
    private var groups: [Group24] {
        var out: [Group24] = []
        let list: [Birthday24] = filtered
        let soon: [Birthday24] = list.filter { $0.daysLeft <= 30 }
        if !soon.isEmpty { out.append(Group24(title: "NESTE 30 DAGER", items: soon)) }
        let thisYear: Int = Calendar.current.component(.year, from: Date())
        var titles: [String] = []
        var byTitle: [String: [Birthday24]] = [:]
        for b in list where b.daysLeft > 30 {
            let y: Int = Calendar.current.component(.year, from: b.next)
            let mo: Int = Swift.max(1, Swift.min(12, b.month))
            var t: String = BirthdayShared24.monthsLong[mo - 1].uppercased()
            if y != thisYear { t += " \(y)" }
            if byTitle[t] == nil { titles.append(t); byTitle[t] = [] }
            byTitle[t]?.append(b)
        }
        for t in titles { out.append(Group24(title: t, items: byTitle[t] ?? [])) }
        return out
    }

    private var searchRow: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
                TextField("Søk etter navn", text: $q).font(PF.ui(15, .medium)).foregroundStyle(p.ink)
                    .autocorrectionDisabled().submitLabel(.search)
            }
            .padding(.horizontal, 14).frame(height: 46)
            .background(p.card, in: Capsule())
            Button {
                Haptics.shared.tap()
                if adding { closeForm() } else { openNew() }
            } label: {
                Text(adding ? "Lukk" : "+ Legg til").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 18).frame(height: 46).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private func group(_ g: Group24) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(g.title).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Spacer()
                Text("\(g.items.count)").font(PF.mono(10.5)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 4).padding(.top, 4)
            VStack(spacing: 0) {
                ForEach(Array(g.items.enumerated()), id: \.element.id) { i, b in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    BirthdayRow24(b: b, open: sel == b.id, armed: delArm == b.id,
                                  tap: { toggle(b) }, edit: { openEdit(b) }, del: { deleteTap(b) })
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 2)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func toggle(_ b: Birthday24) {
        Haptics.shared.select()
        sel = sel == b.id ? nil : b.id
        delArm = nil
    }

    private func openNew() {
        editId = nil
        var f = BirthdayForm24()
        f.saveTo = m.gConnected ? "google" : (!m.haEntity.isEmpty ? "ha" : "local")
        form = f
        adding = true
    }

    private func openEdit(_ b: Birthday24) {
        Haptics.shared.tap()
        editId = b.id
        var f = BirthdayForm24()
        f.name = b.name
        f.day = b.day
        f.month = b.month
        f.year = b.year.map { String($0) } ?? ""
        f.relation = b.relation
        f.reminder = b.reminderDays ?? -1
        f.saveTo = b.source
        form = f
        adding = true
    }

    private func closeForm() {
        adding = false
        editId = nil
    }

    private func saveForm() {
        let f: BirthdayForm24 = form
        let id: String? = editId
        Task {
            if await m.save(f, editId: id, store) {
                closeForm()
                q = ""
            }
        }
    }

    /// Slett krever to trykk («Trykk igjen for å slette»), og armeringen går ut etter 2,5 s.
    private func deleteTap(_ b: Birthday24) {
        if delArm != b.id {
            Haptics.shared.tick()
            delArm = b.id
            let id: String = b.id
            Task {
                try? await Task.sleep(for: .milliseconds(2500))
                if delArm == id { delArm = nil }
            }
            return
        }
        delArm = nil
        sel = nil
        Task { await m.delete(b, store) }
    }
}

/* ---------- Neste bursdag ---------- */

/// Det røde kortet: «NESTE BURSDAG» (eller «BURSDAG I DAG»), navn, «Fyller 41 · lørdag 2. november», dager igjen og «Deretter: …».
struct BirthdayHero24: View {
    let items: [Birthday24]
    let first: Birthday24
    let tap: () -> Void

    var body: some View {
        let same: [Birthday24] = items.filter { $0.daysLeft == first.daysLeft }
        let after: [Birthday24] = Array(items.filter { $0.daysLeft > first.daysLeft }.prefix(2))
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(first.daysLeft == 0 ? "BURSDAG I DAG" : "NESTE BURSDAG").font(PF.mono(10.5)).tracking(1.2).opacity(0.9)
                    Spacer()
                    if same.count == 1 { Text(first.sourceLabel).font(PF.mono(10)).tracking(0.6).opacity(0.8) }
                }
                HStack(alignment: .bottom, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(same.map(\.name).joined(separator: " og ")).font(PF.serif(34, medium: true)).lineLimit(2).minimumScaleFactor(0.6)
                        Text(sub(same)).font(PF.ui(14)).opacity(0.92).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 4)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(first.daysLeft == 0 ? "I dag" : "\(first.daysLeft)").font(PF.serif(48)).lineLimit(1).fixedSize()
                        if first.daysLeft > 0 {
                            Text(first.daysLeft == 1 ? "dag igjen" : "dager igjen").font(PF.ui(12.5)).opacity(0.88)
                        }
                    }
                }
                if !after.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Rectangle().fill(Color.white.opacity(0.28)).frame(height: 1)
                        Text("Deretter: " + after.map { "\($0.name) \($0.shortDate)" }.joined(separator: " · "))
                            .font(PF.ui(13)).opacity(0.92).lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
            }
            .foregroundStyle(.white)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(hex: "#b23a2a"), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: .black.opacity(0.4), radius: 10, y: 10)
        }
        .buttonStyle(.plain)
    }

    private func sub(_ same: [Birthday24]) -> String {
        let d: String = first.longDate
        if same.count == 1, let a = first.age { return "Fyller \(a) · \(d)" }
        return d
    }
}

/* ---------- Rad i lista ---------- */

struct BirthdayRow24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let b: Birthday24
    let open: Bool
    let armed: Bool
    let tap: () -> Void
    let edit: () -> Void
    let del: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: tap) {
                HStack(spacing: 12) {
                    BirthdayAvatar24(b: b, size: 42)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(b.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink).lineLimit(1)
                        Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(b.whenText).font(PF.serif(17, medium: true)).foregroundStyle(b.daysLeft <= 7 ? p.lab : p.ink).lineLimit(1).fixedSize()
                        Text(b.sourceLabel).font(PF.mono(9.5)).tracking(0.6).foregroundStyle(p.mut).lineLimit(1).fixedSize()
                    }
                }
                .frame(minHeight: 60)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open { details }
        }
    }

    /// «2. nov · fyller 41 · Familie»
    private var sub: String {
        var parts: [String] = [b.shortDate]
        if let a = b.age { parts.append("fyller \(a)") }
        parts.append(b.relationName)
        return parts.joined(separator: " · ")
    }

    private var detailText: String {
        var s: String = b.longDate.prefix(1).uppercased() + String(b.longDate.dropFirst())
        if let y = b.year { s += " · født \(y)" }
        s += b.daysLeft == 0 ? " · har bursdag i dag" : " · om \(b.daysLeft) dager"
        return s
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(detailText).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text("Påminnelse").font(PF.ui(12.5)).foregroundStyle(p.mut)
            BdChipRow24(options: BdOptions24.reminders, selected: String(b.reminderDays ?? -1), height: 30) { v in
                let n: Int = Int(v) ?? -1
                BirthdayModel24.shared.setReminder(b, n < 0 ? nil : n, store)
            }
            HStack(spacing: 8) {
                if b.source == "google" {
                    BdLineButton24(title: "Åpne i Google Kalender", color: p.ink) { store.openURL(URL(string: "https://calendar.google.com/")) }
                }
                BdLineButton24(title: "Rediger", color: p.ink, act: edit)
                BdLineButton24(title: armed ? "Trykk igjen for å slette" : "Slett", color: p.lab, act: del)
            }
        }
        .padding(.leading, 54).padding(.bottom, 14)
        .transition(.opacity)
    }
}

/// Familie-profilbildet hvis det finnes, ellers initialer på relasjonsfargen.
struct BirthdayAvatar24: View {
    @Environment(Store.self) private var store
    let b: Birthday24
    let size: CGFloat
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            Circle().fill(b.color)
            if let img {
                Image(uiImage: img).resizable().scaledToFill().clipShape(Circle())
            } else {
                Text(b.initials).font(PF.ui(size * 0.34, .heavy)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .task(id: b.avatarUrl) {
            guard !b.avatarUrl.isEmpty, !b.avatarUrl.hasPrefix("http") else { return }
            let path: String = b.avatarUrl.hasPrefix("/") ? b.avatarUrl : "/" + b.avatarUrl
            img = await store.image(path)
        }
    }
}

/* ---------- Skjema ---------- */

enum BdOptions24 {
    static let relations: [(String, String)] = [("familie", "Familie"), ("venn", "Venn"), ("jobb", "Jobb"), ("annet", "Annet")]
    static let reminders: [(String, String)] = [("0", "Samme dag"), ("1", "1 dag før"), ("7", "1 uke før"), ("-1", "Ingen")]
}

struct BirthdayFormCard24: View {
    @Environment(\.paper) private var p
    @Binding var form: BirthdayForm24
    let editing: Bool
    let close: () -> Void
    let save: () -> Void
    @MainActor private var m: BirthdayModel24 { BirthdayModel24.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(editing ? "Rediger bursdag" : "Ny bursdag").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            TextField("Navn", text: $form.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.words)
                .padding(.horizontal, 14).frame(height: 44)
                .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
            HStack(spacing: 8) {
                dayMenu.frame(width: 76)
                monthMenu.frame(maxWidth: .infinity)
                TextField("År", text: $form.year).font(PF.mono(15)).foregroundStyle(p.ink)
                    .keyboardType(.numberPad)
                    .onChange(of: form.year) { _, v in
                        let digits: String = String(v.filter { $0.isNumber }.prefix(4))
                        if digits != v { form.year = digits }
                    }
                    .padding(.horizontal, 12).frame(width: 92, height: 44)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
            }
            label("Hvem")
            BdChipRow24(options: BdOptions24.relations, selected: form.relation, height: 32) { form.relation = $0 }
            label("Påminnelse")
            BdChipRow24(options: BdOptions24.reminders, selected: String(form.reminder), height: 32) { form.reminder = Int($0) ?? 1 }
            if !editing {
                label("Lagre i")
                BdChipRow24(options: destinations, selected: form.saveTo, height: 32) { form.saveTo = $0 }
            }
            Text(note).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button(action: close) {
                    Text("Avbryt").font(PF.ui(14, .bold)).foregroundStyle(p.ink).frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Button(action: save) {
                    Text(m.busy == "save" ? "Lagrer …" : "Lagre").font(PF.ui(14, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity).frame(height: 44)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(m.busy == "save")
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(p.lab, lineWidth: 1.5))
    }

    private var destinations: [(String, String)] {
        var out: [(String, String)] = []
        if m.gConnected { out.append(("google", "Google Kalender")) }
        if !m.haEntity.isEmpty && !m.offline { out.append(("ha", "Home Assistant")) }
        out.append(("local", "Bare her"))
        return out
    }

    private var note: String {
        switch form.saveTo {
        case "google":
            let cal: String = m.gCalendars.first { $0.id == m.gCalendarId }?.name ?? "Bursdager"
            return "Lagres som årlig heldagshendelse i «\(cal)»" + (m.gEmail.isEmpty ? "." : " på \(m.gEmail).")
        case "ha": return "Lagres i \(m.haEntity) via Home Assistant."
        default: return "Lagres bare i Homelab. Koble til en kalender for å synke."
        }
    }

    private func label(_ t: String) -> some View {
        Text(t).font(PF.ui(12.5)).foregroundStyle(p.mut)
    }

    private var dayMenu: some View {
        Menu {
            ForEach(1...31, id: \.self) { d in
                Button("\(d).") { form.day = d }
            }
        } label: {
            menuLabel("\(form.day).")
        }
    }

    private var monthMenu: some View {
        Menu {
            ForEach(1...12, id: \.self) { mo in
                Button(BirthdayShared24.monthsLong[mo - 1]) { form.month = mo }
            }
        } label: {
            menuLabel(BirthdayShared24.monthsLong[Swift.max(1, Swift.min(12, form.month)) - 1])
        }
    }

    private func menuLabel(_ t: String) -> some View {
        HStack(spacing: 4) {
            Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
            Spacer(minLength: 2)
            Image(systemName: "chevron.up.chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 10).frame(height: 44)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
    }
}

/* ---------- Små byggeklosser ---------- */

/// Valgknapper: valgt = blekk, ellers kant. Brytes over flere linjer når det ikke er plass.
struct BdChipRow24: View {
    @Environment(\.paper) private var p
    let options: [(String, String)]
    let selected: String
    var height: CGFloat = 32
    let pick: (String) -> Void

    var body: some View {
        BdFlow24(spacing: 6) {
            ForEach(options, id: \.0) { o in
                let on: Bool = o.0 == selected
                Button { Haptics.shared.select(); pick(o.0) } label: {
                    Text(o.1).font(PF.ui(height < 32 ? 12 : 12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                        .padding(.horizontal, height < 32 ? 11 : 12).frame(height: height)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                        .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Enkel flytlayout (rader som brytes).
struct BdFlow24: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW: CGFloat = proposal.width ?? 10_000
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        var widest: CGFloat = 0
        for s in subviews {
            let sz: CGSize = s.sizeThatFits(.unspecified)
            if x > 0 && x + sz.width > maxW {
                y += rowH + spacing
                x = 0
                rowH = 0
            }
            x += sz.width + spacing
            rowH = Swift.max(rowH, sz.height)
            widest = Swift.max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowH: CGFloat = 0
        for s in subviews {
            let sz: CGSize = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + sz.width > bounds.maxX {
                y += rowH + spacing
                x = bounds.minX
                rowH = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing
            rowH = Swift.max(rowH, sz.height)
        }
    }
}

struct BdLineButton24: View {
    @Environment(\.paper) private var p
    let title: String
    let color: Color
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(13, .bold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 14).frame(height: 36)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct BdNote24: View {
    @Environment(\.paper) private var p
    let text: String
    let color: Color

    var body: some View {
        Text(text).font(PF.ui(13)).foregroundStyle(color).fixedSize(horizontal: false, vertical: true)
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Bryter i Papir-stil (46 × 28, grønn når på).
struct BdToggleRow24: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let on: Bool
    let tap: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(p.line).frame(height: 1)
            Button(action: tap) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                        Text(sub).font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                    Spacer(minLength: 6)
                    ZStack(alignment: on ? .trailing : .leading) {
                        Capsule().fill(on ? p.pos : p.line).frame(width: 46, height: 28)
                        Circle().fill(Color.white).frame(width: 22, height: 22).padding(.horizontal, 3)
                    }
                    .frame(width: 46, height: 28)
                }
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}
