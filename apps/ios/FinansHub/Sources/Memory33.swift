import SwiftUI
import UIKit

/* ---------------- Prompt 33: «Glimt husker» ---------------- */
// Det brukeren har lært Glimt: avsender/bedrift → type/tittel («påhåret» → Frisør · Påhåret Studio Hoff). Per bruker på serveren.
// API: GET/POST /api/glimt/memory {match, type, title?} → {item, matches}, DELETE /api/glimt/memory/:id,
//      POST /api/glimt/memory/:id/apply {dryRun?} → {count}. Hendelsen som vises: GET /api/kalender/events/:id (kontekst for
//      «det var frisør» i Glimt). PATCH /api/kalender/events/:id kan svare suggestMemory {match, name, type, title, text}.
// Visninger: Memory33SettingsGroup (Innstillinger → AI → GLIMT HUSKER), Memory33LearnLink (detaljarket) og Memory33LearnSheet.

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

/// Tilstanden i «Lær Glimt hva dette er…»-arket.
struct Memory33Learn: Identifiable {
    let id: UUID = UUID()
    var name: String
    var type: String = ""
    var title: String = ""
    var text: String = ""
    var suggest: Bool = false
    var asked: Bool = false
    var count: Int = 0
    var memId: Int? = nil
    var error: String = ""
    var busy: Bool = false
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
    var learn: Memory33Learn? = nil
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

    /// Hendelsen som vises blir konteksten for «det var frisør» i Glimt. Svaret trengs ikke.
    func shown(_ e: CalEvent26, _ store: Store) {
        guard e.editable else { return }
        Task { _ = try? await store.api.callAt("/api", "GET", "/kalender/events/" + Cal27Model.enc(e.id), timeout: 8) }
    }

    /// Åpner arket for en hendelse (etter at detaljarket er lukket).
    func open(_ e: CalEvent26) {
        let n: String = Memory33Model.nameOf(title: e.title, note: e.note)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            self.learn = Memory33Learn(name: n)
        }
    }

    /// Forslaget fra PATCH (brukeren ga en rask time ny tittel). Lagres bare med «Husk».
    func suggest(_ o: [String: Any]?) {
        guard let o, let name = JS.str(o, "name") else { return }
        let t: String = JS.str(o, "type") ?? ""
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            self.learn = Memory33Learn(name: name, type: t == "annet" ? "" : t, title: JS.str(o, "title") ?? "", text: JS.str(o, "text") ?? "", suggest: true)
        }
    }

    func saveLearn(_ store: Store) {
        guard var l = learn else { return }
        let name: String = l.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if l.type.isEmpty { l.error = "Velg hva det er."; learn = l; return }
        if name.count < 2 { l.error = "Skriv navnet på avsenderen."; learn = l; return }
        let custom: String = l.title.trimmingCharacters(in: .whitespaces)
        let title: String = l.type == "annet" ? (custom.isEmpty ? name : custom) : (l.suggest && !custom.isEmpty ? custom : Memory33Model.typeName(l.type) + " · " + name)
        l.busy = true; l.error = ""; learn = l
        Task {
            do {
                let (it, n) = try await add(store, match: name, type: l.type, title: title)
                guard var c = self.learn else { return }
                c.busy = false; c.asked = true; c.memId = it?.id; c.count = n; c.title = it?.title.isEmpty == false ? it!.title : title; c.name = name
                self.learn = c
                Haptics.shared.success()
            } catch let e as APIError {
                if var c = self.learn { c.busy = false; c.error = e.message; self.learn = c }
            } catch {
                if var c = self.learn { c.busy = false; c.error = error.localizedDescription; self.learn = c }
            }
        }
    }

    func applyLearn(_ store: Store) {
        guard var l = learn, let id = l.memId else { return }
        l.busy = true; learn = l
        Task {
            do {
                let n: Int = try await apply(store, id)
                self.learn = nil
                Cal27Model.shared.flash(n == 0 ? "Ingen avtaler å endre" : "\(n) \(n == 1 ? "avtale" : "avtaler") fikk nytt navn")
                await Cal26Model.shared.load(store, force: true)
            } catch {
                if var c = self.learn { c.busy = false; c.error = "Kunne ikke endre avtalene."; self.learn = c }
            }
        }
    }

    /// Avsenderen i notatet («Mvh PÅHÅRET Studio Hoff» → «Påhåret Studio Hoff»), ellers tittelen uten «Frisør · ».
    nonisolated static func nameOf(title: String, note: String) -> String {
        let keys: [String] = ["med vennlig hilsen", "vennlig hilsen", "hilsen", "mvh"]
        let low: String = note.lowercased()
        for k in keys {
            if let r = low.range(of: k, options: .backwards) {
                let off: Int = low.distance(from: low.startIndex, to: r.upperBound)
                var rest: String = String(note.dropFirst(off)).trimmingCharacters(in: CharacterSet(charactersIn: " ,.:\n"))
                if let cut = rest.firstIndex(where: { $0 == "\n" || $0 == "." || $0 == "!" || $0 == "," }) { rest = String(rest[..<cut]) }
                rest = rest.trimmingCharacters(in: .whitespaces)
                if rest.count >= 2, rest.count <= 50, rest.first?.isUppercase == true || rest.first?.isNumber == true { return nice(rest) }
            }
        }
        var t: String = title
        if let dot = t.range(of: " · ") { t = String(t[dot.upperBound...]) }
        return nice(t.trimmingCharacters(in: .whitespaces))
    }

    /// «PÅHÅRET Studio Hoff» → «Påhåret Studio Hoff».
    nonisolated static func nice(_ s: String) -> String {
        let keep: Set<String> = ["AS", "ASA", "DA", "ANS"]
        let words: [String] = s.split(separator: " ").map { w -> String in
            let x: String = String(w)
            let letters: String = x.filter { $0.isLetter }
            if letters.count < 2 || letters != letters.uppercased() || keep.contains(x) { return x }
            return String(x.prefix(1)) + x.dropFirst().lowercased()
        }
        return words.joined(separator: " ")
    }
}

