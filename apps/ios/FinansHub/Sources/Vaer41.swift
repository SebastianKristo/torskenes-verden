import SwiftUI
import UIKit

/* ---------------- Prompt 41: Vær – rediger kort (wiggle) og Glimt skiføre ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-vaer-rediger-ski-julfigur.md. Fasit: Vaer.dc.html (voVals, skiVals).
   – Kortene i rekkefølge og skjulte kort per bruker: GET/PUT /api/weather/layout {order, hidden, ski, glimt:'top'|'bottom'}
     (na, ski, timer, dager10, yrstorm, vind, mane, detaljer, glimtuka). Hold inne et kort 0,6 s uten å bevege (og uten at siden
     scroller) eller trykk «Rediger kort» nederst → kortene vugger (±0,6°) og arket «Rediger Vær» kommer opp (↑ ↓, vis/skjul,
     «Glimt-kortet øverst / nederst», Nullstill, Ferdig). Scroll virker hele tiden.
   – Skiføre: /api/weather/full gir ski {text, chip, wax, grip, glide, title, places:[{name, snowCm, newCm, tempC, humidity, url}]} når
     snødybden i Nordmarka er ≥ 15 cm og «Skiføre» ikke er slått av. Kortet: Spire-figuren, «✦ GLIMT ANBEFALER», smøring, fire tall,
     «Feste: …» / «Glid: …» (etikettene lages ferdige, med mellomrom) og «Løyper ↗» (skisporet.no). */

struct Ski41: Hashable {
    var title: String = "SKIFØRE · NORDMARKA"
    var text: String = ""
    var wax: String = ""
    var grip: String = ""
    var glide: String = ""
    var place: String = "Nordmarka"
    var snowCm: Double = 0
    var newCm: Double = 0
    var tempC: Double = 0
    var humidity: Double = 0
    var url: String = "https://skisporet.no"

    init?(_ o: [String: Any]?) {
        guard let o, JS.str(o, "text") != nil || JS.str(o, "wax") != nil else { return nil }
        title = JS.str(o, "title") ?? title
        text = JS.str(o, "text") ?? ""
        wax = JS.str(o, "wax") ?? ""
        grip = JS.str(o, "grip") ?? (wax.isEmpty ? "" : "Feste: " + wax)
        glide = JS.str(o, "glide") ?? ""
        if let p = JS.list(o, "places").first {
            place = JS.str(p, "name") ?? place
            snowCm = JS.num(p, "snowCm") ?? 0
            newCm = JS.num(p, "newCm") ?? 0
            tempC = JS.num(p, "tempC") ?? 0
            humidity = JS.num(p, "humidity") ?? 0
            url = JS.str(p, "url") ?? url
        }
    }
}

@MainActor
@Observable
final class Vaer41 {
    static let shared = Vaer41()
    static let all: [(String, String)] = [("na", "Nå"), ("ski", "Skiføre"), ("timer", "Time for time"), ("dager10", "10 dager"), ("yrstorm", "Yr mot Storm"),
                                         ("vind", "Vind"), ("mane", "Måne"), ("detaljer", "Detaljer"), ("glimtuka", "Glimt · uka")]
    static let defaultOrder: [String] = ["na", "ski", "timer", "dager10", "yrstorm", "vind", "mane", "detaljer", "glimtuka"]

    var order: [String] = Vaer41.defaultOrder
    var hidden: [String] = []
    var ski: Bool = true
    var glimt: String = "bottom"
    var skiData: Ski41? = nil
    var editing: Bool = false
    var sheet: Bool = false
    @ObservationIgnored var lastScroll: Date = .distantPast
    @ObservationIgnored private var loaded: Bool = false

