import SwiftUI

/* ---------------- Papir: Avganger (Ruter/Entur) ---------------- */

struct RuterStop: Identifiable, Hashable, Codable {
    var id: String
    var name: String
    var locality: String = ""
}

struct RuterDeparture: Identifiable, Hashable {
    var id: String
    var line: String
    var to: String
    var mode: String
    var color: String?
    var textColor: String
    var aimed: Date?
    var expected: Date?
    var minutes: Int?
    var realtime: Bool
    var platform: String
    var cancelled: Bool
    var situation: String

    init(_ o: [String: Any], _ i: Int) {
        line = JS.str(o, "line") ?? JS.str(o, "publicCode") ?? "?"
        to = JS.str(o, "to") ?? JS.str(o, "destination") ?? ""
        mode = JS.str(o, "mode") ?? ""
        color = JS.str(o, "color")
        textColor = JS.str(o, "textColor") ?? "#FFFFFF"
        aimed = JS.date(o["aimed"])
        expected = JS.date(o["expected"]) ?? aimed
        minutes = JS.int(o, "minutes") ?? expected.map { Int(($0.timeIntervalSinceNow / 60).rounded(.down)) }
        realtime = JS.bool(o, "realtime") ?? false
        platform = JS.str(o, "platform") ?? ""
        cancelled = JS.bool(o, "cancelled") ?? false
        if let s = o["situation"] as? String { situation = s } else { situation = JS.strings(o, "situations").first ?? "" }
        id = "\(i)-\(line)-\(to)-\(JS.str(o, "expected") ?? "")"
    }

    /// Forsinkelse i minutter (sanntid mot rutetid).
    var delay: Int {
        guard let a = aimed, let e = expected else { return 0 }
        return Int((e.timeIntervalSince(a) / 60).rounded())
    }
}

@MainActor
@Observable
final class RuterModel {
    static let shared = RuterModel()

    var stops: [RuterStop] = RuterModel.loadLocal()
    var selected: String?
    var departures: [String: [RuterDeparture]] = [:]
    var updated: Date?
    var loading = false
    var error: String?
    var editing = false
    var searchOpen = false
    var results: [RuterStop] = []
    var searching = false

    nonisolated static func loadLocal() -> [RuterStop] {
        guard let d = UserDefaults.standard.data(forKey: "fh_ruter_stops"), let v = try? JSONDecoder().decode([RuterStop].self, from: d) else { return [] }
        return v
    }
    private func saveLocal() {
        if let d = try? JSONEncoder().encode(stops) { UserDefaults.standard.set(d, forKey: "fh_ruter_stops") }
    }

    var current: RuterStop? { stops.first { $0.id == selected } ?? stops.first }

    func load(_ store: Store) async {
        if let d = try? await store.api.callAt("/api", "GET", "/me/stops") {
            let raw = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "stops")
            let list = raw.compactMap { $0 as? [String: Any] }.compactMap { o -> RuterStop? in
                guard let id = JS.str(o, "id") else { return nil }
                return RuterStop(id: id, name: JS.str(o, "name") ?? id, locality: JS.str(o, "locality") ?? "")
            }
            if !list.isEmpty { stops = list; saveLocal() }
        }
        await refresh(store)
    }

    func refresh(_ store: Store) async {
        guard let s = current else { return }
        loading = true
        defer { loading = false }
        do {
            let d = try await store.api.callAt("/api", "GET", "/ruter/departures?stop=\(enc(s.id))&n=20", timeout: 20)
            let o = JS.obj(d)
            departures[s.id] = JS.list(o, "departures").enumerated().map { RuterDeparture($0.element, $0.offset) }
            updated = Date()
            error = nil
        } catch let e as APIError {
            error = e.status == 404 ? "Avganger finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            self.error = error.localizedDescription
        }
    }

    func select(_ s: RuterStop, _ store: Store) {
        Haptics.shared.select()
        selected = s.id
        Task { await refresh(store) }
    }

    func search(_ q: String, _ store: Store) async {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard t.count >= 2 else { results = []; return }
        searching = true
        defer { searching = false }
        guard let d = try? await store.api.callAt("/api", "GET", "/ruter/search?q=\(enc(t))", timeout: 15) else { results = []; return }
        let raw = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "items")
        results = raw.compactMap { $0 as? [String: Any] }.compactMap { o in
            guard let id = JS.str(o, "id") else { return nil }
            return RuterStop(id: id, name: JS.str(o, "name") ?? id, locality: JS.str(o, "locality") ?? "")
        }
    }

    func add(_ s: RuterStop, _ store: Store) {
        guard !stops.contains(where: { $0.id == s.id }) else { selected = s.id; return }
        stops.append(s)
        selected = s.id
        save(store)
        Haptics.shared.success()
        Task { await refresh(store) }
    }

    func remove(_ s: RuterStop, _ store: Store) {
        stops.removeAll { $0.id == s.id }
        if selected == s.id { selected = stops.first?.id }
        save(store)
        Haptics.shared.tick()
    }

    func move(_ s: RuterStop, _ dir: Int, _ store: Store) {
        guard let i = stops.firstIndex(of: s) else { return }
        let j = i + dir
        guard stops.indices.contains(j) else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { stops.swapAt(i, j) }
        save(store)
        Haptics.shared.tick()
    }

    private func save(_ store: Store) {
        saveLocal()
        let body: [String: Any] = ["stops": stops.map { ["id": $0.id, "name": $0.name] }]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/me/stops", json: body) }
    }

    private func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s }
}

