import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

private let groups: [(String, [(String, String, String)])] = [
    ("Konto", [("accounts", "Kontoer og brukere", "person.2"), ("security", "Sikkerhet", "lock"), ("tokens", "API-tokens", "key")]),
    ("Finans", [("ai", "AI og tolkning", "sparkles"), ("cats", "Kategorier og budsjett", "tag"), ("rules", "Regler", "list.bullet.rectangle"),
                ("bank", "Bankimport", "building.columns"), ("stocks", "Aksjer · Trading 212", "chart.line.uptrend.xyaxis"), ("backup", "Backup og data", "externaldrive")]),
    ("App", [("look", "Utseende", "paintpalette"), ("scan", "Skanning og AI", "doc.viewfinder"), ("notify", "Varsler", "bell"), ("haptics", "Haptikk", "hand.tap"), ("widgets", "Widgets", "square.grid.2x2")]),
    ("System", [("server", "Server og synk", "server.rack"), ("data", "Data og lagring", "internaldrive"), ("about", "Om FinansHub", "info.circle")]),
]

private let allScopes = [("receipts:write", "Last opp kvitteringer"), ("read:transactions", "Les transaksjoner"), ("read:summary", "Les sammendrag"),
                         ("read:budget", "Les budsjett"), ("write:transactions", "Endre transaksjoner"), ("finance:read", "Les alt i FinansHub")]

private func stamp(_ d: Date?) -> String {
    guard let d else { return "–" }
    let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = "dd.MM.yyyy HH:mm"
    return f.string(from: d)
}

/// Innstillinger i appen: profilkort øverst og gruppene Konto, App og System.
struct SettingsView: View {
    @Environment(Store.self) private var store
    var body: some View {
        let page = store.settingsPage
        let title = groups.flatMap { $0.1 }.first { $0.0 == page }?.1 ?? "Innstillinger"
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: title, back: page == nil ? nil : { store.settingsPage = nil })
                switch page ?? "" {
                case "": main
                case "accounts": AccountsPage()
                case "security": SecurityPage()
                case "tokens": TokensPage()
                case "look": LookPage()
                case "scan": ScanPrefsPage()
                case "notify": NotifyPage()
                case "haptics": HapticsPage()
                case "widgets": WidgetsPage()
                case "server": ServerPage()
                case "data": DataPage()
                case "ai": AiPage()
                case "cats": CategoriesPage()
                case "rules": RulesPage()
                case "stocks": StocksPrefsPage()
                case "backup": BackupPage()
                default: AboutPage()
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 40)
        }
    }

    private var main: some View {
        VStack(spacing: 12) {
            Button { store.settingsPage = "accounts" } label: {
                HStack(spacing: 14) {
                    AvatarImage(size: 56, tint: .accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.displayName).font(.title3.weight(.bold))
                        Text("\(store.account?.username ?? "–") · \(store.me?.role ?? store.account?.role ?? "")").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.7))
                        Text(host(store.base)).font(.caption).foregroundStyle(Color.skinFg.opacity(0.55))
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Color.skinFg.opacity(0.6))
                }
                .padding(18).glass(28, tint: Color.accent.opacity(0.35))
            }
            .buttonStyle(.plain)
            ForEach(groups, id: \.0) { g in
                SectionLabel(text: g.0)
                VStack(spacing: 0) {
                    ForEach(Array(g.1.enumerated()), id: \.offset) { i, item in
                        if i > 0 { Divider().overlay(Color.skinFg.opacity(0.12)) }
                        Button {
                            if item.0 == "bank" { store.openSub(.imports) } else { store.settingsPage = item.0 }
                            if item.0 == "tokens" { store.loadTokens() }
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: item.2).frame(width: 24).foregroundStyle(Color.accent)
                                Text(item.1)
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(Color.skinFg.opacity(0.5))
                            }
                            .padding(16).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .glass(24)
            }
            Button { store.logout() } label: { Text("Logg ut av \(store.displayName)").fontWeight(.semibold).foregroundStyle(PaperSkin.palette?.lab ?? Color(hex: "#FF8A6B")).frame(maxWidth: .infinity, minHeight: 52) }
                .buttonStyle(.plain).glass(26)
        }
    }
}