    func load(_ store: Store) async {
        if loaded { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/weather/layout", timeout: 10) else { return }
        loaded = true
        take(JS.obj(d))
    }

    private func take(_ o: [String: Any]) {
        let ord: [String] = JS.strings(o, "order").filter { (k: String) -> Bool in Vaer41.defaultOrder.contains(k) }
        var full: [String] = ord
        for k in Vaer41.defaultOrder where !full.contains(k) { full.append(k) }
        order = full
        hidden = JS.strings(o, "hidden")
        ski = JS.bool(o, "ski") ?? true
        glimt = JS.str(o, "glimt") == "top" ? "top" : "bottom"
    }

    /// Kortene som vises, i rekkefølge. Glimt-kortet øverst eller nederst etter valget.
    var visible: [String] {
        var list: [String] = order.filter { !hidden.contains($0) && $0 != "glimtuka" }
        if !ski { list.removeAll { $0 == "ski" } }
        if !hidden.contains("glimtuka") {
            if glimt == "top" { list.insert("glimtuka", at: list.first == "na" ? 1 : 0) } else { list.append("glimtuka") }
        }
        return list
    }

    func move(_ k: String, _ d: Int) {
        guard let i = order.firstIndex(of: k) else { return }
        let j: Int = i + d
        guard j >= 0 && j < order.count else { return }
        Haptics.shared.select()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order.swapAt(i, j) }
    }

    func toggle(_ k: String) {
        Haptics.shared.select()
        if k == "ski" { ski.toggle(); return }
        if hidden.contains(k) { hidden.removeAll { $0 == k } } else { hidden.append(k) }
    }

    func isOn(_ k: String) -> Bool { k == "ski" ? ski : !hidden.contains(k) }

    func reset() {
        Haptics.shared.tap()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            order = Vaer41.defaultOrder
            hidden = []
            ski = true
            glimt = "bottom"
        }
    }

    /// Hold inne et kort: bare når siden ikke har scrollet de siste 0,7 s (et hold er stille).
    func holdStart() {
        if Date().timeIntervalSince(lastScroll) < 0.7 { return }
        begin()
    }

    func begin() {
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) { editing = true }
        sheet = true
    }

    func done(_ store: Store) {
        withAnimation(.easeOut(duration: 0.2)) { editing = false }
        sheet = false
        let body: [String: Any] = ["order": order, "hidden": hidden, "ski": ski, "glimt": glimt]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/weather/layout", json: body, timeout: 10) }
    }
}

/// Vugging ±0,6° mens Vær redigeres.
struct Vaer41Wiggle: ViewModifier {
    @MainActor private var v: Vaer41 { Vaer41.shared }
    let index: Int
    @State private var on: Bool = false

    func body(content: Content) -> some View {
        let sign: Double = index % 2 == 0 ? 1 : -1
        content
            .rotationEffect(.degrees(v.editing ? (on ? 0.6 : -0.6) * sign : 0))
            .animation(v.editing ? .easeInOut(duration: 0.3).repeatForever(autoreverses: true) : .default, value: on)
            .onChange(of: v.editing) { _, e in on = e }
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.6, maximumDistance: 6).onEnded { (_: Bool) in
                if !v.editing { v.holdStart() }
            })
    }
}

extension View {
    func vaer41Wiggle(_ index: Int) -> some View { modifier(Vaer41Wiggle(index: index)) }
}

/// «Rediger kort» nederst på Vær-siden.
struct Vaer41EditButton: View {
    @MainActor private var v: Vaer41 { Vaer41.shared }

