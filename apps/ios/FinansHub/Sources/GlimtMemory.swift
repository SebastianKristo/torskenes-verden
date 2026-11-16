import SwiftUI
import UIKit

/* ---------------- Prompt 33: «Glimt husker» ---------------- */
// Det brukeren har lært Glimt: avsender/bedrift → type/tittel («påhåret» → Frisør · Påhåret Studio Hoff). Per bruker på serveren.
// API: GET/POST /api/glimt/memory {match, type, title?} → {item, matches}, DELETE /api/glimt/memory/:id,
//      POST /api/glimt/memory/:id/apply {dryRun?} → {count}. Hendelsen som vises: GET /api/kalender/events/:id (kontekst for
//      «det var frisør» i Glimt). PATCH /api/kalender/events/:id kan svare suggestMemory {match, name, type, title, text}.
// Visninger: Memory33SettingsGroup (Innstillinger → Glimt → Glimt husker, prompt 67) og Memory33ApplyButton (Glimt-boblen).
// Q26: «Lær Glimt hva dette er…» i detaljarket ligger nå i den delte Kalenderen (Kalender/Sources/KalLearn.swift).

struct Memory33Item: Identifiable, Hashable {
    var id: Int
    var match: String
    var type: String
    var title: String

    static func from(_ o: [String: Any]) -> Memory33Item? {
        guard let id = JS.int(o, "id"), let m = JS.str(o, "match") else { return nil }
        return Memory33Item(id: id, match: m, type: JS.str(o, "type") ?? "annet", title: JS.str(o, "title") ?? "")
    }
}

@MainActor
@Observable
final class Memory33Model {
    static let shared = Memory33Model()

    nonisolated static let types: [(String, String)] = [("frisør", "Frisør"), ("lege", "Lege"), ("tannlege", "Tannlege"), ("fysio", "Fysio"),
                                                        ("optiker", "Optiker"), ("psykolog", "Psykolog"), ("annet", "Annet")]
    nonisolated static func typeName(_ t: String) -> String { types.first(where: { $0.0 == t })?.1 ?? "Annet" }
    /// «frisøren din» (Ok, Glimt husker at X er frisøren din).
    nonisolated static func din(_ t: String) -> String {
        ["frisør": "frisøren din", "lege": "legen din", "tannlege": "tannlegen din", "fysio": "fysioterapeuten din", "optiker": "optikeren din", "psykolog": "psykologen din"][t] ?? "lagret"
    }
    /// «→ Frisør · Påhåret» i listen (tittelen alene når den allerede sier typen).
    nonisolated static func line(_ it: Memory33Item) -> String {
        let n: String = typeName(it.type)
        if it.title.isEmpty { return "→ " + n }
        return it.title.lowercased().contains(n.lowercased()) || it.type == "annet" ? "→ " + it.title : "→ " + n + " · " + it.title
    }

    var items: [Memory33Item] = []
    var loaded: Bool = false
    var missing: Bool = false
    var error: String = ""
    var msg: String = ""
    /// «Endre tittel på N avtaler?» i innstillingene.
    var ask: (id: Int, count: Int, title: String)? = nil

