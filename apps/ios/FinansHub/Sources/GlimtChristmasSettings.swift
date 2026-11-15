import SwiftUI

/* ---------------- Prompt 40: Innstillinger → Glimt → Julemodus ----------------
   prompts/prompt-40-pakke/claude-code-glimt-jul.md, fasit design/Glimt Brief.dc.html (mode settings) og
   Glimt Jul og Okonomi-ikon.dc.html (1b). Rett under figurvalget («GLIMT-FIGUR») og teksten om vennene, før Glimt-brief-bryteren.
   Kort (#fffdf8, radius 18) med rød lue-ikonrute (32 pt, #c8302a), «Julemodus», status, segment Auto · Av · På og fasevalg
   (Advent · Jul · Nyttår · Vinter) når På er valgt. Under: «Snø i Vær og brief» (På/Av) og «Julelyd på varsler» (Av / Myk bjelle).
   Lagres per bruker via PUT /api/glimt/settings {jul, julPhase, snow, julSound} (delvis PUT, samme som resten av Glimt-innstillingene),
   og lokalt i App Group (Glimt40Jul) så figurene og widgetene bytter antrekk med en gang. */

/// Lue-ikonet i ikonruta (24×24-stiene fra fasiten).
struct Glimt40HatGlyph: View {
    var body: some View {
        let vb: CGSize = CGSize(width: 24, height: 24)
        let k: CGFloat = 18.0 / 24.0
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M5 18 Q9 5 18 5 Q20 6 20 8 Q16 8 15 18 Z", vb: vb), stroke: Color.white, lw: 2.2, k: k, cap: .round)
            G36Part(shape: G36Svg(d: "M3 18 h14", vb: vb), stroke: Color.white, lw: 2.2, k: k, cap: .round)
            G36Part(shape: G36Svg(vb: vb, rect: CGRect(x: 18.4, y: 6.4, width: 3.2, height: 3.2), rx: 1.6), stroke: Color.white, lw: 2.2, k: k)
        }
        .frame(width: 18, height: 18)
    }
}

struct Glimt40JulCard: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Glimt35Model { Glimt35Model.shared }

    var body: some View {
        let c: Glimt35Cfg = m.cfg
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Glimt40HatGlyph()
                    .frame(width: 32, height: 32)
                    .background(G35.c(0xc8302a), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Julemodus").font(PF.ui(15, .bold)).foregroundStyle(Brief34C.ink)
                    Text(Glimt40Jul.status(mode: c.jul, manual: c.julPhase)).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Glimt40ModeSegment(selected: c.jul) { (k: String) in setMode(k) }
            if c.jul == "pa" {
                Glimt40PhaseChips(selected: c.julPhase) { (k: String) in setPhase(k) }
                    .transition(.opacity)
            }
            Text(note(c)).font(PF.ui(12)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
            Rectangle().fill(Brief34C.line).frame(height: 1)
            Glimt35ToggleRow(name: "Snø i Vær og brief", sub: "Rolig snøfall når det snør eller er minus", on: c.snow) { setSnow(!c.snow) }
            Glimt40SoundRow(selected: c.julSound) { (k: String) in setSound(k) }
        }
        .padding(14)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .animation(.easeOut(duration: 0.2), value: c.jul)
    }

    private func note(_ c: Glimt35Cfg) -> String {
        switch c.jul {
        case "av": return "Glimt ser ut som vanlig hele året."
        case "pa":
            let n: String = (Glimt40JulPhase.from(c.julPhase) ?? .advent).label
            return "Slått på manuelt med «" + n + "». Gjelder til du slår det av eller velger Auto."
        default: return "Slår seg på 1. desember og av 13. januar (tjugendedag jul)."
        }
    }

    private func setMode(_ k: String) {
        m.change(["jul": k], store) { (c: inout Glimt35Cfg) in c.jul = k }
    }

    private func setPhase(_ k: String) {
        m.change(["julPhase": k, "jul": "pa"], store) { (c: inout Glimt35Cfg) in
            c.julPhase = k
            c.jul = "pa"
        }
    }

    private func setSnow(_ v: Bool) {
        m.change(["snow": v], store) { (c: inout Glimt35Cfg) in c.snow = v }
    }

    private func setSound(_ k: String) {
        m.change(["julSound": k], store) { (c: inout Glimt35Cfg) in c.julSound = k }
    }
}

/// Auto · Av · På (valgt = blekk, 34 pt).
struct Glimt40ModeSegment: View {
    let selected: String
    let pick: (String) -> Void

    private static let opts: [(String, String)] = [("auto", "Auto"), ("av", "Av"), ("pa", "På")]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Glimt40ModeSegment.opts, id: \.0) { (o: (String, String)) in
                let on: Bool = o.0 == selected
                Button { pick(o.0) } label: {
                    Text(o.1).font(PF.ui(13, .bold))
                        .foregroundStyle(on ? Brief34C.paper : Brief34C.ink)
                        .frame(maxWidth: .infinity).frame(height: 34)
                        .background(on ? Brief34C.ink : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Brief34C.rgb(0xf1ece2), in: Capsule())
    }
}

