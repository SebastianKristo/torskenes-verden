import SwiftUI
import WidgetKit

/* ---------------- Prompt 43: Innstillinger → Widgets (galleriet) ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-widget-galleri.md og design/Widget Galleri.dc.html (platform «ios»).
 Alle widgets i appen med forhåndsvisning per størrelse (Liten · Medium · Stor · Låseskjerm) på blågrå bakgrunn, filterchips,
 «✓ Lagt til» fra WidgetCenter.getCurrentConfigurations, og «Slik legger du til» (iOS kan ikke legge til widgets fra appen). */

@MainActor
@Observable
final class Widgets43 {
    static let shared = Widgets43()
    var open: Bool = false
    var howTo: Widget43Def? = nil
    var added: Set<String> = []

    func refresh() {
        WidgetCenter.shared.getCurrentConfigurations { (r: Result<[WidgetInfo], Error>) in
            let kinds: Set<String> = Set(((try? r.get()) ?? []).map(\.kind))
            Task { @MainActor in Widgets43.shared.added = kinds }
        }
    }
}

struct Widget43Def: Identifiable, Hashable {
    let id: String          // filter: media | avganger | kalender | prove | pakker | brief
    let name: String
    let kinds: [String]
    let sizes: [String]     // Liten · Medium · Stor · Låseskjerm
    let blurb: String
}

enum Widget43Catalog {
    static let all: [Widget43Def] = [
        Widget43Def(id: "media", name: "Media", kinds: ["no.kristo.finanshub.media43", "no.kristo.finanshub.media43.lock"],
                    sizes: ["Liten", "Medium", "Stor", "Låseskjerm"], blurb: "Nedlastinger, fart og det som kommer. Pause alt i den store."),
        Widget43Def(id: "avganger", name: "Avganger", kinds: ["no.kristo.finanshub.ruter27"],
                    sizes: ["Liten", "Medium", "Stor", "Låseskjerm"], blurb: "Sanntid fra Entur for stoppene dine."),
        Widget43Def(id: "kalender", name: "Kalender", kinds: ["no.kristo.finanshub.kalender"],
                    sizes: ["Liten", "Medium", "Stor", "Låseskjerm"], blurb: "Dagen og neste hendelse."),
        Widget43Def(id: "prove", name: "Prøveperioder", kinds: ["no.kristo.finanshub.trials32"],
                    sizes: ["Liten", "Medium", "Låseskjerm"], blurb: "Prøven som slutter først, med ✓ Avsluttet."),
        Widget43Def(id: "pakker", name: "Pakker", kinds: ["fh.packages"],
                    sizes: ["Liten", "Medium"], blurb: "Pakker på vei og klare til henting."),
        Widget43Def(id: "brief", name: "Glimt-brief", kinds: ["no.kristo.finanshub.brief34"],
                    sizes: ["Liten", "Medium", "Stor", "Låseskjerm"], blurb: "Morgen-, dags- og kveldsbriefen fra Glimt."),
    ]
    static let filters: [(String, String)] = [("alle", "Alle"), ("media", "Media"), ("avganger", "Avganger"), ("kalender", "Kalender"),
                                              ("prove", "Prøveperioder"), ("pakker", "Pakker"), ("brief", "Glimt-brief")]
}

struct Widgets43Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var w: Widgets43 { Widgets43.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { w.open }, set: { w.open = $0 })) {
                Widgets43Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { w.open = false }
            }
    }
}

extension View {
    func widgets43Host(_ p: PaperPalette) -> some View { modifier(Widgets43Host(p: p)) }
}

