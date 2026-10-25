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
    /// Prompt 52: strukturerte punkter (overskrift + kort tekst + ev. «Les mer») og ferdige etiketter fra serveren.
    var points: [WhatsNew52Point] = []
    var label: String = "NYTT I HOMELAB"
    var heading: String = ""
    var dateLabel: String = ""
}

struct WhatsNew52Point: Hashable {
    let title: String
    let text: String
    let more: String
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
        // Prompt 52 (SERVER52-API.md § 8): points [{title, text, more}], label, heading, date_label.
        let points: [WhatsNew52Point] = JS.list(o, "points").compactMap { (x: [String: Any]) -> WhatsNew52Point? in
            let t: String = WhatsNew51.clean(JS.str(x, "title") ?? "")
            let b: String = WhatsNew51.clean(JS.str(x, "text") ?? "")
            if t.isEmpty && b.isEmpty { return nil }
            return WhatsNew52Point(title: t, text: b, more: WhatsNew51.clean(JS.str(x, "more") ?? ""))
        }
        guard !items.isEmpty || !points.isEmpty, store.account?.id == acc.id else { return }
        api = a
        card = WhatsNew51Card(version: v, title: WhatsNew51.clean(JS.str(o, "title") ?? ""), date: JS.str(o, "date") ?? "", items: Array(items.prefix(12)),
                              points: Array(points.prefix(12)), label: JS.str(o, "label") ?? "NYTT I HOMELAB",
                              heading: JS.str(o, "heading") ?? "", dateLabel: JS.str(o, "date_label") ?? "")
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
        // Prompt 52: interne merknader («(prompt 51)», «prompt 51:», «runde 2») vises aldri for brukeren.
        for pat in ["\\s*\\((prompt|runde)[^)]*\\)", "(?i)\\bprompt\\s*\\d+[a-z]?\\s*[:·–-]?\\s*", "(?i)\\brunde\\s*\\d+\\s*[:·–-]?\\s*"] {
            t = t.replacingOccurrences(of: pat, with: "", options: [.regularExpression, .caseInsensitive])
        }
        t = t.trimmingCharacters(in: .whitespacesAndNewlines)
        while t.hasPrefix("-") || t.hasPrefix("*") || t.hasPrefix("•") { t = String(t.dropFirst()).trimmingCharacters(in: .whitespaces) }
        return t
    }
}

/// Prompt 52 (claude-code-nytt-i-versjon-lesbar.md): ugjennomsiktig papirark med fast hode og bunn, grå dato, ett punkt per
/// blokk med overskrift, fade nederst i lista og mørk «Ok»-knapp. Interne merknader er fjernet (WhatsNew51.clean).
struct WhatsNew51Sheet: View {
    @Environment(\.paper) private var p
    @MainActor private var m: WhatsNew51 { WhatsNew51.shared }

    /// Lyst: fargene i spesifikasjonen. Mørkt: temaets farger (samme kontrast).
    private var bg: Color { p.dark ? p.bg : Color(hex: "#fbf8f2") }
    private var ink: Color { p.dark ? p.ink : Color(hex: "#1b1a17") }
    private var soft: Color { p.dark ? p.ink.opacity(0.86) : Color(hex: "#3d3a34") }
    private var mut: Color { p.dark ? p.mut : Color(hex: "#6b665c") }
    private var line: Color { p.dark ? p.line : Color(hex: "#d8d1c2") }
    private var sep: Color { p.dark ? p.line.opacity(0.7) : Color(hex: "#e6dfd2") }

