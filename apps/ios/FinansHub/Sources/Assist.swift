import SwiftUI
import UIKit
import UserNotifications

/* ---------------- Prompt 31: Glimt-ruteren (POST /api/assist) og svar når appen er i bakgrunnen ---------------- */
// Fasit: design/Mobil Papir App.dc.html → hsAsk(), chToolRun(), nextAppt(), aiBgNotify().
// prompts/prompt-31-pakke/claude-code-sok-ai-svarboble.md + claude-code-ai-bakgrunnsvarsel.md.
// SERVER31: POST /api/assist {q, source:'search'|'chat', chatId?} → 200 {text, source, intent, card?, tool?, ms, chatContext}
// eller 202 {jobId} når det tar mer enn 1,2 s. GET /api/assist/:id gir status/svar; realtime «assist» over /api/ws.
// Jobben kjører på serveren og fortsetter selv om appen lukkes. Appen ber om litt ekstra tid (beginBackgroundTask) så
// svaret som regel kommer fram og vises som lokalt varsel «Glimt» (kategori AI_ANSWER). Rekker den det ikke, henter
// BGAppRefreshTask /api/notify/pending senere (BackgroundNotifications.swift). Kommer brukeren tilbake uten å trykke på varselet:
// (prompt 45: ingen banner ved retur – bare systemvarselet).

struct Assist31Answer: Equatable {
    var text: String = ""
    var source: String = ""
    var intent: String = ""
    var tool: String = ""
    /// Kortet som JSON-tekst (card: {k, …}), tomt = uten kort.
    var cardJSON: String = ""
    var ms: Double = 0
    var chatId: String = ""
    /// Prompt 33 (memory.add): «Endre tittel på N avtaler?» → POST /api/glimt/memory/:id/apply
    var applyId: Int = 0
    var applyCount: Int = 0
    var applyTitle: String = ""
    /// Prompt 32: intent «nav» (side-snarvei fra serveren): siden som skal åpnes (nordlys, kalender …).
    var target32b: String = ""
    /// Prompt 34: svaret er en feilmelding («Glimt fikk ikke svar fra {modell}: {feil}») → Prøv igjen / Åpne AI-kontroll.
    var failed34: Bool = false
    /// Prompt 35: «været i New York» → open{route:'vaer', name, lat, lon}. Trykk på svaret åpner Vær for stedet.
    var wx35Name: String = ""
    var wx35Lat: Double = 0
    var wx35Lon: Double = 0
    var wx35: Bool { !wx35Name.isEmpty }
    /// Prompt 37: «hvor er Ingrid» → {intent:'family.where', person, place, open:{route:'familie', person}} (Assist.swift).
    var fam37Person: String = ""
    var fam37Name: String = ""
    var fam37: Bool { !fam37Person.isEmpty || intent == "family.where" }

    var plain: String { text.replacingOccurrences(of: "**", with: "").trimmingCharacters(in: .whitespacesAndNewlines) }

    static func from(_ raw: [String: Any]) -> Assist31Answer? {
        let o: [String: Any] = JS.dict(raw, "result") ?? JS.dict(raw, "answer") ?? raw
        guard let t = JS.str(o, "text") ?? JS.str(o, "answer") else { return nil }
        var a = Assist31Answer()
        a.text = t
        a.source = JS.str(o, "source") ?? ""
        a.intent = JS.str(o, "intent") ?? ""
        a.tool = JS.str(o, "tool") ?? ""
        a.ms = JS.num(o, "ms") ?? 0
        a.chatId = JS.str(o, "chatId") ?? JS.str(raw, "chatId") ?? ""
        a.target32b = JS.str(o, "target") ?? JS.str(raw, "target") ?? ""
        if let ap = JS.dict(o, "apply") { a.applyId = JS.int(ap, "memoryId") ?? 0; a.applyCount = JS.int(ap, "count") ?? 0; a.applyTitle = JS.str(ap, "title") ?? "" }
        if let op = JS.dict(o, "open") ?? JS.dict(raw, "open"), (JS.str(op, "route") ?? "vaer") == "vaer",
           let la = JS.num(op, "lat"), let lo = JS.num(op, "lon") {
            let pl: [String: Any] = JS.dict(o, "place") ?? [:]
            a.wx35Name = JS.str(op, "name") ?? JS.str(pl, "label") ?? JS.str(pl, "name") ?? "Stedet"
            a.wx35Lat = la
            a.wx35Lon = lo
        }
        Assist37.take(&a, o, raw)
        if let c = o["card"] as? [String: Any], let d = try? JSONSerialization.data(withJSONObject: c) {
            a.cardJSON = String(data: d, encoding: .utf8) ?? ""
        }
        // Prompt 34 (SERVER34): feil kommer som tydelig tekst i svaret, med ok:false / error:true / status «failed».
        let st: String = (JS.str(o, "status") ?? JS.str(raw, "status") ?? "").lowercased()
        let notOk: Bool = JS.bool(o, "ok") == false || JS.bool(raw, "ok") == false
        // SERVER34 sender {text: «Glimt fikk ikke svar fra …», error: «…», fix} når modellen feilet.
        let errFlag: Bool = (o["error"] as? Bool) == true || (o["error"] as? String)?.isEmpty == false
        a.failed34 = notOk || errFlag || st == "failed" || st == "error"
        return a
    }

    /// Prompt 34: feilsvar som vises i boblen i stedet for evig «tenker».
    static func failure34(_ text: String) -> Assist31Answer {
        var a = Assist31Answer()
        a.text = text
        a.source = Glimt31.name
        a.failed34 = true
        return a
    }
}

@MainActor
@Observable
final class Assist31 {
    static let shared = Assist31()

