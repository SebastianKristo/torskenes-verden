import SwiftUI
import UIKit

/* ---------------- Prompt 29: siden Innstillinger → Konto → Backup ---------------- */
// Seksjonene STATUS · AUTOMATISK · HVA SKAL TAS MED · HVOR · GJENOPPRETT (Backup29Model.swift).

struct Backup29Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !Backup29Model.isAdmin(store) {
                Backup29Note(text: "Backup av hele systemet styres av en administrator.")
            } else if m.missing {
                PaperLinkList(rows: [
                    PaperLinkRow(name: "Systembackup", sub: "Serveren har ikke denne funksjonen ennå. Oppdater homelab-serveren.", value: "Ikke tilgjengelig", valueColor: p.mut, icon: "externaldrive") {},
                ])
            } else if !m.loaded {
                PaperLinkList(rows: [
                    PaperLinkRow(name: "Backup", sub: m.error.isEmpty ? "Henter fra serveren" : m.error, value: m.loading ? "Laster …" : "Prøv igjen ›", icon: "externaldrive") {
                        Task { await m.load(store) }
                    },
                ])
            } else {
                if m.needsWeb { Backup29WebNote() }
                Backup29Status()
                Backup29Auto()
                Backup29What()
                Backup29Where()
                Backup29Restore()
            }
        }
        .task { if Backup29Model.isAdmin(store) { await m.load(store) } }
        .sheet(item: Binding<Backup29Entry?>(get: { m.restoring }, set: { m.restoring = $0 })) { e in
            Backup29RestoreSheet(entry: e)
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(p.bg)
        }
        .alert("Gjenopprettingsnøkkel", isPresented: Binding<Bool>(get: { m.newKey != nil }, set: { if !$0 { m.newKey = nil } })) {
            Button("Kopier") { UIPasteboard.general.string = m.newKey; m.newKey = nil }
            Button("Ferdig", role: .cancel) { m.newKey = nil }
        } message: {
            Text((m.newKey ?? "") + "\n\nLagre nøkkelen et trygt sted. Den vises bare denne ene gangen, og trengs for å lese krypterte backuper.")
        }
    }
}

struct Backup29Note: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.ui(12.5)).foregroundStyle(p.mut).padding(.horizontal, 4).padding(.top, 6)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct Backup29WebNote: View {
    @Environment(Store.self) private var store

    var body: some View {
        PaperLinkList(rows: [
            PaperLinkRow(name: "Endre i nettleseren", sub: "Serveren krever innlogging i nettleseren for å endre backup", value: "Åpne ›", icon: "safari") {
                store.openURL(Backup29Model.webURL(store))
            },
        ])
    }
}

/* ---------- STATUS ---------- */

struct Backup29Status: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Status").padding(.top, 12).padding(.leading, 4)
            PaperLinkList(rows: [lastRow, runRow])
            // Prompt 36: faktisk sti og verifisering (Backup36.swift).
            Backup36Receipt()
        }
    }

    private var lastRow: PaperLinkRow {
        guard let l = m.last ?? m.list.first else {
            return PaperLinkRow(name: "Siste backup", sub: "Ingen backup ennå", value: "–", icon: "checkmark.circle", tint30: Color(hex: "#8a8478")) {}
        }
        let sub: String = Backup29Model.when(l.at) + " · " + Backup29Model.size(l.size) + " · " + Backup29Model.scopeName(l)
        let value: String = l.ok && l.verified != false ? "✓ OK" : "Feilet"
        return PaperLinkRow(name: "Siste backup", sub: l.ok ? sub : sub + "\n" + l.error, value: value, valueColor: l.ok ? p.pos : p.lab, icon: l.ok ? "checkmark.circle" : "exclamationmark.triangle", tint30: l.ok ? Set36Tint.ok : Set36Tint.bad) {}
    }

    private var runRow: PaperLinkRow {
        if let pct = m.runPct {
            return PaperLinkRow(name: "Tar backup … \(pct) %", sub: "Du kan lukke appen, den fortsetter i bakgrunnen", value: "", icon: "arrow.triangle.2.circlepath", tint30: Set30Colors.backup) {}
        }
        let sub: String = Backup29Model.name(Backup29Model.scopes, m.scope)
        return PaperLinkRow(name: "Ta backup nå", sub: sub, value: "Start ›", valueColor: p.lab, icon: "play.fill", tint30: Set30Colors.backup) { m.run(store) }
    }
}

/* ---------- AUTOMATISK ---------- */

struct Backup29Auto: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Automatisk").padding(.top, 12).padding(.leading, 4)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    Backup29Toggle(title: "Automatisk backup", sub: "Kjører i bakgrunnen på hjemmeserveren", on: m.auto, icon: "calendar.badge.clock") { m.setAuto($0, store) }
                    if m.auto {
                        Backup29Sep()
                        Backup29Cycle(title: "Hvor ofte", sub: Backup29Model.name(Backup29Model.schedules, m.schedule), icon: "repeat") { m.nextSchedule(store) }
                        Backup29Sep()
                        Backup29Cycle(title: "Behold", sub: Backup29Model.name(Backup29Model.keeps, m.keep) + " · eldre slettes automatisk", icon: "archivebox") { m.nextKeep(store) }
                        Backup29Sep()
                        Backup29Toggle(title: "Varsle meg", sub: "Når backup feiler (push og e-post)", on: m.notifyFail, icon: "bell.badge") { m.setNotify($0, store) }
                    }
                }
            }
            .padding(.top, 8)
        }
    }
}

