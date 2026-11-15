import SwiftUI
import UIKit

/* ---------------- Prompt 77 (SKJAIIOS): forslagskortet, «Finn bilde», «Rydd opp med Glimt» og innstillingene ----------------
 Ny/Endre del: «✦ Foreslå» ved navnet gir et kort med navn, kategori («ny» når den ikke finnes), specs og tags, hver med ✓,
 og «Bruk alle». «Finn bilde» ved bildene gir et rutenett med kandidater; trykk velger, og forhåndsvisningen kommer før lagring.
 Lista: ⋯ → «Rydd opp med Glimt» åpner gjennomgangen (før → etter, avkrysning, «Godta valgte», «Hopp over»). */

/* ---------- Forslagskortet ---------- */

struct Skj77SuggestCard: View {
    @Environment(\.paper) private var p
    @MainActor private var ai: Skjold77 { Skjold77.shared }
    @Binding var f: Skj76Form

    var body: some View {
        if ai.thinking {
            PCard {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(Skjold77.thinkingText).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Spacer()
                    Button("Avbryt") { ai.clearSuggestion() }.font(PF.ui(13.5, .semibold)).foregroundStyle(p.mut)
                }
            }
        } else if !ai.suggestError.isEmpty {
            HStack(alignment: .top, spacing: 8) {
                Playback44Note(text: ai.suggestError, red: true)
                close
            }
        } else if let s = ai.suggestion {
            card(s)
        }
    }

    private var close: some View {
        Button { ai.clearSuggestion() } label: {
            Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(p.mut).frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lukk forslaget")
    }

    private func card(_ s: Skj77Suggestion) -> some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    PLabel(text: "✦ Glimt foreslår · " + s.sourceText)
                    Spacer()
                    Text(s.percent).font(PF.mono(11)).foregroundStyle(p.mut)
                    close
                }
                if !s.name.isEmpty { line("Navn", s.name, on: f.name == s.name) { f.name = s.name } }
                if !s.category.isEmpty { categoryLine(s) }
                ForEach(s.specs) { (x: Skj76Spec) in
                    line(x.k, x.v, on: has(x)) { f.specs = Skjold77.merge(specs: [x], into: f.specs) }
                }
                if !s.tags.isEmpty {
                    line("Tags", s.tags.joined(separator: ", "), on: hasTags(s)) { f.tags = Skjold77.merge(tags: s.tags, into: f.tags) }
                }
                ForEach(s.decoded, id: \.self) { (t: String) in
                    Text(t).font(PF.mono(11)).foregroundStyle(p.lab)
                }
                if !s.why.isEmpty { Text(s.why).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
                Skj76Button(title: "Bruk alle", icon: "checkmark", filled: true) { useAll(s) }
            }
        }
    }

    private func categoryLine(_ s: Skj77Suggestion) -> some View {
        HStack(spacing: 8) {
            line("Kategori", s.category, on: f.category == s.category) { f.category = s.category }
            if s.categoryNew { Skj76Badge(text: "ny") }
        }
    }

    private func line(_ k: String, _ v: String, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button {
            Haptics.shared.tick()
            act()
        } label: {
            HStack(spacing: 10) {
                Text(k).font(PF.mono(11)).foregroundStyle(p.mut).frame(width: 78, alignment: .leading).lineLimit(1)
                Text(v).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                Spacer(minLength: 4)
                Image(systemName: on ? "checkmark.circle.fill" : "checkmark.circle").font(.system(size: 20)).foregroundStyle(on ? p.lab : p.mut)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Bruk " + k + ": " + v)
    }

    private func has(_ x: Skj76Spec) -> Bool { f.specs.contains { $0.k.lowercased() == x.k.lowercased() && $0.v == x.v } }

    private func hasTags(_ s: Skj77Suggestion) -> Bool {
        let mine: [String] = f.tags.lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        return s.tags.allSatisfy { mine.contains($0.lowercased()) }
    }

    private func useAll(_ s: Skj77Suggestion) {
        Haptics.shared.success()
        if !s.name.isEmpty { f.name = s.name }
        if !s.category.isEmpty { f.category = s.category }
        if !s.specs.isEmpty { f.specs = Skjold77.merge(specs: s.specs, into: f.specs) }
        if !s.tags.isEmpty { f.tags = Skjold77.merge(tags: s.tags, into: f.tags) }
    }
}

/* ---------- Finn bilde ---------- */

struct Skj77ImageFinder: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var ai: Skjold77 { Skjold77.shared }
    let query: String
    /// Tom for en ny del: valget lagres når delen lagres.
    let partId: String
    let picked: (Skj77Candidate) -> Void
    @State private var q: String = ""
    @State private var sel: Skj77Candidate? = nil
    @State private var saving: Bool = false
    @State private var booted: Bool = false

    private let grid: [GridItem] = [GridItem(.adaptive(minimum: 100), spacing: 8)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                top
                field
                if ai.searching { searchingNote }
                if !ai.imageMessage.isEmpty { Playback44Note(text: ai.imageMessage, red: true) }
                if let c = sel { preview(c) }
                LazyVGrid(columns: grid, spacing: 8) {
                    ForEach(ai.candidates) { (c: Skj77Candidate) in cell(c) }
                }
                Text("Bildene hentes via Homelab-serveren. Velg ett for å se det før det lagres.").font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .task { await boot() }
    }

    private var top: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("FINN BILDE").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Text(q.isEmpty ? "Søk etter bilde" : q).font(PF.serif(26, medium: true)).foregroundStyle(p.ink).lineLimit(2).minimumScaleFactor(0.7)
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 14, weight: .bold)).foregroundStyle(p.ink).frame(width: 36, height: 36)
                    .overlay(Circle().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
    }

    private var field: some View {
        HStack(spacing: 8) {
            TextField("F.eks. Motstand 10 kΩ ¼ W", text: $q).font(PF.ui(15.5)).foregroundStyle(p.ink)
                .submitLabel(.search).onSubmit { search() }
                .padding(.horizontal, 12).frame(height: 44)
                .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
            Button { search() } label: {
                Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .bold)).foregroundStyle(p.bg)
                    .frame(width: 44, height: 44).background(p.ink, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Søk")
        }
    }

    private var searchingNote: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text("Søker etter bilder …").font(PF.ui(13.5)).foregroundStyle(p.mut)
        }
    }

    private func cell(_ c: Skj77Candidate) -> some View {
        let on: Bool = sel?.id == c.id
        return Button {
            Haptics.shared.tick()
            sel = c
        } label: {
            Skj77Remote(path: c.thumb)
                .frame(height: 100).frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? p.lab : p.line, lineWidth: on ? 3 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(c.title.isEmpty ? "Bildekandidat" : c.title)
    }

    private func preview(_ c: Skj77Candidate) -> some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                Skj77Remote(path: c.thumb, fit: true).frame(maxWidth: .infinity).frame(height: 220)
                if !c.title.isEmpty { Text(c.title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(2) }
                Text([c.source, c.size].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.mono(10.5)).foregroundStyle(p.mut)
                HStack(spacing: 8) {
                    Skj76Button(title: saving ? "Lagrer …" : "Bruk bildet", icon: "checkmark", filled: true) { use(c) }
                        .disabled(saving)
                    Skj76Button(title: "Velg et annet", icon: "arrow.uturn.left") { sel = nil }
                }
            }
        }
    }

    private func boot() async {
        if booted { return }
        booted = true
        q = query
        if !ai.settingsLoaded { await ai.loadSettings(store) }
        ai.candidates = []
        ai.imageMessage = ""
        if !q.trimmingCharacters(in: .whitespaces).isEmpty { await ai.findImages(q, store) }
    }

    private func search() {
        sel = nil
        Task { @MainActor in await ai.findImages(q, store) }
    }

    private func use(_ c: Skj77Candidate) {
        if partId.isEmpty {
            picked(c)
            dismiss()
            return
        }
        saving = true
        Task { @MainActor in
            let ok: Bool = await ai.useImage(c, partId: partId, store)
            saving = false
            if ok {
                picked(c)
                dismiss()
            }
        }
    }
}

