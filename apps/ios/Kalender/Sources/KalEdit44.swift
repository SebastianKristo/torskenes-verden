import SwiftUI

/* ---------------- Prompt 44: Kalender – hold/trykk for ny hendelse og Rediger hendelse (iPhone og iPad) ---------------- */
// Fasit: Kalender App.dc.html → newOn(k, at), editDet, saveNew (editId). Spesifikasjon: claude-code-kalender-hold-dag-ny.md
// og claude-code-kalender-apne-rediger.md.
// Rediger: samme ark som «Ny hendelse» (tittel «Rediger», knapp «Lagre»), PATCH /api/kalender/events/:id. Synkede hendelser
// (Google/iCloud) sendes tilbake til kilden av serveren; konflikt (409/412) gir «Endret et annet sted. Behold din eller deres?».
// Gjentakende hendelser spør «Bare denne / Denne og fremtidige / Alle» (scope this | future | all).

/// Konflikt ved lagring: hendelsen er endret et annet sted.
struct KalConflict44: Equatable {
    let id: String
    let body: [String: String]
    let title: String

    static func == (a: KalConflict44, b: KalConflict44) -> Bool { a.id == b.id && a.title == b.title }
}

@MainActor
@Observable
final class KalEdit44Model {
    static let shared: KalEdit44Model = KalEdit44Model()
    var conflict: KalConflict44? = nil
    /// Forrige versjon per hendelse (Angre).
    @ObservationIgnored var before: [String: KalEvent] = [:]
}

extension KalStore {
    /* ---------- Ny hendelse på en dag / et klokkeslett ---------- */

