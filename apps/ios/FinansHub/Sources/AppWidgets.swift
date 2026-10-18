import SwiftUI
import WidgetKit

/* ---------------- Widgets: innlogging i App Group og deep links ---------------- */

extension Store {
    /// Gir widgetene serveradressen og app-tokenet til kontoen som er i bruk (App Group).
    func syncWidgets() {
        guard let a = account else {
            if WidgetShared.token != nil { WidgetShared.clear(); WidgetCenter.shared.reloadAllTimelines() }
            return
        }
        let changed = WidgetShared.token != a.token || WidgetShared.bases.first != (base.isEmpty ? a.server : base)
        WidgetShared.save(server: base.isEmpty ? a.server : base, external: a.external, local: a.local, token: a.token)
        if changed { WidgetCenter.shared.reloadAllTimelines() }
    }

    /// Skann bestilt fra widgeten (AppIntent) mens appen var lukket.
    func takePendingScan() {
        if let s = WidgetShared.pendingScan {
            WidgetShared.pendingScan = nil
            pendingScan = s
        }
    }

    /// finanshub://<side>[/<under>]. Et trykk på en widget åpner riktig side.
    func openDeepLink(_ url: URL) {
        guard url.scheme == "finanshub", loggedIn else { return }
        let page = (url.host ?? "").lowercased()
        let sub = url.pathComponents.dropFirst().first?.lowercased() ?? ""
        switch page {
        case "homelab", "weather", "vaer": open(.homelab)
        case "tracking", "packages", "sporing": open(.tracking)
        case "budget", "budsjett": go(.budget)
        case "home", "finance", "finans": go(.home)
        case "list", "liste": go(.list)
        case "receipts", "review", "kvitteringer": open(.upload)
        case "subs", "nextcharge", "abonnement": open(.sub)
        case "stocks", "aksjer": open(.stocks)
        case "domains", "domener": open(.domains)
        case "mat", "matplan": open(.mat)
        case "finn": go(.finn)
        case "boliger", "folders": open(.folders)
        case "scan", "skann": pendingScan = sub == "files" ? "files" : "camera"
        default: goStart()
        }
    }
}
