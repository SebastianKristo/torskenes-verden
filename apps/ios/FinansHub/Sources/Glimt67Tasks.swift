import SwiftUI

/* ---------------- Prompt 67 (IOSSET67): Glimt lærer, Faste oppgaver og Kvalitet ----------------
 Undersider av Innstillinger → Glimt (innst-glimt:laerer · :faste · :kvalitet), som web (recipes61.js, sched62.js, quality64.js).
 – Glimt lærer: statistikk, filter og søk, åpne en oppskrift (plan, variabler, kjøringer, negative eksempler), Test, Slå av/på,
   Rediger mal (og plan som JSON), Slett (to trykk). Brytere for meg / for alle (admin).
 – Faste oppgaver: «Lag fra tekst» (Hva + Når + ev. «Bare hvis» → Forhåndsvis via /parse → Lagre via POST), lista med filter,
   detaljer, Kjør nå, Pause/Fortsett, Endre tidspunkt, Slett. Systemoppgaver (system: true) kan bare pauses. Briefene (klokkeslett, av/på).
 – Kvalitet: ukerapporten (alle) med uke fram/tilbake; nattlige kjøringer, rapport og «Kjør nå»/«Avbryt» bare for admin
   (Update28Model.isAdmin – rollen fra /api/me). */

/* ---------- Glimt lærer ---------- */

struct G67LearnPage: View {
    @Environment(Store.self) private var store
    @MainActor private var m: G67Recipes { G67Recipes.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if m.missing {
                G67Card { G67Line(title: "", sub: "Serveren har ikke «Glimt lærer» ennå. Oppdater serveren.") }
            } else {
                G67LearnStats()
                G67Chips(items: chips, selected: m.filter) { (f: String) in m.filter = f }
                G67LearnSearch()
                G67LearnList()
                G67FlagsView(flags: G67Flags.recipes, title: "Glimt lærer")
            }
        }
        .task { await m.load(store) }
    }

    private var chips: [(String, String)] {
        [("", "Alle \(m.count("total"))"), ("active", "Aktiv \(m.count("active"))"), ("candidate", "Kandidat \(m.count("candidate"))"), ("disabled", "Avslått \(m.count("disabled"))")]
    }
}

struct G67LearnStats: View {
    @Environment(\.paper) private var p
    @MainActor private var m: G67Recipes { G67Recipes.shared }