/// Avganger i nyhetsleser-stil: stoppknapper (rulles sideveis, kuttes ikke), avgangene som rader med linjemerke,
/// destinasjon, plattform og sanntid. Hold inne på stoppene for å flytte og fjerne dem. + søker i Ruter/Entur.
struct PaperDepartures: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: RuterModel { RuterModel.shared }

    var body: some View {
        VStack(spacing: 10) {
            stopBar
            if m.editing { editList }
            if let e = m.error { PCard { Text(e).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) } }
            if let s = m.current { board(s) } else { emptyCard }
        }
        .task { if m.stops.isEmpty || m.departures.isEmpty { await m.load(store) } }
        .sheet(isPresented: Binding(get: { m.searchOpen }, set: { m.searchOpen = $0 })) {
            RuterSearchSheet().environment(\.paper, p).presentationDetents([.medium, .large]).presentationBackground(p.bg)
        }
    }

    private var stopBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(m.stops) { s in
                    let on = m.current?.id == s.id
                    Button { m.select(s, store) } label: {
                        Text(s.name).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                            .fixedSize()
                            .padding(.horizontal, 14).frame(height: 36)
                            .background(on ? p.ink : p.card, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Button { Haptics.shared.tap(); m.searchOpen = true } label: {
                    Text("+ Legg til stopp").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                        .fixedSize()
                        .padding(.horizontal, 14).frame(height: 36)
                        .overlay(Capsule().stroke(p.lab, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 2).padding(.vertical, 4)
        }
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in
            Haptics.shared.tick()
            withAnimation(.easeOut(duration: 0.2)) { m.editing = true }
        })
    }

    private var editList: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Rediger stopp").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                Spacer()
                Button { withAnimation(.easeOut(duration: 0.2)) { m.editing = false } } label: {
                    Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 14).frame(height: 32).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            ForEach(Array(m.stops.enumerated()), id: \.element.id) { i, s in
                Rectangle().fill(p.line).frame(height: 1)
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(s.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                        if !s.locality.isEmpty { Text(s.locality).font(PF.ui(12)).foregroundStyle(p.mut) }
                    }
                    Spacer()
                    smallButton("▲", i > 0) { m.move(s, -1, store) }
                    smallButton("▼", i < m.stops.count - 1) { m.move(s, 1, store) }
                    smallButton("−", true) { m.remove(s, store) }
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
                .rotationEffect(.degrees(m.editing ? (i % 2 == 0 ? 0.2 : -0.2) : 0))
                .animation(m.editing ? .easeInOut(duration: 0.3).repeatForever(autoreverses: true) : .default, value: m.editing)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func smallButton(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13, .bold)).foregroundStyle(on ? p.ink : p.line).frame(width: 32, height: 32).background(p.popSel, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!on)
    }

    private var emptyCard: some View {
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Ingen stopp ennå").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                Text("Trykk «+ Legg til stopp» og søk etter et stopp i Ruter/Entur.").font(PF.ui(13)).foregroundStyle(p.mut)
            }
        }
    }

    @ViewBuilder private func board(_ s: RuterStop) -> some View {
        let list = m.departures[s.id] ?? []
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: s.name)
                Spacer()
                Text(updatedText).font(PF.ui(11.5)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)
            Rectangle().fill(p.ink).frame(height: 2)
            if list.isEmpty {
                HStack(spacing: 8) {
                    if m.loading { ProgressView() }
                    Text(m.loading ? "Henter avganger …" : "Ingen avganger akkurat nå.").font(PF.ui(13)).foregroundStyle(p.mut)
                    Spacer()
                }
                .padding(14)
            }
            ForEach(Array(list.enumerated()), id: \.element.id) { i, d in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1).padding(.horizontal, 14) }
                depRow(d)
            }
            Button { Task { await m.refresh(store) } } label: {
                Text("Oppdater ↻").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 18).frame(height: 36).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.vertical, 12)
            Button { store.openURL(store.ruterURL(s.name)) } label: {
                Text("Åpne i Ruter-appen ↗").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 12)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var updatedText: String {
        guard let u = m.updated else { return "Sanntid fra Entur" }
        return "Oppdatert " + JS.fmt(u, "HH:mm")
    }

    private func depRow(_ d: RuterDeparture) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(d.line).font(PF.ui(13, .heavy)).foregroundStyle(Color(hex: d.textColor))
                .fixedSize()
                .frame(minWidth: 34).frame(height: 26).padding(.horizontal, 4)
                .background(lineColor(d), in: RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 2) {
                Text(d.to).font(PF.serif(17, medium: true)).foregroundStyle(d.cancelled ? p.mut : p.ink).strikethrough(d.cancelled)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail(d)).font(PF.ui(12)).foregroundStyle(d.cancelled || d.delay > 2 ? p.lab : p.mut)
                    .fixedSize(horizontal: false, vertical: true)
                if !d.situation.isEmpty {
                    Text("⚠ " + d.situation).font(PF.ui(12)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 0) {
                Text(minText(d)).font(PF.serif(22, medium: true)).foregroundStyle(p.ink).fixedSize()
                Text(d.expected.map { JS.fmt($0, "HH:mm") } ?? "").font(PF.ui(11.5)).foregroundStyle(p.mut).fixedSize()
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func minText(_ d: RuterDeparture) -> String {
        guard let m = d.minutes else { return "–" }
        return m <= 0 ? "nå" : "\(m) min"
    }

    private func detail(_ d: RuterDeparture) -> String {
        var parts: [String] = []
        if !d.platform.isEmpty { parts.append("Plattform \(d.platform)") }
        if d.cancelled { parts.append("Innstilt") }
        else if d.realtime { parts.append(d.delay > 1 ? "\(d.delay) min forsinket" : "● Sanntid") }
        else { parts.append("Rutetid") }
        if let a = d.aimed, d.delay > 1 { parts.append("rutetid " + JS.fmt(a, "HH:mm")) }
        return parts.joined(separator: " · ")
    }

    private func lineColor(_ d: RuterDeparture) -> Color {
        if let c = d.color, !c.isEmpty { return Color(hex: c) }
        switch d.mode {
        case "metro": return Color(hex: "#EC700C")
        case "tram": return Color(hex: "#0B91EF")
        case "water": return Color(hex: "#682C88")
        case "rail": return Color(hex: "#003087")
        default: return Color(hex: "#E60000")
        }
    }
}

/// Søk etter stopp i Ruter/Entur og legg dem til.
struct RuterSearchSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var q = ""
    @FocusState private var focus: Bool
    @MainActor private var m: RuterModel { RuterModel.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Legg til stopp").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(p.mut)
                TextField("Søk etter stopp, f.eks. Jernbanetorget", text: $q)
                    .font(PF.ui(15)).foregroundStyle(p.ink).focused($focus).autocorrectionDisabled().submitLabel(.search)
                if m.searching { ProgressView() }
            }
            .padding(.horizontal, 14).frame(height: 46)
            .background(p.card, in: Capsule())
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(m.results.enumerated()), id: \.element.id) { i, s in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        Button { m.add(s, store); dismiss() } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(s.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                                    if !s.locality.isEmpty { Text(s.locality).font(PF.ui(12)).foregroundStyle(p.mut) }
                                }
                                Spacer()
                                Text(m.stops.contains { $0.id == s.id } ? "Lagt til" : "+ Legg til").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 11)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    if m.results.isEmpty && q.count >= 2 && !m.searching {
                        Text("Ingen stopp funnet.").font(PF.ui(13)).foregroundStyle(p.mut).padding(14)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .padding(18)
        .onAppear { focus = true }
        .task(id: q) {
            try? await Task.sleep(for: .milliseconds(300))
            if !Task.isCancelled { await m.search(q, store) }
        }
    }
}

