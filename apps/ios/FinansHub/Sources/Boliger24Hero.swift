import SwiftUI
import UIKit

/* ---------------- Prompt 24: toppbildet på Boliger og domene-pillen ---------------- */

/// Bakgrunnen til valgt bolig i toppbildet (Strømstad-bildet eller eget bilde). «Farge» gir vanlig toppbilde.
/// Bytter med krysstoning på 200 ms. Gradienten i PaperHero ligger over, som på de andre toppbildene.
struct Bol24HeroLayer: View {
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        ZStack {
            if let img = m.heroImage {
                Color.clear
                    .overlay { Image(uiImage: img).resizable().scaledToFill() }
                    .clipped()
                    .id(m.heroKey)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: 0.2), value: m.heroKey)
        .allowsHitTesting(false)
    }
}

/// Domene-sammendraget: besøk i dag, antall domener og status. Hentes høyst hvert 5. minutt.
@MainActor
@Observable
final class Dom24Summary {
    static let shared = Dom24Summary()
    var visits: Double? = nil
    var domains: Int = 0
    var status: String = "ok"
    var available: Bool = false
    private var last: Date = .distantPast

    /// «48 597» med mellomrom som tusenskille (besøk er ikke beløp og skjules aldri).
    nonisolated static func format(_ v: Double) -> String {
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: v)) ?? String(Int(v))
    }

    func load(_ store: Store, force: Bool = false) async {
        if !force && Date().timeIntervalSince(last) < 300 { return }
        last = Date()
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/domains/summary", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            visits = JS.num(o, "visitsToday")
            domains = JS.int(o, "domains") ?? JS.list(o, "domains").count
            status = JS.str(o, "status") ?? "ok"
            available = true
        } catch {
            // 404 (eldre server) eller 403 (ikke admin): pillen vises ikke.
            available = false
        }
    }
}

/// Mørk glass-pille i toppbildet til høyre for «Boliger»: globus, «48 597», «besøk i dag · 5 domener» og statusprikk.
struct Dom24Pill: View {
    @Environment(Store.self) private var store
    @MainActor private var s: Dom24Summary { Dom24Summary.shared }

    var body: some View {
        Group {
            if s.available {
                Button {
                    Haptics.shared.tap()
                    store.paperOpenDomains(from: "boliger")
                } label: {
                    pill
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Åpne Domener")
            }
        }
        .task {
            await s.load(store)
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 300_000_000_000)
                if Task.isCancelled { break }
                await s.load(store, force: true)
            }
        }
    }

    private var dot: Color {
        switch s.status {
        case "error": return Color(hex: "#e5533d")
        case "warn": return Color(hex: "#e0b33a")
        default: return Color(hex: "#5fd38a")
        }
    }

    private var pill: some View {
        HStack(spacing: 8) {
            Image(systemName: "globe").font(.dyn51(size: 14, weight: .semibold))
            VStack(alignment: .leading, spacing: 0) {
                Text(s.visits.map { Dom24Summary.format($0) } ?? "–").font(PF.mono(14)).lineLimit(1)
                Text("besøk i dag · \(s.domains) " + (s.domains == 1 ? "domene" : "domener")).font(PF.ui(10.5, .semibold)).opacity(0.85).lineLimit(1)
            }
            Circle().fill(dot).frame(width: 8, height: 8)
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background(Capsule().fill(Color(hex: "#1b1a17").opacity(0.55)))
        .overlay(Capsule().strokeBorder(Color.white.opacity(0.18), lineWidth: 1))
        .fixedSize()
    }
}
