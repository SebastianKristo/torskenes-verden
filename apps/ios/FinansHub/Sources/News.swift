import SwiftUI
import UIKit

/* ---------------- Nyhetsleser (Nyhetsleser.dc.html, variant mobil) ---------------- */

/// Morgenavis-stil: kategorifaner, ✦ AI-sammendrag øverst og saker med kilde og tid.
/// Tannhjulet åpner «Kilder og AI». Et trykk på en sak åpner artikkelen (i nyhetsappen hvis den finnes).
struct NewsReaderView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let back: () -> Void
    @State private var sources = false
    /// Prompt 27: saken som er åpen i artikkelvisningen.
    @State private var article27: NewsItem? = nil

    var body: some View {
        let data = store.news ?? NewsData()
        VStack(spacing: 0) {
            header(data)
            tabs(data)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Prompt 46: Siste har det felles sammendraget; de andre kategoriene sitt eget (News46SummaryCard).
                    if store.newsCat == "siste" {
                        lead(data)
                    } else {
                        News46SummaryCard(cat: store.newsCat, name: News46.shared.tabs(data.categories).first { $0.id == store.newsCat }?.name ?? "",
                                          items: data.items) { (x: NewsItem) in article27 = x }
                    }
                    if store.news == nil || (store.newsBusy && data.items.isEmpty) {
                        ProgressView().frame(maxWidth: .infinity).padding(30)
                    } else if data.items.isEmpty {
                        Text("Ingen saker i denne kategorien.").font(PF.ui(14)).foregroundStyle(p.mut).padding(.vertical, 20)
                    }
                    ForEach(data.items) { x in row(x, data) }
                }
                .padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 40)
            }
            .refreshable { await store.loadNews() }
        }
        .background(p.bg.ignoresSafeArea())
        .sheet(isPresented: $sources) {
            NewsSourcesSheet().environment(\.paper, p)
                .presentationDetents([.fraction(0.86), .large])
                .sheetEdge30(p.bg)
        }
        .fullScreenCover(item: $article27) { x in
            // Prompt 46: lett haptikk ved trykk på tilbake (felles Haptic34.back, følger Haptikk-bryteren).
            NewsArticleView27(start: x, catName: { c in (store.news ?? NewsData()).name(of: c) }, close: { Haptic34.back(); article27 = nil })
                .environment(\.paper, p)
                .environment(store)
                // Prompt 30: kantsveip lukker artikkelen.
                .edgeSwipeClose30 { Haptic34.back(); article27 = nil } // prompt 46: haptikk når sveipet fullføres
        }
        // Prompt 40: Glimt-siden over Nyhetsleseren («‹ Nyheter» går tilbake hit).
        .fullScreenCover(isPresented: Binding<Bool>(get: { News40Model.shared.open }, set: { (v: Bool) in News40Model.shared.open = v })) {
            News40Page()
                .environment(\.paper, p)
                .environment(store)
                .edgeSwipeClose30 { News40Model.shared.open = false }
        }
        .task { if store.news == nil { await store.loadNews() } }
        .task { await NewsIcons23.shared.preload(store) }
    }

    private func header(_ d: NewsData) -> some View {
        HStack(spacing: 10) {
            Button { Haptic34.back(); back() } label: {
                Text("‹ Tilbake").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).padding(.leading, 10).padding(.trailing, 14).frame(height: 36)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 1) {
                PLabel(text: "Nyhetsleser · \(d.feeds.count) kilder\(updated(d))", size: 10)
                Text("Siste nytt").font(PF.serif(30, medium: true)).foregroundStyle(p.ink).lineLimit(1)
            }
            Spacer(minLength: 4)
            // Prompt 46: innstillingene ligger i Innstillinger → Nyheter. «…» har bare snarveien dit (og Hent nyheter nå).
            Menu {
                Button { store.paperGo("innst-nyheter") } label: { Label("Nyhetsinnstillinger", systemImage: "gearshape") }
                Button { store.refreshNews() } label: { Label("Hent nyheter nå", systemImage: "arrow.clockwise") }
            } label: {
                Image(systemName: "ellipsis").font(.dyn51(size: 17, weight: .bold)).foregroundStyle(p.ink)
                    .frame(width: 40, height: 40).background(p.card, in: Circle()).overlay(Circle().stroke(p.line, lineWidth: 1))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Mer")
        }
        .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 12)
    }

    private func updated(_ d: NewsData) -> String {
        guard let at = d.digestAt ?? d.items.compactMap(\.published).max() else { return "" }
        let f = DateFormatter(); f.dateFormat = "HH:mm"
        return " · oppdatert \(f.string(from: at))"
    }

    private func tabs(_ d: NewsData) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                // Prompt 46: «For deg» etter Siste og egne kategorier bakerst (News46.swift).
                ForEach(News46.shared.tabs(d.categories)) { c in
                    let on = store.newsCat == c.id
                    Button { store.setNewsCat(c.id) } label: {
                        // Prompt 23: ikon ved navnet (følger tekstfargen), se News23.swift.
                        NewsTabLabel23(cat: c, color: on ? p.ink : p.mut)
                            .padding(.top, 6).padding(.bottom, 10)
                            .overlay(alignment: .bottom) { Rectangle().fill(on ? p.ink : Color.clear).frame(height: 2) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.horizontal, 18)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }

    @ViewBuilder private func lead(_ d: NewsData) -> some View {
        let text = d.aiSummary && !d.digest.isEmpty ? d.digest : (d.items.first?.title ?? "")
        if !text.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                if d.aiSummary && !d.digest.isEmpty { PLabel(text: "✦ Glimt · sammendrag") }
                Text(text).font(PF.italic(19)).foregroundStyle(p.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                // Prompt 40: egen Glimt-side med langt sammendrag, kilder og bilder (News40Glimt.swift).
                News40Entry()
            }
            .padding(.bottom, 14)
            .contentShape(Rectangle())
            .onTapGesture { Haptic30.light(); News40Model.shared.show(store) }
        }
    }

    /// Prompt 27: bilde 76 × 76 og artikkelvisning i appen (News27.swift).
    private func row(_ x: NewsItem, _ d: NewsData) -> some View {
        NewsRow27(item: x, category: store.newsCat == "siste" ? d.name(of: x.category) : nil) {
            Haptics.shared.tap()
            article27 = x
        }
    }

    private func rowOld(_ x: NewsItem, _ d: NewsData) -> some View {
        Button { store.openLink(x.url) } label: {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                if store.newsCat == "siste" {
                    Text(d.name(of: x.category).uppercased()).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab).frame(width: 74, alignment: .leading).lineLimit(1)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(x.title).font(PF.ui(15)).foregroundStyle(p.ink).lineSpacing(2).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
                    Text("\(x.feed) · \(x.timeText)\(x.ai ? " · ✦ AI" : "")").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 0)
                Text("›").foregroundStyle(p.mut)
            }
            .padding(.vertical, 11)
            .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// «Kilder og AI»: brytere for AI-sammendrag og AI-kategorisering, adressene med kategori, og ny adresse.
