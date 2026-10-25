import SwiftUI
import UIKit
import UserNotifications

/* ---------------- Prompt 31: Gratis prøveperioder – «påminn meg om å avslutte» ---------------- */
// Fasit: design/Abonnement Legg til ark.dc.html (steg «trial», TRP()) og prompts/prompt-31-pakke/claude-code-prove-paminnelse.md.
// Uten AI: Legg til abonnement → Gratis prøveperiode → «✦ Skriv det med egne ord» + Fyll ut, Tjeneste · Prøven slutter ·
// Pris etterpå, VARSLE MEG (Samme dag · 1 dag før · 3 dager før · 1 uke før), forhåndsvisning av varselet og Lagre påminnelse.
// Med AI: søkefeltet og Chat sender teksten til /api/assist (intent trial.create); appen laster prøvene på nytt etterpå.
// API (SERVER31): GET/POST /finans/api/subscriptions/trials, PATCH …/:id {status:'cancelled'|'kept'} eller {snooze:'tomorrow'}.
// Varsler: planlegges lokalt (UNCalendarNotificationTrigger) kl. 09:00 på ends_at − offset og 18:00 på sluttdagen,
// eller på tidspunktene serveren returnerer. Kategori TRIAL_REMIND: Avslutt nå (oppsigelsessiden) · Behold · Minn meg i morgen.

struct Trial31Rem: Equatable {
    let at: Date
    let title: String
    let body: String
}

struct Trial31: Identifiable, Equatable {
    var id: String
    var service: String
    /// «2026-11-01»
    var endsAt: String
    var priceAfter: String = ""
    var offsets: [Int] = [1]
    var status: String = "active"
    var cancelUrl: String = ""
    var reminders: [Trial31Rem] = []

    var daysLeft: Int { Cal26.daysUntil(endsAt, from: Date()) }

    /// «Prøve · 12 dager igjen»
    var badge: String {
        let d: Int = daysLeft
        if d < 0 { return "Prøve · utløpt" }
        if d == 0 { return "Prøve · slutter i dag" }
        if d == 1 { return "Prøve · 1 dag igjen" }
        return "Prøve · \(d) dager igjen"
    }

    static func from(_ o: [String: Any]) -> Trial31? {
        guard let id = JS.str(o, "id") else { return nil }
        let svc: String = JS.str(o, "service") ?? JS.str(o, "name") ?? ""
        let end: String = String((JS.str(o, "ends_at") ?? JS.str(o, "endsAt") ?? JS.str(o, "end") ?? "").prefix(10))
        if svc.isEmpty || end.count < 10 { return nil }
        var t = Trial31(id: id, service: svc, endsAt: end)
        if let n = JS.num(o, "price_after") ?? JS.num(o, "priceAfter") {
            t.priceAfter = Trial31Parse.kr(n) + " kr/mnd"
        } else {
            t.priceAfter = JS.str(o, "price_after") ?? JS.str(o, "priceAfter") ?? ""
        }
        let offs: [Int] = ((o["remind_offsets_days"] ?? o["remindOffsetsDays"]) as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } ?? []
        if !offs.isEmpty { t.offsets = offs }
        t.status = JS.str(o, "status") ?? "active"
        t.cancelUrl = JS.str(o, "cancel_url") ?? JS.str(o, "cancelUrl") ?? Trial31Parse.cancelURL(svc)
        t.reminders = Trial31.reminders(o, t)
        return t
    }

