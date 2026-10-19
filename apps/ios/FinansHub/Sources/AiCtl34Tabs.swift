import SwiftUI
import UIKit

/* ---------------- Prompt 34: AI-kontroll (mobil) – Modeller og Valg (ruting) ----------------
   Fasit: design/AI Kontroll.dc.html → isMod (Installert lokalt, Laster ned, Last ned fra Ollama med filtre og PASSER / DELVIS CPU /
   FOR STOR, Sky-modeller av/på) og isRt (modell + reserve per oppgave, regler, parametre). Ugyldig rute viser «Modellen finnes
   ikke · bytt» fra serveren. Finans har «Minste sikkerhet før Sjekk» og samtidige kvitteringer. */

/* ---------- Modeller ---------- */

struct AiCtl34ModelsTab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let disk: Double = m.installed.reduce(0) { (a: Double, x: AiModel34) -> Double in a + x.gb }
        VStack(alignment: .leading, spacing: 14) {
            AiCard34(title: "INSTALLERT LOKALT · " + String(m.installed.count), trailing: AiCtl34.gb(disk) + " på disk") {
                if m.installed.isEmpty {
                    Text("Ingen lokale modeller funnet på Ollama-serveren.").font(PF.ui(13)).foregroundStyle(p.mut).padding(.vertical, 12)
                }
                ForEach(Array(m.installed.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiModel34)) in
                    AiModelRow34(md: pair.element, first: pair.offset == 0)
                }
            }
            if !m.pulls.isEmpty {
                AiCard34(title: "LASTER NED") {
                    ForEach(Array(m.pulls.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiPull34)) in
                        AiPullRow34(pl: pair.element, first: pair.offset == 0)
                    }
                }
            }
            AiLibrary34()
            AiCloudList34()
        }
    }
}

struct AiModelRow34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let md: AiModel34
    let first: Bool
    @State private var confirm: Bool = false

    var body: some View {
        let admin: Bool = Update28Model.isAdmin(store)
        let isDef: Bool = md.id == m.defaultChat || m.routes.first(where: { $0.id == "chat" })?.model == md.id
        VStack(alignment: .leading, spacing: 0) {
            if !first { AiLine34() }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Circle().fill(md.loaded ? p.pos : p.line).frame(width: 8, height: 8)
                    Text(md.id).font(PF.mono(13.5)).foregroundStyle(p.ink).lineLimit(1)
                    if isDef {
                        Text("STANDARD").font(PF.mono(9)).foregroundStyle(p.pos)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(p.pos.opacity(0.14), in: Capsule())
                    }
                    Spacer(minLength: 0)
                }
                Text(tags).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
                Text(state).font(PF.ui(12)).foregroundStyle(md.loaded ? p.pos : p.mut)
                if admin { actions(isDef) }
            }
            .padding(.vertical, 12)
        }
        .confirmationDialog(confirmTitle, isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { m.delete(md, store) }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private func actions(_ isDef: Bool) -> some View {
        HStack(spacing: 6) {
            AiMini34(title: md.loaded ? "Last ut" : "Last inn") { m.toggleLoad(md, store) }
            if !isDef && md.kind != "embedding" && md.kind != "bilde" {
                AiMini34(title: "Bruk som standard") { m.makeDefault(md, store) }
            }
            AiMini34(title: "Slett", color: p.lab) { confirm = true }
        }
        .padding(.top, 2)
    }

    private var confirmTitle: String {
        let size: String = AiCtl34.gb(md.gb)
        return "Slette " + md.id + " (" + size + ")?"
    }

    private var tags: String {
        var t: [String] = []
        if !md.desc.isEmpty { t.append(md.desc) }
        if md.gb > 0 { t.append(AiCtl34.gb(md.gb)) }
        if !md.quant.isEmpty { t.append(md.quant) }
        if !md.ctx.isEmpty { t.append(md.ctx + " kontekst") }
        t.append(md.kind)
        return t.joined(separator: " · ")
    }

    private var state: String {
        if md.loaded { return "Lastet i VRAM · holdes " + AiModelRow34.keepText(m.keep) + " etter bruk" }
        return md.last.isEmpty ? "Ikke lastet" : "Ikke lastet · sist brukt " + md.last
    }

    static func keepText(_ k: String) -> String {
        if k == "alltid" { return "alltid" }
        if k == "aldri" { return "ikke" }
        return "i " + k.replacingOccurrences(of: "m", with: " min")
    }
}