    var body: some View {
        Button { v.begin() } label: {
            Text("Rediger kort").font(.dyn51(size: 13.5, weight: .semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).frame(height: 36)
                .background(Color.white.opacity(0.14), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Arket «Rediger Vær».
struct Vaer41Sheet: View {
    @Environment(Store.self) private var store
    @MainActor private var v: Vaer41 { Vaer41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Rediger Vær").font(.dyn51(size: 22, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Button { v.done(store) } label: {
                    Text("Ferdig").font(.dyn51(size: 14, weight: .bold)).foregroundStyle(Color(hex: "#17191e"))
                        .padding(.horizontal, 16).frame(height: 34).background(Color.white, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(v.order.enumerated()), id: \.element) { i, k in
                        row(k, i)
                    }
                }
                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            HStack(spacing: 8) {
                Button { Haptics.shared.select(); v.glimt = v.glimt == "top" ? "bottom" : "top" } label: {
                    Text(v.glimt == "top" ? "Glimt-kortet nederst" : "Glimt-kortet øverst").font(.dyn51(size: 13, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 14).frame(height: 36).background(Color.white.opacity(0.14), in: Capsule())
                }
                .buttonStyle(.plain)
                Spacer()
                Button { v.reset() } label: {
                    Text("Nullstill").font(.dyn51(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
                        .padding(.horizontal, 14).frame(height: 36).overlay(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(Color(hex: "#17191e").ignoresSafeArea())
        .environment(\.colorScheme, .dark)
    }

    private func row(_ k: String, _ i: Int) -> some View {
        let name: String = Vaer41.all.first(where: { $0.0 == k })?.1 ?? k
        return HStack(spacing: 10) {
            Text(name).font(.dyn51(size: 15, weight: .semibold)).foregroundStyle(.white.opacity(v.isOn(k) ? 1 : 0.5))
            Spacer()
            Button { v.move(k, -1) } label: { Image(systemName: "chevron.up").font(.dyn51(size: 13, weight: .bold)).foregroundStyle(.white).frame(width: 32, height: 32) }
                .buttonStyle(.plain).disabled(i == 0).opacity(i == 0 ? 0.3 : 1).accessibilityLabel("Flytt " + name + " opp")
            Button { v.move(k, 1) } label: { Image(systemName: "chevron.down").font(.dyn51(size: 13, weight: .bold)).foregroundStyle(.white).frame(width: 32, height: 32) }
                .buttonStyle(.plain).disabled(i == v.order.count - 1).opacity(i == v.order.count - 1 ? 0.3 : 1).accessibilityLabel("Flytt " + name + " ned")
            Toggle("", isOn: Binding<Bool>(get: { v.isOn(k) }, set: { (_: Bool) in v.toggle(k) })).labelsHidden().tint(Color(hex: "#3fbf7a"))
        }
        .padding(.horizontal, 14).frame(minHeight: 50)
        .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1) } }
    }
}

/// «SKIFØRE · NORDMARKA» med Spire-figuren og Glimts anbefaling.
struct Vaer41SkiCard: View {
    @Environment(Store.self) private var store
    let s: Ski41

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.title).font(.dyn51(size: 12, weight: .heavy)).tracking(1.6).opacity(0.85)
                    Text("✦ GLIMT ANBEFALER").font(.dyn51(size: 11, weight: .bold)).tracking(1.2).foregroundStyle(Color(hex: "#f2c14e"))
                    Text(s.wax.isEmpty ? s.grip : s.wax).font(.dyn51(size: 24, weight: .bold)).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                    Glimt35Fig(id: "spire", size: 54, t: ctx.date.timeIntervalSinceReferenceDate)
                }
                .frame(width: 60, height: 64)
            }
            Text(s.text).font(.dyn51(size: 14)).opacity(0.9).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                stat(String(Int(s.snowCm)) + " cm", "snødybde")
                stat(String(Int(s.newCm)) + " cm", "ny snø")
                stat(String(Int(s.tempC.rounded())) + "°", "temp")
                stat(String(Int(s.humidity)) + " %", "fukt")
            }
            HStack(spacing: 8) {
                if !s.grip.isEmpty { chip(s.grip) }
                if !s.glide.isEmpty { chip(s.glide) }
                Spacer(minLength: 4)
                Button { store.openLink(s.url) } label: {
                    Text("Løyper ↗").font(.dyn51(size: 13, weight: .semibold)).underline()
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(.white)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
    }

    private func stat(_ v: String, _ l: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(v).font(.dyn51(size: 16, weight: .bold)).monospacedDigit()
            Text(l).font(.dyn51(size: 11)).opacity(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chip(_ t: String) -> some View {
        Text(t).font(.dyn51(size: 12.5, weight: .semibold)).lineLimit(1)
            .padding(.horizontal, 10).frame(height: 28)
            .background(Color.white.opacity(0.14), in: Capsule())
    }
}
