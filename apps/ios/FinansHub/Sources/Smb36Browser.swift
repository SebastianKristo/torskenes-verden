import SwiftUI

/* ---------------- Prompt 36: Backup → nettverksdisk – mappeleser med undermapper ----------------
   prompts/prompt-36-pakke/claude-code-backup-nettverksdisk-fiks.md (B, D og E).
   Trykk på en mappe ÅPNER den (velges ikke). Hver rad har egen «Velg», og øverst står «Bruk denne mappen» for mappen man
   står i, vist som smb://host/share/sti. Brødsmulesti (trykk hopper opp), ‹ Opp, + Ny mappe (POST /smb/mkdir →
   {ok, path, writable}), Skriv sti manuelt og Vis skjulte. Mapper uten tilgang vises med lås og «Ingen tilgang for {bruker}».
   Tomme mapper: «Tom mappe». Lagret mål er share + full understi (Smb30Model.target → {host, share, path}). */

struct Smb36Dir: Identifiable, Equatable {
    let name: String
    let display: String
    let locked: Bool
    let hidden: Bool
    let reason: String
    var id: String { name }

    static func from(_ o: [String: Any]) -> Smb36Dir? {
        guard let n = JS.str(o, "name"), !n.isEmpty else { return nil }
        if let t = JS.str(o, "type"), t != "dir" && t != "link" && t != "folder" { return nil }
        return Smb36Dir(name: n, display: JS.str(o, "display") ?? n, locked: JS.bool(o, "locked") ?? false,
                        hidden: JS.bool(o, "hidden") ?? false, reason: JS.str(o, "reason") ?? JS.str(o, "code") ?? "")
    }

    /// «//nas/backup/homelab» → «smb://nas/backup/homelab».
    static func smb(_ s: String) -> String {
        if s.hasPrefix("smb://") { return s }
        if s.hasPrefix("//") { return "smb:" + s }
        return s
    }
}

struct Smb36Folders: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Smb36Current()
            Smb30Crumbs()
            HStack(spacing: 8) {
                Smb30Mini(title: "‹ Opp", enabled: !m.path.isEmpty && !m.busy) {
                    m.mkdirNote = ""
                    let up: [String] = Array(m.path.dropLast())
                    Task { await m.openDir(up, store) }
                }
                Smb30Mini(title: "+ Ny mappe", enabled: !m.busy) { m.showNewDir.toggle() }
                Smb30Mini(title: "Skriv sti", enabled: !m.busy) { m.showManual.toggle() }
            }
            if m.showNewDir { Smb30NewDir() }
            if m.showManual { Smb36Manual() }
            if !m.mkdirNote.isEmpty {
                Text(m.mkdirNote).font(PF.ui(13, .semibold)).foregroundStyle(m.mkdirNote.hasPrefix("✓") ? p.pos : p.lab)
            }
            Toggle(isOn: Binding<Bool>(get: { m.showHidden }, set: { (v: Bool) in
                m.showHidden = v
                let cur: [String] = m.path
                Task { await m.openDir(cur, store) }
            })) {
                Text("Vis skjulte").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
            }
            .tint(p.pos)
            Smb30List { rows }
            if !m.listHint.isEmpty {
                Text(m.listHint).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .simultaneousGesture(DragGesture(minimumDistance: 30).onEnded { (v: DragGesture.Value) in
            // Sveip mot høyre går ett nivå opp.
            if v.translation.width > 80 && abs(v.translation.height) < 60 && !m.path.isEmpty && !m.busy {
                let up: [String] = Array(m.path.dropLast())
                Task { await m.openDir(up, store) }
            }
        })
    }

    @ViewBuilder private var rows: some View {
        if m.busy && m.dirs == nil {
            Smb30Wait(text: "Henter mapper …")
        } else if m.busy {
            Smb30Wait(text: "Åpner …")
        } else if m.dirs36.isEmpty {
            Smb30Empty(text: "Tom mappe. Bruk denne mappen, eller lag en ny.")
        } else {
            ForEach(m.dirs36) { (d: Smb36Dir) in
                Smb36DirRow(dir: d, who: m.guest ? "gjest" : m.user)
            }
        }
    }
}

/// «Bruk denne mappen» øverst: smb://host/share/sti.
struct Smb36Current: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "folder.fill").font(.system(size: 18)).foregroundStyle(Color(hex: "#2b5d8a"))
            VStack(alignment: .leading, spacing: 2) {
                Text("DU STÅR I").font(PF.mono(10)).tracking(1.1).foregroundStyle(p.mut)
                Text(m.label).font(PF.mono(12.5, bold: false)).foregroundStyle(p.ink).lineLimit(2).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { Haptics.shared.select(); m.go(4) } label: {
                Text("Bruk denne").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 14).frame(height: 36)
                    .background(p.ink, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(m.busy)
        }
        .padding(12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct Smb36DirRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }
    let dir: Smb36Dir
    let who: String

    var body: some View {
        HStack(spacing: 12) {
            Button { open() } label: {
                HStack(spacing: 12) {
                    Image(systemName: dir.locked ? "lock.fill" : "folder").font(.system(size: 17))
                        .foregroundStyle(dir.locked ? p.mut : Color(hex: "#2b5d8a"))
                        .frame(width: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(dir.display).font(PF.ui(16, .semibold)).foregroundStyle(dir.hidden ? p.mut : p.ink)
                            .multilineTextAlignment(.leading)
                        if dir.locked {
                            Text("Ingen tilgang for " + who).font(PF.ui(12.5)).foregroundStyle(p.lab)
                        }
                    }
                    Spacer(minLength: 6)
                    if !dir.locked {
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(p.mut)
                    }
                }
                .frame(minHeight: 56)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if !dir.locked {
                Button { pick() } label: {
                    Text("Velg").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 12).frame(height: 32)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Velg " + dir.display)
            }
        }
        .padding(.horizontal, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }

    private func open() {
        if dir.locked {
            store.flash("Gi brukeren \(who) lese- og skrivetilgang til mappen i NAS-ens innstillinger.")
            return
        }
        Haptics.shared.tap()
        m.mkdirNote = ""
        let next: [String] = m.path + [dir.name]
        Task { await m.openDir(next, store) }
    }

    /// «Velg» på raden: velger undermappen uten å åpne den.
    private func pick() {
        Haptics.shared.select()
        let next: [String] = m.path + [dir.name]
        Task {
            await m.openDir(next, store)
            if m.error == nil { m.go(4) }
        }
    }
}

/// «Skriv sti manuelt» (f.eks. /backup/homelab) – for mapper som skjules av NAS-en (Access-Based Enumeration).
struct Smb36Manual: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Smb30Field(title: "Sti i " + m.share, placeholder: "/homelab/2026", text: Binding<String>(get: { m.manualPath }, set: { m.manualPath = $0 }))
            Smb30Primary(title: "Gå til mappen", enabled: !m.busy) {
                let parts: [String] = m.manualPath.split(separator: "/").map { String($0) }.filter { !$0.isEmpty && $0 != "." && $0 != ".." }
                m.showManual = false
                Task { await m.openDir(parts, store) }
            }
        }
    }
}
