import SwiftUI
import AppKit

/* ---------------- Prompt 51 (KAL51): Kalender for Mac – godkjenning av ny enhet, Sikkerhet, «Nytt i denne versjonen» ---------------- */
// Logikken ligger i SharedKal/Core/KalSec51Core.swift (felles med iPhone/iPad). Her er bare visningene (macOS 13, ObservableObject):
// - MacApprove51Wait: innloggingen venter på godkjenning (MacLogin41View, fase «approve51»).
// - MacSec51Section: Innstillinger → Kontoer → SIKKERHET (ventende enheter med Godkjenn (Touch ID/passord først) og Avvis).
// - MacNew51Host: kortet «Nytt i denne versjonen» over hovedvinduet første gang etter en oppdatering.

struct MacApprove51Wait: View {
    @Environment(\.mk) private var t
    @ObservedObject var m: MacLogin41Model

    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.regular)
            VStack(alignment: .leading, spacing: 8) {
                Text("Godkjenn innloggingen fra en enhet som allerede er logget inn – Kalender eller Homelab-appen (Innstillinger → Sikkerhet), eller Homelab på web.")
                    .font(MacFont.ui(13)).foregroundColor(t.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Er du hjemme? Logg inn på hjemmenettet, så trengs ingen godkjenning. Du kan også avbryte og bruke «Logg inn med Homelab-appen» eller QR-kode.")
                    .font(MacFont.ui(12)).foregroundColor(t.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
            if let ap = m.approval51 { facts(ap) }
            MacPill(title: "Avbryt", filled: false, height: 36) { m.cancelApproval51() }
        }
    }

    private func facts(_ ap: KalApproval51) -> some View {
        VStack(spacing: 2) {
            if !ap.device.isEmpty {
                Text("Enhet: " + ap.device).font(MacFont.ui(12, .semibold)).foregroundColor(t.mut)
            }
            Text("Venter til kl. " + KalSec51.hm(ap.expires)).font(MacFont.ui(12)).foregroundColor(t.mut2)
        }
    }
}

/* ---------- Innstillinger → Kontoer → SIKKERHET ---------- */

struct MacSec51Section: View {
    @Environment(\.mk) private var t
    @ObservedObject private var m: KalSec51Model = KalSec51Model.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if m.pending.isEmpty {
                Text("Ingen enheter venter på godkjenning.").font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink)
                Text("Nye enheter som logger inn fra internett må godkjennes her, i Homelab-appen eller på web.")
                    .font(MacFont.ui(12)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(m.pending) { (p: KalPendingDev51) in MacSec51Row(p: p) }
            }
            if !m.message.isEmpty {
                Text(m.message).font(MacFont.ui(12)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                MacPill(title: "Oppdater", filled: false, height: 28) { Task { await m.loadPending() } }
                MacPill(title: "Nytt i denne versjonen", filled: false, height: 28) { Task { await m.loadWhatsNew(force: true) } }
            }
        }
        .onAppear { Task { await m.loadPending() } }
    }
}

struct MacSec51Row: View {
    @Environment(\.mk) private var t
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
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(p.device).font(MacFont.ui(13.5, .bold)).foregroundColor(t.ink)
                Text(sub).font(MacFont.ui(11.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            if m.busyId == p.id {
                ProgressView().controlSize(.small)
            } else {
                MacPill(title: "Godkjenn", height: 28) { m.decide(p, approve: true) }
                MacPill(title: "Avvis", filled: false, height: 28) { m.decide(p, approve: false) }
            }
        }
        .padding(.vertical, 4)
    }
}

/* ---------- «Nytt i denne versjonen» ---------- */

/// Legges over hovedvinduet (MacRoot). Observerer bare KalSec51Model – ingen ny tegning av resten av vinduet.
struct MacNew51Host: View {
    @Environment(\.mk) private var t
    @ObservedObject private var m: KalSec51Model = KalSec51Model.shared

    var body: some View {
        ZStack {
            if let w = m.whatsNew {
                Color.black.opacity(0.3)
                    .onTapGesture { m.dismissWhatsNew() }
                MacNew51Card(w: w) { m.dismissWhatsNew() }
            }
        }
    }
}

struct MacNew51Card: View {
    @Environment(\.mk) private var t
    let w: KalWhatsNew51
    let close: () -> Void

    private var heading: String { w.title.isEmpty ? "Versjon " + w.version : w.title }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            MacLabel(text: "NYTT I DENNE VERSJONEN", color: t.acc)
            Text(heading).font(MacFont.serif(26)).foregroundColor(t.ink).fixedSize(horizontal: false, vertical: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(0..<w.items.count, id: \.self) { (i: Int) in item(w.items[i]) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 300)
            HStack {
                Text(w.version + (w.date.isEmpty ? "" : " · " + w.date)).font(MacFont.mono(11)).foregroundColor(t.mut2)
                Spacer()
                MacPill(title: "Fint") { close() }.keyboardShortcut(.defaultAction)
            }
        }
        .padding(22)
        .frame(width: 440)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.bg))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(t.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.25), radius: 20, y: 8)
    }

    private func item(_ s: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("•").font(MacFont.ui(13, .bold)).foregroundColor(t.acc)
            Text(s).font(MacFont.ui(13.5)).foregroundColor(t.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}