/// Bilde fra serverens proxy (hentes med app-token).
struct Skj77Remote: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let path: String
    var fit: Bool = false
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            Rectangle().fill(p.line.opacity(0.35))
            if let img {
                if fit { Image(uiImage: img).resizable().scaledToFit() } else { Image(uiImage: img).resizable().scaledToFill() }
            } else {
                Image(systemName: "photo").font(.system(size: 22)).foregroundStyle(p.mut)
            }
        }
        .clipped()
        .task(id: path) { img = await Skj76Images.shared.load(path, store) }
    }
}

/* ---------- Rydd opp med Glimt ---------- */

struct Skj77Tidy: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var ai: Skjold77 { Skjold77.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }
    /// Tom = alle delene.
    let ids: [String]
    @State private var booted: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Rydd opp med Glimt", title: ids.isEmpty ? "Alle delene" : (ids.count == 1 ? "1 del" : "\(ids.count) deler"))
                Text("Glimt går gjennom delene én om gangen. Ingenting endres før du godtar, og alt kan angres i historikken.")
                    .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                progress
                if !ai.tidyError.isEmpty { Playback44Note(text: ai.tidyError, red: true) }
                list
                buttons
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .task { await boot() }
    }

    private func boot() async {
        if booted { return }
        booted = true
        await ai.startTidy(ids, store)
    }

    @ViewBuilder
    private var progress: some View {
        if ai.tidyRunning || ai.jobState == "starter" {
            PCard {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text(Skjold77.thinkingText).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                        Spacer()
                        Text("\(ai.jobDone) av \(ai.jobTotal)").font(PF.mono(12)).foregroundStyle(p.mut)
                    }
                    ProgressView(value: Double(ai.jobDone), total: Double(Swift.max(1, ai.jobTotal))).tint(p.lab)
                }
            }
        }
    }

    @ViewBuilder
    private var list: some View {
        let rows: [Skj77TidyItem] = ai.tidyItems
        if !rows.isEmpty {
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { (i: Int, x: Skj77TidyItem) in
                    if i > 0 { Divider().overlay(p.line) }
                    Skj77TidyRow(item: x, on: ai.chosen.contains(x.id)) { ai.toggle(x.id) }
                }
            }
            .glass50Card(p, radius: 18)
        } else if Skjold77.finished(ai.jobState) && ai.tidyError.isEmpty {
            PCard { Text("Glimt fant ingenting å rydde.").font(PF.ui(14)).foregroundStyle(p.mut) }
        }
    }

    private var count: Int { ai.tidyItems.filter { ai.chosen.contains($0.id) && $0.changed }.count }

    private var buttons: some View {
        HStack(spacing: 8) {
            Skj76Button(title: ai.applying ? "Lagrer …" : "Godta valgte (\(count))", icon: "checkmark", filled: true) {
                Task { @MainActor in
                    if await ai.applyChosen(store) { m.sheet = nil }
                }
            }
            .disabled(count == 0 || ai.applying)
            Skj76Button(title: "Hopp over", icon: "forward") {
                ai.closeTidy()
                m.sheet = nil
            }
        }
    }
}