    var body: some View {
        if let s = m.stats {
            let r: [String: Any]? = JS.dict(s, "recipes")
            let u: [String: Any]? = JS.dict(s, "runs")
            let total: Int = JS.int(u, "total") ?? 0
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
                cell("\(JS.int(r, "active") ?? 0)", "aktive")
                cell("\(JS.int(r, "candidate") ?? 0)", "kandidater")
                cell("\(total)", "kjøringer")
                cell(total > 0 ? G67Fmt.pct(Double(JS.int(u, "success") ?? 0) / Double(total)) : "–", "vellykket")
                cell(G67Fmt.pct(JS.num(s, "fastShare") ?? 0), "hurtigvei")
                cell("\(JS.int(s, "corrections") ?? 0)", "rettelser")
            }
            .padding(.top, 6)
        }
    }

    private func cell(_ n: String, _ t: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(n).font(PF.ui(18, .bold)).foregroundStyle(p.ink)
            Text(t).font(PF.ui(12)).foregroundStyle(p.mut)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(p.line.opacity(0.45), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct G67LearnSearch: View {
    @Environment(\.paper) private var p

    var body: some View {
        TextField("Søk i oppskriftene", text: Binding<String>(get: { G67Recipes.shared.query }, set: { (v: String) in G67Recipes.shared.query = String(v.prefix(80)) }))
            .font(PF.ui(15)).foregroundStyle(p.ink)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .padding(.horizontal, 12).frame(minHeight: 42)
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
            .padding(.vertical, 4)
            .accessibilityLabel("Søk i oppskriftene")
    }
}

struct G67LearnList: View {
    @MainActor private var m: G67Recipes { G67Recipes.shared }

    var body: some View {
        G67Card {
            if !m.loaded { G67Line(title: "", sub: "Laster …") }
            if !m.err.isEmpty { G67Line(title: "", sub: "Serveren svarte: " + m.err, bad: true) }
            if !m.enabled {
                G67Line(title: "Glimt lærer ikke nå", sub: "Slått av under brytere nederst på siden. Lagrede oppskrifter står.")
                G67Sep()
            }
            if !m.msg.isEmpty && m.editing == nil { G67Line(title: "", sub: m.msg); G67Sep() }
            if m.loaded && m.shown.isEmpty && m.err.isEmpty {
                G67Line(title: "", sub: m.items.isEmpty ? "Glimt har ikke lært noe ennå. Når Glimt løser noe riktig (og du ikke retter det), lagres oppskriften her. Tommel opp på et svar gjør den aktiv med en gang." : "Ingen oppskrifter passer.")
            }
            ForEach(Array(m.shown.enumerated()), id: \.offset) { i, it in
                if i > 0 { G67Sep() }
                G67RecipeRow(it: it)
            }
        }
    }
}

struct G67RecipeRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]

    private var id: String { JS.str(it, "id") ?? "" }
    @MainActor private var m: G67Recipes { G67Recipes.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { m.toggle(id, store) } label: { head }
                .buttonStyle(.plain)
                .accessibilityHint(m.open == id ? "Lukk" : "Åpne")
            if m.open == id {
                if m.editing == id { G67RecipeEdit(it: it) } else { G67RecipeDetail(it: it) }
            }
        }
    }

    private var head: some View {
        let st: String = JS.str(it, "status") ?? ""
        let last: String = JS.str(it, "lastUsedAt").map { " · sist " + G67Fmt.when($0) } ?? ""
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(JS.str(it, "queryTemplate") ?? JS.str(it, "exampleQuery") ?? "").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    G67Pill(text: G67Recipes.status[st] ?? st, color: st == "active" ? p.pos : (st == "disabled" ? p.mut : p.lab))
                    Text(G67Recipes.statLine(it) + last).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            Image(systemName: m.open == id ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

struct G67RecipeDetail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]
    @State private var testText: String = ""
    @State private var showRuns: Bool = false

    private var id: String { JS.str(it, "id") ?? "" }
    @MainActor private var m: G67Recipes { G67Recipes.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            G67KV(k: "Eksempel", v: "«" + (JS.str(it, "exampleQuery") ?? "") + "»")
            G67KV(k: "Mal", v: JS.str(it, "queryTemplate") ?? "")
            G67KV(k: "Plan", v: G67Recipes.readable(it).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"))
            if !slots.isEmpty { G67KV(k: "Variabler", v: slots) }
            G67KV(k: "Om", v: about)
            if !G67Recipes.fastLine(it).isEmpty { G67KV(k: "Hurtigvei", v: G67Recipes.fastLine(it)) }
            runs
            testRow
            G67RecipeTest(id: id)
            actions
        }
        .padding(.horizontal, 14).padding(.bottom, 12)
    }

    private var slots: String {
        (JS.dict(it, "slots") ?? [:]).sorted { $0.key < $1.key }.map { (kv: (key: String, value: Any)) -> String in
            let d: [String: Any]? = kv.value as? [String: Any]
            return "{\(kv.key)} ← " + (JS.str(d, "source") ?? "") + (JS.str(d, "value").map { ": " + $0 } ?? "")
        }.joined(separator: "\n")
    }

    private var about: String {
        var parts: [String] = [G67Recipes.source[JS.str(it, "source") ?? ""] ?? (JS.str(it, "source") ?? ""), JS.str(it, "intent") ?? "",
                               JS.bool(it, "writes") == true ? "endrer data" : "bare lesing"]
        if JS.bool(it, "hasEmbedding") == false { parts.append("uten embedding (ordlikhet)") }
        if let r = JS.str(it, "disabledReason") { parts.append(r) }
        if let n = JS.int(it, "negatives"), n > 0 { parts.append("\(n) negative eksempler") }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    @ViewBuilder private var runs: some View {
        let d: [String: Any]? = m.detail[id]
        let list: [[String: Any]] = JS.list(d, "runs")
        let neg: [[String: Any]] = JS.list(d, "negatives")
        if !list.isEmpty || !neg.isEmpty {
            Button { showRuns.toggle() } label: {
                Text((showRuns ? "Skjul" : "Siste kjøringer") + " (\(list.count))" + (neg.isEmpty ? "" : " · negative eksempler (\(neg.count))"))
                    .font(PF.ui(13, .semibold)).foregroundStyle(p.ink).underline().frame(minHeight: 36)
            }
            .buttonStyle(.plain)
            if showRuns {
                ForEach(Array(list.enumerated()), id: \.offset) { _, r in
                    Text(runLine(r)).font(PF.ui(12.5)).foregroundStyle(JS.str(r, "state") == "fail" ? p.lab : p.mut).fixedSize(horizontal: false, vertical: true)
                }
                ForEach(Array(neg.enumerated()), id: \.offset) { _, n in
                    Text(negLine(n))
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func runLine(_ r: [String: Any]) -> String {
        let use: String = G67Recipes.use[JS.str(r, "use") ?? ""] ?? (JS.str(r, "use") ?? "")
        let st: String = G67Recipes.state[JS.str(r, "state") ?? ""] ?? (JS.str(r, "state") ?? "")
        let vote: String = JS.str(r, "vote") == "up" ? " · 👍" : (JS.str(r, "vote") == "down" ? " · 👎" : "")
        let text: String = JS.str(r, "text") ?? ""
        let reason: String = JS.str(r, "reason").map { (x: String) -> String in " (\(x))" } ?? ""
        return "\(G67Fmt.when(r["at"])) «\(text)» · \(use) · \(st)\(reason)\(vote)"
    }

    private func negLine(_ n: [String: Any]) -> String {
        let q: String = JS.str(n, "query") ?? ""
        let wrong: String = JS.str(n, "readableWrong") ?? ""
        let right: String = JS.str(n, "readableRight").map { (x: String) -> String in "\nRiktig: \(x)" } ?? ""
        return "«\(q)»\nFeil: \(wrong)\(right)"
    }

    private var testRow: some View {
        HStack(spacing: 8) {
            TextField(JS.str(it, "exampleQuery") ?? "Tekst å teste med", text: $testText)
                .font(PF.ui(14)).foregroundStyle(p.ink)
                .padding(.horizontal, 10).frame(minHeight: 40)
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
                .accessibilityLabel("Tekst å teste med (tom = eksemplet)")
            G67Btn(title: m.busy == id ? "Tester …" : "Test", disabled: m.busy == id) { Task { await m.test(id, String(testText.prefix(1000)), store) } }
        }
    }

    private var actions: some View {
        let off: Bool = JS.str(it, "status") == "disabled"
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { actionButtons(off) }
            VStack(alignment: .leading, spacing: 0) { actionButtons(off) }
        }
    }

    @ViewBuilder private func actionButtons(_ off: Bool) -> some View {
        G67Btn(title: off ? "Slå på" : "Slå av", disabled: m.busy == id) { Task { await m.setStatus(id, off ? "active" : "disabled", store) } }
        G67Btn(title: "Rediger mal") { m.msg = ""; m.editing = id }
        G67Btn(title: m.arm == id ? "Trykk igjen for å slette" : "Slett", danger: true, disabled: m.busy == id) { Task { await m.delete(id, store) } }
    }
}

struct G67RecipeTest: View {
    @Environment(\.paper) private var p
    let id: String

    var body: some View {
        let m: G67Recipes = G67Recipes.shared
        if let e = m.testErr[id] {
            Text(e).font(PF.ui(12.5)).foregroundStyle(p.lab)
        } else if let r = m.tests[id] {
            VStack(alignment: .leading, spacing: 3) {
                Text((JS.bool(r, "ok") == true ? "Planen virker" : "Planen kunne ikke fylles ut") + (JS.num(r, "ms").map { " · \(Int($0)) ms" } ?? ""))
                    .font(PF.ui(13.5, .semibold)).foregroundStyle(JS.bool(r, "ok") == true ? p.pos : p.lab)
                Text(lines(r)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .background(p.line.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func lines(_ r: [String: Any]) -> String {
        var out: [String] = []
        let slots: String = (JS.dict(r, "slots") ?? [:]).sorted { $0.key < $1.key }.map { "{\($0.key)} = \($0.value)" }.joined(separator: " · ")
        let text: String = JS.str(r, "text") ?? ""
        let sim: String = G67Fmt.sim(JS.num(r, "similarity"))
        out.append("«\(text)» · likhet \(sim)" + (slots.isEmpty ? "" : " · \(slots)"))
        let missing: [String] = JS.strings(r, "missing")
        if !missing.isEmpty { out.append("Mangler: " + missing.map { "{\($0)}" }.joined(separator: ", ")) }
        if let rd = JS.str(r, "readable") { out.append(rd) }
        for s in JS.list(r, "steps") {
            out.append((JS.bool(s, "ok") == false ? "✕ " : "• ") + (JS.str(s, "tool") ?? "") + " " + (JS.str(s, "summary") ?? JS.str(s, "error") ?? JS.str(s, "status") ?? ""))
        }
        let f: String = G67Recipes.fastLine(r)
        if !f.isEmpty { out.append(f) }
        return out.joined(separator: "\n")
    }
}

struct G67RecipeEdit: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]
    @State private var template: String = ""
    @State private var plan: String = ""
    @State private var fastWrite: Bool = false
    @State private var err: String = ""
    @State private var ready: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            G67Field(label: "Mal", placeholder: "når er neste gang jeg skal til {person}", text: $template)
            Text("Plan (JSON)").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            TextEditor(text: $plan)
                .font(.system(size: 12.5, design: .monospaced)).foregroundStyle(p.ink)
                .scrollContentBackground(.hidden)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .frame(minHeight: 120, maxHeight: 220)
                .padding(6)
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
                .accessibilityLabel("Planen som JSON")
            Text("Variabler: " + G67Recipes.vars.map { "{\($0)}" }.joined(separator: " ")).font(PF.ui(12)).foregroundStyle(p.mut)
            if JS.bool(it, "writes") == true {
                Toggle(isOn: $fastWrite) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Hurtigvei også for endringer").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                        Text("Planen endrer data. Uten dette spør Glimt alltid først.").font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                }
                .tint(p.pos)
            }
            if !err.isEmpty { Text(err).font(PF.ui(12.5)).foregroundStyle(p.lab) }
            HStack(spacing: 8) {
                G67Btn(title: "Avbryt") { G67Recipes.shared.editing = nil }
                G67Btn(title: "Lagre", primary: true, disabled: G67Recipes.shared.busy != nil) { save() }
            }
        }
        .padding(.horizontal, 14).padding(.bottom, 12)
        .onAppear {
            guard !ready else { return }
            ready = true
            template = JS.str(it, "queryTemplate") ?? ""
            plan = G67Recipes.planText(it)
            fastWrite = JS.bool(it, "allowFastWrite") == true
        }
    }

    private func save() {
        Task { err = await G67Recipes.shared.saveEdit(it, template: template, planText: plan, fastWrite: fastWrite, store) ?? "" }
    }
}

/* ---------- Faste oppgaver ---------- */

struct G67SchedPage: View {
    @Environment(Store.self) private var store
    @MainActor private var m: G67Sched { G67Sched.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if m.missing {
                G67Card { G67Line(title: "", sub: "Serveren har ikke faste oppgaver ennå. Oppdater serveren.") }
            } else {
                G67SchedCreate()
                PLabel(text: "Oppgaver").padding(.leading, 4).padding(.top, 14)
                G67Chips(items: chips, selected: m.filter) { (f: String) in m.filter = f }
                G67SchedList()
                G67Note(text: "Lag, flytt og stopp oppgaver ved å si det til Glimt («Hvilke faste oppgaver har jeg?», «Stopp strømprisvarselet»). Hver kjøring logges her med resultat og levering.")
                G67SchedBriefs()
                G67FlagsView(flags: G67Flags.schedules, title: "Faste oppgaver")
                G67SchedZone()
            }
        }
        .task { await m.load(store) }
    }

    private var chips: [(String, String)] {
        [("", "Alle \(m.count("total"))"), ("active", "Aktive \(m.count("active"))"), ("paused", "Pauset \(m.count("paused"))"), ("ended", "Ferdige \(m.count("ended"))")]
    }
}

/// «Lag fra tekst»: Hva + Når (+ Bare hvis) → Forhåndsvis (/parse) → Lagre (POST). Ingenting lagres før Lagre.
struct G67SchedCreate: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: G67Sched { G67Sched.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Lag fra tekst").padding(.leading, 4).padding(.top, 6)
            G67Card {
                VStack(alignment: .leading, spacing: 8) {
                    G67Field(label: "Hva", placeholder: "strømprisene for i dag", text: Binding<String>(get: { m.newWhat }, set: { (v: String) in m.newWhat = v; m.preview = nil }))
                    G67Field(label: "Når", placeholder: "hver hverdag kl. 7", text: Binding<String>(get: { m.newWhen }, set: { (v: String) in m.newWhen = v; m.preview = nil }))
                    G67Field(label: "Bare hvis (valgfritt)", placeholder: "strømprisen går over 2 kr", text: Binding<String>(get: { m.newCond }, set: { (v: String) in m.newCond = v; m.preview = nil }))
                    Text("Skriv som du ville sagt det: «hver morgen kl. 7», «den 1. hver måned», «annenhver tirsdag kl 18», «hver fredag kl. 15 i vinter».")
                        .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    preview
                    HStack(spacing: 8) {
                        G67Btn(title: m.creating && m.preview == nil ? "Tolker …" : "Forhåndsvis", disabled: m.creating) { Task { await m.parse(store) } }
                        G67Btn(title: "Lagre", primary: true, disabled: m.creating || m.preview == nil || !m.enabled) {
                            Task { _ = await m.create(store) }
                        }
                    }
                }
                .padding(14)
            }
            if !m.enabled { G67Note(text: "Planlagte oppgaver er slått av – slå det på nederst på siden for å lagre nye.") }
        }
    }

    @ViewBuilder private var preview: some View {
        if !m.previewErr.isEmpty {
            Text(m.previewErr).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
        } else if let r = m.preview {
            VStack(alignment: .leading, spacing: 3) {
                Text(JS.str(r, "summary") ?? G67Sched.whenLabel(JS.dict(r, "when"))).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                let next: [String] = JS.strings(r, "nextRuns").prefix(3).map { G67Fmt.when($0) }
                if !next.isEmpty { Text("Neste: " + next.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut) }
                if let c = JS.dict(r, "condition") {
                    Text("Bare hvis " + (JS.str(c, "label") ?? JS.str(c, "text") ?? "") + " · sjekkes i koden mot ekte data").font(PF.ui(12.5)).foregroundStyle(p.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("Stemmer det? Trykk Lagre.").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.line.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }
}

struct G67SchedList: View {
    @MainActor private var m: G67Sched { G67Sched.shared }

    var body: some View {
        G67Card {
            if !m.loaded { G67Line(title: "", sub: "Laster …") }
            if !m.err.isEmpty { G67Line(title: "", sub: "Serveren svarte: " + m.err, bad: true) }
            if !m.enabled {
                G67Line(title: "Planlagte oppgaver er slått av", sub: "Ingenting kjøres nå. Oppgavene står, og du kan slå det på igjen nederst på siden.")
                G67Sep()
            }
            if !m.msg.isEmpty { G67Line(title: "", sub: m.msg); G67Sep() }
            if m.loaded && m.shown.isEmpty && m.err.isEmpty {
                G67Line(title: "", sub: m.items.isEmpty ? "Ingen faste oppgaver ennå. Si det til Glimt i Chat eller søkefeltet, f.eks. «Send meg strømprisene hver morgen kl. 7», «Minn meg på å betale husleia den 1. hver måned» eller «Si fra hvis strømprisen går over 2 kr i morgen». Glimt viser alltid tolkningen før noe lagres." : "Ingen oppgaver her.")
            }
            ForEach(Array(m.shown.enumerated()), id: \.offset) { i, it in
                if i > 0 { G67Sep() }
                G67SchedRow(it: it)
            }
        }
    }
}

struct G67SchedRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]

    private var id: String { JS.str(it, "id") ?? "" }
    @MainActor private var m: G67Sched { G67Sched.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { m.toggle(id, store) } label: { head }
                .buttonStyle(.plain)
                .accessibilityHint(m.open == id ? "Lukk" : "Åpne")
            if m.open == id { G67SchedDetail(it: it) }
        }
    }

    private var head: some View {
        let st: String = JS.str(it, "status") ?? ""
        let lr: [String: Any]? = JS.dict(it, "lastRun")
        let lrs: String = JS.str(lr, "status") ?? ""
        return HStack(alignment: .top, spacing: 10) {
            Set30Icon(symbol: "clock", tint: Color(hex: "#7a3b6b"))
            VStack(alignment: .leading, spacing: 3) {
                Text(JS.str(it, "title") ?? JS.str(it, "what") ?? "").font(PF.ui(15, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    G67Pill(text: G67Sched.status[st] ?? st, color: st == "active" ? p.pos : p.mut)
                    if JS.bool(it, "system") == true { G67Pill(text: "System", color: Color(hex: "#7a3b6b")) }
                    Text(G67Sched.whenLabel(JS.dict(it, "when"))).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                Text(G67Sched.next(it) + (JS.dict(it, "condition") != nil ? " · med betingelse" : "")).font(PF.ui(12.5)).foregroundStyle(p.mut)
                Text(lr == nil ? "Ikke kjørt ennå" : "Sist: " + (G67Sched.run[lrs] ?? lrs) + " " + G67Fmt.when(JS.str(lr, "finishedAt") ?? JS.str(lr, "startedAt") ?? JS.str(lr, "plannedAt")))
                    .font(PF.ui(12.5)).foregroundStyle(lrs == "failed" || lrs == "missed" ? p.lab : p.mut)
            }
            Spacer(minLength: 4)
            Image(systemName: m.open == id ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

struct G67SchedDetail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]
    @State private var newWhen: String = ""

    private var id: String { JS.str(it, "id") ?? "" }
    private var system: Bool { JS.bool(it, "system") == true }
    @MainActor private var m: G67Sched { G67Sched.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            G67KV(k: "Hva", v: JS.str(it, "what") ?? "")
            G67KV(k: "Type", v: G67Sched.kind[JS.str(it, "kind") ?? ""] ?? (JS.str(it, "kind") ?? ""))
            G67KV(k: "Når", v: G67Sched.whenLabel(JS.dict(it, "when")))
            if let c = JS.dict(it, "condition") {
                G67KV(k: "Bare hvis", v: (JS.str(c, "label") ?? JS.str(c, "text") ?? "") + (JS.str(c, "expr").map { "\nSjekkes i koden: " + $0 } ?? ""))
            }
            if let z = JS.str(JS.dict(it, "params"), "zone"), JS.str(it, "kind") == "power" || JS.str(JS.dict(it, "condition"), "source") == "power" {
                G67KV(k: "Prisområde", v: z + (G67Sched.zones.first { $0.0 == z }.map { " (" + $0.1 + ")" } ?? ""))
            }
            let next: [String] = JS.strings(it, "nextRuns").prefix(3).map { G67Fmt.when($0) }
            if !next.isEmpty { G67KV(k: "Neste", v: next.joined(separator: " · ")) }
            G67KV(k: "Levering", v: (JS.str(it, "channel") ?? "push") == "push" ? "Push i appen" : (JS.str(it, "channel") ?? ""))
            if JS.bool(it, "private") == true { G67KV(k: "Privat", v: "Push-varselet er generelt – detaljene står bare i appen") }
            if m.editWhen == id { editWhen } else { G67SchedActions(it: it) }
            if system {
                Text("Systemoppgave: kjøres av Glimt selv (f.eks. nattlig oppsummering av minnet eller nattlig eval). Kan settes på pause, ikke slettes eller endres.")
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            if let r = m.rmsg[id], !r.isEmpty { Text(r).font(PF.ui(13)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
            Text("Siste kjøringer").font(PF.ui(13, .semibold)).foregroundStyle(p.mut).padding(.top, 4)
            G67SchedRuns(runs: m.runs[id])
        }
        .padding(.horizontal, 14).padding(.bottom, 12)
    }

    private var editWhen: some View {
        VStack(alignment: .leading, spacing: 6) {
            G67Field(label: "Når", placeholder: "hver hverdag kl. 7", text: $newWhen)
            HStack(spacing: 8) {
                G67Btn(title: "Avbryt") { m.editWhen = nil }
                G67Btn(title: "Lagre", primary: true, disabled: m.busy[id] != nil) { Task { await m.move(id, when: newWhen, store) } }
            }
        }
        .onAppear { newWhen = JS.str(JS.dict(it, "when"), "text") ?? "" }
    }
}

struct G67SchedActions: View {
    @Environment(Store.self) private var store
    let it: [String: Any]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { buttons }
            VStack(alignment: .leading, spacing: 0) { buttons }
        }
    }

    @ViewBuilder private var buttons: some View {
        let m: G67Sched = G67Sched.shared
        let id: String = JS.str(it, "id") ?? ""
        let busy: String? = m.busy[id]
        let off: Bool = !m.enabled
        let st: String = JS.str(it, "status") ?? ""
        G67Btn(title: busy == "run" ? "Kjører …" : "Kjør nå", primary: true, disabled: busy != nil || off) { Task { await m.runNow(id, store) } }
        if st == "active" {
            G67Btn(title: "Pause", disabled: busy != nil || off) { Task { await m.setStatus(id, "paused", store) } }
        } else if st == "paused" {
            G67Btn(title: "Fortsett", disabled: busy != nil || off) { Task { await m.setStatus(id, "active", store) } }
        }
        if JS.bool(it, "system") != true {
            G67Btn(title: "Endre tidspunkt", disabled: off) { m.editWhen = id }
            G67Btn(title: m.arm == id ? "Trykk igjen for å slette" : "Slett", danger: true, disabled: busy != nil) { Task { await m.delete(id, store) } }
        }
    }
}

struct G67SchedRuns: View {
    @Environment(\.paper) private var p
    let runs: [[String: Any]]?

    var body: some View {
        if let runs {
            if runs.isEmpty { Text("Ikke kjørt ennå").font(PF.ui(12.5)).foregroundStyle(p.mut) }
            ForEach(Array(runs.enumerated()), id: \.offset) { _, r in
                G67SchedRunRow(r: r)
            }
        } else {
            Text("Laster kjøringer …").font(PF.ui(12.5)).foregroundStyle(p.mut)
        }
    }
}

struct G67SchedRunRow: View {
    @Environment(\.paper) private var p
    let r: [String: Any]

    var body: some View {
        let st: String = JS.str(r, "status") ?? ""
        let bad: Bool = st == "failed" || st == "missed"
        HStack(alignment: .top, spacing: 8) {
            Rectangle().fill(st == "ok" ? p.pos : (bad ? p.lab : p.mut)).frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text((G67Sched.run[st] ?? st) + " " + G67Fmt.when(JS.str(r, "finishedAt") ?? JS.str(r, "startedAt") ?? JS.str(r, "plannedAt")))
                    .font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                if !meta.isEmpty { Text(meta).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
                if let t = JS.str(r, "result") { Text(t).font(PF.ui(12.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true).textSelection(.enabled) }
                if let t = JS.str(r, "reason") { Text(t).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
                if let t = JS.str(r, "error") { Text(t).font(PF.ui(12)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.line.opacity(0.3), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var meta: String {
        var parts: [String] = []
        let trig: String = JS.str(r, "trigger") ?? "schedule"
        if trig == "catchup" { parts.append("tatt igjen etter omstart") }
        if trig == "run-now" { parts.append("kjørt nå") }
        if let ms = JS.num(r, "ms") { parts.append(G67Fmt.secs(ms)) }
        if let c = JS.dict(r, "condition") {
            let v: String = JS.num(c, "value").map { " (" + String($0).replacingOccurrences(of: ".", with: ",") + ")" } ?? ""
            parts.append("Betingelse " + (JS.bool(c, "met") == true ? "oppfylt" : "ikke oppfylt") + v)
        }
        let d: String = G67Sched.delivery(r)
        if !d.isEmpty { parts.append(d) }
        return parts.joined(separator: " · ")
    }
}

/// Briefene (morgen/dag/kveld/natt) – de samme som under Glimt → Figur, brief og stemme.
struct G67SchedBriefs: View {
    @MainActor private var m: G67Sched { G67Sched.shared }

    var body: some View {
        if !m.builtin.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                PLabel(text: "Briefer").padding(.leading, 4).padding(.top, 14)
                G67Card {
                    ForEach(Array(m.builtin.enumerated()), id: \.offset) { i, b in
                        if i > 0 { G67Sep() }
                        G67BriefRow(b: b)
                    }
                }
                G67Note(text: "Briefene er de samme som under Innstillinger → Glimt. «Flytt morgenbriefen til 06:30» til Glimt endrer klokkeslettet her.")
            }
        }
    }
}

struct G67BriefRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let b: [String: Any]
    @State private var at: String = ""

    private var id: String { JS.str(b, "id") ?? "" }
    private var canAt: Bool { b["editable"] == nil || JS.strings(b, "editable").contains("at") }
    private var canOn: Bool { b["editable"] == nil || JS.strings(b, "editable").contains("on") }

    var body: some View {
        let m: G67Sched = G67Sched.shared
        let on: Bool = JS.bool(b, "on") != false
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(JS.str(b, "title") ?? "").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(on ? [JS.str(b, "label") ?? "", JS.str(b, "nextRunAt").map { "neste " + G67Fmt.when($0) } ?? ""].filter { !$0.isEmpty }.joined(separator: " · ") : "Av")
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                if let r = m.rmsg[id], !r.isEmpty { Text(r).font(PF.ui(12)).foregroundStyle(p.mut) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if canAt {
                TextField("06:45", text: $at)
                    .font(PF.ui(14)).foregroundStyle(p.ink).multilineTextAlignment(.center)
                    .keyboardType(.numbersAndPunctuation)
                    .frame(width: 64, height: 38)
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
                    .onSubmit { save() }
                    .accessibilityLabel("Klokkeslett for " + (JS.str(b, "title") ?? ""))
                G67Btn(title: "Lagre", disabled: m.busy[id] != nil) { save() }
            }
            if canOn {
                Toggle("", isOn: Binding<Bool>(get: { on }, set: { (v: Bool) in Task { await m.brief(id, at: nil, on: v, store) } }))
                    .labelsHidden().tint(p.pos)
                    .accessibilityLabel((JS.str(b, "title") ?? "") + " på")
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .onAppear { if at.isEmpty { at = JS.str(b, "at") ?? "" } }
    }

    private func save() {
        let t: String = at.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ".", with: ":")
        Task { await G67Sched.shared.brief(id, at: t, on: nil, store) }
    }
}

/// Standard prisområde for strøm (bare for meg).
struct G67SchedZone: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let f: G67Flags = G67Flags.schedules
        if let d = f.data {
            let zone: String = JS.str(d, "zone") ?? "NO1"
            PaperLinkList(rows: [
                PaperLinkRow(name: "Prisområde for strøm", sub: "Brukes når oppgaven ikke sier noe annet", value: zone + " ›", valueColor: p.lab, icon: "bolt") {
                    let order: [String] = G67Sched.zones.map(\.0)
                    let i: Int = order.firstIndex(of: zone) ?? 0
                    Task { await f.put(["scope": "user", "zone": order[(i + 1) % order.count]], store) }
                },
            ])
            .padding(.top, 8)
        }
    }
}

/* ---------- Kvalitet ---------- */

struct G67QualityPage: View {
    @Environment(Store.self) private var store
    @MainActor private var q: G67Quality { G67Quality.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if q.missing {
                G67Card { G67Line(title: "", sub: "Serveren har ikke kvalitetsrapporter ennå. Oppdater serveren.") }
            } else {
                G67Weekly()
                if Update28Model.isAdmin(store) { G67EvalRuns() }
                // Prompt 68: «Innstillinger for nattlig eval» – bare når både /settings og appen sier admin.
                if evalAdmin { G67EvalSettingsView() }
                G67FlagsView(flags: G67Flags.quality, title: "Kvalitet", note: "Av her slår funksjonen av for alle brukere. Ukerapporten kan hver bruker i tillegg slå av for seg selv over.")
            }
        }
        .task { await q.load(store, admin: Update28Model.isAdmin(store)) }
    }

    private var evalAdmin: Bool {
        let server: Bool = JS.bool(q.settings, "admin") == true
        return server && Update28Model.isAdmin(store)
    }
}

struct G67Weekly: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var q: G67Quality { G67Quality.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Ukerapport").padding(.leading, 4).padding(.top, 6)
            G67Card {
                if let w = q.weekly {
                    nav(w)
                    G67Sep()
                    G67WeeklyNumbers(w: w)
                    G67Sep()
                    G67Line(title: "", sub: status(w))
                } else {
                    G67Line(title: "", sub: q.weekErr.isEmpty ? "Laster …" : "Serveren svarte: " + q.weekErr, bad: !q.weekErr.isEmpty)
                }
            }
        }
    }

    private func nav(_ w: [String: Any]) -> some View {
        let weeks: [[String: Any]] = JS.list(w, "weeks")
        let cur: String = JS.str(w, "week") ?? ""
        let i: Int? = weeks.firstIndex { JS.str($0, "week") == cur }
        let older: String? = i.flatMap { $0 + 1 < weeks.count ? JS.str(weeks[$0 + 1], "week") : nil }
        let newer: String? = i.flatMap { $0 > 0 ? JS.str(weeks[$0 - 1], "week") : nil }
        return HStack(spacing: 8) {
            G67Btn(title: "‹", disabled: older == nil) { Task { await q.go(older, store) } }.accessibilityLabel("Uka før")
            VStack(spacing: 1) {
                Text(JS.str(w, "label") ?? cur).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).multilineTextAlignment(.center)
                if JS.bool(w, "partial") == true { Text("så langt").font(PF.ui(12)).foregroundStyle(p.mut) }
            }
            .frame(maxWidth: .infinity)
            G67Btn(title: "›", disabled: newer == nil) { Task { await q.go(newer, store) } }.accessibilityLabel("Uka etter")
        }
        .padding(.horizontal, 10).padding(.vertical, 4)
    }

    private func status(_ w: [String: Any]) -> String {
        var parts: [String] = []
        if JS.bool(w, "partial") == true { parts.append("Uka er ikke ferdig – tallene oppdateres fortløpende") }
        if JS.bool(w, "enabled") == false { parts.append("Ukerapporten er slått av – ingen push") }
        else if let s = JS.str(w, "sentAt") { parts.append("Sendt som push " + G67Fmt.when(s)) }
        else if JS.bool(w, "partial") != true { parts.append("Ikke sendt") }
        if let t = JS.str(w, "text") { parts.append(t) }
        return parts.joined(separator: "\n")
    }
}

struct G67WeeklyNumbers: View {
    @Environment(\.paper) private var p
    let w: [String: Any]

    var body: some View {
        let u: [String: Any]? = JS.dict(w, "user")
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                cell("\(JS.int(u, "requests") ?? 0)", "Forespørsler")
                cell(G67Fmt.pct(JS.num(u, "firstTryShare")), "Løst på første forsøk")
                cell("\(JS.int(u, "corrections") ?? 0)", "Rettelser")
                cell("\(JS.int(u, "newRecipes") ?? 0)", "Nye oppskrifter")
                cell(G67Fmt.pct(JS.num(u, "fastShare")), "Hurtigvei")
                cell(G67Fmt.secs(JS.num(u, "medianMs")), "Median svartid")
            }
            if let s = JS.dict(w, "system") { Text(system(s)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
        }
        .padding(12)
    }

    private func cell(_ n: String, _ t: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(n).font(PF.ui(18, .bold)).foregroundStyle(p.ink)
            Text(t).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(p.line.opacity(0.45), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// Admin: «Hele systemet: 80 forespørsler fra 3 brukere · 86 % første forsøk · … · 7 nattlige kjøringer».
    private func system(_ s: [String: Any]) -> String {
        let users: Int = JS.int(s, "users") ?? 0
        var parts: [String] = ["\(JS.int(s, "requests") ?? 0) forespørsler fra \(users) \(users == 1 ? "bruker" : "brukere")",
                               G67Fmt.pct(JS.num(s, "firstTryShare")) + " første forsøk",
                               "\(JS.int(s, "newRecipes") ?? 0) nye oppskrifter"]
        if let e = JS.dict(s, "eval") {
            let n: Int = JS.int(e, "runs") ?? 0
            parts.append("\(n) \(n == 1 ? "nattlig kjøring" : "nattlige kjøringer")")
            if let r = JS.int(e, "regressions"), r > 0 { parts.append("\(r) med regresjon") }
        }
        return "Hele systemet: " + parts.joined(separator: " · ")
    }
}

/// Nattlig eval – bare admin.
struct G67EvalRuns: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var q: G67Quality { G67Quality.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Nattlig eval · admin").padding(.leading, 4).padding(.top, 14)
            G67Card {
                head
                if !q.msg.isEmpty { G67Sep(); G67Line(title: "", sub: q.msg) }
                if !q.runsErr.isEmpty { G67Sep(); G67Line(title: "", sub: "Serveren svarte: " + q.runsErr, bad: true) }
                ForEach(Array(q.runs.enumerated()), id: \.offset) { _, r in
                    G67Sep()
                    G67EvalRow(r: r)
                }
            }
        }
    }

    private var head: some View {
        let sch: [String: Any]? = JS.dict(JS.dict(q.settings, "schedules"), "nightly")
        let nightly: Bool = JS.bool(JS.dict(q.settings, "settings"), "nightly") != false
        let sub: String = !nightly ? "Nattlig eval er slått av" : (JS.str(sch, "status") == "paused" ? "Satt på pause i Faste oppgaver" : (JS.str(sch, "nextRunAt").map { "Neste " + G67Fmt.when($0) } ?? "Hver natt kl. 02"))
        return HStack(spacing: 8) {
            G67Line(title: q.running != nil ? "Kjører nå" : "Nattlig eval", sub: sub + (q.running.map { " · " + G67Quality.line($0) } ?? ""))
            if q.running != nil {
                G67Btn(title: "Avbryt", danger: true, disabled: q.busy) { Task { await q.abort(store) } }.padding(.trailing, 10)
            } else {
                G67Btn(title: q.busy ? "Starter …" : "Kjør nå", primary: true, disabled: q.busy) { Task { await q.runNow(store) } }.padding(.trailing, 10)
            }
        }
    }
}

struct G67EvalRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let r: [String: Any]

    private var id: String { JS.str(r, "id") ?? "" }
    @MainActor private var q: G67Quality { G67Quality.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { q.toggle(id, store) } label: { head }
                .buttonStyle(.plain)
            if q.open == id { G67EvalDetail(id: id) }
        }
    }

    private var head: some View {
        let st: String = JS.str(r, "status") ?? ""
        let color: Color = st == "ok" ? p.pos : (st == "regression" || st == "failed" ? p.lab : p.mut)
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    G67Pill(text: G67Quality.status[st] ?? st, color: color)
                    Text(G67Fmt.when(r["startedAt"]) + (JS.str(r, "trigger") == "run-now" ? " · kjørt manuelt" : "")).font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                }
                Text(G67Quality.line(r)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Image(systemName: q.open == id ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

struct G67EvalDetail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let id: String
    @MainActor private var q: G67Quality { G67Quality.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let d = q.details[id] {
                Text(meta(d)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                ForEach(Array(shownCases(d).enumerated()), id: \.offset) { _, c in
                    G67EvalCase(c: c)
                }
                let all: Int = JS.list(d, "cases").count
                let hidden: Int = all - shownCases(d).count
                if hidden > 0 || q.showAll {
                    G67Btn(title: q.showAll ? "Skjul grønne" : "Vis alle \(all) caser (\(hidden) grønne til)") { q.showAll.toggle() }
                }
            } else {
                Text("Henter casene …").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            G67Btn(title: q.reports[id] == nil ? "Åpne rapporten" : "Skjul rapporten") { Task { await q.loadReport(id, store) } }
            if let md = q.reports[id] {
                Text(md).font(.system(size: 11.5, design: .monospaced)).foregroundStyle(p.ink).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.line.opacity(0.3), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(.horizontal, 14).padding(.bottom, 12)
    }

    private func shownCases(_ d: [String: Any]) -> [[String: Any]] {
        let all: [[String: Any]] = JS.list(d, "cases")
        if q.showAll { return all }
        return all.filter { JS.str($0, "status") != "green" || JS.bool($0, "regression") == true }
    }

    private func meta(_ d: [String: Any]) -> String {
        var parts: [String] = []
        if let m = JS.str(d, "model") { parts.append(m) }
        if let c = JS.str(d, "commit") { parts.append(c) }
        if let n = JS.int(d, "runsPerCase") { parts.append("\(n) kjøringer per case") }
        if let ms = JS.num(d, "ms") { parts.append(G67Fmt.secs(ms)) }
        if let p50 = JS.num(d, "p50Ms") { parts.append("p50 " + G67Fmt.secs(p50)) }
        if let p90 = JS.num(d, "p90Ms") { parts.append("p90 " + G67Fmt.secs(p90)) }
        if let b = JS.str(d, "baselineRunId") { parts.append("sammenlignet med " + b) }
        return parts.joined(separator: " · ")
    }
}

struct G67EvalCase: View {
    @Environment(\.paper) private var p
    let c: [String: Any]

    private var label: String {
        let reg: Bool = JS.bool(c, "regression") == true
        let id: String = JS.str(c, "id") ?? ""
        let passes: Int = JS.int(c, "passes") ?? 0
        let runs: Int = JS.int(c, "runs") ?? 0
        var out: String = (reg ? "▼ " : "") + id + " · \(passes)/\(runs)"
        if let base = JS.dict(c, "baseline") {
            let bp: Int = JS.int(base, "passes") ?? 0
            let br: Int = JS.int(base, "runs") ?? 0
            out += " (før \(bp)/\(br))"
        }
        return out
    }

    private var tone: Color {
        let st: String = JS.str(c, "status") ?? ""
        if JS.bool(c, "regression") == true || st == "red" { return p.lab }
        return st == "green" ? p.pos : p.ink
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(PF.ui(13, .semibold)).foregroundStyle(tone)
            if let t = JS.str(c, "title") { Text(t).font(PF.ui(12.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
            if let r = JS.str(c, "reason") { Text(r).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.line.opacity(0.25), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/* ---------- Prompt 68: Innstillinger for nattlig eval (admin) ---------- */

/// Brytere for nattlig eval og ukerapport for alle, og kjøringer per case, tidsgrense, «Gi plass etter» og «Lagre rapporter».
/// Verdiene klemmes til grensene (G67EvalLimits), og «Lagre» sender bare det som er endret (G67EvalSet).
struct G67EvalSettingsView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: G67EvalSet { G67EvalSet.shared }
    @MainActor private var q: G67Quality { G67Quality.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Innstillinger for nattlig eval").padding(.leading, 4).padding(.top, 14)
            G67Card {
                G67EvalToggle(title: "Nattlig eval", sub: nightlyHelp, on: m.nightly, disabled: m.busy) { (v: Bool) in m.setNightly(v) }
                G67Sep()
                G67EvalToggle(title: "Ukerapport for alle", sub: "Av her slår ukerapporten av for alle brukere.", on: m.weekly, disabled: m.busy) { (v: Bool) in m.setWeekly(v) }
                ForEach(G67EvalLimits.all) { (l: G67EvalLimit) in
                    G67Sep()
                    G67EvalStepper(l: l, off: off(l))
                }
                G67Sep()
                G67EvalActions()
                if !m.err.isEmpty {
                    G67Sep()
                    G67Line(title: m.err, bad: true)
                }
            }
            G67Note(text: "«Nattlig eval» står også i Faste oppgaver som systemoppgave, der den kan settes på pause.")
        }
    }

    private var nightlyHelp: String {
        let h: String = JS.str(JS.dict(q.settings, "help"), "nightly") ?? ""
        if !h.isEmpty && h != "…" { return h }
        return G67Flags.quality.defs.first?.help ?? ""
    }

    /// Som web: kjøringer, tidsgrense og «Gi plass etter» er låst når nattlig eval er av.
    private func off(_ l: G67EvalLimit) -> Bool {
        if m.busy { return true }
        if l.key == G67EvalLimits.keepDays.key { return false }
        return !m.nightly
    }
}

struct G67EvalToggle: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let on: Bool
    var disabled: Bool = false
    let set: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding<Bool>(get: { on }, set: { (v: Bool) in set(v) })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.pos)
        .disabled(disabled)
        .padding(.horizontal, 14).padding(.vertical, 9)
    }
}

struct G67EvalStepper: View {
    @Environment(\.paper) private var p
    let l: G67EvalLimit
    let off: Bool
    @MainActor private var m: G67EvalSet { G67EvalSet.shared }

    private var value: Binding<Int> {
        Binding<Int>(get: { m.value(l) }, set: { (v: Int) in m.set(l, v) })
    }

    private var changed: Bool { m.value(l) != m.saved(l) }

    private var range: ClosedRange<Int> { l.lo...l.hi }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            VStack(alignment: .leading, spacing: 2) {
                Text(l.label).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(l.help).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                presets
                Spacer(minLength: 6)
                Stepper(l.label, value: value, in: range, step: l.step).labelsHidden()
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .disabled(off)
        .opacity(off ? 0.5 : 1)
        .accessibilityElement(children: .contain)
    }

    /// Verdien som knapp: hurtigvalgene fra web.
    private var presets: some View {
        Menu {
            ForEach(l.presets, id: \.self) { (n: Int) in
                Button(l.text(n)) { m.set(l, n) }
            }
        } label: {
            HStack(spacing: 4) {
                Text(l.text(m.value(l))).font(PF.ui(15, .bold)).foregroundStyle(changed ? p.lab : p.ink)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 12).frame(height: 34)
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .accessibilityLabel(l.label + ": " + l.text(m.value(l)))
    }
}

struct G67EvalActions: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: G67EvalSet { G67EvalSet.shared }

    private var status: String {
        if !m.msg.isEmpty { return m.msg }
        let n: Int = m.changes().count
        if n == 0 { return "Ingen endringer" }
        if n == 1 { return "1 endring ikke lagret" }
        return "\(n) endringer ikke lagret"
    }

    var body: some View {
        HStack(spacing: 8) {
            Text(status).font(PF.ui(12.5)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading)
            if m.dirty {
                G67Btn(title: "Angre", disabled: m.busy) { m.reset() }
            }
            G67Btn(title: m.busy ? "Lagrer …" : "Lagre", primary: true, disabled: m.busy || !m.dirty) {
                Task { await m.save(store) }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 6)
    }
}
