import SwiftUI
import WidgetKit

/* ---------------- Prompt 27: Ruter-kortet på Hjem med «Velg stopp» ---------------- */
// Fasit: Hjem → Avganger og arket «Velg stopp» i design/Mobil Papir App.dc.html, prompts/prompt-27-pakke/claude-code-ruter-hjem.md.
// Opptil 3 av Mine stopp og 1–4 avganger per stopp. Lagres lokalt i `papir_av_home` = {stops:[id], n} og på serveren
// (PUT /api/me/home-departures, ellers home_departures i /api/me/layout). Én gruppe per stopp (navnet over når flere;
// da maks 2 avganger per stopp). Sanntid hvert 30. s mens Hjem er synlig. Widgetene får stoppene via App Group.

@MainActor
@Observable
final class RuterHome27 {
    static let shared = RuterHome27()

    var stops: [String] = []
    var n: Int = 3
    var deps: [String: [RuterDeparture]] = [:]
    var loading: Bool = false
    var updated: Date? = nil
    @ObservationIgnored private var settingsLoaded: Bool = false

    private static let localKey: String = "papir_av_home"

    init() {
        if let d = UserDefaults.standard.data(forKey: RuterHome27.localKey),
           let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
            stops = (o["stops"] as? [String]) ?? []
            n = Swift.min(4, Swift.max(1, (o["n"] as? Int) ?? 3))
        }
    }

    /// Valgte stopp i rekkefølgen fra Mine stopp. Ingen valgt: første stopp.
    func selected(_ all: [RuterStop]) -> [RuterStop] {
        let picked: [RuterStop] = all.filter { stops.contains($0.id) }
        if !picked.isEmpty { return Array(picked.prefix(3)) }
        return Array(all.prefix(1))
    }

    /// Antall rader per stopp: n, men maks 2 når flere stopp vises.
    func rowsPerStop(_ count: Int) -> Int { count > 1 ? Swift.min(n, 2) : n }

    func isOn(_ id: String, _ all: [RuterStop]) -> Bool {
        if stops.isEmpty { return all.first?.id == id }
        return stops.contains(id)
    }

    /* ---------- Innstillinger ---------- */

    func loadSettings(_ store: Store) async {
        if settingsLoaded { return }
        settingsLoaded = true
        var o: [String: Any]? = nil
        if let d = try? await store.api.callAt("/api", "GET", "/me/home-departures") {
            let r: [String: Any] = JS.obj(d)
            o = JS.dict(r, "home_departures") ?? JS.dict(r, "homeDepartures") ?? r
        } else if let d = try? await store.api.callAt("/api", "GET", "/me/layout") {
            let r: [String: Any] = JS.obj(d)
            o = JS.dict(r, "home_departures") ?? JS.dict(r, "homeDepartures")
        }
        guard let o, let s = o["stops"] as? [Any] else { return }
        let ids: [String] = s.compactMap { v in (v as? String) ?? JS.str(v as? [String: Any], "id") }
        if !ids.isEmpty { stops = Array(ids.prefix(3)) }
        if let k = JS.int(o, "n") { n = Swift.min(4, Swift.max(1, k)) }
        saveLocal()
    }

    func toggle(_ s: RuterStop, _ all: [RuterStop], _ store: Store) {
        Haptics.shared.select()
        var cur: [String] = stops.isEmpty ? Array(all.prefix(1).map { $0.id }) : stops
        if cur.contains(s.id) {
            let left: [String] = cur.filter { $0 != s.id }
            if left.isEmpty { return }
            cur = left
        } else {
            cur.append(s.id)
            if cur.count > 3 { cur = Array(cur.suffix(3)) }
        }
        stops = cur
        save(store, all)
        Task { await refresh(store) }
    }

    func setN(_ k: Int, _ store: Store) {
        Haptics.shared.select()
        n = Swift.min(4, Swift.max(1, k))
        save(store, RuterModel.shared.stops)
    }

    private func saveLocal() {
        let o: [String: Any] = ["stops": stops, "n": n]
        if let d = try? JSONSerialization.data(withJSONObject: o) { UserDefaults.standard.set(d, forKey: RuterHome27.localKey) }
    }

    private func save(_ store: Store, _ all: [RuterStop]) {
        saveLocal()
        shareWithWidgets(all, reload: true)
        let body: [String: Any] = ["stops": stops, "n": n]
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/me/home-departures", json: body)
            } catch let e as APIError where e.status == 404 || e.status == 405 {
                _ = try? await store.api.callAt("/api", "PUT", "/me/layout", json: ["home_departures": body])
            } catch {}
        }
    }

    /// Hjem-stoppene og siste avganger til widgetene (App Group).
    func shareWithWidgets(_ all: [RuterStop], reload: Bool) {
        let sel: [RuterStop] = selected(all)
        Ruter27Shared.saveHome(Ruter27Home(stops: sel.map { Ruter27HomeRef(id: $0.id, name: $0.name) }, n: n))
        var out: [Ruter27Stop] = []
        var devs: [String] = []
        for s in sel {
            let list: [RuterDeparture] = deps[s.id] ?? []
            let mapped: [Ruter27Dep] = list.compactMap { d in
                guard let e = d.expected, !d.cancelled else { return nil }
                return Ruter27Dep(line: d.line, dest: d.to, color: RuterView24.lineHex(d), platform: d.platform, expected: e, realtime: d.realtime)
            }
            out.append(Ruter27Stop(id: s.id, name: s.name, deps: mapped))
            for d in list where !d.situation.isEmpty && !devs.contains(d.situation) { devs.append(d.situation) }
        }
        if out.contains(where: { !$0.deps.isEmpty }) {
            Ruter27Shared.saveCache(Ruter27Snapshot(stops: out, deviations: devs, fetched: Date()))
        }
        if reload { WidgetCenter.shared.reloadTimelines(ofKind: Ruter27Shared.widgetKind) }
    }

    /* ---------- Sanntid ---------- */

    func refresh(_ store: Store) async {
        let rm: RuterModel = RuterModel.shared
        if rm.stops.isEmpty { await rm.load(store) }
        let sel: [RuterStop] = selected(rm.stops)
        if sel.isEmpty { return }
        loading = true
        defer { loading = false }
        for s in sel {
            let enc: String = s.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s.id
            guard let d = try? await store.api.callAt("/api", "GET", "/ruter/departures?stop=\(enc)&n=8", timeout: 20) else { continue }
            let list: [RuterDeparture] = JS.list(JS.obj(d), "departures").enumerated().map { RuterDeparture($0.element, $0.offset) }
            deps[s.id] = list.sorted { ($0.minutes ?? 9999) < ($1.minutes ?? 9999) }
        }
        updated = Date()
        let first: Bool = !settingsShared
        settingsShared = true
        shareWithWidgets(rm.stops, reload: first)
    }

    @ObservationIgnored private var settingsShared: Bool = false
}