    /// Tidspunktene fra serveren (reminders / notifications / notify_at), ellers beregnet lokalt.
    static func reminders(_ o: [String: Any], _ t: Trial31) -> [Trial31Rem] {
        let raw: [Any] = ((o["reminders"] ?? o["notifications"] ?? o["notify_at"] ?? o["notifyAt"]) as? [Any]) ?? []
        var out: [Trial31Rem] = []
        for x in raw {
            if let s = x as? String, let d = Trial31Parse.iso(s) {
                out.append(Trial31Rem(at: d, title: Trial31Parse.title(t, at: d), body: Trial31Parse.body(t)))
            } else if let r = x as? [String: Any], let s = JS.str(r, "at") ?? JS.str(r, "when") ?? JS.str(r, "time"), let d = Trial31Parse.iso(s) {
                let title: String = JS.str(r, "title") ?? Trial31Parse.title(t, at: d)
                let body: String = JS.str(r, "body") ?? Trial31Parse.body(t)
                out.append(Trial31Rem(at: d, title: title, body: body))
            }
        }
        return out.isEmpty ? Trial31Parse.localReminders(t) : out
    }
}

/// Tolkningen («Viaplay gratis i 14 dager, påminn meg», «Storytel prøve til 25.11, 179 kr»), som TRP() i fasiten.
enum Trial31Parse {
    static let known: [String] = ["Viaplay", "Netflix", "HBO Max", "Max", "Disney+", "Spotify", "TV 2 Play", "Storytel", "BookBeat",
                                  "Apple TV+", "Apple Music", "YouTube Premium", "Amazon Prime", "Audible", "Strava", "Tidal", "Duolingo",
                                  "ChatGPT", "Adobe", "Canva", "Discovery+", "SkyShowtime", "Nextory"]

    static let cancelLinks: [String: String] = [
        "viaplay": "https://viaplay.no/account/subscription",
        "netflix": "https://www.netflix.com/cancelplan",
        "hbo max": "https://auth.max.com/subscription",
        "max": "https://auth.max.com/subscription",
        "disney+": "https://www.disneyplus.com/account/subscription",
        "spotify": "https://www.spotify.com/no/account/subscription/",
        "tv 2 play": "https://play.tv2.no/konto",
        "storytel": "https://www.storytel.com/no/account",
        "bookbeat": "https://www.bookbeat.com/no/account",
        "apple tv+": "https://apps.apple.com/account/subscriptions",
        "apple music": "https://apps.apple.com/account/subscriptions",
        "youtube premium": "https://www.youtube.com/paid_memberships",
        "amazon prime": "https://www.amazon.com/mc",
        "audible": "https://www.audible.com/account",
        "strava": "https://www.strava.com/account",
        "tidal": "https://account.tidal.com/subscription",
        "chatgpt": "https://chatgpt.com/#settings/Subscription",
        "nextory": "https://www.nextory.no/konto",
    ]

    static func cancelURL(_ service: String) -> String {
        if let u = cancelLinks[service.lowercased()] { return u }
        let q: String = (service + " si opp abonnement").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? service
        return "https://www.google.com/search?q=" + q
    }

    private static let words: [String: Int] = ["en": 1, "ett": 1, "én": 1, "to": 2, "tre": 3, "fire": 4, "fem": 5, "seks": 6, "sju": 7, "syv": 7]

