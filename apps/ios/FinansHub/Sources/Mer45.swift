import SwiftUI
import UIKit

/* ---------------- Prompt 45: Mer – seksjonstittel kan skjules/endres, og de fire store boksene velges (claude-code-mer-tittel-og-store-bokser.md) ----------------
 Fasit: Mer Ny.dc.html.
 – I wiggle: rød (−) ved tittelen «HVERDAG OG FAMILIE» skjuler den (kortene blir stående). «+ Legg til tittel» legger den tilbake.
   Trykk på teksten i wiggle gir nytt navn.
 – I wiggle får hver av de fire store boksene et «⇄ Bytt»-merke øverst til høyre → bunnarket «Velg boks» med alle moduler
   (ikon + undertekst), valgt har hake. Lagres per bruker (lokalt per konto + PUT /api/me/layout {mer45:{…}} når serveren godtar det).
 – Finans → Mer bruker samme komponent med mode "finans" (Fin45More.swift), med egne nøkler. */

@MainActor
@Observable
final class Mer45 {
    static let shared = Mer45()
    static let defaultTitle: String = "HVERDAG OG FAMILIE"

    var title: String = Mer45.defaultTitle
    var titleHidden: Bool = false
    /// De fire store boksene (modul-id-er fra More44Rows).
    var big: [String] = Mer44.dailyKeys
    /// Boksen som byttes (åpner «Velg boks»).
    var swapping: String? = nil
    var renaming: Bool = false
    var draft: String = ""

    @ObservationIgnored private var loadedFor: String = ""

    private static var key: String { AcctScope.key("papir_mer45") }

    func boot() {
        let k: String = Mer45.key
        if loadedFor == k { return }
        loadedFor = k
        guard let d = UserDefaults.standard.dictionary(forKey: k) else {
            title = Mer45.defaultTitle; titleHidden = false; big = Mer44.dailyKeys
            return
        }
        apply(d)
    }

    func apply(_ d: [String: Any]) {
        if let t = d["title"] as? String { title = t.isEmpty ? Mer45.defaultTitle : t }
        if let h = d["titleHidden"] as? Bool { titleHidden = h }
        if let b = d["big"] as? [String], !b.isEmpty { big = Array(b.prefix(4)) }
    }

    /// layout.mer45 fra serveren (når den finnes).
    func take(_ o: [String: Any]) {
        guard let m = o["mer45"] as? [String: Any] else { return }
        apply(m)
        UserDefaults.standard.set(m, forKey: Mer45.key)
    }

    private func save(_ store: Store) {
        let v: [String: Any] = ["title": title == Mer45.defaultTitle ? "" : title, "titleHidden": titleHidden, "big": big]
        UserDefaults.standard.set(v, forKey: Mer45.key)
        let a: API = store.api
        // Tåler at eldre servere avviser nøkkelen (lagres da bare på enheten).
        Task { _ = try? await a.callAt("/api", "PUT", "/me/layout", json: ["mer45": v]) }
    }

    func hideTitle(_ store: Store) {
        Haptics.shared.tick()
        withAnimation(.easeOut(duration: 0.2)) { titleHidden = true }
        save(store)
    }

    func showTitle(_ store: Store) {
        Haptics.shared.tick()
        withAnimation(.easeOut(duration: 0.2)) { titleHidden = false }
        save(store)
    }

    func startRename() {
        draft = title
        renaming = true
    }

    func rename(_ store: Store) {
        let t: String = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        title = t.isEmpty ? Mer45.defaultTitle : String(t.prefix(40)).uppercased()
        renaming = false
        save(store)
    }

    /// Bytter boksen `old` med modulen `new`. Er `new` allerede en stor boks, bytter de plass.
    func swap(_ old: String, to new: String, _ store: Store) {
        Haptics.shared.select()
        var b: [String] = big
        guard let i = b.firstIndex(of: old) else { return }
        if let j = b.firstIndex(of: new) { b[j] = old }
        b[i] = new
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { big = b }
        swapping = nil
        save(store)
    }

    func reset(_ store: Store) {
        withAnimation(.easeOut(duration: 0.2)) { big = Mer44.dailyKeys; title = Mer45.defaultTitle; titleHidden = false }
        save(store)
    }
}

