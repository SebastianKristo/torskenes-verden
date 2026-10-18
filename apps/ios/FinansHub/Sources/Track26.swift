import SwiftUI

/* ---------------- Prompt 26: Sporing – overstyr sporingstjenesten ----------------
   Ny pakke: «✦ Auto · Bring» (det som gjenkjennes) eller en bestemt tjeneste.
   Eksisterende pakke: hold inne og velg én pakke → SPOR VIA med de samme valgene; «Auto (…)» går tilbake til automatisk.
   POST/PATCH /api/tracking tar carrierOverride (null = auto). Svaret har carrierDetected, carrierOverride og carrierLabel
   («Bring · valgt»). Eldre server (400/404): appen sender carrier i stedet, eller viser en melding. */


struct TrackCarrier26: Identifiable, Hashable {
    let id: String
    let name: String
}

enum Track26 {
    static let carriers: [TrackCarrier26] = [
        TrackCarrier26(id: "posten", name: "Posten"),
        TrackCarrier26(id: "bring", name: "Bring"),
        TrackCarrier26(id: "postnord", name: "PostNord"),
        TrackCarrier26(id: "dhl", name: "DHL"),
        TrackCarrier26(id: "helthjem", name: "Helthjem"),
        TrackCarrier26(id: "ups", name: "UPS"),
        TrackCarrier26(id: "budbee", name: "Budbee"),
        TrackCarrier26(id: "instabox", name: "Instabox"),
        TrackCarrier26(id: "parcelsapp", name: "ParcelsApp"),
    ]

    static func name(_ id: String) -> String {
        if let c = carriers.first(where: { $0.id == id }) { return c.name }
        if let c = Carrier.known.first(where: { $0.id == id }) { return c.name }
        return id.capitalized
    }

    /// Navnet på tjenesten som gjenkjennes ut fra nummeret («Bring» når ingenting passer, som i designet).
    static func guess(_ no: String) -> String {
        let clean: String = no.replacingOccurrences(of: " ", with: "").uppercased()
        let id: String = Carrier.detect(clean)
        if id == "other" { return "Bring" }
        return name(id)
    }
}

extension Shipment {
    /// Undertekst: «Bring · valgt» når tjenesten er overstyrt.
    var carrierLine26: String {
        if !carrierLabel.isEmpty { return carrierLabel }
        if !carrierOverride.isEmpty { return Track26.name(carrierOverride) + " · valgt" }
        return carrierName
    }

    /// Det som gjenkjennes automatisk.
    var autoName26: String {
        if !carrierDetected.isEmpty { return Track26.name(carrierDetected) }
        return Track26.guess(trackingNo)
    }
}

/// PATCH /api/tracking/:id {carrierOverride} (null = auto). Serveren sporer på nytt med en gang.
@MainActor
@Observable
final class TrackOverride26 {
    static let shared = TrackOverride26()
    var busy: String? = nil

    func set(_ s: Shipment, _ carrier: String?, _ store: Store) {
        guard busy == nil else { return }
        busy = s.id
        let value: Any = carrier ?? NSNull()
        let shown: String = carrier.map { Track26.name($0) } ?? s.autoName26
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "PATCH", "/tracking/\(s.id)", json: ["carrierOverride": value], timeout: 30)
                store.flash("Spores nå via " + shown)
                Haptics.shared.success()
            } catch let e as APIError {
                let old: Bool = e.status == 404 || e.status == 400
                store.flash(old ? "Serveren støtter ikke valg av tjeneste ennå. Oppdater homelab." : "Kunne ikke endre: " + e.message)
            } catch {
                store.flash("Kunne ikke endre: \(error.localizedDescription)")
            }
            busy = nil
            try? await store.loadTracking()
        }
    }
}

/// Valgene under sporingsnummeret ved ny pakke: «✦ Auto · Bring», Posten, Bring … ParcelsApp.
struct TrackCarrierChips26: View {
    @Environment(\.paper) private var p
    let number: String
    @Binding var selected: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip("", autoTitle)
                    ForEach(Track26.carriers) { (c: TrackCarrier26) in
                        chip(c.id, c.name)
                    }
                }
                .padding(.horizontal, 2)
            }
            Text(hint).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
    }

    private var autoTitle: String {
        let clean: String = number.replacingOccurrences(of: " ", with: "")
        return clean.count >= 6 ? "✦ Auto · " + Track26.guess(clean) : "✦ Auto"
    }

    private var hint: String {
        if selected.isEmpty { return "✦ Transportøren gjenkjennes ut fra nummeret. Velg selv hvis den tar feil." }
        return "Spores via " + Track26.name(selected) + " i stedet for automatisk gjenkjenning."
    }

    private func chip(_ id: String, _ title: String) -> some View {
        let on: Bool = selected == id
        return Button {
            Haptics.shared.select()
            selected = id
        } label: {
            Text(title).font(PF.ui(12.5, .semibold)).lineLimit(1).fixedSize()
                .foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// «SPOR VIA» når én pakke er valgt (hold inne): Auto (…) og tjenestene. Lyst på mørkt, som i designet.
struct TrackSporVia26: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let s: Shipment
    @MainActor private var x: TrackOverride26 { TrackOverride26.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SPOR VIA").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.bg.opacity(0.75))
            Track26Flow(spacing: 6) {
                chip(nil, "Auto (" + s.autoName26 + ")")
                ForEach(Track26.carriers) { (c: TrackCarrier26) in
                    chip(c.id, c.name)
                }
            }
            if x.busy == s.id {
                Text("Spores på nytt …").font(PF.ui(12)).foregroundStyle(p.bg.opacity(0.75))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.ink, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func chip(_ id: String?, _ title: String) -> some View {
        let cur: String = s.carrierOverride
        let on: Bool = id == nil ? cur.isEmpty : cur == (id ?? "")
        return Button {
            guard x.busy == nil else { return }
            Haptics.shared.select()
            x.set(s, id, store)
        } label: {
            Text(title).font(PF.ui(12.5, .semibold)).lineLimit(1).fixedSize()
                .foregroundStyle(on ? p.ink : p.bg)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.bg : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.bg : p.bg.opacity(0.35), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Enkel flytende rad som bryter linjen (brikkene i SPOR VIA).
struct Track26Flow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW: CGFloat = proposal.width ?? 320
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        var widest: CGFloat = 0
        for v in subviews {
            let sz: CGSize = v.sizeThatFits(.unspecified)
            if x > 0 && x + sz.width > maxW {
                y += rowH + spacing
                x = 0
                rowH = 0
            }
            x += sz.width + spacing
            rowH = Swift.max(rowH, sz.height)
            widest = Swift.max(widest, x - spacing)
        }
        return CGSize(width: Swift.min(maxW, widest), height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowH: CGFloat = 0
        for v in subviews {
            let sz: CGSize = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + sz.width > bounds.maxX {
                y += rowH + spacing
                x = bounds.minX
                rowH = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing
            rowH = Swift.max(rowH, sz.height)
        }
    }
}