/// En underside fra innstillingene uten egen tittel. Papir viser tittelen i toppbildet og «‹ Alle innstillinger».
struct SettingsSubpage: View {
    let page: String
    var body: some View {
        VStack(spacing: 12) {
            switch page {
            case "accounts": AccountsPage()
            case "security": SecurityPage()
            case "tokens": TokensPage()
            case "look": LookPage()
            case "scan": ScanPrefsPage()
            case "notify": NotifyPage()
            case "haptics": HapticsPage()
            case "widgets": WidgetsPage()
            case "server": ServerPage()
            case "data": DataPage()
            case "ai": AiPage()
            case "cats": CategoriesPage()
            case "rules": RulesPage()
            case "stocks": StocksPrefsPage()
            case "backup": BackupPage()
            default: AboutPage()
            }
        }
    }
}

/* ---------------- Byggeklosser ---------------- */

private struct Card<C: View>: View {
    @ViewBuilder let content: () -> C
    var body: some View { VStack(spacing: 0) { content() }.glass(24) }
}

private struct Row: View {
    let label: String
    let value: String
    /// Prompt 36: ikonbrikke i Papir (Settings36.swift).
    var icon: String? = nil
    var body: some View {
        HStack(spacing: 14) {
            if let icon, PaperSkin.palette != nil { Set36Chip(symbol: icon, tint: Set30Colors.innlogging) }
            Text(label).foregroundStyle(Color.skinFg.opacity(0.65)); Spacer(); Text(value).fontWeight(.medium).lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
    }
}

private struct Switch: View {
    let label: String
    var sub: String? = nil
    @Binding var on: Bool
    /// Prompt 36: ikonbrikke i Papir (Settings36.swift).
    var icon: String? = nil
    var body: some View {
        Toggle(isOn: $on) {
            HStack(spacing: 14) {
                if let icon, PaperSkin.palette != nil { Set36Chip(symbol: icon, tint: Set30Colors.innlogging) }
                VStack(alignment: .leading, spacing: 2) { Text(label); if let sub { Text(sub).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)) } }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }
}

private struct Choice: View {
    let label: String
    var sub: String? = nil
    let on: Bool
    let act: () -> Void
    var body: some View {
        Button(action: act) {
            HStack {
                VStack(alignment: .leading, spacing: 2) { Text(label); if let sub { Text(sub).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)) } }
                Spacer()
                if on { Image(systemName: "checkmark").foregroundStyle(Color.accent) }
            }
            .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct Note: View {
    let text: String
    var body: some View { Text(text).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6) }
}

private struct Sep: View {
    var body: some View { Divider().overlay(Color.skinFg.opacity(0.12)) }
}

private func link(_ label: String, _ act: @escaping () -> Void) -> some View {
    Button(action: act) { HStack { Text(label).foregroundStyle(Color.accentLight); Spacer(); Image(systemName: "arrow.up.right").foregroundStyle(Color.skinFg.opacity(0.5)) }.padding(16).contentShape(Rectangle()) }
        .buttonStyle(.plain)
}

/* ---------------- Sider ---------------- */

private struct AccountsPage: View {
    @Environment(Store.self) private var store
    @State private var photo: PhotosPickerItem?
    @State private var camera = false
    @State private var files = false
    var body: some View {
        VStack(spacing: 12) {
            if PaperSkin.palette != nil {
                // Prompt 36: profilbildet øverst i Konto, raden Profilbilde med miniatyr og knappene under (Settings36.swift).
                Konto36Head(photo: $photo, camera: $camera, files: $files)
            } else {
                // Prompt 28: etiketten ligger i innholdet under toppbildet (24 pt luft), aldri oppå bildet.
                SectionLabel(text: "Profilbilde").padding(.top, PaperSkin.palette == nil ? 0 : 16)
                VStack(spacing: 14) {
                    HStack(spacing: 16) {
                        AvatarImage(size: 72, tint: .accent)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(store.displayName).font(.headline)
                            Text("Vises i appen og i Homelab. Beskjæres til et kvadrat.").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                        }
                        Spacer(minLength: 0)
                    }
                    HStack(spacing: 8) {
                        PhotosPicker(selection: $photo, matching: .images) { avatarButton("Bilder", "photo.on.rectangle") }
                        Button { files = true } label: { avatarButton("Filer", "folder") }
                        Button { camera = true } label: { avatarButton("Ta bilde", "camera") }
                    }
                    .buttonStyle(.plain)
                    if store.avatar != nil {
                        Button { store.removeAvatar() } label: { Text("Fjern bildet").font(.subheadline.weight(.bold)).foregroundStyle(PaperSkin.palette?.lab ?? Color.domRed).frame(maxWidth: .infinity, minHeight: 40) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(16).glass(24)
            }
            SectionLabel(text: "Kontoer")
            Note(text: "Hver konto har egne data, tokens og varsler. Bytt raskt ved å holde inne profilbildet.")
            Card {
                ForEach(Array(store.accounts.enumerated()), id: \.element.id) { i, a in
                    if i > 0 { Sep() }
                    let active = a.id == store.account?.id
                    HStack(spacing: 12) {
                        Text(initial(a.label)).fontWeight(.bold).foregroundStyle(active ? Color.ink : Color.skinFg).frame(width: 40, height: 40).background(active ? Color.accent : Color.skinFg.opacity(0.14), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(a.label + (active ? " · aktiv" : "")).fontWeight(.medium)
                            Text("\(a.username.isEmpty ? "–" : a.username) · \(a.role) · \(host(a.server))").font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(1)
                        }
                        Spacer()
                        Button("Logg ut") { store.logout(a.id) }.foregroundStyle(Color.accentLight)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
                    .onTapGesture { if !active { store.switchTo(a.id) } }
                }
            }
            // Prompt 28: primærknapp i aksent (lab) med onLab-tekst i Papir – aldri hvit på lys rosa.
            Button { store.addingAccount = true } label: { Label("Legg til konto", systemImage: "person.badge.plus").fontWeight(.bold).frame(maxWidth: .infinity, minHeight: 50) }
                .buttonStyle(Primary28Style(radius: 25))
            if store.accounts.count > 1 {
                Button { store.logoutOthers() } label: { Text("Logg ut andre kontoer").frame(maxWidth: .infinity, minHeight: 48) }.buttonStyle(.plain).glass(24)
            }
            Note(text: "Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.")
            // Prompt 38: «Logg inn på ny enhet» (QR) og ØKT – Lås skjermen, Logg ut, Logg ut av alle enheter (Konto38.swift).
            Konto38Session()
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) { store.uploadAvatar(img) }
                photo = nil
            }
        }
        .fileImporter(isPresented: $files, allowedContentTypes: [.image]) { result in
            guard case .success(let url) = result else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let d = try? Data(contentsOf: url), let img = UIImage(data: d) { store.uploadAvatar(img) }
        }
        .fullScreenCover(isPresented: $camera) { CameraView(front: true) { img in if let img { store.uploadAvatar(img) } }.ignoresSafeArea() }
    }

    private func avatarButton(_ label: String, _ icon: String) -> some View {
        VStack(spacing: 4) { Image(systemName: icon); Text(label).font(.caption.weight(.semibold)) }
            .frame(maxWidth: .infinity, minHeight: 54).contentShape(RoundedRectangle(cornerRadius: 18)).glass(18)
    }
}

private struct SecurityPage: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    var body: some View {
        @Bindable var s = store
        VStack(spacing: 12) {
            Card { Switch(label: "Lås med Face ID", sub: "Kreves når appen åpnes. Koden kan brukes som reserve.", on: $s.lockEnabled, icon: "faceid") }
            if store.lockEnabled {
                SectionLabel(text: "Lås etter")
                Card {
                    ForEach(Array([(0, "Umiddelbart"), (1, "1 min"), (5, "5 min"), (15, "15 min")].enumerated()), id: \.offset) { i, o in
                        if i > 0 { Sep() }
                        Choice(label: o.1, on: store.lockAfter == o.0) { store.lockAfter = o.0 }
                    }
                }
            }
            Card { Switch(label: "Skjul beløp i appveksleren", sub: "Uskarpt bilde i oversikten over åpne apper", on: $s.hideSwitcher, icon: "eye.slash") }
            SectionLabel(text: "Tofaktor (2FA)")
            // Prompt 40: hele oppsettet skjer i appen (Tfa40.swift), aldri i Safari.
            Card { Tfa40Row() }
            Note(text: "Bruk Passord-appen (iOS 17+), 1Password, Aegis eller Google Authenticator på denne telefonen. Du får reservekoder til slutt.")
            SectionLabel(text: "Pålitelige enheter")
            Card {
                Row(label: "Denne enheten", value: UIDevice.current.name, icon: "laptopcomputer.and.iphone")
                Sep()
                link("Administrer i Homelab") { if let u = URL(string: store.base + "/") { openURL(u) } }
            }
            Note(text: "Appen bruker et eget token. Fra internett kreves alltid passord, og 2FA hvis det er på.")
            // Prompt 51 (SEC51): innlogginger fra nye enheter godkjennes her med Face ID (FHSec51.swift).
            SectionLabel(text: "Nye enheter")
            Card { Sec51ApprovalsCard() }
            Note(text: "En ny enhet som logger inn fra internett får ikke tilgang før den er godkjent fra en enhet som allerede er logget inn, eller av en administrator.")
        }
        .tfa40Host()
    }
}

private struct TokensPage: View {
    @Environment(Store.self) private var store
    @State private var name = ""
    @State private var scopes: Set<String> = ["receipts:write"]
    @State private var days: Int? = 90
    var body: some View {
        VStack(spacing: 12) {
            Note(text: "Tokens brukes av iOS-snarveien for kvitteringer, Home Assistant, Excel Power Query og skript. De gir bare tilgangen du velger og kan trekkes tilbake når som helst.")
            if let t = store.newToken {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Kopier nå – tokenet vises bare én gang").fontWeight(.semibold).foregroundStyle(Color.positive)
                    Text(t).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
                    HStack {
                        Button("Kopier") { UIPasteboard.general.string = t; store.flash("Kopiert") }.buttonStyle(.borderedProminent).tint(.positive)
                        Button("Ferdig") { store.newToken = nil }.foregroundStyle(Color.positive)
                    }
                }
                .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24, tint: Color.positive.opacity(0.25))
            }
            if let e = store.tokenError { Note(text: e) }
            if let list = store.tokens {
                if !list.isEmpty {
                    Card {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, t in
                            if i > 0 { Sep() }
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.name ?? "Token").fontWeight(.medium)
                                    Text((t.scopes ?? []).joined(separator: ", ")).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(2)
                                    Text("Laget \(stamp(t.created?.date)) · sist brukt \(stamp((t.lastUsed ?? t.last_used)?.date)) · utløper \((t.expires ?? t.expiresAt)?.date.map { stamp($0) } ?? "aldri")")
                                        .font(.caption2).foregroundStyle(Color.skinFg.opacity(0.5))
                                }
                                Spacer()
                                Button("Trekk tilbake") { store.revokeToken(t.id.value) }.font(.footnote).foregroundStyle(Color.accentLight)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 10)
                        }
                    }
                } else if store.tokenError == nil { Note(text: "Ingen tokens ennå.") }
            } else { ProgressView().padding(20) }
            if store.tokenError == nil {
                SectionLabel(text: "Lag nytt token")
                VStack(alignment: .leading, spacing: 10) {
                    TextField("Navn, f.eks. iOS-snarvei", text: $name).padding(.horizontal, 14).frame(height: 46).glass(16)
                    Text("Tilganger").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6))
                    Flow(spacing: 8) {
                        ForEach(allScopes, id: \.0) { k, n in
                            Button { if scopes.contains(k) { scopes.remove(k) } else { scopes.insert(k) } } label: {
                                Text(n).font(.subheadline).padding(.horizontal, 12).frame(height: 34).foregroundStyle(scopes.contains(k) ? Color.ink : Color.skinFg)
                            }
                            .buttonStyle(.plain).glass(17, tint: scopes.contains(k) ? .accent : nil)
                        }
                    }
                    Text("Utløper").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6))
                    Picker("Utløper", selection: $days) {
                        Text("30 d").tag(Int?.some(30)); Text("90 d").tag(Int?.some(90)); Text("1 år").tag(Int?.some(365)); Text("Aldri").tag(Int?.none)
                    }
                    .pickerStyle(.segmented)
                    Button { store.createToken(name: name.isEmpty ? "Token" : name, scopes: Array(scopes), days: days); name = "" } label: {
                        Text("Lag token").fontWeight(.bold).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(Primary28Style(radius: 24)).disabled(scopes.isEmpty)
                }
                .padding(16).glass(24)
            }
        }
    }
}

