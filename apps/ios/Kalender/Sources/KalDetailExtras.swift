import SwiftUI

/* ---------------- Q26: det Homelabs gamle kalender hadde i detaljarket – nå i den delte Kalenderen ---------------- */
// • «Finn rommet i MazeMap ↗» for skoletimer (serverens mazemap, ellers MazeMap når rommet ser ut som et skolerom).
// • «Kopier til Personlig» for hendelser som ikke kan endres (skolens iCal, abonnementer, bursdager):
//   POST /api/kalender/events/:id/copy → kopi i Personlig som kan endres. Samme knapp som web (kalender.js).
// • «Lær Glimt hva dette er…» for egne hendelser (KalLearn.swift).

struct KalDetailExtras: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let e: KalEvent

    /// Ikke for lokale utkast, trekk fra Abonnementer eller Media (de har egne knapper).
    private var canCopy: Bool {
        !e.editable && !e.pending && !e.id.hasPrefix("x-") && e.media44 == nil && !KalAb42.isSub(e)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let u = KalSchool.mapURL(e) {
                Link(destination: u) {
                    Text("Finn rommet i MazeMap ↗").font(KalFont.ui(14, .bold)).foregroundStyle(t.ink)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(t.line, lineWidth: 1))
                }
                .accessibilityHint("Åpner kartet over skolen")
            }
            if canCopy {
                Button(action: { s.copyToPersonal(e) }) {
                    Text("Kopier til Personlig").font(KalFont.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(t.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Lager en kopi du kan endre, i Personlig")
            }
            if e.editable && !e.pending {
                Button(action: { KalLearnModel.shared.open(e) }) {
                    Text("Lær Glimt hva dette er…").font(KalFont.ui(13, .semibold)).foregroundStyle(t.mut).underline()
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Velg om dette er frisør, lege, tannlege eller noe annet")
            }
        }
        .onAppear { KalLearnModel.shared.shown(e) }
    }
}

extension KalStore {
    /// «Kopier til Personlig»: serveren lager kopien (med lærer i merknaden), og kalenderen hentes på nytt.
    func copyToPersonal(_ e: KalEvent) {
        KalHaptic.tap()
        let id: String = e.id
        Task {
            do {
                _ = try await KalNet.send("POST", "/api/kalender/events/" + KalNet.enc(id) + "/copy", json: [:], timeout: 20)
                withAnimation(.easeOut(duration: 0.22)) { self.detId = nil }
                KalHaptic.done()
                self.showToast("Kopiert til Personlig", undo: "")
                await self.load(force: true)
            } catch let er as KalNetError {
                if er.status == 409 {
                    self.showToast("Koble til Google på nytt i Homelab → Innstillinger → Tilkoblinger", undo: "")
                } else if er.status == 404 {
                    self.showToast("Serveren kan ikke kopiere denne hendelsen.", undo: "")
                } else {
                    self.showToast("Kunne ikke kopiere: " + er.message, undo: "")
                }
            } catch {
                self.showToast("Kunne ikke kopiere: " + error.localizedDescription, undo: "")
            }
        }
    }
}
