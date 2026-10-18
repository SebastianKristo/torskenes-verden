import SwiftUI

/* ---------------- Hjem-widgets: hold inne og dra (prompt 21) ---------------- */

extension Store {
    /// Rett etter et langt trykk (0,8 s) åpnes ingen sider, så klikket når fingeren slippes ikke avbryter redigeringen.
    var paperTapBlocked: Bool { Date().timeIntervalSince(paperEditAt) < 0.8 }

    /// Kortet `src` er sluppet på `target`: flytt det dit (fremover havner det etter målet, bakover foran).
    func dropPaperCard(_ page: String, _ src: String, on target: String, _ keys: [String]) {
        let cur = pageCards(page, keys)
        let next: [String] = FinTileOrder20.moved(cur.visible, src, before: target)
        guard next != cur.visible else { return }
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            paperPages[page] = PaperPageLayout(order: next + cur.hidden, hidden: cur.hidden)
        }
        if let l = paperPages[page] {
            savePaperLayout(["pages": [page: ["order": l.order, "hidden": l.hidden]]])
        }
    }
}
