import SwiftUI
import UIKit

/* ---------------- Prompt 27: Chat – arkene ---------------- */
// Velg modell (LOKALT · OLLAMA PÅ HJEMMESERVEREN / SKY), Samtaleinnstillinger (persona, systemprompt, temperatur, top P,
// kontekstlengde, tema), ⋯ på en samtale (nytt navn, fest, eksporter, del, flytt til mappe, slett), «Sende til …?»,
// Legg ved (bilde/kamera, fil, kunnskapsbasen), Kunnskapsbase og Modeller (installerte, hent med fremdrift, eget navn).

struct Chat27Sheet: View {
    let kind: String
    let c: ChatPal27
    let pickPhoto: () -> Void
    let pickCamera: () -> Void
    let pickFile: (Bool) -> Void

    var body: some View {
        if kind == "plus" {
            // Prompt 28: nytt «Legg ved»-ark med høyde etter innhold (Chat28.swift).
            Chat28PlusSheet(c: c, pickPhoto: pickPhoto, pickCamera: pickCamera, pickFile: { pickFile(false) })
        } else {
            scroll
        }
    }

    private var scroll: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                switch kind {
                case "model": Chat27ModelSheet(c: c)
                case "params": Chat27ParamsSheet(c: c)
                case "menu": Chat27MenuSheet(c: c)
                case "guard": Chat27GuardSheet(c: c)
                case "plus": Chat27PlusSheet(c: c, pickPhoto: pickPhoto, pickCamera: pickCamera, pickFile: { pickFile(false) })
                case "kb": Chat27KbSheet(c: c, upload: { pickFile(true) })
                default: Chat27ModsSheet(c: c)
                }
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 22)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(c.bg)
    }
}

/* ---------- Felles ---------- */

struct Chat27Head: View {
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let title: String
    var sub: String = ""
    let c: ChatPal27

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(c.head(23)).foregroundStyle(c.ink).fixedSize(horizontal: false, vertical: true)
                if !sub.isEmpty { Text(sub).font(c.ui(12.5)).foregroundStyle(c.mut) }
            }
            Spacer(minLength: 4)
            Button { s.sheet = nil } label: {
                Text("✕").font(c.ui(14)).foregroundStyle(c.ink).frame(width: 40, height: 40)
                    .background(c.card, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
    }
}

struct Chat27Label: View {
    let text: String
    let c: ChatPal27

    var body: some View {
        Text(text).font(c.mono(10.5)).tracking(1.2).foregroundStyle(c.acc).padding(.top, 4)
    }
}

