import SwiftUI

/* ---------------- Q34 (E-B12): «Slå sammen kalenderne: 6 → 4?» i Kalender for Mac ---------------- */
// Som på iPhone/iPad (Kalender/Sources/KalMerge.swift) og web: forslaget fra serveren (migration.proposed) vises under
// verktøylinja. «Slå sammen» → POST /api/kalender/calendars/migration, deretter «Vi ryddet kalenderne … Angre» som før.
// «Ikke nå» skjuler forslaget på denne Mac-en. Ingenting endres uten ja.

extension MacStore {
    static let mergeSeenKey: String = "mac.mig34"

    func acceptMerge() {
        if merging { return }
        merging = true
        Task {
            let err: String = await KalCalAPI39.acceptMigration()
            self.merging = false
            if err.isEmpty {
                withAnimation(.easeOut(duration: 0.2)) { self.mergeProposal = nil }
                await self.load(force: true)
            } else {
                self.showToast(err, undo: "")
            }
        }
    }

    func dismissMerge() {
        guard let m = mergeProposal else { return }
        KalMergeOffer.dismiss(m, seenKey: MacStore.mergeSeenKey)
        withAnimation(.easeOut(duration: 0.2)) { mergeProposal = nil }
    }
}

struct MacMergeBanner: View {
    @Environment(\.mk) private var t
    @Bindable var store: MacStore = MacStore.shared

    var body: some View {
        if let m = store.mergeProposal {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(KalMergeOffer.title(m)).font(MacFont.ui(13, .bold)).foregroundColor(t.ink)
                    Text(KalMergeOffer.detail(m)).font(MacFont.ui(12)).foregroundColor(t.mut)
                }
                Spacer(minLength: 8)
                MacPill(title: store.merging ? "Slår sammen …" : "Slå sammen", enabled: !store.merging) { store.acceptMerge() }
                MacPill(title: "Ikke nå", filled: false) { store.dismissMerge() }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(t.chip)
        }
    }
}
