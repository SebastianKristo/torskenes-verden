import SwiftUI
import UIKit

/* ---------------- Prompt 78 (LEDIOS): Skjold Lab med LED over hver skuff («vis meg hvor delen ligger») ----------------
 Kontrakt: CONTRACT78.md. En adresserbar stripe (WS2812B/SK6812) over hver skuffrad, styrt av en ESP32 med WLED.
 Appen snakker aldri med WLED selv: alt går via Homelab-serveren (LEDSRV, server/skjold76/leds78.js), per bruker, under /api/skjold:
   GET|PUT /cabinets/:id/leds {host, enabled, color, durationS, blink, brightness, rows:[{row,start,count,reverse,pitchMm,offsetMm}],
                               overrides:{"r-c": index}, drawerPitchMm, firstDrawerXmm}
   POST /cabinets/:id/leds/test {mode:'all'|'row'|'index', row?, index?} (lyser i 5 s)
   POST /locate {partId} | {cabinetId,row,col} | {partIds:[…]} → {ok, lit:[{cabinetId,row,col,index}], untilMs} · POST /locate/off
   (Prompt 79: {partIds, colors:true} → lit med partId og color per del, maks 20; POST /cabinets/:id/leds/diagnose)
   GET /leds/status?cabinet=<id> → {ok, name, ledCount, version}
   POST /cabinets/:id/leds/calibrate {index} (tenner én LED) · PUT /cabinets/:id/leds/override {row,col,index}
   GET|PUT /leds/settings {autoLocateOpen, autoLocateGlimt} (begge av som standard; lokal lagring hvis serveren mangler endepunktet)
 Indeksen regnes ut på serveren; utregningen her brukes bare til å vise «LED n» i oppsettet og veiviseren. */

/// Én rad av stripa: hvor raden starter på stripa, hvor mange LED-er den har og retningen.
struct Skj78Row: Identifiable, Hashable {
    var row: Int
    var start: Int = 0
    var count: Int = 18
    var reverse: Bool = false
    var pitchMm: Double = 16.667
    var offsetMm: Double = 0

    var id: Int { row }
}

/// LED-oppsettet for ett skap.
struct Skj78Config: Hashable {
    var host: String = ""
    var enabled: Bool = false
    var color: String = "#2F6BFF"
    var durationS: Int = 30
    var blink: Bool = false
    var brightness: Int = 128
    var drawerPitchMm: Double = 60
    var firstDrawerXmm: Double = 30
    /// LED-avstanden når radene lages automatisk (60/m → 16,667 mm).
    var ledPitchMm: Double = 16.667
    var rows: [Skj78Row] = []
    var overrides: [String: Int] = [:]

    var usable: Bool { enabled && !host.trimmingCharacters(in: .whitespaces).isEmpty }
    var ledTotal: Int { rows.reduce(0) { Swift.max($0, $1.start + $1.count) } }
}

/// Svar fra GET /leds/status.
struct Skj78Status: Hashable {
    var ok: Bool = false
    var name: String = ""
    var ledCount: Int = 0
    var version: String = ""
    var error: String = ""

    var text: String {
        if !ok { return error.isEmpty ? "WLED svarer ikke" : error }
        let n: String = name.isEmpty ? "WLED" : name
        let c: String = ledCount > 0 ? " · \(ledCount) LED-er" : ""
        return n + " svarer" + c + (version.isEmpty ? "" : " · v" + version)
    }
}

/// En skuff som lyser nå.
struct Skj78Lit: Hashable {
    var cabinetId: String
    var row: Int
    var col: Int
    var index: Int
    /// Prompt 79: delen som lyser og fargen den lyser i (plukklista, {partIds, colors:true}).
    var partId: String = ""
    var color: String = ""
}

@MainActor
@Observable
final class Skjold78 {
    static let shared = Skjold78()

