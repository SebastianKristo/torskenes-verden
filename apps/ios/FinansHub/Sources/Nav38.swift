import SwiftUI
import UIKit

/* ---------------- Prompt 38: tilbake fra Subscription OS, og Domener på mobil (ingen Skann, alt lastet, Glimt-knapp) ----------------
   claude-code-abo-provetid.md (FEIL 2026-10-20): ‹ Tilbake i Abonnement går dit man kom fra (aboFrom), ikke alltid til Finans → Mer.
   claude-code-domener-hurtig.md (Mobil 2026-10-20): den runde knappen nede til høyre i Domener er Glimt (✦), ikke Skann/Legg til.
   Trykk: Oversikt + Glimt-oppsummeringen for valgt domene (GET /api/domains/:domain/summary, lages hvis dagens mangler) og
   scroll til toppen. Domene-dataene hentes på forhånd ved oppstart og når appen blir aktiv (høyst hvert 5. min). */

extension Store {
    static let abo38Key: String = "fh_abo_from38"

    /// Kalles fra paperGo før fanen byttes: husk siden Abonnement ble åpnet fra.
    func abo38Note(_ t: String) {
        guard t == "abo", paperTab != "abo" else { return }
        let from: String = paperTab == "ftx" ? "fliste" : paperTab
        UserDefaults.standard.set(from, forKey: Store.abo38Key)
    }

    /// Siden Abonnement ble åpnet fra (mer, hjem, finans, fmer, innst …), eller nil (gammel oppførsel).
    var abo38From: String? {
        guard let f = UserDefaults.standard.string(forKey: Store.abo38Key), !f.isEmpty, f != "abo" else { return nil }
        // Var Abonnement en fane i Finans-linja og man kom fra Finans, gjelder den vanlige Finans-logikken.
        if finNav.contains("abonnementer") && Store.paperFinTabs.contains(f) { return nil }
        return f
    }

    /// «‹ Mer», «‹ Hjem», «‹ Oversikt» …
    var abo38Label: String? {
        guard let f = abo38From else { return nil }
        switch f {
        case "mer", "fmer": return "Mer"
        case "hjem": return "Hjem"
        case "finans": return "Oversikt"
        case "fliste": return "Liste"
        case "innst": return "Innstillinger"
        case "kalender": return "Kalender"
        case "huske": return "Gjøremål"
        default: return f.hasPrefix("innst-") ? "Innstillinger" : "Tilbake"
        }
    }

    /* ---------- Domener ---------- */

    /// Forhåndshenting av Domener (liste + tall for valgt domene + kartet), høyst hvert 5. minutt.
    func dom38Preload() async {
        guard loggedIn else { return }
        let key: String = "fh_dom38_at"
        let last: Double = UserDefaults.standard.double(forKey: key)
        let now: Double = Date().timeIntervalSince1970
        if analytics != nil && now - last < 300 { return }
        UserDefaults.standard.set(now, forKey: key)
        try? await loadDomains()
        _ = await worldMap()
        if let d = domain { await Dom38Glimt.shared.load(d, self, make: false) }
    }
}

/* ---------- Glimt-oppsummeringen i Domener ---------- */

struct Dom38Point: Identifiable, Hashable {
    let id: Int
    let text: String
    let color: String
}

@MainActor
@Observable
final class Dom38Glimt {
    static let shared = Dom38Glimt()

    var open: Bool = false
    var loading: Bool = false
    var domain: String = ""
    var head: String = ""
    var meta: String = ""
    var points: [Dom38Point] = []
    var error: String = ""
    /// Øker når siden skal scrolle til toppen.
    var topTick: Int = 0

    /// Glimt-knappen: Oversikt, åpne oppsummeringen (lag den hvis dagens mangler) og scroll til toppen.
    func tap(_ store: Store) {
        Haptic34.light()
        if store.paperTab != "domener" { store.paperGo("domener") }
        open = true
        topTick += 1
        let d: String = store.domAllMode ? "*" : (store.domain ?? "*")
        Task { await self.load(d, store, make: true) }
    }

