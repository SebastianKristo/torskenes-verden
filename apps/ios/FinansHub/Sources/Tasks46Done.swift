import SwiftUI
import UIKit

/* ---------------- Prompt 46: Gjøremål – «Fullfør oppgaven» i infosiden lukker siden ----------------
 Spesifikasjon: claude-code-gjoremal-fullfor-lukker.md. Fasit: Huskeliste.dc.html → toggle i infosiden (vw).
 – Fullfør: haken/overstrykningen som før, suksess-haptikk, og etter 450 ms lukkes infosiden.
 – I lista: toast «Fullført: Kjøpe melk · Angre» (5 s). Angre setter den tilbake som ikke fullført.
 – Angre fullført (fullført oppgave åpnet) lukker ikke siden.
 – Uferdige deloppgaver: «2 deloppgaver er ikke ferdige. Fullfør alle?» Fullfør alle · Avbryt – deretter lukkes siden. */

@MainActor
@Observable
final class Tasks46Undo {
    static let shared = Tasks46Undo()

    var text: String = ""
    var taskId: String = ""
    @ObservationIgnored private var hide: Task<Void, Never>? = nil

    func show(_ t: TaskItem17) {
        taskId = t.id
        let name: String = t.title.isEmpty ? "oppgaven" : t.title
        withAnimation(.easeOut(duration: 0.2)) { text = "Fullført: " + name }
        hide?.cancel()
        hide = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled { self.clear() }
        }
    }

    func undo(_ store: Store) {
        let id: String = taskId
        clear()
        guard !id.isEmpty else { return }
        Tasks44UI.shared.setDone(id, false, store)
    }

    func clear() {
        hide?.cancel()
        withAnimation(.easeOut(duration: 0.2)) { text = "" }
        taskId = ""
    }

    /// Antall deloppgaver som ikke er ferdige.
    nonisolated static func openSubs(_ t: TaskItem17) -> Int { t.subs.filter { !$0.done }.count }
}

/// «Fullført: Kjøpe melk · Angre» nederst i Gjøremål (5 s).
struct Tasks46UndoBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var u: Tasks46Undo { Tasks46Undo.shared }

    var body: some View {
        if !u.text.isEmpty {
            HStack(spacing: 12) {
                Text(u.text).font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg).lineLimit(1)
                Spacer(minLength: 4)
                Button { Haptics.shared.tap(); u.undo(store) } label: {
                    Text("Angre").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).underline()
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .background(p.ink, in: Capsule())
            .padding(.horizontal, 16).padding(.bottom, 24)
            .frame(maxWidth: 520)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
