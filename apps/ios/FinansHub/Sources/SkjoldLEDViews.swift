import SwiftUI
import UIKit

/* ---------------- Prompt 78 (LEDIOS): «💡 Vis i skapet», LED-oppsett per skap og kalibreringsveiviseren ----------------
 Detaljen: «💡 Vis i skapet» tenner LED-en over skuffen (i durationS sekunder, så gjenoppretter serveren WLED slik den var).
 Trefflista: 💡 på hver rad, og «💡 Vis alle» lyser opp inntil 10 treff samtidig. Linja nederst viser «Lyser i skapet · n s» og «Slå av».
 ⋯ → «LED-oppsett»: vert, på/av, farge, lysstyrke, varighet, blink, skuffgeometri, rader (start, antall, retning, pitch),
 test (alle, rad, én LED), statusmerke (svarer WLED?) og veiviseren «Trykk på skuffen som lyser». */

/* ---------- Vis i skapet ---------- */

/// Stor knapp på detaljsiden.
struct Skj78LocateButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let part: Skj76Part

    var body: some View {
        if l.canLocate(part) {
            VStack(alignment: .leading, spacing: 8) {
                Skj76Button(title: l.busy ? "Lyser opp …" : "💡 Vis i skapet", filled: true) {
                    Task { @MainActor in await l.locate(part, store) }
                }
                .disabled(l.busy)
                .accessibilityLabel("Vis i skapet: lys opp skuffen")
                if !l.error.isEmpty { Playback44Note(text: l.error, red: true) }
            }
        } else if let c = part.loc?.cabinetId, !l.missing, !c.isEmpty, l.config(c) != nil {
            Button { m.sheet = .leds(c) } label: {
                Label("Sett opp LED over skuffene", systemImage: "lightbulb").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            }
            .buttonStyle(.plain)
        }
    }
}

/// Liten 💡 på hver rad i trefflista.
struct Skj78RowButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }
    let part: Skj76Part

    var body: some View {
        if l.canLocate(part) {
            Button {
                Task { @MainActor in await l.locate(part, store) }
            } label: {
                Text("💡").font(.system(size: 18)).frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(l.busy)
            .accessibilityLabel("Vis " + part.name + " i skapet")
        }
    }
}

/// «💡 Vis alle» over trefflista (maks 20 skuffer, Prompt 79).
struct Skj78AllButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }
    let parts: [Skj76Part]

    var body: some View {
        let n: Int = Swift.min(20, parts.filter { l.canLocate($0) }.count)
        if n > 1 {
            Button {
                Task { @MainActor in await l.locateAll(parts, store) }
            } label: {
                Text("💡 Vis alle (\(n))").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 10).frame(height: 30).overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(l.busy)
        }
    }
}

/// Linja nederst mens skuffer lyser: «Lyser i skapet · 4-2 · 27 s» og «Slå av».
struct Skj78LitBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }

    var body: some View {
        if !l.lit.isEmpty {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                bar
            }
        }
    }

    private var where_: String {
        let first: [String] = l.lit.prefix(3).map { "\($0.row)-\($0.col)" }
        let more: String = l.lit.count > 3 ? " +\(l.lit.count - 3)" : ""
        return first.joined(separator: ", ") + more
    }

    private var bar: some View {
        HStack(spacing: 10) {
            Text("💡").font(.system(size: 16))
            VStack(alignment: .leading, spacing: 1) {
                Text("Lyser i skapet · " + where_).font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg).lineLimit(1)
                Text("\(l.secondsLeft) s igjen").font(PF.mono(10.5)).foregroundStyle(p.bg.opacity(0.75))
            }
            Spacer(minLength: 4)
            Button("Slå av") { Task { @MainActor in await l.off(store) } }
                .font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(p.ink, in: Capsule())
        .padding(.horizontal, 16)
    }
}

/* ---------- Statusmerke ---------- */

