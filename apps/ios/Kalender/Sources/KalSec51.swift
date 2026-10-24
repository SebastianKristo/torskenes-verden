import SwiftUI
import UIKit

/* ---------------- Prompt 51 (KAL51): Kalender iPhone/iPad – godkjenning av ny enhet, Sikkerhet, «Nytt i denne versjonen» ---------------- */
// Logikken ligger i SharedKal/Core/KalSec51Core.swift (felles med Mac). Her er bare visningene:
// - KalApprove51Wait: innloggingen venter på godkjenning (KalLogin41View, fase «approve51»).
// - KalSec51Section: Innstillinger → SIKKERHET (ventende enheter med Godkjenn/Avvis, Face ID før godkjenning).
// - KalNew51Host: kortet «Nytt i denne versjonen» første gang etter en oppdatering.

/// «Venter på godkjenning» – innloggingen er stoppet til en kjent enhet godkjenner (eller den utløper etter 15 min).
struct KalApprove51Wait: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(t.red)
            explain
            if let ap = m.approval51 { facts(ap) }
            Button(action: { m.cancelApproval51() }) {
                Text("Avbryt").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Avbryt innloggingen")
        }
    }

    private var explain: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Godkjenn innloggingen fra en enhet som allerede er logget inn – Kalender eller Homelab-appen (Innstillinger → Sikkerhet), eller Homelab på web.")
                .font(KalFont.ui(13.5)).foregroundStyle(t.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Er du hjemme? Logg inn på hjemmenettet, så trengs ingen godkjenning. Du kan også avbryte og bruke «Logg inn med Homelab-appen» eller QR-kode.")
                .font(KalFont.ui(12.5)).foregroundStyle(t.mut)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
    }

    private func facts(_ ap: KalApproval51) -> some View {
        VStack(spacing: 2) {
            if !ap.device.isEmpty {
                Text("Enhet: " + ap.device).font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.mut)
            }
            Text("Venter til kl. " + KalSec51.hm(ap.expires)).font(KalFont.ui(12.5)).foregroundStyle(t.mut2)
        }
        .multilineTextAlignment(.center)
    }
}

/* ---------- Innstillinger → SIKKERHET ---------- */

struct KalSec51Section: View {
    @Environment(\.kal) private var t
    @ObservedObject private var m: KalSec51Model = KalSec51Model.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if m.pending.isEmpty {
                emptyRow
            } else {
                ForEach(m.pending) { (p: KalPendingDev51) in KalSec51Row(p: p) }
            }
            if !m.message.isEmpty {
                Text(m.message).font(KalFont.ui(12.5)).foregroundStyle(t.mut)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.vertical, 8)
            }
            KalLinkRow35(title: "Nytt i denne versjonen", sub: "Endringene i siste oppdatering av Homelab") {
                Task { await m.loadWhatsNew(force: true) }
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
        .onAppear { Task { await m.loadPending() } }
    }

    private var emptyRow: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Ingen enheter venter").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
            Text("Nye enheter som logger inn fra internett må godkjennes her, i Homelab-appen eller på web.")
                .font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}

struct KalSec51Row: View {
    @Environment(\.kal) private var t
    @ObservedObject private var m: KalSec51Model = KalSec51Model.shared
    let p: KalPendingDev51

    private var sub: String {
        var parts: [String] = []
        if !p.userName.isEmpty { parts.append(p.userName) }
        if !p.place.isEmpty { parts.append(p.place) }
        if !p.method.isEmpty { parts.append(p.method) }
        if let c = p.created { parts.append("kl. " + KalSec51.hm(c)) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(p.device).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                if m.busyId == p.id {
                    ProgressView().tint(t.red)
                } else {
                    KalPill(title: "Godkjenn", height: 34) { m.decide(p, approve: true) }
                    KalPill(title: "Avvis", filled: false, height: 34) { m.decide(p, approve: false) }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
        .accessibilityElement(children: .contain)
    }
}

/* ---------- «Nytt i denne versjonen» ---------- */

/// Legges over hele appen (KalSchemeReader). Tegner ingenting når det ikke er noe å vise.
struct KalNew51Host: View {
    @Environment(\.kal) private var t
    @ObservedObject private var m: KalSec51Model = KalSec51Model.shared

    var body: some View {
        ZStack {
            if let w = m.whatsNew {
                Color.black.opacity(0.35).ignoresSafeArea()
                    .onTapGesture { m.dismissWhatsNew() }
                KalNew51Card(w: w) { m.dismissWhatsNew() }
                    .padding(.horizontal, 22)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: m.whatsNew)
    }
}

struct KalNew51Card: View {
    @Environment(\.kal) private var t
    let w: KalWhatsNew51
    let close: () -> Void

    private var heading: String { w.title.isEmpty ? "Versjon " + w.version : w.title }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            KalLabel(text: "NYTT I DENNE VERSJONEN", color: t.red)
            Text(heading).font(KalFont.serif(26)).foregroundStyle(t.ink)
                .fixedSize(horizontal: false, vertical: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(0..<w.items.count, id: \.self) { (i: Int) in item(w.items[i]) }
                }
            }
            .frame(maxHeight: 320)
            HStack {
                Text(w.version + (w.date.isEmpty ? "" : " · " + w.date)).font(KalFont.mono(11)).foregroundStyle(t.mut2)
                Spacer()
                KalPill(title: "Fint") { close() }
            }
        }
        .padding(20)
        .frame(maxWidth: 440)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(t.bg))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(t.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.2), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
    }

    private func item(_ s: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("•").font(KalFont.ui(14, .bold)).foregroundStyle(t.red)
            Text(s).font(KalFont.ui(14)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}