    var body: some View {
        let c: WhatsNew51Card? = m.card
        VStack(spacing: 0) {
            head(c)
            Rectangle().fill(line).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(points(c).enumerated()), id: \.offset) { (pair: (offset: Int, element: WhatsNew52Point)) in
                        if pair.offset > 0 { Rectangle().fill(sep).frame(height: 1).padding(.vertical, 14) }
                        WhatsNew52Block(point: pair.element, ink: ink, soft: soft, mut: mut)
                    }
                }
                .padding(.horizontal, 24).padding(.top, 16).padding(.bottom, 28)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .overlay(alignment: .bottom) {
                LinearGradient(colors: [bg.opacity(0), bg], startPoint: .top, endPoint: .bottom).frame(height: 28).allowsHitTesting(false)
            }
            Rectangle().fill(line).frame(height: 1)
            HStack {
                Spacer()
                Button { m.dismiss() } label: {
                    Text("Ok").font(PF.ui(14.5, .bold)).foregroundStyle(p.dark ? p.bg : Color(hex: "#f3efe6"))
                        .padding(.horizontal, 26).frame(height: 46)
                        .background(p.dark ? p.ink : Color(hex: "#1b1a17"), in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 20)
        }
        .background(bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private func head(_ c: WhatsNew51Card?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(c?.label.isEmpty == false ? (c?.label ?? "") : "NYTT I HOMELAB").font(PF.mono(10.5)).tracking(1.26)
                .foregroundStyle(p.dark ? p.lab : Color(hex: "#b23a2a"))
            Text(heading(c)).font(PF.serif(28, medium: true)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
            let d: String = dateText(c)
            if !d.isEmpty { Text(d).font(PF.ui(13, .medium)).foregroundStyle(mut) }
        }
        .padding(.horizontal, 24).padding(.top, 22).padding(.bottom, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func heading(_ c: WhatsNew51Card?) -> String {
        if let h = c?.heading, !h.isEmpty { return h }
        if let v = c?.version, !v.isEmpty { return "Versjon " + v }
        let t: String = c?.title ?? ""
        return t.isEmpty ? "Dette er nytt" : t
    }

    private func dateText(_ c: WhatsNew51Card?) -> String {
        guard let c else { return "" }
        if !c.dateLabel.isEmpty { return c.dateLabel }
        guard let d = parseDay(c.date) else { return c.date }
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "d. MMMM yyyy"
        return f.string(from: d)
    }

    /// Punktene fra serveren, ellers én blokk per linje (eldre server): «Overskrift: tekst» deles på første kolon.
    private func points(_ c: WhatsNew51Card?) -> [WhatsNew52Point] {
        guard let c else { return [] }
        if !c.points.isEmpty { return c.points }
        return c.items.map { (t: String) -> WhatsNew52Point in
            if let r = t.range(of: ": "), t.distance(from: t.startIndex, to: r.lowerBound) <= 60 {
                return WhatsNew52Point(title: String(t[..<r.lowerBound]), text: String(t[r.upperBound...]), more: "")
            }
            return WhatsNew52Point(title: "", text: t, more: "")
        }
    }
}

/// Ett punkt: overskrift (Manrope 700 15) og brødtekst (Manrope 400 14/1,55, maks 4 linjer) med «Les mer».
struct WhatsNew52Block: View {
    let point: WhatsNew52Point
    let ink: Color
    let soft: Color
    let mut: Color
    @State private var open: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !point.title.isEmpty {
                Text(point.title).font(PF.ui(15, .bold)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
            }
            if !point.text.isEmpty {
                Text(point.text).font(PF.ui(14)).foregroundStyle(soft).lineSpacing(14 * 0.55 - 4)
                    .lineLimit(open ? nil : 4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if open && !point.more.isEmpty {
                Text(point.more).font(PF.ui(13.5)).foregroundStyle(soft).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            }
            if !point.more.isEmpty || point.text.count > 220 {
                Button { withAnimation(.easeOut(duration: 0.18)) { open.toggle() } } label: {
                    Text(open ? "Vis mindre" : "Les mer").font(PF.ui(13, .bold)).foregroundStyle(mut).frame(minHeight: 32)
                }
                .buttonStyle(.plain)
            }
        }
        .accessibilityElement(children: .combine)
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
