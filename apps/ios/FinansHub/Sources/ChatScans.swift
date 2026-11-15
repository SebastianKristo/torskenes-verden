import SwiftUI

/* ---------------- Prompt 34: Chat → mappen «Kvitteringer og skanninger» ----------------
   Fasit: design/Mobil Papir App.dc.html → SCAN_F, SCAN_SEED(), chLoad() og mappegruppene i sidemenyen.
   prompts/prompt-34-pakke/claude-code-chat-skanninger-mappe.md.
   Alt AI gjør med skanning (kvitteringer, pakkelapper/strekkoder, Finn-e-poster, kategorisering etter bankimport) ligger som
   egne samtaler i en fast systemmappe øverst under MAPPER, ikke blandet med I DAG / I GÅR. Mappen har rødt kvitteringsikon,
   antall og «· N til godkjenning», er lukket som standard og kan ikke slettes eller få nytt navn. Serveren (SERVER34) lager
   mappen og samtalene (POST /api/chat/system); appen kjenner den igjen på sys/system/kind i GET /api/chat/chats, og på navnet. */

enum Chat34Scans {
    static let folderName: String = "Kvitteringer og skanninger"
    static let red: Color = Color(hex: "#b23a2a")

    static func isScanFolder(_ f: [String: Any], name: String) -> Bool {
        if JS.bool(f, "sys") == true || JS.bool(f, "system") == true { return true }
        let kind: String = (JS.str(f, "kind") ?? JS.str(f, "type") ?? "").lowercased()
        if kind == "scan" || kind == "scans" || kind == "skanninger" || kind == "receipts" { return true }
        let n: String = name.lowercased()
        return n == "kvitteringer og skanninger" || n == "skanninger"
    }

    /// Systemmappen først, resten i serverens rekkefølge.
    static func sorted(_ list: [ChatFolder27]) -> [ChatFolder27] {
        let sys: [ChatFolder27] = list.filter { $0.sys }
        let rest: [ChatFolder27] = list.filter { !$0.sys }
        return sys + rest
    }

    /// «Kvitteringer og skanninger · 12 · 2 til godkjenning»
    static func title(_ f: ChatFolder27) -> String {
        var t: String = f.name + " · " + String(f.chats.count)
        if f.sys && f.pending > 0 { t += " · " + String(f.pending) + " til godkjenning" }
        return t
    }

    /// Åpner mappen i sidemenyen (når samtale-id-en ikke er kjent ennå).
    /// Lukker Chat-arket og åpner AI-kontroll (fullskjerm kan ikke vises mens arket lukkes).
    @MainActor static func openAiControl(_ tab: String) {
        ChatStore27.shared.sheet = nil
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            AiCtl34.shared.show(tab, scope: "chat")
        }
    }

    @MainActor static func openFolder(_ store: Store) {
        let s: ChatStore27 = ChatStore27.shared
        if let i = s.folders.firstIndex(where: { $0.sys }) {
            if !s.folders[i].open { s.toggleFolder(s.folders[i], store) }
        }
        s.drawer = true
    }
}
