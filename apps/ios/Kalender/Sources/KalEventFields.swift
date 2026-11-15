import SwiftUI

/* ---------------- Prompt 44: «Sted eller adresse» med forslag og DELTAKERE i Ny / Rediger hendelse ---------------- */
// Fasit: Kalender App.dc.html (arket Ny / Rediger, geoSearch, INVU/INV). Spesifikasjon: claude-code-kalender-sted-adresse.md
// og claude-code-kalender-deltakere-invitasjon.md.
// Adresse: fra 3 tegn, 280 ms etter siste tastetrykk, maks 6 forslag (gateadresse fet, postnummer og sted under, «ADRESSER FRA
// KARTVERKET»). Bare siste søk vises. Lista krymper aldri (fixedSize vertikalt) – arket ruller. Rad ≥ 48 pt.
// Deltakere: brukere i appen som piller (trykk = velg/fjern ✓), e-post til andre med Legg til (Enter virker), status per rad.

/* ---------- Adresse ---------- */

@MainActor
@Observable
final class KalAddr44Model {
    var list: [KalAddr44] = []
    var query: String = ""
    @ObservationIgnored private var task: Task<Void, Never>? = nil
    @ObservationIgnored private var seq: Int = 0

    func search(_ q: String) {
        task?.cancel()
        let v: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        query = v
        if v.count < 3 {
            list = []
            return
        }
        seq += 1
        let id: Int = seq
        task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 280_000_000)
            if Task.isCancelled { return }
            let out: [KalAddr44] = await KalEv44.addresses(v)
            // Bare det siste søket vises.
            if id != self.seq || Task.isCancelled { return }
            self.list = Array(out.prefix(6))
        }
    }

    func close() {
        task?.cancel()
        list = []
    }
}

struct KalAddrField44: View {
    @Environment(\.kal) private var t
    @Binding var f: KalNewForm
    @State private var m: KalAddr44Model = KalAddr44Model()
    @FocusState private var focused: Bool
    /// Valgt forslag: ikke søk på nytt når feltet fylles ut.
    @State private var picked: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            field
            if focused && !m.list.isEmpty {
                KalAddrList44(list: m.list) { (a: KalAddr44) in pick(a) }
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onChange(of: focused) { (_: Bool, v: Bool) in if !v { m.close() } }
    }

    private var field: some View {
        TextField("Sted eller adresse", text: $f.loc)
            .font(KalFont.ui(16, .medium)).foregroundStyle(t.ink)
            .focused($focused)
            .autocorrectionDisabled(true)
            .textContentType(.fullStreetAddress)
            .frame(height: 40)
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
            .onChange(of: f.loc) { (_: String, v: String) in typed(v) }
    }

    private func typed(_ v: String) {
        if picked {
            picked = false
            return
        }
        // Fri tekst er lov («Hos mormor»): koordinatene gjelder bare det valgte forslaget.
        f.lat = nil
        f.lon = nil
        m.search(v)
    }

    private func pick(_ a: KalAddr44) {
        KalHaptic.tap()
        picked = true
        f.loc = a.full
        f.lat = a.lat
        f.lon = a.lon
        m.close()
        focused = false
    }
}

struct KalAddrList44: View {
    @Environment(\.kal) private var t
    let list: [KalAddr44]
    let pick: (KalAddr44) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<list.count, id: \.self) { (i: Int) in
                KalAddrRow44(a: list[i], top: i > 0) { pick(list[i]) }
            }
            Text("ADRESSER FRA KARTVERKET").font(KalFont.mono(9.5)).tracking(1).foregroundStyle(t.mut)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .overlay(alignment: .top) { Rectangle().fill(t.line).frame(height: 1) }
        }
        .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

struct KalAddrRow44: View {
    @Environment(\.kal) private var t
    let a: KalAddr44
    let top: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse").font(.system(size: 14, weight: .semibold)).foregroundStyle(t.red)
                VStack(alignment: .leading, spacing: 1) {
                    Text(a.street).font(KalFont.ui(14, .semibold)).foregroundStyle(t.ink).lineLimit(1)
                    if !a.place.isEmpty { Text(a.place).font(KalFont.ui(12)).foregroundStyle(t.mut).lineLimit(1) }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { if top { Rectangle().fill(t.line).frame(height: 1) } }
        .accessibilityLabel(a.full)
    }
}

/* ---------- Deltakere ---------- */

@MainActor
@Observable
final class KalPeople44Model {
    static let shared: KalPeople44Model = KalPeople44Model()
    var users: [KalUser44] = []
    var me: String = ""
    @ObservationIgnored private var at: Date = .distantPast

