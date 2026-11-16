import SwiftUI

/* ---------------- Q34 (E-B12): «Slå sammen kalenderne: 6 → 4?» i Kalender på iPhone og iPad (og i Homelab) ---------------- */
// Serveren rydder ikke kalenderne av seg selv. Er det noe å flytte, sender GET /api/kalender/calendars migration.proposed
// {from, to, moved}, og forslaget vises over kalenderen og i Kalendere – som på web. «Slå sammen» → POST …/migration
// (svaret har migration.done, og «Vi ryddet kalenderne … Angre» vises som før, i 30 dager). «Ikke nå» skjuler forslaget på
// denne enheten. Ingenting endres uten ja.

extension KalStore {
    static let mergeSeenKey: String = "kal.mig34"

    func acceptMerge() {
        if merging { return }
        KalHaptic.tap()
        merging = true
        Task {
            let err: String = await KalCalAPI39.acceptMigration()
            self.merging = false
            if err.isEmpty {
                withAnimation(.easeOut(duration: 0.2)) { self.mergeProposal = nil }
                KalHaptic.done()
                await self.load(force: true)
            } else {
                self.showToast(err, undo: "")
            }
        }
    }

    func dismissMerge() {
        guard let m = mergeProposal else { return }
        KalHaptic.tap()
        KalMergeOffer.dismiss(m, seenKey: KalStore.mergeSeenKey)
        withAnimation(.easeOut(duration: 0.2)) { mergeProposal = nil }
    }
}

/// Forslaget med «Slå sammen» og «Ikke nå».
struct KalMergeBanner: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    var floating: Bool = true

    var body: some View {
        if let m = s.mergeProposal {
            VStack(alignment: .leading, spacing: 8) {
                Text(KalMergeOffer.title(m)).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(KalMergeOffer.detail(m)).font(KalFont.ui(12.5)).foregroundStyle(t.mut)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    KalPill(title: s.merging ? "Slår sammen …" : "Slå sammen", enabled: !s.merging, height: 40) { s.acceptMerge() }
                    KalPill(title: "Ikke nå", filled: false, height: 40) { s.dismissMerge() }
                    Spacer(minLength: 0)
                }
            }
            .padding(14)
            .frame(maxWidth: floating ? 520 : .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(t.line, lineWidth: floating ? 1 : 0))
            .accessibilityElement(children: .contain)
            .accessibilityLabel(KalMergeOffer.title(m))
        }
    }
}