/* ---------- HVA SKAL TAS MED ---------- */

struct Backup29What: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Hva skal tas med").padding(.top, 12).padding(.leading, 4)
            PaperLinkList(rows: rows)
        }
    }

    private var scopeSub: String {
        if m.scope == "all" { return "Alle moduler, filer og innstillinger" }
        if m.scope == "finans" { return "Kun Finans-data og kvitteringer" }
        return "Velg moduler under"
    }

    private var rows: [PaperLinkRow] {
        let first = PaperLinkRow(name: "Omfang", sub: scopeSub, value: Backup29Model.name(Backup29Model.scopes, m.scope) + " ›", valueColor: p.ink, icon: "checklist", tint30: Set30Colors.backup) {
            m.nextScope(store)
        }
        var out: [PaperLinkRow] = [first]
        for mod in Backup29Model.modules {
            out.append(moduleRow(mod.0, mod.1, mod.2))
        }
        return out
    }

    private func moduleRow(_ id: String, _ name: String, _ sub: String) -> PaperLinkRow {
        let inc: Bool = m.includes(id)
        let custom: Bool = m.scope == "custom"
        return PaperLinkRow(name: name, sub: sub, value: inc ? "✓ Med" : "Ikke med", valueColor: inc ? p.pos : p.mut, icon: Backup36Icons.module(id)) {
            if custom { m.toggleModule(id, store) } else { store.flash("Velg «Egendefinert» for å velge moduler") }
        }
    }
}

/* ---------- HVOR ---------- */

struct Backup29Where: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Hvor").padding(.top, 12).padding(.leading, 4)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    Backup29Cycle(title: "Lagres på", sub: "Homelab-disk · " + m.path, value: "Lokal", icon: "internaldrive") {}
                    Backup29Sep()
                    if m.smbKnown { Backup29Smb() }
                    Backup29Toggle(title: "Kopi til sky", sub: cloudSub, on: m.cloudOn, icon: "icloud") { m.setCloud($0, store) }
                    Backup29Sep()
                    Backup29Cycle(title: "Skytjeneste", sub: m.cloudSupported ? "Kryptert før opplasting" : "Kommer", value: m.providerName + " ›", icon: "cloud") { m.nextProvider(store) }
                    Backup29Sep()
                    Backup29Toggle(title: "Krypter backup", sub: "AES-256 · nøkkel lagres hos deg", on: m.encrypt, icon: "lock.shield") { m.setEncrypt($0, store) }
                    if m.encrypt {
                        Backup29Sep()
                        Backup29Cycle(title: "Gjenopprettingsnøkkel", sub: m.keySet ? "Laget · vises bare én gang" : "Ikke laget ennå", value: m.keySet ? "Ny nøkkel ›" : "Lag ›", icon: "key") { m.makeKey(store) }
                    }
                }
            }
            .padding(.top, 8)
        }
    }

    private var cloudSub: String {
        let base: String = m.providerName + " · kryptert før opplasting"
        return m.encrypt ? base : base + " · krever kryptering"
    }
}

/// Prompt 30: HVOR → SMB / nettverksdisk. Veiviseren åpnes som ark (Smb30Sheet).
struct Backup29Smb: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }
    @MainActor private var w: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            if m.smbShare.isEmpty {
                Backup29Cycle(title: "SMB / nettverksdisk", sub: "Kopier hver backup til en NAS på hjemmenettet", value: "Sett opp ›", icon: "server.rack") { m.openSmb(store) }
            } else {
                Backup29Toggle(title: "Kopi til nettverksdisk", sub: m.smbSub, on: m.smbOn, icon: "server.rack") { m.setSmb($0, store) }
                Backup29Sep()
                Backup29Cycle(title: "Sett opp nettverksdisk", sub: "Bytt server, bruker eller mappe", value: "Veiviser ›", icon: "folder.badge.gearshape") { m.openSmb(store) }
                if m.smbOn && !m.encrypt {
                    Backup29Sep()
                    Backup29Note(text: "Kopieres ukryptert. Greit på eget hjemmenett, men «Krypter backup» anbefales.").padding(.horizontal, 10).padding(.bottom, 8)
                }
            }
            Backup29Sep()
        }
        .sheet(isPresented: Binding<Bool>(get: { w.open }, set: { if !$0 { w.close() } })) {
            Smb30Sheet()
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(p.bg)
        }
    }
}

/* ---------- GJENOPPRETT ---------- */

