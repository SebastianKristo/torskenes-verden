import SwiftUI
import UIKit

/* ---------------- Prompt 34: AI-kontroll (mobil) – skallet, Oversikt og Selvtest ----------------
   Fasit: design/AI Kontroll.dc.html, variant mobile: «GLIMT · AI-KONTROLL», tittel «AI» (Newsreader 34), statuslinje, Ferdig-pille,
   fanepiller som kan scrolles (36 pt, radius 18, valgt = ink), innhold i én kolonne, toast nederst. Papir-tokens:
   bg #f3efe6 · kort #fffdf8 · felt #ece6da · aksent #b23a2a · OK #2f7a4f · advarsel #a8661a. */

enum AiPal34 {
    static let warn: Color = Color(hex: "#a8661a")
    static func fld(_ p: PaperPalette) -> Color { p.dark ? Color(hex: "#2b2824") : Color(hex: "#ece6da") }
}

/// Legges i PaperShell: fullskjerm for AI-kontroll.
struct AiCtl34Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if !v { m.close() } })) {
                AiCtl34Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { m.close() }
            }
    }
}

extension View {
    func aiCtl34Host(_ p: PaperPalette) -> some View { modifier(AiCtl34Host(p: p)) }
}

struct AiCtl34Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            AiCtl34Header()
            AiCtl34Tabs()
            ScrollViewReader { (proxy: ScrollViewProxy) in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 12) {
                        Color.clear.frame(height: 0).id("aitop")
                        if !m.notice.isEmpty { AiCtl34Notice(text: m.notice) }
                        AiCtl34TabBody(tab: m.tab)
                    }
                    .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 40)
                }
                .onChange(of: m.tab) { (_: String, _: String) in proxy.scrollTo("aitop", anchor: .top) }
            }
        }
        .background(p.bg.ignoresSafeArea())
        .overlay(alignment: .bottom) { AiCtl34Toast() }
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task { m.start(store) }
    }
}

struct AiCtl34TabBody: View {
    let tab: String

    var body: some View {
        switch tab {
        case "mod": AiCtl34ModelsTab()
        case "rt": AiCtl34RoutingTab()
        case "job": AiCtl34JobsTab()
        case "use": AiCtl34UsageTab()
        case "api": AiCtl34KeysTab()
        case "imp": ClaudeImport43Tab()
        default: AiCtl34OverviewTab()
        }
    }
}

struct AiCtl34Header: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center) {
                Text(m.fin ? "FINANSHUB · KUNSTIG INTELLIGENS" : "GLIMT · AI-KONTROLL").font(PF.mono(10.5)).tracking(1.4).foregroundStyle(p.lab)
                Spacer(minLength: 8)
                // Egen pille (ikke SheetButton30): close() gir den ene lette impulsen.
                Button { m.close() } label: {
                    Text("Ferdig").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 16).frame(height: 36)
                        .background(p.ink, in: Capsule())
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Text(m.fin ? "AI i Finans" : "AI").font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
            Text(statusLine).font(PF.ui(13)).foregroundStyle(p.mut).lineLimit(2)
        }
        .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 12)
    }

    private var statusLine: String {
        let unit: String = m.running == 1 ? " jobb kjører" : " jobber kjører"
        let run: String = m.running > 0 ? String(m.running) + unit : "ingen jobber kjører"
        if m.fin { return "Kvitteringer, kategorier og spørsmål · " + run }
        let sky: Int = m.cloud.filter { $0.on }.count
        let parts: [String] = [String(m.installed.count) + " lokale modeller", String(sky) + " i skyen", run]
        return parts.joined(separator: " · ")
    }
}

struct AiCtl34Tabs: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(m.tabs, id: \.0) { (t: (String, String)) in
                    AiCtl34TabPill(id: t.0, name: t.1, badge: t.0 == "job" ? m.running + m.failed : 0)
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 2)
        }
    }
}

