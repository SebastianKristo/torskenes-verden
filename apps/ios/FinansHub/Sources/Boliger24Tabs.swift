import SwiftUI

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
            if home.isOwner { invite }
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
                    Text("−").font(.system(size: 18)).foregroundStyle(p.lab).frame(width: 32, height: 32)
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