    /// Hold inne en dag (Måned) eller trykk/hold på et tidspunkt (Uke · 3 d · Dag). at = minutter fra midnatt.
    /// Uten tid: neste halvtime i dag, ellers 09:00. Varighet fra Innstillinger.
    func newOn44(day: String, at: Int? = nil) {
        KalHaptic.tap()
        let tk: String = KalD.todayKey()
        let next: Int = Swift.min(23 * 60, ((KalD.minutesNow() + 1 + 29) / 30) * 30)
        let st: Int = at ?? (day == tk ? next : 9 * 60)
        let en: Int = Swift.min(1439, st + defDur)
        var f: KalNewForm = KalNewForm()
        f.day = KalD.date(day)
        f.start = KalD.at(day, st)
        f.end = KalD.at(day, en)
        f.cal = cals.first(where: { (c: KalCal) -> Bool in c.writable && c.on })?.id ?? "p"
        f.rem = defRem
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)) { newForm = f }
    }

    /* ---------- Rediger ---------- */

    func canEdit44(_ e: KalEvent) -> Bool {
        if KalEv44.readOnly(e) { return false }
        if KalBd41.isBirthday(e, calName: cal(e.cal)?.name ?? "") { return false }
        return true
    }

    /// Detaljarket → Rediger: samme ark som Ny hendelse, utfylt.
    func edit44(_ e: KalEvent) {
        KalHaptic.tap()
        let st: Int = e.s ?? 9 * 60
        let en: Int = Swift.min(1439, e.e ?? st + 60)
        var f: KalNewForm = KalNewForm()
        f.editId = e.id
        f.title = e.title
        f.loc = (e.address ?? "").isEmpty ? e.loc : (e.address ?? e.loc)
        f.day = KalD.date(e.day)
        f.allDay = e.allDay
        f.start = KalD.at(e.day, st)
        f.end = KalD.at(e.day, en)
        f.cal = e.cal
        f.rem = e.allDay ? defRem : e.rem
        f.lat = e.lat
        f.lon = e.lon
        f.att = e.att44 ?? []
        withAnimation(.easeOut(duration: 0.22)) {
            detId = nil
            newForm = f
        }
    }

    /// «Legg til» eller «Lagre». scope: this | future | all for gjentakende hendelser.
    func saveForm44(_ f: KalNewForm, scope: String? = nil) {
        let t: String = f.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return }
        guard let id = f.editId else {
            saveNew44(f, title: t)
            return
        }
        guard let old = event(id) else {
            newForm = nil
            return
        }
        let day: String = KalD.key(f.day)
        let s0: Int = KalD.minutes(f.start)
        let e0: Int = Swift.min(1439, Swift.max(s0 + 15, KalD.minutes(f.end)))
        var ev: KalEvent = old
        ev.title = t
        ev.loc = f.loc.trimmingCharacters(in: .whitespacesAndNewlines)
        ev.address = f.lat == nil ? nil : ev.loc
        ev.lat = f.lat
        ev.lon = f.lon
        ev.day = day
        ev.s = f.allDay ? nil : s0
        ev.e = f.allDay ? nil : e0
        ev.cal = f.cal
        ev.rem = f.allDay ? nil : f.rem
        ev.att44 = f.att.isEmpty ? nil : f.att
        KalEdit44Model.shared.before[id] = old
        replace44(ev)
        KalHaptic.done()
        anchor = day
        newForm = nil
        detId = id
        let newAtt: [KalAtt44] = f.att.filter { (a: KalAtt44) -> Bool in !(old.att44 ?? []).contains(a) }
        let inv: String = newAtt.isEmpty ? "" : " · invitasjon sendt til " + String(newAtt.count)
        showToast("Lagret «" + t + "»" + inv, undo: "e44:" + id)
        if ev.pending || id.hasPrefix("u") { return }
        let body: [String: Any] = KalStore.patchBody44(ev, scope: scope, etag: old.etag44)
        Task { await self.patch44(id, body, title: t, invite: newAtt) }
    }

    private func saveNew44(_ f: KalNewForm, title t: String) {
        let day: String = KalD.key(f.day)
        let s0: Int = KalD.minutes(f.start)
        let e0: Int = Swift.max(s0 + 15, KalD.minutes(f.end))
        let p: KalParsed = KalParsed(title: t, cal: f.cal, day: day, s: f.allDay ? nil : s0, e: f.allDay ? nil : Swift.min(1439, e0),
                                     rem: f.allDay ? nil : f.rem, src: "")
        newForm = nil
        anchor = day
        KalHaptic.done()
        let loc: String = f.loc.trimmingCharacters(in: .whitespacesAndNewlines)
        let inv: String = f.att.isEmpty ? "" : " · invitasjon sendt til " + String(f.att.count)
        let when: String = KalD.dl(KalD.date(day)) + (f.allDay ? "" : " " + KalD.hm(s0))
        let ev: KalEvent = local44(p, loc: loc, form: f)
        showToast("La til «" + t + "» · " + when + inv, undo: ev.id)
        Task { _ = await self.push(ev) }
    }

    /// Den lokale hendelsen (med koordinater og deltakere) før den sendes til serveren.
    private func local44(_ p: KalParsed, loc: String, form f: KalNewForm) -> KalEvent {
        let tmpId: String = "u" + String(Int(Date().timeIntervalSince1970 * 1000))
        var ev: KalEvent = KalEvent(id: tmpId, title: p.title, cal: p.cal, day: p.day, s: p.s, e: p.e)
        ev.loc = loc
        ev.rem = p.rem
        ev.pending = true
        ev.editable = true
        ev.lat = f.lat
        ev.lon = f.lon
        if f.lat != nil { ev.address = loc }
        ev.att44 = f.att.isEmpty ? nil : f.att
        pending.append(ev)
        savePending()
        rebuild()
        return ev
    }

    /// Bytter ut en hendelse (lokal eller fra serveren) og tegner på nytt.
    func replace44(_ ev: KalEvent) {
        if let i = pending.firstIndex(where: { (x: KalEvent) -> Bool in x.id == ev.id }) {
            pending[i] = ev
            savePending()
        } else if let i = events.firstIndex(where: { (x: KalEvent) -> Bool in x.id == ev.id }) {
            events[i] = ev
        }
        calOverride[ev.id] = ev.cal
        UserDefaults.standard.set(calOverride, forKey: "kal.calOf")
        remOverride[ev.id] = ev.rem ?? -1
        UserDefaults.standard.set(remOverride, forKey: "kal.rem")
        rebuild()
        saveSnapshot()
    }

    static func patchBody44(_ ev: KalEvent, scope: String?, etag: String?) -> [String: Any] {
        var b: [String: Any] = ["title": ev.title, "date": ev.day, "allDay": ev.allDay, "location": ev.loc,
                                "calendar": ev.cal, "appCalendar": ev.cal, "reminder": KalStore.serverReminder(ev.rem), "remindMinutes": ev.rem ?? 0]
        if let st = ev.s { b["start"] = KalD.hm(st) } else { b["start"] = NSNull() }
        if let en = ev.e { b["end"] = KalD.hm(Swift.min(en, 1439)) } else { b["end"] = NSNull() }
        if let la = ev.lat, let lo = ev.lon { b["geo"] = ["lat": la, "lon": lo] } else { b["geo"] = NSNull() }
        b["attendees"] = (ev.att44 ?? []).map { (a: KalAtt44) -> [String: Any] in a.json }
        if let scope { b["scope"] = scope }
        if let etag { b["etag"] = etag }
        return b
    }

    private func patch44(_ id: String, _ body: [String: Any], title: String, invite: [KalAtt44]) async {
        do {
            let d: Data = try await KalNet.send("PATCH", "/api/kalender/events/" + KalNet.enc(id), json: body, timeout: 25)
            let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
            if let row = o["event"] as? [String: Any],
               var made = KalParse.event(row, calIds: Set(cals.map { (c: KalCal) -> String in c.id })) {
                if let cur = event(id) {
                    made.cal = cur.cal
                    if made.att44 == nil { made.att44 = cur.att44 }
                    if made.lat == nil { made.lat = cur.lat; made.lon = cur.lon }
                }
                if made.id == id { replace44(made) }
            }
            if !invite.isEmpty { _ = await KalEv44.invite(id, invite) }
        } catch let e as KalNetError {
            if e.status == 409 || e.status == 412 {
                var flat: [String: String] = [:]
                for (k, v) in body { flat[k] = (v as? String) ?? String(describing: v) }
                KalEdit44Model.shared.conflict = KalConflict44(id: id, body: flat, title: title)
                return
            }
            if e.status == 0 { return }
            showToast("Kunne ikke lagre: " + e.message, undo: "")
            await load(force: true)
        } catch {}
    }

    /// «Behold din»: lagre på nytt uten versjonssjekk. «Bruk deres»: hent på nytt.
    func resolveConflict44(keepMine: Bool) {
        guard let c = KalEdit44Model.shared.conflict else { return }
        KalEdit44Model.shared.conflict = nil
        KalHaptic.tap()
        if !keepMine {
            Task { await self.load(force: true) }
            return
        }
        guard let ev = event(c.id) else { return }
        var body: [String: Any] = KalStore.patchBody44(ev, scope: c.body["scope"], etag: nil)
        body["force"] = true
        Task { await self.patch44(c.id, body, title: c.title, invite: []) }
    }

    /// Angre etter Lagre: forrige versjon tilbake (lokalt og på serveren).
    func undoEdit44(_ id: String) {
        guard let old = KalEdit44Model.shared.before[id] else { return }
        KalEdit44Model.shared.before[id] = nil
        replace44(old)
        if old.pending || id.hasPrefix("u") { return }
        var body: [String: Any] = KalStore.patchBody44(old, scope: nil, etag: nil)
        body["force"] = true
        Task { _ = try? await KalNet.send("PATCH", "/api/kalender/events/" + KalNet.enc(id), json: body, timeout: 25) }
    }
}

/// «Endret et annet sted. Behold din eller deres?»
struct KalConflict44View: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalEdit44Model { KalEdit44Model.shared }

    var body: some View {
        if let c = m.conflict {
            VStack(alignment: .leading, spacing: 10) {
                Text("Endret et annet sted").font(KalFont.serif(22)).foregroundStyle(t.ink)
                Text("«" + c.title + "» er endret i kilden siden du åpnet den. Behold din eller deres?")
                    .font(KalFont.ui(13.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    KalPill(title: "Bruk deres", filled: false) { KalStore.shared.resolveConflict44(keepMine: false) }
                    KalPill(title: "Behold din") { KalStore.shared.resolveConflict44(keepMine: true) }
                }
            }
            .padding(18)
            .frame(maxWidth: 420, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
            .shadow(color: Color.black.opacity(0.2), radius: 20, y: 10)
            .padding(.horizontal, 16)
            .transition(.opacity)
        }
    }
}
