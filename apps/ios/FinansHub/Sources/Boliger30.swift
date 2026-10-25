import SwiftUI

/* ---------------- Prompt 30: Boliger – del med brukere og rediger utgifter ---------------- */
// Fasit: design/Boliger.dc.html og prompts/prompt-30-pakke/claude-code-boliger-kvittering-deling-rediger.md.
// API (SERVER30, server/finans/boliger30.js):
//   GET  /finans/api/users/shareable?home=<id> → [{id, name, initial, color, relation?}] (aldri e-post/brukernavn)
//   POST /finans/api/folders/:id/members {userIds[], role} → hele boligen
//   PATCH /finans/api/folders/:id/entries/:eid {merchant, amount, date, categoryId} (logges med «endret av»)

struct Bol30User: Identifiable, Hashable {
    let id: String
    let name: String
    let initial: String
    let color: String
    let relation: String

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? ""
        let n: String = JS.str(o, "name") ?? "Bruker"
        name = n
        initial = JS.str(o, "initial") ?? String(n.prefix(1)).uppercased()
        color = JS.str(o, "color") ?? "#2b5d8a"
        relation = JS.str(o, "relation") ?? ""
    }
}

@MainActor
@Observable
final class Bol30Share {
    static let shared = Bol30Share()

    var users: [Bol30User] = []
    var loadedFor: Int = -1
    var loading: Bool = false
    var picked: Set<String> = []
    var role: String = "editor"
    var sending: Bool = false

    func load(_ hid: Int, _ store: Store) async {
        if loading { return }
        loading = true
        defer { loading = false }
        if loadedFor != hid { picked = [] }
        do {
            let d: Data = try await store.api.call("GET", "/users/shareable?home=\(hid)")
            let arr: [Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [Any]) ?? []
            users = arr.compactMap { $0 as? [String: Any] }.map { Bol30User($0) }.filter { !$0.id.isEmpty }
        } catch {
            users = []
        }
        loadedFor = hid
    }

    func toggle(_ id: String) {
        Haptic30.soft()
        if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
    }

    /// «Del med Ingrid og Pål» / «Del med 3 personer».
    var buttonTitle: String {
        let names: [String] = users.filter { picked.contains($0.id) }.map(\.name)
        if names.count == 1 { return "Del med " + names[0] }
        if names.count == 2 { return "Del med " + names[0] + " og " + names[1] }
        return "Del med \(names.count) personer"
    }

    func share(_ hid: Int, _ store: Store) async {
        if picked.isEmpty || sending { return }
        sending = true
        defer { sending = false }
        let ids: [String] = Array(picked)
        let title: String = buttonTitle
        do {
            let d: Data = try await store.api.call("POST", "/folders/\(hid)/members", json: ["userIds": ids, "role": role])
            Bol24Model.shared.apply(JS.obj(d))
            picked = []
            store.flash(title.replacingOccurrences(of: "Del med", with: "Delt med"))
            await load(hid, store)
        } catch {
            store.flash("Kunne ikke dele: \(error.localizedDescription)")
        }
    }
}

/// Kortet «Del boligen» i Tilgang: BRUKERE I HOMELAB (rutenett), ROLLE og knappen. Uten valg: e-post utenfor Homelab.
struct Bol30ShareCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Bol30Share { Bol30Share.shared }
    let home: Bol24Home
    @State private var email: String = ""

    private static let roles: [(String, String)] = [("owner", "Eier"), ("editor", "Kan laste opp"), ("viewer", "Kan se")]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Del boligen").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            Bol30Kicker(text: "BRUKERE I HOMELAB")
            users
            Bol30Kicker(text: "ROLLE").padding(.top, 4)
            roles
            Text(roleHelp).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            if s.picked.isEmpty {
                emailField
                Bol24Button(title: "Send invitasjon", fg: p.bg, bg: p.ink, border: nil, height: 46, font: 14.5) { sendEmail() }
            } else {
                Bol24Button(title: s.sending ? "Deler …" : s.buttonTitle, fg: p.bg, bg: p.ink, border: nil, height: 46, font: 14.5) {
                    let hid: Int = home.id
                    Task { await s.share(hid, store) }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .task(id: home.id) { await s.load(home.id, store) }
    }

    @ViewBuilder private var users: some View {
        if s.loadedFor == home.id && s.users.isEmpty {
            Text("Alle brukerne har allerede tilgang.").font(PF.ui(13)).foregroundStyle(p.mut)
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 8)], spacing: 8) {
                ForEach(s.users) { (u: Bol30User) in
                    Bol30UserTile(u: u, on: s.picked.contains(u.id)) { s.toggle(u.id) }
                }
            }
        }
    }

    private var roles: some View {
        HStack(spacing: 6) {
            ForEach(Bol30ShareCard.roles, id: \.0) { r in
                let on: Bool = s.role == r.0
                Bol24Button(title: r.1, fg: on ? p.bg : p.ink, bg: on ? p.ink : Color.clear, border: on ? p.ink : p.line, height: 36, font: 12) {
                    Haptics.shared.select()
                    s.role = r.0
                }
            }
        }
    }

    private var emailField: some View {
        TextField("Eller e-post til noen utenfor Homelab", text: $email)
            .font(PF.ui(15, .medium)).foregroundStyle(p.ink)
            .keyboardType(.emailAddress)
            .textContentType(.emailAddress)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .padding(.horizontal, 14).frame(height: 46)
            .background(RoundedRectangle(cornerRadius: 14).fill(p.bg))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, lineWidth: 1))
    }

    private var roleHelp: String {
        switch s.role {
        case "owner": return "Full tilgang, kan invitere og slette."
        case "viewer": return "Ser oversikt og kvitteringer."
        default: return "Legger til kvitteringer og utgifter."
        }
    }

    private func sendEmail() {
        let v: String = email.trimmingCharacters(in: .whitespaces)
        guard !v.isEmpty else { return }
        email = ""
        let hid: Int = home.id
        let r: String = s.role
        Task { await Bol24Model.shared.invite(hid, v, role: r, store) }
    }
}

