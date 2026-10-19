import SwiftUI

/* ---------------- Prompt 33: Kalender – feltet nederst («Spør Glimt eller skriv en hendelse …») og rød + ---------------- */
// Spørsmål gir kortet «SPØR GLIMT · «…» Enter ›». Ellers forhåndsvisning «GLIMT FORSTÅR» mens man skriver.
// Enter / pil legger til → toast «Glimt la til …» med Angre, tastaturet lukkes. Forslag når feltet er tomt og har fokus.

@MainActor
@Observable
final class KalComposerModel {
    static let shared: KalComposerModel = KalComposerModel()
    var text: String = ""
    var focused: Bool = false

    var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    var isQuestion: Bool { trimmed.count >= 3 && KalQuick.isQuestion(trimmed) }

    var parsed: KalParsed? {
        if trimmed.count < 3 || isQuestion { return nil }
        return KalQuick.parse(trimmed, defaultRem: KalStore.shared.defRem)
    }

    var any: Bool { isQuestion || parsed != nil }

    func submit() {
        let q: String = trimmed
        if q.isEmpty { return }
        if isQuestion {
            text = ""
            focused = false
            KalGlimtModel.shared.send(q)
            return
        }
        guard let p = parsed else { return }
        text = ""
        focused = false
        KalHaptic.done()
        let s: KalStore = KalStore.shared
        withAnimation(.easeOut(duration: 0.2)) { s.anchor = p.day }
        Task { await s.add(p, toastPrefix: "Glimt la til") }
    }
}

struct KalComposer: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalComposerModel { KalComposerModel.shared }
    @FocusState private var focus: Bool

    var body: some View {
        VStack(spacing: 8) {
            if m.isQuestion { questionCard }
            if m.focused && m.trimmed.isEmpty { suggestions }
            if let p = m.parsed { KalPreview(p: p) }
            HStack(spacing: 8) {
                field
                plus
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(t.bg)
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
        .animation(.easeOut(duration: 0.25), value: m.trimmed.isEmpty)
        .onChange(of: focus) { (_: Bool, v: Bool) in m.focused = v }
        .onChange(of: m.focused) { (_: Bool, v: Bool) in if focus != v { focus = v } }
    }

    private var field: some View {
        HStack(spacing: 8) {
            Button(action: {
                KalHaptic.tap()
                KalStore.shared.glimtOpen = true
            }) {
                KalSpark(size: 20, fast: m.any || KalGlimtModel.shared.thinking)
            }
            .buttonStyle(.plain)
            .frame(width: 30, height: 44)
            .accessibilityLabel("Åpne Glimt")
            TextField("Spør Glimt eller skriv en hendelse …", text: Binding(get: { m.text }, set: { (v: String) in m.text = v }))
                .font(KalFont.ui(16, .medium))
                .foregroundStyle(t.ink)
                .focused($focus)
                .submitLabel(.done)
                .onSubmit { m.submit() }
            if m.any {
                Button(action: { m.submit() }) {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold))
                        .foregroundStyle(t.bg)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(t.ink))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Send")
            }
        }
        .padding(.leading, 10)
        .padding(.trailing, 6)
        .frame(height: 50)
        .background(RoundedRectangle(cornerRadius: 25).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 25).strokeBorder(t.line, lineWidth: 1))
    }

    private var plus: some View {
        Button(action: { KalStore.shared.openNew() }) {
            Image(systemName: "plus").font(.system(size: 20, weight: .heavy))
                .foregroundStyle(Color.white)
                .frame(width: 50, height: 50)
                .background(Circle().fill(Color(kalHex: "#b23a2a")))
                .shadow(color: Color(kalHex: "#b23a2a", opacity: 0.35), radius: 3, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ny hendelse")
    }

    private var questionCard: some View {
        Button(action: { m.submit() }) {
            HStack(spacing: 10) {
                KalSpark(size: 22, fast: true)
                VStack(alignment: .leading, spacing: 1) {
                    Text("SPØR GLIMT").font(KalFont.mono(10)).tracking(1.4).foregroundStyle(t.acc)
                    Text(m.trimmed).font(KalFont.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("Enter ›").font(KalFont.ui(11.5)).foregroundStyle(t.mut2)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(t.line, lineWidth: 1))
            .shadow(color: Color.black.opacity(0.10), radius: 15, y: 10)
        }
        .buttonStyle(.plain)
        .transition(.opacity.combined(with: .offset(y: 8)))
    }

    private var suggestions: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(Array(KalGlimtModel.suggestions.prefix(4)), id: \.self) { (n: String) in
                    KalSuggestion(title: n, bg: t.card, height: 32) {
                        m.text = ""
                        m.focused = false
                        KalGlimtModel.shared.send(n)
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
        .transition(.opacity)
    }
}

/// «GLIMT FORSTÅR»: tittel, dag, tid, varsel og kalender.
struct KalPreview: View {
    @Environment(\.kal) private var t
    let p: KalParsed

    var body: some View {
        let c: KalCal? = KalStore.shared.cal(p.cal)
        let d: Date = KalD.date(p.day)
        let when: String = KalD.dl(d) + (p.allDay ? " · hele dagen" : " · " + KalD.hm(p.s ?? 0) + "–" + KalD.hm(p.e ?? 0))
        let rem: String = (p.allDay ? "Heldags" : "Varsel " + KalD.remLabel(p.rem)) + " · " + (c?.name ?? "")
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("GLIMT FORSTÅR").font(KalFont.mono(10)).tracking(1.4).foregroundStyle(t.acc)
                Spacer()
                HStack(spacing: 5) {
                    Circle().fill(t.calColor(c)).frame(width: 8, height: 8)
                    Text(c?.name ?? "").font(KalFont.ui(12, .bold)).foregroundStyle(t.calText(c))
                }
            }
            Text(p.title).font(KalFont.serif(22)).foregroundStyle(t.ink)
            Text(when).font(KalFont.ui(13.5, .semibold)).foregroundStyle(t.ink)
            Text(rem).font(KalFont.ui(12.5)).foregroundStyle(t.mut)
            HStack {
                Text("Enter for å legge til").font(KalFont.ui(11.5)).foregroundStyle(t.mut2)
                Spacer()
                KalPill(title: "Legg til", height: 34) { KalComposerModel.shared.submit() }
            }
            .padding(.top, 2)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(t.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.10), radius: 15, y: 10)
        .transition(.opacity.combined(with: .offset(y: 8)))
    }
}
