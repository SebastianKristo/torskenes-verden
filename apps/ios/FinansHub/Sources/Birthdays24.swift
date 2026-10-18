import SwiftUI
import UIKit
import WidgetKit
import AuthenticationServices

/* ---------------- Prompt 24: Bursdager (Mer → Bursdager), data ---------------- */
// Fasit: design/Bursdager.dc.html (variant «mobile»). Alt er per bruker på serveren (/api/birthdays).
// Svarer serveren 404 (eldre homelab), lagres bursdagene bare på denne telefonen, per konto.

struct Birthday24: Identifiable, Hashable {
    var id: String
    var name: String
    var month: Int
    var day: Int
    var year: Int?
    var age: Int?
    var daysLeft: Int
    var next: Date
    /// familie, venn, jobb eller annet.
    var relation: String
    /// 0, 1, 7 eller nil (ingen påminnelse).
    var reminderDays: Int?
    /// local, google eller ha.
    var source: String
    var avatarUrl: String

    init?(_ o: [String: Any]) {
        guard let w = BirthdayShared24.item(o) else { return nil }
        id = w.id
        name = w.name
        month = w.month
        day = w.day
        year = w.year
        age = w.age
        daysLeft = w.daysLeft
        next = BirthdayShared24.nextDate(month: w.month, day: w.day)
        relation = w.relation.lowercased()
        source = w.source.lowercased()
        avatarUrl = w.avatarUrl
        if o["reminderDays"] is NSNull {
            reminderDays = nil
        } else {
            reminderDays = JS.int(o, "reminderDays") ?? JS.int(o, "reminder_days") ?? 1
        }
    }

    var json: [String: Any] {
        var o: [String: Any] = ["id": id, "name": name, "month": month, "day": day, "relation": relation, "source": source]
        if let year { o["year"] = year }
        if let r = reminderDays { o["reminderDays"] = r } else { o["reminderDays"] = NSNull() }
        return o
    }

    var widget: BirthdayW24 {
        BirthdayW24(id: id, name: name, month: month, day: day, year: year, age: age, daysLeft: daysLeft,
                    relation: relation, source: source, avatarUrl: avatarUrl)
    }

    var initials: String { widget.initials }
    var color: Color { Color(hex: BirthdayShared24.relationHex(relation)) }
    var relationName: String { Birthday24.relationName(relation) }
    var shortDate: String { widget.shortDate }
    var whenText: String { widget.whenText }

    /// «lørdag 2. november»
    var longDate: String {
        let wd: Int = Calendar(identifier: .gregorian).component(.weekday, from: next)
        let m: Int = Swift.max(1, Swift.min(12, month))
        return BirthdayShared24.weekdays[(wd - 1) % 7] + " \(day). " + BirthdayShared24.monthsLong[m - 1]
    }

    /// «GOOGLE», «HOME ASSISTANT» eller «LOKAL».
    var sourceLabel: String {
        switch source {
        case "google": return "GOOGLE"
        case "ha": return "HOME ASSISTANT"
        default: return "LOKAL"
        }
    }

    static func relationName(_ r: String) -> String {
        switch r {
        case "familie": return "Familie"
        case "venn": return "Venn"
        case "jobb": return "Jobb"
        default: return "Annet"
        }
    }
}

/// Skjemaet for ny eller redigert bursdag.
struct BirthdayForm24: Equatable {
    var name: String = ""
    var day: Int = Calendar.current.component(.day, from: Date())
    var month: Int = Calendar.current.component(.month, from: Date())
    var year: String = ""
    var relation: String = "venn"
    /// -1 = ingen påminnelse.
    var reminder: Int = 1
    var saveTo: String = "local"
}

struct BirthdayCal24: Identifiable, Hashable {
    var id: String
    var name: String
}

@MainActor
@Observable
final class BirthdayModel24 {
    static let shared = BirthdayModel24()

    var items: [Birthday24] = []
    var loaded: Bool = false
    var loading: Bool = false
    /// true når serveren ikke har /api/birthdays ennå (404): alt lagres bare på telefonen.
    var offline: Bool = false
    var error: String? = nil
    var busy: String = ""