    func load(_ store: Store, force: Bool = false) async {
        if loaded && !force { return }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/glimt/memory", timeout: 10)
            items = JS.list(JS.obj(d), "items").compactMap(Memory33Item.from)
            loaded = true; missing = false; error = ""
        } catch let e as APIError {
            loaded = true; missing = e.status == 404; error = e.status == 404 ? "Krever nyere server." : e.message
        } catch let e { loaded = true; self.error = e.localizedDescription }
    }

    /// Lagrer et alias. → (item, antall avtaler som kan få ny tittel)
    func add(_ store: Store, match: String, type: String, title: String?) async throws -> (Memory33Item?, Int) {
        var body: [String: Any] = ["match": match, "type": type]
        if let t = title, !t.isEmpty { body["title"] = t }
        let d: Data = try await store.api.callAt("/api", "POST", "/glimt/memory", json: body, timeout: 15)
        let o: [String: Any] = JS.obj(d)
        let it: Memory33Item? = JS.dict(o, "item").flatMap(Memory33Item.from)
        await load(store, force: true)
        return (it, JS.int(o, "matches") ?? 0)
    }

    func delete(_ store: Store, _ it: Memory33Item) {
        items.removeAll { $0.id == it.id }
        Task {
            do { _ = try await store.api.callAt("/api", "DELETE", "/glimt/memory/\(it.id)", timeout: 10); msg = "Slettet ✓" }
            catch { msg = "Kunne ikke slette"; await load(store, force: true) }
        }
    }

    /// Gir egne avtaler aliasets tittel. → antall
    func apply(_ store: Store, _ id: Int) async throws -> Int {
        let d: Data = try await store.api.callAt("/api", "POST", "/glimt/memory/\(id)/apply", json: [:], timeout: 30)
        return JS.int(JS.obj(d), "count") ?? 0
    }

}

/* ---------- Innstillinger → AI → GLIMT HUSKER ---------- */

struct Memory33SettingsGroup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Memory33Model { Memory33Model.shared }
    @State private var adding: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Glimt husker").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    if !m.loaded {
                        Memory33Line(t: "Laster …", s: "")
                    } else if m.items.isEmpty {
                        Memory33Line(t: m.missing ? "Ikke tilgjengelig" : "Glimt husker ingenting ennå", s: m.missing ? m.error : "Skriv f.eks. «husk at Påhåret er frisøren min» til Glimt.")
                    }
                    ForEach(Array(m.items.enumerated()), id: \.element.id) { i, it in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        Memory33Row(it: it)
                    }
                    if let a = m.ask {
                        Rectangle().fill(p.line).frame(height: 1)
                        Memory33ApplyRow(id: a.id, count: a.count, title: a.title)
                    }
                    Rectangle().fill(p.line).frame(height: 1)
                    if adding { Memory33AddForm(done: { adding = false }) }
                    else {
                        Button { adding = true } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Legg til").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                                    Text("Navn på avsender og hva det er").font(PF.ui(12.5)).foregroundStyle(p.mut)
                                }
                                Spacer()
                                Image(systemName: "plus").accessibilityHidden(true).font(PF.ui(18)).foregroundStyle(p.mut)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 11).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Text("Det du lærer Glimt, f.eks. at «Påhåret» er frisøren din. Brukes når du legger inn timer og spør «når er neste frisørtime». Lagres bare for deg og sendes aldri til sky." + (m.msg.isEmpty ? "" : " " + m.msg))
                .font(PF.ui(12.5)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 4).fixedSize(horizontal: false, vertical: true)
        }
        .task { await m.load(store, force: true) }
    }
}

private struct Memory33Line: View {
    @Environment(\.paper) private var p
    let t: String
    let s: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
            if !s.isEmpty { Text(s).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14).padding(.vertical, 11)
    }
}

private struct Memory33Row: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: Memory33Item
    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(it.match).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(Memory33Model.line(it)).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
            }
            Spacer(minLength: 6)
            Button { Memory33Model.shared.delete(store, it) } label: {
                Text("Slett").font(PF.ui(13, .bold)).foregroundStyle(p.ink).padding(.horizontal, 14).frame(height: 34)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Slett " + it.match)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }
}

private struct Memory33ApplyRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let id: Int
    let count: Int
    let title: String
    @State private var busy: Bool = false
    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Endre tittel på \(count) \(count == 1 ? "avtale" : "avtaler")?").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text("Til «\(title)»").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
            }
            Spacer(minLength: 4)
            Button { Memory33Model.shared.ask = nil } label: { Text("Nei").font(PF.ui(13, .bold)).foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 34).overlay(Capsule().stroke(p.line, lineWidth: 1)) }
                .buttonStyle(.plain)
            Button {
                busy = true
                Task {
                    let n: Int = (try? await Memory33Model.shared.apply(store, id)) ?? 0
                    Memory33Model.shared.ask = nil
                    Memory33Model.shared.msg = "\(n) \(n == 1 ? "avtale" : "avtaler") fikk nytt navn ✓"
                    busy = false
                }
            } label: { Text(busy ? "…" : "Endre").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 12).frame(height: 34).background(p.ink, in: Capsule()) }
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }
}