struct Chat27Pill: View {
    let name: String
    let on: Bool
    let c: ChatPal27
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(name).font(c.ui(13.5, .bold)).foregroundStyle(on ? c.bg : c.ink)
                .padding(.horizontal, 14).frame(height: 36)
                .background(on ? c.ink : c.card, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct Chat27WideButton: View {
    let title: String
    var filled: Bool = false
    var danger: Bool = false
    let c: ChatPal27
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(c.ui(14.5, .bold))
                .foregroundStyle(danger ? Color.white : (filled ? c.bg : c.ink))
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(danger ? Color(hex: "#b23a2a") : (filled ? c.ink : Color.clear), in: Capsule())
                .overlay(Capsule().stroke(filled || danger ? Color.clear : c.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Velg modell ---------- */

struct Chat27ModelSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        Chat27Head(title: "Velg modell", c: c)
        // Prompt 41: «✦ Auto» øverst – Glimt velger beste modell for hver melding (standard).
        if let a = s.autoModel {
            Button { s.select(a, store) } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 8) {
                            Text(a.name).font(c.ui(15, .bold)).foregroundStyle(c.ink).lineLimit(1)
                            Text("AUTO").font(PF.mono(9.5)).tracking(0.8).foregroundStyle(Color.white)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(Color(hex: "#7a5ad6"), in: Capsule())
                        }
                        Text("Glimt velger beste modell for hver melding · lokalt når dine data er med").font(c.ui(12.5)).foregroundStyle(c.mut)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    if a.id == s.model { Text("✓").font(c.ui(16, .bold)).foregroundStyle(c.ink) }
                }
                .padding(.vertical, 11).padding(.horizontal, 14)
                .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        Chat27Label(text: "LOKALT · OLLAMA PÅ HJEMMESERVEREN", c: c)
        card(s.localModels, empty: "Ingen lokale modeller er installert.")
        Chat27Label(text: "SKY", c: c)
        card(s.skyModels, empty: "Ingen sky-modeller er satt opp.")
        Text("Sky-modeller merkes SKY. Før dine data eller vedlegg sendes dit, får du spørsmål om det.")
            .font(c.ui(12.5)).foregroundStyle(c.mut).fixedSize(horizontal: false, vertical: true)
        Chat27WideButton(title: "Administrer modeller ›", c: c) { Chat34Scans.openAiControl("mod") }
    }

    private func card(_ list: [ChatLLM27], empty: String) -> some View {
        VStack(spacing: 0) {
            if list.isEmpty {
                Text(empty).font(c.ui(14)).foregroundStyle(c.mut).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
            }
            ForEach(Array(list.enumerated()), id: \.element.id) { i, m in
                if i > 0 { Rectangle().fill(c.line).frame(height: 1) }
                Button { s.select(m, store) } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 8) {
                                Text(m.label).font(c.ui(15, .bold)).foregroundStyle(c.ink).lineLimit(1)
                                Chat27Badge(sky: m.sky)
                                // Prompt 50: «Ser bilder» for modeller med vision (Ollama /api/show → capabilities).
                                if m.vision && m.kind != "auto" { Chat50VisionBadge(c: c) }
                            }
                            Text(detail(m)).font(c.ui(12.5)).foregroundStyle(c.mut).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        if m.id == s.model { Text("✓").font(c.ui(16, .bold)).foregroundStyle(c.ink) }
                    }
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func detail(_ m: ChatLLM27) -> String {
        var parts: [String] = []
        if m.sky {
            parts.append(m.provider == "groq" ? "Groq · sky" : m.provider == "gemini" ? "Google · sky" : "sky")
        } else {
            if m.name != m.id { parts.append(m.name) }
            if !m.size.isEmpty { parts.append(m.size) }
        }
        return parts.joined(separator: " · ")
    }
}

/* ---------- Samtaleinnstillinger ---------- */

struct Chat27ParamsSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        let pr: ChatSettings27 = s.params
        Chat27Head(title: "Samtaleinnstillinger", sub: s.curId == nil ? "Gjelder nye samtaler" : "Gjelder denne samtalen", c: c)
        VStack(alignment: .leading, spacing: 12) {
        Chat27Label(text: "PERSONA", c: c)
        Flow(spacing: 6) {
            ForEach(ChatStore27.personas, id: \.0) { per in
                Chat27Pill(name: per.1, on: pr.persona == per.0, c: c) { s.setParams(store) { $0.persona = per.0 } }
            }
        }
        Chat27Label(text: "SYSTEMPROMPT", c: c)
        TextField("", text: Binding<String>(get: { s.params.system }, set: { (v: String) in s.setParams(store) { $0.system = v } }),
                  prompt: Text("F.eks. «Svar alltid med maks tre setninger.»").foregroundColor(c.mut), axis: .vertical)
            .lineLimit(3...8)
            .font(c.ui(15)).foregroundStyle(c.ink)
            .padding(12)
            .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        slider("Temperatur", value: pr.temperature, range: 0...2, step: 0.1, hint: "Lav gir faste svar, høy gir mer variasjon.") { v in
            s.setParams(store) { $0.temperature = v }
        }
        slider("Top P", value: pr.topP, range: 0.1...1, step: 0.05, hint: "") { v in
            s.setParams(store) { $0.topP = v }
        }
        }
        VStack(alignment: .leading, spacing: 12) {
        Chat27Label(text: "KONTEKSTLENGDE", c: c)
        HStack(spacing: 6) {
            ForEach([4096, 8192, 16384, 32768], id: \.self) { n in
                Chat27Pill(name: "\(n / 1024)k", on: pr.numCtx == n, c: c) { s.setParams(store) { $0.numCtx = n } }
            }
        }
        Chat27Label(text: "TEMA", c: c)
        HStack(spacing: 6) {
            Chat27Pill(name: "Papir", on: s.theme != "noytral", c: c) { s.setTheme("papir", store) }
            Chat27Pill(name: "Nøytral", on: s.theme == "noytral", c: c) { s.setTheme("noytral", store) }
        }
        // Prompt 34: «Full AI-kontroll ›» nederst åpner fanen Valg i AI-kontroll.
        Chat27WideButton(title: "Full AI-kontroll ›", c: c) { Chat34Scans.openAiControl("rt") }
        Chat27WideButton(title: "Ferdig", filled: true, c: c) { s.sheet = nil }
            .padding(.top, 6)
        }
    }

    private func slider(_ name: String, value: Double, range: ClosedRange<Double>, step: Double, hint: String, _ set: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name).font(c.ui(14.5, .semibold)).foregroundStyle(c.ink)
                Spacer()
                Text(String(format: step < 0.1 ? "%.2f" : "%.1f", value).replacingOccurrences(of: ".", with: ","))
                    .font(PF.mono(13, bold: false)).foregroundStyle(c.mut)
            }
            Slider(value: Binding<Double>(get: { value }, set: { (v: Double) in set((v / step).rounded() * step) }), in: range, step: step)
                .tint(c.ink)
            if !hint.isEmpty { Text(hint).font(c.ui(12)).foregroundStyle(c.mut) }
        }
        .padding(.top, 4)
    }
}