    /* ---------- Svarboblen under søkefeltet på Hjem ---------- */
    var homeQ: String = ""
    var homeBusy: Bool = false
    var homeAnswer: Assist31Answer? = nil
    var homeOpen: Bool { homeBusy || homeAnswer != nil }

    /// Serveren mangler /api/assist (404): søkefeltet går til Chat som før.
    var missing: Bool = false
    /// Prompt 34: siste feil fra Glimt (serverens tekst, f.eks. «Glimt fikk ikke svar fra qwen3:8b: 404 model not found»).
    var lastError34: String = ""
    /// Prompt 32: jobb-id-en til spørsmålet fra søkefeltet (for POST /api/assist/:id/handoff, HomeSearchHandoff.swift).
    @ObservationIgnored var homeJob32b: String = ""

    @ObservationIgnored private var homeId: Int = 0
    @ObservationIgnored private var waiters: [String: CheckedContinuation<Void, Never>] = [:]
    @ObservationIgnored private var cancelled: Set<String> = []
    /// Svar som kom mens appen var i bakgrunnen (banneret når appen åpnes igjen).
    @ObservationIgnored private var awayPending: (String, String, String)? = nil
    @ObservationIgnored private var awayGo: String = "hjem"
    @ObservationIgnored private var awayChat: String = ""
    @ObservationIgnored private var observer: NSObjectProtocol? = nil

    init() {
        observer = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { (_: Notification) in
            Task { @MainActor in Assist31.shared.becameActive() }
        }
    }

    /* ---------- Spør Glimt ---------- */

    /// Hjem: ↵ med Glimt valgt. Svaret vises i boblen under feltet (ikke i Chat).
    func askHome(_ q: String, _ store: Store) {
        homeId += 1
        let id: Int = homeId
        homeQ = q
        homeAnswer = nil
        homeBusy = true
        Task {
            let a: Assist31Answer? = await self.ask(q, source: "search", chatId: nil, page: "hjem", store)
            guard self.homeId == id else { return }
            self.homeBusy = false
            if self.action36 {
                // Prompt 36: handling → bare pillen («✓ …»), aldri kortet under søket.
                self.closeHome()
                let done: String = a.map { "✓ " + String($0.plain.prefix(70)) } ?? ""
                AiJobs31.shared.end("", done: done.isEmpty ? nil : done)
                return
            }
            if let a {
                self.homeAnswer = a
                Haptics.shared.select()
            } else if self.missing {
                self.closeHome()
                store.openChat(prompt: q)
            } else {
                // Prompt 34: vis den ekte feilen med Prøv igjen og Åpne AI-kontroll (ikke en generisk tekst).
                let err: String = self.lastError34.isEmpty ? "Glimt fikk ikke svar akkurat nå." : self.lastError34
                self.homeAnswer = Assist31Answer.failure34(err)
                Haptics.shared.warning()
            }
        }
    }

    /// Prompt 36: svar beregnet i appen (dagslys) vises rett i kortet under søkefeltet.
    func showLocal36(_ q: String, _ a: Assist31Answer) {
        homeId += 1
        homeQ = q
        homeBusy = false
        homeAnswer = a
        Haptics.shared.select()
    }

    /// Prompt 36: serveren sa kind:'action' – jobben vises i pillen, ikke i kortet under søkefeltet.
    @ObservationIgnored var action36: Bool = false

    func closeHome() {
        // Prompt 67: et svar som strømmer stoppes når boblen lukkes (GlimtAgent.swift).
        GlimtAgent45.shared.drop67()
        homeId += 1
        homeBusy = false
        homeAnswer = nil
        homeQ = ""
    }

    /// «Fortsett i Chat ›»: ny samtale med spørsmålet.
    /// Prompt 41: «Fortsett i Chat ›» bruker samme animasjon som å dra pillen ned (HomeSearchPull.swift).
    func continueInChat(_ store: Store) {
        if Assist38.shared.rect.width > 0 && store.paperTab == "hjem" {
            Pull41.shared.open(store, reduce: UIAccessibility.isReduceMotionEnabled)
            return
        }
        let q: String = homeQ
        // Prompt 43: samme svar som i boblen (ingen ny forespørsel); tenker den fortsatt, sendes spørsmålet som før.
        let answer: String = homeBusy ? "" : Pull41.chatText(homeAnswer)
        closeHome()
        store.openChat41(q, answer: answer)
    }

