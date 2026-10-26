import SwiftUI

/* ---------------- Prompt 67 (IOSSET67): sidene under Innstillinger → Glimt ----------------
 Som web (settings65.js · glimtView65): Glimt-siden samler figur/brief/stemme (fullskjermen fra prompt 35), «Send til Chat
 etter», Forstår samtaler, og radene til Glimt husker (+ Forslag/Motstrid/Gamle), Entitetsregister, Glimt lærer,
 Faste oppgaver og Kvalitet. Undersidene er rutene innst-glimt:<side> (tilbake går til Glimt, Integrations26.nav26BackTarget).
 Byggeklosser og Glimt-siden, Glimt husker og Entitetsregister her; Glimt lærer, Faste oppgaver og Kvalitet i Glimt67Tasks.swift.
 Scroll-lærdommen: bare knapper (ingen gester) på radene; alt ligger i sidens vanlige ScrollView. */

/* ---------- Byggeklosser ---------- */

struct G67Card<C: View>: View {
    @ViewBuilder let content: () -> C

    var body: some View {
        PCard(padding: 0) { VStack(alignment: .leading, spacing: 0) { content() } }
    }
}

struct G67Sep: View {
    @Environment(\.paper) private var p

    var body: some View { Rectangle().fill(p.line).frame(height: 1) }
}

struct G67Line: View {
    @Environment(\.paper) private var p
    let title: String
    var sub: String = ""
    var bad: Bool = false
    /// false = ingen egen marg (inne i en rad som har marg selv).
    var pad: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if !title.isEmpty { Text(title).font(PF.ui(15, .semibold)).foregroundStyle(bad ? p.lab : p.ink).fixedSize(horizontal: false, vertical: true) }
            if !sub.isEmpty { Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, pad ? 14 : 0).padding(.vertical, pad ? 11 : 0)
    }
}

struct G67Note: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 4)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct G67Btn: View {
    @Environment(\.paper) private var p
    let title: String
    var primary: Bool = false
    var danger: Bool = false
    var disabled: Bool = false
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(13, .bold)).foregroundStyle(primary ? p.bg : (danger ? p.lab : p.ink))
                .lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 13).frame(height: 34)
                .background(primary ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(primary ? Color.clear : p.line, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }
}

struct G67Field: View {
    @Environment(\.paper) private var p
    let label: String
    let placeholder: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !label.isEmpty { Text(label).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut) }
            TextField(placeholder, text: $text)
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 12).frame(minHeight: 42)
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
        }
    }
}

/// Filterrad («Alle 4 · Aktive 2 · …») som knapper.
struct G67Chips: View {
    @Environment(\.paper) private var p
    let items: [(String, String)]
    let selected: String
    let pick: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items, id: \.0) { (it: (String, String)) in
                    Button { Haptics.shared.select(); pick(it.0) } label: {
                        Text(it.1).font(PF.ui(13, selected == it.0 ? .bold : .regular)).foregroundStyle(p.ink)
                            .padding(.horizontal, 12).frame(height: 32)
                            .background(selected == it.0 ? p.line : Color.clear, in: Capsule())
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                            .frame(minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected == it.0 ? .isSelected : [])
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

/// Liten statusbrikke («Aktiv», «System»).
struct G67Pill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text).font(PF.ui(11.5, .semibold)).foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 1)
            .overlay(Capsule().stroke(color, lineWidth: 1))
    }
}

/// «Nøkkel: verdi»-linje i en detaljvisning.
struct G67KV: View {
    @Environment(\.paper) private var p
    let k: String
    let v: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(k).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut).frame(width: 92, alignment: .leading)
            Text(v).font(PF.ui(13.5)).foregroundStyle(p.ink).frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
        }
    }
}

