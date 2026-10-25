import SwiftUI

/* ---------------- Prompt 44: SERVER · EIER – overfør eierskapet (Face ID) ----------------
 Fasit: Mobil Papir App.dc.html → Innstillinger → Kontoer og brukere → SERVER · EIER (ownRows, ownVals) og
 claude-code-overfor-servereier.md. Rad «Eier av serveren · Sebastian (deg) · startet serveren 3. mars 2025»,
 «Overfør eierskap ›» (rød) → ark: forklaring + brukere (avatar, rolle) → Fortsett → skriv navnet til mottakeren +
 Face ID (eller passord) → «Overfør til X» (rød, aktiv først når navnet stemmer). Mottaker må ha 2FA. Admin som ikke er
 eier: eieren må godkjenne (48 t). Kan ikke angres i appen; ny eier kan overføre tilbake. */

struct Konto44Owner: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }

    var body: some View {
        if !k.ownerMissing && !k.ownerName.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                PLabel(text: "Server · Eier").padding(.top, 12).padding(.leading, 4).padding(.bottom, 6)
                VStack(spacing: 0) {
                    ownerRow
                    ForEach(k.pending, id: \.self) { (r: [String: String]) in
                        Rectangle().fill(p.line).frame(height: 1)
                        Konto44PendingRow(row: r)
                    }
                    if k.canTransfer && k.imp == nil {
                        Rectangle().fill(p.line).frame(height: 1)
                        transferRow
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }

    private var ownerRow: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Eier av serveren").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Text(k.ownerName + (k.isOwner ? " (deg)" : "")).font(PF.ui(15.5, .bold)).foregroundStyle(p.ink)
            if !k.ownerSince.isEmpty { Text("startet serveren " + k.ownerSince).font(PF.ui(12.5)).foregroundStyle(p.mut) }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var transferRow: some View {
        Button { Haptics.shared.tap(); k.transferOpen = true } label: {
            HStack {
                Text("Overfør eierskap").font(PF.ui(15, .bold)).foregroundStyle(Color(hex: "#b23a2a"))
                Spacer()
                Text("›").font(PF.ui(17)).foregroundStyle(Color(hex: "#b23a2a"))
            }
            .padding(.horizontal, 14).frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// «Ingrid vil overføre serveren til Petter» med Godkjenn / Avslå (bare eieren).
struct Konto44PendingRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }
    let row: [String: String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(row["text"] ?? "").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            if k.isOwner {
                HStack(spacing: 8) {
                    small("Godkjenn", true) { k.decide(row["id"] ?? "", approve: true, store) }
                    small("Avslå", false) { k.decide(row["id"] ?? "", approve: false, store) }
                }
            } else {
                Text("Venter på at eieren godkjenner (gyldig i 48 t).").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
    }

    private func small(_ t: String, _ primary: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13.5, .bold)).foregroundStyle(primary ? p.bg : p.ink)
                .padding(.horizontal, 16).frame(minHeight: 40)
                .background(primary ? p.ink : p.bg, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Arket: velg mottaker → skriv navnet + Face ID/passord → «Overfør til X».
struct Konto44TransferSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }
    @State private var pick: Konto44User? = nil
    @State private var step: Int = 0
    @State private var typed: String = ""
    @State private var password: String = ""
    @State private var needPassword: Bool = false
    @State private var error: String = ""
    @State private var busy: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader30(title: "Overfør eierskap", back: backAction, closeTitle: "Avbryt", closeKind: .secondary) { k.transferOpen = false }
                if step == 0 { Konto44TransferPick(pick: $pick) { step = 1 } } else if let u = pick { confirm(u) }
            }
            .padding(20)
        }
    }

    private var backAction: (() -> Void)? {
        if step == 1 { return { step = 0 } }
        return nil
    }

    @ViewBuilder private func confirm(_ u: Konto44User) -> some View {
        let match: Bool = typed.trimmingCharacters(in: .whitespaces).lowercased() == u.name.lowercased()
        Text("Skriv navnet til mottakeren for å bekrefte. \(u.name) blir eier, og du blir admin. Det kan ikke angres i appen.")
            .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        Konto44Field(placeholder: u.name, text: $typed, secure: false)
        if needPassword { Konto44Field(placeholder: "Passordet ditt", text: $password, secure: true) }
        if !error.isEmpty { Text(error).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
        Button { go(u) } label: {
            Text(busy ? "Overfører …" : "Overfør til \(u.name)").font(PF.ui(16, .bold)).foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Color(hex: "#b23a2a").opacity(match ? 1 : 0.35), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!match || busy || (needPassword && password.isEmpty))
        Text(System31Auth.biometryName.isEmpty ? "Bekreftes med passordet ditt." : "Bekreftes med \(System31Auth.biometryName).")
            .font(PF.ui(12)).foregroundStyle(p.mut)
    }

    private func go(_ u: Konto44User) {
        busy = true
        error = ""
        Task { @MainActor in
            defer { busy = false }
            var tok: String? = nil
            if !needPassword {
                tok = await k.reauthToken(store)
                if tok == nil { needPassword = true; error = "Skriv passordet ditt for å bekrefte."; return }
            }
            if let e = await k.transfer(u, password: password, token: tok, store) { error = e; return }
            k.transferOpen = false
        }
    }
}