    /// Kjører spørsmålet gjennom Glimt-ruteren. nil = feil (eller avbrutt). page = siden som viser svaret selv.
    func ask(_ q: String, source: String, chatId: String?, page: String, _ store: Store) async -> Assist31Answer? {
        // Litt ekstra tid i bakgrunnen, så svaret rekker fram og kan vises som varsel.
        let bg: Bg31 = Bg31()
        bg.begin("glimt31")
        defer { bg.end() }
        var body: [String: Any] = ["q": q, "source": source]
        if let chatId, !chatId.isEmpty { body["chatId"] = chatId }
        let t0: Date = Date()
        lastError34 = ""
        if source == "search" { action36 = false }
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/assist", json: body, timeout: 25)
            missing = false
            let o: [String: Any] = JS.obj(d)
            if let err = JS.str(o, "error"), JS.str(o, "text") == nil, JS.str(o, "answer") == nil {
                lastError34 = Assist31.errorText34(err, model: JS.str(o, "model"))
                return nil
            }
            if source == "search" && (JS.str(o, "kind") ?? "") == "action" { action36 = true }
            if var a = Assist31Answer.from(o) {
                if a.ms == 0 { a.ms = Date().timeIntervalSince(t0) * 1000 }
                deliver(a, q: q, go: page, chatId: chatId ?? a.chatId, jobId: "")
                after(a, store)
                return a
            }
            guard let jobId = JS.str(o, "jobId") ?? JS.str(o, "id") else { return nil }
            if source == "search" { homeJob32b = jobId }
            // Prompt 36: ett Glimt om gangen. Spørsmål fra søkefeltet vises bare i kortet under feltet (ingen pille);
            // handlinger (kind:'action') vises bare i pillen.
            if source != "search" || action36 {
                AiJobs31.shared.begin(id: jobId, kind: "assist", title: action36 ? "Glimt ordner det" : "Glimt tenker", input: q, steps: AiJobs31.assistSteps, page: action36 ? "" : page)
                if action36 { homeBusy = false }
            }
            let a: Assist31Answer? = await wait(jobId, store, t0: t0)
            AiJobs31.shared.end(jobId)
            if let a {
                deliver(a, q: q, go: page, chatId: chatId ?? a.chatId, jobId: jobId)
                after(a, store)
            }
            return a
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 { missing = true }
            lastError34 = Assist31.errorText34(e.message, model: nil)
            return nil
        } catch {
            lastError34 = Assist31.errorText34(error.localizedDescription, model: nil)
            return nil
        }
    }

    /// «Glimt fikk ikke svar fra {modell}: {feil}». Serverens ferdige tekst brukes som den er.
    static func errorText34(_ err: String, model: String?) -> String {
        let e: String = err.trimmingCharacters(in: .whitespacesAndNewlines)
        if e.hasPrefix("Glimt") || e.hasPrefix("Sky-budsjettet") { return e }
        if let model, !model.isEmpty { return "Glimt fikk ikke svar fra " + model + ": " + e }
        return "Glimt fikk ikke svar: " + e
    }

    /// Prøveperiode lagt inn eller time lagt til: last inn på nytt (lokale prøve-varsler planlegges i Trial31Model).
    private func after(_ a: Assist31Answer, _ store: Store) {
        if a.intent.hasPrefix("trial") {
            Task { await Trial31Model.shared.load(store.api) }
        } else if a.intent == "appointment.create" {
            Task { await Cal26Model.shared.load(store, force: true) }
        }
    }

    /// Venter på jobben: GET /api/assist/:id hvert sekund (realtime «assist» vekker med en gang). Maks 2 minutter.
    private func wait(_ id: String, _ store: Store, t0: Date) async -> Assist31Answer? {
        var rounds: Int = 0
        while rounds < 120 {
            if cancelled.contains(id) { cancelled.remove(id); return nil }
            if let d = try? await store.api.callAt("/api", "GET", "/assist/" + API.pathPart(id), timeout: 15) {
                let o: [String: Any] = JS.obj(d)
                let state: String = JS.str(o, "state") ?? JS.str(o, "status") ?? ""
                if state == "failed" || state == "cancelled" {
                    // Prompt 34: feilteksten fra jobben (modell + årsak) vises i boblen.
                    if state == "failed" {
                        let err: String = JS.str(o, "error") ?? JS.str(JS.dict(o, "result"), "error") ?? "jobben feilet"
                        lastError34 = Assist31.errorText34(err, model: JS.str(o, "model"))
                    }
                    return nil
                }
                if state == "done" || state.isEmpty, var a = Assist31Answer.from(o) {
                    if a.ms == 0 { a.ms = Date().timeIntervalSince(t0) * 1000 }
                    return a
                }
                AiJobs31.shared.update(o, kind: "assist")
            }
            await sleepOrPoke(id)
            rounds += 1
        }
        lastError34 = "Glimt fikk ikke svar innen 2 minutter. Modellen kan være for stor for GPU-en."
        return nil
    }

    private func sleepOrPoke(_ id: String) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            waiters[id] = c
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if let w = self.waiters.removeValue(forKey: id) { w.resume() }
            }
        }
    }

    /// Realtime «assist»: oppdater glassboblen og vekk ventingen.
    func realtime(_ o: [String: Any], _ store: Store) {
        let id: String = JS.str(o, "jobId") ?? JS.str(o, "id") ?? ""
        AiJobs31.shared.update(o, kind: "assist")
        if let w = waiters.removeValue(forKey: id) { w.resume() }
    }

    func cancel(_ id: String, _ store: Store) {
        cancelled.insert(id)
        if let w = waiters.removeValue(forKey: id) { w.resume() }
        if homeBusy { closeHome() }
        let a: API = store.api
        Task { _ = try? await a.callAt("/api", "POST", "/assist/" + API.pathPart(id) + "/cancel", json: [:], timeout: 10) }
    }

    /* ---------- Varsel når appen er i bakgrunnen ---------- */

    /// Er appen ikke i forgrunnen: lokalt varsel «Glimt» med svaret (AI_ANSWER). Ellers vises svaret bare i appen.
    private func deliver(_ a: Assist31Answer, q: String, go: String, chatId: String?, jobId: String) {
        if UIApplication.shared.applicationState == .active { return }
        let body: String = a.plain
        if body.isEmpty { return }
        awayGo = go
        awayChat = chatId ?? ""
        guard NotifyModel.shared.on && NotifyModel.shared.aiBg else { return }
        let key: String = jobId.isEmpty ? "ai-" + String(Int(Date().timeIntervalSince1970 * 1000)) : "ai-" + jobId
        Notify31.markDelivered(jobId.isEmpty ? key : jobId)
        Notify31.postAnswer(body: body, go: go, chatId: chatId ?? "", id: key)
    }

    /// Prompt 45: når appen åpnes igjen vises ingen banner – svaret ligger i chatten / svarfeltet på Hjem.
    private func becameActive() {
        awayPending = nil
    }

    /// Varselet ble trykket på: ikke vis banneret i tillegg.
    func clearAway() {
        awayPending = nil
        AiJobs31.shared.closeAway()
    }

    /// Trykk på banneret: Chat eller Hjem.
    func openAway(_ store: Store) {
        Notify31.open(go: awayGo, chatId: awayChat, store)
    }
}

