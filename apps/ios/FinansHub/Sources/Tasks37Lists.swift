import SwiftUI

/* ---------------- Prompt 37: Gjøremål – personlige og delte lister ---------------- */
// Fasit: design/Huskeliste.dc.html → lists(), LDEF, shInfo og lsv (listeark). Chips med opptil 3 avatarer for delte lister
// og «+ Ny liste» sist. Infokort under chipsene: delt («Delt med Ingrid og Pål …» + Administrer) eller privat («Bare du ser
// denne listen …» + Del). Listearket: navn, 8 farger, DEL MED (husstandens brukere med bryter, du selv alltid på),
// Forlat listen (medlem) / Slett listen (eier, med bekreftelse).

/// Små overlappende avatarer (initial + farge, 18 pt).
struct Task37Avatars: View {
    let names: [String]

    var body: some View {
        HStack(spacing: -6) {
            ForEach(Array(names.prefix(3).enumerated()), id: \.offset) { i, n in
                ZStack {
                    Circle().fill(Task37Avatars.color(n))
                    Text(String(n.prefix(1)).uppercased()).font(PF.ui(9.5, .bold)).foregroundStyle(Color.white)
                }
                .frame(width: 18, height: 18)
                .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 1.2))
                .zIndex(Double(3 - i))
            }
        }
        .accessibilityHidden(true)
    }

    static func color(_ n: String) -> Color {
        let pal: [String] = ["#2b5d8a", "#b23a2a", "#2f6b45", "#a8661a", "#6b4a8f", "#c2577a"]
        var h: Int = 0
        for u in n.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0x7fffffff }
        return Color(hex: pal[h % pal.count])
    }
}

/// Liste-chipen med fargeprikk, navn, antall og avatarer (delt).
struct Task37ListChip: View {
    @Environment(\.paper) private var p
    let name: String
    let color: Color?
    let count: Int
    let avatars: [String]
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 8) {
                if let color { Circle().fill(color).frame(width: 9, height: 9) }
                Text(name).font(PF.ui(13, .bold))
                if count > 0 { Text("\(count)").font(PF.ui(12, .semibold)).opacity(0.6) }
                if !avatars.isEmpty { Task37Avatars(names: avatars) }
            }
            .foregroundStyle(on ? p.bg : p.ink)
            .padding(.horizontal, 14).frame(height: 38)
            .background(on ? p.ink : p.card, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// «+ Ny liste» (stiplet kant).
struct Task37NewListChip: View {
    @Environment(\.paper) private var p
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text("+ Ny liste").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(height: 38)
                .overlay(Capsule().stroke(p.line, style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])))
        }
        .buttonStyle(.plain)
    }
}

