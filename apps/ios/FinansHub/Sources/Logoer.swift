import Foundation
import UIKit
import SwiftUI

/* ---------------- Prompt 20: logobiblioteket fra serveren ---------------- */

/// Ett merke i registeret (GET /finans/api/logos/registry).
struct LogoItem20: Hashable {
    let id: String
    let navn: String
    let domene: String
    let alias: [String]
    let farge: String
    let hasFile: Bool
    /// Prompt 22: «manuell» for kontrollerte logoer (fraktselskapene), ellers kilden fra fetch-logos.
    var kilde: String = ""
}

/// Registeret caches på disk (Caches/logos20/registry.json) og oppdateres høyst én gang i døgnet. Filene hentes fra
/// /finans/api/logos/file/:id og lagres som Caches/logos20/<id>.png. 404 (eldre server eller manglende fil) gir nil, så
/// appen faller tilbake til /finans/api/logo/<domene> eller forbokstaven.
@MainActor
final class LogoRegistry20 {
    static let shared = LogoRegistry20()

    private var byDomain: [String: LogoItem20] = [:]
    private var byId: [String: LogoItem20] = [:]
    private var keys: [(String, LogoItem20)] = []
    private var loaded = false
    private var unsupported = false
    private var loadTask: Task<Void, Never>?
    private var memo: [String: UIImage] = [:]
    private var missing: Set<String> = []
    private var lastAttempt: Date = .distantPast

    private static let refreshKey: String = "fh_logo_registry_at"

    private var dir: URL? {
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let d: URL = base.appendingPathComponent("logos20", isDirectory: true)
        if !FileManager.default.fileExists(atPath: d.path) {
            try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        }
        return d
    }

    /// Tømmes fra Innstillinger → «Tøm hurtigbuffer». Filene på disk beholdes ikke heller.
    func clear() {
        memo = [:]
        missing = []
        loaded = false
        unsupported = false
        lastAttempt = .distantPast
        byDomain = [:]
        keys = []
        UserDefaults.standard.removeObject(forKey: LogoRegistry20.refreshKey)
        if let d = dir { try? FileManager.default.removeItem(at: d) }
    }

    /* ---------- Registeret ---------- */

    func ensure(_ api: API) async {
        if unsupported || api.base.isEmpty { return }
        if let t = loadTask {
            await t.value
            return
        }
        let last: Date = (UserDefaults.standard.object(forKey: LogoRegistry20.refreshKey) as? Date) ?? .distantPast
        if loaded && Date().timeIntervalSince(last) < 24 * 3600 { return }
        // Feilet nylig (nett nede): ikke prøv på nytt for hver logo.
        if Date().timeIntervalSince(lastAttempt) < 60 { return }
        lastAttempt = Date()
        let t: Task<Void, Never> = Task { await self.fetch(api) }
        loadTask = t
        await t.value
        loadTask = nil
    }

    private func fetch(_ api: API) async {
        if !loaded, let d = dir, let data = try? Data(contentsOf: d.appendingPathComponent("registry.json")) {
            apply(data)
        }
        let last: Date = (UserDefaults.standard.object(forKey: LogoRegistry20.refreshKey) as? Date) ?? .distantPast
        if loaded && Date().timeIntervalSince(last) < 24 * 3600 { return }
        do {
            // URLSession sender If-None-Match selv når svaret har ETag og ligger i URLCache.
            let data: Data = try await api.bytes("/finans/api/logos/registry")
            apply(data)
            if let d = dir { try? data.write(to: d.appendingPathComponent("registry.json"), options: .atomic) }
            UserDefaults.standard.set(Date(), forKey: LogoRegistry20.refreshKey)
        } catch let e as APIError where e.status == 404 {
            if !loaded { unsupported = true }
        } catch {
            // Nettfeil: prøv igjen neste gang.
        }
    }

    private func apply(_ data: Data) {
        let o: [String: Any] = JS.obj(data)
        let rows: [[String: Any]] = JS.list(o, "items")
        guard !rows.isEmpty else { return }
        var dom: [String: LogoItem20] = [:]
        var ids: [String: LogoItem20] = [:]
        var k: [(String, LogoItem20)] = []
        for r in rows {
            guard let id = JS.str(r, "id") else { continue }
            let item = LogoItem20(id: id, navn: JS.str(r, "navn") ?? id, domene: LogoRegistry20.cleanDomain(JS.str(r, "domene") ?? ""),
                                  alias: JS.strings(r, "alias"), farge: JS.str(r, "farge") ?? "", hasFile: JS.bool(r, "hasFile") ?? false,
                                  kilde: JS.str(r, "kilde") ?? "")
            ids[id] = item
            if !item.domene.isEmpty && dom[item.domene] == nil { dom[item.domene] = item }
            let names: [String] = [item.navn] + item.alias
            for n in names {
                let key: String = LogoRegistry20.norm(n)
                if key.count >= 3 { k.append((key, item)) }
            }
        }
        // Lengste nøkkel først, så «coop extra» vinner over «coop».
        k.sort { $0.0.count > $1.0.count }
        byDomain = dom
        byId = ids
        keys = k
        loaded = true
    }

