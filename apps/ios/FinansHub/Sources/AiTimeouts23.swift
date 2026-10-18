import SwiftUI

/* ---------------- Prompt 23: Innstillinger → AI og tolkning → TIDSGRENSER ---------------- */

/// Grense per motor (5–120 s), nye forsøk (0–3) og hva som skjer ved tidsavbrudd. Lagres i FinansHub-innstillingene
/// (PUT /finans/api/settings {aiTimeouts}), og lokalt i papir_ai_to så valget vises også mot en eldre server.
struct AiTimeouts23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var to: [String: Any] = AiTimeouts23.local()

    static let steps: [Int] = [5, 10, 15, 20, 30, 45, 60, 90, 120]
    static let engines: [(String, String, String, Int)] = [("gemini", "Gemini", "Les kvitteringer", 20), ("groq", "Groq", "AI-søk og kategorier", 15),
                                                          ("roboflow", "Roboflow", "Strekkoder", 15), ("ollama", "Ollama (lokal)", "Reserve på hjemmeserveren", 45)]
    static let actions: [(String, String)] = [("next", "Prøv neste motor"), ("ocr", "Bruk lokal OCR"), ("queue", "Legg i kø og prøv senere")]
    private static let key: String = "papir_ai_to"

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Tidsgrenser").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(AiTimeouts23.engines.enumerated()), id: \.element.0) { i, e in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        row(e.1, e.2 + " · trykk for å endre", "\(seconds(e.0, e.3)) s", p.ink) { bump(e.0, e.3) }
                    }
                    Rectangle().fill(p.line).frame(height: 1)
                    row("Nye forsøk", "Før den gir opp en motor", retriesText, p.ink) { nextRetries() }
                    Rectangle().fill(p.line).frame(height: 1)
                    row("Ved tidsavbrudd", "Hva som skjer når grensen er nådd", actionText, p.lab) { nextAction() }
                }
            }
            Text("Nye forsøk venter 1 s, 2 s og 4 s. Køen viser hvilken motor som svarte for sent.").font(PF.ui(12)).foregroundStyle(p.mut)
                .padding(.horizontal, 6).padding(.top, 6).fixedSize(horizontal: false, vertical: true)
        }
        .onAppear { merge(JS.dict(AiSettingsModel.shared.settings, "aiTimeouts")) }
        .task { await load() }
    }

    private func row(_ t: String, _ sub: String, _ value: String, _ vc: Color, _ act: @escaping () -> Void) -> some View {
        Button { Haptics.shared.select(); act() } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text(value).font(PF.ui(13, .semibold)).foregroundStyle(vc).monospacedDigit()
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func seconds(_ k: String, _ def: Int) -> Int { JS.int(to, k) ?? def }

    private var retries: Int { Swift.min(3, Swift.max(0, JS.int(to, "retries") ?? 1)) }

    private var retriesText: String {
        let r: Int = retries
        return r == 0 ? "Ingen" : r == 1 ? "1 gang" : "\(r) ganger"
    }

    private var action: String { JS.str(to, "onTimeout") ?? "next" }

    private var actionText: String { AiTimeouts23.actions.first { $0.0 == action }?.1 ?? AiTimeouts23.actions[0].1 }

    private func bump(_ k: String, _ def: Int) {
        let cur: Int = seconds(k, def)
        let i: Int = AiTimeouts23.steps.firstIndex(of: cur) ?? (AiTimeouts23.steps.lastIndex(where: { $0 < cur }) ?? -1)
        to[k] = AiTimeouts23.steps[(i + 1) % AiTimeouts23.steps.count]
        save()
    }

    private func nextRetries() {
        to["retries"] = (retries + 1) % 4
        save()
    }

    private func nextAction() {
        let ids: [String] = AiTimeouts23.actions.map(\.0)
        let i: Int = ids.firstIndex(of: action) ?? 0
        to["onTimeout"] = ids[(i + 1) % ids.count]
        save()
    }

    /// Fullt objekt med standardverdier, så serveren alltid får alle feltene.
    private var full: [String: Any] {
        var o: [String: Any] = [:]
        for e in AiTimeouts23.engines { o[e.0] = seconds(e.0, e.3) }
        o["retries"] = retries
        o["onTimeout"] = action
        return o
    }

    private func save() {
        let body: [String: Any] = full
        to = body
        if let d = try? JSONSerialization.data(withJSONObject: body) { UserDefaults.standard.set(d, forKey: AiTimeouts23.key) }
        AiSettingsModel.shared.settings["aiTimeouts"] = body
        Task {
            do {
                _ = try await store.api.call("PUT", "/settings", json: ["aiTimeouts": body])
            } catch let e as APIError where e.status == 400 || e.status == 404 {
                store.flash("Serveren kjenner ikke tidsgrenser ennå. Valget er lagret på telefonen.")
            } catch {
                store.flash("Kunne ikke lagre tidsgrensen")
            }
        }
    }

    private func merge(_ o: [String: Any]?) {
        guard let o, !o.isEmpty else { return }
        var n: [String: Any] = to
        for (k, v) in o { n[k] = v }
        to = n
    }

    private func load() async {
        guard let d = try? await store.api.call("GET", "/settings") else { return }
        merge(JS.dict(JS.obj(d), "aiTimeouts"))
    }

    static func local() -> [String: Any] {
        guard let d = UserDefaults.standard.data(forKey: key), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return [:] }
        return o
    }
}
