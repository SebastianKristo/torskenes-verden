import SwiftUI

/* ---------------- Prompt 36: Backup – ikoner, kvittering med faktisk sti og verifisering ----------------
   prompts/prompt-36-pakke/claude-code-backup-nettverksdisk-fiks.md (G) og claude-code-innstillinger-ikoner.md.
   Kvitteringen under «Siste backup»: «✓ 2,4 GB · smb://truenas.local/backup/homelab/homelab-2026-10-19_2130-hele.tar.zst ·
   verifisert» med «Åpne mappe ›». Serveren (SERVER36) lagrer {target, fullPath, method, bytes, sha256, verified, …} per kjøring
   og sender det i GET /api/backup/list og statusen. Status OK vises bare når kjøringen er verifisert. */

enum Backup36Icons {
    static func module(_ id: String) -> String {
        switch id {
        case "finans": return "creditcard"
        case "kalender": return "calendar"
        case "familie": return "person.2"
        case "mat": return "fork.knife"
        case "sporing": return "shippingbox"
        case "huske": return "checklist"
        case "bursdager": return "gift"
        case "chat": return "bubble.left.and.bubble.right"
        case "domener": return "globe"
        case "innstillinger": return "gearshape"
        case "filer": return "photo.on.rectangle"
        default: return "square.stack.3d.up"
        }
    }
}

/// Kvitteringen for siste kjøring (bare når serveren sender fullPath).
struct Backup36Receipt: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Backup29Model { Backup29Model.shared }

    var body: some View {
        if let l = m.last ?? m.list.first, !l.fullPath.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 10) {
                    Set36Chip(symbol: icon(l), tint: color(l))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(head(l)).font(PF.ui(13.5, .bold)).foregroundStyle(color(l))
                        Text(l.fullPath).font(PF.mono(11.5, bold: false)).foregroundStyle(p.ink)
                            .lineLimit(3).textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                        if !l.ok && !l.error.isEmpty {
                            Text(l.error).font(PF.ui(12.5)).foregroundStyle(Set36Tint.bad).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                if l.fullPath.hasPrefix("smb://") {
                    Button { m.openSmb(store) } label: {
                        Text("Åpne mappe ›").font(PF.ui(13, .bold)).foregroundStyle(p.lab).frame(minHeight: 32).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, 44)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.top, 8)
        }
    }

    private func ok(_ l: Backup29Entry) -> Bool { l.ok && (l.verified ?? true) }
    private func icon(_ l: Backup29Entry) -> String { ok(l) ? "checkmark.seal" : "exclamationmark.triangle" }
    private func color(_ l: Backup29Entry) -> Color { ok(l) ? Set36Tint.ok : Set36Tint.bad }

    /// «✓ 2,4 GB · verifisert» / «Feilet · ikke verifisert».
    private func head(_ l: Backup29Entry) -> String {
        if !l.ok { return "Feilet" }
        if l.verified == false { return "Feilet · filen kunne ikke verifiseres" }
        var s: String = "✓ " + Backup29Model.size(l.size)
        if l.verified == true { s += " · verifisert" }
        if !l.method.isEmpty { s += " · " + l.method }
        return s
    }
}