struct Widgets43Page: View {
    @Environment(\.paper) private var p
    @MainActor private var w: Widgets43 { Widgets43.shared }
    @State private var filter: String = "alle"

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button { Haptics.shared.tap(); w.open = false } label: {
                    Text("‹ Tilbake").font(PF.ui(15, .semibold)).foregroundStyle(p.ink).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.top, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("INNSTILLINGER · APP").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                    Text("Widgets").font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
                    Text("Alle widgetene i appen. På iPhone legger du dem til fra Hjem-skjermen: hold inne, trykk + og søk etter «Homelab».")
                        .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Widget43Catalog.filters, id: \.0) { (f: (String, String)) in
                                Media43Chip(text: f.1, on: filter == f.0) { Haptics.shared.select(); filter = f.0 }
                            }
                        }
                    }
                    ForEach(Widget43Catalog.all.filter { filter == "alle" || $0.id == filter }) { (d: Widget43Def) in section(d) }
                }
                .padding(.horizontal, 16).padding(.bottom, 40)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
        }
        .background(p.bg.ignoresSafeArea())
        .onAppear { w.refresh() }
        .sheet(item: Binding<Widget43Def?>(get: { w.howTo }, set: { w.howTo = $0 })) { (d: Widget43Def) in
            Widgets43HowTo(def: d)
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(p.bg)
        }
    }

    private func section(_ d: Widget43Def) -> some View {
        let added: Bool = d.kinds.contains { w.added.contains($0) }
        return VStack(alignment: .leading, spacing: 10) {
            VStack(spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(d.name.uppercased()).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                    Spacer()
                    if added { Text("✓ Lagt til").font(PF.ui(12, .bold)).foregroundStyle(Color(hex: "#2f6b4a")) }
                }
                Rectangle().fill(p.ink).frame(height: 2)
            }
            Text(d.blurb).font(PF.ui(12.5)).foregroundStyle(p.mut)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 12) {
                    ForEach(d.sizes, id: \.self) { (s: String) in
                        VStack(alignment: .leading, spacing: 6) {
                            Widget43Preview(def: d, size: s)
                            Text(d.name + " · " + s).font(PF.ui(12, .semibold)).foregroundStyle(p.ink)
                        }
                    }
                }
                .padding(14)
            }
            .background(LinearGradient(colors: [Color(hex: "#5f7186"), Color(hex: "#3d4a5a")], startPoint: .top, endPoint: .bottom),
                        in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Button { Haptics.shared.tap(); w.howTo = d } label: {
                Text("Slik legger du til").font(PF.ui(14, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 46).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Forhåndsvisning (tegnet her; ekte widgets kan ikke vises inne i appen).
struct Widget43Preview: View {
    let def: Widget43Def
    let size: String

    var body: some View {
        let lock: Bool = size == "Låseskjerm"
        let w: CGFloat = size == "Liten" ? 120 : lock ? 150 : 250
        let h: CGFloat = size == "Stor" ? 250 : lock ? 64 : 120
        let ink: Color = Color(red: 27.0 / 255.0, green: 26.0 / 255.0, blue: 23.0 / 255.0)
        let lab: Color = Color(hex: "#b23a2a")
        VStack(alignment: .leading, spacing: 6) {
            Text(def.name.uppercased()).font(PF.mono(9.5)).tracking(1).foregroundStyle(lock ? Color.white.opacity(0.9) : lab)
            Text(headline).font(PF.serif(lock ? 16 : 24, medium: true)).foregroundStyle(lock ? Color.white : ink).lineLimit(1).minimumScaleFactor(0.6)
            if !lock {
                ForEach(lines.prefix(size == "Stor" ? 5 : size == "Medium" ? 2 : 1), id: \.self) { (l: String) in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(l).font(PF.ui(11, .semibold)).foregroundStyle(ink).lineLimit(1)
                        if def.id == "media" { Capsule().fill(lab.opacity(0.85)).frame(width: w * 0.45, height: 3) }
                    }
                }
                if size == "Stor" && def.id == "media" {
                    Text("Pause alt").font(PF.ui(11, .bold)).foregroundStyle(Color.white).padding(.horizontal, 10).frame(height: 24).background(ink, in: Capsule())
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(width: w, height: h, alignment: .topLeading)
        .background(lock ? Color.black.opacity(0.35) : Color(hex: "#fffdf8"), in: RoundedRectangle(cornerRadius: lock ? 16 : 22, style: .continuous))
        .accessibilityLabel(def.name + " " + size)
    }

    private var headline: String {
        switch def.id {
        case "media": return "12,4 MB/s"
        case "avganger": return "45 · 3 min"
        case "kalender": return "Tannlege 14:00"
        case "prove": return "2 dager igjen"
        case "pakker": return "2 på vei"
        default: return "God morgen"
        }
    }

    private var lines: [String] {
        switch def.id {
        case "media": return ["Only Murders · 62 %", "The Bear · 31 %", "Shrinking · står fast", "Kommer: Severance fre 09:00", "Slow Horses ons 21:00"]
        case "avganger": return ["Majorstuen 3, 11, 19 min", "Nationaltheatret 6 min", "Buss 20 · 9 min"]
        case "kalender": return ["Fotball 17:30", "Middag hos mormor 19:00", "Frist: innlevering fre"]
        case "prove": return ["Viaplay · 149 kr/mnd", "Storytel · 9 dager", "HBO Max · 23 dager"]
        case "pakker": return ["Bring · klar til henting", "PostNord · i morgen"]
        default: return ["8° og lettskyet", "3 hendelser i dag", "Ta med paraply"]
        }
    }
}

/// «Slik legger du til» – 3 steg (Hjem-skjerm) og låseskjermen.
struct Widgets43HowTo: View {
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    let def: Widget43Def

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    Text("Legg til «\(def.name)»").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                    Spacer()
                    Button { dismiss() } label: {
                        Text("Ferdig").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).padding(.horizontal, 16).frame(height: 36).background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                step(1, "Hold inne på Hjem-skjermen", "Til appene vugger. Trykk «Rediger» eller + øverst i hjørnet.")
                step(2, "Søk etter «Homelab»", "Velg «\(def.name)» i listen og bla til størrelsen du vil ha (\(def.sizes.filter { $0 != "Låseskjerm" }.joined(separator: ", "))).")
                step(3, "Trykk «Legg til widget»", "Dra den dit du vil ha den, og trykk Ferdig.")
                if def.sizes.contains("Låseskjerm") {
                    Text("LÅSESKJERM").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab).padding(.top, 4)
                    step(1, "Hold inne på låseskjermen", "Trykk «Tilpass» → «Låseskjerm».")
                    step(2, "Trykk feltet under klokka", "Velg Homelab → «\(def.name)».")
                }
            }
            .padding(20)
        }
    }

    private func step(_ n: Int, _ t: String, _ d: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)").font(PF.ui(13, .bold)).foregroundStyle(p.bg).frame(width: 28, height: 28)
                .background(p.ink, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Text(d).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
