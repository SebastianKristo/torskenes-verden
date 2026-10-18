import SwiftUI

/* ---------------- Homelab: mobil forside ---------------- */

let sectionName = ["clock": "Klokke og vær", "search": "Google-søk", "links": "Snarveier", "os": "Andre OS", "srv": "Serverstatus", "ruter": "Ruter"]
private let sectionIcon = ["clock": "clock", "search": "magnifyingglass", "links": "square.grid.2x2", "os": "square.stack.3d.up", "srv": "server.rack", "ruter": "tram.fill"]
private let sectionDesc = ["clock": "Tid, været der du er og pakker på vei (sveip)", "search": "Forslag og historikk mens du skriver", "links": "Snarveiene dine fra Homelab",
                           "os": "Finans, Domener og Mat", "srv": "CPU, minne, disk og oppetid", "ruter": "Neste avganger fra holdeplassene dine"]

private func kr(_ v: Double) -> String { "\(neg0(v)) kr" }

private func hm(_ d: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = "HH:mm"; return f.string(from: d) }

private func greet(_ d: Date = Date()) -> String {
    let h = Calendar.current.component(.hour, from: d)
    return h < 5 ? "God natt" : h < 10 ? "God morgen" : h < 18 ? "God dag" : "God kveld"
}

struct HomelabView: View {
    @Environment(Store.self) private var store
    var body: some View {
        let l = store.layout
        let secs = l.sec.filter { l.visible($0) }
        ScrollView {
            VStack(spacing: 16) {
                header
                if let e = store.homeError {
                    Text(e).font(.footnote).foregroundStyle(Color.accentLight).padding(14).frame(maxWidth: .infinity, alignment: .leading).glass(20)
                }
                ForEach(Array(secs.enumerated()), id: \.element) { i, id in
                    if store.editHome {
                        EditFrame(id: id, index: i, count: secs.count) { section(id) }
                    } else {
                        section(id)
                    }
                }
                if secs.isEmpty { Empty(text: store.editHome ? "Trykk + for å legge til widgets." : "Forsiden er tom. Trykk på profilbildet → Rediger forsiden.") }
                if store.editHome {
                    Text("Trykk − for å skjule og ▲ ▼ for å flytte. + legger til widgets og endrer fanelinjene.")
                        .font(.footnote).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6)
                }
            }
            .padding(.horizontal, 18).padding(.top, 6).padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await store.loadHome() }
    }

    private var header: some View {
        let first = store.displayName.split(separator: " ").first.map(String.init) ?? ""
        let hello = store.mobileHome?.greeting.flatMap { $0.isEmpty ? nil : $0 } ?? (first.isEmpty ? greet() : "\(greet()), \(first)")
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(store.editHome ? "Homelab" : longDate()).font(.subheadline).foregroundStyle(.white.opacity(0.7))
                greetingText(store.editHome ? "Rediger forsiden" : hello)
            }
            Spacer()
            if store.editHome {
                Button { store.gallery = true } label: {
                    Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(width: 44, height: 44).contentShape(Circle())
                }
                .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Legg til widget")
                Button { withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { store.editHome = false } } label: {
                    Text("Ferdig").fontWeight(.bold).foregroundStyle(Color.ink).padding(.horizontal, 18).frame(height: 44).contentShape(Capsule())
                }
                .buttonStyle(.plain).glass(22, tint: .accent)
            } else {
                Avatar()
            }
        }
        .padding(.top, 6)
    }

    /// Hilsenen står alltid på to linjer: «God kveld,» over navnet.
    private func greetingText(_ s: String) -> some View {
        let two: String
        if let r = s.range(of: ", ") { two = String(s[..<r.lowerBound]) + ",\n" + String(s[r.upperBound...]) } else { two = s }
        return Text(two).font(.system(size: 30, weight: .bold)).lineLimit(2).minimumScaleFactor(0.7).fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func section(_ id: String) -> some View {
        switch id {
        case "clock": HomeCarousel()
        case "search": GoogleSearch()
        case "links": Shortcuts()
        case "os": OtherOs()
        case "srv": ServerCard()
        case "ruter": RuterCard()
        default: EmptyView()
        }
    }
}

