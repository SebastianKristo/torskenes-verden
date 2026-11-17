import SwiftUI
import UIKit

/* ---------------- Prompt 26: Sporing – overstyr sporingstjenesten ----------------
   Ny pakke: «✦ Auto · Bring» (det som gjenkjennes) eller en bestemt tjeneste.
   Eksisterende pakke: hold inne og velg én pakke → SPOR VIA med de samme valgene; «Auto (…)» går tilbake til automatisk.
   POST/PATCH /api/tracking tar carrierOverride (null = auto). Svaret har carrierDetected, carrierOverride og carrierLabel
   («Bring · valgt»). Q19: serveren har carrierOverride; 400 (ugyldig verdi) og 404 (sendingen er borte) vises som feil. */


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
                store.flash("Kunne ikke endre: " + e.message)
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

// MARK: -

/* ---------------- Sporing, prompt 22 ---------------- */
// Riktig logo for fraktselskapet (bare manuelt kontrollerte filer fra logobiblioteket, ellers fargefyll med navnet),
// status som faktisk oppdateres (siste hendelse, feiltekst, tidslinje med tidspunkt) og pull-to-refresh som
// kaller POST /api/tracking/refresh.

extension Store {
    /// Pull-to-refresh og «Sjekk nå»: be serveren hente status hos fraktselskapene nå (POST /api/tracking/refresh, SporingModell.swift).
    func refreshTracking22() async { await sporing.refresh(self) }
}

/// Logoen til fraktselskapet: manuelt kontrollert fil fra logobiblioteket, ellers fargefyll med navnet.
/// Aldri favicon (Posten skal ikke vise et tilfeldig ikon).
struct CarrierLogo22: View {
    @Environment(Store.self) private var store
    let s: Shipment
    var size: CGFloat = 52
    var radius: CGFloat = 14
    @State private var img: UIImage? = nil

    var body: some View {
        // Prompt 42: logoen som er pakket med appen først (Carrier42.swift), så logobiblioteket, så «PN»-flis.
        let bundled: UIImage? = Carrier42.image(s.carrier) ?? Carrier42.image(s.carrierName)
        ZStack {
            if let i = bundled ?? img {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color.white)
                Image(uiImage: i).resizable().scaledToFit().padding(bundled != nil ? 0 : size * 0.12)
            } else {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color(hex: s.carrierColor))
                Text(Carrier42.initials(s.carrierName)).font(.dyn51(size: size * 0.32, weight: .heavy))
                    .foregroundStyle(Color(hex: s.carrierFg)).lineLimit(1).minimumScaleFactor(0.5).padding(.horizontal, size * 0.08)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .accessibilityLabel(s.carrierName)
        .task(id: s.carrier) {
            if bundled != nil { return }
            let id: String = CarrierLogo22.registryId(s.carrier)
            img = await LogoRegistry20.shared.manualImage(id: id, api: store.api)
        }
    }

    static func registryId(_ c: String) -> String { Carrier42.id(c) }
}

/// Status, forventet levering, siste hendelse, feil og tidslinjen med fem steg (Registrert · Hentet · I transport · Hentested · Levert).
struct PaperShipmentStatus22: View {
    @Environment(\.paper) private var p
    let s: Shipment

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(statusText).font(PF.ui(14, .bold)).foregroundStyle(statusColor)
                Spacer()
                Text(rightText).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            if !s.lastText.isEmpty {
                Text(lastLine).font(PF.ui(12.5)).foregroundStyle(p.ink).lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
            if s.ready && !s.pickupName.isEmpty {
                Text(pickupLine).font(PF.ui(12.5, .semibold)).foregroundStyle(p.lab).lineLimit(2)
            }
            timeline
            if !s.errText.isEmpty {
                Text(errLine).font(PF.ui(11.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Ved feil vises ikke «Registrert» som om det var sant.
    private var statusText: String {
        if !s.errText.isEmpty && (s.status == "registered" || s.status == "unknown") { return "Status ukjent" }
        return s.statusText
    }

    private var statusColor: Color {
        if s.status == "ready_for_pickup" || s.status == "delayed" { return p.lab }
        if s.status == "delivered" { return p.pos }
        return p.ink
    }

    private var rightText: String {
        if !s.estimated.isEmpty {
            if let d = JS.date(s.estimated) { return (s.done ? "Levert " : "Ventet ") + JS.fmt(d, "dd.MM") }
            return s.estimated
        }
        if s.status == "registered" && s.errText.isEmpty && s.eta.isEmpty { return "Ingen leveringsdato ennå" }
        if !s.pickupPoint.isEmpty && s.ready { return s.pickupPoint }
        return s.eta.isEmpty ? "" : s.etaText
    }

    /// «Ankommet terminal · Oslo · 18.10 06:12».
    private var lastLine: String {
        var parts: [String] = [s.lastText]
        if !s.lastPlace.isEmpty { parts.append(s.lastPlace) }
        if let at = s.lastAt { parts.append(JS.fmt(at, "dd.MM HH:mm")) }
        return parts.joined(separator: " · ")
    }

    private var pickupLine: String {
        var t: String = "Klar for henting · " + s.pickupName
        if let d = s.pickupDeadline { t += " · frist " + JS.fmt(d, "dd.MM") }
        return t
    }

    private var errLine: String {
        var t: String = "Kunne ikke oppdatere"
        if let r = s.errRetry { t += " · prøver igjen " + JS.fmt(r, "HH:mm") }
        return t + (s.errText.isEmpty ? "" : " (" + s.errText + ")")
    }

    private var timeline: some View {
        HStack(alignment: .top, spacing: 4) {
            ForEach(0..<5, id: \.self) { j in
                VStack(alignment: .leading, spacing: 4) {
                    Capsule().fill(barColor(j)).frame(height: 5)
                    Text(stepName(j)).font(PF.ui(10, j == s.step ? .bold : .regular))
                        .foregroundStyle(j <= s.step ? p.ink : p.mut).lineLimit(1).minimumScaleFactor(0.7)
                    if j == s.step, let t = stepTime(j) {
                        Text(JS.fmt(t, "dd.MM HH:mm")).font(PF.mono(9.5, bold: false)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func stepName(_ j: Int) -> String {
        if j < s.steps.count {
            let n: String = s.steps[j]
            return n == "Klar for henting" ? "Hentested" : n
        }
        return ""
    }

    /// Tidspunkt for steget: fra steps (prompt 22), ellers siste hendelse for nåværende steg.
    private func stepTime(_ j: Int) -> Date? {
        if j < s.stepTimes.count, let t = s.stepTimes[j] { return t }
        if j == s.step { return s.lastAt ?? s.events.first?.at }
        return nil
    }

    private func barColor(_ j: Int) -> Color {
        if s.status == "delivered" { return p.pos }
        if j < s.step { return p.ink }
        if j == s.step { return p.lab }
        return p.line
    }
}
