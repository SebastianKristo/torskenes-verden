import SwiftUI

/* ---------------- Struktur: iOS – Matplan ut av Store (AUDIT §6, samme mønster som DomenerModell) ----------------
 Uka (retter, hvem som lager, handlelisten), valgt dag og kallene mot /mat/api bor her. Store eier modellen (store.matplan) og
 har videresendende egenskaper (store.week, store.matDay, store.matFull) og metoder (loadWeek, planWeek, addToShop …), så
 skjermene virker som før. Modellen injiseres sammen med Store (homelabMiljo), så nye visninger kan lese den med
 @Environment(MatplanModell.self). Matplanen er delt i husstanden (CLAUDE.md: unntaket fra «alt er per bruker»). */

@MainActor
@Observable
final class MatplanModell {
    var week: Week? = nil
    /// Valgt dag (indeks 0–6), nil = i dag. «Se hele uka» viser hele uka og alle retter.
    var day: Int? = nil
    var full: Bool = false

    func load(_ store: Store) async throws {
        week = try await store.api.mat("/week", as: Week.self)
    }

    func planWeek(_ store: Store) {
        store.run {
            store.busy = true
            defer { store.busy = false }
            try await store.api.matCall("POST", "/plan", json: ["scope": "week"])
            try await self.load(store)
            store.flash("Ny ukeplan klar ✦")
        }
    }

    func planDay(_ date: String, _ store: Store) {
        store.run {
            try await store.api.matCall("POST", "/plan", json: ["scope": "day", "date": date])
            try await self.load(store)
        }
    }

    func setCook(_ date: String, _ cook: String, _ store: Store) {
        store.run {
            try await store.api.matCall("PATCH", "/day/\(date)", json: ["cook": cook])
            try await self.load(store)
        }
    }

    func toggleFixed(_ d: MealDay, _ store: Store) {
        store.run {
            try await store.api.matCall("PATCH", "/day/\(d.date)", json: ["fixed": !(d.fixed ?? false)])
            try await self.load(store)
        }
    }

    func toggleShop(_ id: String, _ store: Store) {
        store.run {
            try await store.api.matCall("POST", "/shopping/\(id)/toggle")
            try await self.load(store)
        }
    }

    /// Legger ingrediensene som mangler i handlelisten (ukas retter ligger der fra før).
    func addToShop(_ items: [String], _ store: Store) {
        let have: Set<String> = Set((week?.shopping ?? []).map { $0.text.lowercased() })
        let add: [String] = items.filter { (t: String) -> Bool in !have.contains(t.lowercased()) }
        guard !add.isEmpty else { store.flash("Alt ligger allerede i handlelisten"); return }
        store.run {
            for t in add {
                var j: [String: Any] = ["text": t]
                if let st = self.week?.start { j["start"] = st }
                try await store.api.matCall("POST", "/shopping", json: j)
            }
            try await self.load(store)
            store.flash("\(add.count) lagt i handlelisten")
        }
    }
}
