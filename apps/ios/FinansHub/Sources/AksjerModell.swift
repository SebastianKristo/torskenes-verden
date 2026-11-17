import SwiftUI

/* ---------------- Struktur: iOS – Aksjer ut av Store (AUDIT §6, samme mønster som DomenerModell) ----------------
 Porteføljen fra Trading 212 (/stocks), perioden, skjermen som vises (Portefølje, Aksjedetaljer, Transaksjoner) og valgt aksje
 bor her. Store eier modellen (store.aksjer) og har videresendende egenskaper (store.stocks, store.stockPeriod, store.stocksX,
 store.stockScreen, store.stockSel, store.stockFrom) og metoder (syncStocks, og load(.stocks) i Store), så skjermene virker som
 før. Modellen injiseres sammen med Store (homelabMiljo), så nye visninger kan lese den med @Environment(AksjerModell.self). */

@MainActor
@Observable
final class AksjerModell {
    var stocks: Stocks? = nil
    var period: String = "1M"
    var x: StocksX? = nil
    /// ov | det | tx (Portefølje, Aksjedetaljer, Transaksjoner)
    var screen: String = "ov"
    var sel: String? = nil
    /// Detaljen ble åpnet fra Transaksjoner (tilbake går dit).
    var from: String? = nil

    func load(_ store: Store) async throws {
        let d: Data = try await store.api.call("GET", "/stocks")
        stocks = try? JSONDecoder().decode(Stocks.self, from: d)
        x = StocksX.parse(d)
    }

    func sync(_ store: Store) {
        store.run {
            store.busy = true
            defer { store.busy = false }
            let d: Data = try await store.api.call("POST", "/stocks/sync")
            self.stocks = try? JSONDecoder().decode(Stocks.self, from: d)
            self.x = StocksX.parse(d)
            store.flash("Synket med Trading 212")
        }
    }
}
