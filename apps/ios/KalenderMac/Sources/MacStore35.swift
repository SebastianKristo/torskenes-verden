import SwiftUI
import AppKit

/* ---------------- Prompt 35: Kalender for Mac – kalenderstyring og innstillinger (samme som iPhone-appen) ---------------- */
// Farge (12 valg), vis/skjul, «Skjul fra menyen», iCal-abonnement, Home Assistant og fjerning av egne kalendere.
// Valgene synkes til profilen: PATCH /api/kalender/calendars/:id og PUT /api/kalender/calendars/prefs.

extension MacStore {
    func savePrefs(_ body: [String: Any]) {
        Task { await KalCalAPI35.putPrefs(body) }
    }

    /// Valg fra profilen (bare feltene serveren sender).
    func applyServerPrefs(_ p: [String: String]) {
        if let v = p["weekStart"], (v == "mon" || v == "sun"), v != weekStart { weekStart = v }
        if let v = p["openView"], ["mnd", "uke", "3d", "dag", "liste"].contains(v), v != openView { openView = v }
        if let v = p["defaultDuration"], let n = Int(v), [30, 60, 90, 120].contains(n), n != defDur { defDur = n }
        if let v = p["timelineStart"], ["now", "06", "08"].contains(v), v != tlStart { tlStart = v }
        if let v = p["notifyBirthdays"], (v == "true") != nBd { nBd = v == "true" }
        if let v = p["notifyDeadlines"], (v == "true") != nFr { nFr = v == "true" }
        if let v = p["weekNumbers"], (v == "true") != showWeeks { showWeeks = v == "true" }
        if let v = p["weather"], (v == "true") != showWx { showWx = v == "true" }
        if let v = p["defaultReminder"], let m = KalCalAPI35.remFromServer(v), m != defRemRaw { defRemRaw = m }
    }

    func timelineHour(todayIn: Bool) -> Int {
        if tlStart == "06" { return 6 }
        if tlStart == "08" { return 8 }
        return todayIn ? Swift.max(0, KalD.minutesNow() / 60 - 2) : 7
    }

    var hiddenFromMenu: [KalCal] { cals.filter { (c: KalCal) -> Bool in !c.inMenu } }

    func setColor(_ id: String, _ hex: String) {
        guard let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) else { return }
        cals[i] = KalTone35.apply(cals[i], hex: hex)
        colLocal[id] = hex
        UserDefaults.standard.set(colLocal, forKey: "mac.calCol")
        rebuild()
        saveSnapshot()
        if serverCals {
            Task {
                if await KalCalAPI35.patch(id, ["color": hex]) != nil {
                    self.colLocal.removeValue(forKey: id)
                    UserDefaults.standard.set(self.colLocal, forKey: "mac.calCol")
                }
            }
        }
    }

    func setHidMenu(_ id: String, _ hide: Bool) {
        guard let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) else { return }
        cals[i].hidMenu = hide
        hidMenuLocal[id] = hide
        UserDefaults.standard.set(hidMenuLocal, forKey: "mac.hidMenu")
        rebuild()
        saveSnapshot()
        if serverCals {
            Task {
                if let d = await KalCalAPI35.patch(id, ["hidMenu": hide]), KalCalAPI35.echoes(d, "hidMenu") {
                    self.hidMenuLocal.removeValue(forKey: id)
                    UserDefaults.standard.set(self.hidMenuLocal, forKey: "mac.hidMenu")
                }
            }
        }
    }

    func addIcal(url: String, name: String, hex: String) async -> String {
        do {
            let made: KalCal? = try await KalCalAPI35.addIcal(url: url, name: name, color: hex)
            showToast("Abonnerer på «" + (made?.name ?? name) + "»", undo: "")
            await load(force: true)
            return ""
        } catch let e as KalNetError {
            if e.status == 404 { return "Serveren støtter ikke iCal-abonnement ennå. Oppdater Homelab." }
            return e.message
        } catch {
            return error.localizedDescription
        }
    }

    func addHa(_ ids: [String], baseHex: String) async -> String {
        if ids.isEmpty { return "" }
        var colors: [String: String] = [:]
        let start: Int = KalTone35.swatches.firstIndex(of: baseHex) ?? 0
        for (ix, id) in ids.enumerated() {
            colors[id] = KalTone35.swatches[(start + ix * 2) % KalTone35.swatches.count]
        }
        do {
            _ = try await KalCalAPI35.addHa(ids, colors: colors)
            showToast(String(ids.count) + (ids.count == 1 ? " kalender" : " kalendere") + " fra Home Assistant lagt til", undo: "")
            await load(force: true)
            return ""
        } catch let e as KalNetError {
            if e.status == 404 { return "Serveren støtter ikke Home Assistant-kalendere ennå." }
            return e.message
        } catch {
            return error.localizedDescription
        }
    }

    func removeCal(_ c: KalCal) {
        Task {
            if self.serverCals && !c.local {
                do {
                    try await KalCalAPI35.remove(c.id)
                } catch let e as KalNetError {
                    self.showToast("Kunne ikke fjerne: " + e.message, undo: "")
                    return
                } catch {
                    return
                }
            }
            self.cals.removeAll { (x: KalCal) -> Bool in x.id == c.id }
            var extra: [KalCal] = MacStore.loadCals("mac.localCals")
            extra.removeAll { (x: KalCal) -> Bool in x.id == c.id }
            MacStore.saveCals(extra, "mac.localCals")
            self.rebuild()
            self.saveSnapshot()
            self.showToast("«" + c.name + "» fjernet", undo: "")
        }
    }
}
