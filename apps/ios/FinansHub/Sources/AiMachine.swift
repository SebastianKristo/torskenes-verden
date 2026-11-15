import SwiftUI
import UIKit

/* ---------------- Prompt 38: AI-maskinen er en Mac mini M4 (16 GB samlet minne, 2 TB ekstern disk) ----------------
   claude-code-ai-maskin-mac-mini.md og claude-code-ai-kontroll-modellvalg-fiks.md, fasit AI Kontroll.dc.html → R.hw og fit.
   GET /api/ai/status → server.hw {model, chip, memGb, gpuBudgetGb, disk{name, totalGb, freeGb, external, mounted}, source},
   recommend[{key, text, env?}]. Uten hw: standard Mac mini M4 · 16 GB · 2 TB (ikke hardkodet GPU lenger).
   Merker i modellbiblioteket: PASSER ≤ 8 GB · TRANGT ≤ 10,5 GB · FOR STOR > 10,5 GB (av GPU-budsjettet 10,7 GB, skaleres
   med budsjettet fra serveren). Finans-modellvalg: alltid fire rader, tom tilstand «Ingen modeller ennå» + Installer modell ›. */

struct AiRec38: Identifiable, Hashable {
    let id: String
    let text: String
    let env: String
}

@MainActor
@Observable
final class AiHw38 {
    static let shared = AiHw38()

    var model: String = "Mac mini M4"
    var chip: String = "Apple M4"
    var memGb: Double = 16
    var gpuBudgetGb: Double = 10.7
    var diskName: String = "Ekstern disk"
    var diskTotalGb: Double = 2000
    var diskFreeGb: Double = 0
    var external: Bool = true
    var mounted: Bool = true
    var source: String = ""
    var warnings: [String] = []
    var recommend: [AiRec38] = AiHw38.defaultRecs
    /// Modellvalg fra /api/ai/routing (options[{id, label, local}]); text = navn, env = «lokal»/«sky».
    var options: [AiRec38] = []

    func takeOptions(_ rows: [[String: Any]]) {
        var out: [AiRec38] = []
        var seen: Set<String> = []
        for r in rows {
            for o in JS.list(r, "options") {
                guard let id = JS.str(o, "id"), !seen.contains(id) else { continue }
                // «missing»: valgt, men ikke installert/tilkoblet – vises som «… · ikke tilgjengelig», ikke som et valg.
                if JS.bool(o, "missing") == true { continue }
                seen.insert(id)
                let local: Bool = JS.bool(o, "local") ?? false
                out.append(AiRec38(id: id, text: JS.str(o, "label") ?? id, env: local ? "lokal" : "sky"))
            }
        }
        if !out.isEmpty { options = out }
    }

    static let defaultRecs: [AiRec38] = [
        AiRec38(id: "maxLoaded", text: "Én stor modell lastet om gangen", env: "OLLAMA_MAX_LOADED_MODELS=1"),
        AiRec38(id: "parallel", text: "Én forespørsel om gangen per modell", env: "OLLAMA_NUM_PARALLEL=1"),
        AiRec38(id: "kv", text: "KV-cache i q8_0 sparer minne", env: "OLLAMA_KV_CACHE_TYPE=q8_0"),
        AiRec38(id: "flash", text: "Flash attention på", env: "OLLAMA_FLASH_ATTENTION=1"),
        AiRec38(id: "keep", text: "Hold mest brukte modeller lastet i 30 min (treg HDD)", env: "keep_alive 30m"),
        AiRec38(id: "pmset", text: "Mac-en skal ikke sove (ellers spinner disken ned)", env: "sudo pmset -a sleep 0 disksleep 0"),
    ]

    /// Fra /api/ai/status (server-objektet eller roten).
    func parse(_ o: [String: Any]) {
        let srv: [String: Any] = JS.dict(o, "server") ?? o
        guard let hw = JS.dict(srv, "hw") ?? JS.dict(o, "hw") else { return }
        model = JS.str(hw, "model") ?? model
        chip = JS.str(hw, "chip") ?? chip
        memGb = JS.num(hw, "memGb") ?? memGb
        gpuBudgetGb = JS.num(hw, "gpuBudgetGb") ?? (memGb * 2 / 3)
        switch JS.str(hw, "source") ?? "" {
        case "host": source = "lest fra Ollama-verten"
        case "env": source = "fra serveroppsettet"
        case "standard": source = "standard"
        default: source = ""
        }
        warnings = JS.strings(hw, "warnings")
        if let d = JS.dict(hw, "disk") {
            diskName = JS.str(d, "name") ?? diskName
            diskTotalGb = JS.num(d, "totalGb") ?? diskTotalGb
            diskFreeGb = JS.num(d, "freeGb") ?? diskFreeGb
            external = JS.bool(d, "external") ?? external
            mounted = JS.bool(d, "mounted") ?? true
        }
        let recs: [[String: Any]] = JS.list(o, "recommend").isEmpty ? JS.list(srv, "recommend") : JS.list(o, "recommend")
        if !recs.isEmpty {
            recommend = recs.enumerated().compactMap { (pair: (offset: Int, element: [String: Any])) -> AiRec38? in
                let t: String = JS.str(pair.element, "text") ?? ""
                if t.isEmpty { return nil }
                return AiRec38(id: JS.str(pair.element, "key") ?? String(pair.offset), text: t, env: JS.str(pair.element, "env") ?? "")
            }
        }
    }

