import SwiftUI

/* ---------------- Prompt 23: Innstillinger → App → Integrasjoner (Mobil Papir App.dc.html, SUBP.integ) ---------------- */

/// HOME ASSISTANT (tilkobling) og SYNK MED HOME ASSISTANT. Bruker samme lagring og API som Huskeliste (/api/tasks/ha*),
/// så endringer vises begge steder. Kortet i Huskeliste beholdes.
struct PaperIntegrations23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var st: TaskHAState22? = nil
    @State private var failed: String? = nil
    @State private var testing: Bool = false
    @MainActor private var tasks: TasksModel { TasksModel.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Home Assistant").padding(.leading, 4).padding(.top, 6)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    connRow
                    Rectangle().fill(p.line).frame(height: 1)
                    testRow
                }
            }
            Text("Adresse og long-lived token legges inn i nettleseren under Innstillinger → Integrasjoner → Home Assistant. Tokenet lagres kryptert på serveren.")
                .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 6).fixedSize(horizontal: false, vertical: true)
            // Samme seksjon som nederst i Huskeliste (Tasks22.swift): bryter, én rad per liste og «↻ Synk nå».
            TaskHASection22().padding(.top, 8)
            if st == nil, let failed {
                Text(failed).font(PF.ui(12.5)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 6).fixedSize(horizontal: false, vertical: true)
            }
        }
        .task {
            await tasks.load(store)
            await load()
        }
    }

    private var connValue: (String, Color) {
        guard let s = st else { return (failed == nil ? "…" : "Ikke tilgjengelig", p.mut) }
        let err: String = s.error.lowercased()
        if err.contains("ikke satt opp") { return ("Ikke satt opp", p.lab) }
        if s.status == "error" || !s.error.isEmpty { return ("Feil", p.lab) }
        if !s.entities.isEmpty || s.status == "ok" { return ("Tilkoblet", p.pos) }
        return (s.enabled ? "Kobler til …" : "Klar", p.mut)
    }

    private var connRow: some View {
        let v: (String, Color) = connValue
        let sub: String = st.map { s in s.entities.isEmpty ? "Home Assistant To-do (todo.*)" : "\(s.entities.count) To-do-lister i Home Assistant" } ?? "Home Assistant To-do (todo.*)"
        return HStack(spacing: 12) {
            Image(systemName: "house").font(.system(size: 15, weight: .semibold)).foregroundStyle(PaperIconTheme.color(store.iconTheme, 0))
                .frame(width: 34, height: 34).background(p.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text("Tilkobling").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
            }
            Spacer(minLength: 6)
            Text(v.0).font(PF.ui(13, .semibold)).foregroundStyle(v.1)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    private var testRow: some View {
        Button { test() } label: {
            HStack {
                Text("Test tilkobling").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer()
                Text(testing ? "Tester …" : "Test ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
            }
            .padding(.horizontal, 14).padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(testing)
    }

    private func load() async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/tasks/ha", timeout: 15)
            st = TaskHAState22(JS.obj(d))
            failed = nil
        } catch let e as APIError {
            st = nil
            failed = e.status == 403 ? "Home Assistant settes opp av administrator." : e.status == 404 ? "Serveren har ikke synk med Home Assistant ennå. Oppdater homelab." : e.message
        } catch {
            st = nil
            failed = "Fikk ikke kontakt med serveren."
        }
    }

    /// Henter To-do-listene på nytt (?force=1) og viser resultatet.
    private func test() {
        testing = true
        Haptics.shared.tap()
        Task {
            await load()
            testing = false
            let v: (String, Color) = connValue
            if let s = st, !s.error.isEmpty { store.flash(s.error) } else { store.flash("Home Assistant: " + v.0.lowercased()) }
        }
    }
}
