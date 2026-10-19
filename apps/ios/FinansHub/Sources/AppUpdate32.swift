import SwiftUI

/* ---------------- Prompt 32 (APKUPD): versjonen av appen og «Last ned IPA» ---------------- */
//
// Android oppdaterer seg selv (AppUpdate32.kt). iPhone kan ikke installere sin egen IPA ved sideloading, så her vises
// bare versjonen og en lenke til release-siden (AltStore, SideStore eller Sideloadly tar seg av resten).
// Kilde: GET /api/app/android/latest (server/app-update.js) → {version, releaseUrl, ipaUrl, …}. Sjekkes maks hver 6. time.

@MainActor
@Observable
final class AppUpd32Model {
    static let shared = AppUpd32Model()

    var latest: String = ""
    var releaseURL: URL? = nil
    var loaded: Bool = false
    @ObservationIgnored private var checkedAt: Date = .distantPast

    var current: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–" }

    var newer: Bool { !latest.isEmpty && AppUpd32Model.compare(latest, current) > 0 }

    static func compare(_ a: String, _ b: String) -> Int {
        let pa: [Int] = a.split(separator: ".").map { Int($0) ?? 0 }
        let pb: [Int] = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let x: Int = i < pa.count ? pa[i] : 0
            let y: Int = i < pb.count ? pb[i] : 0
            if x != y { return x > y ? 1 : -1 }
        }
        return 0
    }

    func load(_ store: Store, force: Bool = false) async {
        if !force && Date().timeIntervalSince(checkedAt) < 6 * 3600 { return }
        checkedAt = Date()
        guard let d: Data = try? await store.api.callAt("/api", "GET", "/app/android/latest", timeout: 15),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { loaded = true; return }
        latest = (o["version"] as? String) ?? ""
        let rel: String = (o["releaseUrl"] as? String) ?? ""
        releaseURL = rel.hasPrefix("https://github.com/") ? URL(string: rel) : nil
        loaded = true
    }
}

/// PROGRAMVARE: «FinansHub-appen 4.23.0 · Ny 4.24.0» → «Last ned IPA ›» (åpner release-siden).
struct AppUpd32Row: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    let label: Bool
    @MainActor private var m: AppUpd32Model { AppUpd32Model.shared }

    var body: some View {
        let sub: String = !m.loaded ? "Sjekker versjon …" : (m.newer ? "Ny \(m.latest)" : "Siste versjon")
        let canOpen: Bool = m.releaseURL != nil && m.newer
        VStack(alignment: .leading, spacing: 0) {
            if label { PLabel(text: "Programvare").padding(.top, 12).padding(.leading, 4) }
            Button {
                if let u: URL = m.releaseURL { openURL(u) } else { Task { await m.load(store, force: true) } }
            } label: {
                HStack(spacing: 10) {
                    Set30Icon(symbol: "iphone.and.arrow.forward", tint: Set30Colors.system)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("FinansHub-appen \(m.current)").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                        Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut)
                    }
                    Spacer(minLength: 6)
                    Text(canOpen ? "Last ned IPA" : (m.loaded ? "✓" : "")).font(PF.ui(14, .bold)).foregroundStyle(canOpen ? p.lab : p.pos)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(p.mut)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.top, label ? 0 : 8)
        }
        .task { await m.load(store) }
    }
}
