import SwiftUI

/* ---------------- Prompt 23: rute-nøkkel og «Mer» som følger modulen ---------------- */

extension Store {
    /// Én tekst som beskriver siden som vises nå (Papir-fane, modul, underside og det som er åpent inne på siden).
    /// Sveip tilbake og scrollposisjonen bruker den til å kjenne igjen sider (Nav23Swipe.swift).
    var nav23Key: String {
        var k: [String] = []
        k.append(paper ? "p:" + paperTab : "k:" + tab.key)
        k.append(module?.rawValue ?? "-")
        k.append(paperFin?.key ?? "-")
        k.append(settingsPage ?? "-")
        k.append(String(folder?.id ?? 0))
        k.append(trkSel ?? "-")
        k.append(stockScreen)
        k.append(selectedReceipt ?? "-")
        k.append(String(finnSel ?? 0))
        k.append(String(selectedTx ?? 0))
        k.append(String(paperTxId ?? 0))
        k.append(dishSel ?? "-")
        k.append(paperEditPage ?? "-")
        k.append(newsOpen ? "n" : "-")
        k.append(paperTrackFull ? "t" : "-")
        k.append(detail != nil ? "d" : "-")
        k.append(editing != nil ? "e" : "-")
        k.append(original != nil ? "o" : "-")
        k.append(editHome ? "h" : "-")
        return k.joined(separator: "|")
    }

    /// Finans-undersider uten egen fane i linja (Aksjer, Kvitteringer, Budsjett, Kontoer …): «Mer» er markert,
    /// og et trykk på «Mer» åpner Finans → Mer, ikke appens globale Mer.
    func nav23FinMore() {
        if paperTapBlocked { return }
        if paperTab == "fmer" && paperClassic == nil && paperFin == nil && !paperInner { return }
        selectedReceipt = nil
        stockScreen = "ov"
        paperGo("fmer")
    }
}

extension Store {
    /// Aksjer: ingen skann-knapp (FAB eller + i linja).
    var nav23NoScan: Bool { paperTab == "aksjer" || paperClassic == .stocks || (paperTab == "mer" && paperClassic == nil && paperFin == nil) }

    /// Aksjer, Boliger og Kvitteringer åpnet fra Finans → Mer (ikke egen fane): sveip og ‹ går til Finans → Mer.
    var nav23SubOfFinMore: Bool {
        if paperInner { return false }
        switch paperTab {
        case "aksjer": return !finNav.contains("aksjer")
        case "boliger": return folder == nil && !finNav.contains("boliger")
        case "kvitt": return !finNav.contains("kvitteringer")
        default: return false
        }
    }
}