/* ---------- Søkefeltets svarboble ---------- */

/// Mørk glassboble under søkefeltet på Hjem: «Tenker på «…» …» med animert Glimt, så svaret med det viktigste uthevet.
struct Assist31Bubble: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Assist31 { Assist31.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if m.homeBusy && GlimtAgent45.shared.streaming67 {
                // Prompt 67: ordene så langt, statuslinja og Stopp mens Glimt strømmer (Conversations.swift).
                Glimt67HomeLive()
            } else if m.homeBusy {
                HStack(spacing: 10) {
                    Glimt31Mark(size: 22, state: .thinking, dark: true)
                    Text("Tenker på «" + m.homeQ + "» …").font(PF.ui(16, .medium)).foregroundStyle(Color(hex: "#f6f2ea").opacity(0.75))
                        .lineLimit(2)
                }
                .frame(minHeight: 28)
            } else if let a = m.homeAnswer {
                // Prompt 70: kort A erstatter svarteksten når Glimt har lagt inn en avtale (GlimtCalendarCard.swift).
                if let c = Cal70Model.shared.card, Cal70Model.shared.showsCard(a.text) {
                    Cal70CardView(card: c, mode: .home).id(c.eventId)
                } else {
                    Assist31BoldText(text: a.text, size: 17, color: Color(hex: "#f6f2ea"), bold: Color.white)
                        .fixedSize(horizontal: false, vertical: true)
                        // Prompt 74: hold inne i svaret gir systemets tekstmeny (Kopier/Del), ikke wiggle.
                        .textSelection(.enabled)
                }
                if let q = Cal70Model.shared.ask, Cal70Model.shared.showsAsk(a.text) { Assist31Cal70Ask(ask: q) }
                // Prompt 67: «Stoppet» / cache-merknad, valgknapper og tommel opp/ned (Conversations.swift).
                Glimt67HomeExtras(a: a)
                if a.applyId > 0 && a.applyCount > 0 { Memory33ApplyButton(a: a) }
                // Prompt 34: feil → Prøv igjen og Åpne AI-kontroll (Assist.swift).
                if a.failed34 {
                    Assist34ErrorFoot()
                } else if a.wx35 {
                    // Prompt 35: vær for et sted → «Åpne Vær for New York ›» (Assist.swift).
                    Assist35WxFoot(a: a)
                } else if a.fam37 {
                    // Prompt 37: «hvor er Ingrid» → «Familie · posisjon» og «Vis på kart ›» (Assist.swift).
                    Assist37FamFoot(a: a)
                } else {
                    Assist31BubbleFoot(source: a.source)
                }
            }
        }
        // Prompt 41: pillen strekker seg når den dras ned (bunnmarg + 0,65 × dra), HomeSearchPull.swift.
        // Prompt 70: litt mer luft nederst, så grepet (30 pt, Assist38Swipe) ikke dekker knappene i foten.
        .padding(.leading, 18).padding(.trailing, 40).padding(.top, 16).padding(.bottom, 26 + Pull41.shared.pull * 0.65)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(Color(hex: "#161412").opacity(0.78))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .shadow(color: Color.black.opacity(0.45), radius: 25, y: 16)
        // Prompt 38: ✕ oppe til høyre, håndtak nederst, sveip opp lukker. Trykk i boblen lukker ikke lenger.
        // Prompt 70: ingen fullskjerm-lag – kortet scroller med Hjem, sveip bare fra grepet, trykk utenfor lukker et ferdig
        // svar (Assist70Tap, HomeAssistScroll.swift).
        .overlay(alignment: .topTrailing) { Assist38CloseButton().padding(.top, 2).padding(.trailing, 2) }
        .overlay(alignment: .bottom) {
            // Prompt 41: håndtaket blir bredere (34 → 80 pt) og «Dra ned / Slipp for å åpne i Chat» tones inn.
            Pull41Hint()
        }
        .environment(\.colorScheme, .dark)
        .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .onTapGesture {}
        .assist38Swipe()
        .accessibilityElement(children: .contain)
    }
}

struct Assist31BubbleFoot: View {
    @Environment(Store.self) private var store
    let source: String
    @MainActor private var m: Assist31 { Assist31.shared }