    var gConnected: Bool = false
    var gEmail: String = ""
    var gCalendarId: String = ""
    var gWriteNew: Bool = true
    var gContacts: Bool = true
    var gSyncedAt: Date? = nil
    var gCalendars: [BirthdayCal24] = []

    var haEntity: String = ""
    var haTwoWay: Bool = true
    var haSyncedAt: Date? = nil
    var haCalendars: [BirthdayCal24] = []

    /// Kontoen dataene hører til (brukerskillet: tømmes ved kontobytte).
    private var scope: String = ""

    private var localKey: String { AcctScope.key("fh_bd24_local") }

    private func checkScope() {
        let c: String = AcctScope.current
        if c != scope {
            scope = c
            items = []
            loaded = false
            offline = false
            gConnected = false
            gEmail = ""
            gCalendars = []
            haEntity = ""
            haCalendars = []
        }
    }

    /* ---------- Henting ---------- */

    func load(_ store: Store) async {
        checkScope()
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/birthdays", timeout: 20)
            apply(JS.obj(d))
            offline = false
            error = nil
        } catch let e as APIError {
            if e.status == 404 {
                offline = true
                items = loadLocal()
                error = nil
            } else {
                error = e.message
                if items.isEmpty { items = loadLocal() }
            }
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
        pushWidgets()
    }

    private func apply(_ o: [String: Any]) {
        let list: [Birthday24] = JS.list(o, "items").compactMap { Birthday24($0) }
        items = sorted(list)
        if let g = JS.dict(o, "google") {
            gConnected = JS.bool(g, "connected") ?? false
            gEmail = JS.str(g, "email") ?? ""
            gCalendarId = JS.str(g, "calendarId") ?? gCalendarId
            gWriteNew = JS.bool(g, "writeNew") ?? gWriteNew
            gContacts = JS.bool(g, "contacts") ?? gContacts
            gSyncedAt = JS.date(g["syncedAt"])
        }
        if let h = JS.dict(o, "ha") {
            haEntity = JS.str(h, "entityId") ?? ""
            haTwoWay = JS.bool(h, "twoWay") ?? haTwoWay
            haSyncedAt = JS.date(h["syncedAt"])
        }
        // Lokal kopi, så Hjem-kortet og widgetene har noe å vise uten nett.
        saveLocal(items)
    }

    private func sorted(_ l: [Birthday24]) -> [Birthday24] {
        l.sorted { a, b in a.daysLeft != b.daysLeft ? a.daysLeft < b.daysLeft : a.name.localizedCompare(b.name) == .orderedAscending }
    }

    private func loadLocal() -> [Birthday24] {
        guard let d = UserDefaults.standard.data(forKey: localKey),
              let raw = (try? JSONSerialization.jsonObject(with: d)) as? [Any] else { return [] }
        return sorted(raw.compactMap { $0 as? [String: Any] }.compactMap { Birthday24($0) })
    }

    private func saveLocal(_ l: [Birthday24]) {
        let raw: [[String: Any]] = l.map { $0.json }
        if let d = try? JSONSerialization.data(withJSONObject: raw) { UserDefaults.standard.set(d, forKey: localKey) }
    }

    /// Widgetene (App Group) får de neste bursdagene og tegnes på nytt.
    func pushWidgets() {
        if let d = BirthdayShared24.compact(items.map { $0.widget }) {
            WidgetShared.defaults.set(d, forKey: BirthdayShared24.cacheKey)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: BirthdayShared24.widgetKind)
    }

    /* ---------- Legg til, rediger og slett ---------- */