/* ---------- Detaljarket: «Lær Glimt hva dette er…» ---------- */

struct Memory33LearnLink: View {
    @Environment(\.paper) private var p
    let e: CalEvent26

    var body: some View {
        Button {
            Cal27Model.shared.sel = nil
            Memory33Model.shared.open(e)
        } label: {
            Text("Lær Glimt hva dette er…").font(PF.ui(13, .semibold)).foregroundStyle(p.mut).underline()
        }
        .buttonStyle(.plain)
        .accessibilityHint("Velg om dette er frisør, lege, tannlege eller noe annet")
    }
}

/* ---------- Arket ---------- */

struct Memory33LearnSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Memory33Model { Memory33Model.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("✦ GLIMT HUSKER").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                        Text("Lær Glimt hva dette er").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                    }
                    Spacer(minLength: 4)
                    Cal27CloseButton { m.learn = nil }
                }
                if let l = m.learn {
                    if l.asked { Memory33Ask(l: l) } else { Memory33Pick(l: l) }
                }
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 22)
        }
        .scrollIndicators(.hidden)
        .background(p.bg)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .presentationDetents([.medium, .large])
    }
}

private struct Memory33Pick: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Memory33Model { Memory33Model.shared }
    let l: Memory33Learn

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !l.text.isEmpty { Text(l.text).font(PF.ui(15)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
            Text("HVA ER DETTE?").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
            Flow(spacing: 6) {
                ForEach(Memory33Model.types, id: \.0) { t in
                    Cal27Choice(name: t.1, on: l.type == t.0) { m.learn?.type = t.0; m.learn?.error = "" }
                }
            }
            field("Navn på avsender, f.eks. Påhåret", Binding<String>(get: { m.learn?.name ?? "" }, set: { m.learn?.name = $0 }))
            if l.type == "annet" { field("Tittel, f.eks. Massasje · Spa Nova", Binding<String>(get: { m.learn?.title ?? "" }, set: { m.learn?.title = $0 })) }
            if !l.error.isEmpty { Text(l.error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab) }
            Button { m.saveLearn(store) } label: {
                Text(l.busy ? "Lagrer …" : (l.suggest ? "Husk" : "Lagre")).font(PF.ui(15, .bold)).foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity).frame(height: 50).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(l.type.isEmpty || l.busy)
            .opacity(l.type.isEmpty ? 0.45 : 1)
            Text("Glimt bruker dette neste gang en melding fra samme avsender legges inn. Se Innstillinger → AI → Glimt husker.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func field(_ ph: String, _ b: Binding<String>) -> some View {
        TextField(ph, text: b)
            .font(PF.ui(15)).foregroundStyle(p.ink)
            .textInputAutocapitalization(.words).autocorrectionDisabled()
            .padding(.horizontal, 16).frame(height: 48)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct Memory33Ask: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Memory33Model { Memory33Model.shared }
    let l: Memory33Learn

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            (Text("Ok, Glimt husker at ") + Text(l.name).bold() + Text(" er \(Memory33Model.din(l.type))."))
                .font(PF.ui(15)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            if l.count > 0 {
                Text("Endre tittel på \(l.count) \(l.count == 1 ? "avtale" : "avtaler") til «\(l.title)»?")
                    .font(PF.ui(15)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    pill(l.busy ? "Endrer …" : "Endre", fill: true) { m.applyLearn(store) }
                    pill("Nei takk", fill: false) { m.learn = nil }
                }
            } else {
                pill("Ferdig", fill: true) { m.learn = nil }
            }
            if !l.error.isEmpty { Text(l.error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab) }
        }
    }

    private func pill(_ t: String, fill: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(14, .bold)).foregroundStyle(fill ? p.bg : p.ink).frame(maxWidth: .infinity).frame(height: 46)
                .background(fill ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(fill ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
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
                                Text("+").font(PF.ui(18)).foregroundStyle(p.mut)
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
                ForEach(Memory33Model.types, id: \.0) { t in Cal27Choice(name: t.1, on: type == t.0) { type = t.0 } }
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
