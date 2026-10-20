import SwiftUI
import UIKit

/* ---------------- Prompt 32: søkefeltet på Hjem – fullfør selv, Chat bare når det tar for lang tid ---------------- */
// Fasit: design/Mobil Papir App.dc.html → hsAsk() (NAV-snarveier, TO, handoff()), hsLog() og Innstillinger → AI og tolkning →
// GLIMT I SØKEFELTET. Spesifikasjon: claude-code-sok-fullfor-forst.md og claude-code-sokehistorikk-synk.md.
// 1. Snarveier lokalt («vis meg / åpne / gå til …» eller 1–2 ord): boblen «Åpner **Nordlys OS · oppdatering**.» (kilde Snarvei)
//    og siden åpnes etter 0,45 s. 2. Lokale verktøy (time, prøve …) som før. 3. Glimt svarer i boblen.
// 4. Tar svaret lengre tid enn grensen (hs_timeout_s, standard 8 s): «Dette tar litt tid. **Fortsetter i Chat** …», og etter 0,7 s
//    flyttes jobben til Chat (POST /api/assist/:id/handoff → {chatId}). Mobil logger søk (POST /api/search/history,
//    device 'mobil'), men viser aldri «Nylige søk».

@MainActor
@Observable
final class Search32b {
    static let shared = Search32b()

    nonisolated static let options: [Int] = [5, 8, 15, 30]
    nonisolated private static let localKey: String = "papir_hs_to"

    var timeoutS: Int = {
        let v: Int = UserDefaults.standard.integer(forKey: Search32b.localKey)
        return Search32b.options.contains(v) ? v : 8
    }()

    @ObservationIgnored private var watch: Int = 0

    /// Fra GET /api/me/layout.
    func take(_ o: [String: Any]) {
        let v: Int = Int(JS.num(o, "hs_timeout_s") ?? JS.num(o, "hsTimeoutS") ?? 0)
        if Search32b.options.contains(v) && v != timeoutS {
            timeoutS = v
            UserDefaults.standard.set(v, forKey: Search32b.localKey)
        }
    }

    /// «Send til Chat etter» 5 → 8 → 15 → 30 s (trykk for å bytte). Lagres i brukerprofilen.
    func cycle(_ store: Store) {
        let i: Int = Search32b.options.firstIndex(of: timeoutS) ?? 1
        timeoutS = Search32b.options[(i + 1) % Search32b.options.count]
        UserDefaults.standard.set(timeoutS, forKey: Search32b.localKey)
        Haptics.shared.select()
        let v: Int = timeoutS
        Task { @MainActor in _ = try? await store.api.callAt("/api", "PUT", "/me/layout", json: ["hs_timeout_s": v]) }
    }

    /* ---------- Snarveier ---------- */

    /// (rute, navn i boblen). Rekkefølgen betyr noe: første treff vinner.
    static let nav: [([String], String, String)] = [
        // Prompt 41: «sjekk inn», «drar snart», «drar nå», «fest», «hjemlys» → Familie → Hjemlys.
        (["sjekk inn", "drar snart", "drar nå", "fest", "hjemlys"], "hjemlys41", "Hjemlys"),
        (["oppdater", "nordlys", "versjon", "update"], "nordlys", "Nordlys OS · oppdatering"),
        (["kalender", "timeplan"], "kalender", "Kalender"),
        (["vær", "vaer", "værside", "yr"], "vaer", "Vær"),
        (["innstilling", "settings"], "innst", "Innstillinger"),
        (["pakke", "sporing", "sending"], "sporing", "Pakker"),
        (["budsjett"], "budsjett", "Budsjett"),
        (["kvittering"], "kvitt", "Kvitteringer"),
        (["finans", "økonomi", "okonomi", "saldo"], "finans", "Finans"),
        (["abonnement", "prøveperiode", "proveperiode", "prøver"], "abo", "Abonnement"),
        (["domene"], "domener", "Domener"),
        (["familie", "posisjon", "hvor er"], "familie", "Familie"),
        (["mat", "middag", "oppskrift", "matplan"], "mat", "Mat"),
        (["gjøremål", "gjoremal", "to-do", "todo", "huskeliste", "handleliste", "oppgave"], "huske", "Gjøremål"),
        (["bursdag"], "bursdag", "Bursdager"),
        (["chat"], "chat", "Chat"),
    ]

    private static let lead: [String] = ["vis meg ", "åpne ", "apne ", "gå til ", "ga til ", "ta meg til ", "hvor finner jeg ", "finn "]

