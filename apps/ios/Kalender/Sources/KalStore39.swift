import SwiftUI
import UIKit

/* ---------------- Prompt 39: Kalender – fire kalendere: lagring for Kalendere (1a), Rediger (1b) og Legg til (1c) ---------------- */
// PATCH /api/kalender/calendars/:id {name, color, visible, notify, showInBrief, interval, country} (SERVER39; eldre servere ignorerer feltene).
// Lokale valg (farge, vis/skjul) går via de eksisterende funksjonene, så de huskes til serveren har bekreftet.

/// Det som endres i Rediger (1b).
struct KalCalDraft39: Equatable {
    var name: String = ""
    var hex: String = "#b23a2a"
    var visible: Bool = true
    var notify: Bool = true
    var brief: Bool = true
    var fag: Bool = true
    var interval: String = "1h"
    var country: String = "NO"
}

extension KalStore {
    /* ---------- Navigasjon ---------- */

    func openCals39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) { cals39Open = true }
    }

    func closeCals39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) {
            cal39Edit = nil
            cals39Open = false
        }
    }

    func editCal39(_ id: String?) {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) { cal39Edit = id }
    }

    func openAdd39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)) { cal39AddOpen = true }
    }

    func openGMap39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)) {
            cal39AddOpen = false
            gmap39Open = true
        }
    }

    /* ---------- Data ---------- */

    /// Kalenderne i 1a: de fire først, så egne.
    var cals39: [KalCal] { cals.uniqueIds() }

    func draft39(_ c: KalCal) -> KalCalDraft39 {
        var d: KalCalDraft39 = KalCalDraft39()
        d.name = c.name
        d.hex = c.hex
        d.visible = c.on
        d.notify = c.p39?.notify ?? KalCals39.notifyDefault(c)
        d.brief = c.p39?.showInBrief ?? true
        d.fag = c.p39?.subjectColors ?? ((UserDefaults.standard.object(forKey: "kal.fag39") as? Bool) ?? true)
        d.interval = (c.p39?.interval ?? "").isEmpty ? "1h" : (c.p39?.interval ?? "1h")
        d.country = (c.p39?.country ?? "").isEmpty ? "NO" : (c.p39?.country ?? "NO")
        return d
    }

    /// Lagre i Rediger. → feilmelding (tom = ok).
    func saveCal39(_ c: KalCal, _ d: KalCalDraft39) async -> String {
        let old: KalCalDraft39 = draft39(c)
        if d.hex.lowercased() != c.hex.lowercased() { setColor(c.id, d.hex) }
        if d.visible != c.on { setCal(c.id, on: d.visible) }
        var body: [String: Any] = [:]
        let name: String = d.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty && name != c.name { body["name"] = name }
        if d.notify != old.notify { body["notify"] = d.notify }
        if d.brief != old.brief { body["showInBrief"] = d.brief }
        if d.interval != old.interval && KalCals39.role(c) == "s" { body["interval"] = d.interval }
        if d.country != old.country && KalCals39.role(c) == "h" { body["country"] = d.country }
        if let i = cals.firstIndex(where: { (x: KalCal) -> Bool in x.id == c.id }) {
            if !name.isEmpty { cals[i].name = name }
            var info: KalCalInfo39 = cals[i].p39 ?? KalCalInfo39()
            info.notify = d.notify
            info.showInBrief = d.brief
            info.subjectColors = d.fag
            if KalCals39.role(c) == "s" { info.interval = d.interval }
            if KalCals39.role(c) == "h" {
                info.country = d.country
                info.sourceLabel = KalCals39.countryName(d.country)
            }
            cals[i].p39 = info
        }
        if d.fag != old.fag {
            UserDefaults.standard.set(d.fag, forKey: "kal.fag39")
            // Eget kall: eldre servere avviser ukjente nøkler, og da skal ikke resten feile.
            let id: String = c.id
            let fag: Bool = d.fag
            Task { _ = await KalCalAPI39.save(id, ["subjectColors": fag]) }
        }
        rebuild()
        saveSnapshot()
        if body.isEmpty || !serverCals || (c.p39?.localHolidays ?? false) { return "" }
        let err: String = await KalCalAPI39.save(c.id, body)
        if err.isEmpty { await load(force: true) }
        return err
    }

    /// «Lim inn ny URL»: adressen fra utklippstavlen. → feilmelding (tom = ok).
    func pasteUrl39(_ c: KalCal) async -> String {
        let raw: String = (UIPasteboard.general.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !KalCalAPI39.validIcs(raw) { return "Kopier en webcal:// eller https://-adresse først." }
        let err: String = await KalCalAPI39.save(c.id, ["url": raw])
        if err.isEmpty {
            showToast("Ny adresse for «" + c.name + "» lagret", undo: "")
            await load(force: true)
        }
        return err
    }

    /// «↻ Oppdater nå».
    func refreshCal39(_ c: KalCal) async -> String {
        let err: String = await KalCalAPI39.refresh(c.id)
        if err.isEmpty {
            showToast("«" + c.name + "» er oppdatert", undo: "")
            await load(force: true)
        }
        return err
    }

    /// Skole uten adresse får URL-en (Legg til Skole) – ellers et nytt abonnement.
    func addUrl39(url: String, name: String) async -> String {
        if let sk = cals.first(where: { (c: KalCal) -> Bool in KalCals39.role(c) == "s" }), (sk.p39?.url ?? "").isEmpty, KalCals39.serverKnows {
            let err: String = await KalCalAPI39.save(sk.id, ["url": url.trimmingCharacters(in: .whitespacesAndNewlines)])
            if err.isEmpty {
                showToast("Skole abonnerer nå på " + KalCals39.host(url), undo: "")
                await load(force: true)
            }
            return err
        }
        return await addIcal(url: url, name: name, hex: KalCals39.colors["s"] ?? "#2f7a4f")
    }

    /* ---------- Opprydding 12 → 4 ---------- */

    /// «Vi ryddet kalenderne: 12 → 4» vises én gang.
    var migration39Text: String {
        let m: KalMigration39 = KalCals39.migration
        let seen: String = UserDefaults.standard.string(forKey: "kal.mig39") ?? ""
        if m.done && m.from > m.to {
            if seen == "s:" + m.undoUntil { return "" }
            return "Vi ryddet kalenderne: " + String(m.from) + " → " + String(m.to) + "."
        }
        if !KalCals39.serverKnows && KalCals39.mergedFrom > 0 && seen.isEmpty {
            return "Vi ryddet kalenderne: " + String(KalCals39.mergedFrom) + " → 4. Hendelsene ligger i Personlig og Skole."
        }
        return ""
    }

    func dismissMigration39() {
        let m: KalMigration39 = KalCals39.migration
        UserDefaults.standard.set(m.done ? "s:" + m.undoUntil : "local", forKey: "kal.mig39")
        rebuild()
    }

    func undoMigration39() async {
        let err: String = await KalCalAPI39.undoMigration()
        if err.isEmpty {
            showToast("Kalenderne er satt tilbake som før", undo: "")
            dismissMigration39()
            await load(force: true)
        } else {
            showToast(err, undo: "")
        }
    }
}

extension KalStore {
    /// Prompt 39: én gang etter oppryddingen på serveren: «Vi ryddet kalenderne: 12 → 4» med Angre.
    func announceMigration39() {
        let m: KalMigration39 = KalCals39.migration
        guard m.done, m.from > m.to else { return }
        let key: String = "kal.mig39toast"
        let mark: String = m.undoUntil.isEmpty ? "done" : m.undoUntil
        if UserDefaults.standard.string(forKey: key) == mark { return }
        UserDefaults.standard.set(mark, forKey: key)
        showToast("Vi ryddet kalenderne: " + String(m.from) + " → " + String(m.to), undo: m.canUndo ? "mig39" : "")
    }
}