    /// «Mac mini M4 · 16 GB samlet minne · 2 TB ekstern disk»
    var title: String {
        let mem: String = String(Int(memGb.rounded())) + " GB samlet minne"
        let tb: Double = diskTotalGb / 1000
        let disk: String = tb >= 1 ? AiHw38.num(tb) + " TB" : String(Int(diskTotalGb)) + " GB"
        return model + " · " + mem + " · " + disk + (external ? " ekstern disk" : " disk")
    }

    nonisolated static func num(_ v: Double) -> String {
        if v == v.rounded() { return String(Int(v)) }
        return String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
    }

    /// PASSER ≤ 8 GB · TRANGT ≤ 10,5 GB · FOR STOR (for budsjettet 10,7 GB; skaleres med budsjettet).
    func fit(_ gb: Double) -> String {
        let b: Double = gpuBudgetGb > 0 ? gpuBudgetGb : 10.7
        if gb <= b * 0.75 { return "PASSER" }
        if gb <= b - 0.2 { return "TRANGT" }
        return "FOR STOR"
    }
}

/// Maskinkortet i Oversikt: modell, minne til modeller (GPU), modeller på ekstern disk og sky-budsjettet.
struct AiHw38Card: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }
    @MainActor private var h: AiHw38 { AiHw38.shared }

    var body: some View {
        let budget: Double = h.gpuBudgetGb > 0 ? h.gpuBudgetGb : 10.7
        let dt: Double = h.diskTotalGb > 0 ? h.diskTotalGb : (m.diskTotal > 0 ? m.diskTotal : 2000)
        let used: Double = m.vramUsed
        AiCard34(title: "AI-MASKIN") {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(h.title).font(PF.ui(14, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    Text(h.chip + (h.source.isEmpty ? "" : " · " + h.source)).font(PF.ui(11.5)).foregroundStyle(p.mut)
                }
                if h.external && !h.mounted {
                    Text("! Ekstern disk mangler · Ollama finner ikke modellene").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(h.warnings.filter { (w: String) -> Bool in !w.lowercased().contains("ekstern disk mangler") }, id: \.self) { (w: String) in
                    Text("! " + w).font(PF.ui(12.5, .semibold)).foregroundStyle(AiPal34.warn).fixedSize(horizontal: false, vertical: true)
                }
                AiBar34(label: "Minne til modeller (GPU)", value: AiHw38.num((used * 10).rounded() / 10) + " / " + AiHw38.num(budget) + " GB",
                        frac: used / budget, color: used > 9.5 ? AiPal34.warn : p.pos)
                AiBar34(label: "Modeller på " + (h.external ? "ekstern disk" : "disk"),
                        value: AiHw38.num(m.diskUsed.rounded()) + " / " + Self.thousands(dt) + " GB", frac: m.diskUsed / dt, color: p.ink)
                AiBar34(label: "Sky-budsjett denne måneden", value: AiCtl34.kr(m.cost30) + " / " + String(Int(m.budget)) + " kr",
                        frac: m.budget > 0 ? m.cost30 / m.budget : 0, color: p.lab)
                Text("Apple Silicon gir GPU-en ca. ⅔ av minnet. Avansert: sudo sysctl iogpu.wired_limit_mb=12288 gir mer, men lite igjen til macOS.")
                    .font(PF.ui(11.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 12)
        }
    }

    static func thousands(_ v: Double) -> String {
        let n: Int = Int(v.rounded())
        if n < 1000 { return String(n) }
        return String(n / 1000) + " " + String(format: "%03d", n % 1000)
    }
}

/// «ANBEFALT FOR DENNE MASKINEN» i Oversikt.
struct AiRecs38Card: View {
    @Environment(\.paper) private var p
    @MainActor private var h: AiHw38 { AiHw38.shared }

    var body: some View {
        AiCard34(title: "ANBEFALT FOR DENNE MASKINEN") {
            ForEach(Array(h.recommend.enumerated()), id: \.element.id) { (pair: (offset: Int, element: AiRec38)) in
                VStack(alignment: .leading, spacing: 0) {
                    if pair.offset > 0 { AiLine34() }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(pair.element.text).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                        if !pair.element.env.isEmpty {
                            Text(pair.element.env).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).textSelection(.enabled)
                        }
                    }
                    .padding(.vertical, 10)
                }
            }
        }
    }
}

/// Tom tilstand i «Hvilken modell gjør hva i Finans»: ingen modeller installert eller tilkoblet.
struct AiEmpty38: View {
    @Environment(\.paper) private var p
    @MainActor private var m: AiCtl34 { AiCtl34.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ingen modeller ennå").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
            Text("Installer en lokal modell eller koble til en sky-modell, så kan du velge hvem som gjør hva.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Button { m.scope = "alle"; m.pick("mod") } label: {
                Text("Installer modell ›").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 12)
    }
}