/// «FOR MEG» og «FOR ALLE (ADMIN)»: samme brytere som web (effektiv verdi = server OG bruker).
struct G67FlagsView: View {
    @Environment(Store.self) private var store
    let flags: G67Flags
    let title: String
    var note: String = "Av her slår funksjonen av for alle brukere. Hver bruker kan i tillegg slå av for seg selv over."

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !flags.missing {
                PLabel(text: title + " · for meg").padding(.leading, 4).padding(.top, 14)
                G67Card {
                    if flags.data == nil { G67Line(title: "", sub: flags.msg.isEmpty ? "Laster …" : flags.msg) }
                    ForEach(Array(flags.defs.filter { flags.userKeys.contains($0.key) }.enumerated()), id: \.element.key) { i, d in
                        if i > 0 { G67Sep() }
                        G67FlagRow(flags: flags, def: d, server: false)
                    }
                }
                if !flags.msg.isEmpty && flags.data != nil { G67Note(text: flags.msg) }
                if flags.admin && Update28Model.isAdmin(store) { adminPart }
            }
        }
        .task { await flags.load(store) }
    }

    private var adminPart: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: title + " · for alle (admin)").padding(.leading, 4).padding(.top, 12)
            G67Card {
                ForEach(Array(flags.defs.filter { flags.serverKeys.contains($0.key) }.enumerated()), id: \.element.key) { i, d in
                    if i > 0 { G67Sep() }
                    G67FlagRow(flags: flags, def: d, server: true)
                }
            }
            G67Note(text: note)
        }
    }
}

struct G67FlagRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let flags: G67Flags
    let def: G67FlagDef
    let server: Bool

    var body: some View {
        let srv: Bool = flags.server(def.key)
        let on: Bool = server ? srv : flags.on(def.key)
        Toggle(isOn: Binding<Bool>(get: { on }, set: { (_: Bool) in
            Task { if server { await flags.setServer(def.key, store) } else { await flags.setUser(def.key, store) } }
        })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(flags.label(def)).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub(srv)).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.pos)
        .disabled(flags.busy || (!server && !srv))
        .padding(.horizontal, 14).padding(.vertical, 9)
    }

    private func sub(_ srv: Bool) -> String {
        if server { return flags.help(def) }
        if !srv { return "Slått av for alle av administrator" }
        return flags.own(def.key) == nil ? flags.help(def) : flags.help(def) + " · Ditt eget valg"
    }
}

/* ---------- Glimt-siden ---------- */

/// Innstillinger → Glimt (innst-glimt).
struct G67GlimtPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Glimt").padding(.leading, 4).padding(.top, 6)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Figur, brief og stemme", sub: "Glimt-figur, briefer gjennom dagen, kort, stemmemotor og venner",
                             icon: "sparkle", tint30: Color(hex: "#b23a2a")) { Glimt35Model.shared.showPage = true },
            ])
            // Prompt 32: «Send til Chat etter» (flyttet hit fra AI og tolkning i prompt 67, som på web).
            Search32bSettingsGroup()
            PLabel(text: "Glimt husker og lærer").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: memoryRows)
            PLabel(text: "Oppgaver og kvalitet").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Faste oppgaver", sub: "Planlagte oppgaver og varsler du har bedt Glimt om", icon: "clock.arrow.circlepath",
                             tint30: Color(hex: "#7a3b6b")) { store.paperGo(G67Nav.faste) },
                PaperLinkRow(name: "Kvalitet", sub: "Ukerapport og nattlige eval-kjøringer", icon: "checkmark.seal",
                             tint30: Color(hex: "#2f7a4f")) { store.paperGo(G67Nav.kvalitet) },
            ])
            // Prompt 60 del 3: Forstår samtaler (samtaletilstand, entitetsregister, valgknapper).
            G67FlagsView(flags: G67Flags.understand, title: "Forstår samtaler")
            Glimt35AiLink67()
        }
        .task { await G67Mem.shared.load(store) }
    }

    private var memoryRows: [PaperLinkRow] {
        let m: G67Mem = G67Mem.shared
        let n: [String] = [m.pending.isEmpty ? "" : "\(m.pending.count) forslag", m.conflicts.isEmpty ? "" : "\(m.conflicts.count) motstrid"].filter { !$0.isEmpty }
        return [
            PaperLinkRow(name: "Glimt husker", sub: n.isEmpty ? "Det du har lært Glimt, forslag og motstrid" : n.joined(separator: " · "),
                         value: n.isEmpty ? "›" : "Se ›", valueColor: n.isEmpty ? nil : p.lab, icon: "brain", tint30: Color(hex: "#b23a2a")) { store.paperGo(G67Nav.husker) },
            PaperLinkRow(name: "Entitetsregister", sub: "Personer, steder, butikker og abonnementer med aliaser", icon: "person.text.rectangle",
                         tint30: Color(hex: "#3b6fd6")) { store.paperGo(G67Nav.ent) },
            PaperLinkRow(name: "Glimt lærer", sub: "Oppskrifter fra vellykkede kjøringer og rettelser", icon: "graduationcap",
                         tint30: Color(hex: "#b7871a")) { store.paperGo(G67Nav.laerer) },
        ]
    }
}

