import SwiftUI
import PhotosUI

/* ---------------- Prompt 36: Innstillinger – profilbilde i Konto og ikon på hver rad ----------------
   prompts/prompt-36-pakke/claude-code-konto-profilbilde.md og claude-code-innstillinger-ikoner.md.
   · Konto: profilbildet (88 pt, rundt, ring #f3efe6/#d8d1c2) sentrert over navnet, «Endre bilde» under. Trykk på bildet gir
     et mørkt lag med kamera og «Endre». Uten bilde: initialer på #2b5d8a. Raden «Profilbilde» viser miniatyr (40 pt) +
     «Endre ›», og under: Last opp nytt · Ta bilde · Fjern (rød, med bekreftelse). Samme kilde (store.avatar) som profilkortet.
   · Ikonbrikke (mobil 30 × 30, radius 10): sidens farge 12 % (mørk: 18 %), ikon 16–18 pt i sidens farge. Status-rader
     grønne/røde etter status, farlige handlinger røde. SF Symbols tilsvarende Lucide-navnene i spesifikasjonen. */

/// Ikonbrikken til venstre i en rad.
struct Set36Chip: View {
    @Environment(\.paper) private var p
    let symbol: String
    let tint: Color

    var body: some View {
        Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).foregroundStyle(tint)
            .frame(width: 30, height: 30)
            .background(tint.opacity(p.dark ? 0.18 : 0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityHidden(true)
    }
}

enum Set36Tint {
    static let ok: Color = Color(hex: "#2f7d4f")
    static let bad: Color = Color(hex: "#b23a2a")
}

/// Toppen av Konto: bildet sentrert, navn og @brukernavn, «Endre bilde».
struct Konto36Head: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Binding var photo: PhotosPickerItem?
    @Binding var camera: Bool
    @Binding var files: Bool
    @State private var confirmRemove: Bool = false

    var body: some View {
        VStack(spacing: 12) {
            Menu {
                menuItems
            } label: {
                Konto36Avatar(size: 88)
                    .overlay(alignment: .bottomTrailing) {
                        // Kamera-merke (trykk åpner bildevalget).
                        Image(systemName: "camera.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.white)
                            .frame(width: 28, height: 28)
                            .background(Color(hex: "#1b1a17").opacity(0.8), in: Circle())
                            .overlay(Circle().stroke(Color.white, lineWidth: 2))
                    }
            }
            .accessibilityLabel("Profilbilde. Endre")
            VStack(spacing: 2) {
                Text(store.displayName.isEmpty ? "Konto" : store.displayName).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                    .multilineTextAlignment(.center)
                if let u = store.account?.username, !u.isEmpty {
                    Text("@" + u).font(PF.ui(13)).foregroundStyle(p.mut)
                }
            }
            Menu { menuItems } label: {
                Text("Endre bilde").font(PF.ui(14, .bold)).foregroundStyle(p.lab).frame(minHeight: 32)
            }
            Konto36PhotoRow(photo: $photo, camera: $camera, confirmRemove: $confirmRemove)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 18)
        .confirmationDialog("Fjerne profilbildet?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Fjern bildet", role: .destructive) { store.removeAvatar() }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Bildet fjernes i appen, på web og i widgetene.")
        }
    }

    @ViewBuilder private var menuItems: some View {
        PhotosPicker(selection: $photo, matching: .images) { Label("Last opp nytt", systemImage: "photo.on.rectangle") }
        Button { camera = true } label: { Label("Ta bilde", systemImage: "camera") }
        Button { files = true } label: { Label("Velg fil", systemImage: "folder") }
        if store.avatar != nil {
            Button(role: .destructive) { confirmRemove = true } label: { Label("Fjern", systemImage: "trash") }
        }
    }
}

/// Rundt profilbilde med ring; uten bilde initialer på #2b5d8a. overlayOn = mørkt lag med kamera og «Endre».
struct Konto36Avatar: View {
    @Environment(Store.self) private var store
    let size: CGFloat
    var overlayOn: Bool = false

    var body: some View {
        ZStack {
            if let img = store.avatar {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Color(hex: "#2b5d8a")
                Text(Konto36Avatar.initials(store.displayName)).font(PF.ui(size * 0.36, .heavy)).foregroundStyle(Color.white)
            }
            if overlayOn {
                Color.black.opacity(0.45)
                VStack(spacing: 2) {
                    Image(systemName: "camera.fill").font(.system(size: size * 0.2, weight: .semibold))
                    Text("Endre").font(PF.ui(Swift.max(10, size * 0.14), .bold))
                }
                .foregroundStyle(Color.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color(hex: "#f3efe6"), lineWidth: 3).padding(-1.5))
        .overlay(Circle().stroke(Color(hex: "#d8d1c2"), lineWidth: 1).padding(-3.5))
        .animation(.easeOut(duration: 0.15), value: overlayOn)
    }

    static func initials(_ name: String) -> String {
        let parts: [Substring] = name.split(separator: " ")
        let a: String = parts.first.map { String($0.prefix(1)) } ?? "•"
        let b: String = parts.count > 1 ? String(parts[parts.count - 1].prefix(1)) : ""
        return (a + b).uppercased()
    }
}

/// Raden «Profilbilde» med miniatyr + «Endre ›», og Last opp nytt · Ta bilde · Fjern under.
struct Konto36PhotoRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Binding var photo: PhotosPickerItem?
    @Binding var camera: Bool
    @Binding var confirmRemove: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                if store.avatar == nil { Set36Chip(symbol: "photo", tint: Set30Colors.konto) }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Profilbilde").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text("Vises i menyer, hilsener og widgets").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 6)
                if store.avatar != nil { Konto36Avatar(size: 40) }
                PhotosPicker(selection: $photo, matching: .images) {
                    Text("Endre ›").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            Rectangle().fill(p.line).frame(height: 1).padding(.leading, 14)
            HStack(spacing: 18) {
                PhotosPicker(selection: $photo, matching: .images) {
                    Text("Last opp nytt").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                }
                Button { camera = true } label: {
                    Text("Ta bilde").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
                if store.avatar != nil {
                    Button { confirmRemove = true } label: {
                        Text("Fjern").font(PF.ui(13.5, .bold)).foregroundStyle(Set36Tint.bad)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(minHeight: 44)
            .padding(.horizontal, 14)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 6)
    }
}
