import SwiftUI
import UIKit

/* ---------------- Prompt 51 (QA51): feature flags og «Nytt i denne versjonen» ---------------- */
// • GET /api/flags med X-Device-Id (fast installasjons-id, FHDevice51.swift) → {flags:{navn:bool}}. Bufret per konto i
//   UserDefaults, hentet ved oppstart, når appen kommer i forgrunnen og hver time (FH51Host i FHSec51.swift).
//   Bruk: Flags51.shared.on("navn") eller store.flags.on("navn"). Ukjent flagg = av.
// • GET /api/whatsnew → {version, title, items, show}. show = true → kortet vises én gang; lukking → POST /api/whatsnew/seen.

@MainActor
@Observable
final class Flags51 {
    static let shared = Flags51()

    private(set) var flags: [String: Bool] = [:]
    @ObservationIgnored private var scope: String = ""
    @ObservationIgnored private var fetchedAt: Date? = nil
    @ObservationIgnored private var running: Bool = false

    /// Er flagget på for denne brukeren/enheten? Ukjente og nye flagg er av.
    func on(_ key: String) -> Bool { flags[key] ?? false }

    func refresh(_ store: Store, force: Bool = false) async {
        guard let acc = store.account else { return }
        if acc.id != scope {
            scope = acc.id
            fetchedAt = nil
            flags = Flags51.cached(acc.id)
        }
        if !force, let at = fetchedAt, Date().timeIntervalSince(at) < 3600 { return }
        if running { return }
        running = true
        defer { running = false }
        do {
            let d: Data = try await store.api.send51("GET", "/api/flags", headers: Flags51.headers, timeout: 15)
            let raw: [String: Any] = (JS.obj(d)["flags"] as? [String: Any]) ?? [:]
            var out: [String: Bool] = [:]
            for (k, v) in raw {
                if let b = v as? Bool { out[k] = b } else if let n = v as? NSNumber { out[k] = n.boolValue }
            }
            guard store.account?.id == acc.id else { return }
            flags = out
            fetchedAt = Date()
            UserDefaults.standard.set(out, forKey: "flags51_" + acc.id)
        } catch {
            // Beholder bufferen; nytt forsøk om omtrent 10 minutter.
            fetchedAt = Date().addingTimeInterval(-3000)
        }
    }

    nonisolated static var headers: [String: String] {
        ["X-Device-Id": Device51.installId, "X-Client-Platform": "ios", "X-Device-Name": "FinansHub · " + Device51.machine]
    }

    private static func cached(_ id: String) -> [String: Bool] {
        (UserDefaults.standard.dictionary(forKey: "flags51_" + id) as? [String: Bool]) ?? [:]
    }
}

extension Store {
    /// Prompt 51: store.flags.on("navn").
    var flags: Flags51 { Flags51.shared }
}

struct WhatsNew51Card {
    let version: String
    let title: String
    let date: String
    let items: [String]
}

@MainActor
@Observable
final class WhatsNew51 {
    static let shared = WhatsNew51()

    private(set) var card: WhatsNew51Card? = nil
    @ObservationIgnored private var checked: Set<String> = []
    @ObservationIgnored private var api: API? = nil

    func check(_ store: Store) async {
        guard let acc = store.account, !store.locked, card == nil, !checked.contains(acc.id) else { return }
        checked.insert(acc.id)
        let a: API = store.api
        guard let d = try? await a.callAt("/api", "GET", "/whatsnew", timeout: 15) else { return }
        let o: [String: Any] = JS.obj(d)
        guard JS.bool(o, "show") == true, let v = JS.str(o, "version") else { return }
        let items: [String] = JS.strings(o, "items").map { WhatsNew51.clean($0) }.filter { !$0.isEmpty }
        guard !items.isEmpty, store.account?.id == acc.id else { return }
        api = a
        card = WhatsNew51Card(version: v, title: WhatsNew51.clean(JS.str(o, "title") ?? ""), date: JS.str(o, "date") ?? "", items: Array(items.prefix(12)))
    }

    /// Lukket (knapp eller sveip): markeres som sett, så kortet bare vises én gang per versjon.
    func dismiss() {
        guard let c = card else { return }
        card = nil
        guard let a = api else { return }
        let v: String = c.version
        Task { _ = try? await a.callAt("/api", "POST", "/whatsnew/seen", json: ["version": v], timeout: 15) }
    }

    nonisolated static func clean(_ s: String) -> String {
        var t: String = s.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "`", with: "")
        t = t.trimmingCharacters(in: .whitespacesAndNewlines)
        while t.hasPrefix("-") || t.hasPrefix("*") || t.hasPrefix("•") { t = String(t.dropFirst()).trimmingCharacters(in: .whitespaces) }
        return t
    }
}

struct WhatsNew51Sheet: View {
    @Environment(\.paper) private var p
    @MainActor private var m: WhatsNew51 { WhatsNew51.shared }

    var body: some View {
        let c: WhatsNew51Card? = m.card
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PLabel(text: "Nytt i denne versjonen")
                Text(heading(c)).font(PF.serif(28, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                if let c, !c.version.isEmpty {
                    Text("Versjon \(c.version)\(c.date.isEmpty ? "" : " · " + c.date)").font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
                }
                ForEach(Array((c?.items ?? []).enumerated()), id: \.offset) { _, t in
                    WhatsNew51Item(text: t)
                }
                PInkButton(title: "Fint, takk", height: 50, full: true) { m.dismiss() }
                    .padding(.top, 8)
            }
            .padding(.horizontal, 22).padding(.top, 26).padding(.bottom, 30)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private func heading(_ c: WhatsNew51Card?) -> String {
        let t: String = c?.title ?? ""
        return t.isEmpty ? "Dette er nytt" : t
    }
}

private struct WhatsNew51Item: View {
    @Environment(\.paper) private var p
    let text: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("•").font(PF.ui(15, .bold)).foregroundStyle(p.lab)
            Text(text).font(PF.ui(15)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}
