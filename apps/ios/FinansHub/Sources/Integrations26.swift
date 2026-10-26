import SwiftUI

/* ---------------- Prompt 26: Innstillinger → Integrasjoner som på web ----------------
   Fasit: Mobil Papir App.dc.html → Innstillinger → Integrasjoner (IDEF/INTL/INTD).
   Listen er gruppert (Smarthjem · Transport og pakker · Økonomi · AI · Informasjon · Annet). Hver rad har farget merke,
   navn, kort beskrivelse og status (grønn «Tilkoblet», rød «Mangler …»). Hver integrasjon har egen side
   (paperTab «innst-int:<id>») med toppkort, OPPSETT (felt som redigeres rett under raden), SLIK GJØR DU,
   Test tilkobling og Fjern alle verdier. Kalendere, Trading 212, Bankimport og AI åpner sine egne sider.
   Metadata (category, badge, color, description, statusText, guide) kommer fra GET /api/integrations.
   Eldre server uten metadata: kategori, merke og farge fra tabellen under. */

/// Ett steg i «SLIK GJØR DU».
struct Int26Step: Hashable {
    var title: String
    var text: String
    var code: String = ""

    /// links fra «calendars»: navnene på dem som er koblet til.
    static func connectedLinks(_ list: [[String: Any]]) -> [String] {
        var out: [String] = []
        for l in list {
            let on: Bool = JS.bool(l, "connected") ?? false
            if !on { continue }
            let id: String = JS.str(l, "id") ?? ""
            out.append(id == "ha" ? "HA" : (id == "google" ? "Google" : (JS.str(l, "name") ?? id)))
        }
        return out
    }

    /// guide: ["tekst", …], [[tittel, tekst], …] eller [{title, text}, …].
    static func parse(_ any: Any?) -> [Int26Step] {
        guard let list = any as? [Any] else { return [] }
        var out: [Int26Step] = []
        for x in list {
            if let s = x as? String {
                out.append(Int26Step(title: s, text: ""))
            } else if let a = x as? [Any] {
                let t: String = (a.first as? String) ?? ""
                let d: String = a.count > 1 ? ((a[1] as? String) ?? "") : ""
                if !t.isEmpty || !d.isEmpty { out.append(Int26Step(title: t, text: d)) }
            } else if let o = x as? [String: Any] {
                let t: String = JS.str(o, "title") ?? JS.str(o, "t") ?? JS.str(o, "step") ?? ""
                let d: String = JS.str(o, "text") ?? JS.str(o, "body") ?? JS.str(o, "d") ?? ""
                let c: String = JS.str(o, "code") ?? ""
                if !t.isEmpty || !d.isEmpty { out.append(Int26Step(title: t, text: d, code: c)) }
            }
        }
        return out
    }
}

/// Kategori, merke, farge og beskrivelse når serveren ikke sender dem.
struct Int26Meta {
    let category: String
    let badge: String
    let color: String
    let desc: String

    // Prompt 43: MEDIA-gruppen (Integrations43.swift) rett etter Smarthjem.
    static let categories: [String] = ["Smarthjem", "Media", "Transport og pakker", "Økonomi", "AI", "Informasjon", "Annet"]