    func load() {
        if Date().timeIntervalSince(at) < 600 && !users.isEmpty { return }
        at = Date()
        Task { @MainActor in
            let r: (users: [KalUser44], me: String) = await KalEv44.directory()
            if !r.users.isEmpty { self.users = r.users }
            if !r.me.isEmpty { self.me = r.me }
        }
    }
}

struct KalPeople44: View {
    @Environment(\.kal) private var t
    @Binding var att: [KalAtt44]
    @State private var email: String = ""
    @MainActor private var m: KalPeople44Model { KalPeople44Model.shared }

    private var ext: [KalAtt44] { att.filter { (a: KalAtt44) -> Bool in a.userId == nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "DELTAKERE")
            if !m.users.isEmpty { userPills }
            KalEmailRow44(email: $email) { add() }
            ForEach(ext) { (a: KalAtt44) in
                KalExtRow44(a: a) { remove(a) }
            }
            Text(note).font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
        .onAppear { m.load() }
    }

    private var userPills: some View {
        KalFlow(spacing: 6) {
            ForEach(m.users) { (u: KalUser44) in
                KalUserPill44(u: u, on: has(u)) { toggle(u) }
            }
        }
    }

    private var from: String { m.me.isEmpty ? "din e-postadresse" : m.me }

    private var note: String {
        if att.isEmpty {
            return "Velg brukere i appen, eller skriv e-posten til noen utenfor. De får en invitasjon fra " + from + "."
        }
        return "Brukere i appen får hendelsen i sin kalender. Andre får en vanlig e-post med invitasjon (.ics) sendt fra " + from + " og kan svare Ja, Kanskje eller Nei."
    }

    private func has(_ u: KalUser44) -> Bool { att.contains { (a: KalAtt44) -> Bool in a.userId == u.id } }

    private func toggle(_ u: KalUser44) {
        KalHaptic.tap()
        if has(u) {
            att.removeAll { (a: KalAtt44) -> Bool in a.userId == u.id }
        } else {
            att.append(KalAtt44(userId: u.id, email: u.email.isEmpty ? nil : u.email, name: u.name, status: ""))
        }
    }

    private func add() {
        let v: String = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !KalEv44.validEmail(v) { return }
        if att.contains(where: { (a: KalAtt44) -> Bool in a.email == v }) { return }
        KalHaptic.tap()
        att.append(KalAtt44(userId: nil, email: v, name: "", status: ""))
        email = ""
    }

    private func remove(_ a: KalAtt44) {
        KalHaptic.tap()
        att.removeAll { (x: KalAtt44) -> Bool in x.id == a.id }
    }
}

struct KalUserPill44: View {
    @Environment(\.kal) private var t
    let u: KalUser44
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Text(u.initial).font(KalFont.ui(11, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(Color(kalHex: u.hex)))
                Text(u.name).font(KalFont.ui(12.5, .bold))
                if on { Text("✓").font(KalFont.ui(11, .bold)) }
            }
            .foregroundStyle(on ? t.bg : t.ink)
            .padding(.leading, 4).padding(.trailing, 12)
            .frame(height: 36)
            .background(Capsule().fill(on ? t.ink : Color.clear))
            .overlay(Capsule().strokeBorder(on ? t.ink : t.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(u.name + (on ? ", valgt" : ""))
    }
}

struct KalEmailRow44: View {
    @Environment(\.kal) private var t
    @Binding var email: String
    let add: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            TextField("E-post til andre, f.eks. ola@firma.no", text: $email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .submitLabel(.done)
                .onSubmit { add() }
                .font(KalFont.ui(13.5, .medium)).foregroundStyle(t.ink)
                .padding(.horizontal, 12).frame(height: 40)
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
            Button(action: add) {
                Text("Legg til").font(KalFont.ui(13, .bold)).foregroundStyle(t.bg)
                    .padding(.horizontal, 14).frame(height: 40)
                    .background(RoundedRectangle(cornerRadius: 12).fill(t.ink))
            }
            .buttonStyle(.plain)
        }
    }
}

struct KalExtRow44: View {
    @Environment(\.kal) private var t
    let a: KalAtt44
    let remove: () -> Void

    private var mail: String { a.email ?? a.name }

    var body: some View {
        HStack(spacing: 10) {
            Text(String(mail.prefix(1)).uppercased()).font(KalFont.ui(11, .heavy)).foregroundStyle(t.ink)
                .frame(width: 28, height: 28)
                .background(Circle().fill(t.line))
            Text(mail).font(KalFont.ui(13.5)).foregroundStyle(t.ink).lineLimit(1).truncationMode(.middle)
            Spacer(minLength: 4)
            Text(a.statusLabel).font(KalFont.ui(11.5)).foregroundStyle(t.mut)
            Button(action: remove) {
                Text("✕").font(KalFont.ui(14)).foregroundStyle(t.mut).frame(width: 32, height: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fjern " + mail)
        }
        .frame(minHeight: 40)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
    }
}