struct Bol30Kicker: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.mono(11, bold: true)).tracking(1.3).foregroundStyle(p.mut)
    }
}

/// Avatar (initial + farge), navn og relasjon. Valgt = ink-kant og hake øverst til høyre.
struct Bol30UserTile: View {
    @Environment(\.paper) private var p
    let u: Bol30User
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Text(u.initial).font(PF.ui(15, .bold)).foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .background(Color(hex: u.color), in: Circle())
                Text(u.name).font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Text(u.relation.isEmpty ? " " : u.relation).font(PF.ui(11)).foregroundStyle(p.mut).lineLimit(1)
            }
            .padding(.horizontal, 6).padding(.top, 12).padding(.bottom, 10)
            .frame(maxWidth: .infinity)
            .background(on ? p.bg : Color.clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(on ? p.ink : p.line, lineWidth: 1.5))
            .overlay(alignment: .topTrailing) { check }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(u.name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var check: some View {
        Image(systemName: "checkmark").font(.dyn51(size: 10, weight: .heavy)).foregroundStyle(p.bg)
            .frame(width: 20, height: 20)
            .background(p.ink, in: Circle())
            .padding(6)
            .opacity(on ? 1 : 0)
    }
}

/* ---------- Rediger utgift (detaljarket) ---------- */

/// Lagrer fortløpende (debounce 400 ms) med PATCH …/entries/:eid. Kalles bare fra visningene (hovedtråden).
final class Bol30Debounce {
    private var task: Task<Void, Never>? = nil

    func run(_ hid: Int, _ eid: Int, _ body: [String: Any], _ store: Store) {
        task?.cancel()
        task = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(400))
            if Task.isCancelled { return }
            await Bol24Model.shared.entry(hid, eid, body, store)
        }
    }
}

/// Butikk/beskrivelse i tittelen: serif 26, stiplet understrek.
struct Bol30TitleField: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let hid: Int
    let eid: Int
    let initial: String
    let editable: Bool
    @State private var text: String = ""
    @State private var ready: Bool = false
    @State private var deb: Bol30Debounce = Bol30Debounce()

    var body: some View {
        if editable {
            TextField("Butikk eller beskrivelse", text: $text, axis: .vertical)
                .font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                .lineLimit(1...3)
                .padding(.bottom, 3)
                .overlay(alignment: .bottom) { Bol30Dashed().stroke(p.line, style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])).frame(height: 1) }
                .onAppear { text = initial; DispatchQueue.main.async { ready = true } }
                .onChange(of: text) { _, v in changed(v) }
        } else {
            Text(initial).font(PF.serif(26, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func changed(_ v: String) {
        guard ready else { return }
        let t: String = v.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || t == initial { return }
        deb.run(hid, eid, ["merchant": t], store)
    }
}

/// Stiplet linje (understrek).
struct Bol30Dashed: Shape {
    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

/// Beløp (34 pt, «kr», desimal med komma) og dato (datovelger).
struct Bol30AmountDate: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let hid: Int
    let eid: Int
    let amount: Double
    let date: String
    @State private var text: String = ""
    @State private var day: Date = Date()
    @State private var ready: Bool = false
    @State private var deb: Bol30Debounce = Bol30Debounce()
    @State private var debDate: Bol30Debounce = Bol30Debounce()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                TextField("0", text: $text)
                    .font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
                    .keyboardType(.decimalPad)
                    .fixedSize(horizontal: true, vertical: false)
                Text("kr").font(PF.serif(22)).foregroundStyle(p.mut)
            }
            .padding(.bottom, 2)
            .overlay(alignment: .bottom) { Bol30Dashed().stroke(p.line, style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])).frame(height: 1) }
            DatePicker("Dato", selection: $day, displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .environment(\.locale, Locale(identifier: "nb_NO"))
        }
        .onAppear { setup() }
        .onChange(of: text) { _, v in amountChanged(v) }
        .onChange(of: day) { _, v in dateChanged(v) }
    }

    private static let iso: DateFormatter = {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func format(_ v: Double) -> String {
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = false
        return f.string(from: NSNumber(value: v)) ?? String(v)
    }

    static func parse(_ s: String) -> Double? {
        let t: String = s.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "").replacingOccurrences(of: ",", with: ".")
        return Double(t)
    }

    private func setup() {
        text = Bol30AmountDate.format(amount)
        day = Bol30AmountDate.iso.date(from: String(date.prefix(10))) ?? Date()
        DispatchQueue.main.async { ready = true }
    }

    private func amountChanged(_ v: String) {
        guard ready, let a = Bol30AmountDate.parse(v), abs(a - amount) > 0.001 else { return }
        deb.run(hid, eid, ["amount": a], store)
    }

    private func dateChanged(_ v: Date) {
        guard ready else { return }
        let s: String = Bol30AmountDate.iso.string(from: v)
        if s == String(date.prefix(10)) { return }
        Haptic30.soft()
        debDate.run(hid, eid, ["date": s], store)
    }
}
