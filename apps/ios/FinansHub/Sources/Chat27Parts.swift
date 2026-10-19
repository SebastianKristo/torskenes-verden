import SwiftUI
import UIKit

/* ---------------- Prompt 27: Chat – meldinger, enkel Markdown og historikken ---------------- */
// Bruker: boble til høyre med Rediger (lagrer og sender på nytt fra det punktet) og Kopier.
// Svar: ✦ MODELL, brikker «Brukte …», tekst med avsnitt, lister, fet skrift og kodeblokker, og Kopier · Nytt svar (siste) ·
// Les høyt · tok/s og tid. Historikken: søk (✕ til venstre), FESTET, MAPPER, I DAG, I GÅR, SISTE 7 DAGER, ELDRE.

/// Én blokk i et svar (som chMd i fasiten).
struct ChatBlock27: Identifiable {
    let id: Int
    let code: Bool
    let marker: String
    let heading: Bool
    let text: String
}

enum ChatMd27 {
    static func blocks(_ t: String) -> [ChatBlock27] {
        var out: [ChatBlock27] = []
        var code: [String]? = nil
        var n: Int = 0
        for raw in t.components(separatedBy: "\n") {
            if raw.hasPrefix("```") {
                if let c = code {
                    out.append(ChatBlock27(id: n, code: true, marker: "", heading: false, text: c.joined(separator: "\n")))
                    n += 1
                    code = nil
                } else {
                    code = []
                }
                continue
            }
            if code != nil { code?.append(raw); continue }
            let l: String = raw.trimmingCharacters(in: .whitespaces)
            if l.isEmpty { continue }
            var marker: String = ""
            var text: String = l
            var heading: Bool = false
            if l.hasPrefix("- ") || l.hasPrefix("* ") || l.hasPrefix("• ") {
                marker = "•"
                text = String(l.dropFirst(2))
            } else if let r = l.range(of: "^[0-9]+[.)] ", options: .regularExpression) {
                marker = String(l[r]).trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ")", with: ".")
                text = String(l[r.upperBound...])
            } else if l.hasPrefix("#") {
                heading = true
                text = l.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces)
            }
            out.append(ChatBlock27(id: n, code: false, marker: marker, heading: heading, text: text.replacingOccurrences(of: "`", with: "")))
            n += 1
        }
        if let c = code { out.append(ChatBlock27(id: n, code: true, marker: "", heading: false, text: c.joined(separator: "\n"))) }
        return out
    }

    /// **fet** i teksten.
    static func styled(_ t: String, bold: Bool, font: Font, boldFont: Font) -> Text {
        let parts: [String] = t.components(separatedBy: "**")
        var out: Text = Text("")
        for (i, part) in parts.enumerated() {
            let b: Bool = bold || i % 2 == 1
            out = out + Text(part).font(b ? boldFont : font)
        }
        return out
    }
}

struct Chat27Blocks: View {
    let text: String
    let c: ChatPal27

    var body: some View {
        let bl: [ChatBlock27] = ChatMd27.blocks(text)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(bl) { b in
                if b.code {
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(b.text).font(PF.mono(13, bold: false)).foregroundStyle(c.ink).textSelection(.enabled)
                            .padding(.horizontal, 12).padding(.vertical, 10)
                    }
                    .background(c.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        if !b.marker.isEmpty {
                            Text(b.marker).font(c.ui(15.5)).foregroundStyle(c.mut).frame(minWidth: 16, alignment: .leading)
                        }
                        ChatMd27.styled(b.text, bold: b.heading, font: c.ui(15.5), boldFont: c.ui(15.5, .bold))
                            .foregroundStyle(c.ink)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }
                    .padding(.top, b.marker.isEmpty ? 0 : -6)
                }
            }
        }
    }
}

