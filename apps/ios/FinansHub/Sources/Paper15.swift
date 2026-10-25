import SwiftUI
import UIKit

/* ---------------- Papir, prompt 15: tilpassede sider, Finans-fanelinje, fjerde fane, flytende skann og bred skjerm ---------------- */

/// Rekkefølge og skjulte kort på én side (layout.pages[side]).
struct PaperPageLayout: Codable, Equatable {
    var order: [String] = []
    var hidden: [String] = []

    static func loadLocal() -> [String: PaperPageLayout] {
        guard let d = UserDefaults.standard.data(forKey: "fh_paper_pages"),
              let v = try? JSONDecoder().decode([String: PaperPageLayout].self, from: d) else { return [:] }
        return v
    }

    static func saveLocal(_ v: [String: PaperPageLayout]) {
        if let d = try? JSONEncoder().encode(v) { UserDefaults.standard.set(d, forKey: "fh_paper_pages") }
    }
}

/// Bred skjerm (iPad, liggende): fanelinjen blir en loddrett skinne til venstre.
private struct PaperWideKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var paperWide: Bool {
        get { self[PaperWideKey.self] }
        set { self[PaperWideKey.self] = newValue }
    }
}

/// Et Finans-valg i fanelinjen: id på serveren, navn, ikon og Papir-siden.
struct FinNavItem: Identifiable, Hashable {
    let id: String
    let name: String
    let icon: String
    let page: String
}

extension Store {
    /* ---------- Oppsett fra serveren ---------- */

    /// pages, finTabs, fourthTab og fab fra /api/me/layout.
    func applyPaper15(_ o: [String: Any]) {
        if let pages = o["pages"] as? [String: Any] {
            var out: [String: PaperPageLayout] = [:]
            for (k, v) in pages {
                guard let d = v as? [String: Any] else { continue }
                let order = (d["order"] as? [Any])?.compactMap { $0 as? String } ?? []
                let hidden = (d["hidden"] as? [Any])?.compactMap { $0 as? String } ?? []
                out[k] = PaperPageLayout(order: order, hidden: hidden)
            }
            if !out.isEmpty && out != paperPages { paperPages = out }
        }
        let tabs = JS.strings(o, "finTabs").filter { Store.finNavAll.map(\.id).contains($0) }
        if !tabs.isEmpty && tabs != finNav { finNav = Array(tabs.prefix(5)) }
        if let v = JS.str(o, "fourthTab"), ["auto", "domener", "sporing"].contains(v), v != fourthTab { fourthTab = v }
        if let v = JS.str(o, "fab"), ["float", "inline"].contains(v), v != fabMode { fabMode = v }
        migrateHome24()
        // Prompt 37: valgene på Pakker-kortet (papir_wopt).
        Wopt37.shared.apply(o)
        FinNav26.shared.apply(o, self)
        // Prompt 32: fanelinjene på Domener, Abonnement og Familie (secNav) og Glimt-grensen (hs_timeout_s).
        Nav32b.shared.take(o)
        Search32b.shared.take(o)
        // Prompt 45: Mer – tittel og de fire store boksene (layout.mer45), og Finans → Mer (layout.fmer45).
        Mer45.shared.take(o)
        Fin45More.shared.take(o)
    }

    /* ---------- Tilpass hver side ---------- */

