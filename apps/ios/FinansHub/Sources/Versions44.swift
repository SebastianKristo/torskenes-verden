import SwiftUI

/* ---------------- Prompt 44: System → TIDLIGERE VERSJONER (rull tilbake) ----------------
 Fasit: design/Tidligere Versjoner.dc.html (mobil) og claude-code-rull-tilbake-versjon.md. Plassering: System-siden, rett
 under «Krev Face ID eller passord» og «Oppdateringen gjøres av updater-containeren …», over «Dette er Nordlys …»/NYTT I.
 GET /api/update/versions → [{version, date, notes, hasBackup, dbSchema, compatible, current, previous}] (fra updaterens
 egen liste – serveren sender aldri repo/branch/sha). POST /api/update/rollback {version, restoreBackup, pauseAutoDays,
 reauthToken|password} → samme fremdrift og oppstartsskjerm som «Oppdater nå». «Krev passord» gjelder også her.
 Bunnark: «Gå tilbake til Nordlys 4.37?», Behold dataene mine (bare når databasen er kompatibel) / Gjenopprett backup fra …,
 «Slå av automatiske oppdateringer i 7 dager» (på), «Installer 4.37» (rød). Bare admin eller eier. */

struct Version44: Identifiable, Hashable {
    var id: String { version }
    var version: String
    var date: Date? = nil
    var note: String = ""
    var hasBackup: Bool = false
    var backupAt: Date? = nil
    var compatible: Bool = true
    var current: Bool = false
    var previous: Bool = false
    var reason: String = ""
}

@MainActor
@Observable
final class Versions44 {
    static let shared = Versions44()

    var list: [Version44] = []
    var available: Bool = false
    var loaded: Bool = false
    var sheet: Version44? = nil
    var installing: String = ""
    var done: String = ""

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/update/versions", timeout: 15)
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            if rows.isEmpty { rows = JS.list(any as? [String: Any], "versions") + JS.list(any as? [String: Any], "items") }
            list = Array(rows.map { Versions44.parse($0) }.prefix(10))
            available = !list.isEmpty
        } catch {
            available = false
        }
        loaded = true
    }

    nonisolated static func parse(_ r: [String: Any]) -> Version44 {
        var v: Version44 = Version44(version: JS.str(r, "version") ?? JS.str(r, "tag") ?? "?")
        v.date = JS.date(r["date"] ?? r["publishedAt"])
        let notes: [String] = JS.strings(r, "notes")
        v.note = notes.first ?? JS.str(r, "notes") ?? JS.str(r, "note") ?? ""
        v.hasBackup = JS.bool(r, "hasBackup") ?? false
        let bk: [String: Any]? = JS.dict(r, "backup")
        v.backupAt = JS.date(r["backupAt"]) ?? JS.date(bk?["at"])
        v.compatible = JS.bool(r, "compatible") ?? true
        v.current = JS.bool(r, "current") ?? false
        v.previous = JS.bool(r, "previous") ?? false
        v.reason = JS.str(r, "reason") ?? JS.str(r, "compatibleText") ?? ""
        return v
    }

    /// Face ID → lagret passord → reauth-token. nil = passord fra arket (eller ingen krav).
    func install(_ v: Version44, restore: Bool, pause: Bool, password: String, _ store: Store) async -> String? {
        let u: Update30Model = Update30Model.shared
        var body: [String: Any] = ["version": v.version, "restoreBackup": restore, "pauseAutoDays": pause ? 7 : 0]
        if u.requirePassword {
            if !password.isEmpty {
                body["password"] = password
            } else if let pw = Keychain.get(System31Auth.key(store)), !pw.isEmpty, !System31Auth.biometryName.isEmpty {
                guard await System31Auth.evaluate("Bekreft at du går tilbake til Nordlys \(v.version)") else { return "Avbrutt" }
                guard let tok = await System31Auth.reauth(pw, store) else { return "Skriv passordet ditt" }
                body["reauthToken"] = tok
            } else {
                return "Skriv passordet ditt"
            }
        }
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/update/rollback", json: body, timeout: 60)
            let o: [String: Any] = JS.obj(d)
            Haptics.shared.success()
            installing = v.version
            sheet = nil
            u.beginExternal44(JS.str(o, "id") ?? JS.str(o, "jobId") ?? "", target: v.version, store)
            return nil
        } catch let e as APIError {
            Haptics.shared.error()
            if e.status == 401 || e.status == 403 { return e.message.isEmpty ? "Skriv passordet ditt" : e.message }
            return e.message
        } catch {
            return error.localizedDescription
        }
    }
}

