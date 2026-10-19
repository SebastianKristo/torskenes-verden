import SwiftUI
import UIKit

/* ---------------- Prompt 34: AI-kontroll (mobil) – Jobber, Forbruk og API og nøkler ----------------
   Fasit: design/AI Kontroll.dc.html → isJob (Kjører / I kø / Siste, Avbryt, Prøv igjen, Pause kø, Tøm historikk), isUse (periode,
   kort, stolper per dag lokalt/sky, per funksjon, budsjett 0–500 kr med «Stopp sky-AI ved grensen» og «Varsle ved 80 %») og isApi
   (kort per leverandør med status, Test og nøkkelfelt med Vis/Skjul; Glimt-API-nøkler hl_••••). Nøklene vises bare som «satt» / sist 4. */

/* ---------- Jobber ---------- */

struct AiCtl34JobsTab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let list: [AiJob34] = m.jobs.filter { !m.fin || $0.fin }
        let groups: [(String, [AiJob34])] = [
            ("KJØRER", list.filter { $0.st == "run" }),
            ("I KØ", list.filter { $0.st == "queue" }),
            ("SISTE", list.filter { $0.st == "done" || $0.st == "fail" }),
        ]
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text(summary).font(PF.ui(12.5)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading)
                AiMini34(title: m.paused ? "Fortsett kø" : "Pause kø") { m.togglePause(store) }
                AiMini34(title: "Tøm historikk") { m.clearHistory(store) }
            }
            if list.isEmpty {
                Text("Ingen AI-jobber ennå.").font(PF.ui(13)).foregroundStyle(p.mut).padding(.horizontal, 4)
            }
            ForEach(groups.filter { !$0.1.isEmpty }, id: \.0) { (g: (String, [AiJob34])) in
                AiCard34(title: g.0) {
                    ForEach(Array(g.1.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiJob34)) in
                        AiJobRow34(j: pair.element, first: pair.offset == 0)
                    }
                }
            }
        }
    }

    private var summary: String {
        let parts: [String] = [String(m.running) + " kjører", String(m.queued) + " i kø", "maks " + String(m.parallel) + " samtidig"]
        var s: String = parts.joined(separator: " · ")
        if m.paused { s += " · køen er pauset" }
        return s
    }
}

struct AiJobRow34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let j: AiJob34
    let first: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !first { AiLine34() }
            HStack(alignment: .top, spacing: 10) {
                AiJobDot34(st: j.st).padding(.top, 2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(j.title).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(2)
                    Text(sub).font(PF.ui(12)).foregroundStyle(j.st == "fail" ? p.lab : p.mut).fixedSize(horizontal: false, vertical: true)
                    if j.st == "run" { AiStriped34(frac: j.pct / 100).padding(.top, 3) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if j.st != "done" {
                    AiMini34(title: j.st == "fail" ? "Prøv igjen" : "Avbryt", color: j.st == "fail" ? p.ink : p.lab) { m.jobAction(j, store) }
                }
            }
            .padding(.vertical, 11)
        }
    }

    private var sub: String {
        var parts: [String] = []
        if !j.model.isEmpty { parts.append(j.model) }
        if j.st == "run" { parts.append(String(Int(j.pct)) + " %") }
        if j.st == "queue" && j.meta.isEmpty { parts.append("venter") }
        if !j.meta.isEmpty { parts.append(j.meta) }
        if !j.err.isEmpty { parts.append(j.err) }
        return parts.joined(separator: " · ")
    }
}

struct AiJobDot34: View {
    @Environment(\.paper) private var p
    let st: String

    var body: some View {
        switch st {
        case "run": AiTestDot34(st: "busy")
        case "queue":
            Circle().strokeBorder(p.mut, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])).frame(width: 18, height: 18)
        case "fail": AiTestDot34(st: "fail")
        default: AiTestDot34(st: "ok")
        }
    }
}

/* ---------- Forbruk ---------- */

struct AiCtl34UsageTab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AiSegment34(opts: [("1", "I dag"), ("7", "7 dager"), ("30", "30 dager")], value: String(m.usageDays)) { (v: String) in
                Haptic34.light()
                m.usageDays = Int(v) ?? 30
                Task { await m.loadUsage(store) }
            }
            AiUsageKpis34()
            AiUsageBars34()
            AiFeatures34()
            AiBudget34()
        }
    }
}