    /// Synlige kort i lagret rekkefølge (nye kort legges bakerst) og de skjulte.
    func pageCards(_ page: String, _ keys: [String]) -> (visible: [String], hidden: [String]) {
        let l = paperPages[page] ?? PaperPageLayout()
        var order = l.order.filter { keys.contains($0) }
        for k in keys where !order.contains(k) {
            // Prompt 32: Prøveperioder (h11) kommer rett under Avganger også med lagret oppsett.
            if k == "h11", let i = order.firstIndex(of: "h3") { order.insert(k, at: i + 1) }
            // Prompt 34: Glimt-brief (h12) står øverst også med lagret oppsett.
            else if k == "h12" { order.insert(k, at: 0) }
            // Prompt 37: Dagens bibelvers (h13) rett under Glimt-brief.
            else if k == "h13", let i = order.firstIndex(of: "h12") { order.insert(k, at: i + 1) }
            // Prompt 46: Snarveier (h16) var en del av Søk (h1) – står rett etter Søk også med lagret oppsett.
            else if k == "h16", let i = order.firstIndex(of: "h1") { order.insert(k, at: i + 1) }
            // Prompt 52: flisene som egne kort (Home52Grid.swift) får plassen der h16 (flisene samlet) sto.
            else if page == "hjem", let i = Home52.slot(k, l.order, order) { order.insert(k, at: i) }
            else { order.append(k) }
        }
        var hid = l.hidden.filter { keys.contains($0) }
        // Prompt 52: var den samlede flisen (h16) skjult, er de fem flisene skjult også.
        if page == "hjem" { hid = Home52.hiddenFromSlot(hid, l, keys) }
        return (order.filter { !hid.contains($0) }, hid)
    }

    func enterPaperEdit(_ page: String) {
        guard paperEditPage != page else { return }
        // Prompt 43: middels haptikk og logg (WiggleList43.swift).
        Wiggle43.enterHaptic()
        Wiggle43.log.debug("edit.enter \(page, privacy: .public)")
        // Prompt 21: klikket som kommer når fingeren slippes etter det lange trykket, skal ikke åpne siden.
        paperEditAt = Date()
        withAnimation(.easeOut(duration: 0.2)) { paperEditPage = page }
    }

    func exitPaperEdit() {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { paperEditPage = nil }
    }