struct Skj78StatusBadge: View {
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }
    let cabinetId: String

    var body: some View {
        let s: Skj78Status? = l.status[cabinetId]
        let checking: Bool = l.checking.contains(cabinetId)
        HStack(spacing: 6) {
            if checking {
                ProgressView().controlSize(.small)
            } else {
                Circle().fill(dot(s)).frame(width: 9, height: 9)
            }
            Text(checking ? "Sjekker WLED …" : (s?.text ?? "Ikke sjekket")).font(PF.ui(12.5, .semibold))
                .foregroundStyle(p.ink).lineLimit(2)
        }
        .accessibilityElement(children: .combine)
    }

    private func dot(_ s: Skj78Status?) -> Color {
        guard let s else { return p.mut }
        return s.ok ? Color.green : Color.red
    }
}

/* ---------- LED-oppsett per skap ---------- */

struct Skj78Setup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let startId: String
    @State private var cabId: String = ""
    @State private var c: Skj78Config = Skj78Config()
    @State private var perMeter: Double = 60
    @State private var testIndex: Int = 0
    @State private var busy: Bool = false
    @State private var loaded: Bool = false

    private var cab: Skj76Cabinet? { m.cabinets.first { $0.id == cabId } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "LED over skuffene", title: cab?.name ?? "LED-oppsett")
                if l.missing { Playback44Note(text: "Serveren har ikke LED-støtte i Skjold Lab ennå (oppdater Homelab).", red: false) }
                chooser
                if cab != nil {
                    controller
                    look
                    geometry
                    Skj78RowsEditor(c: $c, rows: cab?.rows ?? 12, cols: cab?.cols ?? 5, perMeter: perMeter) { (r: Int) in testRow(r) }
                    tests
                    Skj76Button(title: busy ? "Lagrer …" : "Lagre LED-oppsettet", icon: "checkmark", filled: true) { save() }
                        .disabled(busy)
                    Skj76Button(title: "Kalibrer: trykk på skuffen som lyser", icon: "scope") { calibrate() }
                        .disabled(!c.usable || c.rows.isEmpty)
                    // Prompt 79: «Feilsøk LED» (stegvis test når stripa får tilkobling men ikke lyser).
                    Skj76Button(title: "Feilsøk LED", icon: "stethoscope") { diagnose() }
                        .disabled(!c.usable)
                }
                Skj78AutoSettings()
                Text("Homelab-serveren snakker bare med WLED i hjemmenettet (private adresser, .local/.lan). Se tools/skjoldlab-led for koblingsskjema.")
                    .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .task { await boot() }
    }

    private func boot() async {
        if loaded { return }
        loaded = true
        let first: String = startId.isEmpty || startId == "ny" ? (m.cabinet?.id ?? "") : startId
        await choose(first)
    }

    private func choose(_ id: String) async {
        cabId = id
        c = l.config(id) ?? Skj78Config()
        perMeter = Skj78Setup.meterOf(c)
        await l.loadConfig(id, store)
        if cabId == id, let fresh = l.config(id) {
            c = fresh
            perMeter = Skj78Setup.meterOf(fresh)
        }
        if c.usable { await l.checkStatus(id, store) }
    }

    nonisolated static func meterOf(_ c: Skj78Config) -> Double {
        let pitch: Double = c.ledPitchMm > 0 ? c.ledPitchMm : (c.rows.first?.pitchMm ?? 0)
        if pitch <= 0 { return 60 }
        return (1000 / pitch).rounded()
    }

    private var chooser: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(m.cabinets) { (x: Skj76Cabinet) in chip(x) }
            }
        }
    }

    private func chip(_ x: Skj76Cabinet) -> some View {
        let on: Bool = cabId == x.id
        let lamp: Bool = l.config(x.id)?.usable ?? false
        return Button { Task { @MainActor in await choose(x.id) } } label: {
            Text((lamp ? "💡 " : "") + x.name).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    /* Kontroller: på/av, vert og status. */
    private var controller: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "WLED-kontroller")
                Toggle(isOn: $c.enabled) {
                    Text("LED over skuffene").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                }
                .tint(p.lab)
                Skj76Field(label: "Vert (IP eller navn i hjemmenettet)", text: $c.host, keyboard: .URL)
                    .textInputAutocapitalization(.never).autocorrectionDisabled(true)
                Text("F.eks. 192.168.1.50 eller wled-skap.local. Flere skap kan dele én kontroller med ulike start-LED-er.")
                    .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Skj78StatusBadge(cabinetId: cabId)
                    Spacer(minLength: 4)
                    Button("Sjekk") { Task { @MainActor in await l.checkStatus(cabId, store) } }
                        .font(PF.ui(13.5, .bold)).foregroundStyle(p.lab)
                }
            }
        }
    }

    /* Farge, lysstyrke, varighet og blink. */
    private var look: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Lyset")
                HStack(spacing: 8) {
                    ForEach(Skjold78.swatches, id: \.self) { (h: String) in swatch(h) }
                }
                Skj76Field(label: "Farge (hex)", text: $c.color)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Lysstyrke: \(c.brightness)").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
                    Slider(value: brightness, in: 10...255, step: 1).tint(p.lab)
                }
                Stepper("Lyser i \(c.durationS) s", value: $c.durationS, in: 5...300, step: 5).font(PF.ui(14.5)).foregroundStyle(p.ink)
                Toggle(isOn: $c.blink) {
                    Text("Blink").font(PF.ui(14.5)).foregroundStyle(p.ink)
                }
                .tint(p.lab)
            }
        }
    }

    private var brightness: Binding<Double> {
        Binding<Double>(get: { Double(c.brightness) }, set: { c.brightness = Int($0) })
    }

    private func swatch(_ h: String) -> some View {
        let on: Bool = Skjold78.hex(c.color) == h
        return Button {
            Haptics.shared.tick()
            c.color = h
        } label: {
            Circle().fill(Skjold78.color(h)).frame(width: 30, height: 30)
                .overlay(Circle().stroke(on ? p.ink : p.line, lineWidth: on ? 3 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Farge " + h)
    }

    /* Skuffgeometri og LED-tetthet. */
    private var geometry: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Skuffene")
                Skj78Number(label: "Avstand mellom skuffene (mm)", value: $c.drawerPitchMm)
                Skj78Number(label: "Midten av første skuff fra stripas start (mm)", value: $c.firstDrawerXmm)
                Skj78Number(label: "LED-er per meter", value: $perMeter)
                Text("60/m gir 16,67 mm mellom LED-ene. Nærmeste LED over midten av skuffen lyser; veiviseren kan overstyre hver skuff.")
                    .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /* Test: alle, én rad (i radlista) eller én LED. */
    private var tests: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Test (lyser i \(Skjold78.testSeconds) s)")
                Skj76Button(title: "Test hele stripa", icon: "lightbulb.max") { runTest("all", nil, nil) }
                HStack(spacing: 8) {
                    Stepper("LED \(testIndex)", value: $testIndex, in: 0...Swift.max(0, c.ledTotal + 50)).font(PF.ui(14.5)).foregroundStyle(p.ink)
                    Button("Test") { runTest("index", nil, testIndex) }.font(PF.ui(13.5, .bold)).foregroundStyle(p.lab)
                }
                if !c.usable {
                    Text("Slå på LED og fyll inn vert, og lagre, før du tester.").font(PF.ui(12)).foregroundStyle(p.mut)
                }
            }
        }
    }

    private func testRow(_ r: Int) { runTest("row", r, nil) }

    private func runTest(_ mode: String, _ row: Int?, _ index: Int?) {
        let id: String = cabId
        Task { @MainActor in
            if await l.test(id, mode: mode, row: row, index: index, store) {
                m.flash("Lyser i \(Skjold78.testSeconds) s")
            }
        }
    }

    private func save() {
        busy = true
        let pitch: Double = Skjold78.pitch(perMeter: perMeter)
        var out: Skj78Config = c
        out.color = Skjold78.hex(c.color)
        out.ledPitchMm = pitch
        // «LED-er per meter» endret: alle radene får den nye avstanden.
        if abs(perMeter - Skj78Setup.meterOf(c)) > 0.5 {
            out.rows = c.rows.map { (r: Skj78Row) -> Skj78Row in
                var x: Skj78Row = r
                x.pitchMm = pitch
                return x
            }
        }
        let id: String = cabId
        Task { @MainActor in
            defer { busy = false }
            if await l.saveConfig(id, out, store) {
                c = l.config(id) ?? out
                if c.usable { await l.checkStatus(id, store) }
            }
        }
    }

    private func diagnose() {
        let id: String = cabId
        let out: Skj78Config = c
        Task { @MainActor in
            if out != l.config(id) {
                if !(await l.saveConfig(id, out, store)) { return }
            }
            m.sheet = .diagnose(id)
        }
    }

    private func calibrate() {
        let id: String = cabId
        let out: Skj78Config = c
        Task { @MainActor in
            // Veiviseren bruker det lagrede oppsettet på serveren.
            if out != l.config(id) {
                if !(await l.saveConfig(id, out, store)) { return }
            }
            m.sheet = .calibrate(id)
        }
    }
}

