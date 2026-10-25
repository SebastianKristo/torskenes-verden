import SwiftUI

/* ---------------- Prompt 36: Innstillinger → Kalendere → Google Kalender – Hovedkalender og «Vis også i Kalender» ----------------
   Vises når Google er koblet til (BirthdayCalendars24, Birthdays24Home.swift).
   GET /api/kalender/calendars/google → {connected, configured, email, main:{id,name}|null,
       calendars:[{id:'primary'|'<id>', googleId, name, primary, color, writable, access, main, shown, appId}]}
   PUT /api/kalender/calendars/google {main?:'primary'|'<googleId>', show?:[googleId…]} → samme form (400 hvis main ikke er skrivbar).
   Hovedkalender = radioliste (bare skrivbare, primær først, «Personlig · nye hendelser lagres her»).
   Vis også = brytere for de andre, med fargeprikk og «Bare lesing». Mangler endepunktet (eldre server), vises ingenting. */

struct Gcal36Cal: Identifiable, Equatable {
    let id: String
    let googleId: String
    let name: String
    let primary: Bool
    let color: String
    let writable: Bool
    let main: Bool
    let shown: Bool

    /// Verdien som sendes som main / i show.
    var key: String { primary ? "primary" : (googleId.isEmpty ? id : googleId) }
}

@MainActor
@Observable
final class Gcal36Model {
    static let shared = Gcal36Model()

    var loaded: Bool = false
    var missing: Bool = false
    var connected: Bool = false
    var cals: [Gcal36Cal] = []
    var busy: Bool = false
    var error: String = ""

    func load(_ store: Store) async {
        let api: API = store.api
        do {
            let d: Data = try await api.callAt("/api", "GET", "/kalender/calendars/google", timeout: 20)
            missing = false
            apply(d)
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 { missing = true }
        } catch {}
    }

    private func apply(_ d: Data) {
        let o: [String: Any] = JS.obj(d)
        connected = JS.bool(o, "connected") ?? false
        let mainId: String = JS.str(JS.dict(o, "main"), "id") ?? ""
        var out: [Gcal36Cal] = []
        for r in JS.list(o, "calendars") {
            let id: String = JS.str(r, "id") ?? ""
            if id.isEmpty { continue }
            let gid: String = JS.str(r, "googleId") ?? ""
            let prim: Bool = JS.bool(r, "primary") ?? (id == "primary")
            let isMain: Bool = JS.bool(r, "main") ?? (!mainId.isEmpty && (mainId == id || mainId == gid))
            out.append(Gcal36Cal(id: id, googleId: gid, name: JS.str(r, "name") ?? id, primary: prim,
                                 color: JS.str(r, "color") ?? "#4285F4", writable: JS.bool(r, "writable") ?? false,
                                 main: isMain, shown: JS.bool(r, "shown") ?? false))
        }
        cals = out
        loaded = true
    }

    /// Skrivbare, primær først.
    var writable: [Gcal36Cal] {
        let w: [Gcal36Cal] = cals.filter { $0.writable }
        return w.filter { $0.primary } + w.filter { !$0.primary }
    }

    /// De andre (ikke hovedkalenderen).
    var others: [Gcal36Cal] { cals.filter { !$0.main } }

    func setMain(_ c: Gcal36Cal, _ store: Store) {
        if c.main || busy { return }
        Haptics.shared.select()
        put(["main": c.key], store)
    }

    func toggleShow(_ c: Gcal36Cal, _ store: Store) {
        if busy { return }
        Haptics.shared.select()
        var show: [String] = cals.filter { $0.shown && !$0.main }.map { $0.key }
        if c.shown { show.removeAll { $0 == c.key } } else { show.append(c.key) }
        put(["show": show], store)
    }

    private func put(_ body: [String: Any], _ store: Store) {
        busy = true
        error = ""
        let api: API = store.api
        Task { @MainActor in
            defer { Gcal36Model.shared.busy = false }
            do {
                let d: Data = try await api.callAt("/api", "PUT", "/kalender/calendars/google", json: body, timeout: 20)
                Gcal36Model.shared.apply(d)
                Task { await Cal26Model.shared.load(store, force: true) }
            } catch let e as APIError {
                Gcal36Model.shared.error = e.status == 400 ? "Den kalenderen kan ikke brukes som hovedkalender (bare lesing)." : e.message
                Haptics.shared.error()
            } catch {
                Gcal36Model.shared.error = error.localizedDescription
            }
        }
    }
}

/// Seksjonene under Google Kalender når kontoen er koblet til.
struct Gcal36Section: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Gcal36Model { Gcal36Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if m.loaded && !m.missing && !m.cals.isEmpty {
                Text("HOVEDKALENDER").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                VStack(spacing: 0) {
                    ForEach(m.writable) { (c: Gcal36Cal) in
                        Gcal36MainRow(cal: c) { m.setMain(c, store) }
                    }
                }
                if !m.others.isEmpty {
                    Text("VIS OGSÅ I KALENDER").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut).padding(.top, 6)
                    VStack(spacing: 0) {
                        ForEach(m.others) { (c: Gcal36Cal) in
                            Gcal36ShowRow(cal: c) { m.toggleShow(c, store) }
                        }
                    }
                }
                if !m.error.isEmpty {
                    Text(m.error).font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .opacity(m.busy ? 0.6 : 1)
        .task { await m.load(store) }
    }
}

struct Gcal36Dot: View {
    let hex: String

    var body: some View {
        Circle().fill(Color(hex: hex.isEmpty ? "#4285F4" : hex)).frame(width: 12, height: 12)
    }
}

struct Gcal36MainRow: View {
    @Environment(\.paper) private var p
    let cal: Gcal36Cal
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Image(systemName: cal.main ? "largecircle.fill.circle" : "circle")
                    .font(.dyn51(size: 20)).foregroundStyle(cal.main ? p.ink : p.mut)
                Gcal36Dot(hex: cal.color)
                VStack(alignment: .leading, spacing: 2) {
                    Text(cal.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    if cal.primary || cal.main {
                        Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(cal.main ? .isSelected : [])
    }

    private var sub: String {
        if cal.primary && cal.main { return "Personlig · nye hendelser lagres her" }
        if cal.primary { return "Personlig" }
        return "Nye hendelser lagres her"
    }
}

struct Gcal36ShowRow: View {
    @Environment(\.paper) private var p
    let cal: Gcal36Cal
    let act: () -> Void

    var body: some View {
        Toggle(isOn: Binding<Bool>(get: { cal.shown }, set: { (_: Bool) in act() })) {
            HStack(spacing: 12) {
                Gcal36Dot(hex: cal.color)
                VStack(alignment: .leading, spacing: 2) {
                    Text(cal.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    if !cal.writable {
                        Text("Bare lesing").font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                }
            }
        }
        .tint(p.pos)
        .frame(minHeight: 48)
    }
}