/// Redigeringsmodus: widgeten vugger, har stiplet kant, «−» for å skjule og ▲ ▼ for å flytte. Innholdet kan ikke trykkes på.
struct EditFrame<Content: View>: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let id: String
    let index: Int
    let count: Int
    let content: Content
    @State private var wiggle = false

    init(id: String, index: Int, count: Int, @ViewBuilder content: () -> Content) {
        self.id = id; self.index = index; self.count = count; self.content = content()
    }

    var body: some View {
        let odd = index % 2 == 1
        content
            .allowsHitTesting(false)
            .overlay(RoundedRectangle(cornerRadius: 28).stroke(.white.opacity(0.4), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5])).padding(-5).allowsHitTesting(false))
            .overlay(alignment: .topLeading) {
                Button { withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { store.setHidden(id, true) } } label: {
                    Image(systemName: "minus").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 28, height: 28).background(Color(hex: "#FF5A4E"), in: Circle()).overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1))
                        .frame(width: 44, height: 44).contentShape(Circle())
                }
                .buttonStyle(.plain).offset(x: -18, y: -18).accessibilityLabel("Skjul \(sectionName[id] ?? id)")
            }
            .overlay(alignment: .topTrailing) {
                HStack(spacing: 4) {
                    arrow("chevron.up", -1, enabled: index > 0)
                    arrow("chevron.down", 1, enabled: index < count - 1)
                }
                .offset(x: 8, y: -18)
            }
            .rotationEffect(.degrees(reduceMotion ? 0 : (wiggle ? (odd ? -0.5 : 0.5) : (odd ? 0.5 : -0.5))))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.15).repeatForever(autoreverses: true)) { wiggle = true }
            }
            .padding(.vertical, 6)
    }

    private func arrow(_ icon: String, _ dir: Int, enabled: Bool) -> some View {
        Button { withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { store.move("sec", id, dir) } } label: {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                .frame(width: 30, height: 30).background(Color.black.opacity(0.55), in: Circle()).overlay(Circle().stroke(.white.opacity(0.35), lineWidth: 1))
                .frame(width: 40, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain).disabled(!enabled).opacity(enabled ? 1 : 0.35)
        .accessibilityLabel(dir < 0 ? "Flytt opp" : "Flytt ned")
    }
}

/* ---------------- Widgets ---------------- */

/// Google-søk: historikk når feltet er tomt, forslag mens man skriver. Adresser åpnes direkte.
struct GoogleSearch: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var q = ""
    @FocusState private var focused: Bool
    var body: some View {
        let empty = q.trimmingCharacters(in: .whitespaces).isEmpty
        let items = empty ? Array(store.history.prefix(6)) : store.suggestions
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("G").font(.system(size: 22, weight: .bold))
                    .foregroundStyle(LinearGradient(colors: [Color(hex: "#4285F4"), Color(hex: "#EA4335"), Color(hex: "#FBBC05"), Color(hex: "#34A853")], startPoint: .topLeading, endPoint: .bottomTrailing))
                TextField("Søk på Google eller skriv en adresse", text: $q)
                    .keyboardType(.webSearch).submitLabel(.search).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .focused($focused)
                    .onSubmit { open(q) }
                    .onChange(of: q) { _, v in store.suggest(v) }
                if !q.isEmpty {
                    Button { q = ""; store.suggestions = [] } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.white.opacity(0.5)).frame(width: 30, height: 30) }
                        .buttonStyle(.plain).accessibilityLabel("Tøm feltet")
                }
            }
            .padding(.horizontal, 18).frame(height: 56)
            if focused && !items.isEmpty {
                Divider().overlay(.white.opacity(0.12))
                ForEach(items, id: \.self) { s in
                    HStack(spacing: 12) {
                        Image(systemName: empty ? "clock.arrow.circlepath" : "magnifyingglass").font(.system(size: 14)).foregroundStyle(.white.opacity(0.55)).frame(width: 22)
                        Button { open(s) } label: { Text(s).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()) }.buttonStyle(.plain)
                        if empty {
                            Button { store.removeHistory(s) } label: { Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.55)).frame(width: 32, height: 32) }
                                .buttonStyle(.plain).accessibilityLabel("Fjern \(s) fra historikken")
                        } else {
                            Button { q = s } label: { Image(systemName: "arrow.up.left").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.55)).frame(width: 32, height: 32) }
                                .buttonStyle(.plain).accessibilityLabel("Fyll inn \(s)")
                        }
                    }
                    .padding(.leading, 18).padding(.trailing, 10).padding(.vertical, 6)
                }
                if empty {
                    Button { store.clearHistory() } label: { Text("Tøm søkehistorikken").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight).frame(maxWidth: .infinity, minHeight: 40) }
                        .buttonStyle(.plain)
                }
            }
        }
        .glass(28)
        .animation(.easeOut(duration: 0.15), value: focused)
    }

    private func open(_ s: String) {
        guard let u = store.googleURL(s) else { return }
        focused = false
        q = ""
        openURL(u)
    }
}

