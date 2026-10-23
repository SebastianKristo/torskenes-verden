import SwiftUI
import UIKit
import WidgetKit

/* ---------------- Prompt 35: Kalender – zoom, kalenderstyring og innstillinger (KalStore) ---------------- */
// Zoom-kjeden År → Måned → Uke → 3 dager → Dag (zoomTo/zoomStep i fasiten): trykk, pinch (> 1,22× / < 0,82×) og tittel-trykk.
// Den nye visningen vokser fra trykkpunktet (scale .55 → 1 inn, 1.6 → 1 ut, 0,38 s cubic-bezier(.2,.8,.2,1)), lett haptikk.
// Kalendere: farge (12 valg), vis/skjul, skjul fra menyen, iCal-abonnement, Home Assistant og fjerning – synkes til profilen.
// Innstillinger: PUT /api/kalender/calendars/prefs (weekStart, openView, defaultDuration, timelineStart, varsler …).

enum KalZoom35 {
    /// Rekkefølgen i visningsvelgeren (retningen på animasjonen).
    static let order: [String] = ["ar", "mnd", "uke", "3d", "dag", "liste"]
    /// Zoom ut ett nivå.
    static let outOf: [String: String] = ["dag": "3d", "3d": "uke", "uke": "mnd", "mnd": "ar", "ar": "ar", "liste": "mnd"]

    static func clampUnit(_ v: CGFloat) -> CGFloat { Swift.max(0, Swift.min(0.999, v)) }
}

extension KalStore {
    /* ---------- Zoom ---------- */

