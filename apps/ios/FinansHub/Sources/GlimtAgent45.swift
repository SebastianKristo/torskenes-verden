import SwiftUI
import UIKit

/* ---------------- Prompt 45: Glimt-feltet på Hjem bruker den felles agenten (claude-code-glimt-intelligent-agent.md) ----------------
 Rotårsak på iOS (samme som på serveren): søkefeltet på Hjem gjettet selv FØR modellen fikk teksten – Quick29 (er det en avtale?),
 Tasks41Glimt.isHuske (er det en huskebeskjed?) og Assist36 – og sendte så hele setningen videre til én av tre ulike ruter.
 Nå: med Glimt (✦ AI) valgt går teksten rett til POST /api/glimt/agent {text, module:'home', context, requestId}; serveren forstår
 intensjonen, velger verktøy, validerer dato/tid/beløp, utfører med idempotens og svarer kort. Appen viser bare svaret:
 – reply i svarboblen under feltet (Assist31), results som liste i svaret,
 – ask {question, options} som ett oppfølgingsspørsmål (valg sendes tilbake med samme kontekst),
 – confirm {token, summary} før destruktive/viktige handlinger (POST /api/glimt/agent/confirm {token}).
 requestId er fast for samme tekst i 30 s, så et dobbelttrykk ikke lager to avtaler. Eldre server (404): den gamle kjeden som før. */

struct GlimtAgent45Ask: Identifiable, Equatable {
    var id: String { question }
    var question: String
    var options: [String]
    var text: String
}

struct GlimtAgent45Confirm: Identifiable, Equatable {
    var id: String { token }
    var token: String
    var summary: String
}

@MainActor
@Observable
final class GlimtAgent45 {
    static let shared = GlimtAgent45()

    var available: Bool = true
    var ask: GlimtAgent45Ask? = nil
    var confirm: GlimtAgent45Confirm? = nil

    @ObservationIgnored private var lastText: String = ""
    @ObservationIgnored private var lastId: String = ""
    @ObservationIgnored private var lastAt: Date = .distantPast

    private func requestId(_ t: String) -> String {
        if t == lastText && Date().timeIntervalSince(lastAt) < 30 { return lastId }
        lastText = t
        lastAt = Date()
        lastId = "ios-" + UUID().uuidString.lowercased()
        return lastId
    }

