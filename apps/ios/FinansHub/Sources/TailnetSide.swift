import SwiftUI
import UIKit

/* ---------------- Mer → Tailnet (Tailscale, bare admin) ----------------
 Prompt 57 (claude-code-tailscale.md, «Mobil»): en enkel liste over enhetene i tailnetet. Serveren regner alt og sender ferdige
 tekster; appen viser dem. Samme endepunkter som web:
   GET  /api/tailscale/devices            → {counts, filters:[{id,navn,count,kinds,offline}], devices:[{id,name,ip,dns,kind,online,
                                             latencyMs,latencyLabel,statusLabel,kindLabel,ssh,…}]}
   GET  /api/tailscale/stats              → {tiles:[{id,label,value,sub}], maintenance:{count}}
   GET  /api/tailscale/devices/:id        → {facts:[{label,value,mono}], history:{latency:{spark,medianLabel,p95Label},
                                             uptimeLabels, stripe:[{state}]}, canPing}
   POST /api/tailscale/devices/:id/ping   → {ok, label}
 Modulen «tailnet» står i modullisten (shared/schemas/moduler.json) med adminOnly, så serveren sender den bare til admin.
 2×2 stat-rutenett, søk, vannrett rullende filterpiller, rader på 60 pt (maks 8 + «Vis alle N»), Vedlikehold som én rad.
 Trykk på en enhet folder ut detaljen i lista: feltene, latens 24 t, oppetid 30 d, Ping nå, Kopier IP og Kopier SSH. */

struct TailnetEnhet: Identifiable, Hashable {
    var id: String
    var name: String
    var ip: String
    var dns: String
    var kind: String
    var online: Bool
    var latencyKnown: Bool
    var latencyLabel: String
    var statusLabel: String
    var kindLabel: String
    var ssh: String
}

struct TailnetFilter: Identifiable, Hashable {
    var id: String
    var navn: String
    var count: Int
    var kinds: [String]
    var offline: Bool
}

struct TailnetFakta: Identifiable, Hashable {
    var id: String { label }
    var label: String
    var value: String
    var mono: Bool
}

struct TailnetDetalj: Hashable {
    var fakta: [TailnetFakta] = []
    var spark: [Double?] = []
    var latensTekst: String = ""
    var oppetidTekst: String = ""
    var stripe: [String] = []
    var canPing: Bool = false
}

struct TailnetStat: Identifiable, Hashable {
    var id: String
    var label: String
    var value: String
    var sub: String
}

@MainActor
@Observable
final class Tailnet {
    static let shared = Tailnet()

    var open: Bool = false
    var devices: [TailnetEnhet] = []
    var filters: [TailnetFilter] = []
    var stats: [TailnetStat] = []
    var maintenance: Int = 0
    var online: Int = 0
    var total: Int = 0
    var filter: String = "alle"
    var query: String = ""
    var showAll: Bool = false
    var expanded: String? = nil
    var detail: [String: TailnetDetalj] = [:]
    var ping: [String: String] = [:]
    var loading: Bool = false
    var loaded: Bool = false
    var error: String = ""
    var toast: String = ""

    func show() {
        Haptics.shared.tap()
        open = true
    }

    /// Undertekst i Mer: «Tailscale · 12 av 16 enheter online».
    var merSub: String {
        loaded ? "Tailscale · \(online) av \(total) enheter online" : "Tailscale · enheter, latens og oppetid"
    }