    /// (tjeneste, sluttdato, «179 kr/mnd») eller nil når tjeneste eller dato mangler.
    static func parse(_ text: String, today: Date = Date()) -> (String, Date, String)? {
        let raw: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return nil }
        let t: String = raw.lowercased()
        let now: Date = Cal26.day(Cal26.key(today))
        guard let end = endDate(t, now) else { return nil }
        guard let name = service(raw, t) else { return nil }
        return (name, end, price(raw))
    }

    private static func endDate(_ t: String, _ now: Date) -> Date? {
        let cal: Calendar = Calendar.current
        // «14 dager», «2 uker», «1 måned», «en måned», «tre uker»
        let unit: String = "(dag|dager|døgn|uke|uker|måned|måneder|mnd)"
        if let m = first(t, "(\\d+)\\s*" + unit), let n = Int(m[1]) {
            return add(now, n, m[2], cal)
        }
        if let m = first(t, "\\b(en|ett|én|to|tre|fire|fem|seks|sju|syv)\\s+" + unit), let n = words[m[1]] {
            return add(now, n, m[2], cal)
        }
        // «25.11», «25/11», «25.11.2026»
        if let m = first(t, "(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?"), let d = Int(m[1]), let mo = Int(m[2]) {
            var y: Int = cal.component(.year, from: now)
            if m.count > 3, let yy = Int(m[3]) { y = yy < 100 ? 2000 + yy : yy }
            var c = DateComponents()
            c.year = y; c.month = mo; c.day = d; c.hour = 12
            guard var date = cal.date(from: c) else { return nil }
            // Uten årstall og datoen er passert: neste år.
            if m.count <= 3 || m[3].isEmpty, date < now { date = cal.date(byAdding: .year, value: 1, to: date) ?? date }
            return date
        }
        return nil
    }

    private static func add(_ now: Date, _ n: Int, _ u: String, _ cal: Calendar) -> Date? {
        if u.hasPrefix("uke") { return cal.date(byAdding: .day, value: 7 * n, to: now) }
        if u.hasPrefix("m") { return cal.date(byAdding: .month, value: n, to: now) }
        return cal.date(byAdding: .day, value: n, to: now)
    }

    private static func service(_ raw: String, _ t: String) -> String? {
        // Lengste navn først («HBO Max» før «Max», «Apple TV+» før «Apple Music»).
        let sorted: [String] = known.sorted { $0.count > $1.count }
        if let k = sorted.first(where: { t.contains($0.lowercased()) }) { return k }
        let skip: Set<String> = ["gratis", "påminn", "prøve", "prøveperiode", "minn", "husk", "jeg", "si", "start", "startet"]
        for w in raw.split(separator: " ") {
            let s: String = String(w).trimmingCharacters(in: CharacterSet(charactersIn: ",.:!?"))
            guard let f = s.first, f.isUppercase, !skip.contains(s.lowercased()) else { continue }
            return s
        }
        return nil
    }

    private static func price(_ raw: String) -> String {
        guard let m = first(raw.lowercased(), "(\\d+[.,]?\\d*)\\s*(kr|,-)") else { return "" }
        return m[1] + " kr/mnd"
    }

    /// Gruppene i første treff (indeks 0 = hele treffet), tomme grupper som "".
    static func first(_ s: String, _ pattern: String) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns: NSString = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
        var out: [String] = []
        for i in 0..<m.numberOfRanges {
            let r: NSRange = m.range(at: i)
            out.append(r.location == NSNotFound ? "" : ns.substring(with: r))
        }
        return out
    }

    static func number(_ s: String) -> Double? {
        let t: String = s.lowercased().replacingOccurrences(of: ",", with: ".")
        guard let m = first(t, "(\\d+(?:\\.\\d+)?)") else { return nil }
        return Double(m[1])
    }

    static func kr(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v).replacingOccurrences(of: ".", with: ",")
    }

    static func iso(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)
    }

    /// «fre 31. okt»
    static func short(_ d: Date) -> String {
        String(Cal26.weekdays[Cal26.jsDay(d)].prefix(3)) + " " + Cal26.dShort(d)
    }

    /// Kl. 09:00 på sluttdag − offset, og 18:00 på sluttdagen (siste varsel).
    static func localReminders(_ t: Trial31) -> [Trial31Rem] {
        let end: Date = Cal26.day(t.endsAt)
        let cal: Calendar = Calendar.current
        var out: [Trial31Rem] = []
        for off in Set(t.offsets).sorted(by: >) {
            let day: Date = Cal26.add(end, -off)
            guard let at = cal.date(bySettingHour: 9, minute: 0, second: 0, of: day) else { continue }
            out.append(Trial31Rem(at: at, title: title(t, at: at), body: body(t)))
        }
        if let last = cal.date(bySettingHour: 18, minute: 0, second: 0, of: end) {
            out.append(Trial31Rem(at: last, title: t.service + "-prøven slutter i dag", body: body(t)))
        }
        return out
    }

    /// «Viaplay-prøven slutter i morgen»
    static func title(_ t: Trial31, at: Date) -> String {
        let d: Int = Cal26.daysUntil(t.endsAt, from: at)
        let when: String = d <= 0 ? "slutter i dag" : d == 1 ? "slutter i morgen" : "slutter om \(d) dager"
        return t.service + "-prøven " + when
    }

    /// «Avslutt før lør 1. nov for å slippe 149 kr/mnd. Trykk for å åpne oppsigelsessiden.»
    static func body(_ t: Trial31) -> String {
        let pay: String = t.priceAfter.isEmpty ? "å betale" : t.priceAfter
        return "Avslutt før " + short(Cal26.day(t.endsAt)) + " for å slippe " + pay + ". Trykk for å åpne oppsigelsessiden."
    }
}