struct Skj77TidyRow: View {
    @Environment(\.paper) private var p
    let item: Skj77TidyItem
    let on: Bool
    let toggle: () -> Void

    var body: some View {
        Button { if item.changed { toggle() } } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: on && item.changed ? "checkmark.square.fill" : "square").font(.system(size: 20))
                    .foregroundStyle(item.changed ? (on ? p.lab : p.ink) : p.mut.opacity(0.4))
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.oldName.isEmpty ? "Uten navn" : item.oldName).font(PF.ui(13)).strikethrough(nameChanged).foregroundStyle(p.mut).lineLimit(1)
                    after
                }
                Spacer(minLength: 4)
                if item.changed { Text(item.after.percent).font(PF.mono(10.5)).foregroundStyle(p.mut) }
            }
            .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.oldName + " til " + item.after.name)
    }

    private var nameChanged: Bool { !item.after.name.isEmpty && item.after.name != item.oldName }

    @ViewBuilder
    private var after: some View {
        if !item.error.isEmpty {
            Text(item.error).font(PF.ui(12.5)).foregroundStyle(p.lab)
        } else if !item.changed {
            Text("Ingen endring").font(PF.ui(12.5)).foregroundStyle(p.mut)
        } else {
            Text("→ " + (item.after.name.isEmpty ? item.oldName : item.after.name)).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(2)
            categoryLine
            let specs: String = item.after.specs.map { $0.k + " " + $0.v }.joined(separator: " · ")
            if !specs.isEmpty { Text(specs).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2) }
        }
    }

    private var categoryLine: some View {
        let old: String = item.oldCategory.isEmpty ? "Uten kategori" : item.oldCategory
        let new: String = item.after.category.isEmpty ? old : item.after.category
        return HStack(spacing: 6) {
            Text(old == new ? new : old + " → " + new).font(PF.mono(10.5)).foregroundStyle(p.lab).lineLimit(1)
            if item.after.categoryNew { Skj76Badge(text: "ny") }
        }
    }
}

/* ---------- Innstillinger (⚙ i Skjold Lab, og Innstillinger → Moduler → Skjold Lab) ---------- */

struct Skj77Settings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var ai: Skjold77 { Skjold77.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Skjold Lab · Glimt", title: "Innstillinger")
                PCard {
                    VStack(alignment: .leading, spacing: 12) {
                        toggle("Finn bilder på nett", "Søk etter bilde av delen (via SearXNG, ellers Wikimedia Commons).",
                               Binding<Bool>(get: { ai.webImages }, set: { ai.webImages = $0; save() }))
                        Divider().overlay(p.line)
                        toggle("Foreslå automatisk når jeg tar bilde", "Glimt foreslår navn, kategori og specs så snart delen får et bilde.",
                               Binding<Bool>(get: { ai.autoSuggest }, set: { ai.autoSuggest = $0; save() }))
                    }
                }
                if !ai.settingsError.isEmpty { Playback44Note(text: ai.settingsError, red: true) }
                Text("Gjenkjenningen kjører på den lokale modellen (AI-kontroll → Oppgaver → «Skjold Lab · gjenkjenning»).")
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .task { await ai.loadSettings(store) }
    }

    private func toggle(_ t: String, _ sub: String, _ b: Binding<Bool>) -> some View {
        Toggle(isOn: b) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.lab)
    }

    private func save() {
        Task { @MainActor in await ai.saveSettings(store) }
    }
}