    func load(_ d: String, _ store: Store, make: Bool) async {
        if d == domain && !head.isEmpty && !make { return }
        if d != domain { head = ""; points = []; meta = "" }
        domain = d
        loading = true
        error = ""
        defer { loading = false }
        let enc: String = d.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? d
        do {
            let q: String = make ? "?wait=1" : ""
            let data: Data = try await store.api.callAt("/api", "GET", "/domains/" + enc + "/summary" + q, timeout: make ? 45 : 10)
            apply(JS.obj(data))
        } catch let e as APIError {
            if e.status == 403 { error = "Glimt-oppsummeringen er bare for administrator." }
            else if e.status == 404 { error = "Serveren har ikke Glimt-oppsummering for Domener ennå." }
            else if make { error = e.message }
        } catch {
            if make { self.error = error.localizedDescription }
        }
    }

    func remake(_ store: Store) {
        Haptic34.light()
        let d: String = domain.isEmpty ? (store.domain ?? "*") : domain
        let enc: String = d.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? d
        loading = true
        Task { @MainActor in
            defer { self.loading = false }
            if let data = try? await store.api.callAt("/api", "POST", "/domains/" + enc + "/summary", json: [:], timeout: 60) {
                self.apply(JS.obj(data))
            }
        }
    }

    private func apply(_ raw: [String: Any]) {
        let o: [String: Any] = JS.dict(raw, "summary") ?? raw
        head = JS.str(o, "head") ?? head
        meta = JS.str(o, "meta") ?? meta
        var out: [Dom38Point] = []
        for (i, p) in JS.list(o, "pts").enumerated() {
            let t: String = JS.str(p, "t") ?? JS.str(p, "text") ?? ""
            if t.isEmpty { continue }
            out.append(Dom38Point(id: i, text: t, color: JS.str(p, "color") ?? "#2b5d8a"))
        }
        if !out.isEmpty || JS.str(o, "head") != nil { points = out }
    }
}

/// Kortet øverst i Domener → Oversikt når Glimt-knappen er trykket.
struct Dom38GlimtCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var g: Dom38Glimt { Dom38Glimt.shared }

    var body: some View {
        if g.open && store.paperTab == "domener" {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text("✦ GLIMT · OPPSUMMERING").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                    Spacer(minLength: 6)
                    if g.loading { ProgressView().controlSize(.small) }
                    Button { g.remake(store) } label: {
                        Text("↻ Lag ny").font(PF.ui(12, .bold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 10).frame(height: 28)
                            .background(p.popSel, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(g.loading)
                    Button { withAnimation(.easeOut(duration: 0.2)) { g.open = false } } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut)
                            .frame(width: 28, height: 28)
                            .background(p.popSel, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Lukk oppsummeringen")
                }
                if !g.head.isEmpty {
                    Text(g.head).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                } else if g.loading {
                    Text("Glimt ser på tallene …").font(PF.ui(13.5)).foregroundStyle(p.mut)
                }
                ForEach(g.points) { (pt: Dom38Point) in
                    HStack(alignment: .top, spacing: 8) {
                        Circle().fill(Color(hex: pt.color)).frame(width: 7, height: 7).padding(.top, 6)
                        Text(pt.text).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if !g.meta.isEmpty { Text(g.meta).font(PF.ui(11.5)).foregroundStyle(p.mut) }
                if !g.error.isEmpty { Text(g.error).font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab) }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .transition(.opacity)
        }
    }
}

/// Den runde Glimt-knappen (fylt ✦) som erstatter skann-knappen i Domener.
struct Dom38GlimtFab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { Dom38Glimt.shared.tap(store) } label: {
            Image(systemName: "sparkle")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(p.onLab)
                .frame(width: 60, height: 60)
                .background(p.lab, in: Circle())
                .shadow(color: .black.opacity(0.45), radius: 14, y: 10)
                .contentShape(Circle())
        }
        .buttonStyle(Press37Style())
        .accessibilityLabel("Glimt · oppsummering av domenene")
    }
}