/// Tallfelt (desimaltall med komma eller punktum).
struct Skj78Number: View {
    @Environment(\.paper) private var p
    let label: String
    @Binding var value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            TextField(label, value: $value, format: .number.precision(.fractionLength(0...2)))
                .font(PF.ui(15.5)).foregroundStyle(p.ink).keyboardType(.decimalPad)
                .padding(.horizontal, 12).frame(height: 44)
                .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
        }
    }
}

/// Radene: standard (samme retning eller serpentine) og hver rad med start, antall, retning, pitch og forskyvning.
struct Skj78RowsEditor: View {
    @Environment(\.paper) private var p
    @Binding var c: Skj78Config
    let rows: Int
    let cols: Int
    let perMeter: Double
    let test: (Int) -> Void

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    PLabel(text: "Rader på stripa")
                    Spacer()
                    Text("\(c.ledTotal) LED-er").font(PF.mono(10.5)).foregroundStyle(p.mut)
                }
                HStack(spacing: 8) {
                    Skj76Button(title: "Samme retning", icon: "arrow.right") { make(false) }
                    Skj76Button(title: "Serpentine", icon: "arrow.turn.down.left") { make(true) }
                }
                Text("Standard: rad 1 øverst, hver rad sin del av stripa. Serpentine = annenhver rad går baklengs.")
                    .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                ForEach($c.rows) { (r: Binding<Skj78Row>) in
                    Skj78RowLine(r: r, test: test)
                    Divider().overlay(p.line)
                }
            }
        }
    }

    private func make(_ serpentine: Bool) {
        Haptics.shared.tick()
        let pitch: Double = Skjold78.pitch(perMeter: perMeter)
        c.ledPitchMm = pitch
        c.rows = Skjold78.defaultRows(rows: rows, cols: cols, pitchMm: pitch, drawerPitchMm: c.drawerPitchMm, serpentine: serpentine)
    }
}