struct AiCtl34TabPill: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let id: String
    let name: String
    let badge: Int

    var body: some View {
        let on: Bool = m.tab == id
        Button { m.pick(id) } label: {
            HStack(spacing: 6) {
                Text(name).font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.mut).lineLimit(1)
                if badge > 0 {
                    Text(String(badge)).font(PF.ui(10.5, .heavy)).foregroundStyle(Color.white)
                        .padding(.horizontal, 6).frame(height: 18)
                        .background(p.lab, in: Capsule())
                }
            }
            .padding(.horizontal, 14).frame(height: 36)
            .background(on ? p.ink : Color.clear, in: Capsule())
            .overlay(Capsule().strokeBorder(on ? p.ink : p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct AiCtl34Notice: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.ui(13, .semibold)).foregroundStyle(AiPal34.warn)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AiPal34.warn.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct AiCtl34Toast: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        if !m.toast.isEmpty {
            Text(m.toast).font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                .padding(.horizontal, 16).frame(height: 40)
                .background(p.ink, in: Capsule())
                .padding(.bottom, 34)
                .transition(.opacity)
        }
    }
}

/* ---------- Felles byggeklosser ---------- */

/// Hvitt kort (radius 20) med valgfri mono-tittel over.
struct AiCard34<C: View>: View {
    @Environment(\.paper) private var p
    var title: String = ""
    var trailing: String = ""
    @ViewBuilder let content: () -> C

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !title.isEmpty || !trailing.isEmpty {
                HStack {
                    if !title.isEmpty { PLabel(text: title) }
                    Spacer(minLength: 4)
                    if !trailing.isEmpty { Text(trailing).font(PF.ui(12)).foregroundStyle(p.mut) }
                }
                .padding(.horizontal, 4)
            }
            VStack(alignment: .leading, spacing: 0) { content() }
                .padding(.horizontal, 16).padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }
}

struct AiLine34: View {
    @Environment(\.paper) private var p
    var body: some View { Rectangle().fill(p.line).frame(height: 1) }
}

/// Bryter 44 × 26 (grønn når på).
struct AiToggle34: View {
    @Environment(\.paper) private var p
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            ZStack(alignment: on ? .trailing : .leading) {
                Capsule().fill(on ? p.pos : p.line).frame(width: 44, height: 26)
                Circle().fill(Color.white).frame(width: 20, height: 20).padding(.horizontal, 3)
                    .shadow(color: Color.black.opacity(0.15), radius: 2, y: 1)
            }
            .animation(.easeOut(duration: 0.18), value: on)
        }
        .buttonStyle(.plain)
        .accessibilityValue(on ? "På" : "Av")
    }
}

/// Rad med navn, undertekst og bryter.
struct AiToggleRow34: View {
    @Environment(\.paper) private var p
    let name: String
    let sub: String
    let on: Bool
    let first: Bool
    let act: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            if !first { AiLine34() }
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    if !sub.isEmpty { Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                AiToggle34(on: on, act: act)
            }
            .padding(.vertical, 12)
        }
    }
}

/// Liten knapp i rad (Last inn, Slett, Avbryt …).
struct AiMini34: View {
    @Environment(\.paper) private var p
    let title: String
    var color: Color? = nil
    var filled: Bool = false
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(12.5, .bold)).foregroundStyle(filled ? p.bg : (color ?? p.ink)).lineLimit(1).fixedSize()
                .padding(.horizontal, 12).frame(height: 30)
                .background(filled ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().strokeBorder(filled ? Color.clear : p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Pille-segment (5 min / 30 min / Alltid …).
struct AiSegment34: View {
    @Environment(\.paper) private var p
    let opts: [(String, String)]
    let value: String
    let pick: (String) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(opts, id: \.0) { (o: (String, String)) in
                let on: Bool = o.0 == value
                Button { pick(o.0) } label: {
                    Text(o.1).font(PF.ui(12.5, .bold)).foregroundStyle(on ? p.ink : p.mut).lineLimit(1)
                        .padding(.horizontal, 10).frame(height: 30)
                        .background(on ? p.card : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(AiPal34.fld(p), in: Capsule())
    }
}

/// Stolpe (VRAM, disk, budsjett).
struct AiBar34: View {
    @Environment(\.paper) private var p
    let label: String
    let value: String
    let frac: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(label).font(PF.ui(12.5)).foregroundStyle(p.mut)
                Spacer(minLength: 4)
                Text(value).font(PF.mono(11.5)).foregroundStyle(p.ink)
            }
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(AiPal34.fld(p))
                    Capsule().fill(color).frame(width: g.size.width * CGFloat(Swift.max(0.02, Swift.min(1, frac))))
                }
            }
            .frame(height: 6)
        }
    }
}

