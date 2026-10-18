import SwiftUI

/* ---------------- Familie: deling av som standard (prompt 21) ---------------- */

/// Tom tilstand når ingen andre deler posisjon med deg.
struct FamilyEmptyShare21: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "location.slash").font(.system(size: 18, weight: .semibold)).foregroundStyle(p.mut)
                Text("Ingen deler posisjon med deg ennå").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
            }
            Text("Deling er av som standard. Når noen i familien slår på deling i appen, vises de her og på kartet.")
                .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Button { store.paperGo("innst-fam") } label: {
                Text("Mine delingsvalg ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Bryteren «Del med familien» i sone-arket. Av som standard: da ser bare du sonen.
struct FamilyZoneShareRow21: View {
    @Environment(\.paper) private var p
    @Binding var on: Bool

    var body: some View {
        Toggle(isOn: $on) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Del med familien").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Text(on ? "Familien ser sonen og kan få varsler" : "Bare du ser sonen").font(PF.ui(12)).foregroundStyle(p.mut)
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