    /// Oppsett per skap (hentet fra serveren).
    var configs: [String: Skj78Config] = [:]
    var status: [String: Skj78Status] = [:]
    var checking: Set<String> = []
    /// Serveren mangler LED-støtte (404): knappene skjules.
    var missing: Bool = false

    /* ---------- Innstillinger ---------- */
    var autoOpen: Bool = false
    var autoGlimt: Bool = false
    var settingsError: String = ""
    @ObservationIgnored private var localSettings: Bool = false

    /* ---------- Det som lyser nå ---------- */
    var lit: [Skj78Lit] = []
    var until: Date? = nil
    var busy: Bool = false
    var error: String = ""
    @ObservationIgnored private var clearTask: Task<Void, Never>? = nil
    @ObservationIgnored private var lastAuto: String = ""

    nonisolated static let defaultColor: String = "#2F6BFF"
    nonisolated static let swatches: [String] = ["#2F6BFF", "#18C964", "#FFB020", "#FF3B30", "#B455FF", "#FFFFFF"]
    nonisolated static let ledPer60: Double = 16.667
    nonisolated static let testSeconds: Int = 5
    private static let localKey: String = "skj78.settings"

    private var m: Skjold76 { Skjold76.shared }

    /// Minst ett skap har LED slått på.
    var anyEnabled: Bool { !missing && configs.values.contains { $0.usable } }

    func config(_ cabinetId: String) -> Skj78Config? { configs[cabinetId] }

    func canLocate(_ p: Skj76Part) -> Bool {
        guard let l = p.loc, !missing else { return false }
        return configs[l.cabinetId]?.usable ?? false
    }

    var secondsLeft: Int {
        guard let until else { return 0 }
        return Swift.max(0, Int(until.timeIntervalSinceNow.rounded(.up)))
    }

    /* ---------- Lasting ---------- */

    /// Henter oppsettet for alle skapene (kalles når Skjold Lab åpnes).
    func load(_ store: Store) async {
        await loadSettings(store)
        for c in m.cabinets {
            await loadConfig(c.id, store)
            if missing { return }
        }
    }

