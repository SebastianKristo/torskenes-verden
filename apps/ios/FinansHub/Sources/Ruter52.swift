import SwiftUI
import WidgetKit

/* ---------------- Prompt 52: Ruter med en gang – buffer + forhåndshenting ---------------- */
// Fasit: Homelab.dc.html → avPrefetch()/avFetch(), prompts/prompt-52-pakke/claude-code-ruter-avganger-umiddelbart.md.
// 1. Hvert vellykket svar lagres per stopp i App Group (Ruter52Buffer i Shared, så widgeten også bruker det).
// 2. Ved oppstart, hvert 60. sekund mens appen er i forgrunnen og ved retur fra bakgrunnen hentes ALLE lagrede stopp
//    (Ruter-listen + Hjem-stoppene).
// 3. Bufferen lastes før nettverkskall; avganger med planlagt tid mer enn 1 min tilbake filtreres bort, og minuttene
//    regnes på nytt fra klokka.
// 4. Ruter tegnes fra bufferen i første frame; ny henting bare når dataene er eldre enn 30 s (RuterModel.load).

enum Ruter52 {
    /// Avgangene i et svar fra GET /api/ruter/departures?stop=, med minutter regnet fra klokka.
    static func parse(_ d: Data, now: Date = Date()) -> [RuterDeparture] {
        let list: [RuterDeparture] = JS.list(JS.obj(d), "departures").enumerated().map { RuterDeparture($0.element, $0.offset) }
        return fresh(list, now: now).sorted { ($0.minutes ?? 9999) < ($1.minutes ?? 9999) }
    }

    /// Fjerner avganger som gikk for mer enn 1 min siden (planlagt tid) og regner minuttene på nytt.
    static func fresh(_ list: [RuterDeparture], now: Date = Date()) -> [RuterDeparture] {
        var out: [RuterDeparture] = []
        for var d in list {
            let ref: Date? = d.aimed ?? d.expected
            if let r = ref, r.timeIntervalSince(now) < -60, (d.expected ?? r).timeIntervalSince(now) < 0 { continue }
            if let e = d.expected { d.minutes = Swift.max(0, Int((e.timeIntervalSince(now) / 60).rounded(.down))) }
            out.append(d)
        }
        return out
    }

    /// Hele bufferen som avganger per stopp (brukes som startverdi i RuterModel og RuterHome27).
    static func loadAll(now: Date = Date()) -> [String: [RuterDeparture]] {
        var out: [String: [RuterDeparture]] = [:]
        for (id, e) in Ruter52Buffer.all() {
            let list: [RuterDeparture] = parse(e.data, now: now)
            if !list.isEmpty { out[id] = list }
        }
        return out
    }

    /// Alle lagrede stopp: Ruter-listen først, så Hjem-stoppene som ikke står der.
    @MainActor static func allStops() -> [RuterStop] {
        var out: [RuterStop] = RuterModel.shared.stops
        for id in RuterHome27.shared.stops where !out.contains(where: { $0.id == id }) {
            out.append(RuterStop(id: id, name: Ruter52Buffer.entry(id)?.name ?? id))
        }
        return Array(out.prefix(Ruter52Buffer.maxStops))
    }

    /// Henter alle stopp (de som er eldre enn `minAge` sekunder) og oppdaterer Ruter, Hjem-kortet og widgeten.
    @MainActor static func prefetchAll(_ store: Store, minAge: TimeInterval = 25) async {
        guard store.account != nil else { return }
        let rm: RuterModel = RuterModel.shared
        if rm.stops.isEmpty {
            await rm.load(store)
        }
        let h: RuterHome27 = RuterHome27.shared
        var changed: Bool = false
        for s in allStops() {
            if let a = Ruter52Buffer.age(s.id), a < minAge { continue }
            let enc: String = s.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s.id
            guard let d = try? await store.api.callAt("/api", "GET", "/ruter/departures?stop=\(enc)&n=20", timeout: 15) else { continue }
            let list: [RuterDeparture] = parse(d)
            Ruter52Buffer.put(s.id, name: s.name, data: d)
            rm.departures[s.id] = list
            h.deps[s.id] = list
            changed = true
        }
        if changed {
            rm.updated = Date()
            h.updated = Date()
            h.shareWithWidgets(rm.stops, reload: false)
        }
    }
}

/// Forhåndshentingen i skallet: ved oppstart, hvert 60. s i forgrunnen og ved retur fra bakgrunnen.
struct Ruter52Prefetch: ViewModifier {
    @Environment(\.scenePhase) private var phase
    let store: Store

    func body(content: Content) -> some View {
        content.task(id: Ruter52Key(active: phase == .active, account: store.account?.id ?? "")) {
            guard phase == .active, store.account != nil else { return }
            while !Task.isCancelled {
                await Ruter52.prefetchAll(store)
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }
}

struct Ruter52Key: Hashable {
    var active: Bool
    var account: String
}

extension View {
    func ruter52Prefetch(_ store: Store) -> some View { modifier(Ruter52Prefetch(store: store)) }
}