    static func fallback(_ id: String) -> Int26Meta {
        if let m = Int43Media.meta(id) { return m }
        switch id {
        case "ha": return Int26Meta(category: "Smarthjem", badge: "HA", color: "#18bcf2", desc: "Lokal server og to-do-lister")
        case "calendars", "calendar": return Int26Meta(category: "Informasjon", badge: "31", color: "#4285F4", desc: "Skole-iCal, Canvas, Google og Home Assistant")
        case "google": return Int26Meta(category: "Informasjon", badge: "31", color: "#4285F4", desc: "Google Kalender for Bursdager og Kalender")
        case "entur": return Int26Meta(category: "Transport og pakker", badge: "R", color: "#d0605a", desc: "Sanntid for avganger")
        case "mybring": return Int26Meta(category: "Transport og pakker", badge: "B", color: "#7BC144", desc: "Sporing hos Posten og Bring")
        case "postnord": return Int26Meta(category: "Transport og pakker", badge: "PN", color: "#00A0D6", desc: "Sporing uten konto og uten nøkkel")
        case "parcelsapp": return Int26Meta(category: "Transport og pakker", badge: "PA", color: "#4B5BD6", desc: "Reserve for alle transportører")
        case "t212": return Int26Meta(category: "Økonomi", badge: "T", color: "#13a37f", desc: "Aksjer og kontoer")
        case "bank": return Int26Meta(category: "Økonomi", badge: "BK", color: "#2b5d8a", desc: "Banker og filimport")
        case "imap": return Int26Meta(category: "Økonomi", badge: "@", color: "#6d4aff", desc: "IMAP eller Proton Mail Bridge")
        case "finn": return Int26Meta(category: "Økonomi", badge: "F", color: "#0063FB", desc: "Varsler og handler")
        case "ai": return Int26Meta(category: "AI", badge: "G", color: "#4b6cf0", desc: "AI-tolkning av kvitteringer og søk")
        case "cloudflare": return Int26Meta(category: "Informasjon", badge: "CF", color: "#F38020", desc: "Domener, trafikk og oppetid")
        case "met": return Int26Meta(category: "Informasjon", badge: "Yr", color: "#1f8fd6", desc: "Værvarsel")
        case "map": return Int26Meta(category: "Informasjon", badge: "◎", color: "#3f7a6e", desc: "Kartverket og Apple Maps")
        case "icons": return Int26Meta(category: "Annet", badge: "✦", color: "#5b6478", desc: "Iconify via Homelab-cache")
        case "photos": return Int26Meta(category: "Annet", badge: "▣", color: "#5b6478", desc: "Bakgrunner fra Unsplash og Pexels")
        case "plex": return Int26Meta(category: "Annet", badge: "PX", color: "#c88a0a", desc: "Mediebibliotek")
        case "jellyfin": return Int26Meta(category: "Annet", badge: "JF", color: "#8e5bd8", desc: "Mediebibliotek")
        case "sonarr": return Int26Meta(category: "Annet", badge: "SN", color: "#2a9fd0", desc: "Serier")
        case "radarr": return Int26Meta(category: "Annet", badge: "RD", color: "#c9a227", desc: "Filmer")
        default: return Int26Meta(category: "Annet", badge: "", color: "#5b6478", desc: "")
        }
    }
}

extension Int24Item {
    var meta26: Int26Meta { Int26Meta.fallback(id) }

    var category26: String {
        let c: String = category.trimmingCharacters(in: .whitespaces)
        if let hit = Int26Meta.categories.first(where: { $0.lowercased() == c.lowercased() }) { return hit }
        return meta26.category
    }

    var badge26: String {
        if !badge.isEmpty { return badge }
        if !meta26.badge.isEmpty { return meta26.badge }
        return String(name.prefix(2)).uppercased()
    }

    var color26: String { color.isEmpty ? meta26.color : color }

    var desc26: String {
        if !desc.isEmpty { return desc }
        if !meta26.desc.isEmpty { return meta26.desc }
        return group
    }

    /// Siden en lenke-integrasjon åpner (Kalendere, Trading 212, Bankimport, AI). Tom = egen integrasjonsside.
    var link26: String {
        let l: String = link.lowercased()
        if l == "kal" || l == "calendars" || l == "kalendere" { return "innst-kal" }
        if l == "aksjer" || l == "t212" { return "innst-aksjer" }
        if l == "bank" || l == "imports" { return "imports" }
        if l == "ai" || l == "gm" || l == "gemini" { return "innst-ai" }
        if id == "calendars" { return "innst-kal" }
        return ""
    }

    /// Mangler et påkrevd felt?
    var missingLabel26: String? {
        if let f = fields.first(where: { !$0.isSet }) { return f.label }
        return nil
    }

    var ok26: Bool { status == "ok" }

