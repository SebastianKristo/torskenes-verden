import SwiftUI
import UIKit

/* ---------------- Prompt 81 (SPANIOS): forhåndsoppsett «Skjold Lab-hylla (3D-print)» ----------------
 Server (SPANSRV, server/skjold76/layout81.js), samme algoritme som tools/skjoldlab3d/skjoldlab_ledvegg.scad:
   GET /presets → [{id:'skjoldlab3d', name, options:{etasjer:[4,5]}, description}]
   POST /cabinets/:id/preset {id:'skjoldlab3d', etasjer:4|5} → oppdatert skap (11 eller 13 rader × 11, store og brede
   skuffer og LED-geometrien; host/enabled/farge røres ikke). Deler utenfor nye grenser → 409 med forklaring.
   POST /cabinets {name, preset:{id, etasjer}} oppretter skapet ferdig satt opp.
 4 etasjer: 11 × 11 med 8 store og 10 brede skuffer. 5 etasjer: 13 × 11 med 10 store og 10 brede. */

extension Skjold81 {
    static let presetId: String = "skjoldlab3d"
    static let presetName: String = "Skjold Lab-hylla (3D-print)"
    static let presetCols: Int = 11

    /// 11 rader for 4 etasjer, 13 for 5.
    static func presetRows(_ etasjer: Int) -> Int { etasjer >= 5 ? 13 : 11 }

    /// Store skuffer (2 × 2): 8 for 4 etasjer, 10 for 5.
    static func presetBig(_ etasjer: Int) -> Int { etasjer >= 5 ? 10 : 8 }

    /// Brede skuffer (2 × 1): 10 i begge.
    static func presetWide(_ etasjer: Int) -> Int { 10 }

    /// «Skapet blir 11 × 11 med 8 store og 10 brede skuffer».
    static func confirm(_ etasjer: Int) -> String {
        "Skapet blir \(presetRows(etasjer)) × \(presetCols) med \(presetBig(etasjer)) store og \(presetWide(etasjer)) brede skuffer"
    }

    /// Kroppen til POST /cabinets/:id/preset (og «preset» ved oppretting).
    static func presetBody(_ etasjer: Int) -> [String: Any] { ["id": presetId, "etasjer": etasjer >= 5 ? 5 : 4] }
}

/// Valget 4 eller 5 etasjer.
struct Skj81Levels: View {
    @Environment(\.paper) private var p
    @Binding var etasjer: Int

    var body: some View {
        HStack(spacing: 10) {
            Text("Etasjer").font(PF.ui(14.5)).foregroundStyle(p.ink)
            Picker("Etasjer", selection: $etasjer) {
                Text("4").tag(4)
                Text("5").tag(5)
            }
            .pickerStyle(.segmented)
        }
    }
}

/// Ny skap-dialog: «Egne rader × kolonner» eller «Skjold Lab-hylla (3D)». nil = egne.
struct Skj81PresetNew: View {
    @Environment(\.paper) private var p
    @Binding var etasjer: Int?
    @Binding var name: String
    @Binding var rows: Int
    @Binding var cols: Int
    @Binding var kind: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Oppsett", selection: Binding<Bool>(get: { etasjer != nil }, set: { toggle($0) })) {
                Text("Egne rader × kolonner").tag(false)
                Text("Skjold Lab-hylla (3D)").tag(true)
            }
            .pickerStyle(.segmented)
            if let e = etasjer {
                Skj81Levels(etasjer: Binding<Int>(get: { e }, set: { choose($0) }))
                Text(Skjold81.confirm(e) + ". Store skuffer er 2 × 2 ruter og brede 2 × 1, som i 3D-modellen.")
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func toggle(_ on: Bool) {
        if on {
            if name.trimmingCharacters(in: .whitespaces).isEmpty { name = "Skjold Lab-hylla" }
            choose(4)
        } else {
            etasjer = nil
        }
    }

    private func choose(_ e: Int) {
        etasjer = e
        rows = Skjold81.presetRows(e)
        cols = Skjold81.presetCols
        kind = "3d"
    }
}

/// Eksisterende skap: «Bruk Skjold Lab-hylla (3D-print)» med 4/5 etasjer og bekreftelse.
struct Skj81PresetApply: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let cab: Skj76Cabinet
    var done: (String) -> Void = { (_: String) in }
    @State private var etasjer: Int = 4
    @State private var ask: Bool = false
    @State private var busy: Bool = false
    @State private var info: String = ""

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Forhåndsoppsett")
                Skj81Levels(etasjer: $etasjer)
                Skj76Button(title: busy ? "Setter opp …" : "Bruk Skjold Lab-hylla (3D-print)", icon: "cube") { ask = true }
                    .disabled(busy)
                Text(info.isEmpty ? "Rader, skuffer og LED-oppsett som på den 3D-printede hylla. Delene blir liggende der de er." : info)
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .confirmationDialog(Skjold81.presetName + "?", isPresented: $ask, titleVisibility: .visible) {
            Button("Bruk oppsettet") { apply() }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text(Skjold81.confirm(etasjer) + ".")
        }
        .task { await loadInfo() }
    }

    /// GET /presets: beskrivelsen fra serveren (valgfritt; eldre server mangler den).
    private func loadInfo() async {
        guard let d = try? await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/presets", timeout: 10) else { return }
        let list: [[String: Any]] = Skjold76.rows(d, "presets")
        if let x = list.first(where: { JS.str($0, "id") == Skjold81.presetId }) { info = JS.str(x, "description") ?? "" }
    }

    private func apply() {
        busy = true
        let id: String = cab.id
        let body: [String: Any] = Skjold81.presetBody(etasjer)
        Task { @MainActor in
            defer { busy = false }
            do {
                _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/cabinets/\(id)/preset", json: body, timeout: 20)
                Haptics.shared.success()
                m.flash("Skapet er satt opp som Skjold Lab-hylla")
                await m.refresh(store)
                await m.loadMap(id, store)
                done(id)
            } catch { m.fail(error) }
        }
    }
}