struct Skj78RowLine: View {
    @Environment(\.paper) private var p
    @Binding var r: Skj78Row
    let test: (Int) -> Void
    @State private var more: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("Rad \(r.row)").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Text("LED \(r.start)–\(r.start + Swift.max(0, r.count - 1))").font(PF.mono(10.5)).foregroundStyle(p.mut)
                Spacer(minLength: 4)
                Button { r.reverse.toggle() } label: {
                    Image(systemName: r.reverse ? "arrow.left" : "arrow.right").font(.system(size: 13, weight: .bold)).foregroundStyle(p.ink)
                        .frame(width: 36, height: 32).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(r.reverse ? "Baklengs" : "Samme retning")
                Button("Test") { test(r.row) }.font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                Button { more.toggle() } label: {
                    Image(systemName: more ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(p.mut)
                        .frame(width: 30, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Flere valg for rad \(r.row)")
            }
            if more { details }
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            Stepper("Start: LED \(r.start)", value: $r.start, in: 0...4000).font(PF.ui(14)).foregroundStyle(p.ink)
            Stepper("Antall: \(r.count)", value: $r.count, in: 1...600).font(PF.ui(14)).foregroundStyle(p.ink)
            Skj78Number(label: "Avstand mellom LED-ene (mm)", value: $r.pitchMm)
            Skj78Number(label: "Forskyvning fra skapets kant (mm)", value: $r.offsetMm)
        }
    }
}

/// «Lys opp automatisk når jeg åpner et treff» og «… når Glimt svarer».
struct Skj78AutoSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 12) {
                toggle("Lys opp automatisk når jeg åpner et treff", "Skuffen lyser så snart du åpner en del som ligger i et skap med LED.",
                       Binding<Bool>(get: { l.autoOpen }, set: { l.autoOpen = $0; save() }))
                Divider().overlay(p.line)
                toggle("Lys opp når Glimt svarer", "Spør du Glimt «hvor er M3-skruene?», tennes skuffen også.",
                       Binding<Bool>(get: { l.autoGlimt }, set: { l.autoGlimt = $0; save() }))
                if !l.settingsError.isEmpty { Playback44Note(text: l.settingsError, red: true) }
            }
        }
    }

    private func toggle(_ t: String, _ sub: String, _ b: Binding<Bool>) -> some View {
        Toggle(isOn: b) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.lab)
    }

    private func save() {
        Task { @MainActor in await l.saveSettings(store) }
    }
}

