import SwiftUI
import AppKit

/* ---------------- Prompt 36: Kalender for Mac – Google Kalender (Konto-fanen og Innstillinger → Kontoer og synk) ---------------- */
// Koblet til: e-posten, «Hovedkalender» (radioliste med skrivbare kalendere, primary først) og «Vis også»
// (brytere for de andre, fargeprikk, «Bare lesing»). Ikke koblet: «Koble til Google» åpner innloggingen i nettleseren.

struct MacGoogle36Section: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var g: KalGoogle36? = nil
    @State private var busy: Bool = false
    @State private var error: String = ""
    @State private var waitingLogin: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Google Kalender").font(MacFont.ui(13, .bold)).foregroundColor(t.ink)
                Spacer()
                if busy { ProgressView().controlSize(.small) }
            }
            content
            if !error.isEmpty {
                Text(error).font(MacFont.ui(12)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(t.line, lineWidth: 1))
        .onAppear { reload() }
    }

    @ViewBuilder private var content: some View {
        if !store.loggedIn {
            Text("Logg inn i hovedvinduet først.").font(MacFont.ui(12)).foregroundColor(t.mut)
        } else if let g {
            if g.connected {
                connected(g)
            } else {
                notConnected(g)
            }
        } else {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Henter Google-kalendere …").font(MacFont.ui(12)).foregroundColor(t.mut)
            }
        }
    }

    private func notConnected(_ g: KalGoogle36) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !g.error.isEmpty {
                Text(g.error).font(MacFont.ui(12)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            Text(g.configured || !g.error.isEmpty
                 ? "Logg inn med Google i Homelab (åpnes i nettleseren). Deretter velger du hovedkalenderen her."
                 : "Google Kalender er ikke satt opp på serveren ennå (Homelab → Innstillinger → Integrasjoner).")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Koble til Google") { login() }
                if waitingLogin {
                    Button("Jeg har logget inn – oppdater") {
                        waitingLogin = false
                        reload()
                    }
                }
            }
        }
    }

    private func connected(_ g: KalGoogle36) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if !g.email.isEmpty {
                Text(g.email).font(MacFont.mono(11)).foregroundColor(t.mut).lineLimit(1)
            }
            if !g.error.isEmpty {
                Text(g.error).font(MacFont.ui(12)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            MacLabel(text: "HOVEDKALENDER")
            ForEach(g.writable) { (c: KalGCal36) in
                MacGoogleMainRow36(c: c, busy: busy) { setMain(c) }
            }
            let rest: [KalGCal36] = g.others
            if !rest.isEmpty {
                MacLabel(text: "VIS OGSÅ").padding(.top, 4)
                ForEach(rest) { (c: KalGCal36) in
                    MacGoogleShowRow36(c: c, busy: busy) { toggleShow(c) }
                }
            }
        }
    }

    private func reload() {
        if !store.loggedIn { return }
        Task {
            let r: KalGoogle36 = await KalGoogleAPI36.fetch()
            g = r
        }
    }

    private func login() {
        waitingLogin = true
        Task {
            if let u = await KalGoogleAPI36.loginURL() {
                await MainActor.run { _ = NSWorkspace.shared.open(u) }
            } else {
                error = "Fikk ikke åpnet innloggingen. Logg inn med Google i Homelab → Innstillinger → Integrasjoner."
            }
        }
    }

    private func setMain(_ c: KalGCal36) {
        if busy || c.main { return }
        save(main: c.id, show: nil)
    }

    private func toggleShow(_ c: KalGCal36) {
        guard let g, !busy else { return }
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
            if r.0 != nil { await store.load(force: true) }
        }
    }
}

struct MacGoogleMainRow36: View {
    @Environment(\.mk) private var t
    let c: KalGCal36
    let busy: Bool
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 8) {
                ZStack {
                    Circle().strokeBorder(c.main ? t.acc : t.line, lineWidth: 1.8).frame(width: 16, height: 16)
                    if c.main { Circle().fill(t.acc).frame(width: 8, height: 8) }
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.name).font(MacFont.ui(13, .bold)).foregroundColor(t.ink).lineLimit(1)
                    Text(c.main ? "Personlig · nye hendelser lagres her" : KalGoogleAPI36.accessText(c))
                        .font(MacFont.ui(11)).foregroundColor(t.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
            }
            .frame(minHeight: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel(c.name + (c.main ? ", hovedkalender" : ""))
    }
}

struct MacGoogleShowRow36: View {
    @Environment(\.mk) private var t
    let c: KalGCal36
    let busy: Bool
    let tap: () -> Void

    private var dotColor: Color { c.color.isEmpty ? t.mut : Color(kalHex: c.color) }

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(dotColor).frame(width: 10, height: 10).frame(width: 16)
            VStack(alignment: .leading, spacing: 1) {
                Text(c.name).font(MacFont.ui(13, .bold)).foregroundColor(t.ink).lineLimit(1)
                Text(KalGoogleAPI36.accessText(c)).font(MacFont.ui(11)).foregroundColor(t.mut).lineLimit(1)
            }
            Spacer(minLength: 4)
            Toggle("", isOn: Binding<Bool>(get: { c.shown }, set: { (_: Bool) in tap() }))
                .toggleStyle(.switch)
                .labelsHidden()
                .controlSize(.small)
                .disabled(busy)
        }
        .frame(minHeight: 32)
        .accessibilityLabel(c.name + (c.shown ? ", vises" : ", vises ikke"))
    }
}
