import SwiftUI
import UIKit

/* ---------------- Prompt 28: Chat – tastatur og nytt «Legg ved»-ark ---------------- */
// prompts/prompt-28-pakke/claude-code-chat-tastatur.md og claude-code-chat-legg-ved.md. Fasit: Chat → + i
// design/Mobil Papir App.dc.html. Arket får høyden etter innholdet (.presentationDetents([.height(h)])) og systemets
// grep-strek. Tre fliser (Kamera · Bilder · Filer), raden «Fra kunnskapsbasen» og fotnoten.

@MainActor
@Observable
final class Chat28 {
    static let shared = Chat28()
    /// Målt høyde på «Legg ved» (pluss litt til grep-streken).
    var plusHeight: CGFloat = 360

    static func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

private struct Chat28HeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = Swift.max(value, nextValue()) }
}

struct Chat28PlusSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27
    let pickPhoto: () -> Void
    let pickCamera: () -> Void
    let pickFile: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            head
            HStack(spacing: 8) {
                Chat28Tile(c: c, icon: "camera", title: "Kamera", act: pickCamera)
                Chat28Tile(c: c, icon: "photo.on.rectangle", title: "Bilder", act: pickPhoto)
                Chat28Tile(c: c, icon: "doc.text", title: "Filer", act: pickFile)
            }
            Chat28KbRow(c: c, count: s.knowledge.count) { s.sheet = "kb" }
            Text("Bilder leses av en bildemodell, f.eks. qwen2.5vl. Filer kan være PDF, Word, tekst eller CSV.")
                .font(c.ui(12)).foregroundStyle(c.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 16)
        .background(GeometryReader { g in Color.clear.preference(key: Chat28HeightKey.self, value: g.size.height) })
        .onPreferenceChange(Chat28HeightKey.self) { h in
            let v: CGFloat = (h + 8).rounded()
            if h > 0 && abs(Chat28.shared.plusHeight - v) > 1 { Chat28.shared.plusHeight = v }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(c.bg)
        .task { if s.knowledge.isEmpty { await s.loadKnowledge(store) } }
    }

    private var head: some View {
        HStack(alignment: .center, spacing: 10) {
            Text("Legg ved").font(c.head(24)).foregroundStyle(c.ink)
            Spacer(minLength: 4)
            Button { s.sheet = nil } label: {
                Image(systemName: "xmark").font(.dyn51(size: 13, weight: .bold)).foregroundStyle(c.ink)
                    .frame(width: 36, height: 36)
                    .background(c.card, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
        .padding(.horizontal, 2)
    }
}

/// Flis: card, radius 18, ikonboks 46×46 radius 14 i bg, strek-ikon, etikett 14/700.
struct Chat28Tile: View {
    let c: ChatPal27
    let icon: String
    let title: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            VStack(spacing: 8) {
                Chat28IconBox(c: c, icon: icon)
                Text(title).font(c.ui(14, .bold)).foregroundStyle(c.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.top, 16).padding(.bottom, 14).padding(.horizontal, 6)
            .frame(maxWidth: .infinity)
            .background(c.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct Chat28IconBox: View {
    let c: ChatPal27
    let icon: String

    var body: some View {
        Image(systemName: icon).font(.dyn51(size: 20, weight: .regular)).foregroundStyle(c.ink)
            .frame(width: 46, height: 46)
            .background(c.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct Chat28KbRow: View {
    let c: ChatPal27
    let count: Int
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Chat28IconBox(c: c, icon: "books.vertical")
                VStack(alignment: .leading, spacing: 2) {
                    Text("Fra kunnskapsbasen").font(c.ui(15, .bold)).foregroundStyle(c.ink)
                    Text(count == 1 ? "1 dokument" : "\(count) dokumenter").font(c.ui(12.5)).foregroundStyle(c.mut)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.dyn51(size: 13, weight: .semibold)).foregroundStyle(c.mut)
            }
            .padding(.leading, 9).padding(.trailing, 14).padding(.vertical, 9)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .background(c.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