/* ---------- Oversikt ---------- */

struct AiCtl34OverviewTab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AiCtl34Kpis()
            AiCtl34Selftest()
            // Prompt 38: Mac mini M4 · samlet minne · ekstern disk, og anbefalingene for maskinen (AiCtl38.swift).
            AiHw38Card()
            AiCtl34Providers()
            AiRecs38Card()
        }
    }
}

struct AiCtl34Kpis: View {
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let loaded: [AiModel34] = m.installed.filter { $0.loaded }
        let loadedNames: String = loaded.map { String($0.id.split(separator: ":").first ?? "") }.joined(separator: ", ")
        let failSub: String = m.failed > 0 ? " · " + String(m.failed) + " feilet" : ""
        let runSub: String = String(m.queued) + " i kø" + failSub
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                AiKpi34(label: "KJØRER NÅ", value: String(m.running), sub: runSub, bad: m.failed > 0) { m.pick("job") }
                AiKpi34(label: "LASTET I MINNET", value: String(loaded.count), sub: loadedNames.isEmpty ? "ingen" : loadedNames, bad: false) { m.pick("mod") }
            }
            HStack(spacing: 10) {
                AiKpi34(label: "TOKENS 30 D", value: AiCtl34.tk(m.tokens30), sub: String(m.localShare) + " % lokalt, gratis", bad: false) { m.pick("use") }
                AiKpi34(label: "SKY-KOSTNAD", value: AiCtl34.kr(m.cost30), sub: "av " + String(Int(m.budget)) + " kr budsjett", bad: false) { m.pick("use") }
            }
        }
    }
}

struct AiKpi34: View {
    @Environment(\.paper) private var p
    let label: String
    let value: String
    let sub: String
    let bad: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(PF.mono(9.5)).tracking(1.1).foregroundStyle(p.mut)
                Text(value).font(PF.serif(26, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(sub).font(PF.ui(11.5)).foregroundStyle(bad ? p.lab : p.mut).lineLimit(1)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct AiCtl34Selftest: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let bad: Int = m.tests.filter { $0.st == "fail" }.count
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(head(bad)).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text("Sender en liten prompt gjennom hver funksjon (chat, AI-søk, Glimt, kvitteringer …) og sjekker at modellen faktisk svarer, ikke bare at serveren kan nås.")
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                AiMini34(title: m.testRunning ? "Tester …" : "Kjør selvtest", filled: true) {
                    Task { await m.runSelftest(store) }
                }
                .disabled(m.testRunning)
            }
            if !m.tests.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(m.tests.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiTest34)) in
                        AiTestRow34(t: pair.element, first: pair.offset == 0)
                    }
                }
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(bad > 0 ? p.lab.opacity(0.4) : Color.clear, lineWidth: 1.5))
    }

    private func head(_ bad: Int) -> String {
        if m.testDone {
            let n: Int = m.tests.count
            if bad > 0 { return String(bad) + " av " + String(n) + " AI-funksjoner virker ikke" }
            return "Alt virker · " + String(n) + " av " + String(n) + " svarte"
        }
        return m.testRunning ? "Tester AI-funksjoner …" : "Selvtest"
    }
}

struct AiTestRow34: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let t: AiTest34
    let first: Bool

    var body: some View {
        VStack(spacing: 0) {
            if !first { AiLine34() }
            HStack(alignment: .top, spacing: 10) {
                AiTestDot34(st: t.st).padding(.top, 2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    Text(t.text).font(PF.ui(12.5)).foregroundStyle(t.st == "fail" ? p.lab : p.mut).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if t.st == "fail" {
                    AiMini34(title: fixLabel) { m.pick(t.fix == "api" ? "api" : "rt") }
                }
            }
            .padding(.vertical, 10)
        }
    }

    private var fixLabel: String { t.fix == "api" ? "Legg inn" : "Bytt modell" }
}

