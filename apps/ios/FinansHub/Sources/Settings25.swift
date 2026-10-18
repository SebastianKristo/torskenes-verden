import SwiftUI

/* ---------------- Prompt 25: «Ta meg dit →» etter ✦ AI-søk i Innstillinger ----------------
   Fasit: design/Mobil Papir App.dc.html → Innstillinger → ✦ AI-søk (goSet). Knappen lukker søket, åpner riktig
   underside (eller blir på Innstillinger for rader der), scroller til raden (ScrollViewReader.scrollTo, .center)
   og fremhever den i ~3 s: lys rød bakgrunn og rød strek til venstre som toner ut. Et vanlig søketreff fremhever
   raden på samme måte. */

@MainActor
@Observable
final class Set25Focus {
    static let shared = Set25Focus()

    /// Navnet på raden som fremheves (tittelen i PaperLinkList, navnet på integrasjonen).
    var target: String? = nil
    /// Øker for hvert hopp, så siden scroller på nytt også når raden er den samme.
    var tick: Int = 0
    @ObservationIgnored private var clearTask: Task<Void, Never>? = nil

    func flash(_ name: String) {
        target = name
        tick += 1
        clearTask?.cancel()
        clearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_200_000_000)
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: 0.6)) { self.target = nil }
        }
    }

    nonisolated static func rowId(_ name: String) -> String { "set25:" + name }
}

/// Fremheving av én rad: lys rød bakgrunn og rød strek til venstre. Raden får id-en ScrollViewReader scroller til.
struct Set25Row<C: View>: View {
    @Environment(\.paper) private var p
    let name: String
    let content: C
    /// false: raden har allerede en egen id (f.eks. integrasjonene, som scroller selv).
    var withId: Bool = true
    @MainActor private var f: Set25Focus { Set25Focus.shared }

    var body: some View {
        if withId {
            styled.id(Set25Focus.rowId(name))
        } else {
            styled
        }
    }

    @MainActor private var styled: some View {
        let on: Bool = f.target == name
        return content
            .background(on ? p.lab.opacity(0.12) : Color.clear)
            .overlay(alignment: .leading) {
                Rectangle().fill(p.lab).frame(width: 3).opacity(on ? 1 : 0)
            }
            .animation(.easeOut(duration: 0.6), value: on)
    }
}

extension View {
    func set25Highlight(_ name: String, id: Bool = true) -> some View { Set25Row(name: name, content: self, withId: id) }
}

extension Set24Model {
    /// «Ta meg dit →»: rader på en underside åpner undersiden, rader på Innstillinger blir der. Raden fremheves.
    func goThere(_ it: Set24Item, _ store: Store) {
        Haptics.shared.tap()
        let all: [Set24Item] = index(store)
        let parent: Set24Item? = all.first { (x: Set24Item) -> Bool in x.id != it.id && x.title == it.path && x.route.hasPrefix("innst-") }
        query = ""
        answer = ""
        aiIds = []
        if ai { ai = false }
        if it.route.hasPrefix("integ:") {
            Int24Model.shared.focus = String(it.route.dropFirst(6))
        }
        if let parent {
            store.paperGo(parent.route)
        } else if store.paperTab != "innst" {
            store.paperGo("innst")
        }
        Set25Focus.shared.flash(it.title)
    }
}

/// Den svarte pilleknappen under AI-svaret.
struct Set25GoButton: View {
    @Environment(\.paper) private var p
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text("Ta meg dit →").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                .padding(.horizontal, 16).frame(height: 38)
                .background(p.ink, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
