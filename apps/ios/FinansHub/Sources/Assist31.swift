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
// BGAppRefreshTask /api/notify/pending senere (Notify31.swift). Kommer brukeren tilbake uten å trykke på varselet:
// banneret «Glimt svarte mens du var borte» i 4 s (AiJob31.swift).

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
    /// Prompt 37: «hvor er Ingrid» → {intent:'family.where', person, place, open:{route:'familie', person}} (Assist37.swift).
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
    /// Prompt 32: jobb-id-en til spørsmålet fra søkefeltet (for POST /api/assist/:id/handoff, Search32.swift).
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
        homeId += 1
        homeBusy = false
        homeAnswer = nil
        homeQ = ""
    }

    /// «Fortsett i Chat ›»: ny samtale med spørsmålet.
    func continueInChat(_ store: Store) {
        let q: String = homeQ
        closeHome()
        store.openChat(prompt: q)
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
            if let d = try? await store.api.callAt("/api", "GET", "/assist/" + Cal27Model.enc(id), timeout: 15) {
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
        Task { _ = try? await a.callAt("/api", "POST", "/assist/" + Cal27Model.enc(id) + "/cancel", json: [:], timeout: 10) }
    }

    /* ---------- Varsel når appen er i bakgrunnen ---------- */

    /// Er appen ikke i forgrunnen: lokalt varsel «Glimt» med svaret (AI_ANSWER). Ellers vises svaret bare i appen.
    private func deliver(_ a: Assist31Answer, q: String, go: String, chatId: String?, jobId: String) {
        if UIApplication.shared.applicationState == .active { return }
        let body: String = a.plain
        if body.isEmpty { return }
        awayPending = ("Glimt svarte mens du var borte", body, go)
        awayGo = go
        awayChat = chatId ?? ""
        guard NotifyModel.shared.on && NotifyModel.shared.aiBg else { return }
        let key: String = jobId.isEmpty ? "ai-" + String(Int(Date().timeIntervalSince1970 * 1000)) : "ai-" + jobId
        Notify31.markDelivered(jobId.isEmpty ? key : jobId)
        Notify31.postAnswer(body: body, go: go, chatId: chatId ?? "", id: key)
    }

    private func becameActive() {
        guard let p = awayPending else { return }
        awayPending = nil
        AiJobs31.shared.showAway(p.0, p.1)
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
            if m.homeBusy {
                HStack(spacing: 10) {
                    Glimt31Mark(size: 22, state: .thinking, dark: true)
                    Text("Tenker på «" + m.homeQ + "» …").font(PF.ui(16, .medium)).foregroundStyle(Color(hex: "#f6f2ea").opacity(0.75))
                        .lineLimit(2)
                }
                .frame(minHeight: 28)
            } else if let a = m.homeAnswer {
                Assist31BoldText(text: a.text, size: 17, color: Color(hex: "#f6f2ea"), bold: Color.white)
                    .fixedSize(horizontal: false, vertical: true)
                if a.applyId > 0 && a.applyCount > 0 { Memory33ApplyButton(a: a) }
                // Prompt 34: feil → Prøv igjen og Åpne AI-kontroll (Assist34.swift).
                if a.failed34 {
                    Assist34ErrorFoot()
                } else if a.wx35 {
                    // Prompt 35: vær for et sted → «Åpne Vær for New York ›» (Assist35.swift).
                    Assist35WxFoot(a: a)
                } else if a.fam37 {
                    // Prompt 37: «hvor er Ingrid» → «Familie · posisjon» og «Vis på kart ›» (Assist37.swift).
                    Assist37FamFoot(a: a)
                } else {
                    Assist31BubbleFoot(source: a.source)
                }
            }
        }
        .padding(.leading, 18).padding(.trailing, 40).padding(.top, 16).padding(.bottom, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(Color(hex: "#161412").opacity(0.78))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .shadow(color: Color.black.opacity(0.45), radius: 25, y: 16)
        // Prompt 38: ✕ oppe til høyre, håndtak nederst, sveip opp lukker. Trykk i boblen lukker ikke lenger
        // (trykk utenfor fanges av Assist38Catcher, så kortet under ikke åpnes). Assist38.swift.
        .overlay(alignment: .topTrailing) { Assist38CloseButton().padding(.top, 2).padding(.trailing, 2) }
        .overlay(alignment: .bottom) {
            Capsule().fill(Color.white.opacity(0.25)).frame(width: 34, height: 4).padding(.bottom, 5)
                .allowsHitTesting(false)
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