struct AiTestDot34: View {
    @Environment(\.paper) private var p
    let st: String
    @State private var spin: Bool = false

    var body: some View {
        ZStack {
            switch st {
            case "ok":
                Circle().fill(p.pos)
                Text("✓").font(PF.ui(10, .heavy)).foregroundStyle(Color.white)
            case "fail":
                Circle().fill(p.lab)
                Text("!").font(PF.ui(11, .heavy)).foregroundStyle(Color.white)
            case "busy":
                Circle().strokeBorder(p.line, lineWidth: 2)
                Circle().trim(from: 0, to: 0.3).stroke(p.lab, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .rotationEffect(.degrees(spin ? 360 : 0))
                    .onAppear { withAnimation(.linear(duration: 0.8).repeatForever(autoreverses: false)) { spin = true } }
            default:
                Circle().strokeBorder(p.line, lineWidth: 1.5)
            }
        }
        .frame(width: 18, height: 18)
    }
}

struct AiCtl34Hardware: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let vt: Double = m.vramTotal > 0 ? m.vramTotal : 8
        let dt: Double = m.diskTotal > 0 ? m.diskTotal : 500
        let used: Double = m.cost30
        AiCard34(title: "HJEMMESERVER") {
            VStack(alignment: .leading, spacing: 12) {
                Text(m.gpu.isEmpty ? "GPU ukjent" : m.gpu).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                AiBar34(label: "VRAM i bruk", value: AiCtl34.gb(m.vramUsed) + " / " + AiCtl34.gb(vt), frac: m.vramUsed / vt,
                        color: m.vramUsed > vt * 0.9 ? AiPal34.warn : p.pos)
                AiBar34(label: "Modeller på disk", value: AiCtl34.gb(m.diskUsed) + " / " + AiCtl34.gb(dt), frac: m.diskUsed / dt, color: p.ink)
                AiBar34(label: "Sky-budsjett denne måneden", value: AiCtl34.kr(used) + " / " + String(Int(m.budget)) + " kr",
                        frac: m.budget > 0 ? used / m.budget : 0, color: p.lab)
            }
            .padding(.vertical, 12)
        }
    }
}

struct AiCtl34Providers: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        AiCard34(title: "LEVERANDØRER") {
            if m.providers.isEmpty {
                Text("Ingen status ennå. Kjør selvtesten for å sjekke at modellene svarer.").font(PF.ui(13)).foregroundStyle(p.mut).padding(.vertical, 12)
            }
            ForEach(Array(m.providers.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiProv34)) in
                AiProvRow34(pv: pair.element, first: pair.offset == 0)
            }
        }
    }
}

/// Én leverandør: grønn = svarer (med svartid), oransje = nås men genererer ikke (med feil), grå = ikke tilkoblet.
struct AiProvRow34: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let pv: AiProv34
    let first: Bool

    var body: some View {
        Button { m.pick("api") } label: {
            VStack(spacing: 0) {
                if !first { AiLine34() }
                HStack(spacing: 10) {
                    Circle().fill(color).frame(width: 9, height: 9)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(pv.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                        Text(sub).font(PF.ui(12)).foregroundStyle(pv.state == "warn" ? AiPal34.warn : p.mut).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(pv.ms > 0 && pv.state == "ok" ? String(pv.ms) + " ms" : "–").font(PF.mono(11)).foregroundStyle(p.mut)
                }
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
        }
        .buttonStyle(.plain)
    }

    private var color: Color {
        switch pv.state {
        case "ok": return p.pos
        case "warn": return AiPal34.warn
        default: return p.line
        }
    }

    private var sub: String {
        switch pv.state {
        case "ok": return pv.detail.isEmpty ? "Svarer" : "Svarer · " + pv.detail
        case "warn": return "Nås, men genererer ikke" + (pv.detail.isEmpty ? "" : " · " + pv.detail)
        default: return pv.detail.isEmpty ? "Ikke tilkoblet" : "Ikke tilkoblet · " + pv.detail
        }
    }
}
