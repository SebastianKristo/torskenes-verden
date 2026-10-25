import SwiftUI
import UIKit

/* ---------------- Prompt 52: butikklogo i lister (Filter-treff, Liste, Boliger) fra lokal logo-cache ----------------
 Fasit: FinansHub v3 Temaer.dc.html (36 px logo foran butikknavnet i trefflista, forbokstav som reserve) og SERVER52-API.md § 9.
 Navn uten domene slås opp i bolker: POST /finans/api/logos52/batch {names} → {items: {navn: {id, url, initial, color}}}.
 Serveren svarer bare fra logobiblioteket og logoer den allerede har lagret – aldri eksterne oppslag. `url: null` → forbokstav.
 Eldre server (404): PaperLogo bruker den gamle veien (logobiblioteket på enheten). */

@MainActor
final class Logos52 {
    static let shared = Logos52()

    /// navn (små bokstaver) → url ("" = ingen logo).
    private var urls: [String: String] = [:]
    private var colors: [String: String] = [:]
    private var waiting: [String: [CheckedContinuation<String?, Never>]] = [:]
    private var queue: [String] = []
    private var flushTask: Task<Void, Never>? = nil
    /// Serveren mangler logos52 (eldre versjon).
    private(set) var unsupported: Bool = false

    nonisolated static func norm(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    /// Logo-adressen for butikknavnet (nil = ingen logo eller ukjent). Samler forespørsler i 80 ms og sender én bolk.
    func url(for name: String, _ store: Store) async -> String? {
        let k: String = Logos52.norm(name)
        if k.isEmpty || unsupported { return nil }
        if let u = urls[k] { return u.isEmpty ? nil : u }
        return await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
            if waiting[k] == nil {
                waiting[k] = [c]
                queue.append(name)
            } else {
                waiting[k]?.append(c)
            }
            scheduleFlush(store)
        }
    }

    /// Fargen serveren foreslår for forbokstaven (nil = ingen).
    func color(for name: String) -> String? { colors[Logos52.norm(name)] }

    private func scheduleFlush(_ store: Store) {
        if flushTask != nil { return }
        flushTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 80_000_000)
            await self.flush(store)
        }
    }

    private func flush(_ store: Store) async {
        let names: [String] = Array(queue.prefix(200))
        queue.removeFirst(names.count)
        flushTask = nil
        var found: [String: String] = [:]
        do {
            let d: Data = try await store.api.callAt("/finans/api", "POST", "/logos52/batch", json: ["names": names], timeout: 15)
            let items: [String: Any] = JS.dict(JS.obj(d), "items") ?? [:]
            for (n, v) in items {
                let o: [String: Any]? = v as? [String: Any]
                found[Logos52.norm(n)] = JS.str(o, "url") ?? ""
                if let c = JS.str(o, "color") { colors[Logos52.norm(n)] = c }
            }
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            unsupported = true
        } catch {}
        for n in names {
            let k: String = Logos52.norm(n)
            let u: String? = found[k]
            // Ingen svar (nett) bufres ikke, så neste visning prøver igjen.
            if let u { urls[k] = u }
            let list: [CheckedContinuation<String?, Never>] = waiting.removeValue(forKey: k) ?? []
            for c in list { c.resume(returning: (u ?? "").isEmpty ? nil : u) }
        }
        if !queue.isEmpty { scheduleFlush(store) }
    }
}
