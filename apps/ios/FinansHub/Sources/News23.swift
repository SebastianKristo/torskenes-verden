import SwiftUI

/* ---------------- Prompt 23: ikoner på fanene i Nyhetsleser (Nyhetsleser.dc.html: tabs, ic, ip) ---------------- */

/// ic (fane → 'prefix:name' eller '' for ingen ikon), icSrc ('std'|'ai'|'pick') og icOn. Lagres i hl_rss på serveren
/// (PUT /api/rss/settings) og lokalt som reserve.
@MainActor
@Observable
final class NewsIcons23 {
    static let shared = NewsIcons23()
    var icOn: Bool = true
    var ic: [String: String] = [:]
    var icSrc: [String: String] = [:]
    var defaults: [String: String] = NewsIcons23.builtIn
    var busyAll: Bool = false
    var loaded: Bool = false

    static let builtIn: [String: String] = ["siste": "lucide:zap", "norge": "lucide:mountain-snow", "verden": "lucide:globe", "okonomi": "lucide:trending-up",
                                            "sport": "lucide:trophy", "teknologi": "lucide:cpu", "kultur": "lucide:drama"]
    static let keywords: [String: String] = ["siste": "news", "norge": "mountain", "verden": "globe", "okonomi": "chart", "sport": "trophy", "teknologi": "chip",
                                             "kultur": "theater", "helse": "heart", "politikk": "government", "lokalt": "map-pin"]
    private static let localKey: String = "hl_rss_icons23"

    init() {
        if let d = UserDefaults.standard.data(forKey: NewsIcons23.localKey), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] { apply(o) }
    }

    /// Gjeldende ikon for fanen: valgt/AI, ellers standard. nil = ingen ikon.
    func icon(_ cat: String) -> String? {
        if let v = ic[cat] { return v.isEmpty ? nil : v }
        return defaults[cat]
    }

    func source(_ cat: String) -> String {
        guard let v = ic[cat] else { return "Standard" }
        if icSrc[cat] == "ai" { return "✦ AI" }
        return v.isEmpty ? "Ingen" : "Valgt"
    }

    private func apply(_ s: [String: Any]) {
        if let b = JS.bool(s, "icOn") { icOn = b }
        if let m = s["ic"] as? [String: Any] {
            var out: [String: String] = [:]
            for (k, v) in m { if let t = v as? String { out[k] = t } }
            ic = out
        }
        if let m = s["icSrc"] as? [String: Any] {
            var out: [String: String] = [:]
            for (k, v) in m { if let t = v as? String { out[k] = t } }
            icSrc = out
        }
    }

    private func saveLocal() {
        let o: [String: Any] = ["icOn": icOn, "ic": ic, "icSrc": icSrc]
        if let d = try? JSONSerialization.data(withJSONObject: o) { UserDefaults.standard.set(d, forKey: NewsIcons23.localKey) }
    }

    /// settings.{ic, icSrc, icOn} og iconDefaults fra GET /api/rss. Eldre server: bare lokal lagring.
    func load(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/rss?cat=siste&limit=1") else { return }
        let o: [String: Any] = JS.obj(d)
        if let s = JS.dict(o, "settings"), s["ic"] != nil || s["icOn"] != nil { apply(s); saveLocal() }
        if let def = JS.dict(o, "iconDefaults") {
            var out: [String: String] = NewsIcons23.builtIn
            for (k, v) in def { if let t = v as? String { out[k] = t } }
            defaults = out
        }
        loaded = true
    }

    /// Prompt 24: alle faneikonene (valgte og standard) lastes ved oppstart, så de vises med en gang i Nyhetsleser.
    func preload(_ store: Store) async {
        await IconCache23.shared.preload(allIds, store)
        await load(store)
        await IconCache23.shared.preload(allIds, store)
    }

    private var allIds: [String] {
        var out: [String] = Array(defaults.values)
        for v in ic.values where !v.isEmpty { out.append(v) }
        return out
    }

    private func push(_ store: Store) {
        saveLocal()
        let body: [String: Any] = ["ic": ic, "icSrc": icSrc, "icOn": icOn]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/rss/settings", json: body) }
    }

    func setOn(_ on: Bool, _ store: Store) {
        Haptics.shared.select()
        icOn = on
        push(store)
    }

    func set(_ cat: String, _ id: String, src: String, _ store: Store) {
        ic[cat] = id
        icSrc[cat] = src
        push(store)
        Task { await IconCache23.shared.preload([id], store) }
    }

    /// ✦ AI foreslår ett engelsk nøkkelord (POST /api/icons/suggest), første treff i biblioteket brukes. Uten AI: ordlisten.
    func aiPick(_ cat: String, label: String, prefix: String, _ store: Store) async -> Bool {
        let p: String = prefix.isEmpty ? "lucide" : prefix
        var pick: String? = nil
        if let d = try? await store.api.callAt("/api", "POST", "/icons/suggest", json: ["label": label, "prefix": p], timeout: 30) {
            pick = JS.str(JS.obj(d), "icon")
        }
        if pick == nil {
            let kw: String = NewsIcons23.keywords[cat] ?? label.lowercased()
            let q: String = kw.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? kw
            if let d = try? await store.api.callAt("/api", "GET", "/icons/search?q=\(q)&prefix=\(p)&limit=8") {
                pick = JS.list(JS.obj(d), "icons").compactMap { JS.str($0, "id") }.first
            }
        }
        guard let pick, !pick.isEmpty else { return false }
        set(cat, pick, src: "ai", store)
        return true
    }

    func aiAll(_ cats: [NewsCategory], _ store: Store) {
        guard !busyAll else { return }
        busyAll = true
        Haptics.shared.tap()
        Task {
            var n: Int = 0
            for c in cats { if await aiPick(c.id, label: c.name, prefix: "lucide", store) { n += 1 } }
            busyAll = false
            store.flash(n > 0 ? "✦ AI valgte \(n) ikoner" : "Fant ingen ikoner. Prøv igjen senere.")
        }
    }
}