    var statusLine26: String {
        if !statusText.isEmpty { return statusText }
        if status == "ok" { return "Tilkoblet" }
        if status == "error" { return "Feil" }
        if let m = missingLabel26 { return "Mangler " + m.lowercased() }
        return "Ikke koblet"
    }
}

@MainActor
extension Int24Model {
    /// Åpner siden for integrasjonen (eller lenken). false = ukjent id.
    func open26(_ key: String, _ store: Store) -> Bool {
        let k: String = key.lowercased()
        guard let it = items.first(where: { $0.id.lowercased() == k || $0.name.lowercased() == k }) else { return false }
        Int26Nav.go(it, store)
        return true
    }

    /// «Fjern alle verdier»: DELETE for hvert felt som er satt.
    func clearAll26(_ it: Int24Item, _ store: Store) {
        let keys: [String] = it.fields.filter { $0.isSet }.map(\.key)
        if keys.isEmpty { store.flash(it.name + " har ingen lagrede verdier"); return }
        Task { @MainActor in
            var failed: Int = 0
            for k in keys {
                let path: String = "/integrations/" + Int24Model.enc(it.id) + "/" + Int24Model.enc(k)
                do { _ = try await store.api.callAt("/api", "DELETE", path) } catch { failed += 1 }
            }
            editing = nil
            store.flash(failed == 0 ? it.name + " er nullstilt" : "Kunne ikke fjerne \(failed) av \(keys.count) verdier")
            await load(store)
        }
    }
}

/// Navigasjon til integrasjonssidene og Kalendere.
@MainActor
enum Int26Nav {
    /// Hvor Kalendere ble åpnet fra (tilbake går dit). nil = Innstillinger.
    static var kalFrom: String? = nil

    static func go(_ it: Int24Item, _ store: Store) {
        let l: String = it.link26
        if l == "innst-kal" { openKal(from: "innst-integ", store); return }
        if l == "imports" { store.paperOpen(.imports); return }
        if !l.isEmpty { store.paperGo(l); return }
        Int24Model.shared.editing = nil
        store.paperGo("innst-int:" + it.id)
    }

    static func openKal(from: String?, _ store: Store) {
        kalFrom = from
        store.paperGo("innst-kal")
    }
}

extension Store {
    /// Prompt 26: tilbake fra en integrasjonsside går til Integrasjoner, og Kalendere dit den ble åpnet fra.
    func nav26BackTarget() -> String? {
        if paperTab.hasPrefix("innst-int:") { return "innst-integ" }
        if paperTab == "innst-kal", let f = Int26Nav.kalFrom { return f }
        // Prompt 67: undersidene til Glimt (Glimt husker, Entitetsregister, Glimt lærer, Faste oppgaver, Kvalitet) går til Glimt.
        if paperTab.hasPrefix("innst-glimt:") { return "innst-glimt" }
        // Prompt 67: Finans-sidene ligger under Moduler → Finans (som på web) og går tilbake dit.
        if ["innst-kat", "innst-regler", "innst-aksjer", "innst-fin"].contains(paperTab) { return "innst-finans67" }
        return nil
    }

    var nav26UpLabel: String? {
        guard let t = nav26BackTarget() else { return nil }
        if t == "innst-integ" { return "Integrasjoner" }
        if t == "innst-glimt" { return "Glimt" }
        if t == "innst-finans67" { return "Finans" }
        if t == "bursdag" { return "Bursdager" }
        if t == "kalender" { return "Kalender" }
        return nil
    }
}

extension PaperSettingsSub {
    /// Tittel og undertittel for undersidene fra prompt 26 (resten fra titles).
    @MainActor static func title26(_ key: String) -> (String, String)? {
        if key == "kal" { return ("Kalendere", "Google Kalender · Home Assistant · Skole-iCal") }
        if let t = G67Nav.title(key) { return t } // prompt 67
        if key.hasPrefix("int:") {
            let id: String = String(key.dropFirst(4))
            if let it = Int24Model.shared.items.first(where: { $0.id == id }) { return (it.name, it.category26) }
            return ("Integrasjon", "Oppsett og test")
        }
        return titles[key]
    }
}