/// Advent · Jul · Nyttår · Vinter (valgt = rød).
struct Glimt40PhaseChips: View {
    let selected: String
    let pick: (String) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Glimt40JulPhase.jule, id: \.rawValue) { (ph: Glimt40JulPhase) in
                let on: Bool = ph.rawValue == selected
                Button { pick(ph.rawValue) } label: {
                    Text(ph.label).font(PF.ui(12.5, .bold))
                        .foregroundStyle(on ? Color.white : Brief34C.ink)
                        .padding(.horizontal, 13).frame(height: 32)
                        .background(on ? Brief34C.red : Color.clear, in: Capsule())
                        .overlay(Capsule().strokeBorder(on ? Brief34C.red : Brief34C.rgb(0xd8d1c2), lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
    }
}

/// Julelyd på varsler: Av (standard) / Myk bjelle.
struct Glimt40SoundRow: View {
    let selected: String
    let pick: (String) -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Julelyd på varsler").font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink)
                Text("Lav og kort bjelle på Glimt-varsler").font(PF.ui(12)).foregroundStyle(Brief34C.mut)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 2) {
                seg("av", "Av")
                seg("bjelle", "Bjelle")
            }
            .padding(3)
            .background(Brief34C.rgb(0xf1ece2), in: Capsule())
            .frame(width: 150)
        }
        .padding(.vertical, 4)
    }

    private func seg(_ k: String, _ n: String) -> some View {
        let on: Bool = k == selected
        return Button { pick(k) } label: {
            Text(n).font(PF.ui(12.5, .bold))
                .foregroundStyle(on ? Brief34C.paper : Brief34C.ink)
                .frame(maxWidth: .infinity).frame(height: 30)
                .background(on ? Brief34C.ink : Color.clear, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Når snøfallet i julemodus vises i Vær og briefen: snø (WMO 71–77, 85–86) eller minusgrader.
enum Glimt40Weather {
    static func snowy(code: Int, temp: Double) -> Bool {
        let snowCode: Bool = (71...77).contains(code) || code == 85 || code == 86
        return snowCode || temp < 0
    }
}

extension Glimt40Weather {
    /// Briefen: snø i dag (ikon/tekst) eller minusgrader i temperaturteksten («−4°»).
    static func briefSnowy(_ b: Brief34) -> Bool {
        if b.icon == "sno" || b.cond.lowercased().contains("snø") { return true }
        let t: String = b.temp.replacingOccurrences(of: "−", with: "-").filter { $0 == "-" || $0.isNumber || $0 == "," || $0 == "." }
        if let v = Double(t.replacingOccurrences(of: ",", with: ".")) { return v < 0 }
        return false
    }
}

/* ---------- Briefen i julemodus: nedtelling og «Dagens luke» ---------- */

/// brief.jul = {phase, countdown, luke:{n, text}} (SERVER40). Uten serverdata: nedtelling til julaften lokalt i advent.
struct Brief40Jul: Hashable {
    var phase: String = ""
    var countdown: Int? = nil
    var lukeN: Int = 0
    var lukeText: String = ""
    var yearTitle: String = ""

    static var cached: Brief40Jul? {
        guard let d = WidgetShared.defaults.data(forKey: Brief34.cacheKey),
              let any = try? JSONSerialization.jsonObject(with: d), var o = any as? [String: Any] else { return local }
        if let inner = o["brief"] as? [String: Any] { o = inner }
        guard let j = o["jul"] as? [String: Any] else { return local }
        var x: Brief40Jul = Brief40Jul()
        x.phase = (j["phase"] as? String) ?? ""
        x.countdown = (j["countdown"] as? NSNumber)?.intValue
        if let l = j["luke"] as? [String: Any] {
            x.lukeN = (l["n"] as? NSNumber)?.intValue ?? 0
            x.lukeText = (l["text"] as? String) ?? ""
        }
        if let y = o["year"] as? [String: Any] { x.yearTitle = (y["title"] as? String) ?? "Året ditt" }
        return x
    }

    /// Bare nedtelling (lokalt), når julemodus er på i advent.
    static var local: Brief40Jul? {
        guard Glimt40Jul.current() == .advent, let n = Glimt40Jul.daysToChristmas() else { return nil }
        return Brief40Jul(phase: "advent", countdown: n)
    }
}

struct Brief40JulCard: View {
    var body: some View {
        if Glimt40JulLive.shared.phase() != nil, let j = Brief40Jul.cached {
            VStack(alignment: .leading, spacing: 10) {
                if let n = j.countdown, n > 0 {
                    Text("JULEMODUS · NEDTELLING").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(Brief34C.red)
                    Text(n == 1 ? "1 dag til jul" : "\(n) dager til jul").font(PF.serif(28, medium: true)).foregroundStyle(Brief34C.ink)
                } else if j.phase == "jul" {
                    Text("God jul!").font(PF.serif(28, medium: true)).foregroundStyle(Brief34C.ink)
                }
                if j.lukeN > 0 && !j.lukeText.isEmpty {
                    HStack(spacing: 10) {
                        VStack(spacing: 0) {
                            Text("LUKE").font(PF.ui(9, .bold)).tracking(0.5)
                            Text("\(j.lukeN)").font(PF.serif(20, medium: true))
                        }
                        .foregroundStyle(Color.white)
                        .frame(width: 44, height: 44)
                        .background(Brief34C.red, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Dagens luke").font(PF.ui(13.5, .bold)).foregroundStyle(Brief34C.ink)
                            Text(j.lukeText).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(12)
                    .background(Brief34C.rgb(0xf7ece4), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                if !j.yearTitle.isEmpty && j.phase == "nyttar" {
                    Text(j.yearTitle).font(PF.serif(22, medium: true)).foregroundStyle(Brief34C.ink)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }
}