/// Kortet på Hjem: «AVGANGER · AMAGERVEIEN» (eller «· 2 STOPP»), «Velg stopp», «sanntid ›» og gruppene.
struct RuterHomeCard27: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.scenePhase) private var phase
    @MainActor private var h: RuterHome27 { RuterHome27.shared }
    @MainActor private var rm: RuterModel { RuterModel.shared }
    @State private var picking: Bool = false

    var body: some View {
        let sel: [RuterStop] = h.selected(rm.stops)
        VStack(alignment: .leading, spacing: 8) {
            header(sel)
            if sel.isEmpty {
                legacy
            } else {
                ForEach(sel) { s in group(s, many: sel.count > 1) }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onTapGesture { openBoard(sel.first) }
        .accessibilityHint("Åpner avgangene")
        .task(id: phase == .active) {
            guard phase == .active else { return }
            await h.loadSettings(store)
            await h.refresh(store)
            // Sanntid: hvert 30. sekund mens Hjem er synlig.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                if Task.isCancelled { break }
                await h.refresh(store)
            }
        }
        .sheet(isPresented: $picking) {
            RuterPick27Sheet(close: { picking = false }).environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .presentationBackground(p.bg)
        }
    }

    private func header(_ sel: [RuterStop]) -> some View {
        let title: String = sel.count > 1 ? "Avganger · \(sel.count) stopp" : "Avganger · \(sel.first?.name ?? store.mobileHome?.ruter.first?.from ?? "")"
        return HStack(alignment: .center, spacing: 8) {
            PLabel(text: title).lineLimit(1)
            Spacer(minLength: 4)
            Button { Haptics.shared.tap(); picking = true } label: {
                Text("Velg stopp").font(PF.ui(12, .semibold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                    .padding(.horizontal, 12).frame(height: 30)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Text("sanntid ›").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1).fixedSize()
        }
    }

    @ViewBuilder private func group(_ s: RuterStop, many: Bool) -> some View {
        let rows: [RuterDeparture] = Array((h.deps[s.id] ?? []).filter { !$0.cancelled }.prefix(h.rowsPerStop(many ? 2 : 1)))
        if many { Text(s.name).font(PF.ui(12.5, .bold)).foregroundStyle(p.mut).padding(.top, 4).lineLimit(1) }
        if rows.isEmpty {
            Text(h.updated == nil ? "Henter avganger …" : "Ingen avganger akkurat nå.").font(PF.ui(13)).foregroundStyle(p.mut)
        }
        ForEach(rows) { d in RuterHomeRow27(d: d) }
    }

    /// Ingen Mine stopp ennå: avgangene serveren sender til forsiden (som før).
    @ViewBuilder private var legacy: some View {
        let lines: [RuterLine] = store.mobileHome?.ruter ?? []
        let list = Array(lines.flatMap { l in l.departures.map { (l.to, $0) } }.prefix(4))
        if list.isEmpty { Text("Trykk «Velg stopp» for å legge til et stopp.").font(PF.ui(13)).foregroundStyle(p.mut) }
        ForEach(Array(list.enumerated()), id: \.offset) { _, d in
            PaperRuterRow(line: d.1.line, color: d.1.ruterColor, textColor: d.1.ruterTextColor, dest: d.1.to ?? d.0, minutes: d.1.min, time: d.1.time)
        }
    }

    private func openBoard(_ s: RuterStop?) {
        Haptics.shared.tap()
        if let s { rm.selected = s.id }
        store.paperGo("avg")
    }
}

/// Én avgang på kortet: linjemerke, destinasjon og minutter (serif 22 + «min»).
struct RuterHomeRow27: View {
    @Environment(\.paper) private var p
    let d: RuterDeparture

    var body: some View {
        HStack(spacing: 10) {
            Text(d.line).font(PF.ui(12, .heavy)).foregroundStyle(RuterView24.lineInk(d)).lineLimit(1).fixedSize()
                .padding(.horizontal, 4)
                .frame(minWidth: 30).frame(height: 24)
                .background(RuterView24.lineColor(d), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(d.to).font(PF.ui(14.5)).foregroundStyle(p.ink).lineLimit(1)
            Spacer(minLength: 4)
            Text(minText).font(PF.serif(22, medium: true)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
            Text(minutes <= 0 ? "" : "min").font(PF.ui(12)).foregroundStyle(p.mut).frame(width: 26, alignment: .leading)
        }
    }

    private var minutes: Int {
        if let e = d.expected { return Swift.max(0, Int((e.timeIntervalSinceNow / 60).rounded(.down))) }
        return d.minutes ?? 0
    }

    private var minText: String { minutes <= 0 ? "nå" : "\(minutes)" }
}

/// Arket «Velg stopp»: kryss av opptil 3 av Mine stopp, 1–4 avganger per stopp, og «Legg til eller fjern stopp ›».
struct RuterPick27Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var h: RuterHome27 { RuterHome27.shared }
    @MainActor private var rm: RuterModel { RuterModel.shared }
    let close: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                top
                Text("Velg opptil 3 stopp. Rekkefølgen følger Mine stopp.").font(PF.ui(13)).foregroundStyle(p.mut)
                options
                PLabel(text: "Avganger per stopp").padding(.top, 4)
                counts
                Button { manage() } label: {
                    Text("Legg til eller fjern stopp ›").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 30)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task { if rm.stops.isEmpty { await rm.load(store) } }
    }

    private var top: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                PLabel(text: "Hjem · Ruter-kortet")
                Text("Velg stopp").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            }
            Spacer()
            Button { close() } label: {
                Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 16).frame(height: 36).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private var options: some View {
        let all: [RuterStop] = rm.stops
        if all.isEmpty {
            Text("Ingen stopp ennå. Legg til et stopp under.").font(PF.ui(13.5)).foregroundStyle(p.mut)
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            VStack(spacing: 0) {
                ForEach(Array(all.enumerated()), id: \.element.id) { i, s in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    optionRow(s, on: h.isOn(s.id, all), all: all)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func optionRow(_ s: RuterStop, on: Bool, all: [RuterStop]) -> some View {
        Button { h.toggle(s, all, store) } label: {
            HStack(spacing: 12) {
                Text("✓").font(PF.ui(13, .heavy)).foregroundStyle(on ? p.bg : Color.clear)
                    .frame(width: 24, height: 24)
                    .background(on ? p.ink : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(on ? p.ink : p.line, lineWidth: 1.5))
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(s.locality.isEmpty ? "Sanntid fra Entur" : s.locality).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var counts: some View {
        HStack(spacing: 6) {
            ForEach(1...4, id: \.self) { k in
                let on: Bool = h.n == k
                Button { h.setN(k, store) } label: {
                    Text("\(k)").font(PF.ui(15, .bold)).foregroundStyle(on ? p.bg : p.ink)
                        .frame(maxWidth: .infinity).frame(height: 42)
                        .background(on ? p.ink : p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Lukk arket og åpne Avganger i redigeringsmodus («Mine stopp»).
    private func manage() {
        close()
        rm.editing = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            store.paperGo("avg")
        }
    }
}