private struct LookPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        @Bindable var s = store
        VStack(spacing: 12) {
            Group {
                SectionLabel(text: "Tema")
                Card {
                    Choice(label: "Papir · lys", sub: "Lyst papir og svart fanelinje", on: store.paperMode == "lys") { store.setPaperMode("lys") }
                    Sep()
                    Choice(label: "Papir · mørk", sub: "Kveldspapir og lys fanelinje", on: store.paperMode == "mork") { store.setPaperMode("mork") }
                    Sep()
                    Choice(label: "Følg systemet", sub: "Lys om dagen, mørk i mørk modus", on: store.paperMode == "auto") { store.setPaperMode("auto") }
                }
                Note(text: "Lagres på kontoen din, så valget følger deg til andre enheter.")
            }
            Group {
                SectionLabel(text: "Oppstart")
                Card {
                    ForEach(Array([("homelab", "Homelab"), ("home", "Finans · Hjem"), ("list", "Finans · Liste"), ("budget", "Finans · Budsjett")].enumerated()), id: \.offset) { i, o in
                        if i > 0 { Sep() }
                        Choice(label: o.1, on: store.startPage == o.0) { store.startPage = o.0 }
                    }
                }
                Note(text: store.financeStart ? "Appen åpner i Finans. Hjem-knappen går til Finans, og Homelab og de andre modulene ligger bak profilbildet." : "Appen åpner på Homelab.")
                // Tilbake til startsiden går alltid med pila øverst til venstre («Knapp i linjen» er fjernet).
            }
            Card { Switch(label: "Skjul beløp til jeg trykker", sub: "Beløp vises som prikker til du trykker på saldoen eller øyet", on: $s.hideAmounts) }
        }
    }
}