    var body: some View {
        HStack(spacing: 8) {
            Text("✦ " + (source.isEmpty ? Glimt31.name : source))
                .font(PF.ui(11.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea").opacity(0.55)).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button { m.continueInChat(store) } label: {
                Text("Fortsett i Chat ›").font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
                    .padding(.horizontal, 14).frame(height: 32)
                    .background(Color.white.opacity(0.14), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Tekst der **…** blir fet (og egen farge).
struct Assist31BoldText: View {
    let text: String
    let size: CGFloat
    let color: Color
    let bold: Color

    var body: some View {
        Assist31BoldText.build(text, size: size, color: color, bold: bold)
            .lineSpacing(3)
    }

    static func build(_ text: String, size: CGFloat, color: Color, bold: Color) -> Text {
        let parts: [String] = text.components(separatedBy: "**")
        var out: Text = Text("")
        for (i, s) in parts.enumerated() {
            if s.isEmpty { continue }
            let isBold: Bool = i % 2 == 1
            let seg: Text = Text(s).font(PF.ui(size, isBold ? .heavy : .medium)).foregroundColor(isBold ? bold : color)
            out = out + seg
        }
        return out
    }
}

/// beginBackgroundTask / endBackgroundTask (avsluttes også når tiden går ut).
@MainActor
final class Bg31 {
    private var id: UIBackgroundTaskIdentifier = .invalid

    func begin(_ name: String) {
        id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            MainActor.assumeIsolated { self?.end() }
        }
    }

    func end() {
        if id == .invalid { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}

// ---- Tidligere Assist34.swift ----

/* ---------------- Prompt 34: tydelige Glimt-feil i svarboblen ----------------
   prompts/prompt-34-pakke/claude-code-glimt-virker-ikke.md punkt 6: AI-søk og Glimt viste ingenting eller «tenker» for alltid.
   Nå: «Glimt fikk ikke svar fra {modell}: {feil}» med **Prøv igjen** og **Åpne AI-kontroll** (selvtesten på Oversikt).
   Serveren (SERVER34) bytter selv til reservemodellen etter 20 s; feiler den også, kommer teksten i svaret eller som feil. */

struct Assist34ErrorFoot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Assist31 { Assist31.shared }

    var body: some View {
        HStack(spacing: 8) {
            Assist34Pill(title: "Prøv igjen", strong: true) {
                Haptic34.light()
                let q: String = m.homeQ
                if q.isEmpty { m.closeHome(); return }
                Search32b.shared.askHome(q, store)
            }
            Assist34Pill(title: "Åpne AI-kontroll", strong: false) {
                m.closeHome()
                AiCtl34.shared.show("ov")
            }
            Spacer(minLength: 0)
        }
    }
}

struct Assist34Pill: View {
    let title: String
    let strong: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
                .padding(.horizontal, 14).frame(height: 32)
                .background(Color.white.opacity(strong ? 0.22 : 0.1), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// ---- Tidligere Assist35.swift ----

/* ---------------- Prompt 35: AI-søk på Hjem – været for hvilket som helst sted ----------------
   prompts/prompt-35-pakke/claude-code-ai-sok-vaer-sted.md. Serveren (SERVER35) finner stedet i teksten, geokoder og svarer
   /api/assist → {intent:'weather', text, place, open:{route:'vaer', name, lat, lon}}. Appen viser serverens svar i boblen;
   trykk (eller «Åpne Vær for … ›») åpner Vær for stedet, som legges midlertidig i bylista (ikke lagret på serveren). */

struct Assist35WxFoot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Assist31 { Assist31.shared }
    let a: Assist31Answer

    var body: some View {
        HStack(spacing: 8) {
            Text("✦ " + (a.source.isEmpty ? "Vær" : a.source))
                .font(PF.ui(11.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea").opacity(0.55)).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Haptics.shared.tap()
                m.closeHome()
                store.openWeather35(name: a.wx35Name, lat: a.wx35Lat, lon: a.wx35Lon)
            } label: {
                Text("Åpne Vær for " + Assist35WxFoot.short(a.wx35Name) + " ›").font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1)
                    .padding(.horizontal, 14).frame(height: 32)
                    .background(Color.white.opacity(0.14), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    /// «New York, USA» → «New York».
    static func short(_ n: String) -> String {
        n.components(separatedBy: ",").first?.trimmingCharacters(in: .whitespaces) ?? n
    }
}

extension Store {
    /// Åpner Vær for et sted fra AI-søket. Stedet legges midlertidig først i bylista (lagres ikke på serveren).
    func openWeather35(name: String, lat: Double, lon: Double) {
        let near: WxPlace? = weatherPlaces.first { (p: WxPlace) -> Bool in
            guard let la = p.lat, let lo = p.lon else { return false }
            return abs(la - lat) < 0.05 && abs(lo - lon) < 0.05
        }
        let id: String
        if let near {
            id = near.id
        } else {
            id = String(format: "tmp35:%.4f,%.4f", lat, lon)
            // Bare ett midlertidig sted om gangen.
            weatherPlaces.removeAll { (p: WxPlace) -> Bool in p.id.hasPrefix("tmp35:") }
            let short: String = Assist35WxFoot.short(name)
            let region: String = name.contains(",") ? (name.components(separatedBy: ",").last?.trimmingCharacters(in: .whitespaces) ?? "") : ""
            weatherPlaces.insert(WxPlace(id: id, name: short.isEmpty ? name : short, lat: lat, lon: lon, region: region), at: 0)
        }
        weatherPlace = id
        weatherOpen = true
        Task { await self.loadWeatherFull(force: true) }
    }
}

// ---- Tidligere Assist36.swift ----

/* ---------------- Prompt 36: Glimt – spørsmål eller handling, og dagslys for en dato ----------------
   prompts/prompt-36-pakke/claude-code-glimt-en-indikator.md, fasit: Mobil Papir App.dc.html → hsVals() isQ.
   · Spørsmål (svaret skal leses) vises BARE i kortet under søkefeltet. Handlinger (legg til, påminn, avtaler) vises BARE i
     Glimt-pillen øverst. Aldri begge: spørsmål fra søkefeltet publiseres ikke til pillen (Assist31.ask / AiJobs31.update).
   · Spørsmålsvakt før avtaletolkning: «?», spørreord først, eller «hvor mange/mye/lenge/langt, hva er/blir, når går/er,
     hvordan blir». Unntak: «legg til / book / bestill / påminn» gir fortsatt handling. Da vises aldri «Legg i kalender».
   · Intensjonsord må være hele ord: \b(time|timen|timeavtale|avtale)\b – «timer», «timeplan» og «sommertid» teller ikke.
   · Dagslys, soloppgang og solnedgang for en dato besvares lokalt (NOAA-formelen, valgt værsted eller Oslo), med «Åpne Vær ›».
   Serveren (SERVER36) svarer også kind:'question'|'action' fra /api/assist; kind:'action' flytter jobben til pillen. */

enum Assist36 {
    private static let starts: [String] = ["spørsmål", "hva ", "hva?", "hvor ", "hvem ", "hvilken ", "hvilke ", "hvilket ", "hvordan ",
                                           "hvorfor ", "når ", "kan du ", "vet du ", "fortell ", "what ", "when ", "where ", "how ",
                                           "who ", "why ", "is ", "are ", "do ", "does "]
    private static let inner: [String] = ["hvor mange", "hvor mye", "hvor lenge", "hvor langt", "hva er", "hva blir", "når går",
                                          "når er", "hvordan blir", "hva skjer"]
    private static let actions: [String] = ["legg til", "legg inn", "book ", "bestill", "påminn", "minn meg", "lagre ", "last opp",
                                            "avbestill", "add ", "remind me"]

    /// Eksplisitt handlingsverb (vinner over spørsmålsvakten).
    static func explicitAction(_ raw: String) -> Bool {
        let t: String = " " + raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) + " "
        return actions.contains { (a: String) -> Bool in t.contains(" " + a) }
    }

    /// Er teksten et spørsmål (svaret skal leses)?
    static func isQuestion(_ raw: String) -> Bool {
        let t: String = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || explicitAction(t) { return false }
        if t.contains("?") { return true }
        let padded: String = t + " "
        if starts.contains(where: { (s: String) -> Bool in padded.hasPrefix(s) }) { return true }
        return inner.contains { (s: String) -> Bool in t.contains(s) }
    }

    /// Hele ord: time, timen, timeavtale, avtale (ikke «timer», «timeplan», «sommertid»).
    static func hasApptWord(_ raw: String) -> Bool {
        let t: String = raw.lowercased()
        return t.range(of: "\\b(time|timen|timeavtale|avtale)\\b", options: .regularExpression) != nil
    }

    /// Søket skal ikke foreslå «Legg i kalender»: spørsmål uten eksplisitt handling.
    static func blocksAppt(_ raw: String) -> Bool { isQuestion(raw) }

    /* ---------- Dagslys og sol ---------- */

    static func isSunQuestion(_ raw: String) -> Bool {
        let t: String = raw.lowercased()
        let keys: [String] = ["dagslys", "soloppgang", "solnedgang", "sola opp", "sola ned", "solen opp", "solen ned",
                              "sola går", "solen går", "lyst ute", "sunrise", "sunset", "daylight"]
        return keys.contains { (k: String) -> Bool in t.contains(k) }
    }

    private static let months: [(String, Int)] = [("januar", 1), ("februar", 2), ("mars", 3), ("april", 4), ("mai", 5), ("juni", 6),
                                                  ("juli", 7), ("august", 8), ("september", 9), ("oktober", 10), ("november", 11),
                                                  ("desember", 12), ("jan", 1), ("feb", 2), ("mar", 3), ("apr", 4), ("jun", 6),
                                                  ("jul", 7), ("aug", 8), ("sep", 9), ("okt", 10), ("nov", 11), ("des", 12)]

    /// Datoen i teksten: 29.06.2027, 29.06, 29/6, «29. juni 2027», «i morgen», ellers i dag.
    static func dateIn(_ raw: String, now: Date = Date()) -> Date {
        let t: String = raw.lowercased()
        let cal: Calendar = Calendar.current
        let today: Date = cal.startOfDay(for: now)
        if t.contains("i overmorgen") { return cal.date(byAdding: .day, value: 2, to: today) ?? today }
        if t.contains("i morgen") || t.contains("tomorrow") { return cal.date(byAdding: .day, value: 1, to: today) ?? today }
        let year: Int = cal.component(.year, from: now)
        if let r = t.range(of: "\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\b", options: .regularExpression) {
            let parts: [Int] = t[r].split(whereSeparator: { $0 == "." || $0 == "/" }).compactMap { Int($0) }
            if parts.count >= 2 {
                var y: Int = parts.count >= 3 ? parts[2] : year
                if y < 100 { y += 2000 }
                if let d = make(y, parts[1], parts[0]) { return d }
            }
        }
        for (name, m) in months {
            if let r = t.range(of: "\\b(\\d{1,2})\\.?\\s+" + name + "\\b(\\s+\\d{4})?", options: .regularExpression) {
                let nums: [Int] = t[r].split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
                if let day = nums.first {
                    let y: Int = nums.count >= 2 ? nums[1] : year
                    if let d = make(y, m, day) { return d }
                }
            }
        }
        return today
    }

    private static func make(_ y: Int, _ m: Int, _ d: Int) -> Date? {
        if m < 1 || m > 12 || d < 1 || d > 31 { return nil }
        var c: DateComponents = DateComponents()
        c.year = y
        c.month = m
        c.day = d
        c.hour = 12
        return Calendar.current.date(from: c)
    }

    /// NOAA/suncalc-formelen (solhøyde −0,833°). nil = midnattssol eller mørketid.
    static func sun(_ day: Date, lat: Double, lon: Double) -> (rise: Date, set: Date)? {
        let rad: Double = Double.pi / 180
        var c: DateComponents = Calendar.current.dateComponents([.year, .month, .day], from: day)
        c.hour = 12
        let noon: Date = Calendar.current.date(from: c) ?? day
        let jd: Double = noon.timeIntervalSince1970 / 86400 + 2440587.5
        let n: Double = (jd - 2451545.0 + 0.0008).rounded()
        let jStar: Double = n - lon / 360
        let mDeg: Double = (357.5291 + 0.98560028 * jStar).truncatingRemainder(dividingBy: 360)
        let mR: Double = mDeg * rad
        let cEq: Double = 1.9148 * sin(mR) + 0.02 * sin(2 * mR) + 0.0003 * sin(3 * mR)
        let lam: Double = (mDeg + cEq + 180 + 102.9372).truncatingRemainder(dividingBy: 360) * rad
        let jTransit: Double = 2451545.0 + jStar + 0.0053 * sin(mR) - 0.0069 * sin(2 * lam)
        let dec: Double = asin(sin(lam) * sin(23.4397 * rad))
        let phi: Double = lat * rad
        let cosW: Double = (sin(-0.833 * rad) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec))
        if cosW < -1 || cosW > 1 { return nil }
        let w: Double = acos(cosW) / rad
        let jRise: Double = jTransit - w / 360
        let jSet: Double = jTransit + w / 360
        let rise: Date = Date(timeIntervalSince1970: (jRise - 2440587.5) * 86400)
        let set: Date = Date(timeIntervalSince1970: (jSet - 2440587.5) * 86400)
        return (rise, set)
    }

    private static let monthNames: [String] = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august",
                                               "september", "oktober", "november", "desember"]

    /// «29. juni 2027 i Oslo: soloppgang 03:54, solnedgang 22:44, 18 t 50 min dagslys.»
    static func sunText(_ raw: String, place: String, lat: Double, lon: Double) -> String {
        let day: Date = dateIn(raw)
        let cal: Calendar = Calendar.current
        let d: Int = cal.component(.day, from: day)
        let m: Int = cal.component(.month, from: day)
        let y: Int = cal.component(.year, from: day)
        let head: String = "\(d). " + monthNames[(m - 1) % 12] + " \(y) i " + place
        guard let s = sun(day, lat: lat, lon: lon) else {
            let summer: Bool = (m >= 4 && m <= 9) == (lat >= 0)
            return head + (summer ? ": **midnattssol** – sola går ikke ned, 24 t dagslys." : ": **mørketid** – sola står ikke opp.")
        }
        let mins: Int = Int(s.set.timeIntervalSince(s.rise) / 60)
        let len: String = "\(mins / 60) t \(mins % 60) min"
        return head + ": soloppgang **" + JS.fmt(s.rise, "HH:mm") + "**, solnedgang **" + JS.fmt(s.set, "HH:mm") + "**, **" + len + "** dagslys."
    }

    /// Lokalt svar for sol-spørsmål (stedet: valgt værsted, ellers Oslo). nil = ikke et sol-spørsmål.
    @MainActor static func localAnswer(_ raw: String, _ store: Store) -> Assist31Answer? {
        if !isSunQuestion(raw) { return nil }
        var name: String = "Oslo"
        var lat: Double = 59.9139
        var lon: Double = 10.7522
        if let p = store.weatherPlaces.first(where: { $0.id == store.weatherPlace }) ?? store.weatherPlaces.first,
           let la = p.lat, let lo = p.lon {
            name = p.name
            lat = la
            lon = lo
        } else if let la = store.weatherLat, let lo = store.weatherLon {
            name = store.homeWeather?.place ?? "her"
            lat = la
            lon = lo
        }
        var a: Assist31Answer = Assist31Answer()
        a.text = sunText(raw, place: name, lat: lat, lon: lon)
        a.source = "Sol · beregnet lokalt"
        a.intent = "sun"
        a.wx35Name = name
        a.wx35Lat = lat
        a.wx35Lon = lon
        return a
    }
}

// ---- Tidligere Assist37.swift ----

/* ---------------- Prompt 37: «Hvor er Ingrid?» i søket på Hjem ---------------- */
// prompts/prompt-37-pakke/claude-code-sok-hvor-er.md. Serveren (SERVER37) tolker spørsmålet og svarer fra /api/assist med
// {intent:'family.where', text, person, place, open:{route:'familie', person}} – bare om personer som deler posisjon med deg.
// Appen viser teksten i svarboblen, «Familie · posisjon» som kilde og «Vis på kart ›», som åpner Familie med personen valgt.

enum Assist37 {
    /// Leser person/open fra svaret (begge former: streng eller {id, name}).
    static func take(_ a: inout Assist31Answer, _ o: [String: Any], _ raw: [String: Any]) {
        let op: [String: Any]? = JS.dict(o, "open") ?? JS.dict(raw, "open")
        let route: String = (JS.str(op, "route") ?? "").lowercased()
        let isWhere: Bool = a.intent == "family.where" || route == "familie" || route == "family"
        guard isWhere else { return }
        var pid: String = ""
        var pname: String = ""
        if let pd = JS.dict(op, "person") ?? JS.dict(o, "person") {
            pid = JS.str(pd, "id") ?? JS.str(pd, "userId") ?? JS.str(pd, "username") ?? ""
            pname = JS.str(pd, "name") ?? ""
        } else {
            pid = JS.str(op, "person") ?? JS.str(o, "person") ?? ""
        }
        if pname.isEmpty { pname = pid }
        a.fam37Person = pid.isEmpty ? "-" : pid
        a.fam37Name = pname
        if a.source.isEmpty { a.source = "Familie · posisjon" }
    }

    /// Åpner Familie med personen valgt (laster Familie først hvis den ikke er lastet).
    @MainActor
    static func openFamily(_ a: Assist31Answer, _ store: Store) {
        Haptics.shared.tap()
        store.paperGo("familie")
        let fm: FamilyModel = FamilyModel.shared
        if pick(a, fm) { return }
        Task { @MainActor in
            await fm.load(store)
            _ = pick(a, fm)
        }
    }

    @MainActor
    private static func pick(_ a: Assist31Answer, _ fm: FamilyModel) -> Bool {
        let want: String = a.fam37Person.lowercased()
        let wantName: String = a.fam37Name.lowercased()
        if want == "-" && wantName.isEmpty { return true }
        let hit: FamMember? = fm.members.first { (m: FamMember) -> Bool in
            m.id.lowercased() == want || m.username.lowercased() == want || m.name.lowercased() == wantName
                || m.name.lowercased().hasPrefix(wantName + " ")
        }
        guard let hit else { return false }
        fm.selected = hit.id
        return true
    }
}

/// Bunnlinjen i svarboblen: «✦ Familie · posisjon» og «Vis på kart ›».
struct Assist37FamFoot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Assist31 { Assist31.shared }
    let a: Assist31Answer

    var body: some View {
        HStack(spacing: 8) {
            Text("✦ " + (a.source.isEmpty ? "Familie · posisjon" : a.source))
                .font(PF.ui(11.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea").opacity(0.55)).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                m.closeHome()
                Assist37.openFamily(a, store)
            } label: {
                Text("Vis på kart ›").font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
                    .padding(.horizontal, 14).frame(height: 32)
                    .background(Color.white.opacity(0.14), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Vis på kart i Familie")
        }
    }
}

// ---- Tidligere Assist38.swift ----

/* ---------------- Prompt 38: lukke AI-svarboblen på Hjem uten å treffe kortet under ----------------
   claude-code-hjem-ai-svar-lukk.md, fasit Mobil Papir App.dc.html → hs.ans* / hs.sw*.
   - Trykk i selve boblen lukker den ikke lenger (tekst kan leses i ro).
   - ✕ oppe til høyre (30 pt, glass) lukker.
   - Sveip opp på boblen (> 40 pt) lukker med glid og fade; under terskelen spretter den tilbake. Håndtak nederst.
   - Trykk utenfor lukker via et usynlig lag over hele appen med et hull der boblen er. Laget fanger trykket, så kortet
     under (f.eks. Vær) ikke åpnes. Å begynne å dra/scrolle utenfor lukker også. Lett haptikk ved lukking.
   Prompt 70: laget er fjernet (Hjem skal kunne scrolles mens Glimt svarer), sveipet virker bare fra grepet nederst,
   og trykk utenfor lukker bare et ferdig svar (HomeAssistScroll.swift). */

@MainActor
@Observable
final class Assist38 {
    static let shared = Assist38()

    /// Boblens ramme i globale koordinater. Prompt 70: endres for hvert scroll-bilde, så den observeres ikke (ingen ny tegning).
    @ObservationIgnored var rect: CGRect = .zero

    /// Prompt 74: sveip opp fra grepet lukker bare over 60 pt og raskt (fortsatt fart oppover når fingeren slippes).
    nonisolated static func swipeCloses(_ t: CGFloat, _ predicted: CGFloat) -> Bool {
        t < -60 && predicted - t < -40
    }

    static func close() {
        Haptic34.light()
        withAnimation(.easeOut(duration: 0.18)) { Assist31.shared.closeHome() }
        Assist38.shared.rect = .zero
    }
}

/// Prompt 70 (hjem-scroll-mens-ai): det usynlige fullskjerm-laget er borte – det stoppet scroll og lukket kortet ved første
/// bevegelse. Hjem scroller fritt mens Glimt tenker og etter svaret. Trykk utenfor lukker via Assist70Tap på innholdet
/// (HomeAssistScroll.swift). Plassen over PaperShell (Paper.swift) viser nå bare pillen «Glimt svarte ↑» nederst over fanelinjen
/// når svaret ble ferdig mens kortet var scrollet ut av syne.
struct Assist38Catcher: View {
    var body: some View {
        Assist70Pill()
    }
}

/// ✕ (30 pt, glass) oppe til høyre i boblen.
struct Assist38CloseButton: View {
    var body: some View {
        Button { Assist38.close() } label: {
            Image(systemName: "xmark").font(.dyn51(size: 11, weight: .bold)).foregroundStyle(Color.white.opacity(0.85))
                .frame(width: 30, height: 30)
                .background(Color.white.opacity(0.14), in: Circle())
                .overlay(Circle().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lukk svaret")
    }
}

/// Sveip opp for å lukke, og rammen til hullet i laget.
struct Assist38Swipe: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var dy: CGFloat = 0

    func body(content: Content) -> some View {
        // Prompt 41: ned = åpne i Chat (HomeSearchPull.swift): pillen flyttes 0,35 × dra og strekker seg (bunnmargen i Assist31Bubble).
        let down: CGFloat = Pull41.shared.pull * 0.35
        content
            .background {
                GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { Assist38.shared.rect = g.frame(in: .global) }
                        .onChange(of: g.frame(in: .global)) { (_: CGRect, r: CGRect) in Assist38.shared.rect = r }
                }
            }
            // Prompt 70: sveip opp / dra ned bare fra grepet nederst (30 pt). Resten av kortet scroller siden (som pan-y).
            .overlay(alignment: .bottom) { grip }
            .offset(y: dy + down)
            .opacity(Double(1 + Swift.max(-1, dy / 160)))
            .onDisappear { Assist38.shared.rect = .zero }
    }

    private var grip: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: 30)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 6, coordinateSpace: .global)
                    .onChanged { (v: DragGesture.Value) in
                        let t: CGFloat = v.translation.height
                        if t < 0 {
                            dy = t
                            if Pull41.shared.pull > 0 { Pull41.shared.changed(0) }
                        } else {
                            dy = 0
                            var tr: Transaction = Transaction()
                            tr.disablesAnimations = true
                            withTransaction(tr) { Pull41.shared.changed(t) }
                        }
                    }
                    .onEnded { (v: DragGesture.Value) in
                        if Pull41.shared.over {
                            Pull41.shared.open(store, reduce: reduce)
                            dy = 0
                            return
                        }
                        if Pull41.shared.pull > 0 { Pull41.shared.cancel() }
                        // Prompt 74: tydelig terskel – mer enn 60 pt opp og raskt (fart beregnet ut fra predictedEndTranslation).
                        if Assist38.swipeCloses(v.translation.height, v.predictedEndTranslation.height) {
                            withAnimation(.easeOut(duration: 0.18)) { dy = -140 }
                            Task { @MainActor in
                                try? await Task.sleep(nanoseconds: 160_000_000)
                                Assist38.close()
                                dy = 0
                            }
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { dy = 0 }
                        }
                    }
            )
            .accessibilityHidden(true)
    }
}

extension View {
    func assist38Swipe() -> some View { modifier(Assist38Swipe()) }
}