    func load(_ store: Store) async {
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/tailscale/devices", timeout: 20)
            let o: [String: Any] = JS.obj(d)
            devices = JS.list(o, "devices").map { Tailnet.enhet($0) }
            filters = JS.list(o, "filters").map { Tailnet.filterOf($0) }
            let c: [String: Any]? = JS.dict(o, "counts")
            online = JS.int(c, "online") ?? devices.filter { $0.online }.count
            total = JS.int(c, "total") ?? devices.count
            loaded = true
            error = ""
        } catch let e as APIError {
            error = e.status == 403 ? "Bare administratorer kan se tailnetet." : (e.status == 404 ? "Serveren har ikke Tailnet ennå (oppdater Homelab)." : e.message)
        } catch { self.error = error.localizedDescription }
        if let d = try? await store.api.callAt("/api", "GET", "/tailscale/stats", timeout: 20) {
            let o: [String: Any] = JS.obj(d)
            stats = JS.list(o, "tiles").map { (r: [String: Any]) -> TailnetStat in
                TailnetStat(id: JS.str(r, "id") ?? UUID().uuidString, label: JS.str(r, "label") ?? "", value: JS.str(r, "value") ?? "", sub: JS.str(r, "sub") ?? "")
            }
            maintenance = JS.int(JS.dict(o, "maintenance"), "count") ?? 0
        }
    }

    nonisolated static func enhet(_ r: [String: Any]) -> TailnetEnhet {
        let lat: Double? = JS.num(r, "latencyMs")
        return TailnetEnhet(id: JS.str(r, "id") ?? "", name: JS.str(r, "name") ?? "", ip: JS.str(r, "ip") ?? "", dns: JS.str(r, "dns") ?? "",
                            kind: JS.str(r, "kind") ?? "desktop", online: JS.bool(r, "online") ?? false, latencyKnown: lat != nil,
                            latencyLabel: JS.str(r, "latencyLabel") ?? "ukjent", statusLabel: JS.str(r, "statusLabel") ?? "",
                            kindLabel: JS.str(r, "kindLabel") ?? "", ssh: JS.str(r, "ssh") ?? "")
    }

    nonisolated static func filterOf(_ r: [String: Any]) -> TailnetFilter {
        TailnetFilter(id: JS.str(r, "id") ?? "alle", navn: JS.str(r, "navn") ?? "", count: JS.int(r, "count") ?? 0,
                      kinds: JS.strings(r, "kinds"), offline: JS.bool(r, "offline") ?? false)
    }

    /// SF Symbol for typen (samme typer som serveren: server, desktop, laptop, mobile, tablet, iot).
    nonisolated static func symbol(_ kind: String) -> String {
        switch kind {
        case "server": return "server.rack"
        case "laptop": return "laptopcomputer"
        case "mobile": return "iphone"
        case "tablet": return "ipad"
        case "iot": return "cpu"
        default: return "desktopcomputer"
        }
    }

    /// Enhetene som passer filteret og søket, i serverens rekkefølge (online først, så navn).
    var shown: [TailnetEnhet] {
        let f: TailnetFilter? = filters.first { $0.id == filter } ?? filters.first
        let q: String = query.trimmingCharacters(in: .whitespaces).lowercased()
        return devices.filter { (d: TailnetEnhet) -> Bool in
            if let f {
                let passer: Bool = f.offline ? !d.online : f.kinds.contains(d.kind)
                if !passer { return false }
            }
            if q.isEmpty { return true }
            return d.name.lowercased().contains(q) || d.ip.contains(q) || d.dns.lowercased().contains(q)
        }
    }

    func toggle(_ store: Store, _ id: String) {
        Haptics.shared.tap()
        if expanded == id { expanded = nil; return }
        expanded = id
        if detail[id] == nil { Task { await loadDetail(store, id) } }
    }

    func loadDetail(_ store: Store, _ id: String) async {
        let path: String = "/tailscale/devices/" + (id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)
        guard let d = try? await store.api.callAt("/api", "GET", path, timeout: 20) else { return }
        let o: [String: Any] = JS.obj(d)
        let h: [String: Any]? = JS.dict(o, "history")
        let l: [String: Any]? = JS.dict(h, "latency")
        let up: [String: Any]? = JS.dict(h, "uptimeLabels")
        var x: TailnetDetalj = TailnetDetalj()
        x.fakta = JS.list(o, "facts").map { (f: [String: Any]) -> TailnetFakta in
            TailnetFakta(label: JS.str(f, "label") ?? "", value: JS.str(f, "value") ?? "", mono: JS.bool(f, "mono") ?? false)
        }
        x.spark = ((l?["spark"] as? [Any]) ?? []).map { (v: Any) -> Double? in (v as? NSNumber)?.doubleValue }
        x.latensTekst = "median " + (JS.str(l, "medianLabel") ?? "ukjent") + " · p95 " + (JS.str(l, "p95Label") ?? "ukjent")
        x.oppetidTekst = "24 t " + (JS.str(up, "24h") ?? "ukjent") + " · 7 d " + (JS.str(up, "7d") ?? "ukjent") + " · 30 d " + (JS.str(up, "30d") ?? "ukjent")
        x.stripe = JS.list(h, "stripe").map { (s: [String: Any]) -> String in JS.str(s, "state") ?? "" }
        x.canPing = JS.bool(o, "canPing") ?? false
        detail[id] = x
    }

    func pingNow(_ store: Store, _ id: String) async {
        ping[id] = "Pinger …"
        let path: String = "/tailscale/devices/" + (id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id) + "/ping"
        do {
            let d: Data = try await store.api.callAt("/api", "POST", path, json: [:], timeout: 15)
            let o: [String: Any] = JS.obj(d)
            ping[id] = JS.str(o, "label") ?? ((JS.bool(o, "ok") ?? false) ? "Svar" : "Ingen svar")
            if JS.bool(o, "ok") ?? false { Haptics.shared.success() }
        } catch let e as APIError {
            ping[id] = e.message.isEmpty ? "Ingen svar" : e.message
        } catch { ping[id] = "Ingen svar" }
    }

    func copy(_ text: String, _ what: String) {
        UIPasteboard.general.string = text
        Haptics.shared.success()
        flash("Kopierte " + what)
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if self.toast == t { self.toast = "" }
        }
    }
}

