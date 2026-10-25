import SwiftUI
import UIKit

/* ---------------- Prompt 41: Kvitteringer → Bokført kan åpnes og leses på nytt ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-finans-les-pa-nytt-alltid.md («Åpne bokførte kvitteringer»).
// Fasit: Mobil Papir App.dc.html → Finans → Kvitteringer → Bokført.
// – Trykk på en bokført rad åpner den: bildet av kvitteringen (trykk = fullskjerm med zoom), navn og beløp, kategori,
//   «Lagre endringer» (PATCH /receipts/:id – serveren oppdaterer den bokførte transaksjonen og logger endringen)
//   og «↺ Til gjennomgang». «✦ På nytt» står på raden og bruker samme kø og fremdrift som vanlig lesing (Rean39Model).
// – Ny lesing endrer aldri bokføringen av seg selv: serveren lagrer resultatet som forslag.

struct Receipts41BookedRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let model: Receipts23Model
    let r: Receipt
    let first: Bool
    @State private var name: String = ""
    @State private var amount: String = ""
    @State private var cat: Int? = nil
    @State private var saving: Bool = false
    @State private var zoom: Bool = false
    @MainActor private var rean: Rean39Model { Rean39Model.shared }

    private var isOpen: Bool { model.open == "b:" + r.id }

    var body: some View {
        VStack(spacing: 0) {
            if !first { Receipts23Divider() }
            HStack(spacing: 10) {
                Button {
                    Haptics.shared.select()
                    withAnimation(.easeOut(duration: 0.18)) { model.open = isOpen ? nil : "b:" + r.id }
                } label: {
                    Receipts23Line(r: r, meta: meta).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button { rean.start(r, model, store) } label: {
                    Text(reanLabel).font(PF.ui(12.5, .bold)).foregroundStyle(p.lab).monospacedDigit().lineLimit(1)
                        .padding(.horizontal, 10).frame(height: 30)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(reanBusy)
                .accessibilityLabel("Les kvitteringen på nytt med Glimt")
            }
            .padding(.vertical, 12)
            .overlay(alignment: .bottom) {
                if !isOpen, let j = rean.jobs[r.id], j.step != "error" { Rean39Line(pct: j.pct) }
            }
            if isOpen { editor.padding(.bottom, 14).transition(.opacity) }
        }
        .onAppear(perform: reset)
        .onChange(of: r) { _, _ in reset() }
        .fullScreenCover(isPresented: $zoom) {
            Receipts41Zoom(path: "/finans/api/receipts/\(r.id)/file", thumb: "/finans/api/receipts/\(r.id)/thumb") { zoom = false }
        }
    }

    private var meta: String {
        if let j = rean.jobs[r.id] {
            if j.step == "error" { return "✕ " + (j.msg.isEmpty ? "Glimt fikk ikke lest kvitteringen" : j.msg) }
            return "✦ Glimt analyserer på nytt … \(j.pct) %"
        }
        return ddmm(r.date) + " · " + Receipts23Line.category(store, r.categoryId)
    }

    private var reanBusy: Bool {
        guard let j = rean.jobs[r.id] else { return false }
        return j.step != "error"
    }

    private var reanLabel: String {
        guard let j = rean.jobs[r.id], j.step != "error" else { return "✦ På nytt" }
        return "✦ \(j.pct) %"
    }

    private func reset() {
        name = r.merchant ?? ""
        amount = r.total.map { String(format: "%.2f", abs($0)).replacingOccurrences(of: ".", with: ",") } ?? ""
        cat = r.categoryId
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { Haptics.shared.tap(); zoom = true } label: {
                PaperServerImage(path: "/finans/api/receipts/\(r.id)/thumb", tint: p.bg, initials: "⎙")
                    .frame(maxWidth: .infinity).frame(height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "arrow.up.left.and.arrow.down.right").font(.dyn51(size: 12, weight: .bold)).foregroundStyle(Color.white)
                            .frame(width: 30, height: 30).background(Color.black.opacity(0.45), in: Circle()).padding(8)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Vis kvitteringen i fullskjerm")
            HStack(spacing: 8) {
                field(TextField("Butikk", text: $name).font(PF.ui(14, .semibold)))
                field(TextField("0,00", text: $amount).font(PF.mono(14)).multilineTextAlignment(.trailing).keyboardType(.decimalPad))
                    .frame(width: 120)
            }
            Receipts23CategoryChips(selected: $cat)
            HStack(spacing: 8) {
                Button { save() } label: {
                    HStack(spacing: 6) {
                        if saving { ProgressView().tint(p.bg) }
                        Text("Lagre endringer").font(PF.ui(14, .bold))
                    }
                    .foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity, minHeight: 42).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(saving)
                Button { Haptics.shared.tap(); Task { await model.unbook(r.id, store); model.open = nil } } label: {
                    Text("↺ Til gjennomgang").font(PF.ui(13, .bold)).foregroundStyle(p.ink).padding(.horizontal, 14)
                        .frame(minHeight: 42).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            if let j = rean.jobs[r.id] { Rean39Panel(r: r, model: model, job: j) }
        }
        .animation(.easeOut(duration: 0.2), value: rean.jobs[r.id] != nil)
    }

    private func field<V: View>(_ v: V) -> some View {
        v.foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 42)
            .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
    }

    private func save() {
        let clean: String = amount.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "")
            .replacingOccurrences(of: "−", with: "").replacingOccurrences(of: "-", with: "").replacingOccurrences(of: ",", with: ".")
        var body: [String: Any] = ["merchant": name.trimmingCharacters(in: .whitespaces)]
        if let t = Double(clean) { body["total"] = t }
        if let c = cat { body["categoryId"] = c }
        let id: String = r.id
        let m: Receipts23Model = model
        let st: Store = store
        saving = true
        Task {
            do {
                try await st.api.call("PATCH", "/receipts/\(id)", json: body)
                Haptics.shared.success()
                st.flash("Lagret · endringen er logget")
                m.open = nil
            } catch {
                st.message = error.localizedDescription
            }
            saving = false
            await m.load(st)
        }
    }
}

/// Fullskjerm med zoom (klyp) og dra. Viser PDF-er som miniatyr.
struct Receipts41Zoom: View {
    @Environment(Store.self) private var store
    let path: String
    let thumb: String
    let close: () -> Void
    @State private var img: UIImage? = nil
    @State private var scale: CGFloat = 1
    @State private var base: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var last: CGSize = .zero

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            if let img {
                Image(uiImage: img).resizable().scaledToFit()
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(MagnificationGesture()
                        .onChanged { (v: CGFloat) in scale = Swift.max(1, Swift.min(6, base * v)) }
                        .onEnded { (_: CGFloat) in base = scale; if scale <= 1.01 { withAnimation(.easeOut(duration: 0.2)) { offset = .zero; last = .zero } } })
                    .simultaneousGesture(DragGesture()
                        .onChanged { (v: DragGesture.Value) in
                            if scale > 1 { offset = CGSize(width: last.width + v.translation.width, height: last.height + v.translation.height) }
                        }
                        .onEnded { (_: DragGesture.Value) in last = offset })
                    .onTapGesture(count: 2) {
                        withAnimation(.easeOut(duration: 0.2)) {
                            scale = scale > 1 ? 1 : 2.5
                            base = scale
                            if scale == 1 { offset = .zero; last = .zero }
                        }
                    }
            } else {
                ProgressView().tint(Color.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Button(action: close) {
                Image(systemName: "xmark").font(.dyn51(size: 15, weight: .bold)).foregroundStyle(Color.white)
                    .frame(width: 40, height: 40).background(Color.white.opacity(0.18), in: Circle())
            }
            .buttonStyle(.plain)
            .padding(16)
            .accessibilityLabel("Lukk")
        }
        .task {
            if let i = await store.image(path) { img = i } else { img = await store.image(thumb) }
        }
    }
}
