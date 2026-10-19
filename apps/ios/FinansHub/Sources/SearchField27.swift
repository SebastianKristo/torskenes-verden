import SwiftUI
import UIKit

/* ---------------- Prompt 27: felles søkefelt med ✕ til venstre ---------------- */
// Fasit: «Tøm søket» i design/Mobil Papir App.dc.html, Boliger/Bursdager/Vaer/Nyhetsleser/Matplan.dc.html og
// prompts/prompt-27-pakke/claude-code-tom-sok.md.
// Tomt felt: ikonet til venstre (forstørrelsesglass, ⌕ eller Google-G). Med tekst: ikonet byttes med ✕ på samme plass,
// 26 pt sirkel (rgba(127,127,127,.22)), 11 pt kryss og 44 pt trykkflate. Trykk tømmer feltet og kaller onClear
// (avbryt ventende søk, lukk forslag og treff). Fokus og tastatur blir stående (ingen blur). Ikke clearButtonMode.
// Feltet har ingen egen bakgrunn: hver side beholder sin kapsel/ramme rundt.

/// Standardikonet i tomt felt.
struct SearchGlass27: View {
    @Environment(\.paper) private var p
    var size: CGFloat = 16
    var color: Color? = nil

    var body: some View {
        Image(systemName: "magnifyingglass")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(color ?? p.mut)
            .accessibilityHidden(true)
    }
}

/// ✕-knappen alene (brukes av SearchField27, og der et felt må bygges for hånd).
struct SearchClear27: View {
    @Environment(\.paper) private var p
    var color: Color? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().fill(Color(white: 0.5).opacity(0.22)).frame(width: 26, height: 26)
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(color ?? p.ink)
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // 44 pt trykkflate, men tar bare plassen til ikonet i raden (som margin:0 -6px 0 -8px i fasiten).
        .padding(.leading, -10)
        .padding(.trailing, -8)
        .accessibilityLabel("Tøm søket")
    }
}

/// Bruk: `SearchField27(text: $q, placeholder: "Søk")` (forstørrelsesglass), eller med eget ikon
/// `SearchField27(text: $q, placeholder: "Søk", lead: { GoogleG(size: 17) })`. Gi `lead:` alltid med etikett
/// (ikke som etterfølgende closure), ellers kan den forveksles med onSubmit.
struct SearchField27<Lead: View>: View {
    @Environment(\.paper) private var p
    @Binding var text: String
    let placeholder: String
    var font: Font = PF.ui(15, .medium)
    var ink: Color? = nil
    var placeholderColor: Color? = nil
    var submitLabel: SubmitLabel = .search
    var keyboard: UIKeyboardType = .default
    var autocap: TextInputAutocapitalization = .sentences
    var focus: FocusState<Bool>.Binding? = nil
    var onClear: () -> Void = {}
    var onSubmit: () -> Void = {}
    let lead: Lead

    init(text: Binding<String>, placeholder: String, font: Font = PF.ui(15, .medium), ink: Color? = nil, placeholderColor: Color? = nil,
         submitLabel: SubmitLabel = .search, keyboard: UIKeyboardType = .default, autocap: TextInputAutocapitalization = .sentences,
         focus: FocusState<Bool>.Binding? = nil, onClear: @escaping () -> Void = {}, onSubmit: @escaping () -> Void = {},
         @ViewBuilder lead: () -> Lead) {
        self._text = text
        self.placeholder = placeholder
        self.font = font
        self.ink = ink
        self.placeholderColor = placeholderColor
        self.submitLabel = submitLabel
        self.keyboard = keyboard
        self.autocap = autocap
        self.focus = focus
        self.onClear = onClear
        self.onSubmit = onSubmit
        self.lead = lead()
    }

    var body: some View {
        HStack(spacing: 10) {
            if text.isEmpty {
                lead
            } else {
                SearchClear27(color: ink) {
                    text = ""
                    onClear()
                }
            }
            withFocus(field)
        }
    }

    private var field: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundColor(placeholderColor ?? p.mut))
            .font(font)
            .foregroundStyle(ink ?? p.ink)
            .autocorrectionDisabled()
            .textInputAutocapitalization(autocap)
            .keyboardType(keyboard)
            .submitLabel(submitLabel)
            .onSubmit(onSubmit)
    }

    @ViewBuilder private func withFocus<V: View>(_ v: V) -> some View {
        if let f = focus { v.focused(f) } else { v }
    }
}

extension SearchField27 where Lead == SearchGlass27 {
    /// Med standardikonet (forstørrelsesglass).
    init(text: Binding<String>, placeholder: String, font: Font = PF.ui(15, .medium), ink: Color? = nil, placeholderColor: Color? = nil,
         submitLabel: SubmitLabel = .search, keyboard: UIKeyboardType = .default, autocap: TextInputAutocapitalization = .sentences,
         focus: FocusState<Bool>.Binding? = nil, iconSize: CGFloat = 16,
         onClear: @escaping () -> Void = {}, onSubmit: @escaping () -> Void = {}) {
        self.init(text: text, placeholder: placeholder, font: font, ink: ink, placeholderColor: placeholderColor, submitLabel: submitLabel,
                  keyboard: keyboard, autocap: autocap, focus: focus, onClear: onClear, onSubmit: onSubmit) {
            SearchGlass27(size: iconSize, color: placeholderColor)
        }
    }
}
