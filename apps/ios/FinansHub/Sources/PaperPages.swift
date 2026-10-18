import SwiftUI
import UIKit

/* ---------------- Papir: Hjem, Finans, Sporing, Mer og Innstillinger ---------------- */

private func pkr(_ v: Double) -> String { "\(neg0(v)) kr" }

/* ---------- Hjem ---------- */

struct PaperHome: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(spacing: 10) {
            PaperSearch()
            if let s = topPackage { packageCard(s) }
            ruter
            minis
            newsCard
            shortcuts
            if let e = store.homeError { Text(e).font(PF.ui(12.5)).foregroundStyle(p.lab).frame(maxWidth: .infinity, alignment: .leading) }
        }
    }

    private var topPackage: Shipment? {
        let list = (store.homePackages ?? store.tracking?.items ?? []).filter { !$0.archived && $0.status != "delivered" }
        return list.first { $0.status == "ready_for_pickup" } ?? list.first
    }

    private func packageCard(_ s: Shipment) -> some View {
        let more = Swift.max(0, ((store.tracking?.items ?? store.homePackages ?? []).filter { !$0.archived && $0.status != "delivered" }.count) - 1)
        return Button { store.paperGo("sporing") } label: {
            HStack(spacing: 14) {
                PaperCarrierBadge(s: s, size: 52, radius: 14)
                VStack(alignment: .leading, spacing: 2) {
                    PLabel(text: s.status == "ready_for_pickup" ? "Hent nå" : s.statusText)
                    Text(s.name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text([s.pickupPoint, s.eta].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(more > 0 ? "\(more) til ›" : "›").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var ruter: some View {
        let lines = store.mobileHome?.ruter ?? []
        if let first = lines.first {
            let deps = Array(lines.flatMap { l in l.departures.map { (l.to, $0) } }.prefix(4))
            Button { store.openURL(store.ruterURL(first.from)) } label: {
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
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityHint("Åpner Ruter")
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
                Text("⌕").font(PF.ui(17)).foregroundStyle(p.mut)
                TextField("Søk på Google", text: $q)
                    .font(PF.ui(14.5)).foregroundStyle(p.ink)
                    .keyboardType(.webSearch).submitLabel(.search).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .focused($focused)
                    .onSubmit { go(q) }
                    .onChange(of: q) { _, v in store.suggest(v) }
                if !q.isEmpty {
                    Button { q = ""; store.suggestions = [] } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(p.mut) }
                        .buttonStyle(.plain).accessibilityLabel("Tøm feltet")
                }
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
        Text(s.carrierIni).font(PF.ui(size > 46 ? 13 : 12, .heavy)).foregroundStyle(Color(hex: s.carrierFg))
            .frame(width: size, height: size)
            .background(Color(hex: s.carrierColor), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/* ---------- Finans ---------- */

struct PaperFinance: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(spacing: 10) {
            saldo
            let review = store.summary?.review.count ?? store.boot?.reviewCount ?? 0
            if review > 0 {
                Button { store.paperOpen(.upload) } label: {
                    HStack {
                        Text(review == 1 ? "1 kvittering til gjennomgang" : "\(review) kvitteringer til gjennomgang")
                        Spacer()
                        Text("Gå gjennom ›")
                    }
                    .font(PF.ui(15, .bold)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 14)
                    .background(p.lab, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            PSection(title: "Siste transaksjoner", trailing: nil)
            recent
            budget
            pages
        }
        .task { await store.loadPaperFinance() }
    }

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
        let list = Array((store.summary?.recent ?? []).prefix(5))
        if list.isEmpty { Text(store.summary == nil ? "Henter …" : "Ingen transaksjoner ennå.").font(PF.ui(13)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading) }
        ForEach(list) { t in
            Button {
                store.paperOpenFin(.list)
                store.selectedTx = t.id
            } label: {
                HStack(spacing: 12) {
                    Text(initial(t.merchant ?? t.description)).font(PF.ui(11, .heavy)).foregroundStyle(.white)
                        .frame(width: 38, height: 38).background(Color(hex: t.color), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
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
    let act: () -> Void
}

struct PaperLinkList: View {
    @Environment(\.paper) private var p
    let rows: [PaperLinkRow]
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Button(action: r.act) {
                    HStack(spacing: 10) {
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

    static let tabs = ["Aktive", "Klar for henting", "På vei", "Registrert", "Levert", "Alle"]

    static func inTab(_ s: Shipment, _ t: String) -> Bool {
        switch t {
        case "Aktive": return s.active
        case "Klar for henting": return !s.archived && s.status == "ready_for_pickup"
        case "På vei": return !s.archived && ["picked_up", "in_transit", "out_for_delivery", "delayed"].contains(s.status)
        case "Registrert": return !s.archived && (s.status == "registered" || s.status == "unknown")
        case "Levert": return s.status == "delivered"
        default: return true
        }
    }

    var body: some View {
        let all = store.tracking?.items ?? store.homePackages ?? []
        let list = all.filter { PaperTracking.inTab($0, store.trkTab) }.sorted { a, b in a.ready != b.ready ? a.ready : a.step > b.step }
        VStack(spacing: 10) {
            tabBar(all)
            addField
            if store.tracking == nil && all.isEmpty { ProgressView().padding(30) }
            if store.tracking != nil && list.isEmpty {
                PCard { Text(store.trkTab == "Aktive" ? "Ingen pakker på vei. Sporingsnumre fra e-post og Finn legges til automatisk." : "Ingen pakker her.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
            }
            ForEach(list, id: \.id) { s in PaperShipmentCard(s: s) }
            HStack(spacing: 8) {
                PLineButton(title: store.trkChecking ? "Sjekker …" : "Sjekk nå", height: 44, full: true) { store.checkTracking() }
                PLineButton(title: "⚙ Varsler og kilder", height: 44, full: true) { store.trkSettings = true }
            }
        }
        .task { if store.tracking == nil { try? await store.loadTracking() } }
        .sheet(isPresented: Binding(get: { store.trkSettings }, set: { store.trkSettings = $0 })) {
            PaperTrackSettings()
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .presentationBackground(p.bg)
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
        store.addTracking(no: n, name: "", carrier: car == "other" ? nil : car, out: false)
        no = ""
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
                Text("Varsler og kilder").font(PF.serif(24, medium: true)).foregroundStyle(p.ink).padding(.bottom, 4)
                PLabel(text: "Varsler")
                group([
                    row("Ny pakke funnet", "Når et sporingsnummer dukker opp i e-post eller Finn", t.prefs["found"] ?? true) { store.setTrackingPref("found", $0) },
                    row("Klar for henting", "Med hentested og frist", t.prefs["pickup"] ?? true) { store.setTrackingPref("pickup", $0) },
                    row("Ute for levering", "Når budet er på vei til deg", t.prefs["out"] ?? true) { store.setTrackingPref("out", $0) },
                    row("Forsinket", "Når leveringen er forsinket", t.prefs["delayed"] ?? true) { store.setTrackingPref("delayed", $0) },
                    row("Levert", "Når pakken er levert", t.prefs["delivered"] ?? false) { store.setTrackingPref("delivered", $0) },
                ])
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
                PaperCarrierBadge(s: s)
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.name).font(PF.serif(18, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text("\(s.carrierName) · \(s.trackingNo)").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 0)
                Button { withAnimation(.easeOut(duration: 0.2)) { open.toggle() } } label: {
                    Text(open ? "▴" : "▾").font(PF.ui(14, .bold)).foregroundStyle(p.mut).frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(open ? "Skjul hendelser" : "Vis hendelser")
            }
            HStack(alignment: .firstTextBaseline) {
                Text(s.statusText).font(PF.ui(14, .bold)).foregroundStyle(s.status == "ready_for_pickup" || s.status == "delayed" ? p.lab : s.status == "delivered" ? p.pos : p.ink)
                Spacer()
                Text(s.pickupPoint.isEmpty ? s.eta : [s.pickupPoint, s.eta].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { j in
                    Capsule().fill(barColor(j)).frame(height: 5)
                }
            }
            if open { timeline }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(s.status == "ready_for_pickup" ? p.lab : Color.clear, lineWidth: 1.5))
        .contentShape(Rectangle())
        .onTapGesture {
            if !s.url.isEmpty { store.openLink(s.url) } else { withAnimation(.easeOut(duration: 0.2)) { open.toggle() } }
        }
        .contextMenu {
            Button { UIPasteboard.general.string = s.trackingNo; store.flash("Sporingsnummeret er kopiert") } label: { Label("Kopier sporingsnummer", systemImage: "doc.on.doc") }
            Button { store.archiveTracking(s, !s.archived) } label: { Label(s.archived ? "Hent tilbake" : "Arkiver", systemImage: "archivebox") }
            Button(role: .destructive) { store.deleteTracking(s) } label: { Label("Slett", systemImage: "trash") }
        }
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
        }
        .padding(.top, 4)
    }
}

/* ---------- Mer ---------- */

struct PaperMore: View {
    @Environment(Store.self) private var store
    var body: some View {
        PaperLinkList(rows: [
            PaperLinkRow(name: "Domener", sub: "Trafikk, besøk og oppetid") { store.paperOpenDomains(from: "mer") },
            PaperLinkRow(name: "Finans", sub: "Oversikt, liste, Finn og mer") { store.paperGo("finans") },
            PaperLinkRow(name: "Nyhetsleser", sub: "RSS med ✦ AI-sammendrag") { store.openNews() },
            PaperLinkRow(name: "Sporing", sub: "Pakker, varsler og kilder") { store.paperGo("sporing") },
            PaperLinkRow(name: "Innstillinger", sub: "Tema, bakgrunn og konto") { store.paperGo("innst") },
        ])
        .padding(.top, -8)
    }
}

/* ---------- Innstillinger ---------- */

struct PaperSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            group("Tema", [
                PaperLinkRow(name: "Papir · lys", sub: "Lyst papir og svart fanelinje", value: store.paperMode == "lys" ? "✓ Valgt" : "", valueColor: p.pos) { store.setPaperMode("lys") },
                PaperLinkRow(name: "Papir · mørk", sub: "Kveldspapir og lys fanelinje", value: store.paperMode == "mork" ? "✓ Valgt" : "", valueColor: p.pos) { store.setPaperMode("mork") },
                PaperLinkRow(name: "Papir · følg systemet", sub: "Lys om dagen, mørk når iPhone er i mørk modus", value: store.paperMode == "auto" ? "✓ Valgt" : "", valueColor: p.pos) { store.setPaperMode("auto") },
                PaperLinkRow(name: "Klassisk (Liquid Glass)", sub: "Bytt tilbake til det forrige mobildesignet", value: "Bytt ›", valueColor: p.lab) { store.setMobileDesign("klassisk") },
            ])
            group("Forside", [
                PaperLinkRow(name: "Bakgrunn", sub: photoName, value: "Endre ›") { store.paperGo("hjem"); store.paperBgOpen = true },
                PaperLinkRow(name: "Nyhetsleser", sub: "Kilder, kategorier og AI", value: "Åpne ›") { store.openNews() },
            ])
            group("Konto", [
                PaperLinkRow(name: store.displayName.isEmpty ? "Konto" : store.displayName, sub: accountSub, value: "") {},
                PaperLinkRow(name: "Alle innstillinger", sub: "Sikkerhet, varsler, skanning, haptikk, widgets og server") { store.paperOpen(.settings) },
                PaperLinkRow(name: "Lås appen", sub: "Face ID / kode", value: store.lockEnabled ? "På" : "Av", valueColor: store.lockEnabled ? p.pos : p.mut) { store.lockEnabled.toggle() },
                PaperLinkRow(name: "Logg ut", sub: "Du må logge inn igjen med 2FA", value: "Logg ut", valueColor: p.lab) { store.logout() },
            ])
        }
    }

    private var photoName: String {
        switch store.photo {
        case "cur": "Nåværende"
        case "weather": "Vær nå"
        case "planets": "Planeter"
        case "custom": "Eget bilde"
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
