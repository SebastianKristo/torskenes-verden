import SwiftUI

/* ---------------- Prompt 37: Gjøremål – detaljarket for en oppgave ---------------- */
// Fasit: design/Huskeliste.dc.html → ed (ark nederst, åpnes ved trykk på teksten i en rad) og vedlegg Påminnelser.png.
// ✕ · «Detaljer» · Ferdig. Alt lagres med en gang. Kort: tittel + notater; DATO OG TID (dato, tid, viktig); gjenta og tidlig
// påminnelse; ORGANISERING (liste, ansvarlig, prioritet, flagg, tagger, deloppgaver, påminn på sted); ✦ Glimt (del opp og
// sorteringsforslag); Slett oppgave. Ikonbrikke 30 pt (radius 9) per rad.

struct Task37DetailSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var t: TaskItem17
    @State private var tagText: String = ""
    @State private var subText: String = ""
    @State private var confirmDelete: Bool = false
    @State private var splitting: Bool = false
    @State private var dueOn: Bool = false
    @State private var timeOn: Bool = false
    @State private var due: Date = Date()
    @State private var time: Date = Date()
    @MainActor private var m: TasksModel { TasksModel.shared }
    let close: () -> Void

    init(task: TaskItem17, close: @escaping () -> Void) {
        _t = State(initialValue: task)
        self.close = close
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                top
                titleCard
                Task37Label(text: "Dato og tid")
                dateCard
                repeatCard
                Task37Label(text: "Organisering")
                orgCard
                tagsCard
                subsCard
                glimtCard
                deleteButton
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 30)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear { setup() }
    }

    private func setup() {
        dueOn = t.due != nil
        due = t.due ?? Date()
        timeOn = !t.time.isEmpty
        time = Task37Time.date(t.time) ?? Date()
    }

    /// Lagrer med en gang (ingen lagre-knapp).
    private func commit() {
        t.due = dueOn ? due : nil
        t.time = (dueOn && timeOn) ? Task37Time.text(time) : ""
        m.save37(t, store)
    }

    private var top: some View {
        HStack(spacing: 10) {
            Button { commit(); close() } label: {
                Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(p.ink)
                    .frame(width: 36, height: 36)
                    .background(p.card, in: Circle())
                    .overlay(Circle().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
            Spacer(minLength: 4)
            Text("Detaljer").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Spacer(minLength: 4)
            SheetButton30(kind: .primary, title: "Ferdig") { commit(); close() }
        }
    }

    private var titleCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Tittel", text: $t.title, axis: .vertical)
                .font(PF.serif(22)).foregroundStyle(p.ink)
                .onSubmit { commit() }
            Rectangle().fill(p.line).frame(height: 1)
            TextField("Notater og lenke", text: $t.note, axis: .vertical)
                .font(PF.ui(14.5)).foregroundStyle(p.ink)
                .lineLimit(2...8)
            if let u = Task37Link.first(t.note) {
                Link(destination: u) {
                    Text(u.host ?? u.absoluteString).font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#2b5d8a")).lineLimit(1)
                }
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .onChange(of: t.title) { (_: String, _: String) in commitSoon() }
        .onChange(of: t.note) { (_: String, _: String) in commitSoon() }
    }

    @State private var saveTask: Task<Void, Never>? = nil

    /// Tekstendringer lagres etter en kort pause.
    private func commitSoon() {
        saveTask?.cancel()
        saveTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 700_000_000)
            if Task.isCancelled { return }
            commit()
        }
    }

    private var dateCard: some View {
        VStack(spacing: 0) {
            Task37ToggleRow(icon: "calendar", tint: Color(hex: "#b23a2a"), title: "Dato", sub: dueOn ? JS.fmt(due, "EEEE d. MMMM") : nil, on: dueOn) {
                withAnimation(.easeOut(duration: 0.2)) { dueOn.toggle() }
                if !dueOn { timeOn = false }
                commit()
            }
            if dueOn {
                DatePicker("", selection: $due, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .tint(p.lab)
                    .onChange(of: due) { (_: Date, _: Date) in commit() }
            }
            Task37Divider()
            Task37ToggleRow(icon: "clock", tint: Color(hex: "#2b5d8a"), title: "Tid", sub: timeOn ? Task37Time.text(time) : nil, on: timeOn) {
                withAnimation(.easeOut(duration: 0.2)) {
                    timeOn.toggle()
                    if timeOn { dueOn = true }
                }
                commit()
            }
            if timeOn {
                DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                    .onChange(of: time) { (_: Date, _: Date) in commit() }
            }
            Task37Divider()
            Task37ToggleRow(icon: "alarm", tint: Color(hex: "#c2577a"), title: "Viktig", sub: nil, on: t.urgent) {
                t.urgent.toggle()
                commit()
            }
            Text("Viktige oppgaver ringer som en alarm, også i Fokus og stille-modus.")
                .font(PF.ui(12)).foregroundStyle(p.mut)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 42).padding(.bottom, 10)
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var repeatCard: some View {
        VStack(spacing: 0) {
            Task37MenuRow(icon: "repeat", tint: Color(hex: "#6b4a8f"), title: "Gjenta", value: Tasks37.repName(t.rep)) {
                ForEach(Tasks37.reps, id: \.0) { (r: (String, String)) in
                    Button(r.1) { t.rep = r.0; commit() }
                }
            }
            Task37Divider()
            Task37MenuRow(icon: "bell", tint: Color(hex: "#a8661a"), title: "Tidlig påminnelse", value: Tasks37.earlyName(t.early)) {
                ForEach(Tasks37.earlies, id: \.0) { (r: (String, String)) in
                    Button(r.1) { t.early = r.0; commit() }
                }
            }
            Task37Divider()
            Task37MenuRow(icon: "mappin.and.ellipse", tint: Color(hex: "#2f6b45"), title: "Påminn på sted", value: Tasks37.placeName(t.place)) {
                ForEach(Tasks37.places, id: \.0) { (r: (String, String)) in
                    Button(r.1) { t.place = r.0; commit() }
                }
            }
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var orgCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Task37RowHead(icon: "list.bullet", tint: Color(hex: "#1b1a17"), title: "Liste")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(m.lists) { (l: TaskList17) in
                        Task37Chip(text: l.name, dot: Color(hex: l.color), on: t.list == l.id) { t.list = l.id; commit() }
                    }
                }
                .padding(.bottom, 10)
            }
            Task37Divider()
            Task37RowHead(icon: "person", tint: Color(hex: "#2b5d8a"), title: "Ansvarlig")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Task37Chip(text: "Ingen", dot: nil, on: (t.assignee ?? "").isEmpty) { t.assignee = nil; commit() }
                    ForEach(m.members37(t.list)) { (mem: TaskMember17) in
                        Task37Chip(text: mem.first, dot: nil, on: t.assignee == mem.id) { t.assignee = mem.id; commit() }
                    }
                }
                .padding(.bottom, 10)
            }
            Task37Divider()
            Task37RowHead(icon: "exclamationmark", tint: Color(hex: "#b23a2a"), title: "Prioritet")
            HStack(spacing: 6) {
                ForEach(Tasks37.prios, id: \.0) { (r: (Int, String)) in
                    Task37Chip(text: r.0 > 0 ? Tasks37.bangs(r.0) + " " + r.1 : r.1, dot: nil, on: t.prio == r.0) { t.prio = r.0; commit() }
                }
            }
            .padding(.bottom, 10)
            Task37Divider()
            Task37ToggleRow(icon: "flag.fill", tint: Color(hex: "#e07b1a"), title: "Flagg", sub: nil, on: t.flag) {
                t.flag.toggle()
                commit()
            }
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var tagsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Task37RowHead(icon: "number", tint: Color(hex: "#4a7a8a"), title: "Tagger")
            if !t.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(t.tags, id: \.self) { (tag: String) in
                            Button {
                                t.tags.removeAll { $0 == tag }
                                commit()
                            } label: {
                                Text("#" + tag + "  ×").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                                    .padding(.horizontal, 10).frame(height: 30)
                                    .background(p.bg, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            TextField("#tagg (Enter legger til)", text: $tagText)
                .font(PF.ui(14)).foregroundStyle(p.ink)
                .submitLabel(.done)
                .onSubmit { addTag() }
                .padding(.bottom, 10)
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func addTag() {
        let raw: String = tagText.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        tagText = ""
        if raw.isEmpty || t.tags.contains(raw) { return }
        t.tags.append(raw)
        commit()
    }

    private var subsCard: some View {
        let done: Int = t.subs.filter { $0.done }.count
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Task37RowHead(icon: "checklist", tint: Color(hex: "#2f6b45"), title: "Deloppgaver")
                Spacer(minLength: 4)
                if !t.subs.isEmpty { Text("\(done) / \(t.subs.count)").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut) }
            }
            ForEach(Array(t.subs.enumerated()), id: \.offset) { i, s in
                subRow(i, s)
            }
            HStack(spacing: 8) {
                Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundStyle(p.mut).frame(width: 30)
                TextField("Ny deloppgave", text: $subText)
                    .font(PF.ui(14.5)).foregroundStyle(p.ink)
                    .submitLabel(.done)
                    .onSubmit { addSub() }
            }
            .frame(minHeight: 44)
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func subRow(_ i: Int, _ s: TaskSub37) -> some View {
        HStack(spacing: 10) {
            Button {
                if i < t.subs.count { t.subs[i].done.toggle(); commit() }
                Haptics.shared.tick()
            } label: {
                Image(systemName: s.done ? "checkmark.circle.fill" : "circle").font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(s.done ? p.pos : p.line)
                    .frame(width: 30)
            }
            .buttonStyle(.plain)
            Text(s.n).font(PF.ui(14.5)).foregroundStyle(p.ink).strikethrough(s.done)
            Spacer(minLength: 4)
            Button {
                if i < t.subs.count { t.subs.remove(at: i); commit() }
            } label: {
                Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(p.mut).frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fjern deloppgave")
        }
        .frame(minHeight: 40)
    }

    private func addSub() {
        let n: String = subText.trimmingCharacters(in: .whitespacesAndNewlines)
        subText = ""
        if n.isEmpty { return }
        t.subs.append(TaskSub37(n: n, done: false))
        commit()
    }

    /// ✦ Del opp med Glimt og sorteringsforslaget («Glimt foreslår: Handel · Pål · #hytte»).
    private var glimtCard: some View {
        let sugg: Task37Suggest = Task37Suggest.make(t, m)
        return VStack(alignment: .leading, spacing: 10) {
            Button { split() } label: {
                HStack(spacing: 8) {
                    Text("✦").font(PF.ui(15, .bold)).foregroundStyle(p.lab)
                    Text(splitting ? "Glimt deler opp …" : "Del opp med Glimt").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 40)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(splitting)
            if !sugg.text.isEmpty {
                Task37Divider()
                HStack(spacing: 8) {
                    Text("✦ Glimt foreslår: " + sugg.text).font(PF.ui(13)).foregroundStyle(p.ink).lineLimit(2)
                    Spacer(minLength: 4)
                    Button {
                        sugg.apply(&t)
                        commit()
                        Haptics.shared.success()
                    } label: {
                        Text("Bruk").font(PF.ui(12.5, .bold)).foregroundStyle(p.bg)
                            .padding(.horizontal, 12).frame(height: 30)
                            .background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 8)
            }
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func split() {
        splitting = true
        let cur: TaskItem17 = t
        Task { @MainActor in
            let subs: [TaskSub37] = await m.split37(cur, store)
            var nt: TaskItem17 = t
            for s in subs where !nt.subs.contains(where: { $0.n == s.n }) { nt.subs.append(s) }
            withAnimation(.easeOut(duration: 0.2)) { t = nt }
            splitting = false
            commit()
            Haptics.shared.success()
        }
    }

    private var deleteButton: some View {
        Button {
            if confirmDelete {
                m.delete(t, store)
                close()
            } else {
                Haptics.shared.warning()
                confirmDelete = true
            }
        } label: {
            Text(confirmDelete ? "Trykk igjen for å slette" : "Slett oppgave").font(PF.ui(15, .bold)).foregroundStyle(p.lab)
                .frame(maxWidth: .infinity).frame(height: 48)
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Byggeklosser ---------- */

struct Task37Label: View {
    let text: String

    var body: some View {
        PLabel(text: text).padding(.leading, 4).padding(.top, 4)
    }
}

struct Task37Divider: View {
    @Environment(\.paper) private var p

    var body: some View {
        Rectangle().fill(p.line).frame(height: 1)
    }
}

/// Ikonbrikke 30 pt, radius 9, i farge per type.
struct Task37Icon: View {
    let icon: String
    let tint: Color

    var body: some View {
        Image(systemName: icon).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.white)
            .frame(width: 30, height: 30)
            .background(tint, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .accessibilityHidden(true)
    }
}

struct Task37RowHead: View {
    @Environment(\.paper) private var p
    let icon: String
    let tint: Color
    let title: String

    var body: some View {
        HStack(spacing: 12) {
            Task37Icon(icon: icon, tint: tint)
            Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
        }
        .frame(minHeight: 50)
    }
}

struct Task37ToggleRow: View {
    @Environment(\.paper) private var p
    let icon: String
    let tint: Color
    let title: String
    let sub: String?
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Task37Icon(icon: icon, tint: tint)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    if let sub { Text(sub).font(PF.ui(12.5)).foregroundStyle(p.lab) }
                }
                Spacer(minLength: 6)
                Pkg37Switch(on: on)
            }
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(on ? "På" : "Av")
    }
}

struct Task37MenuRow<M: View>: View {
    @Environment(\.paper) private var p
    let icon: String
    let tint: Color
    let title: String
    let value: String
    @ViewBuilder let items: () -> M

    var body: some View {
        Menu {
            items()
        } label: {
            HStack(spacing: 12) {
                Task37Icon(icon: icon, tint: tint)
                Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer(minLength: 6)
                Text(value + " ›").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
    }
}

struct Task37Chip: View {
    @Environment(\.paper) private var p
    let text: String
    let dot: Color?
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button {
            Haptics.shared.select()
            act()
        } label: {
            HStack(spacing: 6) {
                if let dot { Circle().fill(dot).frame(width: 8, height: 8) }
                Text(text).font(PF.ui(12.5, .semibold))
            }
            .foregroundStyle(on ? p.bg : p.ink)
            .padding(.horizontal, 12).frame(height: 32)
            .background(on ? p.ink : p.bg, in: Capsule())
            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

enum Task37Time {
    static func date(_ s: String) -> Date? {
        let parts: [Int] = s.split(separator: ":").compactMap { Int($0) }
        if parts.count < 2 { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: Date())
    }

    static func text(_ d: Date) -> String {
        let c: DateComponents = Calendar.current.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}

enum Task37Link {
    /// Første lenke i notatene (klikkbar i visning).
    static func first(_ s: String) -> URL? {
        guard let det = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        let r: NSRange = NSRange(s.startIndex..<s.endIndex, in: s)
        return det.firstMatch(in: s, options: [], range: r)?.url
    }
}

/// Sorteringsforslaget: dagligvarer → Handel, hytte → Hytta, jobb-ord → Jobb, hjem-ord → Hjem, navn → ansvarlig.
struct Task37Suggest {
    var list: String? = nil
    var who: String? = nil
    var tag: String? = nil
    var place: String? = nil
    var text: String = ""

    func apply(_ t: inout TaskItem17) {
        if let list { t.list = list }
        if let who { t.assignee = who }
        if let tag, !t.tags.contains(tag) { t.tags.append(tag) }
        if let place { t.place = place }
    }

    @MainActor
    static func make(_ t: TaskItem17, _ m: TasksModel) -> Task37Suggest {
        var s = Task37Suggest()
        let low: String = (t.title + " " + t.note).lowercased()
        let food: [String] = ["melk", "egg", "brød", "kaffe", "smør", "ost", "banan", "eple", "kjøtt", "fisk", "pasta", "ris", "yoghurt", "dopapir"]
        func listId(_ names: [String]) -> String? {
            m.lists.first { (l: TaskList17) -> Bool in names.contains(l.name.lowercased()) || names.contains(l.id.lowercased()) }?.id
        }
        var parts: [String] = []
        if food.contains(where: { low.contains($0) }), let id = listId(["handel", "handleliste"]), id != t.list {
            s.list = id
            s.place = t.place.isEmpty ? "store" : nil
        } else if low.contains("hytt"), let id = listId(["hytta", "hytte"]), id != t.list {
            s.list = id
            s.tag = "hytte"
        } else if ["møte", "rapport", "kunde", "faktura", "jobb"].contains(where: { low.contains($0) }), let id = listId(["jobb"]), id != t.list {
            s.list = id
        }
        if let l = s.list { parts.append(m.listName(l)) }
        for mem in m.members where (t.assignee ?? "") != mem.id {
            if mem.first.count > 2 && low.contains(mem.first.lowercased()) {
                s.who = mem.id
                parts.append(mem.first)
                break
            }
        }
        if let tag = s.tag { parts.append("#" + tag) }
        if s.place == "store" { parts.append("påminn ved butikk") }
        s.text = parts.joined(separator: " · ")
        return s
    }
}