/* ---------- Fullskjerm ---------- */

struct TailnetHost: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Tailnet { Tailnet.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in m.open = v })) {
                TailnetSide()
                    .environment(\.paper, p)
                    .homelabMiljo(store)
                    .edgeSwipeClose30 { m.open = false }
            }
    }
}

extension View {
    func tailnetHost(_ p: PaperPalette) -> some View { modifier(TailnetHost(p: p)) }
}

struct TailnetSide: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TailnetTop()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !m.error.isEmpty { Playback44Note(text: m.error, red: true) }
                    TailnetStats()
                    TailnetSearch()
                    TailnetPills()
                    TailnetList()
                    if m.maintenance > 0 { TailnetMaintRow() }
                }
                .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 40)
                .frame(maxWidth: 720).frame(maxWidth: .infinity)
            }
            .refreshable { await m.load(store) }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .overlay(alignment: .bottom) { if !m.toast.isEmpty { Logs44Toast(text: m.toast) } }
        .task { await m.load(store) }
    }
}

struct TailnetTop: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button { Haptic34.back(); m.open = false } label: {
                Text("‹ Tilbake").font(PF.ui(16, .bold)).foregroundStyle(DS.color(.accent, stil: .papir)).frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text("TAILSCALE").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
            Text("Tailnet").font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
            Text(m.loaded ? "\(m.online) av \(m.total) enheter online" : "Enheter, latens og oppetid").font(PF.ui(13)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 6)
    }
}

