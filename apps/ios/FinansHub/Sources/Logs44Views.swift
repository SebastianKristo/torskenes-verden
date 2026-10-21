import SwiftUI
import UIKit

/* ---------------- Prompt 44: Logger – containere, filter, mørkt loggvindu, feil gruppert og detaljer med Glimt ---------------- */

struct Logs44Containers: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Logs44 { Logs44.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Logs44CtChip(name: "Alle", color: "", errors: 0, on: m.ct.isEmpty) { pick("") }
                ForEach(m.containers) { (c: Log44Container) in
                    Logs44CtChip(name: c.name, color: c.color, errors: c.errors, on: m.ct == c.name) { pick(c.name) }
                }
            }
        }
    }

    private func pick(_ k: String) {
        Haptics.shared.select()
        m.ct = k
        Task { await m.loadLines(store) }
    }
}

struct Logs44CtChip: View {
    @Environment(\.paper) private var p
    let name: String
    let color: String
    let errors: Int
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 6) {
                if !color.isEmpty { Circle().fill(Logs44CtChip.dot(color)).frame(width: 8, height: 8) }
                Text(name).font(PF.ui(13, .semibold)).lineLimit(1)
                if errors > 0 { Text("\(errors)").font(PF.ui(11, .bold)).foregroundStyle(Color(hex: "#b23a2a")) }
            }
            .foregroundStyle(on ? p.bg : p.ink)
            .padding(.horizontal, 12).frame(height: 34)
            .background(on ? p.ink : p.card, in: Capsule())
            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
            .frame(minHeight: 44).contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    static func dot(_ c: String) -> Color {
        switch c {
        case "red": return Color(hex: "#b23a2a")
        case "yellow": return Color(hex: "#c48a1a")
        default: return Color(hex: "#2f6b4a")
        }
    }
}

/// Valgt container: image:tag, status, oppetid, CPU/minne, omstarter + Start på nytt · Stopp · Start (bekreftes).
struct Logs44Selected: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Logs44 { Logs44.shared }
    let c: Log44Container
    @State private var ask: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(c.name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            if !c.image.isEmpty { Text(c.image).font(PF.mono(11, bold: false)).foregroundStyle(p.mut).lineLimit(1) }
            Text(line).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                small("Start på nytt") { ask = "restart" }
                if c.state == "running" { small("Stopp") { ask = "stop" } } else { small("Start") { ask = "start" } }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .task(id: c.id) { await m.loadStats(c, store) }
        .confirmationDialog(askTitle, isPresented: Binding<Bool>(get: { ask != nil }, set: { (v: Bool) in if !v { ask = nil } }), titleVisibility: .visible) {
            Button(askButton, role: askRole) { if let a = ask { m.action(c, a, store) }; ask = nil }
            Button("Avbryt", role: .cancel) { ask = nil }
        }
    }

    private var line: String {
        var parts: [String] = [c.status.isEmpty ? c.state : c.status]
        if !c.uptime.isEmpty { parts.append("oppe " + c.uptime) }
        if !m.stats.isEmpty { parts.append(m.stats) }
        parts.append(c.restarts == 1 ? "1 omstart" : "\(c.restarts) omstarter")
        return parts.joined(separator: " · ")
    }

    private var askTitle: String {
        switch ask {
        case "stop": return "Stoppe \(c.name)?"
        case "start": return "Starte \(c.name)?"
        default: return "Starte \(c.name) på nytt?"
        }
    }

    private var askRole: ButtonRole? {
        if ask == "stop" { return .destructive }
        return nil
    }

    private var askButton: String {
        switch ask {
        case "stop": return "Stopp"
        case "start": return "Start"
        default: return "Start på nytt"
        }
    }

    private func small(_ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(minHeight: 40)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Søk · nivå · tid · Live · Last ned.
struct Logs44Filters: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Logs44 { Logs44.shared }
    @State private var shareURL: URL? = nil

    static let levels: [(String, String)] = [("all", "Alle"), ("info", "Info+"), ("warn", "Advarsler"), ("error", "Feil")]
    static let times: [(String, String)] = [("15m", "15m"), ("1h", "1t"), ("24h", "24t"), ("7d", "7d")]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Søk i loggene, f.eks. «timeout»", text: Binding<String>(get: { m.query }, set: { m.query = $0 }))
                .font(PF.ui(14.5)).foregroundStyle(p.ink)
                .autocorrectionDisabled().textInputAutocapitalization(.never)
                .submitLabel(.search)
                .onSubmit { reload() }
                .padding(.horizontal, 14).frame(height: 44)
                .background(p.card, in: Capsule())
            chips(Logs44Filters.levels, m.level) { m.level = $0 }
            HStack(spacing: 6) {
                chips(Logs44Filters.times, m.since) { m.since = $0 }
                Spacer(minLength: 4)
                Media43Chip(text: m.live ? "● Live" : "Live", on: m.live) { m.setLive(!m.live, store) }
                Button { Task { shareURL = await m.download(store) } } label: {
                    Image(systemName: "square.and.arrow.down").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.ink)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Last ned .log")
            }
        }
        .sheet(item: Binding<Logs44Share?>(get: { shareURL.map { Logs44Share(url: $0) } }, set: { (v: Logs44Share?) in if v == nil { shareURL = nil } })) { (s: Logs44Share) in
            Logs44ShareSheet(url: s.url)
        }
    }

    private func chips(_ list: [(String, String)], _ cur: String, _ pick: @escaping (String) -> Void) -> some View {
        HStack(spacing: 6) {
            ForEach(list, id: \.0) { (x: (String, String)) in
                Media43Chip(text: x.1, on: cur == x.0) {
                    Haptics.shared.select()
                    pick(x.0)
                    reload()
                }
            }
        }
    }

    private func reload() {
        if m.live { m.setLive(true, store) }
        Task { await m.loadLines(store) }
    }
}