/// Infokortet under chipsene for valgt liste.
struct Task37ListInfo: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: TasksModel { TasksModel.shared }
    let list: TaskList17

    var body: some View {
        let priv: Bool = m.isPrivate37(list)
        let mine: Bool = m.isMine(list, store)
        let shared: String = m.sharedText(list)
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                if priv {
                    Text("Bare du ser denne listen").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                    Text("Privat. Del den for å gjøre den felles.").font(PF.ui(12)).foregroundStyle(p.mut)
                } else {
                    Text(shared.isEmpty ? (mine ? "Delt liste" : "Delt med deg av " + m.ownerLabel(list)) : shared)
                        .font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                    Text("Alle i listen kan legge til, endre og krysse av.").font(PF.ui(12)).foregroundStyle(p.mut)
                }
            }
            Spacer(minLength: 6)
            Button {
                Haptics.shared.tap()
                Tasks37UI.shared.listEdit = list
                Tasks37UI.shared.listSheet = true
            } label: {
                Text(priv ? "Del" : "Administrer").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Listearket: ny liste eller rediger.
struct Task37ListSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: TasksModel { TasksModel.shared }
    let list: TaskList17?
    let close: () -> Void
    @State private var name: String = ""
    @State private var color: String = "#2b5d8a"
    @State private var picked: Set<String> = []
    @State private var confirm: Bool = false

    private var meId: String {
        let me: String = (store.account?.username ?? "").lowercased()
        return m.members.first { $0.username.lowercased() == me }?.id ?? ""
    }

    private var owner: Bool {
        guard let list else { return true }
        return m.isMine(list, store)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                top
                TextField("Navn på listen", text: $name)
                    .font(PF.serif(22)).foregroundStyle(p.ink)
                    .disabled(!owner)
                    .padding(16)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                swatches
                Task37Label(text: "Del med")
                people
                Text(hint).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                if let list { danger(list) }
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 30)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear {
            name = list?.name ?? ""
            color = list?.color ?? Tasks37.colors[3]
            picked = Set(list?.memberIds ?? [])
        }
    }

    private var hint: String {
        let others: Int = picked.filter { $0 != meId && $0 != list?.owner }.count
        if others == 0 { return "Privat: bare du ser listen og oppgavene i den." }
        return "Delt: alle du velger kan legge til, endre og krysse av. Bare eieren kan endre navn, farge og medlemmer."
    }

    private var top: some View {
        HStack(spacing: 10) {
            Button { close() } label: {
                Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(p.ink)
                    .frame(width: 36, height: 36)
                    .background(p.card, in: Circle())
                    .overlay(Circle().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
            Spacer(minLength: 4)
            Text(list == nil ? "Ny liste" : "Liste").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Spacer(minLength: 4)
            if owner {
                SheetButton30(kind: .primary, title: list == nil ? "Opprett" : "Lagre") { save() }
            } else {
                SheetButton30(kind: .secondary, title: "Lukk") { close() }
            }
        }
    }

    private var swatches: some View {
        HStack(spacing: 10) {
            ForEach(Tasks37.colors, id: \.self) { (c: String) in
                Button {
                    if owner { color = c; Haptics.shared.select() }
                } label: {
                    Circle().fill(Color(hex: c)).frame(width: 30, height: 30)
                        .overlay(Circle().stroke(p.ink, lineWidth: color == c ? 2.5 : 0).padding(-4))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Farge")
            }
        }
        .padding(.horizontal, 6)
    }

    private var people: some View {
        VStack(spacing: 0) {
            if m.members.isEmpty {
                Text("Ingen andre brukere på serveren ennå.").font(PF.ui(13)).foregroundStyle(p.mut)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14)
            }
            ForEach(Array(m.members.enumerated()), id: \.element.id) { i, mem in
                if i > 0 { Task37Divider() }
                person(mem)
            }
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func person(_ mem: TaskMember17) -> some View {
        let me: Bool = mem.id == meId || (list != nil && mem.id == list?.owner)
        let on: Bool = me || picked.contains(mem.id)
        return Button {
            if me || !owner { return }
            if picked.contains(mem.id) { picked.remove(mem.id) } else { picked.insert(mem.id) }
            Haptics.shared.select()
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(Task37Avatars.color(mem.name))
                    Text(String(mem.name.prefix(1)).uppercased()).font(PF.ui(13, .bold)).foregroundStyle(Color.white)
                }
                .frame(width: 32, height: 32)
                Text(mem.name + (me ? " (deg)" : "")).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer(minLength: 6)
                Pkg37Switch(on: on).opacity(me || !owner ? 0.5 : 1)
            }
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func danger(_ l: TaskList17) -> some View {
        Button {
            if !confirm {
                Haptics.shared.warning()
                confirm = true
                return
            }
            if owner { m.deleteList37(l, store) } else { m.leaveList37(l, store) }
            close()
        } label: {
            Text(confirm ? (owner ? "Trykk igjen: slett listen og oppgavene" : "Trykk igjen for å forlate") : (owner ? "Slett listen" : "Forlat listen"))
                .font(PF.ui(15, .bold)).foregroundStyle(p.lab)
                .frame(maxWidth: .infinity).frame(height: 48)
        }
        .buttonStyle(.plain)
    }

    private func save() {
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if n.isEmpty {
            Haptics.shared.error()
            return
        }
        var ids: [String] = Array(picked)
        if !meId.isEmpty && !ids.contains(meId) { ids.append(meId) }
        if let list {
            m.updateList37(list, n, color, ids, store)
        } else {
            m.createList37(n, color, ids, store)
        }
        close()
    }
}

/* ---------- Raden i listen ---------- */

@MainActor
enum Task37Row {
    /// Metalinjen: dato + tid, ↻ (gjentas), ⏰ (viktig), deloppgaver «1/3», ansvarlig, liste og #tagger.
    static func meta(_ t: TaskItem17, _ due: String, _ cur: String, _ m: TasksModel) -> String {
        var parts: [String] = []
        var d: String = due
        if !t.time.isEmpty { d = d.isEmpty ? t.time : d + " " + t.time }
        if !d.isEmpty { parts.append(d) }
        if t.rep != "never" { parts.append("↻") }
        if t.urgent { parts.append("⏰") }
        if !t.subs.isEmpty {
            let n: Int = t.subs.filter { $0.done }.count
            parts.append("\(n)/\(t.subs.count)")
        }
        if let who = m.memberName(t.assignee) { parts.append(who) }
        if cur == "alle" { parts.append(m.listName(t.list)) }
        for tag in t.tags.prefix(3) { parts.append("#" + tag) }
        return parts.joined(separator: " · ")
    }

    /// Tittelen med ⚑ (oransje) og ! / !! / !!! (rødt) foran.
    static func title(_ t: TaskItem17, _ p: PaperPalette) -> Text {
        var out: Text = Text("")
        if t.flag { out = out + Text("⚑ ").foregroundColor(Color(hex: "#e07b1a")) }
        let b: String = Tasks37.bangs(t.prio)
        if !b.isEmpty { out = out + Text(b + " ").foregroundColor(p.lab) }
        let main: Text = Text(t.title).foregroundColor(p.ink).strikethrough(t.done)
        return (out + main).font(PF.ui(15, .semibold))
    }
}
