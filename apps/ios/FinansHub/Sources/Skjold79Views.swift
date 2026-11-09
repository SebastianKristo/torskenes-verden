import SwiftUI
import UIKit

/* ---------------- Prompt 79 (PICKIOS): plukkliste og «Feilsøk LED» i Skjold Lab ----------------
 + på hvert treff og på detaljsiden legger delen i plukklista (✓ når den er med, nytt trykk fjerner den).
 Linja nederst: «Plukkliste (3)» · «💡 Vis alle med LED» · åpne. Arket viser delene med bilde, navn, plassering og
 fargeprikk når de lyser, ± for antall jeg tar, «Fjern», «Tøm» og «Ta ut av lager» (med angre).
 LED-oppsettet får «Feilsøk LED»: stegene fra serveren, og «Lyste stripa rødt? Ja/Nei» og «Lyste én LED blått? Ja/Nei». */

/* ---------- + / ✓ ---------- */

/// Liten +/✓ på hver rad i trefflista.
struct Skj79AddButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Skjold79 { Skjold79.shared }
    let part: Skj76Part

    var body: some View {
        let on: Bool = k.has(part.id)
        Button {
            k.toggle(part, store)
        } label: {
            Image(systemName: on ? "checkmark" : "plus")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(on ? p.onLab : p.ink)
                .frame(width: 30, height: 30)
                .background(on ? p.lab : Color.clear, in: Circle())
                .overlay(Circle().stroke(on ? Color.clear : p.line, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(on ? "Fjern " + part.name + " fra plukklista" : "Legg " + part.name + " i plukklista")
    }
}

/// Stor knapp på detaljsiden.
struct Skj79DetailButton: View {
    @Environment(Store.self) private var store
    @MainActor private var k: Skjold79 { Skjold79.shared }
    let part: Skj76Part

    var body: some View {
        let on: Bool = k.has(part.id)
        Skj76Button(title: on ? "I plukklista ✓" : "Legg i plukklista", icon: on ? "checkmark.circle.fill" : "plus.circle") {
            k.toggle(part, store)
        }
        .accessibilityLabel(on ? "Fjern fra plukklista" : "Legg i plukklista")
    }
}

/// Fargeprikken for en del som lyser.
struct Skj79Dot: View {
    @Environment(\.paper) private var p
    let hex: String
    var size: CGFloat = 12

    var body: some View {
        if !hex.isEmpty {
            Circle().fill(Skjold78.color(hex)).frame(width: size, height: size)
                .overlay(Circle().stroke(p.line, lineWidth: 1))
                .accessibilityLabel("Lyser")
        }
    }
}

/* ---------- Linja nederst ---------- */

/// «Plukkliste (3)» · «💡 Vis alle med LED» · åpne.
struct Skj79Bar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Skjold79 { Skjold79.shared }
    @MainActor private var l: Skjold78 { Skjold78.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        if k.count > 0 {
            HStack(spacing: 8) {
                Button { open() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "list.bullet.rectangle").font(.system(size: 15, weight: .semibold))
                        Text("Plukkliste (\(k.count))").font(PF.ui(14, .bold)).lineLimit(1)
                    }
                    .foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Åpne plukklista, \(k.count) deler")
                if k.lightable > 0 {
                    Button {
                        Task { @MainActor in await k.lightAll(store) }
                    } label: {
                        Text(l.busy ? "Lyser opp …" : "💡 Vis alle med LED").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                            .lineLimit(1).padding(.horizontal, 12).frame(height: 34)
                            .background(p.bg, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(l.busy)
                }
                Button { open() } label: {
                    Image(systemName: "chevron.up").font(.system(size: 14, weight: .bold)).foregroundStyle(p.bg)
                        .frame(width: 34, height: 34).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Åpne plukklista")
            }
            .padding(.leading, 16).padding(.trailing, 8).padding(.vertical, 8)
            .background(p.ink, in: Capsule())
            .shadow(color: Color.black.opacity(0.18), radius: 8, y: 3)
            .padding(.horizontal, 16)
        }
    }

    private func open() {
        Haptics.shared.tap()
        m.sheet = .pick
    }
}

/* ---------- Arket ---------- */

struct Skj79Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Skjold79 { Skjold79.shared }
    @MainActor private var l: Skjold78 { Skjold78.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @State private var confirm: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Skjold Lab", title: "Plukkliste")
                if k.items.isEmpty {
                    PCard {
                        Text("Plukklista er tom. Trykk + på en del i lista eller på detaljsiden for å legge den til.")
                            .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    lightCard
                    list
                    actions
                }
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .task {
            k.ensureLoaded()
            k.refreshFromParts()
        }
        .confirmationDialog("Ta ut av lager?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Ta ut \(k.count) deler") { Task { @MainActor in await k.takeOut(store) } }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Antallet trekkes fra for alle delene i lista. Du kan angre i 10 sekunder.")
        }
    }

    /* «💡 Vis alle med LED», nedtelling og «Slå av». */
    private var lightCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            if l.lit.isEmpty {
                if k.lightable > 0 {
                    Skj76Button(title: l.busy ? "Lyser opp …" : "💡 Vis alle med LED (\(Swift.min(Skjold79.maxLit, k.lightable)))", filled: true) {
                        Task { @MainActor in await k.lightAll(store) }
                    }
                    .disabled(l.busy)
                } else {
                    Text("Ingen av delene ligger i et skap med LED.").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    HStack(spacing: 10) {
                        Text("💡 Lyser · \(l.secondsLeft) s igjen").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                        Spacer(minLength: 4)
                        Button("Slå av") { Task { @MainActor in await l.off(store) } }
                            .font(PF.ui(14, .bold)).foregroundStyle(p.lab)
                    }
                }
            }
            if !l.error.isEmpty { Playback44Note(text: l.error, red: true) }
        }
    }

    private var list: some View {
        VStack(spacing: 0) {
            ForEach(Array(k.items.enumerated()), id: \.element.id) { (i: Int, x: Skj79Item) in
                if i > 0 { Divider().overlay(p.line) }
                Skj79Line(item: x)
            }
        }
        .glass50Card(p, radius: 20)
    }

    private var actions: some View {
        VStack(spacing: 8) {
            Skj76Button(title: k.taking ? "Tar ut …" : "Ta ut av lager", icon: "tray.and.arrow.up", filled: true) { confirm = true }
                .disabled(k.taking)
            Skj76Button(title: "Tøm plukklista", icon: "trash", danger: true) { k.clear(store) }
        }
    }
}