/// Snarveiene fra Homelab i et rutenett med fire kolonner.
struct Shortcuts: View {
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    var body: some View {
        let list = store.mobileHome?.shortcuts ?? []
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Snarveier")
            if list.isEmpty {
                Text(store.mobileHome == nil ? "Henter snarveier …" : "Ingen snarveier ennå. Legg dem til i Homelab på PC.")
                    .font(.footnote).foregroundStyle(.white.opacity(0.6)).padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(22)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 14) {
                    ForEach(Array(list.enumerated()), id: \.offset) { _, s in
                        Button { if let u = link(s.url) { openURL(u) } } label: {
                            VStack(spacing: 6) {
                                ShortcutIcon(shortcut: s)
                                Text(s.name).font(.caption).foregroundStyle(.white.opacity(0.9)).lineLimit(1).minimumScaleFactor(0.8)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(GlassPress())
                        .accessibilityLabel(s.name)
                    }
                }
            }
        }
    }
    private func link(_ u: String) -> URL? { URL(string: u.contains("://") ? u : "https://" + u) }
}

/// Favicon via Google (offentlige adresser), ellers initialen.
struct ShortcutIcon: View {
    let shortcut: Shortcut
    var body: some View {
        let host = URL(string: shortcut.url.contains("://") ? shortcut.url : "https://" + shortcut.url)?.host ?? ""
        let pub = !host.isEmpty && !shortcut.local && !API.isLocal(host)
        ZStack {
            Text(initial(shortcut.name)).font(.system(size: 22, weight: .semibold)).foregroundStyle(Color.accentLight)
            if pub, let u = URL(string: "https://www.google.com/s2/favicons?domain=\(host)&sz=128") {
                AsyncImage(url: u) { phase in
                    if let img = phase.image {
                        img.resizable().scaledToFit().padding(13).frame(width: 56, height: 56).background(.white, in: RoundedRectangle(cornerRadius: 18))
                    }
                }
            }
        }
        .frame(width: 56, height: 56).glass(18)
    }
}

/// Andre OS: Finans som stort kort, Domener og Mat som små.
struct OtherOs: View {
    @Environment(Store.self) private var store
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Andre OS")
            Button { store.go(Tab.home) } label: { finans }.buttonStyle(GlassPress())
            HStack(spacing: 10) {
                mini("Domener", "globe", Color.domPink,
                     store.domainToday.map { "\(count($0.visitors)) besøk i dag" } ?? "Trafikk og sikkerhet", store.domainToday?.name) { store.open(.domains) }
                mini("Mat", "fork.knife", Color.positive, store.todayMeal ?? "Ukemeny og handleliste", store.todayMeal == nil ? nil : "I dag") { store.open(.mat) }
            }
        }
    }

    private var finans: some View {
        let s = store.summary
        let used = s.map { $0.budgetTotal > 0 ? min(1, $0.budgetUsed / $0.budgetTotal) : 0 } ?? 0
        let review = store.boot?.reviewCount ?? 0
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "banknote").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 34, height: 34).background(Color.accent, in: RoundedRectangle(cornerRadius: 11))
                Text("Finans").fontWeight(.semibold)
                Spacer()
                if review > 0 { Pill(text: "\(review) til gjennomgang", color: .accentLight) }
                Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.5))
            }
            if let s {
                Text("Igjen å bruke i \(monthLabel(s.month).lowercased())").font(.footnote).foregroundStyle(.white.opacity(0.7))
                Text(kr(s.left)).font(.system(size: 30, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6)
                Bar(value: used, color: Color(hex: "#FF8A4C"))
                Text("Brukt \(n0(s.budgetUsed)) av \(n0(s.budgetTotal)) kr · \(s.daysLeft) dager igjen").font(.caption).foregroundStyle(.white.opacity(0.6))
            } else {
                Text("Hjem, liste, budsjett og mer").font(.footnote).foregroundStyle(.white.opacity(0.7))
            }
        }
        .foregroundStyle(.white)
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).glass(26)
    }

    private func mini(_ title: String, _ icon: String, _ tint: Color, _ text: String, _ sub: String?, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.ink).frame(width: 32, height: 32).background(tint, in: RoundedRectangle(cornerRadius: 10))
                Text(title).fontWeight(.semibold)
                Text(text).font(.footnote).foregroundStyle(.white.opacity(0.75)).lineLimit(2, reservesSpace: true)
                Text(sub ?? " ").font(.caption).foregroundStyle(.white.opacity(0.5)).lineLimit(1)
            }
            .foregroundStyle(.white)
            .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
        }
        .buttonStyle(GlassPress())
    }
}

