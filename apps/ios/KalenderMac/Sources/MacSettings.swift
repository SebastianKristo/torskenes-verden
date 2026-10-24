import SwiftUI
import AppKit

/* ---------------- Prompt 34: Kalender for Mac – Innstillinger (⌘,) ---------------- */
// Generelt: menylinje-kalender (av/på, bare ikon / dato / neste hendelse), Dock-merke, start ved innlogging, standardvarsel.
// Utseende: System / Lys / Mørk. Visning: ukenummer og vær. Konto: innlogget som …, logg ut.
// Prompt 43: faner Generelt · Kontoer · Oppdateringer; oppdatering i appen (MacUpdater43.swift, ingen Sparkle).

/// Prompt 43: Innstillinger-vinduet med fanene Generelt · Kontoer · Oppdateringer (Mac-stil, fasit Kalender Mac.dc.html).
/// Kalender → Se etter oppdateringer … åpner fanen Oppdateringer (MacPrefsTab43).
struct MacSettingsView: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    @ObservedObject var tab: MacPrefsTab43 = MacPrefsTab43.shared
    @State private var loginItem: Bool = false
    @State private var loginError: String = ""

    var body: some View {
        TabView(selection: $tab.tab) {
            scroll {
                section("GENERELT") { prefRows43 }
                section("MENYLINJE OG DOCK") { general }
                section("KALENDER") { calendarPrefs }
                section("VARSLER") { notifyPrefs }
                section("UTSEENDE") { appearance }
                section("VISNING") { display }
                // Prompt 37: Kalendere → Studie → Fag (egen farge per fag).
                section("STUDIE · FAG") { MacFagSettings37() }
            }
            .tabItem { Label("Generelt", systemImage: "gearshape") }
            .tag("gen")
            scroll {
                section("KONTOER") { accounts43 }
                section("HOMELAB") { account }
                // Prompt 47: ekstern og lokal adresse med standardverdier (os.smarthjemexperten.no / 10.69.1.39:3000).
                if store.loggedIn { section("SERVER") { MacSrv47Section() } }
                section("KONTOER OG SYNK") { MacGoogle36Section() }
            }
            .tabItem { Label("Kontoer", systemImage: "at") }
            .tag("acc")
            scroll {
                MacUpdate43View()
            }
            .tabItem { Label("Oppdateringer", systemImage: "arrow.triangle.2.circlepath") }
            .tag("upd")
        }
        .frame(width: 560, height: 680)
        .background(t.bg)
        .onAppear {
            // SMAppService-status leses når vinduet åpnes (ikke i init av visningen).
            // Prompt 45: i bakgrunnen – statusen er et synkront XPC-kall som kan bruke flere sekunder.
            Task { @MainActor in
                let on: Bool = await Task.detached(priority: .utility) { () -> Bool in MacLogin.enabled }.value
                if loginItem != on { loginItem = on }
            }
        }
    }

    private func scroll<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) { content() }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(t.bg)
    }

    /// Fasitens fire rader: neste hendelse i menylinjen · start ved innlogging · varsler · Glimt i menylinjen.
    private var prefRows43: some View {
        VStack(spacing: 0) {
            MacToggleRow43(title: "Vis neste hendelse i menylinjen", sub: "«Tannlege 15:15» ved siden av klokka",
                           on: Binding<Bool>(get: { store.menuBarMode == "next" }, set: { (v: Bool) in
                               let m: String = v ? "next" : "date"
                               if store.menuBarMode != m { store.menuBarMode = m }
                           }))
            MacToggleRow43(title: "Start ved innlogging", sub: "Kalender åpnes i bakgrunnen",
                           on: Binding<Bool>(get: { loginItem }, set: { (v: Bool) in
                               loginError = MacLogin.set(v)
                               loginItem = MacLogin.enabled
                           }))
            MacToggleRow43(title: "Varsler", sub: "Påminnelser før hendelser, bursdager og frister",
                           on: Binding<Bool>(get: { store.notify43 }, set: { (v: Bool) in
                               if store.notify43 != v { store.notify43 = v }
                           }))
            MacToggleRow43(title: "Glimt i menylinjen", sub: "Skriv hendelser rett i menyen",
                           on: Binding<Bool>(get: { store.mbGlimt43 }, set: { (v: Bool) in
                               if store.mbGlimt43 != v { store.mbGlimt43 = v }
                           }))
            if !loginError.isEmpty {
                Text(loginError).font(MacFont.ui(12)).foregroundColor(t.acc).padding(.horizontal, 16).padding(.bottom, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(-14)
    }

    /// Google, iCloud, Home Assistant og Homelab-serveren med status.
    private var accounts43: some View {
        let cals: [KalCal] = store.cals
        func has(_ test: (KalCal) -> Bool) -> Bool { cals.contains(where: test) }
        let google: Bool = has { (c: KalCal) -> Bool in (c.source ?? "") == "google" }
        let icloud: Bool = has { (c: KalCal) -> Bool in (c.source ?? "") == "caldav" || c.name.lowercased().contains("icloud") }
        let ha: Bool = has { (c: KalCal) -> Bool in (c.source ?? "") == "ha" }
        let rows: [(String, String, String)] = [
            ("Google", "#4285F4", google ? "Synket" : "Ikke koblet til"),
            ("iCloud", "#6b665c", icloud ? "Synket" : "Ikke koblet til"),
            ("Home Assistant", "#18bcf2", ha ? "Tilkoblet" : "Ikke koblet til"),
            ("Homelab-server", "#b23a2a", !store.loggedIn ? "Ikke logget inn" : (store.offline43 ? "Ikke tilkoblet · " + store.host43 : store.host43)),
        ]
        return VStack(spacing: 0) {
            ForEach(0..<rows.count, id: \.self) { (i: Int) in
                let r: (String, String, String) = rows[i]
                HStack(spacing: 10) {
                    Circle().fill(Color(kalHex: r.1)).frame(width: 10, height: 10)
                    Text(r.0).font(MacFont.ui(14, .bold)).foregroundColor(t.ink)
                    Spacer()
                    Text(r.2).font(MacFont.ui(13)).foregroundColor(t.mut)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 48)
                .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
            }
        }
        .padding(-14)
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            MacLabel(text: title, color: t.acc)
            VStack(alignment: .leading, spacing: 10) { content() }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
        }
    }

    private var general: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Prompt 39: den innebygde kalenderen er standard. Web-visningen fra prompt 38 er beholdt som valg (av).
            Toggle("Vis web-kalenderen i stedet (eksperimentelt)", isOn: $store.useWeb38)
            Text("Av som standard: Mac-appen bruker sin egen kalender. På = visningene kommer fra Homelab på web.")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
            Toggle("Vis kalender i menylinjen", isOn: $store.menuBarOn)
            Picker("Menylinjen viser", selection: $store.menuBarMode) {
                Text("Bare ikon").tag("icon")
                Text("Dato").tag("date")
                Text("Neste hendelse").tag("next")
            }
            .pickerStyle(.segmented)
            .disabled(!store.menuBarOn)
            Toggle("Antall hendelser i dag på Dock-ikonet", isOn: $store.dockBadge)
            // Prompt 46: standardkalenderen for «+ Ny hendelse» og Glimt.
            MacDefCal46Picker()
            Picker("Standardvarsel for nye hendelser", selection: $store.defRemRaw) {
                Text("Ingen").tag(-1)
                Text("10 min før").tag(10)
                Text("30 min før").tag(30)
                Text("1 t før").tag(60)
                Text("1 dag før").tag(1440)
            }
            Text("Kalender kjører videre i menylinjen når vinduet lukkes. Avslutt med ⌘Q.")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut2)
        }
        .font(MacFont.ui(13.5))
    }

    /// Prompt 35: samme valg som Innstillinger i iPhone-appen (synkes via profilen).
    private var calendarPrefs: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Uken starter", selection: Binding<String>(get: { store.weekStart }, set: { (v: String) in
                store.weekStart = v
                store.savePrefs(["weekStart": v])
            })) {
                Text("Mandag").tag("mon")
                Text("Søndag").tag("sun")
            }
            .pickerStyle(.segmented)
            Picker("Åpne i", selection: Binding<String>(get: { store.openView }, set: { (v: String) in
                store.openView = v
                store.savePrefs(["openView": v])
            })) {
                Text("Måned").tag("mnd")
                Text("Uke").tag("uke")
                Text("3 dager").tag("3d")
                Text("Dag").tag("dag")
                Text("Liste").tag("liste")
            }
            Picker("Standard varighet", selection: Binding<Int>(get: { store.defDur }, set: { (v: Int) in
                store.defDur = v
                store.savePrefs(["defaultDuration": v])
            })) {
                Text("30 min").tag(30)
                Text("1 t").tag(60)
                Text("1,5 t").tag(90)
                Text("2 t").tag(120)
            }
            .pickerStyle(.segmented)
            Picker("Tidslinje starter", selection: Binding<String>(get: { store.tlStart }, set: { (v: String) in
                store.tlStart = v
                store.savePrefs(["timelineStart": v])
            })) {
                Text("Nå").tag("now")
                Text("06").tag("06")
                Text("08").tag("08")
            }
            .pickerStyle(.segmented)
            Text("Kalendere (farge, skjul fra menyen, iCal og Home Assistant) styres i sidemenyen: klikk på prikken eller «Rediger».")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
        }
        .font(MacFont.ui(13.5))
    }

    private var notifyPrefs: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Bursdager (kl. 09:00 samme dag)", isOn: Binding<Bool>(get: { store.nBd }, set: { (v: Bool) in
                store.nBd = v
                store.rebuild()
                store.savePrefs(["notifyBirthdays": v])
            }))
            Toggle("Studiefrister (3 dager og 1 dag før)", isOn: Binding<Bool>(get: { store.nFr }, set: { (v: Bool) in
                store.nFr = v
                store.rebuild()
                store.savePrefs(["notifyDeadlines": v])
            }))
        }
        .font(MacFont.ui(13.5))
    }

    private var appearance: some View {
        Picker("Tema", selection: $store.theme) {
            Text("System").tag("system")
            Text("Lys").tag("light")
            Text("Mørk").tag("dark")
        }
        .pickerStyle(.segmented)
    }

    private var display: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle("Ukenummer", isOn: $store.showWeeks)
            Toggle("Vær (Oslo, MET / Open-Meteo, 16 dager)", isOn: $store.showWx)
        }
        .font(MacFont.ui(13.5))
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: 8) {
            if store.loggedIn {
                Text("Logget inn som " + store.userName).font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink)
                // Prompt 41: Server (lesbar) – lokal og ekstern adresse hentes fra Homelab.
                Text("Server: " + KalServer41.summary()).font(MacFont.ui(12)).foregroundColor(t.mut)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Endres under SERVER nedenfor eller i Homelab → Innstillinger → Konto → Server").font(MacFont.ui(11.5)).foregroundColor(t.mut2)
                Text(KalGroup.linked ? "Widgets: legg dem til fra skrivebordet (Rediger widgets → Kalender)." : "Widgets på skrivebordet krever at appen er signert med Team ID (App Group).")
                    .font(MacFont.ui(11.5)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
                if let u = store.updated {
                    Text(syncText(u)).font(MacFont.ui(11.5)).foregroundColor(t.mut2)
                }
                if !store.lastError.isEmpty { Text(store.lastError).font(MacFont.ui(12)).foregroundColor(t.acc) }
                HStack {
                    Button("Hent på nytt") { Task { await store.load(force: true) } }
                    Button("Logg ut") { store.logout() }
                }
            } else {
                Text("Ikke logget inn. Logg inn i hovedvinduet.").font(MacFont.ui(13.5)).foregroundColor(t.mut)
            }
        }
    }

    private func syncText(_ u: Date) -> String {
        let live: String = MacLive.shared.connected ? " · sanntid på" : " · sanntid av (henter hvert minutt)"
        return "Sist hentet " + KalD.hm(KalD.minutes(u)) + live
    }
}