private struct ScanPrefsPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        @Bindable var s = store
        let st = store.boot?.settings
        VStack(spacing: 12) {
            SectionLabel(text: "Skanneknappen")
            Card {
                Choice(label: "Trykk åpner kameraet", sub: "Hold inne for å velge fra Bilder eller Filer", on: store.scanTap == "camera") { store.scanTap = "camera" }
                Sep()
                Choice(label: "Trykk viser valg", sub: "Hold inne for å åpne kameraet direkte", on: store.scanTap == "choices") { store.scanTap = "choices" }
            }
            Card {
                Switch(label: "Beskjær automatisk", sub: "Finner kantene på kvitteringen", on: $s.autoCrop)
                Sep()
                Switch(label: "Lagre originalbildet", sub: "Lagres sammen med kvitteringen på serveren", on: $s.keepOriginal)
                Sep()
                Switch(label: "Last opp bare på Wi-Fi", sub: "Ellers settes filer i kø", on: $s.wifiOnly)
            }
            SectionLabel(text: "AI-motor (på serveren)")
            Card {
                // Prompt 52: kvitteringer leses bare lokalt – Gemini er fjernet, også som reserve (SERVER52-API.md § 1).
                Choice(label: "Lokal AI", sub: "Glimt leser lokalt · bildet forlater aldri huset", on: true) { store.save("provider", "ollama"); store.save("fallback", false) }
            }
            .disabled(!store.canEditServer).opacity(store.canEditServer ? 1 : 0.55)
            if !store.canEditServer { Note(text: ServerLock26.note) }
        }
    }
}