struct AiUsageKpis34: View {
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let tot: Double = m.tokIn + m.tokOut
        let avg: String = m.avgMs > 0 ? String(format: "%.1f s", m.avgMs / 1000).replacingOccurrences(of: ".", with: ",") : "–"
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                AiKpi34(label: "TOKENS", value: AiCtl34.tk(tot), sub: "inn " + AiCtl34.tk(m.tokIn) + " · ut " + AiCtl34.tk(m.tokOut), bad: false) {}
                AiKpi34(label: "SKY-KOSTNAD", value: AiCtl34.kr(m.costPeriod), sub: "Gemini og Groq", bad: false) {}
            }
            HStack(spacing: 10) {
                AiKpi34(label: "LOKALT", value: String(m.localShare) + " %", sub: "av alle tokens, gratis", bad: false) {}
                AiKpi34(label: "SNITT SVARTID", value: avg, sub: "alle oppgaver", bad: false) {}
            }
        }
    }
}

struct AiUsageBars34: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let mx: Double = Swift.max(1, m.days.map { $0.local + $0.cloud }.max() ?? 1)
        if !m.days.isEmpty {
            AiCard34(title: "PER DAG", trailing: "lokalt · sky") {
                HStack(alignment: .bottom, spacing: 3) {
                    ForEach(m.days) { (d: AiDay34) in
                        AiDayBar34(local: d.local / mx, cloud: d.cloud / mx)
                    }
                }
                .frame(height: 90)
                .padding(.vertical, 12)
            }
        }
    }
}

struct AiDayBar34: View {
    @Environment(\.paper) private var p
    let local: Double
    let cloud: Double

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            Rectangle().fill(p.lab).frame(height: 90 * CGFloat(cloud))
            Rectangle().fill(p.pos).frame(height: 90 * CGFloat(local))
        }
        .frame(maxWidth: .infinity)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 3, topTrailingRadius: 3))
    }
}

struct AiFeatures34: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let mx: Double = Swift.max(1, m.feats.map { $0.tokens }.max() ?? 1)
        if !m.feats.isEmpty {
            AiCard34(title: "PER FUNKSJON") {
                ForEach(Array(m.feats.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiFeat34)) in
                    AiFeatRow34(f: pair.element, frac: pair.element.tokens / mx, first: pair.offset == 0)
                }
            }
        }
    }
}

struct AiFeatRow34: View {
    @Environment(\.paper) private var p
    let f: AiFeat34
    let frac: Double
    let first: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !first { AiLine34() }
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(f.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    Spacer(minLength: 4)
                    Text(f.cost > 0 ? AiCtl34.kr(f.cost) : "Gratis").font(PF.mono(12)).foregroundStyle(f.cost > 0 ? p.ink : p.pos)
                }
                Text(f.line).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
                AiBar34(label: "", value: "", frac: frac, color: f.cost > 0 ? p.lab : p.pos)
            }
            .padding(.vertical, 11)
        }
    }
}

struct AiBudget34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    @State private var value: Double = -1

    var body: some View {
        let admin: Bool = Update28Model.isAdmin(store)
        let v: Double = value >= 0 ? value : m.budget
        let frac: Double = v > 0 ? m.cost30 / v : 0
        AiCard34(title: "BUDSJETT FOR SKY-AI") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(v <= 0 ? "Ingen grense" : String(Int(v)) + " kr / mnd").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    Spacer()
                }
                Slider(value: Binding<Double>(get: { v }, set: { (x: Double) in value = (x / 10).rounded() * 10 }), in: 0...500, onEditingChanged: { (editing: Bool) in
                    if !editing && value >= 0 { m.setBudget(value, store) }
                })
                .tint(p.lab)
                .disabled(!admin)
                AiBar34(label: "Brukt denne måneden", value: AiCtl34.kr(m.cost30), frac: frac, color: frac > 0.8 ? AiPal34.warn : p.pos)
                Text("0 kr betyr ingen grense.").font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .padding(.vertical, 12)
            AiToggleRow34(name: "Stopp sky-AI ved grensen", sub: "Bytter til lokale modeller resten av måneden", on: m.budgetHard, first: false) {
                if admin { m.toggleBudget("hard", store) }
            }
            AiToggleRow34(name: "Varsle ved 80 %", sub: "Push til mobilen", on: m.budgetWarn, first: false) {
                if admin { m.toggleBudget("warn80", store) }
            }
        }
    }
}

/* ---------- API og nøkler ---------- */