struct Chat27UserBubble: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let m: ChatMsg27
    let index: Int
    let c: ChatPal27

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if !m.attach.isEmpty || !m.images.isEmpty {
                Flow(spacing: 6) {
                    ForEach(m.attach, id: \.self) { a in tag("# " + a) }
                    if !m.images.isEmpty { tag("▣ \(m.images.count) bilde" + (m.images.count == 1 ? "" : "r")) }
                }
            }
            if s.editIndex == index {
                editor
            } else {
                Text(m.content).font(c.ui(15.5)).foregroundStyle(c.uI).lineSpacing(3)
                    .padding(.horizontal, 16).padding(.vertical, 11)
                    .background(c.ub, in: UnevenRoundedRectangle(topLeadingRadius: 22, bottomLeadingRadius: 22, bottomTrailingRadius: 6, topTrailingRadius: 22, style: .continuous))
                    .textSelection(.enabled)
                    .frame(maxWidth: 520, alignment: .trailing)
                HStack(spacing: 2) {
                    small("Rediger") { s.startEdit(index) }
                    small(s.copied == m.id ? "Kopiert" : "Kopier") { s.copy(m) }
                }
                .disabled(s.busy)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private var editor: some View {
        VStack(alignment: .trailing, spacing: 6) {
            TextField("", text: Binding<String>(get: { s.editText }, set: { s.editText = $0 }), axis: .vertical)
                .lineLimit(3...10)
                .font(c.ui(15.5)).foregroundStyle(c.ink)
                .padding(.horizontal, 6).padding(.vertical, 4)
            HStack(spacing: 6) {
                Button { s.editIndex = nil } label: {
                    Text("Avbryt").font(c.ui(13.5, .bold)).foregroundStyle(c.ink).padding(.horizontal, 16).frame(height: 38)
                        .overlay(Capsule().stroke(c.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                Button { s.saveEdit(store) } label: {
                    Text("Lagre og send").font(c.ui(13.5, .bold)).foregroundStyle(c.bg).padding(.horizontal, 16).frame(height: 38)
                        .background(c.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.ink, lineWidth: 1.5))
    }

    private func tag(_ t: String) -> some View {
        Text(t).font(c.ui(12, .semibold)).foregroundStyle(c.mut).lineLimit(1)
            .padding(.horizontal, 10).frame(height: 28)
            .overlay(Capsule().stroke(c.line, lineWidth: 1))
    }

    private func small(_ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(c.ui(12.5, .semibold)).foregroundStyle(c.mut).padding(.horizontal, 10).frame(height: 34)
        }
        .buttonStyle(.plain)
    }
}

struct Chat27Answer: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    @MainActor private var voice: ChatVoice27 { ChatVoice27.shared }
    let m: ChatMsg27
    let index: Int
    let c: ChatPal27

    var body: some View {
        let last: Bool = s.msgs.lastIndex(where: { $0.role == "assistant" }) == index
        VStack(alignment: .leading, spacing: 10) {
            Chat27AnswerHead(title: headName, tools: m.used, prefix: "Brukte", c: c)
            Chat27Blocks(text: m.content, c: c)
            // Prompt 31: kortet fra Glimt (vær, kalender, avganger …), lagret i meldingen (Chat31Cards.swift).
            if !m.card31.isEmpty { Chat31Card(json: m.card31, c: c) }
            Flow(spacing: 2) {
                action("doc.on.doc", s.copied == m.id ? "Kopiert" : "Kopier") { s.copy(m) }
                if last && !s.busy { action("arrow.clockwise", "Nytt svar") { s.regenerate(store) } }
                action(voice.speaking == m.id ? "stop.fill" : "speaker.wave.2", voice.speaking == m.id ? "Stopp" : "Les høyt") { voice.speak(m.id, m.content) }
                if !m.stats.isEmpty {
                    Text(m.stats).font(PF.mono(11, bold: false)).foregroundStyle(c.mut).padding(.leading, 6).frame(height: 34)
                }
            }
            .padding(.leading, -8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var headName: String {
        if m.model.isEmpty { return "AI" }
        if let x = s.models.first(where: { $0.id == m.model }) { return x.label.uppercased() }
        return m.model.uppercased()
    }

    private func action(_ icon: String, _ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .semibold))
                Text(t).font(c.ui(12.5, .semibold))
            }
            .foregroundStyle(c.mut)
            .padding(.horizontal, 10).frame(height: 34)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// ✦ MODELL og brikkene «Brukte Finans» / «Leser Finans».
struct Chat27AnswerHead: View {
    let title: String
    let tools: [String]
    let prefix: String
    let c: ChatPal27

    var body: some View {
        Flow(spacing: 8) {
            Text("✦ " + title).font(c.mono(10.5)).tracking(1).foregroundStyle(c.acc).frame(height: 24)
            ForEach(tools, id: \.self) { t in
                Text(prefix + " " + t).font(c.ui(11.5, .semibold)).foregroundStyle(c.mut).lineLimit(1)
                    .padding(.horizontal, 9).frame(height: 24)
                    .background(c.card, in: Capsule())
            }
        }
    }
}

struct Chat27Streaming: View {
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    /// «GLIMT · TENKER» mens Glimt-ruteren jobber, ellers modellnavnet.
    @MainActor private var headTitle31: String {
        if s.pendingTool31 { return "GLIMT · TENKER" }
        return s.current.label.uppercased()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Prompt 31: Glimt-merket animeres ved siden av modellnavnet i stedet for «Tenker …» (Glimt31.swift).
            HStack(alignment: .center, spacing: 8) {
                Glimt31Mark(size: 22, state: s.streamText.isEmpty ? .thinking : .answering)
                Chat27AnswerHead(title: headTitle31, tools: s.streamTool, prefix: "Leser", c: c)
            }
            if !s.streamText.isEmpty {
                Chat27Blocks(text: s.streamText, c: c)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/* ---------- Historikken (skuff på telefon, fast sidepanel på bred skjerm) ---------- */

struct Chat27Group: Identifiable {
    let id: String
    let title: String
    let folder: ChatFolder27?
    let rows: [ChatSummary27]
}

struct Chat27History: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27
    let showClose: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                Text("Chat").font(c.head(25)).foregroundStyle(c.ink)
                Spacer()
                Button { s.newChat() } label: {
                    Image(systemName: "square.and.pencil").font(.system(size: 18, weight: .semibold)).foregroundStyle(c.ink)
                        .frame(width: 42, height: 42)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ny chat")
            }
            .padding(.leading, 16).padding(.trailing, 8).padding(.top, 8).padding(.bottom, 6)
            SearchField27(text: Binding<String>(get: { s.historyQuery }, set: { (v: String) in s.historyQuery = v; s.searchHistory(store) }),
                          placeholder: "Søk i samtaler", ink: c.ink, placeholderColor: c.mut, onClear: { s.hits = [] })
                .padding(.horizontal, 14).frame(height: 42)
                .background(c.card, in: Capsule())
                .padding(.horizontal, 10).padding(.bottom, 6)
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(groups) { g in group(g) }
                    if s.loadedChats && s.allSummaries.isEmpty && s.historyQuery.isEmpty {
                        Text("Ingen samtaler ennå.").font(c.ui(14)).foregroundStyle(c.mut).padding(.horizontal, 10).padding(.vertical, 20)
                    }
                }
                .padding(.horizontal, 8).padding(.bottom, 12)
            }
            Rectangle().fill(c.line).frame(height: 1)
            VStack(spacing: 0) {
                footRow("cpu", "Modeller", "\(s.localModels.count) lokale · \(s.skyModels.count) i skyen") {
                    // Prompt 34: Modeller åpner AI-kontroll på fanen Modeller (det gamle Modeller-arket brukes ikke lenger).
                    s.drawer = false
                    AiCtl34.shared.show("mod", scope: "chat")
                }
                footRow("books.vertical", "Kunnskapsbase", "\(s.knowledge.count) dokumenter") {
                    s.drawer = false
                    s.sheet = "kb"
                }
                footRow("circle.lefthalf.filled", "Tema", s.theme == "noytral" ? "Nøytral" : "Papir") {
                    s.setTheme(s.theme == "noytral" ? "papir" : "noytral", store)
                }
                Text("Historikken synkes mellom mobil og web.").font(c.ui(11.5)).foregroundStyle(c.mut)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).padding(.top, 4)
            }
            .padding(.horizontal, 8).padding(.top, 6).padding(.bottom, 12)
        }
        .task { await s.loadKnowledge(store) }
    }

    private var groups: [Chat27Group] {
        let q: String = s.historyQuery.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty { return [Chat27Group(id: "hits", title: "TREFF · \(s.hits.count)", folder: nil, rows: s.hits)] }
        var out: [Chat27Group] = []
        if !s.pinned.isEmpty { out.append(Chat27Group(id: "pin", title: "FESTET", folder: nil, rows: s.pinned.sorted { $0.updatedAt > $1.updatedAt })) }
        if !s.folders.isEmpty {
            out.append(Chat27Group(id: "mapper", title: "MAPPER", folder: nil, rows: []))
            for f in s.folders {
                out.append(Chat27Group(id: "f:" + f.id, title: Chat34Scans.title(f), folder: f, rows: f.open ? f.chats.sorted { $0.updatedAt > $1.updatedAt } : []))
            }
        }
        let cal: Calendar = Calendar.current
        let sod: Date = cal.startOfDay(for: Date())
        let y: Date = sod.addingTimeInterval(-86_400)
        let w: Date = sod.addingTimeInterval(-7 * 86_400)
        let rest: [ChatSummary27] = s.chats.filter { !$0.pinned && $0.folderId.isEmpty }.sorted { $0.updatedAt > $1.updatedAt }
        let buckets: [(String, [ChatSummary27])] = [
            ("I DAG", rest.filter { $0.updatedAt >= sod }),
            ("I GÅR", rest.filter { $0.updatedAt < sod && $0.updatedAt >= y }),
            ("SISTE 7 DAGER", rest.filter { $0.updatedAt < y && $0.updatedAt >= w }),
            ("ELDRE", rest.filter { $0.updatedAt < w }),
        ]
        for b in buckets where !b.1.isEmpty { out.append(Chat27Group(id: b.0, title: b.0, folder: nil, rows: b.1)) }
        return out
    }

    @ViewBuilder private func group(_ g: Chat27Group) -> some View {
        if let f = g.folder {
            Button { s.toggleFolder(f, store) } label: {
                HStack(spacing: 8) {
                    Text(f.open ? "▾" : "▸").font(c.ui(12)).foregroundStyle(c.mut).frame(width: 12)
                    // Prompt 34: kvitteringsikon i rødt for «Kvitteringer og skanninger».
                    Image(systemName: f.sys ? "doc.text" : "folder").font(.system(size: 13, weight: .semibold)).foregroundStyle(f.sys ? Chat34Scans.red : c.mut)
                    Text(g.title).font(c.ui(13.5, .semibold)).foregroundStyle(c.ink).lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10).frame(height: 38)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            Text(g.title).font(c.mono(10)).tracking(1.2).foregroundStyle(c.mut)
                .padding(.horizontal, 10).padding(.top, 14).padding(.bottom, 4)
        }
        ForEach(g.rows) { r in row(r) }
    }

    private func row(_ r: ChatSummary27) -> some View {
        let on: Bool = r.id == s.curId
        return HStack(spacing: 4) {
            Button { s.open(r, store) } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(r.title).font(c.ui(14, .semibold)).foregroundStyle(c.ink).lineLimit(1)
                    Text(sub(r)).font(c.ui(11.5)).foregroundStyle(c.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 10).padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { s.openMenu(r) } label: {
                Text("⋯").font(c.ui(17, .bold)).foregroundStyle(c.mut).frame(width: 36, height: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Valg for samtalen")
        }
        .background(on ? c.card : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func sub(_ r: ChatSummary27) -> String {
        let m: String = s.models.first(where: { $0.id == r.model })?.label ?? r.model
        let cal: Calendar = Calendar.current
        let when: String
        if cal.isDateInToday(r.updatedAt) { when = JS.fmt(r.updatedAt, "HH:mm") } else if cal.isDateInYesterday(r.updatedAt) { when = "i går" } else { when = JS.fmt(r.updatedAt, "dd.MM") }
        return m.isEmpty ? when : m + " · " + when
    }

    private func footRow(_ icon: String, _ t: String, _ sub: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(c.ink).frame(width: 22)
                Text(t).font(c.ui(14, .semibold)).foregroundStyle(c.ink)
                Spacer(minLength: 4)
                Text(sub).font(c.ui(12)).foregroundStyle(c.mut).lineLimit(1)
            }
            .padding(.horizontal, 10).frame(height: 42)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