struct AiPullRow34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let pl: AiPull34
    let first: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !first { AiLine34() }
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(pl.id).font(PF.mono(13)).foregroundStyle(p.ink).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(String(Int(pl.pct)) + " %").font(PF.mono(12)).foregroundStyle(p.ink)
                    AiMini34(title: "Avbryt", color: p.lab) { m.cancelPull(pl.id, store) }
                }
                AiStriped34(frac: pl.pct / 100)
                Text(sub).font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .padding(.vertical, 12)
        }
    }

    private var sub: String {
        var s: String = pl.totGb > 0 ? AiCtl34.gb(pl.gotGb) + " av " + AiCtl34.gb(pl.totGb) : "Starter …"
        if pl.mbs > 0 { s += " · " + String(Int(pl.mbs)) + " MB/s" }
        return s + " · kjører i bakgrunnen"
    }
}

/// Stripet fremdriftsstolpe for nedlastinger.
struct AiStriped34: View {
    @Environment(\.paper) private var p
    let frac: Double

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Capsule().fill(AiPal34.fld(p))
                Capsule()
                    .fill(LinearGradient(colors: [p.lab, p.lab.opacity(0.7)], startPoint: .leading, endPoint: .trailing))
                    .frame(width: g.size.width * CGFloat(Swift.max(0.03, Swift.min(1, frac))))
            }
        }
        .frame(height: 8)
        .animation(.linear(duration: 0.5), value: frac)
    }
}

struct AiLibrary34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    private var query: Binding<String> {
        Binding<String>(get: { m.libQuery }, set: { (v: String) in m.libQuery = v })
    }

    var body: some View {
        let rows: [AiLib34] = m.libraryRows()
        let admin: Bool = Update28Model.isAdmin(store)
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "LAST NED FRA OLLAMA").padding(.horizontal, 4)
            HStack(spacing: 8) {
                TextField("", text: query, prompt: Text("Søk eller skriv et modellnavn").foregroundColor(p.mut))
                    .font(PF.ui(15)).foregroundStyle(p.ink)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit { submit(admin) }
                    .padding(.horizontal, 14).frame(height: 44)
                    .background(p.card, in: Capsule())
                if admin && canPull {
                    AiMini34(title: "Last ned", filled: true) { m.pullModel(m.libQuery, store) }
                }
            }
            AiLibCats34()
            AiCard34 {
                if rows.isEmpty {
                    Text("Ingen treff. Skriv hele navnet (f.eks. qwen3:8b) og trykk Last ned.").font(PF.ui(13)).foregroundStyle(p.mut).padding(.vertical, 12)
                }
                ForEach(Array(rows.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiLib34)) in
                    AiLibRow34(l: pair.element, first: pair.offset == 0, admin: admin)
                }
            }
            if !admin {
                Text("Bare administrator kan laste ned og slette modeller.").font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 4)
            }
        }
        .task(id: m.libQuery) {
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            await m.searchLibrary(store)
        }
    }

    private var canPull: Bool {
        let q: String = m.libQuery.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty || m.installed.contains(where: { $0.id == q }) { return false }
        return q.range(of: "^[a-z0-9._/-]+(:[a-z0-9._-]+)?$", options: .regularExpression) != nil
    }

    private func submit(_ admin: Bool) {
        guard admin else { return }
        let rows: [AiLib34] = m.libraryRows()
        if rows.count == 1 { m.pullModel(rows[0].id, store); return }
        if canPull { m.pullModel(m.libQuery, store) }
    }
}