/// Fanen: ikon (16 pt, tekstfargen) og navn.
struct NewsTabLabel23: View {
    let cat: NewsCategory
    let color: Color
    @MainActor private var m: NewsIcons23 { NewsIcons23.shared }

    var body: some View {
        HStack(spacing: 6) {
            if m.icOn, let id = m.icon(cat.id) {
                IconView23(id: id, size: 16, color: color)
            }
            Text(cat.name).font(PF.ui(14, .semibold)).foregroundStyle(color)
        }
    }
}

/// «IKONER PÅ FANENE»: «✦ La AI velge alle», «Vis ikoner» og én rad per fane med ikon, id og kilde.
struct NewsIconSection23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let cats: [NewsCategory]
    let pick: (NewsCategory) -> Void
    @MainActor private var m: NewsIcons23 { NewsIcons23.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: "Ikoner på fanene")
                Spacer()
                Button { m.aiAll(cats, store) } label: {
                    Text(m.busyAll ? "✦ Velger …" : "✦ La AI velge alle").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                }
                .buttonStyle(.plain)
                .disabled(m.busyAll)
            }
            VStack(spacing: 0) {
                Button { m.setOn(!m.icOn, store) } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Vis ikoner").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                            Text("Ved siden av navnet på hver fane").font(PF.ui(12.5)).foregroundStyle(p.mut)
                        }
                        Spacer(minLength: 6)
                        inkSwitch(m.icOn)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(m.icOn ? "På" : "Av")
                ForEach(cats) { c in
                    Rectangle().fill(p.line).frame(height: 1)
                    row(c)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .task { if !m.loaded { await m.load(store) } }
    }

    /// Bryteren i designet: blekk når på, linjefarge når av.
    private func inkSwitch(_ on: Bool) -> some View {
        Capsule().fill(on ? p.ink : p.line)
            .frame(width: 46, height: 28)
            .overlay(alignment: on ? .trailing : .leading) { Circle().fill(.white).frame(width: 22, height: 22).padding(3) }
            .animation(.easeOut(duration: 0.15), value: on)
    }

    private func row(_ c: NewsCategory) -> some View {
        let id: String? = m.icon(c.id)
        let src: String = m.source(c.id)
        return Button { pick(c) } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(p.bg)
                    if let id { IconView23(id: id, size: 20, color: p.ink) }
                }
                .frame(width: 34, height: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Text(id ?? "ingen ikon").font(PF.mono(11.5, bold: false)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text(src).font(PF.ui(12, .bold)).foregroundStyle(src == "✦ AI" ? p.lab : p.mut)
                Text("›").foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Ikonvelgeren: søk (engelske ord) i Iconify via backend, filter per bibliotek, opptil 96 treff, «✦ La AI velge» og «Ingen ikon».
struct NewsIconPicker23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    let cat: NewsCategory
    @State private var q: String = ""
    @State private var lib: String = ""
    @State private var results: [String]? = nil
    @State private var total: Int = 0
    @State private var busy: Bool = false
    @State private var aiBusy: Bool = false
    @State private var err: String = ""
    @State private var libs: [(String, String)] = IconSets23.libs
    @State private var seq: Int = 0
    @MainActor private var m: NewsIcons23 { NewsIcons23.shared }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                header
                searchBar
                libBar
                HStack(spacing: 8) {
                    Button { ai() } label: {
                        Text(aiBusy ? "✦ Velger …" : "✦ La AI velge").font(PF.ui(13.5, .bold)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 40).background(p.lab, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(aiBusy)
                    Button { none() } label: {
                        Text("Ingen ikon").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).padding(.horizontal, 16).frame(minHeight: 40)
                            .background(p.card, in: Capsule()).overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                Text(status).font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 10)
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 56), spacing: 8)], spacing: 8) {
                    ForEach(results ?? [], id: \.self) { id in cell(id) }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task {
            q = NewsIcons23.keywords[cat.id] ?? cat.name.lowercased()
            search()
            await loadSets()
        }
    }

    private var header: some View {
        ZStack {
            VStack(spacing: 1) {
                PLabel(text: "Ikon for")
                Text(cat.name).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            }
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Text("×").font(.system(size: 17)).foregroundStyle(p.ink).frame(width: 38, height: 38)
                        .background(p.card, in: Circle()).overlay(Circle().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Lukk")
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
            TextField("", text: $q, prompt: Text("Søk etter ikon (engelsk), f.eks. football").foregroundColor(p.mut))
                .font(PF.ui(15, .medium)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .submitLabel(.search).onSubmit { search() }
            Button { search() } label: {
                Text("Søk").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 14).frame(height: 36).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 14).padding(.trailing, 6).frame(height: 46)
        .background(p.card, in: Capsule())
        .overlay(Capsule().stroke(p.line, lineWidth: 1))
    }

    private var libBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(libs, id: \.0) { l in
                    let on: Bool = lib == l.0
                    Button { lib = l.0; Haptics.shared.select(); search() } label: {
                        Text(l.1).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).padding(.horizontal, 12).frame(height: 32)
                            .background(on ? p.ink : p.card, in: Capsule())
                            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func cell(_ id: String) -> some View {
        let cur: Bool = m.icon(cat.id) == id
        return Button { choose(id) } label: {
            IconView23(id: id, size: 26, color: p.ink)
                .frame(maxWidth: .infinity)
                .aspectRatio(1, contentMode: .fit)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(cur ? p.lab : Color.clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(id)
    }

    private var status: String {
        if busy { return "Søker i over 200 ikonbibliotek …" }
        if !err.isEmpty { return err }
        guard let r = results else { return "" }
        if r.isEmpty { return "Ingen treff. Prøv et annet engelsk ord." }
        return "\(r.count) av \(Swift.max(total, r.count)) treff · Iconify (Lucide, Material, Phosphor, Tabler, Font Awesome …)"
    }

    private func search() {
        let text: String = q.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        seq += 1
        let my: Int = seq
        busy = true
        err = ""
        let enc: String = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
        let pre: String = lib.isEmpty ? "" : "&prefix=\(lib)"
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "GET", "/icons/search?q=\(enc)\(pre)&limit=96", timeout: 20)
                if my != seq { return }
                let o: [String: Any] = JS.obj(d)
                results = JS.list(o, "icons").compactMap { JS.str($0, "id") }
                total = JS.int(o, "total") ?? 0
            } catch let e as APIError {
                if my != seq { return }
                results = []
                err = e.status == 404 ? "Ikonsøket finnes ikke på serveren ennå. Oppdater homelab." : "Fikk ikke kontakt med ikonbiblioteket"
            } catch {
                if my == seq { results = []; err = "Fikk ikke kontakt med ikonbiblioteket" }
            }
            if my == seq { busy = false }
        }
    }

    /// GET /api/icons/sets → {sets:[{prefix, name}]}; ellers listen i designet.
    private func loadSets() async {
        guard let d = try? await store.api.callAt("/api", "GET", "/icons/sets") else { return }
        var rows: [(String, String)] = JS.list(JS.obj(d), "sets").compactMap { s -> (String, String)? in
            guard let n = JS.str(s, "name") else { return nil }
            return (JS.str(s, "prefix") ?? "", n)
        }
        if rows.isEmpty { return }
        if !rows.contains(where: { $0.0.isEmpty }) { rows.insert(("", "Alle"), at: 0) }
        libs = rows
    }

    private func choose(_ id: String) {
        Haptics.shared.success()
        m.set(cat.id, id, src: "pick", store)
        dismiss()
    }

    private func none() {
        Haptics.shared.select()
        m.set(cat.id, "", src: "pick", store)
        dismiss()
    }

    private func ai() {
        aiBusy = true
        Task {
            let ok: Bool = await m.aiPick(cat.id, label: cat.name, prefix: lib, store)
            aiBusy = false
            if ok { Haptics.shared.success(); dismiss() } else { err = "AI fant ikke noe ikon. Søk selv." }
        }
    }
}
