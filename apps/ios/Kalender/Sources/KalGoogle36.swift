import SwiftUI
import UIKit

/* ---------------- Prompt 36: Kalender – Google Kalender i «+ Legg til kalender → Konto» ---------------- */
// Koblet til: e-posten, «Hovedkalender» (radioliste med skrivbare kalendere, primary først – «Personlig · nye hendelser
// lagres her») og «Vis også» (brytere for de andre, fargeprikk, «Bare lesing»). Valgene lagres med PUT og kalenderne
// lastes på nytt, så Google-kalenderne kommer i sidemenyen med merket «Google».
// Ikke koblet: «Koble til Google» åpner innloggingen i Homelab (finanshub://integrasjoner eller weben).

struct KalGoogle36Section: View {
    @Environment(\.kal) private var t
    @Environment(\.scenePhase) private var phase
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var g: KalGoogle36? = nil
    @State private var busy: Bool = false
    @State private var error: String = ""
    @State private var waitingLogin: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            content
            if !error.isEmpty {
                Text(error).font(KalFont.ui(12)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line, lineWidth: 1))
        .onAppear { reload() }
        .onChange(of: phase) { (_: ScenePhase, v: ScenePhase) in
            if v == .active && waitingLogin {
                waitingLogin = false
                g = nil
                reload()
            }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text("Google Kalender").font(KalFont.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
            Spacer()
            if busy { ProgressView().controlSize(.small) }
        }
    }

    @ViewBuilder private var content: some View {
        if let g {
            if g.connected {
                connected(g)
            } else {
                notConnected(g)
            }
        } else {
            HStack(spacing: 8) {
                ProgressView()
                Text("Henter Google-kalendere …").font(KalFont.ui(12)).foregroundStyle(t.mut)
            }
        }
    }

    private func notConnected(_ g: KalGoogle36) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !g.error.isEmpty {
                Text(g.error).font(KalFont.ui(12)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            Text(g.configured || !g.error.isEmpty
                 ? "Logg inn med Google i Homelab. Deretter velger du hovedkalenderen her."
                 : "Google Kalender er ikke satt opp på serveren ennå (Homelab → Innstillinger → Integrasjoner).")
                .font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            KalPill(title: "Koble til Google", height: 36) { login() }
        }
    }

    private func connected(_ g: KalGoogle36) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !g.email.isEmpty {
                Text(g.email).font(KalFont.mono(11.5)).foregroundStyle(t.mut).lineLimit(1)
            }
            if !g.error.isEmpty {
                Text(g.error).font(KalFont.ui(12)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            KalLabel(text: "HOVEDKALENDER")
            ForEach(g.writable) { (c: KalGCal36) in
                KalGoogleMainRow36(c: c, busy: busy) { setMain(c) }
            }
            let rest: [KalGCal36] = g.others
            if !rest.isEmpty {
                KalLabel(text: "VIS OGSÅ").padding(.top, 4)
                ForEach(rest) { (c: KalGCal36) in
                    KalGoogleShowRow36(c: c, busy: busy) { toggleShow(c) }
                }
            }
        }
    }

    private func reload() {
        Task {
            let r: KalGoogle36 = await KalGoogleAPI36.fetch()
            g = r
        }
    }

    private func login() {
        waitingLogin = true
        if let u = URL(string: "finanshub://integrasjoner"), UIApplication.shared.canOpenURL(u) {
            s.showToast("Logg inn med Google i Homelab → Integrasjoner", undo: "")
            UIApplication.shared.open(u)
            return
        }
        Task {
            if let u = await KalGoogleAPI36.loginURL() {
                await MainActor.run { UIApplication.shared.open(u) }
            } else {
                error = "Fikk ikke åpnet innloggingen. Logg inn med Google i Homelab → Innstillinger → Integrasjoner."
            }
        }
    }

    private func setMain(_ c: KalGCal36) {
        if busy || c.main { return }
        KalHaptic.tap()
        save(main: c.id, show: nil)
    }

    private func toggleShow(_ c: KalGCal36) {
        guard let g, !busy else { return }
        KalHaptic.tap()
        var ids: [String] = g.shownIds
        if c.shown {
            ids.removeAll { (x: String) -> Bool in x == c.googleId }
        } else {
            ids.append(c.googleId)
        }
        save(main: nil, show: ids)
    }

    private func save(main: String?, show: [String]?) {
        busy = true
        error = ""
        Task {
            let r: (KalGoogle36?, String) = await KalGoogleAPI36.put(main: main, show: show)
            if let ng = r.0 { g = ng } else { error = r.1 }
            busy = false
            if r.0 != nil { await s.load(force: true) }
        }
    }
}

/// Én rad i «Hovedkalender»: radioknapp, navn og «Personlig · nye hendelser lagres her» for den valgte.
struct KalGoogleMainRow36: View {
    @Environment(\.kal) private var t
    let c: KalGCal36
    let busy: Bool
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 10) {
                ZStack {
                    Circle().strokeBorder(c.main ? t.acc : t.line, lineWidth: 2).frame(width: 20, height: 20)
                    if c.main { Circle().fill(t.acc).frame(width: 10, height: 10) }
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.name).font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(c.main ? "Personlig · nye hendelser lagres her" : KalGoogleAPI36.accessText(c))
                        .font(KalFont.ui(11.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel(c.name + (c.main ? ", hovedkalender" : ""))
        .accessibilityAddTraits(c.main ? .isSelected : [])
    }
}

/// Én rad i «Vis også»: fargeprikk, navn, «Bare lesing» og bryter.
struct KalGoogleShowRow36: View {
    @Environment(\.kal) private var t
    let c: KalGCal36
    let busy: Bool
    let tap: () -> Void

    private var dotColor: Color { c.color.isEmpty ? t.mut : Color(kalHex: c.color) }

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 10) {
                Circle().fill(dotColor).frame(width: 12, height: 12).frame(width: 20)
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.name).font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(KalGoogleAPI36.accessText(c)).font(KalFont.ui(11.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                KalToggle(on: c.shown)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel(c.name + (c.shown ? ", vises" : ", vises ikke"))
    }
}