private struct NotifyPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        @Bindable var s = store
        let st = store.boot?.settings
        VStack(spacing: 12) {
            Note(text: "Send varsel når …")
            Card {
                Switch(label: "Kvittering er lest", sub: "Når AI er ferdig og noe må bekreftes", on: Binding(get: { st?.nRc ?? true }, set: { store.save("nRc", $0) }))
                Sep()
                Switch(label: "Budsjett passerer 80 %", on: Binding(get: { st?.n80 ?? true }, set: { store.save("n80", $0) }))
                Sep()
                Switch(label: "Abonnement trekkes snart", sub: "Dagen før trekk", on: $s.nSub)
                Sep()
                Switch(label: "Domene eller SSL utløper", sub: "30 og 7 dager før", on: $s.nDomain)
                Sep()
                Switch(label: "Ukesoppsummering", sub: "Søndag kl. 18", on: $s.nWeekly)
            }
            Note(text: "Kvittering og budsjett lagres på serveren. Mens appen er åpen vises ferdige kvitteringer i køen med en gang.")
            Note(text: "Sporing")
            Card {
                ForEach(Array(trackingPrefs.enumerated()), id: \.offset) { i, p in
                    if i > 0 { Sep() }
                    Switch(label: p.1, sub: p.2, on: Binding(get: { store.tracking?.prefs[p.0] ?? (p.0 != "delayed") }, set: { store.setTrackingPref(p.0, $0) }))
                }
            }
            Note(text: "Lagres på serveren og gjelder også Sporing på web. Varslene vises som lokale varsler når appen henter status; ekte push fra serveren er ikke bygget ennå.")
        }
        .onAppear { if store.tracking == nil { Task { await store.pollTracking() } }; LocalNotify.ask() }
    }
}