    /// Treff på en side: «vis meg / åpne / gå til …», eller bare 1–2 ord.
    static func shortcut(_ raw: String, engine: String = "ai") -> (String, String)? {
        var t: String = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        t = t.trimmingCharacters(in: CharacterSet(charactersIn: "?!."))
        var lead: Bool = false
        for l in Search32b.lead where t.hasPrefix(l) {
            t = String(t.dropFirst(l.count))
            lead = true
            break
        }
        let words: Int = t.split(separator: " ").count
        if !lead && words > 2 { return nil }
        // Med Google/DuckDuckGo valgt er 1–2 ord et vanlig nettsøk; bare «vis meg / åpne / gå til …» er snarvei der.
        if !lead && engine != "ai" { return nil }
        for (keys, route, name) in Search32b.nav {
            for k in keys where t.contains(k) { return (route, name) }
        }
        return nil
    }

    func open(_ route: String, _ store: Store) {
        switch route {
        case "nordlys": System31Model.shared.show()
        case "vaer": store.weatherOpen = true
        case "budsjett": store.paperGo("fmer"); store.paperOpenFin(.budget)
        case "domener": store.paperOpenDomains(from: "hjem")
        case "chat": store.openChat()
        case "hjemlys41": store.paperGo("familie"); FamilyModel.shared.tab = "hjemlys"
        default: store.paperGo(route)
        }
    }

    /// Kjører snarveien: boblen viser «Åpner **X**.», siden åpnes etter 0,45 s. true = treff.
    func tryShortcut(_ q: String, engine: String, _ store: Store) -> Bool {
        guard let hit = Search32b.shortcut(q, engine: engine) else { return false }
        let a: Assist31 = Assist31.shared
        a.closeHome()
        a.homeQ = q
        var ans = Assist31Answer()
        ans.text = "Åpner **" + hit.1 + "**."
        ans.source = "Snarvei"
        ans.intent = "nav"
        a.homeAnswer = ans
        Haptics.shared.select()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            a.closeHome()
            self.open(hit.0, store)
        }
        return true
    }

    /* ---------- Glimt med grense ---------- */

    func askHome(_ q: String, _ store: Store) {
        let a: Assist31 = Assist31.shared
        a.homeJob32b = ""
        a.askHome(q, store)
        watch += 1
        let id: Int = watch
        let limit: Int = timeoutS
        Task { @MainActor in
            var waited: Double = 0
            while waited < Double(limit) {
                try? await Task.sleep(nanoseconds: 250_000_000)
                waited += 0.25
                if self.watch != id { return }
                if !a.homeBusy {
                    // Serveren svarte med en side-snarvei (intent nav): åpne den.
                    if let ans = a.homeAnswer, ans.intent == "nav", !ans.target32b.isEmpty {
                        try? await Task.sleep(nanoseconds: 450_000_000)
                        a.closeHome()
                        self.open(ans.target32b, store)
                    }
                    return
                }
            }
            if self.watch != id || !a.homeBusy || a.homeQ != q { return }
            await self.handoff(q, store)
        }
    }

    /// «Dette tar litt tid. Fortsetter i Chat …» → jobben flyttes til en Chat-tråd (samme jobb-id).
    private func handoff(_ q: String, _ store: Store) async {
        let a: Assist31 = Assist31.shared
        let job: String = a.homeJob32b
        var ans = Assist31Answer()
        ans.text = "Dette tar litt tid. **Fortsetter i Chat** …"
        ans.source = Glimt31.name
        a.homeBusy = false
        a.homeAnswer = ans
        try? await Task.sleep(nanoseconds: 700_000_000)
        a.closeHome()
        if !job.isEmpty, let d = try? await store.api.callAt("/api", "POST", "/assist/" + Cal27Model.enc(job) + "/handoff", json: [:], timeout: 10) {
            let o: [String: Any] = JS.obj(d)
            if let chat = JS.str(o, "chatId"), !chat.isEmpty {
                Notify31.open(go: "chat", chatId: chat, store)
                return
            }
        }
        store.openChat(prompt: q)
    }

    /* ---------- Søkehistorikk (bare logging på mobil) ---------- */

    /// Ikke passord, koder, kortnummer eller personnummer.
    static func sensitive(_ q: String) -> Bool {
        let digits: String = q.filter { $0.isNumber }
        if digits.count >= 11 { return true }
        let l: String = q.lowercased()
        if l.contains("passord") || l.contains("password") || l.contains("pin-kode") || l.contains("pinkode") { return true }
        return false
    }

    func log(_ q: String, engine: String, _ store: Store) {
        let t: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || Search32b.sensitive(t) { return }
        let body: [String: Any] = ["q": String(t.prefix(300)), "engine": engine, "device": "mobil"]
        Task { @MainActor in _ = try? await store.api.callAt("/api", "POST", "/search/history", json: body, timeout: 10) }
    }
}

/// Innstillinger → AI og tolkning → GLIMT I SØKEFELTET.
struct Search32bSettingsGroup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Search32b { Search32b.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Glimt i søkefeltet").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Send til Chat etter", sub: "Enkle oppgaver fullføres i søkefeltet. Tar svaret lengre tid, fortsetter det i Chat.",
                             value: "\(s.timeoutS) s", valueColor: p.lab, icon: "timer") { s.cycle(store) },
            ])
        }
    }
}