@MainActor
@Observable
final class Trial31Model {
    static let shared = Trial31Model()

    var trials: [Trial31] = []
    var loaded: Bool = false
    var missing: Bool = false

    var active: [Trial31] { trials.filter { $0.status == "active" && $0.daysLeft >= 0 } }

    func load(_ api: API) async {
        do {
            let d: Data = try await api.callAt("/finans/api", "GET", "/subscriptions/trials", timeout: 15)
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            if rows.isEmpty { rows = JS.list(any as? [String: Any], "trials") }
            trials = rows.compactMap { Trial31.from($0) }
            loaded = true
            missing = false
            Trial31Model.schedule(active)
            // Prompt 32: widgetene (Prøveperioder) får samme liste med en gang (Trials32App.swift).
            Trials32b.push(active.map { (t: Trial31) -> TrialW32b in t.widget32b })
        } catch let e as APIError {
            if e.status == 404 { missing = true }
        } catch {}
    }

    /// Lagre påminnelse (skjemaet). true = lagret.
    func save(service: String, end: Date, price: String, offsets: [Int], _ store: Store) async -> Bool {
        var b: [String: Any] = ["service": service.trimmingCharacters(in: .whitespaces), "ends_at": Cal26.key(end),
                                "remind_offsets_days": offsets.sorted()]
        if let n = Trial31Parse.number(price) { b["price_after"] = n }
        do {
            let d: Data = try await store.api.callAt("/finans/api", "POST", "/subscriptions/trials", json: b, timeout: 20)
            let o: [String: Any] = JS.obj(d)
            if let t = Trial31.from(JS.dict(o, "trial") ?? o) {
                trials.removeAll { $0.id == t.id }
                trials.append(t)
                Trial31Model.schedule(active)
            } else {
                await load(store.api)
            }
            Task { try? await store.loadSubs() }
            return true
        } catch let e as APIError {
            store.flash(e.status == 404 ? "Serveren støtter ikke prøveperioder ennå" : "Kunne ikke lagre: " + e.message)
            return false
        } catch {
            store.flash("Kunne ikke lagre: " + error.localizedDescription)
            return false
        }
    }