struct Logs44Share: Identifiable {
    var id: String { url.absoluteString }
    let url: URL
}

struct Logs44ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// Mørkt loggvindu (mono): tid · nivå (farget) · container · melding. ERROR-linjer har rød bakgrunn. Trykk = detaljer.
struct Logs44Window: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Logs44 { Logs44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if m.lines.isEmpty {
                Text(m.loading ? "Henter …" : "Ingen linjer for dette filteret.").font(PF.mono(11.5, bold: false))
                    .foregroundStyle(Color(hex: "#a39d90")).padding(14)
            }
            ForEach(m.lines.suffix(300)) { (l: Log44Line) in
                Button { m.openDetail(l, store) } label: { Logs44LineView(l: l) }
                    .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: "#15140f"), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct Logs44LineView: View {
    let l: Log44Line

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(l.t).foregroundStyle(Color(hex: "#8f897c"))
                Text(l.level.uppercased()).foregroundStyle(Logs44LineView.color(l.level))
                Text(l.ct).foregroundStyle(Color(hex: "#9fb7d6")).lineLimit(1)
            }
            .font(PF.mono(10, bold: true))
            Text(l.msg).font(PF.mono(11, bold: false)).foregroundStyle(Color(hex: "#ece7dc")).lineLimit(4)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(l.level == "error" ? Color(hex: "#b23a2a").opacity(0.22) : Color.clear)
        .contentShape(Rectangle())
    }

    static func color(_ lv: String) -> Color {
        switch lv {
        case "error": return Color(hex: "#ff8a76")
        case "warn": return Color(hex: "#e8b25a")
        case "debug": return Color(hex: "#8f897c")
        default: return Color(hex: "#8fd9a8")
        }
    }
}

/// FEIL GRUPPERT (24 T): ×antall, melding, container, sist sett, «Forklar ›».
struct Logs44Groups: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Logs44 { Logs44.shared }

    var body: some View {
        if !m.groups.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("FEIL GRUPPERT · 24 T").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                ForEach(m.groups) { (g: Log44Group) in Logs44GroupRow(g: g) }
            }
        }
    }
}

struct Logs44GroupRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Logs44 { Logs44.shared }
    let g: Log44Group

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("×\(g.count)").font(PF.mono(13)).foregroundStyle(Color(hex: "#b23a2a"))
            VStack(alignment: .leading, spacing: 2) {
                Text(g.message).font(PF.mono(11, bold: false)).foregroundStyle(p.ink).lineLimit(3)
                Text([g.ct, g.last.isEmpty ? "" : "sist " + g.last].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 4)
            Button { m.openDetail(Log44Line(id: "grp-" + g.id, t: g.last, level: "error", ct: g.ct, msg: g.message), store) } label: {
                Text("Forklar ›").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab).frame(minHeight: 36)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Detaljer: hele linjen, Glimt forklarer, «Kopier med 20 linjer rundt» og «Vis i sammenheng».
struct Logs44Detail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Logs44 { Logs44.shared }
    let l: Log44Line

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader30(title: "Logglinje", closeTitle: "Ferdig") { m.detail = nil }
                Logs44LineView(l: l).background(Color(hex: "#15140f"), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Logs44Explain(text: m.explain, busy: m.explainBusy)
                HStack(spacing: 8) {
                    pill("Kopier med 20 linjer rundt") { m.copyContext(l) }
                    pill("Vis i sammenheng") { showContext() }
                }
            }
            .padding(20)
        }
    }

    private func pill(_ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(p.card, in: Capsule())
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func showContext() {
        m.detail = nil
        m.ct = l.ct
        m.level = "all"
        m.query = ""
        Task { await m.loadLines(store) }
    }
}

struct Logs44Explain: View {
    @Environment(\.paper) private var p
    let text: String
    let busy: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Orb43(size: 20, busy: busy)
                Text("GLIMT FORKLARER").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
            }
            if busy && text.isEmpty { Text("Glimt leser linjen og 20 linjer rundt …").font(PF.ui(13)).foregroundStyle(p.mut) }
            if !text.isEmpty { Text(text).font(PF.ui(14)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