struct Konto44Field: View {
    @Environment(\.paper) private var p
    let placeholder: String
    @Binding var text: String
    let secure: Bool

    var body: some View {
        Group {
            if secure { SecureField(placeholder, text: $text) } else { TextField(placeholder, text: $text) }
        }
        .font(PF.ui(16)).foregroundStyle(p.ink)
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .padding(.horizontal, 14).frame(height: 50)
        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
    }
}

/// Steg 1: forklaring og brukerne (avatar, rolle). Mottaker uten 2FA kan ikke velges.
struct Konto44TransferPick: View {
    @Environment(\.paper) private var p
    @MainActor private var k: Konto44 { Konto44.shared }
    @Binding var pick: Konto44User?
    let next: () -> Void

    var body: some View {
        let list: [Konto44User] = k.candidates.isEmpty ? k.users : k.candidates
        Text(intro)
            .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Konto44User)) in
                if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Konto44PickRow(u: pair.element, on: pick?.id == pair.element.id) { pick = pair.element }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        Button(action: next) {
            Text("Fortsett").font(PF.ui(16, .bold)).foregroundStyle(p.bg)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(p.ink.opacity(pick == nil ? 0.35 : 1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(pick == nil)
    }
}

extension Konto44TransferPick {
    var intro: String {
        if k.needsApproval { return "Du er admin, men ikke eier. Eieren må godkjenne overføringen (push og e-post, gyldig i 48 t)." }
        return "Den nye eieren får backup-nøkkelen, varsler om serverfeil og kontoene som er koblet til eierkontoen. Du blir admin."
    }
}

struct Konto44PickRow: View {
    @Environment(\.paper) private var p
    let u: Konto44User
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Konto44Avatar(u: u)
                VStack(alignment: .leading, spacing: 1) {
                    Text(u.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(ok ? p.mut : p.lab).lineLimit(2)
                }
                Spacer(minLength: 6)
                if on { Image(systemName: "checkmark").font(.dyn51(size: 14, weight: .bold)).foregroundStyle(p.lab) }
            }
            .padding(.horizontal, 14).frame(minHeight: 60)
            .contentShape(Rectangle())
            .opacity(ok ? 1 : 0.6)
        }
        .buttonStyle(.plain)
        .disabled(!ok)
    }

    private var ok: Bool { u.eligible }

    private var sub: String {
        if !u.eligible { return u.reason.isEmpty ? "\(u.name) må slå på 2FA først" : u.reason }
        return u.role == "admin" ? "Admin" : "Bruker"
    }
}