    /// Flytter et kort opp (-1) eller ned (+1) blant de synlige.
    func movePaperCard(_ page: String, _ key: String, _ dir: Int, _ keys: [String]) {
        let cur = pageCards(page, keys)
        var vis = cur.visible
        guard let i = vis.firstIndex(of: key) else { return }
        let j = i + dir
        guard j >= 0, j < vis.count else { return }
        vis.swapAt(i, j)
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            paperPages[page] = PaperPageLayout(order: vis + cur.hidden, hidden: cur.hidden)
        }
        savePaperPage(page)
    }

    func setPaperCardHidden(_ page: String, _ key: String, _ hide: Bool, _ keys: [String]) {
        let cur = pageCards(page, keys)
        var hid = cur.hidden.filter { $0 != key }
        var vis = cur.visible.filter { $0 != key }
        if hide { hid.append(key) } else { vis.append(key) }
        Haptics.shared.tick()
        withAnimation(.easeOut(duration: 0.2)) {
            paperPages[page] = PaperPageLayout(order: vis + hid, hidden: hid)
        }
        savePaperPage(page)
    }

    /// Serveren fletter sidene, så bare den endrede sendes.
    private func savePaperPage(_ page: String) {
        guard let l = paperPages[page] else { return }
        savePaperLayout(["pages": [page: ["order": l.order, "hidden": l.hidden]]])
    }

    /* ---------- Finans-fanelinjen ---------- */

    nonisolated static let finNavAll: [FinNavItem] = [
        FinNavItem(id: "oversikt", name: "Oversikt", icon: "◎", page: "finans"),
        FinNavItem(id: "liste", name: "Liste", icon: "≡", page: "fliste"),
        FinNavItem(id: "finn", name: "Finn", icon: "⇄", page: "finn"),
        FinNavItem(id: "sok", name: "Søk", icon: "⌕", page: "fsok"),
        FinNavItem(id: "budsjett", name: "Budsjett", icon: "◔", page: "budsjett"),
        FinNavItem(id: "kvitteringer", name: "Kvitteringer", icon: "⎙", page: "kvitt"),
        FinNavItem(id: "aksjer", name: "Aksjer", icon: "↗", page: "aksjer"),
        FinNavItem(id: "abonnementer", name: "Abonnementer", icon: "↻", page: "abo"),
        FinNavItem(id: "kontoer", name: "Kontoer", icon: "▤", page: "kontoer"),
        FinNavItem(id: "boliger", name: "Boliger", icon: "⌂", page: "boliger"),
        // Prompt 27: Chat kan også velges i Finans-fanelinjen.
        FinNavItem(id: "chat", name: "Chat", icon: "✦", page: "chat"),
    ]

    var finNavItems: [FinNavItem] {
        let list = finNav.compactMap { id in Store.finNavAll.first { $0.id == id } }
        let base: [FinNavItem] = list.isEmpty ? Array(Store.finNavAll.prefix(4)) : list
        // Prompt 26: egne navn og ikoner fra «Rediger fanelinjen» (FinNav26.swift).
        let lb: FinNav26 = FinNav26.shared
        return base.map { (f: FinNavItem) -> FinNavItem in
            FinNavItem(id: f.id, name: lb.label(f.id) ?? f.name, icon: lb.icon(f.id) ?? f.icon, page: f.page)
        }
    }

    func setFinNav(_ v: [String]) {
        // Prompt 24: Finans + Boliger har fem faner (Boliger · Søk · Liste · Oversikt · Kvitteringer).
        finNav = Array(v.prefix(5))
        // Prompt 26: finNav ([{key, label?, icon?}]) med finTabs som reserve for eldre server (FinNav26.swift).
        FinNav26.shared.push(self)
        Haptics.shared.select()
    }

    func setFourthTab(_ v: String) {
        fourthTab = v
        savePaperLayout(["fourthTab": v])
        Haptics.shared.select()
    }

    func setFabMode(_ v: String) {
        fabMode = v
        savePaperLayout(["fab": v])
        Haptics.shared.select()
    }

    /// Pakker på vei: hentet, i transport, ute for levering eller klar for henting.
    var paperOnWay: Int {
        let list = tracking?.items ?? homePackages ?? []
        return list.filter { !$0.archived && ["picked_up", "in_transit", "out_for_delivery", "ready_for_pickup"].contains($0.status) }.count
    }

    /// Fjerde fane i fanelinjen: Domener, eller Sporing når pakker er på vei (Automatisk).
    var paperTab4: String {
        if fourthTab == "sporing" { return "sporing" }
        if fourthTab == "domener" { return "domener" }
        return paperOnWay > 0 ? "sporing" : "domener"
    }

    /// Papir-siden for en Finans-fane: Papir-sider vises direkte, de andre er sider fra den klassiske appen.
    func paperFinGo(_ page: String) {
        if paperTapBlocked { return }
        switch page {
        case "budsjett": paperGo("finans"); paperOpenFin(.budget)
        case "kvitt": paperGo("finans"); paperOpen(.upload)
        case "aksjer": paperGo("aksjer")
        case "kontoer": paperGo("finans"); paperOpen(.accounts)
        case "boliger": folder = nil; paperGo("boliger")
        default: paperGo(page)
        }
    }

    /// Hvilken Finans-fane som er markert akkurat nå (Papir-side eller side fra den klassiske appen).
    var paperFinCurrent: String {
        if paperTab == "ftx" { return "fliste" }
        if let f = paperFin {
            switch f {
            case .list: return "fliste"
            case .finn: return "finn"
            case .budget: return "budsjett"
            case .search: return "fsok"
            default: return "finans"
            }
        }
        if let m = paperClassic {
            switch m {
            case .upload: return "kvitt"
            case .stocks: return "aksjer"
            case .accounts: return "kontoer"
            case .folders: return "boliger"
            case .sub: return "abo"
            default: return "fmer"
            }
        }
        return paperTab
    }

    /* ---------- Data til Finans → Oversikt ---------- */

    /// Antall kvitteringer til gjennomgang og de 15 siste transaksjonene.
    func loadPaperFinance15() async {
        if let d = try? await api.call("GET", "/receipts?status=needs_review&count=1") {
            let o = JS.obj(d)
            if let n = JS.int(o, "count") { reviewCount = n }
        }
        if let p = try? await api.get("/transactions?limit=15", as: TxPage.self) { recent15 = Array(p.items.prefix(15)) }
    }

    /// Transaksjonen med kvittering og bankrad (Detaljer).
    func openPaperTx(_ id: Int) {
        if paperTapBlocked { return }
        paperTxId = id
        txDetail = nil
        paperGo("ftx")
        Task {
            if let d = try? await self.api.call("GET", "/transactions/\(id)") { self.txDetail = PaperTxData(JS.obj(d)) }
            else { self.txDetail = PaperTxData([:], failed: true) }
        }
    }
}