    /// Handling fra varselet (eller trykk). Avslutt nå åpner oppsigelsessiden.
    func action(_ act: String, id: String, service: String, cancelUrl: String) {
        guard let api = Notify31.store?.api ?? HealthSync.backgroundAPI() else { return }
        switch act {
        case Notify31.actCancel:
            let u: String = cancelUrl.isEmpty ? Trial31Parse.cancelURL(service) : cancelUrl
            if let url = URL(string: u) { UIApplication.shared.open(url) }
        case Notify31.actKeep:
            patch(id, ["status": "kept"], api)
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: Trial31Model.ids(id))
        case Notify31.actSnooze:
            patch(id, ["snooze": "tomorrow"], api)
            Trial31Model.snoozeLocal(id: id, service: service, cancelUrl: cancelUrl)
        default:
            break
        }
    }

    private func patch(_ id: String, _ body: [String: Any], _ api: API) {
        if id.isEmpty { return }
        Task {
            _ = try? await api.callAt("/finans/api", "PATCH", "/subscriptions/trials/" + Cal27Model.enc(id), json: body, timeout: 15)
            await self.load(api)
        }
    }

    /* ---------- Lokale varsler ---------- */

    nonisolated static func ids(_ trialId: String) -> [String] {
        (0..<8).map { "trial31-" + trialId + "-" + String($0) }
    }

    /// Fjerner gamle prøve-varsler og planlegger alle kommende for aktive prøver.
    nonisolated static func schedule(_ list: [Trial31]) {
        let center: UNUserNotificationCenter = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { (reqs: [UNNotificationRequest]) in
            let old: [String] = reqs.map { $0.identifier }.filter { $0.hasPrefix("trial31-") }
            center.removePendingNotificationRequests(withIdentifiers: old)
            let now: Date = Date()
            for t in list {
                for (i, r) in t.reminders.prefix(8).enumerated() where r.at > now {
                    add(t, r, id: "trial31-" + t.id + "-" + String(i), center)
                }
            }
        }
    }

    nonisolated private static func add(_ t: Trial31, _ r: Trial31Rem, id: String, _ center: UNUserNotificationCenter) {
        let c = UNMutableNotificationContent()
        c.title = r.title
        c.body = r.body
        c.sound = NotifyModel.currentSound()
        c.categoryIdentifier = Notify31.trialCategory
        c.threadIdentifier = "trial-" + t.id
        c.userInfo = ["trialId": t.id, "service": t.service, "cancelUrl": t.cancelUrl]
        let comps: DateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: r.at)
        let trig = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(identifier: id, content: c, trigger: trig)) { (_: Error?) in }
    }

    /// «Minn meg i morgen»: nytt varsel i morgen kl. 09:00.
    nonisolated static func snoozeLocal(id: String, service: String, cancelUrl: String) {
        let cal: Calendar = Calendar.current
        let tomorrow: Date = cal.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        guard let at = cal.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) else { return }
        let c = UNMutableNotificationContent()
        c.title = service.isEmpty ? "Prøveperioden" : service + "-prøven"
        c.body = "Husk å avslutte før den blir betalt. Trykk for å åpne oppsigelsessiden."
        c.sound = NotifyModel.currentSound()
        c.categoryIdentifier = Notify31.trialCategory
        c.userInfo = ["trialId": id, "service": service, "cancelUrl": cancelUrl]
        let comps: DateComponents = cal.dateComponents([.year, .month, .day, .hour, .minute], from: at)
        let r = UNNotificationRequest(identifier: "trial31-" + id + "-snooze", content: c,
                                      trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
        UNUserNotificationCenter.current().add(r) { (_: Error?) in }
    }
}

/* ---------- Skjemaet «Prøveperiode» i Legg til abonnement ---------- */

