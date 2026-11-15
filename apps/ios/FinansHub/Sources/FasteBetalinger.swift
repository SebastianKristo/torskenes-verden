import SwiftUI

/* ---------------- Økonomi → Faste betalinger (Fase 6, Q4) ----------------
 Én side med filtrene Abonnementer, Faste utgifter og Planlagte trekk, som på web (#/fast/<filter>). Data fra
 GET /finans/api/faste-betalinger (FasteBetalingerDTO): serveren regner neste trekk (Oslo), dager igjen, månedsbeløp og teksten
 (label); appen viser dem og regner ikke selv.
 – Abonnementer er den samme siden som før (PaperSubs: Oversikt · Innsikt · Historikk, legg til, rediger, prøveperioder, logg),
   så ingen funksjon forsvinner.
 – Faste utgifter og Planlagte trekk er lister fra serverens svar. «Rediger» på en fast utgift åpner Faste utgifter (Module.fast),
   og Sparing og planer (saldoprognosen) ligger under Planlagte trekk.
 Valgt filter huskes per konto. Dyplenker: finanshub://faste-betalinger/<filter>, finanshub://abonnement (Abonnementer). */

@MainActor
@Observable
final class FasteBetalingerModell {
    static let shared: FasteBetalingerModell = FasteBetalingerModell()

    static let filtre: [String] = ["abonnementer", "faste", "planlagte"]

    var data: FasteBetalingerDTO?
    var feil: String?
    var laster: Bool = false
    var filter: String = UserDefaults.standard.string(forKey: AcctScope.key("faste_betalinger_filter")) ?? "abonnementer" {
        didSet { UserDefaults.standard.set(filter, forKey: AcctScope.key("faste_betalinger_filter")) }
    }

    func velg(_ f: String) {
        guard FasteBetalingerModell.filtre.contains(f), f != filter else { return }
        Haptics.shared.select()
        filter = f
    }

    func last(_ store: Store) async {
        if laster { return }
        laster = true
        defer { laster = false }
        do {
            let d: FasteBetalingerDTO = try await store.api.fetch(FasteBetalingerDTO.self, "/finans/api/faste-betalinger")
            data = d
            feil = nil
        } catch let e as APIError {
            feil = e.status == 404 ? "Faste betalinger finnes ikke på serveren ennå. Oppdater serveren." : e.message
        } catch {
            feil = "Uventet svar fra serveren."
        }
    }

    /// Navnet og antallet på et filter fra serveren («Abonnementer 9»), ellers navnet alene.
    func tittel(_ f: String) -> String {
        if let x = data?.filters.first(where: { (y: FasteBetalingerDTO.Filter) -> Bool in y.id == f }) { return x.name }
        switch f {
        case "faste": return "Faste utgifter"
        case "planlagte": return "Planlagte trekk"
        default: return "Abonnementer"
        }
    }
}

struct FasteBetalingerSide: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let m: FasteBetalingerModell = FasteBetalingerModell.shared
        VStack(spacing: 14) {
            FasteBetalingerFiltre()
            switch m.filter {
            case "faste": FasteUtgifterListe()
            case "planlagte": PlanlagteTrekkListe()
            default: PaperSubs()
            }
        }
        .task { await m.last(store) }
    }
}