    /* ---------- Oppslag ---------- */

    static func cleanDomain(_ s: String) -> String {
        var d: String = s.lowercased().trimmingCharacters(in: .whitespaces)
        if d.hasPrefix("https://") { d = String(d.dropFirst(8)) }
        if d.hasPrefix("http://") { d = String(d.dropFirst(7)) }
        if d.hasPrefix("www.") { d = String(d.dropFirst(4)) }
        if let slash = d.firstIndex(of: "/") { d = String(d[..<slash]) }
        return d
    }

    /// Små bokstaver, æøå/ü til a/o/u, bare bokstaver og tall, og kjente prefikser (VIPPS*, KLARNA*, IZ * …) fjernet.
    static func norm(_ s: String) -> String {
        var t: String = s.lowercased()
        let swaps: [(String, String)] = [("æ", "ae"), ("ø", "o"), ("å", "a"), ("ü", "u"), ("ö", "o"), ("ä", "a"), ("é", "e")]
        for (a, b) in swaps { t = t.replacingOccurrences(of: a, with: b) }
        let prefixes: [String] = ["vipps*", "vipps ", "klarna*", "klarna ", "iz *", "iz*", "sumup *", "sumup*", "zettle_*", "zettle *", "paypal *", "paypal*", "nets*", "varekjop ", "kortkjop "]
        var changed: Bool = true
        while changed {
            changed = false
            for p in prefixes where t.hasPrefix(p) {
                t = String(t.dropFirst(p.count)).trimmingCharacters(in: .whitespaces)
                changed = true
            }
        }
        let allowed: CharacterSet = CharacterSet.alphanumerics
        let scalars: [Unicode.Scalar] = t.unicodeScalars.filter { allowed.contains($0) && $0.isASCII }
        var out: String = ""
        out.unicodeScalars.append(contentsOf: scalars)
        return out
    }

    /// Butikknavn eller banktekst → domenet i registeret (eksakt, så prefiks).
    func domain(forName name: String, api: API) async -> String? {
        let key: String = LogoRegistry20.norm(name)
        guard key.count >= 3 else { return nil }
        await ensure(api)
        if let hit = keys.first(where: { $0.0 == key }) { return hit.1.domene.isEmpty ? nil : hit.1.domene }
        if let hit = keys.first(where: { $0.0.count >= 4 && key.hasPrefix($0.0) }) { return hit.1.domene.isEmpty ? nil : hit.1.domene }
        return nil
    }

    /// Ferdig nedlastet logo for domenet (minne → disk → server). nil når registeret ikke har fil.
    func image(domain raw: String, api: API) async -> UIImage? {
        let domain: String = LogoRegistry20.cleanDomain(raw)
        guard !domain.isEmpty else { return nil }
        await ensure(api)
        guard let item = byDomain[domain], item.hasFile, !missing.contains(item.id) else { return nil }
        return await file(item, api: api)
    }

    /// Prompt 22: logo for fraktselskapet bare når den er manuelt kontrollert (kilde «manuell»). Ellers nil, så appen
    /// viser fargefyll med navnet i stedet for et tilfeldig favicon.
    func manualImage(id: String, api: API) async -> UIImage? {
        await ensure(api)
        guard let item = byId[id], item.hasFile, item.kilde == "manuell", !missing.contains(item.id) else { return nil }
        return await file(item, api: api, key: item.id + "-manuell")
    }

    /// key: navnet i minnet og på disk (manuelle logoer får egen nøkkel, så en gammel favicon-fil i hurtigbufferen ikke brukes).
    private func file(_ item: LogoItem20, api: API, key: String? = nil) async -> UIImage? {
        let k: String = key ?? item.id
        if let m = memo[k] { return m }
        let file: URL? = dir?.appendingPathComponent(k + ".png")
        if let file, let data = try? Data(contentsOf: file), let img = UIImage(data: data) {
            memo[k] = img
            return img
        }
        let enc: String = item.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? item.id
        do {
            let data: Data = try await api.bytes("/finans/api/logos/file/" + enc)
            guard let img = UIImage(data: data) else { return nil }
            memo[k] = img
            if let file { try? data.write(to: file, options: .atomic) }
            return img
        } catch let e as APIError where e.status == 404 {
            missing.insert(item.id)
            return nil
        } catch {
            return nil
        }
    }
}

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