struct NewsSourcesSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var iconFor: NewsCategory? = nil
    /// Prompt 46: Innstillinger → Nyheter (News46SettingsPage) viser innholdet direkte, uten egen rulling og «Ferdig».
    var embedded: Bool = false

    var body: some View {
        if embedded {
            content.sheet(item: $iconFor) { c in
                NewsIconPicker23(cat: c).environment(\.paper, p)
                    .presentationDetents([.fraction(0.86), .large])
                    .sheetEdge30(p.bg)
            }
        } else {
            sheetBody
        }
    }

    private var sheetBody: some View {
        ScrollView {
            content
            .padding(.horizontal, 18).padding(.top, 20).padding(.bottom, 30)
        }
        .background(p.bg)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .sheet(item: $iconFor) { c in
            NewsIconPicker23(cat: c).environment(\.paper, p)
                .presentationDetents([.fraction(0.86), .large])
                .sheetEdge30(p.bg)
        }
    }

    private var content: some View {
        let d = store.news ?? NewsData()
        return VStack(alignment: .leading, spacing: 14) {
                if !embedded { HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        PLabel(text: "Nyhetsleser")
                        Text("Kilder og AI").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                    }
                    Spacer()
                    PInkButton(title: "Ferdig") { dismiss() }
                } }
                VStack(spacing: 0) {
                    toggle("✦ AI-sammendrag", "Lager en kort ingress over de viktigste sakene øverst.", d.aiSummary) { store.setNewsSetting("aiSummary", $0) }
                    Rectangle().fill(p.line).frame(height: 1)
                    toggle("✦ AI-kategorisering", "Setter kategori per sak når kilden står på Auto.", d.aiCategorize) { store.setNewsSetting("aiCategorize", $0) }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                NewsIconSection23(cats: News46.shared.tabs(d.categories)) { c in iconFor = c }
                HStack(alignment: .firstTextBaseline) {
                    PLabel(text: "Adresser · \(d.feeds.count)")
                    Spacer()
                    Text("Velg kategori per kilde").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                VStack(spacing: 0) {
                    ForEach(Array(d.feeds.enumerated()), id: \.element.id) { i, f in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        feedRow(f, d)
                    }
                    if d.feeds.isEmpty { Text("Ingen kilder ennå.").font(PF.ui(13)).foregroundStyle(p.mut).padding(14).frame(maxWidth: .infinity, alignment: .leading) }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                VStack(alignment: .leading, spacing: 8) {
                    PLabel(text: "+ Legg til adresse")
                    HStack(spacing: 8) {
                        TextField("https://… (RSS eller Atom)", text: $url)
                            .font(PF.mono(13, bold: false)).foregroundStyle(p.ink)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .submitLabel(.done).onSubmit(add)
                            .padding(.horizontal, 12).frame(height: 44)
                            .background(p.card, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.line, lineWidth: 1))
                        PInkButton(title: store.newsBusy ? "…" : "Legg til", height: 44, act: add)
                    }
                    Text(d.aiCategorize ? "✦ AI finner navnet på kilden og foreslår kategori." : "Kategorien settes til Auto.").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                PLineButton(title: "Hent nyheter nå", height: 44, full: true) { store.refreshNews() }
            }
    }

    private func add() {
        let u = url
        url = ""
        store.addFeed(u)
    }

    private func toggle(_ t: String, _ s: String, _ on: Bool, _ set: @escaping (Bool) -> Void) -> some View {
        Button { set(!on) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Text(s).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                PaperSwitch(on: on)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(on ? "På" : "Av")
    }

    private func feedRow(_ f: NewsFeed, _ d: NewsData) -> some View {
        HStack(spacing: 10) {
            // Prompt 46: nettstedets ikon (favicon), bokstavene bare når det ikke finnes (News46.swift).
            News46Fav(feed: f)
            VStack(alignment: .leading, spacing: 1) {
                Text(f.name).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Text(f.lastError.isEmpty ? f.url : f.lastError).font(PF.mono(11.5, bold: false)).foregroundStyle(f.lastError.isEmpty ? p.mut : p.lab).lineLimit(1)
            }
            Spacer(minLength: 4)
            // Prompt 46: ekte nedtrekksmeny (✦ Auto + alle kategoriene, også egne), lagres med en gang.
            Menu {
                Button { store.patchFeed(f, ["category": "auto"]) } label: {
                    menuItem((d.aiCategorize ? "✦ " : "") + "Auto", f.category.lowercased() == "auto" || f.category.isEmpty)
                }
                ForEach(News46.shared.pickable(d.categories)) { (c: NewsCategory) in
                    Button { Haptics.shared.select(); store.patchFeed(f, ["category": c.id]) } label: {
                        menuItem(c.name, f.category.lowercased() == c.id)
                    }
                }
            } label: {
                Text(catLabel(f, d) + " ▾").font(PF.ui(12, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 10).frame(height: 30)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
                    .frame(minHeight: 44)
            }
            Button { store.deleteFeed(f) } label: {
                Image(systemName: "xmark").font(.dyn51(size: 13, weight: .semibold)).foregroundStyle(p.mut).frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fjern \(f.name)")
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .contextMenu {
            Button { store.patchFeed(f, ["enabled": !f.enabled]) } label: { Label(f.enabled ? "Slå av" : "Slå på", systemImage: f.enabled ? "pause.circle" : "play.circle") }
            Button(role: .destructive) { store.deleteFeed(f) } label: { Label("Fjern", systemImage: "trash") }
        }
    }

    @ViewBuilder private func menuItem(_ t: String, _ on: Bool) -> some View {
        if on { Label(t, systemImage: "checkmark") } else { Text(t) }
    }

    private func catLabel(_ f: NewsFeed, _ d: NewsData) -> String {
        let c = f.category.lowercased()
        if c == "auto" || c.isEmpty { return (d.aiCategorize ? "✦ " : "") + "Auto" }
        if let own = News46.shared.custom.first(where: { $0.id == c }) { return own.name }
        return d.name(of: c)
    }
}

/// Bryter i Papir-stil (grønn når den er på).
struct PaperSwitch: View {
    let on: Bool
    var body: some View {
        Capsule().fill(on ? Color(hex: "#2f7a4f") : Color(hex: "#9a958a"))
            .frame(width: 46, height: 28)
            .overlay(alignment: on ? .trailing : .leading) { Circle().fill(.white).frame(width: 22, height: 22).padding(3) }
            .animation(.easeOut(duration: 0.15), value: on)
    }
}