/// Seksjonen på System-siden.
struct Versions44Section: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Versions44 { Versions44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if m.available {
                VStack(spacing: 6) {
                    Text("TIDLIGERE VERSJONER").font(PF.mono(11)).tracking(1.2).foregroundStyle(p.lab)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Rectangle().fill(p.lab).frame(height: 1)
                }
                .padding(.top, 10).padding(.horizontal, 4)
                Versions44Running()
                Versions44List(list: m.list)
            }
        }
        .task { await m.load(store) }
        .sheet(item: Binding<Version44?>(get: { m.sheet }, set: { m.sheet = $0 })) { (v: Version44) in
            Versions44Sheet(v: v)
                .environment(\.paper, p)
                .environment(store)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .sheetEdge30(p.bg)
        }
    }
}

/// «Går tilbake til 4.37» mens det pågår.
struct Versions44Running: View {
    @Environment(\.paper) private var p
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        if !u.rollbackTarget44.isEmpty && u.phase == .run {
            HStack(spacing: 8) {
                ProgressView()
                Text("Går tilbake til " + u.rollbackTarget44 + " · \(u.pct) %").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
            }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

struct Versions44List: View {
    @Environment(\.paper) private var p
    let list: [Version44]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Version44)) in
                if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Versions44Row(v: pair.element)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct Versions44Row: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Versions44 { Versions44.shared }
    let v: Version44

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(v.version).font(PF.mono(14)).foregroundStyle(p.ink)
                    if v.previous { Versions44Tag(text: "Forrige", color: p.ink) }
                    if v.hasBackup { Versions44Tag(text: "Har backup", color: Color(hex: "#2f6b4a")) }
                }
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(minHeight: 60)
    }

    private var sub: String {
        let d: String = v.date.map { JS.fmt($0, "d. MMM yyyy") } ?? ""
        return [d, v.note].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    @ViewBuilder private var trailing: some View {
        if v.current {
            Text("Kjører nå").font(PF.ui(12.5, .bold)).foregroundStyle(Color(hex: "#2f7d4f"))
        } else {
            Button { Haptics.shared.tap(); m.sheet = v } label: {
                Text("Installer").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 14).frame(height: 34)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    .frame(minHeight: 44).contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

struct Versions44Tag: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text).font(PF.ui(10.5, .bold)).foregroundStyle(color)
            .padding(.horizontal, 7).frame(height: 20)
            .background(color.opacity(0.1), in: Capsule())
    }
}

/// Bunnarket: Behold dataene mine / Gjenopprett backup, pause 7 dager, «Installer 4.37».
struct Versions44Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let v: Version44
    @State private var restore: Bool = false
    @State private var pause: Bool = true
    @State private var password: String = ""
    @State private var askPw: Bool = false
    @State private var error: String = ""
    @State private var busy: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader30(title: "Gå tilbake til " + v.version + "?", closeTitle: "Avbryt", closeKind: .secondary) { Versions44.shared.sheet = nil }
                Versions44Choice(title: "Behold dataene mine", sub: keepSub, on: !restore, enabled: v.compatible) { restore = false }
                if v.hasBackup { Versions44Choice(title: backupTitle, sub: "Data tilbake til slik de var før oppdateringen. Endringer etter det forsvinner.", on: restore, enabled: true) { restore = true } }
                Toggle(isOn: $pause) {
                    Text("Slå av automatiske oppdateringer i 7 dager").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                }
                .tint(Color(hex: "#2f7d4f"))
                if askPw { Konto44Field(placeholder: "Passordet ditt", text: $password, secure: true) }
                if !error.isEmpty { Text(error).font(PF.ui(13)).foregroundStyle(p.lab) }
                installButton
            }
            .padding(20)
        }
        .onAppear { restore = !v.compatible && v.hasBackup }
    }

    private var keepSub: String {
        if v.compatible { return "Bare koden byttes." }
        if !v.reason.isEmpty { return v.reason }
        return "Databasen er endret siden \(v.version). Du må gjenopprette backupen."
    }

    private var backupTitle: String {
        guard let d = v.backupAt else { return "Gjenopprett backup" }
        return "Gjenopprett backup fra " + JS.fmt(d, "d. MMM HH:mm")
    }

    private var installButton: some View {
        Button { go() } label: {
            Text(busy ? "Starter …" : "Installer " + v.version).font(PF.ui(16, .bold)).foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Color(hex: "#b23a2a").opacity(canGo ? 1 : 0.35), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!canGo || busy)
    }

    private var canGo: Bool { v.compatible || restore }

    private func go() {
        busy = true
        error = ""
        Task { @MainActor in
            defer { busy = false }
            if let e = await Versions44.shared.install(v, restore: restore, pause: pause, password: password, store) {
                if e == "Skriv passordet ditt" { askPw = true }
                if e != "Avbrutt" { error = e }
            }
        }
    }
}

struct Versions44Choice: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let on: Bool
    let enabled: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: on ? "largecircle.fill.circle" : "circle").font(.dyn51(size: 20)).foregroundStyle(on ? Color(hex: "#b23a2a") : p.mut)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? Color(hex: "#b23a2a") : Color.clear, lineWidth: 1.5))
            .opacity(enabled ? 1 : 0.5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}