/// «Modeller, nøkler og forbruk ligger under AI ›» (samme som nederst i Glimt-fullskjermen).
struct Glimt35AiLink67: View {
    @Environment(\.paper) private var p

    var body: some View {
        Button { AiCtl34.shared.show("ov") } label: {
            Text("Modeller, nøkler og forbruk ligger under AI ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab)
                .padding(.horizontal, 6).padding(.top, 12).frame(minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Glimt husker ---------- */

/// Innstillinger → Glimt → Glimt husker: lista fra prompt 33 + Forslag, Motstrid og «Ikke brukt på lenge» (prompt 63).
struct G67HuskerPage: View {
    @Environment(Store.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Memory33SettingsGroup()
            G67MemHead()
            G67MemPending()
            G67MemConflicts()
            G67MemStale()
            G67FlagsView(flags: G67Flags.hygiene, title: "Rydding av minnet")
        }
        .task { await G67Mem.shared.load(store) }
    }
}

struct G67MemHead: View {
    @Environment(Store.self) private var store
    @MainActor private var m: G67Mem { G67Mem.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Glimt rydder minnet").padding(.leading, 4).padding(.top, 14)
            G67Card {
                if m.missing {
                    G67Line(title: "", sub: "Serveren har ikke forslag og motstrid ennå. Oppdater serveren.")
                } else {
                    HStack(spacing: 8) {
                        G67Line(title: counts.isEmpty ? "Glimt rydder minnet" : counts, sub: next + " · " + G67Mem.runLine(JS.dict(m.hygiene, "lastRun")))
                        G67Btn(title: m.busy["run"] == true ? "Kjører …" : "Kjør nå", disabled: m.busy["run"] == true || !m.on("nightly")) {
                            Task { await m.runNow(store) }
                        }
                        .padding(.trailing, 10)
                    }
                    if !m.msg.isEmpty { G67Sep(); G67Line(title: "", sub: m.msg) }
                    if !m.err.isEmpty { G67Sep(); G67Line(title: "", sub: "Serveren svarte: " + m.err, bad: true) }
                }
            }
        }
    }

    private var counts: String {
        [m.pending.isEmpty ? "" : "\(m.pending.count) forslag", m.conflicts.isEmpty ? "" : "\(m.conflicts.count) motstrid",
         m.stale.isEmpty ? "" : "\(m.stale.count) ikke brukt på lenge"].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var next: String {
        if !m.on("nightly") { return "Nattlig oppsummering er slått av" }
        let sch: [String: Any]? = JS.dict(m.hygiene, "schedule")
        if JS.str(sch, "status") == "paused" { return "Nattjobben er satt på pause i Faste oppgaver" }
        if let n = JS.str(sch, "nextRunAt") { return "Neste " + G67Fmt.when(n) }
        return "Hver natt kl. 03"
    }
}

struct G67MemPending: View {
    @MainActor private var m: G67Mem { G67Mem.shared }

    var body: some View {
        if !m.missing {
            VStack(alignment: .leading, spacing: 4) {
                PLabel(text: m.pending.isEmpty ? "Forslag" : "Forslag · \(m.pending.count)").padding(.leading, 4).padding(.top, 14)
                G67Card {
                    if m.pending.isEmpty {
                        G67Line(title: "", sub: m.on("nightly") ? "Ingen nye forslag. Glimt foreslår nye fakta hver natt fra samtalene, rettelser og nye kalenderhendelser – ingenting lagres før du godkjenner." : "Nattlig oppsummering er av. Slå den på nederst på siden.")
                    }
                    ForEach(Array(m.pending.enumerated()), id: \.offset) { i, it in
                        if i > 0 { G67Sep() }
                        G67PendingRow(it: it)
                    }
                }
            }
        }
    }
}

struct G67PendingRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]
    @State private var why: Bool = false

    private var id: String { JS.str(it, "id") ?? "" }
    @MainActor private var m: G67Mem { G67Mem.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            G67Line(title: G67Mem.sentence(it), sub: G67Mem.sub(it) + (JS.bool(it, "edited") == true ? " · redigert" : ""), pad: false)
            let al: [String] = JS.strings(it, "aliases")
            if !al.isEmpty { Text("Aliaser: " + al.joined(separator: ", ")).font(PF.ui(12.5)).foregroundStyle(p.mut) }
            if JS.str(it, "conflictId") != nil {
                Text("Motsier noe Glimt allerede vet – velg under Motstrid først.").font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab)
            }
            evidence
            if m.editing == id { G67PendingEdit(it: it) } else { actions }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    @ViewBuilder private var evidence: some View {
        let ev: [[String: Any]] = Array(JS.list(it, "evidence").filter { JS.str($0, "text") != nil }.prefix(3))
        if !ev.isEmpty {
            Button { why.toggle() } label: {
                Text(why ? "Skjul hvorfor" : "Hvorfor Glimt tror det").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).underline()
                    .frame(minHeight: 32)
            }
            .buttonStyle(.plain)
            if why {
                ForEach(Array(ev.enumerated()), id: \.offset) { _, e in
                    Text(G67PendingRow.evLine(e))
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    static func evLine(_ e: [String: Any]) -> String {
        let t: String = JS.str(e, "text") ?? ""
        let at: String = JS.str(e, "at").map { (x: String) -> String in " · " + G67Fmt.when(x) } ?? ""
        return "«\(t)»\(at)"
    }

    private var actions: some View {
        let busy: Bool = m.busy[id] == true
        return HStack(spacing: 8) {
            G67Btn(title: "Godkjenn", primary: true, disabled: busy || JS.str(it, "conflictId") != nil) { Task { await m.approve(id, edits: nil, store) } }
            G67Btn(title: "Rediger", disabled: busy) { m.editing = id }
            G67Btn(title: "Avvis", disabled: busy) { Task { await m.reject(id, store) } }
        }
    }
}

struct G67PendingEdit: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]
    @State private var subject: String = ""
    @State private var object: String = ""
    @State private var aliases: String = ""
    @State private var err: String = ""
    @State private var ready: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            G67Field(label: "Navn", placeholder: "Kari", text: $subject)
            G67Field(label: JS.str(it, "kind") == "alias" ? "Er (type)" : "Er", placeholder: "søsteren min", text: $object)
            G67Field(label: "Aliaser", placeholder: "søster, Kari B (skill med komma)", text: $aliases)
            if !err.isEmpty { Text(err).font(PF.ui(12.5)).foregroundStyle(p.lab) }
            HStack(spacing: 8) {
                G67Btn(title: "Avbryt") { G67Mem.shared.editing = nil }
                G67Btn(title: "Lagre forslaget") { save(false) }
                G67Btn(title: "Lagre og godkjenn", primary: true, disabled: JS.str(it, "conflictId") != nil) { save(true) }
            }
        }
        .onAppear {
            guard !ready else { return }
            ready = true
            subject = JS.str(it, "subject") ?? ""
            object = JS.str(it, "object") ?? ""
            aliases = JS.strings(it, "aliases").joined(separator: ", ")
        }
    }

    private func save(_ approve: Bool) {
        Task { err = await G67Mem.shared.saveEdit(it, subject: subject, object: object, aliases: aliases, approve: approve, store) ?? "" }
    }
}

struct G67MemConflicts: View {
    @MainActor private var m: G67Mem { G67Mem.shared }