/// Valgbrikke for typen (Frisør, Lege …). Q26: lå før i den gamle kalenderen (Cal27Choice).
private struct Memory33Choice: View {
    @Environment(\.paper) private var p
    let name: String
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(name).font(PF.ui(13.5, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 14).frame(height: 38)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

private struct Memory33AddForm: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let done: () -> Void
    @State private var match: String = ""
    @State private var type: String = "frisør"
    @State private var title: String = ""
    @State private var busy: Bool = false
    @State private var err: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            input("Navn, f.eks. Påhåret", $match)
            Flow(spacing: 6) {
                ForEach(Memory33Model.types, id: \.0) { t in Memory33Choice(name: t.1, on: type == t.0) { type = t.0 } }
            }
            input("Tittel (valgfri), f.eks. Frisør · Påhåret", $title)
            if !err.isEmpty { Text(err).font(PF.ui(13, .semibold)).foregroundStyle(p.lab) }
            HStack(spacing: 8) {
                Button(action: done) { Text("Avbryt").font(PF.ui(14, .bold)).foregroundStyle(p.ink).frame(maxWidth: .infinity).frame(height: 44).overlay(Capsule().stroke(p.line, lineWidth: 1)) }
                    .buttonStyle(.plain)
                Button { save() } label: { Text(busy ? "Lagrer …" : "Lagre").font(PF.ui(14, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity).frame(height: 44).background(p.ink, in: Capsule()) }
                    .buttonStyle(.plain).disabled(busy)
            }
        }
        .padding(14)
    }

    private func input(_ ph: String, _ b: Binding<String>) -> some View {
        TextField(ph, text: b).font(PF.ui(15)).foregroundStyle(p.ink).autocorrectionDisabled()
            .padding(.horizontal, 14).frame(height: 44)
            .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func save() {
        let n: String = match.trimmingCharacters(in: .whitespacesAndNewlines)
        if n.count < 2 { err = "Skriv navnet på avsenderen."; return }
        busy = true; err = ""
        let t: String = title.trimmingCharacters(in: .whitespaces)
        let ty: String = type
        Task {
            do {
                let (it, c) = try await Memory33Model.shared.add(store, match: n, type: ty, title: t.isEmpty ? nil : t)
                if c > 0, let it { Memory33Model.shared.ask = (it.id, c, it.title.isEmpty ? Memory33Model.typeName(ty) + " · " + n : it.title) }
                Memory33Model.shared.msg = "Lagret ✓"
                busy = false
                done()
            } catch let e as APIError { err = e.message; busy = false } catch { err = error.localizedDescription; busy = false }
        }
    }
}

/* ---------- Glimt-boblen: «Endre tittel på N avtaler?» etter «husk at Påhåret er frisøren min» ---------- */

struct Memory33ApplyButton: View {
    @Environment(Store.self) private var store
    let a: Assist31Answer
    @State private var state: Int = 0 // 0 = klar, 1 = endrer, 2 = ferdig
    @State private var n: Int = 0

    var body: some View {
        Button {
            guard state == 0 else { return }
            state = 1
            Task {
                n = (try? await Memory33Model.shared.apply(store, a.applyId)) ?? 0
                state = 2
                Haptics.shared.success()
            }
        } label: {
            Text(state == 2 ? "✓ \(n) \(n == 1 ? "avtale" : "avtaler") heter nå «\(a.applyTitle)»" : state == 1 ? "Endrer …" : "Endre \(a.applyCount) \(a.applyCount == 1 ? "avtale" : "avtaler") ›")
                .font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(2)
                .padding(.horizontal, 14).frame(minHeight: 32)
                .background(Color.white.opacity(0.14), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
