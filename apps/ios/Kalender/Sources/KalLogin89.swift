import SwiftUI
import UIKit

/* ---------------- Prompt 89 (IOS89): Kalender – tannhjul for serveradresse på innloggingen ----------------
 Tannhjulet (gearshape, 44×44) øverst til høyre på innloggingen åpner arket «Server»: Ekstern adresse (URL-tastatur,
 forhåndsutfylt https://os.smarthjemeksperten.no), Lokal adresse (http://10.69.1.39:3000), «Test tilkobling» (GET /api/health,
 «Tilkoblet» grønn / feilmelding rød), «Tilbakestill til standard», Lagre / Avbryt. Samme lagring som Innstillinger → Server
 (KalSrv89.save → KalSrv47). Under innloggingsknappene: «Server: os.smarthjemeksperten.no» i liten grå tekst. */

struct KalLogin89Gear: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            m.gear89 = true
        }) {
            Image(systemName: "gearshape")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(t.mut)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Server")
        .accessibilityHint("Endre ekstern og lokal serveradresse")
    }
}

/// «Server: os.smarthjemeksperten.no».
struct KalLogin89Line: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        Button(action: { m.gear89 = true }) {
            Text("Server: " + m.server89)
                .font(KalFont.ui(12.5)).foregroundStyle(t.mut2)
                .lineLimit(1).truncationMode(.middle)
                .frame(maxWidth: .infinity, minHeight: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct KalLogin89Sheet: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }
    @State private var external: String = ""
    @State private var local: String = ""
    @State private var extText: String = ""
    @State private var extOk: Bool = false
    @State private var locText: String = ""
    @State private var locOk: Bool = false
    @State private var testing: Bool = false
    @State private var busy: Bool = false
    @State private var error: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Server").font(KalFont.serif(26)).foregroundStyle(t.ink)
                    Spacer()
                    Button(action: { m.gear89 = false }) {
                        Text("Avbryt").font(KalFont.ui(14, .semibold)).foregroundStyle(t.mut).frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
                Text("Adressene til Homelab-serveren. De samme verdiene finnes i Innstillinger → Server etter innlogging.")
                    .font(KalFont.ui(13)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                field("Ekstern adresse", KalSrv47.standardExternal, $external, extText, extOk)
                field("Lokal adresse", KalSrv47.standardLocal, $local, locText, locOk)
                if !error.isEmpty {
                    Text(error).font(KalFont.ui(13, .semibold)).foregroundStyle(t.red).fixedSize(horizontal: false, vertical: true)
                }
                Button(action: { test() }) {
                    HStack(spacing: 8) {
                        if testing { ProgressView() }
                        Text(testing ? "Tester …" : "Test tilkobling").font(KalFont.ui(14, .bold))
                    }
                    .foregroundStyle(t.ink).frame(maxWidth: .infinity).frame(height: 46)
                    .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(testing)
                Button(action: { reset() }) {
                    Text("Tilbakestill til standard").font(KalFont.ui(13.5, .semibold)).foregroundStyle(t.mut).underline()
                        .frame(maxWidth: .infinity).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                HStack(spacing: 8) {
                    KalPill(title: "Avbryt", filled: false, height: 46) { m.gear89 = false }
                    KalPill(title: busy ? "Lagrer …" : "Lagre", enabled: !busy, height: 46) { save() }
                }
            }
            .padding(20)
        }
        .background(t.bg.ignoresSafeArea())
        .presentationDetents([.large])
        .onAppear {
            external = KalSrv89.external
            local = KalSrv89.local
        }
    }

    private func field(_ title: String, _ placeholder: String, _ text: Binding<String>, _ result: String, _ ok: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(KalFont.ui(12.5, .bold)).foregroundStyle(t.mut)
            TextField(placeholder, text: text)
                .keyboardType(.URL)
                .textContentType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .font(KalFont.ui(15, .medium)).foregroundStyle(t.ink)
                .padding(.horizontal, 14).frame(height: 48)
                .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line, lineWidth: 1))
            if !result.isEmpty {
                Text(result).font(KalFont.ui(12.5, .semibold)).foregroundStyle(ok ? t.green : t.red)
            }
        }
    }

    private func reset() {
        KalHaptic.tap()
        external = KalSrv47.standardExternal
        local = KalSrv47.standardLocal
        extText = ""
        locText = ""
        error = ""
    }

    private func test() {
        testing = true
        extText = ""
        locText = ""
        let e: String = external
        let l: String = local
        Task { @MainActor in
            let r1: (ok: Bool, text: String) = await KalSrv89.health(e)
            extOk = r1.ok
            extText = r1.text
            if !KalSrv89.clean(l).isEmpty {
                let r2: (ok: Bool, text: String) = await KalSrv89.health(l)
                locOk = r2.ok
                locText = r2.text
            }
            testing = false
        }
    }

    private func save() {
        let e: String = KalSrv89.clean(external)
        let l: String = KalSrv89.clean(local)
        if !KalSrv89.valid(e) {
            error = "Ekstern adresse må starte med http:// eller https://"
            return
        }
        if !l.isEmpty && !KalSrv89.valid(l) {
            error = "Lokal adresse må starte med http:// eller https://"
            return
        }
        busy = true
        let logged: Bool = KalStore.shared.loggedIn
        Task { @MainActor in
            _ = await KalSrv89.save(external: e, local: l, loggedIn: logged, device: KalDev44.name)
            busy = false
            m.saved89()
            KalHaptic.done()
            m.gear89 = false
        }
    }
}