/// Én linje i plukklista: bilde, navn, plassering, fargeprikk, ± og «Fjern».
struct Skj79Line: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Skjold79 { Skjold79.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let item: Skj79Item

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            top
            bottom
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private var top: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .topTrailing) {
                Skj76Thumb(path: item.thumbUrl, size: 48)
                Skj79Dot(hex: k.color(item.partId), size: 14).offset(x: 4, y: -4)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name.isEmpty ? "Del" : item.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Text(item.place.isEmpty ? "Uten plass" : item.place).font(PF.mono(10.5)).foregroundStyle(item.cabinetId.isEmpty ? p.mut : p.lab).lineLimit(1)
                Text(stockText).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                if let why = k.skipped[item.partId] {
                    Text("Ikke tent: " + why).font(PF.ui(12)).foregroundStyle(Color.red).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
        }
        .contentShape(Rectangle())
        .onTapGesture { m.sheet = .part(item.partId) }
    }

    private var stockText: String {
        "På lager: " + Skjold76.num(item.stock) + " " + item.unit
    }

    private var bottom: some View {
        HStack(spacing: 10) {
            Text("Tar").font(PF.ui(13)).foregroundStyle(p.mut)
            step("minus", -1)
            Text("\(item.take) " + item.unit).font(PF.mono(14)).foregroundStyle(p.ink).frame(minWidth: 52)
            step("plus", 1)
            Spacer(minLength: 4)
            Button("Fjern") {
                Haptics.shared.tick()
                k.remove(item.partId, store)
            }
            .font(PF.ui(13.5, .semibold)).foregroundStyle(p.mut)
        }
    }

    private func step(_ icon: String, _ d: Int) -> some View {
        Button { k.setTake(item.partId, item.take + d, store) } label: {
            Image(systemName: icon).font(.system(size: 13, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 32, height: 32).overlay(Circle().stroke(p.line, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(d < 0 && item.take <= 1)
        .accessibilityLabel(d < 0 ? "Ta én færre" : "Ta én til")
    }
}

/* ---------- Feilsøk LED ---------- */

struct Skj79Diagnose: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var l: Skjold78 { Skjold78.shared }
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let cabinetId: String
    @State private var running: Bool = false
    @State private var steps: [Skj79Step] = []
    @State private var serverHint: String = ""
    @State private var hints: [String: String] = [:]
    @State private var error: String = ""
    @State private var red: Bool? = nil
    @State private var blue: Bool? = nil
    @State private var started: Bool = false

    private var name: String { m.cabinets.first { $0.id == cabinetId }?.name ?? "Skap" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Feilsøk LED", title: name)
                intro
                if running {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Tester … se på stripa nå: først hele stripa rød i 3 s, så én LED blå i 3 s.")
                            .font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if !error.isEmpty { Playback44Note(text: error, red: true) }
                if !steps.isEmpty { stepList }
                if started && !running && error.isEmpty { questions }
                if let red, let blue { result(red, blue) }
                Skj76Button(title: running ? "Tester …" : (started ? "Kjør testen igjen" : "Start feilsøkingen"), icon: "stethoscope", filled: !started) { run() }
                    .disabled(running)
                Button("Til kalibreringen") { m.sheet = .calibrate(cabinetId) }
                    .font(PF.ui(13.5, .semibold)).foregroundStyle(p.lab)
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
    }

    private var intro: some View {
        Text("Testen sjekker at WLED svarer, leser oppsettet, lyser hele stripa rød med vanlig farge og så én LED blå slik appen gjør det, og gjenoppretter WLED etterpå. Se på stripa mens den kjører.")
            .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
    }

    private var stepList: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Stegene")
                ForEach(steps) { (s: Skj79Step) in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: s.ok ? "checkmark.circle.fill" : "xmark.octagon.fill")
                            .foregroundStyle(s.ok ? Color.green : Color.red)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                            if !s.detail.isEmpty {
                                Text(s.detail).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private var questions: some View {
        PCard {
            VStack(alignment: .leading, spacing: 12) {
                ask("Lyste stripa rødt?", $red)
                ask("Lyste én LED blått?", $blue)
            }
        }
    }

    private func ask(_ q: String, _ b: Binding<Bool?>) -> some View {
        HStack(spacing: 8) {
            Text(q).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
            Spacer(minLength: 4)
            choice("Ja", true, b)
            choice("Nei", false, b)
        }
    }

    private func choice(_ t: String, _ v: Bool, _ b: Binding<Bool?>) -> some View {
        let on: Bool = b.wrappedValue == v
        return Button {
            Haptics.shared.tick()
            b.wrappedValue = v
        } label: {
            Text(t).font(PF.ui(13.5, .bold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 14).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func result(_ red: Bool, _ blue: Bool) -> some View {
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                PLabel(text: "Hva nå?")
                Text(Skjold79.hint(red: red, blue: blue, server: hints)).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                if !serverHint.isEmpty && hints.isEmpty {
                    Text("Serveren: " + serverHint).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func run() {
        running = true
        started = true
        error = ""
        red = nil
        blue = nil
        steps = []
        hints = [:]
        serverHint = ""
        let id: String = cabinetId
        Task { @MainActor in
            defer { running = false }
            do {
                let o: [String: Any] = try await l.diagnose(id, store)
                steps = Skjold79.steps(o)
                serverHint = JS.str(o, "hint") ?? ""
                var h: [String: String] = [:]
                for (key, v) in JS.dict(o, "hints") ?? [:] {
                    if let t = v as? String { h[key] = t }
                }
                hints = h
                Haptics.shared.success()
            } catch {
                self.error = Skjold78.message(error)
                Haptics.shared.warning()
            }
        }
    }
}