struct AiLibCats34: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    static let cats: [(String, String)] = [("alle", "Alle"), ("tekst", "Tekst"), ("bilde", "Bilde"), ("resonnering", "Resonnering"), ("embedding", "Embeddings")]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(AiLibCats34.cats, id: \.0) { (c: (String, String)) in
                    let on: Bool = m.libCat == c.0
                    Button { Haptic34.light(); m.libCat = c.0 } label: {
                        Text(c.1).font(PF.ui(12.5, .bold)).foregroundStyle(on ? p.bg : p.ink)
                            .padding(.horizontal, 12).frame(height: 30)
                            .background(on ? p.ink : Color.clear, in: Capsule())
                            .overlay(Capsule().strokeBorder(on ? p.ink : p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct AiLibRow34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let l: AiLib34
    let first: Bool
    let admin: Bool

    var body: some View {
        let has: Bool = m.installed.contains(where: { $0.id == l.id })
        let pulling: Bool = m.pulls.contains(where: { $0.id == l.id })
        let fit: String = m.fit(l.gb)
        VStack(spacing: 0) {
            if !first { AiLine34() }
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(l.id).font(PF.mono(13)).foregroundStyle(p.ink).lineLimit(1)
                        AiFit34(fit: fit)
                    }
                    Text(l.line).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if admin {
                    AiMini34(title: has ? "Installert" : pulling ? "Laster …" : "Last ned") { m.pullModel(l.id, store) }
                        .disabled(has || pulling)
                        .opacity(has || pulling ? 0.5 : 1)
                }
            }
            .padding(.vertical, 11)
        }
    }
}

struct AiFit34: View {
    @Environment(\.paper) private var p
    let fit: String

    var body: some View {
        Text(fit).font(PF.mono(9)).foregroundStyle(color)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.16), in: Capsule())
    }

    private var color: Color {
        if fit == "PASSER" { return p.pos }
        if fit == "FOR STOR" { return p.lab }
        return AiPal34.warn
    }
}

struct AiCloudList34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        if !m.cloud.isEmpty {
            AiCard34(title: "SKY-MODELLER") {
                ForEach(Array(m.cloud.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiCloud34)) in
                    AiToggleRow34(name: pair.element.id, sub: pair.element.desc, on: pair.element.on, first: pair.offset == 0) {
                        m.toggleCloud(pair.element, store)
                    }
                }
            }
        }
    }
}

/* ---------- Valg (ruting) ---------- */

struct AiCtl34RoutingTab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let list: [AiRoute34] = m.routes.filter { !m.fin || $0.fin }
        VStack(alignment: .leading, spacing: 14) {
            AiCard34(title: m.fin ? "HVILKEN MODELL GJØR HVA I FINANS" : "HVILKEN MODELL GJØR HVA") {
                ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiRoute34)) in
                    AiRouteRow34(r: pair.element, first: pair.offset == 0)
                }
            }
            AiRules34()
            AiParams34()
        }
    }
}