/* ---------- Kalibreringsveiviseren ---------- */

/// Én LED lyser; brukeren trykker på skuffen som lyser (lagres som overstyring), og går videre med «Neste LED».
struct Skj78Calibrate: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let cabinetId: String
    @State private var index: Int = 0
    @State private var step: Int = 3
    @State private var note: String = ""
    @State private var saved: Int = 0
    @State private var booted: Bool = false

    private var cab: Skj76Cabinet? { m.cabinets.first { $0.id == cabinetId } }
    private var conf: Skj78Config { l.config(cabinetId) ?? Skj78Config() }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Kalibrer LED", title: "Trykk på skuffen som lyser")
                Text("LED \(index) lyser nå. Trykk på skuffen den står over. Lyser den mellom to skuffer, gå til neste LED.")
                    .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                if !note.isEmpty { Playback44Note(text: note, red: true) }
                drawing
                nav
                Stepper("Hopp \(step) LED-er etter hver skuff", value: $step, in: 1...10).font(PF.ui(14)).foregroundStyle(p.ink)
                Text(saved == 1 ? "1 skuff er kalibrert" : "\(saved) skuffer er kalibrert").font(PF.mono(11)).foregroundStyle(p.lab)
                Skj76Button(title: "Ferdig", icon: "checkmark", filled: true) { finish() }
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .task { await boot() }
    }

    @ViewBuilder
    private var drawing: some View {
        if let c = cab {
            PCard {
                Skj76Drawing(rows: c.rows, cols: c.cols, map: m.maps[c.id], mark: guess(c), pulse: index) { (r: Int, k: Int) in
                    pick(r, k)
                }
                .frame(maxWidth: CGFloat(c.cols) * 78 + 40)
                .frame(maxWidth: .infinity)
            }
        }
    }

    /// Skuffen LED-en hører til etter dagens oppsett (uthevet som forslag).
    private func guess(_ c: Skj76Cabinet) -> Skj76Loc? {
        guard let rc = Skjold78.drawer(conf, index: index, cols: c.cols) else { return nil }
        return Skj76Loc(cabinetId: c.id, cabinet: c.name, row: rc.0, col: rc.1, comp: nil, text: "")
    }

    private var nav: some View {
        HStack(spacing: 8) {
            Skj76Button(title: "Forrige LED", icon: "chevron.left") { go(index - 1) }
                .disabled(index <= 0)
            Skj76Button(title: "Neste LED", icon: "chevron.right") { go(index + 1) }
        }
    }

    private func boot() async {
        if booted { return }
        booted = true
        let c: Skj78Config = conf
        let pitch: Double = c.rows.first?.pitchMm ?? Skjold78.ledPer60
        step = Swift.max(1, Int((c.drawerPitchMm / Swift.max(1, pitch)).rounded()))
        index = Skjold78.index(c, row: 1, col: 1) ?? 0
        if m.maps[cabinetId] == nil { await m.loadMap(cabinetId, store) }
        await light()
    }

    private func go(_ i: Int) {
        Haptics.shared.tick()
        index = Swift.max(0, i)
        Task { @MainActor in await light() }
    }

    private func light() async {
        note = await l.calibrate(cabinetId, index: index, store)
    }

    private func pick(_ r: Int, _ k: Int) {
        let i: Int = index
        Task { @MainActor in
            if await l.override(cabinetId, row: r, col: k, index: i, store) {
                saved += 1
                m.flash("Rad \(r) · Skuff \(k) = LED \(i)")
                go(i + step)
            }
        }
    }

    private func finish() {
        Task { @MainActor in await l.off(store) }
        m.sheet = .leds(cabinetId)
    }
}