    func save(_ f: BirthdayForm24, editId: String?, _ store: Store) async -> Bool {
        let name: String = f.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { store.flash("Skriv inn navn"); return false }
        let y: Int? = f.year.count == 4 ? Int(f.year) : nil
        var body: [String: Any] = ["name": name, "month": f.month, "day": f.day, "relation": f.relation]
        if let y { body["year"] = y } else { body["year"] = NSNull() }
        if f.reminder < 0 { body["reminderDays"] = NSNull() } else { body["reminderDays"] = f.reminder }
        if editId == nil { body["saveTo"] = f.saveTo }
        if offline {
            var o: [String: Any] = body
            o["id"] = editId ?? ("l" + String(Int(Date().timeIntervalSince1970 * 1000)))
            o["source"] = "local"
            guard let b = Birthday24(o) else { return false }
            var list: [Birthday24] = items.filter { $0.id != b.id }
            list.append(b)
            items = sorted(list)
            saveLocal(items)
            pushWidgets()
            store.flash("\(name) er lagret")
            return true
        }
        busy = "save"
        defer { busy = "" }
        do {
            if let id = editId {
                _ = try await store.api.callAt("/api", "PATCH", "/birthdays/\(enc(id))", json: body)
            } else {
                _ = try await store.api.callAt("/api", "POST", "/birthdays", json: body)
            }
            Haptics.shared.success()
            switch f.saveTo {
            case "google" where editId == nil: store.flash("\(name) er lagt i Google Kalender")
            case "ha" where editId == nil: store.flash("\(name) er lagt i Home Assistant")
            default: store.flash("\(name) er lagret")
            }
            await load(store)
            return true
        } catch let e as APIError {
            store.flash("Kunne ikke lagre: \(e.message)")
        } catch {
            store.flash("Kunne ikke lagre: \(error.localizedDescription)")
        }
        return false
    }

    func setReminder(_ b: Birthday24, _ days: Int?, _ store: Store) {
        Haptics.shared.select()
        if let i = items.firstIndex(where: { $0.id == b.id }) { items[i].reminderDays = days }
        saveLocal(items)
        guard !offline else { return }
        var body: [String: Any] = [:]
        if let days { body["reminderDays"] = days } else { body["reminderDays"] = NSNull() }
        let sent: [String: Any] = body
        let path: String = "/birthdays/" + enc(b.id)
        Task { _ = try? await store.api.callAt("/api", "PATCH", path, json: sent) }
    }

    func delete(_ b: Birthday24, _ store: Store) async {
        let before: [Birthday24] = items
        withAnimation(.easeOut(duration: 0.2)) { items.removeAll { $0.id == b.id } }
        saveLocal(items)
        pushWidgets()
        guard !offline else { store.flash("\(b.name) er slettet"); return }
        do {
            _ = try await store.api.callAt("/api", "DELETE", "/birthdays/\(enc(b.id))")
            store.flash("\(b.name) er slettet")
        } catch let e as APIError {
            items = before
            saveLocal(items)
            pushWidgets()
            store.flash("Kunne ikke slette: \(e.message)")
        } catch {
            items = before
            store.flash("Kunne ikke slette: \(error.localizedDescription)")
        }
    }

    /* ---------- Google Kalender ---------- */