/// Toppbildet på Avganger: Ruter-rødt med trikk og T-bane-linjer.
struct RuterHeroArt: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: "#E60000"), Color(hex: "#9A0F0F"), Color(hex: "#3a0d0d")], startPoint: .topLeading, endPoint: .bottomTrailing)
            GeometryReader { g in
                let w = g.size.width, h = g.size.height
                Path { p in
                    p.move(to: CGPoint(x: -20, y: h * 0.78))
                    p.addCurve(to: CGPoint(x: w + 20, y: h * 0.52), control1: CGPoint(x: w * 0.3, y: h * 0.95), control2: CGPoint(x: w * 0.6, y: h * 0.4))
                }
                .stroke(Color(hex: "#EC700C").opacity(0.8), lineWidth: 5)
                Path { p in
                    p.move(to: CGPoint(x: -20, y: h * 0.9))
                    p.addCurve(to: CGPoint(x: w + 20, y: h * 0.68), control1: CGPoint(x: w * 0.35, y: h * 1.05), control2: CGPoint(x: w * 0.7, y: h * 0.55))
                }
                .stroke(Color(hex: "#0B91EF").opacity(0.8), lineWidth: 5)
                Image(systemName: "tram.fill").font(.system(size: h * 0.42, weight: .regular)).foregroundStyle(.white.opacity(0.14))
                    .position(x: w * 0.8, y: h * 0.42)
            }
        }
    }
}