private let trackingPrefs: [(String, String, String?)] = [("found", "Nytt sporingsnummer funnet", "Fra e-post eller Finn"), ("out", "Ute for levering", nil),
                                                         ("pickup", "Klar for henting", nil), ("delivered", "Levert", nil), ("delayed", "Forsinket", "Av som standard")]

/// Innstillinger → App → Haptikk: hovedbryter, styrke, brytere per type og test.
private struct HapticsPage: View {
    @Bindable private var h = Haptics.shared
    var body: some View {
        VStack(spacing: 12) {
            Card { Switch(label: "Haptisk tilbakemelding", sub: "Vibrasjon ved trykk, fullførte handlinger og varsler", on: $h.on) }
            if h.on {
                Note(text: "Styrke")
                Card {
                    Choice(label: "Lett", on: h.strength == "light") { h.strength = "light"; h.tap() }
                    Sep()
                    Choice(label: "Middels", on: h.strength == "medium") { h.strength = "medium"; h.tap() }
                    Sep()
                    Choice(label: "Kraftig", on: h.strength == "heavy") { h.strength = "heavy"; h.tap() }
                }
                Note(text: "Gi tilbakemelding ved …")
                Card {
                    Switch(label: "Trykk på knapper og faner", on: $h.taps)
                    Sep()
                    Switch(label: "Fullført handling", sub: "Lagret, bokført, synket", on: $h.done)
                    Sep()
                    Switch(label: "Feil og advarsler", on: $h.errors)
                    Sep()
                    Switch(label: "Pakke-varsler", sub: "Klar for henting, levert", on: $h.packages)
                }
                Card { link("Test haptikk") { h.test() } }
            }
            Note(text: "Følger «Systemhaptikk» i iOS-innstillingene (Lyder og haptikk). Er den av, vibrerer ikke appen heller.")
        }
    }
}

/// Innstillinger → App → Widgets: viser om widgetene deler lagring med appen og oppdaterer dem.
private struct WidgetsPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        VStack(spacing: 12) {
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    Text(WidgetShared.linked ? "Widgetene er koblet til appen" : "Widgetene når ikke appen").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.skinFg)
                    Text(WidgetShared.group ?? "Ingen App Group i signeringen").font(.system(size: 13)).foregroundStyle(Color.skinFg.opacity(0.6))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
            }
            Card { link("Oppdater widgetene nå") { store.syncWidgets(force: true) } }
            if WidgetShared.linked {
                Note(text: "Widgetene henter data fra serveren hvert 15. minutt med kontoen som er i bruk.")
            } else {
                Note(text: "Appen og widgetene må dele en App Group. AltStore og SideStore ordner det selv. I Sideloadly: slå på «Advanced options» → behold App Group / «Use app groups». Med egen Apple-utviklerkonto: legg group.no.kristo.finanshub til både appen og widget-utvidelsen.")
            }
        }
    }
}

