import SwiftUI
import UIKit

/* ---------------- Papir: Hjem, Finans, Sporing, Mer og Innstillinger ---------------- */

private func pkr(_ v: Double) -> String { "\(neg0(v)) kr" }

/* ---------- Hjem ---------- */

struct PaperHome: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    /// Prompt 45: iPad/brettet (1c) – kortene for én fane i høyre kolonne (layout.pages["fold-…"], Home45Wide.swift).
    var page45: String? = nil

    var body: some View {
        VStack(spacing: 10) {
            if let pg = page45 {
                wide45(pg)
            } else {
                phone
            }
        }
        // Prompt 46: Min posisjon (standard) holdes fersk for Vær-kortet på Hjem (Vaer46.swift).
        .vaer46Keeper()
        .update30Sheet()
        // Prompt 37: arket med hele bibelverset, og modulen lastes (avgjør om h13 finnes).
        .bible37Sheet(p)
        .task { await Update30Model.shared.load(store) }
        .task { await Bible37Model.shared.load(store) }
    }

    @ViewBuilder private var phone: some View {
        // Prompt 30: oppdateringsbanneret øverst, over søkefeltet (bare admin, ✕ skjuler i 24 t). Update30.swift.
        Update30Banner(home: true)
        // Prompt 41: 17. mai – eget Hjem på dagen med bryteren «17. mai-design» (Mai17Home41.swift).
        Mai17Home41()
        // Hold inne et kort for å flytte eller skjule det (Søk, Pakker, Avganger, Snarveier og Siste nytt).
        PaperCardStack(page: "hjem", cards: homeCards + [shortcuts46], fullWidth: ["h1", "h5", "h12", "h13", "h14", "h16"], twoColumns: true)
            .task(id: store.account?.id ?? "") { if !Trial31Model.shared.loaded { await Trial31Model.shared.load(store.api) } }
        homeErrorText
    }

    @ViewBuilder private var homeErrorText: some View {
        if let e = store.homeError { Text(e).font(PF.ui(12.5)).foregroundStyle(p.lab).frame(maxWidth: .infinity, alignment: .leading) }
    }

    /// Prompt 45: én fane i 1c. Oppdateringsbanneret står øverst i «Nå». Søk og Brief ligger i Glimt-kortet til venstre,
    /// tallene (Finans, Mat, Domener) er et eget kort (h16).
    @ViewBuilder private func wide45(_ pg: String) -> some View {
        if pg == Home45.page("na") { Update30Banner(home: true) }
        PaperCardStack(page: pg, cards: wideCards45, fullWidth: [], twoColumns: false)
            .task(id: store.account?.id ?? "") { if !Trial31Model.shared.loaded { await Trial31Model.shared.load(store.api) } }
            .onAppear { Home45.ensure(Home45.tabFromPage(pg), Home45.allKeys, store) }
        homeErrorText
    }

    private var wideCards45: [PaperCardDef] {
        let keys: [String] = Home45.usable(homeCards.map(\.key))
        var out: [PaperCardDef] = homeCards.filter { keys.contains($0.key) }
        if !out.contains(where: { $0.key == "h16" }) { out.append(shortcuts46) }
        return out
    }

    /// Prompt 46: Søk (h1) og Snarveier (h16: Finans · Mat · Domener) er to egne kort på mobil – hvert med egen «–» og plass.
    /// Eksisterende oppsett får h16 rett etter h1 (pageCards i Paper15.swift), så ingenting flytter seg.
    private var shortcuts46: PaperCardDef {
        PaperCardDef(key: "h16", label: "Snarveier (Finans, Mat, Domener)", view: AnyView(minis))
    }

    /// Kortene på Hjem. Prompt 37: «Dagens bibelvers» (h13) finnes bare for brukere med modulen (Bible37Views.swift).
    private var homeCards: [PaperCardDef] {
        var out: [PaperCardDef] = [
                // Prompt 34: Glimt-brief øverst (blått kort med figuren), flyttes og skjules i wiggle-modus (Brief34Page.swift).
                PaperCardDef(key: "h12", label: "Glimt-brief", view: AnyView(Brief36SwipeCard())), // prompt 36: sveip bort (Brief36.swift)
                // Prompt 29: søkefelt med søkemotor-meny (System-AI/Google/DuckDuckGo) og timer til kalenderen (HomeSearch29.swift).
                PaperCardDef(key: "h1", label: "Søk", view: AnyView(HomeSearch29())), // prompt 46: Snarveier er eget kort (h16)
                PaperCardDef(key: "h2", label: "Pakker", view: AnyView(packages)),
                // Prompt 43: Media (nedlastinger og det som kommer), Media43Home.swift. Nøkkelen h12 er Glimt-brief på iOS.
                PaperCardDef(key: "h15", label: "Media", view: AnyView(Media43HomeCard())),
                // Prompt 27: «Velg stopp» og én gruppe per stopp (RuterHome27.swift).
                // Prompt 41: Min reise over (eller i stedet for) Avganger når du har forlatt skolen (MinReise41Views.swift).
                PaperCardDef(key: "h3", label: "Avganger", view: AnyView(MinReise41HomeSlot())),
                // Prompt 32: Prøveperioder under Avganger (Trials32App.swift). Flyttes og skjules i wiggle-modus.
                // Prompt 46: vises bare med minst én aktiv prøveperiode (eller i wiggle, så det kan flyttes/skjules) – se trials46.
                PaperCardDef(key: "h11", label: "Prøveperioder", view: AnyView(Trial32bHomeCard())),
                // Prompt 26: KALENDER etter Avganger (med lagret oppsett legger pageCards den nederst).
                PaperCardDef(key: "h10", label: "Kalender", view: AnyView(Cal26HomeCard())),
                PaperCardDef(key: "h4", label: "Lenker", view: AnyView(shortcuts)), // prompt 46: «Snarveier» er nå h16
                PaperCardDef(key: "h5", label: "Siste nytt", view: AnyView(newsCard)),
                PaperCardDef(key: "h6", label: "Gjøremål", view: AnyView(PaperTasksCard())),
                PaperCardDef(key: "h7", label: "Posisjon", view: AnyView(PaperFamilyCard())),
                PaperCardDef(key: "h8", label: "Bolig", view: AnyView(PaperHomeBoligCard())),
                PaperCardDef(key: "h9", label: "Bursdager", view: AnyView(PaperBirthdaysCard24())),
        ]
        if !trials46 { out.removeAll { $0.key == "h11" } }
        if Bible37Model.shared.enabled {
            let i: Int = (out.firstIndex { $0.key == "h12" } ?? -1) + 1
            out.insert(PaperCardDef(key: "h13", label: "Bibelvers", view: AnyView(Bible37HomeCard())), at: i)
        }
        // Prompt 40: Hjemlys-kortet på Hjem (status for husstanden, Glimt-forslag og start), bare når serveren har Hjemlys.
        if Hjemlys40Model.shared.supported {
            let i: Int = (out.firstIndex(where: { $0.key == "h13" }) ?? out.firstIndex(where: { $0.key == "h12" }) ?? -1) + 1
            out.insert(PaperCardDef(key: "h14", label: "Vel fremme", view: AnyView(Hjemlys40HomeCard())), at: i)
        }
        return out
    }

    /// Prompt 46: «Prøveperioder» bare når det finnes en aktiv (eller mens Hjem redigeres). Lasting skjer i trialsLoader46.
    private var trials46: Bool {
        let t: Trial31Model = Trial31Model.shared
        return !t.active.isEmpty || store.paperEditPage != nil
    }

    /// Prompt 24: Pakker vises også uten aktive pakker («Ingen aktive pakker · Legg til et sporingsnummer»), med mindre
    /// «Vis bare når det er pakker» er på (prompt 37). Prompt 37: 2 eller 3 pakker når det er valgt i «Rediger widget» (Pkg37.swift).
    @ViewBuilder private var packages: some View {
        let n: Int = Wopt37.shared.h2N
        let list: [Shipment] = Pkg37.sorted(store)
        if n > 1 && list.count > 1 {
            Pkg37ListCard(items: Array(list.prefix(n)), more: Swift.max(0, list.count - n))
        } else if let s = topPackage { packageCard(s) } else { PaperNoPackagesCard24() }
    }

    private var topPackage: Shipment? {
        let list = (store.homePackages ?? store.tracking?.items ?? []).filter { !$0.archived && $0.status != "delivered" }
        return list.first { $0.status == "ready_for_pickup" } ?? list.first
    }

    private func packageCard(_ s: Shipment) -> some View {
        let counted: Int = Swift.max(0, ((store.tracking?.items ?? store.homePackages ?? []).filter { !$0.archived && $0.status != "delivered" }.count) - 1)
        let more: Int = s.moreCount ?? counted
        return Button { store.paperGo("sporing") } label: {
            HStack(spacing: 14) {
                PaperCarrierBadge(s: s, size: 52, radius: 14)
                VStack(alignment: .leading, spacing: 2) {
                    PLabel(text: s.status == "ready_for_pickup" ? "Hent nå" : s.statusText)
                    Text(s.displayTitle).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text([s.pickupPoint, s.eta].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(more > 0 ? (more == 1 ? "+1 pakke ›" : "+\(more) pakker ›") : "›").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var ruter: some View {
        let lines = store.mobileHome?.ruter ?? []
        if let first = lines.first {
            let deps = Array(lines.flatMap { l in l.departures.map { (l.to, $0) } }.prefix(4))
            Button { store.paperGo("avg") } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        PLabel(text: "Avganger · \(first.from)")
                        Spacer()
                        Text("sanntid ›").font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                    if deps.isEmpty { Text("Ingen avganger akkurat nå.").font(PF.ui(13)).foregroundStyle(p.mut) }
                    ForEach(Array(deps.enumerated()), id: \.offset) { _, d in
                        PaperRuterRow(line: d.1.line, color: d.1.ruterColor, textColor: d.1.ruterTextColor, dest: d.1.to ?? d.0, minutes: d.1.min, time: d.1.time)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityHint("Åpner avgangene")
        }
    }

    private var minis: some View {
        let review = store.summary?.review.count ?? store.boot?.reviewCount ?? 0
        let left = store.summary?.left
        let up = store.domainToday
        return HStack(spacing: 8) {
            mini("Finans", left.map { n0($0) } ?? "–", review > 0 ? "\(review) kvitteringer" : "igjen i mnd", review > 0 ? p.lab : p.mut, 20) { store.paperGo("finans") }
            mini("Mat", store.todayMeal ?? "Ingen rett", "", p.mut, 16) { store.paperGo("mat") }
            mini("Domener", up.map { n0($0.visitors) } ?? "–", up == nil ? "" : "besøk i dag", p.pos, 20) { store.paperOpenDomains(from: "hjem") }
        }
    }

    private func mini(_ k: String, _ v: String, _ s: String, _ sc: Color, _ fs: CGFloat, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            VStack(alignment: .leading, spacing: 3) {
                PLabel(text: k, color: p.mut, size: 9.5)
                Spacer(minLength: 0)
                Text(v).font(PF.serif(fs, medium: true)).foregroundStyle(p.ink).lineLimit(2).minimumScaleFactor(0.7)
                if !s.isEmpty { Text(s).font(PF.ui(11)).foregroundStyle(sc).lineLimit(1) }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var newsCard: some View {
        let items = store.homeNews.isEmpty ? Array((store.news?.items ?? []).prefix(5)) : store.homeNews
        let sources = Array(Set(items.map(\.short))).sorted().prefix(3).joined(separator: " · ")
        return VStack(spacing: 0) {
            HStack {
                PLabel(text: "Siste nytt")
                Spacer()
                Text(sources).font(PF.ui(11.5)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 6)
            Rectangle().fill(p.ink).frame(height: 2)
            VStack(spacing: 0) {
                if items.isEmpty {
                    Text("Ingen nyheter ennå. Legg til kilder i nyhetsleseren.").font(PF.ui(13)).foregroundStyle(p.mut).padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(items) { x in
                    Button { store.openLink(x.url) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(x.short).font(PF.mono(10)).foregroundStyle(p.lab).frame(width: 30, alignment: .leading)
                            Text(x.title).font(PF.serif(14, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                            Spacer(minLength: 4)
                            Text(x.timeText).font(PF.ui(11)).foregroundStyle(p.mut)
                        }
                        .padding(.vertical, 6)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Rectangle().fill(p.line).frame(height: 1)
                }
            }
            .padding(.horizontal, 14)
            PInkButton(title: "Åpne nyhetsleser ›") { store.openNews() }
                .padding(.vertical, 12)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    @ViewBuilder private var shortcuts: some View {
        let list = store.mobileHome?.shortcuts ?? []
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                PSection(title: "Snarveier")
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.offset) { _, s in
                        Button { store.openLink(s.url.contains("://") ? s.url : "https://" + s.url) } label: {
                            HStack(spacing: 8) {
                                Circle().fill(p.lab).frame(width: 7, height: 7)
                                Text(s.name).font(PF.ui(14, .medium)).foregroundStyle(p.ink).lineLimit(1)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, 4)
        }
    }
}

/// Søkefeltet («⌕ Søk på Google») med forslag og historikk.
struct PaperSearch: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var q = ""
    @FocusState private var focused: Bool

    var body: some View {
        let empty = q.trimmingCharacters(in: .whitespaces).isEmpty
        let items = empty ? Array(store.history.prefix(5)) : Array(store.suggestions.prefix(6))
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                // Prompt 27: ✕ til venstre (SearchField27) og ✦ AI til høyre, som åpner Chat med teksten (store.openChat(prompt:), Chat27Model.swift).
                SearchField27(text: $q, placeholder: "Søk på Google", font: PF.ui(14.5), keyboard: .webSearch, autocap: .never,
                              focus: $focused, onClear: { store.suggestions = [] }, onSubmit: { go(q) }, lead: {
                    GoogleG(size: 17)
                })
                .onChange(of: q) { _, v in store.suggest(v) }
                Button { askAi27() } label: {
                    Text("✦ AI").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(p.bg, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.trailing, -10)
                .accessibilityLabel("Spør AI")
            }
            .padding(.horizontal, 16).frame(height: 46)
            if focused && !items.isEmpty {
                Rectangle().fill(p.line).frame(height: 1)
                ForEach(items, id: \.self) { s in
                    Button { go(s) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: empty ? "clock.arrow.circlepath" : "magnifyingglass").font(.system(size: 13)).foregroundStyle(p.mut)
                            Text(s).font(PF.ui(14)).foregroundStyle(p.ink).lineLimit(1)
                            Spacer()
                        }
                        .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 23, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 15, y: 10)
        .animation(.easeOut(duration: 0.15), value: focused)
    }

    /// ✦ AI: ny chat med teksten i feltet (tomt felt åpner bare Chat).
    private func askAi27() {
        Haptics.shared.tap()
        let t: String = q
        focused = false
        q = ""
        store.suggestions = []
        store.openChat(prompt: t)
    }

    private func go(_ s: String) {
        guard let u = store.googleURL(s) else { return }
        focused = false
        q = ""
        store.openURL(u)
    }
}

/// En avgang: farget linjemerke, destinasjon og minutter.
struct PaperRuterRow: View {
    @Environment(\.paper) private var p
    let line: String
    let color: String?
    var textColor: String = "#FFFFFF"
    let dest: String
    let minutes: Int?
    let time: String?
    var body: some View {
        HStack(spacing: 10) {
            Text(line).font(PF.ui(12, .heavy)).foregroundStyle(Color(hex: textColor))
                .frame(minWidth: 30).frame(height: 24).padding(.horizontal, 4)
                .background(lineColor, in: RoundedRectangle(cornerRadius: 6))
            Text(dest).font(PF.ui(14.5)).foregroundStyle(p.ink).lineLimit(1)
            Spacer(minLength: 4)
            if let m = minutes {
                Text(m <= 0 ? "nå" : "\(m)").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                Text(m <= 0 ? "" : "min").font(PF.ui(12)).foregroundStyle(p.mut).frame(width: 26, alignment: .leading)
            } else if let t = time {
                Text(t).font(PF.serif(18, medium: true)).foregroundStyle(p.ink)
            }
        }
    }

    /// Ruters linjefarge (T-bane oransje, trikk blå, buss rød) når linjen ikke har egen farge.
    private var lineColor: Color {
        if let c = color, !c.isEmpty { return Color(hex: c) }
        if let n = Int(line), n <= 5 { return Color(hex: "#EC700C") }
        return Color(hex: "#E60000")
    }
}

/// Logo-merket til transportøren (initialer på transportørens farge).
struct PaperCarrierBadge: View {
    let s: Shipment
    var size: CGFloat = 42
    var radius: CGFloat = 12
    var body: some View {
        // Prompt 21: butikklogo med fraktmerke, ellers fraktselskapets logo, til slutt bokstav på selskapets farge.
        PackageLogo21(s: s, size: size, radius: radius)
    }
}

/* ---------- Finans ---------- */

struct PaperFinance: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.scenePhase) private var phase
    @Environment(\.paperWide) private var wide
    @Environment(\.horizontalSizeClass) private var hsc43

    var body: some View {
        // Prompt 43 (1b): på iPad står saldokortet og kortene til venstre og Liste med månedstopper til høyre.
        HStack(alignment: .top, spacing: 0) {
        VStack(spacing: 10) {
            // Saldo, Kvitteringer (banneret), Siste transaksjoner og Budsjett kan flyttes og skjules (hold inne).
            PaperCardStack(page: "finans", cards: [
                // Prompt 43: nytt saldokort (4b i Papir-farger, Fin43.swift).
                PaperCardDef(key: "f1", label: "Saldo", view: AnyView(Fin43Saldo())),
                PaperCardDef(key: "f2", label: "Kvitteringer", view: AnyView(PaperReviewBanner())),
                PaperCardDef(key: "f3", label: "Siste transaksjoner", view: AnyView(recentCard)),
                PaperCardDef(key: "f4", label: "Budsjett", view: AnyView(budgetCard)),
            ])
        }
        .frame(maxWidth: wide && hsc43 == .regular ? 400 : .infinity)
        if wide && hsc43 == .regular {
            Rectangle().fill(p.line).frame(width: 1).padding(.horizontal, 16)
            PaperFinList().frame(maxWidth: .infinity)
        }
        }
        .task {
            await store.loadPaperFinance()
            await store.loadPaperFinance15()
        }
        .onChange(of: phase) { _, ph in if ph == .active { Task { await store.loadPaperFinance15() } } }
    }

    private var recentCard: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: "Siste transaksjoner · \(recentList.count)")
                Spacer()
                Button { store.paperGo("fliste") } label: { Text("Vis alle ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut) }
                    .buttonStyle(.plain)
            }
            .padding(.horizontal, 2).padding(.bottom, 6)
            Rectangle().fill(p.ink).frame(height: 2)
            recent
        }
        .padding(.top, 4)
    }

    private var budgetCard: some View {
        VStack(spacing: 0) { budget }
    }

    private var recentList: [Tx] { store.recent15 ?? Array((store.summary?.recent ?? []).prefix(15)) }

    private var saldo: some View {
        let total = (store.boot?.accounts ?? []).reduce(0) { $0 + $1.balance }
        let s = store.summary
        return VStack(alignment: .leading, spacing: 6) {
            PLabel(text: "Saldo · alle kontoer")
            Text(store.boot == nil ? "–" : pkr(total)).font(PF.serif(44)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
            HStack(spacing: 8) {
                kpi("Inn", s.map { n0($0.inn) } ?? "–", p.pos)
                kpi("Brukt", s.map { n0($0.ut) } ?? "–", p.ink)
                kpi("Igjen", s.map { neg0($0.left) } ?? "–", p.ink)
            }
            .padding(.top, 8)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
    }

    private func kpi(_ n: String, _ v: String, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(n).font(PF.ui(11.5)).foregroundStyle(p.mut)
            Text(v).font(PF.serif(18, medium: true)).foregroundStyle(c).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var recent: some View {
        let list = recentList
        if list.isEmpty { Text(store.summary == nil ? "Henter …" : "Ingen transaksjoner ennå.").font(PF.ui(13)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading) }
        ForEach(list) { t in
            Button { store.openPaperTx(t.id) } label: {
                HStack(spacing: 12) {
                    PaperLogo(domain: t.domain, name: t.merchant ?? t.description, color: t.color, size: 38, radius: 11)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(t.merchant ?? t.description).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Text("\(t.category) · \(shortDate(t.date))").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    Text((t.amount > 0 ? "+" : "") + neg0(t.amount)).font(PF.serif(17, medium: true)).foregroundStyle(t.amount > 0 ? p.pos : p.ink)
                }
                .padding(.vertical, 6).padding(.horizontal, 2)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Rectangle().fill(p.line).frame(height: 1)
        }
    }

    @ViewBuilder private var budget: some View {
        if let s = store.summary, !s.budgets.isEmpty {
            PSection(title: "Budsjett · \(s.month)", trailing: "\(n0(s.budgetUsed)) av \(n0(s.budgetTotal))")
            ForEach(Array(s.budgets.prefix(5))) { b in
                let pct = b.budget > 0 ? b.used / b.budget : 0
                HStack(spacing: 12) {
                    Text(b.category).font(PF.ui(14)).foregroundStyle(p.ink).lineLimit(1).frame(width: 110, alignment: .leading)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(p.line)
                            Capsule().fill(pct > 0.9 ? p.lab : p.ink).frame(width: g.size.width * Swift.min(1, pct))
                        }
                    }
                    .frame(height: 8)
                    Text("\(Int((pct * 100).rounded())) %").font(PF.ui(12.5)).foregroundStyle(p.mut).frame(width: 46, alignment: .trailing)
                }
                .padding(.vertical, 6).padding(.horizontal, 2)
            }
        }
    }

    private var pages: some View {
        VStack(alignment: .leading, spacing: 0) {
            PSection(title: "Alt i Finans")
            PaperLinkList(rows: [
                PaperLinkRow(name: "Transaksjoner", sub: "Søk, filtrer og rediger") { store.paperGo("fliste") },
                PaperLinkRow(name: "Budsjett", sub: "Kategorier og forbruk") { store.paperOpenFin(.budget) },
                PaperLinkRow(name: "✦ AI-søk", sub: "Spør om økonomien din") { store.paperOpenFin(.search) },
                PaperLinkRow(name: "Kvitteringer", sub: "Skann, kø og bekreftelse") { store.paperOpen(.upload) },
                PaperLinkRow(name: "Faste utgifter", sub: "Trekk hver måned") { store.paperOpen(.fast) },
                PaperLinkRow(name: "Kontoer", sub: "Saldo og sparemål") { store.paperOpen(.accounts) },
                PaperLinkRow(name: "Rapporter", sub: "Måned og år") { store.paperOpen(.reports) },
                PaperLinkRow(name: "Import", sub: "Bankutskrift, CSV og XLSX") { store.paperOpen(.imports) },
                PaperLinkRow(name: "Oversikt", sub: "Den fulle oversikten fra den klassiske appen") { store.paperOpenFin(.home) },
            ])
        }
    }
}

private func shortDate(_ iso: String) -> String {
    let parts = iso.prefix(10).split(separator: "-")
    guard parts.count == 3 else { return iso }
    if String(iso.prefix(10)) == isoDay(Date()) { return "I dag" }
    return "\(parts[2]).\(parts[1])"
}

/// Liste med rader og pil («Domener ›»).
struct PaperLinkRow: Identifiable {
    let id = UUID()
    let name: String
    let sub: String
    var value: String = "›"
    var valueColor: Color? = nil
    /// SF Symbol i en farget rute (fargen følger ikontemaet i Innstillinger → Utseende).
    var icon: String? = nil
    /// Forskyver ikonfargen, så grupper etter hverandre får forskjellige farger.
    var colorOffset: Int = 0
    /// Prompt 30: fast farge som på web (hvitt ikon i farget rute). nil = ikontemaet.
    var tint30: Color? = nil
    let act: () -> Void
}

struct PaperLinkList: View {
    @Environment(\.paper) private var p
    @Environment(Store.self) private var store
    let rows: [PaperLinkRow]
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Button(action: r.act) {
                    HStack(spacing: 10) {
                        if let ic = r.icon, let t = r.tint30 {
                            Set30Icon(symbol: ic, tint: t)
                        } else if let ic = r.icon {
                            // Som i designet: farget ikon i en papirfarget rute (fargen følger ikontemaet).
                            Image(systemName: ic).font(.system(size: 15, weight: .semibold)).foregroundStyle(PaperIconTheme.color(store.iconTheme, i + r.colorOffset))
                                .frame(width: 34, height: 34)
                                .background(p.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                            if !r.sub.isEmpty { Text(r.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2) }
                        }
                        Spacer(minLength: 6)
                        Text(r.value).font(PF.ui(13, .semibold)).foregroundStyle(r.valueColor ?? p.mut)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // Prompt 25: «Ta meg dit →» scroller hit og fremhever raden (Settings25.swift).
                .set25Highlight(r.name)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 8)
    }
}

/* ---------- Sporing ---------- */

/// Faner (Aktive, Klar for henting, På vei, Registrert, Levert, Alle) med antall, et felt for sporingsnummer
/// der transportøren gjenkjennes, pakkekort (trykk åpner sporingen hos transportøren) og ⚙ «Varsler og kilder».
struct PaperTracking: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var no = ""
    /// Prompt 26: valgt tjeneste for ny pakke ("" = automatisk).
    @State private var car26: String = ""

    static let tabs = ["Aktive", "Klar for henting", "På vei", "Registrert", "Levert", "Alle", "Arkiv"]

    static func inTab(_ s: Shipment, _ t: String) -> Bool {
        switch t {
        case "Aktive": return s.active
        case "Klar for henting": return !s.archived && s.status == "ready_for_pickup"
        case "På vei": return !s.archived && ["picked_up", "in_transit", "out_for_delivery", "delayed"].contains(s.status)
        case "Registrert": return !s.archived && (s.status == "registered" || s.status == "unknown")
        case "Levert": return s.status == "delivered"
        case "Arkiv": return s.archived
        default: return true
        }
    }

    var body: some View {
        let base = store.tracking?.items ?? store.homePackages ?? []
        // Arkivet hentes for seg (GET /api/tracking?archived=1).
        let extra = TrackSelect.shared.archived.filter { a in !base.contains { $0.id == a.id } }
        let all = base + extra
        let list = all.filter { PaperTracking.inTab($0, store.trkTab) }.sorted { a, b in a.ready != b.ready ? a.ready : a.step > b.step }
        VStack(spacing: 10) {
            if TrackSelect.shared.active { TrackSelectBar(all: list, inArchive: store.trkTab == "Arkiv") }
            // Prompt 26: én pakke valgt → SPOR VIA (Track26.swift).
            if TrackSelect.shared.active && TrackSelect.shared.ids.count == 1, let one = all.first(where: { TrackSelect.shared.ids.contains($0.id) }) {
                TrackSporVia26(s: one)
            }
            // Hold inne fanene, pakkelisten eller Legg til for å endre rekkefølgen (lagres per bruker).
            PaperCardStack(page: "sporing", cards: [
                PaperCardDef(key: "A", label: "Faner", view: AnyView(tabBar(all))),
                PaperCardDef(key: "B", label: "Pakkelisten", view: AnyView(shipments(all, list))),
                PaperCardDef(key: "C", label: "Legg til", view: AnyView(addField)),
            ])
            if store.paperEditPage != "sporing" && !TrackSelect.shared.active {
                Text("Hold inne en pakke for å velge flere · hold inne et kort for å flytte det").font(PF.ui(12)).foregroundStyle(p.mut).frame(maxWidth: .infinity).multilineTextAlignment(.center)
            }
            HStack(spacing: 8) {
                PLineButton(title: store.trkChecking ? "Sjekker …" : "Sjekk nå", height: 44, full: true) { Task { await store.refreshTracking22() } }
                PLineButton(title: "⚙ Kilder", height: 44, full: true) { store.trkSettings = true }
            }
            // Prompt 37: «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen» (TrackKeys37.swift).
            TrackKeys37Line()
            // Pakkevarslene ligger samlet under Innstillinger → Varsler.
            Button { store.paperGo("innst-varsler") } label: {
                Text("Pakkevarsler ligger i Innstillinger → Varsler ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
        }
        .task {
            if store.tracking == nil { try? await store.loadTracking() }
            await TrackSelect.shared.loadArchived(store)
        }
        .onDisappear { TrackSelect.shared.end() }
        .sheet(isPresented: Binding(get: { store.trkSettings }, set: { store.trkSettings = $0 })) {
            PaperTrackSettings()
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .sheetEdge30(p.bg)
        }
    }

    private func shipments(_ all: [Shipment], _ list: [Shipment]) -> some View {
        VStack(spacing: 10) {
            if store.tracking == nil && all.isEmpty { ProgressView().padding(30) }
            if store.tracking != nil && list.isEmpty {
                PCard { Text(store.trkTab == "Aktive" ? "Ingen pakker på vei. Sporingsnumre fra e-post og Finn legges til automatisk." : "Ingen pakker her.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
            }
            ForEach(list, id: \.id) { s in PaperShipmentCard(s: s) }
        }
    }

    private func tabBar(_ all: [Shipment]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(PaperTracking.tabs, id: \.self) { t in
                    let on = store.trkTab == t
                    let n = all.filter { PaperTracking.inTab($0, t) }.count
                    Button { Haptics.shared.select(); store.trkTab = t } label: {
                        HStack(spacing: 5) {
                            Text(t).font(PF.ui(13, .semibold))
                            Text("\(n)").font(PF.mono(11, bold: false)).opacity(0.75)
                        }
                        .foregroundStyle(on ? p.bg : p.mut)
                        .padding(.horizontal, 12).frame(height: 34)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
        }
        .background(p.card, in: Capsule())
    }

    private var addField: some View {
        VStack(alignment: .leading, spacing: 8) {
            addInput
            TrackCarrierChips26(number: no, selected: $car26)
        }
    }

    private var addInput: some View {
        let car = Carrier.detect(no)
        let name = Carrier.known.first { $0.id == car }?.name
        return HStack(spacing: 8) {
            TextField("Sporingsnummer", text: $no)
                .font(PF.mono(15, bold: false)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.characters).autocorrectionDisabled()
                .submitLabel(.done)
                .onSubmit(add)
            if no.count >= 6, let name, car != "other" {
                Text(name).font(PF.ui(11.5, .semibold)).foregroundStyle(p.mut).lineLimit(1)
            }
            Button(action: add) {
                Text("Spor").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 14).frame(height: 34)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(no.trimmingCharacters(in: .whitespaces).count < 6)
        }
        .padding(.leading, 14).padding(.trailing, 5)
        .frame(height: 44)
        .background(p.card, in: Capsule())
    }

    private func add() {
        let n = no.replacingOccurrences(of: " ", with: "").uppercased()
        guard n.count >= 6 else { return }
        let car = Carrier.detect(n)
        store.addTracking(no: n, name: "", carrier: car == "other" ? nil : car, out: false, carrierOverride: car26.isEmpty ? nil : car26)
        no = ""
        car26 = ""
    }
}

/// «Varsler og kilder»: varsler for ny pakke, klar for henting, ute for levering, forsinket og levert,
/// og kildene E-post (Proton), Finn og automatisk arkivering av leverte.
struct PaperTrackSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let t = store.tracking ?? TrackingData()
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Kilder").font(PF.serif(24, medium: true)).foregroundStyle(p.ink).padding(.bottom, 4)
                Button {
                    store.trkSettings = false
                    store.paperGo("innst-varsler")
                } label: {
                    Text("Pakkevarslene ligger i Innstillinger → Varsler ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                }
                .buttonStyle(.plain)
                PLabel(text: "Kilder").padding(.top, 8)
                group([
                    row("E-post (Proton)", "Sporingsnumre i ordre- og fraktbekreftelser", t.email.on) { store.setTrackingSource("email", $0) },
                    row("Finn", "Pakker fra Finn-handler (Fiks ferdig)", t.finn.on) { store.setTrackingSource("finn", $0) },
                    row("Arkiver leverte automatisk", "Leverte pakker flyttes til Levert etter to dager", t.autoArchive.on) { store.setTrackingSource("autoArchive", $0) },
                ])
            }
            .padding(20)
        }
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private struct Row: Identifiable {
        let id = UUID()
        let n: String
        let s: String
        let on: Bool
        let set: (Bool) -> Void
    }

    private func row(_ n: String, _ s: String, _ on: Bool, _ set: @escaping (Bool) -> Void) -> Row { Row(n: n, s: s, on: on, set: set) }

    private func group(_ rows: [Row]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Toggle(isOn: Binding(get: { r.on }, set: { v in Haptics.shared.select(); r.set(v) })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.n).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                        Text(r.s).font(PF.ui(12.5)).foregroundStyle(p.mut)
                    }
                }
                .tint(p.pos)
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// En pakke: logo (initialer på merkefarge), navn, status, ETA og fem steg. Trykk åpner sporingen hos transportøren.
struct PaperShipmentCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let s: Shipment
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                PaperCarrierBadge(s: s, size: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.displayTitle).font(PF.serif(18, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text("\(s.carrierLine26) · \(s.trackingNo)").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 0)
                Button { withAnimation(.easeOut(duration: 0.2)) { open.toggle() } } label: {
                    Text(open ? "▴" : "▾").font(PF.ui(14, .bold)).foregroundStyle(p.mut).frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(open ? "Skjul hendelser" : "Vis hendelser")
            }
            // Prompt 22: siste hendelse, feiltekst og tidslinje med faktisk status (Track22.swift).
            PaperShipmentStatus22(s: s)
            if open { timeline }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(borderColor, lineWidth: picked ? 2.5 : 1.5))
        .overlay(alignment: .topTrailing) {
            if TrackSelect.shared.active {
                Image(systemName: picked ? "checkmark.circle.fill" : "circle").font(.system(size: 22)).foregroundStyle(picked ? p.lab : p.mut).padding(10)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if TrackSelect.shared.active { TrackSelect.shared.toggle(s.id); return }
            if !s.url.isEmpty { store.openLink(s.url) } else { withAnimation(.easeOut(duration: 0.2)) { open.toggle() } }
        }
        .onLongPressGesture(minimumDuration: 0.5) {
            if TrackSelect.shared.active { TrackSelect.shared.toggle(s.id) } else { TrackSelect.shared.start(s.id) }
        }
    }

    private var picked: Bool { TrackSelect.shared.ids.contains(s.id) }

    private var borderColor: Color {
        if picked { return p.lab }
        return s.status == "ready_for_pickup" ? p.lab : Color.clear
    }

    private func small(_ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(12, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 30)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func barColor(_ j: Int) -> Color {
        if s.status == "delivered" { return p.pos }
        if j < s.step { return p.ink }
        if j == s.step { return p.lab }
        return p.line
    }

    @ViewBuilder private var timeline: some View {
        VStack(alignment: .leading, spacing: 6) {
            if s.events.isEmpty { Text("Ingen hendelser ennå.").font(PF.ui(12.5)).foregroundStyle(p.mut) }
            ForEach(Array(s.events.prefix(8).enumerated()), id: \.offset) { _, e in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(JS.fmt(e.at, "dd.MM HH:mm")).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).frame(width: 82, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(e.status.isEmpty ? e.raw : e.status).font(PF.ui(13)).foregroundStyle(p.ink)
                        if !e.location.isEmpty { Text(e.location).font(PF.ui(11.5)).foregroundStyle(p.mut) }
                    }
                }
            }
            if !s.url.isEmpty {
                Button { store.openLink(s.url) } label: { Text("Åpne hos \(s.carrierName) ↗").font(PF.ui(13, .semibold)).foregroundStyle(p.lab) }.buttonStyle(.plain)
            }
            // Hold inne brukes til å flytte kortene, så handlingene ligger her i stedet for i en hurtigmeny.
            HStack(spacing: 8) {
                small("Kopier nr.") { UIPasteboard.general.string = s.trackingNo; store.flash("Sporingsnummeret er kopiert") }
                small(s.archived ? "Hent tilbake" : "Arkiver") { store.archiveTracking(s, !s.archived) }
                small("Slett") { store.deleteTracking(s) }
            }
            .padding(.top, 4)
        }
        .padding(.top, 4)
    }
}

/* ---------- Mer ---------- */

struct PaperMore: View {
    @Environment(Store.self) private var store
    var body: some View {
        // Den modulen som ikke står i fanelinjen (Domener eller Sporing), ligger her.
        let fourth = store.paperTab4
        var rows: [PaperLinkRow] = []
        let inBar = Set(store.mainTabs(floating: store.fabMode == "float", onHome: true).map(\.0))
        if fourth != "domener" || !inBar.contains("domener") { rows.append(PaperLinkRow(name: "Domener", sub: "Trafikk, besøk og oppetid", icon: "globe") { store.paperOpenDomains(from: "mer") }) }
        if fourth != "sporing" || !inBar.contains("sporing") { rows.append(PaperLinkRow(name: "Sporing", sub: store.paperOnWay > 0 ? "\(store.paperOnWay) på vei" : "Pakker, varsler og kilder", icon: "shippingbox") { store.paperGo("sporing") }) }
        rows.append(PaperLinkRow(name: "Gjøremål", sub: TasksModel.shared.openCount > 0 ? "\(TasksModel.shared.openCount) åpne oppgaver" : "Oppgaver og widgets", icon: "checklist") { store.paperGo("huske") })
        rows.append(PaperLinkRow(name: "Familie og kart", sub: "Posisjon, soner og helse", icon: "person.2") { store.paperGo("familie") })
        rows.append(PaperLinkRow(name: "Avganger", sub: "Ruter i sanntid", icon: "tram") { store.paperGo("avg") })
        rows.append(PaperLinkRow(name: "Aksjer", sub: "Trading 212", icon: "chart.line.uptrend.xyaxis") { store.paperFinGo("aksjer") })
        rows.append(PaperLinkRow(name: "Abonnementer", sub: "Subscription OS", icon: "repeat") { store.paperGo("abo") })
        rows.append(PaperLinkRow(name: "Boliger", sub: "Utgifter, prosjekter og regninger", icon: "building.2") { store.paperFinGo("boliger") })
        rows.append(PaperLinkRow(name: "Finn", sub: "Kjøp og salg", icon: "arrow.left.arrow.right") { store.paperGo("finn") })
        rows.append(PaperLinkRow(name: "Værmelding", sub: "Timer, 7 dager og egne steder", icon: "cloud.sun") { store.openWeather() })
        rows.append(PaperLinkRow(name: "Nyhetsleser", sub: "RSS med ✦ AI-sammendrag", icon: "newspaper") { store.openNews() })
        rows.append(PaperLinkRow(name: "Innstillinger", sub: "Profil, tema, fanelinje og konto", icon: "gearshape") { store.paperGo("innst") })
        return PaperLinkList(rows: rows).padding(.top, -8)
    }
}

/* ---------- Innstillinger ---------- */

struct PaperSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            profileCard
            group("Utseende", [
                PaperLinkRow(name: "Tema og bakgrunn", sub: themeSub, icon: "paintpalette") { store.paperGo("innst-ut") },
                PaperLinkRow(name: "Fanelinje", sub: "Fjern faner, endre navn og bytt ikon · eller hold inne på linja", icon: "dock.rectangle") { store.tabBarEditing = true },
                PaperLinkRow(name: "Skanneknapp", sub: store.fabMode == "float" ? "Flyter over linjen, søk ligger i linjen" : "Ligger i linjen som +",
                             value: store.fabMode == "float" ? "Flytende ›" : "I linjen ›", icon: "doc.viewfinder") { store.setFabMode(store.fabMode == "float" ? "inline" : "float") },
                PaperLinkRow(name: "Fjerde fane", sub: fourthSub, value: fourthName + " ›", icon: "square.grid.2x2") { cycleFourth() },
            ])
            finNavGroup
            group("Moduler", [
                PaperLinkRow(name: "Familie og helse", sub: "Deling av posisjon, personvern og Apple Helse", icon: "person.2") { store.paperGo("innst-fam") },
                PaperLinkRow(name: "Nyhetsleser", sub: "Kilder, kategorier og AI", value: "Åpne ›", icon: "newspaper") { store.openNews() },
                PaperLinkRow(name: "Værsteder", sub: "Legg til, fjern og søk etter steder", value: "Åpne ›", icon: "cloud.sun") { store.openWeather() },
                PaperLinkRow(name: "Avganger", sub: "Stopp fra Ruter og Entur", value: "Åpne ›", icon: "tram") { store.paperGo("avg") },
                PaperLinkRow(name: "Aksjer · Trading 212", sub: "Nøkkel, miljø og synk", icon: "chart.line.uptrend.xyaxis") { store.paperOpen(.settings); store.settingsPage = "stocks" },
            ])
            group("Sikkerhet", [
                PaperLinkRow(name: "Lås appen", sub: "Face ID / kode", value: store.lockEnabled ? "På" : "Av", valueColor: store.lockEnabled ? p.pos : p.mut, icon: "faceid") { store.lockEnabled.toggle() },
                PaperLinkRow(name: "Avanserte innstillinger", sub: "Sikkerhet, varsler, skanning, haptikk, widgets og server", icon: "gearshape.2") { store.paperOpen(.settings) },
                PaperLinkRow(name: "Logg ut", sub: "Du må logge inn igjen med 2FA", value: "Logg ut", valueColor: p.lab, icon: "rectangle.portrait.and.arrow.right") { store.logout() },
            ])
        }
    }

    private var themeSub: String {
        let m = store.paperMode == "lys" ? "Papir lys" : store.paperMode == "mork" ? "Papir mørk" : "Følger systemet"
        let t = PaperIconTheme.themes.first { $0.0 == store.iconTheme }?.1 ?? "Standard"
        return "\(m) · \(photoName) · ikoner: \(t)"
    }

    private var profileCard: some View {
        Button { store.paperGo("profil") } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(p.popSel)
                    if let a = store.avatar {
                        Image(uiImage: a).resizable().scaledToFill().clipShape(Circle())
                    } else {
                        Text(String(store.displayName.prefix(1)).uppercased()).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    }
                }
                .frame(width: 54, height: 54)
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.displayName.isEmpty ? "Konto" : store.displayName).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text(accountSub).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer()
                Text("Profil ›").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.top, 8)
    }

    private var fourthName: String {
        switch store.fourthTab {
        case "domener": return "Domener"
        case "sporing": return "Sporing"
        default: return "Automatisk"
        }
    }

    private var fourthSub: String {
        switch store.fourthTab {
        case "domener": return "Alltid Domener"
        case "sporing": return "Alltid Sporing"
        default: return "Domener, eller Sporing når pakker er på vei (nå: " + (store.paperTab4 == "sporing" ? "Sporing, \(store.paperOnWay) på vei" : "Domener") + ")"
        }
    }

    private func cycleFourth() {
        let order = ["auto", "domener", "sporing"]
        let i = order.firstIndex(of: store.fourthTab) ?? 0
        store.setFourthTab(order[(i + 1) % order.count])
    }

    /// «Finans · fanelinje og Mer»: opptil 4 faner. Trykk for å legge til eller flytte til venstre.
    private var finNavGroup: some View {
        let nav = store.finNav
        var rows: [PaperLinkRow] = Store.finNavAll.map { f in
            let i = nav.firstIndex(of: f.id)
            let sub = i.map { "I fanelinjen, plass \($0 + 1)" + ($0 > 0 ? " · trykk for å flytte til venstre" : "") } ?? "Ligger i Mer"
            let value = i.map { $0 > 0 ? "◂ Fane \($0 + 1)" : "Fane 1" } ?? "+ Legg til"
            return PaperLinkRow(name: f.name, sub: sub, value: value, valueColor: i == nil ? p.lab : p.pos) { toggleFin(f.id) }
        }
        let last = nav.last.flatMap { id in Store.finNavAll.first { $0.id == id }?.name } ?? "–"
        rows.append(PaperLinkRow(name: "Fjern fra fanelinjen", sub: "Flytter siste fane til Mer", value: nav.count > 1 ? "Fjern \(last)" : "–", valueColor: p.lab) {
            if nav.count > 1 { store.setFinNav(Array(nav.dropLast())) }
        })
        rows.append(PaperLinkRow(name: "Tilbakestill", sub: "Oversikt, Liste, Finn, Søk", value: "Nullstill") { store.setFinNav(["oversikt", "liste", "finn", "sok"]) })
        return group("Finans · fanelinje og Mer", rows)
    }

    private func toggleFin(_ id: String) {
        var nav = store.finNav
        if let i = nav.firstIndex(of: id) {
            guard i > 0 else { return }
            nav.swapAt(i - 1, i)
            store.setFinNav(nav)
        } else {
            guard nav.count < 4 else { store.flash("Maks 4 faner. Fjern en først."); return }
            nav.append(id)
            store.setFinNav(nav)
        }
    }

    private var photoName: String {
        switch store.photo {
        case "cur": "Nåværende"
        case "weather": "Vær nå"
        case "planets": "Planeter"
        case "custom": "Eget bilde"
        case "gphoto": "Google Photos" // prompt 46
        default: "Oslo"
        }
    }

    private var accountSub: String {
        let u = store.account?.username ?? ""
        let r = (store.me?.role ?? store.account?.role ?? "") == "admin" ? "Admin" : "Bruker"
        return u.isEmpty ? r : "@\(u) · \(r)"
    }

    private func group(_ t: String, _ rows: [PaperLinkRow]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: t).padding(.top, 10).padding(.leading, 4)
            PaperLinkList(rows: rows)
        }
    }
}


/// Butikklogo i Papir: favicon via serveren (/finans/api/logo, åpen og bufret) på hvit flate, ellers forbokstav på kategorifargen.
/// Har abonnementet en egen logo (logoUrl, opplastet eller funnet med AI), brukes den først.
struct PaperLogo: View {
    @Environment(Store.self) private var store
    let domain: String?
    let name: String
    let color: String
    var size: CGFloat = 38
    var radius: CGFloat = 11
    var logoUrl: String? = nil
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            if let img {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color.white)
                Image(uiImage: img).resizable().scaledToFit().padding(size / 8)
            } else {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color(hex: color))
                Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                    .font(PF.ui(size > 42 ? 14 : 11, .heavy)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .task(id: (logoUrl ?? "") + "|" + (domain ?? "")) { await load() }
    }

    private func load() async {
        if let u = logoUrl, !u.isEmpty, let i = await store.image(u) { img = i; return }
        // Uten domene: slå opp butikknavnet i logobiblioteket (prompt 20).
        var d: String? = domain
        if d == nil || d?.isEmpty == true { d = await LogoRegistry20.shared.domain(forName: name, api: store.api) }
        img = await store.logo(d)
    }
}
