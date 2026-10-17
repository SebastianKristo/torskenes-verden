import SwiftUI

private let groups: [(String, [(String, String, String)])] = [
    ("Konto", [("accounts", "Kontoer og brukere", "person.2"), ("security", "Sikkerhet", "lock"), ("tokens", "API-tokens", "key")]),
    ("App", [("look", "Utseende", "paintpalette"), ("scan", "Skanning og AI", "doc.viewfinder"), ("notify", "Varsler", "bell")]),
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
                case "server": ServerPage()
                case "data": DataPage()
                default: AboutPage()
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
    }

    private var main: some View {
        VStack(spacing: 12) {
            Button { store.settingsPage = "accounts" } label: {
                HStack(spacing: 14) {
                    Text(initial(store.displayName.isEmpty ? "S" : store.displayName)).font(.title2.weight(.bold)).foregroundStyle(Color.ink).frame(width: 56, height: 56).background(Color.accent, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.displayName).font(.title3.weight(.bold))
                        Text("\(store.account?.username ?? "–") · \(store.me?.role ?? store.account?.role ?? "")").font(.footnote).foregroundStyle(.white.opacity(0.7))
                        Text(host(store.base)).font(.caption).foregroundStyle(.white.opacity(0.55))
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.6))
                }
                .padding(18).glass(28, tint: Color.accent.opacity(0.35))
            }
            .buttonStyle(.plain)
            ForEach(groups, id: \.0) { g in
                SectionLabel(text: g.0)
                VStack(spacing: 0) {
                    ForEach(Array(g.1.enumerated()), id: \.offset) { i, item in
                        if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                        Button { store.settingsPage = item.0; if item.0 == "tokens" { store.loadTokens() } } label: {
                            HStack(spacing: 14) {
                                Image(systemName: item.2).frame(width: 24).foregroundStyle(Color.accent)
                                Text(item.1)
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.5))
                            }
                            .padding(16).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .glass(24)
            }
            Button { store.logout() } label: { Text("Logg ut av \(store.displayName)").fontWeight(.semibold).foregroundStyle(Color(hex: "#FF8A6B")).frame(maxWidth: .infinity, minHeight: 52) }
                .buttonStyle(.plain).glass(26)
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
    var body: some View { HStack { Text(label).foregroundStyle(.white.opacity(0.65)); Spacer(); Text(value).fontWeight(.medium).lineLimit(1) }.padding(.horizontal, 16).padding(.vertical, 13) }
}

