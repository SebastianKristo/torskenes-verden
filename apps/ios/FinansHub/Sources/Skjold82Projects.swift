import SwiftUI
import UIKit

/* ---------------- Prompt 82 (CHKIOS): Skjold Lab – sjekk ut deler til et produkt (og sjekk inn igjen) ----------------
 Kontrakt: CONTRACT82.md. Når deler brukes i noe man bygger, sjekkes de ut: lageret trekkes fra, og appen husker hvilket
 produkt de gikk til. Server (CHKSRV, server/skjold76/projects82.js), per bruker, under /api/skjold:
   GET /projects → [{id, name, status 'aktiv'|'ferdig', notes, parts, units, cost|null, updated}] (aktive først)
   POST /projects {name, notes?} · PATCH /projects/:id {name?, notes?, status?} · DELETE /projects/:id (409 med aktive utsjekkinger)
   GET /projects/:id → prosjekt + items:[{usageId, partId, name, thumbUrl, qty, returnedQty, at, loc, unit, price}]
   POST /checkout {projectId | projectName, items:[{partId, qty}], note?} → {project, usages, undoToken}
     (alt eller ingenting: 409 når en del ikke har nok på lager)
   POST /checkout/undo {undoToken} (10 min) · POST /usage/:id/return {qty} (≤ qty − returnedQty)
   GET /parts/:id får usedIn:[{projectId, name, qty, status}]
 Plukklista kan sende «Ta ut av lager» til et produkt (samme utsjekking). Navn maks 80 tegn. */

struct Skj82Project: Identifiable, Hashable {
    var id: String
    var name: String = ""
    var status: String = "aktiv"
    var notes: String = ""
    var parts: Int = 0
    var units: Double = 0
    var cost: Double? = nil
    var updated: Date? = nil

    var done: Bool { status == "ferdig" }
}

/// Én utsjekking (usage-rad).
struct Skj82Line: Identifiable, Hashable {
    var usageId: String
    var partId: String = ""
    var name: String = ""
    var thumbUrl: String = ""
    var qty: Double = 0
    var returnedQty: Double = 0
    var at: Date? = nil
    var loc: String = ""
    var unit: String = "stk"
    var price: Double? = nil
    var note: String = ""

    var id: String { usageId }
    /// Netto ute (ikke sjekket inn).
    var left: Double { Swift.max(0, qty - returnedQty) }
}

/// Én del i stykklista: summen av utsjekkingene og linjene.
struct Skj82Group: Identifiable, Hashable {
    var partId: String
    var name: String = ""
    var thumbUrl: String = ""
    var loc: String = ""
    var unit: String = "stk"
    var price: Double? = nil
    var lines: [Skj82Line] = []

    var id: String { partId }
    var left: Double { lines.reduce(0) { $0 + $1.left } }
}

/// «Brukt i» på delsiden.
struct Skj82Used: Identifiable, Hashable {
    var projectId: String
    var name: String
    var qty: Double
    var status: String

    var id: String { projectId }
}

/// Hvor utsjekkingen går: et eksisterende produkt eller et nytt navn.
struct Skj82Target: Hashable {
    var projectId: String = ""
    var newName: String = ""

    var valid: Bool { !projectId.isEmpty || !Skjold82.clean(newName).isEmpty }
}

/// Én del som sjekkes ut.
struct Skj82Take: Hashable {
    var partId: String
    var qty: Double
    var name: String = ""
    var unit: String = "stk"
}

@MainActor
@Observable
final class Skjold82 {
    static let shared = Skjold82()

    var projects: [Skj82Project] = []
    var details: [String: Skj82Project] = [:]
    var lines: [String: [Skj82Line]] = [:]
    var usedIn: [String: [Skj82Used]] = [:]
    var busy: Bool = false
    var loading: Bool = false
    /// Serveren har ikke /projects (404).
    var missing: Bool = false
    /// Siste feil i utsjekkingsarket (f.eks. 409 «ikke nok på lager»).
    var error: String = ""
    /// «Ta ut av lager» i plukklista: nil = ingen (som før).
    var pickTarget: Skj82Target? = nil
    /// Produktet siste utsjekking gikk til (et nytt navn får id her).
    var lastProjectId: String = ""

    nonisolated static let maxName: Int = 80

    private var m: Skjold76 { Skjold76.shared }

