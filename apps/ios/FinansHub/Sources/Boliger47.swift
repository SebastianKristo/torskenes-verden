import SwiftUI

// ---------------- Prompt 47: Boliger (mobil) uten «Fra e-post» og uten fanen «Tilgang» ----------------
// Spesifikasjon: prompts/prompt-47-pakke/claude-code-boliger-mobil-uten-epost-tilgang.md. Fasit: design/Boliger.dc.html.
// – Handlingene er tre like fliser: Skann, Last opp, Ny utgift (e-postimport finnes fortsatt på web).
// – Fanene er bare «Oversikt» og «Utgifter · N». Tilgang åpnes fra raden «Delt med N» i «Rediger bolig»
//   (arket lukkes og Tilgang-siden vises med «‹ Oversikt» øverst).
// – Raden «Delt med N» er fjernet fra Oversikt.

/// Raden «Delt med N» i «Rediger bolig» (avatarer + «Tilgang · hvem som kan se og laste opp ›»).
struct Bol47SharedRow: View {
    @Environment(\.paper) private var p
    let home: Bol24Home
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                avatars
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text("Tilgang · hvem som kan se og laste opp").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                .padding(.leading, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(p.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner Tilgang")
    }

    private var title: String {
        let n: Int = home.members.count
        return "Delt med \(n) " + (n == 1 ? "person" : "personer")
    }

    private var avatars: some View {
        let mem: [Bol24Member] = home.members
        return HStack(spacing: -8) {
            ForEach(Array(mem.prefix(4).enumerated()), id: \.offset) { (i: Int, u: Bol24Member) in
                Text(String(u.name.prefix(2)).uppercased()).font(PF.ui(12, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color(hex: Bol24Pal.colors[(i + 1) % Bol24Pal.colors.count])))
                    .overlay(Circle().strokeBorder(p.card, lineWidth: 2))
            }
        }
    }
}

/// Tilgang-siden med «‹ Oversikt» øverst (ikke lenger en egen fane).
struct Bol47AccessPage: View {
    @Environment(\.paper) private var p
    let home: Bol24Home
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                Haptics.shared.select()
                m.tab = "ov"
            } label: {
                Text("‹ Oversikt").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 16).frame(height: 40)
                    .background(Capsule().fill(p.card))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Bol24Access(home: home)
        }
    }
}