private struct Switch: View {
    let label: String
    var sub: String? = nil
    @Binding var on: Bool
    var body: some View {
        Toggle(isOn: $on) {
            VStack(alignment: .leading, spacing: 2) { Text(label); if let sub { Text(sub).font(.caption).foregroundStyle(.white.opacity(0.6)) } }
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
                VStack(alignment: .leading, spacing: 2) { Text(label); if let sub { Text(sub).font(.caption).foregroundStyle(.white.opacity(0.6)) } }
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
    var body: some View { Text(text).font(.caption).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6) }
}

private struct Sep: View {
    var body: some View { Divider().overlay(.white.opacity(0.12)) }
}

private func link(_ label: String, _ act: @escaping () -> Void) -> some View {
    Button(action: act) { HStack { Text(label).foregroundStyle(Color.accentLight); Spacer(); Image(systemName: "arrow.up.right").foregroundStyle(.white.opacity(0.5)) }.padding(16).contentShape(Rectangle()) }
        .buttonStyle(.plain)
}

/* ---------------- Sider ---------------- */

private struct AccountsPage: View {
    @Environment(Store.self) private var store
    var body: some View {
        VStack(spacing: 12) {
            Note(text: "Hver konto har egne data, tokens og varsler. Bytt raskt ved å holde inne profilbildet.")
            Card {
                ForEach(Array(store.accounts.enumerated()), id: \.element.id) { i, a in
                    if i > 0 { Sep() }
                    let active = a.id == store.account?.id
                    HStack(spacing: 12) {
                        Text(initial(a.label)).fontWeight(.bold).foregroundStyle(active ? Color.ink : .white).frame(width: 40, height: 40).background(active ? Color.accent : .white.opacity(0.14), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(a.label + (active ? " · aktiv" : "")).fontWeight(.medium)
                            Text("\(a.username.isEmpty ? "–" : a.username) · \(a.role) · \(host(a.server))").font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                        }
                        Spacer()
                        Button("Logg ut") { store.logout(a.id) }.foregroundStyle(Color.accentLight)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
                    .onTapGesture { if !active { store.switchTo(a.id) } }
                }
            }
            Button { store.addingAccount = true } label: { Label("Legg til konto", systemImage: "person.badge.plus").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 50) }
                .buttonStyle(.plain).glass(25, tint: .accent)
            if store.accounts.count > 1 {
                Button { store.logoutOthers() } label: { Text("Logg ut andre kontoer").frame(maxWidth: .infinity, minHeight: 48) }.buttonStyle(.plain).glass(24)
            }
            Note(text: "Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.")
        }
    }
}

private struct SecurityPage: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    var body: some View {
        @Bindable var s = store
        VStack(spacing: 12) {
            Card { Switch(label: "Lås med Face ID", sub: "Kreves når appen åpnes. Koden kan brukes som reserve.", on: $s.lockEnabled) }
            if store.lockEnabled {
                SectionLabel(text: "Lås etter")
                Card {
                    ForEach(Array([(0, "Umiddelbart"), (1, "1 min"), (5, "5 min"), (15, "15 min")].enumerated()), id: \.offset) { i, o in
                        if i > 0 { Sep() }
                        Choice(label: o.1, on: store.lockAfter == o.0) { store.lockAfter = o.0 }
                    }
                }
            }
            Card { Switch(label: "Skjul beløp i appveksleren", sub: "Uskarpt bilde i oversikten over åpne apper", on: $s.hideSwitcher) }
            SectionLabel(text: "Tofaktor (2FA)")
            Card {
                Row(label: "Status", value: store.me?.twoFactor == true ? "På · TOTP" : store.me?.twoFactor == false ? "Av" : "Ukjent")
                Sep()
                link(store.me?.twoFactor == true ? "Slå av 2FA" : "Sett opp 2FA") { if let u = URL(string: store.base + "/") { openURL(u) } }
            }
            Note(text: "Oppsett med QR-kode og gjenopprettingskoder gjøres i Homelab → Innstillinger → Innlogging. Bruk en autentiseringsapp som 1Password, Aegis eller Google Authenticator.")
            SectionLabel(text: "Pålitelige enheter")
            Card {
                Row(label: "Denne enheten", value: UIDevice.current.name)
                Sep()
                link("Administrer i Homelab") { if let u = URL(string: store.base + "/") { openURL(u) } }
            }
            Note(text: "Appen bruker et eget token. Fra internett kreves alltid passord, og 2FA hvis det er på.")
        }
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
                                    Text((t.scopes ?? []).joined(separator: ", ")).font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(2)
                                    Text("Laget \(stamp(t.created?.date)) · sist brukt \(stamp((t.lastUsed ?? t.last_used)?.date)) · utløper \((t.expires ?? t.expiresAt)?.date.map { stamp($0) } ?? "aldri")")
                                        .font(.caption2).foregroundStyle(.white.opacity(0.5))
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
                    Text("Tilganger").font(.footnote).foregroundStyle(.white.opacity(0.6))
                    Flow(spacing: 8) {
                        ForEach(allScopes, id: \.0) { k, n in
                            Button { if scopes.contains(k) { scopes.remove(k) } else { scopes.insert(k) } } label: {
                                Text(n).font(.subheadline).padding(.horizontal, 12).frame(height: 34).foregroundStyle(scopes.contains(k) ? Color.ink : .white)
                            }
                            .buttonStyle(.plain).glass(17, tint: scopes.contains(k) ? .accent : nil)
                        }
                    }
                    Text("Utløper").font(.footnote).foregroundStyle(.white.opacity(0.6))
                    Picker("Utløper", selection: $days) {
                        Text("30 d").tag(Int?.some(30)); Text("90 d").tag(Int?.some(90)); Text("1 år").tag(Int?.some(365)); Text("Aldri").tag(Int?.none)
                    }
                    .pickerStyle(.segmented)
                    Button { store.createToken(name: name.isEmpty ? "Token" : name, scopes: Array(scopes), days: days); name = "" } label: {
                        Text("Lag token").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.plain).glass(24, tint: .accent).disabled(scopes.isEmpty)
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
            Card { Switch(label: "Fargebakgrunn", sub: "Fargede lysflekker bak glassflatene", on: $s.colorBg) }
            SectionLabel(text: "Startside")
            Card {
                ForEach(Array([("home", "Hjem"), ("list", "Liste"), ("budget", "Budsjett")].enumerated()), id: \.offset) { i, o in
                    if i > 0 { Sep() }
                    Choice(label: o.1, on: store.startPage == o.0) { store.startPage = o.0 }
                }
            }
            Card { Switch(label: "Skjul beløp til jeg trykker", sub: "Beløp vises som prikker til du trykker på saldoen eller øyet", on: $s.hideAmounts) }
            Note(text: "Fanelinja bruker Liquid Glass på iOS 26 og krymper når du scroller ned.")
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
                Choice(label: "Ollama lokalt", sub: "Bildet forlater aldri huset", on: st?.provider == "ollama" && st?.fallback != true) { store.save("provider", "ollama"); store.save("fallback", false) }
                Sep()
                Choice(label: "Gemini", sub: "Raskest og mest presis", on: st?.provider == "gemini") { store.save("provider", "gemini"); store.save("fallback", false) }
                Sep()
                Choice(label: "Ollama + Gemini", sub: "Lokalt først, Gemini som reserve", on: st?.provider == "ollama" && st?.fallback == true) { store.save("provider", "ollama"); store.save("fallback", true) }
            }
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
                TextField("Lokal adresse, f.eks. 192.168.1.20:3000", text: $local).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(.horizontal, 14).frame(height: 46).glass(16)
                TextField("Ekstern adresse, f.eks. os.dittdomene.no", text: $external).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(.horizontal, 14).frame(height: 46).glass(16)
                HStack(spacing: 10) {
                    Button { store.updateAddresses(local: local, external: external) } label: { Text("Lagre").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(.plain).glass(22, tint: .accent)
                    Button { store.testConnection(local.isEmpty ? external : local) } label: { Text("Test tilkobling").frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(.plain).glass(22)
                }
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
                Button { store.clearCache() } label: { HStack { Text("Tøm hurtigbuffer"); Spacer(); Text("Logoer og bilder").font(.footnote).foregroundStyle(.white.opacity(0.6)) }.padding(16).contentShape(Rectangle()) }.buttonStyle(.plain)
                Sep()
                Button { store.refresh() } label: { HStack { Text("Synk nå"); Spacer(); Text(stamp(store.lastSync)).font(.footnote).foregroundStyle(.white.opacity(0.6)) }.padding(16).contentShape(Rectangle()) }.buttonStyle(.plain)
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
        }
    }
}