private struct ServerPage: View {
    @Environment(Store.self) private var store
    @State private var local = ""
    @State private var external = ""
    var body: some View {
        @Bindable var s = store
        VStack(spacing: 12) {
            SectionLabel(text: "Adresser")
            VStack(alignment: .leading, spacing: 10) {
                TextField("Lokal adresse, f.eks. " + Server47.defaultLocal, text: $local).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(.horizontal, 14).frame(height: 46).glass(16)
                TextField("Ekstern adresse, f.eks. " + Server47.short(Server47.defaultExternal), text: $external).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(.horizontal, 14).frame(height: 46).glass(16)
                HStack(spacing: 10) {
                    Button { store.updateAddresses(local: local, external: external) } label: { Text("Lagre").fontWeight(.bold).frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(Primary28Style(radius: 22))
                    Button { store.testConnection(local.isEmpty ? external : local) } label: { Text("Test tilkobling").frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(.plain).glass(22)
                }
                // Prompt 47: «Tilbakestill til standard» (Server47.swift).
                Button {
                    local = Server47.defaultLocal
                    external = Server47.defaultExternal
                    Server47Model.shared.reset(store)
                } label: { Text("Tilbakestill til standard").frame(maxWidth: .infinity, minHeight: 44) }
                    .buttonStyle(.plain).glass(22)
                Note(text: "Eksternt går trafikken via Cloudflare Tunnel. Hjemme brukes den lokale adressen når den svarer.")
            }
            .padding(16).glass(24)
            Card { Switch(label: "Bruk lokal adresse hjemme", sub: "Bytter automatisk når serveren svarer på lokal adresse", on: $s.useLocal) }
            SectionLabel(text: "Status")
            Card {
                Row(label: "Aktiv vei", value: "\(store.route) · \(host(store.base))")
                Sep()
                Row(label: "Siste synk", value: stamp(store.lastSync))
                Sep()
                Row(label: "Serverversjon", value: store.me?.version ?? "–")
            }
        }
        .onAppear {
            local = store.account?.local ?? ""
            external = store.account.map { $0.external.isEmpty ? $0.server : $0.external } ?? ""
        }
        .onChange(of: store.useLocal) { _, _ in store.refresh() }
    }
}

private struct DataPage: View {
    @Environment(Store.self) private var store
    @State private var csv: URL?
    var body: some View {
        VStack(spacing: 12) {
            Card {
                Button { store.clearCache() } label: { HStack { Text("Tøm hurtigbuffer"); Spacer(); Text("Logoer og bilder").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }.padding(16).contentShape(Rectangle()) }.buttonStyle(.plain)
                Sep()
                Button { store.refresh() } label: { HStack { Text("Synk nå"); Spacer(); Text(stamp(store.lastSync)).font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }.padding(16).contentShape(Rectangle()) }.buttonStyle(.plain)
                Sep()
                if let csv {
                    ShareLink(item: csv) { HStack { Text("Del CSV-filen"); Spacer(); Image(systemName: "square.and.arrow.up") }.padding(16).contentShape(Rectangle()) }
                } else {
                    Button { Task { csv = await store.exportCsv() } } label: { HStack { Text("Eksporter som CSV"); Spacer(); Image(systemName: "tablecells") }.padding(16).contentShape(Rectangle()) }.buttonStyle(.plain)
                }
            }
            Note(text: "Full backup og Excel-database lages i FinansHub på PC under Innstillinger → Backup og data.")
        }
    }
}

private struct AboutPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
        VStack(spacing: 12) {
            Card {
                Row(label: "Appversjon", value: "FinansHub \(v)")
                Sep()
                Row(label: "Serverversjon", value: store.me?.version ?? "–")
                Sep()
                Row(label: "Plattform", value: "iOS \(UIDevice.current.systemVersion)")
            }
            SectionLabel(text: "Personvern")
            Note(text: "Appen snakker bare med din egen homelab-server. Tokenet lagres i nøkkelringen, og passordet lagres ikke. Ingen data sendes til tredjeparter fra appen.")
            SectionLabel(text: "Lisenser")
            Note(text: "Bygget med SwiftUI og Apples rammeverk. Ingen tredjepartsbiblioteker.")
            // Prompt 56: modellene bak tale til tekst og Chat på serveren (docs/lisenser-tredjepart.md).
            SectionLabel(text: "Modeller på serveren")
            Note(text: "• Inneholder modeller fra Desert Ant Labs (license.desertant.com): Voz, Clear, Eye, Redact, Gist, Tongue, Emo og Moderator.\n• Fermion Research: Phonon (CC-BY-4.0) og Neutrino (Apache-2.0).\n• NB-Whisper fra Nasjonalbiblioteket (Apache-2.0).\nModellene kjører i huset. Tale til tekst sendes bare til serveren og lagres ikke.")
        }
    }
}

/* ---------------- Finans ---------------- */

