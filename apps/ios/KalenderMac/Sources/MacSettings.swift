import SwiftUI
import AppKit

/* ---------------- Prompt 34: Kalender for Mac – Innstillinger (⌘,) ---------------- */
// Generelt: menylinje-kalender (av/på, bare ikon / dato / neste hendelse), Dock-merke, start ved innlogging, standardvarsel.
// Utseende: System / Lys / Mørk. Visning: ukenummer og vær. Konto: innlogget som …, logg ut. Oppdatering: lenke til siste release
// (ingen Sparkle – ingen nye avhengigheter).

struct MacSettingsView: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    @StateObject private var upd: MacUpdate = MacUpdate.shared
    @State private var loginItem: Bool = MacLogin.enabled
    @State private var loginError: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                section("GENERELT") { general }
                section("KALENDER") { calendarPrefs }
                section("VARSLER") { notifyPrefs }
                section("UTSEENDE") { appearance }
                section("VISNING") { display }
                section("KONTO") { account }
                section("OPPDATERING") { update }
            }
            .padding(24)
        }
        .frame(width: 540, height: 680)
        .background(t.bg)
        .onAppear {
            loginItem = MacLogin.enabled
            Task { await upd.check() }
        }
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
            Toggle("Vis kalender i menylinjen", isOn: $store.menuBarOn)
            Picker("Menylinjen viser", selection: $store.menuBarMode) {
                Text("Bare ikon").tag("icon")
                Text("Dato").tag("date")
                Text("Neste hendelse").tag("next")
            }
            .pickerStyle(.segmented)
            .disabled(!store.menuBarOn)
            Toggle("Antall hendelser i dag på Dock-ikonet", isOn: $store.dockBadge)
            Toggle("Start Kalender ved innlogging", isOn: Binding<Bool>(get: { loginItem }, set: { (v: Bool) in
                loginError = MacLogin.set(v)
                loginItem = MacLogin.enabled
            }))
            if !loginError.isEmpty { Text(loginError).font(MacFont.ui(12)).foregroundColor(t.acc) }
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
                Text(MacSession.bases.first ?? "").font(MacFont.mono(11)).foregroundColor(t.mut)
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

    private var updateLabel: String {
        if upd.newer { return "Last ned Kalender " + upd.latest }
        return "Åpne siste release"
    }

    private var update: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Denne versjonen: " + MacUpdate.current).font(MacFont.ui(13.5)).foregroundColor(t.ink)
            Text(upd.status).font(MacFont.ui(12.5)).foregroundColor(upd.newer ? t.acc : t.mut)
            HStack {
                Button(updateLabel) { upd.openRelease() }
                Button("Se etter oppdateringer") { Task { await upd.check() } }
            }
            Text("Last ned .dmg-en, åpne den og dra Kalender til Programmer. Første gang: høyreklikk på Kalender → Åpne (appen er ad hoc-signert).")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// «Se etter oppdateringer»: GitHub releases/latest (offentlig API), ingen Sparkle.
@MainActor
final class MacUpdate: ObservableObject {
    static let shared: MacUpdate = MacUpdate()
    static let repo: String = "SebastianKristo/torskenes-verden"
    static let releases: String = "https://github.com/SebastianKristo/torskenes-verden/releases/latest"

    static var current: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "?"
    }

    @Published var latest: String = ""
    @Published var newer: Bool = false
    @Published var status: String = ""
    private var dmgURL: String = ""
    private var pageURL: String = MacUpdate.releases

    func check() async {
        status = "Ser etter oppdateringer …"
        guard let url = URL(string: "https://api.github.com/repos/" + MacUpdate.repo + "/releases/latest") else { return }
        var r: URLRequest = URLRequest(url: url)
        r.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        r.timeoutInterval = 12
        guard let pair = try? await URLSession.shared.data(for: r),
              let o = (try? JSONSerialization.jsonObject(with: pair.0)) as? [String: Any] else {
            status = "Fikk ikke kontakt med GitHub."
            return
        }
        let tag: String = (o["tag_name"] as? String) ?? ""
        latest = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        pageURL = (o["html_url"] as? String) ?? MacUpdate.releases
        dmgURL = ""
        for a in (o["assets"] as? [Any]) ?? [] {
            guard let d = a as? [String: Any], let name = d["name"] as? String, name.hasSuffix(".dmg"), name.lowercased().contains("kalender") else { continue }
            dmgURL = (d["browser_download_url"] as? String) ?? ""
        }
        newer = MacUpdate.isNewer(latest, than: MacUpdate.current)
        status = newer ? "Kalender " + latest + " er tilgjengelig." : "Du har siste versjon."
    }

    func openRelease() {
        let s: String = dmgURL.isEmpty ? pageURL : dmgURL
        if let u = URL(string: s) { _ = NSWorkspace.shared.open(u) }
    }

    static func isNewer(_ a: String, than b: String) -> Bool {
        let x: [Int] = a.split(separator: ".").map { (p: Substring) -> Int in Int(p) ?? 0 }
        let y: [Int] = b.split(separator: ".").map { (p: Substring) -> Int in Int(p) ?? 0 }
        let n: Int = Swift.max(x.count, y.count)
        for i in 0..<n {
            let p: Int = i < x.count ? x[i] : 0
            let q: Int = i < y.count ? y[i] : 0
            if p != q { return p > q }
        }
        return false
    }
}
