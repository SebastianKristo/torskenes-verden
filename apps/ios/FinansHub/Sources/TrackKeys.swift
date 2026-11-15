import SwiftUI

/* ---------------- Prompt 37: Sporing – API-nøklene deles i husstanden, pakkene er private ---------------- */
// prompts/prompt-37-pakke/claude-code-sporing-delte-nokler.md. SERVER37: GET /api/tracking/keys →
// {providers:[{id, name, set, tail, status, addedBy, updatedAt}], quota:{used, mine, limit, perUserPct}, admin};
// PUT /api/tracking/keys/:id {key} (bare admin). Nøkkelen vises aldri i klartekst – bare «••••a91f».
// Integrasjoner → «SPORING · DELT I HUSSTANDEN» og en diskret linje under Sporing-siden.

struct TrackKey37: Identifiable, Hashable {
    var id: String
    var name: String
    var set: Bool
    var tail: String
    var status: String
    var addedBy: String

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? id
        set = JS.bool(o, "set") ?? false
        tail = JS.str(o, "tail") ?? ""
        status = JS.str(o, "status") ?? ""
        addedBy = JS.str(o, "addedBy") ?? ""
    }

    var masked: String { self.set ? "••••" + tail : "Ikke satt opp" }

    /// Grønn (ok), oransje (kvote) eller rød (feil).
    var dot: Color {
        switch status.lowercased() {
        case "ok", "": return set ? DS.color(.success, stil: .papir) : DS.color(.textTertiary, stil: .papir)
        case "quota", "kvote": return DS.color(.warning, stil: .papir)
        default: return DS.color(.danger, stil: .papir)
        }
    }
}

@MainActor
@Observable
final class TrackKeys37Model {
    static let shared = TrackKeys37Model()

    var providers: [TrackKey37] = []
    var used: Int = 0
    var mine: Int = 0
    var limit: Int = 0
    var admin: Bool = false
    var loaded: Bool = false
    var missing: Bool = false

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/tracking/keys", timeout: 12)
            let o: [String: Any] = JS.obj(d)
            providers = JS.list(o, "providers").map { TrackKey37($0) }
            let q: [String: Any] = JS.dict(o, "quota") ?? [:]
            used = JS.int(q, "used") ?? 0
            mine = JS.int(q, "mine") ?? 0
            limit = JS.int(q, "limit") ?? 0
            admin = JS.bool(o, "admin") ?? (store.account?.role == "admin")
            missing = false
        } catch {
            missing = true
        }
        loaded = true
    }

    /// «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen».
    var line: String {
        guard let pa = providers.first(where: { $0.set && $0.id.lowercased().contains("parcel") }) ?? providers.first(where: { $0.set }) else { return "" }
        var s: String = "Bruker husstandens " + pa.name + "-nøkkel"
        if limit > 0 { s += " · \(Swift.max(0, limit - used)) oppslag igjen" }
        return s
    }

    func save(_ id: String, _ key: String, _ store: Store) {
        let body: [String: Any] = ["key": key]
        let e: String = Cal27Model.enc(id)
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "PUT", "/tracking/keys/" + e, json: body, timeout: 15)
                Haptics.shared.success()
                store.flash("Nøkkelen er lagret for hele husstanden")
            } catch let err as APIError {
                store.flash(err.status == 403 ? "Bare admin kan endre nøklene" : "Kunne ikke lagre: " + err.message)
            } catch {
                store.flash("Kunne ikke lagre: " + error.localizedDescription)
            }
            await load(store)
        }
    }
}