    /// Hjem-feltet. true = agenten tok forespørselen (også ved feil som er vist); false = bruk den gamle kjeden.
    func home(_ text: String, _ store: Store, context: [String: Any] = [:]) async -> Bool {
        guard available else { return false }
        let a: Assist31 = Assist31.shared
        a.homeQ = text
        a.homeBusy = true
        a.homeAnswer = nil
        var body: [String: Any] = ["text": text, "module": "home", "requestId": requestId(text)]
        if !context.isEmpty { body["context"] = context }
        // Svar på et åpent spørsmål uten valg: forrige forespørsel og spørsmålet følger med som kontekst.
        if context.isEmpty, let q = ask, q.options.isEmpty {
            body["context"] = ["question": q.question, "previous": q.text]
            ask = nil
        }
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/glimt/agent", json: body, timeout: 45)
            show(JS.obj(d), text, store)
            return true
        } catch let e as APIError where e.status == 404 {
            available = false
            a.homeBusy = false
            return false
        } catch {
            var ans: Assist31Answer = Assist31Answer()
            ans.text = "Glimt fikk ikke svart: " + error.localizedDescription
            ans.failed34 = true
            a.showLocal36(text, ans)
            return true
        }
    }

    private func show(_ o: [String: Any], _ text: String, _ store: Store) {
        var ans: Assist31Answer = Assist31Answer()
        ans.text = answerText(o)
        ans.intent = JS.str(o, "intent") ?? ""
        ans.source = "glimt"
        Assist31.shared.showLocal36(text, ans)
        if let q = JS.dict(o, "ask"), let question = JS.str(q, "question") {
            ask = GlimtAgent45Ask(question: question, options: JS.strings(q, "options"), text: text)
        }
        if let c = JS.dict(o, "confirm"), let token = JS.str(c, "token") {
            confirm = GlimtAgent45Confirm(token: token, summary: JS.str(c, "summary") ?? ans.text)
        }
        refresh(JS.list(o, "actions"), store)
    }

    /// Svaret + treffene (results) som en kort liste. Aldri oppdiktede data: bare det serveren sendte.
    private func answerText(_ o: [String: Any]) -> String {
        var t: String = JS.str(o, "reply") ?? ""
        let res: [[String: Any]] = JS.list(o, "results")
        if !res.isEmpty {
            let lines: [String] = res.prefix(6).map { (r: [String: Any]) -> String in
                let title: String = JS.str(r, "title") ?? JS.str(r, "name") ?? JS.str(r, "merchant") ?? ""
                let sub: String = JS.str(r, "sub") ?? JS.str(r, "subtitle") ?? JS.str(r, "when") ?? JS.str(r, "date") ?? ""
                return "• " + title + (sub.isEmpty ? "" : " · " + sub)
            }
            t += (t.isEmpty ? "" : "\n") + lines.joined(separator: "\n")
        }
        return t.isEmpty ? "Glimt fant ikke noe å svare." : t
    }

    /// Data som ble endret, lastes på nytt (kalender, gjøremål, finans) – først etter at serveren har bekreftet.
    private func refresh(_ actions: [[String: Any]], _ store: Store) {
        let done: [[String: Any]] = actions.filter { (JS.str($0, "status") ?? "") == "done" }
        if done.isEmpty { return }
        let tools: [String] = done.compactMap { JS.str($0, "tool") }
        Task {
            if tools.contains(where: { $0.hasPrefix("calendar") }) { await Cal26Model.shared.load(store, force: true) }
            if tools.contains(where: { $0.hasPrefix("tasks") || $0.hasPrefix("huske") }) { await TasksModel.shared.load(store) }
            if tools.contains(where: { $0.hasPrefix("finance") || $0.hasPrefix("receipt") }) { await store.loadPaperFinance() }
        }
    }

    /// Svar på oppfølgingsspørsmålet: samme forespørsel med valget som kontekst.
    func answer(_ option: String, _ store: Store) {
        guard let q = ask else { return }
        ask = nil
        Haptics.shared.select()
        let t: String = q.text + " – " + option
        Task { _ = await home(t, store, context: ["answer": option, "question": q.question]) }
    }

    func doConfirm(_ store: Store) {
        guard let c = confirm else { return }
        confirm = nil
        Haptics.shared.tap()
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/glimt/agent/confirm", json: ["token": c.token], timeout: 30)
                show(JS.obj(d), Assist31.shared.homeQ, store)
            } catch {
                var ans: Assist31Answer = Assist31Answer()
                ans.text = "Ble ikke utført: " + error.localizedDescription
                ans.failed34 = true
                Assist31.shared.showLocal36(Assist31.shared.homeQ, ans)
            }
        }
    }

    func cancelConfirm() {
        confirm = nil
        var ans: Assist31Answer = Assist31Answer()
        ans.text = "Avbrutt · ingenting ble endret."
        Assist31.shared.showLocal36(Assist31.shared.homeQ, ans)
    }
}

/// Bekreftelse og oppfølgingsspørsmål fra agenten (på søkefeltet på Hjem).
struct GlimtAgent45Host: ViewModifier {
    @Environment(Store.self) private var store
    @MainActor private var g: GlimtAgent45 { GlimtAgent45.shared }

    func body(content: Content) -> some View {
        content
            .alert(g.confirm?.summary ?? "Bekreft", isPresented: confirmBinding) {
                Button("Avbryt", role: .cancel) { g.cancelConfirm() }
                Button("Bekreft") { g.doConfirm(store) }
            } message: {
                Text("Glimt gjør dette først når du bekrefter.")
            }
            .confirmationDialog(g.ask?.question ?? "", isPresented: askBinding, titleVisibility: .visible) {
                ForEach(g.ask?.options ?? [], id: \.self) { (o: String) in
                    Button(o) { g.answer(o, store) }
                }
                Button("Avbryt", role: .cancel) { g.ask = nil }
            }
    }

    private var confirmBinding: Binding<Bool> {
        Binding<Bool>(get: { GlimtAgent45.shared.confirm != nil }, set: { (v: Bool) in if !v { GlimtAgent45.shared.confirm = nil } })
    }

    /// Bare når det finnes valg; uten valg står spørsmålet i svarboblen og svaret skrives i feltet.
    private var askBinding: Binding<Bool> {
        Binding<Bool>(get: { !(GlimtAgent45.shared.ask?.options.isEmpty ?? true) }, set: { (v: Bool) in if !v { GlimtAgent45.shared.ask = nil } })
    }
}

extension View {
    func glimtAgent45Host() -> some View { modifier(GlimtAgent45Host()) }
}