struct Trial31Form: View {
    @Environment(Store.self) private var store
    let c: SubPal28
    let done: () -> Void
    @State private var ai: String = ""
    @State private var service: String = ""
    @State private var end: Date = Cal26.add(Date(), 14)
    @State private var hasEnd: Bool = false
    @State private var price: String = ""
    @State private var offsets: Set<Int> = [1]
    @State private var busy: Bool = false
    @State private var note: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            aiBox
            fields
            Trial31RemChips(c: c, offsets: $offsets)
            Trial31Preview(c: c, service: service, end: hasEnd ? end : nil, price: price, first: offsets.max() ?? 0)
            SubPrimary28(c: c, title: busy ? "Lagrer …" : "Lagre påminnelse", enabled: !busy) { save() }
            if !note.isEmpty {
                Text(note).font(PF.ui(13, .semibold)).foregroundStyle(c.lab).padding(.horizontal, 4)
            }
        }
    }

    private var aiBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("✦ SKRIV DET MED EGNE ORD").font(PF.ui(11.5, .heavy)).tracking(1.2).foregroundStyle(c.lab)
            HStack(spacing: 8) {
                TextField("Viaplay gratis i 14 dager, påminn meg", text: $ai)
                    .font(PF.ui(15, .medium)).foregroundStyle(c.ink)
                    .submitLabel(.go)
                    .onSubmit { fill() }
                    .padding(.horizontal, 12).frame(height: 44)
                    .background(c.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(c.border, lineWidth: 1))
                Button { fill() } label: {
                    Text("Fyll ut").font(PF.ui(14, .bold)).foregroundStyle(c.bg)
                        .padding(.horizontal, 14).frame(height: 44)
                        .background(c.ink, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.lab, lineWidth: 1.5))
    }

    private var fields: some View {
        VStack(spacing: 0) {
            Trial31FieldRow(c: c, label: "Tjeneste", first: true) {
                TextField("Viaplay", text: $service).multilineTextAlignment(.trailing)
                    .font(PF.ui(15, .semibold)).foregroundStyle(c.ink)
            }
            Trial31FieldRow(c: c, label: "Prøven slutter", first: false) {
                DatePicker("", selection: Binding<Date>(get: { end }, set: { (v: Date) in end = v; hasEnd = true }),
                           in: Date()..., displayedComponents: .date)
                    .labelsHidden()
                    .environment(\.locale, Locale(identifier: "nb_NO"))
            }
            Trial31FieldRow(c: c, label: "Pris etterpå", first: false) {
                TextField("149 kr/mnd", text: $price).multilineTextAlignment(.trailing)
                    .keyboardType(.numbersAndPunctuation)
                    .font(PF.ui(15, .semibold)).foregroundStyle(c.ink)
            }
        }
        .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.border, lineWidth: 1))
    }

    private func fill() {
        guard let r = Trial31Parse.parse(ai) else {
            note = "Fant ikke tjeneste eller dato. Skriv f.eks. «Viaplay gratis i 14 dager»."
            Haptics.shared.error()
            return
        }
        note = ""
        service = r.0
        end = r.1
        hasEnd = true
        if !r.2.isEmpty { price = r.2 }
        Haptics.shared.success()
    }

    private func save() {
        let svc: String = service.trimmingCharacters(in: .whitespaces)
        if svc.isEmpty || !hasEnd {
            note = "Fyll inn tjeneste og sluttdato"
            Haptics.shared.error()
            return
        }
        busy = true
        let offs: [Int] = offsets.isEmpty ? [1] : Array(offsets)
        Task {
            let ok: Bool = await Trial31Model.shared.save(service: svc, end: end, price: price, offsets: offs, store)
            busy = false
            if ok {
                LocalNotify.ask()
                Haptics.shared.success()
                store.flash("Påminnelse lagret · " + svc)
                done()
            }
        }
    }
}

struct Trial31FieldRow<Content: View>: View {
    let c: SubPal28
    let label: String
    let first: Bool
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(spacing: 12) {
            Text(label).font(PF.ui(14, .semibold)).foregroundStyle(c.mut).frame(width: 120, alignment: .leading)
            content().frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, 16).frame(minHeight: 52)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.sep).frame(height: 1) } }
    }
}

/// VARSLE MEG: Samme dag · 1 dag før · 3 dager før · 1 uke før (flervalg).
struct Trial31RemChips: View {
    let c: SubPal28
    @Binding var offsets: Set<Int>