/// Integrasjoner → «SPORING · DELT I HUSSTANDEN».
struct TrackKeys37Card: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: TrackKeys37Model { TrackKeys37Model.shared }
    @State private var editing: TrackKey37? = nil
    @State private var key: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !m.providers.isEmpty {
                PLabel(text: "Sporing · delt i husstanden").padding(.leading, 4).padding(.top, 12)
                VStack(spacing: 0) {
                    ForEach(Array(m.providers.enumerated()), id: \.element.id) { i, k in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        row(k)
                    }
                }
                .padding(.horizontal, 14)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                Text(quota).font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 4).fixedSize(horizontal: false, vertical: true)
            }
        }
        .task { await m.load(store) }
        .alert("Ny nøkkel for " + (editing?.name ?? ""), isPresented: Binding<Bool>(get: { editing != nil }, set: { if !$0 { editing = nil } })) {
            SecureField("API-nøkkel", text: $key)
            Button("Lagre") {
                if let k = editing, !key.isEmpty { m.save(k.id, key, store) }
                key = ""
                editing = nil
            }
            Button("Fjern", role: .destructive) {
                if let k = editing { m.save(k.id, "", store) }
                key = ""
                editing = nil
            }
            Button("Avbryt", role: .cancel) { key = ""; editing = nil }
        } message: {
            Text("Nøkkelen deles med alle i husstanden og vises aldri i klartekst. Pakkene er private.")
        }
    }

    private var quota: String {
        var s: String = "Alle i husstanden kan spore uten egne nøkler. Pakker og sporingsnumre er private."
        if m.limit > 0 { s += " Du har brukt \(m.mine) av husstandens \(m.limit) oppslag denne måneden." }
        return s
    }

    private func row(_ k: TrackKey37) -> some View {
        HStack(spacing: 12) {
            Circle().fill(k.dot).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(k.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(k.set ? ("Delt i husstanden" + (k.addedBy.isEmpty ? "" : " · lagt inn av " + k.addedBy)) : "Ikke satt opp")
                    .font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(k.masked).font(PF.mono(12, bold: false)).foregroundStyle(p.mut)
            if m.admin {
                Button {
                    Haptics.shared.tap()
                    key = ""
                    editing = k
                } label: {
                    Text("Endre").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 10).frame(height: 30)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(minHeight: 56)
        .overlay(alignment: .bottomTrailing) {
            if !m.admin { Text("Administreres av admin").font(PF.ui(10.5)).foregroundStyle(p.mut).padding(.bottom, 4) }
        }
    }
}

/// Den diskrete linjen under Sporing-listen.
struct TrackKeys37Line: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: TrackKeys37Model { TrackKeys37Model.shared }

    var body: some View {
        Group {
            if !m.line.isEmpty {
                Text(m.line).font(PF.ui(12)).foregroundStyle(p.mut).frame(maxWidth: .infinity).multilineTextAlignment(.center)
            }
        }
        .task { if !m.loaded { await m.load(store) } }
    }
}

// MARK: -

/* ---------------- Prompt 41: PostNord uten konto og uten API-nøkkel ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-postnord-uten-nokkel.md. Fasit: Mobil Papir App.dc.html → Integrasjoner → PostNord.
// Serveren sporer via PostNords offentlige Track & Trace-endepunkt (som ha-postnord; udokumentert og kan endres), nøkkelen er valgfri.
// Kortet viser «Sporing uten konto og uten nøkkel» og teststatus fra GET /api/tracking/postnord/health («OK · offentlig endepunkt»).

struct Track41PostNordCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var status: String = ""
    @State private var ok: Bool? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "shippingbox").font(.dyn51(size: 14, weight: .semibold)).foregroundStyle(p.ink)
                Text("Sporing uten konto og uten nøkkel").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
            }
            Text("Lim inn sporingsnummeret i Sporing. Nummer som 00370…, …SE/DK/FI eller 2 bokstaver + 9 sifre + SE/DK/FI går automatisk til PostNord. Nøkkelen under er valgfri.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Circle().fill(ok == true ? p.pos : (ok == false ? p.lab : p.mut)).frame(width: 7, height: 7)
                Text(status.isEmpty ? "Sjekker PostNord …" : status).font(PF.mono(11.5)).foregroundStyle(p.ink)
            }
            .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .task { await load() }
    }

    private func load() async {
        guard let d = try? await store.api.callAt("/api", "GET", "/tracking/postnord/health", timeout: 15) else {
            ok = nil
            status = "Teststatus ikke tilgjengelig"
            return
        }
        let o: [String: Any] = JS.obj(d)
        let good: Bool = JS.bool(o, "ok") ?? ((JS.str(o, "status") ?? "").lowercased() == "ok")
        ok = good
        let mode: String = JS.str(o, "mode") ?? JS.str(o, "source") ?? ""
        let txt: String = JS.str(o, "text") ?? JS.str(o, "message") ?? JS.str(o, "label") ?? ""
        if !txt.isEmpty {
            status = txt
        } else if good {
            status = "OK · " + (mode == "key" || mode == "official" ? "eget API (nøkkel)" : "offentlig endepunkt")
        } else {
            status = "PostNord svarer ikke akkurat nå"
        }
    }
}