    /// Åpner serverens innlogging (OAuth med PKCE styres av serveren) i ASWebAuthenticationSession.
    func googleLogin(_ store: Store) {
        guard !offline else { store.flash("Google Kalender krever at homelab er oppdatert"); return }
        guard let token = store.account?.token, !token.isEmpty else { store.flash("Logg inn først"); return }
        let base: String = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let t: String = token.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? token
        let ret: String = "finanshub://bursdager".addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        guard let url = URL(string: base + "/api/birthdays/google/auth?token=" + t + "&return=" + ret) else { return }
        busy = "g"
        BirthdayWebAuth24.shared.start(url) { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.busy = ""
                await self.load(store)
                if self.gConnected {
                    store.flash("Koblet til Google")
                    await self.loadGoogleCalendars(store)
                }
            }
        }
    }

    func loadGoogleCalendars(_ store: Store) async {
        guard gConnected, !offline else { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/birthdays/google/calendars", timeout: 20) else { return }
        gCalendars = BirthdayModel24.calendars(d)
    }

    func setGoogle(calendarId: String? = nil, writeNew: Bool? = nil, contacts: Bool? = nil, _ store: Store) {
        Haptics.shared.select()
        if let calendarId { gCalendarId = calendarId }
        if let writeNew { gWriteNew = writeNew }
        if let contacts { gContacts = contacts }
        let body: [String: Any] = ["calendarId": gCalendarId, "writeNew": gWriteNew, "contacts": gContacts]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/birthdays/google", json: body) }
    }

    func googleSync(_ store: Store) async {
        busy = "gsync"
        defer { busy = "" }
        do {
            _ = try await store.api.callAt("/api", "POST", "/birthdays/google/sync", timeout: 60)
            await load(store)
            store.flash("Synket med Google Kalender")
        } catch let e as APIError {
            store.flash("Kunne ikke synke: \(e.message)")
        } catch {
            store.flash("Kunne ikke synke: \(error.localizedDescription)")
        }
    }

    func googleLogout(_ store: Store) async {
        _ = try? await store.api.callAt("/api", "DELETE", "/birthdays/google")
        gConnected = false
        gEmail = ""
        gCalendars = []
        store.flash("Logget ut av Google")
        await load(store)
    }

    /* ---------- Home Assistant ---------- */

    func loadHaCalendars(_ store: Store) async {
        guard !offline else { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/birthdays/ha/calendars", timeout: 20) else { return }
        haCalendars = BirthdayModel24.calendars(d)
        if haEntity.isEmpty, let first = haCalendars.first { haEntity = first.id }
    }

    func setHa(entityId: String? = nil, twoWay: Bool? = nil, _ store: Store) {
        Haptics.shared.select()
        if let entityId { haEntity = entityId }
        if let twoWay { haTwoWay = twoWay }
        let body: [String: Any] = ["entityId": haEntity, "twoWay": haTwoWay]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/birthdays/ha", json: body) }
    }

    func haImport(_ store: Store) async {
        guard !offline else { store.flash("Home Assistant krever at homelab er oppdatert"); return }
        guard !haEntity.isEmpty else { store.flash("Velg en kalender først"); return }
        busy = "ha"
        defer { busy = "" }
        let before: Int = items.count
        do {
            _ = try await store.api.callAt("/api", "PUT", "/birthdays/ha", json: ["entityId": haEntity, "twoWay": haTwoWay])
            let d: Data = try await store.api.callAt("/api", "POST", "/birthdays/ha/import", timeout: 60)
            await load(store)
            let n: Int = JS.int(JS.obj(d), "imported") ?? Swift.max(0, items.count - before)
            store.flash(n > 0 ? "\(n) bursdager importert fra \(haEntity)" : "Ingen nye bursdager i \(haEntity)")
        } catch let e as APIError {
            store.flash("Kunne ikke importere: \(e.message)")
        } catch {
            store.flash("Kunne ikke importere: \(error.localizedDescription)")
        }
    }

    /// Kalenderlister: ["calendar.x"], [{id, summary}], [{entity_id, name}] eller {items:[…]}.
    nonisolated static func calendars(_ d: Data) -> [BirthdayCal24] {
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var raw: [Any] = []
        if let l = any as? [Any] { raw = l }
        else if let o = any as? [String: Any] { raw = (o["items"] as? [Any]) ?? (o["calendars"] as? [Any]) ?? [] }
        return raw.compactMap { v -> BirthdayCal24? in
            if let s = v as? String { return BirthdayCal24(id: s, name: s) }
            guard let o = v as? [String: Any] else { return nil }
            guard let id = JS.str(o, "id") ?? JS.str(o, "entity_id") ?? JS.str(o, "entityId") else { return nil }
            let name: String = JS.str(o, "summary") ?? JS.str(o, "name") ?? id
            return BirthdayCal24(id: id, name: name)
        }
    }

    private func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s }
}

/* ---------- Innlogging i nettleservindu ---------- */

/// ASWebAuthenticationSession mot serverens /api/birthdays/google/auth. Serveren sender til finanshub://bursdager
/// når den er ferdig; lukker brukeren vinduet, leses statusen likevel på nytt.
final class BirthdayWebAuth24: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = BirthdayWebAuth24()
    private var session: ASWebAuthenticationSession?

    @MainActor func start(_ url: URL, done: @escaping () -> Void) {
        let s = ASWebAuthenticationSession(url: url, callbackURLScheme: "finanshub") { [weak self] _, _ in
            self?.session = nil
            done()
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = false
        session = s
        if !s.start() {
            session = nil
            done()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { BirthdayWebAuth24.keyWindow() }
    }

    @MainActor private static func keyWindow() -> ASPresentationAnchor {
        let scenes: [UIWindowScene] = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for sc in scenes {
            if let w = sc.windows.first(where: { $0.isKeyWindow }) { return w }
        }
        if let w = scenes.first?.windows.first { return w }
        return ASPresentationAnchor()
    }
}