    static let options: [(Int, String)] = [(0, "Samme dag"), (1, "1 dag før"), (3, "3 dager før"), (7, "1 uke før")]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("VARSLE MEG").font(PF.ui(11.5, .heavy)).tracking(1.2).foregroundStyle(c.lab).padding(.horizontal, 4)
            Flow(spacing: 6) {
                ForEach(Trial31RemChips.options, id: \.0) { (o: (Int, String)) in chip(o.0, o.1) }
            }
        }
    }

    private func chip(_ d: Int, _ n: String) -> some View {
        let on: Bool = offsets.contains(d)
        return Button {
            Haptics.shared.select()
            if on { offsets.remove(d) } else { offsets.insert(d) }
        } label: {
            Text(n).font(PF.ui(13.5, .bold)).foregroundStyle(on ? c.bg : c.ink)
                .padding(.horizontal, 14).frame(height: 38)
                .background(on ? c.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? c.ink : c.border, lineWidth: 1.5))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Forhåndsvisning av varselet (som et iOS-banner).
struct Trial31Preview: View {
    let c: SubPal28
    let service: String
    let end: Date?
    let price: String
    let first: Int

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(String(AppMeta.shared.name.prefix(1)).uppercased()).font(PF.serif(15, medium: true)).foregroundStyle(c.bg)
                .frame(width: 34, height: 34)
                .background(c.ink, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                HStack {
                    Text(AppMeta.shared.name.uppercased()).font(PF.ui(12, .bold)).foregroundStyle(c.ink)
                    Spacer(minLength: 6)
                    Text(whenText).font(PF.ui(12)).foregroundStyle(c.mut)
                }
                Text(titleText).font(PF.ui(14, .bold)).foregroundStyle(c.ink)
                Text(bodyText).font(PF.ui(13)).foregroundStyle(c.ink.opacity(0.8)).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(c.card.opacity(0.7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(c.border, lineWidth: 1))
    }

    private var whenText: String {
        guard let end else { return "" }
        return Trial31Parse.short(Cal26.add(end, -first)) + " 09:00"
    }

    private var titleText: String {
        let n: String = service.isEmpty ? "Tjenesten" : service
        let w: String = first == 0 ? "slutter i dag" : first == 1 ? "slutter i morgen" : "slutter om \(first) dager"
        return n + "-prøven " + w
    }

    private var bodyText: String {
        let d: String = end.map { Trial31Parse.short($0) } ?? "sluttdato"
        let pay: String = price.isEmpty ? "å betale" : price
        return "Avslutt før " + d + " for å slippe " + pay + ". Trykk for å åpne oppsigelsessiden."
    }
}

/* ---------- Subscription OS: aktive prøver ---------- */

/// «Prøve · 12 dager igjen» øverst på Hjem i Subscription OS.
struct Trial31Strip: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Trial31Model { Trial31Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !m.active.isEmpty {
                PLabel(text: "Prøveperioder").padding(.leading, 4)
                VStack(spacing: 0) {
                    ForEach(Array(m.active.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Trial31)) in
                        Trial31Row(t: pair.element, first: pair.offset == 0)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
        .task(id: store.account?.id ?? "") { await m.load(store.api) }
    }
}

struct Trial31Row: View {
    @Environment(\.paper) private var p
    let t: Trial31
    let first: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "clock.badge.exclamationmark").font(.dyn51(size: 17, weight: .semibold)).foregroundStyle(p.lab)
                .frame(width: 40, height: 40)
                .background(p.lab.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(t.service).font(PF.ui(15, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Text("Slutter " + Trial31Parse.short(Cal26.day(t.endsAt)) + (t.priceAfter.isEmpty ? "" : " · deretter " + t.priceAfter))
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(t.badge).font(PF.ui(11.5, .bold)).foregroundStyle(t.daysLeft <= 3 ? Color.white : p.ink).lineLimit(1).fixedSize()
                .padding(.horizontal, 9).frame(height: 24)
                .background(t.daysLeft <= 3 ? p.lab : p.line, in: Capsule())
            if let u = URL(string: t.cancelUrl), !t.cancelUrl.isEmpty {
                Link(destination: u) {
                    Image(systemName: "arrow.up.right").font(.dyn51(size: 12, weight: .bold)).foregroundStyle(p.mut)
                        .frame(width: 30, height: 30)
                }
                .accessibilityLabel("Åpne oppsigelsessiden")
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1).padding(.leading, 66) } }
    }
}