struct TailnetStats: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        LazyVGrid(columns: cols, alignment: .leading, spacing: 12) {
            ForEach(Array(m.stats.prefix(4))) { (s: TailnetStat) in
                VStack(alignment: .leading, spacing: 2) {
                    Rectangle().fill(p.ink).frame(height: 2)
                    Text(s.label).font(PF.mono(10)).tracking(1).foregroundStyle(DS.color(.accent, stil: .papir)).padding(.top, 6)
                    Text(s.value).font(PF.serif(28)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.7)
                    Text(s.sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

struct TailnetSearch: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(p.mut)
            TextField("Søk navn eller IP", text: Binding<String>(get: { m.query }, set: { (v: String) in m.query = v; m.showAll = false }))
                .font(PF.ui(15)).foregroundStyle(p.ink).autocorrectionDisabled(true).textInputAutocapitalization(.never)
        }
        .padding(.horizontal, 14).frame(height: 44)
        .background(p.card, in: Capsule())
        .overlay(Capsule().stroke(p.line, lineWidth: 1))
    }
}

struct TailnetPills: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(m.filters) { (f: TailnetFilter) in
                    let on: Bool = m.filter == f.id
                    Button { Haptics.shared.tap(); m.filter = f.id; m.showAll = false } label: {
                        HStack(spacing: 6) {
                            Text(f.navn).font(PF.ui(13, .semibold))
                            Text("\(f.count)").font(PF.mono(11, bold: false)).opacity(0.75)
                        }
                        .foregroundStyle(on ? p.bg : p.ink)
                        .padding(.horizontal, 14).frame(height: 34)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                        .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                        .frame(minHeight: 44).contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }
}

struct TailnetList: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }

    var body: some View {
        let all: [TailnetEnhet] = m.shown
        let list: [TailnetEnhet] = m.showAll ? all : Array(all.prefix(8))
        VStack(alignment: .leading, spacing: 0) {
            if all.isEmpty {
                Text(m.loading ? "Henter …" : "Ingen enheter passer.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(16)
            }
            ForEach(list) { (d: TailnetEnhet) in
                TailnetRow(d: d)
                if d.id != list.last?.id { Rectangle().fill(p.line).frame(height: 1).padding(.leading, 60) }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        if all.count > 8 {
            Button { Haptics.shared.tap(); m.showAll.toggle() } label: {
                Text(m.showAll ? "Vis færre" : "Vis alle \(all.count)").font(PF.ui(14, .semibold)).foregroundStyle(DS.color(.accent, stil: .papir)).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
        }
    }
}

struct TailnetRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }
    let d: TailnetEnhet

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { m.toggle(store, d.id) } label: {
                HStack(spacing: 12) {
                    Image(systemName: Tailnet.symbol(d.kind)).font(.system(size: 15, weight: .medium)).foregroundStyle(p.mut)
                        .frame(width: 34, height: 34).background(p.bg, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(d.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Text(d.ip).font(PF.mono(11, bold: false)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Text(d.latencyLabel).font(PF.mono(12, bold: false)).foregroundStyle(d.online && d.latencyKnown ? p.ink : p.mut).lineLimit(1)
                    Circle().fill(d.online ? DS.color(.success, stil: .papir) : p.mut.opacity(0.5)).frame(width: 8, height: 8)
                }
                .padding(.horizontal, 14).frame(minHeight: 60)
                .opacity(d.online ? 1 : 0.55)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(d.name + ", " + d.statusLabel + ", " + d.latencyLabel)
            if m.expanded == d.id { TailnetDetail(d: d).padding(.horizontal, 14).padding(.bottom, 14) }
        }
    }
}

struct TailnetDetail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }
    let d: TailnetEnhet

    var body: some View {
        let x: TailnetDetalj? = m.detail[d.id]
        VStack(alignment: .leading, spacing: 12) {
            if let x {
                VStack(spacing: 0) {
                    ForEach(x.fakta) { (f: TailnetFakta) in
                        HStack(alignment: .firstTextBaseline) {
                            Text(f.label).font(PF.ui(13)).foregroundStyle(p.mut)
                            Spacer(minLength: 12)
                            Text(f.value).font(f.mono ? PF.mono(12, bold: false) : PF.ui(13)).foregroundStyle(p.ink).multilineTextAlignment(.trailing).textSelection(.enabled)
                        }
                        .padding(.vertical, 6)
                    }
                }
                Text("LATENS 24 T").font(PF.mono(10)).tracking(1).foregroundStyle(DS.color(.accent, stil: .papir))
                TailnetSpark(values: x.spark).frame(height: 36)
                Text(x.latensTekst).font(PF.ui(12)).foregroundStyle(p.mut)
                Text("OPPETID 30 D").font(PF.mono(10)).tracking(1).foregroundStyle(DS.color(.accent, stil: .papir))
                TailnetStripe(states: x.stripe).frame(height: 22)
                Text(x.oppetidTekst).font(PF.ui(12)).foregroundStyle(p.mut)
                if x.canPing {
                    Button { Task { await m.pingNow(store, d.id) } } label: {
                        Text("Ping nå").font(PF.ui(15, .semibold)).foregroundStyle(p.bg).frame(maxWidth: .infinity).frame(height: 46).background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                if let r = m.ping[d.id] { Text(r).font(PF.mono(12, bold: false)).foregroundStyle(p.ink) }
                HStack(spacing: 8) {
                    if !d.ip.isEmpty { TailnetSmallButton(title: "Kopier IP") { m.copy(d.ip, "IP-en") } }
                    TailnetSmallButton(title: "Kopier SSH") { m.copy(d.ssh, "SSH-kommandoen") }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(12)
            }
        }
    }
}

struct TailnetSmallButton: View {
    @Environment(\.paper) private var p
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity).frame(height: 44)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Latens per time siste 24 t (null = ingen måling, linja brytes der).
struct TailnetSpark: View {
    @Environment(\.paper) private var p
    let values: [Double?]

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let nums: [Double] = values.compactMap { $0 }
            let top: Double = max(nums.max() ?? 1, 1)
            let n: Int = max(values.count - 1, 1)
            Path { (path: inout Path) in
                var pen: Bool = false
                for (i, v) in values.enumerated() {
                    guard let v else { pen = false; continue }
                    let pt: CGPoint = CGPoint(x: g.size.width * CGFloat(i) / CGFloat(n), y: g.size.height - CGFloat(v / top) * (g.size.height - 4) - 2)
                    if pen { path.addLine(to: pt) } else { path.move(to: pt); pen = true }
                }
            }
            .stroke(p.ink, lineWidth: 1.5)
        }
        .accessibilityHidden(true)
    }
}

/// Oppetidsstripen: 30 felt, blekk = oppe, gul = delvis, aksent = nede.
struct TailnetStripe: View {
    @Environment(\.paper) private var p
    let states: [String]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<states.count, id: \.self) { (i: Int) in
                RoundedRectangle(cornerRadius: 2, style: .continuous).fill(color(states[i]))
            }
        }
        .accessibilityHidden(true)
    }

    private func color(_ s: String) -> Color {
        switch s {
        case "oppe": return p.ink
        case "delvis": return DS.color(.warning, stil: .papir)
        case "nede": return DS.color(.accent, stil: .papir)
        default: return p.line
        }
    }
}

struct TailnetMaintRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tailnet { Tailnet.shared }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wrench.and.screwdriver").foregroundStyle(p.mut).frame(width: 34, height: 34).background(p.bg, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("Vedlikehold").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text("Nøkler, oppdateringer og gamle enheter · se web").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer()
            Text("\(m.maintenance)").font(PF.mono(14)).foregroundStyle(p.ink)
        }
        .padding(.horizontal, 14).frame(minHeight: 60)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