/// Tittelen over de store boksene. I wiggle: (−) skjuler, trykk på teksten gir nytt navn.
struct Mer45Title: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Mer45 { Mer45.shared }
    let editing: Bool

    var body: some View {
        if !s.titleHidden {
            HStack(spacing: 8) {
                if editing { minus }
                Button { if editing { s.startRename() } } label: {
                    Text(s.title).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.mut).lineLimit(1)
                        .padding(.vertical, editing ? 6 : 0)
                        .overlay(alignment: .bottom) { if editing { Rectangle().fill(p.line).frame(height: 1) } }
                }
                .buttonStyle(.plain)
                .disabled(!editing)
                .accessibilityHint(editing ? "Gi tittelen nytt navn" : "")
            }
            .padding(.horizontal, 4)
        } else if editing {
            Button { s.showTitle(store) } label: {
                Text("+ Legg til tittel").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                    .padding(.horizontal, 10).frame(height: 30)
                    .overlay(Capsule().stroke(p.lab.opacity(0.5), style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])))
            }
            .buttonStyle(.plain)
        }
    }

    private var minus: some View {
        Button { s.hideTitle(store) } label: {
            Image(systemName: "minus").font(.system(size: 11, weight: .heavy)).foregroundStyle(Color.white)
                .frame(width: 22, height: 22)
                .background(p.lab, in: Circle())
                .contentShape(Circle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Skjul tittelen")
    }
}

/// «⇄ Bytt» øverst til høyre på en stor boks i wiggle.
struct Mer45SwapBadge: View {
    @Environment(\.paper) private var p
    let key: String
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 3) {
                Image(systemName: "arrow.left.arrow.right").font(.system(size: 10, weight: .heavy))
                Text("Bytt").font(PF.ui(11, .bold))
            }
            .foregroundStyle(p.bg)
            .padding(.horizontal, 8).frame(height: 24)
            .background(p.ink, in: Capsule())
            .shadow(color: Color.black.opacity(0.25), radius: 4, y: 2)
            .contentShape(Capsule().inset(by: -6))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .offset(x: 6, y: -8)
        .accessibilityLabel("Bytt boks")
    }
}

/// Bunnarket «Velg boks»: alle moduler med ikon og undertekst. Valgt modul har hake.
struct Mer45PickSheet: View {
    @Environment(\.paper) private var p
    let current: String
    let rows: [More28Row]
    let sub: (More28Row) -> String
    let pick: (String) -> Void
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text("Velg boks").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer(minLength: 4)
                SheetButton30(kind: .primary, title: "Ferdig") { close() }
            }
            Text("Velg hva som skal vises i den store boksen.").font(PF.ui(13.5)).foregroundStyle(p.mut)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { (pair: (offset: Int, element: More28Row)) in
                        row(pair.element, first: pair.offset == 0)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 12)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private func row(_ r: More28Row, first: Bool) -> some View {
        let on: Bool = r.id == current
        return Button { pick(r.id) } label: {
            HStack(spacing: 12) {
                More44ToolRowContentPlain45(row: r, sub: sub(r))
                if on {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .heavy)).foregroundStyle(p.lab)
                }
            }
            .padding(.horizontal, 14).frame(minHeight: 60)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}

/// Ikon + navn + undertekst uten pil (radene i «Velg boks»).
struct More44ToolRowContentPlain45: View {
    @Environment(\.paper) private var p
    let row: More28Row
    let sub: String

    var body: some View {
        let t: (Color, Color) = More44.tint(row.id, p)
        HStack(spacing: 12) {
            Image(systemName: row.icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(t.1)
                .frame(width: 34, height: 34)
                .background(t.0, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(row.name).font(PF.serif(17, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
        }
    }
}

/// Arket «Velg boks» og navnet på tittelen, lagt på Mer-siden (holder body i PaperMore44 liten).
struct Mer45Sheets: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let all: [More28Row]

    func body(content: Content) -> some View {
        content
            .sheet(item: swapBinding) { (sw: Sec32bId) in sheet(sw.id) }
            .alert("Navn på tittelen", isPresented: renameBinding) {
                TextField("HVERDAG OG FAMILIE", text: draftBinding)
                Button("Avbryt", role: .cancel) { Mer45.shared.renaming = false }
                Button("Lagre") { Mer45.shared.rename(store) }
            }
    }

    private var swapBinding: Binding<Sec32bId?> {
        Binding<Sec32bId?>(get: { Mer45.shared.swapping.map { Sec32bId(id: $0) } }, set: { Mer45.shared.swapping = $0?.id })
    }

    private var renameBinding: Binding<Bool> {
        Binding<Bool>(get: { Mer45.shared.renaming }, set: { Mer45.shared.renaming = $0 })
    }

    private var draftBinding: Binding<String> {
        Binding<String>(get: { Mer45.shared.draft }, set: { Mer45.shared.draft = $0 })
    }

    private func sheet(_ cur: String) -> some View {
        let rows: [More28Row] = all.filter { $0.id != Mer28.locked }
        let st: Store = store
        return Mer45PickSheet(current: cur, rows: rows, sub: { (r: More28Row) in More44Rows.line(r, st) },
                              pick: { (k: String) in Mer45.shared.swap(cur, to: k, st) }, close: { Mer45.shared.swapping = nil })
            .environment(\.paper, p)
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .sheetEdge30(p.bg)
    }
}