/// Serverstatus: CPU, minne og disk i prosent, temperatur og oppetid.
struct ServerCard: View {
    @Environment(Store.self) private var store
    var body: some View {
        let st = store.mobileHome?.serverStatus
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "server.rack").foregroundStyle(Color.accentLight)
                Text(store.mobileHome?.serverName ?? store.me?.serverName ?? "Server").fontWeight(.semibold).lineLimit(1)
                Spacer()
                if let u = st?.uptimeText, !u.isEmpty { Text("Oppe \(u)").font(.caption).foregroundStyle(.white.opacity(0.6)) }
            }
            if let st {
                gauge("CPU", st.cpu)
                gauge("Minne", st.mem)
                gauge("Disk", st.disk)
                if let t = st.temp { Text("Temperatur \(Int(t.rounded())) °C").font(.caption).foregroundStyle(t >= 75 ? Color.accentLight : .white.opacity(0.6)) }
            } else {
                Text("Ingen serverstatus fra Homelab.").font(.footnote).foregroundStyle(.white.opacity(0.6))
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).glass(24)
    }

    private func gauge(_ label: String, _ v: Double?) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack { Text(label).font(.footnote); Spacer(); Text(v.map { "\(Int($0.rounded())) %" } ?? "–").font(.system(.footnote, design: .monospaced)).foregroundStyle(.white.opacity(0.75)) }
            Bar(value: (v ?? 0) / 100, color: (v ?? 0) >= 85 ? Color.accent : Color.positive)
        }
    }
}

/// Ruter: kompakt som i designet – farget linjemerke, destinasjon og minutter på én rad, maks 4 avganger per strekning.
struct RuterCard: View {
    @Environment(Store.self) private var store
    var body: some View {
        let lines = store.mobileHome?.ruter ?? []
        if lines.isEmpty {
            Text("Ingen strekninger. Legg dem til i Homelab på PC.").font(.footnote).foregroundStyle(.white.opacity(0.6)).padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(24)
        } else {
            VStack(spacing: 10) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, r in
                    RuterBlock(line: r)
                }
            }
        }
    }
}

private struct RuterBlock: View {
    let line: RuterLine
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("Ruter · \(line.from)").font(.system(size: 16, weight: .bold)).lineLimit(1)
                Spacer(minLength: 0)
                Text("Sanntid").font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.62))
            }
            .padding(.bottom, 6)
            if line.departures.isEmpty {
                Text("Ingen avganger nå").font(.footnote).foregroundStyle(.white.opacity(0.6)).frame(minHeight: 40)
            }
            ForEach(Array(line.departures.prefix(4).enumerated()), id: \.offset) { _, d in
                RuterRow(dep: d, fallback: line.to)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading).glass(24)
    }
}

private struct RuterRow: View {
    let dep: Departure
    let fallback: String
    private var minText: String {
        guard let m = dep.min else { return dep.time ?? "" }
        return m <= 0 ? "Nå" : "\(m) min"
    }
    var body: some View {
        HStack(spacing: 12) {
            Text(dep.line).font(.system(size: 13, weight: .bold)).foregroundStyle(Color(hex: dep.ruterTextColor))
                .padding(.horizontal, 6).frame(minWidth: 32, minHeight: 24)
                .background(Color(hex: dep.ruterColor), in: RoundedRectangle(cornerRadius: 6))
            Text(dep.to ?? fallback).font(.system(size: 15)).lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 0)
            Text(minText).font(.system(size: 15, weight: .semibold)).monospacedDigit()
        }
        .frame(minHeight: 40)
    }
}

/* ---------------- Legg til widgets og fanelinjer ---------------- */

