import SwiftUI
import UIKit

/* ---------------- Sporing, prompt 22 ---------------- */
// Riktig logo for fraktselskapet (bare manuelt kontrollerte filer fra logobiblioteket, ellers fargefyll med navnet),
// status som faktisk oppdateres (siste hendelse, feiltekst, tidslinje med tidspunkt) og pull-to-refresh som
// kaller POST /api/tracking/refresh.

extension Store {
    /// Pull-to-refresh og «Sjekk nå»: be serveren hente status hos fraktselskapene nå. Eldre server (404): /tracking/check.
    func refreshTracking22() async {
        trkChecking = true
        defer { trkChecking = false }
        do {
            let d: Data = try await api.callAt("/api", "POST", "/tracking/refresh", timeout: 60)
            let o: [String: Any] = JS.obj(d)
            if o["items"] != nil {
                let t: TrackingData = TrackingData(o)
                tracking = t
                notifyTracking(t)
                return
            }
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            _ = try? await api.callAt("/api", "POST", "/tracking/check", timeout: 60)
        } catch {
            flash("Kunne ikke oppdatere sporingen: \(error.localizedDescription)")
        }
        try? await loadTracking()
    }
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
        ZStack {
            if let img {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color.white)
                Image(uiImage: img).resizable().scaledToFit().padding(size * 0.14)
            } else {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color(hex: s.carrierColor))
                Text(s.carrierName).font(.system(size: size * (s.carrierName.count > 6 ? 0.2 : 0.24), weight: .heavy))
                    .foregroundStyle(Color(hex: s.carrierFg)).lineLimit(1).minimumScaleFactor(0.4).padding(.horizontal, size * 0.08)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .accessibilityLabel(s.carrierName)
        .task(id: s.carrier) {
            let id: String = CarrierLogo22.registryId(s.carrier)
            img = await LogoRegistry20.shared.manualImage(id: id, api: store.api)
        }
    }

    static func registryId(_ c: String) -> String {
        switch c.lowercased() {
        case "db", "dbschenker": return "schenker"
        default: return c.lowercased()
        }
    }
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