struct AiCtl34KeysTab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        let admin: Bool = Update28Model.isAdmin(store)
        let list: [AiKey34] = m.keys.isEmpty ? AiCtl34KeysTab.fallback : m.keys
        VStack(alignment: .leading, spacing: 12) {
            if !admin {
                Text("Bare administrator kan endre nøkler og adresser. Du ser statusen.").font(PF.ui(12.5)).foregroundStyle(p.mut).padding(.horizontal, 4)
            }
            ForEach(list.filter { !m.fin || $0.id != "openrouter" }) { (k: AiKey34) in
                AiKeyCard34(k: k, admin: admin)
            }
            if !m.fin { AiTokens34(admin: admin) }
            if m.fin {
                Button { m.close(); store.paperGo("innst-ai") } label: {
                    Text("Eldre AI-oppsett i Finans ›").font(PF.ui(13, .bold)).foregroundStyle(p.mut)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 4)
            }
        }
    }

    static let fallback: [AiKey34] = [
        AiKey34(id: "ollama", name: "Ollama · hjemmeserver", set: false, tail: "", url: "", meta: "", link: ""),
        AiKey34(id: "gemini", name: "Google Gemini", set: false, tail: "", url: "", meta: "Gratisnivå: 15 forespørsler/min", link: "https://aistudio.google.com/apikey"),
        AiKey34(id: "groq", name: "Groq", set: false, tail: "", url: "", meta: "30 forespørsler/min", link: "https://console.groq.com/keys"),
        AiKey34(id: "openrouter", name: "OpenRouter", set: false, tail: "", url: "", meta: "Valgfri", link: "https://openrouter.ai/keys"),
        AiKey34(id: "roboflow", name: "Roboflow", set: false, tail: "", url: "", meta: "Strekkoder og pakkelapper", link: "https://app.roboflow.com"),
    ]
}

struct AiKeyCard34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let k: AiKey34
    let admin: Bool
    @State private var text: String = ""
    @State private var show: Bool = false

    var body: some View {
        let ollama: Bool = k.id == "ollama"
        let test: String = m.testing[k.id] ?? ""
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(k.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text(test.isEmpty ? status : test).font(PF.ui(12.5)).foregroundStyle(k.set || ollama ? p.pos : p.mut).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                AiMini34(title: test == "Tester …" ? "Tester …" : "Test") { m.testKey(k.id, store) }
            }
            if admin { field(ollama) }
            if !k.meta.isEmpty { Text(k.meta).font(PF.ui(12)).foregroundStyle(p.mut) }
            if !k.link.isEmpty, let u = URL(string: k.link) {
                Link(destination: u) {
                    Text((u.host ?? k.link) + " ›").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                }
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var status: String {
        if k.id == "ollama" { return k.url.isEmpty ? "Adresse fra serveren" : k.url }
        if !k.set { return "Ikke koblet til" }
        return k.tail.isEmpty ? "Nøkkel satt" : "Nøkkel satt · ••••" + k.tail
    }

    private func field(_ ollama: Bool) -> some View {
        HStack(spacing: 8) {
            Group {
                if show || ollama {
                    TextField("", text: $text, prompt: Text(ollama ? "http://192.168.1.40:11434" : "Ny nøkkel").foregroundColor(p.mut))
                } else {
                    SecureField("", text: $text, prompt: Text("Ny nøkkel").foregroundColor(p.mut))
                }
            }
            .font(PF.mono(13)).foregroundStyle(p.ink)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .submitLabel(.done)
            .onSubmit { save() }
            .padding(.horizontal, 12).frame(height: 40)
            .background(AiPal34.fld(p), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            if !ollama { AiMini34(title: show ? "Skjul" : "Vis") { show.toggle() } }
            AiMini34(title: "Lagre", filled: true) { save() }
        }
    }

    private func save() {
        m.saveKey(k.id, text, store)
        text = ""
    }
}

struct AiTokens34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let admin: Bool

    var body: some View {
        AiCard34(title: "GLIMT-API FOR EGNE SKRIPT") {
            if !m.freshToken.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ny nøkkel (vises bare én gang)").font(PF.ui(12, .bold)).foregroundStyle(p.pos)
                    Text(m.freshToken).font(PF.mono(12.5)).foregroundStyle(p.ink).textSelection(.enabled)
                }
                .padding(.vertical, 10)
            }
            ForEach(Array(m.tokensList.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiToken34)) in
                AiTokenRow34(t: pair.element, first: pair.offset == 0 && m.freshToken.isEmpty, admin: admin)
            }
            AiLine34()
            Button { m.newToken(store) } label: {
                Text("+ Ny nøkkel").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab).padding(.vertical, 12)
            }
            .buttonStyle(.plain)
        }
    }
}

struct AiTokenRow34: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    let t: AiToken34
    let first: Bool
    let admin: Bool

    var body: some View {
        VStack(spacing: 0) {
            if !first { AiLine34() }
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    Text(t.sub).font(PF.mono(11)).foregroundStyle(p.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                AiMini34(title: "Trekk tilbake", color: p.lab) { m.revoke(t, store) }
            }
            .padding(.vertical, 11)
        }
    }
}