private struct AiPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        let st = store.boot?.settings
        VStack(spacing: 12) {
            SectionLabel(text: "AI-motor (på serveren)")
            Card {
                // Prompt 52: kvitteringer leses bare lokalt – Gemini er fjernet, også som reserve (SERVER52-API.md § 1).
                Choice(label: "Lokal AI", sub: "Glimt leser lokalt · bildet forlater aldri huset", on: true) { store.save("provider", "ollama"); store.save("fallback", false) }
            }
            .disabled(!store.canEditServer).opacity(store.canEditServer ? 1 : 0.55)
            if !store.canEditServer { Note(text: ServerLock26.note) }
            Card { Switch(label: "Kategoriser automatisk", sub: "AI foreslår kategori for nye transaksjoner", on: Binding(get: { st?.autoCat ?? true }, set: { store.save("autoCat", $0) })) }
            SectionLabel(text: "Krav til sikkerhet")
            Card {
                ForEach(Array([70, 80, 85, 90, 95].enumerated()), id: \.offset) { i, v in
                    if i > 0 { Sep() }
                    Choice(label: "\(v) %", sub: v == 85 ? "Standard" : nil, on: (st?.minConf ?? 85) == v) { store.save("minConf", v) }
                }
            }
            .disabled(!store.canEditServer).opacity(store.canEditServer ? 1 : 0.55)
            Note(text: "Kvitteringer under grensen må sjekkes før de bokføres. Kvitteringer leses bare lokalt (telefonen, Mac Vision, Tesseract og lokal modell).")
        }
    }
}

private struct CategoriesPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        let cats = store.boot?.categories ?? []
        let budgets = store.summary?.budgets ?? []
        VStack(spacing: 12) {
            ForEach([("expense", "Utgifter"), ("income", "Inntekter")], id: \.0) { kind, title in
                let list = cats.filter { $0.kind == kind }
                if !list.isEmpty {
                    SectionLabel(text: title)
                    Card {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, c in
                            if i > 0 { Sep() }
                            HStack(spacing: 12) {
                                Circle().fill(Color(hex: c.color)).frame(width: 12, height: 12)
                                Text(c.name)
                                Spacer()
                                if let b = budgets.first(where: { $0.categoryId == c.id }), b.budget > 0 {
                                    Text("\(n0(b.budget)) kr/mnd").font(.system(.footnote, design: .monospaced)).foregroundStyle(Color.skinFg.opacity(0.65))
                                }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 13)
                        }
                    }
                }
            }
            if cats.isEmpty { Note(text: "Ingen kategorier ennå.") }
            Note(text: "Nye kategorier, farger og budsjettbeløp endres i FinansHub på PC under Innstillinger → Kategorier.")
        }
    }
}

private struct RulesPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        let rules = store.boot?.rules ?? []
        VStack(spacing: 12) {
            Note(text: "Regler setter kategori automatisk når beskrivelsen inneholder teksten.")
            if rules.isEmpty { Note(text: "Ingen regler ennå.") } else {
                Card {
                    ForEach(Array(rules.enumerated()), id: \.offset) { i, r in
                        if i > 0 { Sep() }
                        Row(label: r.pattern ?? "–", value: r.category ?? "–")
                    }
                }
            }
            Note(text: "Regler lages og endres i FinansHub på PC under Innstillinger → Regler, eller når du endrer kategori på en transaksjon.")
        }
    }
}

private struct StocksPrefsPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        let st = store.stocks
        VStack(spacing: 12) {
            Card {
                Row(label: "Status", value: st == nil ? "–" : (st?.configured == true ? "Koblet til" : st?.mock == true ? "Demodata" : "Ikke koblet til"))
                Sep()
                Row(label: "Miljø", value: st?.env ?? "–")
                if let e = st?.error, !e.isEmpty { Sep(); Row(label: "Feil", value: e) }
            }
            Card {
                link("Åpne Aksjer") { store.openSub(.stocks) }
                Sep()
                link("Synk nå") { store.syncStocks() }
            }
            Note(text: "API-nøkkel og secret fra Trading 212 (bare lesetilgang) legges inn i FinansHub på PC og lagres bare på serveren.")
        }
    }
}

private struct BackupPage: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var csv: URL?
    var body: some View {
        VStack(spacing: 12) {
            Card {
                if let csv {
                    ShareLink(item: csv) { HStack { Text("Del CSV-filen"); Spacer(); Image(systemName: "square.and.arrow.up") }.padding(16).contentShape(Rectangle()) }
                } else {
                    Button { Task { csv = await store.exportCsv() } } label: { HStack { Text("Eksporter transaksjoner som CSV"); Spacer(); Image(systemName: "tablecells") }.padding(16).contentShape(Rectangle()) }.buttonStyle(.plain)
                }
                Sep()
                link("Backup i FinansHub på PC") { if let u = URL(string: store.base + "/finans/?desktop=1") { openURL(u) } }
            }
            Note(text: "Full backup, gjenoppretting og Excel-database lages i FinansHub på PC under Innstillinger → Backup og data.")
        }
    }
}
