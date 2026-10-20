import SwiftUI
import UIKit
import WidgetKit

/* ---------------- Prompt 35: Kalender – Innstillinger (nederst i sidemenyen) ---------------- */
// Fasit: Kalender App.dc.html → setOn/genRows/optRows/notRows/linkRows. Fullskjerm som glir inn fra høyre (0,28 s) med Ferdig.
// GENERELT (Uken starter · Åpne i · Standard varighet · Tidslinje starter) · VISNING · UTSEENDE · STANDARDVARSEL · VARSLER ·
// GLIMT OG KONTO · KONTO. Alle valg lagres i profilen (PUT /api/kalender/calendars/prefs) og synkes.

struct KalSegOpt35: Identifiable, Hashable {
    let id: String
    let name: String
}

struct KalSettings35View: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Innstillinger").font(KalFont.serif(28)).foregroundStyle(t.ink)
                Spacer()
                KalPill(title: "Ferdig") { close() }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Prompt 39: Kalendere (1a) – fire kalendere, rediger og legg til.
                    KalLabel(text: "KALENDERE")
                    KalLinkRow35(title: "Kalendere", sub: cals39Sub) { s.openCals39() }
                        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
                    KalLabel(text: "GENERELT").padding(.top, 6)
                    general
                    KalLabel(text: "VISNING").padding(.top, 6)
                    display
                    // Prompt 37: Kalendere → Studie → Fag (egen farge per fag; trykk gir fargevelger).
                    KalLabel(text: "STUDIE · FAG").padding(.top, 6)
                    KalFagSettings37()
                    KalLabel(text: "UTSEENDE").padding(.top, 6)
                    KalSegment35(options: [KalSegOpt35(id: "system", name: "System"), KalSegOpt35(id: "light", name: "Lys"), KalSegOpt35(id: "dark", name: "Mørk")],
                                 selected: s.theme) { (v: String) in
                        s.theme = v
                        s.savePrefs(["theme": v])
                    }
                    KalLabel(text: "STANDARDVARSEL FOR NYE HENDELSER").padding(.top, 6)
                    KalFlow(spacing: 6) {
                        ForEach(0..<KalD.remOptions.count, id: \.self) { (i: Int) in
                            let opt: (Int?, String) = KalD.remOptions[i]
                            KalChip(title: opt.1, on: s.defRem == opt.0) {
                                let raw: Int = opt.0 ?? -1
                                s.defRemRaw = raw
                                s.savePrefs(["defaultReminder": KalCalAPI35.remToServer(raw)])
                            }
                        }
                    }
                    KalLabel(text: "VARSLER").padding(.top, 6)
                    // Prompt 41: «Send testvarsel» øverst (lang-trykk = push fra serveren).
                    KalTestRow41()
                    notifications
                    KalLabel(text: "GLIMT OG KONTO").padding(.top, 6)
                    links
                    // Prompt 41: Server (lesbar) og Logg ut ligger nå øverst i GLIMT OG KONTO (fasitens linkRows).
                    account
                    Text(footer).font(KalFont.ui(12)).foregroundStyle(t.mut2)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 14)
                    Color.clear.frame(height: 30)
                }
                .padding(.horizontal, 18)
                .padding(.top, 4)
            }
            .scrollIndicators(.hidden)
        }
        .background(t.bg.ignoresSafeArea())
        .gesture(DragGesture(minimumDistance: 24).onEnded { (v: DragGesture.Value) in
            if v.startLocation.x < 40 && v.translation.width > 80 && abs(v.translation.width) > abs(v.translation.height) { close() }
        })
    }

    private func close() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) { s.settingsOpen = false }
    }

    private var cals39Sub: String {
        let n: [String] = s.cals.prefix(4).map { (c: KalCal) -> String in c.name }
        return n.joined(separator: ", ")
    }

    private var footer: String {
        var out: String = "Kalender 1.0 · synket med Homelab "
        if let u = s.updated, Date().timeIntervalSince(u) > 90 { out += "kl. " + KalD.hm(KalD.minutes(u)) } else { out += "nå" }
        return out
    }

    /* ---------- GENERELT ---------- */

    private var general: some View {
        VStack(alignment: .leading, spacing: 0) {
            KalSegRow35(title: "Uken starter", sub: "Måned, år, uke, ukenummer og widgets",
                        options: [KalSegOpt35(id: "mon", name: "Mandag"), KalSegOpt35(id: "sun", name: "Søndag")],
                        selected: s.weekStart) { (v: String) in
                s.weekStart = v
                s.savePrefs(["weekStart": v])
            }
            KalSegRow35(title: "Åpne i", sub: "Visningen appen starter i",
                        options: [KalSegOpt35(id: "mnd", name: "Måned"), KalSegOpt35(id: "uke", name: "Uke"), KalSegOpt35(id: "3d", name: "3 dager"),
                                  KalSegOpt35(id: "dag", name: "Dag"), KalSegOpt35(id: "liste", name: "Liste")],
                        selected: s.openView) { (v: String) in
                s.openView = v
                s.savePrefs(["openView": v])
            }
            KalSegRow35(title: "Standard varighet", sub: "For nye hendelser med klokkeslett",
                        options: [KalSegOpt35(id: "30", name: "30 min"), KalSegOpt35(id: "60", name: "1 t"), KalSegOpt35(id: "90", name: "1,5 t"),
                                  KalSegOpt35(id: "120", name: "2 t")],
                        selected: String(s.defDur)) { (v: String) in
                let n: Int = Int(v) ?? 60
                s.defDur = n
                s.savePrefs(["defaultDuration": n])
            }
            KalSegRow35(title: "Tidslinje starter", sub: "Uke, 3 dager og Dag",
                        options: [KalSegOpt35(id: "now", name: "Nå"), KalSegOpt35(id: "06", name: "06"), KalSegOpt35(id: "08", name: "08")],
                        selected: s.tlStart) { (v: String) in
                s.tlStart = v
                s.savePrefs(["timelineStart": v])
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    /* ---------- VISNING ---------- */

    private var display: some View {
        VStack(spacing: 0) {
            KalOptionRow(title: "Ukenummer", sub: "Vises i måned og uke", on: s.showWeeks) {
                s.showWeeks.toggle()
                s.savePrefs(["weekNumbers": s.showWeeks])
            }
            KalOptionRow(title: "Vær", sub: "Oslo · MET / Open-Meteo, 16 dager frem", on: s.showWx) {
                s.showWx.toggle()
                s.savePrefs(["weather": s.showWx])
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    /* ---------- VARSLER ---------- */

    private var notifications: some View {
        VStack(spacing: 0) {
            KalOptionRow(title: "Bursdager", sub: "Varsel kl. 09:00 samme dag", on: s.nBd) {
                s.nBd.toggle()
                s.rebuild()
                s.savePrefs(["notifyBirthdays": s.nBd])
            }
            KalOptionRow(title: "Studiefrister", sub: "3 dager og 1 dag før", on: s.nFr) {
                s.nFr.toggle()
                s.rebuild()
                s.savePrefs(["notifyDeadlines": s.nFr])
            }
            // Prompt 42: trekk fra Finans → Abonnementer (Av · Dagen før · Prøveperioder og årlige).
            KalAbNotifyRow42()
            KalOptionRow(title: "Glimt-brief", sub: "Morgen og kveld (velg i Glimt)", on: s.nBrief) {
                s.nBrief.toggle()
                s.savePrefs(["notifyBrief": s.nBrief])
            }
            KalOptionRow(title: "Reisetid", sub: "Varsle når du må dra, basert på sted", on: s.nTv) {
                s.nTv.toggle()
                s.savePrefs(["travelTime": s.nTv])
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    /* ---------- GLIMT OG KONTO ---------- */

    private var links: some View {
        VStack(spacing: 0) {
            KalLinkRow35(title: "Server", sub: KalServer41.summary()) {
                s.showToast("Endres i Homelab → Innstillinger → Konto → Server", undo: "")
            }
            KalLinkRow35(title: "Logg ut", sub: "Logg inn igjen med Homelab-appen") {
                s.settingsOpen = false
                s.drawerOpen = false
                s.logout()
            }
            KalLinkRow35(title: "Glimt", sub: "Figur, stemme og briefer") { s.openGlimtSettings() }
            KalLinkRow35(title: "Kontoer og synk", sub: "Google, iCloud, Outlook, Home Assistant") { s.openAccounts() }
            KalLinkRow35(title: "Widgets", sub: "Slik legger du til på Hjem- og låseskjerm") {
                s.showToast("Hold inne på Hjem-skjermen → + → Kalender", undo: "")
            }
            KalLinkRow35(title: "Om Kalender", sub: "Versjon 1.0 · personvern") {
                s.showToast("Kalender 1.0 · data ligger på hjemmeserveren din", undo: "")
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    /* ---------- KONTO ---------- */

    private var account: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(accountText).font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            if !s.lastError.isEmpty {
                Text(s.lastError).font(KalFont.ui(12.5)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            KalPill(title: "Oppdater", filled: false, height: 34) { Task { await s.load(force: true) } }
        }
    }

    private var accountText: String {
        let who: String = s.userName.isEmpty ? "Homelab" : s.userName
        let via: String = KalGroup.via == "homelab" ? " via Homelab-appen" : ""
        var out: String = "Logget inn som " + who + via + "."
        if let u = s.updated {
            out += " Oppdatert " + KalD.hm(KalD.minutes(u)) + "."
        }
        if !KalGroup.linked { out += " App Group mangler i signeringen, så widgetene får ikke data." }
        return out
    }
}

/// Segmentvelger i pillestil (valgt = kort med skygge).
struct KalSegment35: View {
    @Environment(\.kal) private var t
    let options: [KalSegOpt35]
    let selected: String
    let choose: (String) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options) { (o: KalSegOpt35) in
                Button(action: {
                    KalHaptic.tap()
                    choose(o.id)
                }) {
                    Text(o.name).font(KalFont.ui(12.5, .bold)).lineLimit(1).minimumScaleFactor(0.75)
                        .foregroundStyle(selected == o.id ? t.ink : t.mut)
                        .frame(maxWidth: .infinity).frame(height: 32)
                        .background(pill(o.id))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(o.name)
                .accessibilityAddTraits(selected == o.id ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Capsule().fill(t.chip))
    }

    @ViewBuilder private func pill(_ id: String) -> some View {
        if selected == id {
            Capsule().fill(t.card).shadow(color: Color.black.opacity(0.16), radius: 1.5, y: 1)
        } else {
            Capsule().fill(Color.clear)
        }
    }
}

/// Rad i GENERELT: tittel, undertekst og segmenter.
struct KalSegRow35: View {
    @Environment(\.kal) private var t
    let title: String
    let sub: String
    let options: [KalSegOpt35]
    let selected: String
    let choose: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                if !sub.isEmpty { Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut) }
            }
            KalSegment35(options: options, selected: selected, choose: choose)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}

/// Rad med bryter (VISNING, VARSLER).
struct KalOptionRow: View {
    @Environment(\.kal) private var t
    let title: String
    let sub: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            action()
        }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut)
                }
                Spacer()
                KalToggle(on: on)
            }
            .padding(.vertical, 11)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title + (on ? ", på" : ", av"))
    }
}

/// Rad med › (GLIMT OG KONTO).
struct KalLinkRow35: View {
    @Environment(\.kal) private var t
    let title: String
    let sub: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Text(sub).font(KalFont.ui(12)).foregroundStyle(t.mut)
                }
                Spacer()
                Text("›").font(KalFont.ui(16, .bold)).foregroundStyle(t.mut)
            }
            .padding(.vertical, 11)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}