/* ---------- Kort som kan flyttes og skjules ---------- */

struct PaperCardDef: Identifiable {
    let key: String
    let label: String
    let view: AnyView
    var id: String { key }
}

/// Kortene på en side i brukerens rekkefølge. Hold inne et kort (0,5 s) for å flytte eller skjule (−) det.
/// Prompt 43: redigeringen går gjennom den felles WiggleReorderList (WiggleList43.swift) – samme oppførsel som Subscription OS.
struct PaperCardStack: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    let page: String
    let cards: [PaperCardDef]
    /// På bred skjerm: to kolonner, unntatt disse kortene, som går over hele bredden.
    var fullWidth: Set<String> = []
    var twoColumns = false
    /// Prompt 52: halve kort på mobil (2-kolonners Hjem, 3a) og høye halve kort (Avgang-flisen), Home52Grid.swift.
    var half: Set<String> = []
    var tall: Set<String> = []

    private struct Segment: Identifiable {
        let id: Int
        let keys: [String]
        let full: Bool
    }

    var body: some View {
        let keys = cards.map(\.key)
        let cur = store.pageCards(page, keys)
        let editing = store.paperEditPage == page
        // Prompt 37: Pakker som skjules uten pakker (Pkg37.swift).
        let shown: [String] = Pkg37.visible(page, cur.visible, editing, store)
        // Sporing: kortene kan ikke skjules (ingen minus).
        let hideFn: ((String) -> Void)? = page == "sporing" ? nil : { (k: String) in store.setPaperCardHidden(page, k, true, keys) }
        VStack(spacing: 10) {
            // Prompt 30: plassen til pillene ＋ / ✓ er 64 pt padding-top i PaperPage (Wiggle30.topPad).
            if wide && twoColumns && !editing {
                ForEach(segments(shown)) { seg in
                    if seg.full {
                        ForEach(seg.keys, id: \.self) { k in held(k, shown, keys) }
                    } else {
                        // To og to kort ved siden av hverandre, like høye (f.eks. Pakker og Avganger på Fold/iPad).
                        ForEach(pairs(seg.keys), id: \.self) { pair in
                            HStack(alignment: .top, spacing: 12) {
                                ForEach(pair, id: \.self) { k in
                                    held(k, shown, keys).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                                }
                                if pair.count == 1 { Color.clear.frame(maxWidth: .infinity) }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            } else {
                WiggleReorderList(
                    keys: shown,
                    editing: editing,
                    paused: Edit28.shared.anySheet39,
                    label: { (k: String) in cardLabel(k) },
                    hide: hideFn,
                    // Prompt 52: holdet på saldokortet åpner utseende-arket, ikke wiggle (Saldo52.swift).
                    enter: { if !(page == "finans" && Sal52.shared.blocksWiggle) { store.enterPaperEdit(page) } },
                    commit: { (o: [String]) in store.commitPaperOrder37(page, o, keys) },
                    content: { (k: String) in cardView(k, shown, keys) },
                    accessory: { (k: String) in
                        PaperEditAccessory43(page: page, key: k, index: shown.firstIndex(of: k) ?? 0, count: shown.count, keys: keys)
                    }
                )
                .halves52(wide ? [] : half, tall: wide ? [] : tall)
            }
        }
        .animation(.easeOut(duration: 0.3), value: Pkg37.animKey(page, editing, store))
        .onAppear { Edit28.shared.labels[page] = cards.map { ($0.key, $0.label) } }
    }

    private func cardLabel(_ k: String) -> String { cards.first { $0.key == k }?.label ?? k }

    /// Bred skjerm utenfor redigering: hold inne et kort for å starte redigering.
    private func held(_ k: String, _ vis: [String], _ keys: [String]) -> some View {
        cardView(k, vis, keys).wiggle43Hold(editing: false) { if !(page == "finans" && Sal52.shared.blocksWiggle) { store.enterPaperEdit(page) } }
    }

    private func pairs(_ keys: [String]) -> [[String]] {
        stride(from: 0, to: keys.count, by: 2).map { i in Array(keys[i..<Swift.min(i + 2, keys.count)]) }
    }

    /// Kort på rad som ikke går over hele bredden, samles i ett rutenett.
    private func segments(_ vis: [String]) -> [Segment] {
        var out: [Segment] = []
        var run: [String] = []
        for k in vis {
            if fullWidth.contains(k) {
                if !run.isEmpty { out.append(Segment(id: out.count, keys: run, full: false)); run = [] }
                out.append(Segment(id: out.count, keys: [k], full: true))
            } else {
                run.append(k)
            }
        }
        if !run.isEmpty { out.append(Segment(id: out.count, keys: run, full: false)) }
        return out
    }

    @ViewBuilder private func cardView(_ k: String, _ vis: [String], _ keys: [String]) -> some View {
        if let c = cards.first(where: { $0.key == k }) {
            PaperEditableCard(page: page, key: k) { c.view }
        }
    }
}

/// Linjen øverst i redigeringsmodus: «Ferdig» og skjulte kort som kan hentes tilbake.
struct PaperEditBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let page: String
    let hidden: [String]
    let cards: [PaperCardDef]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text("Dra for å flytte · ▲ ▼ · skjul med −").font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Button { store.exitPaperEdit() } label: {
                    Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.ink).padding(.horizontal, 16).frame(height: 34)
                        .background(p.bg, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            if !hidden.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        Text("Skjult:").font(PF.ui(12.5)).foregroundStyle(p.bg.opacity(0.75))
                        ForEach(hidden, id: \.self) { k in
                            Button { store.setPaperCardHidden(page, k, false, cards.map(\.key)) } label: {
                                Text("+ " + label(k)).font(PF.ui(12.5, .semibold)).foregroundStyle(p.bg).padding(.horizontal, 12).frame(height: 30)
                                    .overlay(Capsule().stroke(p.bg.opacity(0.5), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .padding(.leading, 16).padding(.trailing, 10).padding(.vertical, 10)
        .background(p.ink, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.3), radius: 12, y: 8)
    }

    private func label(_ k: String) -> String { cards.first { $0.key == k }?.label ?? k }
}

/// Ett kort: innholdet er av i redigeringsmodus, og Pakker uten pakker vises dempet.
/// Prompt 43: vugging, hold, minus og flytting ligger i WiggleReorderList (WiggleList43.swift), ikke per kort.
struct PaperEditableCard<C: View>: View {
    @Environment(Store.self) private var store
    let page: String
    let key: String
    @ViewBuilder let content: () -> C

    var body: some View {
        let editing = store.paperEditPage == page
        let dim: Bool = editing && Pkg37.dimmed(page, key, store)
        content()
            .disabled(editing)
            // Prompt 37: Pakker med «vis bare når det er pakker» og 0 pakker vises dempet i redigeringsmodus.
            .grayscale(dim ? 0.6 : 0)
            .opacity(dim ? 0.65 : 1)
    }
}

/// Tilbehøret over et kort i redigeringsmodus (over dra-laget, så knappene kan trykkes):
/// «✎ Rediger widget», «Skjult når ingen pakker» og ▲ ▼ på Sporing.
struct PaperEditAccessory43: View {
    @Environment(Store.self) private var store
    let page: String
    let key: String
    let index: Int
    let count: Int
    let keys: [String]

    var body: some View {
        // Prompt 39: mens et redigeringsark er åpent skjules «Rediger widget».
        let sheet39: Bool = Edit28.shared.anySheet39
        let dim: Bool = Pkg37.dimmed(page, key, store)
        GeometryReader { (g: GeometryProxy) in
            // Prompt 41: kort uten innhold (f.eks. sveipet bort) har høyde 0 – da vises ingen merker midt på siden.
            if g.size.height >= 4 {
                ZStack {
                    // Prompt 41: én pille midt på kortet; «Skjult når ingen pakker» nederst til høyre.
                    if !sheet39 && Edit28.settingsCards.contains(key) && page == "hjem" {
                        Edit28WidgetPill { Edit28.shared.editWidget(key, store) }
                    }
                    if !sheet39 && dim && page == "hjem" {
                        Pkg37HiddenBadge().scaleEffect(0.9).padding(.trailing, 8).padding(.bottom, 6)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    }
                    // Sporing: ▲ ▼ i Papir-stil i tillegg til dra (kortene der kan ikke skjules).
                    if page == "sporing" {
                        controls.offset(x: 4, y: -8)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    }
                }
                .frame(width: g.size.width, height: g.size.height)
            }
        }
    }

    private var controls: some View {
        HStack(spacing: 4) {
            if index > 0 { Edit28Arrow(up: true) { store.movePaperCard(page, key, -1, keys) } }
            if index < count - 1 { Edit28Arrow(up: false) { store.movePaperCard(page, key, 1, keys) } }
        }
    }
}

/* ---------- Den flytende skanneknappen ---------- */

/// 60 pt, radius 22, aksentfarge. Trykk = valg (eller «Ny sending» på Sporing), hold inne = last opp.
struct PaperFab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let tap: () -> Void
    let hold: () -> Void
    @State private var pressed = false

    var body: some View {
        let track = store.paperTab == "sporing" && store.paperClassic == nil
        // Prompt 22: på Huskeliste viser FAB-en + og legger til oppgaven i feltet over fanelinjen.
        let huske: Bool = store.paperTab == "huske" && store.paperClassic == nil
        Image(systemName: track || huske ? "plus" : "viewfinder")
            .font(.system(size: 25, weight: .semibold))
            .foregroundStyle(p.onLab)
            .frame(width: 60, height: 60)
            .background(p.lab, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.45), radius: 14, y: 10)
            .shadow(color: .black.opacity(0.2), radius: 3, y: 2)
            .scaleEffect(pressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.15), value: pressed)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .onTapGesture { tap() }
            .onLongPressGesture(minimumDuration: 0.45, perform: { hold() }, onPressingChanged: { pressed = $0 })
            .accessibilityLabel(huske ? "Legg til oppgave" : track ? "Ny sending" : "Skann")
            .accessibilityHint(track ? "Legg til et sporingsnummer" : "Trykk for valg, hold inne for å laste opp")
            .accessibilityAddTraits(.isButton)
    }
}

/* ---------- Navigasjonsskinnen på bred skjerm ---------- */

/// Loddrett skinne til venstre (84 pt, avrundet, halvgjennomsiktig): ikon over etikett, aktiv fane lys, + nederst.
struct PaperRail: View {
    @Environment(\.paper) private var p
    let tabs: [(String, String, String)]
    let current: String
    let showPlus: Bool
    let tapTab: (String, Bool) -> Void
    let plusTap: () -> Void
    let plusHold: () -> Void
    /// Prompt 25: fanelinje-stil, og den røde Hjem-knappen øverst når du ikke er på Hjem (NavStyle25.swift).
    var style: String = "text"
    var showHome: Bool = false
    var goHome: () -> Void = {}
    /// Prompt 45: siden som redigeres (wiggle) – da står + / ↺ / ✓ nederst i stedet for skann-knappen.
    var editPage: String? = nil
    var scanLabel: String = "Skann"
    @Environment(\.accessibilityReduceMotion) private var reduce45

    var body: some View {
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 28, style: .continuous)
        // Prompt 45: Hjem-knappen i fane-form (samme mål som aktiv fane) med jevn inn/ut-animasjon (Layout45.swift).
        let home45: Bool = showHome && !Layout45.shared.homeLeaving
        VStack(spacing: 4) {
            if home45 {
                RailHome45()
                    .padding(.bottom, 8)
                    .transition(.railHome45(reduce: reduce45))
            }
            ForEach(tabs, id: \.0) { t in item(t.0, t.1, t.2, on: current == t.0) }
            Spacer(minLength: 8)
            if let e = editPage {
                if RailEdit45.handles(e) { RailEdit45(page: e) }
            } else if showPlus {
                RailScan45(label: scanLabel, tap: plusTap, hold: plusHold)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
        }
        .animation(reduce45 ? .easeOut(duration: 0.18) : .spring(response: 0.32, dampingFraction: 0.78), value: home45)
        .animation(.timingCurve(0.2, 0.9, 0.25, 1.15, duration: 0.32), value: editPage)
        .padding(.horizontal, 6).padding(.vertical, 12)
        .frame(width: 84)
        .frame(maxHeight: .infinity)
        // Samme farge som fanelinja på telefon: nav-tokenet over uskarphet (ikke en ugjennomsiktig grå flate).
        .background(p.nav.opacity(0.88), in: shape)
        .background(.ultraThinMaterial, in: shape)
        .shadow(color: .black.opacity(0.35), radius: 15, y: 12)
        .environment(\.colorScheme, .dark)
    }

    private func item(_ id: String, _ name: String, _ icon: String, on: Bool) -> some View {
        Button { tapTab(id, on) } label: {
            RailTabLabel25(name: name, icon: icon, on: on, style: style)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/* ---------- Scroll som klippes under headeren ---------- */

struct PaperScrollKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

extension Store {
    /// Aksjer til Mer-rutenettet (uten feilmelding når Trading 212 ikke er satt opp).
    func loadStocksQuiet() async {
        guard let d = try? await api.call("GET", "/stocks") else { return }
        stocksX = StocksX.parse(d)
    }
}

extension StocksX {
    /// «48 312 kr · +2,4 %» til Mer-rutenettet.
    var valueText: String {
        guard configured || mock else { return "Trading 212" }
        let v = total > 0 ? total : value
        let pct = invested > 0 ? result / invested * 100 : 0
        let sign = pct >= 0 ? "+" : "−"
        return "\(n0(v)) kr · \(sign)\(String(format: "%.1f", abs(pct)).replacingOccurrences(of: ".", with: ",")) %"
    }
}

extension Store {
    /// «‹ Hjem» øverst til venstre utenfor Hjem, «‹ Liste» på Detaljer, «‹ Mer» der siden kom fra Mer.
    var paperUpLabel: String {
        switch paperTab {
        case "innst": return "Mer"
        case "ftx": return "Liste"
        // Prompt 38: «‹ Mer», «‹ Hjem», «‹ Oversikt» etter hvor Abonnement ble åpnet fra (Nav38.swift).
        case "abo": return abo38Label ?? (finNav.contains("abonnementer") ? "Hjem" : "Mer")
        case "aksjer": return finNav.contains("aksjer") ? "Hjem" : "Mer"
        case "kvitt": return finNav.contains("kvitteringer") ? "Hjem" : "Mer"
        case "boliger": return folder != nil ? "Boliger" : (finNav.contains("boliger") ? "Hjem" : "Mer")
        case "profil": return "Alle innstillinger"
        // Prompt 40: «‹ Hjem» fra Gjøremål uansett hvor den ble åpnet fra.
        case "huske": return "Hjem"
        case "bursdag", "kalender", "bibel": return "Mer"
        default:
            // Prompt 26: «‹ Integrasjoner» fra en integrasjonsside, «‹ Bursdager» fra Kalendere åpnet der.
            if let l = nav26UpLabel { return l }
            return paperTab.hasPrefix("innst-") ? "Alle innstillinger" : "Hjem"
        }
    }
}