    func loadConfig(_ id: String, _ store: Store) async {
        if id.isEmpty || id == "ny" { return }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/cabinets/\(id)/leds", timeout: 15)
            configs[id] = Skjold78.config(JS.obj(d))
            missing = false
        } catch let e as APIError where e.status == 404 {
            // 404 før noe skap har svart = serveren har ikke LED ennå.
            missing = configs.isEmpty
        } catch {
            // Uten nett: behold det vi har.
        }
    }

    func saveConfig(_ id: String, _ c: Skj78Config, _ store: Store) async -> Bool {
        do {
            let path: String = Skjold76.root + "/cabinets/\(id)/leds"
            let d: Data = try await store.api.callAt(Skjold76.prefix, "PUT", path, json: Skjold78.body(c), timeout: 15)
            let o: [String: Any] = JS.obj(d)
            configs[id] = o.isEmpty ? c : Skjold78.config(o)
            Haptics.shared.success()
            m.flash("LED-oppsettet er lagret")
            return true
        } catch {
            m.fail(Skjold78.wrap(error))
            return false
        }
    }

    func checkStatus(_ id: String, _ store: Store) async {
        checking.insert(id)
        defer { checking.remove(id) }
        let path: String = Skjold76.root + "/leds/status?cabinet=" + Skjold76.enc(id)
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", path, timeout: 8)
            status[id] = Skjold78.status(JS.obj(d))
        } catch {
            status[id] = Skj78Status(ok: false, error: Skjold78.message(error))
        }
    }

    /* ---------- Innstillinger ---------- */

    func loadSettings(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/leds/settings", timeout: 10)
            applySettings(JS.obj(d))
            localSettings = false
            settingsError = ""
        } catch let e as APIError where e.status == 404 {
            localSettings = true
            readLocal()
        } catch {
            readLocal()
        }
    }

    private func applySettings(_ raw: [String: Any]) {
        let o: [String: Any] = JS.dict(raw, "settings") ?? raw
        autoOpen = JS.bool(o, "autoLocateOpen") ?? JS.bool(o, "autoLocate") ?? false
        autoGlimt = JS.bool(o, "autoLocateGlimt") ?? false
        writeLocal()
    }

    func saveSettings(_ store: Store) async {
        writeLocal()
        if localSettings { return }
        let body: [String: Any] = ["autoLocateOpen": autoOpen, "autoLocateGlimt": autoGlimt]
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "PUT", Skjold76.root + "/leds/settings", json: body, timeout: 10)
            let o: [String: Any] = JS.obj(d)
            if !o.isEmpty { applySettings(o) }
            settingsError = ""
            Haptics.shared.tick()
        } catch let e as APIError where e.status == 404 {
            localSettings = true
        } catch {
            settingsError = Skjold78.message(error)
        }
    }

    private func readLocal() {
        guard let o = UserDefaults.standard.dictionary(forKey: Skjold78.localKey) else { return }
        autoOpen = (o["autoLocateOpen"] as? Bool) ?? false
        autoGlimt = (o["autoLocateGlimt"] as? Bool) ?? false
    }

    private func writeLocal() {
        let o: [String: Any] = ["autoLocateOpen": autoOpen, "autoLocateGlimt": autoGlimt]
        UserDefaults.standard.set(o, forKey: Skjold78.localKey)
    }

    /* ---------- Vis i skapet ---------- */

    /// «💡 Vis i skapet» for én del.
    func locate(_ p: Skj76Part, _ store: Store) async {
        if let l = p.loc { m.highlight(l) }
        await send(["partId": Skjold76.idv(p.id)], store)
    }

    /// Lyser opp én skuff (fra skuffarket eller veiviseren).
    func locate(cabinetId: String, row: Int, col: Int, _ store: Store) async {
        let body: [String: Any] = ["cabinetId": Skjold76.idv(cabinetId), "row": row, "col": col]
        await send(body, store)
    }

    /// «💡 Vis alle treff i skapet»: maks 20 skuffer samtidig (Prompt 79, før 10).
    func locateAll(_ parts: [Skj76Part], _ store: Store) async {
        let ids: [Any] = parts.filter { canLocate($0) }.prefix(20).map { Skjold76.idv($0.id) }
        if ids.isEmpty { m.flash("Ingen av treffene ligger i et skap med LED"); return }
        await send(["partIds": ids], store)
    }

    /// Åpner man et treff med «Lys opp automatisk» på, tennes skuffen (én gang per del til en annen del åpnes).
    func autoOnOpen(_ p: Skj76Part, _ store: Store) async {
        if !autoOpen || !canLocate(p) || lastAuto == p.id { return }
        lastAuto = p.id
        await locate(p, store)
    }

    /// Prompt 79: plukklista – hver del i sin egen farge ({partIds, colors:true}). Gir hele svaret (med «skipped»).
    func locateMany(_ ids: [Any], colors: Bool, _ store: Store) async -> [String: Any] {
        var body: [String: Any] = ["partIds": ids]
        if colors { body["colors"] = true }
        let o: [String: Any] = await send(body, store)
        if !error.isEmpty { m.flash(error) }
        return o
    }

    /// Prompt 79: «Feilsøk LED» (POST /cabinets/:id/leds/diagnose, tar opptil ca. 10 s).
    func diagnose(_ id: String, _ store: Store) async throws -> [String: Any] {
        let path: String = Skjold76.root + "/cabinets/\(id)/leds/diagnose"
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", path, json: [:], timeout: 40)
            return JS.obj(d)
        } catch {
            throw Skjold78.wrap(error)
        }
    }

    @discardableResult
    private func send(_ body: [String: Any], _ store: Store) async -> [String: Any] {
        busy = true
        error = ""
        defer { busy = false }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/locate", json: body, timeout: 10)
            let o: [String: Any] = JS.obj(d)
            let list: [Skj78Lit] = JS.list(o, "lit").map { Skjold78.lit($0) }
            if list.isEmpty {
                error = JS.str(o, "error") ?? JS.str(o, "message") ?? "Fant ingen skuff med LED å lyse opp."
                return o
            }
            lit = list
            until = Skjold78.until(JS.num(o, "untilMs"))
            Haptics.shared.success()
            scheduleClear()
            return o
        } catch {
            self.error = Skjold78.message(error)
            Haptics.shared.warning()
            return [:]
        }
    }

    private func scheduleClear() {
        clearTask?.cancel()
        clearTask = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                if self.secondsLeft <= 0 {
                    self.lit = []
                    self.until = nil
                    return
                }
            }
        }
    }

    /// «Slå av»: slukker og gjenoppretter WLED slik den var.
    func off(_ store: Store) async {
        clearTask?.cancel()
        lit = []
        until = nil
        lastAuto = ""
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/locate/off", json: [:], timeout: 10)
        } catch {
            self.error = Skjold78.message(error)
        }
    }

    /* ---------- Test og kalibrering ---------- */

    /// Test: hele stripa, én rad eller én LED (lyser i 5 s).
    func test(_ id: String, mode: String, row: Int? = nil, index: Int? = nil, _ store: Store) async -> Bool {
        var body: [String: Any] = ["mode": mode]
        if let row { body["row"] = row }
        if let index { body["index"] = index }
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/cabinets/\(id)/leds/test", json: body, timeout: 10)
            Haptics.shared.tick()
            return true
        } catch {
            m.fail(Skjold78.wrap(error))
            return false
        }
    }

    /// Veiviseren: tenner én LED.
    func calibrate(_ id: String, index: Int, _ store: Store) async -> String {
        do {
            let path: String = Skjold76.root + "/cabinets/\(id)/leds/calibrate"
            _ = try await store.api.callAt(Skjold76.prefix, "POST", path, json: ["index": index], timeout: 10)
            return ""
        } catch {
            return Skjold78.message(error)
        }
    }

    /// Veiviseren: «denne skuffen» = denne LED-en.
    func override(_ id: String, row: Int, col: Int, index: Int?, _ store: Store) async -> Bool {
        var body: [String: Any] = ["row": row, "col": col, "index": NSNull()]
        if let index { body["index"] = index }
        do {
            let path: String = Skjold76.root + "/cabinets/\(id)/leds/override"
            let d: Data = try await store.api.callAt(Skjold76.prefix, "PUT", path, json: body, timeout: 10)
            let o: [String: Any] = JS.obj(d)
            var c: Skj78Config = configs[id] ?? Skj78Config()
            if !o.isEmpty && (o["leds"] != nil || o["rows"] != nil) {
                c = Skjold78.config(o)
            } else if let index {
                c.overrides["\(row)-\(col)"] = index
            } else {
                c.overrides.removeValue(forKey: "\(row)-\(col)")
            }
            configs[id] = c
            Haptics.shared.success()
            return true
        } catch {
            m.fail(Skjold78.wrap(error))
            return false
        }
    }

    /* ---------- Rene regler ---------- */

    /// Indeksen på stripa for skuffen (samme regel som serveren): overstyring først, ellers nærmeste LED over skuffens midtpunkt.
    nonisolated static func index(_ c: Skj78Config, row: Int, col: Int) -> Int? {
        if let o = c.overrides["\(row)-\(col)"] { return o }
        guard let r = c.rows.first(where: { $0.row == row }), r.count > 0, r.pitchMm > 0 else { return nil }
        let x: Double = c.firstDrawerXmm + Double(col - 1) * c.drawerPitchMm
        let raw: Int = Int(((x - r.offsetMm) / r.pitchMm).rounded())
        let i: Int = Swift.min(r.count - 1, Swift.max(0, raw))
        return r.start + (r.reverse ? r.count - 1 - i : i)
    }

    /// Hvilken skuff en LED hører til (for veiviseren): overstyring først, ellers raden den ligger i og nærmeste skuff.
    nonisolated static func drawer(_ c: Skj78Config, index: Int, cols: Int) -> (Int, Int)? {
        if let hit = c.overrides.first(where: { $0.value == index }) {
            let rc: [Int] = hit.key.split(separator: "-").compactMap { Int($0) }
            if rc.count == 2 { return (rc[0], rc[1]) }
        }
        guard let r = c.rows.first(where: { index >= $0.start && index < $0.start + $0.count }), c.drawerPitchMm > 0 else { return nil }
        let local: Int = r.reverse ? r.count - 1 - (index - r.start) : index - r.start
        let x: Double = r.offsetMm + Double(local) * r.pitchMm
        let col: Int = Int(((x - c.firstDrawerXmm) / c.drawerPitchMm).rounded()) + 1
        return (r.row, Swift.min(cols, Swift.max(1, col)))
    }

    /// Standard rader: hver rad får sin del av stripa, i samme retning eller serpentine (annenhver rad baklengs).
    nonisolated static func defaultRows(rows: Int, cols: Int, pitchMm: Double, drawerPitchMm: Double, serpentine: Bool) -> [Skj78Row] {
        let width: Double = Double(cols) * drawerPitchMm
        let count: Int = Swift.max(1, Int((width / Swift.max(1, pitchMm)).rounded()))
        // Første LED sitter en halv LED-avstand inn fra kanten (samme som serverens automatiske rader).
        let half: Double = (pitchMm / 2 * 1000).rounded() / 1000
        return (1...Swift.max(1, rows)).map { (r: Int) -> Skj78Row in
            Skj78Row(row: r, start: (r - 1) * count, count: count, reverse: serpentine && r % 2 == 0, pitchMm: pitchMm, offsetMm: half)
        }
    }

    /// LED-avstand fra «LED-er per meter» (60/m → 16,67 mm).
    nonisolated static func pitch(perMeter: Double) -> Double { perMeter > 0 ? (1000 / perMeter * 1000).rounded() / 1000 : ledPer60 }

    /// «#2f6bff» → «#2F6BFF»; ugyldig gir standardfargen.
    nonisolated static func hex(_ s: String) -> String {
        var t: String = s.trimmingCharacters(in: .whitespaces).uppercased()
        if t.hasPrefix("#") { t.removeFirst() }
        let ok: Bool = t.count == 6 && t.allSatisfy { $0.isHexDigit }
        return ok ? "#" + t : defaultColor
    }

    nonisolated static func color(_ s: String) -> Color {
        let t: String = String(hex(s).dropFirst())
        let v: UInt64 = UInt64(t, radix: 16) ?? 0x2F6BFF
        let r: Double = Double((v >> 16) & 0xFF) / 255
        let g: Double = Double((v >> 8) & 0xFF) / 255
        let b: Double = Double(v & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }

    /* ---------- Lesing ---------- */

    nonisolated static func config(_ raw: [String: Any]) -> Skj78Config {
        let o: [String: Any] = JS.dict(raw, "leds") ?? raw
        var c: Skj78Config = Skj78Config()
        c.host = JS.str(o, "host") ?? ""
        c.enabled = JS.bool(o, "enabled") ?? false
        c.color = hex(JS.str(o, "color") ?? defaultColor)
        c.durationS = JS.int(o, "durationS") ?? 30
        c.blink = JS.bool(o, "blink") ?? false
        c.brightness = JS.int(o, "brightness") ?? 128
        c.drawerPitchMm = JS.num(o, "drawerPitchMm") ?? JS.num(raw, "drawerPitchMm") ?? 60
        c.firstDrawerXmm = JS.num(o, "firstDrawerXmm") ?? JS.num(raw, "firstDrawerXmm") ?? 30
        c.ledPitchMm = JS.num(o, "ledPitchMm") ?? JS.num(raw, "ledPitchMm") ?? 16.667
        c.rows = JS.list(o, "rows").map { row($0) }.sorted { $0.row < $1.row }
        var ov: [String: Int] = [:]
        for (k, v) in JS.dict(o, "overrides") ?? [:] {
            if let n = (v as? NSNumber)?.intValue { ov[k] = n }
        }
        c.overrides = ov
        return c
    }

    nonisolated static func row(_ o: [String: Any]) -> Skj78Row {
        var r: Skj78Row = Skj78Row(row: JS.int(o, "row") ?? 1)
        r.start = JS.int(o, "start") ?? 0
        r.count = JS.int(o, "count") ?? 18
        r.reverse = JS.bool(o, "reverse") ?? false
        r.pitchMm = JS.num(o, "pitchMm") ?? ledPer60
        r.offsetMm = JS.num(o, "offsetMm") ?? 0
        return r
    }

    nonisolated static func body(_ c: Skj78Config) -> [String: Any] {
        let rows: [[String: Any]] = c.rows.map { (r: Skj78Row) -> [String: Any] in
            ["row": r.row, "start": r.start, "count": r.count, "reverse": r.reverse, "pitchMm": r.pitchMm, "offsetMm": r.offsetMm]
        }
        var o: [String: Any] = ["host": c.host.trimmingCharacters(in: .whitespaces), "enabled": c.enabled, "color": hex(c.color)]
        o["durationS"] = c.durationS
        o["blink"] = c.blink
        o["brightness"] = c.brightness
        o["rows"] = rows
        o["overrides"] = c.overrides
        o["drawerPitchMm"] = c.drawerPitchMm
        o["firstDrawerXmm"] = c.firstDrawerXmm
        o["ledPitchMm"] = c.ledPitchMm
        return o
    }

    nonisolated static func status(_ o: [String: Any]) -> Skj78Status {
        var s: Skj78Status = Skj78Status()
        s.ok = JS.bool(o, "ok") ?? false
        s.name = JS.str(o, "name") ?? ""
        s.ledCount = JS.int(o, "ledCount") ?? 0
        s.version = JS.str(o, "version") ?? ""
        s.error = JS.str(o, "error") ?? ""
        return s
    }

    nonisolated static func lit(_ o: [String: Any]) -> Skj78Lit {
        var x: Skj78Lit = Skj78Lit(cabinetId: JS.str(o, "cabinetId") ?? "", row: JS.int(o, "row") ?? 0, col: JS.int(o, "col") ?? 0, index: JS.int(o, "index") ?? 0)
        x.partId = JS.str(o, "partId") ?? ""
        let c: String = JS.str(o, "color") ?? ""
        x.color = c.isEmpty ? "" : hex(c)
        return x
    }

    /// untilMs: tidspunkt (epoch-ms) eller varighet i ms.
    nonisolated static func until(_ v: Double?) -> Date {
        guard let v, v > 0 else { return Date().addingTimeInterval(30) }
        if v > 1_000_000_000_000 { return Date(timeIntervalSince1970: v / 1000) }
        return Date().addingTimeInterval(v / 1000)
    }

    nonisolated static func message(_ e: Error) -> String {
        guard let a = e as? APIError else { return e.localizedDescription }
        if a.status == 0 { return Skjold76.netMsg }
        if a.status == 404 && (a.code ?? "").isEmpty { return "Serveren har ikke LED-støtte i Skjold Lab ennå (oppdater Homelab)." }
        if a.status == 429 { return "Vent litt – for mange LED-kall på kort tid." }
        if a.status == 504 || a.status == 408 { return "WLED svarte ikke i tide. Sjekk at kontrolleren er på og i hjemmenettet." }
        return a.message
    }

    nonisolated static func wrap(_ e: Error) -> Error {
        guard let a = e as? APIError else { return e }
        return APIError(message: message(a), status: a.status)
    }
}
