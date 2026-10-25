import SwiftUI

/* ---------------- Prompt 37: Onboarding – koble brukeren til en profil i husstanden ---------------- */
// prompts/prompt-37-pakke/claude-code-onboarding-profil.md. Fasit: design/Onboarding.dc.html (steg 2–4).
// Bruker = innlogging. Profil = personen i husstanden (navn, farge, Familie-posisjon, delte lister og abonnementer, kalendere).
// SERVER37: GET /api/profiles → {profiles:[{id, name, color, avatar, userId, username, has:{location, lists, subs}, suggested}],
// me:{profileId}, locked}; POST /api/onboarding/link {profileId | newProfileName, consents:{location, lists, subs, calendars, health}}
// → {profile} (409 hvis profilen allerede er koblet). Mangler endepunktet (404), hoppes steget over.

struct Profile37: Identifiable, Hashable {
    var id: String
    var name: String
    var color: String
    var userId: String
    var username: String
    var hasLocation: Bool
    var hasLists: Bool
    var hasSubs: Bool
    var suggested: Bool

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? "Profil"
        color = JS.str(o, "color") ?? "#2b5d8a"
        userId = JS.str(o, "userId") ?? ""
        username = JS.str(o, "username") ?? ""
        let has: [String: Any] = JS.dict(o, "has") ?? [:]
        hasLocation = JS.bool(has, "location") ?? false
        hasLists = JS.bool(has, "lists") ?? false
        hasSubs = JS.bool(has, "subs") ?? false
        suggested = JS.bool(o, "suggested") ?? false
    }

    var linked: Bool { !userId.isEmpty || !username.isEmpty }

    /// «Posisjon · delte lister · abonnementer»
    var hasText: String {
        var p: [String] = []
        if hasLocation { p.append("Posisjon") }
        if hasLists { p.append("delte lister") }
        if hasSubs { p.append("abonnementer") }
        return p.isEmpty ? "Ny profil" : p.joined(separator: " · ")
    }
}

@MainActor
@Observable
final class Profile37Model {
    static let shared = Profile37Model()

    var profiles: [Profile37] = []
    var meProfile: String = ""
    var locked: Bool = false
    var loaded: Bool = false
    var missing: Bool = false
    /// Steget i koblingen: 0 hvem er du, 1 samtykker, 2 ferdig. finished = videre til resten av onboarding.
    var step: Int = 0
    var finished: Bool = false
    var picked: String = ""
    var newName: String = ""
    var isNew: Bool = false
    var busy: Bool = false
    var error: String = ""
    var linkedName: String = ""
    var cLocation: Bool = true
    var cLists: Bool = true
    var cSubs: Bool = true
    var cCalendars: Bool = true
    var cHealth: Bool = false

