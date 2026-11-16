import SwiftUI
import AppKit

/* ---------------- Kalender for Mac: skolefeltene og «Kopier til Personlig» i hendelsesarket (som på iPhone) ----------------
 Q26 / Fase 6-rest: detaljarket på iPhone (KalSheets.swift, KalDetailExtras.swift) viser lærer, fag og gjentakelse fra serveren,
 «Finn rommet i MazeMap ↗» og «Kopier til Personlig» for hendelser som ikke kan endres. Mac bruker den samme delte koden
 (KalSchool i SharedKal/Core/KalSchoolCore.swift) og det samme endepunktet (POST /api/kalender/events/:id/copy). */

enum MacDetailSchool {
    /// Faget når det ikke allerede er tittelen (timene heter som faget), som på iPhone.
    static func subjectText(_ e: KalEvent) -> String {
        guard let su = e.subject, e.serverType != "time" else { return "" }
        return su == e.title ? "" : su
    }

    /// Kalendernavnet med «Prøve»/«Innlevering» bak (KalSchool.typeName).
    static func calLabel(_ name: String, _ e: KalEvent) -> String {
        let ty: String = KalSchool.typeName(e)
        if ty.isEmpty { return name }
        return name.isEmpty ? ty : name + " · " + ty
    }

    /// Ikke for lokale utkast, trekk fra Abonnementer eller Media (de har egne knapper). Samme regel som iPhone.
    static func canCopy(_ e: KalEvent) -> Bool {
        !e.editable && !e.pending && !e.id.hasPrefix("x-") && !e.id.hasPrefix("u") && e.media44 == nil && !KalAb42.isSub(e)
    }
}

/// Lærer, fag og gjentakelse (radene i arket). Vises bare når serveren har sendt feltene.
struct MacSchoolRows: View {
    let e: KalEvent

    var body: some View {
        let subject: String = MacDetailSchool.subjectText(e)
        let rep: String = KalSchool.repeatName(e.repeatRule)
        if let te = e.teacher, !te.isEmpty {
            MacInfoRow(label: "Lærer", value: te, top: true)
        }
        if !subject.isEmpty {
            MacInfoRow(label: "Fag", value: subject, top: true)
        }
        if !rep.isEmpty {
            MacInfoRow(label: "Gjentas", value: rep, top: true)
        }
    }
}

/// «Finn rommet i MazeMap ↗» og «Kopier til Personlig».
struct MacDetailExtras: View {
    let e: KalEvent
    @Bindable var win: MacWin
    @Bindable var store: MacStore = MacStore.shared

    var body: some View {
        let map: URL? = KalSchool.mapURL(e)
        let copy: Bool = MacDetailSchool.canCopy(e)
        if map != nil || copy {
            HStack(spacing: 8) {
                if let u = map {
                    MacPill(title: "Finn rommet i MazeMap ↗", filled: false) { _ = NSWorkspace.shared.open(u) }
                        .help("Åpner kartet over skolen")
                }
                if copy {
                    MacPill(title: "Kopier til Personlig", filled: false) { store.copyToPersonal(e, win: win) }
                        .help("Lager en kopi du kan endre, i Personlig")
                }
                Spacer(minLength: 0)
            }
        }
    }
}

extension MacStore {
    /// «Kopier til Personlig»: serveren lager kopien (med lærer i merknaden), og kalenderen hentes på nytt. Som iPhone (KalStore).
    func copyToPersonal(_ e: KalEvent, win: MacWin) {
        let id: String = e.id
        Task {
            do {
                _ = try await KalNet.send("POST", "/api/kalender/events/" + KalNet.enc(id) + "/copy", json: [:], timeout: 20)
                win.detId = nil
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