/* ---------- ⋯ på en samtale ---------- */

struct Chat27MenuSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        if let mc = s.menuChat {
            Chat27Head(title: mc.title, c: c)
            HStack(spacing: 8) {
                TextField("", text: Binding<String>(get: { s.renameText }, set: { s.renameText = $0 }), prompt: Text("Navn på samtalen").foregroundColor(c.mut))
                    .font(c.ui(15)).foregroundStyle(c.ink)
                    .submitLabel(.done)
                    .onSubmit { s.rename(store) }
                    .padding(.horizontal, 14).frame(height: 46)
                    .background(c.card, in: Capsule())
                Button { s.rename(store) } label: {
                    Text("Gi nytt navn").font(c.ui(13.5, .bold)).foregroundStyle(c.bg).padding(.horizontal, 14).frame(height: 46)
                        .background(c.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            VStack(spacing: 8) {
                Chat27WideButton(title: mc.pinned ? "Løsne" : "Fest øverst", c: c) { s.togglePin(store) }
                Chat27WideButton(title: "Eksporter som Markdown", c: c) { s.export(store) }
                Chat27WideButton(title: "Del lenke", c: c) { s.shareLink(store) }
            }
            Chat27Label(text: "FLYTT TIL MAPPE", c: c)
            Flow(spacing: 6) {
                Chat27Pill(name: "Ingen mappe", on: mc.folderId.isEmpty, c: c) { s.move(to: "", store) }
                // Prompt 34: systemmappen for skanninger er ikke et mål for flytting.
                ForEach(s.folders.filter { !$0.sys }) { f in
                    Chat27Pill(name: f.name, on: mc.folderId == f.id, c: c) { s.move(to: f.id, store) }
                }
            }
            HStack(spacing: 8) {
                TextField("", text: Binding<String>(get: { s.newFolder }, set: { s.newFolder = $0 }), prompt: Text("Ny mappe").foregroundColor(c.mut))
                    .font(c.ui(15)).foregroundStyle(c.ink)
                    .submitLabel(.done)
                    .onSubmit { s.addFolder(store) }
                    .padding(.horizontal, 14).frame(height: 46)
                    .background(c.card, in: Capsule())
                Button { s.addFolder(store) } label: {
                    Text("+ Lag og flytt").font(c.ui(13.5, .bold)).foregroundStyle(c.ink).padding(.horizontal, 14).frame(height: 46)
                        .overlay(Capsule().stroke(c.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            Chat27WideButton(title: s.delArm ? "Trykk igjen for å slette" : "Slett samtalen", danger: true, c: c) { s.deleteChat(store) }
                .padding(.top, 6)
        }
    }
}

/* ---------- Sende til sky? ---------- */

struct Chat27GuardSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        Chat27Head(title: "Sende til " + s.guardModel + "?", c: c)
        Text("Dette er en sky-modell. Dette forlater hjemmeserveren hvis du sender:").font(c.ui(14)).foregroundStyle(c.mut)
            .fixedSize(horizontal: false, vertical: true)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(s.guardLeaves, id: \.self) { x in
                HStack(alignment: .top, spacing: 10) {
                    Text("↗").font(c.ui(14, .bold)).foregroundStyle(Color(hex: "#b23a2a"))
                    Text(x).font(c.ui(14.5, .semibold)).foregroundStyle(c.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        Button { s.guardRemember.toggle() } label: {
            HStack(spacing: 10) {
                Image(systemName: s.guardRemember ? "checkmark.square.fill" : "square").font(.system(size: 18)).foregroundStyle(c.ink)
                Text("Ikke spør igjen i denne samtalen").font(c.ui(14, .semibold)).foregroundStyle(c.ink)
            }
            .frame(minHeight: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Chat27WideButton(title: "Send", filled: true, c: c) { s.guardSend(store, withoutData: false) }
        if s.guardHasData {
            Chat27WideButton(title: "Send uten mine data", c: c) { s.guardSend(store, withoutData: true) }
        }
        Chat27WideButton(title: "Bruk lokal modell (" + s.guardLocalName + ")", c: c) { s.guardLocal(store) }
    }
}

/* ---------- Legg ved ---------- */

struct Chat27PlusSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27
    let pickPhoto: () -> Void
    let pickCamera: () -> Void
    let pickFile: () -> Void

    var body: some View {
        Chat27Head(title: "Legg ved", c: c)
        VStack(spacing: 0) {
            row("▣", "Bilde", "Leses av en bildemodell, f.eks. qwen2.5vl", pickPhoto)
            Rectangle().fill(c.line).frame(height: 1)
            row("◉", "Kamera", "Ta et bilde nå", pickCamera)
            Rectangle().fill(c.line).frame(height: 1)
            row("⎙", "Fil", "PDF, Word, tekst eller CSV", pickFile)
            Rectangle().fill(c.line).frame(height: 1)
            row("#", "Fra kunnskapsbasen", "\(s.knowledge.count) dokumenter") { s.sheet = "kb" }
        }
        .padding(.horizontal, 14)
        .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func row(_ icon: String, _ t: String, _ sub: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Text(icon).font(c.ui(16, .bold)).foregroundStyle(c.ink).frame(width: 36, height: 36)
                    .background(c.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(t).font(c.ui(15, .semibold)).foregroundStyle(c.ink)
                    Text(sub).font(c.ui(12.5)).foregroundStyle(c.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("›").font(c.ui(17)).foregroundStyle(c.mut)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Kunnskapsbase ---------- */

struct Chat27KbSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27
    let upload: () -> Void

    var body: some View {
        let n: Int = s.attach.filter { $0.kind == "doc" }.count
        Chat27Head(title: "Kunnskapsbase", sub: "Velg dokumenter chatten skal lese · \(n) valgt", c: c)
        VStack(spacing: 0) {
            if s.knowledge.isEmpty {
                Text("Ingen dokumenter ennå.").font(c.ui(14)).foregroundStyle(c.mut).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
            }
            ForEach(Array(s.knowledge.enumerated()), id: \.element.id) { i, d in
                if i > 0 { Rectangle().fill(c.line).frame(height: 1) }
                let on: Bool = s.attach.contains { $0.kind == "doc" && $0.fileId == d.id }
                Button { s.toggleDoc(d) } label: {
                    HStack(spacing: 12) {
                        Text("✓").font(c.ui(13, .bold)).foregroundStyle(on ? c.bg : Color.clear)
                            .frame(width: 24, height: 24)
                            .background(on ? c.ink : Color.clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(on ? c.ink : c.line, lineWidth: 1.5))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(d.name).font(c.ui(14.5, .semibold)).foregroundStyle(c.ink).lineLimit(1)
                            if !d.sub.isEmpty { Text(d.sub).font(c.ui(12.5)).foregroundStyle(c.mut).lineLimit(1) }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        Chat27WideButton(title: "+ Last opp til kunnskapsbasen", c: c, act: upload)
        Chat27WideButton(title: "Ferdig", filled: true, c: c) { s.sheet = nil }
            .task { await s.loadKnowledge(store) }
    }
}

/* ---------- Modeller ---------- */

struct Chat27ModsSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        let installed: [ChatLLM27] = s.localModels
        let lib: [(String, String)] = ChatStore27.library.filter { (x: (String, String)) -> Bool in !installed.contains { $0.id == x.0 } }
        let custom: [String] = s.pulls.keys.filter { (k: String) -> Bool in !ChatStore27.library.contains { $0.0 == k } }.sorted()
        Chat27Head(title: "Modeller", sub: s.ollamaInfo.isEmpty ? "Ollama på hjemmeserveren" : "Ollama · " + s.ollamaInfo, c: c)
        Chat27Label(text: "INSTALLERT", c: c)
        VStack(spacing: 0) {
            if installed.isEmpty && custom.isEmpty {
                Text("Ingen lokale modeller.").font(c.ui(14)).foregroundStyle(c.mut).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 14)
            }
            ForEach(Array(installed.enumerated()), id: \.element.id) { i, m in
                if i > 0 { Rectangle().fill(c.line).frame(height: 1) }
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(m.id).font(c.ui(14.5, .bold)).foregroundStyle(c.ink).lineLimit(1)
                        Text([m.name, m.size].filter { !$0.isEmpty && $0 != m.id }.joined(separator: " · ")).font(c.ui(12.5)).foregroundStyle(c.mut).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    let arm: Bool = s.modelDelArm == m.id
                    Button { s.deleteModel(m, store) } label: {
                        Text(arm ? "Bekreft" : "Slett").font(c.ui(13, .bold)).foregroundStyle(arm ? Color.white : c.ink)
                            .padding(.horizontal, 14).frame(height: 34)
                            .background(arm ? Color(hex: "#b23a2a") : Color.clear, in: Capsule())
                            .overlay(Capsule().stroke(arm ? Color(hex: "#b23a2a") : c.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 10)
            }
            ForEach(custom, id: \.self) { k in progress(k, s.pulls[k] ?? 0) }
        }
        .padding(.horizontal, 14)
        .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        Chat27Label(text: "HENT FRA OLLAMA.COM", c: c)
        VStack(spacing: 0) {
            ForEach(Array(lib.enumerated()), id: \.element.0) { i, x in
                if i > 0 { Rectangle().fill(c.line).frame(height: 1) }
                if let pct = s.pulls[x.0] {
                    progress(x.0, pct)
                } else {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(x.0).font(c.ui(14.5, .bold)).foregroundStyle(c.ink)
                            Text(x.1).font(c.ui(12.5)).foregroundStyle(c.mut).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        Button { s.pull(x.0, store) } label: {
                            Text("Last ned").font(c.ui(13, .bold)).foregroundStyle(c.bg).padding(.horizontal, 14).frame(height: 34)
                                .background(c.ink, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, 10)
                }
            }
        }
        .padding(.horizontal, 14)
        .background(c.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        HStack(spacing: 8) {
            TextField("", text: Binding<String>(get: { s.pullName }, set: { s.pullName = $0 }), prompt: Text("Modellnavn, f.eks. llama3.2:1b").foregroundColor(c.mut))
                .font(c.ui(15)).foregroundStyle(c.ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .submitLabel(.go)
                .onSubmit { pullTyped() }
                .padding(.horizontal, 14).frame(height: 46)
                .background(c.card, in: Capsule())
            Button { pullTyped() } label: {
                Text("Hent").font(c.ui(13.5, .bold)).foregroundStyle(c.bg).padding(.horizontal, 18).frame(height: 46)
                    .background(c.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private func pullTyped() {
        let n: String = s.pullName
        s.pullName = ""
        s.pull(n, store)
    }

    private func progress(_ name: String, _ pct: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(name).font(c.ui(14.5, .bold)).foregroundStyle(c.ink)
                Spacer()
                Text("\(Int(pct.rounded())) %").font(PF.mono(12, bold: false)).foregroundStyle(c.mut)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(c.line)
                    Capsule().fill(Color(hex: "#2f7a4f")).frame(width: g.size.width * CGFloat(Swift.min(100, Swift.max(0, pct)) / 100))
                }
            }
            .frame(height: 6)
        }
        .padding(.vertical, 10)
    }
}
