import SwiftUI
import UIKit

/* ---------------- Prompt 39: Kalender – Innstillinger → Kalendere (1a) og Rediger (1b) ---------------- */
// Fasit: Kalendere Oppsett.dc.html. 1a: én rad per kalender – fargeboksen viser/skjuler, navnet åpner Rediger,
// under navnet merke (GOOGLE / URL / INNEBYGD) + kort kilde, antall til høyre. «+ Legg til kalender» (stiplet) og «Sist synket · Synk nå».
// 1b: fargeflate + type + navn, Lagre oppe til høyre. Navn, Farge (10), KILDE, VIS OG VARSLE, Fjern kalenderen (ikke Personlig).

struct KalCals39View: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button(action: { s.closeCals39() }) {
                        Text(s.settingsOpen ? "‹ Innstillinger" : "‹ Kalender").font(KalFont.ui(15, .semibold)).foregroundStyle(t.ink).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    KalPill(title: "Ferdig") { s.closeCals39() }
                }
                Text("Kalendere").font(KalFont.serif(34)).foregroundStyle(t.ink)
                migrationBanner
                VStack(spacing: 0) {
                    ForEach(s.cals39) { (c: KalCal) in
                        KalCalRow39(c: c, first: c.id == s.cals39.first?.id)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
                Button(action: { s.openAdd39() }) {
                    Text("+ Legg til kalender").font(KalFont.ui(15, .bold)).foregroundStyle(t.ink)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .overlay(Capsule().strokeBorder(t.line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Legg til kalender")
                VStack(alignment: .leading, spacing: 4) {
                    Text("Trykk på fargen for å vise eller skjule. Trykk på navnet for å redigere.")
                        .font(KalFont.ui(12.5)).foregroundStyle(t.mut2).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 4) {
                        Text(syncText).font(KalFont.ui(12.5)).foregroundStyle(t.mut2)
                        Button(action: {
                            KalHaptic.tap()
                            Task { await s.load(force: true) }
                        }) {
                            Text(s.loading ? "Synker …" : "Synk nå").font(KalFont.ui(12.5, .bold)).foregroundStyle(t.red)
                        }
                        .buttonStyle(.plain)
                    }
                    if !s.lastError.isEmpty {
                        Text(s.lastError).font(KalFont.ui(12)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 6)
                Color.clear.frame(height: 24)
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
        }
        .scrollIndicators(.hidden)
        .background(t.bg.ignoresSafeArea())
        .gesture(DragGesture(minimumDistance: 24).onEnded { (v: DragGesture.Value) in
            if v.startLocation.x < 40 && v.translation.width > 80 && abs(v.translation.width) > abs(v.translation.height) { s.closeCals39() }
        })
    }

    private var syncText: String {
        guard let u = s.updated else { return "Ikke synket ennå ·" }
        return "Sist synket " + KalD.hm(KalD.minutes(u)) + " ·"
    }

    @ViewBuilder private var migrationBanner: some View {
        let text: String = s.migration39Text
        if !text.isEmpty {
            HStack(spacing: 10) {
                Text(text).font(KalFont.ui(13)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                if KalCals39.migration.canUndo {
                    Button(action: { Task { await s.undoMigration39() } }) {
                        Text("Angre").font(KalFont.ui(13, .bold)).foregroundStyle(t.red).frame(minHeight: 36)
                    }
                    .buttonStyle(.plain)
                }
                Button(action: { s.dismissMigration39() }) {
                    Text("×").font(KalFont.ui(17, .bold)).foregroundStyle(t.mut).frame(width: 30, height: 36)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Lukk")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
        }
    }
}

/// Merket GOOGLE / URL / INNEBYGD med fargene fra fasiten.
struct KalBadge39: View {
    @Environment(\.kal) private var t
    let badge: String

    var body: some View {
        Text(badge).font(KalFont.mono(10)).tracking(0.6)
            .foregroundStyle(fg)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 5).fill(bg))
            .fixedSize()
    }

    private var fg: Color {
        switch badge {
        case "GOOGLE": return t.dark ? Color(kalHex: "#9cc2ee") : Color(kalHex: "#2b5d8a")
        case "URL": return t.dark ? Color(kalHex: "#8fd4a8") : Color(kalHex: "#2f7a4f")
        default: return t.mut
        }
    }

    private var bg: Color {
        switch badge {
        case "GOOGLE": return Color(kalHex: "#4285f4", opacity: 0.12)
        case "URL": return Color(kalHex: "#2f7a4f", opacity: 0.12)
        default: return t.chip
        }
    }
}

/// Én rad i 1a.
struct KalCalRow39: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let c: KalCal
    let first: Bool

    var body: some View {
        HStack(spacing: 12) {
            Button(action: { s.setCal(c.id, on: !c.on) }) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8).fill(c.on ? t.calColor(c) : Color.clear)
                    RoundedRectangle(cornerRadius: 8).strokeBorder(t.calColor(c), lineWidth: 2)
                    if c.on { Text("✓").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.white) }
                }
                .frame(width: 26, height: 26)
                .frame(width: 34, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel((c.on ? "Skjul " : "Vis ") + c.name)
            Button(action: { s.editCal39(c.id) }) {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name).font(KalFont.ui(16, .bold)).foregroundStyle(t.ink).lineLimit(1)
                        HStack(spacing: 6) {
                            KalBadge39(badge: c.p39?.badge ?? "EGEN")
                            Text(sub).font(KalFont.ui(12.5)).foregroundStyle(statusBad ? t.acc : t.mut).lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(String(c.count)).font(KalFont.mono(12)).foregroundStyle(t.mut2)
                    Text("›").font(KalFont.ui(18)).foregroundStyle(t.mut2)
                }
                .frame(minHeight: 66)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Rediger " + c.name)
        }
        .overlay(alignment: .top) { if !first { Rectangle().fill(t.line2).frame(height: 1) } }
    }

    private var statusBad: Bool {
        let st: String = (c.p39?.status ?? "").lowercased()
        return st.contains("feil") || st == "error"
    }

    private var sub: String {
        if statusBad { return "Feil · sjekk URL" }
        var label: String = c.p39?.sourceLabel ?? ""
        if KalCals39.role(c) == "s" && !(c.p39?.url ?? "").isEmpty && !label.contains("·") {
            label = KalCals39.host(c.p39?.url ?? "") + " · " + KalCals39.intervalName(c.p39?.interval ?? "").lowercased()
        }
        return label
    }
}

/* ---------- 1b: Rediger ---------- */

struct KalCalEdit39View: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let c: KalCal
    @State private var d: KalCalDraft39 = KalCalDraft39()
    @State private var loaded: Bool = false
    @State private var busy: Bool = false
    @State private var error: String = ""
    @State private var confirmDelete: Bool = false
    @State private var gNames: String = ""

    private var role: String { KalCals39.role(c) }
    private var badge: String { c.p39?.badge ?? "EGEN" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Button(action: { s.editCal39(nil) }) {
                        Text("‹ Kalendere").font(KalFont.ui(15, .semibold)).foregroundStyle(t.ink).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    KalPill(title: busy ? "Lagrer …" : "Lagre", enabled: !busy) { save() }
                }
                header
                nameAndColor
                KalLabel(text: "KILDE").padding(.horizontal, 6).padding(.top, 2)
                KalCalSource39(c: c, d: $d, gNames: gNames)
                if badge == "URL" { urlButtons }
                KalLabel(text: "VIS OG VARSLE").padding(.horizontal, 6).padding(.top, 2)
                toggles
                if !error.isEmpty {
                    Text(error).font(KalFont.ui(12.5)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
                }
                if KalCals39.canRemove(c) { removeButton }
                Color.clear.frame(height: 24)
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(t.bg.ignoresSafeArea())
        .gesture(DragGesture(minimumDistance: 24).onEnded { (v: DragGesture.Value) in
            if v.startLocation.x < 40 && v.translation.width > 80 && abs(v.translation.width) > abs(v.translation.height) { s.editCal39(nil) }
        })
        .onAppear {
            if !loaded {
                d = s.draft39(c)
                loaded = true
            }
        }
        .task { await loadGoogle() }
        .confirmationDialog("Fjerne «" + c.name + "»?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Fjern kalenderen", role: .destructive) {
                s.removeCal(c)
                s.editCal39(nil)
            }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Hendelsene forsvinner fra appen. Kilden (Google eller URL) endres ikke.")
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 14).fill(Color(kalHex: d.hex)).frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 0) {
                Text(KalCals39.kicker(c)).font(KalFont.mono(10.5)).tracking(1.2).foregroundStyle(t.red)
                Text(d.name.isEmpty ? c.name : d.name).font(KalFont.serif(30)).foregroundStyle(t.ink).lineLimit(1)
            }
        }
    }

    private var nameAndColor: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Navn").font(KalFont.ui(15)).foregroundStyle(t.ink)
                Spacer()
                TextField("Navn", text: $d.name)
                    .font(KalFont.ui(15, .bold))
                    .foregroundStyle(t.ink)
                    .multilineTextAlignment(.trailing)
                    .submitLabel(.done)
            }
            .frame(minHeight: 52)
            VStack(alignment: .leading, spacing: 10) {
                Text("Farge").font(KalFont.ui(15)).foregroundStyle(t.ink)
                KalFlow(spacing: 10) {
                    ForEach(KalCals39.palette, id: \.self) { (h: String) in
                        swatch(h)
                    }
                }
            }
            .padding(.vertical, 12)
            .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
    }

    private func swatch(_ h: String) -> some View {
        let on: Bool = h.lowercased() == d.hex.lowercased()
        return Button(action: {
            KalHaptic.tap()
            d.hex = h
        }) {
            Circle().fill(Color(kalHex: h)).frame(width: 32, height: 32)
                .overlay(Circle().strokeBorder(t.bg, lineWidth: on ? 3 : 0).padding(-3))
                .overlay(Circle().strokeBorder(t.ink, lineWidth: on ? 2 : 0).padding(-5))
                .padding(5)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Farge " + h + (on ? ", valgt" : ""))
    }

    private var urlButtons: some View {
        HStack(spacing: 8) {
            KalPill(title: "Lim inn ny URL", filled: false, enabled: !busy, height: 40) {
                Task {
                    busy = true
                    error = await s.pasteUrl39(c)
                    busy = false
                }
            }
            .frame(maxWidth: .infinity)
            KalPill(title: "↻ Oppdater nå", filled: false, enabled: !busy, height: 40) {
                Task {
                    busy = true
                    error = await s.refreshCal39(c)
                    busy = false
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var toggles: some View {
        VStack(spacing: 0) {
            KalEditToggle39(title: "Vis i kalenderen", sub: "", on: d.visible, first: true) { d.visible.toggle() }
            KalEditToggle39(title: "Vis i Glimt-brief", sub: role == "h" ? "Bare fridager" : "", on: d.brief, first: false) { d.brief.toggle() }
            KalEditToggle39(title: "Varsel", sub: KalCals39.notifyText(c), on: d.notify, first: false) { d.notify.toggle() }
            if role == "s" {
                KalEditToggle39(title: "Farge per fag", sub: "Hvert fag får sin farge", on: d.fag, first: false) { d.fag.toggle() }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
    }

    private var removeButton: some View {
        Button(action: {
            KalHaptic.tap()
            confirmDelete = true
        }) {
            Text("Fjern kalenderen").font(KalFont.ui(14, .bold)).foregroundStyle(t.red).padding(8).frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }

    private func save() {
        busy = true
        error = ""
        let draft: KalCalDraft39 = d
        Task {
            let err: String = await s.saveCal39(c, draft)
            busy = false
            if err.isEmpty {
                KalHaptic.done()
                s.editCal39(nil)
            } else {
                error = err
            }
        }
    }

    private func loadGoogle() async {
        guard badge == "GOOGLE", role == "p" || role == "b" else { return }
        let m: KalGMap39 = await KalGMapAPI39.fetch()
        let n: [String] = m.names(role)
        if !n.isEmpty { gNames = n.joined(separator: " + ") }
    }
}

/// Rad med bryter i Rediger.
struct KalEditToggle39: View {
    @Environment(\.kal) private var t
    let title: String
    let sub: String
    let on: Bool
    let first: Bool
    let action: () -> Void

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            action()
        }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(KalFont.ui(15)).foregroundStyle(t.ink)
                    if !sub.isEmpty { Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut2) }
                }
                Spacer()
                KalToggle(on: on)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { if !first { Rectangle().fill(t.line2).frame(height: 1) } }
        .accessibilityLabel(title + (on ? ", på" : ", av"))
    }
}

/// KILDE i Rediger: Google (konto, kalendere, Endre kobling), URL (adresse, intervall, sist hentet) eller Innebygd (land).
struct KalCalSource39: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let c: KalCal
    @Binding var d: KalCalDraft39
    let gNames: String

    var body: some View {
        VStack(spacing: 0) {
            switch c.p39?.badge ?? "" {
            case "GOOGLE": google
            case "URL": url
            case "INNEBYGD": builtin
            default: own
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
    }

    private func row(_ k: String, _ v: String, first: Bool = false, mono: Bool = false, link: Bool = false) -> some View {
        HStack(spacing: 12) {
            Text(k).font(KalFont.ui(15)).foregroundStyle(t.ink)
            Spacer(minLength: 8)
            Text(v).font(mono ? KalFont.mono(13) : KalFont.ui(14, .semibold))
                .foregroundStyle(link ? t.red : t.ink)
                .lineLimit(1).truncationMode(.middle)
        }
        .frame(minHeight: 52)
        .overlay(alignment: .top) { if !first { Rectangle().fill(t.line2).frame(height: 1) } }
    }

    @ViewBuilder private var google: some View {
        row("Type", "Google Kalender", first: true)
        row("Konto", (c.p39?.sourceLabel ?? "").isEmpty ? "Google" : (c.p39?.sourceLabel ?? ""))
        row("Google-kalender", gNames.isEmpty ? (KalCals39.role(c) == "b" ? "Bursdager" : c.name) : gNames)
        Button(action: { s.openGMap39() }) {
            row("Endre kobling", "Velg ›", link: true).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var url: some View {
        row("Type", "Abonnement (iCal-URL)", first: true)
        row("Adresse", (c.p39?.url ?? "").isEmpty ? "Ingen adresse ennå" : (c.p39?.url ?? ""), mono: true)
        Menu {
            ForEach(0..<KalCals39.intervals.count, id: \.self) { (i: Int) in
                Button(KalCals39.intervals[i].1) { d.interval = KalCals39.intervals[i].0 }
            }
        } label: {
            row("Oppdateres", KalCals39.intervalName(d.interval) + " ▾").contentShape(Rectangle())
        }
        row("Sist hentet", fetched)
        let st: String = c.p39?.status ?? ""
        if !st.isEmpty && st.lowercased() != "ok" {
            row("Status", st.lowercased() == "error" ? "Feil · sjekk URL" : st)
        }
    }

    private var fetched: String {
        let lf: String = c.p39?.lastFetched ?? ""
        let when: String = lf.isEmpty ? "–" : KalCals39.shortTime(lf)
        return when + " · " + String(c.count) + " hendelser"
    }

    @ViewBuilder private var builtin: some View {
        row("Type", "Innebygd", first: true)
        Menu {
            ForEach(0..<KalCals39.countries.count, id: \.self) { (i: Int) in
                Button(KalCals39.countries[i].1) { d.country = KalCals39.countries[i].0 }
            }
        } label: {
            row("Land", KalCals39.countryName(d.country) + " ▾").contentShape(Rectangle())
        }
        row("Viser", "Fridager og merkedager")
    }

    @ViewBuilder private var own: some View {
        row("Type", c.p39?.badge == "HA" ? "Home Assistant" : "Egen kalender", first: true)
        row("Lagres", (c.p39?.sourceLabel ?? "").isEmpty ? "I Homelab" : (c.p39?.sourceLabel ?? ""))
    }
}