/// Filtrene øverst: systemets segmenterte velger med serverens navn.
struct FasteBetalingerFiltre: View {
    var body: some View {
        let m: FasteBetalingerModell = FasteBetalingerModell.shared
        Picker("Filter", selection: Binding<String>(get: { m.filter }, set: { (v: String) in m.velg(v) })) {
            ForEach(FasteBetalingerModell.filtre, id: \.self) { (f: String) in
                Text(m.tittel(f)).tag(f)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityLabel("Filter i Faste betalinger")
    }
}

/// Faste utgifter: serverens liste (kind fast), med månedssum fra filteret.
struct FasteUtgifterListe: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let m: FasteBetalingerModell = FasteBetalingerModell.shared
        let items: [FasteBetalingerDTO.Betaling] = (m.data?.items ?? []).filter { (b: FasteBetalingerDTO.Betaling) -> Bool in b.kind == "fast" }
        let f: FasteBetalingerDTO.Filter? = m.data?.filters.first { (x: FasteBetalingerDTO.Filter) -> Bool in x.id == "faste" }
        VStack(alignment: .leading, spacing: 10) {
            if let f, let mnd = f.monthly {
                FasteBetalingerSum(tittel: "Per måned", verdi: neg0(mnd) + " kr", under: "\(f.active ?? f.count) aktive")
            }
            if let e = m.feil, m.data == nil {
                Text(e).font(PF.ui(14)).foregroundStyle(p.mut)
            } else if m.data == nil {
                ProgressView().frame(maxWidth: .infinity).padding(30)
            } else if items.isEmpty {
                Text("Ingen faste utgifter ennå.").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            ForEach(items, id: \.key) { (b: FasteBetalingerDTO.Betaling) in
                FasteBetalingRad(navn: b.name, under: b.duplicateOf != nil ? b.label + " · også under Abonnementer" : b.label,
                                 belop: neg0(b.amount) + " kr", ekstra: b.daysLeft.map { (d: Int) -> String in FasteBetalingerTekst.dager(d) })
            }
            Button {
                Haptics.shared.tap()
                store.paperOpen(.fast)
            } label: {
                Label("Rediger faste utgifter", systemImage: "square.and.pencil").font(PF.ui(14, .semibold)).foregroundStyle(p.lab)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
    }
}

/// Planlagte trekk de neste dagene (serverens planned).
struct PlanlagteTrekkListe: View {
    @Environment(\.paper) private var p

    var body: some View {
        let m: FasteBetalingerModell = FasteBetalingerModell.shared
        let pl: FasteBetalingerDTO.Planlagte? = m.data?.planned
        VStack(alignment: .leading, spacing: 10) {
            if let pl {
                FasteBetalingerSum(tittel: "Neste \(pl.days) dager", verdi: neg0(pl.total) + " kr", under: "\(pl.items.count) trekk")
                if pl.items.isEmpty { Text("Ingen planlagte trekk de neste dagene.").font(PF.ui(14)).foregroundStyle(p.mut) }
                ForEach(Array(pl.items.enumerated()), id: \.offset) { (e: (offset: Int, element: FasteBetalingerDTO.Planlagt)) in
                    FasteBetalingRad(navn: e.element.name, under: e.element.label, belop: neg0(e.element.amount) + " kr", ekstra: nil)
                }
            } else if let e = m.feil {
                Text(e).font(PF.ui(14)).foregroundStyle(p.mut)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(30)
            }
            Button {
                Haptics.shared.tap()
                Plan51.shared.show()
            } label: {
                Label("Saldoprognose i Sparing og planer", systemImage: "calendar.badge.clock").font(PF.ui(14, .semibold)).foregroundStyle(p.lab)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
    }
}

struct FasteBetalingerSum: View {
    @Environment(\.paper) private var p
    let tittel: String
    let verdi: String
    let under: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(tittel).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            Text(verdi).font(PF.serif(28, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
            Text(under).font(PF.ui(13)).foregroundStyle(p.mut)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperSurface(p, DS.Radius.md, tint: nil)
        .accessibilityElement(children: .combine)
    }
}

struct FasteBetalingRad: View {
    @Environment(\.paper) private var p
    let navn: String
    let under: String
    let belop: String
    let ekstra: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(navn).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Text(under).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(belop).font(PF.mono(14)).foregroundStyle(p.ink).lineLimit(1)
                if let ekstra { Text(ekstra).font(PF.ui(12)).foregroundStyle(p.mut) }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .paperSurface(p, DS.Radius.md, tint: nil)
        .accessibilityElement(children: .combine)
    }
}

enum FasteBetalingerTekst {
    /// «i dag», «i morgen», «om 5 dager» fra serverens daysLeft.
    static func dager(_ d: Int) -> String {
        if d <= 0 { return "i dag" }
        if d == 1 { return "i morgen" }
        return "om \(d) dager"
    }
}