    var body: some View {
        if !m.missing && (m.on("conflicts") || !m.conflicts.isEmpty) {
            VStack(alignment: .leading, spacing: 4) {
                PLabel(text: m.conflicts.isEmpty ? "Motstrid" : "Motstrid · \(m.conflicts.count)").padding(.leading, 4).padding(.top, 14)
                G67Card {
                    if m.conflicts.isEmpty { G67Line(title: "", sub: "Ingenting motsier hverandre.") }
                    ForEach(Array(m.conflicts.enumerated()), id: \.offset) { i, c in
                        if i > 0 { G67Sep() }
                        G67ConflictRow(c: c)
                    }
                }
            }
        }
    }
}

struct G67ConflictRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let c: [String: Any]

    var body: some View {
        let id: String = JS.str(c, "id") ?? ""
        let busy: Bool = G67Mem.shared.busy[id] == true
        VStack(alignment: .leading, spacing: 8) {
            Text(JS.str(c, "question") ?? "Hvilken stemmer?").font(PF.ui(15, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            side(JS.dict(c, "a"), "A")
            side(JS.dict(c, "b"), "B")
            VStack(alignment: .leading, spacing: 2) {
                ForEach(G67Mem.choices(c), id: \.0) { (ch: (String, String)) in
                    G67Btn(title: ch.1, primary: ch.0 != "both", disabled: busy) { Task { await G67Mem.shared.resolve(id, ch.0, store) } }
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    @ViewBuilder private func side(_ x: [String: Any]?, _ k: String) -> some View {
        if let x {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(k).font(PF.mono(11)).foregroundStyle(p.lab)
                VStack(alignment: .leading, spacing: 1) {
                    Text(JS.str(x, "label") ?? ((JS.str(x, "subject") ?? "") + " er " + (JS.str(x, "object") ?? ""))).font(PF.ui(14)).foregroundStyle(p.ink)
                    if let s = JS.str(x, "sourceLabel") { Text(s).font(PF.ui(12)).foregroundStyle(p.mut) }
                }
            }
        }
    }
}

struct G67MemStale: View {
    @MainActor private var m: G67Mem { G67Mem.shared }

    var body: some View {
        if !m.missing && m.on("stale") {
            VStack(alignment: .leading, spacing: 4) {
                PLabel(text: m.stale.isEmpty ? "Ikke brukt på lenge" : "Ikke brukt på lenge · \(m.stale.count)").padding(.leading, 4).padding(.top, 14)
                G67Card {
                    if m.stale.isEmpty { G67Line(title: "", sub: "Alt Glimt husker er brukt de siste \(m.staleDays) dagene.") }
                    ForEach(Array(m.stale.enumerated()), id: \.offset) { i, it in
                        if i > 0 { G67Sep() }
                        G67StaleRow(it: it)
                    }
                }
                G67Note(text: "Merket etter " + G67Mem.days(m.staleDays) + " uten bruk. Slettes aldri automatisk – trykk Behold for å fjerne merket.")
            }
        }
    }
}

struct G67StaleRow: View {
    @Environment(Store.self) private var store
    let it: [String: Any]

    var body: some View {
        let id: Int = JS.int(it, "id") ?? 0
        let m: G67Mem = G67Mem.shared
        let busy: Bool = m.busy["s\(id)"] == true
        VStack(alignment: .leading, spacing: 4) {
            G67Line(title: G67Mem.staleTitle(it), sub: G67Mem.staleLine(it), pad: false)
            HStack(spacing: 8) {
                G67Btn(title: "Behold", primary: true, disabled: busy) { Task { await m.keep(id, store) } }
                G67Btn(title: m.arm == "s\(id)" ? "Trykk igjen for å slette" : "Slett", danger: true, disabled: busy) { Task { await m.deleteStale(id, store) } }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }
}

/* ---------- Entitetsregister ---------- */

/// Innstillinger → Glimt → Entitetsregister (prompt 60): ett register for personer, steder, butikker, abonnementer og faste hendelser.
struct G67EntPage: View {
    @Environment(Store.self) private var store
    @MainActor private var m: G67Ent { G67Ent.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if m.missing {
                G67Card { G67Line(title: "", sub: "Serveren har ikke entitetsregisteret ennå. Oppdater serveren.") }
            } else {
                G67Chips(items: chips, selected: m.filter) { (f: String) in m.filter = f }
                if !m.enabled {
                    G67Card { G67Line(title: "Glimt bruker ikke registeret nå", sub: "Slått av under Forstår samtaler på Glimt-siden. Lista og redigering virker fortsatt.") }
                }
                G67EntList()
                G67EntResolve()
                G67Note(text: "Steder fra Familie, abonnementer og værsteder redigeres der de kommer fra – her kan du gi dem egne ord (aliaser). Lagres bare for deg.")
            }
        }
        .task { await m.load(store) }
    }

    private var chips: [(String, String)] {
        [("", "Alle \(m.items.count)")] + G67Ent.types.map { (t: String) -> (String, String) in
            (t, m.label(t) + " \(m.items.filter { JS.str($0, "type") == t }.count)")
        }
    }
}

struct G67EntList: View {
    @MainActor private var m: G67Ent { G67Ent.shared }

    var body: some View {
        G67Card {
            if !m.loaded { G67Line(title: "", sub: "Laster …") }
            if !m.err.isEmpty { G67Line(title: "", sub: "Serveren svarte: " + m.err, bad: true) }
            if m.loaded && m.shown.isEmpty && m.err.isEmpty {
                G67Line(title: "", sub: m.filter.isEmpty ? "Registeret er tomt. Legg til personer og steder, eller skriv «husk at Nina er frisøren min» til Glimt." : "Ingen " + m.label(m.filter).lowercased() + " ennå.")
            }
            ForEach(Array(m.shown.enumerated()), id: \.offset) { i, it in
                if i > 0 { G67Sep() }
                if m.editing == JS.str(it, "id") { G67EntForm(it: it) } else { G67EntRow(it: it) }
            }
            G67Sep()
            if m.editing == "+" { G67EntForm(it: nil) } else { addRow }
            if !m.msg.isEmpty { G67Sep(); G67Line(title: "", sub: m.msg) }
        }
    }

    private var addRow: some View {
        HStack(spacing: 8) {
            G67Line(title: "Legg til", sub: "Person, sted, butikk, abonnement eller fast hendelse – med egne ord for det")
            G67Btn(title: "Legg til") { m.msg = ""; m.editing = "+" }.padding(.trailing, 10)
        }
    }
}

struct G67EntRow: View {
    @Environment(\.paper) private var p
    let it: [String: Any]

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(JS.str(it, "name") ?? "").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                let al: [String] = JS.strings(it, "aliases") + JS.strings(it, "builtin")
                if !al.isEmpty { Text(al.joined(separator: " · ")).font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            G67Btn(title: "Rediger") { G67Ent.shared.msg = ""; G67Ent.shared.editing = JS.str(it, "id") }
                .accessibilityLabel("Rediger " + (JS.str(it, "name") ?? ""))
        }
        .padding(.leading, 14).padding(.trailing, 10).padding(.vertical, 9)
    }

    private var sub: String {
        let t: String = G67Ent.one[JS.str(it, "type") ?? ""] ?? ""
        return [t, JS.str(it, "value") ?? "", JS.str(it, "sourceLabel") ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

struct G67EntForm: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: [String: Any]?
    @State private var type: String = "person"
    @State private var name: String = ""
    @State private var value: String = ""
    @State private var aliases: String = ""
    @State private var ready: Bool = false

    private var derived: Bool { it != nil && JS.bool(JS.dict(it, "editable"), "name") == false }
    private var canDelete: Bool { it != nil && JS.bool(JS.dict(it, "editable"), "delete") != false }
    @MainActor private var m: G67Ent { G67Ent.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if it == nil { typePicker }
            if derived {
                Text((JS.str(it, "name") ?? "") + " · " + (JS.str(it, "sourceLabel") ?? "")).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
            } else {
                G67Field(label: "Navn", placeholder: "Nina, Hytta, Rema Lena …", text: $name)
                G67Field(label: "Betyr", placeholder: "frisør · Lena, Østre Toten (valgfritt)", text: $value)
            }
            G67Field(label: "Aliaser", placeholder: "hytta, landstedet (skill med komma)", text: $aliases)
            if !m.msg.isEmpty { Text(m.msg).font(PF.ui(12.5)).foregroundStyle(p.lab) }
            buttons
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .onAppear(perform: fill)
    }

    private var typePicker: some View {
        Menu {
            ForEach(G67Ent.types, id: \.self) { (t: String) in
                Button(G67Ent.one[t] ?? t) { type = t }
            }
        } label: {
            Text("Type: " + (G67Ent.one[type] ?? type) + " ▾").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).frame(minHeight: 40)
        }
    }

    private var buttons: some View {
        HStack(spacing: 8) {
            if canDelete {
                G67Btn(title: m.arm == JS.str(it, "id") ? "Trykk igjen for å bekrefte" : (derived ? "Fjern egne aliaser" : "Slett"), danger: true, disabled: m.busy) {
                    if let it { Task { await m.delete(it, store) } }
                }
            }
            Spacer(minLength: 0)
            G67Btn(title: "Avbryt") { m.editing = nil; m.msg = "" }
            G67Btn(title: "Lagre", primary: true, disabled: m.busy) {
                Task { _ = await m.save(it, type: type, name: name, value: value, aliases: aliases, store) }
            }
        }
    }

    private func fill() {
        guard !ready else { return }
        ready = true
        guard let it else { return }
        type = JS.str(it, "type") ?? "person"
        name = JS.str(it, "name") ?? ""
        value = JS.str(it, "value") ?? ""
        aliases = JS.strings(it, "aliases").joined(separator: ", ")
    }
}

struct G67EntResolve: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var q: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Hva betyr …?").padding(.leading, 4).padding(.top, 14)
            G67Card {
                HStack(spacing: 8) {
                    TextField("hytta", text: $q)
                        .font(PF.ui(15)).foregroundStyle(p.ink)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit { Task { await G67Ent.shared.resolve(q, store) } }
                        .padding(.horizontal, 12).frame(minHeight: 42)
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
                        .accessibilityLabel("Ord å slå opp")
                    G67Btn(title: "Slå opp") { Task { await G67Ent.shared.resolve(q, store) } }
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
                if !G67Ent.shared.resolved.isEmpty { G67Sep(); G67Line(title: "", sub: G67Ent.shared.resolved) }
            }
        }
    }
}

/// Den klassiske innstillingssiden (SettingsView) viser de samme sidene.
struct G67ClassicPage: View {
    let page: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            switch page {
            case "g67husker": G67HuskerPage()
            case "g67ent": G67EntPage()
            case "g67laerer": G67LearnPage()
            case "g67faste": G67SchedPage()
            default: G67QualityPage()
            }
        }
    }
}
