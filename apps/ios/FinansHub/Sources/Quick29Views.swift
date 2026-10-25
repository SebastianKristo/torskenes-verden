import SwiftUI
import UIKit

/* ---------------- Prompt 29: arket «Legg til time», pillen og banneret ---------------- */
// Fasit: design/Kalender.dc.html (qa.open, qa.busy, qa.toast). Arket åpnes med + i Kalender.
// Pillen og banneret ligger øverst over hele appen (PaperShell), så de vises også på Hjem.

struct Quick29Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @FocusState private var focused: Bool
    @MainActor private var q: Quick29Model { Quick29Model.shared }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                Quick29SheetHeader()
                field
                Quick29Chips()
                Quick29PreviewView()
                goButton
                manualButton
                Text("Du kan lukke appen. Timen legges til i bakgrunnen.")
                    .font(PF.ui(12)).foregroundStyle(p.mut)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.bg)
        .onAppear { focused = true }
    }

    private var hasText: Bool { !q.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private var field: some View {
        let b: Binding<String> = Binding<String>(get: { q.text }, set: { v in q.setText(v, store) })
        return TextField("F.eks. «time hos Nina frisør 14.30 25.09» eller lim inn meldingen fra legekontoret", text: b, axis: .vertical)
            .font(PF.ui(16, .medium))
            .foregroundStyle(p.ink)
            .lineLimit(3...8)
            .focused($focused)
            .submitLabel(.done)
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(minHeight: 96, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
    }

    private var goButton: some View {
        Button { q.submit(q.text, store) } label: {
            Text("Legg til i kalenderen").font(PF.ui(16, .bold)).foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(p.lab, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .opacity(hasText ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!hasText)
    }

    private var manualButton: some View {
        Button { q.manual() } label: {
            Text("Fyll ut selv").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct Quick29SheetHeader: View {
    @Environment(\.paper) private var p
    @MainActor private var q: Quick29Model { Quick29Model.shared }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("✦ AI · RASK TIME").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Text("Legg til time").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            }
            Spacer(minLength: 4)
            Button { q.sheetOpen = false } label: {
                Image(systemName: "xmark").font(.dyn51(size: 13, weight: .bold)).foregroundStyle(p.ink)
                    .frame(width: 36, height: 36)
                    .background(p.card, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
    }
}

/// Lim inn melding · Frisør · Lege · Tannlege · Fysio.
struct Quick29Chips: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var q: Quick29Model { Quick29Model.shared }

    var body: some View {
        Flow(spacing: 6) {
            Button { q.paste(store) } label: {
                HStack(spacing: 6) {
                    Image(systemName: "doc.on.clipboard").font(.dyn51(size: 12, weight: .semibold))
                    Text("Lim inn melding").font(PF.ui(12.5, .bold))
                }
                .foregroundStyle(p.bg)
                .padding(.horizontal, 12).frame(height: 34)
                .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            ForEach(Quick29Model.chips, id: \.self) { n in
                Button { q.chip(n, store) } label: {
                    Text(n).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 12).frame(height: 34)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Forhåndsvisningen: tittel, dato + tid, sted og «Privat · varsel 1 time før», eller rød tekst når dato mangler.
struct Quick29PreviewView: View {
    @Environment(\.paper) private var p
    @MainActor private var q: Quick29Model { Quick29Model.shared }

    var body: some View {
        let long: Bool = q.text.trimmingCharacters(in: .whitespacesAndNewlines).count > 3
        if long, let pv = q.preview {
            if pv.ok {
                card(pv)
            } else {
                let why: String = pv.why.isEmpty ? "Fant ikke dato." : pv.why
                Text(why + " Skriv f.eks. «25.09» eller «tirsdag».")
                    .font(PF.ui(13)).foregroundStyle(p.lab).padding(.horizontal, 4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else if long && q.parseMissing {
            Text("Forhåndsvisning er ikke tilgjengelig på denne serveren ennå.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).padding(.horizontal, 4)
        }
    }

    private func card(_ pv: Quick29Preview) -> some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: "#6b4fa0")).frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(pv.title.isEmpty ? "Avtale" : pv.title).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                Text(pv.dateLabel).font(PF.ui(13)).foregroundStyle(p.mut)
                if !pv.place.isEmpty {
                    Text(pv.place).font(PF.ui(13)).foregroundStyle(p.mut)
                }
                Text("Privat · varsel 1 time før").font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/* ---------- Pillen og banneret øverst ---------- */

struct Quick29Overlay: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var q: Quick29Model { Quick29Model.shared }

    var body: some View {
        VStack(spacing: 8) {
            if let b = q.banner {
                Quick29Banner(job: b)
                    .transition(.move(edge: .top).combined(with: .opacity))
            } else {
                // Prompt 31: Glimt-toasten (animert merke, trykk = glassboble) i stedet for den statiske pillen (AiJob31.swift).
                Glimt31Overlay()
            }
        }
        .padding(.top, 6)
        .animation(.easeOut(duration: 0.2), value: q.banner)
        .animation(.easeOut(duration: 0.2), value: q.pending)
    }
}

struct Quick29Pill: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Text("✦").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#f08a76"))
            Text(text).font(PF.ui(13, .semibold)).foregroundStyle(p.bg).lineLimit(1)
        }
        .padding(.horizontal, 14).frame(height: 36)
        .background(p.ink, in: Capsule())
        .shadow(color: .black.opacity(0.35), radius: 12, y: 6)
        .accessibilityElement(children: .combine)
    }
}

struct Quick29Banner: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let job: Quick29Job

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text("✓ " + (job.title.isEmpty ? "Timen" : job.title)).font(PF.ui(14, .bold)).foregroundStyle(p.bg).lineLimit(1)
                Text(job.when).font(PF.ui(12.5)).foregroundStyle(p.bg.opacity(0.8)).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { Quick29Model.shared.undo(store) } label: {
                Text("Angre").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 12).frame(height: 34)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { Quick29Model.shared.show(store) } label: {
                Text("Vis").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(p.bg, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 14).padding(.trailing, 10).padding(.vertical, 10)
        .background(p.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 15, y: 8)
        .frame(maxWidth: 440)
        .padding(.horizontal, 12)
        .gesture(DragGesture(minimumDistance: 12).onEnded { v in
            if v.translation.height < -10 { Quick29Model.shared.closeBanner() }
        })
    }
}