    func zoomTo(_ v: String, day: String?, origin: UnitPoint, inward: Bool) {
        let same: Bool = v == view && (day == nil || day == anchor)
        if same { return }
        KalHaptic.tap()
        zoomOrigin = origin
        zoomInward = inward
        let anim: Animation = UIAccessibility.isReduceMotionEnabled
            ? Animation.easeOut(duration: 0.2)
            : Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.38)
        withAnimation(anim) {
            view = v
            if let day { anchor = day } else if v == "liste" { anchor = KalD.todayKey() }
        }
        Task { await load() }
    }

    /// Zoom ut ett nivå (klyp sammen eller trykk på tittelen).
    func zoomOutStep(_ origin: UnitPoint) {
        let to: String = KalZoom35.outOf[view] ?? "mnd"
        if to == view { return }
        var day: String? = nil
        if view == "liste" { day = KalD.todayKey() }
        zoomTo(to, day: day, origin: origin, inward: false)
    }

    /// Spre to fingre: inn ett nivå fra punktet man klypte.
    func zoomInAt(_ p: UnitPoint) {
        let A: Date = KalD.date(anchor)
        let x: CGFloat = KalZoom35.clampUnit(p.x)
        let y: CGFloat = KalZoom35.clampUnit(p.y)
        switch view {
        case "ar":
            let col: Int = Int(x * 3)
            let row: Int = Int(y * 4)
            let m: Int = Swift.min(12, row * 3 + col + 1)
            if let d = KalQuick.makeDate(KalD.year(A), m, 1) { zoomTo("mnd", day: KalD.key(d), origin: p, inward: true) }
        case "mnd":
            let first: Date = KalD.firstOfMonth(A)
            let start: Date = KalWeek35.start(first)
            let rows: Int = KalWeek35.rows(first)
            let row: Int = Swift.min(rows - 1, Int(y * CGFloat(rows)))
            let col: Int = Swift.min(6, Int(x * 7))
            zoomTo("uke", day: KalD.key(KalD.add(start, row * 7 + col)), origin: p, inward: true)
        case "uke":
            let col: Int = Swift.min(6, Int(x * 7))
            zoomTo("3d", day: KalD.key(KalD.add(KalWeek35.start(A), col)), origin: p, inward: true)
        case "3d":
            let col: Int = Swift.min(2, Int(x * 3))
            zoomTo("dag", day: KalD.key(KalD.add(A, col)), origin: p, inward: true)
        default:
            break
        }
    }

    func pinch(_ m: CGFloat, at p: UnitPoint) {
        if m > 1.22 { zoomInAt(p) } else if m < 0.82 { zoomOutStep(p) }
    }

    /* ---------- Innstillinger ---------- */

    /// Sender ett eller flere valg til profilen (PUT /api/kalender/calendars/prefs).
    func savePrefs(_ body: [String: Any]) {
        Task { await KalCalAPI35.putPrefs(body) }
    }

    /// Valg fra profilen (samme for web, Homelab og widgetene). Bare feltene serveren sender.
    func applyServerPrefs(_ p: [String: String]) {
        if let v = p["weekStart"], (v == "mon" || v == "sun"), v != weekStart { weekStart = v }
        if let v = p["openView"], ["mnd", "uke", "3d", "dag", "liste"].contains(v), v != openView { openView = v }
        if let v = p["defaultDuration"], let n = Int(v), [30, 60, 90, 120].contains(n), n != defDur { defDur = n }
        if let v = p["timelineStart"], ["now", "06", "08"].contains(v), v != tlStart { tlStart = v }
        if let v = p["notifyBirthdays"] { nBd = v == "true" }
        if let v = p["notifyDeadlines"] { nFr = v == "true" }
        if let v = p["notifyBrief"] { nBrief = v == "true" }
        if let v = p["travelTime"] { nTv = v == "true" }
        if let v = p["weekNumbers"] { showWeeks = v == "true" }
        if let v = p["weather"] { showWx = v == "true" }
        if let v = p["theme"], ["system", "light", "dark"].contains(v), v != theme { theme = v }
        if let v = p["defaultReminder"], let m = KalCalAPI35.remFromServer(v), m != defRemRaw { defRemRaw = m }
        // Prompt 46: standardkalenderen (samme som web og Homelab).
        if let v = p["defaultCalendar"], !v.isEmpty, v != defCal46 { defCal46 = v }
    }

    /* ---------- Kalendere ---------- */

    /// Ny farge: tekstfargene regnes ut, lagres lokalt til serveren har bekreftet (PATCH {color}).
    func setColor(_ id: String, _ hex: String) {
        KalHaptic.tap()
        guard let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) else { return }
        cals[i] = KalTone35.apply(cals[i], hex: hex)
        colLocal[id] = hex
        UserDefaults.standard.set(colLocal, forKey: "kal.calCol")
        rebuild()
        saveSnapshot()
        if serverCals {
            Task {
                if await KalCalAPI35.patch(id, ["color": hex]) != nil {
                    self.colLocal.removeValue(forKey: id)
                    UserDefaults.standard.set(self.colLocal, forKey: "kal.calCol")
                }
            }
        }
    }

    /// Skjul fra menyen / Vis i menyen (PATCH {hidMenu}). Skjulte kalendere forsvinner fra lista og visningene.
    func setHidMenu(_ id: String, _ hide: Bool) {
        KalHaptic.tap()
        guard let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) else { return }
        cals[i].hidMenu = hide
        hidMenuLocal[id] = hide
        UserDefaults.standard.set(hidMenuLocal, forKey: "kal.hidMenu")
        rebuild()
        saveSnapshot()
        if serverCals {
            Task {
                // Eldre servere ignorerer feltet: behold det lokalt til svaret viser hidMenu.
                if let d = await KalCalAPI35.patch(id, ["hidMenu": hide]), KalCalAPI35.echoes(d, "hidMenu") {
                    self.hidMenuLocal.removeValue(forKey: id)
                    UserDefaults.standard.set(self.hidMenuLocal, forKey: "kal.hidMenu")
                }
            }
        }
    }

    var hiddenFromMenu: [KalCal] { cals.filter { (c: KalCal) -> Bool in !c.inMenu } }

    /// Abonner på en iCal-lenke. → feilmelding, eller tom ved suksess.
    func addIcal(url: String, name: String, hex: String) async -> String {
        do {
            let made: KalCal? = try await KalCalAPI35.addIcal(url: url, name: name, color: hex)
            let n: String = made?.name ?? name
            showToast("Abonnerer på «" + n + "»", undo: "")
            await load(force: true)
            return ""
        } catch let e as KalNetError {
            if e.status == 404 { return "Serveren støtter ikke iCal-abonnement ennå. Oppdater Homelab." }
            return e.message
        } catch {
            return error.localizedDescription
        }
    }

    /// Legg til valgte Home Assistant-kalendere med farger fordelt automatisk.
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

    /// × for kalendere man har lagt til selv (egne, iCal, HA).
    func removeCal(_ c: KalCal) {
        KalHaptic.tap()
        if c.local || !serverCals {
            Task { await deleteCalendar(c.id) }
            showToast("«" + c.name + "» fjernet", undo: "")
            return
        }
        Task {
            do {
                try await KalCalAPI35.remove(c.id)
                self.cals.removeAll { (x: KalCal) -> Bool in x.id == c.id }
                self.rebuild()
                self.saveSnapshot()
                self.showToast("«" + c.name + "» fjernet", undo: "")
            } catch let e as KalNetError {
                self.showToast("Kunne ikke fjerne: " + e.message, undo: "")
            } catch {}
        }
    }

    /// Settings → «Kontoer og synk»: lukk innstillingene og åpne «Legg til kalender → Konto» i sidemenyen.
    func openAccounts() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) {
            settingsOpen = false
            drawerOpen = true
            addCalTab = "acc"
        }
    }

    /// «Glimt» i innstillingene: Homelab → Innstillinger → Glimt.
    func openGlimtSettings() {
        KalHaptic.tap()
        if let u = URL(string: "finanshub://glimt"), UIApplication.shared.canOpenURL(u) {
            UIApplication.shared.open(u)
        } else {
            showToast("Glimt stilles inn i Homelab → Innstillinger → Glimt", undo: "")
        }
    }

    /// Tidspunktet tidslinjen starter ved (time).
    func timelineHour(todayIn: Bool) -> Int {
        if tlStart == "06" { return 6 }
        if tlStart == "08" { return 8 }
        return todayIn ? Swift.max(0, KalD.minutesNow() / 60 - 2) : 7
    }
}
