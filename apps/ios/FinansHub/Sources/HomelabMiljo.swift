import SwiftUI

/* ---------------- Struktur: iOS – Store og domenemodellene i miljøet ----------------
 Brukes overalt der Store settes i miljøet (roten i App.swift, ark og egne vinduer som setter miljøet på nytt). Da finner en
 visning som leser en domenemodell med @Environment(DomenerModell.self) den alltid, uansett hvor den vises. En ny modell som
 flyttes ut av Store legges til her. */

extension View {
    func homelabMiljo(_ store: Store) -> some View {
        self
            .environment(store)
            .environment(store.domener)
            .environment(store.finnModell)
            .environment(store.matplan)
            .environment(store.boliger)
            .environment(store.sporing)
    }
}