/* ---------- Listen ---------- */

struct Int26List: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Int24Model { Int24Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(groups, id: \.0) { g in
                PLabel(text: g.0).padding(.leading, 4).padding(.top, 12)
                Int26Card(rows: g.1)
            }
            // Prompt 37: sporingsnøklene er delt i husstanden (maskert, bare admin endrer), TrackKeys37.swift.
            TrackKeys37Card()
        }
    }

    private var groups: [(String, [Int24Item])] {
        var out: [(String, [Int24Item])] = []
        for c in Int26Meta.categories {
            let rows: [Int24Item] = m.items.filter { !$0.hidden && $0.category26 == c }
            if !rows.isEmpty { out.append((c, rows)) }
        }
        return out
    }
}

/// Ett kort med rader i en kategori.
struct Int26Card: View {
    @Environment(\.paper) private var p
    let rows: [Int24Item]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, it in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1).padding(.leading, 62) }
                Int26Row(item: it).set25Highlight(it.name, id: false)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Merket: farget rute med kort tekst (HA, 31, R, B …).
struct Int26Badge: View {
    let text: String
    let color: String
    var size: CGFloat = 36

    var body: some View {
        Text(text).font(PF.ui(text.count > 2 ? 11 : 13, .bold)).foregroundStyle(Color.white)
            .lineLimit(1).minimumScaleFactor(0.6)
            .frame(width: size, height: size)
            .background(Color(hex: color), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct Int26Row: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let item: Int24Item

    var body: some View {
        Button { Haptics.shared.select(); Int26Nav.go(item, store) } label: {
            HStack(spacing: 12) {
                // Prompt 32: tjenestens ekte logo (Settings32.swift), bokstavmerket bare mens den lastes eller hvis den feiler.
                IntLogoView32b(item: item, size: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(item.desc26).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(statusText).font(PF.ui(12.5, .semibold)).foregroundStyle(statusColor).lineLimit(1)
                    .frame(maxWidth: 130, alignment: .trailing)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var isKal: Bool { item.link26 == "innst-kal" }

    /// Kalendere: «Tilkoblet» når iCal er satt, ellers «Google + HA» når de er koblet til (som i designet).
    private var kalOn: Bool { isKal && !item.ok26 && (!item.kalLinks.isEmpty || Int26KalStatus.ok()) }

    private var statusText: String {
        if kalOn { return item.kalLinks.isEmpty ? Int26KalStatus.text() : item.kalLinks.joined(separator: " + ") }
        return item.statusLine26
    }

    private var statusColor: Color {
        if kalOn { return p.pos }
        return item.ok26 ? p.pos : p.lab
    }
}

/// Status for Kalendere i listen: «Google + HA», «Google», «HA» eller «Ikke koblet».
@MainActor
enum Int26KalStatus {
    static func text() -> String {
        let m: BirthdayModel24 = BirthdayModel24.shared
        let g: Bool = m.gConnected
        let h: Bool = !m.haEntity.isEmpty
        if g && h { return "Google + HA" }
        if g { return "Google" }
        if h { return "HA" }
        return "Ikke koblet"
    }

    static func ok() -> Bool {
        let m: BirthdayModel24 = BirthdayModel24.shared
        return m.gConnected || !m.haEntity.isEmpty
    }
}

/* ---------- Siden for én integrasjon ---------- */

struct Int26Detail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let id: String
    @MainActor private var m: Int24Model { Int24Model.shared }
    @State private var armClear: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let it = m.items.first(where: { $0.id == id }) {
                content(it)
            } else if !m.loaded {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Henter integrasjonen …").font(PF.ui(13.5)).foregroundStyle(p.mut)
                }
                .padding(14)
            } else {
                Text("Fant ikke integrasjonen.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(14)
            }
        }
        .task { if !m.loaded || m.items.isEmpty { await m.load(store) } }
    }

    @ViewBuilder private func content(_ it: Int24Item) -> some View {
        Int26Head(item: it)
        // Prompt 41: PostNord uten konto og uten nøkkel (Track41PostNord.swift).
        if it.id == "postnord" { Track41PostNordCard().padding(.top, 10) }
        if !it.fields.isEmpty {
            PLabel(text: "Oppsett").padding(.leading, 4).padding(.top, 14)
            Int26Fields(item: it)
        }
        if it.id == "ha" {
            PLabel(text: "Synk med Home Assistant").padding(.leading, 4).padding(.top, 14)
            TaskHASection22()
        }
        // Prompt 43: Media-tjenestene har steg-for-steg-oppsett også når serveren ikke sender dem (Integrations43.swift).
        let guide43: [Int26Step] = it.guide.isEmpty ? Int43Media.steps(it.id) : it.guide
        if !guide43.isEmpty {
            PLabel(text: Int43Media.ids.contains(it.id) ? "Slik setter du det opp" : "Slik gjør du").padding(.leading, 4).padding(.top, 14)
            Int26Guide(steps: guide43)
        }
        actions(it).padding(.top, 14)
    }

    private func actions(_ it: Int24Item) -> some View {
        VStack(spacing: 0) {
            if it.canTest {
                actionRow(m.testing == it.id ? "Tester …" : "Test tilkobling") { m.test(it, store) }
                    .disabled(m.testing != nil)
                Rectangle().fill(p.line).frame(height: 1)
            }
            actionRow(armClear ? "Trykk igjen for å fjerne alle verdier" : "Fjern alle verdier") {
                if armClear {
                    armClear = false
                    m.clearAll26(it, store)
                } else {
                    Haptics.shared.tick()
                    armClear = true
                }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func actionRow(_ title: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack {
                Text(title).font(PF.ui(15, .semibold)).foregroundStyle(p.lab)
                Spacer()
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Toppkortet: merke, navn, beskrivelse og status.
struct Int26Head: View {
    @Environment(\.paper) private var p
    let item: Int24Item

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                IntLogoView32b(item: item, size: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.name).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).lineLimit(2)
                    Text(item.desc26).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(item.statusLine26).font(PF.ui(13, .semibold)).foregroundStyle(item.ok26 ? p.pos : p.lab).lineLimit(1).fixedSize()
            }
            if item.status == "error" && !item.message.isEmpty {
                Text(item.message).font(PF.ui(12.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 4)
    }
}

/// OPPSETT: feltene, som redigeres rett under raden (hemmeligheter vises som «•••• lagret»).
struct Int26Fields: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let item: Int24Item
    @MainActor private var m: Int24Model { Int24Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(item.fields.enumerated()), id: \.element.id) { i, f in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                fieldRow(f)
                if m.editing == item.id + "|" + f.key { editor(f) }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func fieldRow(_ f: Int24Field) -> some View {
        Button { m.edit(item, f) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(f.label).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    if !f.help.isEmpty { Text(f.help).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(f.shown).font(PF.ui(13, .semibold)).foregroundStyle(f.isSet ? p.ink : p.lab).lineLimit(1).truncationMode(.middle)
                    .frame(maxWidth: 170, alignment: .trailing)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var draft: Binding<String> {
        Binding<String>(get: { m.draft }, set: { (v: String) in m.draft = v })
    }

    @ViewBuilder private func input(_ f: Int24Field) -> some View {
        if f.secret {
            SecureField("Lim inn ny verdi", text: draft)
        } else {
            TextField(f.type == "url" ? "https://" : "", text: draft)
                .keyboardType(f.type == "url" ? .URL : .default)
        }
    }

    private func editor(_ f: Int24Field) -> some View {
        VStack(spacing: 10) {
            input(f)
                .font(PF.mono(14.5, bold: false)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 14).frame(height: 46)
                .background(RoundedRectangle(cornerRadius: 14).fill(p.bg))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, lineWidth: 1))
            HStack(spacing: 8) {
                Bol24Button(title: "Avbryt", fg: p.ink, bg: Color.clear, border: p.line, height: 44) { m.editing = nil }
                Bol24Button(title: m.saving ? "Lagrer …" : "Lagre", fg: p.bg, bg: p.ink, border: nil, height: 44) { m.save(item, f, store) }
            }
            if f.isSet {
                Button { m.clear(item, f, store) } label: {
                    Text("Fjern verdi").font(PF.ui(13, .bold)).foregroundStyle(p.lab).frame(maxWidth: .infinity).frame(height: 36)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 16)
    }
}

/// SLIK GJØR DU: nummererte steg.
struct Int26Guide: View {
    @Environment(\.paper) private var p
    let steps: [Int26Step]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { i, st in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                stepRow(i, st)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func stepRow(_ i: Int, _ st: Int26Step) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(i + 1)").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                .frame(width: 28, height: 28)
                .background(p.ink, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                if !st.title.isEmpty {
                    Text(st.title).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                }
                if !st.text.isEmpty {
                    Text(st.text).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                if !st.code.isEmpty {
                    // Prompt 43: mørk kodeblokk som kopieres med ett trykk.
                    Int43Code(code: st.code).padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }
}

/* ---------- Innstillinger → Kalendere ---------- */

/// Google Kalender og Home Assistant (flyttet hit fra Bursdager), og Skole-iCal og Canvas fra integrasjonen «calendars».
struct PaperCalendars26: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Int24Model { Int24Model.shared }
    @MainActor private var bd: BirthdayModel24 { BirthdayModel24.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            BirthdayCalendars24()
            school
        }
        .task {
            if !m.loaded || m.items.isEmpty { await m.load(store) }
            await bd.load(store)
            await bd.loadGoogleCalendars(store)
            await bd.loadHaCalendars(store)
        }
        // Tilbake har allerede lest kalFrom; neste gang (f.eks. fra Kalender-siden) gjelder vanlig tilbake.
        .onDisappear { Int26Nav.kalFrom = nil }
    }

    /// Integrasjonen med Skole-iCal og Canvas-iCal (eldre server: «calendar» med bare skolekalenderen).
    private var calItem: Int24Item? {
        if let it = m.items.first(where: { $0.id == "calendars" }) { return it }
        return m.items.first(where: { $0.id == "calendar" })
    }

    @ViewBuilder private var school: some View {
        PLabel(text: "Skole og Canvas").padding(.leading, 4).padding(.top, 14)
        if let it = calItem {
            Int26Fields(item: it)
            if it.canTest {
                Button { m.test(it, store) } label: {
                    HStack {
                        Text(m.testing == it.id ? "Tester …" : "Test kalenderne").font(PF.ui(15, .semibold)).foregroundStyle(p.lab)
                        Spacer()
                    }
                    .padding(.horizontal, 14).frame(minHeight: 52)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(m.testing != nil)
                .padding(.top, 8)
            }
            Text("Lim inn iCal-adressen fra skolens timeplan og eventuelt Canvas (Kalender → Kalenderstrøm). Begge gjelder bare deg.")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4).padding(.top, 6)
        } else if m.loaded {
            Text("Skole-iCal og Canvas legges inn her når homelab er oppdatert.")
                .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else {
            HStack(spacing: 10) {
                ProgressView()
                Text("Henter …").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            .padding(14)
        }
    }
}

/// Bursdager: lenkeraden «Kalendere · Google … · HA … · Innstillinger ›» (kalenderoppsettet ligger i Innstillinger).
struct BirthdayCalLink26: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: BirthdayModel24 { BirthdayModel24.shared }

    var body: some View {
        Button {
            Haptics.shared.tap()
            Int26Nav.openKal(from: "bursdag", store)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Kalendere").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("Innstillinger ›").font(PF.ui(13, .semibold)).foregroundStyle(p.mut).fixedSize()
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var sub: String {
        let g: String = m.gConnected ? "Google: " + (m.gEmail.isEmpty ? "tilkoblet" : m.gEmail) : "Google ikke koblet"
        let h: String = m.haEntity.isEmpty ? "Home Assistant ikke importert" : "HA: " + m.haEntity
        return g + " · " + h
    }
}