struct AiRouteRow34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let r: AiRoute34
    let first: Bool

    var body: some View {
        let cloudUsed: Bool = m.isCloud(r.model) || m.isCloud(r.fallback)
        let finWarn: Bool = r.fin && (m.rules["finLocal"] ?? false) && cloudUsed
        VStack(alignment: .leading, spacing: 0) {
            if !first { AiLine34() }
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(r.name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text(r.sub).font(PF.ui(12)).foregroundStyle(p.mut)
                }
                HStack(spacing: 8) {
                    AiPicker34(label: "MODELL", value: r.model, none: false) { (v: String) in m.setRoute(r.id, model: v, fallback: nil, store) }
                    AiPicker34(label: "RESERVE", value: r.fallback, none: true) { (v: String) in m.setRoute(r.id, model: nil, fallback: v, store) }
                }
                if !r.warning.isEmpty {
                    Text("! " + r.warning).font(PF.ui(12, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                }
                if finWarn {
                    Text("Finansdata skal holdes lokalt, men denne bruker en sky-modell. Bytt til en lokal modell.")
                        .font(PF.ui(12, .semibold)).foregroundStyle(AiPal34.warn).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 12)
        }
    }
}

/// Nedtrekksliste med lokale og sky-modeller. Ukjent modell vises som «… · ikke tilgjengelig».
struct AiPicker34: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let label: String
    let value: String
    let none: Bool
    let pick: (String) -> Void

    var body: some View {
        let known: Bool = value.isEmpty || m.choices.contains(where: { $0.0 == value })
        Menu {
            if none { Button("Ingen") { pick("") } }
            ForEach(m.choices, id: \.0) { (c: (String, String)) in
                Button(c.1) { pick(c.0) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(PF.mono(9)).foregroundStyle(p.mut)
                HStack(spacing: 4) {
                    Text(title(known)).font(PF.ui(12.5, .bold)).foregroundStyle(known ? p.ink : p.lab).lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(p.mut)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AiPal34.fld(p), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func title(_ known: Bool) -> String {
        if value.isEmpty { return none ? "Ingen" : "Velg modell" }
        return known ? value : value + " · ikke tilgjengelig"
    }
}

struct AiRules34: View {
    @Environment(Store.self) private var store
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    private var rows: [(String, String, String)] {
        if m.fin {
            return [("finLocal", "Finansdata forlater aldri huset", "Kvitteringer og transaksjoner bare til lokale modeller"),
                    ("autoCat", "Auto-kategorisering", "Regler først, så AI-forslag"),
                    ("localFirst", "Lokalt først", "Prøv hjemmeserveren før skyen")]
        }
        return [("localFirst", "Lokalt først", "Prøv hjemmeserveren før skyen, bytt bare ved feil eller timeout"),
                ("finLocal", "Finansdata forlater aldri huset", "Gjelder kvitteringer, transaksjoner og Finans · spør"),
                ("think", "Vis tenking", "Vis stegene mens modellen jobber")]
    }

    var body: some View {
        AiCard34(title: "REGLER") {
            ForEach(Array(rows.enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, String, String))) in
                AiToggleRow34(name: pair.element.1, sub: pair.element.2, on: m.rules[pair.element.0] ?? false, first: pair.offset == 0) {
                    m.setRule(pair.element.0, store)
                }
            }
        }
    }
}

struct AiParams34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        AiCard34(title: "PARAMETRE") {
            if m.fin {
                AiParamRow34(name: "Minste sikkerhet før «Sjekk»", sub: "Lavere enn dette havner i Til godkjenning", first: true,
                             opts: [("70", "70 %"), ("80", "80 %"), ("85", "85 %"), ("90", "90 %"), ("95", "95 %")], value: String(m.minConf)) { (v: String) in
                    m.setParam("minConf", Int(v) ?? 85, store)
                }
                AiParamRow34(name: "Samtidige kvitteringer", sub: "Flere samtidig krever mer VRAM", first: false,
                             opts: [("1", "1"), ("2", "2"), ("3", "3"), ("4", "4")], value: String(m.parallel)) { (v: String) in
                    m.setParam("parallel", Int(v) ?? 2, store)
                }
            } else {
                AiParamRow34(name: "Hold modell lastet", sub: "Hvor lenge modellen blir i VRAM etter bruk (keep_alive)", first: true,
                             opts: [("5m", "5 min"), ("30m", "30 min"), ("alltid", "Alltid"), ("aldri", "Aldri")], value: m.keep) { (v: String) in
                    m.setParam("keepAlive", AiCtl34.keepValue(v), store)
                }
                AiParamRow34(name: "Kontekst", sub: "Standard kontekstlengde (num_ctx)", first: false,
                             opts: [("8192", "8k"), ("32768", "32k"), ("131072", "128k")], value: String(m.ctx)) { (v: String) in
                    m.setParam("numCtx", Int(v) ?? 8192, store)
                }
                AiParamRow34(name: "Temperatur", sub: "Lav = presis, høy = kreativ", first: false,
                             opts: [("0.2", "0,2"), ("0.7", "0,7"), ("1.0", "1,0")], value: String(format: "%.1f", m.temp)) { (v: String) in
                    m.setParam("temperature", Double(v) ?? 0.7, store)
                }
                AiParamRow34(name: "Samtidige jobber", sub: "Maks jobber som kjører på serveren samtidig", first: false,
                             opts: [("1", "1"), ("2", "2"), ("3", "3"), ("4", "4")], value: String(m.parallel)) { (v: String) in
                    m.setParam("parallel", Int(v) ?? 2, store)
                }
            }
        }
    }
}

struct AiParamRow34: View {
    @Environment(\.paper) private var p
    let name: String
    let sub: String
    let first: Bool
    let opts: [(String, String)]
    let value: String
    let pick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !first { AiLine34() }
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                AiSegment34(opts: opts, value: value, pick: pick)
            }
            .padding(.vertical, 12)
        }
    }
}