struct Backup29Restore: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: "Gjenopprett").padding(.top, 12).padding(.leading, 4)
            PaperLinkList(rows: rows)
        }
    }

    private var rows: [PaperLinkRow] {
        var out: [PaperLinkRow] = []
        for e in m.list.prefix(8) { out.append(entryRow(e)) }
        if out.isEmpty {
            out.append(PaperLinkRow(name: "Ingen backuper ennå", sub: "Ta en backup for å kunne gjenopprette", value: "", icon: "arrow.counterclockwise", tint30: Color(hex: "#8a8478")) {})
        }
        if let first = m.list.first(where: { $0.ok }) {
            let sub: String = (first.encrypted ? "Kryptert · " : "") + Backup29Model.size(first.size) + " · åpnes i nettleseren"
            out.append(PaperLinkRow(name: "Last ned siste backup", sub: sub, value: "Last ned ›", valueColor: p.ink, icon: "arrow.down.circle", tint30: Set30Colors.backup) {
                store.openURL(Backup29Model.downloadURL(first, store))
            })
        }
        return out
    }

    private func entryRow(_ e: Backup29Entry) -> PaperLinkRow {
        let name: String = JS.fmt(e.at, "dd.MM HH:mm")
        let sub: String = Backup29Model.size(e.size) + " · " + Backup29Model.scopeName(e) + (e.ok ? "" : " · feilet")
        return PaperLinkRow(name: name.isEmpty ? e.id : name, sub: sub, value: e.ok ? "Gjenopprett ›" : "Feilet", valueColor: e.ok ? p.lab : p.mut,
                            icon: e.ok ? "arrow.counterclockwise" : "exclamationmark.triangle", tint30: e.ok ? Set30Colors.backup : Set36Tint.bad) {
            if e.ok { m.restoring = e }
        }
    }
}

/* ---------- Bekreftelse ---------- */

struct Backup29RestoreSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let entry: Backup29Entry
    @State private var all: Bool = true
    @State private var picked: Set<String> = []
    @State private var password: String = ""
    @State private var busy: Bool = false
    @State private var error: String = ""

    private var available: [(String, String, String)] {
        if entry.scope == "all" || entry.modules.isEmpty { return Backup29Model.modules }
        return Backup29Model.modules.filter { entry.modules.contains($0.0) }
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("GJENOPPRETT").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    Text(Backup29Model.when(entry.at)).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                    Text(Backup29Model.size(entry.size) + " · " + Backup29Model.scopeName(entry)).font(PF.ui(13)).foregroundStyle(p.mut)
                }
                PCard(padding: 0) {
                    VStack(spacing: 0) {
                        Backup29Toggle(title: "Hele backupen", sub: "Alle modulene i denne backupen", on: all) { all = $0 }
                        if !all {
                            ForEach(available, id: \.0) { mod in
                                Backup29Sep()
                                Backup29Toggle(title: mod.1, sub: mod.2, on: picked.contains(mod.0)) { v in pick(mod.0, v) }
                            }
                        }
                    }
                }
                Text("Nåværende data i valgte moduler overskrives. Serveren tar automatisk en sikkerhetskopi først.")
                    .font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                SecureField("Passordet ditt", text: $password)
                    .font(PF.ui(15))
                    .textContentType(.password)
                    .padding(.horizontal, 14).frame(height: 48)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if !error.isEmpty {
                    Text(error).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                }
                Button { go() } label: {
                    Text(busy ? "Gjenoppretter …" : "Gjenopprett").font(PF.ui(16, .bold)).foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(p.lab, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .opacity(canGo ? 1 : 0.45)
                }
                .buttonStyle(.plain)
                .disabled(!canGo)
                Button { Backup29Model.shared.restoring = nil } label: {
                    Text("Avbryt").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 24)
        }
    }

    private func pick(_ id: String, _ on: Bool) {
        if on {
            picked.insert(id)
        } else {
            picked.remove(id)
        }
    }

    private var canGo: Bool { !busy && !password.isEmpty && (all || !picked.isEmpty) }

    private func go() {
        busy = true
        error = ""
        let mods: [String] = all ? [] : available.map { $0.0 }.filter { picked.contains($0) }
        let pw: String = password
        Task {
            let r: String? = await Backup29Model.shared.restore(entry, modules: mods, password: pw, store)
            busy = false
            if let r { error = r; Haptics.shared.error() } else { Haptics.shared.success() }
        }
    }
}

/* ---------- Rader ---------- */

struct Backup29Sep: View {
    @Environment(\.paper) private var p
    var body: some View { Rectangle().fill(p.line).frame(height: 1) }
}

struct Backup29Toggle: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let on: Bool
    /// Prompt 36: ikonbrikke (Settings36.swift).
    var icon: String? = nil
    var tint: Color = Set30Colors.backup
    let set: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding<Bool>(get: { on }, set: { v in set(v) })) {
            HStack(spacing: 14) {
                if let icon { Set36Chip(symbol: icon, tint: tint) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    if !sub.isEmpty {
                        Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }
}

struct Backup29Cycle: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    var value: String = "Endre ›"
    /// Prompt 36: ikonbrikke (Settings36.swift).
    var icon: String? = nil
    var tint: Color = Set30Colors.backup
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 10) {
                if let icon { Set36Chip(symbol: icon, tint: tint).padding(.trailing, 4) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                Spacer(minLength: 6)
                Text(value).font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