    /// Vis koblingssteget: serveren har profiler og brukeren er ikke koblet ennå.
    var needsLink: Bool { loaded && !missing && meProfile.isEmpty && !finished }

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/profiles", timeout: 12)
            let o: [String: Any] = JS.obj(d)
            profiles = JS.list(o, "profiles").map { Profile37($0) }
            meProfile = JS.str(JS.dict(o, "me"), "profileId") ?? ""
            locked = JS.bool(o, "locked") ?? false
            missing = false
            if picked.isEmpty {
                let me: String = (store.account?.username ?? "").lowercased()
                let s: Profile37? = profiles.first { $0.suggested && !$0.linked }
                    ?? profiles.first { !$0.linked && $0.name.lowercased().hasPrefix(me) && !me.isEmpty }
                picked = s?.id ?? ""
            }
        } catch {
            missing = true
        }
        loaded = true
    }

    func link(_ store: Store) {
        if busy { return }
        busy = true
        error = ""
        var body: [String: Any] = ["consents": ["location": cLocation, "lists": cLists, "subs": cSubs, "calendars": cCalendars, "health": cHealth]]
        if isNew { body["newProfileName"] = newName.trimmingCharacters(in: .whitespaces) } else { body["profileId"] = picked }
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/onboarding/link", json: body, timeout: 15)
                let pr: [String: Any] = JS.dict(JS.obj(d), "profile") ?? [:]
                linkedName = JS.str(pr, "name") ?? (isNew ? newName : (profiles.first { $0.id == picked }?.name ?? ""))
                meProfile = JS.str(pr, "id") ?? picked
                Haptics.shared.success()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { step = 2 }
                // Samtykker: posisjon og Apple Health følger av valgene her.
                if cLocation && FamilyModel.shared.sharing != "on" { FamilyModel.shared.setSharing("on", store) }
                if cHealth { HealthSync.shared.enableFromOnboarding(store) }
            } catch let e as APIError {
                error = e.status == 409 ? "Profilen er allerede koblet til en annen bruker." : e.message
                Haptics.shared.error()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

/// Steg 2–4: Hvem er du? → Dette kobles til deg → Ferdig.
struct Profile37LinkView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Profile37Model { Profile37Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch m.step {
            case 0: who
            case 1: consents
            default: done
            }
            if !m.error.isEmpty {
                Text(m.error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /* ---------- Hvem er du? ---------- */

    @ViewBuilder private var who: some View {
        PLabel(text: "Hvem er du?")
        if m.locked {
            Text("Admin kobler brukere til profiler i husstanden. Be admin koble deg, eller fortsett uten profil.")
                .font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            PInkButton(title: "Fortsett", height: 50, full: true) { m.finished = true }
        } else {
            VStack(spacing: 8) {
                ForEach(m.profiles) { (pr: Profile37) in
                    row(pr)
                }
                newRow
            }
            if m.isNew {
                TextField("Navnet ditt", text: Binding<String>(get: { m.newName }, set: { m.newName = $0 }))
                    .font(PF.serif(20)).foregroundStyle(p.ink)
                    .padding(14)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            PInkButton(title: m.isNew ? "Lag profil" : "Dette er meg", height: 50, full: true) {
                Haptics.shared.tap()
                withAnimation(.easeOut(duration: 0.2)) { m.step = 1 }
            }
            .disabled(m.isNew ? m.newName.trimmingCharacters(in: .whitespaces).isEmpty : m.picked.isEmpty)
            .opacity((m.isNew ? m.newName.trimmingCharacters(in: .whitespaces).isEmpty : m.picked.isEmpty) ? 0.5 : 1)
            Button("Hopp over") { m.finished = true }.font(PF.ui(13, .semibold)).foregroundStyle(p.mut).frame(maxWidth: .infinity)
        }
    }

    private func row(_ pr: Profile37) -> some View {
        let on: Bool = !m.isNew && m.picked == pr.id
        return Button {
            if pr.linked { return }
            Haptics.shared.select()
            m.isNew = false
            m.picked = pr.id
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(Color(hex: pr.color))
                    Text(String(pr.name.prefix(1)).uppercased()).font(PF.ui(16, .bold)).foregroundStyle(Color.white)
                }
                .frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(pr.name).font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink)
                        if pr.suggested && !pr.linked { Text("✦ Glimt foreslår").font(PF.ui(11, .bold)).foregroundStyle(p.lab) }
                    }
                    Text(pr.linked ? "Koblet til @" + (pr.username.isEmpty ? "en bruker" : pr.username) : pr.hasText)
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                if on { Text("✓").font(PF.ui(16, .bold)).foregroundStyle(p.ink) }
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? p.ink : Color.clear, lineWidth: 2))
            .opacity(pr.linked ? 0.5 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(pr.linked)
    }

    private var newRow: some View {
        Button {
            Haptics.shared.select()
            m.isNew = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "plus").font(.dyn51(size: 16, weight: .bold)).foregroundStyle(p.ink)
                    .frame(width: 42, height: 42)
                    .overlay(Circle().stroke(p.line, style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])))
                Text("Jeg er ny i husstanden").font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink)
                Spacer(minLength: 6)
                if m.isNew { Text("✓").font(PF.ui(16, .bold)).foregroundStyle(p.ink) }
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(m.isNew ? p.ink : Color.clear, lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /* ---------- Dette kobles til deg ---------- */

    @ViewBuilder private var consents: some View {
        let name: String = m.isNew ? m.newName : (m.profiles.first { $0.id == m.picked }?.name ?? "")
        PLabel(text: "Dette kobles til deg")
        HStack(spacing: 10) {
            Text("@" + (store.account?.username ?? "")).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
            Text("⟷").font(PF.ui(15)).foregroundStyle(p.mut)
            Text(name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        VStack(spacing: 0) {
            toggle("Posisjon og Familie-kart", m.cLocation) { m.cLocation.toggle() }
            Task37Divider()
            toggle("Gjøremål (delte lister)", m.cLists) { m.cLists.toggle() }
            Task37Divider()
            toggle("Delte abonnementer", m.cSubs) { m.cSubs.toggle() }
            Task37Divider()
            toggle("Kalendere", m.cCalendars) { m.cCalendars.toggle() }
            Task37Divider()
            toggle("Apple Health på denne enheten", m.cHealth) { m.cHealth.toggle() }
        }
        .padding(.horizontal, 14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        Text("Du kan endre koblingen senere i Innstillinger → Konto → Profil. Admin får beskjed om nye koblinger.")
            .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 10) {
            PLineButton(title: "Tilbake", height: 50, full: true) { withAnimation(.easeOut(duration: 0.2)) { m.step = 0 } }
            PInkButton(title: m.busy ? "Kobler …" : "Koble og fortsett", height: 50, full: true) { m.link(store) }
        }
    }

    private func toggle(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button {
            Haptics.shared.select()
            act()
        } label: {
            HStack {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer(minLength: 8)
                Pkg37Switch(on: on)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /* ---------- Ferdig ---------- */

    @ViewBuilder private var done: some View {
        let name: String = m.linkedName.isEmpty ? "du" : (m.linkedName.split(separator: " ").first.map(String.init) ?? m.linkedName)
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(hex: m.profiles.first { $0.id == m.picked }?.color ?? "#2b5d8a"))
                Text(String(name.prefix(1)).uppercased()).font(PF.ui(30, .bold)).foregroundStyle(Color.white)
            }
            .frame(width: 88, height: 88)
            .transition(.scale(scale: 0.4).combined(with: .opacity))
            Text("Hei, " + name + "!").font(PF.serif(30, medium: true)).foregroundStyle(p.ink)
            Text("Profilen din er koblet. Glimt, hilsenen og briefen bruker nå profilnavnet ditt.")
                .font(PF.ui(14)).foregroundStyle(p.mut).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        PInkButton(title: "Fortsett", height: 50, full: true) { m.finished = true }
    }
}