struct WidgetGallery: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Legg til widgets").font(.title2.weight(.bold))
                    Spacer()
                    Button { store.gallery = false } label: { Text("Ferdig").fontWeight(.semibold).foregroundStyle(Color.accentLight).frame(height: 44) }.buttonStyle(.plain)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(HomeLayout.sections, id: \.self) { id in
                        let on = store.layout.visible(id)
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: sectionIcon[id] ?? "square").font(.system(size: 18, weight: .semibold)).foregroundStyle(Color.accentLight)
                                .frame(width: 40, height: 40).background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                            Text(sectionName[id] ?? id).fontWeight(.semibold).lineLimit(1)
                            Text(sectionDesc[id] ?? "").font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(2, reservesSpace: true)
                            Button { withAnimation { store.setHidden(id, on) } } label: {
                                Text(on ? "Lagt til ✓" : "Legg til").font(.subheadline.weight(.semibold)).foregroundStyle(on ? Color.white.opacity(0.7) : Color.ink)
                                    .frame(maxWidth: .infinity, minHeight: 36)
                            }
                            .buttonStyle(.plain).glass(18, tint: on ? nil : .accent)
                            .accessibilityLabel(on ? "\(sectionName[id] ?? id) er lagt til. Trykk for å fjerne." : "Legg til \(sectionName[id] ?? id)")
                        }
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading).glass(22)
                    }
                }
                SectionLabel(text: "Fanelinja på Homelab")
                NavEditor(list: "hlTabs", ids: store.layout.hlTabs, fixed: HomeLayout.fixedHl, prefix: "hl.",
                          label: { HlTab(rawValue: $0)?.label ?? $0 }, icon: { HlTab(rawValue: $0)?.icon ?? "square" })
                SectionLabel(text: "Fanelinja i Finans")
                NavEditor(list: "finTabs", ids: store.layout.finTabs, fixed: HomeLayout.fixedFin, prefix: "fin.",
                          label: { Tab.from(key: $0)?.rawValue ?? $0 }, icon: { Tab.from(key: $0)?.icon ?? "square" })
                Text("Oppsettet lagres for denne brukeren og følger med til andre enheter.").font(.footnote).foregroundStyle(.white.opacity(0.6)).padding(.horizontal, 6)
                Button { store.resetLayout() } label: { Text("Tilbakestill forsiden").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50) }
                    .buttonStyle(.plain).glass(25)
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
    }
}

/// Rekkefølge, navn og synlighet for fanene. Faste faner kan flyttes og få nytt navn, men ikke skjules.
/// Et tomt navnefelt gir standardnavnet.
struct NavEditor: View {
    @Environment(Store.self) private var store
    let list: String
    let ids: [String]
    let fixed: Set<String>
    /// «hl.» eller «fin.»: nøkkelen for egne navn.
    var prefix = ""
    let label: (String) -> String
    let icon: (String) -> String
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(ids.enumerated()), id: \.element) { i, id in
                if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                HStack(spacing: 10) {
                    Image(systemName: icon(id)).frame(width: 24).foregroundStyle(.white.opacity(0.7))
                    if prefix.isEmpty { Text(label(id)).lineLimit(1) } else { TabNameField(key: prefix + id, placeholder: label(id)) }
                    Spacer()
                    Button { withAnimation { store.move(list, id, -1) } } label: { Image(systemName: "chevron.up").frame(width: 34, height: 34).contentShape(Rectangle()) }
                        .buttonStyle(.plain).disabled(i == 0).opacity(i == 0 ? 0.3 : 1).accessibilityLabel("Flytt \(label(id)) opp")
                    Button { withAnimation { store.move(list, id, 1) } } label: { Image(systemName: "chevron.down").frame(width: 34, height: 34).contentShape(Rectangle()) }
                        .buttonStyle(.plain).disabled(i == ids.count - 1).opacity(i == ids.count - 1 ? 0.3 : 1).accessibilityLabel("Flytt \(label(id)) ned")
                    if fixed.contains(id) {
                        Text("Alltid").font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.55)).frame(width: 51)
                    } else {
                        Toggle(label(id), isOn: Binding(get: { store.layout.visible(id) }, set: { store.setHidden(id, !$0) })).labelsHidden().tint(.accent)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
            }
        }
        .glass(22)
    }
}

/// Navnefelt for en fane: lagres når man trykker Ferdig eller forlater siden.
struct TabNameField: View {
    @Environment(Store.self) private var store
    let key: String
    let placeholder: String
    @State private var text = ""
    @State private var loaded = false
    var body: some View {
        TextField(placeholder, text: $text)
            .submitLabel(.done)
            .onSubmit { store.rename(key, text) }
            .onAppear { if !loaded { text = store.layout.names[key] ?? ""; loaded = true } }
            .onChange(of: text) { _, v in if v.count > 30 { text = String(v.prefix(30)) } }
            .onDisappear { if (store.layout.names[key] ?? "") != text.trimmingCharacters(in: .whitespaces) { store.rename(key, text) } }
            .accessibilityLabel("Navn på fanen \(placeholder)")
    }
}