    var active: [Skj82Project] { projects.filter { !$0.done } }
    var finished: [Skj82Project] { projects.filter { $0.done } }

    func project(_ id: String) -> Skj82Project? { details[id] ?? projects.first { $0.id == id } }

    func groups(_ id: String) -> [Skj82Group] { Skjold82.group(lines[id] ?? []) }

    /// Aktive utsjekkinger (noe er ikke sjekket inn) – da kan produktet ikke slettes.
    func hasActive(_ id: String) -> Bool {
        if let l = lines[id] { return l.contains { $0.left > 0 } }
        return (project(id)?.units ?? 0) > 0
    }

    /* ---------- Lasting ---------- */

    func load(_ store: Store) async {
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/projects", timeout: 15)
            projects = Skjold76.rows(d, "projects").map { Skjold82.project($0) }
            missing = false
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {
            // Uten nett: behold siste liste.
        }
    }

    func loadProject(_ id: String, _ store: Store) async {
        if id.isEmpty { return }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/projects/\(id)", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            let po: [String: Any] = JS.dict(o, "project") ?? o
            var x: Skj82Project = Skjold82.project(po)
            if x.id.isEmpty { x.id = id }
            let list: [[String: Any]] = JS.list(o, "items").isEmpty ? JS.list(po, "items") : JS.list(o, "items")
            let ls: [Skj82Line] = Skjold82.lines(list)
            details[id] = x
            lines[id] = ls
            replace(x)
        } catch let e as APIError where e.status == 404 {
            details[id] = nil
            lines[id] = []
        } catch {
            // Uten nett: siste stykkliste vises.
        }
    }

    private func replace(_ x: Skj82Project) {
        if let i = projects.firstIndex(where: { $0.id == x.id }) { projects[i] = x }
    }

    /// Leser «Brukt i» fra GET /parts/:id (på toppnivå eller i «part»).
    func takeUsed(_ id: String, _ o: [String: Any]) {
        let pd: [String: Any]? = JS.dict(o, "part") ?? JS.dict(o, "item")
        let raw: [[String: Any]] = o["usedIn"] != nil ? JS.list(o, "usedIn") : JS.list(pd, "usedIn")
        usedIn[id] = Skjold82.used(raw)
    }

    /* ---------- Produkter ---------- */

    /// Nytt produkt. Svarer med id-en, eller nil ved feil.
    func create(_ name: String, notes: String, _ store: Store) async -> String? {
        let n: String = Skjold82.clean(name)
        if n.isEmpty { return nil }
        var body: [String: Any] = ["name": n]
        if !notes.isEmpty { body["notes"] = notes }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/projects", json: body, timeout: 15)
            let o: [String: Any] = JS.obj(d)
            let x: Skj82Project = Skjold82.project(JS.dict(o, "project") ?? o)
            Haptics.shared.success()
            m.flash("Opprettet «" + n + "»")
            await load(store)
            return x.id.isEmpty ? nil : x.id
        } catch {
            m.fail(error)
            return nil
        }
    }

    func patch(_ id: String, _ body: [String: Any], _ msg: String, _ store: Store) async {
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "PATCH", Skjold76.root + "/projects/\(id)", json: body, timeout: 15)
            Haptics.shared.success()
            m.flash(msg)
            await loadProject(id, store)
            await load(store)
        } catch {
            m.fail(error)
        }
    }

    func rename(_ id: String, _ name: String, _ store: Store) async {
        let n: String = Skjold82.clean(name)
        if n.isEmpty { return }
        await patch(id, ["name": n], "Nytt navn: «" + n + "»", store)
    }

    func setDone(_ id: String, _ done: Bool, _ store: Store) async {
        let s: String = done ? "ferdig" : "aktiv"
        await patch(id, ["status": s], done ? "Markert som ferdig" : "Aktiv igjen", store)
    }

    /// Myk sletting – bare uten aktive utsjekkinger (ellers 409).
    func delete(_ id: String, _ store: Store) async -> Bool {
        let name: String = project(id)?.name ?? "Produktet"
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "DELETE", Skjold76.root + "/projects/\(id)", timeout: 15)
            Haptics.shared.warning()
            projects.removeAll { $0.id == id }
            details[id] = nil
            lines[id] = nil
            m.flash("Slettet «" + name + "»")
            await load(store)
            return true
        } catch let e as APIError where e.status == 409 {
            Haptics.shared.warning()
            m.flash(e.message.hasPrefix("Feil ") ? "Sjekk inn alle delene før du sletter produktet" : e.message)
            return false
        } catch {
            m.fail(error)
            return false
        }
    }

    /* ---------- Sjekk ut ---------- */

    /// Sjekker ut alle delene til produktet (alt eller ingenting). «Angre» i toasten legger alt tilbake.
    /// `undone` kjøres etter en vellykket angring (plukklista legger delene tilbake i lista).
    func checkout(_ takes: [Skj82Take], to t: Skj82Target, note: String, _ store: Store, undone: (() -> Void)? = nil) async -> Bool {
        let list: [Skj82Take] = takes.filter { $0.qty > 0 }
        if list.isEmpty || busy || !t.valid { return false }
        busy = true
        error = ""
        defer { busy = false }
        var body: [String: Any] = Skjold82.targetBody(t)
        body["items"] = list.map { (x: Skj82Take) -> [String: Any] in ["partId": Skjold76.idv(x.partId), "qty": x.qty] }
        let n: String = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !n.isEmpty { body["note"] = n }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/checkout", json: body, timeout: 20)
            let o: [String: Any] = JS.obj(d)
            let p: Skj82Project = Skjold82.project(JS.dict(o, "project") ?? [:])
            let name: String = p.name.isEmpty ? Skjold82.clean(t.newName) : p.name
            let token: String = JS.str(o, "undoToken") ?? ""
            lastProjectId = p.id
            Haptics.shared.success()
            let text: String = Skjold82.doneText(list, name)
            if token.isEmpty {
                m.flash(text)
            } else {
                m.offerUndo(text) { [weak self] in
                    guard let self else { return }
                    Task { @MainActor in
                        let ok: Bool = await self.undo(token, list, projectId: p.id, store)
                        if ok { undone?() }
                    }
                }
            }
            await after(list, projectId: p.id, store)
            return true
        } catch let e as APIError where e.status == 409 {
            Haptics.shared.warning()
            self.error = e.message.hasPrefix("Feil ") ? "Ikke nok på lager – ingenting ble sjekket ut." : e.message
            return false
        } catch {
            Haptics.shared.warning()
            let a: APIError? = error as? APIError
            self.error = (a?.status ?? 0) == 0 ? Skjold76.netMsg : (a?.message ?? error.localizedDescription)
            return false
        }
    }

    /// Angrer en utsjekking (POST /checkout/undo).
    func undo(_ token: String, _ list: [Skj82Take], projectId: String, _ store: Store) async -> Bool {
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/checkout/undo", json: ["undoToken": token], timeout: 15)
            Haptics.shared.success()
            m.flash("Angret – delene er tilbake på lager")
            await after(list, projectId: projectId, store)
            return true
        } catch {
            m.fail(error)
            return false
        }
    }

    /// Sjekker inn (returnerer) en del av en utsjekking.
    func giveBack(_ line: Skj82Line, qty: Double, projectId: String, _ store: Store) async {
        let q: Double = Swift.min(qty, line.left)
        if q <= 0 || busy { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/usage/\(line.usageId)/return", json: ["qty": q], timeout: 15)
            Haptics.shared.success()
            let name: String = project(projectId)?.name ?? "produktet"
            m.flash("Sjekket inn " + Skjold76.num(q) + " " + line.unit + " fra «" + name + "»")
            await after([Skj82Take(partId: line.partId, qty: q)], projectId: projectId, store)
        } catch {
            m.fail(error)
        }
    }

    /// Henter delene, lista og produktet på nytt etter en endring.
    private func after(_ list: [Skj82Take], projectId: String, _ store: Store) async {
        for x in list { await m.loadPart(x.partId, store) }
        await m.search(store)
        await load(store)
        if !projectId.isEmpty { await loadProject(projectId, store) }
    }

    /* ---------- Rene regler ---------- */

    /// Trimmet navn, maks 80 tegn.
    nonisolated static func clean(_ s: String) -> String {
        let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return String(t.prefix(Skjold82.maxName))
    }

    nonisolated static func targetBody(_ t: Skj82Target) -> [String: Any] {
        if !t.projectId.isEmpty { return ["projectId": Skjold76.idv(t.projectId)] }
        return ["projectName": clean(t.newName)]
    }

    /// «Sjekket ut 3 stk til «Værstasjon»» (én del) eller «Sjekket ut 4 deler til «Værstasjon»».
    nonisolated static func doneText(_ list: [Skj82Take], _ name: String) -> String {
        if list.count == 1, let x = list.first {
            return "Sjekket ut " + Skjold76.num(x.qty) + " " + x.unit + " til «" + name + "»"
        }
        return "Sjekket ut \(list.count) deler til «" + name + "»"
    }

    /// Hvor mange som kan sjekkes ut (1 … lager).
    nonisolated static func clamp(_ n: Int, stock: Double) -> Int {
        let top: Int = Swift.max(1, Int(stock.rounded(.down)))
        return Swift.max(1, Swift.min(top, n))
    }

    nonisolated static func project(_ o: [String: Any]) -> Skj82Project {
        var x: Skj82Project = Skj82Project(id: JS.str(o, "id") ?? "")
        x.name = JS.str(o, "name") ?? ""
        x.status = JS.str(o, "status") ?? "aktiv"
        x.notes = JS.str(o, "notes") ?? ""
        x.parts = JS.int(o, "parts") ?? 0
        x.units = JS.num(o, "units") ?? 0
        x.cost = JS.num(o, "cost")
        x.updated = JS.date(o["updated"])
        return x
    }

    /// Linjene: enten flate usage-rader, eller gruppert per del med «lines» inni.
    nonisolated static func lines(_ items: [[String: Any]]) -> [Skj82Line] {
        var out: [Skj82Line] = []
        for it in items {
            let sub: [[String: Any]] = JS.list(it, "lines") + JS.list(it, "usages")
            if sub.isEmpty {
                out.append(line(it, parent: nil))
            } else {
                for s in sub { out.append(line(s, parent: it)) }
            }
        }
        return out.filter { !$0.usageId.isEmpty }
    }

    nonisolated static func line(_ o: [String: Any], parent: [String: Any]?) -> Skj82Line {
        var x: Skj82Line = Skj82Line(usageId: JS.str(o, "usageId") ?? JS.str(o, "id") ?? "")
        x.partId = JS.str(o, "partId") ?? JS.str(parent, "partId") ?? ""
        x.name = JS.str(o, "name") ?? JS.str(parent, "name") ?? ""
        x.thumbUrl = Skjold76.path(JS.str(o, "thumbUrl") ?? JS.str(parent, "thumbUrl"))
        x.qty = JS.num(o, "qty") ?? 0
        x.returnedQty = JS.num(o, "returnedQty") ?? JS.num(o, "returned_qty") ?? 0
        x.at = JS.date(o["at"])
        x.loc = JS.str(o, "loc") ?? JS.str(parent, "loc") ?? ""
        x.unit = JS.str(o, "unit") ?? JS.str(parent, "unit") ?? "stk"
        x.price = JS.num(o, "price") ?? JS.num(parent, "price")
        x.note = JS.str(o, "note") ?? ""
        return x
    }

    /// Grupperer per del i den rekkefølgen delene først dukker opp.
    nonisolated static func group(_ list: [Skj82Line]) -> [Skj82Group] {
        var order: [String] = []
        var map: [String: Skj82Group] = [:]
        for x in list {
            if var g = map[x.partId] {
                g.lines.append(x)
                map[x.partId] = g
            } else {
                order.append(x.partId)
                map[x.partId] = Skj82Group(partId: x.partId, name: x.name, thumbUrl: x.thumbUrl, loc: x.loc, unit: x.unit, price: x.price, lines: [x])
            }
        }
        return order.compactMap { map[$0] }
    }

    nonisolated static func used(_ raw: [[String: Any]]) -> [Skj82Used] {
        let all: [Skj82Used] = raw.map { (o: [String: Any]) -> Skj82Used in
            Skj82Used(projectId: JS.str(o, "projectId") ?? JS.str(o, "id") ?? "", name: JS.str(o, "name") ?? "Produkt",
                      qty: JS.num(o, "qty") ?? 0, status: JS.str(o, "status") ?? "aktiv")
        }
        return all.filter { !$0.projectId.isEmpty && $0.qty > 0 }
    }

    /// «1 240 kr» / «–» når ingen pris finnes.
    nonisolated static func costText(_ c: Double?) -> String {
        guard let c else { return "–" }
        return Skjold76.num((c * 100).rounded() / 100) + " kr"
    }

    nonisolated static func statusText(_ s: String) -> String { s == "ferdig" ? "Ferdig" : "Aktiv" }
}
